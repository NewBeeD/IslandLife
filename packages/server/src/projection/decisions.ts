import { buildDecisionSituation } from '@island/narrative';
import {
  STUDY_LOAN_MAX_TERM_MONTHS,
  STUDY_LOAN_MIN_TERM_MONTHS,
  activeVentures,
  plannedFreeTime,
  ventureTimeLoad,
  ventureTimeLoadForTier,
  type UpgradeQuote,
} from '@island/engine';
import type {
  DecisionDTO,
  FinancingCommitmentDTO,
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
  if (decision.kind === 'SIDE_JOB') return 'A job on the side';
  if (decision.kind === 'INVEST_SOLICITATION') return opp?.invest ? `Putting money into ${opp.invest.ventureLabel}` : 'A place to put money';
  if (decision.kind === 'MANAGEMENT_DEMAND') return demandDecisionTitle(opp);
  return 'A decision';
}

// The title of a competing-demand decision (Phase 26) — the matter itself, named plainly.
function demandDecisionTitle(opp: Opportunity | undefined): string {
  const d = opp?.demand;
  const what = d?.ventureLabel ?? 'the work';
  switch (d?.kind) {
    case 'SUPPLIER_SHORTAGE':
      return `A supply gone short — ${what}`;
    case 'LABOUR_TROUBLE':
      return `Trouble among the hands — ${what}`;
    case 'LAUNCH':
      return `Getting ${what} on its feet`;
    case 'AUDIT':
      return 'The taxman comes asking';
    case 'PRICE_WAR':
      return `Undercut on price — ${what}`;
    case 'ACQUISITION':
      return `A buyer for ${what}`;
    default:
      return 'A matter to see to';
  }
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

// The time-commitment choice for a hands-on new venture (Phase 17, P17.1). Present
// only for a NEW_VENTURE; `required` when the player's day is already full and they
// must hire an operator or step back from a venture they already run. No timeLoad
// numbers cross the wire — only prose and the names of the ventures they could drop.
function commitmentFor(world: WorldState, opp: Opportunity): FinancingCommitmentDTO | undefined {
  const spec = opp.newVenture;
  if (!spec) return undefined;
  const p = world.player;
  const handsOnLoad = ventureTimeLoadForTier(spec.timeLoad, spec.barrierTier);
  const required = handsOnLoad > plannedFreeTime(p) + 1e-6;
  const switchable = activeVentures(p)
    .filter((v) => ventureTimeLoad(v) > 0)
    .map((v) => ({ ventureId: v.id, label: v.label }));
  return {
    required,
    timeNote: required
      ? 'Your days are already full. To run this yourself you would have to step back from ' +
        'something you already do — or take someone on to run it for you.'
      : 'It would take real hours of your week, but you have the time for it if you want it.',
    canHire: true,
    operatorNote:
      'Put someone trustworthy in charge and it runs without you — but a share of what it ' +
      'makes goes to them for the trouble.',
    switchable,
  };
}

function financingFor(world: WorldState, opp: Opportunity | undefined): FinancingControlDTO | undefined {
  const spec = opp ? financeableSpec(opp) : undefined;
  if (!spec || !opp) return undefined;
  const cash = Math.floor(world.player.cash);
  const commitment = commitmentFor(world, opp);
  return {
    assetLabel: spec.label,
    assetPrice: spec.price,
    maxDownPayment: Math.min(spec.price, cash),
    minDownPayment: 0,
    cashOnHand: cash,
    termOptions: termOptionsFor(spec),
    ...(commitment ? { commitment } : {}),
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
  const isDemand = decision.kind === 'MANAGEMENT_DEMAND';
  const window = expired
    ? 'The moment has passed.'
    : monthsLeft <= 1
      ? isDemand
        ? 'Act this month, or it settles itself.'
        : isFinancing
          ? 'The offer holds only this month.'
          : 'She needs an answer this month.'
      : isDemand
        ? 'It will not wait long before it settles one way or another.'
        : isFinancing
          ? 'It is there for now, but not forever.'
          : 'She is waiting on your word, but not forever.';

  // Phase 18 (P18.3): a partnership can be negotiated — surface the default split so the
  // client can offer "go in at this split" or "propose your own".
  const negotiation =
    decision.kind === 'PARTNERSHIP' && opp?.partnership
      ? {
          defaultPartnerSharePct: Math.round(opp.partnership.partnerShare * 100),
          defaultYourSharePct: Math.round((1 - opp.partnership.partnerShare) * 100),
        }
      : undefined;

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
    ...(negotiation ? { negotiation } : {}),
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
