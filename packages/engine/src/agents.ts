import { INDUSTRIES } from '@island/shared';
import type { Industry, NPCAgent, WorldState } from '@island/shared';

export type Action = { type: 'SEEK_EMPLOYMENT' } | { type: 'SAVE' };

// Industries that have a market good (so self-employment there can earn).
const EARNING_INDUSTRIES: Industry[] = INDUSTRIES.filter(
  (i) => i !== 'INFORMAL_TRADE' && i !== 'FINANCE',
);

// Simplified decision engine for the slice: the unemployed look for work, others
// hold. The full prospect-theory engine (Kahneman & Tversky) lands in a later phase.
export function npcDecide(agent: NPCAgent, _world: WorldState): Action {
  if (agent.employmentStatus === 'UNEMPLOYED') return { type: 'SEEK_EMPLOYMENT' };
  return { type: 'SAVE' };
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
