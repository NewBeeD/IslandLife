import type {
  ExperienceDomains,
  FamilyBackground,
  KnowledgeDomains,
  RNG,
} from '@island/shared';
import type { ProfileDraft } from './draft';

// Most forks present four options (A–D); the `background` fork (Fork 1) presents
// eight grounded livelihoods (A–H). `BackgroundOption` widens only that fork.
export type ForkOption = 'A' | 'B' | 'C' | 'D';
export type BackgroundOption = ForkOption | 'E' | 'F' | 'G' | 'H';
export interface CreationChoices {
  background: BackgroundOption; // Fork 1 (8 options)
  school: ForkOption; // Fork 2
  formative: ForkOption; // Fork 3
  tendency: ForkOption; // Fork 4
  situation: ForkOption; // Fork 5
}

// Family background → inherited trade domain. Civil servants have none.
const FAMILY_INDUSTRY: Record<FamilyBackground, keyof ExperienceDomains | null> = {
  FISHING_PORTSMOUTH: 'fishing',
  FARMING_INTERIOR: 'agriculture',
  TRADING_ROSEAU: 'informalTrade',
  CIVIL_SERVANT_ROSEAU: null,
  MINIBUS_DRIVER: 'transportation',
  MASON_CONSTRUCTION: 'construction',
  GUESTHOUSE_TOURISM: 'tourism',
  SHOPKEEPER_RETAIL: 'retail',
};

// When a fork writes to "[familyIndustry]" and it resolves to null (civil
// servant), redirect to a formal/clerical domain rather than emit knowledge[null]
// or industry: null (both invalid). See the Character Creation edge-case note.
function knowledgeDomainFor(fb: FamilyBackground): keyof KnowledgeDomains {
  return FAMILY_INDUSTRY[fb] ?? 'finance';
}
function experienceDomainFor(fb: FamilyBackground): keyof ExperienceDomains {
  return FAMILY_INDUSTRY[fb] ?? 'retail';
}

// ── Fork 1: Family background ───────────────────────────────────────
function fork1(d: ProfileDraft, opt: BackgroundOption, rng: RNG): void {
  switch (opt) {
    case 'A': // Fishing family, Portsmouth
      d.cash += 2000;
      d.birthParish = 'SAINT_JOHN';
      d.familyBackground = 'FISHING_PORTSMOUTH';
      d.extraversion += 0.15; d.agreeableness += 0.1; d.conscientiousness += 0.1;
      d.openness += 0.05; d.neuroticism += 0.1;
      d.resilience += 0.15;
      d.socialCapitalLocal += 0.3; d.socialCapitalInstitutional -= 0.1;
      d.socialCapitalDiaspora += 0.05; d.culturalCapital -= 0.05;
      d.knowledge.fishing += 0.4; d.knowledge.informalTrade += 0.2; d.experience.fishing += 0.25;
      break;
    case 'B': // Farming family, interior
      d.cash += 1500;
      d.economicAssets.push({ id: 'ASSET_LAND', type: 'LAND', size: 'SMALL', value: 18000 });
      d.birthParish = rng.pick(['SAINT_ANDREW', 'SAINT_DAVID'] as const);
      d.familyBackground = 'FARMING_INTERIOR';
      d.extraversion -= 0.05; d.agreeableness += 0.15; d.conscientiousness += 0.2;
      d.openness -= 0.05; d.neuroticism += 0.15;
      d.resilience += 0.2; d.selfControl += 0.1;
      d.socialCapitalLocal += 0.25; d.socialCapitalInstitutional -= 0.15; d.culturalCapital -= 0.1;
      d.knowledge.agriculture += 0.5; d.knowledge.informalTrade += 0.1; d.experience.agriculture += 0.3;
      break;
    case 'C': // Civil servant household, Roseau
      d.cash += 3500;
      d.birthParish = 'SAINT_GEORGE';
      d.familyBackground = 'CIVIL_SERVANT_ROSEAU';
      d.extraversion += 0.05; d.agreeableness += 0.1; d.conscientiousness += 0.15;
      d.openness += 0.1; d.neuroticism -= 0.1;
      d.resilience -= 0.05; d.selfControl += 0.15;
      d.socialCapitalLocal += 0.1; d.socialCapitalInstitutional += 0.3;
      d.socialCapitalDiaspora += 0.05; d.culturalCapital += 0.25;
      d.knowledge.generalLiteracy += 0.5; d.knowledge.finance += 0.15;
      break;
    case 'D': // Trading family, Roseau market
      d.cash += 4000;
      d.birthParish = 'SAINT_GEORGE';
      d.familyBackground = 'TRADING_ROSEAU';
      d.extraversion += 0.2; d.agreeableness += 0.05; d.conscientiousness += 0.1;
      d.openness += 0.2; d.neuroticism += 0.05;
      d.resilience += 0.1; d.selfControl -= 0.05;
      d.socialCapitalLocal += 0.2; d.socialCapitalInstitutional += 0.1;
      d.socialCapitalDiaspora += 0.15; d.culturalCapital += 0.05;
      d.knowledge.informalTrade += 0.45; d.knowledge.retail += 0.3;
      d.experience.informalTrade += 0.25; d.experience.retail += 0.15;
      break;
    case 'E': // Minibus / taxi family, Roseau routes
      d.cash += 2500;
      d.economicAssets.push({ id: 'ASSET_VEHICLE', type: 'VEHICLE', size: 'MEDIUM', value: 22000 });
      d.birthParish = 'SAINT_GEORGE';
      d.familyBackground = 'MINIBUS_DRIVER';
      d.extraversion += 0.2; d.agreeableness += 0.05; d.conscientiousness += 0.1;
      d.openness += 0.05; d.neuroticism += 0.05;
      d.resilience += 0.1; d.selfControl += 0.05;
      d.socialCapitalLocal += 0.25; d.socialCapitalInstitutional += 0.05; d.culturalCapital -= 0.05;
      d.knowledge.transportation += 0.45; d.knowledge.informalTrade += 0.15;
      d.experience.transportation += 0.3;
      break;
    case 'F': // Mason / construction family
      d.cash += 2200;
      d.economicAssets.push({ id: 'ASSET_TOOLS', type: 'EQUIPMENT', size: 'SMALL', value: 6000 });
      d.birthParish = rng.pick(['SAINT_GEORGE', 'SAINT_PAUL', 'SAINT_JOSEPH'] as const);
      d.familyBackground = 'MASON_CONSTRUCTION';
      d.extraversion += 0.05; d.agreeableness += 0.05; d.conscientiousness += 0.2;
      d.openness -= 0.05; d.neuroticism += 0.05;
      d.resilience += 0.2; d.selfControl += 0.1;
      d.socialCapitalLocal += 0.2; d.socialCapitalInstitutional += 0.05; d.culturalCapital -= 0.05;
      d.knowledge.construction += 0.5; d.experience.construction += 0.3;
      break;
    case 'G': // Guesthouse / tourism family
      d.cash += 3000;
      d.birthParish = rng.pick(['SAINT_GEORGE', 'SAINT_JOHN'] as const);
      d.familyBackground = 'GUESTHOUSE_TOURISM';
      d.extraversion += 0.15; d.agreeableness += 0.15; d.conscientiousness += 0.15;
      d.openness += 0.15; d.neuroticism += 0.05;
      d.resilience += 0.05; d.selfControl += 0.05;
      d.socialCapitalLocal += 0.15; d.socialCapitalInstitutional += 0.1;
      d.socialCapitalDiaspora += 0.1; d.culturalCapital += 0.15;
      d.knowledge.tourism += 0.45; d.knowledge.generalLiteracy += 0.15;
      d.experience.tourism += 0.25;
      break;
    case 'H': // Shopkeeper family, village shop
      d.cash += 3500;
      d.birthParish = rng.pick(['SAINT_GEORGE', 'SAINT_PAUL', 'SAINT_ANDREW'] as const);
      d.familyBackground = 'SHOPKEEPER_RETAIL';
      d.extraversion += 0.1; d.agreeableness += 0.1; d.conscientiousness += 0.15;
      d.openness += 0.05; d.neuroticism += 0.05;
      d.resilience += 0.1; d.selfControl += 0.15;
      d.socialCapitalLocal += 0.2; d.socialCapitalInstitutional += 0.1; d.culturalCapital += 0.05;
      d.knowledge.retail += 0.45; d.knowledge.finance += 0.1; d.knowledge.informalTrade += 0.15;
      d.experience.retail += 0.3;
      break;
  }
}

// ── Fork 2: School years ────────────────────────────────────────────
function fork2(d: ProfileDraft, opt: ForkOption): void {
  const fb = d.familyBackground ?? 'CIVIL_SERVANT_ROSEAU';
  switch (opt) {
    case 'A': // Excelled academically
      d.cognitiveAbility += 0.25; d.selfControl += 0.15; d.culturalCapital += 0.3;
      d.knowledge.generalLiteracy += 0.3; d.knowledge.finance += 0.1;
      d.unlockedPaths = ['CIVIL_SERVICE', 'UNIVERSITY_TRACK', 'PROFESSIONAL_SERVICES'];
      d.conscientiousness += 0.1; d.openness += 0.1; d.neuroticism -= 0.05;
      d.educationScore = 0.75;
      break;
    case 'B': // Average but hardworking
      d.cognitiveAbility += 0.1; d.selfControl += 0.1; d.culturalCapital += 0.1;
      d.knowledge.generalLiteracy += 0.15;
      d.conscientiousness += 0.05;
      d.educationScore = 0.45;
      break;
    case 'C': // Left before completing CXC
      d.cash += 2500;
      d.selfControl += 0.05; d.resilience += 0.15;
      d.culturalCapital -= 0.2; d.socialCapitalLocal += 0.1;
      d.knowledge[knowledgeDomainFor(fb)] += 0.3;
      d.experience[experienceDomainFor(fb)] += 0.3;
      d.conscientiousness += 0.05; d.neuroticism += 0.1;
      d.educationScore = 0.2; d.unlockedPaths = [];
      break;
    case 'D': // Bright but disengaged
      d.cognitiveAbility += 0.2; d.selfControl -= 0.1;
      d.knowledgeAcquisitionRate += 0.2;
      d.openness += 0.2; d.conscientiousness -= 0.1; d.neuroticism += 0.05;
      d.educationScore = 0.35;
      break;
  }
}

// ── Fork 3: Formative event ─────────────────────────────────────────
function fork3(d: ProfileDraft, opt: ForkOption, rng: RNG): void {
  const fb = d.familyBackground ?? 'CIVIL_SERVANT_ROSEAU';
  switch (opt) {
    case 'A': // Hurricane
      d.neuroticism += 0.2; d.conscientiousness += 0.1; d.openness -= 0.05;
      d.resilience += 0.3; d.selfControl += 0.1;
      d.lossAversionModifier += 0.2;
      d.flags.climateRiskAwareness = 'HIGH';
      d.formativeEvent = 'HURRICANE';
      break;
    case 'B': // Diaspora remittance
      d.openness += 0.2; d.extraversion += 0.05;
      d.cognitiveAbility += 0.05;
      d.socialCapitalDiaspora += 0.3; d.cash += 1000;
      d.flags.migrationOptionEarly = true; d.flags.diasporaNetworkAccess = 'PARTIAL';
      d.formativeEvent = 'DIASPORA_REMITTANCE';
      break;
    case 'C': // Exploited by an employer
      d.agreeableness -= 0.2; d.neuroticism += 0.1; d.openness += 0.05; d.conscientiousness += 0.1;
      d.resilience += 0.1;
      d.institutionalTrustModifier -= 0.2; d.entrepreneurialDriveModifier += 0.25;
      d.flags.exploitationDetection = 'HIGH';
      d.formativeEvent = 'EXPLOITATION';
      break;
    case 'D': { // Mentor took an interest
      d.openness += 0.15; d.conscientiousness += 0.1; d.extraversion += 0.05;
      d.cognitiveAbility += 0.1; d.selfControl += 0.1;
      const domain = knowledgeDomainFor(fb);
      d.mentorContact = {
        type: rng.pick(['BUSINESS_OWNER', 'TEACHER', 'COMMUNITY_ELDER', 'PROFESSIONAL'] as const),
        domain,
        trustLevel: 'HIGH',
        accessibleFrom: 'DAY_ONE',
      };
      d.knowledge[domain] = Math.max(d.knowledge[domain], 0.6); // mentor's domain starts elevated
      d.formativeEvent = 'MENTOR';
      break;
    }
  }
}

// ── Fork 4: Personality tendency ────────────────────────────────────
function fork4(d: ProfileDraft, opt: ForkOption): void {
  switch (opt) {
    case 'A': // Deliberate
      d.conscientiousness += 0.2; d.neuroticism += 0.1; d.openness -= 0.05; d.extraversion -= 0.1;
      d.riskToleranceModifier -= 0.15; d.patienceModifier += 0.25;
      d.personalityTendency = 'DELIBERATE';
      break;
    case 'B': // Instinctive
      d.openness += 0.15; d.extraversion += 0.15; d.conscientiousness -= 0.1; d.neuroticism -= 0.1;
      d.riskToleranceModifier += 0.25; d.patienceModifier -= 0.2;
      d.personalityTendency = 'INSTINCTIVE';
      break;
    case 'C': // Social
      d.extraversion += 0.1; d.agreeableness += 0.2; d.openness += 0.1;
      d.cognitiveAbility += 0.05;
      d.socialCapitalLocal += 0.15; d.socialCapitalInstitutional += 0.1;
      d.personalityTendency = 'SOCIAL';
      break;
    case 'D': // Analytical / systems
      d.openness += 0.25; d.conscientiousness += 0.15; d.extraversion -= 0.15; d.agreeableness -= 0.05;
      d.cognitiveAbility += 0.15;
      d.flags.patternRecognition = 'HIGH'; d.flags.analyticalEdge = 'HIGH';
      d.personalityTendency = 'ANALYTICAL';
      break;
  }
}

// ── Fork 5: Situation right now ─────────────────────────────────────
function fork5(d: ProfileDraft, opt: ForkOption, rng: RNG): void {
  const fb = d.familyBackground ?? 'CIVIL_SERVANT_ROSEAU';
  switch (opt) {
    case 'A': // Job lined up
      d.startingJob = {
        type: rng.pick(['CIVIL_SERVICE_JUNIOR', 'HOTEL_STAFF', 'COOPERATIVE_WORKER'] as const),
        monthlySalary: Math.round(rng.range(1400, 1800)),
        stability: 'HIGH', growthCeiling: 'LOW', socialExposure: 'MEDIUM',
      };
      d.conscientiousness += 0.05;
      d.situationAtStart = 'EMPLOYED';
      break;
    case 'B': // Self-employed from day one
      d.startingIncome = {
        type: 'SELF_EMPLOYED',
        baseMonthlyRevenue: Math.round(rng.range(800, 1400)),
        volatility: 'HIGH',
        industry: experienceDomainFor(fb),
        growthCeiling: 'UNLIMITED',
      };
      d.knowledge[knowledgeDomainFor(fb)] += 0.1;
      d.experience[experienceDomainFor(fb)] += 0.2;
      d.conscientiousness += 0.05; d.openness += 0.05;
      d.situationAtStart = 'SELF_EMPLOYED';
      break;
    case 'C': // Returned from Barbados
      d.cash += 8000;
      d.knowledge.informalTrade += 0.1; d.knowledge.tourism += 0.05;
      d.experience.informalTrade += 0.05; // general work experience
      d.socialCapitalDiaspora += 0.1; d.culturalCapital += 0.05;
      d.flags.migrationOptionFamiliarity = 'HIGH';
      d.flags.comparativeAdvantageAwareness = 'ELEVATED';
      d.startingIncome = null;
      d.situationAtStart = 'RETURNED_FROM_ABROAD';
      break;
    case 'D': // About to take a risk
      d.cash -= 500;
      d.startingOpportunity = {
        type: rng.pick([
          'EQUIPMENT_PURCHASE_BELOW_MARKET',
          'SMALL_SUPPLY_CONTRACT',
          'MARKET_GAP_IN_FAMILY_INDUSTRY',
          'INFORMAL_PARTNERSHIP_OFFER',
        ] as const),
        timeWindow: 90,
        requiredCapital: Math.round(rng.range(1500, 3500)),
        expectedReturn: rng.range(1.4, 2.2),
        riskLevel: 'MEDIUM_HIGH',
      };
      d.openness += 0.1; d.conscientiousness -= 0.05;
      d.situationAtStart = 'OPPORTUNITY_PENDING';
      break;
  }
}

// Apply the five forks in order (Fork 1 sets familyBackground, which later forks
// read for the [familyIndustry] writes).
export function applyForks(d: ProfileDraft, c: CreationChoices, rng: RNG): ProfileDraft {
  fork1(d, c.background, rng);
  fork2(d, c.school);
  fork3(d, c.formative, rng);
  fork4(d, c.tendency);
  fork5(d, c.situation, rng);
  return d;
}
