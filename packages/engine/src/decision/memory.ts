import type { ActionTag, AgentObservation, NPCAgent } from '@island/shared';
import { clamp } from '../rng';
import { tagOf } from './tags';

// ── Observation memory & learning (C10/A15, P19.3) ───────────────────────────
// Agents carry a small bounded ring of recently observed moves — their own and
// watched competitors' — and the decision engine condition its choices on it. The
// learning is intentionally shallow and *aggregate* (S8): a recency-weighted read of
// "how did this kind of move go lately," turned into a soft tilt over the P19.1/P19.2
// score. Two behaviours fall out of one rule:
//   • an agent who keeps losing on price (negative COMPETE memory) stops competing
//     on price and the pressure flows into differentiation (BRAND/INNOVATE) — the
//     "shift to quality/premium," and
//   • a move seen to pay (positive memory for its tag) gets repeated — competitors
//     copy a winning move.
// Pure and deterministic: identical memory yields an identical tilt, so it reproduces
// per seed (S2). Hidden state — never crosses the wire (S3).

// The fixed size of the ring (S8 — bounded memory, not a full history).
export const MEMORY_CAPACITY = 8;
// Weight an observation keeps per month of age (recent moves matter more).
const RECENCY_DECAY = 0.85;
// How hard memory can push the score (a ±45% band at the extremes). Like the
// archetype tilt, it colours the rational call; the prospect math still leads.
const LEARN_STRENGTH = 0.45;

type Memoried = Pick<NPCAgent, 'observations'>;

// Append an observed move to the agent's ring, dropping the oldest when it overflows.
export function recordObservation(agent: Memoried, obs: AgentObservation): void {
  const ring = (agent.observations ??= []);
  ring.push(obs);
  if (ring.length > MEMORY_CAPACITY) ring.splice(0, ring.length - MEMORY_CAPACITY);
}

// The recency-weighted mean outcome the agent remembers for a given tag (0 if it has
// no memory of that tag).
function recencyMean(obs: AgentObservation[], tag: ActionTag, month: number): number {
  let wsum = 0;
  let osum = 0;
  for (const o of obs) {
    if (o.tag !== tag) continue;
    const w = Math.pow(RECENCY_DECAY, Math.max(0, month - o.month));
    wsum += w;
    osum += w * o.outcome;
  }
  return wsum > 0 ? osum / wsum : 0;
}

// The learned multiplier the agent's memory puts on an action of this type — ≈1 with
// no relevant memory, above 1 for a kind of move that has been paying off, below 1
// for one that keeps losing. Applied over the P19.1/P19.2 score in the decision step.
export function learnedBias(agent: Memoried, actionType: string, month: number): number {
  const tag = tagOf(actionType);
  if (!tag) return 1;
  const obs = agent.observations;
  if (!obs || obs.length === 0) return 1;

  let signal = recencyMean(obs, tag, month);
  // The "shift": when price-competition keeps losing, the freed preference flows into
  // differentiation — a punished COMPETE memory lifts BRAND/INNOVATE.
  if (tag === 'BRAND' || tag === 'INNOVATE') {
    const compete = recencyMean(obs, 'COMPETE', month);
    if (compete < 0) signal += 0.5 * -compete;
  }
  signal = clamp(signal, -1, 1);
  return clamp(1 + LEARN_STRENGTH * signal, 0.6, 1.5);
}
