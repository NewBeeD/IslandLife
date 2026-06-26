import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/island_life';

// Applies any pending SQL migrations from packages/server/migrations to the DB.
// Run via `npm run db:migrate` (cwd = repo root).
async function main(): Promise<void> {
  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: 'packages/server/migrations' });
    console.log(`✓ migrations applied to ${redact(DATABASE_URL)}`);
  } finally {
    await client.end();
  }
}

function redact(url: string): string {
  return url.replace(/\/\/([^:]+):[^@]+@/, '//$1:***@');
}

main().catch((err) => {
  console.error('✗ migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
