import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/express.js';
import { AppError } from '../utils/AppError.js';
import { normalizeText } from '../utils/normalize.js';
import type {
  CheckDuplicateInput,
  CreateQuestionInput,
  ListQuestionsQuery,
  UpdateQuestionInput,
} from '../validators/question.validators.js';

type TagSelection = CreateQuestionInput['tags'];

// Loads the requested tags, requiring each to exist under the category it was submitted with.
async function resolveTags(selection: TagSelection) {
  const requested = selection.flatMap(({ categoryId, tagIds }) =>
    [...new Set(tagIds)].map((tagId) => ({ categoryId, tagId })),
  );

  const found = await prisma.tag.findMany({
    where: { OR: requested.map(({ categoryId, tagId }) => ({ id: tagId, categoryId })) },
    include: { category: true },
  });

  // A tag counts only if it exists under the category it was submitted with.
  const foundKeys = new Set(found.map((t) => `${t.categoryId}/${t.id}`));
  const invalid = requested.filter(({ categoryId, tagId }) => !foundKeys.has(`${categoryId}/${tagId}`));
  if (invalid.length > 0) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Unknown tag, or tag does not belong to the given category',
      invalid.map(({ categoryId, tagId }) => ({
        path: ['tags', categoryId, 'tagIds'],
        message: `Tag ${tagId} not found in category ${categoryId}`,
      })),
    );
  }

  return found;
}

const MAX_DUPLICATE_MATCHES = 5;
const DUPLICATE_CANDIDATES = 50;

// Compares against questions the user can see only, so a match never reveals a hidden question.
export async function findDuplicates(user: AuthUser, text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const threshold = env.duplicateSimilarityThreshold;

  // `%` uses the trigram index; its threshold is set for this transaction only.
  const [, candidates] = await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(threshold)}, true)`,
    prisma.$queryRaw<{ id: string; similarity: number }[]>`
      SELECT "id", similarity("normalizedText", ${normalized}) AS "similarity"
      FROM "Question"
      WHERE "normalizedText" = ${normalized} OR "normalizedText" % ${normalized}
      ORDER BY "similarity" DESC
      LIMIT ${DUPLICATE_CANDIDATES}`,
  ]);
  if (candidates.length === 0) return [];

  const visible = await prisma.question.findMany({
    where: { AND: [{ id: { in: candidates.map((c) => c.id) } }, visibilityFilter(user)] },
    select: { id: true, text: true },
  });
  const byId = new Map(visible.map((q) => [q.id, q.text]));

  return candidates
    .filter((c) => byId.has(c.id))
    .slice(0, MAX_DUPLICATE_MATCHES)
    .map((c) => ({ id: c.id, text: byId.get(c.id)!, similarity: Math.round(c.similarity * 100) / 100 }));
}

export async function checkDuplicate(user: AuthUser, { text }: CheckDuplicateInput) {
  const matches = await findDuplicates(user, text);
  return { isDuplicate: matches.length > 0, matches };
}

export async function createQuestion(user: AuthUser, input: CreateQuestionInput) {
  const clientId = input.clientId ?? null;

  // Same response as a nonexistent client, so it doesn't reveal which clients exist.
  if (clientId && !user.clientIds.includes(clientId)) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found');
  }

  const found = await resolveTags(input.tags);

  // Near-duplicates are surfaced, not silently stored; the author may override by
  // confirming the question is genuinely different and saying why.
  const duplicates = await findDuplicates(user, input.text);
  let duplicateOverride: { matchedIds: string[]; reason: string } | undefined;
  if (duplicates.length > 0) {
    if (!input.confirmDistinct) {
      console.info(JSON.stringify({ event: 'duplicate_rejected', userId: user.id, matchedIds: duplicates.map((d) => d.id) }));
      throw new AppError(409, 'DUPLICATE_SUSPECTED', 'This question looks like an existing one', { matches: duplicates });
    }
    if (!input.distinctReason) {
      throw new AppError(400, 'VALIDATION_ERROR', 'distinctReason is required when confirmDistinct is true', [
        { path: ['distinctReason'], message: 'Explain how this question differs from the matches' },
      ]);
    }
    duplicateOverride = { matchedIds: duplicates.map((d) => d.id), reason: input.distinctReason };
    console.info(JSON.stringify({ event: 'duplicate_overridden', userId: user.id, ...duplicateOverride }));
  }

  //transaction because we want either both question and question history to be created or none of them
  const question = await prisma.$transaction(async (tx) => {
    const created = await tx.question.create({
      data: {
        text: input.text,
        normalizedText: normalizeText(input.text),
        answerNotes: input.answerNotes,
        clientId,
        authorId: user.id,
        tags: { create: found.map((t) => ({ tagId: t.id, categoryId: t.categoryId })) },
      },
      include: { client: true },
    });

    await tx.questionHistory.create({
      data: {
        questionId: created.id,
        actorId: user.id,
        action: 'CREATED',
        changes: {
          text: input.text,
          answerNotes: input.answerNotes,
          clientId,
          tags: input.tags.map(({ categoryId, tagIds }) => ({ categoryId, tagIds })),
          ...(duplicateOverride && { duplicateOverride }),
        },
      },
    });

    return created;
  });

  const tags: Record<string, string[]> = {};
  for (const t of found) (tags[t.category.slug] ??= []).push(t.slug);

  return {
    id: question.id,
    text: question.text,
    answerNotes: question.answerNotes,
    client: question.client ? { id: question.client.id, name: question.client.name } : null,
    tags,
    authorId: question.authorId,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
  };
}

// Reviewers (edit_any) see everything. Everyone else sees unrestricted questions
// plus those of clients they hold a grant on; users with edit_own also see their own.
function visibilityFilter(user: AuthUser): Prisma.QuestionWhereInput {
  if (user.permissions.includes('question:edit_any')) return {};

  const visible: Prisma.QuestionWhereInput[] = [
    { clientId: null },
    { clientId: { in: user.clientIds } },
  ];
  if (user.permissions.includes('question:edit_own')) visible.push({ authorId: user.id });
  return { OR: visible };
}

export async function listQuestions(
  user: AuthUser,
  { page, limit, clientId, tags, categories, search }: ListQuestionsQuery,
) {
  const filters: Prisma.QuestionWhereInput[] = [visibilityFilter(user)];

  // Filters narrow the visible set; they can never widen it.
  if (clientId) filters.push({ clientId });
  if (tags) filters.push({ tags: { some: { tagId: { in: tags } } } });
  if (categories) filters.push({ tags: { some: { categoryId: { in: categories } } } });

  if (search) {
    const matches = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Question"
      WHERE "searchVector" @@ websearch_to_tsquery('english', ${search})`;
    filters.push({ id: { in: matches.map((m) => m.id) } });
  }

  const where: Prisma.QuestionWhereInput = { AND: filters };

  const [total, rows] = await prisma.$transaction([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        tags: { include: { tag: { include: { category: true } } } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const questions = rows.map((q) => {
    const tags: Record<string, string[]> = {};
    for (const { tag } of q.tags) (tags[tag.category.slug] ??= []).push(tag.slug);
    return {
      id: q.id,
      text: q.text,
      answerNotes: q.answerNotes,
      client: q.client,
      tags,
      authorId: q.authorId,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    };
  });

  return { questions, page, limit, total };
}

export async function updateQuestion(user: AuthUser, id: string, input: UpdateQuestionInput) {
  const canEditAny = user.permissions.includes('question:edit_any');
  const canEditOwn = user.permissions.includes('question:edit_own');

  // Invisible questions look the same as nonexistent ones.
  const existing = await prisma.question.findFirst({
    where: { AND: [{ id }, visibilityFilter(user)] },
    include: { tags: true },
  });
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Question not found');

  if (!canEditAny && !(canEditOwn && existing.authorId === user.id)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only edit your own questions');
  }

  const clientChanged = input.clientId !== undefined && (input.clientId ?? null) !== existing.clientId;
  if (clientChanged && input.clientId) {
    // Reviewers may assign any client; others only clients they hold a grant on.
    const allowed = canEditAny
      ? (await prisma.client.count({ where: { id: input.clientId } })) > 0
      : user.clientIds.includes(input.clientId);
    if (!allowed) throw new AppError(404, 'NOT_FOUND', 'Client not found');
  }

  const found = input.tags ? await resolveTags(input.tags) : null;

  const data: Prisma.QuestionUpdateInput = {};
  const changes: Record<string, unknown> = {};
  if (input.text !== undefined && input.text !== existing.text) {
    data.text = input.text;
    data.normalizedText = normalizeText(input.text);
    changes.text = { from: existing.text, to: input.text };
  }
  if (input.answerNotes !== undefined && input.answerNotes !== existing.answerNotes) {
    data.answerNotes = input.answerNotes;
    changes.answerNotes = { from: existing.answerNotes, to: input.answerNotes };
  }
  if (clientChanged) {
    const clientId = input.clientId ?? null;
    data.client = clientId ? { connect: { id: clientId } } : { disconnect: true };
    changes.clientId = { from: existing.clientId, to: clientId };
  }

  let tagsChanged = false;
  if (found) {
    const before = existing.tags.map((t) => t.tagId).sort((a, b) => a - b);
    const after = found.map((t) => t.id).sort((a, b) => a - b);
    tagsChanged = before.join() !== after.join();
    if (tagsChanged) changes.tags = { from: before, to: after };
  }

  if (Object.keys(changes).length > 0) {
    await prisma.$transaction(async (tx) => {
      if (tagsChanged && found) {
        await tx.questionTag.deleteMany({ where: { questionId: id } });
        await tx.questionTag.createMany({
          data: found.map((t) => ({ questionId: id, tagId: t.id, categoryId: t.categoryId })),
        });
      }
      // Always issued so updatedAt moves even when only tags changed.
      await tx.question.update({ where: { id }, data });
      await tx.questionHistory.create({
        data: { questionId: id, actorId: user.id, action: 'UPDATED', changes: changes as Prisma.InputJsonObject },
      });
    });
  }

  const q = await prisma.question.findUniqueOrThrow({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      tags: { include: { tag: { include: { category: true } } } },
    },
  });
  const tags: Record<string, string[]> = {};
  for (const { tag } of q.tags) (tags[tag.category.slug] ??= []).push(tag.slug);

  return {
    id: q.id,
    text: q.text,
    answerNotes: q.answerNotes,
    client: q.client,
    tags,
    authorId: q.authorId,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

export async function getQuestion(user: AuthUser, id: string) {
  // Invisible questions look the same as nonexistent ones.
  const q = await prisma.question.findFirst({
    where: { AND: [{ id }, visibilityFilter(user)] },
    include: {
      client: { select: { id: true, name: true } },
      tags: { include: { tag: { include: { category: true } } } },
    },
  });
  if (!q) throw new AppError(404, 'NOT_FOUND', 'Question not found');

  const tags: Record<string, string[]> = {};
  for (const { tag } of q.tags) (tags[tag.category.slug] ??= []).push(tag.slug);

  return {
    id: q.id,
    text: q.text,
    answerNotes: q.answerNotes,
    client: q.client,
    tags,
    authorId: q.authorId,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}
