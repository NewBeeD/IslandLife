import type { NPCAgent } from '@island/shared';
import { clamp } from '../rng';

// ── Personality archetypes (A23) ─────────────────────────────────────────────
// Each NPC has a *standing strategy* — the kind of operator they tend to be —
// derived entirely from the OCEAN traits and tendencies already on the agent (so no
// new stored field is needed; this is recomputed, S5). It is deliberately a *soft*
// blend, never a hard label: an agent is "mostly conservative with a streak of
// predator," not a CONSERVATIVE. The blend becomes a small multiplier over the
// prospect-theory scores from P19.1, tilting an agent toward the actions their
// character favours — a predator leans into competition and expansion, a
// conservative into holding. It is hidden state: the archetype is *inferable from
// what an agent does*, but never crosses the wire as a label (S3).

export type Archetype =
  | 'RISK_TAKER'
  | 'CONSERVATIVE'
  | 'INNOVATOR'
  | 'COST_CUTTER'
  | 'BRAND_BUILDER'
  | 'PREDATOR';

export const ARCHETYPES: readonly Archetype[] = [
  'RISK_TAKER',
  'CONSERVATIVE',
  'INNOVATOR',
  'COST_CUTTER',
  'BRAND_BUILDER',
  'PREDATOR',
];

// The strategic flavour of an action. The live actions today are EARN/HOLD; the
// rest are the vocabulary P19.5 (firm formation/exit) and Phase 20 (competition)
// will speak, wired here ahead of time so archetypes shape them the moment they land.
export type ActionTag =
  | 'EARN'
  | 'HOLD'
  | 'EXPAND'
  | 'BORROW'
  | 'INNOVATE'
  | 'COMPETE'
  | 'CUT_COST'
  | 'EXIT'
  | 'BRAND';

// Map an action candidate's `type` to its strategic tag. Unknown types are neutral.
const TAG_BY_ACTION: Record<string, ActionTag> = {
  SEEK_EMPLOYMENT: 'EARN',
  SAVE: 'HOLD',
  START_BUSINESS: 'EXPAND',
  EXPAND: 'EXPAND',
  BORROW: 'BORROW',
  EXIT: 'EXIT',
  COMPETE: 'COMPETE',
  CUT_PRICE: 'COMPETE',
  INNOVATE: 'INNOVATE',
  BRAND: 'BRAND',
  CUT_COST: 'CUT_COST',
};

// Each archetype's taste for each tag, in [-1, 1] (0 = indifferent). A predator
// loves to compete and expand and hates to sit still; a conservative is the mirror.
const PREFERENCE: Record<Archetype, Partial<Record<ActionTag, number>>> = {
  RISK_TAKER: { EXPAND: 0.9, BORROW: 0.7, COMPETE: 0.4, INNOVATE: 0.3, HOLD: -0.6, EXIT: -0.3 },
  CONSERVATIVE: { HOLD: 0.9, EARN: 0.4, CUT_COST: 0.3, EXIT: 0.3, EXPAND: -0.7, BORROW: -0.8, COMPETE: -0.4 },
  INNOVATOR: { INNOVATE: 0.9, EXPAND: 0.5, BRAND: 0.4, HOLD: -0.3, CUT_COST: -0.2 },
  COST_CUTTER: { CUT_COST: 0.9, HOLD: 0.4, EARN: 0.2, EXPAND: -0.4, BRAND: -0.4, BORROW: -0.3 },
  BRAND_BUILDER: { BRAND: 0.9, EXPAND: 0.4, COMPETE: 0.3, INNOVATE: 0.2, CUT_COST: -0.5 },
  PREDATOR: { COMPETE: 0.9, EXPAND: 0.7, CUT_COST: 0.3, BORROW: 0.3, HOLD: -0.7, EXIT: -0.2 },
};

// How hard the archetype tilt can push the prospect score (a ±40% band at the
// extremes). Small on purpose — character *colours* the rational call (P19.1), it
// does not override it (the prospect math still leads).
const BIAS_STRENGTH = 0.4;

// The trait fields the derivation reads (a subset of the agent).
export type ArchetypeTraits = Pick<
  NPCAgent,
  | 'openness'
  | 'conscientiousness'
  | 'extraversion'
  | 'agreeableness'
  | 'cognitiveAbility'
  | 'selfControl'
  | 'riskTolerance'
  | 'lossAversion'
>;

// The agent's soft archetype blend: a normalized weight per archetype (sums to 1).
// "Mostly X" falls out as the largest weight, but every agent is a mix.
export function archetypeAffinities(agent: ArchetypeTraits): Record<Archetype, number> {
  const raw: Record<Archetype, number> = {
    RISK_TAKER: 0.5 * agent.riskTolerance + 0.3 * agent.openness + 0.2 * (1 - agent.lossAversion),
    CONSERVATIVE:
      0.5 * agent.lossAversion + 0.3 * agent.conscientiousness + 0.2 * (1 - agent.openness),
    INNOVATOR: 0.5 * agent.openness + 0.5 * agent.cognitiveAbility,
    COST_CUTTER:
      0.5 * agent.conscientiousness + 0.3 * agent.selfControl + 0.2 * (1 - agent.agreeableness),
    BRAND_BUILDER: 0.5 * agent.extraversion + 0.3 * agent.agreeableness + 0.2 * agent.openness,
    PREDATOR: 0.4 * (1 - agent.agreeableness) + 0.3 * agent.riskTolerance + 0.3 * agent.extraversion,
  };
  let total = 0;
  for (const arch of ARCHETYPES) total += raw[arch];
  if (total <= 0) {
    const even = 1 / ARCHETYPES.length;
    return Object.fromEntries(ARCHETYPES.map((a) => [a, even])) as Record<Archetype, number>;
  }
  return Object.fromEntries(ARCHETYPES.map((a) => [a, raw[a] / total])) as Record<Archetype, number>;
}

// The agent's leading archetype (for inference/tests). Ties resolve in ARCHETYPES
// order, so it is deterministic. This is never projected — it is read off behaviour.
export function dominantArchetype(agent: ArchetypeTraits): Archetype {
  const aff = archetypeAffinities(agent);
  let best: Archetype = ARCHETYPES[0]!;
  for (const arch of ARCHETYPES) if (aff[arch] > aff[best]) best = arch;
  return best;
}

// The soft multiplier the agent's archetype blend puts on an action of this type —
// ≈1 for a neutral fit, up to ~1.4 for an action the character loves, down to ~0.6
// for one it shuns. Applied over the P19.1 prospect score in the decision step.
export function archetypeBias(agent: ArchetypeTraits, actionType: string): number {
  const tag = TAG_BY_ACTION[actionType];
  if (!tag) return 1;
  const aff = archetypeAffinities(agent);
  let raw = 0;
  for (const arch of ARCHETYPES) raw += aff[arch] * (PREFERENCE[arch][tag] ?? 0);
  return clamp(1 + BIAS_STRENGTH * raw, 0.6, 1.5);
}
