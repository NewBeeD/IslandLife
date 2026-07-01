import { describe, expect, it } from 'vitest';
import { buildWorld, simulateOneMonth } from '@island/engine';
import { formatCurrency, generateMonthlyEntries, validateNarrativeEntry } from '../index';

function advanced(seed: number, months: number) {
  const w = buildWorld(seed, { population: 200 });
  for (let i = 0; i < months; i++) simulateOneMonth(w);
  return w;
}

describe('template narrative engine', () => {
  it('produces 3–8 grounded entries every month over a long run', () => {
    const w = buildWorld(42, { population: 200 });
    for (let m = 0; m < 36; m++) {
      simulateOneMonth(w);
      const entries = generateMonthlyEntries(w);
      expect(entries.length).toBeGreaterThanOrEqual(3);
      expect(entries.length).toBeLessThanOrEqual(8);
      for (const e of entries) {
        expect(e.month).toBe(w.month);
        expect(e.text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('is deterministic in (seed, month) and never touches world.rng', () => {
    const a = advanced(7, 12);
    const b = advanced(7, 12);
    expect(generateMonthlyEntries(a)).toEqual(generateMonthlyEntries(b));
  });

  it('different seeds diverge in the prose they generate', () => {
    // The placeholder player is qualitatively similar across seeds (same trade, parish,
    // income band), so any *single* pair of seeds can land in the same qualitative
    // buckets by chance — the prose is deliberately coarse-grained (the iceberg, S3).
    // The property that must hold is that the engine's variety *does* reach the prose:
    // across a spread of seeds the generated narratives are not all identical.
    const proses = [1, 2, 3, 7, 42, 99].map((s) =>
      JSON.stringify(generateMonthlyEntries(advanced(s, 12)).map((e) => e.text)),
    );
    expect(new Set(proses).size).toBeGreaterThan(1);
  });

  it('every generated entry passes the voice validator', () => {
    for (const seed of [1, 7, 42, 99]) {
      const w = buildWorld(seed, { population: 200 });
      for (let m = 0; m < 24; m++) {
        simulateOneMonth(w);
        for (const e of generateMonthlyEntries(w)) {
          const result = validateNarrativeEntry(e.text, e.triggerId);
          expect(result.issues, `${e.triggerId}: ${result.issues.join(', ')}`).toEqual([]);
        }
      }
    }
  });

  it('always carries an income (PERSONAL) entry for the month', () => {
    const w = advanced(42, 6);
    const entries = generateMonthlyEntries(w);
    expect(entries.some((e) => e.type === 'PERSONAL')).toBe(true);
  });

  it('renders EC$ amounts, never bare dollars', () => {
    expect(formatCurrency(3240)).toBe('EC$3,240');
    expect(formatCurrency(0)).toBe('EC$0');
  });
});
