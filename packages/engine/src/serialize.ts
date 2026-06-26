import type {
  Bank,
  Company,
  Country,
  Good,
  Government,
  LegacyScore,
  Market,
  NPCAgent,
  Opportunity,
  Parish,
  PlayerDecision,
  RngState,
  WorldEvent,
  WorldState,
} from '@island/shared';
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
  schemaVersion: 1;
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
  playerLegacy: LegacyScore;
  playerNotifications: string[];
  opportunities: Opportunity[];
  decisions: PlayerDecision[];
}

const clone = <T>(x: T): T => structuredClone(x);

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
    schemaVersion: 1,
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
    playerLegacy: clone(world.playerLegacy),
    playerNotifications: clone(world.playerNotifications),
    opportunities: clone(world.opportunities),
    decisions: clone(world.decisions),
  };
}

export function deserializeWorld(s: SerializedWorld): WorldState {
  // Pass 1: rebuild agents and companies with their object refs nulled/empty.
  const agents: NPCAgent[] = s.agents.map((sa) => {
    const { employerId: _drop, ...rest } = sa;
    return { ...clone(rest), employer: null } as NPCAgent;
  });
  const companies: Company[] = s.companies.map((sc) => {
    const { employeeIds: _drop, ...rest } = sc;
    return { ...clone(rest), employees: [] } as Company;
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
    playerLegacy: clone(s.playerLegacy),
    playerNotifications: clone(s.playerNotifications),
    // Default for snapshots written before Phase 6 added these fields.
    opportunities: s.opportunities ? clone(s.opportunities) : [],
    decisions: s.decisions ? clone(s.decisions) : [],
    rng: createRng(s.seed, s.rngState),
  };
}
