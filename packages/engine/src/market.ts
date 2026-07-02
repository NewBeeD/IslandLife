import type { Good, MacroState, Market, WorldEvent } from '@island/shared';
import { macroDemandMultiplier } from './macro';
import { cultureDemandMultiplier, tasteDriftMultiplier } from './tastes';

// Faithful port of the design doc, with the month passed in (the doc's
// `currentMonth` was undefined) and goods looked up from the supplied table.
// Phase 20: `macro`, when supplied, scales the effective demand this good sees by the
// aggregate-demand cycle (construction-linked goods additionally ride the construction
// cycle). This is the web's core amplifying edge — a slump in demand pulls prices, and
// so firm revenue, down, which feeds back into more slump. Absent `macro` the price is
// byte-identical to before (the multiplier is 1), so the pre-P20 path is untouched.
// Phase 24: `seed`, when supplied, turns on the evolving-market demand reads — the good's
// slow taste drift (P24.1) and the parish's cultural lean (P24.2). Both are exactly 1.0
// at month 0, so a fresh world is byte-identical; absent `seed` (every pre-P24 direct
// caller) they are omitted entirely and the price is unchanged.
export function updateMarketPrice(
  market: Market,
  events: WorldEvent[],
  month: number,
  goods: Good[],
  macro?: MacroState,
  seed?: number,
): Market {
  const good = goods.find((g) => g.id === market.goodId);
  if (!good) return market;
  const monthIndex = month % 12;

  // The evolving-market demand reads (Phase 24): a good's taste drifts over years and a
  // parish leans culturally toward some trades. Neutral (1.0) unless `seed` is supplied,
  // and neutral at month 0 even then, so the pre-P24 path is byte-identical.
  const taste = seed !== undefined ? tasteDriftMultiplier(seed, good.id, month) : 1;
  const culture = seed !== undefined ? cultureDemandMultiplier(market.parish, good.category) : 1;

  const macroMultiplier = macro ? macroDemandMultiplier(macro, good.category) : 1;
  const demandMultiplier = macroMultiplier * taste * culture;
  const demandSupplyGap = market.demand * demandMultiplier - market.supply;
  const pressureEffect = demandSupplyGap * good.priceElasticity * 0.05;

  const seasonalMultiplier = good.seasonality[monthIndex] ?? 1;

  let eventShock = 0;
  for (const event of events) {
    if (event.affectedIndustries.includes(good.category)) {
      if (good.hurricaneVulnerability > 0) {
        eventShock += event.severity * good.hurricaneVulnerability * 0.3;
      } else {
        eventShock += event.severity * Math.abs(good.hurricaneVulnerability) * 0.5;
      }
    }
  }

  const meanReversionForce = (good.basePrice - market.currentPrice) * 0.08;

  const newPrice = Math.max(
    (market.currentPrice + pressureEffect + meanReversionForce) *
      seasonalMultiplier *
      (1 + eventShock),
    good.basePrice * 0.3,
  );

  market.currentPrice = newPrice;
  market.priceHistory.push(newPrice);
  if (market.priceHistory.length > 24) market.priceHistory.shift();

  return market;
}
