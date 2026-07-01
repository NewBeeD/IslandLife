import type { Bank, BankState, Industry, Loan, NPCAgent, WorldState } from '@island/shared';
import { clamp, clamp01 } from './rng';
import { findBorrowerAsset } from './assets';
import { macroCreditMultiplier, macroInterestRate } from './macro';
import { financialReliabilityOf, NEUTRAL_REPUTATION } from './reputation';

// Phase 21: how strongly the borrower's financial reputation and their cultural capital
// bend the hidden credit score. Both are CENTRED on neutral (reputation 0.5, capital
// 0.5), so a borrower with no ledger (every NPC, a pre-Phase-21 player) and neutral
// capital prices exactly as before — the change is byte-identical until reputation moves.
const REPUTATION_CREDIT_WEIGHT = 0.3;
const CULTURAL_CREDIT_WEIGHT = 0.08;

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

// ── Interbank linkage & systemic importance (P20.3, A22) ─────────────────────
// Banks are nodes in an interbank web, and a bank's weight in that web is its share
// of total system assets — the claims the rest of the system holds on it. A big node
// failing freezes the interbank market and, through the macro loop (P20.2), credit
// island-wide; a small one is absorbed. We model the web through this single derived
// weight rather than a full N×N claims matrix (S8 — few well-connected variables).

// A bank holding at least this share of system assets is systemically important —
// below it, a failure is an isolated bankruptcy, not a crisis.
export const SYSTEMIC_IMPORTANCE_THRESHOLD = 0.25;

// A bank's share of total system assets — its weight in the interbank web.
export function systemicImportance(bank: Bank, banks: readonly Bank[]): number {
  const total = banks.reduce((s, b) => s + b.totalAssets, 0);
  return total > 0 ? bank.totalAssets / total : 0;
}

// The systemic-credit shock a bank's failure injects: nothing below the importance
// threshold (an isolated failure), scaling with its weight above it (a big node
// freezes more of the system). Deterministic.
export function systemicShockMagnitude(importance: number): number {
  return importance >= SYSTEMIC_IMPORTANCE_THRESHOLD ? importance : 0;
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

// ── Loan amortization in the monthly loop (Phase 14) ─────────────────────────
//
// Until Phase 14 the monthly loop subtracted a loan's `monthlyPayment` from cash but
// never paid the principal down, so a balance never fell and a fully-repaid loan
// lingered forever still charging. These two helpers fix that: `loanPaymentDue` is the
// read-only cash a loan needs this month (so the caller can total payments before
// deciding whether the borrower can cover them), and `amortizeLoanMonth` actually
// applies one month — splitting the level payment into interest and principal, paying
// the principal down, and closing the loan (PAID, payment zeroed) on its final payment.

// The monthly rate behind a loan's annual `interestRate`.
function monthlyRate(loan: Loan): number {
  return loan.interestRate / 12;
}

// The cash an ACTIVE loan requires this month, without mutating it. Mirrors what
// `amortizeLoanMonth` will charge: the level payment, except on the final payment,
// which is only the remaining balance plus its interest (so it is ≤ monthlyPayment).
// 0 for any non-ACTIVE loan.
export function loanPaymentDue(loan: Loan): number {
  if (loan.status !== 'ACTIVE') return 0;
  const interest = loan.remainingPrincipal * monthlyRate(loan);
  return Math.min(loan.monthlyPayment, loan.remainingPrincipal + interest);
}

// Apply one month of amortization to an ACTIVE loan: pay the principal down by the
// payment's principal portion and, on the final payment, zero the balance and flip the
// loan to PAID (clearing its payment so it stops charging). Returns the cash actually
// paid this month (≤ monthlyPayment). A no-op returning 0 for any non-ACTIVE loan.
export function amortizeLoanMonth(loan: Loan): number {
  if (loan.status !== 'ACTIVE') return 0;
  const interest = loan.remainingPrincipal * monthlyRate(loan);
  const principalPortion = loan.monthlyPayment - interest;
  if (principalPortion >= loan.remainingPrincipal) {
    // Final payment: only the remaining balance and its interest are still owed.
    const payment = loan.remainingPrincipal + interest;
    loan.remainingPrincipal = 0;
    loan.status = 'PAID';
    loan.monthlyPayment = 0;
    return payment;
  }
  loan.remainingPrincipal -= principalPortion;
  return loan.monthlyPayment;
}

// ── Player loan management: pay off early & resize installments (Phase 14) ───

export class LoanError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'INACTIVE' | 'BAD_AMOUNT' | 'INSUFFICIENT_CASH' | 'BELOW_FLOOR',
  ) {
    super(message);
    this.name = 'LoanError';
  }
}

// The number of level payments of `payment` it takes to retire `principal` at
// `annualRate`. Returns Infinity when the payment does not even cover the interest
// (so the balance would never fall) — callers reject that case.
function periodsToAmortize(principal: number, payment: number, annualRate: number): number {
  if (principal <= 0) return 0;
  if (payment <= 0) return Infinity;
  const r = annualRate / 12;
  if (r <= 0) return Math.ceil(principal / payment);
  const ratio = 1 - (r * principal) / payment;
  if (ratio <= 0) return Infinity; // payment ≤ interest — never amortizes
  return Math.ceil(-Math.log(ratio) / Math.log(1 + r));
}

function findPlayerLoan(world: WorldState, loanId: string): Loan {
  const loan = world.player.loans.find((l) => l.id === loanId);
  if (!loan) throw new LoanError(`loan ${loanId} not found`, 'NOT_FOUND');
  return loan;
}

// Pay a lump sum off a loan ahead of schedule (P14.2): the amount comes out of cash
// and off the remaining principal, closing the loan to PAID if it clears the balance.
// A partial payment keeps the installment and shortens the term. Throws on a missing/
// inactive loan, a non-positive amount, or insufficient cash. Returns the loan.
export function repayLoan(world: WorldState, loanId: string, amount: number): Loan {
  const p = world.player;
  const loan = findPlayerLoan(world, loanId);
  if (loan.status !== 'ACTIVE') throw new LoanError('That loan is no longer active.', 'INACTIVE');
  const requested = Math.floor(amount);
  if (requested <= 0) throw new LoanError('Enter an amount to pay.', 'BAD_AMOUNT');
  if (requested > Math.floor(p.cash)) throw new LoanError('You do not have that much cash.', 'INSUFFICIENT_CASH');

  const applied = Math.min(requested, loan.remainingPrincipal);
  p.cash -= applied;
  loan.remainingPrincipal -= applied;
  if (loan.remainingPrincipal <= 0) {
    loan.remainingPrincipal = 0;
    loan.status = 'PAID';
    loan.monthlyPayment = 0;
    return loan;
  }
  // Keep the agreed installment; the lump sum simply brings the payoff date forward.
  const elapsed = world.month - loan.originMonth;
  const n = periodsToAmortize(loan.remainingPrincipal, loan.monthlyPayment, loan.interestRate);
  if (Number.isFinite(n)) loan.termMonths = elapsed + n;
  return loan;
}

// Resize a loan's monthly installment (P14.2): raising it shortens the term, lowering
// it lengthens it. The new payment must clear at least the current month's interest
// (else the balance would never fall). Re-derives `termMonths`. Returns the loan.
export function setLoanInstallment(world: WorldState, loanId: string, newMonthlyPayment: number): Loan {
  const loan = findPlayerLoan(world, loanId);
  if (loan.status !== 'ACTIVE') throw new LoanError('That loan is no longer active.', 'INACTIVE');
  const payment = Math.round(newMonthlyPayment);
  const interestFloor = Math.ceil((loan.remainingPrincipal * loan.interestRate) / 12);
  if (payment <= interestFloor) {
    throw new LoanError('The payment has to at least cover the interest each month.', 'BELOW_FLOOR');
  }
  loan.monthlyPayment = payment;
  const elapsed = world.month - loan.originMonth;
  const n = periodsToAmortize(loan.remainingPrincipal, payment, loan.interestRate);
  loan.termMonths = elapsed + (Number.isFinite(n) ? n : 1);
  return loan;
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
// payment history, cash, and collateral coverage. Never projected. Phase 21: the bank
// remembers — the borrower's standing financial reputation (built over years, lost in a
// month) shifts the score, with a lighter cultural-capital bias. Both centred on neutral,
// so a borrower with no ledger prices exactly as before (P-B3's risk-priced rate lands).
function creditScore(applicant: NPCAgent, requestedPrincipal: number, collateralValue: number): number {
  const stability = stabilityFactor(applicant);
  const history = clamp01(0.5 + 0.05 * applicant.keptPromises - 0.12 * applicant.brokenContracts);
  const cashFactor = clamp01(applicant.cash / (requestedPrincipal * 0.5 + 1));
  const collateralFactor = clamp01(collateralValue / (requestedPrincipal + 1));
  const base =
    0.4 * stability +
    0.2 * clamp01(applicant.socialCapitalInstitutional) +
    0.15 * history +
    0.15 * cashFactor +
    0.1 * collateralFactor;
  const reputationBias =
    REPUTATION_CREDIT_WEIGHT * (financialReliabilityOf(applicant) - NEUTRAL_REPUTATION);
  const culturalBias = CULTURAL_CREDIT_WEIGHT * (applicant.culturalCapital - 0.5);
  return clamp01(base + reputationBias + culturalBias);
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
  // Phase 20: loans are priced off the island's *effective* rate — the country base
  // plus the macro spread that widens when defaults rise and credit tightens (the
  // rates → borrowing edge). Falls back to the country base when no macro is present.
  const baseRate = macroInterestRate(world);
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
  // Bank appetite scales how much it will stretch, and the macro credit cycle scales it
  // further (P20.2): when credit is tight island-wide the bank lends less against the
  // same borrower; when it is open, more. The multiplier is 1 at the resting baseline.
  const stretch = (0.7 + 0.6 * bank.lendingAppetite) * macroCreditMultiplier(world.macro);
  ceiling = Math.floor((ceiling * stretch) / 100) * 100;

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
// the monthly solvency phase). When `collateralAssetId` is given (Phase 12), the
// loan is secured: the named asset is pledged (marked so it cannot be sold) and is
// seized if the loan later defaults. Returns the created loan.
export function originateLoan(
  world: WorldState,
  borrower: NPCAgent,
  bankId: string,
  principal: number,
  interestRate: number,
  monthlyPayment: number,
  termMonths: number,
  purposeIndustry?: Industry,
  collateralAssetId?: string,
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
  if (collateralAssetId) {
    const asset = findBorrowerAsset(borrower, collateralAssetId);
    if (!asset) throw new Error(`originateLoan: collateral ${collateralAssetId} not found`);
    loan.collateralAssetId = collateralAssetId;
    asset.pledgedToLoanId = loan.id;
  }
  borrower.loans.push(loan);
  return loan;
}

// ── Borrowing against an existing asset (Phase 12) ───────────────────────────
// The player raises cash by pledging an asset they already own. The asset's value
// is the collateral the bank prices against (the assessment already lowers the rate
// and lifts the ceiling for secured lending); the asset is then pledged and seized
// if the loan defaults. The player keeps using the asset while the loan runs.

export interface CollateralQuote extends LoanAssessment {
  assetId: string;
  collateralValue: number; // EC$ — the pledged asset's worth
}

// Quote a loan secured by one of the player's assets. With no `requestedPrincipal`,
// the ask defaults to the asset's value, so the returned (possibly COUNTER) amount
// reveals the most the bank will lend against it. Pure — never mutates.
export function quoteCollateralLoan(
  world: WorldState,
  assetId: string,
  termMonths: number,
  requestedPrincipal?: number,
): CollateralQuote {
  const asset = findBorrowerAsset(world.player, assetId);
  if (!asset) throw new Error(`quoteCollateralLoan: asset ${assetId} not found`);
  const ask = requestedPrincipal && requestedPrincipal > 0 ? requestedPrincipal : asset.value;
  const assessment = assessLoanApplication(world, world.player, ask, termMonths, asset.value);
  return { ...assessment, assetId, collateralValue: asset.value };
}

// Borrow against an asset: assess with the asset as collateral and, if the bank
// lends, originate a secured loan for the approved amount (≤ requested) and pay the
// player the cash. Throws if the asset is missing/pledged/listed or the bank declines.
export function borrowAgainstAsset(
  world: WorldState,
  assetId: string,
  requestedPrincipal: number,
  termMonths: number,
): { loan: Loan; assessment: LoanAssessment } {
  const p = world.player;
  const asset = findBorrowerAsset(p, assetId);
  if (!asset) throw new Error(`borrowAgainstAsset: asset ${assetId} not found`);
  if (asset.pledgedToLoanId) throw new Error('That asset is already pledged against a loan.');
  if (asset.listedForSale) throw new Error('That asset is listed for sale.');

  const assessment = assessLoanApplication(world, p, requestedPrincipal, termMonths, asset.value);
  if (assessment.outcome === 'DECLINED' || assessment.approvedPrincipal <= 0) {
    throw new Error(assessment.reason);
  }
  const principal = Math.min(requestedPrincipal, assessment.approvedPrincipal);
  const monthlyPayment = Math.round(amortize(principal, assessment.interestRate, assessment.termMonths));
  p.cash += principal;
  const loan = originateLoan(
    world,
    p,
    assessment.bankId,
    principal,
    assessment.interestRate,
    monthlyPayment,
    assessment.termMonths,
    undefined,
    assetId,
  );
  return { loan, assessment };
}
