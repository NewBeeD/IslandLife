import type { Good, MacroState, Market, WorldEvent } from '@island/shared';
import { macroDemandMultiplier } from './macro';

// Faithful port of the design doc, with the month passed in (the doc's
// `currentMonth` was undefined) and goods looked up from the supplied table.
// Phase 20: `macro`, when supplied, scales the effective demand this good sees by the
// aggregate-demand cycle (construction-linked goods additionally ride the construction
// cycle). This is the web's core amplifying edge — a slump in demand pulls prices, and
// so firm revenue, down, which feeds back into more slump. Absent `macro` the price is
// byte-identical to before (the multiplier is 1), so the pre-P20 path is untouched.
export function updateMarketPrice(
  market: Market,
  events: WorldEvent[],
  month: number,
  goods: Good[],
  macro?: MacroState,
): Market {
  const good = goods.find((g) => g.id === market.goodId);
  if (!good) return market;
  const monthIndex = month % 12;

  const demandMultiplier = macro ? macroDemandMultiplier(macro, good.category) : 1;
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
