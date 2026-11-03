import { MENTION_PICKER_LIMIT, REPLIES_PREVIEW } from '../constants/comment.constants.js';
import { prisma } from '../db/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/express.js';
import { AppError } from '../utils/AppError.js';
import type {
  CreateCommentInput,
  ListCommentsQuery,
  ListRepliesQuery,
  UpdateCommentInput,
  VoteInput,
} from '../validators/comment.validators.js';
import { notify } from './notification.service.js';
import { assertQuestionVisible } from './question.service.js';

type VisibleQuestion = Awaited<ReturnType<typeof assertQuestionVisible>>;

const hasPermission = (code: string): Prisma.UserWhereInput => ({
  role: { permissions: { some: { permission: { code } } } },
});

// Users who could open this question themselves, i.e. the same rule as assertQuestionVisible but
// evaluated for other people: question:read, a grant on the question's client (unrestricted questions
// need none), and, until the question is approved, only its author and reviewers. A reviewer is also
// kept out when a pending edit moves the question to a client they hold no grant on.
function mentionableWhere(q: VisibleQuestion): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [hasPermission('question:read')];
  if (q.clientId) and.push({ permissions: { some: { clientId: q.clientId } } });
  if (!q.publishedAt) {
    and.push({ OR: [hasPermission('question:review'), { id: q.authorId, ...hasPermission('question:edit_own') }] });
  }
  const draftClientId = (q.draft?.payload as { clientId?: string | null } | null | undefined)?.clientId;
  if (draftClientId) {
    and.push({
      OR: [
        { role: { permissions: { none: { permission: { code: 'question:review' } } } } },
        { permissions: { some: { clientId: draftClientId } } },
      ],
    });
  }
  return { AND: and };
}

export async function listMentionableUsers(user: AuthUser, questionId: string, search: string) {
  const q = await assertQuestionVisible(user, questionId);
  const users = await prisma.user.findMany({
    where: {
      AND: [
        mentionableWhere(q),
        { id: { not: user.id } },
        ...(search
          ? [{ OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { email: { startsWith: search, mode: 'insensitive' as const } }] }]
          : []),
      ],
    },
    select: { id: true, name: true, email: true, role: { select: { name: true } } },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: MENTION_PICKER_LIMIT,
  });
  return { items: users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role.name })) };
}

// Mentions come from the client, so each id is re-checked against who can actually open the question.
async function resolveMentions(q: VisibleQuestion, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const found = await prisma.user.findMany({
    where: { AND: [mentionableWhere(q), { id: { in: unique } }] },
    select: { id: true, name: true },
  });
  if (found.length !== unique.length) {
    const ok = new Set(found.map((u) => u.id));
    throw new AppError(400, 'VALIDATION_ERROR', 'Some mentioned people cannot access this question', {
      mentions: unique.filter((id) => !ok.has(id)),
    });
  }
  return found;
}

// myVote rides along on the same query instead of a separate votes lookup.
const commentSelect = (userId: string) =>
  ({
    id: true,
    parentId: true,
    body: true,
    score: true,
    editedAt: true,
    deletedAt: true,
    createdAt: true,
    author: { select: { id: true, name: true, role: { select: { name: true } } } },
    mentions: { select: { user: { select: { id: true, name: true } } } },
    votes: { where: { userId }, select: { value: true } },
  }) satisfies Prisma.CommentSelect;

const REPLY_ORDER = [{ createdAt: 'asc' }, { id: 'asc' }] satisfies Prisma.CommentOrderByWithRelationInput[];

// A thread is a root comment with its first few replies and the live reply total; the rest are paged
// through listReplies, so a busy thread never makes the list heavy.
const threadSelect = (userId: string) =>
  ({
    ...commentSelect(userId),
    _count: { select: { replies: { where: { deletedAt: null } } } },
    replies: { where: { deletedAt: null }, orderBy: REPLY_ORDER, take: REPLIES_PREVIEW, select: commentSelect(userId) },
  }) satisfies Prisma.CommentSelect;

type CommentRow = Prisma.CommentGetPayload<{ select: ReturnType<typeof commentSelect> }>;
type ThreadRow = Prisma.CommentGetPayload<{ select: ReturnType<typeof threadSelect> }>;

function toDto(user: AuthUser, c: CommentRow) {
  const deleted = c.deletedAt !== null;
  const mine = c.author.id === user.id;
  return {
    id: c.id,
    parentId: c.parentId,
    // A deleted comment with replies stays as a placeholder so the thread still reads.
    body: deleted ? null : c.body,
    deleted,
    author: { id: c.author.id, name: c.author.name },
    isReviewer: c.author.role.name === 'REVIEWER',
    mentions: deleted ? [] : c.mentions.map((m) => m.user),
    score: c.score,
    myVote: deleted ? 0 : (c.votes[0]?.value ?? 0),
    createdAt: c.createdAt,
    editedAt: c.editedAt,
    canEdit: mine && !deleted,
    canDelete: !deleted && (mine || user.permissions.includes('question:review')),
    canVote: !mine && !deleted,
  };
}

function toThreadDto(user: AuthUser, t: ThreadRow) {
  const replyCount = t._count.replies;
  return { ...toDto(user, t), replies: t.replies.map((r) => toDto(user, r)), replyCount, hasMoreReplies: replyCount > t.replies.length };
}

export async function listComments(user: AuthUser, questionId: string, { sort, page, limit }: ListCommentsQuery) {
  await assertQuestionVisible(user, questionId);

  // A deleted root is only worth showing while someone has replied under it.
  const rootWhere: Prisma.CommentWhereInput = {
    questionId,
    parentId: null,
    OR: [{ deletedAt: null }, { replies: { some: { deletedAt: null } } }],
  };
  // One round trip; the transaction also keeps the counts consistent with the page.
  const [total, totalComments, roots] = await prisma.$transaction([
    prisma.comment.count({ where: rootWhere }),
    prisma.comment.count({ where: { questionId, deletedAt: null } }),
    prisma.comment.findMany({
      where: rootWhere,
      select: threadSelect(user.id),
      orderBy:
        sort === 'new'
          ? [{ createdAt: 'desc' }, { id: 'asc' }]
          : [{ score: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { items: roots.map((r) => toThreadDto(user, r)), page, limit, total, totalComments };
}

// Opaque keyset cursor over (createdAt, id): stable while new replies arrive, unlike an offset.
const encodeCursor = (c: { createdAt: Date; id: string }) =>
  Buffer.from(JSON.stringify([c.createdAt.toISOString(), c.id])).toString('base64url');

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as [string, string];
    const createdAt = new Date(at);
    if (Number.isNaN(createdAt.getTime()) || typeof id !== 'string') throw new Error('bad cursor');
    return { createdAt, id };
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
  }
}

// Replies of one thread, oldest first, after the ones already shown.
export async function listReplies(user: AuthUser, questionId: string, commentId: string, { cursor, limit }: ListRepliesQuery) {
  await assertQuestionVisible(user, questionId);
  const root = await prisma.comment.findFirst({ where: { id: commentId, questionId, parentId: null }, select: { id: true } });
  if (!root) throw new AppError(404, 'NOT_FOUND', 'Comment not found');

  const after = cursor ? decodeCursor(cursor) : null;
  const rows = await prisma.comment.findMany({
    where: {
      parentId: commentId,
      deletedAt: null,
      ...(after && { OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }] }),
    },
    select: commentSelect(user.id),
    orderBy: REPLY_ORDER,
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  return { items: page.map((r) => toDto(user, r)), nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]!) : null };
}

async function loadComment(questionId: string, commentId: string) {
  const c = await prisma.comment.findFirst({
    where: { id: commentId, questionId },
    select: { id: true, authorId: true, parentId: true, deletedAt: true, mentions: { select: { userId: true } } },
  });
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Comment not found');
  return c;
}

async function loadOne(user: AuthUser, id: string) {
  return toDto(user, await prisma.comment.findUniqueOrThrow({ where: { id }, select: commentSelect(user.id) }));
}

function notifyMentions(user: AuthUser, q: VisibleQuestion, commentId: string, parentId: string | null, userIds: string[]) {
  void notify(
    userIds.filter((id) => id !== user.id),
    {
      type: 'COMMENT_MENTION',
      data: {
        questionId: q.id,
        questionText: q.text,
        commentId,
        parentId,
        actorId: user.id,
        actorName: user.name,
      },
    },
  );
}

export async function createComment(user: AuthUser, questionId: string, input: CreateCommentInput) {
  const q = await assertQuestionVisible(user, questionId);

  // Replies are one level deep: replying to a reply lands under the root comment.
  let parentId: string | null = null;
  if (input.parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: input.parentId, questionId },
      select: { id: true, parentId: true, deletedAt: true },
    });
    if (!parent || parent.deletedAt) throw new AppError(404, 'NOT_FOUND', 'Comment not found');
    parentId = parent.parentId ?? parent.id;
  }

  const mentioned = await resolveMentions(q, input.mentions);
  const created = await prisma.comment.create({
    data: {
      questionId,
      authorId: user.id,
      parentId,
      body: input.body,
      mentions: { create: mentioned.map((u) => ({ userId: u.id })) },
    },
    select: { id: true },
  });

  notifyMentions(user, q, created.id, parentId, mentioned.map((u) => u.id));
  return loadOne(user, created.id);
}

export async function updateComment(user: AuthUser, questionId: string, commentId: string, input: UpdateCommentInput) {
  const q = await assertQuestionVisible(user, questionId);
  const c = await loadComment(questionId, commentId);
  if (c.deletedAt) throw new AppError(404, 'NOT_FOUND', 'Comment not found');
  if (c.authorId !== user.id) throw new AppError(403, 'FORBIDDEN', 'You can only edit your own comments');

  const mentioned = await resolveMentions(q, input.mentions);
  const before = new Set(c.mentions.map((m) => m.userId));
  await prisma.$transaction([
    prisma.commentMention.deleteMany({ where: { commentId } }),
    prisma.comment.update({
      where: { id: commentId },
      data: {
        body: input.body,
        editedAt: new Date(),
        mentions: { create: mentioned.map((u) => ({ userId: u.id })) },
      },
    }),
  ]);

  // Only people newly mentioned by the edit are told.
  notifyMentions(user, q, commentId, c.parentId, mentioned.map((u) => u.id).filter((id) => !before.has(id)));
  return loadOne(user, commentId);
}

// Authors delete their own comments; reviewers (who can see the question) may remove any.
export async function deleteComment(user: AuthUser, questionId: string, commentId: string) {
  await assertQuestionVisible(user, questionId);
  const c = await loadComment(questionId, commentId);
  if (c.deletedAt) throw new AppError(404, 'NOT_FOUND', 'Comment not found');
  if (c.authorId !== user.id && !user.permissions.includes('question:review')) {
    throw new AppError(403, 'FORBIDDEN', 'You can only delete your own comments');
  }
  await prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
}

export async function voteComment(user: AuthUser, questionId: string, commentId: string, { value }: VoteInput) {
  await assertQuestionVisible(user, questionId);
  const c = await loadComment(questionId, commentId);
  if (c.deletedAt) throw new AppError(404, 'NOT_FOUND', 'Comment not found');
  if (c.authorId === user.id) throw new AppError(403, 'FORBIDDEN', 'You cannot vote on your own comment');

  // The vote row and the cached score change together; the row lock serialises concurrent votes.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Comment" WHERE "id" = ${commentId} FOR UPDATE`;
    const existing = await tx.commentVote.findUnique({
      where: { commentId_userId: { commentId, userId: user.id } },
      select: { value: true },
    });
    const delta = value - (existing?.value ?? 0);
    if (value === 0) {
      if (existing) await tx.commentVote.delete({ where: { commentId_userId: { commentId, userId: user.id } } });
    } else {
      await tx.commentVote.upsert({
        where: { commentId_userId: { commentId, userId: user.id } },
        create: { commentId, userId: user.id, value },
        update: { value },
      });
    }
    const updated = await tx.comment.update({
      where: { id: commentId },
      data: { score: { increment: delta } },
      select: { score: true },
    });
    return { score: updated.score, myVote: value };
  });
}
