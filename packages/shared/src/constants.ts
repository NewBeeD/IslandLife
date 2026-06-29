import type { Country, Good } from './types';
import type { Industry, ParishId } from './enums';

// ── The wage model (Phase 15) ────────────────────────────────────────────────
// Dominica's basic wage benchmark and the shape of a working month, used to ground
// day-labour income so the per-day figure the player sees and the money banked
// agree (idea 1), and so a new worker starts at a calibrated, realistic base
// (idea 2). A wage worker's monthly income is dailyRate × workdaysPerMonth.
export const DOMINICA_BASE_HOURLY = 7.5; // EC$/hr — the basic-rate benchmark (idea 2)
export const WAGE_HOURS_PER_DAY = 8;
export const WAGE_WORKDAYS_PER_MONTH = 20; // ~5 days a week
export const DOMINICA_BASE_DAY = DOMINICA_BASE_HOURLY * WAGE_HOURS_PER_DAY; // EC$60/day
// A green hire starts a defined margin above the basic legal rate (idea 2: $8–10/hr
// against a $7.50 base), so an unskilled worker begins around EC$72/day.
export const NEW_WORKER_RATE_PREMIUM = 1.2;
// The most skill, credentials, and tools together can lift a day rate above the
// green-hire base — a realistic ceiling so wages rise but stay grounded.
export const WAGE_RATE_CEILING_MULTIPLIER = 2.6;

// ── Venture realism (Phase 17) ───────────────────────────────────────────────
// Time budget (P17.1). A working life is a single unit of time; a full-time job or
// trade fills it. A hands-on side venture takes a slice of what is left — surface
// one that would over-fill the day and the player must choose: stay, switch, or
// hire someone to run it. A venture run by a hired operator takes none of the
// player's own time (it is passive) but pays the operator a cut of takings.
export const FULL_TIME_LOAD = 1; // a full-time job/trade fills the day
export const OPERATOR_SHARE = 0.35; // a hired operator's cut of a venture's takings
// Default hands-on time a started venture takes, by barrier tier — a cheap roadside
// hustle still ties up real hours; a bigger operation more so.
export const VENTURE_TIME_LOAD: Record<'LOW' | 'MEDIUM' | 'HIGH', number> = {
  LOW: 0.5,
  MEDIUM: 0.7,
  HIGH: 0.85,
};

// Performance fluctuation (P17.4). Each venture carries a hidden success/volatility
// profile; a per-month factor is sampled around it. These bound the swing so a good
// month is a windfall and a bad one bites, but income never goes negative or wild.
export const VENTURE_PERF_FLOOR = 0.1;
export const VENTURE_PERF_CEIL = 1.9;
// A shelved (paused) venture still costs something to keep — but only a fraction of
// the running upkeep, since the work has stopped (P17.4).
export const SHELVED_UPKEEP_FACTOR = 0.25;

// The juice stand's concrete unit economics (P17.3, idea 10). A bag of passion fruit
// yields a few hundred bottles; expenses are the fruit, sugar, and getting it to the
// stand. Roughly a bag a month, sometimes two in a good month. Sales swing with how
// many bottles move, sampled each month from world.rng (and thinned by crowding).
export const JUICE_STAND = {
  fruitCostPerBag: 150, // EC$ a bag of passion fruit
  sugarTransportPerBag: 140, // EC$ sugar, bottles, getting to the stand
  bottlesPerBagMin: 350,
  bottlesPerBagMax: 500,
  pricePerBottle: 5, // EC$
  goodMonthChance: 0.25, // chance a month moves a second bag
} as const;
// The reference (mean) monthly revenue the juice stand's base income is keyed to:
// one bag at the mid bottle yield. The sampled month scales against this.
export const JUICE_STAND_REFERENCE_REVENUE =
  ((JUICE_STAND.bottlesPerBagMin + JUICE_STAND.bottlesPerBagMax) / 2) * JUICE_STAND.pricePerBottle;

export const COUNTRY: Country = {
  id: 'DM',
  name: 'Dominica',
  baseInterestRate: 0.065,
  institutionScore: 0.52,
  corruptionIndex: 0.38,
  exchangeRate: 2.7,
};

export interface ParishSeed {
  id: ParishId;
  name: string;
  capital: string;
  population: number;
  infrastructureScore: number;
  marketAccessScore: number;
}

export const PARISHES: ParishSeed[] = [
  { id: 'SAINT_GEORGE', name: 'Saint George', capital: 'Roseau', population: 22000, infrastructureScore: 0.62, marketAccessScore: 0.8 },
  { id: 'SAINT_JOHN', name: 'Saint John', capital: 'Portsmouth', population: 8500, infrastructureScore: 0.48, marketAccessScore: 0.55 },
  { id: 'SAINT_ANDREW', name: 'Saint Andrew', capital: 'Marigot', population: 10500, infrastructureScore: 0.38, marketAccessScore: 0.42 },
  { id: 'SAINT_DAVID', name: 'Saint David', capital: 'Castle Bruce', population: 7200, infrastructureScore: 0.35, marketAccessScore: 0.38 },
  { id: 'SAINT_PATRICK', name: 'Saint Patrick', capital: 'Berekua', population: 8500, infrastructureScore: 0.4, marketAccessScore: 0.42 },
  { id: 'SAINT_LUKE', name: 'Saint Luke', capital: 'Laplaine', population: 1700, infrastructureScore: 0.28, marketAccessScore: 0.28 },
  { id: 'SAINT_MARK', name: 'Saint Mark', capital: 'Soufrière', population: 2000, infrastructureScore: 0.32, marketAccessScore: 0.32 },
  { id: 'SAINT_PAUL', name: 'Saint Paul', capital: 'Pointe Michel', population: 8800, infrastructureScore: 0.5, marketAccessScore: 0.55 },
  { id: 'SAINT_JOSEPH', name: 'Saint Joseph', capital: 'Saint Joseph', population: 5900, infrastructureScore: 0.4, marketAccessScore: 0.44 },
  { id: 'SAINT_PETER', name: 'Saint Peter', capital: 'Colihaut', population: 1600, infrastructureScore: 0.3, marketAccessScore: 0.3 },
];

const FLAT = Array<number>(12).fill(1);

export const GOODS: Good[] = [
  {
    id: 'FRESH_FISH_LOCAL', name: 'Fresh fish (local)', category: 'FISHING', basePrice: 8.5, unit: 'lb',
    priceElasticity: 0.65, perishability: 0.95, storability: 0.05, exportable: false, importable: false,
    seasonality: [1.1, 1.0, 0.9, 0.85, 0.8, 0.85, 1.0, 1.1, 1.2, 1.15, 1.1, 1.2], hurricaneVulnerability: 0.9,
  },
  {
    id: 'DASHEEN', name: 'Dasheen (taro)', category: 'AGRICULTURE', basePrice: 1.2, unit: 'lb',
    priceElasticity: 0.5, perishability: 0.4, storability: 0.6, exportable: true, importable: false,
    seasonality: [0.9, 0.9, 1.0, 1.1, 1.2, 1.1, 1.0, 0.95, 0.9, 0.9, 0.95, 0.9], hurricaneVulnerability: 0.75,
  },
  {
    id: 'BANANAS', name: 'Bananas (export)', category: 'AGRICULTURE', basePrice: 0.85, unit: 'lb',
    priceElasticity: 0.35, perishability: 0.6, storability: 0.4, exportable: true, importable: false,
    seasonality: [1.0, 1.0, 1.05, 1.1, 1.05, 1.0, 0.95, 0.9, 0.9, 0.95, 1.0, 1.0], hurricaneVulnerability: 0.85,
  },
  {
    id: 'CONSTRUCTION_LABOR', name: 'Construction labour (day)', category: 'CONSTRUCTION', basePrice: 120, unit: 'day',
    priceElasticity: 0.4, perishability: 1.0, storability: 0.0, exportable: false, importable: false,
    seasonality: [1.0, 1.0, 1.0, 1.0, 0.9, 0.85, 0.85, 0.9, 1.0, 1.1, 1.2, 1.15], hurricaneVulnerability: 0.2,
  },
  {
    id: 'BUILDING_MATERIALS', name: 'Building materials', category: 'CONSTRUCTION', basePrice: 850, unit: 'load',
    priceElasticity: 0.3, perishability: 0.05, storability: 0.95, exportable: false, importable: true,
    seasonality: [1.0, 1.0, 1.0, 1.0, 0.95, 0.9, 0.9, 0.95, 1.0, 1.1, 1.15, 1.1], hurricaneVulnerability: -0.5,
  },
  {
    id: 'ACCOMMODATION', name: 'Guesthouse room', category: 'TOURISM', basePrice: 90, unit: 'room-night',
    priceElasticity: 0.55, perishability: 1.0, storability: 0.0, exportable: false, importable: false,
    seasonality: [1.3, 1.4, 1.2, 1.0, 0.8, 0.7, 0.75, 0.8, 0.85, 0.9, 1.1, 1.3], hurricaneVulnerability: 0.95,
  },
  {
    id: 'MINIBUS_FARES', name: 'Minibus fares', category: 'TRANSPORTATION', basePrice: 3.5, unit: 'trip',
    priceElasticity: 0.15, perishability: 1.0, storability: 0.0, exportable: false, importable: false,
    seasonality: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.05], hurricaneVulnerability: 0.4,
  },
  {
    id: 'RETAIL_GOODS', name: 'General retail goods', category: 'RETAIL', basePrice: 25, unit: 'basket',
    priceElasticity: 0.45, perishability: 0.2, storability: 0.8, exportable: false, importable: true,
    seasonality: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.05, 1.1, 1.2], hurricaneVulnerability: 0.4,
  },
];

export const REPRESENTATIVE_GOOD: Record<Industry, string | null> = {
  FISHING: 'FRESH_FISH_LOCAL',
  AGRICULTURE: 'DASHEEN',
  CONSTRUCTION: 'CONSTRUCTION_LABOR',
  TOURISM: 'ACCOMMODATION',
  TRANSPORTATION: 'MINIBUS_FARES',
  RETAIL: 'RETAIL_GOODS',
  INFORMAL_TRADE: null,
  FINANCE: null,
};

export interface BankSeed {
  id: string;
  name: string;
  type: 'COMMERCIAL' | 'CREDIT_UNION';
  totalAssets: number;
  totalLoans: number;
  nonPerformingLoanRatio: number;
  solvencyScore: number;
  lendingAppetite: number;
  biasTowardFormalSector: number;
}

export const BANKS: BankSeed[] = [
  { id: 'NCB', name: 'National Commercial Bank of Dominica', type: 'COMMERCIAL', totalAssets: 180_000_000, totalLoans: 130_000_000, nonPerformingLoanRatio: 0.08, solvencyScore: 0.82, lendingAppetite: 0.65, biasTowardFormalSector: 0.7 },
  { id: 'RBTT', name: 'Caribbean Commercial Bank', type: 'COMMERCIAL', totalAssets: 95_000_000, totalLoans: 68_000_000, nonPerformingLoanRatio: 0.1, solvencyScore: 0.74, lendingAppetite: 0.55, biasTowardFormalSector: 0.65 },
  { id: 'CREDIT_UNION_DM', name: 'Dominica Co-operative Credit Union League', type: 'CREDIT_UNION', totalAssets: 45_000_000, totalLoans: 30_000_000, nonPerformingLoanRatio: 0.06, solvencyScore: 0.88, lendingAppetite: 0.8, biasTowardFormalSector: 0.3 },
];

export interface CompanySeed {
  id: string;
  name: string;
  industry: Industry;
  type: 'COOPERATIVE' | 'SOLE_TRADER' | 'ASSOCIATION' | 'PRIVATE_LIMITED';
  parish: ParishId;
  revenue: number; // EC$ annual reference
  costs: number; // EC$ annual reference
  employeesCount: number;
  marketShare: number;
  ownerId: string | null;
}

// Slice subset (headcounts trimmed from the design doc so the CLI's small
// population can staff them).
export const STARTING_COMPANIES: CompanySeed[] = [
  { id: 'DM_FISH_COOP', name: 'Dominica Fisherfolk Co-operative', industry: 'FISHING', type: 'COOPERATIVE', parish: 'SAINT_JOHN', revenue: 280_000, costs: 220_000, employeesCount: 30, marketShare: 0.35, ownerId: null },
  { id: 'DM_FISH_IND_1', name: 'Portsmouth Fishing Enterprise', industry: 'FISHING', type: 'SOLE_TRADER', parish: 'SAINT_JOHN', revenue: 85_000, costs: 65_000, employeesCount: 4, marketShare: 0.08, ownerId: 'NPC_FISHER_01' },
  { id: 'DM_BANANA_ASSOC', name: 'Dominica Banana Growers Association', industry: 'AGRICULTURE', type: 'ASSOCIATION', parish: 'SAINT_GEORGE', revenue: 1_800_000, costs: 1_500_000, employeesCount: 12, marketShare: 0.6, ownerId: null },
  { id: 'DM_AGRO_PROC', name: 'Kalinago Agro-Processing Ltd', industry: 'AGRICULTURE', type: 'PRIVATE_LIMITED', parish: 'SAINT_ANDREW', revenue: 420_000, costs: 340_000, employeesCount: 18, marketShare: 0.25, ownerId: 'NPC_AGRO_01' },
  { id: 'DM_CONST_1', name: 'Roseau Construction Services', industry: 'CONSTRUCTION', type: 'PRIVATE_LIMITED', parish: 'SAINT_GEORGE', revenue: 650_000, costs: 520_000, employeesCount: 22, marketShare: 0.18, ownerId: 'NPC_CONST_01' },
  { id: 'DM_CONST_2', name: 'Northern Construction Co.', industry: 'CONSTRUCTION', type: 'SOLE_TRADER', parish: 'SAINT_JOHN', revenue: 180_000, costs: 145_000, employeesCount: 8, marketShare: 0.06, ownerId: 'NPC_CONST_02' },
  { id: 'DM_HOTEL_1', name: 'Fort Young Hotel', industry: 'TOURISM', type: 'PRIVATE_LIMITED', parish: 'SAINT_GEORGE', revenue: 2_400_000, costs: 1_900_000, employeesCount: 40, marketShare: 0.28, ownerId: 'NPC_TOURISM_01' },
  { id: 'DM_GUESTHOUSE_1', name: 'Roseau Valley Guesthouse', industry: 'TOURISM', type: 'SOLE_TRADER', parish: 'SAINT_GEORGE', revenue: 180_000, costs: 140_000, employeesCount: 3, marketShare: 0.04, ownerId: 'NPC_TOURISM_02' },
  { id: 'DM_TRANSPORT_1', name: 'Dominica Bus & Taxi Association', industry: 'TRANSPORTATION', type: 'ASSOCIATION', parish: 'SAINT_GEORGE', revenue: 3_200_000, costs: 2_600_000, employeesCount: 35, marketShare: 0.85, ownerId: null },
  { id: 'DM_RETAIL_1', name: 'Whitchurch & Co.', industry: 'RETAIL', type: 'PRIVATE_LIMITED', parish: 'SAINT_GEORGE', revenue: 8_500_000, costs: 7_200_000, employeesCount: 30, marketShare: 0.22, ownerId: 'NPC_RETAIL_01' },
];
