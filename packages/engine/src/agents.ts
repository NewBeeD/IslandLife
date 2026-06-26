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

export function triggerPersonalLoanDefault(agent: NPCAgent): void {
  for (const loan of agent.loans) {
    if (loan.status === 'ACTIVE') loan.status = 'DEFAULT';
  }
}
