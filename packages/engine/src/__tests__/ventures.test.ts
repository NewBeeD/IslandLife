import { describe, expect, it } from 'vitest';
import {
  activeVentures,
  applyUpgradeFinancing,
  buildWorld,
  deserializeWorld,
  hasVentures,
  serializeWorld,
  simulateOneMonth,
  surfaceOpportunities,
  totalOperatingCosts,
  updatePlayerIncome,
  worldDigest,
} from '../index';
import type { Industry, Venture, WorldState } from '@island/shared';

function makeVenture(over: Partial<Venture> & { id: string; industry: Industry }): Venture {
  return {
    label: over.label ?? `the ${over.industry.toLowerCase()}`,
    incomeMode: 'SPOT',
    spotBaseIncome: 0,
    standingContract: null,
    outputScale: 1,
    monthlyOperatingCosts: 0,
    assets: [],
    status: 'ACTIVE',
    ...over,
  };
}

// A self-employed player carrying two ventures, away from the Eunice trigger.
function twoVenturePlayer(seed = 31): WorldState {
  const world = buildWorld(seed, { population: 60 });
  const p = world.player;
  p.occupation = null;
  p.employmentStatus = 'SELF_EMPLOYED';
  p.parish = 'SAINT_JOHN';
  p.socialCapitalLocal = 0.1; // below the Eunice threshold
  p.cash = 40000;
  p.monthlyIncome = 4000;
  world.month = 4;
  return world;
}

describe('P8.1 — ventures are additive and round-trip', () => {
  it('a player with no ventures is byte-identical to one with an empty array', () => {
    const a = buildWorld(42, { population: 120 });
    const b = buildWorld(42, { population: 120 });
    b.player.ventures = []; // empty → hasVentures false → single-stream path
    for (let i = 0; i < 12; i++) {
      simulateOneMonth(a);
      simulateOneMonth(b);
    }
    expect(worldDigest(b)).toBe(worldDigest(a));
  });

  it('ventures survive a serialize → deserialize round-trip', () => {
    const world = twoVenturePlayer();
    world.player.ventures = [
      makeVenture({ id: 'V_FISH', industry: 'FISHING', incomeMode: 'STANDING', standingContract: { opportunityId: 'X', monthlyAmount: 1000 } }),
      makeVenture({ id: 'V_BUS', industry: 'TRANSPORTATION', monthlyOperatingCosts: 900, outputScale: 1.4 }),
    ];
    const back = deserializeWorld(serializeWorld(world));
    expect(back.player.ventures).toEqual(world.player.ventures);
    expect(hasVentures(back.player)).toBe(true);
  });
});

describe('P8.2 — income aggregates and operating costs sum across ventures', () => {
  it('monthly income is the sum of the active ventures', () => {
    const world = twoVenturePlayer();
    world.player.ventures = [
      makeVenture({ id: 'V_A', industry: 'FISHING', incomeMode: 'STANDING', standingContract: { opportunityId: 'A', monthlyAmount: 1000 } }),
      makeVenture({ id: 'V_B', industry: 'TRANSPORTATION', incomeMode: 'STANDING', standingContract: { opportunityId: 'B', monthlyAmount: 700 } }),
      makeVenture({ id: 'V_C', industry: 'RETAIL', incomeMode: 'STANDING', standingContract: { opportunityId: 'C', monthlyAmount: 300 }, status: 'CLOSED' }),
    ];
    updatePlayerIncome(world);
    expect(world.player.monthlyIncome).toBe(1700); // closed venture does not count
  });

  it('totalOperatingCosts sums active ventures (and is 0 for a no-venture NPC)', () => {
    const world = twoVenturePlayer();
    world.player.ventures = [
      makeVenture({ id: 'V_A', industry: 'FISHING', monthlyOperatingCosts: 450 }),
      makeVenture({ id: 'V_B', industry: 'TRANSPORTATION', monthlyOperatingCosts: 900 }),
    ];
    expect(totalOperatingCosts(world.player)).toBe(1350);
    const npc = world.agents.find((a) => !a.isPlayer)!;
    expect(totalOperatingCosts(npc)).toBe(0);
  });
});

describe('P8.3 — an upgrade targets one venture and leaves the rest untouched', () => {
  it('upgrading the taxi venture does not touch the fishing venture', () => {
    const world = twoVenturePlayer();
    const fishing = makeVenture({ id: 'V_FISH', industry: 'FISHING' });
    const taxi = makeVenture({ id: 'V_BUS', industry: 'TRANSPORTATION' });
    world.player.ventures = [fishing, taxi];
    // Fishing below its gate, transportation past it → only the taxi can upgrade.
    world.player.experience.fishing = 0.05;
    world.player.experience.transportation = 0.3;

    surfaceOpportunities(world);
    const opp = world.opportunities.find((o) => o.kind === 'ASSET_UPGRADE');
    expect(opp).toBeDefined();
    expect(opp!.ventureId).toBe('V_BUS');
    expect(opp!.industry).toBe('TRANSPORTATION');

    applyUpgradeFinancing(world, opp!.decisionId, 10000, 36);

    const t = activeVentures(world.player).find((v) => v.id === 'V_BUS')!;
    const f = activeVentures(world.player).find((v) => v.id === 'V_FISH')!;
    expect(t.assets.length).toBe(1);
    expect(t.outputScale).toBeGreaterThan(1);
    expect(t.monthlyOperatingCosts).toBeGreaterThan(0);
    // The fishing venture is entirely unchanged.
    expect(f.assets.length).toBe(0);
    expect(f.outputScale).toBe(1);
    expect(f.monthlyOperatingCosts).toBe(0);
  });
});

describe('P8.5 — experience accrues to every active venture domain', () => {
  it('two ventures grow two experience domains in one month', () => {
    const world = twoVenturePlayer();
    world.player.ventures = [
      makeVenture({ id: 'V_FISH', industry: 'FISHING' }),
      makeVenture({ id: 'V_BUS', industry: 'TRANSPORTATION' }),
    ];
    world.player.experience.fishing = 0.2;
    world.player.experience.transportation = 0.2;
    world.player.experience.retail = 0.2; // an idle domain — should not grow

    simulateOneMonth(world);

    expect(world.player.experience.fishing).toBeGreaterThan(0.2);
    expect(world.player.experience.transportation).toBeGreaterThan(0.2);
    expect(world.player.experience.retail).toBeLessThanOrEqual(0.2);
  });
});
