import type { Company, Industry, ParishId, WorldState } from '@island/shared';
import { isFoundedFirm } from './company';
import { activeVentures, ventureGrossIncome } from './ventures';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 20.4 — success creates competition (C9).
//
// Winning paints a target. When a firm — or the player — comes to dominate a
// parish×industry cell, the world *responds*: nearby operators cut price and muscle
// into the same trade (surfaced through the Phase 19 founding engine), so a fat
// position competes its own margin away; and past a far higher share the government
// notices market capture (antitrust vs. capture, P-B6). This generalizes the Phase 10
// saturation read (which only crowded low-barrier hustles) into a targeted response
// keyed on realized market share. Pure and deterministic — no rng, no stored state;
// share is recomputed live from revenue each month (S5). Staying small avoids the
// target entirely (every factor is 1 below the threshold).
// ─────────────────────────────────────────────────────────────────────────────

// The share of a parish×industry an operator must hold to draw a competitive response.
export const COMPETITION_SHARE_THRESHOLD = 0.35;
// The far higher share at which the government notices market capture.
export const ANTITRUST_SHARE_THRESHOLD = 0.6;
// …but only for an operator of real scale — capture worth the government's attention is
// a big fish in a big pond, not a small one dominating a thin trade. An ordinary firm
// (a few thousand a month) never clears this; a grown, dominant operator does. This is
// what keeps antitrust a rare, earned event rather than baseline noise on the thin
// industries the established economy leaves half-empty.
export const ANTITRUST_MIN_REVENUE = 150_000;

// The most a dominant operator's revenue is pressured by rivals undercutting them, at
// total dominance. Deliberately gentle — it competes a fat margin down, it does not
// ruin a firm (a dominant seed firm must survive being pressured, not be bankrupted).
const MAX_PRESSURE_HAIRCUT = 0.18;
// The pull a proven, dominated cell exerts on would-be founders — the perceived-profit
// multiplier an entrant applies to a cell someone is visibly cleaning up in.
const MAX_ENTRY_DRAW = 0.4;

// The player's revenue proxy in a parish×industry: the gross take of their active
// ventures in that trade. Lets a venture-running player register in the same cell as
// the NPC firms they compete with, without the player's ventures being companies.
function playerCellRevenue(world: WorldState, industry: Industry, parish: ParishId): number {
  const p = world.player;
  if (p.parish !== parish) return 0;
  return activeVentures(p)
    .filter((v) => v.industry === industry)
    .reduce((s, v) => s + ventureGrossIncome(world, parish, v), 0);
}

// Total revenue contested in a parish×industry cell this month — every open firm plus
// the player's venture proxy. The denominator for a share.
export function cellRevenue(world: WorldState, industry: Industry, parish: ParishId): number {
  let total = 0;
  for (const c of world.companies) {
    if (c.status !== 'CLOSED' && c.industry === industry && c.parish === parish) {
      total += c.monthlyRevenue;
    }
  }
  return total + playerCellRevenue(world, industry, parish);
}

// A firm's realized share of its parish×industry cell, by revenue (0 for a closed firm
// or an empty cell). Requires monthlyRevenue to be current (computed in Phase 3).
export function firmCellShare(company: Company, world: WorldState): number {
  if (company.status === 'CLOSED') return 0;
  const total = cellRevenue(world, company.industry, company.parish);
  return total > 0 ? company.monthlyRevenue / total : 0;
}

// The player's realized share of a parish×industry cell in their own parish.
export function playerCellShare(world: WorldState, industry: Industry): number {
  const parish = world.player.parish;
  const total = cellRevenue(world, industry, parish);
  return total > 0 ? playerCellRevenue(world, industry, parish) / total : 0;
}

// ── Island-wide capture (the antitrust scale, P20.4/P-B6) ────────────────────
// Local dominance (a parish×industry cell) drives the *competitive* response — rivals
// respond where you trade. Government antitrust is a bigger thing: capturing an
// industry across the WHOLE island. Keying it here (not on a thin cell) makes it
// scale-sensitive — a lone rural co-op is a small slice of island-wide fishing and
// draws no attention, while an operator who has grown to dominate the trade does. So
// "staying small avoids the target" holds even for a sole operator in a quiet parish.

// Total revenue an industry turns over across every parish (all open firms + the
// player's ventures in it).
export function industryRevenue(world: WorldState, industry: Industry): number {
  let total = 0;
  for (const c of world.companies) {
    if (c.status !== 'CLOSED' && c.industry === industry) total += c.monthlyRevenue;
  }
  for (const v of activeVentures(world.player)) {
    if (v.industry === industry) total += ventureGrossIncome(world, world.player.parish, v);
  }
  return total;
}

// A firm's share of its industry island-wide.
export function firmIndustryShare(company: Company, world: WorldState): number {
  if (company.status === 'CLOSED') return 0;
  const total = industryRevenue(world, company.industry);
  return total > 0 ? company.monthlyRevenue / total : 0;
}

// The player's share of an industry island-wide.
export function playerIndustryShare(world: WorldState, industry: Industry): number {
  const total = industryRevenue(world, industry);
  if (total <= 0) return 0;
  const p = world.player;
  const rev = activeVentures(p)
    .filter((v) => v.industry === industry)
    .reduce((s, v) => s + ventureGrossIncome(world, p.parish, v), 0);
  return rev / total;
}

// The revenue multiplier competitive pressure puts on an operator of the given share:
// 1 up to the threshold (staying small is safe), sliding down to (1 − MAX_PRESSURE_
// HAIRCUT) at total dominance. Rivals undercut the leader, never enough to ruin them.
export function competitivePressureFactor(share: number): number {
  if (share <= COMPETITION_SHARE_THRESHOLD) return 1;
  const over = (share - COMPETITION_SHARE_THRESHOLD) / (1 - COMPETITION_SHARE_THRESHOLD);
  return 1 - MAX_PRESSURE_HAIRCUT * over;
}

// The perceived-profit multiplier a would-be founder puts on a cell with a dominant
// incumbent — a proven, fat trade worth muscling into. 1 for an ordinary cell; up to
// 1 + MAX_ENTRY_DRAW where someone is visibly cleaning up. This is the "success draws
// entry" edge, read live by the Phase 19 founding scout.
export function competitiveEntryDraw(world: WorldState, industry: Industry, parish: ParishId): number {
  const total = cellRevenue(world, industry, parish);
  if (total <= 0) return 1;
  let topShare = playerCellRevenue(world, industry, parish) / total;
  for (const c of world.companies) {
    if (c.status !== 'CLOSED' && c.industry === industry && c.parish === parish) {
      topShare = Math.max(topShare, c.monthlyRevenue / total);
    }
  }
  if (topShare <= COMPETITION_SHARE_THRESHOLD) return 1;
  const over = (topShare - COMPETITION_SHARE_THRESHOLD) / (1 - COMPETITION_SHARE_THRESHOLD);
  return 1 + MAX_ENTRY_DRAW * over;
}

// Apply competitive price pressure to every dominant firm's revenue this month (P20.4).
// Runs after Phase 3 has set revenues and before Phase 4 prices them into profit, so a
// firm that has come to dominate its cell has its margin competed down — the "winning
// paints a target" pressure, self-limiting and never ruinous. A no-op for every firm
// under the threshold, so a diverse, competitive market is untouched. Pure of rng.
export function applyCompetitivePricePressure(world: WorldState): void {
  // Snapshot shares first (the haircut must not shift the denominator mid-pass).
  const factors = world.companies.map((c) =>
    c.status === 'CLOSED' ? 1 : competitivePressureFactor(firmCellShare(c, world)),
  );
  world.companies.forEach((c, i) => {
    if (factors[i]! < 1) c.monthlyRevenue *= factors[i]!;
  });
}

// Whether an operator who GREW into dominance — the player, or a founded firm — has
// captured an industry island-wide past the antitrust threshold (P20.4/P-B6). The
// established seed economy (a national co-op that has always held its trade) is the
// baseline, not capture-through-success, so seed incumbents are excluded: the
// government scrutinizes a rising operator crowding others out, not the standing order.
// This is what makes "staying small avoids the target" a real, earned property.
export function dominantCaptureExists(world: WorldState): boolean {
  for (const c of world.companies) {
    if (
      c.status !== 'CLOSED' &&
      isFoundedFirm(c) &&
      c.monthlyRevenue >= ANTITRUST_MIN_REVENUE &&
      firmIndustryShare(c, world) >= ANTITRUST_SHARE_THRESHOLD
    ) {
      return true;
    }
  }
  const p = world.player;
  for (const industry of new Set(activeVentures(p).map((v) => v.industry))) {
    const rev = activeVentures(p)
      .filter((v) => v.industry === industry)
      .reduce((s, v) => s + ventureGrossIncome(world, p.parish, v), 0);
    if (rev >= ANTITRUST_MIN_REVENUE && playerIndustryShare(world, industry) >= ANTITRUST_SHARE_THRESHOLD) {
      return true;
    }
  }
  return false;
}
