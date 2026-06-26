import { PARISHES } from '@island/shared';
import type { NarrativeEntry, Opportunity, PlayerDecision, WorldState } from '@island/shared';
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

// A short, in-voice acknowledgement of the choice just made — the line the
// resolution returns. No outcome, no judgement; the consequence comes later.
export function buildDecisionAcknowledgement(world: WorldState, decision: PlayerDecision): string {
  if (decision.kind === 'ASSET_UPGRADE') return buildUpgradeAcknowledgement(world, decision);
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

// The delayed consequence (P6.4): a MEMORY entry that surfaces months after the
// choice and connects back to it WITHOUT naming it as a decision. The path taken,
// or the path not taken, simply shows up in the life. Passes the voice validator.
export function generateConsequenceEntry(world: WorldState, decision: PlayerDecision): NarrativeEntry {
  if (decision.kind === 'ASSET_UPGRADE') return generateUpgradeConsequence(world, decision);
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

function capitalise(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}
