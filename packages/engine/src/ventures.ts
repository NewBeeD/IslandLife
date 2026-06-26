import { GOODS, REPRESENTATIVE_GOOD } from '@island/shared';
import type { NPCAgent, Venture, WorldState } from '@island/shared';
import { clamp } from './rng';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 8 — the venture portfolio (the income spine).
//
// A player can run several concurrent ventures (a boat, a minibus, a juice stand),
// each its own income stream. Monthly income is the sum across active ventures.
// This module is pure (S1) and additive: when an agent has no `ventures` array the
// engine uses the implicit single-stream fields (the Phase 7 path), so an NPC and a
// pre-Phase-8 player are byte-identical and the determinism digest holds (S2).
// ─────────────────────────────────────────────────────────────────────────────

// Spot income swings around its base with the local price (same band as the
// single-stream model in opportunities.ts).
const SPOT_MIN_FACTOR = 0.5;
const SPOT_MAX_FACTOR = 2.0;

// Whether the agent runs an explicit venture portfolio. When false, callers fall
// back to the single-stream fields (the byte-identical pre-Phase-8 path).
export function hasVentures(agent: NPCAgent): boolean {
  return Array.isArray(agent.ventures) && agent.ventures.length > 0;
}

export function activeVentures(agent: NPCAgent): Venture[] {
  return (agent.ventures ?? []).filter((v) => v.status === 'ACTIVE');
}

// One venture's income this month. STANDING is the fixed contract; SPOT reads the
// local market price for the venture's representative good (so seasonality bites,
// scaled by the venture's own output).
function ventureIncome(world: WorldState, parish: NPCAgent['parish'], venture: Venture): number {
  if (venture.incomeMode === 'STANDING' && venture.standingContract) {
    return venture.standingContract.monthlyAmount;
  }
  const goodId = REPRESENTATIVE_GOOD[venture.industry];
  if (!goodId) return 0;
  const good = GOODS.find((g) => g.id === goodId);
  const market = world.markets.find((m) => m.goodId === goodId && m.parish === parish);
  if (!good || !market) return 0;
  const factor = clamp(market.currentPrice / good.basePrice, SPOT_MIN_FACTOR, SPOT_MAX_FACTOR);
  return Math.round(venture.spotBaseIncome * venture.outputScale * factor);
}

// The active ventures' income as labelled lines (for the Money view) and as a sum
// (for `monthlyIncome`). Pure and deterministic; never mutates.
export function ventureIncomeLines(world: WorldState): { label: string; amount: number }[] {
  const p = world.player;
  return activeVentures(p).map((v) => ({ label: v.label, amount: ventureIncome(world, p.parish, v) }));
}

// Sum the player's active ventures into one figure for `monthlyIncome`.
export function aggregateVentureIncome(world: WorldState): number {
  return ventureIncomeLines(world).reduce((s, l) => s + l.amount, 0);
}

// Total monthly operating costs for an agent — summed across active ventures when it
// runs a portfolio, else the single-stream field (0 for NPCs → digest unchanged).
export function totalOperatingCosts(agent: NPCAgent): number {
  if (hasVentures(agent)) {
    return activeVentures(agent).reduce((s, v) => s + v.monthlyOperatingCosts, 0);
  }
  return agent.monthlyOperatingCosts ?? 0;
}
