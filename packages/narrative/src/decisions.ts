import { PARISHES } from '@island/shared';
import type {
  EnrolledProgram,
  NarrativeEntry,
  Opportunity,
  PlayerDecision,
  WorldState,
} from '@island/shared';
import { formatCurrency } from './magnitude';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 6 — the voice for the decision loop.
//
// The engine owns the mechanics (who is offered what, and what each choice does);
// this is the prose around it: the framing of the choice the player reads (P6.2)
// and the delayed MEMORY entry that connects back to it months later without ever
// naming it as a "decision" (P6.4). Deterministic Layer-1 prose so the slice plays
// fully offline; the voice rules (second person, no mechanics) still hold.
// ─────────────────────────────────────────────────────────────────────────────

function parishName(world: WorldState): string {
  return PARISHES.find((p) => p.id === world.player.parish)?.name ?? 'the parish';
}

function findOpportunity(world: WorldState, decision: PlayerDecision): Opportunity | undefined {
  return world.opportunities.find((o) => o.id === decision.opportunityId);
}

// The standing amount the contract guarantees, read off the accept option.
function standingAmount(decision: PlayerDecision): number | null {
  for (const opt of decision.options) {
    if (opt.effect.incomeMode === 'STANDING' && opt.effect.standingAmount != null) {
      return opt.effect.standingAmount;
    }
  }
  return null;
}

// The narrative framing of the choice — the "EUNICE'S OFFER" moment (Player
// Experience doc). Sets up the genuine trade-off in prose; the options themselves
// carry the rest. No probabilities, no expected value, no "safe"/"risky" (P6.2).
export function buildDecisionSituation(world: WorldState, decision: PlayerDecision): string {
  if (decision.kind === 'ASSET_UPGRADE') return buildUpgradeSituation(world, decision);
  if (decision.kind === 'EDUCATION_ENROLMENT') return buildEducationSituation(world, decision);
  if (decision.kind === 'NEW_VENTURE') return buildNewVentureSituation(world, decision);
  if (decision.kind === 'CROWDFUND') return buildCrowdfundSituation(world, decision);
  if (decision.kind === 'PARTNERSHIP') return buildPartnershipSituation(world, decision);
  const opp = findOpportunity(world, decision);
  const name = opp?.npcName ?? 'the buyer';
  const amount = standingAmount(decision);
  const place = parishName(world);

  return (
    `${name} has been buying your catch on and off for a while now. This week she ` +
    `finds you with a different kind of conversation. She is expanding her stall and ` +
    `she wants a supplier she can count on — not a sale here and there, but a standing ` +
    `arrangement.\n\n` +
    (amount != null
      ? `${formatCurrency(amount)} a month, steady, for as much fish as you can reliably land. `
      : 'A set amount each month, steady, for as much fish as you can reliably land. ') +
    `It would start next month.\n\n` +
    `Taking it would tie you to her stall — you would not be free to hold your catch back ` +
    `for a better price at the wharf when the fish are running and everyone wants them. ` +
    `Turning it down keeps your hands free, and keeps every lean week your own problem too.\n\n` +
    `She is fair, and you have dealt with her around ${place} long enough to believe she ` +
    `would honour what she says. She needs an answer soon. What do you tell her?`
  );
}

// The framing of an asset-upgrade choice (Phase 7): the chance to grow the trade,
// the money it takes, and the heavier costs that come with the bigger asset. The
// player decides how much to borrow on the financing slider. No raw mechanics.
function buildUpgradeSituation(world: WorldState, decision: PlayerDecision): string {
  const opp = findOpportunity(world, decision);
  const spec = opp?.upgrade;
  const vendor = opp?.npcName ?? 'a dealer';
  const place = parishName(world);
  if (!spec) {
    return `There is a chance in front of you to grow the work, if you can find the money for it.`;
  }
  return (
    `There is ${spec.assetLabel} to be had — ${vendor} has it, and the price is ` +
    `${formatCurrency(spec.assetPrice)}. You have turned it over in your mind more than once.\n\n` +
    `It would mean more coming in: a bigger day's work when the work is there. But it is ` +
    `real money up front, more than you keep in the house, and the bigger you go the more it ` +
    `costs you every month whether the season is kind or not — fuel, upkeep, and the bank's ` +
    `payment landing the same in a lean month as a fat one.\n\n` +
    `You could put down what you have and borrow the rest, or hold and keep things the size ` +
    `they are. Around ${place} a person is known by the steps they take and the ones they ` +
    `don't. How much of this do you want to carry?`
  );
}

// The framing of an education enrolment (Phase 9): a credential earned with money
// and years, with nothing to show until the end. The genuine trade-off — cash and
// tired evenings now against doors that open later — stated in prose, no mechanics.
function buildEducationSituation(world: WorldState, decision: PlayerDecision): string {
  const opp = findOpportunity(world, decision);
  const prog = opp?.enrolment;
  const place = parishName(world);
  if (!prog) {
    return `There is a chance to go back and study, if you can find the time and the money for it.`;
  }
  const monthly = Math.round(prog.totalCost / prog.durationMonths);
  return (
    `Word comes round that the community college is taking enrolments for ${prog.name}. You ` +
    `have turned the thought over before — a qualification with your name on it, the kind of ` +
    `paper that opens a door which otherwise stays shut.\n\n` +
    `It comes to ${formatCurrency(prog.totalCost)} in all, spread across ${prog.durationMonths} ` +
    `months — about ${formatCurrency(monthly)} going out every month while you study, and ` +
    `nothing to show for it until the end. The evenings would be long and tired ones. But the ` +
    `people who get on around ${place} are often the ones who put the years in when it was ` +
    `hard to.\n\n` +
    `You could carry the cost yourself as you go, or take a study loan toward it and pay that ` +
    `back over time. Do you take it up, or leave it for another season?`
  );
}

// The framing of a cross-domain new venture (Phase 10): a chance to start something
// outside the trade the player already works — a boat, a route, a roadside stand.
// The genuine trade-off — capital and a new set of worries against another stream of
// money — stated in prose. A low-barrier hustle hints at how many are already at it.
function buildNewVentureSituation(world: WorldState, decision: PlayerDecision): string {
  const opp = findOpportunity(world, decision);
  const spec = opp?.newVenture;
  const place = parishName(world);
  if (!spec) {
    return `There is a chance to start something new on the side, if you can find the money for it.`;
  }
  const crowdLine =
    spec.barrierTier === 'LOW'
      ? `It is the kind of thing anyone can start, which is the catch — you would not be the ` +
        `only one with the idea, and the more hands at it around ${place} the thinner the takings spread.`
      : `It is a real step into a line of work you do not know the way you know your own — ` +
        `another set of worries, another thing that can go wrong while your back is turned.`;
  return (
    `Word reaches you of ${spec.label} going — separate from what you already do, a stream of ` +
    `money running alongside the rest. The cost to get into it is ${formatCurrency(spec.entryCost)}.\n\n` +
    `${crowdLine}\n\n` +
    `You could put down what you have and borrow the rest, or let it pass and keep your hands ` +
    `on the work you know. Around ${place} a person is known by what they take on. Do you reach ` +
    `for this one?`
  );
}

// The framing of a crowdfunding round (Phase 11): raising what the work needs from
// the people around you, as a loan or a stake. The genuine trade-off — a debt
// between friends vs. a hand in your business for good — stated in prose, no rates.
function buildCrowdfundSituation(world: WorldState, decision: PlayerDecision): string {
  const opp = findOpportunity(world, decision);
  const spec = opp?.crowdfund;
  const place = parishName(world);
  if (!spec) {
    return `There is a way to raise what you need from people who know you, if you are willing to ask.`;
  }
  return (
    `You have been turning over how to find the money for ${spec.ventureLabel}. The bank is one ` +
    `road. The other runs through the people around you — a few have done well enough to put ` +
    `something in, and word has reached them that you are looking.\n\n` +
    `Some would lend it to you, to be paid back in time. Others would rather take a stake — money ` +
    `in now for a cut of what the work makes later, and theirs to keep. Each carries its own ` +
    `weight: a loan is a debt between friends; a stake is a hand in your business for years.\n\n` +
    `Around ${place} money and friendship run close together, and people remember both how you ` +
    `paid and how you treated them. Whose help do you take, if any?`
  );
}

// The framing of a partnership (Phase 11): going in with someone on a shared firm —
// more reach than either could stand up alone, against a say that is no longer yours
// alone. Stated in prose; no shares-as-numbers, no risk labels.
function buildPartnershipSituation(world: WorldState, decision: PlayerDecision): string {
  const opp = findOpportunity(world, decision);
  const spec = opp?.partnership;
  const place = parishName(world);
  if (!spec) {
    return `There is a chance to go in with someone on a piece of work, if the two of you can agree.`;
  }
  return (
    `${spec.partnerName} has put a proposition to you: the two of you go in together on ` +
    `${spec.companyName}. You each put up your share, the bank carries the rest, and from there ` +
    `it is a thing you own between you.\n\n` +
    `It is more than either of you could stand up alone — more reach, more work, more coming in. ` +
    `But it is shared, all of it: the takings, the costs, the say in how things are run. Two ` +
    `people pulling the same way is a strong thing, right up until the day they pull apart.\n\n` +
    `You have known ${spec.partnerName} around ${place} a long time. Do you throw in with them, ` +
    `or keep to your own?`
  );
}

// A short, in-voice acknowledgement of the choice just made — the line the
// resolution returns. No outcome, no judgement; the consequence comes later.
export function buildDecisionAcknowledgement(world: WorldState, decision: PlayerDecision): string {
  if (decision.kind === 'ASSET_UPGRADE') return buildUpgradeAcknowledgement(world, decision);
  if (decision.kind === 'EDUCATION_ENROLMENT') return buildEducationAcknowledgement(world, decision);
  if (decision.kind === 'NEW_VENTURE') return buildNewVentureAcknowledgement(world, decision);
  if (decision.kind === 'CROWDFUND') return buildCrowdfundAcknowledgement(world, decision);
  if (decision.kind === 'PARTNERSHIP') return buildPartnershipAcknowledgement(world, decision);
  const opp = findOpportunity(world, decision);
  const name = opp?.npcName ?? 'her';
  const chosen = decision.options.find((o) => o.id === decision.chosenOptionId);
  if (chosen?.effect.incomeMode === 'STANDING') {
    return `You tell ${name} yes. From next month you are her supplier. The two of you shake on it.`;
  }
  return `You tell ${name} you will keep things as they are. She nods — no hard feelings — and the wharf stays your market.`;
}

// The acknowledgement after an upgrade is bought — the equipment is yours, and (if
// financed) the bank's payment is now part of the month. No outcome, no judgement.
function buildUpgradeAcknowledgement(world: WorldState, decision: PlayerDecision): string {
  const opp = findOpportunity(world, decision);
  const label = opp?.upgrade?.assetLabel ?? 'the bigger setup';
  return (
    `It is done — ${label} is yours now. The work gets bigger from here, and so do the ` +
    `bills that come with it. Whatever the season brings, the asset is in your hands.`
  );
}

// The acknowledgement after a new venture is taken on (Phase 10): the thing is yours
// to run now, a second line of work and the bills that come with it. No outcome yet.
function buildNewVentureAcknowledgement(world: WorldState, decision: PlayerDecision): string {
  const opp = findOpportunity(world, decision);
  const label = opp?.newVenture?.ventureLabel ?? 'the new venture';
  return (
    `It is done — ${label} is yours to run now, alongside everything else. A second thing ` +
    `pulling on your time and your money, and a second chance at a bit more coming in. ` +
    `What the work makes of it is for the months ahead to say.`
  );
}

// The acknowledgement after a crowdfunding round (Phase 11): a friend's money taken
// in (as a loan or a stake), or the choice to carry it alone. No outcome yet.
function buildCrowdfundAcknowledgement(world: WorldState, decision: PlayerDecision): string {
  const chosen = decision.options.find((o) => o.id === decision.chosenOptionId);
  const funding = chosen?.effect.funding;
  if (!funding) {
    return `You keep your own counsel and your own books. No one's money but yours rides on this, and no one's word to keep but your own.`;
  }
  if (funding.fundingKind === 'EQUITY') {
    return (
      `${funding.backerName} is in with you now — their money behind the work, a share of what it ` +
      `makes theirs from here. You shake on it. A partner of a kind, whether you call it that or not.`
    );
  }
  return (
    `${funding.backerName} counts the money into your hand. A loan between friends, which is its own ` +
    `kind of weight. You will pay it back the way you agreed, and you mean to.`
  );
}

// The acknowledgement after a partnership choice (Phase 11): the firm formed and
// shared, or the chance let pass. No outcome — the work will tell, in time.
function buildPartnershipAcknowledgement(world: WorldState, decision: PlayerDecision): string {
  const opp = findOpportunity(world, decision);
  const name = opp?.partnership?.partnerName ?? 'your partner';
  const chosen = decision.options.find((o) => o.id === decision.chosenOptionId);
  if (chosen?.effect.accept) {
    return (
      `It is done — you and ${name} are partners now, the firm yours between you. The work is ` +
      `bigger than either of you carried alone, and so is the trust it rests on.`
    );
  }
  return `You let it go. You keep to your own work, your own books, your own say. ${name} takes it well enough.`;
}

// The acknowledgement after an enrolment choice (Phase 9): the forms signed and the
// first payment made, or the chance let go by. No outcome — the years do the work.
function buildEducationAcknowledgement(world: WorldState, decision: PlayerDecision): string {
  // Enrolment is financed interactively now (P14.5), so this line only renders once the
  // player has committed — there is no decline branch to acknowledge.
  const opp = findOpportunity(world, decision);
  const name = opp?.enrolment?.name ?? 'the course';
  return (
    `You sign the forms and pay the first of it. ${capitalise(name)} is yours to see through ` +
    `now — the evenings will be long, but you have started.`
  );
}

// The completion MEMORY (Phase 9): months of tuition and tired evenings, now a
// credential earned. Surfaces the month the program finishes. No mechanics, no
// claimed outcome the simulation didn't produce — just the weight of having done it.
export function generateEducationCompletionEntry(world: WorldState, program: EnrolledProgram): NarrativeEntry {
  const text =
    `It is finished. The last of ${program.name} is behind you now — the late evenings, the ` +
    `months the money went out with nothing to show, all of it settled into a qualification ` +
    `with your name on it. You do not feel made over. But you carry something you did not carry ` +
    `before, and there are doors that will open to you now that would have stayed shut. The ` +
    `work was the whole of it. You did the work.`;
  return {
    type: 'MEMORY',
    text,
    month: world.month,
    triggerId: `EDUCATION:${program.programId}:${world.month}`,
  };
}

// The delayed consequence (P6.4): a MEMORY entry that surfaces months after the
// choice and connects back to it WITHOUT naming it as a decision. The path taken,
// or the path not taken, simply shows up in the life. Passes the voice validator.
export function generateConsequenceEntry(world: WorldState, decision: PlayerDecision): NarrativeEntry {
  if (decision.kind === 'ASSET_UPGRADE') return generateUpgradeConsequence(world, decision);
  if (decision.kind === 'NEW_VENTURE') return generateNewVentureConsequence(world, decision);
  if (decision.kind === 'CROWDFUND') return generateCrowdfundConsequence(world, decision);
  if (decision.kind === 'PARTNERSHIP') return generatePartnershipConsequence(world, decision);
  const opp = findOpportunity(world, decision);
  const name = opp?.npcName ?? 'Eunice';
  const chosen = decision.options.find((o) => o.id === decision.chosenOptionId);
  const tookStanding = chosen?.effect.incomeMode === 'STANDING';

  const text = tookStanding
    ? `The arrangement with ${name} has settled into something you barely think about now. ` +
      `The money comes the same every month, landed or not, good sea or bad. There were ` +
      `weeks this season the fish ran thick and the wharf price climbed and the other men ` +
      `came in heavy and sold high, and you watched your catch go to her stall at the price ` +
      `you agreed months ago. You do not let it sit on you. Steady has carried you through ` +
      `the lean weeks too, the ones nobody talks about after. You knew what you were trading ` +
      `when you shook her hand. You notice it, some mornings, is all.`
    : `Word reaches you that ${name}'s stall has done well. She found another man to supply ` +
      `her — steady deliveries, a name people have started to mention along with hers. You ` +
      `still sell your catch yourself, week to week, the price what the wharf gives you that ` +
      `morning. Some weeks that is more than she ever offered. Some weeks it is a good deal ` +
      `less, and the rent does not care which. You do not regret keeping your hands free. ` +
      `You made the call with what you knew then. You notice the other road, though, the way ` +
      `you notice weather coming.`;

  return {
    type: 'MEMORY',
    text,
    month: world.month,
    triggerId: `CONSEQUENCE:${decision.id}`,
  };
}

// The delayed MEMORY after an upgrade: how a season or two treated the bet — the
// bigger output against the heavier fixed costs. Connects back without naming it a
// decision, and without claiming an outcome the simulation didn't produce.
function generateUpgradeConsequence(world: WorldState, decision: PlayerDecision): NarrativeEntry {
  const opp = findOpportunity(world, decision);
  const label = opp?.upgrade?.assetLabel ?? 'the bigger setup';
  const text =
    `The bigger work has its own rhythm now. ${capitalise(label)} earns its keep in the good ` +
    `weeks — more comes in than ever did before, and you feel the weight of having reached ` +
    `for it. The lean weeks are heavier too: the payment and the upkeep do not soften when ` +
    `the season does, and there were mornings you did the sums twice. You knew the shape of ` +
    `the bet when you made it. Some days it sits easy, some days it does not. You carry it ` +
    `either way, the way you carry everything you chose.`;
  return {
    type: 'MEMORY',
    text,
    month: world.month,
    triggerId: `CONSEQUENCE:${decision.id}`,
  };
}

// The delayed MEMORY after a new venture (Phase 10): how the second line of work has
// bedded in. A low-barrier hustle carries the saturation beat — everybody's at it now
// — without ever quoting a number; a bigger venture, the weight of the new bills.
function generateNewVentureConsequence(world: WorldState, decision: PlayerDecision): NarrativeEntry {
  const opp = findOpportunity(world, decision);
  const spec = opp?.newVenture;
  const label = spec?.ventureLabel ?? 'the new line of work';
  const text =
    spec?.barrierTier === 'LOW'
      ? `${capitalise(label)} has settled into the run of your weeks. It brings something in, ` +
        `which is what you wanted of it. The thing is, you were never going to be the only one — ` +
        `there are more stands and more sellers at it now than when you started, all chasing the ` +
        `same few coins from the same few pockets, and what comes in some weeks is thinner for it. ` +
        `Other weeks it holds up fine. You take the work as it comes. It was never meant to be the ` +
        `whole of anything.`
      : `${capitalise(label)} has its own rhythm now, separate from the work you came up in. ` +
        `Some of what you hoped for has come, and a share of trouble you did not fully see — the ` +
        `costs land every month whether the money does or not, and there were mornings you did the ` +
        `sums twice. You knew you were reaching past what you knew when you took it on. Some days ` +
        `it sits easy, some days it does not. You carry it either way.`;
  return {
    type: 'MEMORY',
    text,
    month: world.month,
    triggerId: `CONSEQUENCE:${decision.id}`,
  };
}

// The delayed MEMORY after raising money from friends (Phase 11): how owing your own
// people has settled — a stake repaid in faith, or a loan that sits heavier than its
// sum. Connects back without naming the choice; carries the strain of a hard month.
function generateCrowdfundConsequence(world: WorldState, decision: PlayerDecision): NarrativeEntry {
  const chosen = decision.options.find((o) => o.id === decision.chosenOptionId);
  const funding = chosen?.effect.funding;
  const text =
    funding?.fundingKind === 'EQUITY'
      ? `The money your own people put in did its work — the venture stands where it would not have ` +
        `stood on what you had alone. They carry a share of it now, and that changes the thing ` +
        `between you. Some months you hand them their cut and it sits easy, faith repaid in coin. ` +
        `Other months the takings are thin and you feel the weight of people who trusted you with ` +
        `what little they could spare. You knew that when you took it. Help from your own is never ` +
        `only help; it is a thread that ties you tighter, for the good and the bad of it.`
      : `The loan from your friend carried you when the bank would not. The work got its start ` +
        `because of it, and that you do not forget. Paying it back is its own quiet weight. Some ` +
        `months the money goes out clean and nothing is said. Other months it is tight, and you ` +
        `find yourself slow to cross paths with them, the sum not yet in your hand. They have not ` +
        `pressed you. That somehow makes it sit the heavier. You learned that a friend's money is ` +
        `never only money — it is the friendship, lent out alongside it.`;
  return {
    type: 'MEMORY',
    text,
    month: world.month,
    triggerId: `CONSEQUENCE:${decision.id}`,
  };
}

// The delayed MEMORY after forming a partnership (Phase 11): how a thing owned in
// common has worn — halved worries some weeks, a quiet room of disagreement others.
// Connects back without naming the choice; passes the voice validator.
function generatePartnershipConsequence(world: WorldState, decision: PlayerDecision): NarrativeEntry {
  const text =
    `The partnership has its own weather now. There are weeks it is everything you hoped — two ` +
    `sets of hands, the worries halved, the firm reaching further than you could have reached ` +
    `alone. There are other weeks you and your partner see a thing differently and the room goes ` +
    `quiet, and you remember that what you built, you built to share — the hard of it with the ` +
    `good. The money comes and goes between you by what you agreed, and mostly it holds. You have ` +
    `learned that a thing owned in common is owned by no one wholly, and that this is both its ` +
    `strength and the cost of it.`;
  return {
    type: 'MEMORY',
    text,
    month: world.month,
    triggerId: `CONSEQUENCE:${decision.id}`,
  };
}

function capitalise(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}
