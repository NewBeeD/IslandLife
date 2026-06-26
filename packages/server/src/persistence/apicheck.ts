/* eslint-disable no-console */
import { eq } from 'drizzle-orm';
import { buildApp } from '../app';
import { db, client } from './db';
import { save as saveTable } from './schema';

// P4.1/P4.3 acceptance, run against the live database via Fastify's `inject` (no
// port needed). It begins a life, advances it, and confirms the month increments
// in Postgres and that the Money/Feed/State DTOs read correctly — then deletes the
// save it created (cascades clean up snapshots, projections, and the feed).
async function main(): Promise<void> {
  const app = buildApp();
  await app.ready();
  let saveId: string | null = null;

  try {
    // POST /saves — begin a life from the five forks.
    const created = await app.inject({
      method: 'POST',
      url: '/saves',
      payload: {
        seed: 1234,
        creationChoices: {
          background: 'A',
          school: 'A',
          formative: 'A',
          tendency: 'A',
          situation: 'A',
        },
      },
    });
    if (created.statusCode !== 201) throw new Error(`POST /saves -> ${created.statusCode}: ${created.body}`);
    const createBody = created.json() as { saveId: string; month: number; monthLabel: string };
    saveId = createBody.saveId;
    console.log(`POST /saves      -> 201  save ${saveId}  month ${createBody.month} (${createBody.monthLabel})`);
    if (createBody.month !== 0) throw new Error('new save should start at month 0');

    // GET /saves/:id/state — the header bar.
    const state0 = await app.inject({ method: 'GET', url: `/saves/${saveId}/state` });
    const s0 = state0.json() as { month: number; name: string; parish: string; cashInHand: number };
    console.log(`GET  /state      -> ${state0.statusCode}  ${s0.name}, ${s0.parish}, month ${s0.month}, EC$${s0.cashInHand}`);

    // POST /saves/:id/advance — advance three months, watching the month climb.
    let lastMonth = createBody.month;
    let lastFeedLen = 0;
    for (let i = 0; i < 3; i++) {
      const adv = await app.inject({ method: 'POST', url: `/saves/${saveId}/advance` });
      if (adv.statusCode !== 200) throw new Error(`advance -> ${adv.statusCode}: ${adv.body}`);
      const a = adv.json() as { month: number; monthLabel: string; blurb: string; feed: unknown[] };
      if (a.month !== lastMonth + 1) throw new Error(`month did not increment: ${lastMonth} -> ${a.month}`);
      lastMonth = a.month;
      lastFeedLen = a.feed.length;
      console.log(`POST /advance    -> 200  month ${a.month} (${a.monthLabel})  ${a.feed.length} feed entries  "${a.blurb}"`);
    }

    // Confirm the month incremented IN POSTGRES (not just in the response).
    const rows = await db.select().from(saveTable).where(eq(saveTable.id, saveId));
    const persisted = rows[0];
    if (!persisted) throw new Error('save row vanished');
    console.log(`DB  save.current_month = ${persisted.currentMonth}`);
    if (persisted.currentMonth !== lastMonth) {
      throw new Error(`Postgres month ${persisted.currentMonth} != advanced month ${lastMonth}`);
    }

    // GET /saves/:id/feed — the latest month's persisted feed.
    const feed = await app.inject({ method: 'GET', url: `/saves/${saveId}/feed` });
    const f = feed.json() as { month: number; entries: unknown[] };
    console.log(`GET  /feed       -> ${feed.statusCode}  month ${f.month}  ${f.entries.length} entries persisted`);
    if (f.entries.length !== lastFeedLen) {
      throw new Error(`persisted feed (${f.entries.length}) != advance feed (${lastFeedLen})`);
    }

    // GET /saves/:id/money — the Money view.
    const money = await app.inject({ method: 'GET', url: `/saves/${saveId}/money` });
    const m = money.json() as {
      cashInHand: number;
      income: { total: number };
      expenses: { total: number };
      thisMonthDelta: number;
    };
    console.log(
      `GET  /money      -> ${money.statusCode}  in EC$${m.income.total}  out EC$${m.expenses.total}  delta ${m.thisMonthDelta >= 0 ? '+' : ''}EC$${m.thisMonthDelta}  cash EC$${m.cashInHand}`,
    );
    if (Object.prototype.hasOwnProperty.call(m, 'netWorth')) throw new Error('money leaked netWorth');

    // 404 on an unknown save.
    const missing = await app.inject({ method: 'GET', url: '/saves/00000000-0000-0000-0000-000000000000/state' });
    console.log(`GET  /state(404) -> ${missing.statusCode}`);
    if (missing.statusCode !== 404) throw new Error('expected 404 for unknown save');

    console.log('\n✅ API acceptance passed: a save advances and the month increments in Postgres.');
  } finally {
    if (saveId) {
      await db.delete(saveTable).where(eq(saveTable.id, saveId));
      console.log(`cleaned up save ${saveId}`);
    }
    await app.close();
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
