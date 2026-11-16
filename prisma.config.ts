import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Neon: migrations need a direct (unpooled) connection; the app runtime uses the pooled DATABASE_URL.
    url: process.env.DATABASE_URL_UNPOOLED ?? env('DATABASE_URL'),
  },
});
