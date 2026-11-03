import { z } from 'zod';
import { MAX_COMMENT_LENGTH, MAX_MENTIONS_PER_COMMENT, MAX_REPLIES_PAGE } from '../constants/comment.constants.js';
import { htmlToPlainText } from '../utils/sanitizeHtml.js';

// Comments are plain text; any markup is stripped on write.
const body = z.string().trim().max(MAX_COMMENT_LENGTH * 2).transform(htmlToPlainText).pipe(
  z.string().min(1).max(MAX_COMMENT_LENGTH),
);
const mentions = z.array(z.uuid()).max(MAX_MENTIONS_PER_COMMENT);

export const questionIdParamSchema = z.object({ questionId: z.uuid() });
export const commentParamsSchema = z.object({ questionId: z.uuid(), commentId: z.uuid() });

export const listCommentsQuerySchema = z
  .object({
    sort: z.enum(['top', 'new']).default('top'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const listRepliesQuerySchema = z
  .object({
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_REPLIES_PAGE).default(20),
  })
  .strict();

export const mentionableQuerySchema = z.object({ q: z.string().trim().max(100).default('') }).strict();

export const createCommentSchema = z
  .object({ body, mentions: mentions.default([]), parentId: z.uuid().optional() })
  .strict();

export const updateCommentSchema = z.object({ body, mentions: mentions.default([]) }).strict();

// 0 removes the caller's vote.
export const voteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) }).strict();

export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
export type ListRepliesQuery = z.infer<typeof listRepliesQuerySchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type VoteInput = z.infer<typeof voteSchema>;
