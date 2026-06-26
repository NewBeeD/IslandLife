import 'dotenv/config';
import postgres from 'postgres';

// `npm run db:check` — lists public tables and column counts. Handy smoke test
// that DATABASE_URL is reachable and the schema is applied.
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/island_life';

const sql = postgres(DATABASE_URL, { max: 1 });
try {
  const tables = await sql<{ table_name: string; cols: number }[]>`
    SELECT t.table_name, COUNT(c.column_name)::int AS cols
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON c.table_schema = t.table_schema AND c.table_name = t.table_name
    WHERE t.table_schema = 'public'
    GROUP BY t.table_name
    ORDER BY t.table_name;
  `;
  if (tables.length === 0) {
    console.log('no public tables found — run `npm run db:migrate`');
  } else {
    console.log(`public tables (${tables.length}):`);
    for (const t of tables) console.log(`  ${t.table_name} (${t.cols} cols)`);
  }

  const enums = await sql<{ typname: string; n: number }[]>`
    SELECT t.typname, COUNT(e.enumlabel)::int AS n
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    GROUP BY t.typname ORDER BY t.typname;
  `;
  if (enums.length > 0) {
    console.log('enums:');
    for (const e of enums) console.log(`  ${e.typname} (${e.n} values)`);
  }

  const fks = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY';
  `;
  console.log(`foreign keys: ${fks[0]?.n ?? 0}`);
} finally {
  await sql.end();
}
