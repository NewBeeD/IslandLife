import 'dotenv/config';
import { and, eq, sql } from 'drizzle-orm';
import { simulateOneMonth } from '@island/engine';
import { client, db } from './db';
import { createSave, saveTick } from './saves';
import { company, government, legacyScore, person, save } from './schema';

// P2.5 acceptance: after advancing a few months, the normalized projection answers
// "what is the player's cash?" and "how many firms of each status?" for the
// current month — by querying tables, not the snapshot blob.
async function main(): Promise<void> {
  const { saveId, world } = await createSave(20260101, { population: 150 });
  for (let i = 0; i < 6; i++) {
    simulateOneMonth(world);
    await saveTick(saveId, world);
  }

  const playerRows = await db
    .select({ name: person.name, cash: person.cash, occupation: person.occupation })
    .from(person)
    .where(and(eq(person.saveId, saveId), eq(person.isPlayer, true)));
  const player = playerRows[0];

  const firms = await db
    .select({ status: company.status, n: sql<number>`count(*)::int` })
    .from(company)
    .where(eq(company.saveId, saveId))
    .groupBy(company.status);

  const govRows = await db
    .select({ unemp: government.unemploymentRate })
    .from(government)
    .where(eq(government.saveId, saveId));

  const legacyRows = await db
    .select({ wealth: legacyScore.wealthScore })
    .from(legacyScore)
    .where(eq(legacyScore.saveId, saveId));

  console.log(`save ${saveId} @ month ${world.month}`);
  console.log(`player ${player?.name} (${player?.occupation}): cash EC$${player?.cash}`);
  console.log(`firms: ${firms.map((f) => `${f.status}=${f.n}`).join('  ')}`);
  console.log(`unemployment (projected): ${govRows[0]?.unemp}`);
  console.log(`legacy.wealth (hidden, server-side): ${legacyRows[0]?.wealth}`);

  const ok = player !== undefined && firms.length > 0;
  console.log(ok ? '✓ PROJECTION OK — relational read model is queryable' : '✗ projection missing rows');

  await db.delete(save).where(eq(save.id, saveId)); // clean up
  await client.end();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error('projection check failed:', err instanceof Error ? err.message : err);
  await client.end();
  process.exit(1);
});
