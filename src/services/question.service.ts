import { prisma } from '../db/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/express.js';
import { AppError } from '../utils/AppError.js';
import { normalizeText } from '../utils/normalize.js';
import type { CreateQuestionInput, ListQuestionsQuery } from '../validators/question.validators.js';

export async function createQuestion(user: AuthUser, input: CreateQuestionInput) {
  const clientId = input.clientId ?? null;

  // Same response as a nonexistent client, so it doesn't reveal which clients exist.
  if (clientId && !user.clientIds.includes(clientId)) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found');
  }

  const requested = input.tags.flatMap(({ categoryId, tagIds }) =>
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
// plus those of clients they hold a grant on; authors (edit_own) also see their own.
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
