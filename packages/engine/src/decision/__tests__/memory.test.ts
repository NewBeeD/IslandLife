import { describe, expect, it } from 'vitest';
import type { AgentObservation, NPCAgent } from '@island/shared';
import { learnedBias, recordObservation, MEMORY_CAPACITY } from '../memory';
import { chooseBest, type ActionCandidate } from '../prospect';
import { buildWorld, deserializeWorld, serializeWorld } from '../../index';

const makeAgent = (): Pick<NPCAgent, 'observations'> => ({});
const obs = (tag: AgentObservation['tag'], outcome: number, month: number): AgentObservation => ({
  tag,
  outcome,
  month,
});

describe('observation memory & learning (C10/A15, P19.3)', () => {
  it('is a fixed-size ring that drops the oldest', () => {
    const agent = makeAgent();
    for (let m = 0; m < MEMORY_CAPACITY + 4; m++) recordObservation(agent, obs('EXPAND', 1, m));
    expect(agent.observations).toHaveLength(MEMORY_CAPACITY);
    // The earliest months fell off the front; the most recent survive.
    expect(agent.observations![0]!.month).toBe(4);
    expect(agent.observations!.at(-1)!.month).toBe(MEMORY_CAPACITY + 3);
  });

  it('no relevant memory is neutral', () => {
    expect(learnedBias(makeAgent(), 'EXPAND', 5)).toBe(1);
    const agent = makeAgent();
    recordObservation(agent, obs('EXPAND', 0.8, 1));
    expect(learnedBias(agent, 'BORROW', 5)).toBe(1); // different tag, no memory
    expect(learnedBias(agent, 'NOT_A_TAG', 5)).toBe(1);
  });

  it('repeats a winning move and drops a losing one', () => {
    const winner = makeAgent();
    for (let m = 0; m < 4; m++) recordObservation(winner, obs('EXPAND', 0.8, m));
    expect(learnedBias(winner, 'EXPAND', 4)).toBeGreaterThan(1);

    const loser = makeAgent();
    for (let m = 0; m < 4; m++) recordObservation(loser, obs('COMPETE', -0.8, m));
    expect(learnedBias(loser, 'COMPETE', 4)).toBeLessThan(1);
  });

  it('losing on price shifts the agent toward differentiation', () => {
    const agent = makeAgent();
    for (let m = 0; m < 4; m++) recordObservation(agent, obs('COMPETE', -0.8, m));
    // Price competition is punished AND the freed preference flows to quality/premium.
    expect(learnedBias(agent, 'COMPETE', 4)).toBeLessThan(1);
    expect(learnedBias(agent, 'BRAND', 4)).toBeGreaterThan(1);
    expect(learnedBias(agent, 'INNOVATE', 4)).toBeGreaterThan(1);
  });

  it('recency: a fresh result outweighs stale ones', () => {
    const agent = makeAgent();
    // Old failures, then recent successes.
    for (let m = 0; m < 3; m++) recordObservation(agent, obs('EXPAND', -0.9, m));
    for (let m = 8; m < 11; m++) recordObservation(agent, obs('EXPAND', 0.9, m));
    expect(learnedBias(agent, 'EXPAND', 11)).toBeGreaterThan(1);
  });

  it('the adaptation is visible in the chosen action (a player who undercuts trains rivals)', () => {
    // A rival faces the same choice: keep matching on price (COMPETE) or differentiate
    // (BRAND). The two options are mechanically identical, so before any memory the
    // rival keeps competing (the first-listed tie-break). After repeatedly being
    // undercut and losing on price, the rival stops matching and differentiates.
    const traits = { lossAversion: 0.5, riskTolerance: 0.5, patience: 0.5 };
    const COMPETE: ActionCandidate = {
      type: 'COMPETE',
      outcomes: [{ probability: 0.6, payoff: 300, delayMonths: 0 }],
    };
    const BRAND: ActionCandidate = {
      type: 'BRAND',
      outcomes: [{ probability: 0.6, payoff: 300, delayMonths: 0 }],
    };
    const rival: Pick<NPCAgent, 'observations'> = {};
    const bias = (c: ActionCandidate) => learnedBias(rival, c.type, 6);

    // Before: identical options, COMPETE wins the tie (listed first).
    expect(chooseBest({ ...traits, ...rival }, [COMPETE, BRAND], bias)?.type).toBe('COMPETE');

    // The player keeps undercutting; the rival loses on price month after month.
    for (let m = 0; m < 5; m++) recordObservation(rival, obs('COMPETE', -0.7, m));

    // After: the rival differentiates instead of matching price.
    expect(chooseBest({ ...traits, ...rival }, [COMPETE, BRAND], bias)?.type).toBe('BRAND');
  });

  it('is deterministic: identical memory yields an identical tilt', () => {
    const a = makeAgent();
    const b = makeAgent();
    for (let m = 0; m < 5; m++) {
      recordObservation(a, obs('EXPAND', 0.4, m));
      recordObservation(b, obs('EXPAND', 0.4, m));
    }
    expect(learnedBias(a, 'EXPAND', 5)).toBe(learnedBias(b, 'EXPAND', 5));
  });

  it('the memory ring serializes with the agent', () => {
    const world = buildWorld(42, { population: 60 });
    recordObservation(world.player, obs('EXPAND', 0.6, 0));
    recordObservation(world.player, obs('COMPETE', -0.5, 1));
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(world))));
    expect(back.player.observations).toEqual(world.player.observations);
  });
});
