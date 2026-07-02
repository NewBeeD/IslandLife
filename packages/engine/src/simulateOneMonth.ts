import { INDUSTRY_DOMAIN } from '@island/shared';
import type { WorldState } from '@island/shared';
import { applyAction, monthlyConsumption, npcDecide, triggerPersonalLoanDefault } from './agents';
import {
  amortizeLoanMonth,
  checkBankSolvency,
  loanPaymentDue,
  systemicImportance,
  systemicShockMagnitude,
} from './banking';
import {
  applyClosureCascade,
  checkCompanySolvency,
  computeCompanyRevenue,
  isFoundedFirm,
  runFoundedLabour,
  runFoundedPayroll,
} from './company';
import { rollRandomEvents } from './events';
import { governmentAct } from './government';
import { injectSystemicShock, macroLendingAppetiteFactor, recomputeMacro } from './macro';
import { supplyChainCostMultiplier } from './supply';
import { applyCompetitivePricePressure } from './competition';
import { chargeTuition } from './education';
import { computeLegacyIncrement } from './legacy';
import { updateMarketPrice } from './market';
import {
  activeVentures,
  distributeVentureEquity,
  hasVentures,
  recoverVentureReputations,
  rollVentureScandal,
  totalOperatingCosts,
} from './ventures';
import { distributePartnershipProfit, strainFriendDefaults } from './funding';
import { updateReputation } from './reputation';
import { decayInformation } from './info';
import { repossessCollateral, resolvePendingSales } from './assets';
import { agePlayerAssets } from './aging';

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

  // PHASE 2: market prices. The macro web scales each good's effective demand by the
  // aggregate-demand cycle (P20.2), so a downturn pulls prices — and firm revenue —
  // down, the loop's core amplifying edge. The macro read here is *last* month's state
  // (recomputed in Phase 8b below), the correct one-month lag. Phase 24: the seed turns
  // on the evolving-market demand reads — each good's slow taste drift and its parish's
  // cultural lean — neutral at month 0, so a fresh world is byte-identical.
  for (const market of world.markets)
    updateMarketPrice(market, world.events, month, world.goods, world.macro, world.seed);

  // PHASE 3: company revenue
  for (const company of world.companies) {
    if (company.status === 'CLOSED') continue;
    company.monthlyRevenue = computeCompanyRevenue(
      company,
      world.markets,
      world.events,
      world.goods,
      world.companies,
    );
  }

  // PHASE 3b: competitive price pressure (P20.4, C9). A firm that has come to dominate
  // its parish×industry cell has rivals undercutting it — its margin is competed down
  // before this month's revenue is priced into profit. Self-limiting and never ruinous;
  // a no-op for every firm under the dominance threshold, so a competitive market is
  // untouched.
  applyCompetitivePricePressure(world);

  // PHASE 4: costs, solvency, closure cascade
  for (const company of world.companies) {
    if (company.status === 'CLOSED') continue;
    const loanPayments = company.loans.reduce((s, l) => s + loanPaymentDue(l), 0);
    const eventLoad = world.events.filter((e) => e.affectedIndustries.includes(company.industry)).length;
    // baseOperatingCosts is the firm's non-labour cost line. For a founded firm the
    // owner draws the residual and any hired hands are paid out of cash (Phase 19.6,
    // runFoundedPayroll below), so labour does not enter `profit` here — `profit` is
    // the surplus available to labour, and it drives solvency exactly as before. A
    // seed firm's `baseOperatingCosts` still folds in its established-economy payroll
    // (Phase 1 simplification; Phase 20 reconciles incumbent payroll cash-for-cash).
    // Phase 23: scarce inputs lift the cost line in proportion to the trade's supply-
    // chain fragility (a boom or a severed route bites a fragile, import-heavy trade
    // hardest, barely touches a raw one). The macro read is last month's state — the
    // same one-month lag the market prices above take. A multiplier of 1 in calm times,
    // so a firm in a settled economy is byte-identical to the pre-P23 cost model.
    const scarcity = supplyChainCostMultiplier(world.macro, company.industry);
    const operatingCosts = company.baseOperatingCosts * (1 + eventLoad * 0.05) * scarcity;

    company.profit = company.monthlyRevenue - loanPayments - operatingCosts;
    company.consecutiveLossMonths = company.profit < 0 ? company.consecutiveLossMonths + 1 : 0;

    const { status } = checkCompanySolvency(company.consecutiveLossMonths);
    if (status === 'CLOSED') applyClosureCascade(company, world);
    company.status = status;
    company.isSolvent = status !== 'CLOSED';

    // Phase 19.6: the month's surplus flows into the firm's cash, then a founded firm
    // pays its labour out of that cash — hired hands first (laid off if it cannot
    // cover them), the owner the residual draw. Wages an NPC-founded firm pays now
    // reconcile against real firm cash. Seed firms accrue working capital but their
    // payroll is unchanged (Phase 20's remit).
    company.cash += company.profit;
    if (isFoundedFirm(company)) runFoundedPayroll(company);

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
    // Phase 19.6: a real consumption model — subsistence living costs plus a declining
    // marginal propensity to consume on disposable income (the near-subsistence spend
    // nearly all of it, the comfortable save more), replacing the flat half-of-surplus
    // rule. Cash still cannot pile up unboundedly, but the wealthy accumulate faster.
    const spending = monthlyConsumption(income, agent.monthlyLivingCosts);
    // Fuel/upkeep on owned equipment (Phase 7) — 0 for everyone without an upgrade,
    // so NPC and default-player cash math is unchanged (the digest holds). Phase 8:
    // a venture portfolio sums upkeep across its ventures (still 0 for NPCs). Phase 23:
    // this month's scarce-input squeeze rides the upkeep, by each trade's chain
    // fragility — 0 stays 0 for NPCs, and a calm economy is byte-identical.
    const operating = totalOperatingCosts(agent, world.macro);
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

  // PHASE 5c (Phase 21): the reputation ledger. Recompute the player's standing now that
  // this month's defaults, friend-strain, and broken contracts are settled but before
  // Phase 7 writes defaulted debt off (so a fresh default is still on the book to be
  // seen). One default tanks financial reliability; a clean-servicing month builds it
  // slowly; every band eases back toward neutral over years. Pure of rng — a no-op on the
  // seed stream, so the no-reputation-event baseline digest holds (S2). The player only.
  updateReputation(world);
  // Phase 21 (A19 — markets remember): a rare scandal on a consumer-facing player venture
  // cuts its customer demand sharply; every venture's demand memory recovers toward whole
  // only slowly. Gated on the player actually running an eligible venture, so no rng is
  // drawn — and nothing moves — for a player without one (the digest holds).
  recoverVentureReputations(world);
  rollVentureScandal(world);

  // PHASE 5d (Phase 22): information goes stale. The player's paid market-research read
  // decays a step toward nothing each month and a lapsed competitor scout is cleared, so
  // an information edge is a wasting asset that must be renewed (A1). Player-only and a
  // no-op for a player who has never bought information, so the no-information baseline
  // digest holds (S2). Pure of rng.
  decayInformation(world);

  // PHASE 6: NPC decisions
  for (const agent of world.agents) {
    if (agent.isPlayer) continue;
    applyAction(agent, npcDecide(agent, world), world);
  }

  // PHASE 6b: founded-firm labour market (P19.6). Firms hire and fire on their own
  // P&L — a healthy, cash-flush firm takes on a local unemployed hand (and its output
  // scales up with the labour); a distressed one sheds its newest hand. So unemployment
  // now moves because firms respond to their fortunes, not a flat hiring constant.
  runFoundedLabour(world);

  // PHASE 7: bank solvency & interbank linkage (P20.3). Pass 1 recomputes each bank's
  // state and detects a *systemically-important* bank freshly failing — one whose
  // weight in the interbank web (its share of system assets) is large enough that its
  // collapse freezes the whole market. Such a failure injects a systemic-credit shock.
  const allLoans = [
    ...world.agents.flatMap((a) => a.loans),
    ...world.companies.flatMap((c) => c.loans),
  ];
  for (const bank of world.banks) {
    const prevState = bank.state;
    const bankLoans = allLoans.filter((l) => l.bankId === bank.id);
    const { status, nplRatio } = checkBankSolvency(bank, bankLoans);
    bank.state = status;
    bank.nonPerformingLoanRatio = nplRatio;
    if (prevState !== 'INSOLVENT' && status === 'INSOLVENT') {
      const magnitude = systemicShockMagnitude(systemicImportance(bank, world.banks));
      if (magnitude > 0) injectSystemicShock(world.macro, magnitude);
    }
  }
  // Pass 2 sets every bank's appetite from its own state AND the system-wide credit
  // shock — so a big failure contracts appetite even at solvent banks (solvent firms
  // lose their line, refinancing dries up), the interbank freeze the P20.2 loop then
  // amplifies. macroLendingAppetiteFactor is 1 in calm times, so this is byte-identical
  // until a systemic shock actually lands.
  const systemicFactor = macroLendingAppetiteFactor(world.macro);
  for (const bank of world.banks) {
    const s = bank.state;
    const factor = s === 'INSOLVENT' ? 0 : s === 'DISTRESSED' ? 0.4 : s === 'STRESSED' ? 0.7 : 1;
    bank.lendingAppetite = bank.baseLendingAppetite * factor * systemicFactor;
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

  // PHASE 8b: the economic web (Phase 20). Recompute the macro variables from the
  // month's outcome — unemployment (Phase 8), bank health (Phase 7), firm profit
  // (Phase 4) — so the cascade's feedback edges advance one step. The fresh values
  // are read by *next* month's markets, banks, and firms (the write side, P20.2),
  // giving the loop its months-long, mean-reverting propagation. Pure of rng.
  recomputeMacro(world);
  // Public sentiment is the household mood the macro web produces — set it from
  // consumer confidence so the wider economy's swings reach the systems that already
  // read sentiment: the NPC decision engine's cycle read (marketHeat drives herd/panic
  // founding, P19.4, wired for exactly this) and the narrative's economy voice (P20.5).
  world.government.publicSentiment = world.macro.consumerConfidence;

  // PHASE 9: knowledge & experience
  for (const agent of world.agents) {
    // Every active venture's domain earns experience (Phase 8); a single-occupation
    // agent (every NPC, a pre-Phase-8 player) credits exactly its one domain, so the
    // digest is unchanged.
    const activeDomains = new Set<keyof typeof agent.experience>();
    if (hasVentures(agent)) {
      // Phase 17: a venture run by a hired operator is not the player's own hands at
      // work, so it builds no experience for them (P17.1).
      for (const v of activeVentures(agent)) {
        if (v.operatedBy === 'OPERATOR') continue;
        activeDomains.add(INDUSTRY_DOMAIN[v.industry]);
      }
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

  // PHASE 9c (Phase 24.3): the player's gear ages. Value slides, upkeep creeps, and an
  // un-renewed venture's output eases down over years; a rare technology step can render a
  // whole asset class obsolete at a stroke. Pure of world.rng (wear is arithmetic on age,
  // the tech step rolls a side-stream), and a no-op for a player with no tracked assets, so
  // the default-player digest holds (S2). Runs before legacy so net worth reflects the wear.
  agePlayerAssets(world);

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
