import { INDUSTRY_DOMAIN } from '@island/shared';
import type { WorldState } from '@island/shared';
import { applyAction, npcDecide, triggerPersonalLoanDefault } from './agents';
import { checkBankSolvency } from './banking';
import { applyClosureCascade, checkCompanySolvency, computeCompanyRevenue } from './company';
import { rollRandomEvents } from './events';
import { governmentAct } from './government';
import { computeLegacyIncrement } from './legacy';
import { updateMarketPrice } from './market';

// Mutable entity-graph model. Phases mutate the live world in place so a change
// in one phase (a company closing, an agent losing a job, a loan defaulting) is
// visible to every later phase by shared reference. Order is critical.
export function simulateOneMonth(world: WorldState): WorldState {
  const { month } = world;

  // PHASE 1: events
  const newEvents = rollRandomEvents(world);
  for (const e of world.events) e.durationRemaining -= 1;
  world.events = [...world.events.filter((e) => e.durationRemaining > 0), ...newEvents];

  // PHASE 2: market prices
  for (const market of world.markets) updateMarketPrice(market, world.events, month, world.goods);

  // PHASE 3: company revenue
  for (const company of world.companies) {
    if (company.status === 'CLOSED') continue;
    company.monthlyRevenue = computeCompanyRevenue(company, world.markets, world.events, world.goods);
  }

  // PHASE 4: costs, solvency, closure cascade
  for (const company of world.companies) {
    if (company.status === 'CLOSED') continue;
    const loanPayments = company.loans
      .filter((l) => l.status === 'ACTIVE')
      .reduce((s, l) => s + l.monthlyPayment, 0);
    const eventLoad = world.events.filter((e) => e.affectedIndustries.includes(company.industry)).length;
    // baseOperatingCosts is the full monthly cost line (seed costs / 12) and already
    // includes payroll, so the wage bill is NOT subtracted again here. (Phase 1
    // simplification: company P&L and the agent-side wage bill are not yet
    // reconciled cash-for-cash; a later phase will tie payroll to company cash.)
    const operatingCosts = company.baseOperatingCosts * (1 + eventLoad * 0.05);

    company.profit = company.monthlyRevenue - loanPayments - operatingCosts;
    company.consecutiveLossMonths = company.profit < 0 ? company.consecutiveLossMonths + 1 : 0;

    const { status } = checkCompanySolvency(company.consecutiveLossMonths);
    if (status === 'CLOSED') applyClosureCascade(company, world);
    company.status = status;
    company.isSolvent = status !== 'CLOSED';
  }

  // PHASE 5: persons receive wages, pay personal loans
  for (const agent of world.agents) {
    const income = agent.employer
      ? agent.employer.isSolvent
        ? agent.monthlyIncome
        : 0
      : agent.monthlyIncome;
    const personalLoanPayments = agent.loans
      .filter((l) => l.status === 'ACTIVE')
      .reduce((s, l) => s + l.monthlyPayment, 0);
    // Spending = base living costs + lifestyle creep on surplus income, so cash
    // does not accumulate unboundedly (a crude consumption model for the slice).
    const surplus = Math.max(0, income - agent.monthlyLivingCosts);
    const spending = agent.monthlyLivingCosts + 0.5 * surplus;
    const newCash = agent.cash + income - personalLoanPayments - spending;
    if (newCash < 0 && agent.loans.some((l) => l.status === 'ACTIVE')) {
      triggerPersonalLoanDefault(agent);
    }
    agent.cash = Math.max(newCash, 0);
  }

  // PHASE 6: NPC decisions
  for (const agent of world.agents) {
    if (agent.isPlayer) continue;
    applyAction(agent, npcDecide(agent, world), world);
  }

  // PHASE 7: bank solvency
  for (const bank of world.banks) {
    const bankLoans = [
      ...world.agents.flatMap((a) => a.loans),
      ...world.companies.flatMap((c) => c.loans),
    ].filter((l) => l.bankId === bank.id);
    const { status, nplRatio } = checkBankSolvency(bank, bankLoans);
    bank.state = status;
    bank.nonPerformingLoanRatio = nplRatio;
    const factor = status === 'INSOLVENT' ? 0 : status === 'DISTRESSED' ? 0.4 : status === 'STRESSED' ? 0.7 : 1;
    bank.lendingAppetite = bank.baseLendingAppetite * factor;
  }

  // Write off a fraction of defaulted debt each month so bank books (and NPL)
  // recover after a wave of closures instead of pinning at 100% forever.
  for (const holder of [...world.agents, ...world.companies]) {
    holder.loans = holder.loans.filter(
      (l) => !(l.status === 'DEFAULT' && world.rng.next() < 0.15),
    );
  }

  // PHASE 8: government
  world.government.unemploymentRate =
    world.agents.filter((a) => a.employmentStatus === 'UNEMPLOYED').length / world.agents.length;
  governmentAct(world.government, world);

  // PHASE 9: knowledge & experience
  for (const agent of world.agents) {
    const activeDomain = agent.occupation ? INDUSTRY_DOMAIN[agent.occupation] : null;
    if (activeDomain) {
      const gain = 0.008 * (1 + agent.knowledgeAcquisitionRate);
      agent.experience[activeDomain] = Math.min(1, agent.experience[activeDomain] + gain);
    }
    for (const domain of Object.keys(agent.knowledge) as (keyof typeof agent.knowledge)[]) {
      if (domain !== activeDomain) {
        agent.knowledge[domain] = Math.max(0, agent.knowledge[domain] - 0.002);
      }
    }
    if (agent.cash < agent.previousMonthCapital * 0.5) {
      agent.neuroticism = Math.min(0.95, agent.neuroticism + 0.003);
    }
    agent.previousMonthCapital = agent.cash;
  }

  // PHASE 10: legacy
  world.playerLegacy = computeLegacyIncrement(world.player, world);

  world.month = month + 1;

  // PHASE 11: aging. Everyone gains a year every twelve months (an anniversary of
  // the game's January start). Age is felt through narrative and, past 40, physical
  // output — never shown as a stat. Deterministic (no RNG draw), so it does not
  // touch the world digest or the (seed, decisions) reproduction guarantee.
  if (world.month % 12 === 0) {
    for (const agent of world.agents) agent.age += 1;
  }

  return world;
}
