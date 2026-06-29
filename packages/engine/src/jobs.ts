import { INDUSTRY_DOMAIN, WAGE_WORKDAYS_PER_MONTH, credentialRank } from '@island/shared';
import type {
  CredentialLevel,
  Industry,
  JobCosts,
  JobPosting,
  JobStability,
  JobWageKind,
  NPCAgent,
  TakenJob,
  Venture,
  WorldState,
} from '@island/shared';
import { aggregateVentureIncome, hasVentures } from './ventures';
import { credentialLevelOf } from './education';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 16 — jobs & the job market.
//
// A real job market the player can browse: a rotating slate of postings across the
// eight industries, each with its own pay, attached expenses (transport, food),
// qualification/experience requirements, and a window that opens and closes like an
// opportunity. The player weighs net pay (gross minus the cost of getting there and
// eating) against the alternatives, and switches trades by taking a new job.
//
// Pure (S1) and additive: surfacing draws from `world.rng` but, like the other
// surfacers, runs only on the server's advance path (never in `simulateOneMonth` or
// the golden master), so the determinism digest is unaffected. A player who never
// touches the market keeps an empty `jobPostings` and is byte-identical (S2).
// ─────────────────────────────────────────────────────────────────────────────

// A job position the market can post. `baseDailyRate`/`baseMonthlySalary` are the
// catalogue's reference pay; each surfaced posting varies a little around it (drawn
// from world.rng) so the same role pays a little differently from one listing to the
// next (P16.2 — "varying pay"). The gates are hidden; the player reads them as prose.
interface JobSpec {
  id: string;
  title: string;
  industry: Industry;
  wageKind: JobWageKind;
  baseDailyRate?: number; // WAGE
  baseMonthlySalary?: number; // SALARY
  transport: number; // EC$/month
  food: number; // EC$/month
  other?: number; // EC$/month
  minCredential?: CredentialLevel;
  minExperience?: number;
  stability: JobStability;
}

// The catalogue across all eight industries — a mix of day-rate (WAGE) and salaried
// (SALARY) work, varying pay, attached costs, and requirements. Two construction
// postings deliberately make the net-vs-gross trade-off real: the high-paying Roseau
// site costs so much to get to that it nets less than a closer, lower-paying job.
const JOB_CATALOGUE: JobSpec[] = [
  // CONSTRUCTION
  { id: 'JOB_CONST_LABOURER', title: 'general labourer with a Roseau contractor', industry: 'CONSTRUCTION', wageKind: 'WAGE', baseDailyRate: 95, transport: 320, food: 220, stability: 'STEADY' },
  { id: 'JOB_CONST_SITE', title: 'site hand on a big build in Roseau', industry: 'CONSTRUCTION', wageKind: 'WAGE', baseDailyRate: 130, transport: 600, food: 320, stability: 'SEASONAL', minExperience: 0.25 },
  { id: 'JOB_CONST_LOCAL', title: 'handyman for a builder close to home', industry: 'CONSTRUCTION', wageKind: 'WAGE', baseDailyRate: 100, transport: 90, food: 150, stability: 'CASUAL' },
  // FISHING
  { id: 'JOB_FISH_CREW', title: 'crew on a commercial fishing boat', industry: 'FISHING', wageKind: 'WAGE', baseDailyRate: 110, transport: 120, food: 180, stability: 'SEASONAL' },
  // AGRICULTURE
  { id: 'JOB_AGRI_HAND', title: 'farm hand on a banana estate', industry: 'AGRICULTURE', wageKind: 'WAGE', baseDailyRate: 80, transport: 180, food: 150, stability: 'SEASONAL' },
  // TRANSPORTATION
  { id: 'JOB_TRANS_COND', title: 'conductor on a minibus route', industry: 'TRANSPORTATION', wageKind: 'SALARY', baseMonthlySalary: 1700, transport: 80, food: 200, stability: 'STEADY' },
  // RETAIL
  { id: 'JOB_RETAIL_SHOP', title: 'shop assistant at a store in Roseau', industry: 'RETAIL', wageKind: 'SALARY', baseMonthlySalary: 1900, transport: 280, food: 200, stability: 'STEADY' },
  { id: 'JOB_RETAIL_LOCAL', title: 'counter clerk at the village shop', industry: 'RETAIL', wageKind: 'SALARY', baseMonthlySalary: 1500, transport: 60, food: 140, stability: 'STEADY' },
  // TOURISM
  { id: 'JOB_TOUR_DESK', title: 'front desk at a guesthouse', industry: 'TOURISM', wageKind: 'SALARY', baseMonthlySalary: 2200, transport: 240, food: 200, stability: 'SEASONAL', minCredential: 'CERTIFICATE' },
  { id: 'JOB_TOUR_HOUSE', title: 'housekeeping at a hotel', industry: 'TOURISM', wageKind: 'SALARY', baseMonthlySalary: 1800, transport: 260, food: 200, stability: 'SEASONAL' },
  // FINANCE — credential-gated formal-sector work
  { id: 'JOB_FIN_BOOK', title: 'junior bookkeeper at an accounting office', industry: 'FINANCE', wageKind: 'SALARY', baseMonthlySalary: 2600, transport: 280, food: 240, stability: 'STEADY', minCredential: 'CERTIFICATE' },
  { id: 'JOB_FIN_CLERK', title: 'clerk at a bank in Roseau', industry: 'FINANCE', wageKind: 'SALARY', baseMonthlySalary: 3200, transport: 300, food: 260, stability: 'STEADY', minCredential: 'ASSOCIATE' },
];

// The market opens a few weeks into the life (so the opening months read as settling
// in, not a job fair on day one) and keeps roughly this many postings live at once.
const JOB_MARKET_FROM_MONTH = 1;
const JOB_SLATE_TARGET = 4;
const JOB_WINDOW_MIN = 3;
const JOB_WINDOW_MAX = 6;
// Months a settled (TAKEN/EXPIRED) posting suppresses the same role from re-listing,
// so the slate does not churn the identical posting back in immediately (P13 hygiene).
const JOB_REOFFER_COOLDOWN = 6;
// Long-settled postings are swept after this many months so the snapshot stays bounded.
const JOB_PRUNE_AFTER_MONTHS = 18;

// A stable id for the venture that carries a job's income when the player runs a
// venture portfolio (so a new job replaces the old one cleanly).
export const JOB_VENTURE_ID = 'VEN_JOB';

// EC$ rounded to a "real" pay figure.
function round5(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

// The total monthly cost attached to a job (transport + food + anything else).
export function attachedCostsTotal(costs: JobCosts): number {
  return Math.round(costs.transport + costs.food + (costs.other ?? 0));
}

// What a posting pays per month: a WAGE day rate over a working month, or the salary.
export function jobMonthlyGross(posting: JobPosting): number {
  if (posting.wageKind === 'WAGE') return Math.round((posting.dailyRate ?? 0) * WAGE_WORKDAYS_PER_MONTH);
  return Math.round(posting.monthlySalary ?? 0);
}

// A posting's net monthly pay: gross minus the cost of getting there and eating.
export function jobNetPerMonth(posting: JobPosting): number {
  return jobMonthlyGross(posting) - attachedCostsTotal(posting.attachedCosts);
}

// Whether the player meets a posting's hidden gates (credential + domain experience).
function meetsGates(world: WorldState, spec: { industry: Industry; minCredential?: CredentialLevel; minExperience?: number }): boolean {
  const p = world.player;
  if (spec.minCredential && credentialRank(credentialLevelOf(p)) < credentialRank(spec.minCredential)) return false;
  if (spec.minExperience != null) {
    const exp = p.experience[INDUSTRY_DOMAIN[spec.industry]] ?? 0;
    if (exp < spec.minExperience) return false;
  }
  return true;
}

// Whether a role is already live (OPEN/TAKEN) or only recently lapsed — so the slate
// does not re-list the same posting on top of itself or right after it closed (P13.1).
function hasRecentPosting(world: WorldState, specId: string): boolean {
  for (const j of world.jobPostings) {
    if (j.specId !== specId) continue;
    if (j.status === 'OPEN' || j.status === 'TAKEN') return true;
    if (world.month - (j.surfacedMonth + j.windowMonths) < JOB_REOFFER_COOLDOWN) return true;
  }
  return false;
}

// Sweep long-settled postings off the world so the snapshot JSONB stays bounded over
// a long life. A no-op when nothing is settled, so the empty-market path is untouched.
function pruneJobs(world: WorldState): void {
  if (world.jobPostings.length === 0) return;
  world.jobPostings = world.jobPostings.filter((j) => {
    if (j.status === 'OPEN' || j.status === 'TAKEN') return true;
    return world.month - (j.surfacedMonth + j.windowMonths) < JOB_PRUNE_AFTER_MONTHS;
  });
}

function buildPosting(world: WorldState, spec: JobSpec): JobPosting {
  // Vary the pay a little around the catalogue reference (P16.2 — varying pay).
  const factor = 1 + world.rng.range(-0.08, 0.08);
  const posting: JobPosting = {
    id: `${spec.id}_${world.month}`,
    specId: spec.id,
    title: spec.title,
    industry: spec.industry,
    wageKind: spec.wageKind,
    attachedCosts: { transport: spec.transport, food: spec.food, ...(spec.other != null ? { other: spec.other } : {}) },
    stability: spec.stability,
    surfacedMonth: world.month,
    windowMonths: world.rng.int(JOB_WINDOW_MIN, JOB_WINDOW_MAX),
    status: 'OPEN',
    ...(spec.minCredential ? { minCredential: spec.minCredential } : {}),
    ...(spec.minExperience != null ? { minExperience: spec.minExperience } : {}),
  };
  if (spec.wageKind === 'WAGE') posting.dailyRate = round5((spec.baseDailyRate ?? 0) * factor);
  else posting.monthlySalary = round5((spec.baseMonthlySalary ?? 0) * factor);
  return posting;
}

// Post a rotating slate of jobs the player qualifies for. Expires lapsed postings,
// prunes long-settled ones, then tops the open slate back up to the target size from
// eligible catalogue roles (drawn from world.rng for variety). Returns the postings
// that became visible this call. Deterministic per seed.
export function surfaceJobs(world: WorldState): JobPosting[] {
  if (world.month < JOB_MARKET_FROM_MONTH) return [];

  for (const j of world.jobPostings) {
    if (j.status === 'OPEN' && world.month > j.surfacedMonth + j.windowMonths) j.status = 'EXPIRED';
  }
  pruneJobs(world);

  const openCount = world.jobPostings.filter((j) => j.status === 'OPEN').length;
  const needed = JOB_SLATE_TARGET - openCount;
  const surfaced: JobPosting[] = [];
  if (needed <= 0) return surfaced;

  const heldSpec = world.player.currentJob
    ? JOB_CATALOGUE.find((s) => world.player.currentJob!.postingId.startsWith(s.id))?.id
    : undefined;
  const eligible = JOB_CATALOGUE.filter(
    (spec) => meetsGates(world, spec) && spec.id !== heldSpec && !hasRecentPosting(world, spec.id),
  );

  for (let i = 0; i < needed && eligible.length > 0; i++) {
    const idx = world.rng.int(0, eligible.length - 1);
    const spec = eligible.splice(idx, 1)[0]!;
    const posting = buildPosting(world, spec);
    world.jobPostings.push(posting);
    surfaced.push(posting);
  }
  return surfaced;
}

export class JobError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'NOT_QUALIFIED',
  ) {
    super(message);
    this.name = 'JobError';
  }
}

export interface TakeJobResult {
  posting: JobPosting;
  taken: TakenJob;
  monthlyGross: number;
  attachedCosts: number;
  netPerMonth: number;
}

// Take a job from the market: switch the player into the position, book its attached
// costs as a monthly operating line, and record it as the player's current job. A job
// is steady employment — income is the fixed monthly gross (it does not track skill
// the way Phase 15's self-employed day rate does). Replaces whatever job/livelihood
// the player held. Pure (mutates the world, never world.rng).
export function takeJob(world: WorldState, postingId: string): TakeJobResult {
  const posting = world.jobPostings.find((j) => j.id === postingId && j.status === 'OPEN');
  if (!posting) throw new JobError(`job ${postingId} is not open`, 'NOT_FOUND');
  if (!meetsGates(world, posting)) {
    throw new JobError('You do not meet what this job asks for.', 'NOT_QUALIFIED');
  }

  const p = world.player;
  const gross = jobMonthlyGross(posting);
  const attached = attachedCostsTotal(posting.attachedCosts);
  const taken: TakenJob = {
    postingId: posting.id,
    title: posting.title,
    industry: posting.industry,
    attachedCosts: { ...posting.attachedCosts },
  };

  p.occupation = posting.industry;
  p.employmentStatus = 'EMPLOYED';
  p.employer = null;
  p.wageProfile = undefined; // a job is a fixed wage, not the skill-tracking day rate
  p.currentJob = taken;

  if (hasVentures(p)) {
    // Replace any prior job stream; the job earns alongside the rest of the portfolio.
    p.ventures = (p.ventures ?? []).filter((v) => v.id !== JOB_VENTURE_ID);
    const venture: Venture = {
      id: JOB_VENTURE_ID,
      industry: posting.industry,
      label: jobVentureLabel(posting),
      incomeMode: 'STANDING',
      spotBaseIncome: 0,
      standingContract: { opportunityId: posting.id, monthlyAmount: gross },
      outputScale: 1,
      monthlyOperatingCosts: attached,
      assets: [],
      status: 'ACTIVE',
    };
    p.ventures.push(venture);
    p.monthlyIncome = aggregateVentureIncome(world);
  } else {
    p.incomeMode = 'STANDING';
    p.standingContract = { opportunityId: posting.id, monthlyAmount: gross };
    p.spotBaseIncome = undefined;
    p.monthlyOperatingCosts = attached;
    p.monthlyIncome = gross;
  }

  posting.status = 'TAKEN';
  return { posting, taken, monthlyGross: gross, attachedCosts: attached, netPerMonth: gross - attached };
}

// A short label for the job venture (portfolio case): "the bank job", "the shop job".
function jobVentureLabel(posting: JobPosting): string {
  return `the ${shortTrade(posting.industry)} job`;
}

function shortTrade(industry: Industry): string {
  switch (industry) {
    case 'FISHING':
      return 'fishing';
    case 'AGRICULTURE':
      return 'estate';
    case 'CONSTRUCTION':
      return 'building';
    case 'INFORMAL_TRADE':
      return 'trade';
    case 'RETAIL':
      return 'shop';
    case 'TOURISM':
      return 'hotel';
    case 'TRANSPORTATION':
      return 'route';
    case 'FINANCE':
      return 'office';
  }
}
