import type { NPCAgent, ReputationLedger, WorldState } from '@island/shared';
import { clamp, clamp01 } from './rng';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 21 — reputation, trust & memory (C11, A3, A11, A19).
//
// One slowly-moving standing the whole world reads. It is DERIVED from the substrate
// that already exists — kept promises, broken contracts, loan defaults/arrears, the
// social capitals — but it carries its own memory and an ASYMMETRIC curve that the raw
// counters do not: it rises slowly, drops sharply, and eases back toward neutral over
// *years*, not months. So one default tanks financial reliability in a single month and
// then shadows the player for a long time, while a clean record is built only patiently.
//
// Maintained for the PLAYER only, once per month (`updateReputation`), near the point
// defaults are freshly marked. NPCs and a pre-Phase-21 player have no ledger and read as
// neutral through the `*Of` helpers, so they stay byte-identical and the digest holds
// (S2). Pure of rng — reputation never disturbs the seed stream. Hidden internals: the
// four bands never cross the wire as numbers (S3); the player reads them as prose (P21.4).
// ─────────────────────────────────────────────────────────────────────────────

export const NEUTRAL_REPUTATION = 0.5;

// How far each band eases back toward its resting target each month — the "recovers
// over years" curve. Small, so a sharp drop shadows the player for many months: a full
// default hit (≈0.28) climbs back to neutral over roughly three years of clean record.
const DECAY = 0.03;

// The slow monthly rise a clean, obligation-meeting month earns. Kept well below the
// sharp drops so reputation is easy to lose and slow to build (C11). Its ratio to DECAY
// sets the resting level a sustained good record settles at, comfortably above neutral.
const CLEAN_RISE = 0.012;

// The sharp drops (C11 — lost in a month).
const DEFAULT_HIT = 0.28; // a loan default — a heavy blow to financial reliability
const BROKEN_HIT = 0.16; // a broken contract — a blow to fair dealing
const ARREARS_HIT = 0.03; // falling behind on a loan, short of an outright default

// How strongly a broken deal and a default bleed across dimensions (a default is mostly
// a reliability failure but also somewhat unfair; a broken contract, the reverse).
const CROSS = 0.35;

// Employer standing moves only slowly, off whether the player's firms pay their hands.
const EMPLOYER_STEP = 0.01;

// Civic standing rests near the player's institutional capital and is dented while the
// government is scrutinising a market they dominate (P20.4 ANTITRUST).
const CIVIC_CAPITAL_PULL = 0.5; // how far institutional capital pulls the civic target
const CIVIC_SCRUTINY_HIT = 0.02;

const easeToward = (value: number, target: number, t: number): number =>
  value + (target - value) * t;

// A neutral ledger seeded from the agent's current counters, so pre-existing history is
// not retroactively counted as this month's events. The bands start neutral.
export function freshLedger(agent: NPCAgent): ReputationLedger {
  return {
    financialReliability: NEUTRAL_REPUTATION,
    fairDealing: NEUTRAL_REPUTATION,
    employerQuality: NEUTRAL_REPUTATION,
    civicStanding: NEUTRAL_REPUTATION,
    seenKeptPromises: agent.keptPromises,
    seenBrokenContracts: agent.brokenContracts,
  };
}

// Whether the player currently carries at least one loan they are servicing (ACTIVE) —
// a clean-servicing month is what slowly builds financial reliability back up.
function hasServicedLoan(agent: NPCAgent): boolean {
  return agent.loans.some((l) => l.status === 'ACTIVE');
}

// The employer-quality nudge this month: a player-owned firm that is solvent and pays
// hired hands lifts it a touch; the player who employs no one drifts back toward neutral
// via the decay alone. Bounded to a small step so it moves slowly.
function employerNudge(world: WorldState, player: NPCAgent): number {
  let nudge = 0;
  for (const c of world.companies) {
    if (c.ownerId !== player.id || c.status === 'CLOSED') continue;
    const hands = c.employees.filter((e) => e.id !== c.ownerId).length;
    if (hands > 0 && c.isSolvent) nudge += EMPLOYER_STEP;
  }
  return Math.min(nudge, EMPLOYER_STEP * 2);
}

// The resting target civic standing eases toward: centred on neutral, pulled toward the
// player's institutional capital, and pressed down while a market they dominate is under
// government scrutiny (the state end of "winning paints a target", P20.4).
function civicTarget(world: WorldState, player: NPCAgent): number {
  const capitalPull = CIVIC_CAPITAL_PULL * (player.socialCapitalInstitutional - 0.5);
  const scrutiny = world.government.policies.some((p) => p.type === 'ANTITRUST')
    ? CIVIC_SCRUTINY_HIT
    : 0;
  return clamp01(NEUTRAL_REPUTATION + capitalPull - scrutiny);
}

// Recompute the player's reputation ledger for the month. Detects this month's events
// from deltas on the cumulative counters and from freshly-defaulted loans, applies the
// sharp drops and the slow clean-record rise, then eases every band toward its resting
// target (the decay curve). Pure of rng; mutates the player's ledger in place. A no-op
// for a month with no events beyond the gentle decay toward neutral, so a clean life
// with no obligations barely moves.
export function updateReputation(world: WorldState): void {
  const p = world.player;
  const led = (p.reputation ??= freshLedger(p));

  // This month's events, read off the cumulative counters (deltas) and loan statuses.
  const dBroken = Math.max(0, p.brokenContracts - led.seenBrokenContracts);
  const dKept = Math.max(0, p.keptPromises - led.seenKeptPromises);
  led.seenBrokenContracts = p.brokenContracts;
  led.seenKeptPromises = p.keptPromises;

  // Fresh loan defaults — each charged against financial reliability exactly once.
  let freshDefaults = 0;
  for (const loan of p.loans) {
    if (loan.status === 'DEFAULT' && !loan.reputationCounted) {
      loan.reputationCounted = true;
      freshDefaults += 1;
    }
  }
  const inArrears = freshDefaults === 0 && (p.loanArrearsMonths ?? 0) > 0;

  // ── Financial reliability ── sharp drops for defaults/broken deals/arrears; a slow
  // rise for a clean-servicing month with no black marks.
  led.financialReliability -= DEFAULT_HIT * freshDefaults;
  led.financialReliability -= BROKEN_HIT * CROSS * dBroken;
  if (inArrears) led.financialReliability -= ARREARS_HIT;
  if (freshDefaults === 0 && dBroken === 0 && !inArrears && hasServicedLoan(p)) {
    led.financialReliability += CLEAN_RISE;
  }

  // ── Fair dealing ── a broken contract is the sharp blow; kept promises build it.
  led.fairDealing -= BROKEN_HIT * dBroken;
  led.fairDealing -= DEFAULT_HIT * CROSS * freshDefaults;
  if (dKept > 0) led.fairDealing += CLEAN_RISE * dKept;

  // ── Employer quality ── slow, off whether the player's firms pay their hands.
  led.employerQuality += employerNudge(world, p);

  // ── Decay every band toward its resting target (neutral, save civic) ──
  led.financialReliability = clamp01(
    easeToward(led.financialReliability, NEUTRAL_REPUTATION, DECAY),
  );
  led.fairDealing = clamp01(easeToward(led.fairDealing, NEUTRAL_REPUTATION, DECAY));
  led.employerQuality = clamp01(easeToward(led.employerQuality, NEUTRAL_REPUTATION, DECAY));
  led.civicStanding = clamp01(easeToward(led.civicStanding, civicTarget(world, p), DECAY));
}

// ── Readers the rest of the engine consults (P21.2), neutral when there is no ledger ──

export function financialReliabilityOf(agent: NPCAgent): number {
  return agent.reputation?.financialReliability ?? NEUTRAL_REPUTATION;
}
export function fairDealingOf(agent: NPCAgent): number {
  return agent.reputation?.fairDealing ?? NEUTRAL_REPUTATION;
}
export function employerQualityOf(agent: NPCAgent): number {
  return agent.reputation?.employerQuality ?? NEUTRAL_REPUTATION;
}
export function civicStandingOf(agent: NPCAgent): number {
  return agent.reputation?.civicStanding ?? NEUTRAL_REPUTATION;
}

// A hired operator's cut of a venture's takings, bent by the player's standing as an
// employer (Phase 21 — "employees seek or avoid the player as an employer"). A well-
// regarded employer attracts operators for a slightly smaller share; a poorly-regarded
// one must pay more to get anyone to run their venture. Centred on neutral, so a player
// with no ledger pays exactly the base share (byte-identical). Held to a sane band.
const EMPLOYER_SHARE_SWING = 0.12;
export function operatorShareForEmployer(player: NPCAgent, baseShare: number): number {
  const bias = EMPLOYER_SHARE_SWING * (NEUTRAL_REPUTATION - employerQualityOf(player));
  return clamp(baseShare + bias, 0.1, 0.5);
}

// A qualitative band for a 0–1 reputation value — the only shape the wire ever sees the
// ledger in (S3). Five steps around the neutral resting point.
export type ReputationBand = 'POOR' | 'SHAKY' | 'FAIR' | 'SOLID' | 'STRONG';
export function reputationBand(value: number): ReputationBand {
  if (value >= 0.72) return 'STRONG';
  if (value >= 0.58) return 'SOLID';
  if (value >= 0.42) return 'FAIR';
  if (value >= 0.28) return 'SHAKY';
  return 'POOR';
}
