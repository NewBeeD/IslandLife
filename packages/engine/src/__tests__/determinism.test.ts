import { describe, expect, it } from 'vitest';
import { buildWorld, simulateOneMonth, worldDigest } from '../index';

function runMonths(seed: number, months: number): number {
  const world = buildWorld(seed, { population: 200 });
  for (let i = 0; i < months; i++) simulateOneMonth(world);
  return worldDigest(world);
}

describe('engine determinism', () => {
  it('same seed reproduces the same world after 24 months', () => {
    expect(runMonths(42, 24)).toBe(runMonths(42, 24));
  });

  it('different seeds diverge', () => {
    expect(runMonths(42, 24)).not.toBe(runMonths(43, 24));
  });

  it('a world advances its clock and stays internally consistent', () => {
    const world = buildWorld(7, { population: 200 });
    for (let i = 0; i < 12; i++) simulateOneMonth(world);
    expect(world.month).toBe(12);
    // unemployment is a rate in [0,1]
    expect(world.government.unemploymentRate).toBeGreaterThanOrEqual(0);
    expect(world.government.unemploymentRate).toBeLessThanOrEqual(1);
    // bank NPL ratios stay in [0,1]
    for (const b of world.banks) {
      expect(b.nonPerformingLoanRatio).toBeGreaterThanOrEqual(0);
      expect(b.nonPerformingLoanRatio).toBeLessThanOrEqual(1);
    }
    // no NaN cash (the INDUSTRY_DOMAIN mapping bug would surface here)
    for (const a of world.agents) expect(Number.isFinite(a.cash)).toBe(true);
  });
});
