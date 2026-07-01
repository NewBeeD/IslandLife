import { describe, expect, it } from 'vitest';
import {
  amortize,
  applyUpgradeFinancing,
  assessLoanApplication,
  buildWorld,
  quoteUpgradeFinancing,
  simulateOneMonth,
  surfaceOpportunities,
  updatePlayerIncome,
} from '../index';
import type { Loan, WorldState } from '@island/shared';

// A self-employed fisher with enough experience to be offered the bigger boat.
function fisherReadyToGrow(seed = 21): WorldState {
  const world = buildWorld(seed, { population: 60 });
  const p = world.player;
  p.occupation = 'FISHING';
  p.employmentStatus = 'SELF_EMPLOYED';
  p.parish = 'SAINT_JOHN';
  p.socialCapitalLocal = 0.1; // below the Eunice threshold, so only the upgrade surfaces
  p.experience.fishing = 0.3; // past the tier-1 gate
  p.monthlyIncome = 1600;
  p.cash = 12000;
  world.month = 4;
  return world;
}

function fishingUpgrade(world: WorldState) {
  return world.opportunities.find((o) => o.kind === 'ASSET_UPGRADE');
}

describe('amortization', () => {
  it('matches the closed-form payment and zero-rate fallback', () => {
    // 10,000 over 12 months at 0% is exactly 1/12 each.
    expect(amortize(12000, 0, 12)).toBeCloseTo(1000, 6);
    // A positive rate costs more than the straight-line principal.
    expect(amortize(12000, 0.12, 12)).toBeGreaterThan(1000);
    expect(amortize(0, 0.1, 12)).toBe(0);
  });
});

describe('the upgrade ladder always offers a self-employed trade a way to grow', () => {
  it('surfaces a bigger-boat opportunity to an experienced fisher', () => {
    const world = fisherReadyToGrow();
    surfaceOpportunities(world);
    const opp = fishingUpgrade(world);
    expect(opp).toBeDefined();
    expect(opp!.upgrade?.assetPrice).toBeGreaterThan(0);
    expect(opp!.status).toBe('OPEN');
  });

  it('does not offer an upgrade to a fisher with no experience yet', () => {
    const world = fisherReadyToGrow();
    world.player.experience.fishing = 0.05; // below every tier gate
    surfaceOpportunities(world);
    expect(fishingUpgrade(world)).toBeUndefined();
  });

  it('does not offer an upgrade to an employed wage worker', () => {
    const world = fisherReadyToGrow();
    world.player.employmentStatus = 'EMPLOYED';
    surfaceOpportunities(world);
    expect(fishingUpgrade(world)).toBeUndefined();
  });
});

describe('bank financing — approve, counter, decline', () => {
  it('approves a sound application and prices it', () => {
    const world = fisherReadyToGrow();
    const a = assessLoanApplication(world, world.player, 8000, 48, 28000);
    expect(a.outcome).toBe('APPROVED');
    expect(a.approvedPrincipal).toBe(8000);
    expect(a.monthlyPayment).toBeGreaterThan(0);
    expect(a.interestRate).toBeGreaterThan(0);
  });

  it('counters an over-ask with a smaller amount that fits the income', () => {
    const world = fisherReadyToGrow();
    world.player.monthlyIncome = 1400;
    // Ask to borrow far more than the income can service.
    const a = assessLoanApplication(world, world.player, 60000, 36, 65000);
    expect(a.outcome).toBe('COUNTER');
    expect(a.approvedPrincipal).toBeGreaterThan(0);
    expect(a.approvedPrincipal).toBeLessThan(60000);
  });

  it('declines an applicant with no steady income', () => {
    const world = fisherReadyToGrow();
    world.player.employmentStatus = 'UNEMPLOYED';
    world.player.monthlyIncome = 0;
    const a = assessLoanApplication(world, world.player, 8000, 48, 28000);
    expect(a.outcome).toBe('DECLINED');
    expect(a.reason).toMatch(/steady income/i);
  });
});

describe('financing an upgrade changes the player’s economic state', () => {
  it('takes the down payment, books the loan, buys the asset, and raises output + costs', () => {
    const world = fisherReadyToGrow();
    surfaceOpportunities(world);
    const opp = fishingUpgrade(world)!;
    const price = opp.upgrade!.assetPrice;
    const cashBefore = world.player.cash;

    const quote = quoteUpgradeFinancing(world, opp.decisionId, 6000, 48);
    expect(quote.requestedLoan).toBe(price - 6000);
    expect(['APPROVED', 'COUNTER']).toContain(quote.outcome);

    const res = applyUpgradeFinancing(world, opp.decisionId, 6000, 48);
    expect(world.player.cash).toBe(cashBefore - res.downPayment);
    expect(world.player.loans.some((l) => l.status === 'ACTIVE')).toBe(true);
    expect(world.player.economicAssets.some((a) => a.id === opp.upgrade!.id)).toBe(true);
    expect(world.player.outputScale).toBeCloseTo(1 + opp.upgrade!.outputScaleDelta, 6);
    expect(world.player.monthlyOperatingCosts).toBe(opp.upgrade!.operatingCostDelta);
    expect(world.player.incomeMode).toBe('SPOT');
    expect(opp.status).toBe('ACCEPTED');
  });

  it('does not re-offer a rung the player already owns', () => {
    const world = fisherReadyToGrow();
    surfaceOpportunities(world);
    const opp = fishingUpgrade(world)!;
    applyUpgradeFinancing(world, opp.decisionId, 6000, 48);
    // Even past the cooldown, the same tier-1 boat is not offered again.
    world.month += 6;
    surfaceOpportunities(world);
    const open = world.opportunities.filter(
      (o) => o.kind === 'ASSET_UPGRADE' && o.status === 'OPEN' && o.upgrade?.id === opp.upgrade!.id,
    );
    expect(open).toHaveLength(0);
  });
});

describe('a bigger boat is more income in season and a squeeze out of it', () => {
  it('earns more at the seasonal peak than it loses to fixed costs, and bites in the trough', () => {
    const world = fisherReadyToGrow();
    surfaceOpportunities(world);
    const opp = fishingUpgrade(world)!;
    applyUpgradeFinancing(world, opp.decisionId, 6000, 48);

    const fishMarket = world.markets.find(
      (m) => m.goodId === 'FRESH_FISH_LOCAL' && m.parish === world.player.parish,
    )!;
    const base = world.player.spotBaseIncome!;
    const scale = world.player.outputScale!;

    // Peak price → income scales up well past the un-upgraded base.
    fishMarket.currentPrice = 8.5 * 1.8;
    updatePlayerIncome(world);
    expect(world.player.monthlyIncome).toBeGreaterThan(Math.round(base * scale));

    // Trough price → income falls hard while the loan payment + upkeep do not.
    fishMarket.currentPrice = 8.5 * 0.5;
    updatePlayerIncome(world);
    expect(world.player.monthlyIncome).toBeLessThan(base);
    expect(world.player.monthlyOperatingCosts!).toBeGreaterThan(0);
  });
});

describe('the player rides arrears before defaulting (a seasonal trade is survivable)', () => {
  it('accrues arrears across lean months instead of defaulting on the first', () => {
    const world = fisherReadyToGrow();
    surfaceOpportunities(world);
    const opp = fishingUpgrade(world)!;
    applyUpgradeFinancing(world, opp.decisionId, 6000, 48);

    // Strip the player to the bone: no cash buffer, no income — every month is short.
    world.player.cash = 0;
    world.player.monthlyIncome = 0;
    world.player.incomeMode = undefined; // hold income at 0 (skip the market recompute)

    simulateOneMonth(world);
    expect(world.player.loanArrearsMonths).toBe(1);
    expect(world.player.loans.every((l) => l.status === 'ACTIVE')).toBe(true);
  });

  it('defaults only the loans needed to close the gap, sparing an affordable one', () => {
    const world = buildWorld(21, { population: 60 });
    const p = world.player;
    p.employmentStatus = 'SELF_EMPLOYED';
    p.employer = null;
    p.incomeMode = undefined;
    p.monthlyIncome = 1500;
    p.monthlyLivingCosts = 400;
    p.cash = 0;

    // A big bank loan the player can comfortably service (1500 income − ~1150 spending
    // at the P19.6 consumption curve − 300 payment ≈ +50), plus a small friend loan
    // whose 200 payment tips the month ~150 negative — coverable by defaulting it alone.
    const bankLoan: Loan = {
      id: 'LOAN_BANK', bankId: 'NCB', borrowerPersonId: p.id, principal: 20000,
      remainingPrincipal: 20000, interestRate: 0.1, monthlyPayment: 300, termMonths: 60,
      originMonth: 0, status: 'ACTIVE',
    };
    const friendLoan: Loan = {
      id: 'LOAN_FRIEND', bankId: 'FRIEND:NPC_1', borrowerPersonId: p.id, principal: 3000,
      remainingPrincipal: 3000, interestRate: 0.06, monthlyPayment: 200, termMonths: 18,
      originMonth: 0, status: 'ACTIVE',
    };
    p.loans = [bankLoan, friendLoan];

    // Three lean months: arrears builds, then default fires on the third.
    simulateOneMonth(world);
    simulateOneMonth(world);
    simulateOneMonth(world);

    // The affordable bank loan survives; only the friend loan (the smaller payment,
    // enough to cover the ~150 gap on its own) goes into default — not the whole book.
    expect(world.player.loans.find((l) => l.id === 'LOAN_BANK')?.status).toBe('ACTIVE');
    expect(world.player.loans.some((l) => l.id === 'LOAN_FRIEND' && l.status === 'ACTIVE')).toBe(
      false,
    );
  });
});
