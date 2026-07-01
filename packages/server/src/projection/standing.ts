import {
  civicStandingOf,
  employerQualityOf,
  fairDealingOf,
  financialReliabilityOf,
  reputationBand,
} from '@island/engine';
import type { WorldState } from '@island/shared';

// The player's reputation (Phase 21) surfaced as PROSE BANDS, never a score (S3). The
// hidden 0–1 ledger becomes a sentence the player reads on the money and skills views;
// the raw numbers never cross the wire (the iceberg test enforces this). Each line is
// omitted at the neutral middle band, so a fresh, unremarkable standing adds no noise —
// the prose appears only once the player has earned or lost something worth remarking on.

// Whether the player has a reputation ledger yet (it materialises after the first month).
function hasLedger(world: WorldState): boolean {
  return world.player.reputation != null;
}

// The player's money-facing standing: how the banks and the people they owe remember
// them. Reads financial reliability, with fair dealing as a secondary shade. Undefined
// at the neutral band (nothing worth saying).
export function financialStandingProse(world: WorldState): string | undefined {
  if (!hasLedger(world)) return undefined;
  const p = world.player;
  const band = reputationBand(financialReliabilityOf(p));
  const fair = reputationBand(fairDealingOf(p));
  switch (band) {
    case 'STRONG':
      return 'The banks remember you as good for your word. Money comes easier to you now, and on better terms than most can get — a name built slowly, worth more than any single deal.';
    case 'SOLID':
      return 'You have a sound name with the banks and the people you deal with. Your credit stands up, and a fair offer is not hard to come by.';
    case 'SHAKY':
      return 'Your name has taken a knock. The banks look twice at you now, and what they offer comes dearer than it did. It will mend — slowly, with a clean run behind you.';
    case 'POOR':
      return 'The banks remember a promise broken. Credit is hard to come by, and what little you can get is dear. Only time and a long clean stretch will put it right.';
    default:
      // FAIR — but a notably unfair-dealing reputation is still worth a quiet word.
      return fair === 'POOR' || fair === 'SHAKY'
        ? 'Word has got around that you do not always deal straight. People you trade with are warier than they were, and some want their money up front now.'
        : undefined;
  }
}

// The player's work-facing standing: how they are regarded as someone to work for and
// deal with around the parish — the "trusted with bigger jobs" read. Blends employer
// quality, civic standing, and fair dealing. Undefined when nothing stands out.
export function workStandingProse(world: WorldState): string | undefined {
  if (!hasLedger(world)) return undefined;
  const p = world.player;
  const employer = reputationBand(employerQualityOf(p));
  const civic = reputationBand(civicStandingOf(p));
  const fair = reputationBand(fairDealingOf(p));
  if (employer === 'STRONG' || fair === 'STRONG') {
    return 'People trust you with bigger jobs now, and a good hand will come to work for you before they try elsewhere. A name for treating people right opens doors that money alone does not.';
  }
  if (employer === 'POOR' || fair === 'POOR') {
    return 'You have got a name as a hard person to work for, or to deal with. Good hands think twice before they throw in with you, and the ones who do want more for it.';
  }
  if (civic === 'STRONG' || civic === 'SOLID') {
    return 'You are well thought of around the parish — the kind of standing that smooths a permit and shortens a queue at the right office.';
  }
  if (civic === 'POOR' || civic === 'SHAKY') {
    return 'You are under a cloud with the people who matter around here. Doors that once opened on your name stick a little now.';
  }
  return undefined;
}
