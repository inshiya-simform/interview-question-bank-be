import { z } from 'zod';

const id = z.number().int().positive();

const tagSelectionSchema = z
  .object({
    categoryId: id,
    tagIds: z.array(id).min(1).max(50),
  })
  .strict();

export const createQuestionSchema = z
  .object({
    text: z.string().trim().min(1).max(2000),
    answerNotes: z.string().trim().max(10000),
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
  .omit({ confirmDistinct: true, distinctReason: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');

export const checkDuplicateSchema = z.object({ text: createQuestionSchema.shape.text }).strict();

const reviewNote = z.string().trim().max(1000);

// Requesting changes needs a note: the author has nothing to act on without one.
export const requestChangesSchema = z.object({ note: reviewNote.min(1) }).strict();

// A rejection reason is optional; an empty one is stored as no reason.
export const rejectSchema = z
  .object({ note: reviewNote.optional() })
  .strict()
  .default({})
  .transform(({ note }) => ({ note: note || undefined }));

export const questionIdParamSchema = z.object({ id: z.uuid() });

export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type RequestChangesInput = z.infer<typeof requestChangesSchema>;
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
    tags: idList.optional(), // matches questions having ANY of these tag ids
    categories: idList.optional(), // matches questions having a tag in ANY of these categories
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
