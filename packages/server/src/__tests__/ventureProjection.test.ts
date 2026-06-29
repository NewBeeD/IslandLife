import { describe, expect, it } from 'vitest';
import { buildWorld, surfaceOpportunities } from '@island/engine';
import type { Industry, Venture, WorldState } from '@island/shared';
import { toDecisionDTO, toMoneyDTO } from '../projection';

// PHASE 17 — the venture-realism projections. The Money view shows each venture the
// player can act on (wind down / shelve / reopen); the new-venture decision surfaces
// the time-commitment choice. Neither leaks the hidden venture mechanics (S3).

function makeVenture(over: Partial<Venture> & { id: string; industry: Industry }): Venture {
  return {
    label: over.label ?? `the ${over.industry.toLowerCase()}`,
    incomeMode: 'SPOT',
    spotBaseIncome: 0,
    standingContract: null,
    outputScale: 1,
    monthlyOperatingCosts: 0,
    assets: [],
    status: 'ACTIVE',
    ...over,
  };
}

// Hidden venture mechanics that must never cross the wire on any DTO.
const HIDDEN_VENTURE_TOKENS = [
  'successBias',
  'volatility',
  'performanceFactor',
  'timeLoad',
  'operatorShare',
  'operatedBy',
  'spotBaseIncome',
  'barrierTier',
  'outputScale',
];

function assertNoVentureLeak(label: string, dto: unknown): void {
  const json = JSON.stringify(dto);
  for (const token of HIDDEN_VENTURE_TOKENS) {
    expect(json.includes(token), `${label} leaked hidden venture token "${token}"`).toBe(false);
  }
}

describe('the money view projects the player’s ventures (Phase 17)', () => {
  it('shows active and shelved ventures with money facts, leaking no mechanics', () => {
    const world = buildWorld(31, { population: 40 });
    const p = world.player;
    p.occupation = null;
    p.employmentStatus = 'SELF_EMPLOYED';
    p.parish = 'SAINT_JOHN';
    p.ventures = [
      makeVenture({
        id: 'V_JUICE',
        industry: 'RETAIL',
        label: 'the juice stand',
        spotBaseIncome: 1200,
        barrierTier: 'LOW',
        profile: { successBias: 1, volatility: 0.1 },
        performanceFactor: 1,
      }),
      makeVenture({
        id: 'V_SHELF',
        industry: 'AGRICULTURE',
        label: 'the provision garden',
        spotBaseIncome: 900,
        monthlyOperatingCosts: 400,
        status: 'SHELVED',
      }),
    ];

    const money = toMoneyDTO(world);
    expect(money.ventures).toBeDefined();
    expect(money.ventures!.length).toBe(2);
    const shelved = money.ventures!.find((v) => v.id === 'V_SHELF')!;
    expect(shelved.status).toBe('SHELVED');
    expect(shelved.monthlyIncome).toBe(0); // no income while shelved
    const active = money.ventures!.find((v) => v.id === 'V_JUICE')!;
    expect(active.status).toBe('ACTIVE');
    expect(active.monthlyIncome).toBeGreaterThan(0);

    assertNoVentureLeak('money', money);
  });
});

describe('the new-venture decision surfaces the time-commitment choice (Phase 17)', () => {
  function jobHolder(): WorldState {
    const world = buildWorld(41, { population: 60 });
    const p = world.player;
    p.occupation = 'FINANCE';
    p.employmentStatus = 'EMPLOYED';
    p.employer = null;
    p.parish = 'SAINT_GEORGE';
    p.socialCapitalLocal = 0.1;
    p.monthlyIncome = 2000;
    p.cash = 6000;
    p.currentJob = {
      postingId: 'JOB_X',
      title: 'a steady job',
      industry: 'FINANCE',
      attachedCosts: { transport: 200, food: 150 },
    };
    world.month = 4;
    return world;
  }

  it('marks the commitment required for a full-time worker, and offers to hire', () => {
    const world = jobHolder();
    surfaceOpportunities(world);
    const opp = world.opportunities.find((o) => o.kind === 'NEW_VENTURE' && o.status === 'OPEN');
    expect(opp).toBeDefined();

    const dto = toDecisionDTO(world, opp!.decisionId);
    expect(dto).not.toBeNull();
    expect(dto!.interaction).toBe('FINANCING');
    expect(dto!.financing?.commitment).toBeDefined();
    expect(dto!.financing!.commitment!.required).toBe(true); // the day is already full
    expect(dto!.financing!.commitment!.canHire).toBe(true);

    assertNoVentureLeak('decision', dto);
  });
});
