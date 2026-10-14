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
