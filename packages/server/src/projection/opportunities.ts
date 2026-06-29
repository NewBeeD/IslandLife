import { formatCurrency } from '@island/narrative';
import { opportunityLogicalKey } from '@island/shared';
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
  if (opp.kind === 'CROWDFUND') return 'Raising money among friends';
  if (opp.kind === 'PARTNERSHIP' && opp.partnership) return `Going in together — ${opp.partnership.companyName}`;
  if (opp.kind === 'SIDE_JOB' && opp.sideJob) return `A job on the side — ${opp.sideJob.label}`;
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
  if (opp.kind === 'CROWDFUND' && opp.crowdfund) {
    // The slate of offers is public to the player (they hear who is offering what);
    // the backers' hidden psychology is not. Counts, not rates-as-fields, in prose.
    const n = opp.crowdfund.offers.length;
    return (
      `A few people who know you would help fund ${opp.crowdfund.ventureLabel} — ${n} ` +
      `${n === 1 ? 'offer' : 'offers'} on the table, some as a loan to repay, some for a share of ` +
      `what the work makes. A debt between friends, or a hand in your business for years. You weigh ` +
      `whose help to take, if any.`
    );
  }
  if (opp.kind === 'PARTNERSHIP' && opp.partnership) {
    const ps = opp.partnership;
    return (
      `${ps.partnerName} wants to go in with you on ${ps.companyName} — you each put up your share ` +
      `and the bank carries the rest. More reach than you have alone, and a say you would no longer ` +
      `hold by yourself. The takings and the troubles both get shared.`
    );
  }
  if (opp.kind === 'SIDE_JOB' && opp.sideJob) {
    // The pay and the length are part of the offer (you know what the job pays); it is
    // stated plainly, never as a "return". Independent work — yours to take or leave.
    const sj = opp.sideJob;
    return (
      `${sj.days} days of work going, paid ${formatCurrency(sj.payout)} when it is done. ` +
      `Separate from your usual week — a job you take on your own account, on top of the rest. ` +
      `Money in your hand at the end of it, if the days are yours to give.`
    );
  }
  return 'An arrangement put to you.';
}

function sourceFor(opp: Opportunity): string {
  if (opp.kind === 'ASSET_UPGRADE') return `Word: through ${opp.npcName}.`;
  if (opp.kind === 'EDUCATION_ENROLMENT') return 'Notice: the community college intake.';
  if (opp.kind === 'NEW_VENTURE') return 'Word: going round the place.';
  if (opp.kind === 'CROWDFUND') return 'Word: among people who know you.';
  if (opp.kind === 'PARTNERSHIP') return `Heard: directly from ${opp.npcName}.`;
  if (opp.kind === 'SIDE_JOB') return 'Word: a job going round.';
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
  if (opp.kind === 'CROWDFUND') {
    return monthsLeft <= 1 ? 'The offers will not stand past this month.' : 'The offers stand for now.';
  }
  if (opp.kind === 'PARTNERSHIP') {
    return monthsLeft <= 1 ? 'They want an answer this month.' : 'They are waiting on your word, but not forever.';
  }
  if (opp.kind === 'SIDE_JOB') {
    return monthsLeft <= 1 ? 'They need someone this month.' : 'The work is there for now.';
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

// At most this many lapsed offers are shown under "Passed" — the most recent ones,
// so the list stays readable instead of accumulating a wall of old offers (P13.2).
const EXPIRED_CAP = 8;

export function toOpportunitiesDTO(world: WorldState): OpportunitiesDTO {
  const active: OpportunityDTO[] = [];
  // A logical offer that is currently live (OPEN) or already taken/turned down
  // (ACCEPTED/DECLINED) must never also read as a lapsed "Passed" row — that is the
  // phantom "the moment has passed" an enrolled player used to see (idea 6, P13.4).
  const liveOrResolved = new Set<string>();
  for (const opp of world.opportunities) {
    if (opp.status === 'OPEN' || opp.status === 'ACCEPTED' || opp.status === 'DECLINED') {
      liveOrResolved.add(opportunityLogicalKey(opp));
    }
  }
  // P13.2 — collapse EXPIRED rows to one per logical offer (the most recent by
  // surfacedMonth), so a juice stand that lapsed several times appears once, then
  // cap the list. The `active` (OPEN) list is unaffected.
  const latestExpired = new Map<string, Opportunity>();
  for (const opp of world.opportunities) {
    if (opp.status === 'OPEN') {
      active.push(toDTO(opp, world));
      continue;
    }
    if (opp.status !== 'EXPIRED') continue; // ACCEPTED/DECLINED: resolved, not pending
    const key = opportunityLogicalKey(opp);
    if (liveOrResolved.has(key)) continue; // superseded by a live/resolved instance
    const seen = latestExpired.get(key);
    if (!seen || opp.surfacedMonth > seen.surfacedMonth) latestExpired.set(key, opp);
  }
  const expired = [...latestExpired.values()]
    .sort((a, b) => b.surfacedMonth - a.surfacedMonth)
    .slice(0, EXPIRED_CAP)
    .map((opp) => toDTO(opp, world));
  return { active, possible: [], expired };
}
