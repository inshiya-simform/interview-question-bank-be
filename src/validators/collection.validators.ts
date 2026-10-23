import { z } from 'zod';
import { MAX_COLLECTION_NAME_LENGTH } from '../constants/collection.constants.js';

const name = z.string().trim().min(1).max(MAX_COLLECTION_NAME_LENGTH);

export const collectionNameSchema = z.object({ name }).strict();

export const collectionIdParamSchema = z.object({ id: z.uuid() });

export const questionIdParamSchema = z.object({ questionId: z.uuid() });

export const saveQuestionSchema = z.object({ collectionId: z.uuid() }).strict();

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const listCollectionQuestionsQuerySchema = z.object(pagination).strict();

// No collectionId = every saved question ("All saved").
export const listSavedQuestionsQuerySchema = z
  .object({ ...pagination, collectionId: z.uuid().optional() })
  .strict();

export type CollectionNameInput = z.infer<typeof collectionNameSchema>;
export type SaveQuestionInput = z.infer<typeof saveQuestionSchema>;
export type ListSavedQuestionsQuery = z.infer<typeof listSavedQuestionsQuerySchema>;
