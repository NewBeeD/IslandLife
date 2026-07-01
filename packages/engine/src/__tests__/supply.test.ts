import { describe, expect, it } from 'vitest';
import type { MacroState, WorldEvent } from '@island/shared';
import {
  buildWorld,
  simulateOneMonth,
  recomputeMacro,
  updateMarketPrice,
  initialMacroState,
  supplyChainFragility,
  supplyChainCostMultiplier,
  inputsAreScarce,
  SUPPLY_CHAIN_FRAGILITY,
} from '../index';

// A route-disruption event, live now, at a chosen severity.
function routeEvent(severity: number): WorldEvent {
  return {
    id: 'ROUTE_DISRUPTION_test',
    definitionId: 'ROUTE_DISRUPTION',
    severity,
    startedMonth: 0,
    durationRemaining: 3,
    affectedIndustries: ['AGRICULTURE', 'RETAIL', 'CONSTRUCTION', 'TRANSPORTATION', 'TOURISM'],
  };
}

describe('Phase 23.3 — supply-chain fragility', () => {
  it('ranks raw trades below processed/imported ones, and exempts finance', () => {
    // A raw extractive trade has almost no chain; retail/construction ride the longest;
    // finance has no physical chain at all.
    expect(SUPPLY_CHAIN_FRAGILITY.FINANCE).toBe(0);
    expect(supplyChainFragility('FISHING')).toBeLessThan(supplyChainFragility('RETAIL'));
    expect(supplyChainFragility('AGRICULTURE')).toBeLessThan(supplyChainFragility('CONSTRUCTION'));
    expect(supplyChainFragility('FINANCE')).toBe(0);
  });

  it('the cost multiplier is exactly 1 in a calm economy (byte-identical to pre-P23)', () => {
    const calm = initialMacroState(0.08); // inputCostPressure 1.0 at rest
    for (const industry of Object.keys(SUPPLY_CHAIN_FRAGILITY) as (keyof typeof SUPPLY_CHAIN_FRAGILITY)[]) {
      expect(supplyChainCostMultiplier(calm, industry)).toBe(1);
    }
    // A missing macro (a pre-P23 caller) also reads as neutral.
    expect(supplyChainCostMultiplier(undefined, 'RETAIL')).toBe(1);
  });

  it('scarce inputs lift a fragile chain more than a raw one, and never touch finance', () => {
    const scarce: MacroState = { ...initialMacroState(0.08), inputCostPressure: 1.4 };
    const finance = supplyChainCostMultiplier(scarce, 'FINANCE');
    const fishing = supplyChainCostMultiplier(scarce, 'FISHING');
    const retail = supplyChainCostMultiplier(scarce, 'RETAIL');
    expect(finance).toBe(1); // no chain — immune
    expect(fishing).toBeGreaterThan(1);
    expect(retail).toBeGreaterThan(fishing);
  });
});

describe('Phase 23.1 — scarce inputs on the macro web', () => {
  it('a fresh world rests at calm inputs (pressure 1.0, no disruption)', () => {
    const w = buildWorld(3, { population: 120 });
    expect(w.macro.inputCostPressure).toBe(1);
    expect(w.macro.supplyDisruption).toBe(0);
    expect(inputsAreScarce(w.macro)).toBe(false);
  });

  it('a live route disruption raises supply stress and bids input costs up', () => {
    const w = buildWorld(5, { population: 150 });
    w.events.push(routeEvent(0.8));
    // Advance the macro a few steps so the pressure eases toward its raised target.
    recomputeMacro(w);
    recomputeMacro(w);
    expect(w.macro.supplyDisruption).toBeGreaterThan(0.5);
    expect(w.macro.inputCostPressure).toBeGreaterThan(1.05);
    expect(inputsAreScarce(w.macro)).toBe(true);
  });

  it('supply stress decays back to calm once the route reopens', () => {
    const w = buildWorld(9, { population: 120 });
    w.events.push(routeEvent(0.8));
    recomputeMacro(w);
    const stressed = w.macro.supplyDisruption;
    // The route reopens — clear the event and let the stress decay.
    w.events = [];
    for (let i = 0; i < 8; i++) recomputeMacro(w);
    expect(w.macro.supplyDisruption).toBeLessThan(stressed);
    expect(w.macro.supplyDisruption).toBeLessThan(0.05);
  });

  it('input-cost pressure stays in band over a long run', () => {
    const w = buildWorld(11, { population: 200 });
    for (let i = 0; i < 60; i++) {
      simulateOneMonth(w);
      expect(w.macro.inputCostPressure).toBeGreaterThanOrEqual(1);
      expect(w.macro.inputCostPressure).toBeLessThanOrEqual(1.6);
      expect(w.macro.supplyDisruption).toBeGreaterThanOrEqual(0);
      expect(w.macro.supplyDisruption).toBeLessThanOrEqual(1);
    }
  });
});

describe('Phase 23.2 — choke points & route disruption', () => {
  it('a route disruption spikes the price of an affected good (scarcity, not a glut)', () => {
    const w = buildWorld(7, { population: 120 });
    // Building materials: an import-heavy construction good with a real price, well clear
    // of the price floor, so the event's supply-side lift is unambiguous.
    const good = w.goods.find((g) => g.id === 'BUILDING_MATERIALS')!;
    const market = w.markets.find((m) => m.goodId === good.id)!;

    // Price the good with and without a live route event, from the same starting price.
    const withoutEvent = updateMarketPrice(
      { ...market, priceHistory: [...market.priceHistory] },
      [],
      w.month,
      w.goods,
      w.macro,
    ).currentPrice;
    const withEvent = updateMarketPrice(
      { ...market, priceHistory: [...market.priceHistory] },
      [routeEvent(0.8)],
      w.month,
      w.goods,
      w.macro,
    ).currentPrice;

    expect(withEvent).toBeGreaterThan(withoutEvent);
  });

  it('a route disruption actually fires over a long run and stays deterministic per seed', () => {
    const sawDisruption = (seed: number): boolean => {
      const w = buildWorld(seed, { population: 150 });
      let seen = false;
      for (let i = 0; i < 120; i++) {
        simulateOneMonth(w);
        if (w.events.some((e) => e.definitionId === 'ROUTE_DISRUPTION')) seen = true;
      }
      return seen;
    };
    // Across a decade of months a route is cut at least once for some seed.
    const anySeen = [1, 2, 3, 4, 5].some((s) => sawDisruption(s));
    expect(anySeen).toBe(true);
    // And the same seed reproduces the same answer (rolled off a (seed, month) PRNG).
    expect(sawDisruption(2)).toBe(sawDisruption(2));
  });
});
