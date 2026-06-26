import { describe, expect, it } from 'vitest';
import {
  EUNICE_DECISION_ID,
  EUNICE_OPTION_ACCEPT,
  EUNICE_OPTION_DECLINE,
  applyUpgradeFinancing,
  buildWorld,
  resolveDecision,
  surfaceOpportunities,
} from '@island/engine';
import type { PlayerDecision, WorldState } from '@island/shared';
import {
  buildDecisionSituation,
  buildDecisionAcknowledgement,
  generateConsequenceEntry,
  generateEducationCompletionEntry,
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

function fisherWithUpgradeOffer(seed = 21): { world: WorldState; decision: PlayerDecision } {
  const world = buildWorld(seed, { population: 60 });
  const p = world.player;
  p.occupation = 'FISHING';
  p.employmentStatus = 'SELF_EMPLOYED';
  p.parish = 'SAINT_JOHN';
  p.socialCapitalLocal = 0.1; // only the upgrade surfaces, not Eunice
  p.experience.fishing = 0.3;
  p.monthlyIncome = 1600;
  p.cash = 12000;
  world.month = 4;
  surfaceOpportunities(world);
  const decision = world.decisions.find((d) => d.kind === 'ASSET_UPGRADE')!;
  return { world, decision };
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

describe('Phase 7 — the asset-upgrade decision reads in voice and leaks no mechanics', () => {
  it('frames the bigger-boat choice and its trade-off without risk labels', () => {
    const { world, decision } = fisherWithUpgradeOffer();
    const situation = buildDecisionSituation(world, decision);
    expect(situation.toLowerCase()).toContain('you');
    // The genuine trade-off — more output vs. heavier fixed costs — is in the prose.
    expect(situation.toLowerCase()).toMatch(/more|cost|month/);
    expect(situation).not.toMatch(/expected|probability|risk level|outputScale|%/i);
  });

  it('acknowledges the purchase without judging it', () => {
    const { world, decision } = fisherWithUpgradeOffer();
    applyUpgradeFinancing(world, decision.id, 6000, 48);
    const ack = buildDecisionAcknowledgement(world, decision);
    expect(ack.toLowerCase()).toContain('your');
    expect(ack).not.toMatch(/right|wrong|good choice|bad choice/i);
  });

  it('lands a valid MEMORY consequence that never names the choice', () => {
    const { world, decision } = fisherWithUpgradeOffer();
    applyUpgradeFinancing(world, decision.id, 6000, 48);
    world.month = decision.consequenceMonth!;
    const entry = generateConsequenceEntry(world, decision);
    expect(entry.type).toBe('MEMORY');
    const result = validateNarrativeEntry(entry.text, 'ANNUAL_REFLECTION');
    expect(result.valid, result.issues.join('; ')).toBe(true);
    expect(entry.text.toLowerCase()).not.toContain('decision');
  });
});

function studentWithOffer(seed = 51): WorldState {
  const world = buildWorld(seed, { population: 60 });
  const p = world.player;
  p.occupation = null;
  p.employmentStatus = 'EMPLOYED';
  p.employer = null;
  p.socialCapitalLocal = 0.1;
  p.monthlyIncome = 1800;
  p.cash = 20000;
  world.month = 3;
  surfaceOpportunities(world);
  return world;
}

describe('Phase 9 — education reads in voice and leaks no mechanics', () => {
  it('frames the enrol decision and its trade-off without numbers-as-mechanics', () => {
    const world = studentWithOffer();
    const decision = world.decisions.find((d) => d.kind === 'EDUCATION_ENROLMENT')!;
    const situation = buildDecisionSituation(world, decision);
    expect(situation.toLowerCase()).toContain('you');
    expect(situation.toLowerCase()).toMatch(/month|study|qualification/);
    expect(situation).not.toMatch(/expected|probability|risk level|%/i);
  });

  it('acknowledges enrolling without judging it', () => {
    const world = studentWithOffer();
    const decision = world.decisions.find((d) => d.kind === 'EDUCATION_ENROLMENT')!;
    resolveDecision(world, decision.id, 'ENROL');
    const ack = buildDecisionAcknowledgement(world, decision);
    expect(ack.toLowerCase()).toContain('you');
    expect(ack).not.toMatch(/right|wrong|good choice|bad choice/i);
  });

  it('lands a valid completion MEMORY that never names it a decision', () => {
    const world = studentWithOffer();
    const decision = world.decisions.find((d) => d.kind === 'EDUCATION_ENROLMENT')!;
    resolveDecision(world, decision.id, 'ENROL');
    const program = world.player.education!.enrolled!;
    const entry = generateEducationCompletionEntry(world, program);
    expect(entry.type).toBe('MEMORY');
    const result = validateNarrativeEntry(entry.text, 'ANNUAL_REFLECTION');
    expect(result.valid, result.issues.join('; ')).toBe(true);
    expect(entry.text.toLowerCase()).not.toContain('decision');
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
