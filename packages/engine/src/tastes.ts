import type { Industry, ParishId } from '@island/shared';
import { clamp } from './rng';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 24 — the evolving market: consumer taste & trend drift (P24.1, A21/C13)
// and culture per parish (P24.2, A10).
//
// Two DERIVED demand-side reads, both pure and deterministic per seed and both
// modelled in the AGGREGATE (S8) — the *effective demand* a good sees, never a
// per-consumer simulation:
//
//   • TASTE DRIFT (temporal). A good's effective demand drifts slowly over years —
//     a health trend cools sugary drinks, a diaspora fashion warms a craft. Modelled
//     as a slow multi-year random walk unique to each (seed, good): a sum of a few
//     low-frequency waves whose phase is hashed from the good's id and the seed. It
//     starts EXACTLY neutral (1.0) at month 0 — the drift is measured relative to its
//     own month-0 value — so a fresh world is byte-identical to the pre-Phase-24 model
//     and the divergence only accumulates over the long run (the "most profitable
//     trade shifts over years, unscripted" acceptance). No world.rng draw, so the seed
//     stream stays pristine (S2, matching Phase 23's side-stream discipline).
//
//   • CULTURE (spatial). Each parish has a standing cultural demand profile — a tourist
//     parish skews to hospitality and retail, an agricultural one to ground provisions —
//     so the same good sells differently across parishes. A static, mild per-(parish,
//     industry) bias table, centered near 1.0.
//
// Both are hidden internals: the player reads the shifting market in prose and in the
// prices themselves, never these raw multipliers (the iceberg, S3).
// ─────────────────────────────────────────────────────────────────────────────

// The drift stays within this band around neutral — a taste can roughly halve or
// half-again a good's pull over a long run, but never vanish or run away.
const DRIFT_LO = 0.7;
const DRIFT_HI = 1.35;

// The slow waves the drift is built from: multi-year periods (≈3.5–7 years) so the
// month-to-month change is gentle and the combined signal does not repeat for a very
// long time. Amplitudes sum well inside the band. Each good gets its own phase per
// wave, hashed from its id and the seed, so different trades peak at different times.
const DRIFT_WAVES: { periodMonths: number; amplitude: number }[] = [
  { periodMonths: 41, amplitude: 0.13 },
  { periodMonths: 59, amplitude: 0.09 },
  { periodMonths: 83, amplitude: 0.06 },
];

// FNV-1a over a string, salted, → a uint32. Cheap and stable across runs, so the
// phase a good draws is fixed per (seed, good) without any stored state.
function hashString(s: string, salt: number): number {
  let h = (2166136261 ^ (salt >>> 0)) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// The unclamped drift signal for a good at a given month — the sum of the slow waves.
function driftSignal(seed: number, goodId: string, month: number): number {
  let sum = 0;
  for (let i = 0; i < DRIFT_WAVES.length; i++) {
    const wave = DRIFT_WAVES[i]!;
    const phase = (hashString(goodId, (seed ^ ((i + 1) * 0x9e3779b1)) >>> 0) / 0xffffffff) * Math.PI * 2;
    sum += wave.amplitude * Math.sin((2 * Math.PI * month) / wave.periodMonths + phase);
  }
  return sum;
}

// The taste-drift multiplier a good's effective demand carries this month (P24.1).
// Deterministic per (seed, good, month); exactly 1.0 at month 0 (the drift is measured
// from its own starting value), so a fresh world is byte-identical and the shift only
// builds over the long run. Never draws world.rng.
export function tasteDriftMultiplier(seed: number, goodId: string, month: number): number {
  const drift = driftSignal(seed, goodId, month) - driftSignal(seed, goodId, 0);
  return clamp(1 + drift, DRIFT_LO, DRIFT_HI);
}

// ── Culture per parish (P24.2, A10) ──────────────────────────────────────────
// A standing cultural demand bias by (parish, industry), mild (≈0.85–1.2) and centered
// near 1.0, derived from each parish's real character: the Roseau capital skews to
// tourism/retail/finance; the fishing towns of the north-west to fishing; the rural
// interior and south to ground provisions; the spa-and-springs south-west to tourism.
// An industry not listed for a parish reads neutral (1.0). Static and deterministic —
// never a stored, hand-edited stock (S5), so it round-trips trivially.
export const PARISH_CULTURE: Record<ParishId, Partial<Record<Industry, number>>> = {
  // Roseau — the capital: hotels, the big retailers, the transport hub, the banks.
  SAINT_GEORGE: { TOURISM: 1.2, RETAIL: 1.15, FINANCE: 1.15, TRANSPORTATION: 1.1, AGRICULTURE: 0.85, FISHING: 0.95 },
  // Portsmouth — the fishing north, the Cabrits cruise calls.
  SAINT_JOHN: { FISHING: 1.15, TOURISM: 1.05, AGRICULTURE: 0.95 },
  // Marigot — the agro-processing east, the largest rural population.
  SAINT_ANDREW: { AGRICULTURE: 1.2, CONSTRUCTION: 1.05, RETAIL: 0.9, FISHING: 1.0 },
  // Castle Bruce — the rural, wave-beaten east coast.
  SAINT_DAVID: { AGRICULTURE: 1.15, FISHING: 1.05, TOURISM: 0.9 },
  // Grand Bay / Berekua — deep agricultural country with a strong local culture.
  SAINT_PATRICK: { AGRICULTURE: 1.2, INFORMAL_TRADE: 1.1, TOURISM: 0.95 },
  // Laplaine — a tiny south-east settlement living off the land and the sea.
  SAINT_LUKE: { AGRICULTURE: 1.15, FISHING: 1.1, RETAIL: 0.85 },
  // Soufrière — the sulphur springs and dive sites: a tourism pocket.
  SAINT_MARK: { TOURISM: 1.2, FISHING: 1.05, AGRICULTURE: 0.9 },
  // Pointe Michel — close to Roseau, a mixed coastal economy.
  SAINT_PAUL: { RETAIL: 1.05, TOURISM: 1.05, FISHING: 1.05 },
  // Saint Joseph — the west-coast agricultural belt.
  SAINT_JOSEPH: { AGRICULTURE: 1.15, FISHING: 1.05 },
  // Colihaut — a small north-west fishing and farming community.
  SAINT_PETER: { FISHING: 1.15, AGRICULTURE: 1.1, TOURISM: 0.9 },
};

// The cultural demand bias a good in a given industry sees in a given parish (P24.2).
// 1.0 where a parish has no particular lean, so the island-wide picture stays balanced.
export function cultureDemandMultiplier(parish: ParishId, industry: Industry): number {
  return PARISH_CULTURE[parish]?.[industry] ?? 1;
}
