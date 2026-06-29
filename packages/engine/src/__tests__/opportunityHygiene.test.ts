import { describe, expect, it } from 'vitest';
import { applyUpgradeFinancing, buildWorld, surfaceOpportunities } from '../index';
import { OFFER_REOFFER_COOLDOWN_MONTHS, opportunityLogicalKey } from '@island/shared';
import type { WorldState } from '@island/shared';

// PHASE 13 — opportunity lifecycle hygiene (bug). Lapsed offers must stop piling up
// and duplicating; an enrolment the player accepted must not still read as lapsed.

// A near-broke self-employed fisher: no Eunice (low local capital), no upgrade
// (experience below the gate) — the low-barrier juice stand is essentially the only
// thing ever offered, the exact spot where duplicate "Passed" rows used to breed.
function hustler(seed = 33): WorldState {
  const world = buildWorld(seed, { population: 60 });
  const p = world.player;
  p.occupation = 'FISHING';
  p.employmentStatus = 'SELF_EMPLOYED';
  p.parish = 'SAINT_JOHN';
  p.socialCapitalLocal = 0.1;
  p.experience.fishing = 0.05;
  p.cash = 200;
  p.monthlyIncome = 800;
  world.month = 4;
  return world;
}

// A salaried lecturer with cash to spare and no fishing/Eunice trigger — only the
// education offer surfaces.
function student(seed = 51): WorldState {
  const world = buildWorld(seed, { population: 60 });
  const p = world.player;
  p.occupation = null;
  p.employmentStatus = 'EMPLOYED';
  p.employer = null;
  p.parish = 'SAINT_GEORGE';
  p.socialCapitalLocal = 0.1;
  p.monthlyIncome = 1800;
  p.cash = 20000;
  world.month = 3;
  return world;
}

// Surface month by month for `months`, never resolving anything (the playthrough
// where a player keeps letting offers lapse).
function surfaceAcross(world: WorldState, months: number): number {
  let everSurfaced = 0;
  for (let i = 0; i < months; i++) {
    everSurfaced += surfaceOpportunities(world).length;
    world.month += 1;
  }
  return everSurfaced;
}

describe('P13.1 — one live offer per (kind, target); no fresh duplicate of a lapsed offer', () => {
  it('never has two simultaneously-OPEN offers with the same logical key', () => {
    const world = hustler();
    for (let i = 0; i < 36; i++) {
      surfaceOpportunities(world);
      const openKeys = world.opportunities
        .filter((o) => o.status === 'OPEN')
        .map(opportunityLogicalKey);
      expect(new Set(openKeys).size).toBe(openKeys.length); // all distinct
      world.month += 1;
    }
  });

  it('does not re-surface the same juice stand within the re-offer cooldown of it lapsing', () => {
    const world = hustler();
    surfaceAcross(world, 36);
    const juice = world.opportunities
      .filter((o) => o.kind === 'NEW_VENTURE' && o.newVenture?.id === 'NV_JUICE')
      .sort((a, b) => a.surfacedMonth - b.surfacedMonth);
    expect(juice.length).toBeGreaterThan(0);
    // Each fresh juice stand surfaces only well after the previous one's window closed.
    for (let i = 1; i < juice.length; i++) {
      const prevClosed = juice[i - 1]!.surfacedMonth + juice[i - 1]!.windowMonths;
      expect(juice[i]!.surfacedMonth - prevClosed).toBeGreaterThanOrEqual(OFFER_REOFFER_COOLDOWN_MONTHS);
    }
  });

  it('is deterministic per seed', () => {
    const a = hustler(7);
    const b = hustler(7);
    surfaceAcross(a, 30);
    surfaceAcross(b, 30);
    expect(a.opportunities.map((o) => o.id)).toEqual(b.opportunities.map((o) => o.id));
    expect(a.opportunities.map((o) => o.status)).toEqual(b.opportunities.map((o) => o.status));
  });
});

describe('P13.3 — world.opportunities stays bounded over a long run', () => {
  it('prunes long-settled offers so the snapshot does not grow without bound', () => {
    const world = hustler();
    let max = 0;
    const everSurfaced = (() => {
      let total = 0;
      for (let i = 0; i < 80; i++) {
        total += surfaceOpportunities(world).length;
        max = Math.max(max, world.opportunities.length);
        world.month += 1;
      }
      return total;
    })();

    expect(everSurfaced).toBeGreaterThan(8); // many offers came and went over the years
    // …yet the live list never holds them all — long-settled offers are swept away.
    expect(max).toBeLessThan(everSurfaced);
    expect(max).toBeLessThanOrEqual(20);
  });

  it('a player who never sees an opportunity is left untouched (byte-identical)', () => {
    // A salaried lecturer with no cash, no trade — nothing ever surfaces, so the
    // sweep must not allocate or mutate (the no-opportunity golden master holds).
    const world = buildWorld(99, { population: 40 });
    const p = world.player;
    p.occupation = null;
    p.employmentStatus = 'EMPLOYED';
    p.employer = null;
    p.socialCapitalLocal = 0.1;
    p.cash = 0;
    world.month = 6;
    const before = world.opportunities;
    surfaceOpportunities(world);
    expect(world.opportunities).toBe(before); // same array reference — never rebuilt
    expect(world.opportunities).toHaveLength(0);
  });
});

describe('P13.4 — enrolment status is unambiguous after enrolling', () => {
  it('stands up no "go back to study" duplicate for a program just enrolled in', () => {
    const world = student();
    surfaceOpportunities(world);
    const opp = world.opportunities.find((o) => o.kind === 'EDUCATION_ENROLMENT')!;
    expect(opp).toBeDefined();
    const programId = opp.enrolment!.programId;

    applyUpgradeFinancing(world, opp.decisionId, opp.enrolment!.totalCost, 24);
    expect(opp.status).toBe('ACCEPTED');

    // Surfacing again (now enrolled) must not push a fresh OPEN/EXPIRED sibling that
    // would read "the moment has passed" for the program already under way (idea 6).
    world.month += 1;
    surfaceOpportunities(world);
    const siblings = world.opportunities.filter(
      (o) => o.kind === 'EDUCATION_ENROLMENT' && o.enrolment?.programId === programId,
    );
    expect(siblings.filter((o) => o.status === 'OPEN' || o.status === 'EXPIRED')).toHaveLength(0);
    expect(siblings.every((o) => o.status === 'ACCEPTED')).toBe(true);
  });
});
