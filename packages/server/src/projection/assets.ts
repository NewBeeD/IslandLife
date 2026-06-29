import type { CollateralQuote } from '@island/engine';
import type {
  Asset,
  AssetSaleResultDTO,
  BorrowResultDTO,
  CollateralQuoteDTO,
  Loan,
  LoanActionResultDTO,
  SaleMode,
  WorldState,
} from '@island/shared';
import { assetLabel, bankLabel } from './labels';

// THE ICEBERG BOUNDARY. Phase 12 asset actions — selling and borrowing against an
// asset — projected to the wire. These are the player acting on their own property,
// so EC$ figures and their own prospective loan terms are shown; no hidden NPC or
// bank mechanics ever appear.

// The outcome of selling an asset. The asset is captured before the sale so its
// label survives (a QUICK sale has already removed it by the time this is built).
export function toAssetSaleResultDTO(
  world: WorldState,
  asset: Asset,
  mode: SaleMode,
  opts: { proceeds: number; settlesInMonths: number; settled: boolean; ventureClosed: boolean },
): AssetSaleResultDTO {
  const name = assetLabel(asset.type, asset.size).toLowerCase();
  const acknowledgement =
    mode === 'QUICK'
      ? opts.ventureClosed
        ? `You let the ${name} go — and with it, that line of work.`
        : `You let the ${name} go. The money is in hand.`
      : `You put the ${name} up for sale. Now you wait for a fair price.`;
  return {
    assetId: asset.id,
    mode,
    settled: opts.settled,
    proceeds: Math.round(opts.proceeds),
    settlesInMonths: opts.settlesInMonths,
    ventureClosed: opts.ventureClosed,
    cashInHand: Math.round(world.player.cash),
    acknowledgement,
  };
}

export function toCollateralQuoteDTO(quote: CollateralQuote): CollateralQuoteDTO {
  return {
    assetId: quote.assetId,
    assetValue: Math.round(quote.collateralValue),
    outcome: quote.outcome,
    maxPrincipal: Math.round(quote.approvedPrincipal),
    interestRate: quote.interestRate,
    monthlyPayment: Math.round(quote.monthlyPayment),
    termMonths: quote.termMonths,
    bankLabel: quote.bankId ? bankLabel(quote.bankId) : '',
    reason: quote.reason,
  };
}

// The result of repaying early or resizing a loan (Phase 14). `monthsLeft` is
// re-derived from the loan's updated schedule (the engine recomputed `termMonths`).
export function toLoanActionResultDTO(
  world: WorldState,
  loan: Loan,
  action: 'REPAY' | 'INSTALLMENT',
): LoanActionResultDTO {
  const paid = loan.status === 'PAID';
  const acknowledgement =
    action === 'REPAY'
      ? paid
        ? 'It is cleared. That debt is behind you now.'
        : 'You put money against it. The balance is lighter and the end is nearer.'
      : 'The payment is reset. From next month it lands at the new figure.';
  return {
    loanId: loan.id,
    status: paid ? 'PAID' : 'ACTIVE',
    remaining: Math.round(loan.remainingPrincipal),
    monthlyPayment: Math.round(loan.monthlyPayment),
    monthsLeft: Math.max(0, loan.termMonths - (world.month - loan.originMonth)),
    cashInHand: Math.round(world.player.cash),
    acknowledgement,
  };
}

export function toBorrowResultDTO(world: WorldState, loan: Loan): BorrowResultDTO {
  return {
    loanId: loan.id,
    principal: Math.round(loan.principal),
    monthlyPayment: Math.round(loan.monthlyPayment),
    interestRate: loan.interestRate,
    termMonths: loan.termMonths,
    cashInHand: Math.round(world.player.cash),
    acknowledgement: 'The money is yours; the asset stands behind it until the loan is cleared.',
  };
}
