import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Paths are resolved from the repo root (where the npm scripts run).
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/server/src/persistence/schema.ts',
  out: './packages/server/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/island_life',
  },
  strict: true,
  verbose: true,
});
