import { describe, expect, it } from 'vitest';
import { buildWorld, buyCompetitorScout, buyMarketResearch, simulateOneMonth } from '@island/engine';
import type { Venture, WorldState } from '@island/shared';
import { toMoneyDTO } from '../projection/money';

// Phase 22 — the information economy on the money view (P22.1/P22.3): forecasts reach
// the player as ranges framed in voice, and the offer to buy a sharper read; the hidden
// research level / true projection never crosses the wire (S3).

function giveFishingVenture(world: WorldState): Venture {
  const v: Venture = {
    id: 'VEN_TEST',
    industry: 'FISHING',
    label: 'the boat',
    incomeMode: 'SPOT',
    spotBaseIncome: 2000,
    standingContract: null,
    outputScale: 1,
    monthlyOperatingCosts: 300,
    assets: [],
    status: 'ACTIVE',
    profile: { successBias: 1, volatility: 0.18 },
    performanceFactor: 1,
  };
  world.player.parish = 'SAINT_JOHN';
  world.player.cash = 50000;
  world.player.ventures = [v];
  return v;
}

describe('P22.1/P22.3 — forecasts on the money view', () => {
  it('surfaces a market-driven venture forecast as a range, not a point', () => {
    const w = buildWorld(7, { population: 120 });
    giveFishingVenture(w);
    simulateOneMonth(w);

    const money = toMoneyDTO(w);
    expect(money.forecasts && money.forecasts.length).toBeGreaterThan(0);
    const f = money.forecasts![0]!;
    expect(f.low).toBeLessThan(f.high);
    expect(f.label).toBe('the boat');
    // A hedged, in-voice summary — never a bare stat.
    expect(f.summary.length).toBeGreaterThan(20);
  });

  it('offers to buy a sharper read; a bought read narrows the band', () => {
    const w = buildWorld(7, { population: 120 });
    giveFishingVenture(w);
    simulateOneMonth(w);

    const before = toMoneyDTO(w);
    expect(before.information).toBeDefined();
    expect(before.information!.researchCost).toBeGreaterThan(0);
    const wideBand = before.forecasts![0]!;

    buyMarketResearch(w);
    const after = toMoneyDTO(w);
    const sharpBand = after.forecasts![0]!;
    expect(sharpBand.high - sharpBand.low).toBeLessThan(wideBand.high - wideBand.low);
  });

  it('shows the competitor read only after a scout, and never a raw research level', () => {
    const w = buildWorld(9, { population: 120 });
    giveFishingVenture(w);
    simulateOneMonth(w);

    expect(toMoneyDTO(w).information!.scouted).toBeUndefined();
    buyCompetitorScout(w);
    const scouted = toMoneyDTO(w).information!.scouted;
    expect(scouted).toBeDefined();
    expect(scouted!.toLowerCase()).toContain('trade');

    // The whole information block leaks no raw research level or scout month.
    const json = JSON.stringify(toMoneyDTO(w).information);
    expect(json).not.toContain('researchLevel');
    expect(json).not.toContain('scoutedUntilMonth');
  });

  it('offers nothing to a player with only fixed income (nothing to forecast)', () => {
    const w = buildWorld(3, { population: 120 });
    // A default single-stream player at month 0 has no market-driven venture.
    const money = toMoneyDTO(w);
    expect(money.forecasts ?? []).toHaveLength(0);
    expect(money.information).toBeUndefined();
  });
});
