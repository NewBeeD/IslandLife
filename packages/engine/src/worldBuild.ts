import {
  BANKS,
  COUNTRY,
  GOODS,
  PARISHES,
  REPRESENTATIVE_GOOD,
  STARTING_COMPANIES,
} from '@island/shared';
import type {
  Bank,
  Company,
  ExperienceDomains,
  FamilyBackground,
  FormativeEvent,
  KnowledgeDomains,
  Loan,
  Market,
  NPCAgent,
  Parish,
  ParishId,
  RNG,
  WorldState,
} from '@island/shared';
import { createCharacter, hydratePlayerInto } from './characterCreation';
import type { CreationChoices } from './characterCreation';
import { clamp01, createRng } from './rng';

const FAMILY_BG: FamilyBackground[] = [
  'FISHING_PORTSMOUTH', 'FARMING_INTERIOR', 'CIVIL_SERVANT_ROSEAU', 'TRADING_ROSEAU',
];
const FORMATIVE: FormativeEvent[] = ['HURRICANE', 'DIASPORA_REMITTANCE', 'EXPLOITATION', 'MENTOR'];
const SELF_EMPLOY_INDUSTRIES = ['FISHING', 'AGRICULTURE', 'RETAIL', 'TOURISM'] as const;
const FIRST = ['Jean', 'Marcus', 'Celeste', 'Desmond', 'Eunice', 'Raymond', 'Claude', 'Magloire', 'Wilfred', 'Agnes', 'Curtis', 'Yvette'];
const LAST = ['Laville', 'Charles', 'St. Jean', 'Joseph', 'Magloire', 'Augustin', 'Baptiste', 'Pierre', 'Dorival', 'Frederick'];

function emptyKnowledge(rng: RNG): KnowledgeDomains {
  const k = (): number => clamp01(0.08 + rng.range(0, 0.15));
  return {
    fishing: k(), agriculture: k(), construction: k(), informalTrade: k(),
    retail: k(), tourism: k(), transportation: k(), finance: k(), generalLiteracy: k(),
  };
}
function emptyExperience(rng: RNG): ExperienceDomains {
  const k = (): number => clamp01(0.05 + rng.range(0, 0.1));
  return {
    fishing: k(), agriculture: k(), construction: k(), informalTrade: k(),
    retail: k(), tourism: k(), transportation: k(), finance: k(),
  };
}

function makeAgent(rng: RNG, id: string, parish: ParishId): NPCAgent {
  const openness = clamp01(rng.gaussian(0.52, 0.12));
  const conscientiousness = clamp01(rng.gaussian(0.55, 0.12));
  const extraversion = clamp01(rng.gaussian(0.54, 0.13));
  const agreeableness = clamp01(rng.gaussian(0.6, 0.11));
  const neuroticism = clamp01(rng.gaussian(0.48, 0.13));
  return {
    id,
    name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    age: rng.int(18, 65),
    parish,
    familyId: `FAM_${id}`,
    familyBackground: rng.pick(FAMILY_BG),
    formativeEvent: rng.pick(FORMATIVE),
    cash: rng.range(500, 8000),
    economicAssets: [],
    socialCapitalLocal: clamp01(rng.gaussian(0.3, 0.12)),
    socialCapitalInstitutional: clamp01(rng.gaussian(0.2, 0.12)),
    socialCapitalDiaspora: clamp01(rng.gaussian(0.1, 0.1)),
    culturalCapital: clamp01(rng.gaussian(0.25, 0.12)),
    openness, conscientiousness, extraversion, agreeableness, neuroticism,
    cognitiveAbility: clamp01(rng.gaussian(0.5, 0.13)),
    resilience: clamp01(rng.gaussian(0.5, 0.12)),
    selfControl: clamp01(rng.gaussian(0.5, 0.12)),
    knowledgeAcquisitionRate: 0,
    riskTolerance: clamp01(openness * 0.4 + (1 - neuroticism) * 0.6),
    lossAversion: clamp01(neuroticism * 0.7 + (1 - openness) * 0.3),
    patience: clamp01(conscientiousness * 0.6 + (1 - neuroticism) * 0.4),
    employmentStatus: 'UNEMPLOYED',
    occupation: null,
    employer: null,
    monthlyIncome: 0,
    monthlyLivingCosts: rng.range(400, 900),
    loans: [],
    knowledge: emptyKnowledge(rng),
    experience: emptyExperience(rng),
    socialNetwork: [],
    isPlayer: false,
    previousMonthCapital: 0,
    businessesStarted: [],
    keptPromises: 0,
    brokenContracts: 0,
  };
}

export interface BuildOptions {
  population?: number;
  choices?: CreationChoices; // if given, agent #1 is built from the five forks
  playerName?: string;
}

export function buildWorld(seed: number, opts: BuildOptions = {}): WorldState {
  const rng = createRng(seed);
  const population = opts.population ?? 400;

  const country = { ...COUNTRY };
  const parishes: Parish[] = PARISHES.map((p) => ({
    ...p, countryId: country.id, propertyValueIndex: 1.0,
  }));
  const goods = GOODS.map((g) => ({ ...g }));
  const parishIds = parishes.map((p) => p.id);

  const markets: Market[] = [];
  for (const good of goods) {
    for (const p of parishes) {
      const demand = rng.range(800, 1200);
      markets.push({
        id: `MKT_${good.id}_${p.id}`,
        goodId: good.id,
        parish: p.id,
        currentPrice: good.basePrice,
        demand,
        supply: demand * rng.range(0.9, 1.1),
        priceHistory: [good.basePrice],
      });
    }
  }

  const banks: Bank[] = BANKS.map((b) => ({
    ...b, countryId: country.id, baseLendingAppetite: b.lendingAppetite, state: 'HEALTHY' as const,
  }));

  // Agents first (player is agent #1).
  const agents: NPCAgent[] = [];
  for (let i = 0; i < population; i++) {
    agents.push(makeAgent(rng, `AGENT_${i}`, rng.pick(parishIds)));
  }
  const player = agents[0]!;
  player.isPlayer = true;
  if (opts.choices) {
    // Build the hidden profile from the five forks and map it onto agent #1.
    const profile = createCharacter(rng, opts.choices);
    hydratePlayerInto(player, profile);
    player.name = opts.playerName ?? player.name;
  } else {
    // Default placeholder player (used by the CLI and existing tests).
    player.name = opts.playerName ?? 'Jean-Pierre Laville';
    player.parish = 'SAINT_JOHN';
    player.familyBackground = 'FISHING_PORTSMOUTH';
    player.formativeEvent = 'HURRICANE';
    player.employmentStatus = 'SELF_EMPLOYED';
    player.occupation = 'FISHING';
    player.monthlyIncome = rng.range(800, 1400);
  }

  // Companies.
  const companies: Company[] = STARTING_COMPANIES.map((s) => {
    const goodId = REPRESENTATIVE_GOOD[s.industry];
    const good = goods.find((g) => g.id === goodId);
    const basePrice = good?.basePrice ?? 1;
    return {
      id: s.id, name: s.name, industry: s.industry, type: s.type, parish: s.parish,
      ownerId: s.ownerId, marketShare: s.marketShare,
      monthlyOutputUnits: Math.round(s.revenue / 12 / basePrice),
      employees: [], loans: [],
      baseOperatingCosts: s.costs / 12,
      monthlyRevenue: 0, profit: 0, consecutiveLossMonths: 0,
      status: 'HEALTHY', isSolvent: true,
      estimatedAnnualTax: s.revenue * 0.1,
    };
  });

  // Staff companies from the unemployed (skip the player at index 0).
  let pool = agents.slice(1).filter((a) => a.employmentStatus === 'UNEMPLOYED');
  let cursor = 0;
  for (let ci = 0; ci < companies.length; ci++) {
    const company = companies[ci]!;
    const want = STARTING_COMPANIES[ci]!.employeesCount;
    for (let k = 0; k < want && cursor < pool.length; k++, cursor++) {
      const a = pool[cursor]!;
      a.employmentStatus = 'EMPLOYED';
      a.occupation = company.industry;
      a.employer = company;
      a.monthlyIncome = rng.range(1200, 2000);
      company.employees.push(a);
    }
  }
  // Some of the still-unemployed become informally self-employed.
  for (let i = cursor; i < pool.length; i++) {
    if (rng.next() < 0.4) {
      const a = pool[i]!;
      a.employmentStatus = 'SELF_EMPLOYED';
      a.occupation = rng.pick(SELF_EMPLOY_INDUSTRIES);
      a.monthlyIncome = rng.range(700, 1500);
    }
  }

  // Company loans, so banks carry exposure that can sour on closure.
  for (const company of companies) {
    const seed = STARTING_COMPANIES.find((s) => s.id === company.id)!;
    const bank = rng.pick(banks);
    const principal = seed.revenue * rng.range(0.15, 0.45);
    const interestRate = country.baseInterestRate + 0.03 + rng.range(0, 0.04);
    const termMonths = 60;
    const loan: Loan = {
      id: `LOAN_${company.id}`,
      bankId: bank.id,
      borrowerCompanyId: company.id,
      principal,
      remainingPrincipal: principal,
      interestRate,
      monthlyPayment: principal / termMonths + (principal * interestRate) / 12,
      termMonths,
      originMonth: 0,
      purposeIndustry: company.industry,
      status: 'ACTIVE',
    };
    company.loans.push(loan);
  }

  const unemploymentRate =
    agents.filter((a) => a.employmentStatus === 'UNEMPLOYED').length / agents.length;
  const taxRevenue = companies.reduce((s, c) => s + c.estimatedAnnualTax / 12, 0);
  const government = {
    countryId: country.id,
    monthlyTaxRevenue: taxRevenue,
    monthlySpending: taxRevenue * 1.05,
    fiscalBalance: -taxRevenue * 0.05,
    unemploymentRate,
    publicSentiment: 0.5,
    corruptionLevel: country.corruptionIndex,
    policies: [],
  };

  for (const a of agents) a.previousMonthCapital = a.cash;

  const world: WorldState = {
    seed,
    month: 0,
    country,
    parishes,
    goods,
    markets,
    banks,
    companies,
    agents,
    player,
    government,
    events: [],
    playerLegacy: {
      wealthScore: 0, familyScore: 0, communityScore: 0,
      innovationScore: 0, environmentScore: 0, reputationScore: 0,
      lastNetWorth: player.cash,
    },
    playerNotifications: [],
    opportunities: [],
    decisions: [],
    rng,
  };

  return world;
}
