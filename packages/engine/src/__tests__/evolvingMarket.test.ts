import { describe, expect, it } from 'vitest';
import { GOODS } from '@island/shared';
import type { Venture, WorldState } from '@island/shared';
import {
  buildWorld,
  simulateOneMonth,
  tasteDriftMultiplier,
  cultureDemandMultiplier,
  PARISH_CULTURE,
  agePlayerAssets,
  fundResearch,
  researchProjectCost,
  ResearchError,
  BLACK_SWAN_EVENT_IDS,
} from '../index';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 24 — the evolving market (tastes, technology, aging). A24.1 taste drift,
// A24.2 parish culture, A24.3 asset aging & obsolescence, A24.4 R&D, A24.5 black swans.
// ─────────────────────────────────────────────────────────────────────────────

const FISH = 'FRESH_FISH_LOCAL';

describe('P24.1 — consumer taste & trend drift (A21/C13)', () => {
  it('starts exactly neutral at month 0, so a fresh world is byte-identical', () => {
    for (const g of GOODS) {
      expect(tasteDriftMultiplier(42, g.id, 0)).toBe(1);
    }
  });

  it('drifts away from neutral over a long run, deterministically per seed', () => {
    // Some good visibly shifts over the years, and the same seed reproduces it exactly.
    const drifted = GOODS.some((g) => Math.abs(tasteDriftMultiplier(7, g.id, 180) - 1) > 0.1);
    expect(drifted).toBe(true);
    expect(tasteDriftMultiplier(7, FISH, 180)).toBe(tasteDriftMultiplier(7, FISH, 180));
    // A different seed drifts differently (unscripted, seed-specific).
    expect(tasteDriftMultiplier(7, FISH, 180)).not.toBe(tasteDriftMultiplier(8, FISH, 180));
  });

  it('different goods drift differently, so the most profitable trade shifts over time', () => {
    // Rank goods by taste at two distant months; the ordering is not frozen.
    const rankAt = (month: number): string[] =>
      [...GOODS]
        .sort((a, b) => tasteDriftMultiplier(3, b.id, month) - tasteDriftMultiplier(3, a.id, month))
        .map((g) => g.id);
    expect(rankAt(48)).not.toEqual(rankAt(168));
  });
});

describe('P24.2 — culture per parish (A10)', () => {
  it('the same good sells differently across parishes', () => {
    // Fishing is dearer-in-demand in a fishing parish than in the Roseau capital.
    const portsmouth = cultureDemandMultiplier('SAINT_JOHN', 'FISHING');
    const roseau = cultureDemandMultiplier('SAINT_GEORGE', 'FISHING');
    expect(portsmouth).toBeGreaterThan(roseau);
    // Tourism leans the other way — the capital carries the hotels.
    expect(cultureDemandMultiplier('SAINT_GEORGE', 'TOURISM')).toBeGreaterThan(
      cultureDemandMultiplier('SAINT_JOHN', 'TOURISM'),
    );
  });

  it('an unlisted (parish, industry) reads neutral, and biases stay mild', () => {
    expect(cultureDemandMultiplier('SAINT_GEORGE', 'INFORMAL_TRADE')).toBe(1);
    for (const byIndustry of Object.values(PARISH_CULTURE)) {
      for (const mult of Object.values(byIndustry)) {
        expect(mult).toBeGreaterThanOrEqual(0.8);
        expect(mult).toBeLessThanOrEqual(1.25);
      }
    }
  });
});

// A market-driven fishing venture the player runs, with (optionally) tracked equipment.
function giveFishingVenture(world: WorldState, acquiredMonth?: number): Venture {
  const v: Venture = {
    id: 'VEN_FISH',
    industry: 'FISHING',
    label: 'the boat',
    incomeMode: 'SPOT',
    spotBaseIncome: 2000,
    standingContract: null,
    outputScale: 1,
    monthlyOperatingCosts: 300,
    assets: [
      {
        id: 'BOAT',
        type: 'VEHICLE',
        value: 20000,
        monthlyUpkeep: 400,
        ...(acquiredMonth != null ? { acquiredMonth } : {}),
      },
    ],
    status: 'ACTIVE',
  };
  world.player.parish = 'SAINT_JOHN';
  world.player.ventures = [v];
  world.player.cash = 500_000;
  return v;
}

describe('P24.3 — asset aging & obsolescence (A20/A16)', () => {
  it('an un-renewed venture wears down over years: value slides, upkeep creeps, output eases', () => {
    const world = buildWorld(4, { population: 120 });
    const v = giveFishingVenture(world, 0);
    const asset = v.assets[0]!;
    const value0 = asset.value;
    for (let i = 0; i < 72; i++) simulateOneMonth(world);
    expect(asset.value).toBeLessThan(value0);
    expect(asset.monthlyUpkeep!).toBeGreaterThan(400);
    expect(v.outputScale).toBeLessThan(1);
    expect(v.outputScale).toBeGreaterThanOrEqual(0.5); // never below the wear floor
  });

  it('an untracked asset never ages (no acquiredMonth → byte-identical)', () => {
    const world = buildWorld(4, { population: 120 });
    const v = giveFishingVenture(world); // no acquiredMonth
    const asset = v.assets[0]!;
    for (let i = 0; i < 72; i++) simulateOneMonth(world);
    expect(asset.value).toBe(20000);
    expect(asset.monthlyUpkeep).toBe(400);
    expect(v.outputScale).toBe(1);
  });

  it('is a no-op for a default, asset-less player and reproduces per seed', () => {
    const a = buildWorld(11, { population: 120 });
    const b = buildWorld(11, { population: 120 });
    // No tracked assets → aging does nothing and draws nothing.
    expect(() => agePlayerAssets(a)).not.toThrow();
    for (let i = 0; i < 24; i++) simulateOneMonth(a);
    for (let i = 0; i < 24; i++) simulateOneMonth(b);
    expect(a.player.cash).toBe(b.player.cash);
  });
});

describe('P24.4 — R&D with uncertain payoff (A16)', () => {
  it('the same spend yields a spread of seed-reproducible outcomes', () => {
    const tally: Record<string, number> = { NOTHING: 0, INCREMENTAL: 0, BREAKTHROUGH: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      const world = buildWorld(seed, { population: 80 });
      giveFishingVenture(world);
      const r = fundResearch(world, 'VEN_FISH');
      tally[r.outcome] += 1;
    }
    // Mostly nothing, sometimes a little, rarely a lot — all three appear.
    expect(tally.NOTHING).toBeGreaterThan(tally.INCREMENTAL);
    expect(tally.INCREMENTAL).toBeGreaterThan(tally.BREAKTHROUGH);
    expect(tally.BREAKTHROUGH).toBeGreaterThan(0);
  });

  it('reproduces the same outcome for the same seed', () => {
    const run = (): string => {
      const world = buildWorld(5, { population: 80 });
      giveFishingVenture(world);
      return fundResearch(world, 'VEN_FISH').outcome;
    };
    expect(run()).toBe(run());
  });

  it('a hit lifts the venture output for good and charges the cost', () => {
    // Seed chosen so the first draw is a payoff; assert output rose and cash fell.
    let world = buildWorld(2, { population: 80 });
    let v = giveFishingVenture(world);
    // Find a seed whose first research draw pays off, to make the assertion deterministic.
    let seed = 1;
    for (; seed <= 50; seed++) {
      world = buildWorld(seed, { population: 80 });
      v = giveFishingVenture(world);
      const before = v.outputScale;
      const cash0 = world.player.cash;
      const cost = researchProjectCost(world, 'VEN_FISH');
      const r = fundResearch(world, 'VEN_FISH');
      expect(world.player.cash).toBe(cash0 - cost);
      if (r.outcome !== 'NOTHING') {
        expect(v.outputScale).toBeGreaterThan(before);
        break;
      }
    }
    expect(seed).toBeLessThanOrEqual(50);
  });

  it('refuses with no venture or no money', () => {
    const world = buildWorld(1, { population: 80 });
    expect(() => fundResearch(world, 'NOPE')).toThrow(ResearchError);
    const v = giveFishingVenture(world);
    world.player.cash = 0;
    expect(() => fundResearch(world, v.id)).toThrow(ResearchError);
  });
});

describe('P24.5 — black swans (A7)', () => {
  it('fire rarely over a long run, and reproduce per seed', () => {
    const sawSwan = (seed: number): boolean => {
      const w = buildWorld(seed, { population: 120 });
      let seen = false;
      for (let i = 0; i < 240; i++) {
        simulateOneMonth(w);
        if (w.events.some((e) => BLACK_SWAN_EVENT_IDS.has(e.definitionId))) seen = true;
      }
      return seen;
    };
    // Across a spread of seeds, a black swan lands at least once over a twenty-year game.
    expect([1, 2, 3, 4, 5, 6, 7, 8].some((s) => sawSwan(s))).toBe(true);
    // Deterministic per seed (rolled off a (seed, month) side-stream).
    expect(sawSwan(3)).toBe(sawSwan(3));
  });

  it('a live pandemic/spill feeds the macro web (propagates the blow)', () => {
    // Force a severe pandemic and advance the macro a few steps; the logistics squeeze lifts.
    const w = buildWorld(5, { population: 120 });
    w.events.push({
      id: 'PANDEMIC_test',
      definitionId: 'PANDEMIC',
      severity: 0.9,
      startedMonth: 0,
      durationRemaining: 8,
      affectedIndustries: ['TOURISM', 'RETAIL', 'TRANSPORTATION', 'FISHING'],
    });
    simulateOneMonth(w);
    simulateOneMonth(w);
    expect(w.macro.supplyDisruption).toBeGreaterThan(0.3);
    expect(w.macro.inputCostPressure).toBeGreaterThan(1.02);
  });
});
