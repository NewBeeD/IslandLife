import { describe, expect, it } from 'vitest';
import {
  chooseBest,
  discountRate,
  evaluateOptions,
  gainCurvature,
  lossAversionLambda,
  valuateCandidate,
  weightProbability,
  type ActionCandidate,
} from '../prospect';

// Two agents that differ only in the traits the engine reads.
const riskTaker = { lossAversion: 0.1, riskTolerance: 0.9, patience: 0.5 };
const lossAverse = { lossAversion: 0.9, riskTolerance: 0.3, patience: 0.5 };

// A sure small gain vs. a high-variance gamble with a real downside, framed against
// the reference point (gain +, loss −).
const SAFE: ActionCandidate = {
  type: 'SAFE',
  outcomes: [{ probability: 1, payoff: 120, delayMonths: 0 }],
};
const GAMBLE: ActionCandidate = {
  type: 'GAMBLE',
  outcomes: [
    { probability: 0.5, payoff: 500, delayMonths: 0 },
    { probability: 0.5, payoff: -300, delayMonths: 0 },
  ],
};

describe('prospect-theory valuation (P19.1)', () => {
  it('trait-driven divergence: risk-taker and loss-averse agents choose differently', () => {
    // Same options, opposite picks — the whole point of the engine.
    expect(chooseBest(riskTaker, [SAFE, GAMBLE])?.type).toBe('GAMBLE');
    expect(chooseBest(lossAverse, [SAFE, GAMBLE])?.type).toBe('SAFE');
  });

  it('is reproducible: identical inputs give identical scores and order', () => {
    const a = evaluateOptions(lossAverse, [SAFE, GAMBLE]);
    const b = evaluateOptions(lossAverse, [SAFE, GAMBLE]);
    expect(a.map((s) => [s.candidate.type, s.value])).toEqual(
      b.map((s) => [s.candidate.type, s.value]),
    );
  });

  it('loss aversion: a loss is weighed more heavily than an equal gain', () => {
    const agent = { lossAversion: 0.5, riskTolerance: 0.509, patience: 0.5 };
    // riskTolerance 0.509 puts the gain curvature at the canonical loss curvature
    // (0.88), so the only asymmetry left is λ.
    const gain: ActionCandidate = { type: 'G', outcomes: [{ probability: 1, payoff: 200, delayMonths: 0 }] };
    const loss: ActionCandidate = { type: 'L', outcomes: [{ probability: 1, payoff: -200, delayMonths: 0 }] };
    const gainValue = valuateCandidate(agent, gain);
    const lossValue = valuateCandidate(agent, loss);
    expect(Math.abs(lossValue)).toBeGreaterThan(gainValue);
    // The ratio is ≈ λ when the gain/loss curvatures are (near) matched.
    expect(Math.abs(lossValue) / gainValue).toBeCloseTo(lossAversionLambda(agent), 2);
  });

  it('a more loss-averse agent values a symmetric coin-flip more negatively', () => {
    const flip: ActionCandidate = {
      type: 'FLIP',
      outcomes: [
        { probability: 0.5, payoff: 200, delayMonths: 0 },
        { probability: 0.5, payoff: -200, delayMonths: 0 },
      ],
    };
    // Both reject a 50/50 ±200 (λ > 1), but the more loss-averse agent more so.
    expect(valuateCandidate(lossAverse, flip)).toBeLessThan(valuateCandidate(riskTaker, flip));
    expect(valuateCandidate(lossAverse, flip)).toBeLessThan(0);
  });

  it('Prelec weighting: small probabilities over-weighted, large ones under-weighted', () => {
    expect(weightProbability(0.02)).toBeGreaterThan(0.02);
    expect(weightProbability(0.95)).toBeLessThan(0.95);
    expect(weightProbability(0)).toBe(0);
    expect(weightProbability(1)).toBe(1);
  });

  it('hyperbolic discounting: a delayed gain is worth less, steeper for the impatient', () => {
    const now: ActionCandidate = { type: 'N', outcomes: [{ probability: 1, payoff: 1000, delayMonths: 0 }] };
    const later: ActionCandidate = { type: 'L', outcomes: [{ probability: 1, payoff: 1000, delayMonths: 24 }] };
    const patient = { lossAversion: 0.5, riskTolerance: 0.5, patience: 0.9 };
    const impatient = { lossAversion: 0.5, riskTolerance: 0.5, patience: 0.1 };
    // A future payoff is discounted for everyone...
    expect(valuateCandidate(patient, later)).toBeLessThan(valuateCandidate(patient, now));
    // ...and discounted harder by the impatient agent (relative to its own present value).
    const patientRatio = valuateCandidate(patient, later) / valuateCandidate(patient, now);
    const impatientRatio = valuateCandidate(impatient, later) / valuateCandidate(impatient, now);
    expect(impatientRatio).toBeLessThan(patientRatio);
  });

  it('trait helpers stay in their calibrated bands', () => {
    expect(lossAversionLambda({ lossAversion: 0 })).toBeCloseTo(1, 5);
    expect(lossAversionLambda({ lossAversion: 1 })).toBeCloseTo(3.5, 5);
    expect(gainCurvature({ riskTolerance: 0.9 })).toBeGreaterThan(gainCurvature({ riskTolerance: 0.1 }));
    expect(discountRate({ patience: 0 })).toBeGreaterThan(discountRate({ patience: 1 }));
  });
});
