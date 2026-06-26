import type {
  Company,
  CompanyStatus,
  Good,
  Market,
  WorldEvent,
  WorldState,
} from '@island/shared';

export function computeCompanyRevenue(
  company: Company,
  markets: Market[],
  events: WorldEvent[],
  goods: Good[],
): number {
  // Markets are keyed by good; match on the good's category (== industry).
  const market = markets.find((m) => {
    const good = goods.find((g) => g.id === m.goodId);
    return good?.category === company.industry && m.parish === company.parish;
  });
  if (!market) return 0;

  const baseRevenue = market.currentPrice * company.monthlyOutputUnits;
  // Larger market share = slightly steadier revenue. Centered near 1.0 so it does
  // not systematically haircut small firms below their seed margin (the 0.8 base
  // in the design doc turned thin-but-viable firms structurally loss-making).
  const stabilityFactor = 0.95 + company.marketShare * 0.1;

  let eventImpact = 1.0;
  for (const event of events) {
    if (event.affectedIndustries.includes(company.industry)) {
      eventImpact -= event.severity * 0.35;
    }
  }

  return baseRevenue * stabilityFactor * Math.max(eventImpact, 0.1);
}

// Pure: status from the loss streak only. Cascades run in applyClosureCascade.
export function checkCompanySolvency(consecutiveLossMonths: number): {
  status: CompanyStatus;
} {
  if (consecutiveLossMonths >= 6) return { status: 'CLOSED' };
  if (consecutiveLossMonths >= 3) return { status: 'DISTRESSED' };
  return { status: 'HEALTHY' };
}

// Runs once on the transition into CLOSED, acting on live world entities.
export function applyClosureCascade(company: Company, world: WorldState): void {
  // 1. Employees become unemployed (live agents -> Phase 8 counts them).
  for (const emp of company.employees) {
    emp.employmentStatus = 'UNEMPLOYED';
    emp.monthlyIncome = 0;
    emp.employer = null;
  }
  company.employees = [];

  // 2. Loans default. Do not touch bank NPL here — Phase 7 recomputes it.
  for (const loan of company.loans) loan.status = 'DEFAULT';

  // 4. Tax handled by Phase 8 (closed company drops out of computeTaxRevenue).

  // 5. Parish property values soften slightly.
  const parish = world.parishes.find((p) => p.id === company.parish);
  if (parish) parish.propertyValueIndex *= 0.98;
}
