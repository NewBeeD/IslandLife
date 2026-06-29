import { credentialLevelOf } from '@island/engine';
import type {
  CredentialLevel,
  EducationActionResultDTO,
  EducationStatusDTO,
  WorldState,
} from '@island/shared';

// The player's current studies (Phase 18, P18.5) — their held credential, what they
// are enrolled in, how much is left, and whether it is paused. The player's own facts:
// a program name in prose and a count of months, no hidden mechanics.

function credentialProse(level: CredentialLevel): string {
  switch (level) {
    case 'CERTIFICATE':
      return 'You hold a skills certificate.';
    case 'ASSOCIATE':
      return 'You hold an associate degree.';
    case 'DEGREE':
      return "You hold a bachelor's degree.";
    case 'MASTERS':
      return "You hold a master's degree.";
    default:
      return 'You hold no formal qualification yet.';
  }
}

export function toEducationStatusDTO(world: WorldState): EducationStatusDTO {
  const e = world.player.education?.enrolled ?? null;
  return {
    credential: credentialProse(credentialLevelOf(world.player)),
    enrolled: e != null,
    programName: e?.name ?? null,
    monthsLeft: e?.monthsRemaining ?? 0,
    paused: e?.paused ?? false,
  };
}

export function toEducationActionResultDTO(
  world: WorldState,
  acknowledgement: string,
): EducationActionResultDTO {
  const e = world.player.education?.enrolled ?? null;
  return {
    enrolled: e != null,
    programName: e?.name ?? null,
    monthsLeft: e?.monthsRemaining ?? 0,
    paused: e?.paused ?? false,
    acknowledgement,
  };
}
