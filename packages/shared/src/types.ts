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
}

export interface Education {
  level: CredentialLevel;
  enrolled?: EnrolledProgram | null;
}

// ── Ventures (Phase 8: the income spine) ─────────────────────────────────────
// A concurrent income stream the player runs — a fishing boat, a minibus route, a
// roadside juice stand — each with its own assets, output, operating cost, and
// income mode. A player's monthly income is the sum across active ventures. All
// optional: when `ventures` is undefined the implicit single-stream fields on the
// agent (incomeMode/spotBaseIncome/standingContract/outputScale/monthlyOperatingCosts)
// are "venture 0" and behaviour is byte-identical to Phase 7 (S2, the digest holds).
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
  status: 'ACTIVE' | 'CLOSED';
  // The venture's barrier to entry (Phase 10). Only LOW-barrier ventures saturate —
  // their SPOT income scales down as more people crowd the same trade in the parish.
  // Optional: undefined behaves as a non-saturating venture (the Phase 8 path).
  barrierTier?: BarrierTier;
  // Phase 11: outside equity holders (friends who funded the venture for a profit
  // share). The player banks income × their own share (1 − Σ outside shares);
  // each holder is paid their slice. Undefined → a sole venture (byte-identical).
  equityHolders?: EquityHolder[];
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
  | 'PARTNERSHIP';
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
}

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
  playerLegacy: LegacyScore;
  playerNotifications: string[];
  // Opportunities surfaced to the player and the decisions they present (Phase 6).
  opportunities: Opportunity[];
  decisions: PlayerDecision[];
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
