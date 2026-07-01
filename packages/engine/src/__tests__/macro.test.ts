import { describe, expect, it } from 'vitest';
import type { MacroState } from '@island/shared';
import {
  buildWorld,
  deserializeWorld,
  initialMacroState,
  recomputeMacro,
  serializeWorld,
  simulateOneMonth,
} from '../index';

function run(seed: number, months: number) {
  const w = buildWorld(seed, { population: 200 });
  for (let i = 0; i < months; i++) simulateOneMonth(w);
  return w;
}

const inBand = (m: MacroState): void => {
  expect(m.effectiveInterestRate).toBeGreaterThan(0);
  expect(m.effectiveInterestRate).toBeLessThan(0.5);
  expect(m.creditAvailability).toBeGreaterThanOrEqual(0);
  expect(m.creditAvailability).toBeLessThanOrEqual(1);
  expect(m.aggregateDemand).toBeGreaterThanOrEqual(0.6);
  expect(m.aggregateDemand).toBeLessThanOrEqual(1.4);
  expect(m.constructionActivity).toBeGreaterThanOrEqual(0.5);
  expect(m.constructionActivity).toBeLessThanOrEqual(1.4);
  expect(m.businessConfidence).toBeGreaterThanOrEqual(0);
  expect(m.businessConfidence).toBeLessThanOrEqual(1);
  expect(m.consumerConfidence).toBeGreaterThanOrEqual(0);
  expect(m.consumerConfidence).toBeLessThanOrEqual(1);
  expect(m.systemicStress).toBeGreaterThanOrEqual(0);
  expect(m.systemicStress).toBeLessThanOrEqual(1);
};

describe('P20.1 — macro state', () => {
  it('a world is stood up with a neutral baseline macro state', () => {
    const w = buildWorld(42, { population: 100 });
    expect(w.macro).toEqual(initialMacroState(w.country.baseInterestRate));
    expect(w.macro.systemicStress).toBe(0);
    inBand(w.macro);
  });

  it('stays in band and mean-reverts over a long, no-shock run (baseline stable)', () => {
    // "Stable" is bounded and mean-reverting, not frozen — it tracks a genuinely noisy
    // real economy (firm births/deaths, seasonal prices) without diverging or railing.
    const w = buildWorld(42, { population: 200 });
    const samples: MacroState[] = [];
    for (let i = 0; i < 120; i++) {
      simulateOneMonth(w);
      inBand(w.macro);
      if (i >= 60) samples.push({ ...w.macro });
    }
    // The tail neither pins at a rail nor drifts off — month-to-month steps stay small
    // (the persistence in MOVE damps the signal), so no runaway.
    for (let i = 1; i < samples.length; i++) {
      expect(Math.abs(samples[i]!.businessConfidence - samples[i - 1]!.businessConfidence)).toBeLessThan(0.2);
      expect(Math.abs(samples[i]!.aggregateDemand - samples[i - 1]!.aggregateDemand)).toBeLessThan(0.2);
    }
    // Not stuck at an extreme — the mid of the tail sits off both rails.
    const mid = samples[samples.length - 1]!;
    expect(mid.businessConfidence).toBeGreaterThan(0.02);
    expect(mid.businessConfidence).toBeLessThan(0.99);
  });

  it('is derived, not stored truth — a tampered macro is pulled back by one recompute', () => {
    const w = run(7, 6);
    // Absurd hand-edited values; a recompute must ease every one back toward its target.
    w.macro.consumerConfidence = 0;
    w.macro.aggregateDemand = 0.6;
    w.macro.creditAvailability = 0;
    recomputeMacro(w);
    expect(w.macro.consumerConfidence).toBeGreaterThan(0);
    expect(w.macro.aggregateDemand).toBeGreaterThan(0.6);
    expect(w.macro.creditAvailability).toBeGreaterThan(0);
  });

  it('recompute is pure of rng — it does not advance the seed stream', () => {
    const w = run(42, 6);
    const before = w.rng.serialize().state;
    recomputeMacro(w);
    recomputeMacro(w);
    expect(w.rng.serialize().state).toBe(before);
  });

  it('round-trips through serialization', () => {
    const w = run(42, 18);
    const back = deserializeWorld(serializeWorld(w));
    expect(back.macro).toEqual(w.macro);
  });

  it('an older snapshot with no macro deserializes to a baseline and recomputes', () => {
    const w = run(99, 12);
    const s = serializeWorld(w) as unknown as Record<string, unknown>;
    delete s.macro; // simulate a pre-Phase-20 snapshot
    const back = deserializeWorld(s as unknown as ReturnType<typeof serializeWorld>);
    expect(back.macro).toEqual(initialMacroState(w.country.baseInterestRate));
    simulateOneMonth(back); // recomputes without throwing
    inBand(back.macro);
  });

  it('is reproducible per seed', () => {
    expect(run(42, 60).macro).toEqual(run(42, 60).macro);
  });
});
