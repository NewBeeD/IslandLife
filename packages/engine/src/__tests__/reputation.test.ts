import { describe, expect, it } from 'vitest';
import type { Venture, WorldState } from '@island/shared';
import {
  applyVentureScandal,
  assessLoanApplication,
  buildWorld,
  financialReliabilityOf,
  recoverVentureReputations,
  reputationBand,
  simulateOneMonth,
  updateReputation,
  ventureGrossIncome,
} from '../index';

function warmed(seed = 7, months = 6): WorldState {
  const w = buildWorld(seed, { population: 120 });
  for (let i = 0; i < months; i++) simulateOneMonth(w);
  return w;
}

// Give the player one active ACTIVE loan and a clean footing, so a default is a real
// event the ledger can see.
function giveActiveLoan(w: WorldState): void {
  const p = w.player;
  p.loans.push({
    id: `LOAN_REP_${w.month}`,
    bankId: 'NCB',
    borrowerPersonId: p.id,
    principal: 8000,
    remainingPrincipal: 8000,
    interestRate: 0.1,
    monthlyPayment: 400,
    termMonths: 24,
    originMonth: w.month,
    status: 'ACTIVE',
  });
}

describe('P21.1 — the reputation ledger', () => {
  it('is neutral for a fresh player and byte-identical for NPCs', () => {
    const w = warmed();
    // Every band reads neutral through the helpers when there is no meaningful history.
    expect(financialReliabilityOf(w.agents.find((a) => !a.isPlayer)!)).toBe(0.5);
    // The player's ledger materialised over the run and sits near neutral (no events).
    const rel = financialReliabilityOf(w.player);
    expect(rel).toBeGreaterThan(0.4);
    expect(rel).toBeLessThan(0.6);
  });

  it('one default tanks financial reliability immediately; it recovers only over months', () => {
    const w = warmed();
    giveActiveLoan(w);
    updateReputation(w); // register the clean, serviced loan first
    const before = financialReliabilityOf(w.player);

    // The loan defaults this month.
    w.player.loans[w.player.loans.length - 1]!.status = 'DEFAULT';
    updateReputation(w);
    const after = financialReliabilityOf(w.player);

    // Sharp, immediate drop.
    expect(after).toBeLessThan(before - 0.2);
    expect(reputationBand(after)).toMatch(/SHAKY|POOR/);

    // Recovery is slow: many clean months to climb back near neutral, and the default
    // is charged only once (a later month does not re-tank it).
    giveActiveLoan(w);
    let months = 0;
    while (financialReliabilityOf(w.player) < 0.45 && months < 60) {
      updateReputation(w);
      months += 1;
    }
    expect(months).toBeGreaterThan(6); // not a one-month bounce-back
    expect(months).toBeLessThan(60);
  });

  it('is deterministic per seed', () => {
    const a = warmed(21, 10);
    const b = warmed(21, 10);
    expect(financialReliabilityOf(a.player)).toBe(financialReliabilityOf(b.player));
  });
});

describe('P21.2 — reputation feeds the systems', () => {
  it('after a default the bank charges more and lends less than to a clean borrower', () => {
    const clean = warmed(33);
    const p = clean.player;
    p.employmentStatus = 'SELF_EMPLOYED';
    p.occupation = 'FISHING';
    p.monthlyIncome = 2500;
    p.cash = 6000;

    const cleanQuote = assessLoanApplication(clean, p, 6000, 36);

    // A parallel world where the same borrower has tanked their financial reputation.
    const soured = warmed(33);
    const q = soured.player;
    q.employmentStatus = 'SELF_EMPLOYED';
    q.occupation = 'FISHING';
    q.monthlyIncome = 2500;
    q.cash = 6000;
    q.reputation = {
      financialReliability: 0.15,
      fairDealing: 0.3,
      employerQuality: 0.5,
      civicStanding: 0.5,
      seenKeptPromises: q.keptPromises,
      seenBrokenContracts: q.brokenContracts,
    };
    const souredQuote = assessLoanApplication(soured, q, 6000, 36);

    // A soured name is charged a higher rate and offered no more than the clean one.
    expect(souredQuote.interestRate).toBeGreaterThan(cleanQuote.interestRate);
    expect(souredQuote.approvedPrincipal).toBeLessThanOrEqual(cleanQuote.approvedPrincipal);
  });
});

describe('P21.3 — markets remember (A19)', () => {
  it('a scandal cuts a venture’s take and it recovers only slowly after the cause is fixed', () => {
    const w = warmed(5);
    const venture: Venture = {
      id: 'VEN_SCANDAL',
      industry: 'RETAIL',
      label: 'the roadside stand',
      incomeMode: 'SPOT',
      spotBaseIncome: 3000,
      standingContract: null,
      outputScale: 1,
      monthlyOperatingCosts: 200,
      assets: [],
      status: 'ACTIVE',
    };
    const parish = w.player.parish;
    const cleanTake = ventureGrossIncome(w, parish, venture);

    applyVentureScandal(venture);
    const scandalTake = ventureGrossIncome(w, parish, venture);
    expect(scandalTake).toBeLessThan(cleanTake); // demand cut sharply

    // The cause is fixed, but recovery lags: it takes many months to come back to whole.
    w.player.ventures = [venture];
    let months = 0;
    while ((venture.customerReputation ?? 1) < 0.98 && months < 40) {
      recoverVentureReputations(w);
      months += 1;
    }
    expect(months).toBeGreaterThan(6); // a lingering shadow, not an instant fix
  });
});
