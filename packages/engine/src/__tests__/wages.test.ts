import { describe, expect, it } from 'vitest';
import { DOMINICA_BASE_DAY, NEW_WORKER_RATE_PREMIUM } from '@island/shared';
import type { CreationChoices } from '@island/engine';
import {
  buildWorld,
  newWorkerWageProfile,
  resolveDecision,
  surfaceOpportunities,
  updatePlayerIncome,
  wageDailyRate,
} from '@island/engine';

// PHASE 15 — the grounded wage model & worker progression.

// A construction worker created through the five forks (mason family, self-employed).
const CONSTRUCTION_WORKER: CreationChoices = {
  background: 'F', // mason / construction family
  school: 'B',
  formative: 'A',
  tendency: 'A',
  situation: 'B', // self-employed from day one
};

function zeroSkill(p: ReturnType<typeof buildWorld>['player']): void {
  for (const k of Object.keys(p.experience) as (keyof typeof p.experience)[]) p.experience[k] = 0;
  for (const k of Object.keys(p.knowledge) as (keyof typeof p.knowledge)[]) p.knowledge[k] = 0;
  p.economicAssets = [];
  p.ventures = undefined;
  p.education = undefined;
}

describe('the wage model (P15.1)', () => {
  it("a construction worker's day rate × workdays equals the banked monthly income (idea 1)", () => {
    const world = buildWorld(42, { population: 60, choices: CONSTRUCTION_WORKER });
    const p = world.player;
    expect(p.occupation).toBe('CONSTRUCTION');
    expect(p.wageProfile).toBeDefined();
    const { dailyRate, workdaysPerMonth } = p.wageProfile!;
    expect(p.monthlyIncome).toBe(Math.round(dailyRate * workdaysPerMonth));
    // And the figure recomputes to the same thing on advance (idempotent).
    updatePlayerIncome(world);
    expect(p.monthlyIncome).toBe(Math.round(p.wageProfile!.dailyRate * workdaysPerMonth));
  });

  it('a new, unskilled worker starts at the Dominica calibrated base (idea 2)', () => {
    const world = buildWorld(7, { population: 30 });
    const p = world.player;
    p.occupation = 'CONSTRUCTION';
    zeroSkill(p);
    // No skill, no tools, no paper → exactly the green-hire base day rate.
    expect(wageDailyRate(p, 'CONSTRUCTION')).toBe(Math.round(DOMINICA_BASE_DAY * NEW_WORKER_RATE_PREMIUM));
  });
});

describe('the rate rises with skill, tools & credentials (P15.2, ideas 2 & 8)', () => {
  it('experience, tools and a credential each lift the day rate', () => {
    const world = buildWorld(7, { population: 30 });
    const p = world.player;
    p.occupation = 'CONSTRUCTION';
    zeroSkill(p);

    const base = wageDailyRate(p, 'CONSTRUCTION');

    p.experience.construction = 0.6;
    const withSkill = wageDailyRate(p, 'CONSTRUCTION');
    expect(withSkill).toBeGreaterThan(base);

    p.economicAssets = [{ id: 'TOOLS', type: 'EQUIPMENT', size: 'MEDIUM', value: 8000 }];
    const withTools = wageDailyRate(p, 'CONSTRUCTION');
    expect(withTools).toBeGreaterThan(withSkill);

    p.education = { level: 'CERTIFICATE', enrolled: null };
    const withCert = wageDailyRate(p, 'CONSTRUCTION');
    expect(withCert).toBeGreaterThan(withTools);
  });

  it('a fresh certificate produces a visible pay increase (idea 8)', () => {
    const world = buildWorld(11, { population: 30 });
    const p = world.player;
    p.occupation = 'CONSTRUCTION';
    zeroSkill(p);
    p.experience.construction = 0.3;
    p.wageProfile = newWorkerWageProfile();

    updatePlayerIncome(world);
    const before = p.monthlyIncome;

    p.education = { level: 'CERTIFICATE', enrolled: null };
    updatePlayerIncome(world);
    const after = p.monthlyIncome;

    // A certificate lifts the monthly take by a noticeable margin, not a rounding wobble.
    expect(after).toBeGreaterThan(before + 100);
  });
});

describe('independent side jobs unlock with experience (P15.3)', () => {
  function wageWorker(seed: number, experience: number): ReturnType<typeof buildWorld> {
    const world = buildWorld(seed, { population: 40 });
    const p = world.player;
    p.occupation = 'CONSTRUCTION';
    p.employmentStatus = 'SELF_EMPLOYED';
    zeroSkill(p);
    p.experience.construction = experience;
    p.wageProfile = newWorkerWageProfile();
    world.month = 8;
    return world;
  }

  it('a green worker is not offered independent side jobs', () => {
    const world = wageWorker(3, 0.1);
    surfaceOpportunities(world);
    expect(world.opportunities.some((o) => o.kind === 'SIDE_JOB')).toBe(false);
  });

  it('an experienced worker is offered side jobs, and taking one pays out (idea 1)', () => {
    const world = wageWorker(3, 0.5);
    surfaceOpportunities(world);
    const offer = world.opportunities.find((o) => o.kind === 'SIDE_JOB');
    expect(offer).toBeDefined();
    expect(offer!.sideJob!.payout).toBeGreaterThan(0);

    const cashBefore = world.player.cash;
    resolveDecision(world, offer!.decisionId, 'TAKE');
    expect(world.player.cash).toBe(cashBefore + offer!.sideJob!.payout);
    expect(offer!.status).toBe('ACCEPTED');
  });
});
