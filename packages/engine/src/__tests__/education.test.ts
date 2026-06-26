import { describe, expect, it } from 'vitest';
import {
  buildWorld,
  credentialLevelOf,
  deserializeWorld,
  detectEducationCompletions,
  eligiblePrograms,
  resolveDecision,
  serializeWorld,
  simulateOneMonth,
  surfaceOpportunities,
} from '../index';
import type { Asset, WorldState } from '@island/shared';

// A salaried player (a lecturer) with cash to spare and no fishing/Eunice triggers,
// so only the education offer surfaces.
function student(seed = 51): WorldState {
  const world = buildWorld(seed, { population: 60 });
  const p = world.player;
  p.occupation = null;
  p.employmentStatus = 'EMPLOYED';
  p.employer = null;
  p.parish = 'SAINT_GEORGE';
  p.socialCapitalLocal = 0.1;
  p.monthlyIncome = 1800;
  p.cash = 20000;
  p.knowledge.generalLiteracy = 0.3;
  world.month = 3;
  return world;
}

function educationOpp(world: WorldState) {
  return world.opportunities.find((o) => o.kind === 'EDUCATION_ENROLMENT');
}

describe('P9.1 — education is additive and round-trips', () => {
  it('a fresh player holds NONE and is not enrolled', () => {
    const world = buildWorld(42, { population: 60 });
    expect(credentialLevelOf(world.player)).toBe('NONE');
    expect(world.player.education?.enrolled ?? null).toBeNull();
  });

  it('education state survives a serialize → deserialize round-trip', () => {
    const world = student();
    world.player.education = {
      level: 'CERTIFICATE',
      enrolled: {
        programId: 'EDU_ASSOC_GEN', name: 'an associate degree', field: 'GENERAL',
        targetLevel: 'ASSOCIATE', monthsRemaining: 12, monthlyCost: 500, completionMonth: 20,
      },
    };
    const back = deserializeWorld(serializeWorld(world));
    expect(back.player.education).toEqual(world.player.education);
  });
});

describe('P9.2 — enrolment surfaces and commits', () => {
  it('offers a program to an eligible player and enrolling starts it', () => {
    const world = student();
    surfaceOpportunities(world);
    const opp = educationOpp(world);
    expect(opp).toBeDefined();
    expect(opp!.enrolment).toBeDefined();

    resolveDecision(world, opp!.decisionId, 'ENROL');
    expect(world.player.education?.enrolled?.programId).toBe(opp!.enrolment!.programId);
  });

  it('declining leaves the player un-enrolled', () => {
    const world = student();
    surfaceOpportunities(world);
    const opp = educationOpp(world)!;
    resolveDecision(world, opp.decisionId, 'NOT_NOW');
    expect(world.player.education?.enrolled ?? null).toBeNull();
    expect(opp.status).toBe('DECLINED');
  });

  it('does not offer a level the player already holds', () => {
    const world = student();
    world.player.education = { level: 'CERTIFICATE', enrolled: null };
    const eligible = eligiblePrograms(world);
    expect(eligible.every((p) => p.targetLevel !== 'CERTIFICATE')).toBe(true);
    expect(eligible.every((p) => p.prerequisite === 'CERTIFICATE')).toBe(true);
  });
});

describe('P9.3 — tuition drains cash and completion raises knowledge + credential', () => {
  it('charges monthly and, on completion, advances the credential', () => {
    const world = student();
    surfaceOpportunities(world);
    const opp = educationOpp(world)!;
    resolveDecision(world, opp.decisionId, 'ENROL'); // the cheapest rung: a 6-month certificate
    const enrolled = world.player.education!.enrolled!;
    const duration = enrolled.monthsRemaining;
    const totalTuition = duration * enrolled.monthlyCost;
    const litBefore = world.player.knowledge.generalLiteracy;

    // An identical life that declined — same world.rng consumption (the surfacing
    // draw), so its only difference from the enrolled life is the tuition.
    const baseline = student();
    surfaceOpportunities(baseline);
    resolveDecision(baseline, educationOpp(baseline)!.decisionId, 'NOT_NOW');
    expect(baseline.player.cash).toBe(world.player.cash); // same start

    for (let i = 0; i < duration; i++) {
      simulateOneMonth(world);
      simulateOneMonth(baseline);
    }
    expect(world.player.education!.enrolled!.monthsRemaining).toBe(0);
    // The enrolled life is poorer by exactly the tuition it paid out.
    expect(baseline.player.cash - world.player.cash).toBeCloseTo(totalTuition, 6);

    const done = detectEducationCompletions(world);
    expect(done).toHaveLength(1);
    expect(credentialLevelOf(world.player)).toBe(enrolled.targetLevel);
    expect(world.player.education!.enrolled).toBeNull();
    expect(world.player.knowledge.generalLiteracy).toBeGreaterThan(litBefore);
  });
});

describe('P9.4 — a credential gates a higher opportunity', () => {
  it('hides the commercial-tier upgrade until the credential is earned', () => {
    const world = buildWorld(63, { population: 60 });
    const p = world.player;
    p.occupation = 'FISHING';
    p.employmentStatus = 'SELF_EMPLOYED';
    p.parish = 'SAINT_JOHN';
    p.socialCapitalLocal = 0.1;
    p.experience.fishing = 0.65; // past the tier-3 experience gate
    p.cash = 80000;
    // Already owns the first two rungs, so tier 3 is the next step.
    const owned: Asset[] = [
      { id: 'UPG_FISH_1', type: 'VEHICLE', size: 'MEDIUM', value: 28000 },
      { id: 'UPG_FISH_2', type: 'VEHICLE', size: 'LARGE', value: 65000 },
    ];
    p.economicAssets = owned;
    world.month = 6;

    surfaceOpportunities(world);
    const gatedBefore = world.opportunities.find(
      (o) => o.kind === 'ASSET_UPGRADE' && o.upgrade?.id === 'UPG_FISH_3',
    );
    expect(gatedBefore).toBeUndefined(); // no credential → hidden

    // Earn the credential and look again.
    p.education = { level: 'ASSOCIATE', enrolled: null };
    world.month = 8;
    surfaceOpportunities(world);
    const gatedAfter = world.opportunities.find(
      (o) => o.kind === 'ASSET_UPGRADE' && o.upgrade?.id === 'UPG_FISH_3',
    );
    expect(gatedAfter).toBeDefined();
  });
});
