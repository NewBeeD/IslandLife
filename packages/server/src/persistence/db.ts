import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/island_life';

// Shared connection pool + typed Drizzle client. Engine code must NOT import this
// (S1: the engine has no I/O); only the server/persistence layer does.
export const client = postgres(DATABASE_URL, { max: 5 });
export const db = drizzle(client, { schema });

export { schema };
