import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var ${key}`);
  return value;
}

const taxonomy: Record<string, { name: string; tags: string[] }> = {
  technology: { name: 'Technology', tags: ['react', 'node', 'postgres', 'typescript', 'docker'] },
  seniority: { name: 'Seniority', tags: ['junior', 'mid', 'senior'] },
  'question-type': { name: 'Question type', tags: ['conceptual', 'coding', 'system-design', 'behavioural'] },
};

// role -> permission codes. Changing access is a data change: edit this map (or the rows).
const rolePermissions: Record<string, string[]> = {
  REVIEWER: ['question:read', 'question:review'],
  USER: ['question:read', 'question:create', 'question:edit_own'],
  SUPER_ADMIN: ['user:read', 'user:create_staff', 'client:read_all', 'client:create', 'client:assign', 'audit:read'],
};

async function main() {
  const adminEmail = requireEnv('SEED_ADMIN_EMAIL');
  const adminName = requireEnv('SEED_ADMIN_NAME');
  const adminPassword = requireEnv('SEED_ADMIN_PASSWORD');

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

  // The only seeded user: the super admin, needed to bootstrap everything else.
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: adminName,
      roleId: roles.get('SUPER_ADMIN')!,
      passwordHash: await bcrypt.hash(adminPassword, 10),
    },
  });

  for (const [slug, { name, tags }] of Object.entries(taxonomy)) {
    const category = await prisma.tagCategory.upsert({ where: { slug }, update: {}, create: { slug, name } });
    for (const tagSlug of tags) {
      await prisma.tag.upsert({
        where: { categoryId_slug: { categoryId: category.id, slug: tagSlug } },
        update: {},
        create: { categoryId: category.id, slug: tagSlug, name: tagSlug },
      });
    }
  }

  console.log(`Seeded roles, permissions, tag taxonomy and super admin (${adminEmail}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
