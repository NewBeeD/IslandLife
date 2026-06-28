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
  if (opp.kind === 'ASSET_UPGRADE' && opp.upgrade) return `A bigger step — ${opp.upgrade.assetLabel}`;
  if (opp.kind === 'EDUCATION_ENROLMENT' && opp.enrolment) return `Go back to study — ${opp.enrolment.name}`;
  if (opp.kind === 'NEW_VENTURE' && opp.newVenture) return `Something new — ${opp.newVenture.label}`;
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
  if (opp.kind === 'ASSET_UPGRADE' && opp.upgrade) {
    // The price is public (the player can see the asking price); the risk and the
    // expected return are not — those stay hidden. The player weighs it in prose.
    return (
      `${capitalise(opp.upgrade.assetLabel)} for ${formatCurrency(opp.upgrade.assetPrice)}. ` +
      `More work when the work is there, and more cost every month whether it is or not. ` +
      `You would put down what you can and borrow the rest.`
    );
  }
  if (opp.kind === 'EDUCATION_ENROLMENT' && opp.enrolment) {
    // The cost and length are public (you know what a program asks); what it will do
    // for you stays unstated — no promised return, just the trade-off in prose.
    const prog = opp.enrolment;
    const monthly = Math.round(prog.totalCost / prog.durationMonths);
    return (
      `${capitalise(prog.name)} — ${formatCurrency(prog.totalCost)} over ${prog.durationMonths} ` +
      `months, about ${formatCurrency(monthly)} a month while you study, with nothing in hand ` +
      `until you finish. A qualification opens doors that stay shut to a person without it.`
    );
  }
  if (opp.kind === 'NEW_VENTURE' && opp.newVenture) {
    // The entry cost is public (you know what it asks to get in); the takings, the
    // risk, and how crowded the trade is stay unstated — weighed in prose, not stats.
    const nv = opp.newVenture;
    const crowd =
      nv.barrierTier === 'LOW'
        ? 'Cheap and quick to start — and plenty of others could think the same.'
        : 'A real step into work outside your trade, with the costs that come with it.';
    return (
      `${capitalise(nv.label)} for ${formatCurrency(nv.entryCost)}, a stream of money running ` +
      `alongside what you already do. ${crowd} You would put down what you can and borrow the rest.`
    );
  }
  return 'An arrangement put to you.';
}

function sourceFor(opp: Opportunity): string {
  if (opp.kind === 'ASSET_UPGRADE') return `Word: through ${opp.npcName}.`;
  if (opp.kind === 'EDUCATION_ENROLMENT') return 'Notice: the community college intake.';
  if (opp.kind === 'NEW_VENTURE') return 'Word: going round the place.';
  return `Heard: directly from ${opp.npcName}.`;
}

function windowFor(opp: Opportunity, world: WorldState): string {
  const monthsLeft = opp.surfacedMonth + opp.windowMonths - world.month;
  if (opp.kind === 'ASSET_UPGRADE') {
    return monthsLeft <= 1 ? 'The offer holds only this month.' : 'It is there for now, but not forever.';
  }
  if (opp.kind === 'EDUCATION_ENROLMENT') {
    return monthsLeft <= 1 ? 'The intake closes this month.' : 'The intake is open for now.';
  }
  if (opp.kind === 'NEW_VENTURE') {
    return monthsLeft <= 1 ? 'It will be gone by next month.' : 'It is there for now, but not forever.';
  }
  if (monthsLeft <= 1) return 'She needs an answer this month.';
  return 'She is waiting on your word, but not forever.';
}

function capitalise(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
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
