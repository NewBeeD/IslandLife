import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { simulateOneMonth, type CreationChoices } from '@island/engine';
import {
  captureTriggerSnapshot,
  detectTriggers,
  generateMonthlyEntries,
  generateNarrativeEntry,
} from '@island/narrative';
import { gameDateLabel } from '@island/shared';
import type { AdvanceResultDTO, CreateSaveResultDTO, WorldState } from '@island/shared';
import { createSave, loadSave, saveTick } from './persistence/saves';
import { appendNarrativeEntries, loadFeed, saveNarrativeEntries } from './persistence/narratives';
import {
  createNarrativeWorker,
  NOOP_NARRATIVE_WORKER,
  type NarrativeWorker,
} from './narrative/worker';
import {
  toCommunityDTO,
  toFeedDTO,
  toMoneyDTO,
  toOpportunitiesDTO,
  toStateDTO,
} from './projection';

interface CreateSaveBody {
  seed?: number;
  creationChoices?: CreationChoices;
  playerName?: string;
}

function defaultSeed(): number {
  const env = process.env.WORLD_DEFAULT_SEED;
  if (env && Number.isFinite(Number(env))) return Number(env);
  return Math.floor(Math.random() * 1_000_000_000);
}

// A quiet, in-voice line marking the turn of the month. No mechanics — it reads
// like the top of a page in the player's life, not a system message.
function transitionBlurb(world: WorldState): string {
  return `The calendar turns to ${gameDateLabel(world.month)}.`;
}

// Load a save's world or send a 404. Returns null when it has answered the reply,
// so handlers can `if (!world) return;` and stop.
async function loadOr404(
  id: string,
  reply: FastifyReply,
): Promise<{ world: WorldState; currentMonth: number } | null> {
  try {
    return await loadSave(id);
  } catch {
    await reply.code(404).send({ error: `save ${id} not found` });
    return null;
  }
}

// Choose the narrative worker. Layer-2 (Claude) generation only runs when an
// ANTHROPIC_API_KEY is configured — otherwise the app stays Layer-1 (template)
// only, so the headless gate and template-only local runs never reach the network.
function defaultNarrativeWorker(): NarrativeWorker {
  if (!process.env.ANTHROPIC_API_KEY) return NOOP_NARRATIVE_WORKER;
  return createNarrativeWorker({
    generate: (trigger, world) => generateNarrativeEntry(trigger, world),
    persist: appendNarrativeEntries,
  });
}

export interface BuildAppOptions {
  // Inject a worker (tests, or a future Redis/BullMQ-backed implementation).
  narrativeWorker?: NarrativeWorker;
}

// The Fastify API. Every response is a projected DTO (the iceberg boundary). The
// app is built without listening so tests and the entry point can share it.
export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const narrativeWorker = opts.narrativeWorker ?? defaultNarrativeWorker();

  // POST /saves — begin a life. Runs the five forks server-side, hydrates agent #1,
  // builds the world, persists month 0. The hidden CharacterProfile is NOT returned.
  app.post<{ Body: CreateSaveBody }>('/saves', async (req, reply) => {
    const body = req.body ?? {};
    const seed = body.seed ?? defaultSeed();
    const { saveId, world } = await createSave(seed, {
      choices: body.creationChoices,
      playerName: body.playerName,
    });
    const result: CreateSaveResultDTO = {
      saveId,
      month: world.month,
      monthLabel: gameDateLabel(world.month),
    };
    return reply.code(201).send(result);
  });

  // GET /saves/:id/state — the header bar.
  app.get<{ Params: { id: string } }>('/saves/:id/state', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    return toStateDTO(req.params.id, loaded.world);
  });

  // GET /saves/:id/money — the Money view.
  app.get<{ Params: { id: string } }>('/saves/:id/money', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    return toMoneyDTO(loaded.world);
  });

  // GET /saves/:id/feed?month= — the Daily Life feed (defaults to the latest month).
  app.get<{ Params: { id: string }; Querystring: { month?: string } }>(
    '/saves/:id/feed',
    async (req, reply) => {
      const loaded = await loadOr404(req.params.id, reply);
      if (!loaded) return;
      const month =
        req.query.month != null && req.query.month !== ''
          ? Number(req.query.month)
          : loaded.currentMonth;
      const entries = await loadFeed(req.params.id, month);
      return toFeedDTO(month, entries);
    },
  );

  // GET /saves/:id/community — relationships + reputation as prose.
  app.get<{ Params: { id: string } }>('/saves/:id/community', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    return toCommunityDTO(loaded.world);
  });

  // GET /saves/:id/opportunities — only what the player has heard of (empty pre-P6).
  app.get<{ Params: { id: string } }>('/saves/:id/opportunities', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    return toOpportunitiesDTO(loaded.world);
  });

  // POST /saves/:id/advance — advance one month. Runs simulateOneMonth, fires the
  // Layer-1 template narrative synchronously, persists both, and returns the
  // transition blurb plus the immediately-available feed. The world never pauses
  // for prose — Layer-2 (Claude) entries are enqueued and polled later (Phase 5).
  app.post<{ Params: { id: string } }>('/saves/:id/advance', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    const { world } = loaded;

    // Snapshot the pre-advance world so post-advance trigger detection can see
    // transitions (a new business, a freshly-formed storm).
    const snapshot = captureTriggerSnapshot(world);

    simulateOneMonth(world);
    const entries = generateMonthlyEntries(world);

    await saveTick(req.params.id, world);
    await saveNarrativeEntries(req.params.id, world.month, entries);

    // Layer 2: detect significant-event triggers and hand them to the async worker.
    // The world never pauses for prose — these entries are generated off the
    // request path and surface on a later `GET /feed` poll. Then warm the next few
    // months' likely entries during this idle moment.
    const triggers = detectTriggers(world, snapshot);
    narrativeWorker.enqueue(req.params.id, world, triggers);
    narrativeWorker.prefetch(req.params.id, world);

    const result: AdvanceResultDTO = {
      month: world.month,
      monthLabel: gameDateLabel(world.month),
      blurb: transitionBlurb(world),
      feed: toFeedDTO(world.month, entries).entries,
    };
    return result;
  });

  return app;
}
