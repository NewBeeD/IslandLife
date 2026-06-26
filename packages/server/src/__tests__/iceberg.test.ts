import { describe, expect, it } from 'vitest';
import {
  EUNICE_DECISION_ID,
  applyUpgradeFinancing,
  buildWorld,
  quoteUpgradeFinancing,
  simulateOneMonth,
  surfaceOpportunities,
} from '@island/engine';
import { generateMonthlyEntries } from '@island/narrative';
import type { CreationChoices } from '@island/engine';
import {
  toCommunityDTO,
  toDecisionDTO,
  toFeedDTO,
  toFinancingQuoteDTO,
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
//
// GLOBAL tokens are denied on EVERY DTO — the world's and other people's hidden
// state (psychology, capitals, NPC/opportunity expected value & risk). These are
// the core of the iceberg and never relax.
const GLOBAL_TOKENS = [
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
  // loan/credit internals (the bank's hidden view of the player)
  'approvalScore',
  // opportunity / decision internals
  'expectedReturn',
  'riskLevel',
  'monthlyAmount',
  'standingAmount',
  'standingContract',
  'incomeMode',
  'spotBaseIncome',
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
  // raw agent internals
  'previousMonthCapital',
  'knowledge',
  'experience',
  'economicAssets',
];

// FINANCIAL tokens are the player's OWN money facts (Phase 7, the scoped S3
// amendment). They are denied everywhere EXCEPT the money DTO — the one place the
// player is permitted to look at their own books in full.
const FINANCIAL_TOKENS = ['interestRate', 'netWorth'];

function assertNoLeak(label: string, dto: unknown, opts: { allowFinancial?: boolean } = {}): void {
  const json = JSON.stringify(dto);
  const tokens = opts.allowFinancial ? GLOBAL_TOKENS : [...GLOBAL_TOKENS, ...FINANCIAL_TOKENS];
  for (const token of tokens) {
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
        // The money DTO is the player's own books — financial tokens are permitted
        // here (Phase 7) but the global iceberg tokens still are not.
        assertNoLeak('money', toMoneyDTO(world), { allowFinancial: true });
        assertNoLeak('feed', toFeedDTO(world.month, entries));
        assertNoLeak('community', toCommunityDTO(world));
        assertNoLeak('opportunities', toOpportunitiesDTO(world));
      }
    });
  }

  it('a surfaced opportunity and its decision leak no hidden mechanics (P6.2)', () => {
    // Put the player in the position the Eunice contract surfaces to, surface it,
    // and assert the opportunity + decision DTOs carry no expected value, no risk
    // label, and none of the hidden income mechanics.
    const world = buildWorld(11, { population: 80 });
    world.player.occupation = 'FISHING';
    world.player.socialCapitalLocal = 0.5;
    world.month = 3;
    surfaceOpportunities(world);
    expect(world.opportunities.length).toBe(1);

    const opportunities = toOpportunitiesDTO(world);
    expect(opportunities.active.length).toBe(1);
    assertNoLeak('opportunities', opportunities);

    const decision = toDecisionDTO(world, EUNICE_DECISION_ID);
    expect(decision).not.toBeNull();
    expect(decision!.options.length).toBeGreaterThanOrEqual(2);
    assertNoLeak('decision', decision);
  });

  it('an asset-upgrade opportunity and its financing leak no hidden risk (Phase 7)', () => {
    // A self-employed fisher experienced enough to be offered a bigger boat. The
    // upgrade opportunity and decision DTOs must not carry the hidden riskLevel,
    // expected value, or net worth; the financing quote may show the player's own
    // prospective interest rate (their loan) but still no riskLevel.
    const world = buildWorld(21, { population: 80 });
    const p = world.player;
    p.occupation = 'FISHING';
    p.employmentStatus = 'SELF_EMPLOYED';
    p.parish = 'SAINT_JOHN';
    p.socialCapitalLocal = 0.1; // below the Eunice threshold — only the upgrade surfaces
    p.experience.fishing = 0.3;
    p.monthlyIncome = 1600;
    p.cash = 12000;
    world.month = 4;
    surfaceOpportunities(world);
    const opp = world.opportunities.find((o) => o.kind === 'ASSET_UPGRADE');
    expect(opp).toBeDefined();

    // Opportunity + decision DTOs carry no hidden mechanics AND no financial tokens.
    assertNoLeak('opportunities', toOpportunitiesDTO(world));
    const decision = toDecisionDTO(world, opp!.decisionId);
    expect(decision!.interaction).toBe('FINANCING');
    expect(decision!.financing?.assetPrice).toBe(opp!.upgrade!.assetPrice);
    assertNoLeak('upgrade-decision', decision);

    // The quote is the player's own prospective loan: financial tokens permitted,
    // but the hidden riskLevel / expected value still must not appear.
    const quote = toFinancingQuoteDTO(quoteUpgradeFinancing(world, opp!.decisionId, 6000, 48));
    assertNoLeak('financing-quote', quote, { allowFinancial: true });
    expect(quote.outcome).toMatch(/APPROVED|COUNTER|DECLINED/);

    // After buying, the money view shows the new asset's value and the loan rate.
    applyUpgradeFinancing(world, opp!.decisionId, 6000, 48);
    const money = toMoneyDTO(world);
    expect(money.assets.some((a) => a.value > 0)).toBe(true);
    assertNoLeak('money', money, { allowFinancial: true });
  });

  it('money view shows the payment AND the player’s own loan interest rate (Phase 7)', () => {
    // The player now sees their own books in full: the agreed monthlyPayment, the
    // loan's interest rate, the interest/principal split, and net worth. (The scoped
    // S3 amendment — only the player's OWN finances, only on the money DTO.)
    const world = buildWorld(7, { population: 200 });
    simulateOneMonth(world);
    world.player.loans.push({
      id: 'LOAN_TEST',
      bankId: 'NCB',
      borrowerPersonId: world.player.id,
      principal: 4000,
      remainingPrincipal: 3840,
      interestRate: 0.0925,
      monthlyPayment: 620,
      termMonths: 12,
      originMonth: world.month - 6,
      status: 'ACTIVE',
    });
    const money = toMoneyDTO(world);
    const debt = money.debts.find((d) => d.label.includes('NCB'));
    expect(debt?.monthlyPayment).toBe(620);
    expect(debt?.monthsLeft).toBe(6);
    expect(debt?.interestRate).toBe(0.0925);
    // interest = 3840 * 0.0925 / 12 ≈ 29.6 → 30; principal = 620 − 30 = 590.
    expect(debt?.interestPortion).toBe(30);
    expect(debt?.principalPortion).toBe(590);
    expect(typeof money.netWorth).toBe('number');
    // The money DTO may carry these, but the global iceberg tokens still must not.
    assertNoLeak('money', money, { allowFinancial: true });
  });
});
