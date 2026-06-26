import type {
  BankState,
  CompanyStatus,
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
