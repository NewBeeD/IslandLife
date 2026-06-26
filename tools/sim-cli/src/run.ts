// Headless simulation runner — the Phase 1 deliverable.
//   npm run sim -- --seed 42 --months 60 --pop 400
import { buildWorld, netWorthOf, simulateOneMonth, worldDigest } from '@island/engine';
import type { WorldState } from '@island/shared';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  return fallback;
}

const seed = arg('seed', 42);
const months = arg('months', 60);
const pop = arg('pop', 400);

const EC = (n: number): string =>
  'EC$' + Math.round(n).toLocaleString('en-US');
const pct = (n: number): string => (n * 100).toFixed(1) + '%';

function snapshot(w: WorldState): void {
  const annualGdp = w.companies.reduce((s, c) => s + c.monthlyRevenue, 0) * 12;
  const byStatus = { HEALTHY: 0, DISTRESSED: 0, CLOSED: 0 };
  for (const c of w.companies) byStatus[c.status]++;
  const avgCash = w.agents.reduce((s, a) => s + a.cash, 0) / w.agents.length;
  const maxNpl = Math.max(...w.banks.map((b) => b.nonPerformingLoanRatio));
  const activeEvents = w.events.map((e) => e.definitionId).join(', ') || '—';

  const year = 2024 + Math.floor(w.month / 12);
  const m = String((w.month % 12) + 1).padStart(2, '0');
  console.log(
    `${year}-${m}` +
      `  GDP ${EC(annualGdp).padStart(14)}` +
      `  unemp ${pct(w.government.unemploymentRate).padStart(6)}` +
      `  avgCash ${EC(avgCash).padStart(9)}` +
      `  firms H/D/C ${byStatus.HEALTHY}/${byStatus.DISTRESSED}/${byStatus.CLOSED}` +
      `  maxNPL ${pct(maxNpl).padStart(6)}` +
      `  events: ${activeEvents}`,
  );
}

console.log(`\nIsland Life — headless simulation`);
console.log(`seed=${seed}  months=${months}  population=${pop}\n`);

const world = buildWorld(seed, { population: pop });
snapshot(world);
for (let i = 0; i < months; i++) {
  simulateOneMonth(world);
  if (world.month % 6 === 0) snapshot(world);
}

console.log(`\n— Player (agent #1): ${world.player.name}, age ${world.player.age + Math.floor(months / 12)} —`);
console.log(`  cash ${EC(world.player.cash)}   net worth ${EC(netWorthOf(world.player))}`);
console.log(`  (hidden) legacy.wealthScore ${world.playerLegacy.wealthScore.toFixed(1)}` +
  `   reputationScore ${world.playerLegacy.reputationScore.toFixed(2)}`);
console.log(`\nworld digest: ${worldDigest(world)}  (same seed -> same digest)\n`);
