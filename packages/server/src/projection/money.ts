import { gameDateLabel } from '@island/shared';
import { activeVentures, hasVentures, netWorthOf, ventureIncomeLines } from '@island/engine';
import type { AssetLine, DebtLine, MoneyDTO, MoneyLine, WorldState } from '@island/shared';
import { INCOME_LINE_LABEL, assetLabel, bankLabel } from './labels';

// GET /saves/:id/money — the Money view. Income and expense lines reconstructed to
// match what actually moved the player's cash this month (engine phase 5), plus
// assets, debts, and (Phase 7, the scoped S3 amendment) the player's own finances
// in full: asset values, each loan's interest rate + interest/principal split, and
// a derived net worth. The player is looking at their own books — but other
// people's hidden mechanics still never appear here.
export function toMoneyDTO(world: WorldState): MoneyDTO {
  const p = world.player;
  const activeLoans = p.loans.filter((l) => l.status === 'ACTIVE');
  const loanPayments = activeLoans.reduce((s, l) => s + l.monthlyPayment, 0);
  const operatingCosts = p.monthlyOperatingCosts ?? 0;

  // Income: a venture portfolio shows one line per active venture (they sum to the
  // player's monthly income); the single-stream player shows one occupation/wage
  // line (the Phase 7 behaviour). Reconciles with the engine's phase-5 cash math.
  const portfolio = hasVentures(p);
  const incomeLines: MoneyLine[] = [];
  if (portfolio) {
    for (const l of ventureIncomeLines(world)) {
      if (l.amount !== 0) incomeLines.push({ label: l.label, amount: Math.round(l.amount) });
    }
  } else {
    const income = p.employer ? (p.employer.isSolvent ? p.monthlyIncome : 0) : p.monthlyIncome;
    if (income > 0) {
      const label =
        p.employmentStatus === 'EMPLOYED'
          ? 'Wages'
          : p.occupation
            ? INCOME_LINE_LABEL[p.occupation]
            : 'Odd jobs';
      incomeLines.push({ label, amount: Math.round(income) });
    }
  }
  const incomeTotal = incomeLines.reduce((s, l) => s + l.amount, 0);
  // Mirror the engine's phase-5 spending model on the realised income.
  const surplus = Math.max(0, incomeTotal - p.monthlyLivingCosts);
  const spending = p.monthlyLivingCosts + 0.5 * surplus;

  const expenseLines: MoneyLine[] = [{ label: 'Food and household', amount: Math.round(p.monthlyLivingCosts) }];
  const dayToDay = Math.round(spending - p.monthlyLivingCosts);
  if (dayToDay >= 1) expenseLines.push({ label: 'Day-to-day spending', amount: dayToDay });
  if (portfolio) {
    for (const v of activeVentures(p)) {
      if (v.monthlyOperatingCosts >= 1) {
        expenseLines.push({ label: `Fuel and upkeep (${v.label})`, amount: Math.round(v.monthlyOperatingCosts) });
      }
    }
  } else if (operatingCosts >= 1) {
    expenseLines.push({ label: 'Fuel and upkeep', amount: Math.round(operatingCosts) });
  }
  for (const l of activeLoans) {
    expenseLines.push({ label: `Loan repayment (${bankLabel(l.bankId)})`, amount: Math.round(l.monthlyPayment) });
  }
  const expenseTotal = expenseLines.reduce((s, l) => s + l.amount, 0);

  // Assets the player owns directly plus those held by their active ventures (a
  // financed upgrade lands on its venture). Net worth (below) counts both.
  const ownedAssets = portfolio
    ? [...p.economicAssets, ...activeVentures(p).flatMap((v) => v.assets)]
    : p.economicAssets;
  const assets: AssetLine[] = ownedAssets.map((a) => ({
    label: assetLabel(a.type, a.size),
    ownership: 'Yours',
    value: Math.round(a.value),
  }));

  const debts: DebtLine[] = activeLoans.map((l) => {
    const interestPortion = (l.remainingPrincipal * l.interestRate) / 12;
    return {
      label: `${bankLabel(l.bankId)} loan`,
      remaining: Math.round(l.remainingPrincipal),
      principal: Math.round(l.principal),
      monthlyPayment: Math.round(l.monthlyPayment),
      interestRate: l.interestRate,
      interestPortion: Math.round(interestPortion),
      principalPortion: Math.max(0, Math.round(l.monthlyPayment - interestPortion)),
      monthsLeft: Math.max(0, l.termMonths - (world.month - l.originMonth)),
    };
  });

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
    netWorth: Math.round(netWorthOf(p)),
    notes,
  };
}
