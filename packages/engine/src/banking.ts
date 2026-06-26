import type { Bank, BankState, Loan } from '@island/shared';

// Recomputes a bank's non-performing-loan ratio from the live loan set and maps
// it to a state. Guards divide-by-zero (no active loans -> ratio 0).
export function checkBankSolvency(
  _bank: Bank,
  loans: Loan[],
): { status: BankState; nplRatio: number } {
  const active = loans.filter((l) => l.status === 'ACTIVE' || l.status === 'DEFAULT');
  const totalPrincipal = active.reduce((s, l) => s + l.principal, 0);
  const defaulted = active
    .filter((l) => l.status === 'DEFAULT')
    .reduce((s, l) => s + l.principal, 0);
  const nplRatio = totalPrincipal > 0 ? defaulted / totalPrincipal : 0;

  let status: BankState = 'HEALTHY';
  if (nplRatio > 0.25) status = 'INSOLVENT';
  else if (nplRatio > 0.15) status = 'DISTRESSED';
  else if (nplRatio > 0.08) status = 'STRESSED';

  return { status, nplRatio };
}
