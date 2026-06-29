import { describe, expect, it } from 'vitest';
import { buildWorld } from '../../worldBuild';
import { npcDecide } from '../../agents';

// P19.1 routes npcDecide through the prospect-theory engine but must not change the
// realized decision: the unemployed still seek work and everyone else holds, so the
// rng draw `applyAction` makes (and therefore the world digest) is byte-identical.
describe('npcDecide behaviour preserved through the engine (P19.1)', () => {
  it('the unemployed seek work and the employed hold', () => {
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

  it('still chooses SEEK_EMPLOYMENT for the unemployed when hiring odds collapse', () => {
    const world = buildWorld(7, { population: 200 });
    // Force the hiring odds to zero — SEEK must still win the tie over SAVE so the
    // chosen action (and its rng draw) matches the old stub exactly.
    world.government.unemploymentRate = 1;
    const agent = world.agents.find((a) => !a.isPlayer)!;
    agent.employmentStatus = 'UNEMPLOYED';
    expect(npcDecide(agent, world).type).toBe('SEEK_EMPLOYMENT');
  });
});
