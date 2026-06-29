import { buildDecisionSituation } from '@island/narrative';
import {
  STUDY_LOAN_MAX_TERM_MONTHS,
  STUDY_LOAN_MIN_TERM_MONTHS,
  type UpgradeQuote,
} from '@island/engine';
import type {
  DecisionDTO,
  FinancingControlDTO,
  FinancingQuoteDTO,
  Opportunity,
  PlayerDecision,
  WorldState,
} from '@island/shared';
import { bankLabel } from './labels';

// GET /saves/:id/decisions/:did — the decision interface. The situation is a
// narrative moment; the options are unlabelled prose. The hidden option `effect`
// (incomeMode / standingAmount) is stripped here — the player reads a real choice,
// never an expected value (P6.2, the iceberg boundary).

function findDecision(world: WorldState, decisionId: string): PlayerDecision | undefined {
  return world.decisions.find((d) => d.id === decisionId);
}

function opportunityFor(world: WorldState, decision: PlayerDecision): Opportunity | undefined {
  return world.opportunities.find((o) => o.id === decision.opportunityId);
}

function titleFor(decision: PlayerDecision, opp: Opportunity | undefined): string {
  if (decision.kind === 'EUNICE_SUPPLY_CONTRACT') {
    return `${opp?.npcName ?? 'Eunice'}'s offer`;
  }
  if (decision.kind === 'ASSET_UPGRADE') return 'A bigger step';
  if (decision.kind === 'EDUCATION_ENROLMENT') return opp?.enrolment ? `Study — ${opp.enrolment.name}` : 'Going back to study';
  if (decision.kind === 'NEW_VENTURE') return opp?.newVenture ? `Something new — ${opp.newVenture.label}` : 'Something new';
  if (decision.kind === 'CROWDFUND') return 'Raising money among friends';
  if (decision.kind === 'PARTNERSHIP') return opp?.partnership ? `Going in with ${opp.partnership.partnerName}` : 'A partnership';
  return 'A decision';
}

// The financeable purchase behind a FINANCING decision — an asset upgrade or a new
// venture's entry cost. Unifies the slider for both (Phase 10).
function financeableSpec(
  opp: Opportunity,
): { label: string; price: number; minTermMonths: number; maxTermMonths: number } | undefined {
  if (opp.upgrade) {
    const u = opp.upgrade;
    return { label: u.assetLabel, price: u.assetPrice, minTermMonths: u.minTermMonths, maxTermMonths: u.maxTermMonths };
  }
  if (opp.newVenture) {
    const n = opp.newVenture;
    return { label: n.label, price: n.entryCost, minTermMonths: n.minTermMonths, maxTermMonths: n.maxTermMonths };
  }
  if (opp.enrolment) {
    // A study loan toward tuition (P14.5): the "price" is the full course cost.
    const e = opp.enrolment;
    return { label: e.name, price: e.totalCost, minTermMonths: STUDY_LOAN_MIN_TERM_MONTHS, maxTermMonths: STUDY_LOAN_MAX_TERM_MONTHS };
  }
  return undefined;
}

// Selectable loan terms for the financing slider, drawn from the purchase's allowed
// range (1-year increments, capped at the max term).
function termOptionsFor(spec: { minTermMonths: number; maxTermMonths: number }): number[] {
  const { minTermMonths: min, maxTermMonths: max } = spec;
  const opts: number[] = [];
  for (let t = min; t <= max; t += 12) opts.push(t);
  if (opts[opts.length - 1] !== max) opts.push(max);
  return opts;
}

function financingFor(world: WorldState, opp: Opportunity | undefined): FinancingControlDTO | undefined {
  const spec = opp ? financeableSpec(opp) : undefined;
  if (!spec) return undefined;
  const cash = Math.floor(world.player.cash);
  return {
    assetLabel: spec.label,
    assetPrice: spec.price,
    maxDownPayment: Math.min(spec.price, cash),
    minDownPayment: 0,
    cashOnHand: cash,
    termOptions: termOptionsFor(spec),
  };
}

export function toDecisionDTO(world: WorldState, decisionId: string): DecisionDTO | null {
  const decision = findDecision(world, decisionId);
  if (!decision) return null;
  const opp = opportunityFor(world, decision);

  const expired = opp?.status === 'EXPIRED';
  const status: DecisionDTO['status'] =
    decision.chosenOptionId !== null ? 'RESOLVED' : expired ? 'EXPIRED' : 'OPEN';

  // Asset upgrades, new ventures, and education enrolment are financed interactively
  // (the slider — pay it yourself and/or borrow); only the Eunice contract is a fixed
  // option list now.
  const isFinancing =
    decision.kind === 'ASSET_UPGRADE' ||
    decision.kind === 'NEW_VENTURE' ||
    decision.kind === 'EDUCATION_ENROLMENT';
  const monthsLeft = opp ? opp.surfacedMonth + opp.windowMonths - world.month : 0;
  const window = expired
    ? 'The moment has passed.'
    : monthsLeft <= 1
      ? isFinancing
        ? 'The offer holds only this month.'
        : 'She needs an answer this month.'
      : isFinancing
        ? 'It is there for now, but not forever.'
        : 'She is waiting on your word, but not forever.';

  return {
    id: decision.id,
    title: titleFor(decision, opp),
    situation: buildDecisionSituation(world, decision),
    interaction: isFinancing ? 'FINANCING' : 'OPTIONS',
    options: decision.options.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.description,
    })),
    financing: isFinancing ? financingFor(world, opp) : undefined,
    status,
    window,
    chosenOptionId: decision.chosenOptionId,
  };
}

// Project an engine financing quote (the slider's live terms) to the wire shape.
// The interest rate and payment are the player's OWN prospective loan — permitted,
// like the money view — while the bank's hidden credit score never appears.
export function toFinancingQuoteDTO(quote: UpgradeQuote): FinancingQuoteDTO {
  return {
    downPayment: Math.round(quote.downPayment),
    requestedLoan: Math.round(quote.requestedLoan),
    outcome: quote.outcome,
    approvedLoan: Math.round(quote.approvedPrincipal),
    interestRate: quote.interestRate,
    monthlyPayment: Math.round(quote.monthlyPayment),
    termMonths: quote.termMonths,
    bankLabel: quote.bankId ? bankLabel(quote.bankId) : '',
    reason: quote.reason,
  };
}
