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
  return out;
}
