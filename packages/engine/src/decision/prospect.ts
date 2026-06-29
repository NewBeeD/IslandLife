import type { NPCAgent } from '@island/shared';
import { clamp } from '../rng';

// ── Prospect-theory valuation (Kahneman & Tversky 1979/1992) ─────────────────
// The pure, deterministic core of the living NPC decision engine (P19.1). It scores
// candidate actions the way a *person* weighs them, not the way a spreadsheet does —
// the three psychological distortions below all key off traits already on the agent
// (`lossAversion`, `riskTolerance`, `patience`), so no new fields are introduced:
//
//   1. a reference-dependent value function with diminishing sensitivity and loss
//      aversion (a loss looms larger than an equal gain),
//   2. Prelec probability weighting (small probabilities over-weighted, near-certain
//      ones under-weighted — the classic inverse-S), and
//   3. hyperbolic time-discounting (a payoff months out is worth less now, steeply
//      so for an impatient agent).
//
// Nothing here draws from `world.rng`: identical inputs yield an identical score, so
// the engine is reproducible per seed *by construction* (S2). The caller supplies the
// outcome distributions framed against the agent's reference point; this module only
// judges them. It is hidden state — utilities never cross the wire (S3).

// One possible result of an action, framed against the agent's reference point.
// `payoff` is in EC$ relative to "do nothing" (a gain is positive, a loss negative);
// the residual probability mass (1 − Σ probability) is an implicit zero-payoff
// outcome and contributes nothing, so distributions need not sum to 1.
export interface Outcome {
  probability: number; // 0–1
  payoff: number; // EC$ relative to the reference (gain > 0, loss < 0)
  delayMonths: number; // months until the payoff lands (≥ 0; 0 = this month)
}

// A candidate action with its outcome distribution. `meta` is opaque to scoring —
// the caller uses it to recover *what to do* once a candidate is chosen.
export interface ActionCandidate<M = unknown> {
  type: string;
  outcomes: Outcome[];
  meta?: M;
}

export interface ScoredCandidate<M = unknown> {
  candidate: ActionCandidate<M>;
  value: number;
}

// Curvature of the loss limb (diminishing sensitivity). KT canonical 0.88; kept
// fixed — risk attitude *in gains* is what varies by trait (see `gainCurvature`).
const LOSS_CURVATURE = 0.88;
// Prelec single-parameter weighting curvature. Below 1 it over-weights small
// probabilities and under-weights large ones — the canonical inverse-S; KT ≈ 0.65.
const PRELEC_GAMMA = 0.65;

// λ — how much more a loss weighs than an equal gain. The agent's `lossAversion`
// (0–1) maps onto a realistic band: loss-neutral (1.0) at 0, the canonical ≈2.25
// near 0.5, sharply loss-averse (3.5) at 1.
export function lossAversionLambda(agent: Pick<NPCAgent, 'lossAversion'>): number {
  return 1 + agent.lossAversion * 2.5;
}

// Curvature of the gain limb, where risk attitude lives. `riskTolerance` ≈ 0.5 gives
// the canonical ≈0.88 (risk-averse in gains: a sure 100 beats a coin-flip for 200);
// higher flattens it toward and past 1.0 (risk-seeking — high-variance upside gets
// attractive); lower deepens the concavity (more risk-averse).
export function gainCurvature(agent: Pick<NPCAgent, 'riskTolerance'>): number {
  return clamp(0.6 + agent.riskTolerance * 0.55, 0.55, 1.15);
}

// Hyperbolic discount rate k. A patient agent discounts the future far less:
// `patience` 1 → k ≈ 0.005 (far-sighted), 0 → k ≈ 0.085 (myopic).
export function discountRate(agent: Pick<NPCAgent, 'patience'>): number {
  return 0.005 + (1 - agent.patience) * 0.08;
}

// Prelec probability weight w(p) = exp(−(−ln p)^γ), pinned at the certain ends.
export function weightProbability(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return Math.exp(-Math.pow(-Math.log(p), PRELEC_GAMMA));
}

// Reference-dependent value of a single payoff (already framed vs. the reference):
// concave for gains (curvature by risk attitude), convex and steeper for losses.
function valueOf(payoff: number, gainExp: number, lambda: number): number {
  if (payoff >= 0) return Math.pow(payoff, gainExp);
  return -lambda * Math.pow(-payoff, LOSS_CURVATURE);
}

// Hyperbolic discount factor D(t) = 1 / (1 + k·t).
export function discountFactor(delayMonths: number, k: number): number {
  return 1 / (1 + k * Math.max(0, delayMonths));
}

// The subjective prospect value of one candidate for this agent: the probability-
// weighted, time-discounted sum of its outcome values.
export function valuateCandidate(
  agent: Pick<NPCAgent, 'lossAversion' | 'riskTolerance' | 'patience'>,
  candidate: ActionCandidate,
): number {
  const lambda = lossAversionLambda(agent);
  const gainExp = gainCurvature(agent);
  const k = discountRate(agent);
  let total = 0;
  for (const o of candidate.outcomes) {
    const w = weightProbability(o.probability);
    if (w === 0) continue;
    total += w * valueOf(o.payoff, gainExp, lambda) * discountFactor(o.delayMonths, k);
  }
  return total;
}

// Apply a soft preference multiplier to a prospect score in a sign-aware way, so a
// multiplier above 1 ("the agent favours this action") raises the score whether the
// action's value is currently a gain (scale it up) or a loss (shrink the loss toward
// zero — the agent is more willing to accept the downside). A multiplier of exactly 1
// (the default) leaves the score untouched, so the pure-P19.1 path is unchanged.
function applyBias(value: number, multiplier: number): number {
  if (multiplier === 1) return value;
  return value >= 0 ? value * multiplier : value / multiplier;
}

// Score every candidate and return them sorted best-first. An optional `bias`
// supplies a per-candidate preference multiplier (P19.2 archetypes) folded over the
// prospect score; omit it for the pure rational valuation. Ties keep their input
// order (the `index` tiebreak makes the sort stable across engines), so the choice
// is fully deterministic — two equal options resolve to whichever the caller listed
// first.
export function evaluateOptions<M>(
  agent: Pick<NPCAgent, 'lossAversion' | 'riskTolerance' | 'patience'>,
  candidates: ActionCandidate<M>[],
  bias?: (candidate: ActionCandidate<M>) => number,
): ScoredCandidate<M>[] {
  return candidates
    .map((candidate, index) => ({
      candidate,
      value: applyBias(valuateCandidate(agent, candidate), bias ? bias(candidate) : 1),
      index,
    }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map(({ candidate, value }) => ({ candidate, value }));
}

// The chosen action: the highest-valued candidate, or undefined if none offered.
export function chooseBest<M>(
  agent: Pick<NPCAgent, 'lossAversion' | 'riskTolerance' | 'patience'>,
  candidates: ActionCandidate<M>[],
  bias?: (candidate: ActionCandidate<M>) => number,
): ActionCandidate<M> | undefined {
  return evaluateOptions(agent, candidates, bias)[0]?.candidate;
}
