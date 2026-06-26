import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { buildWorld, simulateOneMonth, worldDigest } from '@island/engine';
import { client, db } from './db';
import { save } from './schema';
import { createSave, loadSave, saveTick } from './saves';

// P2.4 acceptance: persisting and resuming mid-run must be transparent.
// Run a world uninterrupted for TOTAL months; separately run the same seed with a
// save→resume boundary at month BREAK; the two final digests must be identical.
const SEED = 1234;
const POP = 150;
const TOTAL = 24;
const BREAK = 10;

async function main(): Promise<void> {
  // Reference: one uninterrupted run.
  const ref = buildWorld(SEED, { population: POP });
  for (let i = 0; i < TOTAL; i++) simulateOneMonth(ref);
  const refDigest = worldDigest(ref);

  // Persisted run with a real save boundary.
  const { saveId, world } = await createSave(SEED, { population: POP });
  for (let i = 0; i < BREAK; i++) {
    simulateOneMonth(world);
    await saveTick(saveId, world);
  }
  const { world: resumed, currentMonth } = await loadSave(saveId); // fresh from DB
  for (let i = BREAK; i < TOTAL; i++) {
    simulateOneMonth(resumed);
    await saveTick(saveId, resumed);
  }
  const resumedDigest = worldDigest(resumed);

  console.log(`save ${saveId}`);
  console.log(`resumed from month ${currentMonth} (break at ${BREAK}/${TOTAL})`);
  console.log(`reference digest: ${refDigest}`);
  console.log(`resumed   digest: ${resumedDigest}`);
  const pass = refDigest === resumedDigest;
  console.log(pass ? '✓ GOLDEN MASTER PASS — the save boundary is transparent' : '✗ MISMATCH');

  // Clean up this verification save (cascade removes its snapshots).
  await db.delete(save).where(eq(save.id, saveId));

  await client.end();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error('golden master failed:', err instanceof Error ? err.message : err);
  await client.end();
  process.exit(1);
});
