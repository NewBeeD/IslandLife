import type { CharacterProfile, RNG } from '@island/shared';
import { newDraft } from './base';
import { finalizeProfile } from './finalize';
import { type CreationChoices, applyForks } from './forks';

export { newDraft } from './base';
export { finalizeProfile } from './finalize';
export { emptyKnowledge, emptyExperience } from './draft';
export { applyForks } from './forks';
export { hydratePlayerInto } from './hydrate';
export type { ProfileDraft } from './draft';
export type { CreationChoices, ForkOption, BackgroundOption } from './forks';

// A profile from base distributions only (no fork choices applied).
export function createBaseProfile(rng: RNG): CharacterProfile {
  return finalizeProfile(newDraft(rng));
}

// The full character: base distributions → five forks → finalize. Deterministic
// for a given (seed, choices). The result is the hidden profile (P3.4 hydrates an
// NPCAgent from it); it is never shown to the player.
export function createCharacter(rng: RNG, choices: CreationChoices): CharacterProfile {
  return finalizeProfile(applyForks(newDraft(rng), choices, rng));
}
