import {
  DOMINICA_BASE_DAY,
  INDUSTRY_DOMAIN,
  NEW_WORKER_RATE_PREMIUM,
  WAGE_HOURS_PER_DAY,
  WAGE_RATE_CEILING_MULTIPLIER,
  WAGE_WORKDAYS_PER_MONTH,
  credentialRank,
} from '@island/shared';
import type { CredentialLevel, Industry, NPCAgent, WageProfile } from '@island/shared';
import { activeVentures } from './ventures';
import { clamp } from './rng';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 15 — the grounded wage model.
//
// Wage work (construction day labour is the canonical case) earns through a day
// rate × a working month, so the per-day figure the player sees and the money
// banked agree (idea 1), and a new worker starts at Dominica's calibrated base
// (idea 2). The day rate rises with experience, what the worker knows, owning the
// tools, and a credential — recomputed each month, within a realistic ceiling
// (P15.2, ideas 2 & 8). Pure (S1) and additive: nothing here runs without a
// `wageProfile`, so NPCs and a non-wage player are byte-identical (the digest holds).
// ─────────────────────────────────────────────────────────────────────────────

// The trades that earn through the day-rate model. Construction is the day-labour
// trade the playtest grounded (ideas 1–2); other trades keep their spot/standing
// income. Kept narrow so the change is deliberate and digest-scoped.
const WAGE_INDUSTRIES: ReadonlySet<Industry> = new Set<Industry>(['CONSTRUCTION']);

export function isWageIndustry(industry: Industry | null | undefined): industry is Industry {
  return industry != null && WAGE_INDUSTRIES.has(industry);
}

// A brand-new, unskilled worker's wage profile: the calibrated green-hire day rate
// and a standard working month. The rate is refreshed from skill on the first
// advance, but a freshly-created worker already reads the base (idea 2).
export function newWorkerWageProfile(): WageProfile {
  return {
    dailyRate: Math.round(DOMINICA_BASE_DAY * NEW_WORKER_RATE_PREMIUM),
    workdaysPerMonth: WAGE_WORKDAYS_PER_MONTH,
    hoursPerDay: WAGE_HOURS_PER_DAY,
  };
}

// How much a credential lifts the day rate (idea 8): each rung is a visible raise.
function credentialRateBonus(level: CredentialLevel): number {
  return [0, 0.15, 0.3, 0.5, 0.7][credentialRank(level)] ?? 0;
}

// Whether the worker owns the tools of this trade (a Phase 7 EQUIPMENT upgrade or a
// starting tools asset), which lifts a day rate (idea 1: buying work tools raises pay).
function ownsTradeTools(agent: NPCAgent, industry: Industry): boolean {
  const hasEquipment = (assets: { type: string }[]): boolean => assets.some((a) => a.type === 'EQUIPMENT');
  if (hasEquipment(agent.economicAssets)) return true;
  for (const v of activeVentures(agent)) {
    if (v.industry === industry && hasEquipment(v.assets)) return true;
  }
  return false;
}

// The skill multiplier on a green-hire day rate: experience and what the worker
// knows in the trade, owning the tools, and a credential each lift it, to a
// realistic ceiling. A brand-new worker (no skill, no tools, no paper) sits at 1.
export function wageSkillMultiplier(agent: NPCAgent, industry: Industry): number {
  const domain = INDUSTRY_DOMAIN[industry];
  const skill = agent.experience[domain] ?? 0;
  const learned = agent.knowledge[domain] ?? 0;
  const credential = credentialRateBonus(agent.education?.level ?? 'NONE');
  const tools = ownsTradeTools(agent, industry) ? 0.2 : 0;
  const mult = 1 + skill * 0.8 + learned * 0.4 + credential + tools;
  return clamp(mult, 1, WAGE_RATE_CEILING_MULTIPLIER);
}

// The worker's current day rate: the green-hire base scaled by their skill.
export function wageDailyRate(agent: NPCAgent, industry: Industry): number {
  return Math.round(DOMINICA_BASE_DAY * NEW_WORKER_RATE_PREMIUM * wageSkillMultiplier(agent, industry));
}

// The monthly income a wage profile banks — dailyRate × workdays, so the per-day and
// per-month figures always reconcile (idea 1).
export function wageMonthlyIncome(profile: WageProfile): number {
  return Math.round(profile.dailyRate * profile.workdaysPerMonth);
}

// Refresh the stored day rate on the player's wage profile(s) from their current
// skill, so the money and skills views (and the income computed below) read a fresh,
// growing rate (P15.2). Mutates only wage profiles; a no-op for a non-wage player, so
// the digest holds. Called from updatePlayerIncome before income is summed.
export function refreshWageRates(world: { player: NPCAgent }): void {
  const p = world.player;
  if (p.wageProfile && isWageIndustry(p.occupation)) {
    p.wageProfile.dailyRate = wageDailyRate(p, p.occupation);
  }
  for (const v of activeVentures(p)) {
    if (v.wageProfile && isWageIndustry(v.industry)) {
      v.wageProfile.dailyRate = wageDailyRate(p, v.industry);
    }
  }
}
