import type { LegacyScore, NPCAgent, WorldState } from '@island/shared';

export function netWorthOf(agent: NPCAgent): number {
  const assets = agent.economicAssets.reduce((s, a) => s + a.value, 0);
  // Phase 8: venture-owned assets count too. Undefined `ventures` → 0 (unchanged).
  const ventureAssets = (agent.ventures ?? [])
    .filter((v) => v.status === 'ACTIVE')
    .reduce((s, v) => s + v.assets.reduce((t, a) => t + a.value, 0), 0);
  const debt = agent.loans.reduce((s, l) => s + l.remainingPrincipal, 0);
  return agent.cash + assets + ventureAssets - debt;
}

// Accrues each month, hidden until death (Player Experience doc).
export function computeLegacyIncrement(player: NPCAgent, world: WorldState): LegacyScore {
  const prev = world.playerLegacy;
  const netWorth = netWorthOf(player);
  const wealthDelta = (netWorth - prev.lastNetWorth) / 1000;

  const jobsCreated = world.companies
    .filter((c) => c.ownerId === player.id)
    .reduce((s, c) => s + c.employees.length, 0);
  const communityDelta = jobsCreated * 0.001;

  const reputationDelta =
    player.agreeableness * 0.002 + player.keptPromises * 0.003 - player.brokenContracts * 0.005;

  return {
    wealthScore: prev.wealthScore + wealthDelta,
    familyScore: prev.familyScore,
    communityScore: prev.communityScore + communityDelta,
    innovationScore: prev.innovationScore,
    environmentScore: prev.environmentScore,
    reputationScore: prev.reputationScore + reputationDelta,
    lastNetWorth: netWorth,
  };
}
