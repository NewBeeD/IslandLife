import { GOODS, REPRESENTATIVE_GOOD } from '@island/shared';
import type { Industry, NPCAgent, Venture, WorldState } from '@island/shared';
import { clamp, clamp01 } from './rng';
import { activeVentures, hasVentures, tradeOperatorCount, ventureGrossIncome } from './ventures';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 22 — the information economy & imperfect information (C2, C14, A1).
//
// Stop handing the player clean numbers. The iceberg already hides *mechanics*; this
// layer makes *information itself* a purchasable, imperfect good. A forecast of a
// venture's next-season takings is given as a RANGE — a confidence band, never a point
// — whose width reflects the venture's volatility, the season's swing, and the macro
// web's uncertainty (Phase 20), narrowed by whatever market research the player has paid
// for. So a player who invests in information forecasts a tighter band and out-decides
// one who guesses (A1), and no amount of spreadsheet optimisation reads the true number
// off the wire, because it never crosses it (C14, S3).
//
// Pure of rng, like reputation and the macro web — forecasts are DERIVED reads over the
// world state (S5), computed on the projection side, so they never disturb the seed
// stream (S2). The one mutation here is `decayInformation` (research goes stale) and the
// two purchase actions (P22.2), all player-only and gated on the player having bought
// information, so the no-information baseline is byte-identical and the digest holds.
// ─────────────────────────────────────────────────────────────────────────────

// A forecast the player reads: a low–high band in EC$/month. The hidden centre (the
// naive point projection) is never part of this — only the bounds cross the wire (S3).
export interface Forecast {
  label: string;
  low: number;
  high: number;
}

// How far ahead a forecast looks — a season, roughly, so the known seasonal drift
// between now and then honestly shifts the centre of the band.
export const FORECAST_HORIZON_MONTHS = 3;

// Spot income swings between these bounds of the good's base price, matching the venture
// income model (ventures.ts) so the forecast is anchored to the same mechanics.
const SPOT_MIN_FACTOR = 0.5;
const SPOT_MAX_FACTOR = 2.0;

// The band's fractional half-width is built from the sources of real uncertainty the
// realised take will swing on, then narrowed by the player's paid information.
const BASE_UNCERTAINTY = 0.06; // irreducible — even a sharp read is not a promise
const PERF_WEIGHT = 1.4; // per unit of venture volatility (the month-to-month swing)
const PRICE_UNCERTAINTY = 0.1; // ordinary price noise around the seasonal expectation
const MACRO_WEIGHT = 0.6; // per unit of macro uncertainty (demand off 1, systemic stress)
const MIN_HALF_WIDTH = 0.05;
const MAX_HALF_WIDTH = 0.7;

// A venture with no explicit volatility profile still swings a little; assume a modest
// default so its forecast is honestly uncertain rather than a false point.
const DEFAULT_VOLATILITY = 0.12;

// How far a full research read narrows the band: at researchLevel 1 the half-width is
// (1 − INFO_NARROW) of the unaided width. Kept below 1 so a sharp read tightens the band
// substantially but never to a certainty — the true outcome still lands outside it
// sometimes (C14: information is an edge, not an oracle).
const INFO_NARROW = 0.55;

// ── Research as a wasting asset ───────────────────────────────────────────────
// Each purchase jumps the player's read up by a step; it then decays toward nothing as
// the information goes stale, so an edge must be renewed to be kept.
export const RESEARCH_STEP = 0.6;
export const RESEARCH_DECAY = 0.12;
// A competitor scout stays fresh for a season before it goes cold.
export const SCOUT_DURATION_MONTHS = 3;

// The player's current research depth (0 → just guessing), neutral when they have never
// bought any. Read by the forecast band; a player with no information forecasts wide.
export function researchLevelOf(agent: NPCAgent): number {
  return clamp01(agent.information?.researchLevel ?? 0);
}

// Whether the player holds a fresh competitor scout this month (P22.2).
export function isScouted(agent: NPCAgent, month: number): boolean {
  const until = agent.information?.scoutedUntilMonth;
  return until != null && month <= until;
}

// Age the player's information one month: research decays toward nothing (it goes
// stale), and a lapsed scout is cleared. A no-op for a player who has never bought
// information (the field is undefined), so the no-information baseline digest holds (S2).
// Pure of rng.
export function decayInformation(world: WorldState): void {
  const info = world.player.information;
  if (!info) return;
  info.researchLevel = Math.max(0, info.researchLevel - RESEARCH_DECAY);
  if (info.scoutedUntilMonth != null && world.month > info.scoutedUntilMonth) {
    delete info.scoutedUntilMonth;
  }
}

// Macro uncertainty this month — how far the wider economy is from calm. Aggregate
// demand off its 1.0 resting point plus any systemic-credit stress widen every forecast.
function macroUncertainty(world: WorldState): number {
  const m = world.macro;
  return Math.abs(m.aggregateDemand - 1) + 0.5 * m.systemicStress;
}

// The known seasonal drift in a good's demand between this month and the forecast
// horizon — a public, knowable shift (seasonality is not hidden), so it honestly moves
// the centre of the band rather than widening it. 1.0 when the good has no seasonality.
function seasonalDrift(industry: Industry, month: number): number {
  const goodId = REPRESENTATIVE_GOOD[industry];
  if (!goodId) return 1;
  const good = GOODS.find((g) => g.id === goodId);
  if (!good || good.seasonality.length < 12) return 1;
  const now = good.seasonality[month % 12] ?? 1;
  const then = good.seasonality[(month + FORECAST_HORIZON_MONTHS) % 12] ?? 1;
  if (now <= 0) return 1;
  return clamp(then / now, 0.5, 2);
}

// The current price factor a venture's spot take rides (its local price vs. the good's
// base), matching ventureGrossIncome. 1 when the good/market cannot be resolved.
function currentPriceFactor(world: WorldState, industry: Industry, parish: NPCAgent['parish']): number {
  const goodId = REPRESENTATIVE_GOOD[industry];
  if (!goodId) return 1;
  const good = GOODS.find((g) => g.id === goodId);
  const market = world.markets.find((m) => m.goodId === goodId && m.parish === parish);
  if (!good || !market) return 1;
  return clamp(market.currentPrice / good.basePrice, SPOT_MIN_FACTOR, SPOT_MAX_FACTOR);
}

// Whether a venture's income is market-driven (and so worth forecasting). A standing
// contract or a wage is a known, fixed figure — nothing to forecast.
function isForecastable(venture: Venture): boolean {
  if (venture.status !== 'ACTIVE') return false;
  if (venture.wageProfile) return false;
  if (venture.incomeMode === 'STANDING') return false;
  return REPRESENTATIVE_GOOD[venture.industry] != null;
}

// The expected monthly take at the horizon: the venture's earning power stripped of this
// month's random performance swing (so the noise is not baked into the centre), re-priced
// by the known seasonal drift and the venture's mean performance. A naive-but-honest
// point projection — hidden; only the band built around it ever surfaces.
function expectedGross(world: WorldState, venture: Venture, parish: NPCAgent['parish']): number {
  const factor = currentPriceFactor(world, venture.industry, parish);
  const drift = seasonalDrift(venture.industry, world.month);
  const expectedFactor = clamp(factor * drift, SPOT_MIN_FACTOR, SPOT_MAX_FACTOR);
  // Strip this month's sampled swing and re-apply the venture's mean (successBias),
  // so the centre is the typical month, not this one. custRep/saturation are carried
  // by re-deriving off the live take, which already embeds them at their current level.
  const live = ventureGrossIncome(world, parish, venture);
  const perf = venture.performanceFactor ?? 1;
  const meanPerf = venture.profile?.successBias ?? 1;
  const stripped = perf > 0 ? (live / perf) * meanPerf : live;
  // Re-price from the current factor to the expected one.
  const reFactored = factor > 0 ? stripped * (expectedFactor / factor) : stripped;
  return Math.max(0, reFactored);
}

// Round a band bound to a "real" forecast figure — banded so the player never reads a
// spuriously precise number like 14,382 (C14). Low rounds down, high rounds up.
function roundBound(n: number, dir: 'low' | 'high'): number {
  const step = n >= 5000 ? 500 : n >= 1000 ? 100 : 50;
  return dir === 'low'
    ? Math.max(0, Math.floor(n / step) * step)
    : Math.ceil(n / step) * step;
}

// Build the confidence band around a centre from the venture's volatility, the macro
// climate, and the player's paid research. Pure and deterministic.
function bandAround(world: WorldState, centre: number, volatility: number, level: number): {
  low: number;
  high: number;
} {
  const raw =
    BASE_UNCERTAINTY +
    PERF_WEIGHT * volatility +
    PRICE_UNCERTAINTY +
    MACRO_WEIGHT * macroUncertainty(world);
  const widen = 1 - INFO_NARROW * clamp01(level);
  const half = clamp(raw * widen, MIN_HALF_WIDTH, MAX_HALF_WIDTH);
  return {
    low: roundBound(centre * (1 - half), 'low'),
    high: roundBound(centre * (1 + half), 'high'),
  };
}

// Forecast one venture's next-season monthly take as a band, or null if there is
// nothing market-driven to forecast. Deterministic per seed.
export function forecastVenture(world: WorldState, venture: Venture, level: number): Forecast | null {
  if (!isForecastable(venture)) return null;
  const p = world.player;
  const centre = expectedGross(world, venture, p.parish);
  if (centre <= 0) return null;
  const volatility = venture.profile?.volatility ?? DEFAULT_VOLATILITY;
  const { low, high } = bandAround(world, centre, volatility, level);
  return { label: venture.label, low, high };
}

// All the player's forecastable income streams, banded (Phase 22). A portfolio yields a
// forecast per market-driven venture; a single-stream SPOT player yields one for their
// trade. Empty when the player has only fixed/known income — nothing to forecast. Reads
// the player's current research depth for the band width. Pure and deterministic.
export function playerForecasts(world: WorldState): Forecast[] {
  const p = world.player;
  const level = researchLevelOf(p);
  const out: Forecast[] = [];
  if (hasVentures(p)) {
    for (const v of activeVentures(p)) {
      const f = forecastVenture(world, v, level);
      if (f) out.push(f);
    }
    return out;
  }
  // Single-stream SPOT player: forecast the occupation's take. Build a throwaway venture
  // shape so the same core serves both paths.
  if (
    p.incomeMode === 'SPOT' &&
    p.occupation &&
    p.spotBaseIncome != null &&
    REPRESENTATIVE_GOOD[p.occupation]
  ) {
    const pseudo: Venture = {
      id: 'SINGLE',
      industry: p.occupation,
      label: 'the work',
      incomeMode: 'SPOT',
      spotBaseIncome: p.spotBaseIncome,
      standingContract: null,
      outputScale: p.outputScale ?? 1,
      monthlyOperatingCosts: 0,
      assets: [],
      status: 'ACTIVE',
    };
    const f = forecastVenture(world, pseudo, level);
    if (f) out.push({ ...f, label: 'the work' });
  }
  return out;
}

// The total monthly gross the player has to forecast — used to price information (a
// bigger operation pays more for a good read, and gets more from it).
function forecastableGross(world: WorldState): number {
  const p = world.player;
  let sum = 0;
  if (hasVentures(p)) {
    for (const v of activeVentures(p)) {
      if (isForecastable(v)) sum += ventureGrossIncome(world, p.parish, v);
    }
  } else if (p.incomeMode === 'SPOT' && p.occupation) {
    sum += p.monthlyIncome;
  }
  return Math.max(0, sum);
}

// Whether the player has anything worth forecasting right now (a market-driven stream).
export function hasForecastableIncome(world: WorldState): boolean {
  return playerForecasts(world).length > 0;
}

// How crowded the player's trade is — the competitor read a scout buys (P22.2). Returns
// the operator count in the player's principal trade & parish, or null when there is no
// single trade to read. This is otherwise-hidden information: it is surfaced ONLY while
// a fresh scout is in hand (the projection gates on `isScouted`).
export function competitorRead(world: WorldState): { industry: Industry; operators: number } | null {
  const p = world.player;
  let industry: Industry | null = null;
  if (hasVentures(p)) {
    const v = activeVentures(p).find((x) => isForecastable(x));
    industry = v?.industry ?? null;
  } else {
    industry = p.occupation;
  }
  if (!industry) return null;
  return { industry, operators: tradeOperatorCount(world, industry, p.parish) };
}

// ── Buying information (P22.2) ────────────────────────────────────────────────

export class InfoError extends Error {
  constructor(
    message: string,
    readonly code: 'NOTHING_TO_FORECAST' | 'NO_CASH',
  ) {
    super(message);
    this.name = 'InfoError';
  }
}

// The cost of a market-research read — scaled to the size of what it forecasts (a bigger
// operation pays more for good intel), within a sane band. A scout is cheaper.
const RESEARCH_COST_FRACTION = 0.6;
const RESEARCH_COST_FLOOR = 250;
const RESEARCH_COST_CEIL = 4000;
const SCOUT_COST_FRACTION = 0.3;
const SCOUT_COST_FLOOR = 120;
const SCOUT_COST_CEIL = 1500;

export function researchCost(world: WorldState): number {
  const gross = forecastableGross(world);
  return clamp(Math.round(gross * RESEARCH_COST_FRACTION), RESEARCH_COST_FLOOR, RESEARCH_COST_CEIL);
}

export function scoutCost(world: WorldState): number {
  const gross = forecastableGross(world);
  return clamp(Math.round(gross * SCOUT_COST_FRACTION), SCOUT_COST_FLOOR, SCOUT_COST_CEIL);
}

// Ensure the player has an information ledger to write into.
function ensureInformation(agent: NPCAgent): NonNullable<NPCAgent['information']> {
  return (agent.information ??= { researchLevel: 0 });
}

// Buy (or renew) a market-research read: step the player's research depth up toward a
// sharp read and charge the cost. Refuses when there is nothing to forecast or the
// player cannot afford it. Pure of rng; mutates the player's cash and information.
export function buyMarketResearch(world: WorldState): { cost: number; level: number } {
  if (!hasForecastableIncome(world)) {
    throw new InfoError(
      'There is nothing to forecast just now — you would need a trade whose takings move with the market.',
      'NOTHING_TO_FORECAST',
    );
  }
  const cost = researchCost(world);
  const p = world.player;
  if (p.cash < cost) {
    throw new InfoError('You do not have the money for a proper read just now.', 'NO_CASH');
  }
  p.cash -= cost;
  const info = ensureInformation(p);
  info.researchLevel = clamp01(info.researchLevel + RESEARCH_STEP);
  return { cost, level: info.researchLevel };
}

// Buy a competitor scout: a fresh read on how crowded the player's trade is, good for a
// season. Charges the cost. Refuses when there is no trade to read or the player cannot
// afford it. Pure of rng.
export function buyCompetitorScout(world: WorldState): { cost: number } {
  if (!competitorRead(world)) {
    throw new InfoError(
      'There is no trade of yours to scout just now.',
      'NOTHING_TO_FORECAST',
    );
  }
  const cost = scoutCost(world);
  const p = world.player;
  if (p.cash < cost) {
    throw new InfoError('You do not have the money to send someone asking around.', 'NO_CASH');
  }
  p.cash -= cost;
  const info = ensureInformation(p);
  info.scoutedUntilMonth = world.month + SCOUT_DURATION_MONTHS;
  return { cost };
}
