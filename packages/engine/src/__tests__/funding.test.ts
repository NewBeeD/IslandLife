import { describe, expect, it } from 'vitest';
import {
  amortize,
  applyPartnership,
  buildWorld,
  deserializeWorld,
  distributePartnershipProfit,
  distributeVentureEquity,
  hasVentures,
  isFriendLoanBank,
  playerShareOf,
  resolveDecision,
  serializeWorld,
  strainFriendDefaults,
  surfaceCrowdfund,
  surfacePartnership,
  ventureIncomeLines,
} from '../index';
import type { Industry, NPCAgent, Venture, WorldState } from '@island/shared';

// PHASE 11 — equity, crowdfunding & NPC partnerships.

function makeVenture(over: Partial<Venture> & { id: string; industry: Industry }): Venture {
  return {
    label: over.label ?? `the ${over.industry.toLowerCase()}`,
    incomeMode: 'SPOT',
    spotBaseIncome: 0,
    standingContract: null,
    outputScale: 1,
    monthlyOperatingCosts: 0,
    assets: [],
    status: 'ACTIVE',
    ...over,
  };
}

// A self-employed fisher in Saint John, away from the Eunice trigger.
function selfEmployedPlayer(seed = 31): WorldState {
  const world = buildWorld(seed, { population: 60 });
  const p = world.player;
  p.occupation = 'FISHING';
  p.employmentStatus = 'SELF_EMPLOYED';
  p.parish = 'SAINT_JOHN';
  p.socialCapitalLocal = 0.1;
  p.monthlyIncome = 1500;
  world.month = 5;
  return world;
}

describe('P11.1 — venture income distributes by equity share', () => {
  it('a 30% outside holder leaves the player 70% of the take; a sole venture is unchanged', () => {
    const world = selfEmployedPlayer();
    const p = world.player;
    p.ventures = [
      makeVenture({
        id: 'V',
        industry: 'FISHING',
        incomeMode: 'STANDING',
        standingContract: { opportunityId: 'X', monthlyAmount: 1000 },
      }),
    ];
    // Sole venture: the whole take is the player's.
    expect(playerShareOf(p.ventures[0]!)).toBe(1);
    expect(ventureIncomeLines(world)[0]!.amount).toBe(1000);

    // Add a 30% holder → the player banks 70%.
    p.ventures[0]!.equityHolders = [{ personId: 'B', name: 'A Backer', share: 0.3 }];
    expect(playerShareOf(p.ventures[0]!)).toBeCloseTo(0.7, 5);
    expect(ventureIncomeLines(world)[0]!.amount).toBe(700);
  });

  it('equity holders round-trip through serialize → deserialize', () => {
    const world = selfEmployedPlayer();
    world.player.ventures = [
      makeVenture({
        id: 'V',
        industry: 'FISHING',
        equityHolders: [{ personId: 'B', name: 'A Backer', share: 0.25 }],
      }),
    ];
    const back = deserializeWorld(serializeWorld(world));
    expect(back.player.ventures?.[0]?.equityHolders).toEqual(world.player.ventures[0]!.equityHolders);
  });
});

describe('P11.2 — a crowdfunding slate varies by backer', () => {
  it('a player with friends gets a mixed slate of loan and equity offers', () => {
    const world = selfEmployedPlayer(5);
    const p = world.player;
    const npcs = world.agents.filter((a) => !a.isPlayer).slice(0, 3);
    // A risk-tolerant friend offers equity; the steadier two offer loans.
    npcs[0]!.cash = 10000;
    npcs[0]!.riskTolerance = 0.85;
    npcs[1]!.cash = 8000;
    npcs[1]!.riskTolerance = 0.2;
    npcs[1]!.agreeableness = 0.8;
    npcs[1]!.patience = 0.6;
    npcs[2]!.cash = 6000;
    npcs[2]!.riskTolerance = 0.1;
    p.socialNetwork = npcs.map((a) => a.id);

    const opp = surfaceCrowdfund(world);
    expect(opp).toBeDefined();
    const offers = opp!.crowdfund!.offers;
    expect(offers.some((o) => o.fundingKind === 'EQUITY')).toBe(true);
    expect(offers.some((o) => o.fundingKind === 'LOAN')).toBe(true);
    // Loan terms carry a friend's rate; equity carries a share.
    const loan = offers.find((o) => o.fundingKind === 'LOAN')!;
    expect(loan.interestRate).toBeGreaterThan(0);
    const equity = offers.find((o) => o.fundingKind === 'EQUITY')!;
    expect(equity.share).toBeGreaterThan(0);
  });
});

describe('P11.3 — accepting funding adds the backer’s money', () => {
  function crowdfundWorld(): { world: WorldState; backers: NPCAgent[] } {
    const world = selfEmployedPlayer(5);
    const p = world.player;
    const npcs = world.agents.filter((a) => !a.isPlayer).slice(0, 2);
    npcs[0]!.cash = 10000;
    npcs[0]!.riskTolerance = 0.85; // equity
    npcs[1]!.cash = 8000;
    npcs[1]!.riskTolerance = 0.1; // loan
    p.socialNetwork = npcs.map((a) => a.id);
    surfaceCrowdfund(world);
    return { world, backers: npcs };
  }

  it('a friend loan books the loan and moves their cash to the player', () => {
    const { world } = crowdfundWorld();
    const p = world.player;
    const opp = world.opportunities.find((o) => o.kind === 'CROWDFUND')!;
    const dec = world.decisions.find((d) => d.id === opp.decisionId)!;
    const loanOpt = dec.options.find((o) => o.effect.funding?.fundingKind === 'LOAN')!;
    const offer = loanOpt.effect.funding!;
    const backer = world.agents.find((a) => a.id === offer.backerId)!;
    const cashBefore = p.cash;
    const backerBefore = backer.cash;

    resolveDecision(world, dec.id, loanOpt.id);

    expect(p.cash).toBe(cashBefore + offer.amount);
    expect(backer.cash).toBe(backerBefore - offer.amount);
    const friendLoan = p.loans.find((l) => isFriendLoanBank(l.bankId))!;
    expect(friendLoan).toBeDefined();
    expect(friendLoan.principal).toBe(offer.amount);
    expect(opp.status).toBe('ACCEPTED');
  });

  it('P14.4 — a friend-loan offer previews its installment and total before acceptance', () => {
    const { world } = crowdfundWorld();
    const opp = world.opportunities.find((o) => o.kind === 'CROWDFUND')!;
    const dec = world.decisions.find((d) => d.id === opp.decisionId)!;
    const loanOpt = dec.options.find((o) => o.effect.funding?.fundingKind === 'LOAN')!;
    const offer = loanOpt.effect.funding!;
    const monthly = Math.round(amortize(offer.amount, offer.interestRate ?? 0, offer.termMonths ?? 24));

    // The description names the monthly installment and the total it comes to (idea 9),
    // computed from the same amortization that books the loan, so the figures match.
    expect(loanOpt.description).toContain(monthly.toLocaleString('en-US'));
    expect(loanOpt.description).toContain((monthly * (offer.termMonths ?? 24)).toLocaleString('en-US'));

    // And those figures are exactly what gets booked on acceptance.
    resolveDecision(world, dec.id, loanOpt.id);
    const friendLoan = world.player.loans.find((l) => isFriendLoanBank(l.bankId))!;
    expect(friendLoan.monthlyPayment).toBe(monthly);
  });

  it('taking equity records a holder and reduces the player’s future share', () => {
    const { world } = crowdfundWorld();
    const p = world.player;
    const opp = world.opportunities.find((o) => o.kind === 'CROWDFUND')!;
    const dec = world.decisions.find((d) => d.id === opp.decisionId)!;
    const eqOpt = dec.options.find((o) => o.effect.funding?.fundingKind === 'EQUITY')!;
    const offer = eqOpt.effect.funding!;
    const cashBefore = p.cash;

    resolveDecision(world, dec.id, eqOpt.id);

    expect(p.cash).toBe(cashBefore + offer.amount);
    expect(hasVentures(p)).toBe(true);
    const venture = p.ventures!.find((v) => (v.equityHolders ?? []).length > 0)!;
    expect(venture).toBeDefined();
    expect(playerShareOf(venture)).toBeLessThan(1);
  });
});

describe('P11.4 — a partnership pools capital, books the firm’s loan, and splits profit', () => {
  function partnershipWorld(): { world: WorldState; friend: NPCAgent } {
    const world = selfEmployedPlayer(9);
    const p = world.player;
    p.cash = 25000;
    const friend = world.agents.find((a) => !a.isPlayer)!;
    friend.cash = 25000;
    friend.parish = 'SAINT_JOHN';
    p.socialNetwork = [friend.id];
    return { world, friend };
  }

  it('forms a player-owned firm with the partner as equity holder and a company loan', () => {
    const { world, friend } = partnershipWorld();
    const p = world.player;
    const opp = surfacePartnership(world);
    expect(opp).toBeDefined();
    const spec = opp!.partnership!;
    const cashBefore = p.cash;

    resolveDecision(world, opp!.decisionId, 'GO_IN');

    const co = world.companies.find((c) => c.ownerId === p.id)!;
    expect(co).toBeDefined();
    expect(co.equityHolders?.[0]?.personId).toBe(friend.id);
    expect(p.cash).toBe(cashBefore - spec.playerContribution);
    if (spec.loanPrincipal > 0) {
      expect(co.loans.length).toBe(1);
      expect(co.loans[0]!.borrowerCompanyId).toBe(co.id);
    }
  });

  it('distributes a firm’s monthly profit to the player and partner by share', () => {
    const { world, friend } = partnershipWorld();
    const p = world.player;
    const opp = surfacePartnership(world)!;
    resolveDecision(world, opp.decisionId, 'GO_IN');
    const co = world.companies.find((c) => c.ownerId === p.id)!;
    const share = co.equityHolders![0]!.share;

    co.profit = 1000;
    const partnerBefore = friend.cash;
    const playerBefore = p.cash;
    distributePartnershipProfit(world);

    expect(friend.cash).toBe(partnerBefore + Math.round(1000 * share));
    expect(p.cash).toBe(playerBefore + Math.round(1000 * (1 - share)));
  });
});

describe('P11.5 — backers and partners react over time', () => {
  it('a good run pays a venture’s backers and lifts local social capital', () => {
    const world = selfEmployedPlayer();
    const p = world.player;
    const backer = world.agents.find((a) => !a.isPlayer)!;
    p.ventures = [
      makeVenture({
        id: 'V',
        industry: 'FISHING',
        incomeMode: 'STANDING',
        standingContract: { opportunityId: 'X', monthlyAmount: 1000 },
        equityHolders: [{ personId: backer.id, name: backer.name, share: 0.3 }],
      }),
    ];
    const backerBefore = backer.cash;
    const scBefore = p.socialCapitalLocal;

    distributeVentureEquity(world);

    expect(backer.cash).toBe(backerBefore + 300);
    expect(p.socialCapitalLocal).toBeGreaterThan(scBefore);
  });

  it('defaulting on a friend’s loan strains the friendship exactly once', () => {
    const world = selfEmployedPlayer();
    const p = world.player;
    p.brokenContracts = 0;
    p.loans.push({
      id: 'LOAN_FRIEND',
      bankId: 'FRIEND:AGENT_2',
      borrowerPersonId: p.id,
      principal: 5000,
      remainingPrincipal: 5000,
      interestRate: 0.05,
      monthlyPayment: 230,
      termMonths: 24,
      originMonth: world.month,
      status: 'DEFAULT',
    });
    const scBefore = p.socialCapitalLocal;

    expect(strainFriendDefaults(world)).toBe(1);
    expect(p.brokenContracts).toBe(1);
    expect(p.socialCapitalLocal).toBeLessThan(scBefore);
    // Idempotent: a second pass does not strain again.
    expect(strainFriendDefaults(world)).toBe(0);
    expect(p.brokenContracts).toBe(1);
  });
});
