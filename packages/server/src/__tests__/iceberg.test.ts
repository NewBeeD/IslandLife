import { describe, expect, it } from 'vitest';
import { buildWorld, simulateOneMonth } from '@island/engine';
import { generateMonthlyEntries } from '@island/narrative';
import type { CreationChoices } from '@island/engine';
import {
  toCommunityDTO,
  toFeedDTO,
  toMoneyDTO,
  toOpportunitiesDTO,
  toStateDTO,
} from '../projection';

// P-X1 — THE ICEBERG-LEAK CONTRACT TEST.
// Snapshot every API DTO and assert it contains NONE of a denylist of hidden keys.
// Hidden engine state — OCEAN, derived tendencies, cultural/social capital, loan
// interest rates, NPC utilities, the legacy total — must never cross the wire.
// This is the single most important test: it guards the core design promise.

// Tokens that must never appear, as a key OR a value, anywhere in a serialized DTO.
// camelCase so they match the engine fields, not innocent prose words ("community",
// "interest" in a sentence). Matched on word boundaries.
const HIDDEN_TOKENS = [
  // Bourdieu capital
  'culturalCapital',
  'socialCapitalLocal',
  'socialCapitalInstitutional',
  'socialCapitalDiaspora',
  // OCEAN
  'openness',
  'conscientiousness',
  'extraversion',
  'agreeableness',
  'neuroticism',
  // Heckman non-cognitive
  'cognitiveAbility',
  'resilience',
  'selfControl',
  'knowledgeAcquisitionRate',
  // derived tendencies
  'riskTolerance',
  'lossAversion',
  'patience',
  // loan internals
  'interestRate',
  'approvalScore',
  // opportunity internals
  'expectedReturn',
  'riskLevel',
  // NPC decision internals
  'prospectUtility',
  'Utility',
  // legacy (hidden until death)
  'legacyScore',
  'wealthScore',
  'familyScore',
  'communityScore',
  'innovationScore',
  'environmentScore',
  'reputationScore',
  'lastNetWorth',
  'netWorth',
  // raw agent internals
  'previousMonthCapital',
  'knowledge',
  'experience',
  'economicAssets',
];

function assertNoLeak(label: string, dto: unknown): void {
  const json = JSON.stringify(dto);
  for (const token of HIDDEN_TOKENS) {
    const re = new RegExp(`\\b${token}\\b`);
    expect(re.test(json), `${label} leaked hidden token "${token}": ${json}`).toBe(false);
  }
}

// A fully specified character so the hidden profile is hydrated onto agent #1 —
// the projections must strip its profile-derived state too.
const CHOICES: CreationChoices = {
  background: 'A',
  school: 'A',
  formative: 'A',
  tendency: 'A',
  situation: 'A',
};

describe('iceberg-leak contract (P-X1)', () => {
  for (const seed of [1, 42, 99]) {
    it(`every DTO is clean across a run (seed ${seed})`, () => {
      const world = buildWorld(seed, { population: 200, choices: CHOICES });
      const saveId = `save-${seed}`;
      for (let m = 0; m < 18; m++) {
        simulateOneMonth(world);
        const entries = generateMonthlyEntries(world);

        assertNoLeak('state', toStateDTO(saveId, world));
        assertNoLeak('money', toMoneyDTO(world));
        assertNoLeak('feed', toFeedDTO(world.month, entries));
        assertNoLeak('community', toCommunityDTO(world));
        assertNoLeak('opportunities', toOpportunitiesDTO(world));
      }
    });
  }

  it('money view exposes payment but never the loan interest rate', () => {
    // Give the player a loan and confirm the agreed monthlyPayment shows while the
    // interestRate does not (the projection contract for loans).
    const world = buildWorld(7, { population: 200 });
    simulateOneMonth(world);
    world.player.loans.push({
      id: 'LOAN_TEST',
      bankId: 'NCB',
      borrowerPersonId: world.player.id,
      principal: 4000,
      remainingPrincipal: 3840,
      interestRate: 0.0925, // hidden
      monthlyPayment: 620,
      termMonths: 12,
      originMonth: world.month - 6,
      status: 'ACTIVE',
    });
    const money = toMoneyDTO(world);
    const debt = money.debts.find((d) => d.label.includes('NCB'));
    expect(debt?.monthlyPayment).toBe(620);
    expect(debt?.monthsLeft).toBe(6);
    expect(JSON.stringify(money)).not.toContain('0.0925');
    expect(JSON.stringify(money)).not.toMatch(/interestRate/);
  });
});
