import { describe, expect, it } from 'vitest';
import { buildWorld } from '@island/engine';
import type { Loan } from '@island/shared';
import { toMoneyDTO } from '../projection';

// PHASE 14 (P14.3) — the Money view shows paid-to-date vs remaining per loan, and a
// fully-repaid loan drops off the debts list. The player's own books, so the loan's
// figures are shown in full.

function loan(over: Partial<Loan>): Loan {
  return {
    id: 'L1', bankId: 'NCB', borrowerPersonId: 'P', principal: 12000,
    remainingPrincipal: 9000, interestRate: 0.1, monthlyPayment: 553,
    termMonths: 24, originMonth: 0, status: 'ACTIVE', ...over,
  };
}

describe('P14.3 — paid-to-date and remaining on the money view', () => {
  it('projects loanId, principal, remaining, and paid-to-date per active loan', () => {
    const world = buildWorld(7, { population: 60 });
    world.player.loans.push(loan({ principal: 12000, remainingPrincipal: 9000 }));
    const money = toMoneyDTO(world);
    const debt = money.debts.find((d) => d.loanId === 'L1')!;
    expect(debt).toBeDefined();
    expect(debt.principal).toBe(12000);
    expect(debt.remaining).toBe(9000);
    expect(debt.paidToDate).toBe(3000); // principal − remaining
  });

  it('drops a PAID loan off the debts list', () => {
    const world = buildWorld(7, { population: 60 });
    world.player.loans.push(loan({ status: 'PAID', remainingPrincipal: 0, monthlyPayment: 0 }));
    const money = toMoneyDTO(world);
    expect(money.debts.find((d) => d.loanId === 'L1')).toBeUndefined();
  });
});
