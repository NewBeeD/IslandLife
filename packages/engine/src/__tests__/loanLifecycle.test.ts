import { describe, expect, it } from 'vitest';
import {
  amortize,
  amortizeLoanMonth,
  buildWorld,
  LoanError,
  loanPaymentDue,
  repayLoan,
  setLoanInstallment,
  simulateOneMonth,
} from '../index';
import type { Loan, WorldState } from '@island/shared';

// PHASE 14 — loan lifecycle. Until now the monthly loop subtracted a loan's payment
// from cash but never paid the principal down, so balances never fell and a repaid
// loan lingered forever still charging. These tests pin the fix: loans amortize and
// close, and the player can pay one off early or resize the installment.

// A solvent player who can comfortably service a loan, with one loan attached.
function playerWithLoan(loan: Partial<Loan>, seed = 7): WorldState {
  const world = buildWorld(seed, { population: 60 });
  const p = world.player;
  p.occupation = 'FISHING';
  p.employmentStatus = 'EMPLOYED';
  p.employer = null;
  p.monthlyIncome = 6000;
  p.monthlyLivingCosts = 800;
  p.cash = 40000;
  const principal = loan.principal ?? 12000;
  const interestRate = loan.interestRate ?? 0.1;
  const termMonths = loan.termMonths ?? 24;
  p.loans.push({
    id: 'LOAN_TEST',
    bankId: 'NCB',
    borrowerPersonId: p.id,
    principal,
    remainingPrincipal: loan.remainingPrincipal ?? principal,
    interestRate,
    monthlyPayment: loan.monthlyPayment ?? Math.round(amortize(principal, interestRate, termMonths)),
    termMonths,
    originMonth: loan.originMonth ?? world.month,
    status: 'ACTIVE',
    ...loan,
  });
  return world;
}

function theLoan(world: WorldState): Loan {
  return world.player.loans.find((l) => l.id === 'LOAN_TEST')!;
}

describe('amortizeLoanMonth / loanPaymentDue (pure)', () => {
  it('splits a payment into interest and principal and pays the balance down', () => {
    const loan: Loan = {
      id: 'L', bankId: 'NCB', principal: 12000, remainingPrincipal: 12000,
      interestRate: 0.12, monthlyPayment: 600, termMonths: 24, originMonth: 0, status: 'ACTIVE',
    };
    const due = loanPaymentDue(loan);
    const paid = amortizeLoanMonth(loan);
    expect(paid).toBe(600);
    expect(due).toBe(600);
    // interest = 12000 * 0.12/12 = 120; principal paid = 600 − 120 = 480.
    expect(loan.remainingPrincipal).toBeCloseTo(11520, 6);
    expect(loan.status).toBe('ACTIVE');
  });

  it('closes the loan on the final payment and charges only the balance', () => {
    // A balance smaller than one level payment of principal: the next payment clears it.
    const loan: Loan = {
      id: 'L', bankId: 'NCB', principal: 1000, remainingPrincipal: 300,
      interestRate: 0.12, monthlyPayment: 600, termMonths: 12, originMonth: 0, status: 'ACTIVE',
    };
    const due = loanPaymentDue(loan); // min(600, 300 + 3) = 303
    expect(due).toBeCloseTo(303, 6);
    const paid = amortizeLoanMonth(loan);
    expect(paid).toBeCloseTo(303, 6);
    expect(loan.remainingPrincipal).toBe(0);
    expect(loan.status).toBe('PAID');
    expect(loan.monthlyPayment).toBe(0);
    // A PAID loan costs nothing further.
    expect(loanPaymentDue(loan)).toBe(0);
    expect(amortizeLoanMonth(loan)).toBe(0);
  });
});

describe('P14.1 — loans amortize and close in the monthly loop', () => {
  it("a player loan's remaining principal falls each month", () => {
    const world = playerWithLoan({ principal: 12000, interestRate: 0.1, termMonths: 24 });
    const start = theLoan(world).remainingPrincipal;
    simulateOneMonth(world);
    const after1 = theLoan(world).remainingPrincipal;
    expect(after1).toBeLessThan(start);
    simulateOneMonth(world);
    expect(theLoan(world).remainingPrincipal).toBeLessThan(after1);
  });

  it('flips to PAID on the final payment and then stops charging cash', () => {
    const world = playerWithLoan({ principal: 3000, interestRate: 0.1, termMonths: 4 });
    for (let i = 0; i < 4; i++) simulateOneMonth(world);
    const loan = theLoan(world);
    expect(loan.status).toBe('PAID');
    expect(loan.remainingPrincipal).toBe(0);
    expect(loan.monthlyPayment).toBe(0);

    // Once PAID, advancing a further month deducts no loan payment: the only outflows
    // are spending, so cash falls by less than the old payment would have taken.
    const cashBefore = world.player.cash;
    simulateOneMonth(world);
    const drop = cashBefore + world.player.monthlyIncome - world.player.cash;
    expect(drop).toBeLessThan(world.player.monthlyIncome); // income outpaced spending; no loan charge
    expect(theLoan(world).remainingPrincipal).toBe(0);
  });
});

describe('P14.2 — pay off early & resize installments', () => {
  it('a partial lump sum reduces the balance, shortens the term, and costs cash', () => {
    const world = playerWithLoan({ principal: 12000, interestRate: 0.1, termMonths: 24 });
    const loan = theLoan(world);
    const cashBefore = world.player.cash;
    const termBefore = loan.termMonths;
    repayLoan(world, loan.id, 4000);
    expect(loan.remainingPrincipal).toBeCloseTo(8000, 6);
    expect(world.player.cash).toBe(cashBefore - 4000);
    expect(loan.status).toBe('ACTIVE');
    expect(loan.termMonths).toBeLessThan(termBefore); // the payoff date came forward
  });

  it('a lump sum that covers the balance closes the loan and charges only what was owed', () => {
    const world = playerWithLoan({ principal: 5000, interestRate: 0.1, termMonths: 24 });
    const loan = theLoan(world);
    const cashBefore = world.player.cash; // 40000, comfortably more than the balance
    repayLoan(world, loan.id, 6000); // more than the 5000 owed, but within cash
    expect(loan.status).toBe('PAID');
    expect(loan.remainingPrincipal).toBe(0);
    expect(loan.monthlyPayment).toBe(0);
    expect(world.player.cash).toBe(cashBefore - 5000); // only the balance, not the asked amount
  });

  it('rejects a repayment with no cash, a non-positive amount, or a missing loan', () => {
    const world = playerWithLoan({ principal: 8000 });
    const loan = theLoan(world);
    world.player.cash = 100;
    expect(() => repayLoan(world, loan.id, 4000)).toThrow(LoanError);
    expect(() => repayLoan(world, loan.id, 0)).toThrow(LoanError);
    expect(() => repayLoan(world, 'NOPE', 100)).toThrow(LoanError);
  });

  it('raising the installment shortens the term; lowering it lengthens it', () => {
    const base = playerWithLoan({ principal: 12000, interestRate: 0.1, termMonths: 36 });
    const baseTerm = theLoan(base).termMonths;

    const higher = playerWithLoan({ principal: 12000, interestRate: 0.1, termMonths: 36 });
    setLoanInstallment(higher, theLoan(higher).id, theLoan(higher).monthlyPayment + 200);
    expect(theLoan(higher).termMonths).toBeLessThan(baseTerm);

    const lower = playerWithLoan({ principal: 12000, interestRate: 0.1, termMonths: 36 });
    setLoanInstallment(lower, theLoan(lower).id, theLoan(lower).monthlyPayment - 100);
    expect(theLoan(lower).termMonths).toBeGreaterThan(baseTerm);
  });

  it('rejects an installment that would not cover the monthly interest', () => {
    const world = playerWithLoan({ principal: 12000, interestRate: 0.12, termMonths: 36 });
    const loan = theLoan(world);
    const interestFloor = Math.ceil((loan.remainingPrincipal * loan.interestRate) / 12); // 120
    expect(() => setLoanInstallment(world, loan.id, interestFloor)).toThrow(LoanError);
    expect(() => setLoanInstallment(world, loan.id, interestFloor - 50)).toThrow(LoanError);
  });
});
