import type { Industry, NarrativeEntryType, WorldState } from '@island/shared';

// Layer-2 generation fires on significant events — the moments templates can't do
// justice. The full catalogue from the Narrative Generation doc; the slice
// implements the ones the simulation can actually surface today (hurricane, first
// business, the annual reflection). The rest land with their systems (Phase 6+).
export const LLM_GENERATION_TRIGGERS = [
  // Life events
  'FAMILY_MEMBER_DEATH',
  'CHILD_BORN',
  'MARRIAGE',
  'SERIOUS_ILLNESS',
  'MENTOR_CONTACT',
  // Economic events
  'HURRICANE_MAJOR',
  'BUSINESS_FAILURE',
  'FIRST_BUSINESS_STARTED',
  'LOAN_DEFAULT',
  'MAJOR_CONTRACT_WON',
  // The economic web (Phase 20.5): the wider causes that ripple across the island.
  'CREDIT_CRUNCH',
  'COMPETITIVE_SQUEEZE',
  // Decision moments
  'MIGRATION_OPPORTUNITY',
  'MAJOR_INVESTMENT_DECISION',
  // Milestone moments
  'ANNUAL_REFLECTION',
  'DECADE_MILESTONE',
  'DEATH_AND_LEGACY',
] as const;

export type LLMTriggerId = (typeof LLM_GENERATION_TRIGGERS)[number];

// A fired trigger: its id, the narrative entry type the resulting prose will carry,
// and trigger-specific data the user prompt is built from. `data` holds only
// already-qualitative or already-public facts (no hidden scores) — the iceberg
// boundary holds even inside the prompt assembler.
export interface LLMTrigger {
  id: LLMTriggerId;
  narrativeType: NarrativeEntryType;
  data: Record<string, unknown>;
}

// The narrative entry type each trigger produces.
const TRIGGER_NARRATIVE_TYPE: Record<LLMTriggerId, NarrativeEntryType> = {
  FAMILY_MEMBER_DEATH: 'MEMORY',
  CHILD_BORN: 'PERSONAL',
  MARRIAGE: 'PERSONAL',
  SERIOUS_ILLNESS: 'PERSONAL',
  MENTOR_CONTACT: 'COMMUNITY',
  HURRICANE_MAJOR: 'OBSERVATION',
  BUSINESS_FAILURE: 'PERSONAL',
  FIRST_BUSINESS_STARTED: 'PERSONAL',
  LOAN_DEFAULT: 'PERSONAL',
  MAJOR_CONTRACT_WON: 'PERSONAL',
  CREDIT_CRUNCH: 'OBSERVATION',
  COMPETITIVE_SQUEEZE: 'OBSERVATION',
  MIGRATION_OPPORTUNITY: 'DECISION_REQUIRED',
  MAJOR_INVESTMENT_DECISION: 'DECISION_REQUIRED',
  ANNUAL_REFLECTION: 'MEMORY',
  DECADE_MILESTONE: 'MEMORY',
  DEATH_AND_LEGACY: 'MEMORY',
};

export function narrativeTypeFor(id: LLMTriggerId): NarrativeEntryType {
  return TRIGGER_NARRATIVE_TYPE[id];
}

// A stable key for one fired trigger in one save-month. The server uses it to
// dedupe persistence and to serve a prefetched entry the moment its trigger fires.
export function triggerKey(saveId: string, month: number, id: LLMTriggerId): string {
  return `${saveId}:${month}:${id}`;
}

// What we must know about the world *before* advancing to detect a transition
// (a new business, a freshly-formed storm) afterward. Captured pre-advance.
export interface TriggerSnapshot {
  month: number;
  businessesStartedCount: number;
  creditTight: boolean; // the credit-crunch mood before advancing (P20.5, for onset)
  tradeRivals: number; // founded rivals in the player's trade before advancing (P20.5)
}

// Whether the island's credit is visibly frozen or sharply dearer — a credit crunch,
// read qualitatively off the macro state (never the raw figures, S3).
function creditTightNow(world: WorldState): boolean {
  const m = world.macro;
  return (
    m.systemicStress > 0.12 ||
    m.creditAvailability < 0.45 ||
    m.effectiveInterestRate - world.country.baseInterestRate > 0.05
  );
}

// Founded rivals crowding the player's own parish×industry — the competitive scrum.
function tradeRivalsNow(world: WorldState): number {
  const occ = world.player.occupation;
  if (!occ) return 0;
  return world.companies.filter(
    (c) =>
      c.status !== 'CLOSED' &&
      c.id.startsWith('CO_') &&
      c.industry === occ &&
      c.parish === world.player.parish,
  ).length;
}

const TRADE_CROWDED_THRESHOLD = 3;

export function captureTriggerSnapshot(world: WorldState): TriggerSnapshot {
  return {
    month: world.month,
    businessesStartedCount: world.player.businessesStarted.length,
    creditTight: creditTightNow(world),
    tradeRivals: tradeRivalsNow(world),
  };
}

// Detect the Layer-2 triggers that fired in the month just simulated. `prev` is
// the snapshot taken before `simulateOneMonth`; without it, only state-derivable
// triggers (the hurricane, the annual reflection) can be found. Pure — reads world,
// never world.rng.
export function detectTriggers(world: WorldState, prev?: TriggerSnapshot): LLMTrigger[] {
  const triggers: LLMTrigger[] = [];
  const player = world.player;
  const occupation = player.occupation;

  // HURRICANE_MAJOR — a major storm that formed THIS month and touches the
  // player's livelihood (or the player has none, in which case the island-wide
  // disruption still lands).
  const newMajorHurricane = world.events.find(
    (e) =>
      e.definitionId === 'HURRICANE_MAJOR' &&
      e.startedMonth === world.month &&
      (occupation === null || e.affectedIndustries.includes(occupation)),
  );
  if (newMajorHurricane) {
    triggers.push({
      id: 'HURRICANE_MAJOR',
      narrativeType: narrativeTypeFor('HURRICANE_MAJOR'),
      data: {
        severity: newMajorHurricane.severity,
        durationMonths: newMajorHurricane.durationRemaining,
        affectedIndustries: newMajorHurricane.affectedIndustries,
        hasPreWarning: false,
        playerIndustryHit: occupation !== null && newMajorHurricane.affectedIndustries.includes(occupation),
      },
    });
  }

  // FIRST_BUSINESS_STARTED — a new business appeared on the player this month.
  if (prev && player.businessesStarted.length > prev.businessesStartedCount) {
    const started = player.businessesStarted[player.businessesStarted.length - 1]!;
    triggers.push({
      id: 'FIRST_BUSINESS_STARTED',
      narrativeType: narrativeTypeFor('FIRST_BUSINESS_STARTED'),
      data: {
        industry: started.industry,
        wasFirstInIndustryInParish: started.wasFirstInIndustryInParish,
      },
    });
  }

  // CREDIT_CRUNCH — the island's credit freezes THIS month (an onset, not every month
  // of a long crunch). Needs the pre-advance snapshot to see the transition.
  if (prev && !prev.creditTight && creditTightNow(world)) {
    triggers.push({
      id: 'CREDIT_CRUNCH',
      narrativeType: narrativeTypeFor('CREDIT_CRUNCH'),
      data: { parish: player.parish },
    });
  }

  // COMPETITIVE_SQUEEZE — the player's trade crosses into a crowded scrum this month
  // (rivals rising past the threshold), the "everybody's chasing the trade you cornered"
  // moment (C9). An onset, keyed on the crossing so it fires once as the crowd arrives.
  if (
    prev &&
    prev.tradeRivals < TRADE_CROWDED_THRESHOLD &&
    tradeRivalsNow(world) >= TRADE_CROWDED_THRESHOLD
  ) {
    triggers.push({
      id: 'COMPETITIVE_SQUEEZE',
      narrativeType: narrativeTypeFor('COMPETITIVE_SQUEEZE'),
      data: { industry: occupation, parish: player.parish },
    });
  }

  // ANNUAL_REFLECTION — end of the playing year (December), once a year, not at
  // the very start of the life.
  if (world.month > 0 && world.month % 12 === 11) {
    triggers.push({
      id: 'ANNUAL_REFLECTION',
      narrativeType: narrativeTypeFor('ANNUAL_REFLECTION'),
      data: { yearNumber: Math.floor(world.month / 12) + 1 },
    });
  }

  return triggers;
}

// Predict the triggers most likely to fire over the next `monthsAhead` months so
// the prefetcher can warm them during idle time (P5.4). Conservative — it only
// predicts the deterministic milestone (the upcoming annual reflection); stochastic
// events (the hurricane) are not predicted, only cached once they actually fire.
export function predictLikelyTriggers(world: WorldState, monthsAhead: number): LLMTrigger[] {
  const out: LLMTrigger[] = [];
  for (let i = 1; i <= monthsAhead; i++) {
    const futureMonth = world.month + i;
    if (futureMonth > 0 && futureMonth % 12 === 11) {
      out.push({
        id: 'ANNUAL_REFLECTION',
        narrativeType: narrativeTypeFor('ANNUAL_REFLECTION'),
        data: { yearNumber: Math.floor(futureMonth / 12) + 1, prefetchForMonth: futureMonth },
      });
    }
  }
  return out;
}

// Industries, re-exported for the prompt layer's convenience.
export type { Industry };
