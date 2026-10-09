import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { normalizeText } from '../src/utils/normalize.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const PASSWORD = 'password123';

const taxonomy: Record<string, { name: string; tags: string[] }> = {
  technology: { name: 'Technology', tags: ['react', 'node', 'postgres', 'typescript', 'docker'] },
  seniority: { name: 'Seniority', tags: ['junior', 'mid', 'senior'] },
  'question-type': { name: 'Question type', tags: ['conceptual', 'coding', 'system-design', 'behavioural'] },
};

// role -> permission codes. Changing access is a data change: edit this map (or the rows).
const rolePermissions: Record<string, string[]> = {
  AUTHOR: ['question:read', 'question:create', 'question:edit_own'],
  REVIEWER: ['question:read', 'question:edit_any'],
  USER: ['question:read'],
};

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const permissionCodes = [...new Set(Object.values(rolePermissions).flat())];
  const permissions = new Map<string, number>();
  for (const code of permissionCodes) {
    const p = await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
    permissions.set(code, p.id);
  }
  const roles = new Map<string, number>();
  for (const [name, codes] of Object.entries(rolePermissions)) {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    roles.set(name, role.id);
    for (const code of codes) {
      const permissionId = permissions.get(code)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  const users = await Promise.all(
    (
      [
        ['author@example.com', 'Alice Author', 'AUTHOR'],
        ['author2@example.com', 'Aaron Author', 'AUTHOR'],
        ['reviewer@example.com', 'Riya Reviewer', 'REVIEWER'],
        ['user@example.com', 'Uma User', 'USER'],
        ['acme-user@example.com', 'Adam Acme', 'USER'],
      ] as const
    ).map(([email, name, role]) =>
      prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, name, roleId: roles.get(role)!, passwordHash },
      }),
    ),
  );
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));

  const [acme, globex] = await Promise.all(
    ['Acme Corp', 'Globex'].map((name) =>
      prisma.client.upsert({ where: { name }, update: {}, create: { name } }),
    ),
  );

  // Only acme-user is granted Acme. Reviewer/authors deliberately have no grants
  // (roles are independent of client permission).
  await prisma.clientPermission.upsert({
    where: { userId_clientId: { userId: byEmail['acme-user@example.com']!.id, clientId: acme!.id } },
    update: {},
    create: { userId: byEmail['acme-user@example.com']!.id, clientId: acme!.id },
  });

  const tagIds = new Map<string, { id: number; categoryId: number }>();
  for (const [slug, { name, tags }] of Object.entries(taxonomy)) {
    const category = await prisma.tagCategory.upsert({ where: { slug }, update: {}, create: { slug, name } });
    for (const tagSlug of tags) {
      const tag = await prisma.tag.upsert({
        where: { categoryId_slug: { categoryId: category.id, slug: tagSlug } },
        update: {},
        create: { categoryId: category.id, slug: tagSlug, name: tagSlug },
      });
      tagIds.set(`${slug}:${tagSlug}`, { id: tag.id, categoryId: category.id });
    }
  }

  if ((await prisma.question.count()) === 0) {
    const samples = [
      { text: 'Explain the difference between useMemo and useCallback.', notes: 'Memoised value vs memoised function; both avoid recomputation on unchanged deps.', client: null, tags: ['technology:react', 'seniority:mid', 'question-type:conceptual'] },
      { text: 'How does the Node.js event loop work?', notes: 'Phases: timers, pending, poll, check, close. Microtasks run between phases.', client: null, tags: ['technology:node', 'seniority:senior', 'question-type:conceptual'] },
      { text: 'Write a query to find duplicate emails in a users table.', notes: 'GROUP BY email HAVING COUNT(*) > 1.', client: null, tags: ['technology:postgres', 'seniority:junior', 'question-type:coding'] },
      { text: 'Describe how you would migrate the Acme billing monolith to services.', notes: 'Confidential Acme context: strangler pattern around the invoicing module.', client: acme!.id, tags: ['technology:node', 'seniority:senior', 'question-type:system-design'] },
      { text: 'Globex asks candidates to design a multi-tenant reporting pipeline.', notes: 'Confidential Globex context: partition by tenant id.', client: globex!.id, tags: ['technology:postgres', 'seniority:senior', 'question-type:system-design'] },
    ];
    for (const s of samples) {
      await prisma.question.create({
        data: {
          text: s.text,
          normalizedText: normalizeText(s.text),
          answerNotes: s.notes,
          clientId: s.client,
          authorId: byEmail['author@example.com']!.id,
          tags: {
            create: s.tags.map((key) => {
              const t = tagIds.get(key)!;
              return { tagId: t.id, categoryId: t.categoryId };
            }),
          },
          history: {
            create: { actorId: byEmail['author@example.com']!.id, action: 'CREATED', changes: { text: s.text } },
          },
        },
      });
    }
  }

  console.log(`Seeded. All users share the password "${PASSWORD}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
