import { describe, expect, it } from 'vitest';
import {
  EUNICE_DECISION_ID,
  EUNICE_OPTION_ACCEPT,
  buildWorld,
  detectDueConsequences,
  resolveDecision,
  simulateOneMonth,
  surfaceOpportunities,
  updatePlayerIncome,
} from '@island/engine';
import type { NarrativeEntry, WorldState } from '@island/shared';
import { generateConsequenceEntry, generateMonthlyEntries, validateNarrativeEntry } from '../index';

// THE VERTICAL SLICE, end to end and offline (P6.5). This replays exactly what the
// server's POST /advance does each month — the same calls in the same order — so a
// single fishing life in Saint John plays out without the API or the database: the
// Eunice opportunity surfaces, the player chooses, income behaviour changes, and a
// delayed MEMORY consequence lands on schedule and in voice.
function advanceLikeServer(world: WorldState): NarrativeEntry[] {
  updatePlayerIncome(world);
  simulateOneMonth(world);
  const entries = generateMonthlyEntries(world);
  surfaceOpportunities(world);
  const consequences = detectDueConsequences(world).map((d) => generateConsequenceEntry(world, d));
  entries.push(...consequences);
  return entries;
}

describe('the vertical slice — one fishing life, end to end (P6.5)', () => {
  it('surfaces the offer, takes it, changes income, and lands a delayed consequence', () => {
    const world = buildWorld(7, { population: 120 });
    // A fisher in Saint John, known enough around the market to hear Eunice out.
    world.player.occupation = 'FISHING';
    world.player.parish = 'SAINT_JOHN';
    world.player.socialCapitalLocal = 0.5;
    world.player.monthlyIncome = 1200;

    let resolvedMonth: number | null = null;
    let contractAmount = 0;
    const consequenceMonths: number[] = [];
    const incomeAfterAccept: number[] = [];

    for (let i = 0; i < 24; i++) {
      const entries = advanceLikeServer(world);

      // Every entry the player ever sees passes the voice gate.
      for (const e of entries) {
        const r = validateNarrativeEntry(e.text, e.triggerId);
        expect(r.valid, `month ${e.month} ${e.triggerId}: ${r.issues.join('; ')}`).toBe(true);
      }

      // The first time the offer is open, take it (the player acts between months).
      const offer = world.opportunities.find((o) => o.status === 'OPEN');
      if (offer && resolvedMonth === null) {
        const decision = resolveDecision(world, EUNICE_DECISION_ID, EUNICE_OPTION_ACCEPT);
        resolvedMonth = decision.resolvedMonth;
        contractAmount = world.player.standingContract!.monthlyAmount;
      }

      if (resolvedMonth !== null) incomeAfterAccept.push(world.player.monthlyIncome);

      for (const e of entries) {
        if (e.triggerId?.startsWith('CONSEQUENCE:')) {
          expect(e.type).toBe('MEMORY');
          consequenceMonths.push(e.month);
        }
      }
    }

    // The offer surfaced and was taken.
    expect(resolvedMonth).not.toBeNull();
    // The standing contract holds income steady from the month it took effect.
    expect(incomeAfterAccept.every((v) => v === contractAmount)).toBe(true);
    // Exactly one delayed consequence, six months after the choice (P6.4).
    expect(consequenceMonths).toEqual([resolvedMonth! + 6]);
    // The player stayed a fisher through the slice.
    expect(world.player.occupation).toBe('FISHING');
  });
});
