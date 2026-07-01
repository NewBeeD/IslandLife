import type { Industry, MacroState } from '@island/shared';
import { macroInputCostPressure } from './macro';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 23 — supply chains, logistics & scarcity (A4, A12, A13).
//
// The AGGREGATE model, deliberately (S8). `complexity.md` invites a per-shipment
// simulation of every farm→processor→…→retailer link; that is the trap the phase
// warns against. Instead each trade carries a single scalar — how long and fragile its
// supply chain is — and the macro web's scarce-input pressure (P23.1) is felt through
// that scalar. A raw extractive trade (a fisherman selling his own catch, a farmer his
// own ground provisions) has almost no chain to break; a processed or imported one (a
// shop's shelves, a builder's materials) rides a long chain that a boom or a severed
// route squeezes hard. So the same island-wide scarcity lands unevenly, and the trade
// that looked cheapest in calm times is the one a disruption punishes most (A12: every
// link can fail — modelled as one fragility number, not a graph of links).
//
// Pure of rng and of any hidden per-entity state — a DERIVED read over the macro
// state and a static per-industry table (S5), so it never disturbs the seed stream
// (S2). At rest (input-cost pressure 1.0) every multiplier is exactly 1, so a calm
// economy is byte-identical to the pre-P23 cost model.
// ─────────────────────────────────────────────────────────────────────────────

// How long and fragile each trade's supply chain is, 0 (no chain — nothing to break)
// … 1 (a long, import-dependent chain exposed at every hand-off). Raw extractive
// trades are short: a fisherman and a farmer move their own goods a short way. Fuel-
// and transport-dependent trades sit in the middle. Retail and construction ride the
// longest, most import-heavy chains and feel scarcity most. FINANCE has no physical
// chain at all, so scarcity never touches it.
export const SUPPLY_CHAIN_FRAGILITY: Record<Industry, number> = {
  FISHING: 0.15,
  AGRICULTURE: 0.15,
  CONSTRUCTION: 0.7,
  INFORMAL_TRADE: 0.1,
  RETAIL: 0.7,
  TOURISM: 0.35,
  TRANSPORTATION: 0.45,
  FINANCE: 0,
};

export function supplyChainFragility(industry: Industry): number {
  return SUPPLY_CHAIN_FRAGILITY[industry] ?? 0.3;
}

// The multiplier scarce inputs put on a trade's operating cost this month (Phase 23.1/
// 23.3). The island-wide input-cost pressure (≥ 1) is felt in proportion to the trade's
// chain fragility, so a boom or a severed route raises a fragile processed trade's costs
// much more than a raw one's — and never touches finance. Exactly 1 when inputs are calm
// (pressure 1.0) or the macro state predates Phase 23, so a caller that scales by it is
// byte-identical until scarcity actually bites.
export function supplyChainCostMultiplier(
  macro: MacroState | undefined,
  industry: Industry,
): number {
  if (!macro) return 1;
  const pressure = macroInputCostPressure(macro); // ≥ 1
  return 1 + supplyChainFragility(industry) * (pressure - 1);
}

// Whether scarce inputs are biting hard enough to be worth surfacing in voice (P23.x).
// A qualitative read off the macro state — never the raw multiplier (the iceberg, S3).
export function inputsAreScarce(macro: MacroState | undefined): boolean {
  if (!macro) return false;
  return macroInputCostPressure(macro) > 1.12 || (macro.supplyDisruption ?? 0) > 0.2;
}
