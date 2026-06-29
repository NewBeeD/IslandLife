import { describe, expect, it } from 'vitest';
import {
  applyUpgradeFinancing,
  buildWorld,
  credentialLevelOf,
  deserializeWorld,
  detectEducationCompletions,
  eligiblePrograms,
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
  it('offers a program to an eligible player and enrolling (self-funded) starts it', () => {
    const world = student();
    surfaceOpportunities(world);
    const opp = educationOpp(world);
    expect(opp).toBeDefined();
    expect(opp!.enrolment).toBeDefined();

    // Financed interactively (P14.5): putting the full cost down (no loan) is the
    // self-funded path that still drains tuition monthly.
    applyUpgradeFinancing(world, opp!.decisionId, opp!.enrolment!.totalCost, 24);
    expect(world.player.education?.enrolled?.programId).toBe(opp!.enrolment!.programId);
    expect(opp!.status).toBe('ACCEPTED');
  });

  it('surfacing alone does not enrol the player', () => {
    const world = student();
    surfaceOpportunities(world);
    const opp = educationOpp(world)!;
    // The decision is financed (no fixed option list); the player is not enrolled until
    // they act on it.
    const decision = world.decisions.find((d) => d.id === opp.decisionId)!;
    expect(decision.options).toHaveLength(0);
    expect(world.player.education?.enrolled ?? null).toBeNull();
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
    // Self-funded enrolment (full cost down, no loan): the old monthly-drain path.
    applyUpgradeFinancing(world, opp.decisionId, opp.enrolment!.totalCost, 24);
    const enrolled = world.player.education!.enrolled!;
    const duration = enrolled.monthsRemaining;
    const totalTuition = duration * enrolled.monthlyCost;
    const litBefore = world.player.knowledge.generalLiteracy;

    // An identical life that did not enrol — same world.rng consumption (the surfacing
    // draw), so its only difference from the enrolled life is the tuition. A self-funded
    // enrolment books no loan and moves no cash up front, so both start equal.
    const baseline = student();
    surfaceOpportunities(baseline);
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

describe('P14.5 — enrolment is financeable with a study loan', () => {
  it('borrowing toward tuition books a loan, pays out the proceeds, and keeps the drain', () => {
    const world = student();
    surfaceOpportunities(world);
    const opp = educationOpp(world)!;
    const total = opp.enrolment!.totalCost;
    const loansBefore = world.player.loans.length;
    const cashBefore = world.player.cash;

    // Put part down and borrow the rest (down = total − 1500 → requested loan ≈ 1500).
    const res = applyUpgradeFinancing(world, opp.decisionId, total - 1500, 24);
    expect(res.principal).toBeGreaterThan(0);

    // A study loan was booked and its proceeds landed in cash (Model B — a liquidity
    // bridge, not a prepayment), so cash rose by the principal rather than falling.
    expect(world.player.loans.length).toBe(loansBefore + 1);
    const loan = world.player.loans[world.player.loans.length - 1]!;
    expect(loan.principal).toBe(res.principal);
    expect(world.player.cash).toBe(cashBefore + res.principal);

    // The program committed and tuition still drains monthly (Phase 9 preserved).
    const enrolled = world.player.education!.enrolled!;
    expect(enrolled.programId).toBe(opp.enrolment!.programId);
    expect(enrolled.monthlyCost).toBeGreaterThan(0);
  });

  it('self-funding the whole cost books no loan and moves no cash up front', () => {
    const world = student();
    surfaceOpportunities(world);
    const opp = educationOpp(world)!;
    const cashBefore = world.player.cash;
    const res = applyUpgradeFinancing(world, opp.decisionId, opp.enrolment!.totalCost, 24);
    expect(res.principal).toBe(0);
    expect(world.player.loans).toHaveLength(0);
    expect(world.player.cash).toBe(cashBefore); // tuition drains later, monthly
    expect(world.player.education!.enrolled!.monthlyCost).toBeGreaterThan(0);
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
