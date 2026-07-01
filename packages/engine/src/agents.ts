import { INDUSTRIES, INDUSTRY_DOMAIN } from '@island/shared';
import type { Industry, NPCAgent, WorldState } from '@island/shared';
import {
  archetypeBias,
  chooseBest,
  irrationalBias,
  learnedBias,
  marketMood,
  type ActionCandidate,
} from './decision';
import {
  FOUNDABLE_INDUSTRIES,
  NEW_FIRM_ENTRY_COST,
  foundedRivalsInCell,
  formCompany,
  newFirmEconomics,
  type FirmEconomics,
} from './company';
import { competitiveEntryDraw } from './competition';
import { supplyChainCostMultiplier } from './supply';
import { clamp } from './rng';

export type Action =
  | { type: 'SEEK_EMPLOYMENT' }
  | { type: 'SAVE' }
  | { type: 'START_BUSINESS'; industry: Industry };

// Industries that have a market good (so self-employment there can earn).
const EARNING_INDUSTRIES: Industry[] = INDUSTRIES.filter(
  (i) => i !== 'INFORMAL_TRADE' && i !== 'FINANCE',
);

// The midpoint of the informal earning band (700–1500) that `applyAction` pays a
// newly self-employed agent — the expected gain a job hunt holds out.
const EXPECTED_SELF_EMPLOYED_INCOME = 1100;

// How many months of a new firm's profit a founder projects forward when weighing it
// (the prospect engine then probability-weights and time-discounts the stream).
const PROFIT_HORIZON = 18;

// The monthly chance an agent who has *decided* to found actually takes the plunge —
// spreads entry into a steady stream rather than a one-month stampede (see applyAction).
const FOUNDING_RATE = 0.05;

// How clearly a founder reckons with the competition already in a cell when they weigh
// it (1 = clear-eyed). Below 1 is entrepreneurial optimism — they crowd in past the
// sustainable count, which is what keeps the founded cohort churning (see newFirmEconomics).
const FOUNDER_OPTIMISM = 0.5;

// ── The informal sector & labour demand (P19.6) ──────────────────────────────
// The flat "find work at 0.25" lottery was a one-way ratchet: informal self-employment
// never reversed, so unemployment drained to zero and never moved. P19.6 grounds the
// informal sector in firm fortunes. `labourDemand` reads the cycle off the firms: the
// share of active companies that are HEALTHY. In a boom firms thrive, informal work is
// plentiful and hustles hold; in a bust firms distress and close, informal work dries
// up. So unemployment now rises and falls with how firms are actually doing (their
// P&L), and the founded-firm hiring/firing in `runFoundedLabour` bites on a real pool.
export function labourDemand(world: WorldState): number {
  const active = world.companies.filter((c) => c.status !== 'CLOSED');
  if (active.length === 0) return 0.5;
  const healthy = active.filter((c) => c.status === 'HEALTHY').length;
  return healthy / active.length;
}

// The monthly chance an unemployed agent finds informal self-employment — high when
// labour demand is strong, scarce in a downturn (replaces the flat constant).
export function informalFindChance(world: WorldState): number {
  return clamp(0.3 * labourDemand(world), 0.03, 0.45);
}

// The monthly chance an informal hustle dries up and its holder falls back to
// unemployment — a small base churn, rising as demand weakens. Together with the find
// chance this gives a living, non-zero unemployment rate (~fail/(find+fail)) that
// swings with the cycle, instead of pinning at zero.
export function informalFailChance(world: WorldState): number {
  return clamp(0.02 + 0.08 * (1 - labourDemand(world)), 0.02, 0.22);
}

// Informal churn (P19.6): roll each non-player informally self-employed agent against
// the failure rate; a dried-up hustle returns them to the unemployed pool. A founded-
// firm owner or a hired hand (both EMPLOYED) is untouched — only the precarious
// informal SELF_EMPLOYED churn. Draws go through world.rng (S2). Mutates in place.
export function applyInformalChurn(world: WorldState): void {
  const failChance = informalFailChance(world);
  for (const agent of world.agents) {
    if (agent.isPlayer || agent.employmentStatus !== 'SELF_EMPLOYED') continue;
    if (world.rng.next() < failChance) {
      agent.employmentStatus = 'UNEMPLOYED';
      agent.occupation = null;
      agent.monthlyIncome = 0;
    }
  }
}

// Build the actions an agent could take this month, each framed as an outcome
// distribution against the reference of holding still (SAVE). Since P19.5 the menu can
// include START_BUSINESS — founding a small firm — alongside SEEK_EMPLOYMENT and SAVE;
// the richer EXPAND/BORROW/EXIT actions slot in here later. SEEK is listed first so it
// wins the tie when its hiring odds collapse to zero, keeping that determinism anchor.
// START_BUSINESS sits between SEEK and SAVE: its heavy up-front entry cost (a loss the
// loss-averse over-weight) means only a genuinely fat, uncrowded opportunity clears it,
// so most agents still seek or hold and founding stays a selective, earned move.
function candidateActions(agent: NPCAgent, world: WorldState): ActionCandidate<Action>[] {
  const candidates: ActionCandidate<Action>[] = [];
  if (agent.employmentStatus === 'UNEMPLOYED') {
    // The same cycle-driven odds `applyAction` rolls — finding informal work is a pure
    // gain (income this month), so for any positive odds it beats holding.
    const hireChance = informalFindChance(world);
    candidates.push({
      type: 'SEEK_EMPLOYMENT',
      outcomes: [{ probability: hireChance, payoff: EXPECTED_SELF_EMPLOYED_INCOME, delayMonths: 0 }],
      meta: { type: 'SEEK_EMPLOYMENT' },
    });
  }
  const startup = startBusinessCandidate(agent, world);
  if (startup) candidates.push(startup);
  candidates.push({ type: 'SAVE', outcomes: [], meta: { type: 'SAVE' } });
  return candidates;
}

// The START_BUSINESS option (P19.5/P-B1): an agent who can self-fund a sole trader and
// does not already own one scouts the most promising industry in their parish and
// frames founding there as a prospect — the entry cost is a certain up-front loss, the
// projected profit a delayed, uncertain gain. The prospect engine (loss aversion, risk
// attitude, patience) then decides whether it clears: a risk-tolerant agent in a fat,
// uncrowded cell founds; a loss-averse one, or one staring at a saturated cell where
// the projected profit is a loss, refuses. Returns null when the agent is ineligible
// or no foundable cell is worth offering — keeping the candidate list (and the chosen
// action) unchanged for everyone the engine should leave alone.
function startBusinessCandidate(
  agent: NPCAgent,
  world: WorldState,
): ActionCandidate<Action> | null {
  // Only the self-supporting (unemployed or informally self-employed) found firms, and
  // never a second one while their first still trades. Cheap gates first.
  if (agent.employmentStatus !== 'UNEMPLOYED' && agent.employmentStatus !== 'SELF_EMPLOYED') {
    return null;
  }
  if (agent.cash < NEW_FIRM_ENTRY_COST) return null;
  if (world.companies.some((c) => c.ownerId === agent.id && c.status !== 'CLOSED')) return null;

  // Scout the parish for the cell with the best expected margin right now — seen
  // through the founder's optimism about the crowd already there, and pulled toward a
  // cell someone is visibly cleaning up in: a proven, dominated trade draws entrants
  // muscling in (P20.4, C9 — success creates competition). The dominance draw lifts the
  // *perceived* margin; the real P&L (with the crowding they add) still decides their
  // fate, so entry keeps coming until the fat cell is competed back to ordinary.
  let best: { industry: Industry; econ: FirmEconomics; perceived: number } | null = null;
  for (const industry of FOUNDABLE_INDUSTRIES) {
    // Phase 23: the founder prices in this month's scarce-input cost for the trade, so a
    // boom's dear inputs gate expansion (a fragile chain is dearer to stand up into).
    const scarcity = supplyChainCostMultiplier(world.macro, industry);
    const econ = newFirmEconomics(world, industry, agent.parish, FOUNDER_OPTIMISM, scarcity);
    const perceived =
      econ.expectedMonthlyProfit * competitiveEntryDraw(world, industry, agent.parish);
    if (!best || perceived > best.perceived) {
      best = { industry, econ, perceived };
    }
  }
  if (!best) return null;
  const { industry, econ, perceived } = best;

  // Subjective odds the venture sticks: a capable founder in an uncrowded cell rates
  // its chances higher; inexperience and a crowd eat into them. The firm's *actual*
  // fate is the P&L sim — this is only the founder's forward guess for the decision.
  const rivals = foundedRivalsInCell(world.companies, industry, agent.parish);
  const competence =
    0.5 * agent.cognitiveAbility + 0.5 * agent.experience[INDUSTRY_DOMAIN[industry]];
  const pSuccess = clamp(0.3 + 0.45 * competence - 0.05 * rivals, 0.05, 0.85);

  return {
    type: 'START_BUSINESS',
    outcomes: [
      { probability: 1, payoff: -econ.entryCost, delayMonths: 0 },
      {
        // The perceived monthly profit — the honest current-crowd estimate, lifted by
        // the pull of a dominated cell (P20.4). Founders chase the fat trade; the real
        // P&L, seeing every rival they add, then decides who survives.
        probability: pSuccess,
        payoff: perceived * PROFIT_HORIZON,
        delayMonths: PROFIT_HORIZON / 2,
      },
    ],
    meta: { type: 'START_BUSINESS', industry },
  };
}

// ── Consumption (P19.6) ──────────────────────────────────────────────────────
// A real spending model with a declining marginal propensity to consume, replacing
// the flat "living costs + half of surplus" rule. Subsistence living costs are always
// met; on top of that a share of disposable income is spent — a large share when
// disposable income is thin (the near-subsistence consume nearly all of it) shrinking
// toward a floor as income grows (the comfortable save more). So cash still cannot
// pile up unboundedly, but the wealthy accumulate faster than the poor — an Engel /
// MPC curve rather than a flat rate. Pure and deterministic.
export const MPC_MAX = 0.85; // propensity to consume thin disposable income
export const MPC_MIN = 0.3; // floor for ample disposable income
const MPC_HALF_DISPOSABLE = 2500; // disposable income at which the MPC sits midway

export function monthlyConsumption(income: number, livingCosts: number): number {
  const disposable = Math.max(0, income - livingCosts);
  // Falls hyperbolically from MPC_MAX toward MPC_MIN as disposable income grows.
  const t = MPC_HALF_DISPOSABLE / (MPC_HALF_DISPOSABLE + disposable); // 1 → 0
  const mpc = MPC_MIN + (MPC_MAX - MPC_MIN) * t;
  return livingCosts + mpc * disposable;
}

// The living NPC decision: score the available actions with the prospect-theory
// engine (Kahneman & Tversky, P19.1), tilted by the agent's soft personality
// archetype (A23, P19.2), what their recent memory has taught them (C10/A15, P19.3),
// and the bounded irrationality of the moment — herd, panic, overconfidence, brand
// loyalty (C7/A6, P19.4) — then take the best. Today the unemployed look for work and
// everyone else holds — the same outcome as the old stub, since every tilt is a
// positive multiplier and SEEK (a pure gain, on the irrationally-neutral EARN tag)
// still beats SAVE (zero) — but the judgement is now trait-, character-, experience-,
// and mood-driven, ready to weigh the richer actions later prompts add (where a boom
// tempts over-expansion, a bust panics the anxious into cutting, and an agent burned
// on price differentiates instead).
export function npcDecide(agent: NPCAgent, world: WorldState): Action {
  const mood = marketMood(agent, world);
  const best = chooseBest(
    agent,
    candidateActions(agent, world),
    (c) =>
      archetypeBias(agent, c.type) *
      learnedBias(agent, c.type, world.month) *
      irrationalBias(agent, mood, c.type),
  );
  return best?.meta ?? { type: 'SAVE' };
}

export function applyAction(agent: NPCAgent, action: Action, world: WorldState): void {
  if (action.type === 'START_BUSINESS') {
    // Deciding a venture is worthwhile is not the same as taking the plunge this exact
    // month — courage, timing, and getting one's affairs in order spread real entry
    // out. A monthly take-the-plunge roll turns a one-off rush (every eligible agent
    // founding in year one) into a steady trickle of births, and — by leaving cells to
    // fill gradually while price dips close the marginal firms already in them — lets
    // deaths keep pace, so the firm count settles instead of exploding (P19.5). The
    // draw goes through world.rng, so it stays reproducible per seed (S2).
    if (world.rng.next() < FOUNDING_RATE) formCompany(agent, world, action.industry);
    return;
  }
  if (action.type !== 'SEEK_EMPLOYMENT') return;
  // Hiring eases when unemployment is low. The informal economy absorbs labour:
  // success means self-employment in an earning industry, not a company slot.
  const chance = 0.25 * (1 - world.government.unemploymentRate);
  if (world.rng.next() < chance) {
    agent.employmentStatus = 'SELF_EMPLOYED';
    agent.occupation = world.rng.pick(EARNING_INDUSTRIES);
    agent.monthlyIncome = world.rng.range(700, 1500);
  }
}

// Push the borrower's loans into default. With no `shortfall` (NPCs), every active
// loan defaults at once — an NPC who cannot cover this month is simply insolvent.
// With a `shortfall` (the player, after exhausting the arrears grace), default only
// as many loans as it takes to close that monthly cash gap, shedding the cheapest
// payments first. This keeps a loan the borrower *can* service from being dragged
// into default by a smaller one they cannot — so taking on one unaffordable friend
// loan no longer defaults an otherwise-affordable bank loan. Returns how many loans
// were defaulted.
export function triggerPersonalLoanDefault(agent: NPCAgent, shortfall?: number): number {
  const active = agent.loans.filter((l) => l.status === 'ACTIVE');
  if (shortfall == null) {
    for (const loan of active) loan.status = 'DEFAULT';
    return active.length;
  }
  // Selective: shed the smallest payments first until the monthly gap is relieved.
  // Ties keep their existing order, so the choice stays deterministic.
  const ordered = [...active].sort((a, b) => a.monthlyPayment - b.monthlyPayment);
  let relieved = 0;
  let defaulted = 0;
  for (const loan of ordered) {
    if (relieved >= shortfall) break;
    loan.status = 'DEFAULT';
    relieved += loan.monthlyPayment;
    defaulted += 1;
  }
  return defaulted;
}
