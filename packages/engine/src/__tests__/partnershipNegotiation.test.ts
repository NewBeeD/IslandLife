import { describe, expect, it } from 'vitest';
import {
  buildWorld,
  initiateCrowdfund,
  negotiatePartnership,
  surfaceCrowdfund,
  surfacePartnership,
} from '../index';
import type { NPCAgent, WorldState } from '@island/shared';

// PHASE 18 — negotiable partnership terms (P18.3) and crowdfunding on demand (P18.4).

// A self-employed player with the cash to pool and exactly one well-off, controllable
// partner in their network, so surfacePartnership picks them deterministically.
function partnershipWorld(seed = 9): { world: WorldState; friend: NPCAgent } {
  const world = buildWorld(seed, { population: 60 });
  const p = world.player;
  p.occupation = 'FISHING';
  p.employmentStatus = 'SELF_EMPLOYED';
  p.parish = 'SAINT_JOHN';
  p.socialCapitalLocal = 0.1;
  p.monthlyIncome = 1500;
  p.cash = 30000;
  world.month = 6;
  const friend = world.agents.find((a) => !a.isPlayer)!;
  friend.cash = 30000;
  friend.parish = 'SAINT_JOHN';
  friend.agreeableness = 0.5;
  friend.patience = 0.5;
  p.socialNetwork = [friend.id];
  return { world, friend };
}

describe('P18.3 — counter-propose partnership terms', () => {
  it('a fair offer is accepted and the booked firm reflects the agreed split', () => {
    const { world } = partnershipWorld();
    const p = world.player;
    const opp = surfacePartnership(world)!;
    expect(opp).toBeDefined();

    // The contributions are even (fair share ≈ 50%), so offering the partner 50% lands.
    const result = negotiatePartnership(world, opp.decisionId, 50);
    expect(result.outcome).toBe('ACCEPT');
    expect(result.company).toBeDefined();

    const co = world.companies.find((c) => c.ownerId === p.id)!;
    expect(co).toBeDefined();
    expect(co.equityHolders?.[0]?.share).toBeCloseTo(0.5, 5);
  });

  it('low-balling the partner is countered, and re-proposing the counter seals it', () => {
    const { world } = partnershipWorld();
    const opp = surfacePartnership(world)!;

    // Offering the partner only 30% (when their money is worth ~50%) is too little.
    const counter = negotiatePartnership(world, opp.decisionId, 30);
    expect(counter.outcome).toBe('COUNTER');
    expect(counter.counterPartnerShare).toBeGreaterThan(30);
    // No firm formed yet — the decision is still open.
    expect(world.companies.some((c) => c.ownerId === world.player.id)).toBe(false);

    // Re-propose the partner's counter and the deal is struck.
    const sealed = negotiatePartnership(world, opp.decisionId, counter.counterPartnerShare!);
    expect(sealed.outcome).toBe('ACCEPT');
    expect(world.companies.some((c) => c.ownerId === world.player.id)).toBe(true);
  });

  it('an insulting offer is refused outright', () => {
    const { world } = partnershipWorld();
    const opp = surfacePartnership(world)!;
    const result = negotiatePartnership(world, opp.decisionId, 8);
    expect(result.outcome).toBe('DECLINE');
    expect(world.companies.some((c) => c.ownerId === world.player.id)).toBe(false);
  });

  it('a more agreeable partner accepts a split a prouder one would only counter', () => {
    // Same proposal (partner gets 30%) to two different partners.
    const agreeable = partnershipWorld();
    agreeable.friend.agreeableness = 0.95;
    agreeable.friend.patience = 0.8;
    const oppA = surfacePartnership(agreeable.world)!;
    expect(negotiatePartnership(agreeable.world, oppA.decisionId, 30).outcome).toBe('ACCEPT');

    const proud = partnershipWorld();
    proud.friend.agreeableness = 0.05;
    proud.friend.patience = 0.2;
    const oppP = surfacePartnership(proud.world)!;
    expect(negotiatePartnership(proud.world, oppP.decisionId, 30).outcome).toBe('COUNTER');
  });
});

describe('P18.4 — crowdfunding is available on demand', () => {
  function crowdfundWorld(seed = 5): WorldState {
    const world = buildWorld(seed, { population: 60 });
    const p = world.player;
    p.occupation = 'FISHING';
    p.employmentStatus = 'SELF_EMPLOYED';
    p.parish = 'SAINT_JOHN';
    p.socialCapitalLocal = 0.1;
    p.monthlyIncome = 1500;
    const friends = world.agents.filter((a) => !a.isPlayer).slice(0, 3);
    for (const f of friends) f.cash = 10000;
    p.socialNetwork = friends.map((a) => a.id);
    return world;
  }

  it('opens a round even before the passive channel would, ignoring the from-month gate', () => {
    const world = crowdfundWorld();
    world.month = 1; // below the passive from-month gate
    // The world would not surface one this early on its own.
    expect(surfaceCrowdfund(world)).toBeNull();
    // But the player can ask on demand.
    const opp = initiateCrowdfund(world);
    expect(opp).not.toBeNull();
    expect(opp!.crowdfund!.offers.length).toBeGreaterThan(0);
  });

  it('does not stack a second live round on the same venture', () => {
    const world = crowdfundWorld(8);
    world.month = 5;
    expect(initiateCrowdfund(world)).not.toBeNull();
    // A round is already open for the same target — asking again does nothing.
    expect(initiateCrowdfund(world)).toBeNull();
  });
});
