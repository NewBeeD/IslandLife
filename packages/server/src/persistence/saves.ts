import { desc, eq } from 'drizzle-orm';
import {
  buildWorld,
  deserializeWorld,
  serializeWorld,
  type CreationChoices,
  type SerializedWorld,
} from '@island/engine';
import type { WorldState } from '@island/shared';
import { db } from './db';
import { ensureReferenceData, projectWorld } from './projection';
import { save, worldSnapshot } from './schema';

export interface CreateSaveOptions {
  population?: number;
  userId?: string;
  // If given, agent #1 is built from the five character-creation forks (the hidden
  // CharacterProfile is hydrated server-side and never leaves the engine).
  choices?: CreationChoices;
  playerName?: string;
}

// Begin a new life: build a seeded world, persist the save row + its month-0
// snapshot in one transaction, and hand back the live world to drive.
export async function createSave(
  seed: number,
  opts: CreateSaveOptions = {},
): Promise<{ saveId: string; world: WorldState }> {
  const world = buildWorld(seed, {
    population: opts.population,
    choices: opts.choices,
    playerName: opts.playerName,
  });
  const state = serializeWorld(world);

  const saveId = await db.transaction(async (tx) => {
    await ensureReferenceData(tx); // seed country/parish FK targets (idempotent)
    const inserted = await tx
      .insert(save)
      .values({
        seed,
        rngState: world.rng.serialize(),
        currentMonth: world.month,
        playerPersonId: null, // set by projectWorld below
        status: 'ALIVE',
        userId: opts.userId ?? null,
      })
      .returning({ id: save.id });
    const row = inserted[0];
    if (!row) throw new Error('createSave: insert returned no row');
    await tx.insert(worldSnapshot).values({ saveId: row.id, month: world.month, state });
    await projectWorld(tx, row.id, world);
    return row.id;
  });

  return { saveId, world };
}

// Resume: deserialize the latest snapshot back into a live entity graph (RNG
// state and all), ready to advance from exactly where it stopped.
export async function loadSave(saveId: string): Promise<{ world: WorldState; currentMonth: number }> {
  const rows = await db
    .select()
    .from(worldSnapshot)
    .where(eq(worldSnapshot.saveId, saveId))
    .orderBy(desc(worldSnapshot.month))
    .limit(1);
  const snap = rows[0];
  if (!snap) throw new Error(`loadSave: no snapshot for save ${saveId}`);
  const world = deserializeWorld(snap.state as SerializedWorld);
  return { world, currentMonth: world.month };
}

// Persist one advanced month: a snapshot row + the save's boundary state, atomic.
export async function saveTick(saveId: string, world: WorldState): Promise<void> {
  const state = serializeWorld(world);
  await db.transaction(async (tx) => {
    await tx
      .insert(worldSnapshot)
      .values({ saveId, month: world.month, state })
      .onConflictDoUpdate({
        target: [worldSnapshot.saveId, worldSnapshot.month],
        set: { state },
      });
    await tx
      .update(save)
      .set({ currentMonth: world.month, rngState: world.rng.serialize() })
      .where(eq(save.id, saveId));
    await projectWorld(tx, saveId, world);
  });
}
