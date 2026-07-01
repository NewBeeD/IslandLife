import {
  FULL_TIME_LOAD,
  GOODS,
  JUICE_STAND,
  JUICE_STAND_REFERENCE_REVENUE,
  OPERATOR_SHARE,
  REPRESENTATIVE_GOOD,
  SHELVED_UPKEEP_FACTOR,
  VENTURE_PERF_CEIL,
  VENTURE_PERF_FLOOR,
  VENTURE_TIME_LOAD,
} from '@island/shared';
import type {
  Asset,
  BarrierTier,
  Industry,
  MacroState,
  NPCAgent,
  ParishId,
  Venture,
  VentureProfile,
  WorldState,
} from '@island/shared';
import { clamp } from './rng';
import { supplyChainCostMultiplier } from './supply';

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
  // A shelved or wound-down venture earns nothing (Phase 17, P17.4).
  if (venture.status !== 'ACTIVE') return 0;
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
  // Phase 17 (P17.3/P17.4): the month's sampled performance multiplier — randomized
  // sales (the juice stand) and the venture's good/bad-season swing. Stored on the
  // venture by refreshVenturePerformance on each advance, so this read is pure and
  // deterministic; undefined → 1 (a flat, byte-identical venture).
  const perf = venture.performanceFactor ?? 1;
  // Phase 21 (A19): customer-side reputation shadows demand after a scandal and recovers
  // only slowly. 1 (or undefined) is a clean name at full demand, so an un-scandalised
  // venture is byte-identical.
  const custRep = venture.customerReputation ?? 1;
  return Math.round(
    venture.spotBaseIncome * venture.outputScale * factor * saturation * perf * custRep,
  );
}

// The share of a venture's gross the player actually banks after a hired operator's
// cut (Phase 17, P17.1). A player-run venture keeps the whole of the player's slice;
// one run by an operator pays the operator their share. Composes with outside equity.
export function operatorCutShare(venture: Venture): number {
  return venture.operatedBy === 'OPERATOR' ? venture.operatorShare ?? OPERATOR_SHARE : 0;
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
    // The player banks their equity slice of the takings, net of any hired operator's
    // cut (Phase 17, P17.1).
    amount: Math.round(
      ventureGrossIncome(world, p.parish, v) * playerShareOf(v) * (1 - operatorCutShare(v)),
    ),
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

// The fuel/upkeep cost of each of an agent's running (or shelved) ventures, as a
// labelled line (Phase 17). Upkeep attributed to a physical asset (`monthlyUpkeep`)
// is counted once even when two ventures share that asset, so one truck → one fuel
// line, two trucks → two (P17.2, idea 15). Venture-level operating costs (a juice
// stand's fruit & sugar, which are not tied to one asset) add on top. A shelved
// venture pays only a fraction of its upkeep, the work having stopped (P17.4).
// Phase 23: when `macro` is supplied, each line's upkeep is scaled by its trade's
// scarce-input cost multiplier (a fragile, import-heavy chain feels a boom/disruption
// most). Omitting `macro` — or a calm economy — leaves the amounts byte-identical, so
// the pre-P23 path and every existing test are untouched.
export function ventureOperatingCostLines(
  agent: NPCAgent,
  macro?: MacroState,
): { ventureId: string; label: string; amount: number; shelved: boolean }[] {
  const lines: { ventureId: string; label: string; amount: number; shelved: boolean }[] = [];
  const seenAssets = new Set<string>();
  for (const v of agent.ventures ?? []) {
    if (v.status === 'CLOSED') continue;
    const factor = v.status === 'SHELVED' ? SHELVED_UPKEEP_FACTOR : 1;
    const scarcity = supplyChainCostMultiplier(macro, v.industry);
    let amount = v.monthlyOperatingCosts;
    for (const a of v.assets) {
      if (a.monthlyUpkeep != null && !seenAssets.has(a.id)) {
        seenAssets.add(a.id);
        amount += a.monthlyUpkeep;
      }
    }
    lines.push({
      ventureId: v.id,
      label: v.label,
      amount: Math.round(amount * factor * scarcity),
      shelved: v.status === 'SHELVED',
    });
  }
  return lines;
}

// Total monthly operating costs for an agent — summed across its ventures with shared
// assets de-duplicated (P17.2), else the single-stream field (0 for NPCs → digest
// unchanged). Phase 23: with `macro` supplied the costs carry this month's scarce-input
// squeeze — venture upkeep by each trade's chain fragility, the single-stream field by
// the player's occupation. Byte-identical without `macro` or in a calm economy.
export function totalOperatingCosts(agent: NPCAgent, macro?: MacroState): number {
  if (hasVentures(agent)) {
    return ventureOperatingCostLines(agent, macro).reduce((s, l) => s + l.amount, 0);
  }
  const base = agent.monthlyOperatingCosts ?? 0;
  if (base === 0 || !macro || !agent.occupation) return base;
  return Math.round(base * supplyChainCostMultiplier(macro, agent.occupation));
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
      // Phase 17 (P17.1): a Phase 16 full-time job fills the working day. Carry that
      // onto the base venture so a side venture forces a real time choice.
      ...(p.currentJob ? { timeLoad: FULL_TIME_LOAD, operatedBy: 'PLAYER' as const } : {}),
    };
  }
  return null;
}

// ── Time budget & commitment (Phase 17, P17.1) ───────────────────────────────
// A working life is one unit of time. A hands-on venture takes a slice of it; a
// venture run by a hired operator takes none (it is passive). A full-time job fills
// the day, so a side venture forces a real choice: stay, switch, or hire an operator.

// The slice of the player's time a single venture takes right now. A hired (passive)
// venture takes none; an untracked venture (no timeLoad) takes none either.
export function ventureTimeLoad(v: Venture): number {
  if (v.operatedBy === 'OPERATOR') return 0;
  return v.timeLoad ?? 0;
}

// How much of the player's working time their active hands-on ventures take together.
export function committedTime(agent: NPCAgent): number {
  return activeVentures(agent).reduce((s, v) => s + ventureTimeLoad(v), 0);
}

// The working time the player has left for a new hands-on venture (0–1).
export function freeTime(agent: NPCAgent): number {
  return Math.max(0, FULL_TIME_LOAD - committedTime(agent));
}

// The free time the player WOULD have once a new venture is taken on — accounting for
// a full-time job still carried on the single-stream fields (it becomes the base
// venture only when the portfolio is materialized). Used by the decision projection so
// the time-commitment prompt matches what applyNewVenture will enforce (P17.1).
export function plannedFreeTime(agent: NPCAgent): number {
  let committed = committedTime(agent);
  if (!hasVentures(agent) && agent.currentJob) committed += FULL_TIME_LOAD;
  return Math.max(0, FULL_TIME_LOAD - committed);
}

// The hands-on time a new venture would take, falling back to its barrier tier.
export function ventureTimeLoadForTier(timeLoad: number | undefined, tier: BarrierTier): number {
  return timeLoad ?? VENTURE_TIME_LOAD[tier];
}

// ── Performance fluctuation & the juice-stand model (Phase 17, P17.3/P17.4) ───

// A venture's hidden success/volatility profile, drawn once at creation from its risk
// level (P17.4). Some ventures are simply better or worse businesses (successBias),
// and riskier trades swing harder month to month (volatility). Draws from world.rng.
export function ventureProfileForRisk(
  riskLevel: 'LOW' | 'MEDIUM' | 'MEDIUM_HIGH' | 'HIGH',
  rng: WorldState['rng'],
): VentureProfile {
  const base: Record<typeof riskLevel, { bias: number; vol: number }> = {
    LOW: { bias: 1.0, vol: 0.12 },
    MEDIUM: { bias: 0.98, vol: 0.2 },
    MEDIUM_HIGH: { bias: 0.95, vol: 0.3 },
    HIGH: { bias: 0.92, vol: 0.4 },
  };
  const b = base[riskLevel];
  // A per-venture quality draw: most cluster near the mean, a few are duds or winners.
  const successBias = clamp(rng.gaussian(b.bias, 0.12), 0.4, 1.4);
  return { successBias, volatility: b.vol };
}

// Sample one month's takings for a juice stand from its concrete unit economics
// (P17.3): a bag (sometimes two) of passion fruit, a few hundred bottles each, sold
// at the going price. Returns the performance factor (revenue vs. the reference mean)
// and the month's fruit/sugar/transport cost. Draws from world.rng.
function sampleJuiceStandMonth(rng: WorldState['rng']): { factor: number; operatingCost: number } {
  const bags = rng.next() < JUICE_STAND.goodMonthChance ? 2 : 1;
  let bottles = 0;
  for (let i = 0; i < bags; i++) {
    bottles += rng.int(JUICE_STAND.bottlesPerBagMin, JUICE_STAND.bottlesPerBagMax);
  }
  const revenue = bottles * JUICE_STAND.pricePerBottle;
  const operatingCost = bags * (JUICE_STAND.fruitCostPerBag + JUICE_STAND.sugarTransportPerBag);
  return { factor: revenue / JUICE_STAND_REFERENCE_REVENUE, operatingCost };
}

// Resample each active venture's performance for the new month (P17.3/P17.4). The
// juice stand draws its concrete bag/bottle model (and its variable cost); every other
// profiled venture draws a swing around its hidden success bias. Stored on the venture
// so the projection reads a fresh figure without re-drawing rng. A no-op for a venture
// with neither a production model nor a profile, so the digest holds. Draws world.rng,
// so this runs only on the advance path (updatePlayerIncome), never in the projection.
export function refreshVenturePerformance(world: WorldState): void {
  for (const v of activeVentures(world.player)) {
    if (v.production === 'JUICE_STAND') {
      const { factor, operatingCost } = sampleJuiceStandMonth(world.rng);
      v.performanceFactor = factor;
      v.monthlyOperatingCosts = operatingCost;
      continue;
    }
    if (v.profile) {
      v.performanceFactor = clamp(
        world.rng.gaussian(v.profile.successBias, v.profile.volatility),
        VENTURE_PERF_FLOOR,
        VENTURE_PERF_CEIL,
      );
    }
  }
}

// ── Venture exit (Phase 17, P17.4) ───────────────────────────────────────────

export class VentureError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'BAD_STATE',
  ) {
    super(message);
    this.name = 'VentureError';
  }
}

function findPlayerVenture(world: WorldState, ventureId: string): Venture {
  const v = (world.player.ventures ?? []).find((x) => x.id === ventureId);
  if (!v) throw new VentureError(`venture ${ventureId} not found`, 'NOT_FOUND');
  return v;
}

// Wind a venture down for good (P17.4): it stops earning and frees the player's time.
// Its assets remain owned (the player can still sell them through Phase 12). Recompute
// of monthly income happens on the next advance.
export function discontinueVenture(world: WorldState, ventureId: string): Venture {
  const v = findPlayerVenture(world, ventureId);
  if (v.status === 'CLOSED') throw new VentureError('That venture is already wound down.', 'BAD_STATE');
  v.status = 'CLOSED';
  return v;
}

// Pause a venture (P17.4): no income while shelved, only a fraction of its upkeep, and
// its time is freed — a way to set down a business that cannot be sold and pick it up
// later.
export function shelveVenture(world: WorldState, ventureId: string): Venture {
  const v = findPlayerVenture(world, ventureId);
  if (v.status !== 'ACTIVE') throw new VentureError('Only a running venture can be shelved.', 'BAD_STATE');
  v.status = 'SHELVED';
  return v;
}

// Bring a shelved venture back into operation (P17.4).
export function reopenVenture(world: WorldState, ventureId: string): Venture {
  const v = findPlayerVenture(world, ventureId);
  if (v.status !== 'SHELVED') throw new VentureError('Only a shelved venture can be reopened.', 'BAD_STATE');
  v.status = 'ACTIVE';
  return v;
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

// ── Markets remember: venture-side scandal & demand memory (Phase 21, A19) ────
// A quality failure — a food-poisoning beat, a botched job that gets talked about —
// depresses a venture's customer demand and lifts back only slowly, so a fixed cause
// still shadows takings for months (A19). Modelled as a single demand multiplier on the
// venture (`customerReputation`), dropped sharply by a scandal and eased toward 1 each
// month. Consumer-facing trades are the ones exposed: word of mouth reaches the buyers.

// The trades whose custom is reputation-sensitive — food, hospitality, retail, transport.
const SCANDAL_EXPOSED: ReadonlySet<Industry> = new Set<Industry>([
  'RETAIL',
  'TOURISM',
  'TRANSPORTATION',
  'AGRICULTURE',
]);

// A scandal cuts demand to this share of normal, and it recovers toward 1 at this rate
// per month — a slow lift, so the shadow lingers long after the cause is put right.
const SCANDAL_FLOOR = 0.55;
const SCANDAL_RECOVERY = 0.06;
// Per-eligible-venture monthly chance a scandal breaks. Rare (calibrated, not annual).
const SCANDAL_PROBABILITY = 0.015;

// Whether a venture's custom is exposed to reputation — a consumer-facing, active
// venture not run purely as wage labour.
function isScandalExposed(venture: Venture): boolean {
  return (
    venture.status === 'ACTIVE' && !venture.wageProfile && SCANDAL_EXPOSED.has(venture.industry)
  );
}

// Drop a venture's customer reputation sharply — the scandal breaks. Never lifts it
// (a fresh scandal on an already-shadowed venture cannot help it). Pure.
export function applyVentureScandal(venture: Venture): void {
  venture.customerReputation = Math.min(venture.customerReputation ?? 1, SCANDAL_FLOOR);
}

// Ease every active player venture's customer reputation back toward a whole name each
// month (A19 — recovery lags the fix). A no-op for a venture that has never been
// scandalised (customerReputation undefined → stays undefined → byte-identical). Pure.
export function recoverVentureReputations(world: WorldState): void {
  const p = world.player;
  for (const v of p.ventures ?? []) {
    if (v.customerReputation == null || v.customerReputation >= 1) continue;
    const next = v.customerReputation + (1 - v.customerReputation) * SCANDAL_RECOVERY;
    v.customerReputation = next >= 0.999 ? 1 : next;
  }
}

// Roll for a scandal on the player's consumer-facing ventures (A19). Gated on the player
// actually running an exposed venture, so NO rng is drawn — and nothing moves — for a
// player without one (the digest holds). At most one scandal per month. Draws through
// world.rng, so it stays reproducible per seed (S2).
export function rollVentureScandal(world: WorldState): void {
  const exposed = (world.player.ventures ?? []).filter(isScandalExposed);
  if (exposed.length === 0) return;
  for (const v of exposed) {
    if (world.rng.next() < SCANDAL_PROBABILITY) {
      applyVentureScandal(v);
      return; // one scandal is enough of a month
    }
  }
}
