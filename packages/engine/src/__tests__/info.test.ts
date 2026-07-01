import { describe, expect, it } from 'vitest';
import type { Venture, WorldState } from '@island/shared';
import {
  buildWorld,
  buyCompetitorScout,
  buyMarketResearch,
  competitorRead,
  decayInformation,
  forecastVenture,
  InfoError,
  isScouted,
  playerForecasts,
  researchLevelOf,
  simulateOneMonth,
  updatePlayerIncome,
  ventureGrossIncome,
  worldDigest,
} from '../index';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 22 — the information economy & imperfect information (C2, C14, A1).
// ─────────────────────────────────────────────────────────────────────────────

// A market-driven fishing venture for the player, so there is something to forecast.
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
  const p = world.player;
  p.parish = 'SAINT_JOHN';
  p.ventures = [v];
  return v;
}

describe('Phase 22 — forecasts as ranges (P22.1)', () => {
  it('a forecast is a range, not a point, and is deterministic per seed', () => {
    const world = buildWorld(42, { population: 120 });
    const v = giveFishingVenture(world);
    simulateOneMonth(world);

    const a = forecastVenture(world, v, researchLevelOf(world.player));
    const b = forecastVenture(world, v, researchLevelOf(world.player));
    expect(a).not.toBeNull();
    expect(a!.low).toBeLessThan(a!.high);
    expect(a).toEqual(b); // pure — same state, same band
  });

  it('the true outcome lands inside the band most of the time, but not always', () => {
    // Forecast a fishing venture's take, advance a season, and check the realised take
    // lands in the band. Across many seeds this should hold most of the time — but not
    // always (a forecast is an edge, not an oracle, C14).
    const HORIZON = 3;
    let hits = 0;
    let total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const world = buildWorld(seed, { population: 120 });
      const v = giveFishingVenture(world);
      // Settle a few months so prices/macro are live, then forecast.
      for (let i = 0; i < 4; i++) {
        updatePlayerIncome(world);
        simulateOneMonth(world);
      }
      const forecast = forecastVenture(world, v, 0); // unaided read — a wide, honest band
      if (!forecast) continue;
      // Advance the horizon along the real advance path (perf resamples each month).
      for (let i = 0; i < HORIZON; i++) {
        updatePlayerIncome(world);
        simulateOneMonth(world);
      }
      const realised = ventureGrossIncome(world, world.player.parish, v);
      total += 1;
      if (realised >= forecast.low && realised <= forecast.high) hits += 1;
    }
    expect(total).toBeGreaterThan(20);
    const rate = hits / total;
    // Most of the time…
    expect(rate).toBeGreaterThan(0.55);
    // …but not a certainty.
    expect(rate).toBeLessThan(1);
  });

  it('the informed player has a tighter, still-honest read — a measurable edge (A1)', () => {
    // Across many seeds: the informed forecast (bought research) is strictly narrower
    // than the unaided one, yet still contains the realised take at a good rate — so the
    // player who pays for information decides against a sharper picture, not a worse one.
    const HORIZON = 3;
    let narrower = 0;
    let informedHits = 0;
    let total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const world = buildWorld(seed, { population: 120 });
      const v = giveFishingVenture(world);
      world.player.cash = 50000;
      for (let i = 0; i < 4; i++) {
        updatePlayerIncome(world);
        simulateOneMonth(world);
      }
      const wide = forecastVenture(world, v, 0)!;
      buyMarketResearch(world);
      const sharp = forecastVenture(world, v, researchLevelOf(world.player))!;
      if (sharp.high - sharp.low < wide.high - wide.low) narrower += 1;
      for (let i = 0; i < HORIZON; i++) {
        updatePlayerIncome(world);
        simulateOneMonth(world);
      }
      const realised = ventureGrossIncome(world, world.player.parish, v);
      if (realised >= sharp.low && realised <= sharp.high) informedHits += 1;
      total += 1;
    }
    expect(narrower).toBe(total); // strictly tighter every time
    expect(informedHits / total).toBeGreaterThan(0.4); // still a useful, honest read
  });

  it('buying market research narrows the forecast band', () => {
    const world = buildWorld(7, { population: 120 });
    const v = giveFishingVenture(world);
    simulateOneMonth(world);

    const wide = forecastVenture(world, v, 0)!;
    const widthWide = wide.high - wide.low;

    buyMarketResearch(world);
    expect(researchLevelOf(world.player)).toBeGreaterThan(0);
    const sharp = forecastVenture(world, v, researchLevelOf(world.player))!;
    const widthSharp = sharp.high - sharp.low;

    expect(widthSharp).toBeLessThan(widthWide);
  });
});

describe('Phase 22 — buying information (P22.2)', () => {
  it('research charges cash, raises the read, and then decays as it goes stale', () => {
    const world = buildWorld(3, { population: 120 });
    giveFishingVenture(world);
    world.player.cash = 50000;
    simulateOneMonth(world);

    const before = world.player.cash;
    const { cost } = buyMarketResearch(world);
    expect(cost).toBeGreaterThan(0);
    expect(world.player.cash).toBe(before - cost);
    const fresh = researchLevelOf(world.player);
    expect(fresh).toBeGreaterThan(0);

    decayInformation(world);
    expect(researchLevelOf(world.player)).toBeLessThan(fresh);
  });

  it('a competitor scout buys a read that is fresh for a season then goes cold', () => {
    const world = buildWorld(9, { population: 120 });
    giveFishingVenture(world);
    world.player.cash = 50000;
    simulateOneMonth(world);

    expect(competitorRead(world)).not.toBeNull();
    expect(isScouted(world.player, world.month)).toBe(false);
    buyCompetitorScout(world);
    expect(isScouted(world.player, world.month)).toBe(true);

    // Age past the scout's freshness window and it goes cold.
    for (let i = 0; i < 6; i++) {
      decayInformation(world);
      world.month += 1;
    }
    expect(isScouted(world.player, world.month)).toBe(false);
  });

  it('refuses to sell information the player cannot afford or does not need', () => {
    const world = buildWorld(5, { population: 120 });
    // No forecastable income → nothing to sell.
    world.player.ventures = [];
    world.player.incomeMode = 'STANDING';
    expect(() => buyMarketResearch(world)).toThrow(InfoError);

    giveFishingVenture(world);
    world.player.cash = 0;
    expect(() => buyMarketResearch(world)).toThrow(InfoError);
  });

  it('only a player with market-driven income has anything to forecast', () => {
    const world = buildWorld(11, { population: 120 });
    // A standing-contract venture is a known figure — nothing to forecast.
    world.player.parish = 'SAINT_JOHN';
    world.player.ventures = [
      {
        id: 'VEN_STANDING',
        industry: 'FISHING',
        label: 'the contract',
        incomeMode: 'STANDING',
        spotBaseIncome: 0,
        standingContract: { opportunityId: 'X', monthlyAmount: 1800 },
        outputScale: 1,
        monthlyOperatingCosts: 0,
        assets: [],
        status: 'ACTIVE',
      },
    ];
    expect(playerForecasts(world)).toHaveLength(0);
  });
});

describe('Phase 22 — determinism & digest neutrality (S2)', () => {
  it('a player who never buys information leaves the digest byte-identical', () => {
    const run = (): number => {
      const world = buildWorld(42, { population: 200 });
      for (let i = 0; i < 18; i++) simulateOneMonth(world);
      return worldDigest(world);
    };
    // The Phase 22 wiring (decayInformation) is a no-op without a purchase.
    expect(run()).toBe(run());
  });

  it('decayInformation is a no-op for a player with no information ledger', () => {
    const world = buildWorld(1, { population: 120 });
    expect(world.player.information).toBeUndefined();
    decayInformation(world);
    expect(world.player.information).toBeUndefined();
  });
});
