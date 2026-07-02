import { describe, expect, it } from 'vitest';
import { FULL_TIME_LOAD } from '@island/shared';
import type { DemandSpec, Opportunity, PlayerDecision, Venture, WorldState } from '@island/shared';
import {
  DecisionError,
  applyDemandOutcome,
  attentionPressure,
  buildWorld,
  canHandleDemand,
  committedAttention,
  freeAttention,
  openDemands,
  resolveDecision,
  resolveUnattendedDemands,
  simulateOneMonth,
  surfaceDemands,
  worldDigest,
} from '../index';

// A self-employed player with a hands-on venture, away from the Eunice trigger, past the
// month demands start (P26). `timeLoad` controls how much of the attention budget the
// running venture already spends.
function ventureWorld(seed: number, timeLoad = FULL_TIME_LOAD): WorldState {
  const world = buildWorld(seed, { population: 60 });
  const p = world.player;
  p.occupation = null;
  p.employmentStatus = 'SELF_EMPLOYED';
  p.parish = 'SAINT_JOHN';
  p.socialCapitalLocal = 0.1;
  p.cash = 40000;
  p.monthlyIncome = 4000;
  p.ventures = [
    {
      id: 'V_SHOP',
      industry: 'RETAIL',
      label: 'the shop',
      incomeMode: 'SPOT',
      spotBaseIncome: 2500,
      standingContract: null,
      outputScale: 1,
      monthlyOperatingCosts: 300,
      assets: [],
      status: 'ACTIVE',
      barrierTier: 'MEDIUM',
      timeLoad,
      operatedBy: 'PLAYER',
    },
  ];
  world.month = 6;
  return world;
}

// Hand-build a MANAGEMENT_DEMAND opportunity + decision on the world, so the mechanics
// tests do not depend on the random surfacing roll.
function pushDemand(world: WorldState, demand: DemandSpec): { opp: Opportunity; dec: PlayerDecision } {
  const opp: Opportunity = {
    id: `OPP_${demand.id}`,
    kind: 'MANAGEMENT_DEMAND',
    industry: demand.industry,
    npcName: 'the matter at hand',
    channelId: 'ON_YOUR_PLATE',
    surfacedMonth: world.month,
    windowMonths: 2,
    status: 'OPEN',
    decisionId: `DDEC_${demand.id}`,
    monthlyAmount: 0,
    demand,
  };
  const dec: PlayerDecision = {
    id: `DDEC_${demand.id}`,
    opportunityId: opp.id,
    kind: 'MANAGEMENT_DEMAND',
    surfacedMonth: world.month,
    windowMonths: 2,
    options: [
      { id: 'HANDLE', label: 'Handle it', description: '…', effect: { demandAction: 'HANDLE' } },
      { id: 'LET_GO', label: 'Let it go', description: '…', effect: { demandAction: 'LET_GO' } },
    ],
    chosenOptionId: null,
    resolvedMonth: null,
    consequenceMonth: null,
    consequenceDelivered: false,
  };
  world.opportunities.push(opp);
  world.decisions.push(dec);
  return { opp, dec };
}

describe('P26.1 — the attention budget', () => {
  it('running a venture hands-on spends part of the budget; a hired operator none', () => {
    const world = ventureWorld(11, FULL_TIME_LOAD);
    // One full-time hands-on venture: half the budget is management, half is free.
    expect(committedAttention(world)).toBeCloseTo(0.5, 6);
    expect(freeAttention(world)).toBeCloseTo(0.5, 6);
    // Hire an operator and the venture goes passive — the mind is freed too.
    world.player.ventures![0]!.operatedBy = 'OPERATOR';
    expect(committedAttention(world)).toBe(0);
    expect(freeAttention(world)).toBe(1);
  });

  it('refuses to HANDLE a matter when the budget is already full', () => {
    // Two full-time hands-on ventures leave no attention to firefight with.
    const world = ventureWorld(12, FULL_TIME_LOAD);
    world.player.ventures!.push({ ...world.player.ventures![0]!, id: 'V_SHOP2' } as Venture);
    expect(freeAttention(world)).toBe(0);
    const { dec } = pushDemand(world, {
      id: 'DEM_X',
      kind: 'SUPPLIER_SHORTAGE',
      industry: 'RETAIL',
      severity: 0.5,
      attentionCost: 0.3,
      handleCashCost: 500,
      ignoreCashPenalty: 1200,
      ventureId: 'V_SHOP',
    });
    expect(() => resolveDecision(world, dec.id, 'HANDLE')).toThrow(DecisionError);
    // The decision is rolled back — still open to let go instead.
    expect(dec.chosenOptionId).toBeNull();
    // Letting it go is always allowed (it costs no attention).
    resolveDecision(world, dec.id, 'LET_GO');
    expect(dec.chosenOptionId).toBe('LET_GO');
  });

  it('handling a matter draws down the budget so a second competes against it', () => {
    const world = ventureWorld(13, 0); // no standing commitment → full budget free
    const d1 = pushDemand(world, {
      id: 'DEM_A', kind: 'SUPPLIER_SHORTAGE', industry: 'RETAIL', severity: 0.5,
      attentionCost: 0.6, handleCashCost: 100, ventureId: 'V_SHOP',
    });
    const d2 = pushDemand(world, {
      id: 'DEM_B', kind: 'LABOUR_TROUBLE', industry: 'RETAIL', severity: 0.5,
      attentionCost: 0.6, handleCashCost: 100, ventureId: 'V_SHOP',
    });
    resolveDecision(world, d1.dec.id, 'HANDLE');
    // The first drew 0.6 of the budget; only 0.4 is left, so the second cannot be handled.
    expect(freeAttention(world)).toBeCloseTo(0.4, 6);
    expect(() => resolveDecision(world, d2.dec.id, 'HANDLE')).toThrow(DecisionError);
  });
});

describe('P26 — a matter left unattended resolves on its default (S8)', () => {
  it('applies the default outcome, lapses, notifies, and never re-applies', () => {
    const world = ventureWorld(14, 0);
    const cashBefore = world.player.cash;
    const { opp } = pushDemand(world, {
      id: 'DEM_S', kind: 'SUPPLIER_SHORTAGE', industry: 'RETAIL', severity: 0.6,
      attentionCost: 0.25, ignoreCashPenalty: 1500, ignoreDemandFloor: 0.8, ventureId: 'V_SHOP',
    });
    // Before the window closes, nothing happens.
    world.month = opp.surfacedMonth + opp.windowMonths;
    resolveUnattendedDemands(world);
    expect(opp.status).toBe('OPEN');
    expect(world.player.cash).toBe(cashBefore);

    // Past the window it resolves on its default: the penalty lands, demand memory drops,
    // it lapses, and a plain notice is left.
    world.month = opp.surfacedMonth + opp.windowMonths + 1;
    resolveUnattendedDemands(world);
    expect(opp.status).toBe('EXPIRED');
    expect(world.player.cash).toBe(cashBefore - 1500);
    expect(world.player.ventures![0]!.customerReputation).toBeCloseTo(0.8, 6);
    expect(world.playerNotifications.length).toBe(1);

    // Idempotent — a second sweep does not charge the penalty again.
    const cashAfter = world.player.cash;
    world.playerNotifications = [];
    resolveUnattendedDemands(world);
    expect(world.player.cash).toBe(cashAfter);
    expect(world.playerNotifications.length).toBe(0);
  });
});

describe('P26.2 — demand outcomes', () => {
  it('a handled acquisition pays out and hands the venture over', () => {
    const world = ventureWorld(15, 0);
    const cashBefore = world.player.cash;
    const demand: DemandSpec = {
      id: 'DEM_ACQ', kind: 'ACQUISITION', industry: 'RETAIL', severity: 0.5,
      attentionCost: 0.2, acquisitionOffer: 30000, ventureId: 'V_SHOP',
    };
    applyDemandOutcome(world, demand, true);
    expect(world.player.cash).toBe(cashBefore + 30000);
    expect(world.player.ventures![0]!.status).toBe('CLOSED');
  });

  it('a fumbled launch sheds output; a tended one gains it', () => {
    const tended = ventureWorld(16, 0);
    const fumbled = ventureWorld(16, 0);
    const spec = (): DemandSpec => ({
      id: 'DEM_L', kind: 'LAUNCH', industry: 'RETAIL', severity: 0.5,
      attentionCost: 0.3, handleOutputDelta: 0.15, ignoreOutputDelta: -0.1, ignoreDemandFloor: 0.8,
      ventureId: 'V_SHOP',
    });
    applyDemandOutcome(tended, spec(), true);
    applyDemandOutcome(fumbled, spec(), false);
    expect(tended.player.ventures![0]!.outputScale).toBeCloseTo(1.15, 6);
    expect(fumbled.player.ventures![0]!.outputScale).toBeCloseTo(0.9, 6);
  });
});

describe('P26 — surfacing is deterministic and off the world.rng stream', () => {
  it('surfacing never disturbs the seed stream or the world digest', () => {
    const withDemands = buildWorld(77, { population: 150 });
    const control = buildWorld(77, { population: 150 });
    for (let i = 0; i < 18; i++) {
      simulateOneMonth(withDemands);
      surfaceDemands(withDemands); // the extra Phase-26 pass
      simulateOneMonth(control);
    }
    // world.rng is untouched by demand surfacing (it rolls its own side-stream).
    expect(withDemands.rng.serialize()).toEqual(control.rng.serialize());
    expect(worldDigest(withDemands)).toBe(worldDigest(control));
  });

  it('the same seed surfaces the same matters, and matters do arise over a long run', () => {
    const run = (seed: number): string[] => {
      const world = ventureWorld(seed, 0.4);
      const ids: string[] = [];
      for (let i = 0; i < 120; i++) {
        simulateOneMonth(world);
        for (const o of surfaceDemands(world)) ids.push(`${world.month}:${o.demand!.kind}`);
        resolveUnattendedDemands(world); // let open matters lapse so new ones can arise
      }
      return ids;
    };
    const a = run(5);
    const b = run(5);
    expect(a).toEqual(b); // reproducible per seed
    // Across a spread of seeds, matters genuinely arise (the mechanic is live).
    const total = [3, 5, 9, 21, 42].reduce((s, seed) => s + run(seed).length, 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe('P26.1 — attention pressure reads the plate', () => {
  it('rises from light to overwhelmed as matters stack up', () => {
    const world = ventureWorld(18, 0.4); // committed 0.2
    expect(attentionPressure(world)).toBe('LIGHT');
    pushDemand(world, {
      id: 'DEM_1', kind: 'SUPPLIER_SHORTAGE', industry: 'RETAIL', severity: 0.5,
      attentionCost: 0.3, ventureId: 'V_SHOP',
    });
    expect(openDemands(world).length).toBe(1);
    // Pile on enough attention-hungry matters to exceed the budget.
    pushDemand(world, { id: 'DEM_2', kind: 'LABOUR_TROUBLE', industry: 'RETAIL', severity: 0.9, attentionCost: 0.5, ventureId: 'V_SHOP' });
    pushDemand(world, { id: 'DEM_3', kind: 'PRICE_WAR', industry: 'RETAIL', severity: 0.9, attentionCost: 0.5, ventureId: 'V_SHOP' });
    expect(attentionPressure(world)).toBe('OVERWHELMED');
  });
});
