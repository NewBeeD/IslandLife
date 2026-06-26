# Island Life — World Simulation Specification
## Design Document v1.2

---

## Overview

The world simulation is the engine beneath everything the player experiences.
It runs independently of the player. The player is one agent inside it —
not an observer of it.

Every number in the simulation has a cause. Prices emerge from supply and demand.
Interest rates emerge from economic conditions. Unemployment emerges from
business failures. Government policy emerges from political pressure.
Nothing is scripted. Everything cascades.

The simulation runs in monthly ticks. One real-time session might advance
the world by one month or twelve depending on player decisions.
Time compression is variable — quiet periods move faster,
high-stakes decisions slow time to the month.

---

## The World: Dominica and the Eastern Caribbean

### Starting geography

```typescript
const WORLD = {
  countries: [
    {
      id: 'DM',
      name: 'Dominica',
      population: 72000,
      gdp: 650_000_000,          // EC$ ~USD 240M
      institutionScore: 0.52,     // moderate — functional but weak courts,
                                  // some corruption, limited capital markets
      baseInterestRate: 0.065,    // 6.5% — ECCB rate
      corruptionIndex: 0.38,      // moderate corruption (0=none, 1=total)
      infrastructureScore: 0.44,  // poor roads, unreliable power, slow ports
      humanDevelopmentIndex: 0.72,
      currency: 'XCD',            // Eastern Caribbean Dollar, pegged to USD
      exchangeRate: 2.70,         // XCD per USD, fixed
    },
    {
      id: 'BB',
      name: 'Barbados',
      population: 287000,
      gdp: 4_200_000_000,
      institutionScore: 0.71,
      baseInterestRate: 0.055,
      corruptionIndex: 0.22,
      infrastructureScore: 0.68,
      humanDevelopmentIndex: 0.81,
      currency: 'BBD',
      exchangeRate: 2.00,         // BBD per USD, fixed
    },
    {
      id: 'MQ',
      name: 'Martinique',
      population: 360000,
      gdp: 9_800_000_000,
      institutionScore: 0.78,    // French overseas territory — EU institutions
      baseInterestRate: 0.04,    // ECB rate
      corruptionIndex: 0.18,
      infrastructureScore: 0.75,
      humanDevelopmentIndex: 0.84,
      currency: 'EUR',
      exchangeRate: 0.93,
    },
    {
      id: 'TT',
      name: 'Trinidad and Tobago',
      population: 1_400_000,
      gdp: 24_000_000_000,
      institutionScore: 0.58,
      baseInterestRate: 0.045,
      corruptionIndex: 0.42,
      infrastructureScore: 0.61,
      humanDevelopmentIndex: 0.80,
      currency: 'TTD',
      exchangeRate: 6.75,
    },
  ],

  parishes: [
    // Dominica's 10 parishes — each with distinct economic character
    {
      id: 'SAINT_GEORGE',
      name: 'Saint George',
      capital: 'Roseau',
      population: 22000,
      economicFocus: ['government', 'retail', 'tourism', 'services'],
      infrastructureScore: 0.62,
      marketAccessScore: 0.80,    // best access — capital city
    },
    {
      id: 'SAINT_JOHN',
      name: 'Saint John',
      capital: 'Portsmouth',
      population: 8500,
      economicFocus: ['fishing', 'tourism', 'agriculture'],
      infrastructureScore: 0.48,
      marketAccessScore: 0.55,
    },
    {
      id: 'SAINT_ANDREW',
      name: 'Saint Andrew',
      capital: 'Marigot',
      population: 10500,
      economicFocus: ['agriculture', 'fishing'],
      infrastructureScore: 0.38,
      marketAccessScore: 0.42,
    },
    {
      id: 'SAINT_DAVID',
      name: 'Saint David',
      capital: 'Castle Bruce',
      population: 7200,
      economicFocus: ['agriculture', 'fishing'],
      infrastructureScore: 0.35,
      marketAccessScore: 0.38,
    },
    {
      id: 'SAINT_PETER',
      name: 'Saint Peter',
      capital: 'Colihaut',
      population: 1600,
      economicFocus: ['agriculture', 'fishing'],
      infrastructureScore: 0.30,
      marketAccessScore: 0.30,
    },
    {
      id: 'SAINT_JOSEPH',
      name: 'Saint Joseph',
      capital: 'Saint Joseph',
      population: 5900,
      economicFocus: ['agriculture', 'construction'],
      infrastructureScore: 0.40,
      marketAccessScore: 0.44,
    },
    {
      id: 'SAINT_PAUL',
      name: 'Saint Paul',
      capital: 'Pointe Michel',
      population: 8800,
      economicFocus: ['agriculture', 'retail', 'services'],
      infrastructureScore: 0.50,
      marketAccessScore: 0.55,
    },
    {
      id: 'SAINT_LUKE',
      name: 'Saint Luke',
      capital: 'Laplaine',
      population: 1700,
      economicFocus: ['agriculture'],
      infrastructureScore: 0.28,
      marketAccessScore: 0.28,
    },
    {
      id: 'SAINT_MARK',
      name: 'Saint Mark',
      capital: 'Soufrière',
      population: 2000,
      economicFocus: ['agriculture', 'fishing', 'tourism'],
      infrastructureScore: 0.32,
      marketAccessScore: 0.32,
    },
    {
      id: 'SAINT_PATRICK',
      name: 'Saint Patrick',
      capital: 'Berekua',
      population: 8500,
      economicFocus: ['agriculture', 'fishing'],
      infrastructureScore: 0.40,
      marketAccessScore: 0.42,
    },
  ],
};
```

---

## Market System

### Goods and commodities modeled

Every good has a local market in each parish and an export market
accessible from Roseau or Portsmouth ports.

```typescript
interface Good {
  id: string;
  name: string;
  category: GoodCategory;
  basePrice: number;           // EC$ per unit
  unit: string;
  priceElasticity: number;     // 0–1, higher = more sensitive to supply/demand
  perishability: number;       // 0–1, 1 = spoils within days
  storability: number;         // inverse of perishability
  exportable: boolean;
  importable: boolean;
  seasonality: MonthlyMultiplier[]; // 12 values, price multipliers by month
  hurricaneVulnerability: number;   // 0–1
}

const GOODS: Good[] = [
  // === FISHING ===
  {
    id: 'FRESH_FISH_LOCAL',
    name: 'Fresh fish (local varieties)',
    category: 'FISHING',
    basePrice: 8.50,            // EC$ per lb
    unit: 'lb',
    priceElasticity: 0.65,
    perishability: 0.95,        // must sell within 2 days
    storability: 0.05,
    exportable: false,
    importable: false,
    seasonality: [1.1,1.0,0.9,0.85,0.80,0.85,1.0,1.1,1.2,1.15,1.1,1.2],
    hurricaneVulnerability: 0.90,
  },
  {
    id: 'FRESH_FISH_EXPORT',
    name: 'Fresh fish (export grade)',
    category: 'FISHING',
    basePrice: 14.00,           // EC$ per lb — Martinique/Barbados market
    unit: 'lb',
    priceElasticity: 0.45,
    perishability: 0.90,
    storability: 0.10,
    exportable: true,
    importable: false,
    seasonality: [1.05,1.0,0.95,0.90,0.90,0.95,1.0,1.05,1.1,1.1,1.05,1.1],
    hurricaneVulnerability: 0.90,
  },
  {
    id: 'FROZEN_FISH',
    name: 'Frozen / processed fish',
    category: 'FISHING',
    basePrice: 11.00,
    unit: 'lb',
    priceElasticity: 0.40,
    perishability: 0.10,
    storability: 0.90,
    exportable: true,
    importable: true,
    seasonality: [1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0],
    hurricaneVulnerability: 0.30,
  },

  // === AGRICULTURE ===
  {
    id: 'DASHEEN',
    name: 'Dasheen (taro)',
    category: 'AGRICULTURE',
    basePrice: 1.20,            // EC$ per lb
    unit: 'lb',
    priceElasticity: 0.50,
    perishability: 0.40,
    storability: 0.60,
    exportable: true,
    importable: false,
    seasonality: [0.9,0.9,1.0,1.1,1.2,1.1,1.0,0.95,0.9,0.9,0.95,0.9],
    hurricaneVulnerability: 0.75,
  },
  {
    id: 'BANANAS',
    name: 'Bananas (export grade)',
    category: 'AGRICULTURE',
    basePrice: 0.85,            // EC$ per lb — EU market dependent
    unit: 'lb',
    priceElasticity: 0.35,      // less elastic — contracted prices
    perishability: 0.60,
    storability: 0.40,
    exportable: true,
    importable: false,
    seasonality: [1.0,1.0,1.05,1.1,1.05,1.0,0.95,0.9,0.9,0.95,1.0,1.0],
    hurricaneVulnerability: 0.85,
  },
  {
    id: 'BAY_OIL',
    name: 'Bay oil',
    category: 'AGRICULTURE',
    basePrice: 180.00,          // EC$ per litre — high value export
    unit: 'litre',
    priceElasticity: 0.25,
    perishability: 0.05,
    storability: 0.95,
    exportable: true,
    importable: false,
    seasonality: [1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0],
    hurricaneVulnerability: 0.60,
  },
  {
    id: 'PROVISIONS',
    name: 'Local provisions (yam, plantain, etc.)',
    category: 'AGRICULTURE',
    basePrice: 1.50,
    unit: 'lb',
    priceElasticity: 0.55,
    perishability: 0.45,
    storability: 0.55,
    exportable: false,
    importable: false,
    seasonality: [0.95,0.95,1.0,1.1,1.15,1.1,1.0,0.95,0.90,0.90,0.95,0.95],
    hurricaneVulnerability: 0.70,
  },

  // === CONSTRUCTION ===
  {
    id: 'CONSTRUCTION_LABOR',
    name: 'Construction labor (day rate)',
    category: 'CONSTRUCTION',
    basePrice: 120.00,          // EC$ per day
    unit: 'day',
    priceElasticity: 0.40,
    perishability: 1.0,         // unsold labor day is gone forever
    storability: 0.0,
    exportable: false,
    importable: false,
    seasonality: [1.0,1.0,1.0,1.0,0.9,0.85,0.85,0.90,1.0,1.1,1.2,1.15],
    hurricaneVulnerability: 0.20, // demand INCREASES after hurricane
  },
  {
    id: 'BUILDING_MATERIALS',
    name: 'Building materials (cement, lumber, zinc)',
    category: 'CONSTRUCTION',
    basePrice: 850.00,          // EC$ per standard unit load
    unit: 'load',
    priceElasticity: 0.30,
    perishability: 0.05,
    storability: 0.95,
    exportable: false,
    importable: true,
    seasonality: [1.0,1.0,1.0,1.0,0.95,0.90,0.90,0.95,1.0,1.1,1.15,1.1],
    hurricaneVulnerability: -0.50, // negative = price SPIKES after hurricane
  },

  // === INFORMAL TRADE ===
  {
    id: 'IMPORTED_GOODS',
    name: 'Imported consumer goods (Martinique/Barbados)',
    category: 'INFORMAL_TRADE',
    basePrice: 0,               // variable — depends on what is traded
    unit: 'lot',
    priceElasticity: 0.60,
    perishability: 0.20,
    storability: 0.80,
    exportable: false,
    importable: true,
    seasonality: [1.0,1.0,1.0,1.05,1.1,1.05,1.0,1.0,1.0,1.0,1.05,1.15],
    hurricaneVulnerability: 0.40,
  },

  // === TOURISM ===
  {
    id: 'ACCOMMODATION',
    name: 'Guesthouse / room rental',
    category: 'TOURISM',
    basePrice: 90.00,           // EC$ per room per night
    unit: 'room-night',
    priceElasticity: 0.55,
    perishability: 1.0,
    storability: 0.0,
    exportable: false,
    importable: false,
    seasonality: [1.3,1.4,1.2,1.0,0.8,0.7,0.75,0.8,0.85,0.9,1.1,1.3],
    hurricaneVulnerability: 0.95,
  },
  {
    id: 'TOURS',
    name: 'Eco-tours and nature guiding',
    category: 'TOURISM',
    basePrice: 150.00,          // EC$ per person
    unit: 'person',
    priceElasticity: 0.50,
    perishability: 1.0,
    storability: 0.0,
    exportable: false,
    importable: false,
    seasonality: [1.2,1.3,1.1,1.0,0.85,0.75,0.75,0.80,0.85,0.90,1.05,1.2],
    hurricaneVulnerability: 0.90,
  },

  // === TRANSPORT ===
  {
    id: 'MINIBUS_FARES',
    name: 'Minibus passenger fares',
    category: 'TRANSPORTATION',
    basePrice: 3.50,            // EC$ per trip (regulated)
    unit: 'trip',
    priceElasticity: 0.15,      // regulated — low elasticity
    perishability: 1.0,
    storability: 0.0,
    exportable: false,
    importable: false,
    seasonality: [1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.05],
    hurricaneVulnerability: 0.40,
  },
  {
    id: 'CARGO_TRANSPORT',
    name: 'Cargo transport (inter-parish)',
    category: 'TRANSPORTATION',
    basePrice: 250.00,          // EC$ per load
    unit: 'load',
    priceElasticity: 0.35,
    perishability: 1.0,
    storability: 0.0,
    exportable: false,
    importable: false,
    seasonality: [1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.05,1.1],
    hurricaneVulnerability: 0.50,
  },
];
```

### Price update mechanism

```typescript
function updateMarketPrice(market: Market, events: RandomEvent[], month: number): Market {
  const good = GOODS.find(g => g.id === market.goodId);
  const monthIndex = month % 12;   // `currentMonth` was undefined here — pass world.month in

  // Base supply/demand pressure
  const demandSupplyGap = market.demand - market.supply;
  const pressureEffect = demandSupplyGap * good.priceElasticity * 0.05;

  // Seasonal adjustment
  const seasonalMultiplier = good.seasonality[monthIndex];

  // Event shocks
  let eventShock = 0;
  for (const event of events) {
    if (event.affectedIndustries.includes(good.category)) {
      if (good.hurricaneVulnerability > 0) {
        // Positive vulnerability = supply drops = price rises
        eventShock += event.severity * good.hurricaneVulnerability * 0.30;
      } else {
        // Negative vulnerability = demand spikes = price rises more
        eventShock += event.severity * Math.abs(good.hurricaneVulnerability) * 0.50;
      }
    }
  }

  // Mean reversion — prices pull back toward base over time
  const meanReversionForce = (good.basePrice - market.currentPrice) * 0.08;

  const newPrice = Math.max(
    (market.currentPrice + pressureEffect + meanReversionForce) *
      seasonalMultiplier *
      (1 + eventShock),
    good.basePrice * 0.30  // floor at 30% of base
  );

  // Commit the new price and record history
  market.currentPrice = newPrice;
  market.priceHistory.push(newPrice);
  if (market.priceHistory.length > 24) market.priceHistory.shift();

  return market;
}
```

---

## Banking System

### Banks operating in Dominica (starting world)

```typescript
const BANKS: Bank[] = [
  {
    id: 'NCB',
    name: 'National Commercial Bank of Dominica',
    type: 'COMMERCIAL',
    countryId: 'DM',
    totalAssets: 180_000_000,   // EC$
    reserves: 27_000_000,       // 15% reserve ratio
    reserveRatio: 0.15,
    totalLoans: 130_000_000,
    nonPerformingLoanRatio: 0.08,
    solvencyScore: 0.82,
    lendingAppetite: 0.65,      // willingness to lend, 0–1
    biasTowardFormalSector: 0.70, // preference for credentialed borrowers
  },
  {
    id: 'RBTT',
    name: 'Caribbean Commercial Bank',
    type: 'COMMERCIAL',
    countryId: 'DM',
    totalAssets: 95_000_000,
    reserves: 15_000_000,
    reserveRatio: 0.15,
    totalLoans: 68_000_000,
    nonPerformingLoanRatio: 0.10,
    solvencyScore: 0.74,
    lendingAppetite: 0.55,
    biasTowardFormalSector: 0.65,
  },
  {
    id: 'CREDIT_UNION_DM',
    name: 'Dominica Co-operative Credit Union League',
    type: 'CREDIT_UNION',
    countryId: 'DM',
    totalAssets: 45_000_000,
    reserves: 9_000_000,
    reserveRatio: 0.20,
    totalLoans: 30_000_000,
    nonPerformingLoanRatio: 0.06,
    solvencyScore: 0.88,
    lendingAppetite: 0.80,
    biasTowardFormalSector: 0.30, // credit unions serve informal sector better
  },
];
```

### Loan pricing model

Interest rate is never random. It is computed from real factors.

```typescript
function computeLoanInterestRate(
  borrower: Person | Company,
  bank: Bank,
  loanPurpose: LoanPurpose,
  economy: EconomyState,
): LoanOffer | LoanRejection {

  // Base rate from central bank
  const baseRate = economy.country.baseInterestRate;

  // Credit risk premium (based on borrower history and profile)
  const creditRiskPremium = computeCreditRisk(borrower, bank);

  // Industry risk premium
  const industryRisk = INDUSTRY_RISK_PREMIUMS[loanPurpose.industry];

  // Economic cycle adjustment
  const cycleAdjustment = economy.cyclePhase === 'RECESSION' ? 0.025
    : economy.cyclePhase === 'CONTRACTION' ? 0.010
    : economy.cyclePhase === 'EXPANSION' ? -0.005
    : 0;

  // Bank-specific spread (profit margin)
  const bankSpread = bank.type === 'CREDIT_UNION' ? 0.020 : 0.035;

  // Collateral discount
  const collateralDiscount = borrower.assets.length > 0
    ? computeCollateralDiscount(borrower.assets, loanPurpose.amount)
    : 0;

  const finalRate =
    baseRate +
    creditRiskPremium +
    industryRisk +
    cycleAdjustment +
    bankSpread -
    collateralDiscount;

  // Approval gate — hidden from player
  const approvalScore = computeApprovalScore(borrower, bank, economy);

  if (approvalScore < bank.lendingAppetite * 0.4) {
    return { approved: false, reason: 'INSUFFICIENT_CREDITWORTHINESS' };
  }

  return {
    approved: true,
    interestRate: Math.min(finalRate, 0.22), // cap at 22%
    termMonths: loanPurpose.suggestedTerm,
    monthlyPayment: computeMonthlyPayment(
      loanPurpose.amount,
      finalRate,
      loanPurpose.suggestedTerm
    ),
    collateralRequired: approvalScore < 0.60,
  };
}

function computeCreditRisk(borrower: Person | Company, bank: Bank): number {
  let risk = 0.04; // base credit risk premium

  // Cultural capital bias — real phenomenon in Caribbean banking
  const culturalCapitalEffect = (1 - borrower.culturalCapital) * 0.03;

  // Employment stability
  const employmentEffect = borrower.employmentStatus === 'SELF_EMPLOYED'
    ? 0.025
    : borrower.employmentStatus === 'INFORMAL'
    ? 0.045
    : 0;

  // Loan history
  const historyEffect = borrower.loanHistory.defaults > 0 ? 0.06 : 0;
  const positiveHistory = borrower.loanHistory.paidOnTime > 2 ? -0.01 : 0;

  // Bank bias toward formal sector
  const formalBias = borrower.employmentStatus !== 'FORMAL'
    ? bank.biasTowardFormalSector * 0.02
    : 0;

  return risk + culturalCapitalEffect + employmentEffect +
         historyEffect + positiveHistory + formalBias;
}
```

### Bank solvency cascade

```typescript
function checkBankSolvency(bank: Bank, loans: Loan[]): BankState {
  const activeLoans = loans.filter(l => l.bankId === bank.id);
  const defaultedLoans = activeLoans.filter(l => l.status === 'DEFAULT');
  const totalPrincipal = activeLoans.reduce((sum, l) => sum + l.principal, 0);
  const nplRatio = totalPrincipal > 0
    ? defaultedLoans.reduce((sum, l) => sum + l.principal, 0) / totalPrincipal
    : 0;

  if (nplRatio > 0.25) {
    return { status: 'INSOLVENT', nplRatio };
  }
  if (nplRatio > 0.15) {
    return { status: 'DISTRESSED', nplRatio };
    // In distress: lending appetite drops 60%, interest rates rise 3%
  }
  if (nplRatio > 0.08) {
    return { status: 'STRESSED', nplRatio };
    // Stressed: lending appetite drops 30%, rates rise 1.5%
  }
  return { status: 'HEALTHY', nplRatio };
}
```

---

## NPC Agent System

### Population seed

Dominica starts with 72,000 simulated citizens.
For performance, the simulation uses a stratified sample:
- Full simulation: 5,000 active agents (economically active adults 18–65)
- Statistical proxy: remaining population modeled as aggregate flows
- Player is agent #1 in the full simulation

```typescript
interface NPCAgent {
  id: string;
  name: string;              // every agent has a name (see narrative Sample Output)
  age: number;
  parish: Parish;
  familyId: string;

  // Circumstance markers carried for life from character creation. The narrative
  // layer reads these (describeFamilyBackground, parish voice); NPCs have them too.
  // birthParish is `parish`; these complete the set. Shared with CharacterProfile.
  familyBackground: FamilyBackground;
  formativeEvent: FormativeEvent;

  // Bourdieu economic capital (shared schema with CharacterProfile)
  cash: number;      // liquid EC$ on hand
  economicAssets: Asset[];
  // netWorth is derived on demand: cash + Σ assets − Σ loan principal
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

  // Derived behavioral
  riskTolerance: number;
  lossAversion: number;
  patience: number;

  // Employment
  employmentStatus: 'EMPLOYED' | 'SELF_EMPLOYED' | 'INFORMAL' | 'UNEMPLOYED';
  occupation: Industry | null;
  employer: Company | null;
  monthlyIncome: number;        // wage if employed, net draw if self-employed
  monthlyLivingCosts: number;

  // Loans (formal liabilities)
  loans: Loan[];

  // Knowledge
  knowledge: KnowledgeDomains;
  experience: ExperienceDomains;
  // Non-cognitive (Heckman) trait shared with CharacterProfile. Global multiplier
  // on learning speed (Fork 2D adds +0.20 → learns 20% faster). Used in Phase 9.
  knowledgeAcquisitionRate: number;

  // Social network & diaspora
  socialNetwork: string[];           // ids of connected agents
  diasporaNetwork: DiasporaNetwork | null;

  // Simulation bookkeeping
  isPlayer: boolean;
  previousMonthCapital: number;      // prior-month cash, for loss detection

  // Legacy tracking (player only; never surfaced until death)
  businessesStarted: { industry: Industry; wasFirstInIndustryInParish: boolean }[];
  keptPromises: number;
  brokenContracts: number;
}
```

> **Player = agent #1.** The player's `NPCAgent` is hydrated from the
> `CharacterProfile` produced in *Island Life — Character Creation*. The economic
> fields (`cash`, `economicAssets`, `socialCapital*`, `culturalCapital`,
> `knowledge`, `experience`) use the same names and ranges in both documents so a
> finished character drops straight into the simulation. `netWorth` is not stored
> on the agent — it is derived wherever needed (see *Legacy Score System*).

### NPC decision engine

Every month, each NPC agent evaluates available actions and selects one
based on their personality profile. This is the behavioral economics core.

```typescript
function npcDecide(agent: NPCAgent, world: WorldState): Action {
  const availableActions = getAvailableActions(agent, world);

  // Score each action using expected utility theory
  // modified by behavioral biases (Kahneman & Tversky, 1979)
  const scoredActions = availableActions.map(action => ({
    action,
    score: computeProspectUtility(agent, action, world),
  }));

  // Add noise — humans are not perfectly rational
  const noisedScores = scoredActions.map(s => ({
    ...s,
    score: s.score + gaussianNoise(mean: 0, sd: 0.08),
  }));

  return noisedScores.sort((a, b) => b.score - a.score)[0].action;
}

function computeProspectUtility(
  agent: NPCAgent,
  action: Action,
  world: WorldState
): number {
  const { expectedGain, expectedLoss, probability, timeToOutcome } = action;

  // Prospect theory value function (Kahneman & Tversky)
  // Gains feel less good than losses feel bad
  const gainValue = Math.pow(expectedGain, 0.88);
  const lossValue = -agent.lossAversion * 2.25 * Math.pow(Math.abs(expectedLoss), 0.88);

  // Probability weighting — people overweight small probabilities
  const weightedProbability = probabilityWeight(probability);

  // Time discounting — adjusted by patience
  // Low patience = heavy discounting of future outcomes
  const discountRate = 0.15 - (agent.patience * 0.10);
  const timeDiscount = Math.pow(1 / (1 + discountRate), timeToOutcome / 12);

  return (gainValue * weightedProbability + lossValue * (1 - weightedProbability))
    * timeDiscount;
}

function probabilityWeight(p: number): number {
  // Prelec (1998) probability weighting function
  // People overweight small probabilities, underweight large ones
  return Math.exp(-Math.pow(-Math.log(p), 0.65));
}
```

### Available actions per agent state

```typescript
function getAvailableActions(agent: NPCAgent, world: WorldState): Action[] {
  const actions: Action[] = [];

  // Always available
  actions.push({ type: 'CONSUME', description: 'Spend on basic needs' });
  actions.push({ type: 'SAVE', description: 'Hold cash' });

  // Employment actions
  if (agent.employmentStatus === 'UNEMPLOYED') {
    actions.push({ type: 'SEEK_EMPLOYMENT', industry: bestFitIndustry(agent) });
  }
  if (agent.employmentStatus === 'EMPLOYED' && agent.riskTolerance > 0.55) {
    actions.push({ type: 'CONSIDER_SELF_EMPLOYMENT' });
  }

  // Investment actions (require capital and risk tolerance)
  if (agent.cash > 5000 && agent.riskTolerance > 0.45) {
    actions.push({ type: 'INVEST_IN_EQUIPMENT', industry: agent.occupation });
  }
  if (agent.cash > 15000 && agent.riskTolerance > 0.60) {
    actions.push({ type: 'START_BUSINESS', industry: bestFitIndustry(agent) });
  }

  // Loan actions (require minimum creditworthiness)
  if (agent.culturalCapital > 0.30 || agent.socialCapitalLocal > 0.50) {
    actions.push({ type: 'APPLY_FOR_LOAN', bank: bestFitBank(agent) });
  }

  // Migration (requires diaspora network or high openness)
  if (agent.socialCapitalDiaspora > 0.20 || agent.openness > 0.75) {
    actions.push({ type: 'CONSIDER_MIGRATION', destination: 'BB' });
  }

  // Knowledge investment (requires patience)
  if (agent.patience > 0.50 && agent.cash > 2000) {
    actions.push({ type: 'INVEST_IN_EDUCATION' });
  }

  return actions;
}
```

---

## Company System

### Starting companies (Dominica seed)

```typescript
// Company schema. The static seed below sets the descriptive fields; the runtime
// fields are initialised at world construction (so cascades act on live entities),
// mirroring the "Player = agent #1" hydration note for NPCAgent.
interface Company {
  id: string;
  name: string;
  industry: Industry;
  type: 'COOPERATIVE' | 'SOLE_TRADER' | 'ASSOCIATION' | 'PRIVATE_LIMITED';
  parish: string;             // parish id; cascade effects resolve it to the live Parish
  revenue: number;            // EC$ annual — seed reference figure
  costs: number;              // EC$ annual — seed reference figure
  marketShare: number;        // 0–1
  ownerId: string | null;     // null for cooperatives/associations
  monthlyOutputUnits?: number;// units produced per month (priced by the market)

  // Runtime fields — not in the static seed; set when the world is built.
  // employeesCount seeds headcount; `employees` is hydrated to real NPCAgents so
  // the closure cascade (job loss) hits live agents rather than a number.
  employeesCount: number;
  employees: NPCAgent[];
  loans: Loan[];
  baseOperatingCosts: number;      // EC$/month (≈ costs / 12 at build time)
  monthlyRevenue: number;          // last computed revenue
  profit: number;
  consecutiveLossMonths: number;   // starts at 0
  status: CompanyStatus;           // starts 'HEALTHY' (see Insolvency cascade)
  isSolvent: boolean;
  estimatedAnnualTax: number;      // feeds the closure tax-revenue cascade
}

const STARTING_COMPANIES: Company[] = [
  // === FISHING ===
  {
    id: 'DM_FISH_COOP',
    name: 'Dominica Fisherfolk Co-operative',
    industry: 'FISHING',
    type: 'COOPERATIVE',
    parish: 'SAINT_JOHN',
    revenue: 280_000,          // EC$ annual
    costs: 220_000,
    employeesCount: 45,
    marketShare: 0.35,
    isSolvent: true,
    ownerId: null,             // cooperative, no single owner
    monthlyOutputUnits: 12000, // lbs of fish
  },
  {
    id: 'DM_FISH_IND_1',
    name: 'Portsmouth Fishing Enterprise',
    industry: 'FISHING',
    type: 'SOLE_TRADER',
    parish: 'SAINT_JOHN',
    revenue: 85_000,
    costs: 65_000,
    employeesCount: 4,
    marketShare: 0.08,
    isSolvent: true,
    ownerId: 'NPC_FISHER_01',
    monthlyOutputUnits: 3500,
  },

  // === AGRICULTURE ===
  {
    id: 'DM_BANANA_ASSOC',
    name: 'Dominica Banana Growers Association',
    industry: 'AGRICULTURE',
    type: 'ASSOCIATION',
    parish: 'SAINT_GEORGE',
    revenue: 1_800_000,
    costs: 1_500_000,
    employeesCount: 12,        // admin, not farmers
    marketShare: 0.60,         // of export banana market
    isSolvent: true,
    ownerId: null,
  },
  {
    id: 'DM_AGRO_PROC',
    name: 'Kalinago Agro-Processing Ltd',
    industry: 'AGRICULTURE',
    type: 'PRIVATE_LIMITED',
    parish: 'SAINT_ANDREW',
    revenue: 420_000,
    costs: 340_000,
    employeesCount: 18,
    marketShare: 0.25,         // of local processing market
    isSolvent: true,
    ownerId: 'NPC_AGRO_01',
  },

  // === CONSTRUCTION ===
  {
    id: 'DM_CONST_1',
    name: 'Roseau Construction Services',
    industry: 'CONSTRUCTION',
    type: 'PRIVATE_LIMITED',
    parish: 'SAINT_GEORGE',
    revenue: 650_000,
    costs: 520_000,
    employeesCount: 22,
    marketShare: 0.18,
    isSolvent: true,
    ownerId: 'NPC_CONST_01',
  },
  {
    id: 'DM_CONST_2',
    name: 'Northern Construction Co.',
    industry: 'CONSTRUCTION',
    type: 'SOLE_TRADER',
    parish: 'SAINT_JOHN',
    revenue: 180_000,
    costs: 145_000,
    employeesCount: 8,
    marketShare: 0.06,
    isSolvent: true,
    ownerId: 'NPC_CONST_02',
  },

  // === TOURISM ===
  {
    id: 'DM_HOTEL_1',
    name: 'Fort Young Hotel',
    industry: 'TOURISM',
    type: 'PRIVATE_LIMITED',
    parish: 'SAINT_GEORGE',
    revenue: 2_400_000,
    costs: 1_900_000,
    employeesCount: 65,
    marketShare: 0.28,
    isSolvent: true,
    ownerId: 'NPC_TOURISM_01',
  },
  {
    id: 'DM_GUESTHOUSE_1',
    name: 'Roseau Valley Guesthouse',
    industry: 'TOURISM',
    type: 'SOLE_TRADER',
    parish: 'SAINT_GEORGE',
    revenue: 180_000,
    costs: 140_000,
    employeesCount: 3,
    marketShare: 0.04,
    isSolvent: true,
    ownerId: 'NPC_TOURISM_02',
  },

  // === TRANSPORTATION ===
  {
    id: 'DM_TRANSPORT_1',
    name: 'Dominica Bus & Taxi Association',
    industry: 'TRANSPORTATION',
    type: 'ASSOCIATION',
    parish: 'SAINT_GEORGE',
    revenue: 3_200_000,        // aggregate of all members
    costs: 2_600_000,
    employeesCount: 180,       // owner-operators
    marketShare: 0.85,
    isSolvent: true,
    ownerId: null,
  },

  // === RETAIL ===
  {
    id: 'DM_RETAIL_1',
    name: 'Whitchurch & Co.',
    industry: 'RETAIL',
    type: 'PRIVATE_LIMITED',
    parish: 'SAINT_GEORGE',
    revenue: 8_500_000,
    costs: 7_200_000,
    employeesCount: 95,
    marketShare: 0.22,         // of formal retail
    isSolvent: true,
    ownerId: 'NPC_RETAIL_01',
  },
];
```

### Company monthly revenue model

```typescript
function computeCompanyRevenue(
  company: Company,
  markets: Market[],
  events: RandomEvent[],
  month: number
): number {
  // Markets are keyed by good, not industry — match on the good's category.
  // (`m.industry` does not exist; the prior lookup always failed and returned 0.)
  const relevantMarket = markets.find(m => {
    const good = GOODS.find(g => g.id === m.goodId);
    return good?.category === company.industry && m.parish === company.parish;
  });

  if (!relevantMarket) return 0;

  // Base revenue from market price × output
  const baseRevenue = relevantMarket.currentPrice * company.monthlyOutputUnits;

  // Market share effect — larger companies have more stable revenue
  const stabilityFactor = 0.80 + (company.marketShare * 0.20);

  // Event impact
  let eventImpact = 1.0;
  for (const event of events) {
    if (event.affectedIndustries.includes(company.industry)) {
      eventImpact -= event.severity * 0.35;
    }
  }

  // Seasonal effect already baked into market price
  return baseRevenue * stabilityFactor * Math.max(eventImpact, 0.10);
}
```

### Insolvency cascade

```typescript
type CompanyStatus = 'HEALTHY' | 'DISTRESSED' | 'CLOSED';

// Pure status decision from the loss streak. It deliberately does NOT mutate
// banks, government, parishes, or other agents: it has no handle to them, and the
// previous version reached for fields that do not exist — `company.parish` is a
// parish *id* string (so `.government`/`.propertyValueIndex` are undefined), the
// government is national (one per country, not per-parish), and a loan carries
// `bankId`, not a `bank` object. Closure cascades that touch shared world state
// run in applyClosureCascade from inside simulateOneMonth, where banks,
// government, and parishes are all in scope. Closure takes priority (>=6 ⇒ >=3).
function checkCompanySolvency(
  consecutiveLossMonths: number
): { status: CompanyStatus } {
  if (consecutiveLossMonths >= 6) return { status: 'CLOSED' };
  if (consecutiveLossMonths >= 3) return { status: 'DISTRESSED' };  // "…is struggling"
  return { status: 'HEALTHY' };
}

// Runs once, on the transition into CLOSED, from the month loop so it can act on
// live world entities rather than fields a lone company does not own.
function applyClosureCascade(company: Company, world: WorldState): void {
  // 1. Employees become unemployed (live agents → Phase 8 counts them).
  company.employees.forEach(emp => {
    emp.employmentStatus = 'UNEMPLOYED';
    emp.monthlyIncome = 0;
    emp.employer = null;
  });

  // 2. Loans default. Do NOT hand-edit bank NPL here — Phase 7's
  //    checkBankSolvency recomputes each bank's ratio from all loans (these
  //    included), so a manual bump via the non-existent `loan.bank` would both
  //    crash and double-count. Marking status is enough.
  company.loans.forEach(loan => { loan.status = 'DEFAULT'; });

  // 3. Suppliers lose a customer — their demand drops.
  updateSupplierDemand(company, world);

  // 4. Tax revenue drops — but do NOT hand-decrement it here. The government is
  //    national, and Phase 8's computeTaxRevenue sums only operating companies,
  //    so this now-CLOSED company stops contributing automatically (a manual
  //    decrement would be overwritten that same phase). estimatedAnnualTax is
  //    what computeTaxRevenue reads per company.

  // 5. Property values in the company's parish soften slightly. Resolve the id
  //    to the live Parish; init propertyValueIndex to 1.0 on first touch.
  const parish = world.parishes.find(p => p.id === company.parish);
  if (parish) parish.propertyValueIndex = (parish.propertyValueIndex ?? 1.0) * 0.98;
}
```

---

## Government System

```typescript
interface Government {
  countryId: string;
  monthlyTaxRevenue: number;
  monthlySpending: number;
  fiscalBalance: number;        // positive = surplus, negative = deficit
  debtToGdpRatio: number;
  unemploymentRate: number;
  publicSentiment: number;      // 0–1, affects election outcomes
  corruptionLevel: number;      // drifts based on events and decisions
  policies: ActivePolicy[];
}

function governmentAct(gov: Government, world: WorldState): void {
  // Collect taxes. computeTaxRevenue sums only operating companies, so a company
  // that closed this month (status CLOSED) already drops out here — there is no
  // need to hand-decrement tax in the closure cascade (and doing so would be
  // overwritten by this line anyway).
  gov.monthlyTaxRevenue = computeTaxRevenue(world);

  // Age active policies (duration is in months) and retire the expired ones, so
  // `duration` actually means something and a policy can re-trigger later.
  gov.policies = gov.policies
    .map(p => ({ ...p, duration: p.duration - 1 }))
    .filter(p => p.duration > 0);

  // Only enact a policy if one of that type is not already running — otherwise a
  // persistent condition stacks a fresh policy every single month, unbounded.
  const hasPolicy = (type: ActivePolicy['type']) =>
    gov.policies.some(p => p.type === type);

  // Respond to unemployment (unemploymentRate is set on the government in Phase 8)
  if (gov.unemploymentRate > 0.15 && !hasPolicy('PUBLIC_WORKS_PROGRAM')) {
    gov.policies.push({
      type: 'PUBLIC_WORKS_PROGRAM',
      cost: 500_000,           // EC$ per month
      effect: 'EMPLOYMENT',
      magnitude: 200,          // jobs created
      duration: 6,             // months
    });
  }

  // Respond to bank distress
  const distressedBanks = world.banks.filter(b => b.state === 'DISTRESSED');
  if (distressedBanks.length > 0 && !hasPolicy('BANK_LIQUIDITY_SUPPORT')) {
    gov.policies.push({
      type: 'BANK_LIQUIDITY_SUPPORT',
      cost: distressedBanks[0].totalAssets * 0.05,
      effect: 'BANK_STABILITY',
      magnitude: 0.20,
      duration: 3,
    });
  }

  // Respond to fiscal stress
  if (gov.fiscalBalance < -gov.monthlyTaxRevenue * 0.30 && !hasPolicy('AUSTERITY')) {
    gov.policies.push({
      type: 'AUSTERITY',
      cost: 0,
      effect: 'SPENDING_CUT',
      magnitude: 0.15,
      duration: 12,
    });
  }

  // Election cycle — every 5 years. Guard against month 0 also firing.
  if (world.month > 0 && world.month % 60 === 0) {
    triggerElection(gov, world);
  }
}
```

---

## Random Events System

### Event types and probabilities

```typescript
const RANDOM_EVENTS: EventDefinition[] = [
  {
    id: 'HURRICANE_MAJOR',
    name: 'Major hurricane',
    probability: 0.04,          // per month during hurricane season (Jun–Nov)
    seasonMonths: [5,6,7,8,9,10],
    severityRange: [0.6, 1.0],
    affectedIndustries: ['FISHING','AGRICULTURE','TOURISM','CONSTRUCTION','TRANSPORTATION'],
    durationMonths: [3, 8],
    description: 'A major hurricane has struck Dominica.',
    playerInformation: 'WEATHER_WARNING_3_DAYS',  // player gets advance notice
    cascadeEffects: [
      'CONSTRUCTION_DEMAND_SPIKE',
      'TOURISM_COLLAPSE',
      'FOOD_PRICE_SPIKE',
      'GOVERNMENT_DEBT_INCREASE',
      'DIASPORA_REMITTANCE_INCREASE',  // family abroad sends money
    ],
  },
  {
    id: 'HURRICANE_MINOR',
    name: 'Tropical storm',
    probability: 0.08,
    seasonMonths: [5,6,7,8,9,10],
    severityRange: [0.2, 0.5],
    affectedIndustries: ['FISHING','AGRICULTURE','TOURISM'],
    durationMonths: [1, 3],
    description: 'A tropical storm has affected the island.',
    playerInformation: 'WEATHER_WARNING_2_DAYS',
    cascadeEffects: ['FOOD_PRICE_SPIKE'],
  },
  {
    id: 'DROUGHT',
    name: 'Drought',
    probability: 0.03,
    seasonMonths: [0,1,2,3,11],  // dry season
    severityRange: [0.3, 0.7],
    affectedIndustries: ['AGRICULTURE'],
    durationMonths: [2, 5],
    description: 'Unusually dry conditions are affecting agricultural output.',
    playerInformation: 'FARMERS_COOPERATIVE_REPORT',
    cascadeEffects: ['FOOD_PRICE_SPIKE', 'RURAL_UNEMPLOYMENT'],
  },
  {
    id: 'TOURISM_BOOM',
    name: 'Tourism boom',
    probability: 0.05,
    seasonMonths: [11,0,1,2,3],  // high season
    severityRange: [0.3, 0.7],   // severity = magnitude of boom
    affectedIndustries: ['TOURISM','TRANSPORTATION','RETAIL'],
    durationMonths: [2, 6],
    description: 'Dominica is receiving unusual tourist attention.',
    playerInformation: 'NEWS_ARTICLE_TOURISM',
    cascadeEffects: ['EMPLOYMENT_INCREASE','PROPERTY_PRICE_INCREASE'],
  },
  {
    id: 'REGIONAL_RECESSION',
    name: 'Regional economic slowdown',
    probability: 0.02,
    seasonMonths: null,          // any time
    severityRange: [0.4, 0.8],
    affectedIndustries: ['ALL'],
    durationMonths: [6, 18],
    description: 'A regional economic slowdown is affecting trade.',
    playerInformation: 'ECCB_ECONOMIC_REPORT',
    cascadeEffects: ['REMITTANCE_DECLINE','EXPORT_DEMAND_DROP','TIGHT_CREDIT'],
  },
  {
    id: 'GOVERNMENT_INFRASTRUCTURE',
    name: 'Major government infrastructure project',
    probability: 0.03,
    seasonMonths: null,
    severityRange: [0.3, 0.6],
    affectedIndustries: ['CONSTRUCTION','TRANSPORTATION'],
    durationMonths: [12, 36],
    description: 'The government has announced a major infrastructure project.',
    playerInformation: 'GOVERNMENT_GAZETTE',
    cascadeEffects: ['CONSTRUCTION_DEMAND_SPIKE','EMPLOYMENT_INCREASE'],
  },
  {
    id: 'FISHING_STOCK_DECLINE',
    name: 'Fish stock decline',
    probability: 0.04,
    seasonMonths: null,
    severityRange: [0.2, 0.6],
    affectedIndustries: ['FISHING'],
    durationMonths: [3, 12],
    description: 'Fish stocks in local waters have declined.',
    playerInformation: 'FISHERFOLK_COOPERATIVE_REPORT',
    cascadeEffects: ['FISH_PRICE_SPIKE','FISHER_INCOME_DROP'],
  },
  {
    id: 'FUEL_PRICE_SHOCK',
    name: 'Global fuel price spike',
    probability: 0.05,
    seasonMonths: null,
    severityRange: [0.2, 0.7],
    affectedIndustries: ['FISHING','TRANSPORTATION','CONSTRUCTION'],
    durationMonths: [2, 8],
    description: 'Global oil prices have risen sharply.',
    playerInformation: 'NEWS_REGIONAL',
    cascadeEffects: ['OPERATING_COST_INCREASE','TRANSPORT_COST_INCREASE'],
  },
  {
    id: 'DIASPORA_INVESTMENT_WAVE',
    name: 'Diaspora investment surge',
    probability: 0.03,
    seasonMonths: null,
    severityRange: [0.3, 0.6],
    affectedIndustries: ['CONSTRUCTION','RETAIL','TOURISM'],
    durationMonths: [6, 24],
    description: 'Dominicans abroad are sending home more investment capital.',
    playerInformation: 'COMMUNITY_RUMOR',  // heard through social network first
    cascadeEffects: ['PROPERTY_PRICE_INCREASE','CONSTRUCTION_DEMAND_SPIKE'],
  },
];

function rollRandomEvents(world: WorldState): RandomEvent[] {
  const currentMonth = world.month % 12;
  const activeEvents: RandomEvent[] = [];

  for (const def of RANDOM_EVENTS) {
    // Check if this event type is eligible this month
    if (def.seasonMonths && !def.seasonMonths.includes(currentMonth)) continue;

    // Roll against probability
    if (Math.random() < def.probability) {
      activeEvents.push({
        id: `${def.id}_${world.month}`,
        definitionId: def.id,
        severity: randomBetween(def.severityRange[0], def.severityRange[1]),
        durationRemaining: randomBetween(def.durationMonths[0], def.durationMonths[1]),
        affectedIndustries: def.affectedIndustries,
        playerInfoType: def.playerInformation,
      });
    }
  }

  return activeEvents;
}
```

### Information asymmetry — what the player learns and when

The player never receives perfect information about events.
The information type determines how and when they find out.

```typescript
const INFORMATION_DELIVERY = {
  WEATHER_WARNING_3_DAYS:    'Direct — hurricane tracker on phone. Clear.',
  WEATHER_WARNING_2_DAYS:    'Direct — weather service alert.',
  FARMERS_COOPERATIVE_REPORT:'Through social network if player has agri connections.',
  FISHERFOLK_COOPERATIVE_REPORT: 'Through social network if player fishes.',
  NEWS_ARTICLE_TOURISM:      'Available to all — newspaper, radio.',
  ECCB_ECONOMIC_REPORT:      'Available to all but requires literacy to interpret.',
  GOVERNMENT_GAZETTE:        'Official — available to all, delayed 2 weeks.',
  NEWS_REGIONAL:             'Newspaper, radio — available to all.',
  COMMUNITY_RUMOR:           'Through social network first. Newspaper 3 weeks later.',
};
```

---

## Seed vs. Runtime Fields

Every entity has three kinds of field, and several bugs in earlier revisions came
from blurring them. Stated once here so the hydration contract is explicit rather
than inferred:

- **Seed** — present in the static `STARTING_*`/`WORLD` literals. The designer's
  starting conditions.
- **Runtime** — *not* in the seed; initialised when the world is built (or lazily
  on first touch) and mutated by `simulateOneMonth`. A seed object is not a valid
  runtime object until these are populated.
- **Derived** — never stored; computed on demand. Persisting these is a bug (they
  drift out of sync).

### Person / `NPCAgent`

| Kind | Fields |
|---|---|
| Seed / hydrated | `id`, `name`, `age`, `parish`, `familyId`, `familyBackground`, `formativeEvent`, OCEAN, non-cognitive (`knowledgeAcquisitionRate`, …), capitals, `knowledge`, `experience`, `employmentStatus`, `occupation`, `monthlyIncome`, `monthlyLivingCosts` — the player's come from the `CharacterProfile` (agent #1); NPCs are generated |
| Runtime | `employer` (live `Company` ref), `loans`, `diasporaNetwork`, `previousMonthCapital`, `businessesStarted`, `keptPromises`, `brokenContracts`, drifted `neuroticism` |
| Derived (never stored) | `netWorth` = `cash + Σ assets − Σ loan principal`; `riskTolerance`/`lossAversion`/`patience` (from OCEAN) |

### Company

| Kind | Fields |
|---|---|
| Seed | `id`, `name`, `industry`, `type`, `parish`, `revenue`, `costs`, `marketShare`, `ownerId`, `monthlyOutputUnits`, `employeesCount` |
| Runtime | `employees` (live `NPCAgent[]`, hydrated from `employeesCount`), `loans`, `baseOperatingCosts` (≈ `costs/12`), `monthlyRevenue`, `profit`, `consecutiveLossMonths` (0), `status` (`HEALTHY`), `isSolvent` (`true`), `estimatedAnnualTax` |
| Derived | company net worth / valuation (priced from earnings, never a stored constant) |

### Bank

| Kind | Fields |
|---|---|
| Seed | `id`, `name`, `type`, `countryId`, `totalAssets`, `reserves`, `reserveRatio`, `totalLoans`, `nonPerformingLoanRatio` (initial), `solvencyScore`, `lendingAppetite`, `biasTowardFormalSector` |
| Runtime | `state` (`HEALTHY`/`STRESSED`/`DISTRESSED`/`INSOLVENT`), `baseLendingAppetite` (captured from seed `lendingAppetite` on first tick) |
| Derived each tick | `nonPerformingLoanRatio` (recomputed from live loans in Phase 7 — the seed value is only the starting point), current `lendingAppetite` = `baseLendingAppetite × statusFactor` |

### Parish

| Kind | Fields |
|---|---|
| Seed | `id`, `name`, `capital`, `population`, `economicFocus`, `infrastructureScore`, `marketAccessScore` |
| Runtime | `propertyValueIndex` (init `1.0`; softened by closure cascades) |

> **Rule for `simulateOneMonth`.** Aggregates that a phase recomputes
> (bank `nonPerformingLoanRatio` in Phase 7, government `monthlyTaxRevenue` in
> Phase 8) must **not** be hand-edited by cascades — the recompute would overwrite
> the edit, and the two can disagree mid-tick. Cascades change the *inputs*
> (mark a loan `DEFAULT`, close a company); the owning phase derives the aggregate.

---

## simulateOneMonth()

The master function. Called once per game month.
Order of operations is critical — do not reorder.

```typescript
// Occupation (Industry) → knowledge/experience domain key. The two namespaces
// differ in case and spelling ('FISHING' vs 'fishing'), so indexing a domain
// object with a raw Industry silently yields undefined → NaN. Always map first.
const INDUSTRY_DOMAIN: Record<Industry, keyof ExperienceDomains> = {
  FISHING:        'fishing',
  AGRICULTURE:    'agriculture',
  CONSTRUCTION:   'construction',
  INFORMAL_TRADE: 'informalTrade',
  RETAIL:         'retail',
  TOURISM:        'tourism',
  TRANSPORTATION: 'transportation',
  FINANCE:        'finance',
};

async function simulateOneMonth(world: WorldState): Promise<WorldState> {
  // Entity-graph model. agents, companies, banks, markets, government and the
  // player are ONE graph of shared, mutable objects: `agent.employer` IS the
  // Company instance, `company.employees` ARE the Agent instances, and
  // `loan.bankId` resolves into `world.banks`. Each phase mutates the live
  // entities in place, so a change made in one phase — a company closing, an
  // agent losing a job, a loan defaulting — is immediately visible to every
  // later phase and through every cross-reference. That shared-reference
  // property is exactly what the closure cascade relies on. (The earlier
  // version rebuilt each collection with `.map`, so cascade effects written onto
  // an old company object never reached the freshly copied agents/banks.)
  // Order of operations is critical — do not reorder.
  const { month } = world;

  // ── PHASE 1: Roll random events ──────────────────────────────────────────
  const newEvents = rollRandomEvents(world);
  for (const e of world.events) e.durationRemaining -= 1;
  world.events = [...world.events.filter(e => e.durationRemaining > 0), ...newEvents];

  // Deliver information to the player based on their network and event type.
  const playerNotifications =
    generatePlayerNotifications(world.player, newEvents, world);

  // ── PHASE 2: Update market prices ────────────────────────────────────────
  for (const market of world.markets) updateMarketPrice(market, world.events, month);

  // ── PHASE 3: Companies earn revenue ──────────────────────────────────────
  for (const company of world.companies) {
    if (company.status === 'CLOSED') continue;
    company.monthlyRevenue =
      computeCompanyRevenue(company, world.markets, world.events, month);
  }

  // ── PHASE 4: Deduct costs; check solvency; cascade on closure ────────────
  for (const company of world.companies) {
    if (company.status === 'CLOSED') continue;   // already gone; skip

    const wageBill = company.employees.reduce((sum, e) => sum + e.monthlyIncome, 0);
    const loanPayments = company.loans
      .filter(l => l.status === 'ACTIVE')
      .reduce((sum, l) => sum + l.monthlyPayment, 0);
    const operatingCosts = company.baseOperatingCosts *
      (1 + world.events.filter(e =>
        e.affectedIndustries.includes(company.industry)).length * 0.05);

    company.profit = company.monthlyRevenue - wageBill - loanPayments - operatingCosts;
    company.consecutiveLossMonths =
      company.profit < 0 ? company.consecutiveLossMonths + 1 : 0;

    // Pure status decision, then the cascade on the transition into CLOSED.
    // Because employees and loans are live shared references, the cascade's
    // effects (unemployment, defaults, lost tax) are in place for Phases 5/7/8.
    const { status } = checkCompanySolvency(company.consecutiveLossMonths);
    if (status === 'CLOSED') applyClosureCascade(company, world);
    company.status = status;
    company.isSolvent = status !== 'CLOSED';
  }

  // ── PHASE 5: Persons receive wages, pay personal loans ───────────────────
  for (const agent of world.agents) {
    // employer is the live Company; a closed employer already nulled this
    // agent's employer and zeroed its income during Phase 4's cascade.
    const income = agent.employer
      ? (agent.employer.isSolvent ? agent.monthlyIncome : 0)
      : agent.monthlyIncome;   // self-employed draw (or laid-off → 0)

    const personalLoanPayments = agent.loans
      .filter(l => l.status === 'ACTIVE')
      .reduce((sum, l) => sum + l.monthlyPayment, 0);

    const newCash = agent.cash + income - personalLoanPayments - agent.monthlyLivingCosts;
    if (newCash < 0 && agent.loans.some(l => l.status === 'ACTIVE')) {
      triggerPersonalLoanDefault(agent);   // marks this agent's loans DEFAULT in place
    }
    agent.cash = Math.max(newCash, 0);
  }

  // ── PHASE 6: NPC decision engine ─────────────────────────────────────────
  for (const agent of world.agents) {
    if (agent.isPlayer) continue;          // the player decides in real time
    applyAction(agent, npcDecide(agent, world), world);   // mutates the agent
  }

  // ── PHASE 7: Bank solvency check ─────────────────────────────────────────
  // Recomputes each bank's NPL from every live loan — personal and company,
  // including the ones Phase 4 just defaulted. This is precisely why the closure
  // cascade must NOT touch bank NPL itself: doing so would double-count here.
  for (const bank of world.banks) {
    const bankLoans = [
      ...world.agents.flatMap(a => a.loans),
      ...world.companies.flatMap(c => c.loans),
    ].filter(l => l.bankId === bank.id);

    const { status, nplRatio } = checkBankSolvency(bank, bankLoans);
    bank.state = status;
    bank.nonPerformingLoanRatio = nplRatio;

    // Derive appetite from a stable base each month. Mutating bank.lendingAppetite
    // in place (`= bank.lendingAppetite * 0.40`) compounds the cut every distressed
    // month and never recovers; deriving from baseLendingAppetite lets a bank that
    // returns to HEALTHY restore full appetite. INSOLVENT lends nothing.
    bank.baseLendingAppetite ??= bank.lendingAppetite;   // capture the seed value once
    const appetiteFactor =
      status === 'INSOLVENT'  ? 0.00 :
      status === 'DISTRESSED' ? 0.40 :
      status === 'STRESSED'   ? 0.70 :
      1.00;
    bank.lendingAppetite = bank.baseLendingAppetite * appetiteFactor;
  }

  // ── PHASE 8: Government acts ──────────────────────────────────────────────
  // Unemployment now reflects Phase 4 closures — those workers are UNEMPLOYED.
  world.government.unemploymentRate =
    world.agents.filter(a => a.employmentStatus === 'UNEMPLOYED').length
    / world.agents.length;
  governmentAct(world.government, world);   // mutates the government in place

  // ── PHASE 9: Knowledge and experience update ──────────────────────────────
  for (const agent of world.agents) {
    // Map the occupation Industry to its domain key before indexing (see
    // INDUSTRY_DOMAIN) — indexing with the raw Industry produced NaN.
    const activeDomain = agent.occupation ? INDUSTRY_DOMAIN[agent.occupation] : null;

    // Experience grows in the active domain, accelerated by knowledgeAcquisitionRate
    // (the "learns faster" trait from Fork 2D — previously defined but never applied).
    if (activeDomain) {
      const gain = 0.008 * (1 + agent.knowledgeAcquisitionRate);
      agent.experience[activeDomain] =
        Math.min(1.0, agent.experience[activeDomain] + gain);
    }

    // Knowledge decays if unused (0.2% per month) — never the active domain.
    for (const domain of Object.keys(agent.knowledge)) {
      if (domain !== activeDomain) {
        agent.knowledge[domain] = Math.max(0, agent.knowledge[domain] - 0.002);
      }
    }

    // Personality drift from major events (Roberts & Mroczek, 2008) — slow,
    // only visible over years.
    if (agent.cash < agent.previousMonthCapital * 0.50) {
      agent.neuroticism = Math.min(0.95, agent.neuroticism + 0.003);
    }
    agent.previousMonthCapital = agent.cash;
  }

  // ── PHASE 10: Increment legacy scores ────────────────────────────────────
  world.playerLegacy = computeLegacyIncrement(world.player, world);

  // ── ADVANCE THE CLOCK ─────────────────────────────────────────────────────
  world.month = month + 1;
  world.playerNotifications = playerNotifications;
  return world;
}
```

> **A note on iteration safety.** Phase 6 iterates `world.agents` while
> `applyAction` mutates agents in place — safe, because it never adds or removes
> array elements mid-loop. If an action must create a new agent or company
> (a birth, a new business), queue it and append after the loop completes;
> never splice `world.agents`/`world.companies` while a `for…of` over it is
> running.
```

---

## Legacy Score System

The player never sees this accumulating. They only see it at death.

```typescript
function computeLegacyIncrement(
  player: NPCAgent,
  world: WorldState
): LegacyScore {
  const prev = world.playerLegacy;

  // Wealth legacy — net worth growth this month
  const netWorth = player.cash +
    player.economicAssets.reduce((sum, a) => sum + a.value, 0) -
    player.loans.reduce((sum, l) => sum + l.remainingPrincipal, 0);
  const wealthDelta = (netWorth - prev.lastNetWorth) / 1000;

  // Family legacy — children's outcomes (accumulates as children age)
  const familyDelta = computeFamilyLegacy(player, world);

  // Community legacy — jobs created, contracts given locally
  const jobsCreated = world.companies
    .filter(c => c.ownerId === player.id)
    .reduce((sum, c) => sum + c.employeesCount, 0);
  const communityDelta = jobsCreated * 0.001;

  // Innovation legacy — new businesses, new industries introduced
  const innovationDelta = player.businessesStarted
    .filter(b => b.wasFirstInIndustryInParish).length * 0.005;

  // Environmental legacy — resource extraction vs. conservation
  const environmentDelta = computeEnvironmentalImpact(player, world);

  // Reputation — based on agreeableness, kept promises, community acts
  const reputationDelta = (player.agreeableness * 0.002) +
    (player.keptPromises * 0.003) -
    (player.brokenContracts * 0.005);

  return {
    ...prev,
    wealthScore: prev.wealthScore + wealthDelta,
    familyScore: prev.familyScore + familyDelta,
    communityScore: prev.communityScore + communityDelta,
    innovationScore: prev.innovationScore + innovationDelta,
    environmentScore: prev.environmentScore + environmentDelta,
    reputationScore: prev.reputationScore + reputationDelta,
    lastNetWorth: netWorth,
  };
}
```

---

## Informal Economy and Remittances

One of the most important systems in the Dominican economy.
Not optional. Not a side mechanic. A primary capital allocation channel.

```typescript
interface DiasporaNetwork {
  agentId: string;
  contacts: DiasporaContact[];
  totalRemittancesReceived: number;
  accessLevel: 'NONE' | 'PARTIAL' | 'STRONG';
}

interface DiasporaContact {
  location: 'UK' | 'USVI' | 'CANADA' | 'USA' | 'FRANCE' | 'BARBADOS';
  relationship: 'PARENT' | 'SIBLING' | 'AUNT_UNCLE' | 'COUSIN' | 'FRIEND';
  monthlyRemittance: number;    // EC$ per month, variable
  canSponsorMigration: boolean;
  trustLevel: number;
}

function processRemittances(agent: NPCAgent, world: WorldState): number {
  if (!agent.diasporaNetwork || agent.diasporaNetwork.accessLevel === 'NONE') {
    return 0;
  }

  let totalRemittance = 0;

  for (const contact of agent.diasporaNetwork.contacts) {
    // Remittances increase when local conditions are bad
    const distressMultiplier = world.events.some(e =>
      e.definitionId === 'HURRICANE_MAJOR') ? 2.5
      : world.government.unemploymentRate > 0.15 ? 1.4   // unemployment lives on government
      : 1.0;

    // Remittances decrease when contact's economy is struggling
    const senderEconomyHealth = world.foreignEconomies[contact.location].health;
    const senderMultiplier = senderEconomyHealth < 0.5 ? 0.6 : 1.0;

    totalRemittance +=
      contact.monthlyRemittance *
      distressMultiplier *
      senderMultiplier *
      (0.85 + Math.random() * 0.30);  // natural variation
  }

  return totalRemittance;
}

// Informal lending — occurs outside banking system through trust networks
function processInformalLending(
  borrower: NPCAgent,
  amount: number,
  world: WorldState
): InformalLoan | null {
  // Find willing lenders in social network
  const networkContacts = world.agents.filter(a =>
    borrower.socialNetwork.includes(a.id) &&
    a.cash > amount * 1.5 &&
    a.agreeableness > 0.55
  );

  if (networkContacts.length === 0) return null;

  const lender = networkContacts.sort((a, b) =>
    b.agreeableness - a.agreeableness)[0];

  // Informal loans: no interest or very low interest, but social obligation
  return {
    lenderId: lender.id,
    borrowerId: borrower.id,
    principal: amount,
    interestRate: 0,             // typically no interest between family/friends
    socialObligation: 'HIGH',    // but carries heavy social expectation
    repaymentTerms: 'FLEXIBLE',  // no fixed schedule
    defaultConsequence: 'SOCIAL_NETWORK_DAMAGE', // not legal, but real
  };
}
```

---

## Economic Cycle Model

The simulation runs through real economic cycles.
Dominica's economy is highly susceptible to external shocks.

```typescript
type CyclePhase = 'EXPANSION' | 'PEAK' | 'CONTRACTION' | 'RECESSION' | 'RECOVERY';

interface EconomicCycle {
  phase: CyclePhase;
  monthsInPhase: number;
  gdpGrowthRate: number;
  creditAvailability: number;   // 0–1
  consumerConfidence: number;   // 0–1
  businessInvestment: number;   // 0–1
}

function updateEconomicCycle(
  current: EconomicCycle,
  events: RandomEvent[],
  world: WorldState
): EconomicCycle {
  // Cycle transition probabilities
  const transitionMatrix: Record<CyclePhase, Partial<Record<CyclePhase, number>>> = {
    EXPANSION:   { EXPANSION: 0.85, PEAK: 0.15 },
    PEAK:        { PEAK: 0.60, CONTRACTION: 0.40 },
    CONTRACTION: { CONTRACTION: 0.70, RECESSION: 0.20, RECOVERY: 0.10 },
    RECESSION:   { RECESSION: 0.65, RECOVERY: 0.35 },
    RECOVERY:    { RECOVERY: 0.60, EXPANSION: 0.40 },
  };

  // Major negative events push toward contraction
  const majorHurricane = events.find(e => e.definitionId === 'HURRICANE_MAJOR');
  if (majorHurricane && current.phase === 'EXPANSION') {
    return transitionTo('CONTRACTION', current);
  }

  // Natural transition
  const transitions = transitionMatrix[current.phase];
  const roll = Math.random();
  let cumulative = 0;

  for (const [nextPhase, probability] of Object.entries(transitions)) {
    cumulative += probability;
    if (roll < cumulative) {
      return transitionTo(nextPhase as CyclePhase, current);
    }
  }

  return { ...current, monthsInPhase: current.monthsInPhase + 1 };
}
```

---

## Performance Notes

Simulating 5,000 agents monthly requires optimization.

```typescript
// Agent update batching — process in chunks to avoid blocking
async function updateAgentsBatched(
  agents: NPCAgent[],
  world: WorldState,
  batchSize: number = 100
): Promise<NPCAgent[]> {
  const results: NPCAgent[] = [];

  for (let i = 0; i < agents.length; i += batchSize) {
    const batch = agents.slice(i, i + batchSize);
    const updated = await Promise.all(
      batch.map(agent => updateAgent(agent, world))
    );
    results.push(...updated);

    // Yield to event loop between batches
    await new Promise(resolve => setImmediate(resolve));
  }

  return results;
}

// Statistical proxies for agents not in full simulation
function computeAggregateFlows(world: WorldState): AggregateFlows {
  // Model the other 67,000 citizens as aggregate demand/supply flows
  // rather than individual agents — much cheaper computationally
  return {
    aggregateConsumption: world.gdp * 0.62 / 12,
    aggregateSavings: world.gdp * 0.18 / 12,
    aggregateInvestment: world.gdp * 0.20 / 12,
  };
}
```

---

## References

- Kahneman, D. & Tversky, A. (1979). Prospect theory: An analysis of
  decision under risk. Econometrica.
- Prelec, D. (1998). The probability weighting function. Econometrica.
- Acemoglu, D. & Robinson, J. (2012). Why nations fail.
- Banerjee, A. & Duflo, E. (2011). Poor economics.
- Roberts, B.W. & Mroczek, D. (2008). Personality trait change in adulthood.
- Eastern Caribbean Central Bank (ECCB). Annual Economic and Financial Review.
- World Bank. Dominica Country Data (2023).
- Caribbean Development Bank. Regional Economic Review (2023).
- Putnam, R. (2000). Bowling alone.
- Roemer, J. (1998). Equality of opportunity.

---

*Document version 1.2 — Island Life game design*
*World simulation specification — Dominica economy model*

**Changelog v1.1 → v1.2**
- Fixed the Phase 9 learning update: `agent.occupation` is an `Industry`
  (`'FISHING'`) but knowledge/experience are keyed by lowercase domain
  (`'fishing'`), so `updatedExperience[agent.occupation]` evaluated to
  `undefined → NaN` and the decay guard `domain !== agent.occupation` never
  matched (the active domain decayed too). Added an `INDUSTRY_DOMAIN` map and
  routed both through it.
- Wired in `knowledgeAcquisitionRate`: experience now grows `× (1 + rate)`, so the
  Fork 2D "learns 20% faster" trait actually does something. Added the field to
  `NPCAgent` (shared with `CharacterProfile`).
- Fixed `computeCompanyRevenue`: the market lookup tested `m.industry`, which no
  `Market` has (markets are keyed by `goodId`; the good carries `category`), so it
  always returned 0. Now resolves the good and matches on `category`.
- Declared the `Company` interface. The seed only set descriptive fields, but
  `checkCompanySolvency`/Phase 4 use `employees`, `loans`, `baseOperatingCosts`,
  `consecutiveLossMonths`, `status`, `estimatedAnnualTax`. Documented these as
  runtime fields hydrated at world construction (same pattern as `NPCAgent`),
  and the `employeesCount` (seed) vs `employees` (live agents) split.
- Fixed the closure cascade in `checkCompanySolvency`. It mutated entities it had
  no handle to and that do not exist: `company.parish.government.taxRevenue` and
  `company.parish.propertyValueIndex` (`company.parish` is an id string, and the
  government is national, not per-parish), plus `loan.bank.nonPerformingLoanRatio`
  (loans carry `bankId`, not a `bank` object) — every line would throw or write
  `NaN`, and the NPL bump double-counted what Phase 7 already recomputes. Split
  it: `checkCompanySolvency(consecutiveLossMonths)` is now pure (status only), and
  a new `applyClosureCascade(company, world)` runs from Phase 4 on the transition
  into CLOSED, decrementing the *national* government's tax revenue, resolving the
  parish id to the live Parish before softening property values, and leaving bank
  NPL to Phase 7.
  > Note: the cascade requires `company.employees` to be the same agent instances
  > as `world.agents` (shared references). The month loop is written in a mix of
  > immutable `.map` copies and in-place mutation; a production build should commit
  > to one model — a mutable entity graph is the natural fit for a cascade-heavy
  > simulation like this.
- Refactored `simulateOneMonth` onto that mutable entity graph (the decision
  called out in the note above). The phases no longer rebuild each collection
  with `.map`; they mutate the live `world.agents`/`companies`/`banks`/`markets`/
  `government` in place. Consequences now propagate by shared reference:
  `agent.employer` is the live `Company` (Phase 5 reads `agent.employer.isSolvent`
  directly instead of a `.find` by id), a closure in Phase 4 unemploys the very
  agents Phase 8 then counts, and the defaults it marks are the ones Phase 7
  re-totals. Added a guard note on not splicing the agent/company arrays mid-loop
  (queue births/new businesses and append after the phase).
- Fixed `updateMarketPrice`: it read an undefined `currentMonth` for seasonality
  (every other function uses `world.month`). Added a `month` parameter and pass
  `world.month` from Phase 2; renamed the local index to avoid shadowing.
- Fixed `governmentAct`: read `economy.unemploymentRate` which never existed
  (unemployment lives on `government`, set in Phase 8) — now reads
  `gov.unemploymentRate`. Also (a) policies were pushed every month a condition
  held, stacking unboundedly — added a same-type guard; (b) `duration` was dead —
  policies now age and retire so they can re-trigger later; (c) removed the
  closure cascade's manual tax decrement, which Phase 8's `computeTaxRevenue`
  (summing only operating companies) overwrote anyway; (d) election no longer
  fires at month 0. Parameter retyped `EconomyState → WorldState` to match Phase 8.
- Fixed bank appetite in Phase 7: `INSOLVENT` was unhandled, and multiplying
  `bank.lendingAppetite` in place compounded the cut every distressed month with
  no recovery. Now derives appetite from a captured `baseLendingAppetite`
  (INSOLVENT → 0), so a bank returning to HEALTHY restores full appetite.
- Fixed `processInformalLending` `socialObligation: HIGH` (undefined identifier)
  → `'HIGH'`; and `processRemittances` `world.economy.unemploymentRate` →
  `world.government.unemploymentRate` (the canonical location).
- Added `name`, `familyBackground`, and `formativeEvent` to `NPCAgent` — the
  narrative layer reads these (e.g. `describeFamilyBackground`) and agents have
  names, but they were undeclared; they're persistent markers carried from
  character creation.

**Changelog v1.0 → v1.1**
- Fixed `computeLegacyIncrement`: undefined `familyDelta` (the value was computed
  as `familyScore`); renamed for consistency with the other deltas.
- Fixed `updateMarketPrice`: now returns `Market` (Phase 2 was producing a
  `number[]`), commits `currentPrice`, and applies the 30%-of-base floor before
  recording history. Standardised on `currentPrice` (was mixed with `price`).
- Fixed `checkCompanySolvency`: returns `{ status }` and Phase 4 now persists it,
  so `DISTRESSED`/`CLOSED` survive the monthly map; closure now takes priority
  over distress and cascades act on the live company.
- Fixed `checkBankSolvency`: guard against divide-by-zero when a bank has no
  active loans (was `NaN`).
- Aligned the economic schema with *Character Creation*: `economicCapital → cash`,
  `Asset.estimatedValue → value`; added `socialCapitalDiaspora` and the fields
  the agent code already used (`socialNetwork`, `diasporaNetwork`, `isPlayer`,
  `previousMonthCapital`, `monthlyLivingCosts`, `businessesStarted`,
  `keptPromises`, `brokenContracts`). Standardised income on `monthlyIncome`.
- Added a "Player = agent #1" note documenting the shared schema and that
  `netWorth` is derived, not stored.
