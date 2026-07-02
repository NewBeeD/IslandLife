import type {
  Bank,
  Company,
  Country,
  Good,
  Government,
  JobPosting,
  LegacyScore,
  MacroState,
  Market,
  NPCAgent,
  Opportunity,
  Parish,
  PlayerDecision,
  RngState,
  WorldEvent,
  WorldState,
} from '@island/shared';
import { initialMacroState } from './macro';
import { createRng } from './rng';

// The entity graph has cycles (agent.employer <-> company.employees) and the
// player is the same object as one of the agents. JSON cannot represent that, so
// we flatten object references to ids on the way out and re-stitch them on the
// way in. The result is a plain, JSON-safe value suitable for the
// `world_snapshot.state` JSONB column (P2.4).

export interface SerializedAgent extends Omit<NPCAgent, 'employer'> {
  employerId: string | null;
}
export interface SerializedCompany extends Omit<Company, 'employees'> {
  employeeIds: string[];
}

export interface SerializedWorld {
  // v2 (Phase 19): agents gained an optional `observations` ring. v3 (Phase 20): the
  // world gained a derived `macro` state. v4 (Phase 21): the player gained an optional
  // `reputation` ledger and ventures an optional `customerReputation` demand memory. v5
  // (Phase 22): the player gained an optional `information` ledger (paid research depth &
  // a competitor scout). v6 (Phase 23): the macro state gained `inputCostPressure` &
  // `supplyDisruption` (scarce inputs & logistics). v7 (Phase 24): the player's assets
  // gained an optional `acquiredMonth` (its vintage, driving depreciation) and `obsolete`
  // (set by a technology step). All additive — an older snapshot simply lacks them and
  // deserializes to the neutral defaults (an empty ring, a baseline macro, a neutral
  // ledger built on first tick, a whole customer name, no paid information, calm inputs at
  // pressure 1.0, untracked assets that never age), so the migration path stays implicit
  // (P-X4). The macro is derived and recomputed on the first tick regardless. The Phase 24
  // taste drift, parish culture, and black swans persist nothing — they are derived reads
  // and (seed, month) side-streams, recomputed identically on load.
  schemaVersion: 7;
  seed: number;
  month: number;
  rngState: RngState;
  playerId: string;
  country: Country;
  parishes: Parish[];
  goods: Good[];
  markets: Market[];
  banks: Bank[];
  companies: SerializedCompany[];
  agents: SerializedAgent[];
  government: Government;
  events: WorldEvent[];
  // The economic web (Phase 20) — derived, recomputed on the first tick after load.
  macro: MacroState;
  playerLegacy: LegacyScore;
  playerNotifications: string[];
  opportunities: Opportunity[];
  decisions: PlayerDecision[];
  jobPostings: JobPosting[];
}

const clone = <T>(x: T): T => structuredClone(x);

// Restore the macro state from a snapshot, filling the neutral baseline for a snapshot
// written before the macro web (Phase 20) existed, and backfilling the Phase 23 scarcity
// fields for a v5 snapshot that predates them. All are recomputed on the first tick, so
// this only guarantees soundness in the window before that.
function restoreMacro(macro: MacroState | undefined, baseInterestRate: number): MacroState {
  const base = initialMacroState(baseInterestRate);
  if (!macro) return base;
  const m = clone(macro);
  m.inputCostPressure ??= base.inputCostPressure;
  m.supplyDisruption ??= base.supplyDisruption;
  return m;
}

export function serializeWorld(world: WorldState): SerializedWorld {
  const agents: SerializedAgent[] = world.agents.map((a) => {
    const { employer, ...rest } = a;
    return { ...clone(rest), employerId: employer ? employer.id : null };
  });
  const companies: SerializedCompany[] = world.companies.map((c) => {
    const { employees, ...rest } = c;
    return { ...clone(rest), employeeIds: employees.map((e) => e.id) };
  });

  return {
    schemaVersion: 7,
    seed: world.seed,
    month: world.month,
    rngState: world.rng.serialize(),
    playerId: world.player.id,
    country: clone(world.country),
    parishes: clone(world.parishes),
    goods: clone(world.goods),
    markets: clone(world.markets),
    banks: clone(world.banks),
    companies,
    agents,
    government: clone(world.government),
    events: clone(world.events),
    macro: clone(world.macro),
    playerLegacy: clone(world.playerLegacy),
    playerNotifications: clone(world.playerNotifications),
    opportunities: clone(world.opportunities),
    decisions: clone(world.decisions),
    jobPostings: clone(world.jobPostings),
  };
}

export function deserializeWorld(s: SerializedWorld): WorldState {
  // Pass 1: rebuild agents and companies with their object refs nulled/empty.
  const agents: NPCAgent[] = s.agents.map((sa) => {
    const { employerId: _drop, ...rest } = sa;
    const agent = { ...clone(rest), employer: null } as NPCAgent;
    // Backfill Phase 7 fields for snapshots written before they existed.
    agent.outputScale ??= 1;
    agent.monthlyOperatingCosts ??= 0;
    agent.loanArrearsMonths ??= 0;
    return agent;
  });
  const companies: Company[] = s.companies.map((sc) => {
    const { employeeIds: _drop, ...rest } = sc;
    const company = { ...clone(rest), employees: [] } as Company;
    // Phase 19.6: a snapshot written before companies held a cash balance defaults to
    // a few months of working capital, so its firms reconcile payroll from month one.
    company.cash ??= Math.round(company.baseOperatingCosts * 3);
    return company;
  });

  const agentById = new Map(agents.map((a) => [a.id, a]));
  const companyById = new Map(companies.map((c) => [c.id, c]));

  // Pass 2: re-stitch the cycles by id.
  s.agents.forEach((sa, i) => {
    const agent = agents[i]!;
    agent.employer = sa.employerId ? companyById.get(sa.employerId) ?? null : null;
  });
  s.companies.forEach((sc, i) => {
    const company = companies[i]!;
    company.employees = sc.employeeIds
      .map((id) => agentById.get(id))
      .filter((a): a is NPCAgent => a !== undefined);
  });

  const player = agentById.get(s.playerId);
  if (!player) throw new Error(`deserializeWorld: player ${s.playerId} not found`);

  return {
    seed: s.seed,
    month: s.month,
    country: clone(s.country),
    parishes: clone(s.parishes),
    goods: clone(s.goods),
    markets: clone(s.markets),
    banks: clone(s.banks),
    companies,
    agents,
    player,
    government: clone(s.government),
    events: clone(s.events),
    // Phase 20: default to the neutral baseline for snapshots written before the macro
    // web existed; it is recomputed from aggregates on the first tick regardless. Phase
    // 23: a v5 macro lacks the scarcity fields — backfill the calm defaults so they are
    // sound before the first tick recomputes them.
    macro: restoreMacro(s.macro, s.country.baseInterestRate),
    playerLegacy: clone(s.playerLegacy),
    playerNotifications: clone(s.playerNotifications),
    // Default for snapshots written before Phase 6 added these fields.
    opportunities: s.opportunities ? clone(s.opportunities) : [],
    decisions: s.decisions ? clone(s.decisions) : [],
    // Phase 16: default for snapshots written before the job market existed.
    jobPostings: s.jobPostings ? clone(s.jobPostings) : [],
    rng: createRng(s.seed, s.rngState),
  };
}
