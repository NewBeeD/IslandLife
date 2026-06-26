import type {
  Asset,
  AwarenessFlags,
  CareerPath,
  ExperienceDomains,
  FamilyBackground,
  FormativeEvent,
  KnowledgeDomains,
  MentorContact,
  ParishId,
  PersonalityTendency,
  StartingIncome,
  StartingJob,
  StartingOpportunity,
  StartingSituation,
} from '@island/shared';

// A mutable accumulator the five forks write into. Numeric traits start at their
// base distribution and forks ADD modifiers; knowledge/experience/cash accumulate
// from zero; behavioral *modifiers* are applied to the derived values in finalize.
export interface ProfileDraft {
  // OCEAN (base + accumulated fork modifiers, clamped in finalize)
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

  // Bourdieu capital
  socialCapitalLocal: number;
  socialCapitalInstitutional: number;
  socialCapitalDiaspora: number;
  culturalCapital: number;

  // Economic
  cash: number;
  economicAssets: Asset[];

  knowledge: KnowledgeDomains;
  experience: ExperienceDomains;

  educationScore: number;
  unlockedPaths: CareerPath[];

  // Set directly by forks (undefined until a fork sets them)
  birthParish?: ParishId;
  familyBackground?: FamilyBackground;
  formativeEvent?: FormativeEvent;
  personalityTendency?: PersonalityTendency;
  situationAtStart?: StartingSituation;

  mentorContact: MentorContact | null;
  startingJob: StartingJob | null;
  startingIncome: StartingIncome | null;
  startingOpportunity: StartingOpportunity | null;

  flags: AwarenessFlags;

  // Modifiers applied to derived tendencies in finalize (Step 4)
  riskToleranceModifier: number;
  lossAversionModifier: number;
  patienceModifier: number;
  institutionalTrustModifier: number;
  entrepreneurialDriveModifier: number;
}

export function emptyKnowledge(): KnowledgeDomains {
  return {
    fishing: 0, agriculture: 0, construction: 0, informalTrade: 0,
    retail: 0, tourism: 0, transportation: 0, finance: 0, generalLiteracy: 0,
  };
}

export function emptyExperience(): ExperienceDomains {
  return {
    fishing: 0, agriculture: 0, construction: 0, informalTrade: 0,
    retail: 0, tourism: 0, transportation: 0, finance: 0,
  };
}
