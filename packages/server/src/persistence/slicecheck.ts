/* eslint-disable no-console */
import { eq } from 'drizzle-orm';
import { buildApp } from '../app';
import { db, client } from './db';
import { save as saveTable } from './schema';

// P6.5 acceptance — the vertical slice, run against the live database via Fastify's
// `inject` (no port needed). It plays one fishing life through the real HTTP routes:
// the Eunice supply-contract opportunity surfaces through the information channel,
// the unlabelled decision is fetched and accepted, and the delayed MEMORY
// consequence lands on schedule in the persisted feed. Then it deletes the save it
// created (cascades clean up snapshots, projections, and the feed).
//
// Seed 1's default fishing player is known enough around the market (local social
// capital ≈ 0.52) for the MARKET_NETWORK channel to surface the offer — so the run
// is deterministic. No ANTHROPIC_API_KEY is needed: every entry here is Layer-1.

const SEED = 1;
const CONSEQUENCE_LAG = 6; // months between the choice and its MEMORY (engine constant)
const MAX_MONTHS = 12;

async function main(): Promise<void> {
  const app = buildApp();
  await app.ready();
  let saveId: string | null = null;

  try {
    // POST /saves — begin a fishing life.
    const created = await app.inject({ method: 'POST', url: '/saves', payload: { seed: SEED } });
    if (created.statusCode !== 201) throw new Error(`POST /saves -> ${created.statusCode}: ${created.body}`);
    const cb = created.json() as { saveId: string; monthLabel: string };
    saveId = cb.saveId;
    console.log(`POST /saves        -> 201  save ${saveId}  (${cb.monthLabel})`);

    let decisionId: string | null = null;
    let resolvedMonth: number | null = null;
    let consequenceMonth: number | null = null;

    for (let i = 0; i < MAX_MONTHS; i++) {
      const adv = await app.inject({ method: 'POST', url: `/saves/${saveId}/advance` });
      if (adv.statusCode !== 200) throw new Error(`advance -> ${adv.statusCode}: ${adv.body}`);
      const month = (adv.json() as { month: number }).month;

      // Once the offer is open, fetch the decision and accept it (P6.1–P6.3).
      if (decisionId === null) {
        const opps = (await app.inject({ method: 'GET', url: `/saves/${saveId}/opportunities` })).json() as {
          active: { title: string; decisionId: string | null }[];
        };
        const open = opps.active[0];
        if (open?.decisionId) {
          decisionId = open.decisionId;
          console.log(`month ${month}: GET /opportunities -> OPEN  "${open.title}"`);

          const dec = (await app.inject({ method: 'GET', url: `/saves/${saveId}/decisions/${decisionId}` })).json() as {
            options: { id: string }[];
            status: string;
          };
          if (dec.options.length < 2) throw new Error(`decision has only ${dec.options.length} option(s)`);
          const ids = dec.options.map((o) => o.id);
          if (!ids.includes('ACCEPT')) throw new Error(`decision options ${ids.join(', ')} missing ACCEPT`);
          console.log(`  GET  /decisions  -> ${dec.status}  ${dec.options.length} options: ${ids.join(', ')}`);

          const res = await app.inject({
            method: 'POST',
            url: `/saves/${saveId}/decisions/${decisionId}`,
            payload: { optionId: 'ACCEPT' },
          });
          if (res.statusCode !== 200) throw new Error(`POST /decisions -> ${res.statusCode}: ${res.body}`);
          const ack = (res.json() as { acknowledgement: string }).acknowledgement;
          console.log(`  POST /decisions  -> 200  "${ack}"`);
          resolvedMonth = month;
          consequenceMonth = month + CONSEQUENCE_LAG;

          // The opportunity is no longer a pending offer once resolved.
          const after = (await app.inject({ method: 'GET', url: `/saves/${saveId}/opportunities` })).json() as {
            active: unknown[];
          };
          if (after.active.length !== 0) throw new Error('resolved opportunity still shows as active');
        }
      }

      // Watch the persisted feed for the delayed consequence (a MEMORY mentioning
      // Eunice) at the scheduled month (P6.4). The feed DTO drops the trigger id, so
      // we match on the entry the engine schedules for this save.
      if (consequenceMonth !== null && month === consequenceMonth) {
        const feed = (await app.inject({ method: 'GET', url: `/saves/${saveId}/feed?month=${month}` })).json() as {
          entries: { type: string; text: string }[];
        };
        const memory = feed.entries.find((e) => e.type === 'MEMORY' && e.text.includes('Eunice'));
        if (!memory) throw new Error(`no delayed consequence in the feed at month ${month}`);
        console.log(`month ${month}: GET /feed         -> delayed consequence landed:`);
        console.log(`  "${memory.text.slice(0, 96)}…"`);
      }
    }

    if (decisionId === null) throw new Error('the Eunice opportunity never surfaced');
    if (consequenceMonth === null || consequenceMonth >= MAX_MONTHS) {
      // The loop above only checks up to MAX_MONTHS; make sure we actually reached it.
      throw new Error('did not advance far enough to see the consequence — raise MAX_MONTHS');
    }

    console.log(
      `\n✅ Slice acceptance passed: surface → decision → resolve (month ${resolvedMonth}) → ` +
        `delayed consequence (month ${consequenceMonth}), all through the API + Postgres.`,
    );
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
