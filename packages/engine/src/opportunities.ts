import { GOODS, REPRESENTATIVE_GOOD } from '@island/shared';
import type {
  DecisionOption,
  Opportunity,
  PlayerDecision,
  WorldState,
} from '@island/shared';
import { clamp } from './rng';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 6 — the one decision loop (the vertical slice).
//
// The information-channel filter surfaces Eunice's standing supply-contract
// opportunity to a fishing player with enough local social capital (P6.1); the
// opportunity carries an unlabelled decision (P6.2); resolving it feeds back into
// the player's income behaviour — a standing contract vs. spot-selling trade-off
// (P6.3); a delayed consequence surfaces months later (P6.4).
//
// All of this is pure engine state living on `world` (S1), so it serializes with
// the snapshot and is deterministic. The narrative voice (situation prose, the
// consequence entry) lives in @island/narrative; the engine owns only mechanics.
// ─────────────────────────────────────────────────────────────────────────────

export const EUNICE_OPPORTUNITY_ID = 'OPP_EUNICE';
export const EUNICE_DECISION_ID = 'DEC_EUNICE';
export const EUNICE_NPC_NAME = 'Eunice Charles';

// MARKET_NETWORK information channel (Player Experience doc): a fish buyer's offer
// reaches a fisher who is known around the market — local social capital ≥ 0.30.
const MARKET_NETWORK_CHANNEL = 'MARKET_NETWORK';
const REQUIRED_LOCAL_CAPITAL = 0.3;
// Let a few months pass so the relationship reads as established, not instant.
const SURFACE_FROM_MONTH = 2;
const WINDOW_MONTHS = 2;
// The standing offer is a modest premium over current spot earnings — it buys
// stability, not a windfall, so giving up the open market's good months is a real
// cost (the trade-off must be genuine; the player is never told which is "better").
const STANDING_PREMIUM = 1.3;
// Spot income swings around its base with the local fish price.
const SPOT_MIN_FACTOR = 0.5;
const SPOT_MAX_FACTOR = 2.0;
// Months between the choice and the MEMORY entry that connects back to it (P6.4).
export const CONSEQUENCE_LAG_MONTHS = 6;

export const EUNICE_OPTION_ACCEPT = 'ACCEPT';
export const EUNICE_OPTION_DECLINE = 'DECLINE';

// Round an EC$ figure to a "real" contract number.
function roundContract(n: number): number {
  return Math.max(50, Math.round(n / 50) * 50);
}

function buildEuniceOptions(monthlyAmount: number): DecisionOption[] {
  return [
    {
      id: EUNICE_OPTION_ACCEPT,
      label: "Tell Eunice yes — you'll be her supplier",
      description:
        `A set amount each month, ${formatEc(monthlyAmount)}, as long as you keep her ` +
        'stall supplied. The same money in a good month or a lean one. You would not be ' +
        'free to chase the best price at the wharf — you would have a commitment to meet.',
      effect: { incomeMode: 'STANDING', standingAmount: monthlyAmount },
    },
    {
      id: EUNICE_OPTION_DECLINE,
      label: 'Keep selling at the wharf, the way you always have',
      description:
        'No one to answer to and the whole catch is yours to sell to the highest buyer ' +
        'each week. Some weeks that is more than Eunice is offering. Some weeks the sea ' +
        'gives you little and the price is poor and there is no one guaranteeing anything.',
      effect: { incomeMode: 'SPOT' },
    },
  ];
}

function formatEc(n: number): string {
  return `EC$${Math.round(n).toLocaleString('en-US')}`;
}

// Whether the Eunice opportunity should be surfaced to this player right now.
function euniceConditionsMet(world: WorldState): boolean {
  const p = world.player;
  return (
    p.occupation === 'FISHING' &&
    p.socialCapitalLocal >= REQUIRED_LOCAL_CAPITAL &&
    world.month >= SURFACE_FROM_MONTH
  );
}

// The information-channel filter (P6.1). Expires stale offers and surfaces newly
// available ones. Returns the opportunities that became visible this call (so the
// server can note them). Deterministic — reads world state, never world.rng.
export function surfaceOpportunities(world: WorldState): Opportunity[] {
  // Expire any OPEN opportunity whose window has closed unanswered.
  for (const opp of world.opportunities) {
    if (opp.status === 'OPEN' && world.month > opp.surfacedMonth + opp.windowMonths) {
      opp.status = 'EXPIRED';
    }
  }

  const surfaced: Opportunity[] = [];
  const alreadyHasEunice = world.opportunities.some((o) => o.kind === 'EUNICE_SUPPLY_CONTRACT');
  if (!alreadyHasEunice && euniceConditionsMet(world)) {
    const monthlyAmount = roundContract(world.player.monthlyIncome * STANDING_PREMIUM);
    const decision: PlayerDecision = {
      id: EUNICE_DECISION_ID,
      opportunityId: EUNICE_OPPORTUNITY_ID,
      kind: 'EUNICE_SUPPLY_CONTRACT',
      surfacedMonth: world.month,
      windowMonths: WINDOW_MONTHS,
      options: buildEuniceOptions(monthlyAmount),
      chosenOptionId: null,
      resolvedMonth: null,
      consequenceMonth: null,
      consequenceDelivered: false,
    };
    const opportunity: Opportunity = {
      id: EUNICE_OPPORTUNITY_ID,
      kind: 'EUNICE_SUPPLY_CONTRACT',
      industry: 'FISHING',
      npcName: EUNICE_NPC_NAME,
      channelId: MARKET_NETWORK_CHANNEL,
      surfacedMonth: world.month,
      windowMonths: WINDOW_MONTHS,
      status: 'OPEN',
      decisionId: EUNICE_DECISION_ID,
      monthlyAmount,
    };
    world.opportunities.push(opportunity);
    world.decisions.push(decision);
    surfaced.push(opportunity);
  }
  return surfaced;
}

export class DecisionError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'ALREADY_RESOLVED' | 'EXPIRED' | 'BAD_OPTION',
  ) {
    super(message);
    this.name = 'DecisionError';
  }
}

// Resolve a decision into the simulation (P6.3): record the choice and feed it back
// into the player's income behaviour. STANDING fixes income to the contract amount;
// SPOT makes it market-variable from here on (see updatePlayerIncome). Pure —
// mutates the player and the decision/opportunity, never world.rng.
export function resolveDecision(
  world: WorldState,
  decisionId: string,
  optionId: string,
): PlayerDecision {
  const decision = world.decisions.find((d) => d.id === decisionId);
  if (!decision) throw new DecisionError(`decision ${decisionId} not found`, 'NOT_FOUND');
  if (decision.chosenOptionId !== null) {
    throw new DecisionError(`decision ${decisionId} already resolved`, 'ALREADY_RESOLVED');
  }
  const opportunity = world.opportunities.find((o) => o.id === decision.opportunityId);
  if (opportunity && opportunity.status === 'EXPIRED') {
    throw new DecisionError(`decision ${decisionId} has expired`, 'EXPIRED');
  }
  const option = decision.options.find((o) => o.id === optionId);
  if (!option) throw new DecisionError(`option ${optionId} not on decision ${decisionId}`, 'BAD_OPTION');

  decision.chosenOptionId = option.id;
  decision.resolvedMonth = world.month;
  decision.consequenceMonth = world.month + CONSEQUENCE_LAG_MONTHS;

  const player = world.player;
  if (option.effect.incomeMode === 'STANDING') {
    const amount = option.effect.standingAmount ?? player.monthlyIncome;
    player.incomeMode = 'STANDING';
    player.standingContract = { opportunityId: decision.opportunityId, monthlyAmount: amount };
    player.monthlyIncome = amount;
    if (opportunity) opportunity.status = 'ACCEPTED';
  } else {
    player.incomeMode = 'SPOT';
    player.spotBaseIncome = player.monthlyIncome;
    player.standingContract = null;
    if (opportunity) opportunity.status = 'DECLINED';
  }
  return decision;
}

// Apply the player's chosen income behaviour for the month. Called by the server
// before simulateOneMonth on advance. A no-op until a decision sets `incomeMode`,
// so the default player's income is untouched (the golden master holds). Pure.
export function updatePlayerIncome(world: WorldState): void {
  const p = world.player;
  if (p.incomeMode === 'STANDING' && p.standingContract) {
    p.monthlyIncome = p.standingContract.monthlyAmount;
    return;
  }
  if (p.incomeMode === 'SPOT' && p.occupation && p.spotBaseIncome != null) {
    const goodId = REPRESENTATIVE_GOOD[p.occupation];
    if (!goodId) return;
    const good = GOODS.find((g) => g.id === goodId);
    const market = world.markets.find((m) => m.goodId === goodId && m.parish === p.parish);
    if (!good || !market) return;
    const factor = clamp(market.currentPrice / good.basePrice, SPOT_MIN_FACTOR, SPOT_MAX_FACTOR);
    p.monthlyIncome = Math.round(p.spotBaseIncome * factor);
  }
}

// Find decisions whose delayed consequence is due this month and mark them
// delivered (P6.4). Mutates the decisions so a consequence surfaces exactly once;
// the server persists the world and the narrative layer renders the entries. Pure.
export function detectDueConsequences(world: WorldState): PlayerDecision[] {
  const due = world.decisions.filter(
    (d) =>
      d.resolvedMonth !== null &&
      d.consequenceMonth === world.month &&
      !d.consequenceDelivered,
  );
  for (const d of due) d.consequenceDelivered = true;
  return due;
}
