import {
  INDUSTRY_DOMAIN,
  OFFER_REOFFER_COOLDOWN_MONTHS,
  credentialRank,
  hasRecentEquivalentOffer,
} from '@island/shared';
import type {
  CredentialLevel,
  Education,
  EducationProgram,
  EnrolledProgram,
  NPCAgent,
  Opportunity,
  PlayerDecision,
  WorldState,
} from '@island/shared';
import { clamp01 } from './rng';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 9 — education & credentials.
//
// The player can invest money + time in a program (certificate → associate →
// degree → master's). Tuition is a real monthly cash drain while enrolled; on
// completion the relevant knowledge rises, the credential advances, and gated
// opportunities open. Pure (S1) and additive: an agent with no `education` is
// byte-identical to before (the digest holds). Only the player enrols in Phase 9.
// ─────────────────────────────────────────────────────────────────────────────

const EDUCATION_CHANNEL = 'COMMUNITY_COLLEGE';
const EDUCATION_WINDOW = 2; // months the enrolment offer stays open
const EDUCATION_COOLDOWN = 3; // months after an offer lapses/declines before another
// Affordability gate: the player needs a few months' tuition in hand to start.
const AFFORD_MONTHS = 3;

// The program catalogue — a GENERAL academic track plus a couple of field tracks.
// Each step requires the level below it, so a player climbs one rung at a time.
const PROGRAM_CATALOGUE: EducationProgram[] = [
  { programId: 'EDU_CERT_GEN', name: 'a skills certificate at the community college', field: 'GENERAL', targetLevel: 'CERTIFICATE', prerequisite: 'NONE', totalCost: 3000, durationMonths: 6 },
  { programId: 'EDU_CERT_MARINE', name: 'a marine studies certificate', field: 'FISHING', targetLevel: 'CERTIFICATE', prerequisite: 'NONE', totalCost: 3600, durationMonths: 8 },
  { programId: 'EDU_ASSOC_GEN', name: 'an associate degree', field: 'GENERAL', targetLevel: 'ASSOCIATE', prerequisite: 'CERTIFICATE', totalCost: 9000, durationMonths: 18 },
  { programId: 'EDU_ASSOC_BUSINESS', name: 'an associate in business studies', field: 'RETAIL', targetLevel: 'ASSOCIATE', prerequisite: 'CERTIFICATE', totalCost: 10000, durationMonths: 18 },
  { programId: 'EDU_DEGREE_GEN', name: "a bachelor's degree at the State College", field: 'GENERAL', targetLevel: 'DEGREE', prerequisite: 'ASSOCIATE', totalCost: 24000, durationMonths: 36 },
  { programId: 'EDU_MASTERS_GEN', name: "a master's degree, much of it online", field: 'GENERAL', targetLevel: 'MASTERS', prerequisite: 'DEGREE', totalCost: 30000, durationMonths: 24 },
];

// The player's current credential. Undefined education === NONE (the digest holds).
export function credentialLevelOf(agent: NPCAgent): CredentialLevel {
  return agent.education?.level ?? 'NONE';
}

export function isEnrolled(agent: NPCAgent): boolean {
  return agent.education?.enrolled != null;
}

// Ensure the agent has an education record to mutate.
function ensureEducation(agent: NPCAgent): Education {
  if (!agent.education) agent.education = { level: 'NONE', enrolled: null };
  return agent.education;
}

export function monthlyTuition(program: EducationProgram): number {
  return Math.round(program.totalCost / program.durationMonths);
}

// Programs the player could enrol in now: the next rung from their current level
// that they can afford and are not already studying.
export function eligiblePrograms(world: WorldState): EducationProgram[] {
  const p = world.player;
  if (isEnrolled(p)) return [];
  const current = credentialLevelOf(p);
  return PROGRAM_CATALOGUE.filter((prog) => {
    if (prog.prerequisite !== current) return false; // one rung at a time
    if (credentialRank(prog.targetLevel) <= credentialRank(current)) return false; // already held
    return p.cash >= monthlyTuition(prog) * AFFORD_MONTHS; // affordable to start
  });
}

// Whether an enrolment offer is on cooldown (one open at a time + a gap after one lapses).
function educationOnCooldown(world: WorldState): boolean {
  let lastClosed = -Infinity;
  for (const o of world.opportunities) {
    if (o.kind !== 'EDUCATION_ENROLMENT') continue;
    if (o.status === 'OPEN') return true;
    const closed = o.surfacedMonth + o.windowMonths;
    if (closed > lastClosed) lastClosed = closed;
  }
  return world.month - lastClosed < EDUCATION_COOLDOWN;
}

// Surface an enrolment opportunity if the player is eligible. Deterministic (reads
// world state, never world.rng — like the Eunice/upgrade filters, so it does not
// disturb the replay's RNG sequence): it offers the next rung, preferring the
// general academic track. Returns the opportunity, or null.
export function surfaceEducation(world: WorldState): Opportunity | null {
  if (isEnrolled(world.player) || educationOnCooldown(world)) return null;
  const eligible = eligiblePrograms(world);
  if (eligible.length === 0) return null;
  // The lowest rung available; among ties (same target level), prefer GENERAL.
  const lowestRank = Math.min(...eligible.map((p) => credentialRank(p.targetLevel)));
  const atLowest = eligible.filter((p) => credentialRank(p.targetLevel) === lowestRank);
  const program = atLowest.find((p) => p.field === 'GENERAL') ?? atLowest[0]!;

  // P13.1 — don't re-surface an enrolment the player just let lapse/declined, so a
  // stale "go back to study" offer for the same program stops duplicating (idea 6).
  if (
    hasRecentEquivalentOffer(
      world.opportunities,
      `EDUCATION_ENROLMENT:${program.programId}`,
      world.month,
      OFFER_REOFFER_COOLDOWN_MONTHS,
    )
  ) {
    return null;
  }

  const oppId = `OPP_${program.programId}_${world.month}`;
  const decId = `DEC_${program.programId}_${world.month}`;
  const cost = monthlyTuition(program);
  const options: PlayerDecision['options'] = [
    {
      id: 'ENROL',
      label: `Enrol — take up ${program.name}`,
      description:
        `${formatEc(program.totalCost)} over ${program.durationMonths} months — about ` +
        `${formatEc(cost)} a month while you study. It is money out of pocket every month ` +
        `with nothing to show until you finish, but a qualification opens doors that stay ` +
        `shut otherwise.`,
      effect: { enrol: true },
    },
    {
      id: 'NOT_NOW',
      label: 'Leave it for now',
      description:
        'The money stays in your pocket and your time stays your own. The chance will likely ' +
        'come round again, but the years do not wait.',
      effect: { enrol: false },
    },
  ];

  const decision: PlayerDecision = {
    id: decId,
    opportunityId: oppId,
    kind: 'EDUCATION_ENROLMENT',
    surfacedMonth: world.month,
    windowMonths: EDUCATION_WINDOW,
    options,
    chosenOptionId: null,
    resolvedMonth: null,
    consequenceMonth: null, // completion narrative is driven by detectEducationCompletions
    consequenceDelivered: false,
  };
  const opportunity: Opportunity = {
    id: oppId,
    kind: 'EDUCATION_ENROLMENT',
    industry: program.field === 'GENERAL' ? 'FINANCE' : program.field, // nominal; not surfaced
    npcName: 'the community college',
    channelId: EDUCATION_CHANNEL,
    surfacedMonth: world.month,
    windowMonths: EDUCATION_WINDOW,
    status: 'OPEN',
    decisionId: decId,
    monthlyAmount: 0,
    enrolment: program,
  };
  world.opportunities.push(opportunity);
  world.decisions.push(decision);
  return opportunity;
}

// Commit a program onto the player (called when the enrol option resolves).
export function enrolPlayer(world: WorldState, program: EducationProgram): void {
  const enrolled: EnrolledProgram = {
    programId: program.programId,
    name: program.name,
    field: program.field,
    targetLevel: program.targetLevel,
    monthsRemaining: program.durationMonths,
    monthlyCost: monthlyTuition(program),
    completionMonth: world.month + program.durationMonths,
  };
  ensureEducation(world.player).enrolled = enrolled;
}

// The tuition due from an agent this month; decrements the remaining term. 0 for
// everyone not enrolled, so NPC/default-player cash math is unchanged (the digest
// holds). Called once per agent per month in simulateOneMonth phase 5.
export function chargeTuition(agent: NPCAgent): number {
  const e = agent.education?.enrolled;
  if (!e || e.monthsRemaining <= 0) return 0;
  e.monthsRemaining -= 1;
  return e.monthlyCost;
}

// Apply a completed program's effects: raise the relevant knowledge + general
// literacy + cultural capital, and advance the credential.
function applyCompletion(agent: NPCAgent, e: EnrolledProgram): void {
  const rank = credentialRank(e.targetLevel);
  const gain = 0.08 + 0.04 * rank; // a higher credential is a bigger lift
  const k = agent.knowledge;
  if (e.field === 'GENERAL') {
    k.generalLiteracy = clamp01(k.generalLiteracy + gain);
  } else {
    const domain = INDUSTRY_DOMAIN[e.field];
    k[domain] = clamp01(k[domain] + gain);
    k.generalLiteracy = clamp01(k.generalLiteracy + gain * 0.5);
  }
  agent.culturalCapital = clamp01(agent.culturalCapital + 0.04 + 0.02 * rank);
  ensureEducation(agent).level = e.targetLevel;
}

// Finalize any program whose term has run out: apply its effects, advance the
// credential, clear enrolment, and return the completed programs so the caller
// (advance) can render a completion MEMORY. Mirrors detectDueConsequences.
export function detectEducationCompletions(world: WorldState): EnrolledProgram[] {
  const done: EnrolledProgram[] = [];
  for (const agent of world.agents) {
    const e = agent.education?.enrolled;
    if (e && e.monthsRemaining <= 0) {
      applyCompletion(agent, e);
      agent.education!.enrolled = null;
      done.push(e);
    }
  }
  return done;
}

function formatEc(n: number): string {
  return `EC$${Math.round(n).toLocaleString('en-US')}`;
}
