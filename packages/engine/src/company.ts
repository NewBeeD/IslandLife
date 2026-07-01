import { INDUSTRIES, REPRESENTATIVE_GOOD } from '@island/shared';
import type {
  Company,
  CompanyStatus,
  Good,
  Industry,
  Market,
  NPCAgent,
  WorldEvent,
  WorldState,
} from '@island/shared';

// ── Competition feedback (P19.5) ─────────────────────────────────────────────
// A local market gets crowded: every additional small trader chasing the same good in
// the same parish shaves a slice off what each one can take, so a profitable cell that
// draws entrants competes its own margin away. The scrum is scoped to the NPC-founded
// sole-trader cohort the engine spins up (P19.5) — the seed firms are the established
// economy and keep their pre-P19.5 revenue untouched (a regional fishing co-op is not
// in the same roadside spot-market scramble as a clutch of new juice stands; Phase 20
// models incumbent competition on its own terms). This crowding feedback is exactly
// what makes births and deaths balance instead of the firm count either death-
// spiralling (the old closures-only world) or exploding without bound.
const COMPETITION_HAIRCUT_PER_RIVAL = 0.06;
const COMPETITION_FACTOR_FLOOR = 0.5;

// ── Company cash, labour & payroll (P19.6) ───────────────────────────────────
// Every firm carries a working-capital balance. A seed firm starts with this many
// months of its cost line; an NPC-founded firm is capitalized with the founder's
// entry cost (the money the founder already paid now lands in the firm). The month's
// surplus flows in and labour is paid out — so a founded firm's wages reconcile
// against real cash and a firm that runs dry lays off rather than conjuring pay.
export const WORKING_CAPITAL_MONTHS = 3;

// A founded sole trader can take on a couple of hired hands beyond the owner. Each
// hand adds this share of the owner's base output (more labour, more production), so
// revenue — and the firm's appetite to hire — rises with headcount but is bounded.
export const FOUNDED_MAX_HANDS = 2;
const LABOUR_MARGINAL_OUTPUT = 0.45;

// A hired hand's monthly wage band (modest — a small roadside firm, not a salaried
// post). Drawn at hire through world.rng so it stays reproducible per seed.
export const HIRED_WAGE_MIN = 700;
export const HIRED_WAGE_MAX = 1100;

// The owner draws the firm's residual cash above a working-capital reserve, capped so
// a fat month builds the firm rather than being stripped bare in one draw.
const OWNER_DRAW_RESERVE_MONTHS = 1;
const OWNER_DRAW_CAP = 4000;

// Hiring gates (P&L-driven, P19.6): a firm only takes on a hand when it is HEALTHY,
// this month cleared comfortably more than a wage, and it holds a cash buffer of a
// few wages — so hiring tracks firm fortunes and self-limits when the cell crowds.
const HIRE_MIN_PROFIT = HIRED_WAGE_MAX * 0.6;
const HIRE_CASH_MONTHS = 3;

// Hired hands beyond the owner — the labour that scales a founded firm's output.
export function hiredHandCount(company: Pick<Company, 'employees' | 'ownerId'>): number {
  return company.employees.filter((e) => e.id !== company.ownerId).length;
}

// The output multiplier from a founded firm's hired labour (owner = the base 1×).
function labourFactor(company: Pick<Company, 'employees' | 'ownerId'>): number {
  return 1 + LABOUR_MARGINAL_OUTPUT * hiredHandCount(company);
}

// Working capital a firm is stood up with, given its monthly cost line.
export function startingWorkingCapital(baseOperatingCosts: number): number {
  return Math.round(baseOperatingCosts * WORKING_CAPITAL_MONTHS);
}

// An NPC-founded firm carries the `CO_` id prefix `formCompany` mints; the seed
// companies do not. This is the marker for "is in the entrepreneurial scrum."
export function isFoundedFirm(company: Pick<Company, 'id'>): boolean {
  return company.id.startsWith('CO_');
}

// How many *founded* sole traders trade in the same industry×parish cell — the cohort
// a new entrant competes with. Used by the live P&L below and by the engine's forward
// estimate when it weighs founding, so an agent foresees the crowding it will meet.
export function foundedRivalsInCell(
  companies: readonly Company[],
  industry: Industry,
  parish: string,
): number {
  return companies.filter(
    (c) =>
      c.status !== 'CLOSED' &&
      isFoundedFirm(c) &&
      c.industry === industry &&
      c.parish === parish,
  ).length;
}

// The revenue multiplier from crowding for a firm facing `rivals` cohort competitors.
export function competitionFactor(rivals: number): number {
  return Math.max(1 - rivals * COMPETITION_HAIRCUT_PER_RIVAL, COMPETITION_FACTOR_FLOOR);
}

export function computeCompanyRevenue(
  company: Company,
  markets: Market[],
  events: WorldEvent[],
  goods: Good[],
  companies: readonly Company[] = [],
): number {
  // Markets are keyed by good; match on the good's category (== industry).
  const market = markets.find((m) => {
    const good = goods.find((g) => g.id === m.goodId);
    return good?.category === company.industry && m.parish === company.parish;
  });
  if (!market) return 0;

  // A founded firm's output scales with its hired labour (P19.6): the owner is the
  // base 1×, each hand it has taken on adds more production. monthlyOutputUnits stays
  // the owner-base set at founding, so a solo founded firm is byte-identical to before
  // and seed firms (no labour scaling) are untouched.
  const labour = isFoundedFirm(company) ? labourFactor(company) : 1;
  const baseRevenue = market.currentPrice * company.monthlyOutputUnits * labour;
  // Larger market share = slightly steadier revenue. Centered near 1.0 so it does
  // not systematically haircut small firms below their seed margin (the 0.8 base
  // in the design doc turned thin-but-viable firms structurally loss-making).
  const stabilityFactor = 0.95 + company.marketShare * 0.1;

  let eventImpact = 1.0;
  for (const event of events) {
    if (event.affectedIndustries.includes(company.industry)) {
      eventImpact -= event.severity * 0.35;
    }
  }

  // Crowding bites only the founded cohort (P19.5); seed firms keep factor 1, so their
  // revenue is byte-identical to pre-P19.5. A founded firm is haircut by each *other*
  // founded firm in its cell.
  const competition = isFoundedFirm(company)
    ? competitionFactor(Math.max(0, foundedRivalsInCell(companies, company.industry, company.parish) - 1))
    : 1;

  return baseRevenue * stabilityFactor * Math.max(eventImpact, 0.1) * competition;
}

// Pure: status from the loss streak only. Cascades run in applyClosureCascade.
export function checkCompanySolvency(consecutiveLossMonths: number): {
  status: CompanyStatus;
} {
  if (consecutiveLossMonths >= 6) return { status: 'CLOSED' };
  if (consecutiveLossMonths >= 3) return { status: 'DISTRESSED' };
  return { status: 'HEALTHY' };
}

// ── NPC firm formation (P19.5, P-B1) ─────────────────────────────────────────
// The size and economics of the small sole-trader an NPC stands up when the decision
// engine judges founding a firm worthwhile. Price-relative: the same target revenue
// buys a big pile of cheap fish or a handful of guesthouse nights, so a firm's output
// scales to its good (mirroring partnershipOutputUnits and the seed companies). Kept
// thin-margined on purpose — a fresh sole trader is the firm a crowded cell or a price
// dip tips into the red, so deaths keep pace with births (P19.5 acceptance).
const NEW_FIRM_TARGET_REVENUE = 4500; // EC$/month gross at the current price
const NEW_FIRM_COST_RATIO = 0.7; // operating costs as a share of target revenue
const NEW_FIRM_ENTRY_MONTHS = 2; // entry capital ≈ this many months of operating cost
// A sole trader's take is the firm's take, never less than a bare informal-trade floor;
// the owner's stored monthly income is seeded from this at founding.
const NEW_FIRM_OWNER_INCOME_FLOOR = 700;

// Fixed across industries (they depend only on the target, not the good), so the
// caller can gate on affordability with one cheap comparison before scanning markets.
export const NEW_FIRM_OPERATING_COSTS = Math.round(NEW_FIRM_TARGET_REVENUE * NEW_FIRM_COST_RATIO);
export const NEW_FIRM_ENTRY_COST = Math.round(NEW_FIRM_OPERATING_COSTS * NEW_FIRM_ENTRY_MONTHS);

// The industries an NPC can found a firm in (those with a representative market good —
// INFORMAL_TRADE and FINANCE have none, so they are absorbed by self-employment, not
// firm formation).
export const FOUNDABLE_INDUSTRIES: Industry[] = INDUSTRIES.filter(
  (i) => REPRESENTATIVE_GOOD[i] != null,
);

export interface FirmEconomics {
  outputUnits: number;
  baseOperatingCosts: number;
  entryCost: number;
  expectedMonthlyProfit: number; // at the current price, after the crowding it would face
}

// What an NPC could expect from founding a small firm in this industry×parish right
// now — pure and deterministic (no rng), so it drives the decision without disturbing
// the seed (S2). A high current price in an uncrowded cell reads as a fat opportunity;
// a saturated or depressed one reads as a loss the loss-averse will refuse.
//
// `rivalPerception` scales how much of the existing crowd the founder actually reckons
// with: 1 is clear-eyed, below 1 is the entrepreneur's optimism — "I'll do better than
// the others already here" (C7/A6). That optimism is what keeps cells churning: founders
// crowd in past the truly sustainable count, the real P&L (which sees every rival) tips
// the cell into the red, the marginal firms fail and reopen the cell to the next hopeful.
export function newFirmEconomics(
  world: Pick<WorldState, 'markets' | 'goods' | 'companies'>,
  industry: Industry,
  parish: string,
  rivalPerception = 1,
): FirmEconomics {
  const goodId = REPRESENTATIVE_GOOD[industry];
  const good = goodId ? world.goods.find((g) => g.id === goodId) : undefined;
  const basePrice = good?.basePrice ?? 1;
  const market = world.markets.find((m) => m.goodId === goodId && m.parish === parish);
  const price = market?.currentPrice ?? basePrice;

  // Size the firm to the *current* price so it targets the same modest revenue whatever
  // the price level has drifted to — its fortunes then ride price *moves* after founding
  // (a slump kills it, a boom is a windfall), not the absolute level. Output is fixed at
  // founding; revenue below floats with the live price.
  const outputUnits = Math.max(1, Math.round(NEW_FIRM_TARGET_REVENUE / price));
  // The new entrant would compete against the founded cohort already in the cell — as
  // many of them as their optimism lets them see.
  const rivals = foundedRivalsInCell(world.companies, industry, parish) * rivalPerception;
  const revenue = price * outputUnits * competitionFactor(rivals);
  return {
    outputUnits,
    baseOperatingCosts: NEW_FIRM_OPERATING_COSTS,
    entryCost: NEW_FIRM_ENTRY_COST,
    expectedMonthlyProfit: revenue - NEW_FIRM_OPERATING_COSTS,
  };
}

// Stand up the firm: a sole trader owned and run by the agent, funded out of their
// cash. Mutates the agent (now working their own firm) and the world, and returns the
// new company. Pure of rng — the birth is reproducible per seed (S2). The caller has
// already decided it is worthwhile and that the agent can pay the entry cost.
export function formCompany(agent: NPCAgent, world: WorldState, industry: Industry): Company {
  const econ = newFirmEconomics(world, industry, agent.parish);
  const wasFirst = !world.companies.some(
    (c) => c.status !== 'CLOSED' && c.industry === industry && c.parish === agent.parish,
  );
  const company: Company = {
    id: `CO_${agent.id}_M${world.month}`,
    name: `${agent.name.split(' ')[0]}'s ${industry.toLowerCase()} venture`,
    industry,
    type: 'SOLE_TRADER',
    parish: agent.parish,
    ownerId: agent.id,
    marketShare: 0.01,
    monthlyOutputUnits: econ.outputUnits,
    employees: [],
    loans: [],
    baseOperatingCosts: econ.baseOperatingCosts,
    monthlyRevenue: 0,
    profit: 0,
    consecutiveLossMonths: 0,
    status: 'HEALTHY',
    isSolvent: true,
    estimatedAnnualTax: NEW_FIRM_TARGET_REVENUE * 12 * 0.1,
    // Capitalized with the founder's entry cost — the money leaving the agent below
    // is the firm's opening working capital, so the founding is cash-conserving.
    cash: econ.entryCost,
  };

  agent.cash = Math.max(0, agent.cash - econ.entryCost);
  agent.employmentStatus = 'EMPLOYED';
  agent.employer = company;
  agent.occupation = industry;
  // A sole trader's take is what the firm clears (the honest current-crowd estimate),
  // floored so a lean start is not destitution.
  agent.monthlyIncome = Math.max(NEW_FIRM_OWNER_INCOME_FLOOR, Math.round(econ.expectedMonthlyProfit));
  company.employees.push(agent);
  agent.businessesStarted.push({ industry, wasFirstInIndustryInParish: wasFirst });

  world.companies.push(company);
  return company;
}

// Lay an employee off a founded firm: they leave the roster and rejoin the unemployed.
// Never called on the owner — a sole trader without their own labour is a closure, not
// a layoff. Mutates the agent and the firm's roster in place.
function layOff(company: Company, employee: NPCAgent): void {
  company.employees = company.employees.filter((e) => e !== employee);
  employee.employmentStatus = 'UNEMPLOYED';
  employee.employer = null;
  employee.monthlyIncome = 0;
}

// Reconcile a founded firm's labour against its cash for the month (P19.6). The month's
// surplus has already flowed into `company.cash` by the caller. Hired hands are the
// first claim — each paid their wage out of cash if the firm can cover it, else laid
// off (a firm that cannot make payroll sheds the hand rather than paying with money it
// does not have). The owner is the residual claimant, drawing whatever is left above a
// thin working-capital reserve, capped so a good month builds the firm. The wage/draw
// set here is exactly what the agent banks in Phase 5, so cash out of the firm equals
// pay into its people — wages reconcile against firm cash. Seed firms are untouched
// (their established-economy payroll stays the Phase-1 flat model — Phase 20's remit).
export function runFoundedPayroll(company: Company): void {
  if (!isFoundedFirm(company) || company.status === 'CLOSED') return;

  // Pay the hired hands first, oldest contract to newest; a hand the firm cannot
  // cover this month is let go.
  for (const emp of company.employees.filter((e) => e.id !== company.ownerId)) {
    if (company.cash >= emp.monthlyIncome) {
      company.cash -= emp.monthlyIncome;
    } else {
      layOff(company, emp);
    }
  }

  // The owner draws the residual above a reserve, within a cap.
  const owner = company.employees.find((e) => e.id === company.ownerId);
  if (owner) {
    const reserve = company.baseOperatingCosts * OWNER_DRAW_RESERVE_MONTHS;
    const draw = Math.max(0, Math.min(company.cash - reserve, OWNER_DRAW_CAP));
    owner.monthlyIncome = Math.round(draw);
    company.cash -= draw;
  }
}

// The founded-firm labour market (P19.6): firms hire and fire on their own P&L, so
// unemployment moves with firm fortunes rather than a flat constant. A HEALTHY firm
// that cleared comfortably more than a wage this month and holds a cash buffer takes
// on a local unemployed agent (output, and so revenue, then scales up with the hand).
// A DISTRESSED firm sheds its newest hand to cut its wage bill. A boom lifts prices →
// revenue → firms hire → unemployment falls; a bust does the reverse. Every draw goes
// through world.rng, so it stays reproducible per seed (S2). Mutates the world in place.
export function runFoundedLabour(world: WorldState): void {
  for (const company of world.companies) {
    if (!isFoundedFirm(company) || company.status === 'CLOSED') continue;
    // Only NPC sole traders run this market — a player-owned partnership firm (also a
    // CO_ id) manages its own roster through the player's choices, not the engine.
    if (company.ownerId === world.player.id) continue;

    if (
      company.status === 'HEALTHY' &&
      company.profit > HIRE_MIN_PROFIT &&
      company.cash >= HIRE_CASH_MONTHS * HIRED_WAGE_MAX &&
      hiredHandCount(company) < FOUNDED_MAX_HANDS
    ) {
      const candidates = world.agents.filter(
        (a) =>
          !a.isPlayer &&
          a.employmentStatus === 'UNEMPLOYED' &&
          a.parish === company.parish,
      );
      if (candidates.length > 0) {
        const hire = world.rng.pick(candidates);
        hire.employmentStatus = 'EMPLOYED';
        hire.employer = company;
        hire.occupation = company.industry;
        hire.monthlyIncome = Math.round(world.rng.range(HIRED_WAGE_MIN, HIRED_WAGE_MAX));
        company.employees.push(hire);
      }
    } else if (company.status === 'DISTRESSED') {
      // Shed the most recently taken-on hand (never the owner).
      const hands = company.employees.filter((e) => e.id !== company.ownerId);
      const newest = hands.at(-1);
      if (newest) layOff(company, newest);
    }
  }
}

// Runs once on the transition into CLOSED, acting on live world entities.
export function applyClosureCascade(company: Company, world: WorldState): void {
  // 1. Employees become unemployed (live agents -> Phase 8 counts them).
  for (const emp of company.employees) {
    emp.employmentStatus = 'UNEMPLOYED';
    emp.monthlyIncome = 0;
    emp.employer = null;
  }
  company.employees = [];

  // 2. Loans default. Do not touch bank NPL here — Phase 7 recomputes it.
  for (const loan of company.loans) loan.status = 'DEFAULT';

  // 4. Tax handled by Phase 8 (closed company drops out of computeTaxRevenue).

  // 5. Parish property values soften slightly.
  const parish = world.parishes.find((p) => p.id === company.parish);
  if (parish) parish.propertyValueIndex *= 0.98;
}
