import { GOODS, REPRESENTATIVE_GOOD } from '@island/shared';
import type {
  Asset,
  Industry,
  NPCAgent,
  PendingSale,
  SaleMode,
  Venture,
  WorldState,
} from '@island/shared';
import { clamp } from './rng';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 12 — asset liquidation & collateral.
//
// Two coupled ideas, both raising cash from what the player already owns:
//   • SELL — turn an owned asset (a boat, a plot, a minibus) into cash. A QUICK
//     fire sale pays now at a steep haircut; a PATIENT listing waits a couple of
//     months for a fuller price (recomputed at settlement, so a downturn still
//     bites). Selling a venture's gear shrinks that venture's output.
//   • PLEDGE — back a loan with an existing asset for a better rate/ceiling
//     (the bank's assessment already prices collateral). A pledged asset cannot be
//     sold, and a defaulted secured loan is settled by seizing it.
//
// Pure where it can be (resaleQuote never mutates); the apply/settle/repossess paths
// mutate the player's assets, cash, ventures and loans. All additive — a world with
// nothing listed and no secured loan is byte-identical, so the determinism digest
// holds (S2). Only the player transacts here, so NPC cash math is untouched.
// ─────────────────────────────────────────────────────────────────────────────

// Recovery ceilings by asset class — the share of book value a PATIENT sale fetches
// in normal conditions. Land holds its worth; vehicles and gear sell below book.
const RECOVERY_BY_TYPE: Record<Asset['type'], number> = {
  LAND: 0.95,
  VEHICLE: 0.7,
  EQUIPMENT: 0.6,
};

const QUICK_SALE_MULTIPLIER = 0.75; // a fire sale fetches this share of the patient price
const PATIENT_SALE_LAG_MONTHS = 2; // months a PATIENT listing takes to settle
const VENTURE_OUTPUT_FLOOR = 0.3; // selling a venture's gear never zeroes its labour
const DISTRESS_DISCOUNT = 0.9; // buyers smell desperation when the seller is in arrears

export class SaleError extends Error {}

export interface ResaleQuote {
  assetId: string;
  saleMode: SaleMode;
  price: number; // EC$ — paid now (QUICK) or expected at settlement (PATIENT)
  fairValue: number; // EC$ — the patient/full price, for reference
  settlesInMonths: number; // 0 for QUICK
  ventureId?: string; // the venture the asset belongs to, if any
  reason: string; // plain-language, player-facing
}

interface AssetLocation {
  asset: Asset;
  venture?: Venture; // present when the asset belongs to a venture (else economicAssets)
}

// Find one of the player's assets and where it lives. Only the player sells or
// pledges, so this searches the player alone.
function locatePlayerAsset(world: WorldState, assetId: string): AssetLocation | null {
  const p = world.player;
  const econ = p.economicAssets.find((a) => a.id === assetId);
  if (econ) return { asset: econ };
  for (const v of p.ventures ?? []) {
    const a = v.assets.find((x) => x.id === assetId);
    if (a) return { asset: a, venture: v };
  }
  return null;
}

// How a venture's trade is doing right now, as a multiplier on its assets' resale
// value: a boat is worth less when fish are cheap or an event has hit fishing. A
// generic (non-venture) asset has no industry coupling and sells at face recovery.
function tradeResaleFactor(world: WorldState, industry: Industry): number {
  const goodId = REPRESENTATIVE_GOOD[industry];
  let factor = 1;
  if (goodId) {
    const good = GOODS.find((g) => g.id === goodId);
    const market = world.markets.find(
      (m) => m.goodId === goodId && m.parish === world.player.parish,
    );
    if (good && market) factor = clamp(market.currentPrice / good.basePrice, 0.6, 1.1);
  }
  const drag = world.events.filter((e) => e.affectedIndustries.includes(industry)).length;
  return clamp(factor * (1 - 0.1 * drag), 0.4, 1.1);
}

// The fair (patient) resale value of an asset, before the quick-sale haircut.
function fairResaleValue(world: WorldState, asset: Asset, venture?: Venture): number {
  const recovery = RECOVERY_BY_TYPE[asset.type];
  const trade = venture ? tradeResaleFactor(world, venture.industry) : 1;
  const distress = (world.player.loanArrearsMonths ?? 0) > 0 ? DISTRESS_DISCOUNT : 1;
  return Math.round(asset.value * recovery * trade * distress);
}

// Quote what the player would get for an asset, sold QUICK (now, discounted) or
// PATIENT (a fuller price after a wait). Pure — never mutates. Null if the asset is
// not the player's.
export function resaleQuote(world: WorldState, assetId: string, mode: SaleMode): ResaleQuote | null {
  const loc = locatePlayerAsset(world, assetId);
  if (!loc) return null;
  const fair = fairResaleValue(world, loc.asset, loc.venture);
  if (mode === 'QUICK') {
    return {
      assetId,
      saleMode: 'QUICK',
      price: Math.round(fair * QUICK_SALE_MULTIPLIER),
      fairValue: fair,
      settlesInMonths: 0,
      ventureId: loc.venture?.id,
      reason: 'A buyer will take it off your hands today, but only at a fire-sale price.',
    };
  }
  return {
    assetId,
    saleMode: 'PATIENT',
    price: fair,
    fairValue: fair,
    settlesInMonths: PATIENT_SALE_LAG_MONTHS,
    ventureId: loc.venture?.id,
    reason:
      `List it and wait, and it should fetch closer to its worth in about ` +
      `${PATIENT_SALE_LAG_MONTHS} months — if the trade holds up in the meantime.`,
  };
}

function guardSellable(asset: Asset): void {
  if (asset.pledgedToLoanId) {
    throw new SaleError(`asset ${asset.id} is pledged as collateral and cannot be sold`);
  }
  if (asset.listedForSale) {
    throw new SaleError(`asset ${asset.id} is already listed for sale`);
  }
}

function removeAssetFromOwner(p: NPCAgent, loc: AssetLocation): void {
  if (loc.venture) {
    loc.venture.assets = loc.venture.assets.filter((a) => a.id !== loc.asset.id);
  } else {
    p.economicAssets = p.economicAssets.filter((a) => a.id !== loc.asset.id);
  }
}

// Shrink a venture after one of its assets is gone: output and upkeep fall by the
// asset's share of the venture's gear (output never below a hand-work floor). If
// nothing productive remains and there is no other footing, the venture closes.
// Returns whether it closed.
function applyVentureAssetLoss(venture: Venture, soldValue: number): boolean {
  const remainingValue = venture.assets.reduce((s, a) => s + a.value, 0); // after removal
  const totalBefore = remainingValue + soldValue;
  if (totalBefore > 0) {
    const share = clamp(soldValue / totalBefore, 0, 1);
    venture.outputScale = Math.max(VENTURE_OUTPUT_FLOOR, venture.outputScale * (1 - share));
    venture.monthlyOperatingCosts = Math.round(venture.monthlyOperatingCosts * (1 - share));
  }
  if (
    venture.assets.length === 0 &&
    venture.spotBaseIncome <= 0 &&
    venture.incomeMode !== 'STANDING'
  ) {
    venture.status = 'CLOSED';
    return true;
  }
  return false;
}

// Remove the asset, pay the player, and shrink the owning venture. Shared by the
// quick sale, the patient settlement, and (at recovery value) repossession.
function settleSale(world: WorldState, loc: AssetLocation, price: number): { price: number; ventureClosed: boolean } {
  const p = world.player;
  const soldValue = loc.asset.value;
  removeAssetFromOwner(p, loc);
  p.cash += price;
  const ventureClosed = loc.venture ? applyVentureAssetLoss(loc.venture, soldValue) : false;
  return { price, ventureClosed };
}

// QUICK sale: cash now, at the fire-sale price. Mutates the world. Throws if the
// asset is not the player's, or is pledged/already listed.
export function sellAssetNow(world: WorldState, assetId: string): { price: number; ventureClosed: boolean } {
  const loc = locatePlayerAsset(world, assetId);
  if (!loc) throw new SaleError(`asset ${assetId} not found`);
  guardSellable(loc.asset);
  const quote = resaleQuote(world, assetId, 'QUICK')!;
  return settleSale(world, loc, quote.price);
}

// PATIENT sale: list the asset and record a pending sale that settles later (in
// resolvePendingSales). The asset stays owned and, for a venture, still earning
// until it settles. Returns the listing. Throws like sellAssetNow.
export function listAssetForSale(world: WorldState, assetId: string): PendingSale {
  const loc = locatePlayerAsset(world, assetId);
  if (!loc) throw new SaleError(`asset ${assetId} not found`);
  guardSellable(loc.asset);
  const quote = resaleQuote(world, assetId, 'PATIENT')!;
  loc.asset.listedForSale = true;
  const sale: PendingSale = {
    assetId,
    ventureId: loc.venture?.id,
    listedMonth: world.month,
    resolveMonth: world.month + PATIENT_SALE_LAG_MONTHS,
    expectedPrice: quote.price,
  };
  (world.player.pendingSales ??= []).push(sale);
  return sale;
}

// Settle every PATIENT sale that has come due, at a price recomputed from current
// conditions (so a downturn during the wait is felt). A no-op without pending sales,
// so the digest holds. Call once a month before loans are serviced, so the proceeds
// are available to meet this month's payments.
export function resolvePendingSales(world: WorldState): void {
  const p = world.player;
  if (!p.pendingSales || p.pendingSales.length === 0) return;
  const stillPending: PendingSale[] = [];
  for (const sale of p.pendingSales) {
    if (world.month < sale.resolveMonth) {
      stillPending.push(sale);
      continue;
    }
    const loc = locatePlayerAsset(world, sale.assetId);
    if (!loc) continue; // the asset is gone (e.g. repossessed) — drop the stale listing
    const quote = resaleQuote(world, sale.assetId, 'PATIENT');
    const price = quote ? quote.price : sale.expectedPrice;
    loc.asset.listedForSale = undefined;
    settleSale(world, loc, price);
    world.playerNotifications.push('A sale you had been waiting on finally went through.');
  }
  p.pendingSales = stillPending;
}

// ── Collateral ────────────────────────────────────────────────────────────────

// The value a lender recovers by forcing the sale of seized collateral — a fire sale
// of an already-distressed asset.
function forcedRecoveryValue(asset: Asset): number {
  return Math.round(asset.value * RECOVERY_BY_TYPE[asset.type] * QUICK_SALE_MULTIPLIER);
}

// Find an asset the borrower owns (economic or venture-held), to pledge it.
export function findBorrowerAsset(borrower: NPCAgent, assetId: string): Asset | null {
  const econ = borrower.economicAssets.find((a) => a.id === assetId);
  if (econ) return econ;
  for (const v of borrower.ventures ?? []) {
    const a = v.assets.find((x) => x.id === assetId);
    if (a) return a;
  }
  return null;
}

// Seize the collateral behind any of the player's defaulted secured loans: the asset
// is sold off, its forced-sale value is credited against the loan (clearing it if it
// covers the balance), and the owning venture shrinks. Each loan is repossessed once.
// Returns the number of assets seized. A no-op without secured loans in default, so
// the digest holds. Call after defaults are marked and before defaulted debt is
// written off.
export function repossessCollateral(world: WorldState): number {
  const p = world.player;
  let seized = 0;
  for (const loan of p.loans) {
    if (loan.status !== 'DEFAULT' || !loan.collateralAssetId || loan.collateralRepossessed) continue;
    loan.collateralRepossessed = true;
    const loc = locatePlayerAsset(world, loan.collateralAssetId);
    if (!loc) continue; // collateral already gone
    seized += 1;
    const recovered = forcedRecoveryValue(loc.asset);
    const soldValue = loc.asset.value;
    loc.asset.pledgedToLoanId = undefined;
    removeAssetFromOwner(p, loc);
    if (loc.venture) applyVentureAssetLoss(loc.venture, soldValue);
    loan.remainingPrincipal = Math.max(0, loan.remainingPrincipal - recovered);
    if (loan.remainingPrincipal <= 0) loan.status = 'PAID';
    world.playerNotifications.push('The lender came and took what secured the loan.');
  }
  return seized;
}
