import { describe, expect, it } from 'vitest';
import { createBaseProfile, createRng } from '../index';
import type { CharacterProfile } from '@island/shared';

const profile = (seed: number): CharacterProfile => createBaseProfile(createRng(seed));

describe('character creation — base distributions (P3.1)', () => {
  it('is deterministic for a given seed', () => {
    expect(profile(123)).toEqual(profile(123));
  });

  it('different seeds produce different people', () => {
    const a = profile(1);
    const b = profile(2);
    // OCEAN is sampled, so at least one trait must differ
    expect(
      a.openness !== b.openness ||
        a.conscientiousness !== b.conscientiousness ||
        a.neuroticism !== b.neuroticism,
    ).toBe(true);
  });

  it('clamps every trait into [0.05, 0.95]', () => {
    const p = profile(42);
    const traits = [
      p.openness, p.conscientiousness, p.extraversion, p.agreeableness, p.neuroticism,
      p.cognitiveAbility, p.resilience, p.selfControl,
      p.socialCapitalLocal, p.socialCapitalInstitutional, p.socialCapitalDiaspora, p.culturalCapital,
    ];
    for (const t of traits) {
      expect(t).toBeGreaterThanOrEqual(0.05);
      expect(t).toBeLessThanOrEqual(0.95);
    }
  });

  it('derived tendencies are well-formed in [0, 1]', () => {
    const p = profile(7);
    for (const v of [p.riskTolerance, p.lossAversion, p.patience, p.institutionalTrust, p.entrepreneurialDrive]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('base profile starts with zero knowledge/experience, no cash, no assets', () => {
    const p = profile(99);
    expect(Object.values(p.knowledge).every((v) => v === 0)).toBe(true);
    expect(Object.values(p.experience).every((v) => v === 0)).toBe(true);
    expect(p.cash).toBe(0);
    expect(p.economicAssets).toHaveLength(0);
    expect(p.netWorth).toBe(0);
    expect(p.knowledgeAcquisitionRate).toBe(0);
  });
});
