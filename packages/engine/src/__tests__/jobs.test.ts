import { describe, expect, it } from 'vitest';
import {
  attachedCostsTotal,
  buildWorld,
  deserializeWorld,
  jobMonthlyGross,
  jobNetPerMonth,
  JobError,
  serializeWorld,
  simulateOneMonth,
  surfaceJobs,
  takeJob,
  worldDigest,
} from '@island/engine';
import type { JobPosting } from '@island/shared';

// PHASE 16 — jobs & the job market.

function posting(over: Partial<JobPosting> = {}): JobPosting {
  return {
    id: 'J1',
    specId: 'S1',
    title: 'a job',
    industry: 'RETAIL',
    wageKind: 'SALARY',
    monthlySalary: 1900,
    attachedCosts: { transport: 200, food: 180 },
    stability: 'STEADY',
    surfacedMonth: 0,
    windowMonths: 4,
    status: 'OPEN',
    ...over,
  };
}

describe('the job posting model (P16.1)', () => {
  it('postings round-trip through serialize', () => {
    const world = buildWorld(42, { population: 40 });
    world.month = 3;
    surfaceJobs(world);
    expect(world.jobPostings.length).toBeGreaterThan(0);
    const round = deserializeWorld(serializeWorld(world));
    expect(round.jobPostings).toEqual(world.jobPostings);
  });

  it('the monthly loop never touches the job market — a no-market player is byte-identical (S2)', () => {
    const a = buildWorld(7, { population: 40 });
    const b = buildWorld(7, { population: 40 });
    for (let i = 0; i < 12; i++) {
      simulateOneMonth(a);
      simulateOneMonth(b);
    }
    expect(worldDigest(a)).toBe(worldDigest(b));
    // simulateOneMonth never surfaces jobs, so the market stays empty (digest holds).
    expect(a.jobPostings.length).toBe(0);
  });
});

describe('a market that opens and closes (P16.2)', () => {
  it('opens a slate, and a credential-gated posting stays hidden until the player qualifies', () => {
    const world = buildWorld(5, { population: 40 });
    world.month = 2;
    surfaceJobs(world);
    const open = world.jobPostings.filter((j) => j.status === 'OPEN');
    expect(open.length).toBeGreaterThan(0);
    // The bank clerk job asks for an associate degree — not offered to a green player.
    expect(open.some((j) => j.specId === 'JOB_FIN_CLERK')).toBe(false);

    // Once the player holds the credential, the gated role can surface.
    world.player.education = { level: 'ASSOCIATE', enrolled: null };
    world.player.experience.finance = 0.5;
    // Run the market forward enough cycles that the random slate can include it.
    let sawClerk = false;
    for (let m = 3; m < 40 && !sawClerk; m++) {
      world.month = m;
      surfaceJobs(world);
      sawClerk = world.jobPostings.some((j) => j.specId === 'JOB_FIN_CLERK');
    }
    expect(sawClerk).toBe(true);
  });

  it('postings lapse when their window closes', () => {
    const world = buildWorld(5, { population: 40 });
    world.month = 2;
    surfaceJobs(world);
    const first = world.jobPostings.find((j) => j.status === 'OPEN')!;
    world.month = first.surfacedMonth + first.windowMonths + 1;
    surfaceJobs(world);
    expect(first.status).toBe('EXPIRED');
  });

  it('the slate is deterministic per seed', () => {
    const a = buildWorld(9, { population: 40 });
    const b = buildWorld(9, { population: 40 });
    a.month = 2;
    b.month = 2;
    surfaceJobs(a);
    surfaceJobs(b);
    expect(a.jobPostings.map((j) => j.specId)).toEqual(b.jobPostings.map((j) => j.specId));
  });
});

describe('taking a job, net of expenses (P16.3)', () => {
  it('a job nets pay after its attached costs — a higher-gross far job can net less', () => {
    const far = posting({
      id: 'J_FAR', specId: 'S_FAR', industry: 'CONSTRUCTION', wageKind: 'WAGE',
      dailyRate: 130, monthlySalary: undefined, attachedCosts: { transport: 600, food: 320 },
    });
    const near = posting({
      id: 'J_NEAR', specId: 'S_NEAR', industry: 'CONSTRUCTION', wageKind: 'WAGE',
      dailyRate: 100, monthlySalary: undefined, attachedCosts: { transport: 90, food: 150 },
    });
    expect(jobMonthlyGross(far)).toBe(2600);
    expect(jobMonthlyGross(near)).toBe(2000);
    // The far job grosses more (2600 vs 2000) but nets LESS after the costs of getting
    // there — exactly the trade-off the player must weigh (P16.3).
    expect(jobNetPerMonth(far)).toBe(2600 - 920);
    expect(jobNetPerMonth(near)).toBe(2000 - 240);
    expect(jobNetPerMonth(near)).toBeGreaterThan(jobNetPerMonth(far));
  });

  it('taking a job switches the player and books its costs', () => {
    const world = buildWorld(1, { population: 20 });
    const job = posting({ id: 'J1', industry: 'RETAIL', monthlySalary: 1900, attachedCosts: { transport: 200, food: 180 } });
    world.jobPostings = [job];

    const result = takeJob(world, 'J1');
    const p = world.player;
    expect(p.occupation).toBe('RETAIL');
    expect(p.employmentStatus).toBe('EMPLOYED');
    expect(p.currentJob?.postingId).toBe('J1');
    expect(p.monthlyIncome).toBe(jobMonthlyGross(job));
    expect(p.monthlyOperatingCosts).toBe(attachedCostsTotal(job.attachedCosts));
    expect(job.status).toBe('TAKEN');
    expect(result.netPerMonth).toBe(jobMonthlyGross(job) - attachedCostsTotal(job.attachedCosts));
  });

  it('taking a new job replaces the old one', () => {
    const world = buildWorld(1, { population: 20 });
    const a = posting({ id: 'JA', specId: 'SA', industry: 'RETAIL', monthlySalary: 1500 });
    const b = posting({ id: 'JB', specId: 'SB', industry: 'TOURISM', monthlySalary: 2200 });
    world.jobPostings = [a, b];
    takeJob(world, 'JA');
    takeJob(world, 'JB');
    expect(world.player.occupation).toBe('TOURISM');
    expect(world.player.currentJob?.postingId).toBe('JB');
    expect(world.player.monthlyIncome).toBe(2200);
  });

  it('a closed or unqualified job cannot be taken', () => {
    const world = buildWorld(1, { population: 20 });
    expect(() => takeJob(world, 'missing')).toThrow(JobError);
    const gated = posting({ id: 'JG', specId: 'SG', industry: 'FINANCE', monthlySalary: 3200, minCredential: 'DEGREE' });
    world.jobPostings = [gated];
    expect(() => takeJob(world, 'JG')).toThrow(JobError);
    expect(gated.status).toBe('OPEN'); // not consumed by a rejected take
  });
});
