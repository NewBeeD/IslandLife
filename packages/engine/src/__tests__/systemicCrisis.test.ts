import { describe, expect, it } from 'vitest';
import type { WorldState } from '@island/shared';
import {
  assessLoanApplication,
  buildWorld,
  simulateOneMonth,
  systemicImportance,
  systemicShockMagnitude,
  SYSTEMIC_IMPORTANCE_THRESHOLD,
} from '../index';

const bank = (w: WorldState, id: string) => w.banks.find((b) => b.id === id)!;

// Force a bank to fail by souring its whole loan book (nplRatio → 1 → INSOLVENT).
function failBank(w: WorldState, bankId: string): void {
  const loans = [
    ...w.agents.flatMap((a) => a.loans),
    ...w.companies.flatMap((c) => c.loans),
  ].filter((l) => l.bankId === bankId);
  for (const l of loans) l.status = 'DEFAULT';
}

function warmed(seed = 42, months = 12): WorldState {
  const w = buildWorld(seed, { population: 200 });
  for (let i = 0; i < months; i++) simulateOneMonth(w);
  return w;
}

describe('P20.3 — interbank linkage & systemic importance', () => {
  it('a bank’s systemic importance is its share of system assets; only big nodes shock', () => {
    const w = buildWorld(42, { population: 200 });
    const ncb = systemicImportance(bank(w, 'NCB'), w.banks);
    const rbtt = systemicImportance(bank(w, 'RBTT'), w.banks);
    const cu = systemicImportance(bank(w, 'CREDIT_UNION_DM'), w.banks);
    expect(ncb).toBeGreaterThan(rbtt);
    expect(rbtt).toBeGreaterThan(cu);
    // The largest is systemically important; the credit union is not.
    expect(ncb).toBeGreaterThan(SYSTEMIC_IMPORTANCE_THRESHOLD);
    expect(cu).toBeLessThan(SYSTEMIC_IMPORTANCE_THRESHOLD);
    expect(systemicShockMagnitude(ncb)).toBeGreaterThan(0);
    expect(systemicShockMagnitude(cu)).toBe(0);
  });
});

describe('P20.3 — the largest bank failing freezes credit system-wide', () => {
  it('injects a systemic shock and contracts a SOLVENT third-party bank’s appetite', () => {
    const w = warmed();
    // A precondition: the bank we fail actually has a book to sour.
    const ncbLoans = [...w.agents.flatMap((a) => a.loans), ...w.companies.flatMap((c) => c.loans)]
      .filter((l) => l.bankId === 'NCB').length;
    expect(ncbLoans).toBeGreaterThan(0);

    const rbttBefore = bank(w, 'RBTT').lendingAppetite;
    failBank(w, 'NCB');
    simulateOneMonth(w);

    expect(w.macro.systemicStress).toBeGreaterThan(0);
    // RBTT is solvent yet its line is cut — the interbank freeze reaches solvent firms.
    expect(bank(w, 'RBTT').state).not.toBe('INSOLVENT');
    expect(bank(w, 'RBTT').lendingAppetite).toBeLessThan(rbttBefore);
  });

  it('dries up refinancing — a solvent borrower is offered less than in the calm control', () => {
    const control = warmed();
    const crisis = warmed();
    failBank(crisis, 'NCB');
    simulateOneMonth(crisis);
    simulateOneMonth(control); // advance the control the same one month, no failure

    const ask = 20_000;
    const calm = assessLoanApplication(control, control.player, ask, 36);
    const tight = assessLoanApplication(crisis, crisis.player, ask, 36);
    // The same borrower and the same ask: credit is harder in the crunch (a smaller
    // offer, or a higher rate, or an outright decline).
    const worse =
      tight.approvedPrincipal < calm.approvedPrincipal ||
      tight.interestRate > calm.interestRate ||
      (tight.outcome === 'DECLINED' && calm.outcome !== 'DECLINED');
    expect(worse).toBe(true);
  });
});

describe('P20.3 — a small bank failing does not', () => {
  it('leaves systemic stress at zero and solvent banks’ appetite untouched', () => {
    const w = warmed();
    const cuLoans = [...w.agents.flatMap((a) => a.loans), ...w.companies.flatMap((c) => c.loans)]
      .filter((l) => l.bankId === 'CREDIT_UNION_DM').length;
    expect(cuLoans).toBeGreaterThan(0); // it really does fail…

    const ncbBefore = bank(w, 'NCB').lendingAppetite;
    const rbttBefore = bank(w, 'RBTT').lendingAppetite;
    failBank(w, 'CREDIT_UNION_DM');
    simulateOneMonth(w);

    expect(bank(w, 'CREDIT_UNION_DM').state).toBe('INSOLVENT'); // …it did fail
    expect(w.macro.systemicStress).toBe(0); // …but no island-wide freeze
    expect(bank(w, 'NCB').lendingAppetite).toBeCloseTo(ncbBefore, 6);
    expect(bank(w, 'RBTT').lendingAppetite).toBeCloseTo(rbttBefore, 6);
  });
});

describe('P20.3 — deterministic per seed', () => {
  it('the crisis reproduces', () => {
    const run = () => {
      const w = warmed(7);
      failBank(w, 'NCB');
      simulateOneMonth(w);
      return w.macro.systemicStress;
    };
    expect(run()).toBe(run());
  });
});
