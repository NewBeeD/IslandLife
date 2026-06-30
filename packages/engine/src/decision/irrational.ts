import type { Government, NPCAgent } from '@island/shared';
import { clamp } from '../rng';
import { tagOf } from './tags';

// ── Irrational overrides (C7/A6, P19.4) ──────────────────────────────────────
// People are not spreadsheets: they herd into a boom, panic in a bust, get cocky
// after a good run, and cling to a brand long past the point reason would. This
// module layers those four bounded irrationalities *on top of* the rational call —
// they perturb the prospect-theory score (P19.1), tilted by archetype (P19.2) and
// memory (P19.3), they never replace it. Like the sibling tilts it is a small,
// clamped multiplier, so the rational math still leads and the best operators still
// win over many games (C8 — irrationality is noise, not dominance).
//
//   • Herd behaviour — pile into growth when the cycle is hot, flee it when it
//     turns; strongest for the socially conforming (extraversion + agreeableness).
//   • Panic — over-cut and bail in a downturn, scaled by `neuroticism` (the anxious
//     over-react; the steady ride it out).
//   • Overconfidence — over-expand after a personal good run, scaled by *low*
//     neuroticism and high extraversion (the calm and bold over-reach).
//   • Brand-loyalty stickiness — over-value holding the established brand and one's
//     own venture, scaled by agreeableness + conscientiousness (loyalty/habit).
//
// Every coefficient is read off OCEAN traits already on the agent and macro signals
// already on the world — no new stored field (S5). Pure and deterministic: identical
// inputs yield an identical tilt, so it reproduces per seed (S2). Hidden state — the
// impulse never crosses the wire, only the action it colours does (S3).

// How hard the irrational tilt can push the score (a ±40% band at the extremes), in
// line with the archetype and memory tilts. Character and mood *colour* the rational
// call; the prospect math still decides.
const IRRATIONAL_STRENGTH = 0.4;

// The "normal" unemployment rate the cycle is read against — below it the economy
// runs hot (a boom), above it cold (a bust). Matches the ~0.12–0.15 band the
// government treats as elevated (`government.ts`).
const NORMAL_UNEMPLOYMENT = 0.12;

// The agent's read of the moment: where the macro cycle sits and how their own
// recent run has gone. Both in [-1, 1]; computed once per decision and shared across
// the candidates so the whole choice sees one coherent mood.
export interface MarketMood {
  heat: number; // −1 deep bust … +1 roaring boom
  run: number; // −1 just got wiped out … +1 just had a great month
}

// The trait fields the tilt reads (a subset of the agent).
export type IrrationalTraits = Pick<
  NPCAgent,
  'extraversion' | 'agreeableness' | 'conscientiousness' | 'neuroticism'
>;

// The macro signals the cycle is read from (a subset of the government).
type MacroSignals = { government: Pick<Government, 'unemploymentRate' | 'publicSentiment'> };

// Where the business cycle sits, from the macro signals on the world. Low
// unemployment (and, once Phase 20 moves it, buoyant public sentiment) reads as a
// boom; a spike in unemployment reads as a bust. Public sentiment sits at a neutral
// 0.5 today so it contributes nothing yet — it is wired in ahead of the systems that
// will swing it, so the cycle responds the moment they land.
export function marketHeat(world: MacroSignals): number {
  const u = world.government.unemploymentRate;
  const fromJobs = (NORMAL_UNEMPLOYMENT - u) / NORMAL_UNEMPLOYMENT;
  const fromMood = (world.government.publicSentiment - 0.5) * 2;
  return clamp(0.7 * fromJobs + 0.3 * fromMood, -1, 1);
}

// How the agent's own recent run has gone — this month's cash against last month's,
// as a bounded relative swing. A big gain reads as a hot streak (feeds
// overconfidence), a big drop as a cold one.
export function personalRun(agent: Pick<NPCAgent, 'cash' | 'previousMonthCapital'>): number {
  const base = Math.max(1, Math.abs(agent.previousMonthCapital));
  return clamp((agent.cash - agent.previousMonthCapital) / base, -1, 1);
}

// The agent's mood for this decision — the macro cycle plus their personal run.
export function marketMood(
  agent: Pick<NPCAgent, 'cash' | 'previousMonthCapital'>,
  world: MacroSignals,
): MarketMood {
  return { heat: marketHeat(world), run: personalRun(agent) };
}

// The four impulses, as trait-scaled coefficients in [0, 1].
function coefficients(agent: IrrationalTraits) {
  return {
    herd: 0.5 * agent.extraversion + 0.5 * agent.agreeableness,
    panic: agent.neuroticism,
    overconf: (1 - agent.neuroticism) * agent.extraversion,
    loyalty: 0.5 * agent.agreeableness + 0.5 * agent.conscientiousness,
  };
}

// The raw irrational signal for one action tag, in (roughly) [-1, 1] before clamping:
// the sum of whichever impulses bear on a move of that kind.
function rawSignal(
  tag: NonNullable<ReturnType<typeof tagOf>>,
  mood: MarketMood,
  c: ReturnType<typeof coefficients>,
): number {
  const boom = Math.max(0, mood.heat);
  const bust = Math.max(0, -mood.heat);
  const win = Math.max(0, mood.run);
  switch (tag) {
    // Growth moves: herd into them when the cycle is hot and out when it turns,
    // over-reach after a personal win, and freeze in a downturn (panic kills growth).
    case 'EXPAND':
    case 'BORROW':
      return c.herd * mood.heat + c.overconf * win - c.panic * bust;
    // Competing is a growth move too, but a brand-loyal operator resists churning
    // into a price war.
    case 'COMPETE':
      return c.herd * mood.heat + c.overconf * win - 0.5 * c.loyalty;
    // Defensive moves: the anxious over-cut and bail when the cycle turns down.
    case 'CUT_COST':
      return c.panic * bust;
    case 'EXIT':
      return c.panic * bust - 0.5 * c.loyalty; // …but loyalty resists quitting one's own venture
    // Sitting tight: a downturn makes the anxious freeze rather than act.
    case 'HOLD':
      return 0.5 * c.panic * bust;
    // Brand stickiness: a standing over-valuation of the established brand.
    case 'BRAND':
      return 0.6 * c.loyalty;
    default:
      return 0; // EARN, INNOVATE: no irrational impulse bears on them
  }
}

// The irrational multiplier this agent's mood puts on an action of the given type —
// ≈1 when no impulse bears on it (e.g. EARN, or a placid neutral cycle), up to ~1.4
// for a move the moment seduces them into, down to ~0.6 for one the moment scares
// them off. Folded over the P19.1/P19.2/P19.3 score in the decision step.
export function irrationalBias(
  agent: IrrationalTraits,
  mood: MarketMood,
  actionType: string,
): number {
  const tag = tagOf(actionType);
  if (!tag) return 1;
  const signal = clamp(rawSignal(tag, mood, coefficients(agent)), -1, 1);
  return clamp(1 + IRRATIONAL_STRENGTH * signal, 0.6, 1.5);
}
