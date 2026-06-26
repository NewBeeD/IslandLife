import { gameDateLabel } from '@island/shared';
import type { AssetLine, DebtLine, MoneyDTO, MoneyLine, WorldState } from '@island/shared';
import { INCOME_LINE_LABEL, assetLabel, bankLabel } from './labels';

// GET /saves/:id/money — the Money view. Income and expense lines reconstructed to
// match what actually moved the player's cash this month (engine phase 5), plus
// assets and debts. Deliberately omits: net worth, the loan interest rate, any
// forecast. The player does their own mental accounting (Player Experience doc).
export function toMoneyDTO(world: WorldState): MoneyDTO {
  const p = world.player;
  const activeLoans = p.loans.filter((l) => l.status === 'ACTIVE');
  const loanPayments = activeLoans.reduce((s, l) => s + l.monthlyPayment, 0);

  // Mirror the engine's phase-5 cash math so "in" and "out" reconcile with the
  // actual cash change: income, then living costs plus lifestyle creep on surplus.
  const income = p.employer ? (p.employer.isSolvent ? p.monthlyIncome : 0) : p.monthlyIncome;
  const surplus = Math.max(0, income - p.monthlyLivingCosts);
  const spending = p.monthlyLivingCosts + 0.5 * surplus;

  const incomeLines: MoneyLine[] = [];
  if (income > 0) {
    const label =
      p.employmentStatus === 'EMPLOYED'
        ? 'Wages'
        : p.occupation
          ? INCOME_LINE_LABEL[p.occupation]
          : 'Odd jobs';
    incomeLines.push({ label, amount: Math.round(income) });
  }
  const incomeTotal = incomeLines.reduce((s, l) => s + l.amount, 0);

  const expenseLines: MoneyLine[] = [{ label: 'Food and household', amount: Math.round(p.monthlyLivingCosts) }];
  const dayToDay = Math.round(spending - p.monthlyLivingCosts);
  if (dayToDay >= 1) expenseLines.push({ label: 'Day-to-day spending', amount: dayToDay });
  for (const l of activeLoans) {
    expenseLines.push({ label: `Loan repayment (${bankLabel(l.bankId)})`, amount: Math.round(l.monthlyPayment) });
  }
  const expenseTotal = expenseLines.reduce((s, l) => s + l.amount, 0);

  const assets: AssetLine[] = p.economicAssets.map((a) => ({
    label: assetLabel(a.type, a.size),
    ownership: 'Yours',
  }));

  const debts: DebtLine[] = activeLoans.map((l) => ({
    label: `${bankLabel(l.bankId)} loan`,
    remaining: Math.round(l.remainingPrincipal),
    monthlyPayment: Math.round(l.monthlyPayment),
    monthsLeft: Math.max(0, l.termMonths - (world.month - l.originMonth)),
  }));

  // Contextual prose, never "WARNING: DEFAULT RISK". If the payment won't clear
  // from cash on hand, say so plainly and leave the decision to the player.
  const notes: string[] = [];
  if (activeLoans.length > 0 && p.cash - loanPayments < 0) {
    notes.push(
      'You are short this month. The payment will not clear unless something changes before the month is out.',
    );
  }

  return {
    monthLabel: gameDateLabel(world.month),
    cashInHand: Math.round(p.cash),
    income: { lines: incomeLines, total: incomeTotal },
    expenses: { lines: expenseLines, total: expenseTotal },
    thisMonthDelta: incomeTotal - expenseTotal,
    assets,
    debts,
    notes,
  };
}
