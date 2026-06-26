import { formatCurrency } from '@island/narrative';
import type { Opportunity, OpportunitiesDTO, OpportunityDTO, WorldState } from '@island/shared';

// GET /saves/:id/opportunities — only what the player has heard of, through their
// own information channels, and always unlabelled: no expectedReturn, no riskLevel,
// just prose tradeoffs (Player Experience doc). The engine surfaces opportunities
// onto the world (P6.1); this projects the OPEN ones as active and the lapsed ones
// as expired. Resolved opportunities (accepted/declined) leave this view — the
// choice now lives in the player's life, not as a pending offer.

function titleFor(opp: Opportunity): string {
  if (opp.kind === 'EUNICE_SUPPLY_CONTRACT') return `Supply contract — ${opp.npcName}`;
  return opp.npcName;
}

function descriptionFor(opp: Opportunity): string {
  if (opp.kind === 'EUNICE_SUPPLY_CONTRACT') {
    // The guaranteed amount is part of the offer the player hears — public, unlike
    // the hidden expected-value comparison. Stated plainly, never as a "return".
    return (
      `${formatCurrency(opp.monthlyAmount)} a month, guaranteed, for as much fish as you ` +
      `can reliably supply. A standing arrangement, not a sale at a time. It would lock ` +
      `you to her stall.`
    );
  }
  return 'An arrangement she has put to you.';
}

function sourceFor(opp: Opportunity): string {
  return `Heard: directly from ${opp.npcName}.`;
}

function windowFor(opp: Opportunity, world: WorldState): string {
  const monthsLeft = opp.surfacedMonth + opp.windowMonths - world.month;
  if (monthsLeft <= 1) return 'She needs an answer this month.';
  return 'She is waiting on your word, but not forever.';
}

function toDTO(opp: Opportunity, world: WorldState): OpportunityDTO {
  const open = opp.status === 'OPEN';
  return {
    id: opp.id,
    title: titleFor(opp),
    description: descriptionFor(opp),
    source: sourceFor(opp),
    window: open ? windowFor(opp, world) : 'The moment has passed.',
    status: open ? 'OPEN' : 'EXPIRED',
    decisionId: open ? opp.decisionId : null,
  };
}

export function toOpportunitiesDTO(world: WorldState): OpportunitiesDTO {
  const active: OpportunityDTO[] = [];
  const expired: OpportunityDTO[] = [];
  for (const opp of world.opportunities) {
    if (opp.status === 'OPEN') active.push(toDTO(opp, world));
    else if (opp.status === 'EXPIRED') expired.push(toDTO(opp, world));
    // ACCEPTED / DECLINED: resolved by the player — no longer a pending opportunity.
  }
  return { active, possible: [], expired };
}
