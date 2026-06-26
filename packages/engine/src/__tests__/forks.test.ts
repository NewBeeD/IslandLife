import { describe, expect, it } from 'vitest';
import { createCharacter, createRng } from '../index';
import type { CreationChoices, ForkOption } from '../index';

const make = (choices: CreationChoices, seed = 5) => createCharacter(createRng(seed), choices);
const base = (over: Partial<CreationChoices> = {}): CreationChoices => ({
  background: 'A', school: 'B', formative: 'A', tendency: 'A', situation: 'A', ...over,
});

describe('character creation — forks (P3.2)', () => {
  it('is deterministic for a given (seed, choices)', () => {
    const c = base({ background: 'D', situation: 'D' });
    expect(make(c, 11)).toEqual(make(c, 11));
  });

  describe('Fork 1 — family background', () => {
    it('A: fishing Portsmouth — cash, parish, fishing knowledge', () => {
      const p = make(base({ background: 'A' }));
      expect(p.familyBackground).toBe('FISHING_PORTSMOUTH');
      expect(p.birthParish).toBe('SAINT_JOHN');
      expect(p.cash).toBeGreaterThanOrEqual(2000);
      expect(p.knowledge.fishing).toBeGreaterThan(0);
    });
    it('B: farming — asset-rich, cash-poor (LAND in net worth)', () => {
      const p = make(base({ background: 'B' }));
      expect(p.familyBackground).toBe('FARMING_INTERIOR');
      expect(p.economicAssets.some((a) => a.type === 'LAND')).toBe(true);
      expect(p.netWorth).toBeGreaterThan(p.cash); // land lifts net worth above cash
    });
    it('C: civil servant — institutional capital + literacy', () => {
      const p = make(base({ background: 'C' }));
      expect(p.familyBackground).toBe('CIVIL_SERVANT_ROSEAU');
      expect(p.knowledge.generalLiteracy).toBeGreaterThan(0);
    });
    it('D: trading — informal trade + retail knowledge', () => {
      const p = make(base({ background: 'D' }));
      expect(p.familyBackground).toBe('TRADING_ROSEAU');
      expect(p.knowledge.informalTrade).toBeGreaterThan(0);
      expect(p.knowledge.retail).toBeGreaterThan(0);
    });
  });

  describe('Fork 2 — school', () => {
    it('A excels: high education score + unlocked paths', () => {
      const p = make(base({ school: 'A' }));
      expect(p.educationScore).toBeCloseTo(0.75);
      expect(p.unlockedPaths.length).toBe(3);
    });
    it('D bright-but-disengaged: faster learner', () => {
      const p = make(base({ school: 'D' }));
      expect(p.knowledgeAcquisitionRate).toBeCloseTo(0.2);
    });
  });

  describe('Fork 3 — formative event', () => {
    it('A hurricane: loss aversion + climate awareness flag', () => {
      const p = make(base({ formative: 'A' }));
      expect(p.formativeEvent).toBe('HURRICANE');
      expect(p.flags.climateRiskAwareness).toBe('HIGH');
    });
    it('D mentor: a real contact accessible day one', () => {
      const p = make(base({ formative: 'D' }));
      expect(p.mentorContact).not.toBeNull();
      expect(p.mentorContact?.accessibleFrom).toBe('DAY_ONE');
    });
  });

  describe('Fork 4 — tendency', () => {
    it('B instinctive lifts risk tolerance above D analytical', () => {
      const inst = make(base({ tendency: 'B' }));
      const anal = make(base({ tendency: 'D' }));
      expect(inst.personalityTendency).toBe('INSTINCTIVE');
      expect(anal.personalityTendency).toBe('ANALYTICAL');
      expect(inst.riskTolerance).toBeGreaterThan(anal.riskTolerance);
    });
  });

  describe('Fork 5 — situation', () => {
    it('A employed: a starting job, no opportunity', () => {
      const p = make(base({ situation: 'A' }));
      expect(p.situationAtStart).toBe('EMPLOYED');
      expect(p.startingJob).not.toBeNull();
    });
    it('D opportunity pending: spent cash, opportunity surfaced', () => {
      const p = make(base({ situation: 'D' }));
      expect(p.situationAtStart).toBe('OPPORTUNITY_PENDING');
      expect(p.startingOpportunity).not.toBeNull();
      expect(p.startingOpportunity?.timeWindow).toBe(90);
    });
  });

  describe('edge case — civil servant has no inherited industry (null fallback)', () => {
    it('2C dropout writes to finance/retail, never null', () => {
      const p = make(base({ background: 'C', school: 'C' }));
      // knowledge[familyIndustry] redirected to finance; experience to retail
      expect(p.knowledge.finance).toBeGreaterThan(0);
      expect(p.experience.retail).toBeGreaterThan(0);
      expect(Object.values(p.knowledge).every((v) => Number.isFinite(v))).toBe(true);
    });
    it('5B self-employed industry falls back to a real domain, not null', () => {
      const p = make(base({ background: 'C', situation: 'B' }));
      expect(p.startingIncome).not.toBeNull();
      expect(p.startingIncome?.industry).toBe('retail');
    });
    it('3D mentor domain falls back to finance, not null', () => {
      const p = make(base({ background: 'C', formative: 'D' }));
      expect(p.mentorContact?.domain).toBe('finance');
    });
  });

  describe('derived tendencies + fork modifiers (P3.3)', () => {
    it('3A hurricane raises loss aversion', () => {
      expect(make(base({ formative: 'A' })).lossAversion).toBeGreaterThan(
        make(base({ formative: 'B' })).lossAversion,
      );
    });
    it('3C exploitation raises entrepreneurial drive and lowers institutional trust', () => {
      const exploited = make(base({ formative: 'C' }));
      const baseline = make(base({ formative: 'B' }));
      expect(exploited.entrepreneurialDrive).toBeGreaterThan(baseline.entrepreneurialDrive);
      expect(exploited.institutionalTrust).toBeLessThan(baseline.institutionalTrust);
    });
    it('4A deliberate is more patient than 4B instinctive', () => {
      expect(make(base({ tendency: 'A' })).patience).toBeGreaterThan(
        make(base({ tendency: 'B' })).patience,
      );
    });
  });

  it('all OCEAN/capital traits stay clamped to [0.05, 0.95] across every option', () => {
    const opts: ForkOption[] = ['A', 'B', 'C', 'D'];
    for (const bg of opts)
      for (const f of opts) {
        const p = make(base({ background: bg, formative: f, tendency: 'D' }));
        for (const t of [p.openness, p.conscientiousness, p.extraversion, p.agreeableness, p.neuroticism, p.culturalCapital, p.socialCapitalLocal]) {
          expect(t).toBeGreaterThanOrEqual(0.05);
          expect(t).toBeLessThanOrEqual(0.95);
        }
      }
  });
});
