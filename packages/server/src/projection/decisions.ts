import { buildDecisionSituation } from '@island/narrative';
import type { DecisionDTO, Opportunity, PlayerDecision, WorldState } from '@island/shared';

// GET /saves/:id/decisions/:did — the decision interface. The situation is a
// narrative moment; the options are unlabelled prose. The hidden option `effect`
// (incomeMode / standingAmount) is stripped here — the player reads a real choice,
// never an expected value (P6.2, the iceberg boundary).

function findDecision(world: WorldState, decisionId: string): PlayerDecision | undefined {
  return world.decisions.find((d) => d.id === decisionId);
}

function opportunityFor(world: WorldState, decision: PlayerDecision): Opportunity | undefined {
  return world.opportunities.find((o) => o.id === decision.opportunityId);
}

function titleFor(decision: PlayerDecision, opp: Opportunity | undefined): string {
  if (decision.kind === 'EUNICE_SUPPLY_CONTRACT') {
    return `${opp?.npcName ?? 'Eunice'}'s offer`;
  }
  return 'A decision';
}

export function toDecisionDTO(world: WorldState, decisionId: string): DecisionDTO | null {
  const decision = findDecision(world, decisionId);
  if (!decision) return null;
  const opp = opportunityFor(world, decision);

  const expired = opp?.status === 'EXPIRED';
  const status: DecisionDTO['status'] =
    decision.chosenOptionId !== null ? 'RESOLVED' : expired ? 'EXPIRED' : 'OPEN';

  const monthsLeft = opp ? opp.surfacedMonth + opp.windowMonths - world.month : 0;
  const window = expired
    ? 'The moment has passed.'
    : monthsLeft <= 1
      ? 'She needs an answer this month.'
      : 'She is waiting on your word, but not forever.';

  return {
    id: decision.id,
    title: titleFor(decision, opp),
    situation: buildDecisionSituation(world, decision),
    options: decision.options.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.description,
    })),
    status,
    window,
    chosenOptionId: decision.chosenOptionId,
  };
}
