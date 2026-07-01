import { describe, expect, it } from 'vitest';
import {
  EUNICE_DECISION_ID,
  applyInvestment,
  applyUpgradeFinancing,
  borrowAgainstAsset,
  buildWorld,
  findBorrowerAsset,
  quoteCollateralLoan,
  quoteUpgradeFinancing,
  sellAssetNow,
  simulateOneMonth,
  surfaceCrowdfund,
  surfaceInvestSolicitation,
  surfacePartnership,
  surfaceOpportunities,
} from '@island/engine';
import type { InvestSolicitationSpec } from '@island/shared';
import { generateMonthlyEntries } from '@island/narrative';
import type { CreationChoices } from '@island/engine';
import {
  toAssetSaleResultDTO,
  toBorrowResultDTO,
  toCollateralQuoteDTO,
  toCommunityDTO,
  toDecisionDTO,
  toFeedDTO,
  toFinancingQuoteDTO,
  toJobsDTO,
  toMoneyDTO,
  toOpportunitiesDTO,
  toSkillsDTO,
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
  // personality archetypes (A23) — inferable from behaviour, never a projected label
  'archetype',
  'strategyBias',
  // observation memory (C10/A15) — the agent's hidden learning, never on the wire
  'observations',
  // reputation ledger (Phase 21) — the four hidden bands and their bookkeeping, and the
  // venture-side demand memory. The player reads their standing as prose (P21.4), never
  // as any of these numbers (S3). The DTO carries a `standing` prose string, not these.
  'financialReliability',
  'fairDealing',
  'employerQuality',
  'civicStanding',
  'seenKeptPromises',
  'seenBrokenContracts',
  'customerReputation',
  'reputationCounted',
  // information economy (Phase 22) — the player's paid research depth & scout freshness
  // are hidden internals; the player reads their sharpness as prose and their forecasts
  // as ranges, never these raw numbers (S3). The DTO carries prose + low/high bounds.
  'researchLevel',
  'scoutedUntilMonth',
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
        // The skills view is qualitative prose — no raw skill/capital scores (S3).
        assertNoLeak('skills', toSkillsDTO(world));
        // The job market: pay/net are the player's own prospective money, but the
        // hidden gates/stability never cross the wire as numbers (Phase 16).
        assertNoLeak('jobs', toJobsDTO(world));
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
    // The Eunice contract surfaced (other kinds — a Phase 10 new venture — may too).
    expect(world.opportunities.some((o) => o.kind === 'EUNICE_SUPPLY_CONTRACT')).toBe(true);

    // The whole opportunities DTO — every surfaced kind — leaks no hidden mechanics.
    const opportunities = toOpportunitiesDTO(world);
    expect(opportunities.active.length).toBeGreaterThanOrEqual(1);
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

  it('a crowdfunding slate and a partnership leak no backer/partner internals (Phase 11)', () => {
    // A self-employed fisher with well-off friends: a crowdfunding slate and a
    // partnership both surface. Their DTOs must carry no hidden mechanics — backer
    // psychology, equity shares-as-fields, or friend-loan rates as keys.
    const world = buildWorld(5, { population: 80 });
    const p = world.player;
    p.occupation = 'FISHING';
    p.employmentStatus = 'SELF_EMPLOYED';
    p.parish = 'SAINT_JOHN';
    p.socialCapitalLocal = 0.1; // no Eunice
    p.monthlyIncome = 1500;
    p.cash = 25000;
    world.month = 5;
    const friends = world.agents.filter((a) => !a.isPlayer).slice(0, 3);
    for (const f of friends) {
      f.cash = 25000;
      f.parish = 'SAINT_JOHN';
    }
    friends[0]!.riskTolerance = 0.85; // equity
    friends[1]!.riskTolerance = 0.1; // loan
    p.socialNetwork = friends.map((a) => a.id);

    const crowdfund = surfaceCrowdfund(world);
    const partnership = surfacePartnership(world);
    expect(crowdfund).toBeDefined();
    expect(partnership).toBeDefined();

    // The opportunities view (both kinds) carries no hidden mechanics.
    assertNoLeak('opportunities', toOpportunitiesDTO(world));

    // The crowdfund decision: a list of unlabelled options, no funding internals.
    const cfDecision = toDecisionDTO(world, crowdfund!.decisionId);
    expect(cfDecision!.interaction).toBe('OPTIONS');
    expect(cfDecision!.options.length).toBeGreaterThanOrEqual(2);
    assertNoLeak('crowdfund-decision', cfDecision);

    // The partnership decision likewise.
    const ptDecision = toDecisionDTO(world, partnership!.decisionId);
    assertNoLeak('partnership-decision', ptDecision);
  });

  it('an invest solicitation, its decision, and the money returns leak no internals (Phase 18)', () => {
    // A moneyed, well-known player draws inbound invitations to invest in others. The
    // solicitation's hidden return parameters (rates, shares, success/volatility) must
    // never cross the wire — the player reads the offer as prose and picks a structure.
    const world = buildWorld(17, { population: 80 });
    const p = world.player;
    p.occupation = 'FISHING';
    p.employmentStatus = 'SELF_EMPLOYED';
    p.parish = 'SAINT_JOHN';
    p.socialCapitalLocal = 0.9;
    p.socialCapitalInstitutional = 0.7;
    p.monthlyIncome = 2000;
    p.cash = 80000;
    const friends = world.agents.filter((a) => !a.isPlayer).slice(0, 4);
    for (const f of friends) {
      f.parish = 'SAINT_JOHN';
      f.employmentStatus = 'SELF_EMPLOYED';
      f.occupation = 'RETAIL';
      f.cash = 5000;
    }
    p.socialNetwork = friends.map((a) => a.id);

    // Surface until one appears (the frequency is random but high for this player).
    let opp = null;
    for (let i = 0; i < 200 && !opp; i++) {
      opp = surfaceInvestSolicitation(world);
      if (!opp) world.month += 1;
    }
    expect(opp).not.toBeNull();

    assertNoLeak('opportunities', toOpportunitiesDTO(world));
    const decision = toDecisionDTO(world, opp!.decisionId);
    expect(decision!.interaction).toBe('OPTIONS');
    expect(decision!.options.length).toBeGreaterThanOrEqual(3); // loan / dividend / revenue
    assertNoLeak('invest-decision', decision);

    // After investing, the money view shows the returns as the player's own income —
    // financial tokens permitted there, but never the venture's hidden mechanics.
    const spec: InvestSolicitationSpec = opp!.invest!;
    applyInvestment(world, spec, 'REVENUE_SHARE');
    assertNoLeak('money', toMoneyDTO(world), { allowFinancial: true });
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

  it('the skills view shows earned trades and a wage day rate, leaking no scores (Phase 15)', () => {
    // A construction worker who has built up the trade: the skills view names the
    // trades they can do (as bands, not numbers), their credential, and their current
    // day rate (their own money fact) — and leaks none of the hidden 0–1 scores.
    const world = buildWorld(21, { population: 60, choices: CHOICES });
    const p = world.player;
    p.occupation = 'CONSTRUCTION';
    p.employmentStatus = 'SELF_EMPLOYED';
    p.wageProfile = { dailyRate: 118, workdaysPerMonth: 20, hoursPerDay: 8 };
    p.experience.construction = 0.6;
    p.knowledge.construction = 0.5;
    p.education = { level: 'CERTIFICATE', enrolled: null };

    const skills = toSkillsDTO(world);
    expect(skills.trades.some((t) => t.label === 'Construction')).toBe(true);
    expect(skills.credential).toContain('certificate');
    expect(skills.wage?.dailyRate).toBe(118);
    expect(skills.wage?.perMonth).toBe(2360);
    assertNoLeak('skills', skills);
  });

  it('the job market projects pay/net but leaks no hidden gates (Phase 16)', () => {
    // Populate the job market and project it: the postings carry the player's own
    // prospective money (pay, net of attached costs) but none of the hidden gating
    // thresholds, stability-as-numbers, or any global iceberg token.
    const world = buildWorld(33, { population: 60, choices: CHOICES });
    const p = world.player;
    p.cash = 5000;
    world.month = 3;
    surfaceOpportunities(world); // surfaceJobs runs within, posting the slate
    expect(world.jobPostings.some((j) => j.status === 'OPEN')).toBe(true);

    const jobs = toJobsDTO(world);
    expect(jobs.postings.length).toBeGreaterThanOrEqual(1);
    expect(jobs.postings[0]!.grossPerMonth).toBeGreaterThan(0);
    // The internal catalogue id must never ride on the wire.
    expect(JSON.stringify(jobs)).not.toContain('specId');
    assertNoLeak('jobs', jobs);
  });

  it('asset sale and collateral DTOs leak no hidden mechanics (Phase 12)', () => {
    // A self-employed earner who owns sellable, pledgeable assets. The money view's
    // resale quotes, the sale result, and the collateral quote/borrow result are the
    // player's own books — financial tokens are permitted on the money/loan DTOs, but
    // the global iceberg tokens never are.
    const world = buildWorld(21, { population: 80 });
    const p = world.player;
    p.occupation = 'AGRICULTURE';
    p.employmentStatus = 'SELF_EMPLOYED';
    p.parish = 'SAINT_JOHN';
    p.monthlyIncome = 2200;
    p.cash = 3000;
    p.economicAssets = [
      { id: 'A_SELL', type: 'VEHICLE', size: 'MEDIUM', value: 28000 },
      { id: 'A_PLEDGE', type: 'LAND', size: 'MEDIUM', value: 40000 },
    ];

    // The money view now carries resale quotes on each unpledged asset.
    const money = toMoneyDTO(world);
    const sellable = money.assets.find((a) => a.id === 'A_SELL');
    expect(sellable?.resale?.quickPrice).toBeGreaterThan(0);
    assertNoLeak('money', money, { allowFinancial: true });

    // The collateral quote (the player's own prospective loan) — financial tokens OK.
    const quote = quoteCollateralLoan(world, 'A_PLEDGE', 36);
    assertNoLeak('collateral-quote', toCollateralQuoteDTO(quote), { allowFinancial: true });

    // Borrowing books the loan; its result DTO is the player's own loan.
    const { loan } = borrowAgainstAsset(world, 'A_PLEDGE', 8000, 36);
    assertNoLeak('borrow-result', toBorrowResultDTO(world, loan), { allowFinancial: true });

    // The sale result carries no financial tokens at all — clean under the strict set.
    const captured = { ...findBorrowerAsset(p, 'A_SELL')! };
    const result = sellAssetNow(world, 'A_SELL');
    const saleDto = toAssetSaleResultDTO(world, captured, 'QUICK', {
      proceeds: result.price,
      settlesInMonths: 0,
      settled: true,
      ventureClosed: result.ventureClosed,
    });
    assertNoLeak('asset-sale', saleDto);
  });
});
