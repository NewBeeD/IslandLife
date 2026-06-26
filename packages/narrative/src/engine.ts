import type { NarrativeEntry, WorldState } from '@island/shared';
import { buildContext, type MonthContext, type Template } from './context';
import {
  COMMUNITY_TEMPLATES,
  EVENT_TEMPLATES,
  FINANCE_TEMPLATES,
  INCOME_TEMPLATES,
  MARKET_TEMPLATES,
  SEASON_TEMPLATES,
} from './templates';

const MAX_ENTRIES = 8;

// Each template's `match` may consume the deterministic PRNG, so call it exactly
// once per template per month.
function firstMatch(templates: Template[], ctx: MonthContext): Template | undefined {
  return templates.find((t) => t.match(ctx));
}
function allMatches(templates: Template[], ctx: MonthContext): Template[] {
  return templates.filter((t) => t.match(ctx));
}

// Layer-1 narrative for one advanced month: 3–8 grounded template entries built
// purely from world state. Deterministic in (seed, month) and side-effect free —
// it never draws from world.rng, so generating prose can't perturb the engine.
// Significant events (Layer 2 / Claude) are added on top in Phase 5.
export function generateMonthlyEntries(world: WorldState): NarrativeEntry[] {
  const ctx = buildContext(world);
  const chosen: Template[] = [];

  // 1. Income — always exactly one (occupation × how the market is treating it).
  const income = firstMatch(INCOME_TEMPLATES, ctx);
  if (income) chosen.push(income);

  // 2. Events — one per active event touching the player's industry (cap 2).
  for (const t of allMatches(EVENT_TEMPLATES, ctx).slice(0, 2)) chosen.push(t);

  // 3. Finance — tight payment / routine / savings (cap 2; tight has priority).
  for (const t of allMatches(FINANCE_TEMPLATES, ctx).slice(0, 2)) chosen.push(t);

  // 4. Market — a price-movement observation if no event already covered it.
  const market = firstMatch(MARKET_TEMPLATES, ctx);
  if (market) chosen.push(market);

  // 5. Flavor — one seasonal note + one community note. These guarantee the
  //    3-entry floor so a quiet month still reads as a life, not a blank page.
  const season = firstMatch(SEASON_TEMPLATES, ctx);
  if (season) chosen.push(season);
  const community = firstMatch(COMMUNITY_TEMPLATES, ctx);
  if (community) chosen.push(community);

  return chosen.slice(0, MAX_ENTRIES).map((t) => ({
    type: t.type,
    text: t.render(ctx),
    month: ctx.month,
    triggerId: t.id,
  }));
}
