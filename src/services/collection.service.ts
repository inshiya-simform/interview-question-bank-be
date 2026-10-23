import { MAX_COLLECTIONS_PER_USER } from '../constants/collection.constants.js';
import { prisma } from '../db/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/express.js';
import { AppError } from '../utils/AppError.js';
import type {
  CollectionNameInput,
  ListSavedQuestionsQuery,
  SaveQuestionInput,
} from '../validators/collection.validators.js';
import { liveFilter, questionInclude, toQuestionDto } from './question.service.js';

const collectionSelect = { id: true, name: true, createdAt: true, updatedAt: true } satisfies Prisma.CollectionSelect;

// "Frontend " and "frontend" are the same collection to the user.
const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

const nameTaken = () => new AppError(409, 'CONFLICT', 'You already have a collection with this name');

// Saved questions the caller can no longer see (unpublished, client access revoked) are neither
// listed nor counted, so a count always matches what the collection page shows.
function visibleSaved(user: AuthUser): Prisma.SavedQuestionWhereInput {
  return { userId: user.id, question: liveFilter(user) };
}

async function getOwnCollection(user: AuthUser, id: string) {
  // Another user's collection looks the same as a nonexistent one.
  const collection = await prisma.collection.findFirst({ where: { id, userId: user.id }, select: collectionSelect });
  if (!collection) throw new AppError(404, 'NOT_FOUND', 'Collection not found');
  return collection;
}

export async function listCollections(user: AuthUser) {
  const [collections, counts] = await Promise.all([
    prisma.collection.findMany({
      where: { userId: user.id },
      select: collectionSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }),
    prisma.savedQuestion.groupBy({ by: ['collectionId'], where: visibleSaved(user), _count: { _all: true } }),
  ]);
  const countById = new Map(counts.map((c) => [c.collectionId, c._count._all]));

  return {
    collections: collections.map((c) => ({ ...c, count: countById.get(c.id) ?? 0 })),
    // The "All saved" entry.
    totalSaved: counts.reduce((sum, c) => sum + c._count._all, 0),
  };
}

export async function createCollection(user: AuthUser, { name }: CollectionNameInput) {
  const normalizedName = normalizeName(name);

  const existing = await prisma.collection.count({ where: { userId: user.id } });
  if (existing >= MAX_COLLECTIONS_PER_USER) {
    throw new AppError(409, 'CONFLICT', `You can have at most ${MAX_COLLECTIONS_PER_USER} collections`);
  }

  try {
    const created = await prisma.collection.create({
      data: { userId: user.id, name, normalizedName },
      select: collectionSelect,
    });
    return { ...created, count: 0 };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw nameTaken();
    throw err;
  }
}

export async function renameCollection(user: AuthUser, id: string, { name }: CollectionNameInput) {
  await getOwnCollection(user, id);

  try {
    const updated = await prisma.collection.update({
      where: { id },
      data: { name, normalizedName: normalizeName(name) },
      select: collectionSelect,
    });
    const count = await prisma.savedQuestion.count({ where: { ...visibleSaved(user), collectionId: id } });
    return { ...updated, count };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw nameTaken();
    throw err;
  }
}

// Removes the collection and every saved row in it; the questions themselves are untouched.
export async function deleteCollection(user: AuthUser, id: string) {
  await getOwnCollection(user, id);
  await prisma.collection.delete({ where: { id } });
}

// Saved questions, newest save first. collectionId omitted = all of the caller's collections.
export async function listSavedQuestions(user: AuthUser, { page, limit, collectionId }: ListSavedQuestionsQuery) {
  const collection = collectionId ? await getOwnCollection(user, collectionId) : null;
  const where: Prisma.SavedQuestionWhereInput = { ...visibleSaved(user), ...(collection && { collectionId: collection.id }) };

  const [total, rows] = await prisma.$transaction([
    prisma.savedQuestion.count({ where }),
    prisma.savedQuestion.findMany({
      where,
      select: {
        savedAt: true,
        collection: { select: { id: true, name: true } },
        question: { include: questionInclude },
      },
      orderBy: [{ savedAt: 'desc' }, { questionId: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    questions: rows.map((r) => ({
      ...toQuestionDto(user, r.question),
      savedIn: r.collection,
      savedAt: r.savedAt,
    })),
    collection,
    page,
    limit,
    total,
  };
}

// Save, or move to another collection if it is already saved: one call for both, safe to repeat.
export async function saveQuestion(user: AuthUser, questionId: string, { collectionId }: SaveQuestionInput) {
  const collection = await getOwnCollection(user, collectionId);

  // Only live questions the caller can see; anything else looks nonexistent.
  const question = await prisma.question.findFirst({
    where: { AND: [{ id: questionId }, liveFilter(user)] },
    select: { id: true },
  });
  if (!question) throw new AppError(404, 'NOT_FOUND', 'Question not found');

  const saved = await prisma.savedQuestion.upsert({
    where: { userId_questionId: { userId: user.id, questionId } },
    create: { userId: user.id, questionId, collectionId },
    update: { collectionId },
    select: { savedAt: true },
  });

  return { questionId, savedIn: { id: collection.id, name: collection.name }, savedAt: saved.savedAt };
}

// Idempotent: unsaving a question that is not saved is not an error.
export async function unsaveQuestion(user: AuthUser, questionId: string) {
  await prisma.savedQuestion.deleteMany({ where: { userId: user.id, questionId } });
}
