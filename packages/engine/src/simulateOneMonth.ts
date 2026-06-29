import { INDUSTRY_DOMAIN } from '@island/shared';
import type { WorldState } from '@island/shared';
import { applyAction, npcDecide, triggerPersonalLoanDefault } from './agents';
import { amortizeLoanMonth, checkBankSolvency, loanPaymentDue } from './banking';
import { applyClosureCascade, checkCompanySolvency, computeCompanyRevenue } from './company';
import { rollRandomEvents } from './events';
import { governmentAct } from './government';
import { chargeTuition } from './education';
import { computeLegacyIncrement } from './legacy';
import { updateMarketPrice } from './market';
import { activeVentures, distributeVentureEquity, hasVentures, totalOperatingCosts } from './ventures';
import { distributePartnershipProfit, strainFriendDefaults } from './funding';
import { repossessCollateral, resolvePendingSales } from './assets';

// Consecutive unmet-payment months before the player's loans fall into default
// (Phase 7). NPCs default on the first month they cannot cover (unchanged).
const PLAYER_ARREARS_LIMIT = 3;

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
    const loanPayments = company.loans.reduce((s, l) => s + loanPaymentDue(l), 0);
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

    // Phase 14: pay down whatever loans are still ACTIVE this month so a firm's debt
    // actually falls and a repaid loan closes. A closed company's loans were just
    // marked DEFAULT by the cascade, so amortizeLoanMonth skips them.
    for (const loan of company.loans) amortizeLoanMonth(loan);
  }

  // PHASE 4c (Phase 12, additive): settle any PATIENT asset sales that have come
  // due, so the proceeds are in the player's cash before loans are serviced. A no-op
  // without pending sales, so the digest holds.
  resolvePendingSales(world);

  // PHASE 5: persons receive wages, pay personal loans
  for (const agent of world.agents) {
    const income = agent.employer
      ? agent.employer.isSolvent
        ? agent.monthlyIncome
        : 0
      : agent.monthlyIncome;
    // Phase 14: the cash actually due on each ACTIVE loan this month (the final
    // payment is only the remaining balance). The principal is paid down below, once
    // it is clear the agent serviced the loan rather than defaulting.
    const personalLoanPayments = agent.loans.reduce((s, l) => s + loanPaymentDue(l), 0);
    // Spending = base living costs + lifestyle creep on surplus income, so cash
    // does not accumulate unboundedly (a crude consumption model for the slice).
    const surplus = Math.max(0, income - agent.monthlyLivingCosts);
    const spending = agent.monthlyLivingCosts + 0.5 * surplus;
    // Fuel/upkeep on owned equipment (Phase 7) — 0 for everyone without an upgrade,
    // so NPC and default-player cash math is unchanged (the digest holds). Phase 8:
    // a venture portfolio sums upkeep across its ventures (still 0 for NPCs).
    const operating = totalOperatingCosts(agent);
    // Tuition while enrolled (Phase 9) — a real monthly drain; 0 for everyone not
    // studying, so NPC/default-player cash math is unchanged (the digest holds).
    const tuition = chargeTuition(agent);
    const newCash = agent.cash + income - personalLoanPayments - spending - operating - tuition;
    const hasActiveLoan = agent.loans.some((l) => l.status === 'ACTIVE');

    if (agent.isPlayer && hasActiveLoan) {
      // The player draws down savings through lean spells and only defaults after a
      // run of months they cannot cover — a softer path than the NPC instant
      // default, so a seasonal trade with a loan is survivable, not a trap.
      if (newCash < 0) {
        agent.loanArrearsMonths = (agent.loanArrearsMonths ?? 0) + 1;
        if (agent.loanArrearsMonths >= PLAYER_ARREARS_LIMIT) {
          // Default only enough loans to close the monthly gap (-newCash), not the
          // whole book — an affordable loan should survive a smaller one going bad.
          triggerPersonalLoanDefault(agent, -newCash);
          agent.loanArrearsMonths = 0;
        }
      } else {
        agent.loanArrearsMonths = 0; // caught up
      }
    } else if (newCash < 0 && hasActiveLoan) {
      triggerPersonalLoanDefault(agent);
    }

    agent.cash = Math.max(newCash, 0);

    // Phase 14: pay down the loans the agent actually serviced this month — principal
    // falls and a fully-repaid loan flips to PAID (and stops charging). Loans pushed
    // into DEFAULT just above are no longer ACTIVE, so amortizeLoanMonth skips them.
    for (const loan of agent.loans) amortizeLoanMonth(loan);
  }

  // PHASE 5b (Phase 11, additive): friend-funded money flows. A friend-loan that
  // fell into default this month strains the friendship (brokenContracts + a social-
  // capital hit). Venture equity holders and shared-firm partners are paid their slice
  // of a good month. All no-ops without Phase-11 state, so the digest holds (S2).
  strainFriendDefaults(world);
  // Phase 12: a defaulted secured loan is settled by seizing its collateral. Runs
  // after defaults are marked (Phase 5) and before defaulted debt is written off
  // (Phase 7). A no-op without secured loans in default, so the digest holds.
  repossessCollateral(world);
  distributeVentureEquity(world);
  distributePartnershipProfit(world);

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
    // Every active venture's domain earns experience (Phase 8); a single-occupation
    // agent (every NPC, a pre-Phase-8 player) credits exactly its one domain, so the
    // digest is unchanged.
    const activeDomains = new Set<keyof typeof agent.experience>();
    if (hasVentures(agent)) {
      for (const v of activeVentures(agent)) activeDomains.add(INDUSTRY_DOMAIN[v.industry]);
    } else if (agent.occupation) {
      activeDomains.add(INDUSTRY_DOMAIN[agent.occupation]);
    }
    const gain = 0.008 * (1 + agent.knowledgeAcquisitionRate);
    for (const domain of activeDomains) {
      agent.experience[domain] = Math.min(1, agent.experience[domain] + gain);
    }
    for (const domain of Object.keys(agent.knowledge) as (keyof typeof agent.knowledge)[]) {
      if (!activeDomains.has(domain as keyof typeof agent.experience)) {
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
