import { z } from 'zod';
import { MAX_NOTES_HTML_LENGTH, MAX_NOTES_TEXT_LENGTH } from '../constants/question.constants.js';
import { htmlToPlainText, sanitizeNotesHtml } from '../utils/sanitizeHtml.js';

const id = z.number().int().positive();

// Notes are rich-text HTML: sanitized on write, and the plain-text length keeps the original 10k limit.
const answerNotes = z
  .string()
  .trim()
  .max(MAX_NOTES_HTML_LENGTH)
  .transform(sanitizeNotesHtml)
  .refine((html) => htmlToPlainText(html).length <= MAX_NOTES_TEXT_LENGTH, {
    message: `Notes text must be at most ${MAX_NOTES_TEXT_LENGTH} characters`,
  });

const tagSelectionSchema = z
  .object({
    categoryId: id,
    tagIds: z.array(id).min(1).max(50),
  })
  .strict();

export const createQuestionSchema = z
  .object({
    text: z.string().trim().min(1).max(2000),
    answerNotes,
    clientId: z.uuid().nullable().optional(),
    // [{ categoryId, tagIds }, ...] — one entry per category
    tags: z
      .array(tagSelectionSchema)
      .min(1)
      .refine(
        (tags) => new Set(tags.map((t) => t.categoryId)).size === tags.length,
        'Each categoryId may appear only once',
      ),
    // Set confirmDistinct (with a distinctReason) to store a question flagged as a suspected duplicate.
    confirmDistinct: z.boolean().optional(),
    distinctReason: z.string().trim().max(1000).optional(),
  })
  .strict();

// Partial update: omitted fields are unchanged; tags, when present, replace the full set.
export const updateQuestionSchema = createQuestionSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');

// clientId scopes the check to that client's questions (omit or null for unrestricted ones);
// excludeId leaves out the question being edited.
export const checkDuplicateSchema = z
  .object({
    text: createQuestionSchema.shape.text,
    clientId: z.uuid().nullable().optional(),
    excludeId: z.uuid().optional(),
  })
  .strict();

const reviewNote = z.string().trim().max(1000);

// The updatedAt the reviewer saw. When sent, the review fails if the question has changed since.
const expectedUpdatedAt = z.iso.datetime();

export const approveSchema = z
  .object({ expectedUpdatedAt: expectedUpdatedAt.optional() })
  .strict()
  .default({});

// Requesting changes needs a note: the author has nothing to act on without one.
export const requestChangesSchema = z
  .object({ note: reviewNote.min(1), expectedUpdatedAt: expectedUpdatedAt.optional() })
  .strict();

// A rejection reason is optional; an empty one is stored as no reason.
export const rejectSchema = z
  .object({ note: reviewNote.optional(), expectedUpdatedAt: expectedUpdatedAt.optional() })
  .strict()
  .default({})
  .transform(({ note, expectedUpdatedAt }) => ({ note: note || undefined, expectedUpdatedAt }));

export const bulkReviewSchema = z
  .object({
    ids: z
      .array(z.uuid())
      .min(1)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, 'Each id may appear only once'),
    // id -> updatedAt the reviewer saw; ids without an entry are not version-checked by the client.
    expectedUpdatedAt: z.record(z.uuid(), expectedUpdatedAt).optional(),
  })
  .strict();

export const bulkRejectSchema = bulkReviewSchema
  .extend({ note: reviewNote.optional() })
  .transform(({ ids, note, expectedUpdatedAt }) => ({ ids, note: note || undefined, expectedUpdatedAt }));

export const questionIdParamSchema = z.object({ id: z.uuid() });

export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type ApproveInput = z.output<typeof approveSchema>;
export type RequestChangesInput = z.infer<typeof requestChangesSchema>;
export type BulkReviewInput = z.infer<typeof bulkReviewSchema>;
export type BulkRejectInput = z.output<typeof bulkRejectSchema>;
export type RejectInput = z.output<typeof rejectSchema>;
export type CheckDuplicateInput = z.infer<typeof checkDuplicateSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

// "1,2,3" -> [1, 2, 3]
const idList = z
  .string()
  .transform((v) => v.split(',').map((x) => Number(x.trim())))
  .pipe(z.array(z.number().int().positive()).min(1).max(50));

const questionStatus = z.enum(['PENDING_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED']);

// "PENDING_REVIEW,REJECTED" -> ['PENDING_REVIEW', 'REJECTED']
const statusList = z
  .string()
  .transform((v) => v.split(',').map((x) => x.trim()))
  .pipe(z.array(questionStatus).min(1).max(4));

export const listQuestionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    clientId: z.uuid().optional(),
    tags: idList.optional(), // ANY of the tag ids within a category, ALL categories must match
    categories: idList.optional(), // questions must have a tag in EACH of these categories
    search: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;

// Same filters as the list, without pagination: an export covers every matching question.
export const exportQuestionsQuerySchema = listQuestionsQuerySchema.omit({ page: true, limit: true });

export type ExportQuestionsQuery = z.infer<typeof exportQuestionsQuerySchema>;

export const listSubmissionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: statusList.optional(), // comma-separated; default: everything that is not live yet
    sort: z.enum(['submitted_asc', 'submitted_desc']).optional(), // default: reviewers oldest first, authors newest first
  })
  .strict();

export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;

// One CSV row, exactly as read: every cell is a string. Tags and client are slugs/names that the
// import service resolves to ids; the cell-level rules mirror createQuestionSchema.
export const CSV_COLUMNS = ['text', 'answer_notes', 'client', 'tags', 'confirm_distinct', 'distinct_reason'] as const;
export const CSV_REQUIRED_COLUMNS = ['text', 'answer_notes', 'tags'] as const;
export const MAX_IMPORT_ROWS = 500;

export const csvQuestionRowSchema = z
  .object({
    text: createQuestionSchema.shape.text,
    answer_notes: createQuestionSchema.shape.answerNotes,
    client: z.string().trim().max(200),
    tags: z.string().trim().min(1, 'At least one tag is required'),
    confirm_distinct: z.enum(['', 'true', 'false'], {
      error: 'Must be true or false (if this holds a tag, separate tag groups in the tags column with ";", not ",")',
    }),
    distinct_reason: createQuestionSchema.shape.distinctReason.unwrap(),
  })
  .partial({ client: true, confirm_distinct: true, distinct_reason: true })
  .strict();

export type CsvQuestionRow = z.infer<typeof csvQuestionRowSchema>;
