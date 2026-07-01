import type { ActivePolicy, Government, WorldState } from '@island/shared';
import { dominantCaptureExists } from './competition';

// Sums tax from operating (non-CLOSED) companies. A company that closed this
// month drops out automatically — which is why the closure cascade does not
// hand-decrement tax revenue.
export function computeTaxRevenue(world: WorldState): number {
  return world.companies
    .filter((c) => c.status !== 'CLOSED')
    .reduce((s, c) => s + c.estimatedAnnualTax / 12, 0);
}

export function governmentAct(gov: Government, world: WorldState): void {
  gov.monthlyTaxRevenue = computeTaxRevenue(world);
  gov.fiscalBalance = gov.monthlyTaxRevenue - gov.monthlySpending;

  // Age policies and retire expired ones so `duration` means something.
  gov.policies = gov.policies
    .map((p) => ({ ...p, duration: p.duration - 1 }))
    .filter((p) => p.duration > 0);

  const hasPolicy = (type: ActivePolicy['type']) => gov.policies.some((p) => p.type === type);

  if (gov.unemploymentRate > 0.15 && !hasPolicy('PUBLIC_WORKS_PROGRAM')) {
    gov.policies.push({
      type: 'PUBLIC_WORKS_PROGRAM', cost: 500_000, effect: 'EMPLOYMENT', magnitude: 200, duration: 6,
    });
  }

  const distressedBanks = world.banks.filter((b) => b.state === 'DISTRESSED' || b.state === 'INSOLVENT');
  if (distressedBanks.length > 0 && !hasPolicy('BANK_LIQUIDITY_SUPPORT')) {
    gov.policies.push({
      type: 'BANK_LIQUIDITY_SUPPORT',
      cost: (distressedBanks[0]?.totalAssets ?? 0) * 0.05,
      effect: 'BANK_STABILITY', magnitude: 0.2, duration: 3,
    });
  }

  if (gov.fiscalBalance < -gov.monthlyTaxRevenue * 0.3 && !hasPolicy('AUSTERITY')) {
    gov.policies.push({ type: 'AUSTERITY', cost: 0, effect: 'SPENDING_CUT', magnitude: 0.15, duration: 12 });
  }

  // Phase 20.4 (C9/P-B6): when a single operator — a firm or the player — captures a
  // parish×industry past the antitrust threshold, the government notices market capture
  // and opens scrutiny. Refreshed while the capture persists; it lapses once the
  // position is competed back down. The state end of "winning paints a target".
  if (dominantCaptureExists(world) && !hasPolicy('ANTITRUST')) {
    gov.policies.push({ type: 'ANTITRUST', cost: 0, effect: 'MARKET_SCRUTINY', magnitude: 0.1, duration: 6 });
  }
}
