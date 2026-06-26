import { describe, expect, it } from 'vitest';
import {
  buildWorld,
  deserializeWorld,
  serializeWorld,
  simulateOneMonth,
  worldDigest,
} from '../index';

function world(seed: number, months: number) {
  const w = buildWorld(seed, { population: 200 });
  for (let i = 0; i < months; i++) simulateOneMonth(w);
  return w;
}

describe('world serialization', () => {
  it('round-trips to an identical world (digest equality)', () => {
    const w = world(42, 18);
    const back = deserializeWorld(serializeWorld(w));
    expect(worldDigest(back)).toBe(worldDigest(w));
  });

  it('survives a JSON stringify/parse cycle (snapshot JSONB safe)', () => {
    const w = world(7, 12);
    const json = JSON.parse(JSON.stringify(serializeWorld(w)));
    expect(worldDigest(deserializeWorld(json))).toBe(worldDigest(w));
  });

  it('re-stitches the entity-graph cycles and player identity', () => {
    const w = world(42, 12);
    const back = deserializeWorld(serializeWorld(w));

    // player is the SAME object as the agent flagged isPlayer (not a copy)
    expect(back.player.isPlayer).toBe(true);
    expect(back.agents).toContain(back.player);
    expect(back.player.id).toBe(w.player.id);

    // an employed agent's employer is a live company in this world, and that
    // company lists the agent back (bidirectional reference restored)
    const employed = back.agents.find((a) => a.employer !== null);
    if (employed) {
      const emp = employed.employer!;
      expect(back.companies).toContain(emp);
      expect(emp.employees).toContain(employed);
    }
  });

  it('preserves RNG state so a resumed world continues identically', () => {
    const a = world(99, 10);
    const b = deserializeWorld(serializeWorld(a)); // "save and resume"
    // advancing each one more month must land on the same digest
    simulateOneMonth(a);
    simulateOneMonth(b);
    expect(worldDigest(b)).toBe(worldDigest(a));
  });
});
