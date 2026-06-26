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

// A short, in-voice acknowledgement of the choice just made — the line the
// resolution returns. No outcome, no judgement; the consequence comes later.
export function buildDecisionAcknowledgement(world: WorldState, decision: PlayerDecision): string {
  const opp = findOpportunity(world, decision);
  const name = opp?.npcName ?? 'her';
  const chosen = decision.options.find((o) => o.id === decision.chosenOptionId);
  if (chosen?.effect.incomeMode === 'STANDING') {
    return `You tell ${name} yes. From next month you are her supplier. The two of you shake on it.`;
  }
  return `You tell ${name} you will keep things as they are. She nods — no hard feelings — and the wharf stays your market.`;
}

// The delayed consequence (P6.4): a MEMORY entry that surfaces months after the
// choice and connects back to it WITHOUT naming it as a decision. The path taken,
// or the path not taken, simply shows up in the life. Passes the voice validator.
export function generateConsequenceEntry(world: WorldState, decision: PlayerDecision): NarrativeEntry {
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
