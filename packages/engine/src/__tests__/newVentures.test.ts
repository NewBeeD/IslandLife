import { describe, expect, it } from 'vitest';
import {
  applyUpgradeFinancing,
  buildWorld,
  hasVentures,
  surfaceOpportunities,
  tradeOperatorCount,
  updatePlayerIncome,
  ventureIncomeLines,
} from '../index';
import type { Industry, NPCAgent, Venture, WorldState } from '@island/shared';

// PHASE 10 — cross-domain new ventures, side hustles, and saturation.

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

function newVentureOf(world: WorldState) {
  return world.opportunities.find((o) => o.kind === 'NEW_VENTURE');
}

describe('P10.1 — cross-domain new ventures earn alongside the existing income', () => {
  it('offers a lecturer a venture outside their trade, and accepting adds a stream', () => {
    // A salaried lecturer (no fishing/Eunice trigger) with cash to spare.
    const world = buildWorld(51, { population: 60 });
    const p = world.player;
    p.occupation = null;
    p.employmentStatus = 'EMPLOYED';
    p.employer = null;
    p.parish = 'SAINT_GEORGE';
    p.socialCapitalLocal = 0.1;
    p.monthlyIncome = 1800; // the salary
    p.cash = 70000; // enough to fund any catalogue venture in full
    world.month = 4;

    surfaceOpportunities(world);
    const opp = newVentureOf(world);
    expect(opp).toBeDefined();
    expect(opp!.newVenture).toBeDefined();
    // Cross-domain: it is not the (nonexistent) trade the lecturer already works.
    expect(opp!.industry).not.toBe('FINANCE');

    // Put the full price down (no loan) and stand the venture up.
    const price = opp!.newVenture!.entryCost;
    applyUpgradeFinancing(world, opp!.decisionId, price, opp!.newVenture!.minTermMonths);

    expect(hasVentures(p)).toBe(true);
    // The salary was carried over as the explicit "venture 0" wage stream…
    expect(p.ventures!.some((v) => v.id === 'VEN_BASE')).toBe(true);
    // …and the new venture earns alongside it.
    expect(p.ventures!.some((v) => v.id !== 'VEN_BASE' && v.industry === opp!.industry)).toBe(true);

    updatePlayerIncome(world);
    expect(p.monthlyIncome).toBeGreaterThan(1800); // salary + the new stream
    expect(opp!.status).toBe('ACCEPTED');
  });
});

describe('P10.2 — a near-free side hustle is always offerable', () => {
  it('offers the low-barrier juice stand even to a near-broke player', () => {
    const world = buildWorld(33, { population: 60 });
    const p = world.player;
    p.occupation = 'FISHING';
    p.employmentStatus = 'SELF_EMPLOYED';
    p.parish = 'SAINT_JOHN';
    p.socialCapitalLocal = 0.1; // no Eunice
    p.experience.fishing = 0.05; // below the upgrade gate — no upgrade offer
    p.cash = 200; // only the cheapest hustle clears its wealth gate
    p.monthlyIncome = 800;
    world.month = 4;

    surfaceOpportunities(world);
    const opp = newVentureOf(world);
    expect(opp).toBeDefined();
    expect(opp!.newVenture!.barrierTier).toBe('LOW');
    // Cross-domain from fishing — a low-barrier hustle in another trade.
    expect(opp!.industry).not.toBe('FISHING');
  });
});

describe('P10.3 — low-barrier ventures saturate as the trade crowds', () => {
  it('income falls as operators crowd in and recovers as they leave (deterministic)', () => {
    const world = buildWorld(77, { population: 30 });
    const p = world.player;
    p.parish = 'SAINT_JOHN';
    p.ventures = [
      makeVenture({
        id: 'V_JUICE',
        industry: 'RETAIL',
        label: 'the juice stand',
        spotBaseIncome: 650,
        barrierTier: 'LOW',
      }),
    ];

    const incomeNow = () => ventureIncomeLines(world)[0]!.amount;
    const baseline = incomeNow();
    expect(baseline).toBeGreaterThan(0);

    // Crowd the same trade in the same parish: clone an NPC into a dozen operators.
    const proto = world.agents.find((a) => !a.isPlayer)!;
    const crowd: NPCAgent[] = Array.from({ length: 12 }, (_, i) => ({
      ...structuredClone({ ...proto, employer: null }),
      id: `CROWD_${i}`,
      isPlayer: false,
      occupation: 'RETAIL' as Industry,
      parish: 'SAINT_JOHN' as NPCAgent['parish'],
      ventures: undefined,
    }));
    world.agents.push(...crowd);

    expect(tradeOperatorCount(world, 'RETAIL', 'SAINT_JOHN')).toBeGreaterThanOrEqual(13);
    const crowded = incomeNow();
    expect(crowded).toBeLessThan(baseline); // saturation thinned the takings

    // They leave — the trade recovers to exactly its uncrowded take (deterministic).
    world.agents = world.agents.filter((a) => !a.id.startsWith('CROWD_'));
    expect(incomeNow()).toBe(baseline);
  });
});

describe('P10.4 — wealth-gated surfacing', () => {
  // A player who already runs every low/medium trade, so the only catalogue venture
  // left is a HIGH-barrier one (the guest rooms, gated on real capital).
  function diversifiedPlayer(seed = 64): WorldState {
    const world = buildWorld(seed, { population: 60 });
    const p = world.player;
    p.parish = 'SAINT_JOHN';
    p.socialCapitalLocal = 0.1;
    p.ventures = (
      ['FISHING', 'AGRICULTURE', 'CONSTRUCTION', 'INFORMAL_TRADE', 'RETAIL', 'TRANSPORTATION'] as Industry[]
    ).map((industry, i) => makeVenture({ id: `V_${i}`, industry, spotBaseIncome: 500 }));
    world.month = 4;
    return world;
  }

  it('hides a high-capital venture while broke and surfaces it once liquid', () => {
    const world = diversifiedPlayer();
    world.player.cash = 0;
    surfaceOpportunities(world);
    expect(newVentureOf(world)).toBeUndefined(); // can't fund it → not offered

    world.player.cash = 20000;
    world.month = 6; // past the new-venture cooldown
    surfaceOpportunities(world);
    const opp = newVentureOf(world);
    expect(opp).toBeDefined();
    expect(opp!.industry).toBe('TOURISM'); // the only trade left, and now affordable
  });
});
