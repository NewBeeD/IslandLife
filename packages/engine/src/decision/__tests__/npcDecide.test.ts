import { describe, expect, it } from 'vitest';
import { buildWorld } from '../../worldBuild';
import { npcDecide } from '../../agents';

// npcDecide routes through the prospect-theory engine (P19.1) and, since P19.5, can
// also choose START_BUSINESS. Founding is selective — the heavy loss-averse weight on
// the up-front entry cost means a fresh world at month 0 (prices at base, agents
// undifferentiated) holds no opportunity fat enough to clear the bar, so the
// pre-P19.5 realized choices still stand here. The macro firm-formation dynamics live
// in firmFormation.test.ts.
describe('npcDecide through the engine (P19.1/P19.5)', () => {
  it('at month 0 the unemployed seek work and the employed hold (founding stays selective)', () => {
    const world = buildWorld(42, { population: 200 });
    for (const agent of world.agents) {
      if (agent.isPlayer) continue;
      const action = npcDecide(agent, world);
      if (agent.employmentStatus === 'UNEMPLOYED') {
        expect(action.type).toBe('SEEK_EMPLOYMENT');
      } else {
        expect(action.type).toBe('SAVE');
      }
    }
  });

  it('a penniless unemployed agent still chooses SEEK when hiring odds collapse', () => {
    const world = buildWorld(7, { population: 200 });
    // Force the hiring odds to zero — SEEK must still win the tie over SAVE. The agent
    // is left broke so START_BUSINESS is not even a candidate (the affordability gate),
    // pinning the determinism anchor regardless of how formation is tuned.
    world.government.unemploymentRate = 1;
    const agent = world.agents.find((a) => !a.isPlayer)!;
    agent.employmentStatus = 'UNEMPLOYED';
    agent.cash = 0;
    expect(npcDecide(agent, world).type).toBe('SEEK_EMPLOYMENT');
  });
});
