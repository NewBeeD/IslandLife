import type { WorldState } from '@island/shared';

// A cheap, stable scalar digest of the world. Used by the determinism test and
// the CLI. Avoids JSON.stringify (the entity graph has cycles: agent.employer
// <-> company.employees).
export function worldDigest(world: WorldState): number {
  let h = 2166136261 >>> 0; // FNV-1a basis
  const mix = (n: number): void => {
    // fold a float into the hash via its rounded integer representation
    const v = Math.round(n * 1000) | 0;
    h ^= v;
    h = Math.imul(h, 16777619) >>> 0;
  };

  mix(world.month);
  for (const a of world.agents) {
    mix(a.cash);
    mix(a.monthlyIncome);
    mix(a.neuroticism);
    mix(a.employmentStatus.length); // cheap categorical contribution
  }
  for (const c of world.companies) {
    mix(c.monthlyRevenue);
    mix(c.profit);
    mix(c.consecutiveLossMonths);
    mix(c.status.length);
  }
  for (const b of world.banks) {
    mix(b.nonPerformingLoanRatio);
    mix(b.lendingAppetite);
  }
  mix(world.government.unemploymentRate);
  mix(world.government.monthlyTaxRevenue);
  mix(world.playerLegacy.wealthScore);
  return h >>> 0;
}
