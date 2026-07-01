import type { Industry, WorldEvent, WorldState } from '@island/shared';

interface EventDef {
  id: string;
  probability: number; // per eligible month
  seasonMonths: number[] | null;
  severityRange: [number, number];
  durationRange: [number, number];
  affectedIndustries: Industry[];
}

const RANDOM_EVENTS: EventDef[] = [
  {
    id: 'HURRICANE_MAJOR', probability: 0.04, seasonMonths: [5, 6, 7, 8, 9, 10],
    severityRange: [0.6, 1.0], durationRange: [3, 8],
    affectedIndustries: ['FISHING', 'AGRICULTURE', 'TOURISM', 'CONSTRUCTION', 'TRANSPORTATION'],
  },
  {
    id: 'HURRICANE_MINOR', probability: 0.08, seasonMonths: [5, 6, 7, 8, 9, 10],
    severityRange: [0.2, 0.5], durationRange: [1, 3],
    affectedIndustries: ['FISHING', 'AGRICULTURE', 'TOURISM'],
  },
  {
    id: 'DROUGHT', probability: 0.03, seasonMonths: [0, 1, 2, 3, 11],
    severityRange: [0.3, 0.7], durationRange: [2, 5], affectedIndustries: ['AGRICULTURE'],
  },
  {
    id: 'TOURISM_BOOM', probability: 0.05, seasonMonths: [11, 0, 1, 2, 3],
    severityRange: [0.3, 0.7], durationRange: [2, 6],
    affectedIndustries: ['TOURISM', 'TRANSPORTATION', 'RETAIL'],
  },
  {
    id: 'FUEL_PRICE_SHOCK', probability: 0.05, seasonMonths: null,
    severityRange: [0.2, 0.7], durationRange: [2, 8],
    affectedIndustries: ['FISHING', 'TRANSPORTATION', 'CONSTRUCTION'],
  },
  {
    id: 'FISHING_STOCK_DECLINE', probability: 0.04, seasonMonths: null,
    severityRange: [0.2, 0.6], durationRange: [3, 12], affectedIndustries: ['FISHING'],
  },
];

// Phase 23.2 — choke-point / route disruptions. A flood or landslide cuts a road, the
// ferry can't run, and the trades that move goods run short: it spikes the price of the
// affected goods through the ordinary event→market plumbing (scarcity, not a glut), and
// — while live — feeds the macro web's supplyDisruption, the island-wide logistics
// squeeze (P23.1). Seasoned to the wet, storm-prone months. Rolled OFF world.rng (see
// rollRandomEvents) so the pre-P23 seed stream is undisturbed until a route actually cuts.
const SUPPLY_EVENTS: EventDef[] = [
  {
    id: 'ROUTE_DISRUPTION', probability: 0.045, seasonMonths: [5, 6, 7, 8, 9, 10],
    severityRange: [0.3, 0.8], durationRange: [1, 4],
    affectedIndustries: ['AGRICULTURE', 'RETAIL', 'CONSTRUCTION', 'TRANSPORTATION', 'TOURISM'],
  },
];

// The event definitions that count as a logistics/route choke point (Phase 23.2). The
// macro web reads active events of these kinds to raise supplyDisruption, so a severed
// route squeezes input costs island-wide while it lasts. Kept as a set so the reader is
// a cheap membership test rather than a string prefix match.
export const SUPPLY_DISRUPTION_EVENT_IDS: ReadonlySet<string> = new Set(
  SUPPLY_EVENTS.map((d) => d.id),
);

// A small self-contained PRNG (as the narrative layer uses) so the Phase 23 supply
// events are deterministic in (seed, month) WITHOUT drawing from world.rng — keeping the
// pre-P23 seed stream byte-identical until a route is actually cut (S2, P-X2). A route
// disruption then legitimately moves the economy, but the baseline the rest of the world
// runs on is untouched.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollRandomEvents(world: WorldState): WorldEvent[] {
  const monthIndex = world.month % 12;
  const out: WorldEvent[] = [];
  for (const def of RANDOM_EVENTS) {
    if (def.seasonMonths && !def.seasonMonths.includes(monthIndex)) continue;
    // Don't stack the same event on top of itself — three simultaneous
    // FISHING_STOCK_DECLINEs is not a thing, and it tanked revenue unrealistically.
    if (world.events.some((e) => e.definitionId === def.id)) continue;
    if (world.rng.next() < def.probability) {
      out.push({
        id: `${def.id}_${world.month}`,
        definitionId: def.id,
        severity: world.rng.range(def.severityRange[0], def.severityRange[1]),
        startedMonth: world.month,
        durationRemaining: Math.round(world.rng.range(def.durationRange[0], def.durationRange[1])),
        affectedIndustries: def.affectedIndustries,
      });
    }
  }
  // Phase 23.2: the supply-disruption events, rolled on a local (seed, month) PRNG so
  // they never touch world.rng — the pre-P23 stream stays byte-identical. Deterministic
  // per seed all the same.
  const supplyRng = mulberry32((Math.imul(world.seed >>> 0, 0x9e3779b1) + world.month * 0x85ebca77) >>> 0);
  for (const def of SUPPLY_EVENTS) {
    if (def.seasonMonths && !def.seasonMonths.includes(monthIndex)) continue;
    if (world.events.some((e) => e.definitionId === def.id)) continue;
    const roll = supplyRng();
    if (roll < def.probability) {
      const sev = def.severityRange[0] + supplyRng() * (def.severityRange[1] - def.severityRange[0]);
      const dur = def.durationRange[0] + supplyRng() * (def.durationRange[1] - def.durationRange[0]);
      out.push({
        id: `${def.id}_${world.month}`,
        definitionId: def.id,
        severity: sev,
        startedMonth: world.month,
        durationRemaining: Math.round(dur),
        affectedIndustries: def.affectedIndustries,
      });
    }
  }
  return out;
}
