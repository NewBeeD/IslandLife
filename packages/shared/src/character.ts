import type { FamilyBackground, FormativeEvent, ParishId, Tri } from './enums';
import type { Asset, ExperienceDomains, KnowledgeDomains } from './types';

// The hidden character profile produced by the five forks (see the Character
// Creation design doc). The player never sees this; it seeds the simulation and
// shapes narrative voice. P3.1 establishes the type + base distributions; P3.2
// implements the forks that modify a draft into a finished profile.

export type PersonalityTendency = 'DELIBERATE' | 'INSTINCTIVE' | 'SOCIAL' | 'ANALYTICAL';
export type StartingSituation =
  | 'EMPLOYED'
  | 'SELF_EMPLOYED'
  | 'RETURNED_FROM_ABROAD'
  | 'OPPORTUNITY_PENDING';
export type CareerPath = 'CIVIL_SERVICE' | 'UNIVERSITY_TRACK' | 'PROFESSIONAL_SERVICES';

export interface MentorContact {
  type: 'BUSINESS_OWNER' | 'TEACHER' | 'COMMUNITY_ELDER' | 'PROFESSIONAL';
  domain: keyof KnowledgeDomains;
  trustLevel: Tri;
  accessibleFrom: 'DAY_ONE';
}

export interface StartingJob {
  type: 'CIVIL_SERVICE_JUNIOR' | 'HOTEL_STAFF' | 'COOPERATIVE_WORKER';
  monthlySalary: number;
  stability: Tri;
  growthCeiling: Tri;
  socialExposure: Tri;
}

export interface StartingIncome {
  type: 'SELF_EMPLOYED';
  baseMonthlyRevenue: number;
  volatility: Tri;
  industry: keyof ExperienceDomains;
  growthCeiling: 'UNLIMITED' | Tri;
}

export interface StartingOpportunity {
  type:
    | 'EQUIPMENT_PURCHASE_BELOW_MARKET'
    | 'SMALL_SUPPLY_CONTRACT'
    | 'MARKET_GAP_IN_FAMILY_INDUSTRY'
    | 'INFORMAL_PARTNERSHIP_OFFER';
  timeWindow: number;
  requiredCapital: number;
  expectedReturn: number; // not shown to the player
  riskLevel: 'LOW' | 'MEDIUM' | 'MEDIUM_HIGH' | 'HIGH';
}

export interface AwarenessFlags {
  climateRiskAwareness?: Tri;
  diasporaNetworkAccess?: 'NONE' | 'PARTIAL' | 'FULL';
  migrationOptionEarly?: boolean;
  exploitationDetection?: Tri;
  migrationOptionFamiliarity?: Tri;
  comparativeAdvantageAwareness?: 'BASELINE' | 'ELEVATED';
  patternRecognition?: Tri;
  analyticalEdge?: Tri;
}

export interface CharacterProfile {
  // Big Five (OCEAN)
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

  // Bourdieu economic capital
  cash: number;
  economicAssets: Asset[];
  netWorth: number; // derived: cash + Σ assets − debt (no debt at creation)
  socialCapitalLocal: number;
  socialCapitalInstitutional: number;
  socialCapitalDiaspora: number;
  culturalCapital: number;

  knowledge: KnowledgeDomains;
  experience: ExperienceDomains;

  // Circumstance markers (Roemer)
  birthParish: ParishId;
  familyBackground: FamilyBackground;
  formativeEvent: FormativeEvent;

  // Education (Fork 2)
  educationScore: number;
  unlockedPaths: CareerPath[];

  // Personality tendency (Fork 4)
  personalityTendency: PersonalityTendency;

  // Derived behavioral tendencies
  riskTolerance: number;
  lossAversion: number;
  patience: number;
  institutionalTrust: number;
  entrepreneurialDrive: number;

  // World-seeded entities & starting situation (Forks 3D / 5)
  mentorContact: MentorContact | null;
  situationAtStart: StartingSituation;
  startingJob: StartingJob | null;
  startingIncome: StartingIncome | null;
  startingOpportunity: StartingOpportunity | null;

  flags: AwarenessFlags;
}
