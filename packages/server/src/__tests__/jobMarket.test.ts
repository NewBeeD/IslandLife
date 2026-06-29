import { describe, expect, it } from 'vitest';
import { buildWorld, surfaceJobs, takeJob } from '@island/engine';
import { toJobsDTO, toMoneyDTO } from '../projection';

// PHASE 16 — the job market projection. The player browses postings net of their
// attached costs, and once they take one the money view shows the wage with the
// transport/food itemized, so the delta reads as net pay (P16.3 / P16.4).

describe('the job market projection (Phase 16)', () => {
  it('lists open postings net of cost, most rewarding first', () => {
    const world = buildWorld(33, { population: 40 });
    world.month = 3;
    surfaceJobs(world);

    const jobs = toJobsDTO(world);
    expect(jobs.postings.length).toBeGreaterThan(0);
    for (let i = 1; i < jobs.postings.length; i++) {
      expect(jobs.postings[i - 1]!.netPerMonth).toBeGreaterThanOrEqual(jobs.postings[i]!.netPerMonth);
    }
    const top = jobs.postings[0]!;
    expect(top.netPerMonth).toBe(top.grossPerMonth - top.costsPerMonth);
    expect(top.costs.length).toBeGreaterThan(0);
  });

  it('after taking a job, the money view shows wages with the costs itemized', () => {
    const world = buildWorld(33, { population: 40 });
    world.month = 3;
    surfaceJobs(world);
    const open = world.jobPostings.find((j) => j.status === 'OPEN')!;
    takeJob(world, open.id);

    const money = toMoneyDTO(world);
    expect(money.income.lines.some((l) => l.label === 'Wages')).toBe(true);
    expect(money.expenses.lines.some((l) => l.label === 'Getting to work')).toBe(true);
    expect(money.expenses.lines.some((l) => l.label === 'Food on the job')).toBe(true);
    // The generic operating line is not double-counted alongside the itemized costs.
    expect(money.expenses.lines.some((l) => l.label === 'Fuel and upkeep')).toBe(false);

    const jobs = toJobsDTO(world);
    expect(jobs.held?.title).toBe(open.title);
    expect(jobs.postings.find((j) => j.id === open.id)).toBeUndefined(); // it is taken, not open
  });
});
