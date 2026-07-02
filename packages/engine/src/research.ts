import type { Venture, WorldState } from '@island/shared';
import { clamp } from './rng';
import { activeVentures, ventureGrossIncome } from './ventures';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 24.4 — R&D with uncertain payoff (A16).
//
// An optional action: sink money into improving one of the player's ventures — a better
// process, a new product line, a smarter way of working — for a *probability distribution*
// of outcomes, never a guaranteed return. Most of the time the money buys nothing. Often
// it buys a modest, real improvement. Rarely it lands a breakthrough that lifts the
// venture's output for good. Innovation isn't guaranteed (A16): the same spend, run again
// on a different seed, comes out differently — but it is seed-reproducible (S2), since the
// single outcome draw goes through world.rng like every other engine draw.
//
// This is a command-layer action (the player chooses to fund it), not part of the monthly
// tick — so it draws world.rng only when actually invoked, and the determinism digest of a
// player who never funds research is untouched. The payoff lands on the venture's
// `outputScale`, so a breakthrough is renewed value that then ages like any other (P24.3).
// ─────────────────────────────────────────────────────────────────────────────

export type ResearchOutcome = 'NOTHING' | 'INCREMENTAL' | 'BREAKTHROUGH';

export interface ResearchResult {
  outcome: ResearchOutcome;
  cost: number;
  ventureId: string;
  outputGain: number; // the outputScale delta applied (0 on NOTHING)
  message: string; // player-facing prose (never the raw odds or magnitudes — the iceberg)
}

export class ResearchError extends Error {
  constructor(
    message: string,
    readonly code: 'NO_VENTURE' | 'NO_CASH',
  ) {
    super(message);
    this.name = 'ResearchError';
  }
}

// The documented outcome distribution (A16 — mostly nothing, sometimes a little, rarely a
// lot). The cumulative thresholds a single uniform draw is bucketed against.
const P_NOTHING = 0.55; // u < 0.55            → nothing to show for it
const P_INCREMENTAL = 0.95; // 0.55 ≤ u < 0.95 → a modest, real gain
//                             u ≥ 0.95         → a breakthrough
const INCREMENTAL_GAIN: [number, number] = [0.03, 0.1];
const BREAKTHROUGH_GAIN: [number, number] = [0.25, 0.5];

// R&D is real investment, priced off the venture's monthly takings within a sane band —
// dearer than a market-research read (Phase 22), because it buys a *chance* at lasting
// output, not just a sharper forecast.
const COST_FRACTION = 1.25;
const COST_FLOOR = 500;
const COST_CEIL = 8000;

function findActiveVenture(world: WorldState, ventureId: string): Venture {
  const v = activeVentures(world.player).find((x) => x.id === ventureId);
  if (!v) {
    throw new ResearchError('There is no running venture of yours to put research into.', 'NO_VENTURE');
  }
  return v;
}

// What funding a research project on a given venture costs this month. Priced off the
// venture's current gross so a bigger operation's research costs more.
export function researchCost(world: WorldState, ventureId: string): number {
  const v = findActiveVenture(world, ventureId);
  const gross = ventureGrossIncome(world, world.player.parish, v);
  return clamp(Math.round(gross * COST_FRACTION), COST_FLOOR, COST_CEIL);
}

// Fund a research project on one of the player's ventures (P24.4). Charges the cost and
// draws a single seed-reproducible outcome from the documented distribution; on a hit the
// venture's output rises for good. Refuses when there is no venture or the player cannot
// afford it. Draws world.rng, so it stays reproducible per seed (S2). Mutates player cash
// and the venture's output.
export function fundResearch(world: WorldState, ventureId: string): ResearchResult {
  const v = findActiveVenture(world, ventureId);
  const cost = researchCost(world, ventureId);
  const p = world.player;
  if (p.cash < cost) {
    throw new ResearchError('You do not have the money to fund that research just now.', 'NO_CASH');
  }
  p.cash -= cost;

  const u = world.rng.next();
  if (u < P_NOTHING) {
    return {
      outcome: 'NOTHING',
      cost,
      ventureId,
      outputGain: 0,
      message: 'The work led nowhere this time — the money is gone with nothing to show for it.',
    };
  }
  if (u < P_INCREMENTAL) {
    const gain = world.rng.range(INCREMENTAL_GAIN[0], INCREMENTAL_GAIN[1]);
    v.outputScale += gain;
    return {
      outcome: 'INCREMENTAL',
      cost,
      ventureId,
      outputGain: gain,
      message: 'A small refinement paid off — the venture works a little better than it did.',
    };
  }
  const gain = world.rng.range(BREAKTHROUGH_GAIN[0], BREAKTHROUGH_GAIN[1]);
  v.outputScale += gain;
  return {
    outcome: 'BREAKTHROUGH',
    cost,
    ventureId,
    outputGain: gain,
    message: 'Something really came together — a breakthrough that lifts the venture well above where it was.',
  };
}
