import { describe, expect, it, vi } from 'vitest';
import { buildWorld } from '@island/engine';
import type { NarrativeEntry, WorldState } from '@island/shared';
import { narrativeTypeFor, type GenerateResult, type LLMTrigger } from '@island/narrative';
import { createNarrativeWorker } from '../worker';

function entry(text: string, month: number): NarrativeEntry {
  return { type: 'MEMORY', text, month, triggerId: 'ANNUAL_REFLECTION' };
}

function annualTrigger(): LLMTrigger {
  return { id: 'ANNUAL_REFLECTION', narrativeType: narrativeTypeFor('ANNUAL_REFLECTION'), data: { yearNumber: 1 } };
}

function okResult(world: WorldState): GenerateResult {
  return { entry: entry('a reflection on the year', world.month), usage: null, issues: [], attempts: 1 };
}

describe('narrative worker (P5.3 / P5.4)', () => {
  it('generates off the request path and persists the entry', async () => {
    const persisted: { month: number; entries: NarrativeEntry[] }[] = [];
    const generate = vi.fn(async (_t: LLMTrigger, w: WorldState) => okResult(w));
    const worker = createNarrativeWorker({
      generate,
      persist: async (_id, month, entries) => {
        persisted.push({ month, entries });
      },
    });

    const world = buildWorld(1, { population: 100 });
    world.month = 11;
    worker.enqueue('save-1', world, [annualTrigger()]);
    // The request path does not await — nothing is persisted synchronously.
    expect(persisted).toEqual([]);

    await worker.idle();
    expect(generate).toHaveBeenCalledOnce();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.entries[0]?.triggerId).toBe('ANNUAL_REFLECTION');
  });

  it('rejects an entry that never passes the voice gate without persisting', async () => {
    const persisted: NarrativeEntry[] = [];
    const onReject = vi.fn();
    const worker = createNarrativeWorker({
      generate: async () => ({ entry: null, usage: null, issues: ['bad voice'], attempts: 2 }),
      persist: async (_id, _m, entries) => {
        persisted.push(...entries);
      },
      onReject,
    });

    const world = buildWorld(1, { population: 100 });
    world.month = 11;
    worker.enqueue('save-1', world, [annualTrigger()]);
    await worker.idle();

    expect(persisted).toEqual([]);
    expect(onReject).toHaveBeenCalledOnce();
  });

  it('serves a prefetched entry from cache without a second generation', async () => {
    const generate = vi.fn(async (_t: LLMTrigger, w: WorldState) => okResult(w));
    const persisted: { month: number; entries: NarrativeEntry[] }[] = [];
    const worker = createNarrativeWorker({
      generate,
      persist: async (_id, month, entries) => {
        persisted.push({ month, entries });
      },
    });

    // Idle prefetch a few months out: at month 10, December (month 11) is warmed.
    const world = buildWorld(1, { population: 100 });
    world.month = 10;
    worker.prefetch('save-1', world);
    await worker.idle();
    expect(generate).toHaveBeenCalledOnce();
    expect(persisted).toEqual([]); // prefetch caches, it does not persist

    // The trigger actually fires in December — it must be served from cache.
    world.month = 11;
    worker.enqueue('save-1', world, [annualTrigger()]);
    await worker.idle();

    expect(generate).toHaveBeenCalledOnce(); // still one — the cache hit avoided a call
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.month).toBe(11);
    expect(persisted[0]?.entries[0]?.month).toBe(11);
  });
});
