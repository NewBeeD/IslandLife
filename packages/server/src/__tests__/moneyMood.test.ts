import { describe, expect, it } from 'vitest';
import { buildWorld, injectSystemicShock, simulateOneMonth } from '@island/engine';
import { toMoneyDTO } from '../projection/money';

// The money view's market-watch carries the macro web's MOOD (P20.5) — a qualitative
// phrase, never the raw macro figures (the iceberg, S3).
describe('P20.5 — the macro mood on the money view', () => {
  it('surfaces a credit crunch as prose with no raw numbers', () => {
    const w = buildWorld(7, { population: 200 });
    for (let i = 0; i < 24; i++) simulateOneMonth(w);
    injectSystemicShock(w.macro, 1);
    simulateOneMonth(w);

    const mood = toMoneyDTO(w).marketMood;
    expect(mood).toBeDefined();
    expect(mood!.toLowerCase()).toContain('tight');
    // No macro internals leak — the mood is prose, not a figure.
    expect(mood).not.toMatch(/\d/);
    expect(mood).not.toMatch(/%/);
  });

  it('a mood, when present, is always plain prose (leaks no numbers) over a long run', () => {
    const w = buildWorld(3, { population: 250 });
    for (let i = 0; i < 120; i++) {
      simulateOneMonth(w);
      const mood = toMoneyDTO(w).marketMood;
      if (mood) expect(mood).not.toMatch(/\d/);
    }
  });
});
