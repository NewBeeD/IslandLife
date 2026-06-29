import { INDUSTRIES } from '@island/shared';
import type { Industry, NPCAgent, WorldState } from '@island/shared';
import { archetypeBias, chooseBest, type ActionCandidate } from './decision';

export type Action = { type: 'SEEK_EMPLOYMENT' } | { type: 'SAVE' };

// Industries that have a market good (so self-employment there can earn).
const EARNING_INDUSTRIES: Industry[] = INDUSTRIES.filter(
  (i) => i !== 'INFORMAL_TRADE' && i !== 'FINANCE',
);

// The midpoint of the informal earning band (700–1500) that `applyAction` pays a
// newly self-employed agent — the expected gain a job hunt holds out.
const EXPECTED_SELF_EMPLOYED_INCOME = 1100;

// Build the actions an agent could take this month, each framed as an outcome
// distribution against the reference of holding still (SAVE). For P19.1 the live
// engine still only *acts* on SEEK_EMPLOYMENT — richer candidates (START_BUSINESS,
// EXPAND, BORROW, EXIT) slot into this list in later prompts (P19.5) — so the
// realized set is the same two it always was, but the *choice* now flows through the
// prospect-theory engine. SEEK is listed first so it wins the tie when its hiring
// odds collapse to zero, keeping the chosen action (and the rng draw `applyAction`
// makes for it) byte-identical to the old stub.
function candidateActions(agent: NPCAgent, world: WorldState): ActionCandidate<Action>[] {
  const candidates: ActionCandidate<Action>[] = [];
  if (agent.employmentStatus === 'UNEMPLOYED') {
    // The same hiring odds `applyAction` rolls — finding work is a pure gain (income
    // this month), so for any positive odds it beats holding, exactly as before.
    const hireChance = 0.25 * (1 - world.government.unemploymentRate);
    candidates.push({
      type: 'SEEK_EMPLOYMENT',
      outcomes: [{ probability: hireChance, payoff: EXPECTED_SELF_EMPLOYED_INCOME, delayMonths: 0 }],
      meta: { type: 'SEEK_EMPLOYMENT' },
    });
  }
  candidates.push({ type: 'SAVE', outcomes: [], meta: { type: 'SAVE' } });
  return candidates;
}

// The living NPC decision: score the available actions with the prospect-theory
// engine (Kahneman & Tversky, P19.1), tilted by the agent's soft personality
// archetype (A23, P19.2), and take the best. Today the unemployed look for work and
// everyone else holds — the same outcome as the old stub, since the archetype tilt
// is a positive multiplier and SEEK (a pure gain) still beats SAVE (zero) — but the
// judgement is now trait- and character-driven, ready to weigh the richer actions
// later prompts add (where a predator will lean into expansion, a conservative into
// holding).
export function npcDecide(agent: NPCAgent, world: WorldState): Action {
  const best = chooseBest(agent, candidateActions(agent, world), (c) =>
    archetypeBias(agent, c.type),
  );
  return best?.meta ?? { type: 'SAVE' };
}

export function applyAction(agent: NPCAgent, action: Action, world: WorldState): void {
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
