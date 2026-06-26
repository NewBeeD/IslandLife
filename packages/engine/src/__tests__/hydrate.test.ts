import { describe, expect, it } from 'vitest';
import { buildWorld, worldDigest } from '../index';
import type { CreationChoices } from '../index';

const choices = (over: Partial<CreationChoices> = {}): CreationChoices => ({
  background: 'A', school: 'B', formative: 'A', tendency: 'A', situation: 'A', ...over,
});

describe('hydrate player from profile (P3.4)', () => {
  it('builds agent #1 from the five forks', () => {
    const w = buildWorld(3, { population: 80, choices: choices({ background: 'C', situation: 'B' }) });
    const p = w.player;
    expect(p.isPlayer).toBe(true);
    expect(p.age).toBe(20);
    expect(p.familyBackground).toBe('CIVIL_SERVANT_ROSEAU'); // background C
    expect(p.parish).toBe('SAINT_GEORGE');
    expect(p.employmentStatus).toBe('SELF_EMPLOYED'); // situation B
    expect(p.monthlyIncome).toBeGreaterThan(0);
  });

  it('reflects different choices in the player', () => {
    const employed = buildWorld(3, { population: 80, choices: choices({ situation: 'A' }) }).player;
    const pending = buildWorld(3, { population: 80, choices: choices({ situation: 'D' }) }).player;
    expect(employed.employmentStatus).toBe('EMPLOYED');
    expect(pending.employmentStatus).toBe('UNEMPLOYED'); // opportunity pending, no steady income
  });

  it('is deterministic for a given (seed, choices)', () => {
    const c = choices({ background: 'B', formative: 'D', situation: 'D' });
    expect(worldDigest(buildWorld(9, { population: 80, choices: c }))).toBe(
      worldDigest(buildWorld(9, { population: 80, choices: c })),
    );
  });

  it('the default (no-choices) player path is unchanged', () => {
    const p = buildWorld(1, { population: 80 }).player;
    expect(p.name).toBe('Jean-Pierre Laville');
    expect(p.employmentStatus).toBe('SELF_EMPLOYED');
    expect(p.occupation).toBe('FISHING');
  });

  it('iceberg: profile-only fields do NOT ride along on the agent', () => {
    const p = buildWorld(3, { population: 80, choices: choices() }).player as unknown as Record<
      string,
      unknown
    >;
    for (const hidden of [
      'educationScore', 'institutionalTrust', 'entrepreneurialDrive', 'mentorContact',
      'startingJob', 'startingIncome', 'startingOpportunity', 'personalityTendency',
      'unlockedPaths', 'flags', 'cognitiveAbilityModifier',
    ]) {
      expect(hidden in p).toBe(false);
    }
  });
});
