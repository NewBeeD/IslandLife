import { buildDecisionSituation } from '@island/narrative';
import type { UpgradeQuote } from '@island/engine';
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
  return 'A decision';
}

// Selectable loan terms for the financing slider, drawn from the asset's allowed
// range (2-year increments, capped at the asset's max term).
function termOptionsFor(opp: Opportunity): number[] {
  const min = opp.upgrade?.minTermMonths ?? 24;
  const max = opp.upgrade?.maxTermMonths ?? 60;
  const opts: number[] = [];
  for (let t = min; t <= max; t += 12) opts.push(t);
  if (opts[opts.length - 1] !== max) opts.push(max);
  return opts;
}

function financingFor(world: WorldState, opp: Opportunity | undefined): FinancingControlDTO | undefined {
  if (!opp?.upgrade) return undefined;
  const cash = Math.floor(world.player.cash);
  return {
    assetLabel: opp.upgrade.assetLabel,
    assetPrice: opp.upgrade.assetPrice,
    maxDownPayment: Math.min(opp.upgrade.assetPrice, cash),
    minDownPayment: 0,
    cashOnHand: cash,
    termOptions: termOptionsFor(opp),
  };
}

export function toDecisionDTO(world: WorldState, decisionId: string): DecisionDTO | null {
  const decision = findDecision(world, decisionId);
  if (!decision) return null;
  const opp = opportunityFor(world, decision);

  const expired = opp?.status === 'EXPIRED';
  const status: DecisionDTO['status'] =
    decision.chosenOptionId !== null ? 'RESOLVED' : expired ? 'EXPIRED' : 'OPEN';

  const isUpgrade = decision.kind === 'ASSET_UPGRADE';
  const monthsLeft = opp ? opp.surfacedMonth + opp.windowMonths - world.month : 0;
  const window = expired
    ? 'The moment has passed.'
    : monthsLeft <= 1
      ? isUpgrade
        ? 'The offer holds only this month.'
        : 'She needs an answer this month.'
      : isUpgrade
        ? 'It is there for now, but not forever.'
        : 'She is waiting on your word, but not forever.';

  return {
    id: decision.id,
    title: titleFor(decision, opp),
    situation: buildDecisionSituation(world, decision),
    interaction: isUpgrade ? 'FINANCING' : 'OPTIONS',
    options: decision.options.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.description,
    })),
    financing: isUpgrade ? financingFor(world, opp) : undefined,
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
