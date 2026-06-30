import { describe, expect, it } from 'vitest';
import type { NPCAgent } from '@island/shared';
import {
  irrationalBias,
  marketHeat,
  marketMood,
  personalRun,
  type MarketMood,
} from '../irrational';
import { chooseBest, type ActionCandidate } from '../prospect';

// Trait bundles. Only the fields the irrational tilt reads need to be set.
const anxious = { extraversion: 0.4, agreeableness: 0.5, conscientiousness: 0.5, neuroticism: 0.9 };
const steadyBold = {
  extraversion: 0.85,
  agreeableness: 0.4,
  conscientiousness: 0.5,
  neuroticism: 0.1,
};
const loyal = { extraversion: 0.4, agreeableness: 0.85, conscientiousness: 0.85, neuroticism: 0.4 };

const gov = (unemploymentRate: number, publicSentiment = 0.5) => ({
  government: { unemploymentRate, publicSentiment },
});
const neutral: MarketMood = { heat: 0, run: 0 };
const boom: MarketMood = { heat: 0.8, run: 0 };
const bust: MarketMood = { heat: -0.8, run: 0 };

describe('irrational overrides (C7/A6, P19.4)', () => {
  it('a placid neutral cycle leaves the cycle-driven impulses untouched', () => {
    // Herd, panic, and overconfidence are reactions to the moment, so with a flat
    // cycle and no streak they rest at 1. (Brand-loyalty stickiness is a *standing*
    // disposition, not a reaction — it tilts BRAND/COMPETE/EXIT even at rest; see the
    // loyalty test below.)
    for (const a of [anxious, steadyBold, loyal]) {
      for (const t of ['EXPAND', 'BORROW', 'CUT_COST', 'HOLD', 'EARN']) {
        expect(irrationalBias(a, neutral, t)).toBe(1);
      }
    }
  });

  it('a strategically neutral or unknown action is never perturbed', () => {
    // EARN/INNOVATE carry no irrational impulse; an untagged action is inert too.
    expect(irrationalBias(steadyBold, boom, 'SEEK_EMPLOYMENT')).toBe(1); // EARN
    expect(irrationalBias(anxious, bust, 'INNOVATE')).toBe(1);
    expect(irrationalBias(anxious, bust, 'NOT_A_TAG')).toBe(1);
  });

  it('herd + overconfidence: a boom and a good run produce visible over-expansion', () => {
    // The same agent expands far more eagerly when the cycle is hot and they are on a
    // streak than in a placid moment — beyond what the prospect math alone would say.
    const hotStreak: MarketMood = { heat: 0.8, run: 0.9 };
    expect(irrationalBias(steadyBold, hotStreak, 'EXPAND')).toBeGreaterThan(1.1);
    expect(irrationalBias(steadyBold, hotStreak, 'EXPAND')).toBeGreaterThan(
      irrationalBias(steadyBold, neutral, 'EXPAND'),
    );
  });

  it('panic: a bust pushes the anxious to over-cut and shun growth', () => {
    expect(irrationalBias(anxious, bust, 'CUT_COST')).toBeGreaterThan(1);
    expect(irrationalBias(anxious, bust, 'EXIT')).toBeGreaterThan(1);
    expect(irrationalBias(anxious, bust, 'EXPAND')).toBeLessThan(1);
  });

  it('panic scales with neuroticism — the steady ride a bust out', () => {
    expect(irrationalBias(anxious, bust, 'CUT_COST')).toBeGreaterThan(
      irrationalBias(steadyBold, bust, 'CUT_COST'),
    );
  });

  it('overconfidence scales with low neuroticism and high extraversion', () => {
    const goodRun: MarketMood = { heat: 0, run: 0.9 };
    expect(irrationalBias(steadyBold, goodRun, 'EXPAND')).toBeGreaterThan(
      irrationalBias(anxious, goodRun, 'EXPAND'),
    );
  });

  it('brand-loyalty stickiness lifts BRAND and resists churn/quitting', () => {
    expect(irrationalBias(loyal, neutral, 'BRAND')).toBeGreaterThan(1);
    // A loyal operator over-values the established brand more than a disloyal one.
    const disloyal = { ...loyal, agreeableness: 0.1, conscientiousness: 0.1 };
    expect(irrationalBias(loyal, neutral, 'BRAND')).toBeGreaterThan(
      irrationalBias(disloyal, neutral, 'BRAND'),
    );
    // Loyalty drags EXIT and a churning price-war COMPETE below neutral.
    expect(irrationalBias(loyal, neutral, 'EXIT')).toBeLessThan(1);
    expect(irrationalBias(loyal, neutral, 'COMPETE')).toBeLessThan(1);
  });

  it('the tilt is bounded — it perturbs, it never dominates (C8)', () => {
    // Across every trait/mood/tag combination the multiplier stays inside ±50%, so a
    // higher-skill prospect value still leads: irrationality is noise, not dominance.
    const tags = ['EXPAND', 'BORROW', 'COMPETE', 'CUT_COST', 'EXIT', 'HOLD', 'BRAND'];
    for (const a of [anxious, steadyBold, loyal]) {
      for (const heat of [-1, -0.5, 0, 0.5, 1]) {
        for (const run of [-1, 0, 1]) {
          for (const t of tags) {
            const b = irrationalBias(a, { heat, run }, t);
            expect(b).toBeGreaterThanOrEqual(0.6);
            expect(b).toBeLessThanOrEqual(1.5);
          }
        }
      }
    }
  });

  it('the live path is preserved: SEEK (EARN) still beats SAVE in any mood', () => {
    // The two live actions: SEEK is a pure gain on the irrationally-neutral EARN tag,
    // SAVE is a zero-value HOLD. No mood — not even a panicky bust — can flip the
    // choice, so the chosen action (and its rng draw) stays byte-identical (S2).
    const traits = { lossAversion: 0.5, riskTolerance: 0.5, patience: 0.5, ...anxious };
    const SEEK: ActionCandidate = {
      type: 'SEEK_EMPLOYMENT',
      outcomes: [{ probability: 0.25, payoff: 1100, delayMonths: 0 }],
    };
    const SAVE: ActionCandidate = { type: 'SAVE', outcomes: [] };
    for (const mood of [neutral, boom, bust]) {
      const bias = (c: ActionCandidate) => irrationalBias(traits, mood, c.type);
      expect(chooseBest(traits, [SEEK, SAVE], bias)?.type).toBe('SEEK_EMPLOYMENT');
    }
  });

  it('marketHeat reads the cycle: low unemployment is a boom, a spike is a bust', () => {
    expect(marketHeat(gov(0.04))).toBeGreaterThan(0);
    expect(marketHeat(gov(0.12))).toBeCloseTo(0, 5); // the normal reference
    expect(marketHeat(gov(0.3))).toBeLessThan(0);
    // Sentiment is inert at the neutral 0.5 today but lifts heat once it moves.
    expect(marketHeat(gov(0.12, 0.9))).toBeGreaterThan(marketHeat(gov(0.12, 0.5)));
  });

  it('personalRun reads the streak: a fat month is hot, a wipeout is cold', () => {
    expect(personalRun({ cash: 2000, previousMonthCapital: 1000 })).toBeGreaterThan(0);
    expect(personalRun({ cash: 1000, previousMonthCapital: 1000 })).toBe(0);
    expect(personalRun({ cash: 100, previousMonthCapital: 1000 })).toBeLessThan(0);
  });

  it('is deterministic: identical agent and mood yield an identical tilt', () => {
    const a: Pick<NPCAgent, 'cash' | 'previousMonthCapital'> & typeof steadyBold = {
      ...steadyBold,
      cash: 1500,
      previousMonthCapital: 1000,
    };
    const m1 = marketMood(a, gov(0.05));
    const m2 = marketMood(a, gov(0.05));
    expect(m1).toEqual(m2);
    expect(irrationalBias(a, m1, 'EXPAND')).toBe(irrationalBias(a, m2, 'EXPAND'));
  });
});
