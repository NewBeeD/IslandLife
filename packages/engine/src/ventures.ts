import { GOODS, REPRESENTATIVE_GOOD } from '@island/shared';
import type { Asset, Industry, NPCAgent, ParishId, Venture, WorldState } from '@island/shared';
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

// Saturation (Phase 10, P10.3). A "normal" number of operators a parish trade can
// carry before takings start spreading thin. Above it, each low-barrier operator
// takes a smaller slice; the factor recovers as people leave.
const SATURATION_BASELINE = 5;
const SATURATION_FLOOR = 0.3;

// How many operators work a given trade in a given parish right now — the live agent
// population plus everyone's active ventures in that trade. Recomputed each call
// from world state (S5: an aggregate read, never a hand-edited stock), so it is
// deterministic per seed and rises/falls as the population shifts.
export function tradeOperatorCount(world: WorldState, industry: Industry, parish: ParishId): number {
  let n = 0;
  for (const a of world.agents) {
    if (a.occupation === industry && a.parish === parish) n += 1;
    for (const v of a.ventures ?? []) {
      if (v.status === 'ACTIVE' && v.industry === industry && a.parish === parish) n += 1;
    }
  }
  return n;
}

// The income multiplier a low-barrier venture earns given how crowded its trade is
// in the parish. A lone operator keeps the whole slice (factor 1); the more pile in,
// the thinner it spreads, down to a floor. Deterministic per seed.
function lowBarrierSaturationFactor(world: WorldState, industry: Industry, parish: ParishId): number {
  const operators = tradeOperatorCount(world, industry, parish);
  const crowd = Math.max(0, operators - 1); // the operator themselves does not crowd
  return clamp(SATURATION_BASELINE / (SATURATION_BASELINE + crowd), SATURATION_FLOOR, 1);
}

// One venture's GROSS income this month, before any equity split. STANDING is the
// fixed contract; SPOT reads the local market price for the venture's representative
// good (so seasonality bites, scaled by the venture's own output) and, for a
// LOW-barrier hustle, the parish's crowding (Phase 10). A venture in a trade with no
// representative good earns a flat base (still saturation-scaled if low-barrier).
export function ventureGrossIncome(world: WorldState, parish: ParishId, venture: Venture): number {
  // Phase 15: a wage-work venture earns the grounded day-rate model — dailyRate ×
  // workdays — recomputed from the player's skill each advance (refreshWageRates
  // keeps the stored rate fresh). Takes precedence over spot/standing.
  if (venture.wageProfile) {
    return Math.round(venture.wageProfile.dailyRate * venture.wageProfile.workdaysPerMonth);
  }
  if (venture.incomeMode === 'STANDING' && venture.standingContract) {
    return venture.standingContract.monthlyAmount;
  }
  let factor = 1;
  const goodId = REPRESENTATIVE_GOOD[venture.industry];
  if (goodId) {
    const good = GOODS.find((g) => g.id === goodId);
    const market = world.markets.find((m) => m.goodId === goodId && m.parish === parish);
    if (good && market) {
      factor = clamp(market.currentPrice / good.basePrice, SPOT_MIN_FACTOR, SPOT_MAX_FACTOR);
    }
  }
  const saturation =
    venture.barrierTier === 'LOW' ? lowBarrierSaturationFactor(world, venture.industry, parish) : 1;
  return Math.round(venture.spotBaseIncome * venture.outputScale * factor * saturation);
}

// The player's own share of a venture (Phase 11): 1 minus the outside equity. A
// venture with no `equityHolders` is wholly the player's (share 1, byte-identical).
export function playerShareOf(venture: Venture): number {
  const outside = (venture.equityHolders ?? []).reduce((s, h) => s + h.share, 0);
  return clamp(1 - outside, 0, 1);
}

// The active ventures' income as labelled lines (for the Money view) and as a sum
// (for `monthlyIncome`) — net of any outside equity, so the player sees and banks
// only their own slice (Phase 11). Pure and deterministic; never mutates.
export function ventureIncomeLines(world: WorldState): { label: string; amount: number }[] {
  const p = world.player;
  return activeVentures(p).map((v) => ({
    label: v.label,
    amount: Math.round(ventureGrossIncome(world, p.parish, v) * playerShareOf(v)),
  }));
}

// Pay each venture's outside equity holders their slice of this month's gross income
// (Phase 11, P11.5). A good run pays the backers and lifts the player's local social
// capital a touch; the player keeps only their own share (already netted in
// `ventureIncomeLines`). Additive — a venture with no holders does nothing, so the
// no-Phase-11 path is byte-identical and the digest holds. Mutates backer cash.
export function distributeVentureEquity(world: WorldState): void {
  const p = world.player;
  const byId = new Map(world.agents.map((a) => [a.id, a]));
  for (const v of activeVentures(p)) {
    const holders = v.equityHolders ?? [];
    if (holders.length === 0) continue;
    const gross = ventureGrossIncome(world, p.parish, v);
    if (gross <= 0) continue;
    let paidAny = false;
    for (const h of holders) {
      const backer = byId.get(h.personId);
      if (!backer) continue;
      backer.cash += Math.round(gross * h.share);
      paidAny = true;
    }
    // A venture that paid its backers this month strengthens those ties.
    if (paidAny) p.socialCapitalLocal = clamp(p.socialCapitalLocal + 0.002, 0, 1);
  }
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

// ── Materializing the implicit "venture 0" (Phase 10) ────────────────────────
// Before Phase 10 the player has one income stream, carried on the single-stream
// fields (the Phase 7/8 implicit "venture 0"). When they take their FIRST cross-
// domain venture, that existing stream must keep earning *alongside* the new one —
// so we convert it to an explicit Venture and switch the player onto the portfolio
// model (income = sum of ventures). A no-op once a portfolio already exists.

const BASE_VENTURE_LABEL: Record<Industry, string> = {
  FISHING: 'your fishing',
  AGRICULTURE: 'your farming',
  CONSTRUCTION: 'your construction work',
  INFORMAL_TRADE: 'your trading',
  RETAIL: 'your shop',
  TOURISM: 'your guesthouse',
  TRANSPORTATION: 'your driving',
  FINANCE: 'your job',
};

// The asset class a venture's entry capital buys, used when a financed new venture
// records its starting equipment.
export function ventureAssetType(industry: Industry): Asset['type'] {
  if (industry === 'AGRICULTURE') return 'LAND';
  if (industry === 'FISHING' || industry === 'TRANSPORTATION') return 'VEHICLE';
  return 'EQUIPMENT';
}

// Build the explicit "venture 0" from the player's current single-stream state, or
// null if they have no income stream to carry over (e.g. an unemployed starter).
function baseVentureFromSingleStream(p: NPCAgent): Venture | null {
  if (p.employmentStatus === 'SELF_EMPLOYED' && p.occupation) {
    // A self-employed trade carries its spot/standing footing, its output scaling,
    // its operating costs, and its assets (the upgrade rungs move onto the venture
    // so ownership detection keeps working). netWorth is unchanged (it counts both).
    return {
      id: 'VEN_BASE',
      industry: p.occupation,
      label: BASE_VENTURE_LABEL[p.occupation],
      incomeMode: p.incomeMode ?? 'SPOT',
      spotBaseIncome: p.spotBaseIncome ?? p.monthlyIncome,
      standingContract: p.standingContract ?? null,
      outputScale: p.outputScale ?? 1,
      monthlyOperatingCosts: p.monthlyOperatingCosts ?? 0,
      assets: p.economicAssets.splice(0),
      status: 'ACTIVE',
      // Phase 15: carry a wage worker's day-rate model onto their "venture 0" so the
      // grounded wage survives the move to the portfolio model.
      ...(p.wageProfile ? { wageProfile: { ...p.wageProfile } } : {}),
    };
  }
  if (p.monthlyIncome > 0) {
    // Any other income (a wage) becomes a steady STANDING stream at its current level.
    const industry = p.occupation ?? 'FINANCE';
    return {
      id: 'VEN_BASE',
      industry,
      label: BASE_VENTURE_LABEL[industry],
      incomeMode: 'STANDING',
      spotBaseIncome: 0,
      standingContract: { opportunityId: 'BASE_WAGE', monthlyAmount: Math.round(p.monthlyIncome) },
      outputScale: 1,
      monthlyOperatingCosts: 0,
      assets: [],
      status: 'ACTIVE',
    };
  }
  return null;
}

// Ensure the player runs an explicit venture portfolio so a newly-added venture
// earns alongside the existing income rather than replacing it. The wage/occupation
// is captured as "venture 0"; the employer link is dropped (income now flows through
// the portfolio, summed in updatePlayerIncome). A no-op if a portfolio already runs.
export function ensurePlayerVentures(world: WorldState): void {
  const p = world.player;
  if (hasVentures(p)) return;
  const base = baseVentureFromSingleStream(p);
  p.ventures = base ? [base] : [];
  p.employer = null;
}
