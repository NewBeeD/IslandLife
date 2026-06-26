import type { NarrativeEntry, WorldState } from '@island/shared';
import {
  generateNarrativeEntry,
  predictLikelyTriggers,
  triggerKey,
  type GenerateResult,
  type LLMTrigger,
} from '@island/narrative';
import { appendNarrativeEntries } from '../persistence/narratives';

// Generation + persistence are injected so the worker is unit-testable without the
// Anthropic API or the database. The app wires the real implementations.
export interface NarrativeWorkerDeps {
  generate: (trigger: LLMTrigger, world: WorldState) => Promise<GenerateResult>;
  persist: (saveId: string, month: number, entries: NarrativeEntry[]) => Promise<void>;
  // Optional sink for rejected/failed generations (defaults to console.warn).
  onReject?: (key: string, issues: string[]) => void;
}

// The async narrative worker. `advance` calls `enqueue` and returns immediately —
// the world never pauses for prose (S: the player never waits). LLM entries are
// generated off the request path and appended to the feed, surfacing on a later
// `GET /feed` poll. `prefetch` warms the next few months during idle time so a
// likely upcoming entry can be served from cache the instant its trigger fires.
export interface NarrativeWorker {
  enqueue(saveId: string, world: WorldState, triggers: LLMTrigger[]): void;
  prefetch(saveId: string, world: WorldState, monthsAhead?: number): void;
  // Resolves when every in-flight job has settled. For tests and graceful shutdown;
  // the request path never awaits it.
  idle(): Promise<void>;
}

// A worker that does nothing. Used when no ANTHROPIC_API_KEY is configured (the
// headless gate, local template-only runs) so advancing stays Layer-1 only and
// never reaches for the network.
export const NOOP_NARRATIVE_WORKER: NarrativeWorker = {
  enqueue() {},
  prefetch() {},
  idle: () => Promise.resolve(),
};

export function createNarrativeWorker(deps: NarrativeWorkerDeps): NarrativeWorker {
  const inFlight = new Set<Promise<void>>();
  // Prefetched, validated entries keyed by triggerKey(saveId, forMonth, id),
  // waiting for their trigger to actually fire. A small in-process cache (the
  // doc's NarrativeCacheManager) — fine for a single-process slice.
  const prefetched = new Map<string, NarrativeEntry>();

  const reject =
    deps.onReject ??
    ((key: string, issues: string[]) =>
      console.warn(`[narrative] rejected ${key}: ${issues.join('; ')}`));

  function track(job: Promise<void>): void {
    const wrapped = job
      .catch((err) => {
        console.warn(`[narrative] generation error: ${(err as Error).message}`);
      })
      .finally(() => {
        inFlight.delete(wrapped);
      });
    inFlight.add(wrapped);
  }

  async function generateAndPersist(saveId: string, world: WorldState, trigger: LLMTrigger): Promise<void> {
    const month = world.month;
    const key = triggerKey(saveId, month, trigger.id);

    // Serve a prefetched entry instantly if one is waiting for this trigger.
    const hit = prefetched.get(key);
    if (hit) {
      prefetched.delete(key);
      await deps.persist(saveId, month, [{ ...hit, month }]);
      return;
    }

    const result = await deps.generate(trigger, world);
    if (result.entry) {
      await deps.persist(saveId, month, [result.entry]);
    } else {
      reject(key, result.issues);
    }
  }

  return {
    enqueue(saveId, world, triggers) {
      for (const trigger of triggers) {
        track(generateAndPersist(saveId, world, trigger));
      }
    },

    prefetch(saveId, world, monthsAhead = 3) {
      const likely = predictLikelyTriggers(world, monthsAhead);
      for (const trigger of likely) {
        const forMonth = Number(trigger.data.prefetchForMonth ?? world.month);
        const key = triggerKey(saveId, forMonth, trigger.id);
        if (prefetched.has(key)) continue;
        track(
          deps.generate(trigger, world).then((result) => {
            if (result.entry) prefetched.set(key, { ...result.entry, month: forMonth });
          }),
        );
      }
    },

    idle() {
      return Promise.allSettled([...inFlight]).then(() => undefined);
    },
  };
}
