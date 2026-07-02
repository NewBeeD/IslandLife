import { GOODS, PARISHES, REPRESENTATIVE_GOOD } from '@island/shared';
import type {
  Good,
  Industry,
  Market,
  NarrativeEntryType,
  NPCAgent,
  PriceDirection,
  WorldEvent,
  WorldState,
} from '@island/shared';
import { priceChangeMagnitude, priceDirectionFromHistory } from './magnitude';

// Everything a template needs to render, derived once per month from the world.
// This is the Layer-1 analogue of the LLM context assembler: it turns raw state
// into the qualitative signals the prose is built from.
export interface MonthContext {
  world: WorldState;
  player: NPCAgent;
  month: number;
  monthIndex: number; // 0–11
  parishName: string;
  occupation: Industry | null;
  occupationPlace: string; // "the water", "the shop" — for generic work prose
  good?: Good;
  market?: Market;
  priceDir: PriceDirection;
  priceChange: number; // |fractional move vs a few months back|
  priceVsBase: number; // currentPrice / basePrice (1.0 = normal)
  industryEvents: WorldEvent[]; // active events touching the player's industry
  hasActiveLoan: boolean;
  loanPayment: number; // EC$/month, summed across active loans
  loanRemaining: number; // EC$ remaining principal, summed
  cashAfterPayment: number; // cash − this month's loan payment
  // The economic web's mood (Phase 20.5) — qualitative booleans, never raw macro
  // numbers (the iceberg, S3). `creditTight` reads a credit crunch off the macro
  // state; `tradeCrowded` reads a competitive scrum crowding the player's own trade.
  creditTight: boolean;
  tradeCrowded: boolean;
  // Supply chains & scarcity (Phase 23): scarce inputs are biting — a boom has bid up
  // fuel/materials/skilled hands, or a route is cut — felt as a qualitative squeeze,
  // never the raw multiplier (the iceberg, S3).
  inputsScarce: boolean;
  // The evolving market (Phase 24.5): the definitionId of a live black swan — a pandemic,
  // a technology upheaval, a major spill — or null when none is running. A rare, island-
  // reshaping shock the voice names in plain terms, never as a severity number (S3).
  blackSwan: string | null;
  rand: () => number; // deterministic in (seed, month); never touches world.rng
}

// The black-swan event kinds (Phase 24.5), mirrored here as plain ids so the narrative
// layer needs no dependency on the engine (it reads world.events directly). Kept in step
// with BLACK_SWAN_EVENT_IDS in the engine's events module.
const BLACK_SWAN_IDS: ReadonlySet<string> = new Set(['PANDEMIC', 'TECH_DISRUPTION', 'MAJOR_SPILL']);

export interface Template {
  id: string;
  type: NarrativeEntryType;
  weight: number;
  match(ctx: MonthContext): boolean;
  render(ctx: MonthContext): string;
}

const OCCUPATION_PLACE: Record<Industry, string> = {
  FISHING: 'the water',
  AGRICULTURE: 'the land',
  CONSTRUCTION: 'the construction work',
  INFORMAL_TRADE: 'the trade',
  RETAIL: 'the shop',
  TOURISM: 'the guesthouse',
  TRANSPORTATION: 'the bus run',
  FINANCE: 'the office',
};

// A small self-contained PRNG so template selection is deterministic per
// (seed, month) WITHOUT drawing from world.rng — keeping the simulation's RNG
// stream pristine (S2) so narrative choices never perturb the golden master.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildContext(world: WorldState): MonthContext {
  const player = world.player;
  const month = world.month;
  const monthIndex = ((month % 12) + 12) % 12;
  const parishName = PARISHES.find((p) => p.id === player.parish)?.name ?? 'the parish';

  const occupation = player.occupation;
  const goodId = occupation ? REPRESENTATIVE_GOOD[occupation] : null;
  const good = goodId ? GOODS.find((g) => g.id === goodId) : undefined;
  const market = goodId
    ? world.markets.find((m) => m.goodId === goodId && m.parish === player.parish)
    : undefined;

  const priceDir = market ? priceDirectionFromHistory(market.priceHistory) : 'holding steady';
  const priceChange = market ? priceChangeMagnitude(market.priceHistory) : 0;
  const priceVsBase = market && good ? market.currentPrice / good.basePrice : 1;

  const industryEvents = occupation
    ? world.events.filter((e) => e.affectedIndustries.includes(occupation))
    : [];

  const activeLoans = player.loans.filter((l) => l.status === 'ACTIVE');
  const loanPayment = activeLoans.reduce((s, l) => s + l.monthlyPayment, 0);
  const loanRemaining = activeLoans.reduce((s, l) => s + l.remainingPrincipal, 0);

  // The economic-web mood, read qualitatively off the macro state (P20.5). A credit
  // crunch = the island's credit visibly frozen or its cost sharply up; never the raw
  // figures (S3). A crowded trade = a scrum of newly-founded rivals in the player's own
  // parish×industry, the "everybody's chasing the same trade" competitive squeeze (C9).
  const macro = world.macro;
  const rateSpread = macro.effectiveInterestRate - world.country.baseInterestRate;
  const creditTight = macro.systemicStress > 0.12 || macro.creditAvailability < 0.45 || rateSpread > 0.05;
  const foundedRivals = occupation
    ? world.companies.filter(
        (c) =>
          c.status !== 'CLOSED' &&
          c.id.startsWith('CO_') &&
          c.industry === occupation &&
          c.parish === player.parish,
      ).length
    : 0;
  const tradeCrowded = foundedRivals >= 3;
  // Scarce inputs biting (Phase 23): a boom bidding up finite inputs, or a route cut —
  // read qualitatively off the macro state, never the raw multiplier (S3). Tolerant of a
  // pre-P23 macro (the fields default to calm).
  const inputsScarce = (macro.inputCostPressure ?? 1) > 1.12 || (macro.supplyDisruption ?? 0) > 0.2;
  // A live black swan reshaping the island (Phase 24.5) — named for the voice, not scored.
  const blackSwan = world.events.find((e) => BLACK_SWAN_IDS.has(e.definitionId))?.definitionId ?? null;

  const rand = mulberry32((Math.imul(world.seed >>> 0, 2654435761) + month * 40503) >>> 0);

  return {
    world,
    player,
    month,
    monthIndex,
    parishName,
    occupation,
    occupationPlace: occupation ? OCCUPATION_PLACE[occupation] : 'work',
    good,
    market,
    priceDir,
    priceChange,
    priceVsBase,
    industryEvents,
    hasActiveLoan: activeLoans.length > 0,
    loanPayment,
    loanRemaining,
    cashAfterPayment: player.cash - loanPayment,
    creditTight,
    tradeCrowded,
    inputsScarce,
    blackSwan,
    rand,
  };
}
