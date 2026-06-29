import { describe, expect, it } from 'vitest';
import {
  JUICE_STAND_REFERENCE_REVENUE,
  OPERATOR_SHARE,
  SHELVED_UPKEEP_FACTOR,
} from '@island/shared';
import {
  applyUpgradeFinancing,
  buildWorld,
  committedTime,
  discontinueVenture,
  freeTime,
  refreshVenturePerformance,
  reopenVenture,
  shelveVenture,
  surfaceOpportunities,
  totalOperatingCosts,
  updatePlayerIncome,
  ventureGrossIncome,
  ventureIncomeLines,
  ventureOperatingCostLines,
  ventureTimeLoad,
} from '../index';
import type { Asset, Industry, NPCAgent, Opportunity, Venture, WorldState } from '@island/shared';

// PHASE 17 — venture realism: time commitment, shared assets, the juice-stand model,
// failure/fluctuation/exit, and reachable per-venture upgrades.

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

function newVentureOf(world: WorldState): Opportunity | undefined {
  return world.opportunities.find((o) => o.kind === 'NEW_VENTURE' && o.status === 'OPEN');
}

// ── P17.1 — time budget & commitment ─────────────────────────────────────────

describe('P17.1 — a full-time job forces a real time choice for a side venture', () => {
  // A player holding a full-time job, offered a cross-domain hands-on venture.
  function jobHolder(seed = 41): { world: WorldState; opp: Opportunity } {
    const world = buildWorld(seed, { population: 60 });
    const p = world.player;
    p.occupation = 'FINANCE';
    p.employmentStatus = 'EMPLOYED';
    p.employer = null;
    p.parish = 'SAINT_GEORGE';
    p.socialCapitalLocal = 0.1; // no Eunice
    p.monthlyIncome = 2000;
    p.cash = 6000; // clears the cheaper wealth gates
    p.currentJob = {
      postingId: 'JOB_X',
      title: 'a steady job',
      industry: 'FINANCE',
      attachedCosts: { transport: 200, food: 150 },
    };
    world.month = 4;
    surfaceOpportunities(world);
    const opp = newVentureOf(world);
    expect(opp).toBeDefined();
    return { world, opp: opp! };
  }

  it('refuses to let a full-time worker silently run a hands-on venture', () => {
    const { world, opp } = jobHolder();
    const price = opp.newVenture!.entryCost;
    // No commitment given → the day is already full → it cannot be run solo.
    expect(() => applyUpgradeFinancing(world, opp.decisionId, price, opp.newVenture!.minTermMonths)).toThrow();
    expect(opp.status).toBe('OPEN'); // nothing committed
  });

  it('hiring an operator yields passive income net of the operator’s cut', () => {
    const { world, opp } = jobHolder();
    const p = world.player;
    const price = opp.newVenture!.entryCost;
    applyUpgradeFinancing(world, opp.decisionId, price, opp.newVenture!.minTermMonths, { mode: 'HIRE' });

    const hired = p.ventures!.find((v) => v.operatedBy === 'OPERATOR');
    expect(hired).toBeDefined();
    expect(hired!.status).toBe('ACTIVE');
    // A hired venture is passive — it takes none of the player's time.
    expect(ventureTimeLoad(hired!)).toBe(0);
    expect(freeTime(p)).toBe(0); // the full-time job still fills the day

    updatePlayerIncome(world); // refresh performance, then sum
    const gross = ventureGrossIncome(world, p.parish, hired!);
    expect(gross).toBeGreaterThan(0);
    const line = ventureIncomeLines(world).find((l) => l.label === hired!.label)!;
    // The operator keeps their cut; the player banks the rest.
    expect(line.amount).toBe(Math.round(gross * (1 - OPERATOR_SHARE)));
  });

  it('switching out of an existing venture frees the time to run a new one solo', () => {
    const { world, opp } = jobHolder();
    const p = world.player;
    const price = opp.newVenture!.entryCost;
    // Wind down the full-time job (carried as the base venture) to make room.
    applyUpgradeFinancing(world, opp.decisionId, price, opp.newVenture!.minTermMonths, {
      mode: 'SWITCH',
      closeVentureId: 'VEN_BASE',
    });
    const base = p.ventures!.find((v) => v.id === 'VEN_BASE')!;
    expect(base.status).toBe('CLOSED');
    const fresh = p.ventures!.find((v) => v.id !== 'VEN_BASE' && v.status === 'ACTIVE')!;
    expect(fresh.operatedBy).toBe('PLAYER'); // they run it themselves
    expect(committedTime(p)).toBeGreaterThan(0);
    expect(committedTime(p)).toBeLessThanOrEqual(1);
  });
});

// ── P17.2 — shared-asset operating costs ─────────────────────────────────────

describe('P17.2 — fuel/upkeep follows the physical asset, de-duplicated when shared', () => {
  function venturePlayer(): WorldState {
    const world = buildWorld(31, { population: 40 });
    const p = world.player;
    p.occupation = null;
    p.employmentStatus = 'SELF_EMPLOYED';
    p.socialCapitalLocal = 0.1;
    return world;
  }

  it('two ventures sharing one truck pay a single fuel line; two trucks pay two', () => {
    const world = venturePlayer();
    const p = world.player;
    const truck: Asset = { id: 'A_TRUCK', type: 'VEHICLE', value: 35000, monthlyUpkeep: 900 };
    p.ventures = [
      makeVenture({ id: 'V_BUS', industry: 'TRANSPORTATION', label: 'the minibus', assets: [truck] }),
      makeVenture({ id: 'V_HAUL', industry: 'AGRICULTURE', label: 'the hauling', assets: [truck] }),
    ];
    // One physical truck → one fuel charge, even across two ventures.
    expect(totalOperatingCosts(p)).toBe(900);
    expect(ventureOperatingCostLines(p).filter((l) => l.amount > 0).length).toBe(1);

    // A second, distinct truck → a second charge.
    p.ventures[1]!.assets = [{ id: 'A_TRUCK2', type: 'VEHICLE', value: 35000, monthlyUpkeep: 900 }];
    expect(totalOperatingCosts(p)).toBe(1800);
    expect(ventureOperatingCostLines(p).filter((l) => l.amount > 0).length).toBe(2);
  });
});

// ── P17.3 — the juice-stand model ────────────────────────────────────────────

describe('P17.3 — the juice stand swings month to month and reflects crowding', () => {
  function juicePlayer(seed: number): WorldState {
    const world = buildWorld(seed, { population: 30 });
    const p = world.player;
    p.parish = 'SAINT_JOHN';
    p.occupation = null;
    p.employmentStatus = 'SELF_EMPLOYED';
    p.ventures = [
      makeVenture({
        id: 'V_JUICE',
        industry: 'RETAIL',
        label: 'the juice stand',
        spotBaseIncome: JUICE_STAND_REFERENCE_REVENUE,
        barrierTier: 'LOW',
        production: 'JUICE_STAND',
      }),
    ];
    return world;
  }

  it('monthly takings vary, deterministically per seed', () => {
    const collect = (seed: number): number[] => {
      const world = juicePlayer(seed);
      const v = world.player.ventures![0]!;
      const out: number[] = [];
      for (let i = 0; i < 12; i++) {
        refreshVenturePerformance(world);
        out.push(ventureGrossIncome(world, world.player.parish, v));
      }
      return out;
    };
    const a = collect(5);
    const b = collect(5);
    expect(a).toEqual(b); // deterministic per seed
    expect(new Set(a).size).toBeGreaterThan(1); // it actually varies
    const mean = a.reduce((s, x) => s + x, 0) / a.length;
    expect(mean).toBeGreaterThan(300); // a realistic, non-trivial mean
  });

  it('takings thin as more sellers crowd the same trade in the parish', () => {
    const world = juicePlayer(8);
    const p = world.player;
    const v = p.ventures![0]!;
    refreshVenturePerformance(world); // fix this month's sampled sales
    const before = ventureGrossIncome(world, p.parish, v);

    const proto = world.agents.find((a) => !a.isPlayer)!;
    const crowd: NPCAgent[] = Array.from({ length: 12 }, (_, i) => ({
      ...structuredClone({ ...proto, employer: null }),
      id: `CROWD_${i}`,
      isPlayer: false,
      occupation: 'RETAIL' as Industry,
      parish: 'SAINT_JOHN' as NPCAgent['parish'],
      ventures: undefined,
    }));
    world.agents.push(...crowd);

    const after = ventureGrossIncome(world, p.parish, v); // same sampled sales, more crowding
    expect(after).toBeLessThan(before);
  });
});

// ── P17.4 — ventures fail, fluctuate, and can be exited ──────────────────────

describe('P17.4 — ventures fluctuate, and the player can shelve, reopen, or wind down', () => {
  function venturePlayer(): WorldState {
    const world = buildWorld(64, { population: 40 });
    const p = world.player;
    p.occupation = null;
    p.employmentStatus = 'SELF_EMPLOYED';
    p.parish = 'SAINT_JOHN';
    return world;
  }

  it('a poor business underperforms its base on average, with month-to-month swing', () => {
    const world = venturePlayer();
    const v = makeVenture({
      id: 'V_DUD',
      industry: 'RETAIL',
      spotBaseIncome: 1000,
      profile: { successBias: 0.5, volatility: 0.3 },
    });
    world.player.ventures = [v];
    const factors: number[] = [];
    for (let i = 0; i < 36; i++) {
      refreshVenturePerformance(world);
      factors.push(v.performanceFactor ?? 1);
    }
    expect(new Set(factors).size).toBeGreaterThan(1); // it fluctuates
    const mean = factors.reduce((s, x) => s + x, 0) / factors.length;
    expect(mean).toBeLessThan(1); // a poor business: underperforms its base
  });

  it('shelving stops income and reduces upkeep; reopening restores it; discontinuing ends it', () => {
    const world = venturePlayer();
    const p = world.player;
    p.ventures = [
      makeVenture({ id: 'V_X', industry: 'RETAIL', spotBaseIncome: 1200, monthlyOperatingCosts: 400 }),
    ];
    const v = p.ventures[0]!;

    shelveVenture(world, 'V_X');
    expect(v.status).toBe('SHELVED');
    expect(ventureGrossIncome(world, p.parish, v)).toBe(0); // no income while shelved
    expect(ventureOperatingCostLines(p)[0]!.amount).toBe(Math.round(400 * SHELVED_UPKEEP_FACTOR));

    reopenVenture(world, 'V_X');
    expect(v.status).toBe('ACTIVE');
    expect(ventureGrossIncome(world, p.parish, v)).toBeGreaterThan(0);

    discontinueVenture(world, 'V_X');
    expect(v.status).toBe('CLOSED');
    expect(ventureOperatingCostLines(p).length).toBe(0); // a closed venture costs nothing
  });
});

// ── P17.5 — an established venture is reachable for its own upgrade ───────────

describe('P17.5 — any active venture can grow, not only the first in line', () => {
  it('offers a later venture its next-stage upgrade when the first is on cooldown', () => {
    const world = buildWorld(72, { population: 40 });
    const p = world.player;
    p.occupation = null;
    p.employmentStatus = 'SELF_EMPLOYED';
    p.parish = 'SAINT_JOHN';
    p.socialCapitalLocal = 0.1; // no Eunice
    p.cash = 5000;
    p.ventures = [
      makeVenture({ id: 'V_FISH', industry: 'FISHING', label: 'the boat' }),
      makeVenture({ id: 'V_RETAIL', industry: 'RETAIL', label: 'the juice stand' }),
    ];
    p.experience.fishing = 0.5; // past UPG_FISH_1's gate
    p.experience.retail = 0.5; // past UPG_RETAIL_1's gate
    world.month = 20;

    // The fishing venture's first rung lapsed recently (within the re-offer cooldown,
    // but past the short upgrade cooldown), so it is suppressed — the retail venture's
    // ladder must still be reachable.
    world.opportunities.push({
      id: 'OPP_OLD_FISH',
      kind: 'ASSET_UPGRADE',
      industry: 'FISHING',
      npcName: "Baron's Marine",
      channelId: 'SUPPLY_TRADE',
      surfacedMonth: 15,
      windowMonths: 3,
      status: 'EXPIRED',
      decisionId: 'DEC_OLD_FISH',
      monthlyAmount: 0,
      ventureId: 'V_FISH',
      upgrade: {
        id: 'UPG_FISH_1', assetType: 'VEHICLE', assetSize: 'MEDIUM',
        assetLabel: 'a bigger pirogue', assetPrice: 28000, outputScaleDelta: 0.6,
        operatingCostDelta: 450, riskLevel: 'MEDIUM', minTermMonths: 24, maxTermMonths: 60,
      },
    });

    surfaceOpportunities(world);
    const upgrade = world.opportunities.find((o) => o.kind === 'ASSET_UPGRADE' && o.status === 'OPEN');
    expect(upgrade).toBeDefined();
    expect(upgrade!.ventureId).toBe('V_RETAIL'); // the later venture's ladder is reachable

    const before = p.ventures.find((v) => v.id === 'V_RETAIL')!.outputScale;
    applyUpgradeFinancing(world, upgrade!.decisionId, 4000, 36);
    const after = p.ventures.find((v) => v.id === 'V_RETAIL')!.outputScale;
    expect(after).toBeGreaterThan(before); // accepting raises its output
  });
});
