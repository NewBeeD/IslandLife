import { describe, expect, it } from 'vitest';
import {
  accruePlayerInvestments,
  applyInvestment,
  buildWorld,
  deserializeWorld,
  resolveDecision,
  serializeWorld,
  surfaceInvestSolicitation,
} from '../index';
import type { InvestSolicitationSpec, NPCAgent, WorldState } from '@island/shared';

// PHASE 18 — investing in someone else's venture (P18.1 / P18.2).

// A self-employed player with cash and a circle of self-employed acquaintances who
// might come asking for money. Away from the Eunice trigger.
function investorWorld(seed = 31): WorldState {
  const world = buildWorld(seed, { population: 80 });
  const p = world.player;
  p.occupation = 'FISHING';
  p.employmentStatus = 'SELF_EMPLOYED';
  p.parish = 'SAINT_JOHN';
  p.socialCapitalLocal = 0.1;
  p.monthlyIncome = 1500;
  p.cash = 30000;
  world.month = 6;
  // A few same-parish, self-employed acquaintances to serve as would-be investees.
  const friends = world.agents.filter((a) => !a.isPlayer).slice(0, 4);
  for (const f of friends) {
    f.parish = 'SAINT_JOHN';
    f.employmentStatus = 'SELF_EMPLOYED';
    f.occupation = 'RETAIL';
    f.cash = 4000;
  }
  p.socialNetwork = friends.map((a) => a.id);
  return world;
}

function spec(over: Partial<InvestSolicitationSpec> = {}): InvestSolicitationSpec {
  return {
    id: 'INV_X',
    investeeId: 'INVESTEE',
    investeeName: 'A Friend',
    ventureLabel: 'her shop',
    industry: 'RETAIL',
    principal: 10000,
    termMonths: 24,
    interestRate: 0.1,
    dividendAnnualRate: 0.2,
    revenueShare: 0.1,
    monthlyRevenueBase: 2000,
    successBias: 1,
    volatility: 0.1,
    ...over,
  };
}

describe('P18.1 — the player chooses how an investment returns', () => {
  it('moves the principal from the player to the investee and records the claim', () => {
    const world = investorWorld();
    const p = world.player;
    const investee = world.agents.find((a) => !a.isPlayer)!;
    const s = spec({ investeeId: investee.id, principal: 8000 });
    const cashBefore = p.cash;
    const investeeBefore = investee.cash;

    const claim = applyInvestment(world, s, 'INTEREST');

    expect(p.cash).toBe(cashBefore - 8000);
    expect(investee.cash).toBe(investeeBefore + 8000);
    expect(claim.structure).toBe('INTEREST');
    expect(claim.status).toBe('ACTIVE');
    expect(p.investments?.length).toBe(1);
  });

  it('the same offer pays a different monthly inflow as loan, dividend, or revenue share', () => {
    const world = investorWorld(7);
    const investee = world.agents.find((a) => !a.isPlayer)!;
    const s = spec({ investeeId: investee.id, principal: 12000, volatility: 0.08 });
    const asLoan = applyInvestment(world, s, 'INTEREST');
    const asDividend = applyInvestment(world, s, 'DIVIDEND');
    const asRevenue = applyInvestment(world, s, 'REVENUE_SHARE');

    accruePlayerInvestments(world);

    // The loan pays its fixed installment exactly; the other two ride the venture's
    // month and so differ from the loan (and, structurally, from each other's basis).
    expect(asLoan.lastReturn).toBe(asLoan.monthlyPayment);
    expect(asDividend.lastReturn).not.toBe(asLoan.lastReturn);
    expect(asRevenue.lastReturn).not.toBe(asLoan.lastReturn);
    expect((asDividend.lastReturn ?? 0) >= 0).toBe(true);
    expect((asRevenue.lastReturn ?? 0) >= 0).toBe(true);
  });

  it('an interest claim returns its capital with interest over the term and then closes', () => {
    const world = investorWorld(11);
    const investee = world.agents.find((a) => !a.isPlayer)!;
    investee.cash = 1_000_000; // can comfortably pay it back
    const claim = applyInvestment(world, spec({ investeeId: investee.id, principal: 6000, termMonths: 18 }), 'INTEREST');
    const monthly = claim.monthlyPayment!;

    // Run until the claim closes (a rounded installment can leave a small tail a month
    // or two past the nominal term).
    let total = 0;
    for (let i = 0; i < 24 && claim.status === 'ACTIVE'; i++) total += accruePlayerInvestments(world);

    expect(claim.status).toBe('CLOSED');
    expect(claim.remainingPrincipal).toBe(0);
    // Total returned is the capital plus interest, on the order of the term's installments.
    expect(total).toBeGreaterThan(6000); // principal plus interest
    expect(total).toBeLessThanOrEqual(monthly * 21);
    // Once closed it pays nothing more.
    expect(accruePlayerInvestments(world)).toBe(0);
  });

  it('resolving an INVEST_SOLICITATION through resolveDecision wires the chosen structure', () => {
    const world = investorWorld(3);
    const p = world.player;
    // Surface until a solicitation appears (the frequency gate is random).
    let opp = null;
    for (let i = 0; i < 200 && !opp; i++) {
      opp = surfaceInvestSolicitation(world);
      if (!opp) world.month += 1;
    }
    expect(opp).not.toBeNull();
    const dec = world.decisions.find((d) => d.id === opp!.decisionId)!;
    const loanOpt = dec.options.find((o) => o.effect.invest?.structure === 'INTEREST')!;
    const investee = world.agents.find((a) => a.id === opp!.invest!.investeeId)!;
    const cashBefore = p.cash;
    const investeeBefore = investee.cash;

    resolveDecision(world, dec.id, loanOpt.id);

    expect(opp!.status).toBe('ACCEPTED');
    expect(p.investments?.some((iv) => iv.structure === 'INTEREST')).toBe(true);
    expect(p.cash).toBe(cashBefore - opp!.invest!.principal);
    expect(investee.cash).toBe(investeeBefore + opp!.invest!.principal);
  });

  it('investments round-trip through serialize → deserialize', () => {
    const world = investorWorld(5);
    applyInvestment(world, spec({ investeeId: world.agents[1]!.id }), 'DIVIDEND');
    const back = deserializeWorld(serializeWorld(world));
    expect(back.player.investments).toEqual(world.player.investments);
  });
});

describe('P18.2 — solicitations scale with wealth and reputation', () => {
  // Count how many solicitations reach a player over a stretch of months, expiring any
  // open one each month so the next can come (the frequency is what we are measuring).
  function countSolicitations(configure: (p: NPCAgent) => void, months = 72): { count: number; avgPrincipal: number } {
    const world = investorWorld(99);
    configure(world.player);
    let count = 0;
    let principalSum = 0;
    for (let m = 0; m < months; m++) {
      for (const o of world.opportunities) {
        if (o.kind === 'INVEST_SOLICITATION' && o.status === 'OPEN') o.status = 'EXPIRED';
      }
      const opp = surfaceInvestSolicitation(world);
      if (opp?.invest) {
        count += 1;
        principalSum += opp.invest.principal;
      }
      world.month += 1;
    }
    return { count, avgPrincipal: count > 0 ? principalSum / count : 0 };
  }

  it('a broke newcomer is rarely solicited and only for small sums; a wealthy, well-known player far more', () => {
    const poor = countSolicitations((p) => {
      p.cash = 1600;
      p.socialCapitalLocal = 0.02;
      p.socialCapitalInstitutional = 0.02;
    });
    const rich = countSolicitations((p) => {
      p.cash = 90000;
      p.socialCapitalLocal = 0.9;
      p.socialCapitalInstitutional = 0.8;
    });

    expect(rich.count).toBeGreaterThan(poor.count);
    // And the sums asked of a wealthy, known player are larger.
    expect(rich.avgPrincipal).toBeGreaterThan(poor.avgPrincipal);
  });
});
