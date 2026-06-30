import { describe, expect, it } from 'vitest';
import type { NPCAgent } from '@island/shared';
import {
  buildWorld,
  simulateOneMonth,
  worldDigest,
  npcDecide,
  applyAction,
  formCompany,
  newFirmEconomics,
  competitionFactor,
  computeCompanyRevenue,
  isFoundedFirm,
  NEW_FIRM_ENTRY_COST,
} from '../index';

// Make an agent a plausible, well-capitalized founder: capable and bold enough that a
// fat empty cell clears the loss-averse entry bar, with cash to spare.
function makeFounder(agent: NPCAgent): void {
  agent.isPlayer = false;
  agent.employmentStatus = 'SELF_EMPLOYED';
  agent.cash = 40_000;
  agent.cognitiveAbility = 0.85;
  agent.riskTolerance = 0.9;
  agent.lossAversion = 0.1;
  agent.patience = 0.85;
}

const founded = (w: ReturnType<typeof buildWorld>) => w.companies.filter((c) => isFoundedFirm(c));
const activeCount = (w: ReturnType<typeof buildWorld>) =>
  w.companies.filter((c) => c.status !== 'CLOSED').length;

describe('NPC firm formation & exit (P19.5, P-B1)', () => {
  it('formCompany stands up a sole trader owned and run by the agent', () => {
    const world = buildWorld(42, { population: 100 });
    const agent = world.agents.find((a) => !a.isPlayer)!;
    agent.cash = 40_000;
    const before = agent.cash;
    const co = formCompany(agent, world, 'FISHING');

    expect(world.companies).toContain(co);
    expect(isFoundedFirm(co)).toBe(true);
    expect(co.ownerId).toBe(agent.id);
    expect(co.industry).toBe('FISHING');
    expect(co.parish).toBe(agent.parish);
    expect(agent.employer).toBe(co);
    expect(agent.employmentStatus).toBe('EMPLOYED');
    expect(co.employees).toContain(agent);
    expect(agent.cash).toBe(before - NEW_FIRM_ENTRY_COST);
    expect(agent.businessesStarted.at(-1)?.industry).toBe('FISHING');
  });

  it('a capable, well-funded agent founds in a fat cell; a penniless one never does', () => {
    const world = buildWorld(42, { population: 100 });
    const founder = world.agents.find((a) => !a.isPlayer)!;
    makeFounder(founder);
    expect(npcDecide(founder, world).type).toBe('START_BUSINESS');

    const broke = world.agents.find((a) => !a.isPlayer && a !== founder)!;
    makeFounder(broke);
    broke.cash = NEW_FIRM_ENTRY_COST - 1; // cannot self-fund
    const choice = npcDecide(broke, world);
    expect(choice.type).not.toBe('START_BUSINESS');
  });

  it('the founder scouts the least-crowded (most profitable) cell in their parish', () => {
    const world = buildWorld(42, { population: 100 });
    const founder = world.agents.find((a) => !a.isPlayer)!;
    makeFounder(founder);
    // Saturate FISHING in the founder's parish with rivals so its expected margin sinks
    // below the other industries' — the scout should then pick elsewhere.
    for (let i = 0; i < 6; i++) {
      const proxy = { ...founder, id: `RIVAL_${i}`, businessesStarted: [] } as NPCAgent;
      formCompany(proxy, world, 'FISHING');
    }
    const choice = npcDecide(founder, world);
    expect(choice.type).toBe('START_BUSINESS');
    if (choice.type === 'START_BUSINESS') expect(choice.industry).not.toBe('FISHING');
  });

  it('crowding competes a founded firm’s revenue down; seed firms are untouched', () => {
    const world = buildWorld(42, { population: 100 });
    const seed = world.companies.find((c) => !isFoundedFirm(c))!;
    // A seed firm's revenue is identical whether or not the roster is passed — the
    // competition haircut never touches the established economy.
    const seedAlone = computeCompanyRevenue(seed, world.markets, world.events, world.goods, []);
    const seedWithRoster = computeCompanyRevenue(
      seed,
      world.markets,
      world.events,
      world.goods,
      world.companies,
    );
    expect(seedWithRoster).toBeCloseTo(seedAlone, 5);

    // Expected margin for a founded firm strictly falls as the cohort in its cell grows.
    const parish = world.parishes[0]!.id;
    const lone = newFirmEconomics(world, 'AGRICULTURE', parish).expectedMonthlyProfit;
    for (let i = 0; i < 3; i++) {
      const proxy = { ...world.agents[1]!, id: `AG_${i}`, parish, businessesStarted: [] } as NPCAgent;
      formCompany(proxy, world, 'AGRICULTURE');
    }
    const crowded = newFirmEconomics(world, 'AGRICULTURE', parish).expectedMonthlyProfit;
    expect(crowded).toBeLessThan(lone);
    expect(competitionFactor(0)).toBe(1);
    expect(competitionFactor(3)).toBeLessThan(1);
  });

  it('over 120 months the firm count is dynamically stable — births and deaths, no death spiral', () => {
    for (const seed of [42, 7]) {
      const world = buildWorld(seed, { population: 300 });
      const start = activeCount(world);
      for (let m = 0; m < 120; m++) simulateOneMonth(world);

      const births = founded(world).length;
      const deaths = founded(world).filter((c) => c.status === 'CLOSED').length;
      const end = activeCount(world);

      // Not a death spiral: the count recovers and holds well above the dwindling seed.
      expect(end).toBeGreaterThan(start);
      // Bounded: it settles into a modest cohort, it does not explode.
      expect(end).toBeLessThan(120);
      // A living churn: firms are both born and (some) die over the run.
      expect(births).toBeGreaterThan(15);
      expect(deaths).toBeGreaterThan(3);
    }
  });

  it('is deterministic per seed across a long run', () => {
    const run = () => {
      const w = buildWorld(99, { population: 200 });
      for (let m = 0; m < 60; m++) simulateOneMonth(w);
      return { digest: worldDigest(w), firms: founded(w).length };
    };
    const a = run();
    const b = run();
    expect(a.digest).toBe(b.digest);
    expect(a.firms).toBe(b.firms);
  });
});
