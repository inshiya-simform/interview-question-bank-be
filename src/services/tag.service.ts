import { prisma } from '../db/prisma.js';

export async function listTagCategories() {
  const categories = await prisma.tagCategory.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      tags: { select: { id: true, slug: true, name: true }, orderBy: { name: 'asc' } },
    },
    orderBy: { name: 'asc' },
  });
  return { categories };
}
