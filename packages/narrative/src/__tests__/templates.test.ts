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
    const a = generateMonthlyEntries(advanced(1, 12)).map((e) => e.text);
    const b = generateMonthlyEntries(advanced(2, 12)).map((e) => e.text);
    expect(a).not.toEqual(b);
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
