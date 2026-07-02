import type { Asset, Venture, WorldState } from '@island/shared';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 24.3 — asset aging & obsolescence (A20, A16).
//
// Gear wears out. An asset the player bought holds its worth for a while, then its
// value slides, its upkeep creeps up, and the output of the venture it powers eases
// down — so a business left un-renewed decays, and the player must reinvest to hold
// their ground (there is no buy-it-once-and-coast equilibrium). Occasionally a
// technology step makes a whole asset class obsolete at a stroke — a sharper cut that
// reshapes what is worth owning.
//
// Two determinism guarantees, both deliberate (S2):
//   • The wear is PURE arithmetic on the asset's age (world.month − acquiredMonth), so
//     it draws no rng and is identical on save/resume.
//   • The rare tech step is rolled on a (seed, month) SIDE-STREAM PRNG — never world.rng —
//     exactly as the Phase 23/24.5 events are, so the seed stream stays byte-identical
//     whether or not the player owns any gear. Only the player's own tracked assets are
//     touched, so NPC and firm economics — and the determinism digest for a default,
//     asset-less player — are unchanged.
//
// An asset is "tracked" only once it carries an `acquiredMonth` (stamped when the player
// buys it, Phase 24.3). Every NPC asset and every pre-Phase-24 snapshot lacks it and so
// never ages — the pre-P24 path is byte-identical.
// ─────────────────────────────────────────────────────────────────────────────

// Gear holds its worth for the first stretch, then begins to slide.
const GRACE_MONTHS = 12;
// Monthly wear rates once past the grace period (≈ 8%/yr value, 6%/yr upkeep creep, and a
// slow ≈3%/yr slide in the owning venture's output — the "over years" decay of A20).
const VALUE_DECAY_PER_MONTH = 0.007;
const UPKEEP_CREEP_PER_MONTH = 0.005;
const OUTPUT_DECAY_PER_MONTH = 0.0025;
// Wear never drives a venture's output below this share of its rated scale — a worn boat
// still catches fish; renewal (an upgrade) is what lifts it back up.
const OUTPUT_FLOOR = 0.5;

// A technology step (rare): a monthly chance, off the side-stream, that some asset class
// the player holds is rendered obsolete. Calibrated to be a once-in-many-years event.
const OBSOLESCENCE_PROB_PER_MONTH = 0.004;
// What obsolescence does the once it lands: a sharp haircut on the affected assets' value
// and on the output of the ventures they power.
const OBSOLESCENCE_VALUE_CUT = 0.4;
const OBSOLESCENCE_OUTPUT_CUT = 0.25;

// A small self-contained PRNG so the tech step is deterministic per (seed, month) WITHOUT
// drawing from world.rng — the same discipline as the Phase 23/24.5 event side-streams.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TrackedAsset {
  asset: Asset;
  venture?: Venture; // the venture the asset powers, if any (else a bare economic asset)
}

// Every one of the player's assets that carries a vintage (so is subject to wear), with
// the venture it powers. Bare economic assets have no venture (their value still slides).
function trackedPlayerAssets(world: WorldState): TrackedAsset[] {
  const p = world.player;
  const out: TrackedAsset[] = [];
  for (const a of p.economicAssets) if (a.acquiredMonth != null) out.push({ asset: a });
  for (const v of p.ventures ?? []) {
    for (const a of v.assets) if (a.acquiredMonth != null) out.push({ asset: a, venture: v });
  }
  return out;
}

// How many months of wear an asset has taken past its grace period (0 while still fresh).
function wearMonths(asset: Asset, month: number): number {
  const age = month - (asset.acquiredMonth ?? month);
  return Math.max(0, age - GRACE_MONTHS);
}

// Age the player's tracked assets one month (Phase 24.3). Depreciation is pure arithmetic;
// the rare tech step rolls the side-stream. A no-op — and no side-stream roll that matters —
// for a player with no tracked assets, so a default, asset-less player is byte-identical
// and the determinism digest holds. Call on the advance path, once a month.
export function agePlayerAssets(world: WorldState): void {
  const tracked = trackedPlayerAssets(world);
  if (tracked.length === 0) return;

  // Depreciation & upkeep creep on each worn asset; a slow output slide on each venture
  // that has any worn gear (applied once per venture, not once per asset).
  const decayedVentures = new Set<Venture>();
  for (const { asset, venture } of tracked) {
    const worn = wearMonths(asset, world.month);
    if (worn <= 0) continue;
    asset.value = Math.round(asset.value * (1 - VALUE_DECAY_PER_MONTH));
    if (asset.monthlyUpkeep != null) {
      asset.monthlyUpkeep = Math.round(asset.monthlyUpkeep * (1 + UPKEEP_CREEP_PER_MONTH));
    }
    if (venture) decayedVentures.add(venture);
  }
  for (const v of decayedVentures) {
    v.outputScale = Math.max(OUTPUT_FLOOR, v.outputScale * (1 - OUTPUT_DECAY_PER_MONTH));
  }

  maybeObsolescence(world, tracked);
}

// The rare technology step (Phase 24.3, A16/A20). Off the side-stream, roll once a month;
// if it fires, pick the oldest not-yet-obsolete asset class the player holds and render it
// obsolete — a sharp one-off cut to those assets' value and to the output of the ventures
// they power, plus a player notification. Deterministic per (seed, month) and per holdings.
function maybeObsolescence(world: WorldState, tracked: TrackedAsset[]): void {
  const eligible = tracked.filter((t) => !t.asset.obsolete);
  if (eligible.length === 0) return;
  const rng = mulberry32(
    (Math.imul(world.seed >>> 0, 0x85ebca6b) + world.month * 0xc2b2ae35 + 0x51ed270b) >>> 0,
  );
  if (rng() >= OBSOLESCENCE_PROB_PER_MONTH) return;

  // Choose the class to hit deterministically: the type of the oldest eligible asset
  // (ties broken by the stable asset id), so the same seed always disrupts the same class.
  const victim = [...eligible].sort((a, b) => {
    const am = a.asset.acquiredMonth ?? 0;
    const bm = b.asset.acquiredMonth ?? 0;
    if (am !== bm) return am - bm;
    return a.asset.id < b.asset.id ? -1 : 1;
  })[0]!;
  const doomedType = victim.asset.type;

  const hitVentures = new Set<Venture>();
  for (const { asset, venture } of eligible) {
    if (asset.type !== doomedType) continue;
    asset.obsolete = true;
    asset.value = Math.round(asset.value * (1 - OBSOLESCENCE_VALUE_CUT));
    if (venture) hitVentures.add(venture);
  }
  for (const v of hitVentures) {
    v.outputScale = Math.max(OUTPUT_FLOOR, v.outputScale * (1 - OBSOLESCENCE_OUTPUT_CUT));
  }
  world.playerNotifications.push(
    'A new way of doing things has left some of your equipment behind — it is worth less now, and it no longer pulls what it used to.',
  );
}
