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
    // Accepted now so the contract is stable; duplicate detection arrives in a later step.
    confirmDistinct: z.boolean().optional(),
    distinctReason: z.string().trim().max(1000).optional(),
  })
  .strict();

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

// "1,2,3" -> [1, 2, 3]
const idList = z
  .string()
  .transform((v) => v.split(',').map((x) => Number(x.trim())))
  .pipe(z.array(z.number().int().positive()).min(1).max(50));

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
