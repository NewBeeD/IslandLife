import { formatCurrency } from '@island/narrative';
import { opportunityLogicalKey } from '@island/shared';
import { attentionPressure, openDemands } from '@island/engine';
import type { DemandKind, Opportunity, OpportunitiesDTO, OpportunityDTO, WorldState } from '@island/shared';

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
  if (opp.kind === 'INVEST_SOLICITATION' && opp.invest) return `${opp.invest.investeeName} wants backing`;
  if (opp.kind === 'MANAGEMENT_DEMAND' && opp.demand) return demandTitle(opp.demand.kind, opp.demand.ventureLabel);
  return opp.npcName;
}

// The short title of a competing management demand (Phase 26). Names the matter and,
// where it concerns one, the venture — never the mechanics.
function demandTitle(kind: DemandKind, ventureLabel?: string): string {
  const what = ventureLabel ?? 'the work';
  switch (kind) {
    case 'SUPPLIER_SHORTAGE':
      return `Supply running short — ${what}`;
    case 'LABOUR_TROUBLE':
      return `Trouble among the hands — ${what}`;
    case 'LAUNCH':
      return `Finding its feet — ${what}`;
    case 'AUDIT':
      return 'The taxman comes asking';
    case 'PRICE_WAR':
      return `Undercut on price — ${what}`;
    case 'ACQUISITION':
      return `A buyer circling — ${what}`;
  }
}

// The unlabelled prose of a demand (Phase 26): the matter and the genuine trade-off of
// acting versus letting it go, no numbers, no risk labels.
function demandDescription(kind: DemandKind, ventureLabel?: string): string {
  const what = ventureLabel ?? 'the work';
  switch (kind) {
    case 'SUPPLIER_SHORTAGE':
      return `What ${what} needs to run has gone scarce. You could put your time and some money into securing it elsewhere, or let it run short and take the lost custom.`;
    case 'LABOUR_TROUBLE':
      return `The hands you rely on for ${what} are at odds over something. You could sit down and settle it, or stay out and hope it cools before it costs you.`;
    case 'LAUNCH':
      return `${capitalise(what)} is new and unsteady on its feet. Time on it now — your own hands — would give it a real start; leave it to itself and it may bed in poorly.`;
    case 'AUDIT':
      return 'Word comes that your books are to be looked at. Meet it prepared, with the time and a little money it takes, or let it slide and risk it going against you.';
    case 'PRICE_WAR':
      return `A rival has cut prices to draw ${what}'s custom away. You could meet them and defend your share, or ride it out and let the trade drift for a while.`;
    case 'ACQUISITION':
      return `Someone wants to buy ${what} from you. You could hear them out and take the money, or send them on and keep it yours.`;
  }
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
  if (opp.kind === 'INVEST_SOLICITATION' && opp.invest) {
    // The ask is public (you know what they want and for what); how you would take your
    // return — a loan, a share of the profit, a cut of the takings — is yours to choose,
    // and the venture's hidden prospects stay unstated. Weighed in prose, not as rates.
    const iv = opp.invest;
    return (
      `${iv.investeeName} is looking for ${formatCurrency(iv.principal)} to put into ${iv.ventureLabel}, ` +
      `and would rather have it from someone they know than from a bank. You could lend it plain, leave ` +
      `it in for a share of the profit, or take a cut of the takings — the safer the terms, the smaller ` +
      `the upside. It is their venture you would be backing, for better or worse.`
    );
  }
  if (opp.kind === 'MANAGEMENT_DEMAND' && opp.demand) {
    return demandDescription(opp.demand.kind, opp.demand.ventureLabel);
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
  if (opp.kind === 'INVEST_SOLICITATION') return `Heard: directly from ${opp.npcName}.`;
  if (opp.kind === 'MANAGEMENT_DEMAND') return 'On your plate: needing a decision.';
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
  if (opp.kind === 'INVEST_SOLICITATION') {
    return monthsLeft <= 1 ? 'They need an answer this month.' : 'They are waiting on your word, but not forever.';
  }
  if (opp.kind === 'MANAGEMENT_DEMAND') {
    return monthsLeft <= 1
      ? 'Act this month, or it settles itself.'
      : 'It will not wait long before it settles one way or another.';
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
  return { active, possible: [], expired, attention: attentionNote(world) };
}

// The player's management attention this month, as prose (Phase 26, P26.1). It names
// the pressure — and, when several matters press at once, that they cannot all be met —
// so the prioritization screen reads as a felt squeeze, never a number (S3). Absent when
// nothing is pressing and there is room to spare, so it appears only as a real constraint.
function attentionNote(world: WorldState): string | undefined {
  const demands = openDemands(world).length;
  const pressure = attentionPressure(world);
  if (pressure === 'LIGHT' && demands === 0) return undefined;
  if (pressure === 'OVERWHELMED') {
    return (
      'More is being asked of you than one person can see to this month. You will not get to ' +
      'all of it — decide what matters most and let the rest take its own course.'
    );
  }
  if (pressure === 'STRETCHED') {
    return demands > 1
      ? 'Your plate is close to full, and more than one thing wants your hand. Pick carefully — you may not manage them all.'
      : 'Your plate is close to full. There is room for what is in front of you, but not much beyond it.';
  }
  if (demands > 0) {
    return 'You have a matter or two wanting a decision, and the room to see to them if you choose.';
  }
  return 'You are managing what you carry, with a little room to spare.';
}
