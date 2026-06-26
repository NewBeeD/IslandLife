import { describe, expect, it } from 'vitest';
import {
  EUNICE_DECISION_ID,
  EUNICE_OPTION_ACCEPT,
  EUNICE_OPTION_DECLINE,
  buildWorld,
  resolveDecision,
  surfaceOpportunities,
} from '@island/engine';
import type { WorldState } from '@island/shared';
import {
  buildDecisionSituation,
  buildDecisionAcknowledgement,
  generateConsequenceEntry,
  validateNarrativeEntry,
} from '../index';

function fishingWorldWithOffer(seed = 11): WorldState {
  const world = buildWorld(seed, { population: 60 });
  world.player.occupation = 'FISHING';
  world.player.socialCapitalLocal = 0.5;
  world.player.monthlyIncome = 1200;
  world.month = 3;
  surfaceOpportunities(world);
  return world;
}

describe('P6.2 — the decision interface reads as a moment, not a form', () => {
  it('frames the Eunice offer in the second person and names the trade-off', () => {
    const world = fishingWorldWithOffer();
    const decision = world.decisions[0]!;
    const situation = buildDecisionSituation(world, decision);

    expect(situation).toMatch(/Eunice/);
    expect(situation.toLowerCase()).toContain('you');
    // The genuine trade-off — a standing arrangement vs. the freedom of the wharf —
    // is in the prose, with no expected value or risk label.
    expect(situation.toLowerCase()).toMatch(/standing|wharf|price/);
    expect(situation).not.toMatch(/expected|probability|risk|%/i);
  });

  it('acknowledges either choice without judging it', () => {
    const accept = fishingWorldWithOffer();
    resolveDecision(accept, EUNICE_DECISION_ID, EUNICE_OPTION_ACCEPT);
    const a = buildDecisionAcknowledgement(accept, accept.decisions[0]!);
    expect(a).toMatch(/Eunice/);
    expect(a).not.toMatch(/right|wrong|good choice|bad choice/i);

    const decline = fishingWorldWithOffer();
    resolveDecision(decline, EUNICE_DECISION_ID, EUNICE_OPTION_DECLINE);
    const d = buildDecisionAcknowledgement(decline, decline.decisions[0]!);
    expect(d).toMatch(/wharf/);
  });
});

describe('P6.4 — the delayed consequence connects back without naming the choice', () => {
  for (const option of [EUNICE_OPTION_ACCEPT, EUNICE_OPTION_DECLINE]) {
    it(`is a valid MEMORY entry after choosing ${option}`, () => {
      const world = fishingWorldWithOffer();
      resolveDecision(world, EUNICE_DECISION_ID, option);
      world.month = world.decisions[0]!.consequenceMonth!;

      const entry = generateConsequenceEntry(world, world.decisions[0]!);
      expect(entry.type).toBe('MEMORY');
      expect(entry.month).toBe(world.month);

      const result = validateNarrativeEntry(entry.text, 'FAMILY_MEMBER_DEATH');
      expect(result.valid, result.issues.join('; ')).toBe(true);
      // It connects to the arrangement without ever calling it a "decision".
      expect(entry.text.toLowerCase()).not.toContain('decision');
    });
  }
});
