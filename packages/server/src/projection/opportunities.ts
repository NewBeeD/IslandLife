import type { OpportunitiesDTO, WorldState } from '@island/shared';

// GET /saves/:id/opportunities — only what the player has heard of, through their
// own information channels, and always unlabelled: no expectedReturn, no riskLevel,
// just prose tradeoffs. Opportunity surfacing (the information-channel filter and
// the Eunice supply contract) lands in Phase 6 (P6.1); until then the player has
// heard of nothing, which is itself the honest state of the world.
export function toOpportunitiesDTO(_world: WorldState): OpportunitiesDTO {
  return { active: [], possible: [], expired: [] };
}
