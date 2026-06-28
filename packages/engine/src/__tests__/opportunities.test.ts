import { describe, expect, it } from 'vitest';
import {
  CONSEQUENCE_LAG_MONTHS,
  DecisionError,
  EUNICE_DECISION_ID,
  EUNICE_OPPORTUNITY_ID,
  EUNICE_OPTION_ACCEPT,
  EUNICE_OPTION_DECLINE,
  buildWorld,
  deserializeWorld,
  detectDueConsequences,
  resolveDecision,
  serializeWorld,
  surfaceOpportunities,
  updatePlayerIncome,
} from '../index';
import type { WorldState } from '@island/shared';

// A fishing player who is known around the market, a few months in — the exact
// position the Eunice supply contract surfaces to (P6.1).
function fishingWorld(seed = 11): WorldState {
  const world = buildWorld(seed, { population: 60 });
  world.player.occupation = 'FISHING';
  world.player.socialCapitalLocal = 0.5;
  world.player.monthlyIncome = 1200;
  world.month = 3;
  return world;
}

// The Eunice supply contract, isolated from the other kinds the same call may also
// surface (Phase 7 upgrades, Phase 10 new ventures). Asserting by kind keeps these
// P6.1 tests about the Eunice information-channel filter specifically.
const eunice = (world: WorldState) =>
  world.opportunities.filter((o) => o.kind === 'EUNICE_SUPPLY_CONTRACT');

describe('P6.1 — opportunity surfacing (information-channel filter)', () => {
  it('surfaces the Eunice contract to a fishing player with enough local capital', () => {
    const world = fishingWorld();
    const surfaced = surfaceOpportunities(world).filter((o) => o.kind === 'EUNICE_SUPPLY_CONTRACT');
    expect(surfaced).toHaveLength(1);
    expect(eunice(world)).toHaveLength(1);
    expect(eunice(world)[0]!.id).toBe(EUNICE_OPPORTUNITY_ID);
    expect(eunice(world)[0]!.status).toBe('OPEN');
    const decision = world.decisions.find((d) => d.id === EUNICE_DECISION_ID);
    expect(decision).toBeDefined();
    expect(decision!.options.length).toBeGreaterThanOrEqual(2);
  });

  it('does not surface to a non-fishing player', () => {
    const world = fishingWorld();
    world.player.occupation = 'RETAIL';
    surfaceOpportunities(world);
    expect(eunice(world)).toHaveLength(0);
  });

  it('does not surface to a fishing player with little local social capital', () => {
    const world = fishingWorld();
    world.player.socialCapitalLocal = 0.1;
    surfaceOpportunities(world);
    expect(eunice(world)).toHaveLength(0);
  });

  it('does not surface in the opening months', () => {
    const world = fishingWorld();
    world.month = 0;
    expect(surfaceOpportunities(world)).toHaveLength(0);
  });

  it('surfaces only once', () => {
    const world = fishingWorld();
    surfaceOpportunities(world);
    const again = surfaceOpportunities(world).filter((o) => o.kind === 'EUNICE_SUPPLY_CONTRACT');
    expect(again).toHaveLength(0);
    expect(eunice(world)).toHaveLength(1);
  });

  it('expires an unanswered opportunity after its window', () => {
    const world = fishingWorld();
    surfaceOpportunities(world);
    const opp = world.opportunities[0]!;
    world.month = opp.surfacedMonth + opp.windowMonths + 1;
    surfaceOpportunities(world);
    expect(world.opportunities[0]!.status).toBe('EXPIRED');
  });
});

describe('P6.3 — resolving the decision feeds back into the simulation', () => {
  it('accepting the contract gives a standing income', () => {
    const world = fishingWorld();
    surfaceOpportunities(world);
    const amount = world.opportunities[0]!.monthlyAmount;
    const decision = resolveDecision(world, EUNICE_DECISION_ID, EUNICE_OPTION_ACCEPT);

    expect(decision.chosenOptionId).toBe(EUNICE_OPTION_ACCEPT);
    expect(decision.resolvedMonth).toBe(world.month);
    expect(decision.consequenceMonth).toBe(world.month + CONSEQUENCE_LAG_MONTHS);
    expect(world.player.incomeMode).toBe('STANDING');
    expect(world.player.standingContract?.monthlyAmount).toBe(amount);
    expect(world.player.monthlyIncome).toBe(amount);
    expect(world.opportunities[0]!.status).toBe('ACCEPTED');
  });

  it('declining keeps spot-selling and captures the spot base', () => {
    const world = fishingWorld();
    surfaceOpportunities(world);
    const before = world.player.monthlyIncome;
    resolveDecision(world, EUNICE_DECISION_ID, EUNICE_OPTION_DECLINE);

    expect(world.player.incomeMode).toBe('SPOT');
    expect(world.player.spotBaseIncome).toBe(before);
    expect(world.player.standingContract).toBeNull();
    expect(world.opportunities[0]!.status).toBe('DECLINED');
  });

  it('standing income holds steady while spot income tracks the market', () => {
    // Two identical worlds; one accepts, one declines. Their income behaviour must
    // diverge over subsequent months — the choice changes the simulation (P6.3).
    const standing = fishingWorld();
    surfaceOpportunities(standing);
    resolveDecision(standing, EUNICE_DECISION_ID, EUNICE_OPTION_ACCEPT);

    const spot = fishingWorld();
    surfaceOpportunities(spot);
    resolveDecision(spot, EUNICE_DECISION_ID, EUNICE_OPTION_DECLINE);

    const fishMarket = (w: WorldState) =>
      w.markets.find((m) => m.goodId === 'FRESH_FISH_LOCAL' && m.parish === w.player.parish)!;

    // A strong fish price: the standing contract pays the same, spot rises above it.
    fishMarket(standing).currentPrice = 8.5 * 1.8;
    fishMarket(spot).currentPrice = 8.5 * 1.8;
    updatePlayerIncome(standing);
    updatePlayerIncome(spot);
    const standAmount = standing.player.standingContract!.monthlyAmount;
    expect(standing.player.monthlyIncome).toBe(standAmount);
    expect(spot.player.monthlyIncome).toBeGreaterThan(standAmount);

    // A poor fish price: spot falls below where the contract would have held it.
    fishMarket(spot).currentPrice = 8.5 * 0.6;
    updatePlayerIncome(spot);
    expect(spot.player.monthlyIncome).toBeLessThan(standAmount);
  });

  it('rejects an unknown decision, a bad option, and a second resolution', () => {
    const world = fishingWorld();
    surfaceOpportunities(world);
    expect(() => resolveDecision(world, 'NOPE', EUNICE_OPTION_ACCEPT)).toThrow(DecisionError);
    expect(() => resolveDecision(world, EUNICE_DECISION_ID, 'WHATEVER')).toThrow(DecisionError);
    resolveDecision(world, EUNICE_DECISION_ID, EUNICE_OPTION_ACCEPT);
    expect(() => resolveDecision(world, EUNICE_DECISION_ID, EUNICE_OPTION_DECLINE)).toThrow(
      /already resolved/,
    );
  });
});

describe('P6.4 — the delayed consequence comes due on schedule', () => {
  it('is detected exactly once, at the scheduled month', () => {
    const world = fishingWorld();
    surfaceOpportunities(world);
    resolveDecision(world, EUNICE_DECISION_ID, EUNICE_OPTION_ACCEPT);
    const due = world.decisions[0]!.consequenceMonth!;

    world.month = due - 1;
    expect(detectDueConsequences(world)).toHaveLength(0);
    world.month = due;
    expect(detectDueConsequences(world)).toHaveLength(1);
    // Marked delivered — never fires twice.
    expect(detectDueConsequences(world)).toHaveLength(0);
  });
});

describe('serialization carries opportunities and decisions', () => {
  it('round-trips an open and a resolved decision', () => {
    const world = fishingWorld();
    surfaceOpportunities(world);
    resolveDecision(world, EUNICE_DECISION_ID, EUNICE_OPTION_ACCEPT);

    const restored = deserializeWorld(serializeWorld(world));
    expect(restored.opportunities).toEqual(world.opportunities);
    expect(restored.decisions).toEqual(world.decisions);
    expect(restored.player.incomeMode).toBe('STANDING');
    expect(restored.player.standingContract).toEqual(world.player.standingContract);
  });
});
