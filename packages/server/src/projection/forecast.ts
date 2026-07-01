import {
  competitorRead,
  isScouted,
  playerForecasts,
  researchCost,
  researchLevelOf,
  scoutCost,
} from '@island/engine';
import { PARISHES } from '@island/shared';
import type {
  ForecastLineDTO,
  InformationOfferDTO,
  InformationPurchaseResultDTO,
  WorldState,
} from '@island/shared';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 22 — the information economy, projected (P22.1/P22.3).
//
// Forecasts reach the player as RANGES framed in voice — a research firm's hedged
// estimate, never a bare stat (S3, S7). The hidden true projection behind each band
// never crosses the wire; only the low/high bounds and the prose do. The offer to buy
// a sharper read is surfaced here too (P22.2), with the player's current sharpness read
// back as prose, never as the raw research level.
// ─────────────────────────────────────────────────────────────────────────────

function ec(n: number): string {
  return `EC$${Math.round(n).toLocaleString('en-US')}`;
}

function parishName(world: WorldState): string {
  return PARISHES.find((p) => p.id === world.player.parish)?.name ?? 'the parish';
}

// A hedged, in-voice summary of a forecast band. The wider the band relative to its
// centre, the more the prose leans on uncertainty; a sharp read reads more confident.
// Never a point, never a probability — the feel of an estimate, not a promise.
function summarise(low: number, high: number, sharp: boolean): string {
  const spread = high > 0 ? (high - low) / high : 1;
  const range = `${ec(low)} to ${ec(high)} a month`;
  if (sharp) {
    return (
      `The people you paid to look into it put next season's takings somewhere around ${range}, ` +
      `if the market holds its shape. A read worth having — but the sea and the price still have ` +
      `the last word.`
    );
  }
  if (spread > 0.5) {
    return (
      `Hard to say, in truth. Somewhere between ${range}, going on what you can see of it — but the ` +
      `spread is wide, and a good season or a bad one could throw it either way. You are half guessing.`
    );
  }
  return (
    `Best you can tell, next season's takings run somewhere around ${range}. The market moves and ` +
    `the season turns, so hold it loosely — it is a feel, not a figure.`
  );
}

// The player's forecasts for their market-driven ventures, as ranges in voice (P22.1).
// Empty when there is nothing market-driven to forecast (only fixed/known income).
export function toForecastLines(world: WorldState): ForecastLineDTO[] {
  const sharp = researchLevelOf(world.player) >= 0.5;
  return playerForecasts(world).map((f) => ({
    label: f.label,
    low: f.low,
    high: f.high,
    summary: summarise(f.low, f.high, sharp),
  }));
}

// How good the player's current market read is, as prose (never the raw level, S3).
function sharpnessProse(world: WorldState): string {
  const level = researchLevelOf(world.player);
  if (level >= 0.7) return 'You have a sharp, current read on how the market is moving.';
  if (level >= 0.35) return 'You have a fair read on the market, though it is going stale.';
  if (level > 0) return 'You have only a rough, fading read on the market.';
  return 'You are going on your own eye for the market — little better than a guess.';
}

// The competitor read a fresh scout buys, in voice — how crowded the player's trade is
// around the parish. Only ever surfaced while a scout is in hand (the gate below).
function scoutedProse(world: WorldState): string | undefined {
  const read = competitorRead(world);
  if (!read) return undefined;
  const place = parishName(world);
  const n = read.operators;
  const crowd =
    n >= 8
      ? `It is a crowded trade — the takings are spread thin among that many, and a newcomer feels it.`
      : n <= 3
        ? `Few enough that there is still room in it, if the work is there to be had.`
        : `A steady number at it — busy, but not so many that it is fought over.`;
  return (
    `Word comes back from around ${place}: there are about ${n} of you working the trade just now. ${crowd}`
  );
}

// The offer to buy sharper information (P22.2), or undefined when there is nothing worth
// forecasting (so no reason to sell a read). Surfaces the current sharpness, what a
// research report and a scout each cost and buy, and — while a scout is fresh — the
// competitor read it bought.
export function toInformationOffer(world: WorldState): InformationOfferDTO | undefined {
  // Coupled to having something to forecast: the offer is the flip side of the ranges,
  // so a player with only fixed/known income is sold nothing (nothing to sharpen).
  if (playerForecasts(world).length === 0) return undefined;
  const scouted = isScouted(world.player, world.month) ? scoutedProse(world) : undefined;
  return {
    sharpness: sharpnessProse(world),
    researchCost: researchCost(world),
    researchNote:
      'A market-research report would sharpen your read of the season ahead — a tighter, surer range to plan against.',
    scoutCost: scoutCost(world),
    scoutNote:
      'Send someone to ask around and you would learn how many others are working your trade, and whether it is getting crowded.',
    ...(scouted ? { scouted } : {}),
  };
}

// The result of buying information (P22.2): the player's own money facts (cost, cash
// after) and their new sharpness as prose, with a short in-voice line. No raw level (S3).
export function toInformationPurchaseResultDTO(
  world: WorldState,
  kind: 'research' | 'scout',
  cost: number,
  acknowledgement: string,
): InformationPurchaseResultDTO {
  return {
    kind,
    cost,
    cashInHand: Math.round(world.player.cash),
    sharpness: sharpnessProse(world),
    acknowledgement,
  };
}
