import { GOODS, REPRESENTATIVE_GOOD, gameDateLabel } from '@island/shared';
import {
  activeVentures,
  friendBackerId,
  hasVentures,
  isFriendLoanBank,
  isWageIndustry,
  netWorthOf,
  playerShareOf,
  resaleQuote,
  ventureIncomeLines,
} from '@island/engine';
import type {
  AssetLine,
  DebtLine,
  Industry,
  MarketWatchLine,
  MoneyDTO,
  MoneyLine,
  OwnershipLine,
  WorldState,
} from '@island/shared';
import { INCOME_LINE_LABEL, assetLabel, bankLabel } from './labels';

// A loan's source as the player would name it: a bank by its short label, or a
// friend by name (Phase 11 friend-loans). Never exposes the synthetic bank id.
function loanSourceLabel(world: WorldState, bankId: string): string {
  if (isFriendLoanBank(bankId)) {
    const backer = world.agents.find((a) => a.id === friendBackerId(bankId));
    return backer ? backer.name : 'a friend';
  }
  return bankLabel(bankId);
}

// The player's ownership where outside backers/partners hold a share (Phase 11):
// ventures with equity holders and player-owned shared firms. Empty when everything
// is wholly the player's. The holders' hidden psychology never appears — only names
// and shares, as plain percentages.
function buildOwnership(world: WorldState): OwnershipLine[] {
  const p = world.player;
  const lines: OwnershipLine[] = [];
  const toLine = (
    label: string,
    holders: { name: string; share: number }[],
    yourShare: number,
  ): void => {
    lines.push({
      label,
      yourSharePct: Math.round(yourShare * 100),
      holders: holders.map((h) => ({ name: h.name, sharePct: Math.round(h.share * 100) })),
    });
  };
  for (const v of activeVentures(p)) {
    if (v.equityHolders && v.equityHolders.length > 0) toLine(v.label, v.equityHolders, playerShareOf(v));
  }
  for (const c of world.companies) {
    if (c.ownerId !== p.id || c.status === 'CLOSED') continue;
    const holders = c.equityHolders ?? [];
    if (holders.length === 0) continue;
    const outside = holders.reduce((s, h) => s + h.share, 0);
    toLine(c.name, holders, Math.max(0, 1 - outside));
  }
  return lines;
}

// The local market prices the player's SPOT income reads (P10.5). Market prices are
// public (the NEWSPAPER channel) — surfacing them lets the player see why a venture's
// income swings. Collected from the player's SPOT income sources, deduped by good.
function buildMarketWatch(world: WorldState): MarketWatchLine[] {
  const p = world.player;
  const industries: Industry[] = [];
  const add = (ind: Industry | null): void => {
    if (ind && !industries.includes(ind)) industries.push(ind);
  };
  // A wage worker's income is a day rate, not a market price, so it has no market-watch
  // line (Phase 15) — skip any wage-profile source.
  if (hasVentures(p)) {
    for (const v of activeVentures(p)) if (v.incomeMode !== 'STANDING' && !v.wageProfile) add(v.industry);
  } else if (p.incomeMode !== 'STANDING' && !(p.wageProfile && isWageIndustry(p.occupation))) {
    add(p.occupation);
  }

  const lines: MarketWatchLine[] = [];
  for (const industry of industries) {
    const goodId = REPRESENTATIVE_GOOD[industry];
    if (!goodId) continue;
    const good = GOODS.find((g) => g.id === goodId);
    const market = world.markets.find((m) => m.goodId === goodId && m.parish === p.parish);
    if (!good || !market) continue;
    const ratio = market.currentPrice / good.basePrice;
    const trend: MarketWatchLine['trend'] = ratio >= 1.15 ? 'STRONG' : ratio <= 0.85 ? 'WEAK' : 'TYPICAL';
    lines.push({ label: good.name, unit: good.unit, price: Math.round(market.currentPrice * 100) / 100, trend });
  }
  return lines;
}

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
  // Tuition while enrolled (Phase 9) — a real monthly line until the program ends.
  const enrolled = p.education?.enrolled;
  if (enrolled && enrolled.monthsRemaining > 0) {
    expenseLines.push({ label: 'Tuition', amount: Math.round(enrolled.monthlyCost) });
  }
  for (const l of activeLoans) {
    expenseLines.push({
      label: `Loan repayment (${loanSourceLabel(world, l.bankId)})`,
      amount: Math.round(l.monthlyPayment),
    });
  }
  const expenseTotal = expenseLines.reduce((s, l) => s + l.amount, 0);

  // Assets the player owns directly plus those held by their active ventures (a
  // financed upgrade lands on its venture). Net worth (below) counts both.
  const ownedAssets = portfolio
    ? [...p.economicAssets, ...activeVentures(p).flatMap((v) => v.assets)]
    : p.economicAssets;
  const assets: AssetLine[] = ownedAssets.map((a) => {
    const line: AssetLine = {
      id: a.id,
      label: assetLabel(a.type, a.size),
      ownership: 'Yours',
      value: Math.round(a.value),
    };
    // Phase 12: a pledged or already-listed asset cannot be sold; otherwise show what
    // a sale would fetch now (quick vs. patient), so the player can act from here.
    if (a.pledgedToLoanId) {
      line.pledged = true;
    } else if (a.listedForSale) {
      line.listedForSale = true;
    } else {
      const quick = resaleQuote(world, a.id, 'QUICK');
      const patient = resaleQuote(world, a.id, 'PATIENT');
      if (quick && patient) {
        line.resale = {
          quickPrice: quick.price,
          patientPrice: patient.price,
          settlesInMonths: patient.settlesInMonths,
        };
      }
    }
    return line;
  });

  const debts: DebtLine[] = activeLoans.map((l) => {
    const interestPortion = (l.remainingPrincipal * l.interestRate) / 12;
    return {
      loanId: l.id,
      label: `${loanSourceLabel(world, l.bankId)} loan`,
      remaining: Math.round(l.remainingPrincipal),
      principal: Math.round(l.principal),
      paidToDate: Math.max(0, Math.round(l.principal - l.remainingPrincipal)),
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
    marketWatch: buildMarketWatch(world),
    ownership: buildOwnership(world),
  };
}
