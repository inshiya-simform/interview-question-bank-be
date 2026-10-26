import { env } from '../config/env.js';
import { EXPORT_BATCH_SIZE, MAX_EXPORT_ROWS } from '../constants/export.constants.js';
import { REVIEW_LOCK_TTL_MS } from '../constants/review.constants.js';
import { prisma } from '../db/prisma.js';
import type { Prisma, QuestionStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/express.js';
import { AppError } from '../utils/AppError.js';
import { recordAudit } from './audit.service.js';
import { normalizeText } from '../utils/normalize.js';
import { sendEmailSafe } from './email/email.service.js';
import {
  questionApprovedEmail,
  questionChangesRequestedEmail,
  questionRejectedEmail,
} from './email/templates/index.js';
import type {
  CheckDuplicateInput,
  CreateQuestionInput,
  ExportQuestionsQuery,
  ListQuestionsQuery,
  ListSubmissionsQuery,
  ApproveInput,
  BulkRejectInput,
  BulkReviewInput,
  RejectInput,
  RequestChangesInput,
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
// Scoped to the target client: a client's question is compared with that client's questions only,
// an unrestricted one (clientId null) with unrestricted questions only.
export async function findDuplicates(user: AuthUser, text: string, clientId: string | null, excludeId?: string) {
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
    where: { AND: [{ id: { in: candidates.map((c) => c.id) } }, { clientId }, visibilityFilter(user)] },
    select: { id: true, text: true },
  });
  const byId = new Map(visible.map((q) => [q.id, q.text]));

  return candidates
    .filter((c) => byId.has(c.id) && c.id !== excludeId)
    .slice(0, MAX_DUPLICATE_MATCHES)
    .map((c) => ({ id: c.id, text: byId.get(c.id)!, similarity: Math.round(c.similarity * 100) / 100 }));
}

export async function checkDuplicate(user: AuthUser, { text, clientId, excludeId }: CheckDuplicateInput) {
  if (clientId && !user.clientIds.includes(clientId)) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found');
  }
  const matches = await findDuplicates(user, text, clientId ?? null, excludeId);
  return { isDuplicate: matches.length > 0, matches };
}

// Near-duplicates are surfaced, not silently stored; the author may override by
// confirming the question is genuinely different and saying why.
async function resolveDuplicateOverride(
  user: AuthUser,
  input: { text: string; confirmDistinct?: boolean | undefined; distinctReason?: string | undefined },
  clientId: string | null,
  excludeId?: string,
) {
  const duplicates = await findDuplicates(user, input.text, clientId, excludeId);
  if (duplicates.length === 0) return undefined;
  if (!input.confirmDistinct) {
    console.info(JSON.stringify({ event: 'duplicate_rejected', userId: user.id, matchedIds: duplicates.map((d) => d.id) }));
    throw new AppError(409, 'DUPLICATE_SUSPECTED', 'This question looks like an existing one', { matches: duplicates });
  }
  if (!input.distinctReason) {
    throw new AppError(400, 'VALIDATION_ERROR', 'distinctReason is required when confirmDistinct is true', [
      { path: ['distinctReason'], message: 'Explain how this question differs from the matches' },
    ]);
  }
  const override = { matchedIds: duplicates.map((d) => d.id), reason: input.distinctReason };
  console.info(JSON.stringify({ event: 'duplicate_overridden', userId: user.id, ...override }));
  return override;
}

export async function createQuestion(user: AuthUser, input: CreateQuestionInput) {
  const clientId = input.clientId ?? null;

  // Same response as a nonexistent client, so it doesn't reveal which clients exist.
  if (clientId && !user.clientIds.includes(clientId)) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found');
  }

  const found = await resolveTags(input.tags);

  const duplicateOverride = await resolveDuplicateOverride(user, input, clientId);

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
      include: questionInclude,
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

    await recordAudit(tx, {
      action: 'CREATE',
      module: 'QUESTION',
      entityId: created.id,
      actor: user,
      changes: {
        text: input.text,
        answerNotes: input.answerNotes,
        clientId,
        tags: input.tags.map(({ categoryId, tagIds }) => ({ categoryId, tagIds })),
        ...(duplicateOverride && { duplicateOverride }),
      },
    });

    return created;
  });

  return toDetailDto(user, question);
}

// Questions that are unrestricted, or belong to a client the user holds a grant on.
function clientAccessFilter(user: AuthUser): Prisma.QuestionWhereInput {
  return { OR: [{ clientId: null }, { clientId: { in: user.clientIds } }] };
}

// Who may open a single question (and edit or review it). Reviewers see every status, but like
// everyone else only unrestricted questions and those of clients they hold a grant on. Everyone else
// sees a question only once it has been approved (publishedAt). Authors also see their own
// questions, whatever their status, while they still hold a grant on its client.
function visibilityFilter(user: AuthUser): Prisma.QuestionWhereInput {
  if (user.permissions.includes('question:review')) return clientAccessFilter(user);

  const visible: Prisma.QuestionWhereInput[] = [
    { publishedAt: { not: null }, ...clientAccessFilter(user) },
  ];
  if (user.permissions.includes('question:edit_own')) visible.push({ authorId: user.id, ...clientAccessFilter(user) });
  return { OR: visible };
}

// A pending edit can move a question to another client. The live row still shows the old client, so
// a reviewer is also kept away from edits that target a client they hold no grant on.
async function reviewerDraftFilter(user: AuthUser): Promise<Prisma.QuestionWhereInput> {
  if (!user.permissions.includes('question:review')) return {};
  const blocked = await prisma.client.findMany({ where: { id: { notIn: user.clientIds } }, select: { id: true } });
  if (blocked.length === 0) return {};
  return { NOT: { draft: { OR: blocked.map(({ id }) => ({ payload: { path: ['clientId'], equals: id } })) } } };
}

// The live bank: approved questions only, for every role. Restricted-client questions still
// need a grant, reviewers included. A user's own pending work is in listSubmissions.
export function liveFilter(user: AuthUser): Prisma.QuestionWhereInput {
  return { publishedAt: { not: null }, ...clientAccessFilter(user) };
}

// Shared by the list and the export so both always cover the same set of questions.
async function buildListWhere(
  user: AuthUser,
  { clientId, tags, categories, search }: ExportQuestionsQuery,
): Promise<Prisma.QuestionWhereInput> {
  const filters: Prisma.QuestionWhereInput[] = [liveFilter(user)];

  // Filters narrow the visible set; they can never widen it.
  if (clientId) filters.push({ clientId });
  // OR within a category, AND across categories: (react OR node) AND (mid OR senior).
  const tagIdsByCategory = new Map<number, number[]>();
  if (tags) {
    const found = await prisma.tag.findMany({ where: { id: { in: tags } }, select: { id: true, categoryId: true } });
    for (const t of found) tagIdsByCategory.set(t.categoryId, [...(tagIdsByCategory.get(t.categoryId) ?? []), t.id]);
    // Unknown tag ids match nothing, as they did before.
    if (found.length === 0) filters.push({ id: { in: [] } });
  }
  for (const [categoryId, tagIds] of tagIdsByCategory) {
    filters.push({ tags: { some: { categoryId, tagId: { in: tagIds } } } });
  }
  // A selected category with no selected tags only requires a tag in that category.
  for (const categoryId of categories ?? []) {
    if (!tagIdsByCategory.has(categoryId)) filters.push({ tags: { some: { categoryId } } });
  }

  if (search) {
    const matches = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Question"
      WHERE "searchVector" @@ websearch_to_tsquery('english', ${search})`;
    filters.push({ id: { in: matches.map((m) => m.id) } });
  }

  return { AND: filters };
}

export async function listQuestions(user: AuthUser, { page, limit, ...filters }: ListQuestionsQuery) {
  const where = await buildListWhere(user, filters);

  const [total, rows] = await prisma.$transaction([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      include: questionInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // Where the caller has filed each question, so the list can show Save / Saved-in-X without a call per row.
  const saved = await prisma.savedQuestion.findMany({
    where: { userId: user.id, questionId: { in: rows.map((q) => q.id) } },
    select: { questionId: true, collection: { select: { id: true, name: true } } },
  });
  const collectionByQuestion = new Map(saved.map((s) => [s.questionId, s.collection]));

  return {
    questions: rows.map((q) => ({ ...toQuestionDto(user, q), savedIn: collectionByQuestion.get(q.id) ?? null })),
    page,
    limit,
    total,
  };
}

// Every question matching the filters, ignoring pagination. Rejects before returning if the result
// is too large, so the caller can still send an error response before it starts streaming.
export async function exportQuestions(user: AuthUser, query: ExportQuestionsQuery) {
  const where = await buildListWhere(user, query);

  const total = await prisma.question.count({ where });
  if (total > MAX_EXPORT_ROWS) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Too many questions to export (${total}). Narrow your filters to at most ${MAX_EXPORT_ROWS}.`,
    );
  }

  // Recorded before streaming starts: the export is committed to once the headers go out.
  await recordAudit(prisma, {
    action: 'EXPORT',
    module: 'QUESTION',
    actor: user,
    changes: { count: total, filters: JSON.parse(JSON.stringify(query)) as Prisma.InputJsonObject },
  });

  async function* rows() {
    for (let skip = 0; skip < total; skip += EXPORT_BATCH_SIZE) {
      const batch = await prisma.question.findMany({
        where,
        include: questionInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: EXPORT_BATCH_SIZE,
      });
      for (const q of batch) yield toQuestionDto(user, q);
    }
  }

  return { total, rows: rows() };
}

const NOT_LIVE: QuestionStatus[] = ['PENDING_REVIEW', 'CHANGES_REQUESTED', 'REJECTED'];

// Review work: reviewers see the submissions of every author (their queue) that they may access, everyone else only their own.
// An approved question with an edit waiting for review is PENDING_REVIEW, so it shows up here too.
export async function listSubmissions(user: AuthUser, { page, limit, status, sort }: ListSubmissionsQuery) {
  const isReviewer = user.permissions.includes('question:review');
  const where: Prisma.QuestionWhereInput = {
    ...(isReviewer ? { AND: [clientAccessFilter(user), await reviewerDraftFilter(user)] } : { authorId: user.id }),
    status: { in: status ?? NOT_LIVE },
  };
  const direction = (sort ?? (isReviewer ? 'submitted_asc' : 'submitted_desc')) === 'submitted_asc' ? 'asc' : 'desc';

  const [total, rows] = await prisma.$transaction([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      include: questionInclude,
      orderBy: [{ submittedAt: direction }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // Cards for an edit show the submitted text (draft), not the live version it will replace.
  return { questions: await withDrafts(user, rows), page, limit, total };
}

// Per-status totals for the tab badges: reviewers count the whole queue, everyone else their own
// submissions (other people's real statuses are not theirs to see).
export async function countQuestions(user: AuthUser) {
  const isReviewer = user.permissions.includes('question:review');

  const rows = await prisma.question.groupBy({
    by: ['status'],
    where: { AND: [visibilityFilter(user), await reviewerDraftFilter(user), ...(isReviewer ? [] : [{ authorId: user.id }])] },
    _count: { _all: true },
  });

  const counts: Record<QuestionStatus, number> = {
    PENDING_REVIEW: 0,
    APPROVED: 0,
    CHANGES_REQUESTED: 0,
    REJECTED: 0,
  };
  for (const r of rows) counts[r.status] = r._count._all;
  return { counts };
}

// Review timeline for the author and reviewers. Newest first.
export async function getQuestionHistory(user: AuthUser, id: string) {
  const q = await prisma.question.findFirst({
    where: { AND: [{ id }, visibilityFilter(user)] },
    select: { authorId: true },
  });
  if (!q) throw new AppError(404, 'NOT_FOUND', 'Question not found');
  if (!canSeeReview(user, q)) throw new AppError(403, 'FORBIDDEN', 'Only the author and reviewers can see history');

  const rows = await prisma.questionHistory.findMany({
    where: { questionId: id },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });

  const history = rows.map((h) => {
    const note = (h.changes as { note?: string | null } | null)?.note;
    return {
      id: h.id,
      action: h.action,
      actor: h.actor,
      createdAt: h.createdAt,
      ...(note && { note }),
    };
  });
  return { history };
}

export async function updateQuestion(user: AuthUser, id: string, input: UpdateQuestionInput) {
  const canEditOwn = user.permissions.includes('question:edit_own');

  // Invisible questions look the same as nonexistent ones.
  const existing = await prisma.question.findFirst({
    where: { AND: [{ id }, visibilityFilter(user)] },
    include: { tags: true, draft: true },
  });
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Question not found');

  // Only authors edit; reviewers act through the review endpoints.
  if (!(canEditOwn && existing.authorId === user.id)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only edit your own questions');
  }
  if (existing.status === 'REJECTED') {
    throw new AppError(409, 'CONFLICT', 'A rejected question can no longer be edited');
  }

  // Edits are diffed against the pending draft when there is one, else the live content.
  const base: DraftPayload =
    (existing.draft?.payload as DraftPayload | undefined) ?? {
      text: existing.text,
      answerNotes: existing.answerNotes,
      clientId: existing.clientId,
      tags: existing.tags.map((t) => ({ tagId: t.tagId, categoryId: t.categoryId })),
    };

  const clientChanged = input.clientId !== undefined && (input.clientId ?? null) !== base.clientId;
  if (clientChanged && input.clientId && !user.clientIds.includes(input.clientId)) {
    // Same response as a nonexistent client, so it doesn't reveal which clients exist.
    throw new AppError(404, 'NOT_FOUND', 'Client not found');
  }

  const found = input.tags ? await resolveTags(input.tags) : null;

  const next: DraftPayload = { ...base };
  const changes: Record<string, unknown> = {};

  // Editing must not be a way around the check made on create. Moving a question to another
  // client is checked too, since duplicates are scoped per client.
  const textChanged = input.text !== undefined && input.text !== base.text;
  if (textChanged || clientChanged) {
    const duplicateOverride = await resolveDuplicateOverride(
      user,
      { ...input, text: input.text ?? base.text },
      clientChanged ? (input.clientId ?? null) : base.clientId,
      id,
    );
    if (duplicateOverride) changes.duplicateOverride = duplicateOverride;
  }
  if (input.text !== undefined && input.text !== base.text) {
    next.text = input.text;
    changes.text = { from: base.text, to: input.text };
  }
  if (input.answerNotes !== undefined && input.answerNotes !== base.answerNotes) {
    next.answerNotes = input.answerNotes;
    changes.answerNotes = { from: base.answerNotes, to: input.answerNotes };
  }
  if (clientChanged) {
    next.clientId = input.clientId ?? null;
    changes.clientId = { from: base.clientId, to: next.clientId };
  }
  if (found) {
    const before = base.tags.map((t) => t.tagId).sort((a, b) => a - b);
    const after = found.map((t) => t.id).sort((a, b) => a - b);
    if (before.join() !== after.join()) {
      next.tags = found.map((t) => ({ tagId: t.id, categoryId: t.categoryId }));
      changes.tags = { from: before, to: after };
    }
  }

  if (Object.keys(changes).length > 0) {
    const published = existing.publishedAt !== null;
    await prisma.$transaction(async (tx) => {
      if (published) {
        // The live version stays as approved; the edit waits in a draft until a reviewer approves it.
        await tx.questionDraft.upsert({
          where: { questionId: id },
          create: { questionId: id, payload: next as Prisma.InputJsonObject },
          update: { payload: next as Prisma.InputJsonObject },
        });
        await tx.question.update({
          where: { id },
          data: { status: 'PENDING_REVIEW', reviewNote: null, submittedAt: new Date() },
        });
      } else {
        // Never approved: nobody else has seen it, so edit in place and send it back to review.
        await replaceContent(tx, id, next);
        await tx.question.update({
          where: { id },
          data: { status: 'PENDING_REVIEW', reviewNote: null, submittedAt: new Date() },
        });
      }
      await tx.questionHistory.create({
        data: {
          questionId: id,
          actorId: user.id,
          action: 'UPDATED',
          changes: { ...changes, ...(published && { pendingReview: true }) } as Prisma.InputJsonObject,
        },
      });
      await recordAudit(tx, {
        action: 'UPDATE',
        module: 'QUESTION',
        entityId: id,
        actor: user,
        changes: { ...changes, ...(published && { pendingReview: true }) } as Prisma.InputJsonObject,
      });
    });
  }

  return getQuestion(user, id);
}

export async function getQuestion(user: AuthUser, id: string) {
  // Invisible questions look the same as nonexistent ones.
  const q = await prisma.question.findFirst({
    where: { AND: [{ id }, visibilityFilter(user), await reviewerDraftFilter(user)] },
    include: questionInclude,
  });
  if (!q) throw new AppError(404, 'NOT_FOUND', 'Question not found');

  return toDetailDto(user, q);
}

export const approveQuestion = (user: AuthUser, id: string, { expectedUpdatedAt }: ApproveInput) =>
  review(user, id, { kind: 'approve' }, expectedUpdatedAt);
export const requestChanges = (
  user: AuthUser,
  id: string,
  { note, expectedUpdatedAt }: RequestChangesInput,
) => review(user, id, { kind: 'requestChanges', note }, expectedUpdatedAt);
export const rejectQuestion = (user: AuthUser, id: string, { note, expectedUpdatedAt }: RejectInput) =>
  review(user, id, { kind: 'reject', note }, expectedUpdatedAt);

// Each question is reviewed on its own, so one that is missing or no longer pending doesn't block the rest.
async function bulkReview(
  user: AuthUser,
  ids: string[],
  action: ReviewAction,
  expectedUpdatedAt: Record<string, string> = {},
) {
  const succeeded: string[] = [];
  const failed: { id: string; code: string; message: string; details?: unknown }[] = [];
  for (const id of ids) {
    try {
      await applyReview(user, id, action, expectedUpdatedAt[id]);
      succeeded.push(id);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      failed.push({ id, code: err.code, message: err.message, details: err.details });
    }
  }
  return { succeeded, failed };
}

export const bulkApproveQuestions = (user: AuthUser, { ids, expectedUpdatedAt }: BulkReviewInput) =>
  bulkReview(user, ids, { kind: 'approve' }, expectedUpdatedAt);
export const bulkRejectQuestions = (user: AuthUser, { ids, note, expectedUpdatedAt }: BulkRejectInput) =>
  bulkReview(user, ids, { kind: 'reject', note }, expectedUpdatedAt);

const lockSelect = {
  status: true,
  updatedAt: true,
  reviewLock: { select: { expiresAt: true, lockedBy: { select: { id: true, name: true } } } },
} satisfies Prisma.QuestionSelect;

// What a review screen needs to stay current: poll this, or take it from the lock calls below.
async function reviewState(id: string) {
  const q = await prisma.question.findUnique({ where: { id }, select: lockSelect });
  if (!q) throw new AppError(404, 'NOT_FOUND', 'Question not found');
  return { status: q.status, updatedAt: q.updatedAt, reviewLock: activeLock(q.reviewLock) };
}

// A reviewer can only act on questions they can see: unrestricted, or a client they hold a grant on.
async function assertReviewable(user: AuthUser, id: string) {
  const visible = await prisma.question.findFirst({
    where: { AND: [{ id }, visibilityFilter(user), await reviewerDraftFilter(user)] },
    select: { id: true },
  });
  if (!visible) throw new AppError(404, 'NOT_FOUND', 'Question not found');
}

export async function getReviewState(user: AuthUser, id: string) {
  await assertReviewable(user, id);
  return reviewState(id);
}

// Claims the question for the caller, or renews their claim (call it as a heartbeat). One statement,
// so two reviewers racing for a free question can't both get it. Takes over a lapsed claim.
export async function acquireReviewLock(user: AuthUser, id: string) {
  await assertReviewable(user, id);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REVIEW_LOCK_TTL_MS);
  // Times are passed in rather than using now(), so they compare in UTC like the rest of Prisma's timestamps.
  const taken = await prisma.$executeRaw`
    INSERT INTO "QuestionReviewLock" ("questionId", "lockedById", "expiresAt")
    SELECT q."id", ${user.id}, ${expiresAt} FROM "Question" q
    WHERE q."id" = ${id} AND q."status" = 'PENDING_REVIEW'
    ON CONFLICT ("questionId") DO UPDATE
      SET "lockedById" = EXCLUDED."lockedById", "expiresAt" = EXCLUDED."expiresAt", "createdAt" = ${now}
      WHERE "QuestionReviewLock"."lockedById" = EXCLUDED."lockedById" OR "QuestionReviewLock"."expiresAt" < ${now}`;
  if (taken === 1) return reviewState(id);

  const state = await reviewState(id);
  if (state.status !== 'PENDING_REVIEW') throw await reviewConflict(id);
  throw new AppError(409, 'LOCKED', `${state.reviewLock?.lockedBy.name ?? 'Another reviewer'} is reviewing this question`, {
    reason: 'LOCKED',
    ...state.reviewLock,
  });
}

// Only the holder can let go; anything else is a no-op, so a late release never frees someone else's claim.
export async function releaseReviewLock(user: AuthUser, id: string) {
  await prisma.questionReviewLock.deleteMany({ where: { questionId: id, lockedById: user.id } });
}

type ReviewAction =
  | { kind: 'approve' }
  | { kind: 'requestChanges'; note: string }
  | { kind: 'reject'; note: string | undefined };

async function review(user: AuthUser, id: string, action: ReviewAction, expectedUpdatedAt?: string) {
  await applyReview(user, id, action, expectedUpdatedAt);
  return getQuestion(user, id);
}

// Explains a failed review: someone else already decided it, or it changed after the reviewer loaded it.
async function reviewConflict(id: string): Promise<AppError> {
  const q = await prisma.question.findUnique({
    where: { id },
    select: { status: true, updatedAt: true, reviewedAt: true, reviewedBy: { select: { id: true, name: true } } },
  });
  if (!q) return new AppError(404, 'NOT_FOUND', 'Question not found');
  if (q.status !== 'PENDING_REVIEW') {
    return new AppError(409, 'CONFLICT', 'This question has already been reviewed', {
      reason: 'ALREADY_REVIEWED',
      status: q.status,
      reviewedBy: q.reviewedBy,
      reviewedAt: q.reviewedAt,
    });
  }
  return new AppError(409, 'CONFLICT', 'This question was edited after you opened it. Reload and review again', {
    reason: 'EDITED_SINCE_LOADED',
    status: q.status,
    updatedAt: q.updatedAt,
  });
}

// Any reviewer may act, but only on a question that is waiting for review and unchanged since the
// reviewer loaded it (expectedUpdatedAt). Without a token, the version read here is used, so a draft
// can't be applied if the author edits mid-review.
async function applyReview(user: AuthUser, id: string, action: ReviewAction, expectedUpdatedAt?: string) {
  const existing = await prisma.question.findUnique({ where: { id },
    include: { draft: true, author: { select: { id: true, name: true, email: true } } },
  });
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Question not found');
  await assertReviewable(user, id);
  if (existing.status !== 'PENDING_REVIEW') throw await reviewConflict(id);
  if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
    throw await reviewConflict(id);
  }

  const now = new Date();
  const draft = existing.draft?.payload as DraftPayload | undefined;
  const published = existing.publishedAt !== null;

  let status: QuestionStatus;
  let note: string | null = null;
  let historyAction: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
  let auditAction: 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';
  let changes: Prisma.InputJsonObject;
  switch (action.kind) {
    case 'approve':
      status = 'APPROVED';
      historyAction = 'APPROVED';
      auditAction = 'APPROVE';
      changes = { appliedDraft: !!draft };
      break;
    case 'requestChanges':
      status = 'CHANGES_REQUESTED';
      note = action.note;
      historyAction = 'CHANGES_REQUESTED';
      auditAction = 'REQUEST_CHANGES';
      changes = { note };
      break;
    case 'reject':
      // A published question keeps its approved version; only the pending edit is turned down.
      status = published ? 'APPROVED' : 'REJECTED';
      note = action.note ?? null;
      historyAction = 'REJECTED';
      auditAction = 'REJECT';
      changes = { note, discardedDraft: !!draft, status };
      break;
  }

  await prisma.$transaction(async (tx) => {
    // Another reviewer's live claim blocks the decision; a lapsed one doesn't.
    const lock = await tx.questionReviewLock.findUnique({
      where: { questionId: id },
      include: { lockedBy: { select: { id: true, name: true } } },
    });
    if (lock && lock.lockedById !== user.id && lock.expiresAt > now) {
      throw new AppError(409, 'LOCKED', `${lock.lockedBy.name} is reviewing this question`, {
        reason: 'LOCKED',
        lockedBy: lock.lockedBy,
        expiresAt: lock.expiresAt,
      });
    }

    // Re-checks status and version in the write itself, so two reviewers can't both act on one
    // submission and an edit made since the read above can't slip through.
    const claimed = await tx.question.updateMany({
      where: { id, status: 'PENDING_REVIEW', updatedAt: existing.updatedAt },
      data: {
        status,
        reviewNote: note,
        reviewedById: user.id,
        reviewedAt: now,
        ...(action.kind === 'approve' && !published && { publishedAt: now }),
      },
    });
    if (claimed.count === 0) throw await reviewConflict(id);
    await tx.questionReviewLock.deleteMany({ where: { questionId: id } });

    if (draft && action.kind === 'approve') await replaceContent(tx, id, draft);
    // Approved: applied above. Rejected: turned down. Either way the draft is done.
    if (draft && action.kind !== 'requestChanges') await tx.questionDraft.delete({ where: { questionId: id } });

    await tx.questionHistory.create({
      data: { questionId: id, actorId: user.id, action: historyAction, changes },
    });
    await recordAudit(tx, {
      action: auditAction,
      module: 'QUESTION',
      entityId: id,
      actor: user,
      changes: { ...changes, fromStatus: existing.status, toStatus: status },
    });
  });

  notifyAuthor(user, existing, action, published);
}

// Tells the author about the decision. Sent after the transaction commits, and a failed email never
// fails the review. Reviewing your own question doesn't notify you.
function notifyAuthor(
  reviewer: AuthUser,
  question: { text: string; author: { id: string; name: string; email: string } },
  action: ReviewAction,
  published: boolean,
) {
  const { author } = question;
  if (author.id === reviewer.id) return;

  const base = { authorName: author.name, reviewerName: reviewer.name, questionText: question.text };
  const content =
    action.kind === 'approve'
      ? questionApprovedEmail({ ...base, isEdit: published })
      : action.kind === 'requestChanges'
        ? questionChangesRequestedEmail({ ...base, note: action.note })
        : questionRejectedEmail({ ...base, note: action.note ?? null, isEdit: published });
  sendEmailSafe({ to: author.email, ...content });
}

// Writes content onto the question row and replaces its tag set.
async function replaceContent(tx: Prisma.TransactionClient, id: string, content: DraftPayload) {
  await tx.questionTag.deleteMany({ where: { questionId: id } });
  await tx.questionTag.createMany({
    data: content.tags.map((t) => ({ questionId: id, tagId: t.tagId, categoryId: t.categoryId })),
  });
  // Always issued so updatedAt moves even when only tags changed.
  await tx.question.update({
    where: { id },
    data: {
      text: content.text,
      normalizedText: normalizeText(content.text),
      answerNotes: content.answerNotes,
      clientId: content.clientId,
    },
  });
}

export const questionInclude = {
  client: { select: { id: true, name: true } },
  tags: { include: { tag: { include: { category: true } } } },
  reviewedBy: { select: { id: true, name: true } },
  author: { select: { id: true, name: true } },
  draft: true,
  reviewLock: { select: { expiresAt: true, lockedBy: { select: { id: true, name: true } } } },
} satisfies Prisma.QuestionInclude;

type QuestionRow = Prisma.QuestionGetPayload<{ include: typeof questionInclude }>;

// Shape of QuestionDraft.payload.
type DraftPayload = {
  text: string;
  answerNotes: string;
  clientId: string | null;
  tags: { tagId: number; categoryId: number }[];
};

function groupTags(tags: { slug: string; category: { slug: string } }[]) {
  const grouped: Record<string, string[]> = {};
  for (const t of tags) (grouped[t.category.slug] ??= []).push(t.slug);
  return grouped;
}

// Review state is for the author and reviewers only; everyone else just sees approved content.
function canSeeReview(user: AuthUser, q: { authorId: string }) {
  return q.authorId === user.id || user.permissions.includes('question:review');
}

export function toQuestionDto(user: AuthUser, q: QuestionRow) {
  const seesReview = canSeeReview(user, q);
  return {
    id: q.id,
    text: q.text,
    answerNotes: q.answerNotes,
    client: q.client,
    tags: groupTags(q.tags.map((t) => t.tag)),
    authorId: q.authorId,
    // A live question under re-review is still approved as far as everyone else is concerned.
    status: seesReview ? q.status : 'APPROVED',
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    ...(seesReview && {
      author: q.author,
      isLive: q.publishedAt !== null, // false: never approved. true with hasDraft: the live version is unchanged
      submittedAt: q.submittedAt,
      reviewNote: q.reviewNote,
      reviewedBy: q.reviewedBy,
      reviewedAt: q.reviewedAt,
      hasDraft: q.draft !== null,
    }),
    // Reviewers see who else is on it; null when nobody is, or the claim has lapsed.
    ...(user.permissions.includes('question:review') && { reviewLock: activeLock(q.reviewLock) }),
  };
}

type LockRow = { expiresAt: Date; lockedBy: { id: string; name: string } } | null;

function activeLock(lock: LockRow) {
  return lock && lock.expiresAt > new Date() ? { lockedBy: lock.lockedBy, expiresAt: lock.expiresAt } : null;
}

// The reason an author gave for submitting a suspected duplicate, shown to reviewers while the
// question awaits review. It lives on the latest submission (CREATED or UPDATED history entry), so
// a later edit without the override drops it. Matches are limited to questions the reviewer can see.
async function loadDuplicateOverrides(user: AuthUser, rows: QuestionRow[]) {
  const result = new Map<string, { reason: string; matches: { id: string; text: string }[] }>();
  if (!user.permissions.includes('question:review')) return result;
  const pendingIds = rows.filter((q) => q.status === 'PENDING_REVIEW').map((q) => q.id);
  if (pendingIds.length === 0) return result;

  const history = await prisma.questionHistory.findMany({
    where: { questionId: { in: pendingIds }, action: { in: ['CREATED', 'UPDATED'] } },
    orderBy: { createdAt: 'desc' },
    select: { questionId: true, changes: true },
  });
  const latest = new Map<string, { reason: string; matchedIds: string[] }>();
  for (const h of history) {
    if (latest.has(h.questionId) || result.has(h.questionId)) continue;
    const o = (h.changes as { duplicateOverride?: { reason: string; matchedIds: string[] } } | null)?.duplicateOverride;
    // The first entry per question is its latest submission, with or without an override.
    latest.set(h.questionId, o ?? { reason: '', matchedIds: [] });
  }

  const wanted = [...latest.values()].filter((o) => o.reason);
  const matchIds = [...new Set(wanted.flatMap((o) => o.matchedIds))];
  const visible =
    matchIds.length > 0
      ? await prisma.question.findMany({
          where: { AND: [{ id: { in: matchIds } }, visibilityFilter(user)] },
          select: { id: true, text: true },
        })
      : [];
  const textById = new Map(visible.map((q) => [q.id, q.text]));

  for (const [questionId, o] of latest) {
    if (!o.reason) continue;
    result.set(questionId, {
      reason: o.reason,
      matches: o.matchedIds.flatMap((id) => (textById.has(id) ? [{ id, text: textById.get(id)! }] : [])),
    });
  }
  return result;
}

// Adds each pending edit, resolved to the same shape as the live content. Author and reviewers only.
// Tags and clients for all rows are loaded in one query each, so a page costs two extra queries.
async function withDrafts(user: AuthUser, rows: QuestionRow[]) {
  const drafts = rows.map((q) => (q.draft && canSeeReview(user, q) ? (q.draft.payload as DraftPayload) : null));
  const tagIds = [...new Set(drafts.flatMap((d) => d?.tags.map((t) => t.tagId) ?? []))];
  const clientIds = [...new Set(drafts.flatMap((d) => (d?.clientId ? [d.clientId] : [])))];

  const [tags, clients] = await Promise.all([
    tagIds.length > 0
      ? prisma.tag.findMany({ where: { id: { in: tagIds } }, include: { category: true } })
      : [],
    clientIds.length > 0
      ? prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
      : [],
  ]);
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const overrides = await loadDuplicateOverrides(user, rows);

  return rows.map((q, i) => {
    const override = overrides.get(q.id);
    const dto = { ...toQuestionDto(user, q), ...(override && { duplicateOverride: override }) };
    const d = drafts[i];
    if (!d) return dto;
    return {
      ...dto,
      draft: {
        text: d.text,
        answerNotes: d.answerNotes,
        client: d.clientId ? (clientById.get(d.clientId) ?? null) : null,
        tags: groupTags(d.tags.flatMap((t) => tagById.get(t.tagId) ?? [])),
      },
    };
  });
}

// Single-question view.
async function toDetailDto(user: AuthUser, q: QuestionRow) {
  const [dto] = await withDrafts(user, [q]);
  return dto!;
}
