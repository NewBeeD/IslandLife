import type { Bank, BankState, Industry, Loan, NPCAgent, WorldState } from '@island/shared';
import { clamp, clamp01 } from './rng';

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

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7 — player loan applications (the P-B3 player slice).
//
// A pure, deterministic credit model: given the world (banks, base rate) and an
// applicant, decide whether to lend, how much, and at what rate. Creditworthiness
// is hidden (the iceberg holds for the bank's view of you — `approvalScore` never
// crosses the wire); the player applies and finds out. An over-ask is met with a
// COUNTER (the bank offers a lesser amount that fits the risk), not only a flat no.
// ─────────────────────────────────────────────────────────────────────────────

// Standard fixed-rate amortization: the level monthly payment that retires
// `principal` over `termMonths` at an annual `annualRate`.
export function amortize(principal: number, annualRate: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = annualRate / 12;
  if (r <= 0) return principal / termMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

// The inverse: the largest principal whose level payment is `payment`.
function principalFromPayment(payment: number, annualRate: number, termMonths: number): number {
  if (payment <= 0 || termMonths <= 0) return 0;
  const r = annualRate / 12;
  if (r <= 0) return payment * termMonths;
  return (payment * (1 - Math.pow(1 + r, -termMonths))) / r;
}

export interface LoanAssessment {
  outcome: 'APPROVED' | 'COUNTER' | 'DECLINED';
  bankId: string;
  approvedPrincipal: number; // EC$ — what the bank will actually lend (≤ requested)
  interestRate: number; // annual
  monthlyPayment: number; // EC$/month for approvedPrincipal at this rate & term
  termMonths: number;
  reason: string; // plain-language, player-facing (no raw score)
}

// How steady, for credit purposes, each kind of income is. Drives the conservative
// income the bank is willing to lend against and the borrower-quality score.
function stabilityFactor(applicant: NPCAgent): number {
  switch (applicant.employmentStatus) {
    case 'EMPLOYED':
      return 0.9;
    case 'SELF_EMPLOYED':
      return 0.6;
    case 'INFORMAL':
      return 0.45;
    default:
      return 0; // UNEMPLOYED — nothing steady to lend against
  }
}

// Pick the bank most likely to serve this applicant: solvent, with appetite, and —
// for informal/self-employed borrowers — biased toward the credit union (low
// formal-sector bias). Deterministic (no RNG).
function chooseBank(world: WorldState, applicant: NPCAgent): Bank | null {
  const formal = applicant.employmentStatus === 'EMPLOYED';
  let best: Bank | null = null;
  let bestScore = -Infinity;
  for (const bank of world.banks) {
    if (bank.state === 'INSOLVENT' || bank.lendingAppetite <= 0) continue;
    const fit = formal ? bank.biasTowardFormalSector : 1 - bank.biasTowardFormalSector;
    const score = bank.lendingAppetite * (0.5 + 0.5 * fit);
    if (score > bestScore) {
      bestScore = score;
      best = bank;
    }
  }
  return best;
}

// Hidden borrower-quality score in [0,1] from job stability, institutional ties,
// payment history, cash, and collateral coverage. Never projected.
function creditScore(applicant: NPCAgent, requestedPrincipal: number, collateralValue: number): number {
  const stability = stabilityFactor(applicant);
  const history = clamp01(0.5 + 0.05 * applicant.keptPromises - 0.12 * applicant.brokenContracts);
  const cashFactor = clamp01(applicant.cash / (requestedPrincipal * 0.5 + 1));
  const collateralFactor = clamp01(collateralValue / (requestedPrincipal + 1));
  return clamp01(
    0.4 * stability +
      0.2 * clamp01(applicant.socialCapitalInstitutional) +
      0.15 * history +
      0.15 * cashFactor +
      0.1 * collateralFactor,
  );
}

// Assess a loan application. `collateralValue` is the worth of the asset being
// financed (an equipment/vehicle loan is secured by the thing it buys), which
// lowers the rate and raises the ceiling. Pure and deterministic — the financing
// quote endpoint calls this read-only.
export function assessLoanApplication(
  world: WorldState,
  applicant: NPCAgent,
  requestedPrincipal: number,
  termMonths: number,
  collateralValue = 0,
): LoanAssessment {
  const bank = chooseBank(world, applicant);
  const baseRate = world.country.baseInterestRate;
  const term = Math.max(1, Math.round(termMonths));

  // Paying cash (or nearly so): no loan to assess.
  if (requestedPrincipal <= 0) {
    return {
      outcome: 'APPROVED',
      bankId: bank?.id ?? '',
      approvedPrincipal: 0,
      interestRate: 0,
      monthlyPayment: 0,
      termMonths: term,
      reason: 'You are paying in full — no loan needed.',
    };
  }

  if (!bank) {
    return {
      outcome: 'DECLINED', bankId: '', approvedPrincipal: 0, interestRate: 0,
      monthlyPayment: 0, termMonths: term,
      reason: 'No bank is lending against this right now.',
    };
  }

  const score = creditScore(applicant, requestedPrincipal, collateralValue);
  const secured = collateralValue > 0;
  const interestRate = clamp(baseRate + (1 - score) * 0.14 - (secured ? 0.02 : 0), 0.06, 0.26);

  const conservativeIncome = applicant.monthlyIncome * stabilityFactor(applicant);
  if (conservativeIncome <= 0) {
    return {
      outcome: 'DECLINED', bankId: bank.id, approvedPrincipal: 0, interestRate, monthlyPayment: 0,
      termMonths: term,
      reason: 'You have no steady income the bank can lend against.',
    };
  }

  const existingPayments = applicant.loans
    .filter((l) => l.status === 'ACTIVE')
    .reduce((s, l) => s + l.monthlyPayment, 0);
  const dtiCap = 0.35 + 0.15 * score;
  const affordablePayment = conservativeIncome * dtiCap - existingPayments;
  if (affordablePayment < 50) {
    return {
      outcome: 'DECLINED', bankId: bank.id, approvedPrincipal: 0, interestRate, monthlyPayment: 0,
      termMonths: term,
      reason:
        existingPayments > 0
          ? 'You are already carrying about as much as your income will service.'
          : 'Your income is too unsteady to carry a payment on this amount.',
    };
  }

  const maxByIncome = principalFromPayment(affordablePayment, interestRate, term);
  // Secured lending: the bank won't lend more than a fraction of the asset's value.
  const maxLtv = 0.8 + 0.15 * score;
  const maxByCollateral = secured ? collateralValue * maxLtv : Infinity;
  let ceiling = Math.floor(Math.min(maxByIncome, maxByCollateral) / 100) * 100;
  // Bank appetite scales how much it will stretch.
  ceiling = Math.floor((ceiling * (0.7 + 0.6 * bank.lendingAppetite)) / 100) * 100;

  if (ceiling < 300) {
    return {
      outcome: 'DECLINED', bankId: bank.id, approvedPrincipal: 0, interestRate, monthlyPayment: 0,
      termMonths: term,
      reason: 'The amount the bank would lend you is too small to be worth the paperwork.',
    };
  }

  if (requestedPrincipal > ceiling) {
    return {
      outcome: 'COUNTER',
      bankId: bank.id,
      approvedPrincipal: ceiling,
      interestRate,
      monthlyPayment: Math.round(amortize(ceiling, interestRate, term)),
      termMonths: term,
      reason: 'The bank will not lend the full amount — but it will offer you a smaller loan. Put more down, or take the smaller step.',
    };
  }

  const principal = Math.round(requestedPrincipal / 100) * 100;
  return {
    outcome: 'APPROVED',
    bankId: bank.id,
    approvedPrincipal: principal,
    interestRate,
    monthlyPayment: Math.round(amortize(principal, interestRate, term)),
    termMonths: term,
    reason: 'Approved.',
  };
}

// Book an approved loan onto the borrower (the bank's exposure is recomputed in
// the monthly solvency phase). Returns the created loan.
export function originateLoan(
  world: WorldState,
  borrower: NPCAgent,
  bankId: string,
  principal: number,
  interestRate: number,
  monthlyPayment: number,
  termMonths: number,
  purposeIndustry?: Industry,
): Loan {
  const loan: Loan = {
    id: `LOAN_${borrower.id}_${world.month}_${Math.round(principal)}`,
    bankId,
    borrowerPersonId: borrower.id,
    principal,
    remainingPrincipal: principal,
    interestRate,
    monthlyPayment,
    termMonths,
    originMonth: world.month,
    purposeIndustry,
    status: 'ACTIVE',
  };
  borrower.loans.push(loan);
  return loan;
}
