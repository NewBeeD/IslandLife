import type {
  BankState,
  BarrierTier,
  CompanyStatus,
  CredentialLevel,
  EmploymentStatus,
  ExperienceDomains,
  FamilyBackground,
  FormativeEvent,
  Industry,
  LoanStatus,
  ParishId,
} from './enums';

export type { ExperienceDomains };

export interface KnowledgeDomains extends ExperienceDomains {
  generalLiteracy: number;
}

export interface Asset {
  id: string;
  type: 'LAND' | 'EQUIPMENT' | 'VEHICLE';
  size?: 'SMALL' | 'MEDIUM' | 'LARGE';
  value: number; // EC$
  // Phase 12: set to a loan's id while this asset is pledged as that loan's
  // collateral. A pledged asset cannot be sold and is seized if the loan defaults.
  // Undefined on every ordinary asset (additive — the digest holds).
  pledgedToLoanId?: string;
  // Phase 12: set while the asset is listed for a PATIENT sale (a pending sale is
  // recorded on the owner). Blocks a second listing/sale until it resolves.
  listedForSale?: boolean;
  // Phase 17 (P17.2): the monthly fuel/upkeep this physical asset costs to run. When
  // set, operating costs are attributed to the asset and de-duplicated across the
  // ventures that share it, so two ventures using one truck pay one fuel line.
  // Undefined → upkeep is carried at the venture level (the pre-Phase-17 path).
  monthlyUpkeep?: number;
}

export interface Loan {
  id: string;
  bankId: string;
  borrowerPersonId?: string;
  borrowerCompanyId?: string;
  principal: number;
  remainingPrincipal: number;
  interestRate: number;
  monthlyPayment: number;
  termMonths: number;
  originMonth: number;
  purposeIndustry?: Industry;
  status: LoanStatus;
  // Phase 11: set once when a friend-loan default has strained the friendship, so the
  // social-capital hit is applied exactly once. Undefined on every ordinary loan.
  friendStrainApplied?: boolean;
  // Phase 12: secured lending. When set, this loan is backed by the borrower's asset
  // of this id; the asset is pledged (cannot be sold) and is seized on default.
  // Undefined on an unsecured loan (additive — the digest holds).
  collateralAssetId?: string;
  // Phase 12: set once the pledged collateral has been repossessed after a default,
  // so the seizure happens exactly once.
  collateralRepossessed?: boolean;
}

// Phase 12: a PATIENT asset sale in flight. The asset stays owned (and, for a
// venture, still earning) until `resolveMonth`, when it is removed and the proceeds
// are paid. The final price is recomputed at resolution, so a downturn during the
// wait still bites. Only the player lists assets, so this is undefined for NPCs.
export interface PendingSale {
  assetId: string;
  ventureId?: string; // the venture that owns the asset, if any (else economicAssets)
  listedMonth: number;
  resolveMonth: number;
  expectedPrice: number; // the patient price quoted at listing (player-facing)
}

export interface Good {
  id: string;
  name: string;
  category: Industry;
  basePrice: number; // EC$ per unit
  unit: string;
  priceElasticity: number;
  perishability: number;
  storability: number;
  exportable: boolean;
  importable: boolean;
  seasonality: number[]; // 12 monthly multipliers
  hurricaneVulnerability: number;
}

export interface Market {
  id: string;
  goodId: string;
  parish: ParishId;
  currentPrice: number;
  demand: number;
  supply: number;
  priceHistory: number[]; // last 24 months
}

export interface Country {
  id: string;
  name: string;
  baseInterestRate: number;
  institutionScore: number;
  corruptionIndex: number;
  exchangeRate: number;
}

export interface Parish {
  id: ParishId;
  countryId: string;
  name: string;
  capital: string;
  population: number;
  infrastructureScore: number;
  marketAccessScore: number;
  propertyValueIndex: number; // runtime; init 1.0
}

export interface Bank {
  id: string;
  name: string;
  type: 'COMMERCIAL' | 'CREDIT_UNION';
  countryId: string;
  totalAssets: number;
  totalLoans: number;
  nonPerformingLoanRatio: number;
  solvencyScore: number;
  lendingAppetite: number;
  baseLendingAppetite: number; // runtime; captured from seed
  biasTowardFormalSector: number;
  state: BankState; // runtime
}

// ── Equity / cap table (Phase 11) ────────────────────────────────────────────
// An outside stake in a venture or a shared company. `personId` is the NPC backer
// (an equity crowdfunder) or the partner in a shared firm; `share` is their slice
// of the income/profit (0–1). Outside shares sum to ≤ 1; the player holds the
// remainder. `name` is carried for the player-facing money view (the backer's
// hidden psychology never crosses the wire — only their name and share). Optional/
// defaulted everywhere: an absent `equityHolders` is a sole stake and is
// byte-identical to before (the digest holds).
export interface EquityHolder {
  personId: string;
  name: string;
  share: number; // 0–1 of the venture/company income
}

export interface Company {
  id: string;
  name: string;
  industry: Industry;
  type: 'COOPERATIVE' | 'SOLE_TRADER' | 'ASSOCIATION' | 'PRIVATE_LIMITED';
  parish: ParishId;
  ownerId: string | null;
  marketShare: number;
  monthlyOutputUnits: number;
  // runtime
  employees: NPCAgent[];
  loans: Loan[];
  baseOperatingCosts: number;
  monthlyRevenue: number;
  profit: number;
  consecutiveLossMonths: number;
  status: CompanyStatus;
  isSolvent: boolean;
  estimatedAnnualTax: number;
  // Phase 19.6: the firm's working-capital balance. Each month the firm's surplus
  // (profit) flows in and labour is paid out of it — so wages an NPC-founded firm
  // pays reconcile against real firm cash, and a firm short of cash lays off instead
  // of conjuring wages. Seed firms hold a balance too (working capital, for Phase 20)
  // but their established-economy payroll is not yet drawn from it. Defaulted to a
  // few months of costs on deserialize for snapshots written before it existed.
  cash: number;
  // Phase 11: a shared firm formed with an NPC partner splits profit by share.
  // Undefined for every seed company (the digest holds).
  equityHolders?: EquityHolder[];
}

// ── Education & credentials (Phase 9) ────────────────────────────────────────
// A program raises the player's knowledge over time and earns a credential; a
// credential unlocks gated opportunities. `field` is the domain the program builds
// (an Industry's knowledge, or GENERAL literacy/cultural capital). All optional on
// the agent: undefined education === NONE / not enrolled (the digest holds).
export type EducationField = Industry | 'GENERAL';

// The hidden spec of an enrolment opportunity — the program on offer.
export interface EducationProgram {
  programId: string;
  name: string; // player-facing prose: "a marine studies certificate"
  field: EducationField;
  targetLevel: CredentialLevel; // the credential it confers
  prerequisite: CredentialLevel; // the level the player must already hold
  totalCost: number; // EC$ over the whole program
  durationMonths: number;
}

// The program the player is currently enrolled in (a real multi-month cash drain).
export interface EnrolledProgram {
  programId: string;
  name: string;
  field: EducationField;
  targetLevel: CredentialLevel;
  monthsRemaining: number;
  monthlyCost: number; // EC$/month tuition
  completionMonth: number; // world.month at which it finishes
  // Phase 18 (P18.5): a paused program freezes `monthsRemaining` and stops the tuition
  // drain; resuming continues from where it left off. Undefined/false → studying.
  paused?: boolean;
}

export interface Education {
  level: CredentialLevel;
  enrolled?: EnrolledProgram | null;
}

// ── The wage model (Phase 15) ────────────────────────────────────────────────
// A wage worker's earnings are grounded in a day rate and the shape of a working
// month, so the per-day figure and the banked monthly figure agree (idea 1). The
// `dailyRate` is recomputed each month from the worker's skill, experience, tools,
// and credentials (P15.2), within a realistic ceiling. Optional everywhere: an agent
// or venture with no `wageProfile` keeps the spot/standing income model, so NPCs and
// a non-wage player are byte-identical (the digest holds).
export interface WageProfile {
  dailyRate: number; // EC$/day — recomputed monthly from skill (P15.2)
  workdaysPerMonth: number; // ~20 (5 days a week)
  hoursPerDay: number; // ~8
}

// ── Jobs & the job market (Phase 16) ─────────────────────────────────────────
// A real job market the player can browse and choose from. A `JobPosting` is a
// position an employer is hiring for — varying pay, attached expenses (the cost of
// getting to work and feeding yourself there), qualification/experience
// requirements, and a window that comes and goes like an opportunity. The player
// weighs each job's pay against its costs and switches trades by taking a new job.
// Postings live on `world.jobPostings` and serialize with the snapshot; a player
// with no job market is byte-identical (the list defaults to empty — the digest
// holds). Pay/cost figures are public offer information (a job ad), like an asset's
// asking price — they are shown to the player, but the hidden gating thresholds are
// never projected raw (the player reads requirements as prose).
export interface JobCosts {
  transport: number; // EC$/month getting to and from work
  food: number; // EC$/month feeding yourself on the job
  other?: number; // EC$/month any other attached cost (tools, dues)
}

// How a job pays. WAGE is a day rate (a fixed monthly take of dailyRate × workdays —
// a steady position, not the skill-tracking self-employed day-rate of Phase 15).
// SALARY is a flat monthly figure.
export type JobWageKind = 'WAGE' | 'SALARY';
export type JobStability = 'STEADY' | 'SEASONAL' | 'CASUAL';
export type JobPostingStatus = 'OPEN' | 'TAKEN' | 'EXPIRED';

export interface JobPosting {
  id: string; // unique per surfaced posting
  specId: string; // the catalogue identity, for dedup/hygiene (not projected)
  title: string; // player-facing: "general labourer with a Roseau contractor"
  industry: Industry;
  wageKind: JobWageKind;
  dailyRate?: number; // WAGE — EC$/day (× workdays = the monthly take)
  monthlySalary?: number; // SALARY — EC$/month
  attachedCosts: JobCosts;
  minCredential?: CredentialLevel; // hidden gate — surfaced only when the player meets it
  minExperience?: number; // hidden gate (domain experience 0–1)
  stability: JobStability; // shown as prose, never as a number
  surfacedMonth: number;
  windowMonths: number; // months the posting stays open before it lapses
  status: JobPostingStatus;
}

// The job the player currently holds (Phase 16). Recorded so the Money view can show
// the position's attached costs itemized (transport/food) net of the gross pay, and
// so taking a new job replaces the old one. Only the player holds a job, so this is
// undefined for NPCs and for a self-employed player (the digest holds).
export interface TakenJob {
  postingId: string;
  title: string;
  industry: Industry;
  attachedCosts: JobCosts;
}

// ── Ventures (Phase 8: the income spine) ─────────────────────────────────────
// A concurrent income stream the player runs — a fishing boat, a minibus route, a
// roadside juice stand — each with its own assets, output, operating cost, and
// income mode. A player's monthly income is the sum across active ventures. All
// optional: when `ventures` is undefined the implicit single-stream fields on the
// agent (incomeMode/spotBaseIncome/standingContract/outputScale/monthlyOperatingCosts)
// are "venture 0" and behaviour is byte-identical to Phase 7 (S2, the digest holds).
// A venture's hidden success/volatility profile (Phase 17, P17.4). Assigned once at
// creation: `successBias` is whether this is fundamentally a good or a poor business
// (some underperform or fail), `volatility` the size of its month-to-month swing.
// Never projected — the player reads how it is going in prose, never as numbers (S3).
export interface VentureProfile {
  successBias: number; // mean multiplier on output (<1 underperforms, >1 thrives)
  volatility: number; // standard deviation of the monthly performance swing
}

// A venture with a concrete, randomized production model (Phase 17, P17.3). Only the
// juice stand uses one so far — its monthly takings are sampled from a real bag/
// bottle model rather than a flat base. Undefined → the flat spot/standing model.
export type VentureProduction = 'JUICE_STAND';

// Who runs a venture day to day (Phase 17, P17.1). PLAYER — hands-on, it takes the
// player's own time. OPERATOR — a hired hand runs it for a cut of the takings, so it
// is passive (frees the player's time) but earns less. Undefined → PLAYER.
export type VentureOperator = 'PLAYER' | 'OPERATOR';

export interface Venture {
  id: string;
  industry: Industry;
  label: string; // player-facing prose: "your fishing", "the minibus"
  incomeMode: 'SPOT' | 'STANDING';
  spotBaseIncome: number; // base monthly take before output scaling & seasonality
  standingContract: { opportunityId: string; monthlyAmount: number } | null;
  outputScale: number; // multiplies output after an upgrade (init 1)
  monthlyOperatingCosts: number; // EC$/month fuel & upkeep across this venture's assets
  assets: Asset[]; // assets owned by this venture (financed upgrades land here)
  // Phase 17: a venture can be paused (SHELVED — no income, reduced upkeep) when it
  // cannot be sold, then reopened, or wound down for good (CLOSED).
  status: 'ACTIVE' | 'CLOSED' | 'SHELVED';
  // Phase 17, P17.1: how much of the player's working time a hands-on venture takes,
  // and who runs it. A hired operator turns the venture passive (timeLoad ignored)
  // and is paid `operatorShare` of the takings. All optional/defaulted: undefined
  // timeLoad behaves as a non-time-tracked venture (the pre-Phase-17 path).
  timeLoad?: number; // 0–1 of a working life when hands-on
  operatedBy?: VentureOperator; // undefined → PLAYER (hands-on)
  operatorShare?: number; // 0–1 cut the hired operator takes (operatedBy OPERATOR)
  // Phase 17, P17.3/P17.4: a concrete production model, the hidden success/volatility
  // profile, and the per-month performance factor sampled around it on each advance
  // (stored so the projection reads it without re-drawing rng). Undefined everywhere
  // → a flat, non-fluctuating venture (byte-identical to before).
  production?: VentureProduction;
  profile?: VentureProfile;
  performanceFactor?: number; // this month's sampled multiplier on output (init/undef → 1)
  // The venture's barrier to entry (Phase 10). Only LOW-barrier ventures saturate —
  // their SPOT income scales down as more people crowd the same trade in the parish.
  // Optional: undefined behaves as a non-saturating venture (the Phase 8 path).
  barrierTier?: BarrierTier;
  // Phase 11: outside equity holders (friends who funded the venture for a profit
  // share). The player banks income × their own share (1 − Σ outside shares);
  // each holder is paid their slice. Undefined → a sole venture (byte-identical).
  equityHolders?: EquityHolder[];
  // Phase 15: a wage-work venture (e.g. construction day labour) earns through the
  // grounded day-rate model rather than spot/standing. When set, this venture's
  // income is dailyRate × workdaysPerMonth, recomputed monthly from the player's
  // skill. Undefined → the spot/standing model (byte-identical).
  wageProfile?: WageProfile;
}

// ── NPC decision tags & observation memory (Phase 19) ────────────────────────
// The strategic flavour of an action the decision engine reasons about (P19.2) and
// remembers having seen (P19.3). Lives in shared so the engine and the
// (de)serializer agree on the shape of an agent's memory.
export type ActionTag =
  | 'EARN'
  | 'HOLD'
  | 'EXPAND'
  | 'BORROW'
  | 'INNOVATE'
  | 'COMPETE'
  | 'CUT_COST'
  | 'EXIT'
  | 'BRAND';

// One remembered move in an agent's bounded observation ring (P19.3, C10/A15): the
// kind of move (its tag), how it turned out for the relevant party (outcome, −1 bad
// … +1 good), and when it was seen (for recency decay). Own experience and watched
// competitors both land here; the agent learns to repeat what pays and drop what
// keeps losing. Hidden state — never crosses the wire (S3).
export interface AgentObservation {
  tag: ActionTag;
  outcome: number; // −1 … +1
  month: number;
}

export interface NPCAgent {
  id: string;
  name: string;
  age: number;
  parish: ParishId;
  familyId: string;
  familyBackground: FamilyBackground;
  formativeEvent: FormativeEvent;

  // Bourdieu economic capital
  cash: number;
  economicAssets: Asset[];
  socialCapitalLocal: number;
  socialCapitalInstitutional: number;
  socialCapitalDiaspora: number;
  culturalCapital: number;

  // Big Five
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;

  // Heckman non-cognitive
  cognitiveAbility: number;
  resilience: number;
  selfControl: number;
  knowledgeAcquisitionRate: number;

  // Derived behavioral (recomputed at build; cheap to keep)
  riskTolerance: number;
  lossAversion: number;
  patience: number;

  // Employment
  employmentStatus: EmploymentStatus;
  occupation: Industry | null;
  employer: Company | null;
  monthlyIncome: number;
  monthlyLivingCosts: number;

  loans: Loan[];

  knowledge: KnowledgeDomains;
  experience: ExperienceDomains;

  socialNetwork: string[];

  isPlayer: boolean;
  previousMonthCapital: number;

  businessesStarted: { industry: Industry; wasFirstInIndustryInParish: boolean }[];
  keptPromises: number;
  brokenContracts: number;

  // How the player's self-employed income is earned, set when a decision resolves
  // (Phase 6). Undefined for NPCs and for the player before any decision: income is
  // the static `monthlyIncome` (the pre-P6 behaviour, so the golden master holds).
  // STANDING — a guaranteed contract amount each month (stable). SPOT — market-driven
  // and variable, computed from the local price each month.
  incomeMode?: 'SPOT' | 'STANDING';
  // The accepted standing contract (STANDING mode only). Never crosses the wire.
  standingContract?: { opportunityId: string; monthlyAmount: number } | null;
  // The income level spot-selling reverts to as a base (SPOT mode), captured when
  // the player chose to keep selling on the open market.
  spotBaseIncome?: number;

  // ── Phase 7: asset upgrades, operating costs, loan arrears ──────────────────
  // All optional with engine defaults (outputScale 1, the rest 0) so existing NPCs
  // and a no-upgrade player are byte-identical and the determinism digest holds.
  // outputScale multiplies self-employed catch/output after an equipment upgrade
  // (a bigger boat lands more fish). monthlyOperatingCosts is the fixed fuel/upkeep
  // an owned asset adds each month, paid in good months and lean. loanArrearsMonths
  // counts consecutive months the player could not fully meet loan payments — the
  // player draws down cash and accrues arrears before a default (a softer path than
  // the NPC instant-default, applied to the player only).
  outputScale?: number;
  monthlyOperatingCosts?: number;
  loanArrearsMonths?: number;

  // ── Phase 8: the venture portfolio (the income spine) ───────────────────────
  // Optional. When present and non-empty, the player's income is the sum across
  // active ventures and the single-stream fields above are unused. Undefined for
  // NPCs and a pre-Phase-8 player, so they stay byte-identical (the digest holds).
  ventures?: Venture[];

  // ── Phase 9: education & credentials ────────────────────────────────────────
  // Optional. Undefined === { level: 'NONE', not enrolled }. Only the player enrols
  // in Phase 9, so NPCs and a pre-Phase-9 player stay byte-identical.
  education?: Education;

  // ── Phase 12: asset sales in flight ─────────────────────────────────────────
  // Optional. PATIENT sales the player has listed but not yet settled. Undefined for
  // NPCs and whenever nothing is listed, so the determinism digest holds.
  pendingSales?: PendingSale[];

  // ── Phase 15: the wage model ────────────────────────────────────────────────
  // Optional. Set on a single-stream wage worker (e.g. a construction labourer) so
  // their income is the grounded day-rate model (dailyRate × workdays), recomputed
  // monthly from skill. Undefined for NPCs and non-wage players (the digest holds).
  // Once the player runs a venture portfolio, the wage moves onto its "venture 0".
  wageProfile?: WageProfile;

  // ── Phase 16: the job the player currently holds ────────────────────────────
  // Optional. Set when the player takes a posting from the job market; carries the
  // position's attached costs so the Money view shows pay net of transport/food.
  // Undefined for NPCs and a self-employed player (the digest holds).
  currentJob?: TakenJob;

  // ── Phase 18: claims the player holds from investing in others ──────────────
  // Optional. The ventures the player has put money into (as a loan, a dividend, or a
  // revenue share). Each pays a monthly inflow tied to the NPC venture's fortunes.
  // Undefined for NPCs and a player who has never invested (the digest holds).
  investments?: PlayerInvestment[];

  // ── Phase 19: bounded observation memory (C10/A15) ──────────────────────────
  // A fixed-size ring of recently observed moves — the agent's own and watched
  // competitors' — that the decision engine aggregates into a learned tilt: an agent
  // who keeps losing on price stops competing on price and differentiates, and
  // competitors copy a winning move. Optional/undefined === no memory yet, so NPCs
  // and a pre-Phase-19 player are byte-identical (the digest holds).
  observations?: AgentObservation[];
}

export interface ActivePolicy {
  type: 'PUBLIC_WORKS_PROGRAM' | 'BANK_LIQUIDITY_SUPPORT' | 'AUSTERITY';
  cost: number;
  effect: string;
  magnitude: number;
  duration: number; // months remaining
}

export interface Government {
  countryId: string;
  monthlyTaxRevenue: number;
  monthlySpending: number;
  fiscalBalance: number;
  unemploymentRate: number;
  publicSentiment: number;
  corruptionLevel: number;
  policies: ActivePolicy[];
}

export interface WorldEvent {
  id: string;
  definitionId: string;
  severity: number;
  startedMonth: number;
  durationRemaining: number;
  affectedIndustries: Industry[];
}

// ── The economic web (Phase 20) ──────────────────────────────────────────────
// A handful of tightly-connected macro variables — the dense feedback loop that is
// the actual source of Democracy-4 depth (#26). Every field is DERIVED and recomputed
// each month from the others plus the agent/firm/bank aggregates (S5); none is a
// hand-edited source of truth. The variables read and write each other so one event
// (a rate shock, a hurricane, a bank failure) ripples through many systems for months
// and then mean-reverts. Hidden internals — they never cross the wire as raw numbers
// (the iceberg, S3); the player reads the *mood* they produce, in prose. Round-trips
// with the snapshot but is recomputed on the first tick, so it is never trusted as
// stored truth. Defaulted to a neutral baseline on deserialize (P-X4).
export interface MacroState {
  // The effective island-wide cost of credit: the country base rate plus a spread
  // that widens as defaults rise and credit tightens (the loop's closing edge —
  // banks tighten → rates effectively ↑). Annual, like every other rate.
  effectiveInterestRate: number;
  // Banks' collective willingness to lend, 0–1. Contracts as defaults rise and, on a
  // systemically-important bank failure (P20.3), across the whole system at once.
  creditAvailability: number;
  // Aggregate consumer demand, centered on 1.0. Falls with unemployment and a sour
  // consumer mood; feeds market demand → prices → firm revenue.
  aggregateDemand: number;
  // Construction-sector activity, centered on 1.0. Cheap, available credit and
  // confident firms build; a rate spike throttles it (rates ↑ → borrowing ↓ →
  // construction ↓ → input demand ↓).
  constructionActivity: number;
  // Firms' collective optimism, 0–1. Reads recent firm profitability and the credit
  // climate; gates NPC firm formation and hiring appetite.
  businessConfidence: number;
  // Households' collective optimism, 0–1. Reads unemployment with its own inertia;
  // drives aggregate demand and the government's public sentiment.
  consumerConfidence: number;
  // A transient systemic-credit shock, 0–1, that spikes when a systemically-important
  // bank fails (P20.3) and decays back to 0 over months. While elevated it drags
  // creditAvailability down and the rate spread up across every bank, turning an
  // isolated failure into a possible island-wide crunch. 0 in normal times.
  systemicStress: number;
}

export interface LegacyScore {
  wealthScore: number;
  familyScore: number;
  communityScore: number;
  innovationScore: number;
  environmentScore: number;
  reputationScore: number;
  lastNetWorth: number;
}

// ── Opportunities & decisions (Phase 6) ──────────────────────────────────────
// Hidden engine state. An Opportunity is something the world has surfaced to the
// player through their information channels (Player Experience doc); a
// PlayerDecision is the unlabelled choice it presents. The projection layer emits
// only prose + neutral option text — `monthlyAmount`, `expectedReturn`, and the
// option `effect` never cross the wire (S3, the iceberg).

export type OpportunityKind =
  | 'EUNICE_SUPPLY_CONTRACT'
  | 'ASSET_UPGRADE'
  | 'EDUCATION_ENROLMENT'
  | 'NEW_VENTURE'
  | 'CROWDFUND'
  | 'PARTNERSHIP'
  | 'SIDE_JOB'
  | 'INVEST_SOLICITATION';
export type OpportunityStatus = 'OPEN' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

// The hidden spec of a new-venture opportunity (Phase 10). Cross-domain entry: a
// boat, a minibus route, a roadside juice stand — capital up front (cash and/or a
// financed loan, through the same financing slider as an upgrade) to stand up a
// brand-new income stream alongside whatever the player already does. `riskLevel`
// and `barrierTier` are hidden mechanics; the player reads the trade-off in prose.
export interface NewVentureSpec {
  id: string; // stable catalogue identity
  industry: Industry;
  label: string; // the thing being started: "a roadside juice stand"
  ventureLabel: string; // the resulting venture's player-facing label: "the juice stand"
  entryCost: number; // EC$ up front (equipment/stock) — financeable
  startingOutputIncome: number; // base monthly SPOT take before scaling, seasonality & saturation
  operatingCost: number; // EC$/month fuel & upkeep
  barrierTier: BarrierTier; // hidden — LOW hustles saturate (P10.3)
  riskLevel: 'LOW' | 'MEDIUM' | 'MEDIUM_HIGH' | 'HIGH'; // hidden
  minTermMonths: number;
  maxTermMonths: number;
  minCash?: number; // wealth gate (P10.4): hidden until the player can plausibly fund it
  minCredential?: CredentialLevel; // a credential gate (Phase 9), absent → no gate
  // Phase 17: how much of the player's time the venture takes when run hands-on
  // (P17.1), and a concrete production model if it has one (P17.3, the juice stand).
  // Absent timeLoad → derived from the barrier tier.
  timeLoad?: number;
  production?: VentureProduction;
}

// The hidden spec of an asset-upgrade opportunity (Phase 7). A bigger boat, a
// second minibus, more guest rooms — capital up front (cash and/or a financed
// loan) for more output and more fixed cost. `riskLevel` is hidden (never
// projected); the player reads the trade-off in prose and chooses how much to
// borrow on the financing slider.
export interface UpgradeSpec {
  id: string; // stable rung identity (also the bought asset's id, so it is not re-offered)
  assetType: 'LAND' | 'EQUIPMENT' | 'VEHICLE';
  assetSize?: 'SMALL' | 'MEDIUM' | 'LARGE';
  assetLabel: string; // "a bigger pirogue and a new outboard engine"
  assetPrice: number; // EC$ full cost
  outputScaleDelta: number; // +0.6 → 60% more catch/output
  operatingCostDelta: number; // +EC$/month fuel & upkeep the asset adds
  riskLevel: 'LOW' | 'MEDIUM' | 'MEDIUM_HIGH' | 'HIGH'; // hidden
  minTermMonths: number;
  maxTermMonths: number;
}

// ── Crowdfunding & partnerships (Phase 11) ───────────────────────────────────
// A single backer's offer to fund the player — a friend putting money in either as
// a loan (repaid with interest) or as equity (a profit share). Terms are derived
// from the backer's hidden personality + cash; the player reads them as plain prose
// on the option, never as raw fields. `kind` decides which branch resolution takes.
export interface BackerOffer {
  backerId: string; // the NPC backer's agent id
  backerName: string;
  amount: number; // EC$ the backer puts in (their cash → the player)
  fundingKind: 'LOAN' | 'EQUITY';
  // LOAN terms.
  interestRate?: number; // annual; a friend's rate (often gentler than a bank's)
  termMonths?: number;
  // EQUITY terms.
  share?: number; // 0–1 profit share the backer takes
  ventureId?: string; // the venture the equity stake attaches to
}

// The hidden spec of a crowdfunding opportunity (the whole slate of backer offers).
export interface CrowdfundSpec {
  ventureId: string; // the venture the round funds (equity attaches here)
  ventureLabel: string; // player-facing: "the boat"
  offers: BackerOffer[];
}

// The hidden spec of a partnership opportunity (Phase 11). An NPC partner brings
// cash for a share of a shared firm; the player matches with their own stake.
export interface PartnershipSpec {
  id: string;
  partnerId: string;
  partnerName: string;
  industry: Industry;
  companyName: string; // "the co-op" / a formed firm's name
  partnerContribution: number; // EC$ the partner pools in
  playerContribution: number; // EC$ the player must pool in
  loanPrincipal: number; // EC$ borrowed against the firm (0 if none)
  partnerShare: number; // 0–1 of the firm's profit the partner takes
  monthlyOutputUnits: number; // the firm's output (priced by the market)
  baseOperatingCosts: number; // EC$/month
}

// The hidden spec of a side-job opportunity (Phase 15, P15.3). An experienced wage
// worker is offered independent, short-term paid work — a few days on a job, paid on
// completion. `payout` is hidden mechanics; the player reads the offer in prose.
export interface SideJobSpec {
  id: string;
  industry: Industry;
  label: string; // player-facing: "a few days finishing a house in Soufrière"
  payout: number; // EC$ paid on completion
  days: number; // days of work the job runs
}

// ── Investing in someone else's venture (Phase 18, P18.1/P18.2) ──────────────
// The other side of crowdfunding: an NPC the player knows comes asking the player to
// put money into THEIR venture, and the player chooses how the return comes back —
// interest + principal (a loan to them), a dividend, or a share of revenue (P18.1).
// These inbound solicitations are rare and small for a poor/unknown player and grow
// larger, more frequent, and riskier as the player's cash and reputation rise (P18.2).
// All figures here are hidden mechanics — the player reads the offer as prose.
export type InvestReturnStructure = 'INTEREST' | 'DIVIDEND' | 'REVENUE_SHARE';

export interface InvestSolicitationSpec {
  id: string; // stable per surfaced solicitation
  investeeId: string; // the NPC asking for money
  investeeName: string;
  ventureLabel: string; // player-facing: "her shop", "his boat"
  industry: Industry;
  principal: number; // EC$ the NPC is asking the player to put in
  termMonths: number; // the horizon for the INTEREST structure
  // Hidden per-structure return parameters (never projected raw).
  interestRate: number; // INTEREST — annual; principal returned over the term
  dividendAnnualRate: number; // DIVIDEND — annual % of principal, good months only
  revenueShare: number; // REVENUE_SHARE — 0–1 of the venture's monthly revenue
  monthlyRevenueBase: number; // the venture's base monthly revenue (revenue share)
  // The NPC venture's hidden success/volatility, driving the dividend/revenue swing.
  successBias: number;
  volatility: number;
}

// A claim the player holds after investing in an NPC's venture (Phase 18). INTEREST is
// the player holding a loan as the creditor (principal returned with interest over a
// term); DIVIDEND and REVENUE_SHARE are open-ended income claims tied to the venture's
// fortunes (higher expected return, more variable, no principal returned). Optional on
// the agent — absent `investments` is byte-identical to before (the digest holds).
export interface PlayerInvestment {
  id: string;
  investeeId: string;
  investeeName: string;
  ventureLabel: string;
  industry: Industry;
  structure: InvestReturnStructure;
  principal: number; // EC$ the player put in
  startMonth: number;
  status: 'ACTIVE' | 'CLOSED';
  // INTEREST — amortized like a loan the player holds.
  interestRate?: number; // annual
  termMonths?: number;
  remainingPrincipal?: number;
  monthlyPayment?: number;
  // DIVIDEND / REVENUE_SHARE — open-ended, swing with the venture's month.
  dividendAnnualRate?: number;
  revenueShare?: number;
  monthlyRevenueBase?: number;
  successBias?: number;
  volatility?: number;
  // Bookkeeping the projection reads without re-drawing rng: this month's inflow and
  // the running total the claim has returned so far (the player's own money facts).
  lastReturn?: number;
  totalReturned?: number;
}

export interface Opportunity {
  id: string;
  kind: OpportunityKind;
  industry: Industry;
  npcName: string; // "Eunice Charles" — the person/vendor behind the offer
  channelId: string; // the information channel that surfaced it (MARKET_NETWORK)
  surfacedMonth: number;
  windowMonths: number; // months the offer stays open before it expires
  status: OpportunityStatus;
  decisionId: string; // the PlayerDecision presenting this opportunity
  // Hidden mechanics — never projected raw.
  monthlyAmount: number; // EC$ the standing arrangement guarantees (Eunice; 0 for upgrades)
  upgrade?: UpgradeSpec; // present for ASSET_UPGRADE opportunities
  // The venture this upgrade grows (Phase 8). Undefined → the implicit single-stream
  // player ("venture 0"); set → the asset and output bump land on that venture.
  ventureId?: string;
  enrolment?: EducationProgram; // present for EDUCATION_ENROLMENT opportunities
  newVenture?: NewVentureSpec; // present for NEW_VENTURE opportunities (Phase 10)
  crowdfund?: CrowdfundSpec; // present for CROWDFUND opportunities (Phase 11)
  partnership?: PartnershipSpec; // present for PARTNERSHIP opportunities (Phase 11)
  sideJob?: SideJobSpec; // present for SIDE_JOB opportunities (Phase 15)
  invest?: InvestSolicitationSpec; // present for INVEST_SOLICITATION opportunities (Phase 18)
}

// The logical identity of an offer — the (kind, target) it concerns, independent of
// the random per-month `id`. Two opportunities with the same key are the *same*
// offer surfaced at different times (e.g. the juice-stand new venture, or a given
// upgrade rung). Used to suppress duplicate surfacing (P13.1) and to dedupe the
// "Passed" projection (P13.2) so lapsed offers stop piling up.
export function opportunityLogicalKey(opp: Opportunity): string {
  switch (opp.kind) {
    case 'EUNICE_SUPPLY_CONTRACT':
      return 'EUNICE_SUPPLY_CONTRACT';
    case 'ASSET_UPGRADE':
      return `ASSET_UPGRADE:${opp.ventureId ?? ''}:${opp.upgrade?.id ?? ''}`;
    case 'EDUCATION_ENROLMENT':
      return `EDUCATION_ENROLMENT:${opp.enrolment?.programId ?? ''}`;
    case 'NEW_VENTURE':
      return `NEW_VENTURE:${opp.newVenture?.id ?? ''}`;
    case 'CROWDFUND':
      return `CROWDFUND:${opp.crowdfund?.ventureId ?? ''}`;
    case 'PARTNERSHIP':
      return `PARTNERSHIP:${opp.partnership?.partnerId ?? ''}:${opp.partnership?.id ?? ''}`;
    case 'SIDE_JOB':
      return `SIDE_JOB:${opp.sideJob?.id ?? ''}`;
    case 'INVEST_SOLICITATION':
      return `INVEST_SOLICITATION:${opp.invest?.investeeId ?? ''}:${opp.invest?.id ?? ''}`;
  }
}

// Whether a logically-equivalent offer (same `opportunityLogicalKey`) is already
// live (OPEN/ACCEPTED) or only recently lapsed — within `cooldownMonths` of its
// window closing. Surfacing consults this so the same offer is not re-pushed while
// one is in flight or freshly gone, keyed by the logical offer, not the random id.
export function hasRecentEquivalentOffer(
  opportunities: Opportunity[],
  key: string,
  currentMonth: number,
  cooldownMonths: number,
): boolean {
  for (const o of opportunities) {
    if (opportunityLogicalKey(o) !== key) continue;
    if (o.status === 'OPEN' || o.status === 'ACCEPTED') return true;
    // EXPIRED / DECLINED: only suppress while still within the re-offer cooldown.
    if (currentMonth - (o.surfacedMonth + o.windowMonths) < cooldownMonths) return true;
  }
  return false;
}

// Months a lapsed generative offer is suppressed before the same logical offer may
// surface again (P13.1). Long enough that a declined/expired juice stand or upgrade
// rung does not immediately re-appear and pile up duplicate "Passed" rows; short
// enough that a genuinely-wanted offer eventually comes round again.
export const OFFER_REOFFER_COOLDOWN_MONTHS = 9;

// One unlabelled option. `label`/`description` are neutral player-facing prose (no
// "safe"/"risky"); `effect` is the hidden mechanical resolution.
export interface DecisionOption {
  id: string;
  label: string;
  description: string;
  // The hidden mechanical resolution. `incomeMode`/`standingAmount` drive the income
  // decisions (Eunice); `enrol` marks the accept option of an education enrolment
  // (Phase 9); `funding` carries a chosen crowdfunding backer's terms and `accept`
  // a partnership offer (Phase 11). Never projected — the player reads only
  // label/description.
  effect: {
    incomeMode?: 'SPOT' | 'STANDING';
    standingAmount?: number;
    enrol?: boolean;
    funding?: BackerOffer; // CROWDFUND — the backer offer this option takes
    accept?: boolean; // PARTNERSHIP — true on the "go in" option
    sideJobPayout?: number; // SIDE_JOB — EC$ paid on completion of the "take it" option
    invest?: { structure: InvestReturnStructure }; // INVEST_SOLICITATION — chosen return shape
  };
}

export interface PlayerDecision {
  id: string;
  opportunityId: string;
  kind: OpportunityKind;
  surfacedMonth: number;
  windowMonths: number;
  options: DecisionOption[];
  chosenOptionId: string | null;
  resolvedMonth: number | null;
  // When the delayed consequence is due (resolvedMonth + lag), and whether the
  // MEMORY entry connecting back to it has already surfaced (P6.4).
  consequenceMonth: number | null;
  consequenceDelivered: boolean;
}

// The in-memory entity graph. One per save. Mutated in place by simulateOneMonth.
export interface WorldState {
  seed: number;
  month: number;
  country: Country;
  parishes: Parish[];
  goods: Good[];
  markets: Market[];
  banks: Bank[];
  companies: Company[];
  agents: NPCAgent[];
  player: NPCAgent;
  government: Government;
  events: WorldEvent[];
  // The economic web (Phase 20) — derived macro variables recomputed each tick from
  // the world's aggregates, feeding back into markets, banks, and firm behaviour.
  macro: MacroState;
  playerLegacy: LegacyScore;
  playerNotifications: string[];
  // Opportunities surfaced to the player and the decisions they present (Phase 6).
  opportunities: Opportunity[];
  decisions: PlayerDecision[];
  // The job market — postings the player can browse and take (Phase 16). Defaults
  // to empty; a player with no job market is byte-identical (the digest holds).
  jobPostings: JobPosting[];
  // Seeded PRNG is attached at runtime by the engine (not serialized here).
  rng: RNG;
}

// Minimal RNG contract (implemented in the engine).
export interface RngState {
  state: number;
}
export interface RNG {
  next(): number;
  gaussian(mean: number, sd: number): number;
  range(min: number, max: number): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(xs: readonly T[]): T;
  serialize(): RngState;
}
