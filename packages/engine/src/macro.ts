import type { MacroState, WorldState } from '@island/shared';
import { clamp, clamp01 } from './rng';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 20 — the economic web (systemic interaction, #26).
//
// A dense feedback loop of a dozen tightly-connected macro variables. Each is
// DERIVED and recomputed every month from the others plus the world's aggregates
// (unemployment, bank health, firm profitability) — never a hand-edited source of
// truth (S5). The variables read and write each other so one event ripples through
// many systems for months and then mean-reverts:
//
//   rates ↑ → borrowing ↓ → construction ↓ → input demand ↓ → layoffs ↑ →
//   unemployment ↑ → consumer spending ↓ → firm revenue ↓ → defaults ↑ →
//   banks tighten → rates effectively ↑   (the loop closes)
//
// This module owns only the *state* update (`recomputeMacro`) and the pure reader
// helpers the rest of the engine consults (`macroDemandMultiplier`, …). The write
// side — where these numbers actually bend markets, banks, and firm behaviour — is
// wired into `simulateOneMonth` and the systems it drives (P20.2). Pure of rng, so
// it never disturbs the seed stream (S2); hidden internals that never cross the wire
// as numbers (S3) — the player reads the *mood*, in prose (P20.5).
// ─────────────────────────────────────────────────────────────────────────────

// The unemployment rate the cycle reads "normal" against — matches the band the
// government and the irrational engine already treat as elevated.
const NORMAL_UNEMPLOYMENT = 0.12;

// How far each variable moves toward its pressure target each month. Below 1 it
// carries most of last month forward, so a shock propagates over several months and
// then mean-reverts rather than snapping — the source of the web's legible dynamics.
const MOVE = 0.35;

// The neutral resting levels the variables revert toward absent any pressure.
const CREDIT_BASELINE = 0.7; // creditAvailability at rest (0–1)

// A systemic-credit shock (P20.3) decays back to calm at this rate per month.
const STRESS_DECAY = 0.7;

// ── Weights on the feedback edges ────────────────────────────────────────────
// Kept small so the variables stay in band and the loop damps rather than explodes.
// The rate spread that widens as defaults rise, credit tightens, and the system is
// stressed — the "banks tighten → rates ↑" closing edge.
const SPREAD_BASE = 0.01;
const SPREAD_NPL_W = 0.18;
const SPREAD_TIGHT_W = 0.05; // per unit of (1 − creditAvailability)
const SPREAD_STRESS_W = 0.08;

const CREDIT_NPL_W = 0.6; // defaults drag credit availability down
const CREDIT_CONF_W = 0.3; // confident firms → banks lend more freely
const CREDIT_STRESS_W = 0.7; // a systemic failure freezes credit

const DEMAND_CONF_W = 0.5; // consumer mood → aggregate demand
const DEMAND_U_W = 0.15; // employment → aggregate demand

const CONSTR_CREDIT_W = 0.7; // cheap, available credit builds
const CONSTR_CONF_W = 0.4; // confident firms build
const CONSTR_RATE_W = 4.0; // a rate spike throttles construction (per unit spread)

const BC_PROFIT_W = 0.5; // firm profitability → business confidence
const BC_CREDIT_W = 0.3;
const BC_DEMAND_W = 0.4;

const CC_U_W = 0.4; // employment → consumer confidence

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

// The world aggregates the macro update reads. Cheap scalar reductions over the live
// entity graph; all already maintained by earlier phases of the month.
interface MacroAggregates {
  unemploymentGap: number; // (normal − u)/normal, clamped [−1,1]: + = tight labour market
  nplRatio: number; // mean bank non-performing-loan ratio, 0–1
  firmProfitability: number; // fraction of open firms in the black this month, 0–1
}

function readAggregates(world: WorldState): MacroAggregates {
  const u = world.government.unemploymentRate;
  const unemploymentGap = clamp((NORMAL_UNEMPLOYMENT - u) / NORMAL_UNEMPLOYMENT, -1, 1);

  const banks = world.banks;
  const nplRatio =
    banks.length > 0 ? banks.reduce((s, b) => s + b.nonPerformingLoanRatio, 0) / banks.length : 0;

  const openFirms = world.companies.filter((c) => c.status !== 'CLOSED');
  const firmProfitability =
    openFirms.length > 0 ? openFirms.filter((c) => c.profit >= 0).length / openFirms.length : 1;

  return { unemploymentGap, nplRatio, firmProfitability };
}

// The neutral baseline the world is stood up with — everything at rest, the rate at
// the country base, no systemic stress. Recomputed on the first tick, so this is only
// a starting point, never trusted as stored truth.
export function initialMacroState(baseInterestRate: number): MacroState {
  return {
    effectiveInterestRate: baseInterestRate + SPREAD_BASE,
    creditAvailability: CREDIT_BASELINE,
    aggregateDemand: 1,
    constructionActivity: 1,
    businessConfidence: 0.5,
    consumerConfidence: 0.5,
    systemicStress: 0,
  };
}

// Recompute the macro state for the month from last month's state and this month's
// aggregates. Each variable eases toward a pressure target built from the others, so
// the canonical cascade plays out as lagged feedback edges. Pure of rng. Mutates the
// world's macro in place (and returns it) so callers read the fresh values downstream.
export function recomputeMacro(world: WorldState): MacroState {
  const m = world.macro;
  const a = readAggregates(world);
  const baseRate = world.country.baseInterestRate;

  // Systemic stress decays toward calm (a fresh spike is injected by P20.3 before
  // this runs, on the tick a systemically-important bank fails).
  const systemicStress = clamp01(m.systemicStress * STRESS_DECAY);

  // Credit tightens as defaults rise and the system is stressed, loosens when firms
  // are confident. Anchored on the resting baseline.
  const creditTarget = clamp01(
    CREDIT_BASELINE -
      CREDIT_NPL_W * a.nplRatio +
      CREDIT_CONF_W * (m.businessConfidence - 0.5) -
      CREDIT_STRESS_W * systemicStress,
  );
  const creditAvailability = clamp01(lerp(m.creditAvailability, creditTarget, MOVE));

  // The effective rate is the base plus a spread that widens with defaults, tight
  // credit, and systemic stress — the loop's closing edge back onto borrowing.
  const spread =
    SPREAD_BASE +
    SPREAD_NPL_W * a.nplRatio +
    SPREAD_TIGHT_W * (1 - creditAvailability) +
    SPREAD_STRESS_W * systemicStress;
  const effectiveInterestRate = lerp(m.effectiveInterestRate, baseRate + spread, MOVE);
  const rateBite = Math.max(0, effectiveInterestRate - baseRate);

  // Households are confident when work is easy to find; the mood carries inertia.
  const consumerTarget = clamp01(0.5 + CC_U_W * a.unemploymentGap);
  const consumerConfidence = clamp01(lerp(m.consumerConfidence, consumerTarget, MOVE));

  // Aggregate demand rides consumer mood and employment, centered on 1.0.
  const demandTarget =
    1 + DEMAND_CONF_W * (consumerConfidence - 0.5) + DEMAND_U_W * a.unemploymentGap;
  const aggregateDemand = clamp(lerp(m.aggregateDemand, demandTarget, MOVE), 0.6, 1.4);

  // Construction builds on cheap, available credit and confident firms; a rate spike
  // throttles it (rates ↑ → borrowing ↓ → construction ↓).
  const constructionTarget =
    1 +
    CONSTR_CREDIT_W * (creditAvailability - CREDIT_BASELINE) +
    CONSTR_CONF_W * (m.businessConfidence - 0.5) -
    CONSTR_RATE_W * rateBite;
  const constructionActivity = clamp(
    lerp(m.constructionActivity, constructionTarget, MOVE),
    0.5,
    1.4,
  );

  // Firms are confident when they are making money, credit is open, and demand is up.
  const businessTarget = clamp01(
    0.5 +
      BC_PROFIT_W * (a.firmProfitability - 0.5) +
      BC_CREDIT_W * (creditAvailability - CREDIT_BASELINE) +
      BC_DEMAND_W * (aggregateDemand - 1),
  );
  const businessConfidence = clamp01(lerp(m.businessConfidence, businessTarget, MOVE));

  m.effectiveInterestRate = effectiveInterestRate;
  m.creditAvailability = creditAvailability;
  m.aggregateDemand = aggregateDemand;
  m.constructionActivity = constructionActivity;
  m.businessConfidence = businessConfidence;
  m.consumerConfidence = consumerConfidence;
  m.systemicStress = systemicStress;
  return m;
}

// ── Reader helpers the rest of the engine consults (the write side, P20.2) ───

// The demand multiplier a good in a given industry sees this month. Aggregate demand
// scales everything; construction-linked industries additionally ride the construction
// cycle (the rates → construction → input-demand edge reaches beyond construction into
// the trades that feed it). Centered on 1.0 → a neutral macro leaves prices untouched.
const CONSTRUCTION_LINKED = new Set(['CONSTRUCTION', 'TRANSPORTATION']);
export function macroDemandMultiplier(macro: MacroState, industry: string): number {
  const construction = CONSTRUCTION_LINKED.has(industry)
    ? 1 + 0.5 * (macro.constructionActivity - 1)
    : 1;
  return macro.aggregateDemand * construction;
}

// The island-wide cost of credit the banks quote against this month (P20.2 replaces
// the flat country base rate with this in loan assessment).
export function macroInterestRate(world: Pick<WorldState, 'macro' | 'country'>): number {
  return world.macro?.effectiveInterestRate ?? world.country.baseInterestRate;
}

// How open credit is, as a multiplier on how far a bank will stretch a loan. Centered
// on the resting baseline (CREDIT_BASELINE → 1.0), so calm credit neither inflates nor
// squeezes the pre-P20 ceiling; it tightens below 1 as availability falls, eases above.
export function macroCreditMultiplier(macro: MacroState): number {
  return clamp(macro.creditAvailability + (1 - CREDIT_BASELINE), 0.5, 1.3);
}

// The system-wide haircut a systemic-credit shock puts on every bank's lending
// appetite (P20.3): 1 in calm times, falling toward ~0.3 at peak stress.
export function macroLendingAppetiteFactor(macro: MacroState): number {
  return clamp01(1 - 0.7 * macro.systemicStress);
}

// Inject a systemic-credit shock (P20.3): raise systemic stress to at least `magnitude`
// (never lowering an existing, larger shock). Called when a systemically-important bank
// fails, so the freeze it causes ripples through the P20.2 loop — every bank's appetite
// contracts, credit tightens, and the rate spread widens, island-wide. Pure arithmetic.
export function injectSystemicShock(macro: MacroState, magnitude: number): void {
  macro.systemicStress = clamp01(Math.max(macro.systemicStress, magnitude));
}
