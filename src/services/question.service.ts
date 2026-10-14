import { prisma } from '../db/prisma.js';
import type { AuthUser } from '../types/express.js';
import { AppError } from '../utils/AppError.js';
import { normalizeText } from '../utils/normalize.js';
import type { CreateQuestionInput } from '../validators/question.validators.js';

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
