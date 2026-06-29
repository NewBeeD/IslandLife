import { describe, expect, it } from 'vitest';
import { archetypeAffinities, archetypeBias, dominantArchetype } from '../archetype';
import { chooseBest, type ActionCandidate } from '../prospect';

// Trait bundles that should read as a particular kind of operator. Only the fields
// the derivation looks at need to be set.
const predatorish = {
  openness: 0.6,
  conscientiousness: 0.4,
  extraversion: 0.8,
  agreeableness: 0.1,
  cognitiveAbility: 0.5,
  selfControl: 0.4,
  riskTolerance: 0.85,
  lossAversion: 0.15,
  patience: 0.4,
};
const conservativeish = {
  openness: 0.2,
  conscientiousness: 0.85,
  extraversion: 0.3,
  agreeableness: 0.6,
  cognitiveAbility: 0.5,
  selfControl: 0.8,
  riskTolerance: 0.2,
  lossAversion: 0.85,
  patience: 0.8,
};

describe('personality archetypes (A23, P19.2)', () => {
  it('derives a soft blend, not a hard label', () => {
    const aff = archetypeAffinities(predatorish);
    const total = Object.values(aff).reduce((s, x) => s + x, 0);
    expect(total).toBeCloseTo(1, 6); // normalized distribution
    // Every archetype carries some weight, and the leading one is a plurality, not
    // the whole agent ("mostly X").
    for (const w of Object.values(aff)) expect(w).toBeGreaterThan(0);
    expect(Math.max(...Object.values(aff))).toBeLessThan(0.6);
  });

  it('reads character from traits', () => {
    // The aggressive, disagreeable, risk-loving agent leans predator/risk-taker...
    expect(['PREDATOR', 'RISK_TAKER']).toContain(dominantArchetype(predatorish));
    expect(archetypeAffinities(predatorish).PREDATOR).toBeGreaterThan(
      archetypeAffinities(conservativeish).PREDATOR,
    );
    // ...the cautious, dutiful, loss-averse agent leans conservative.
    expect(dominantArchetype(conservativeish)).toBe('CONSERVATIVE');
  });

  it('tilts action scores toward the character: predator favours expansion, conservative holding', () => {
    expect(archetypeBias(predatorish, 'EXPAND')).toBeGreaterThan(1);
    expect(archetypeBias(predatorish, 'EXPAND')).toBeGreaterThan(
      archetypeBias(conservativeish, 'EXPAND'),
    );
    // SAVE is the holding action (it carries the HOLD tag).
    expect(archetypeBias(conservativeish, 'SAVE')).toBeGreaterThan(
      archetypeBias(predatorish, 'SAVE'),
    );
    // An unknown action type is neutral (multiplier 1).
    expect(archetypeBias(predatorish, 'SOMETHING_NEW')).toBe(1);
  });

  it('the soft weighting changes the chosen action (the basis for divergent markets)', () => {
    // A live preview of P19.5/P20: faced with the same aggressive-expansion gamble vs.
    // holding, the predator goes for it and the conservative sits tight — the seed of
    // a predator-heavy parish's price wars vs. a conservative parish staying placid.
    const EXPAND: ActionCandidate = {
      type: 'EXPAND',
      outcomes: [
        { probability: 0.5, payoff: 900, delayMonths: 0 },
        { probability: 0.5, payoff: -500, delayMonths: 0 },
      ],
    };
    const HOLD: ActionCandidate = { type: 'SAVE', outcomes: [] };
    const bias = (agent: typeof predatorish) => (c: ActionCandidate) => archetypeBias(agent, c.type);
    expect(chooseBest(predatorish, [EXPAND, HOLD], bias(predatorish))?.type).toBe('EXPAND');
    expect(chooseBest(conservativeish, [EXPAND, HOLD], bias(conservativeish))?.type).toBe('SAVE');
  });

  it('a predator-heavy population is more aggressive than a conservative-heavy one', () => {
    const EXPAND: ActionCandidate = {
      type: 'EXPAND',
      outcomes: [
        { probability: 0.5, payoff: 800, delayMonths: 0 },
        { probability: 0.5, payoff: -450, delayMonths: 0 },
      ],
    };
    const HOLD: ActionCandidate = { type: 'SAVE', outcomes: [] };
    const countExpanders = (pop: typeof predatorish[]) =>
      pop.filter(
        (a) => chooseBest(a, [EXPAND, HOLD], (c) => archetypeBias(a, c.type))?.type === 'EXPAND',
      ).length;
    const predators = Array.from({ length: 20 }, () => predatorish);
    const conservatives = Array.from({ length: 20 }, () => conservativeish);
    expect(countExpanders(predators)).toBeGreaterThan(countExpanders(conservatives));
  });
});
