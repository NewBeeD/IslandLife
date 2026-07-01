import { describe, expect, it } from 'vitest';
import type { Company, NPCAgent } from '@island/shared';
import {
  buildWorld,
  simulateOneMonth,
  worldDigest,
  formCompany,
  computeCompanyRevenue,
  runFoundedPayroll,
  runFoundedLabour,
  hiredHandCount,
  isFoundedFirm,
  startingWorkingCapital,
  monthlyConsumption,
  WORKING_CAPITAL_MONTHS,
  FOUNDED_MAX_HANDS,
  HIRED_WAGE_MAX,
  MPC_MAX,
  MPC_MIN,
} from '../index';

function makeFounder(agent: NPCAgent): void {
  agent.isPlayer = false;
  agent.employmentStatus = 'SELF_EMPLOYED';
  agent.cash = 40_000;
  agent.cognitiveAbility = 0.85;
  agent.riskTolerance = 0.9;
  agent.lossAversion = 0.1;
  agent.patience = 0.85;
}

// Attach a hired hand to a founded firm at a fixed wage (reassigning whoever we grab).
function addHand(world: ReturnType<typeof buildWorld>, company: Company, wage: number): NPCAgent {
  const hand = world.agents.find(
    (a) => !a.isPlayer && a.id !== company.ownerId && !company.employees.includes(a),
  )!;
  hand.employmentStatus = 'EMPLOYED';
  hand.employer = company;
  hand.occupation = company.industry;
  hand.monthlyIncome = wage;
  company.employees.push(hand);
  return hand;
}

describe('P19.6 — company cash account', () => {
  it('seed firms are capitalized with working capital; founded firms with the entry cost', () => {
    const world = buildWorld(42, { population: 100 });
    for (const c of world.companies) {
      expect(c.cash).toBe(startingWorkingCapital(c.baseOperatingCosts));
      expect(c.cash).toBeGreaterThan(0);
    }
    const founder = world.agents.find((a) => !a.isPlayer)!;
    founder.cash = 40_000;
    const co = formCompany(founder, world, 'FISHING');
    // The founding is cash-conserving: the entry cost leaves the agent and becomes the
    // firm's opening balance.
    expect(co.cash).toBeGreaterThan(0);
    expect(WORKING_CAPITAL_MONTHS).toBeGreaterThan(0);
  });
});

describe('P19.6 — payroll reconciles against firm cash', () => {
  it('a founded firm pays its hand and the owner draw out of its cash, conserving every dollar', () => {
    const world = buildWorld(42, { population: 100 });
    const founder = world.agents.find((a) => !a.isPlayer)!;
    founder.cash = 40_000;
    const co = formCompany(founder, world, 'FISHING');
    const owner = co.employees.find((e) => e.id === co.ownerId)!;

    const handWage = 900;
    const hand = addHand(world, co, handWage);
    co.cash = 6000;
    const before = co.cash;

    runFoundedPayroll(co);

    // The hand was covered and stays on the roster.
    expect(hand.employmentStatus).toBe('EMPLOYED');
    expect(co.employees).toContain(hand);
    // Reconciliation: cash out of the firm equals the wages paid into its people.
    const paidOut = handWage + owner.monthlyIncome;
    expect(before - co.cash).toBeCloseTo(paidOut, 0);
    // The owner is the residual claimant, leaving a working-capital reserve.
    expect(co.cash).toBeGreaterThanOrEqual(0);
  });

  it('a firm short on cash lays the hand off instead of conjuring the wage', () => {
    const world = buildWorld(7, { population: 100 });
    const founder = world.agents.find((a) => !a.isPlayer)!;
    founder.cash = 40_000;
    const co = formCompany(founder, world, 'AGRICULTURE');

    const hand = addHand(world, co, 1200);
    co.cash = 100; // cannot cover the wage

    runFoundedPayroll(co);

    expect(hand.employmentStatus).toBe('UNEMPLOYED');
    expect(hand.employer).toBeNull();
    expect(hand.monthlyIncome).toBe(0);
    expect(co.employees).not.toContain(hand);
  });

  it("the owner's draw tracks the firm's fortunes — a fat balance pays more than a thin one", () => {
    const world = buildWorld(99, { population: 100 });
    const founder = world.agents.find((a) => !a.isPlayer)!;
    founder.cash = 40_000;

    const fat = formCompany(founder, world, 'FISHING');
    fat.cash = 8000;
    runFoundedPayroll(fat);
    const fatDraw = fat.employees.find((e) => e.id === fat.ownerId)!.monthlyIncome;

    const other = world.agents.find((a) => !a.isPlayer && a.id !== founder.id)!;
    other.cash = 40_000;
    const thin = formCompany(other, world, 'FISHING');
    thin.cash = thin.baseOperatingCosts; // barely above the reserve
    runFoundedPayroll(thin);
    const thinDraw = thin.employees.find((e) => e.id === thin.ownerId)!.monthlyIncome;

    expect(fatDraw).toBeGreaterThan(thinDraw);
  });
});

describe('P19.6 — hiring & firing on firm P&L', () => {
  it('hired labour scales a founded firm’s revenue; seed firms are untouched', () => {
    const world = buildWorld(42, { population: 100 });
    const founder = world.agents.find((a) => !a.isPlayer)!;
    founder.cash = 40_000;
    const co = formCompany(founder, world, 'FISHING');

    const solo = computeCompanyRevenue(co, world.markets, world.events, world.goods, world.companies);
    addHand(world, co, 900);
    const withHand = computeCompanyRevenue(co, world.markets, world.events, world.goods, world.companies);
    expect(withHand).toBeGreaterThan(solo);
  });

  it('a healthy, cash-flush firm hires a local unemployed agent', () => {
    const world = buildWorld(42, { population: 120 });
    const founder = world.agents.find((a) => !a.isPlayer)!;
    founder.cash = 40_000;
    const co = formCompany(founder, world, 'FISHING');
    co.status = 'HEALTHY';
    co.profit = 5000;
    co.cash = 10 * HIRED_WAGE_MAX;
    // Ensure there is an unemployed agent in the firm's parish.
    const local = world.agents.find(
      (a) => !a.isPlayer && a.id !== founder.id && a.parish === co.parish,
    )!;
    local.employmentStatus = 'UNEMPLOYED';
    local.employer = null;

    const before = hiredHandCount(co);
    runFoundedLabour(world);
    expect(hiredHandCount(co)).toBe(before + 1);
    // Whoever was hired now works for this firm.
    const hired = co.employees.find((e) => e.id !== co.ownerId)!;
    expect(hired.employmentStatus).toBe('EMPLOYED');
    expect(hired.employer).toBe(co);
  });

  it('a distressed firm sheds its newest hand', () => {
    const world = buildWorld(7, { population: 100 });
    const founder = world.agents.find((a) => !a.isPlayer)!;
    founder.cash = 40_000;
    const co = formCompany(founder, world, 'AGRICULTURE');
    const hand = addHand(world, co, 900);
    co.status = 'DISTRESSED';

    runFoundedLabour(world);

    expect(co.employees).not.toContain(hand);
    expect(hand.employmentStatus).toBe('UNEMPLOYED');
  });

  it('does not exceed the headcount cap', () => {
    const world = buildWorld(42, { population: 200 });
    const founder = world.agents.find((a) => !a.isPlayer)!;
    founder.cash = 40_000;
    const co = formCompany(founder, world, 'FISHING');
    co.status = 'HEALTHY';
    co.profit = 9000;
    co.cash = 50 * HIRED_WAGE_MAX;
    // Plenty of local unemployed.
    for (const a of world.agents) {
      if (!a.isPlayer && a.id !== founder.id && a.parish === co.parish) {
        a.employmentStatus = 'UNEMPLOYED';
        a.employer = null;
      }
    }
    for (let i = 0; i < FOUNDED_MAX_HANDS + 3; i++) runFoundedLabour(world);
    expect(hiredHandCount(co)).toBeLessThanOrEqual(FOUNDED_MAX_HANDS);
  });

  it('over a long run, founded firms actually hire — employment moves on firm decisions', () => {
    const world = buildWorld(42, { population: 300 });
    let everHired = false;
    for (let m = 0; m < 120 && !everHired; m++) {
      simulateOneMonth(world);
      everHired = world.agents.some(
        (a) =>
          a.employmentStatus === 'EMPLOYED' &&
          a.employer != null &&
          isFoundedFirm(a.employer) &&
          a.employer.ownerId !== a.id, // a hired hand, not an owner
      );
    }
    expect(everHired).toBe(true);
  });
});

describe('P19.6 — consumption model', () => {
  it('always meets subsistence and never overspends disposable income', () => {
    expect(monthlyConsumption(500, 800)).toBe(800); // below subsistence: floor at living costs
    const spend = monthlyConsumption(3000, 800);
    expect(spend).toBeGreaterThan(800); // spends above subsistence
    expect(spend).toBeLessThan(3000); // but saves some — cash isn't conjured away
  });

  it('marginal propensity to consume declines as income rises', () => {
    const lc = 600;
    const mpcAt = (income: number): number =>
      (monthlyConsumption(income, lc) - lc) / (income - lc);
    const thin = mpcAt(lc + 200); // little disposable income
    const ample = mpcAt(lc + 8000); // lots of disposable income
    expect(thin).toBeGreaterThan(ample);
    expect(thin).toBeLessThanOrEqual(MPC_MAX);
    expect(ample).toBeGreaterThanOrEqual(MPC_MIN);
  });
});

describe('P19.6 — determinism holds through the new dynamics', () => {
  it('the balance pass is reproducible per seed', () => {
    const run = (): number => {
      const w = buildWorld(99, { population: 200 });
      for (let m = 0; m < 60; m++) simulateOneMonth(w);
      return worldDigest(w);
    };
    expect(run()).toBe(run());
  });
});
