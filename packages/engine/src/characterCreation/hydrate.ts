import type {
  CharacterProfile,
  ExperienceDomains,
  Industry,
  NPCAgent,
  StartingJob,
} from '@island/shared';

// experience-domain key → Industry enum (the agent's occupation namespace).
const DOMAIN_INDUSTRY: Record<keyof ExperienceDomains, Industry> = {
  fishing: 'FISHING', agriculture: 'AGRICULTURE', construction: 'CONSTRUCTION',
  informalTrade: 'INFORMAL_TRADE', retail: 'RETAIL', tourism: 'TOURISM',
  transportation: 'TRANSPORTATION', finance: 'FINANCE',
};
const JOB_INDUSTRY: Record<StartingJob['type'], Industry | null> = {
  CIVIL_SERVICE_JUNIOR: null, // civil service is not one of the tradable industries
  HOTEL_STAFF: 'TOURISM',
  COOPERATIVE_WORKER: 'FISHING',
};

// Map the hidden CharacterProfile onto the player's NPCAgent (agent #1), mutating
// the existing agent in place so its identity in world.agents is preserved.
// Profile-only fields (educationScore, institutionalTrust, entrepreneurialDrive,
// mentorContact, startingJob/Income/Opportunity, personalityTendency, flags,
// unlockedPaths) are NOT copied onto the agent — they stay server-side; mentor/
// opportunity world-seeding (Step 5) is a later phase (e.g. P6 surfaces it).
export function hydratePlayerInto(agent: NPCAgent, p: CharacterProfile): void {
  agent.age = 20; // character creation happens at 20
  agent.parish = p.birthParish;
  agent.familyBackground = p.familyBackground;
  agent.formativeEvent = p.formativeEvent;

  agent.cash = p.cash;
  agent.economicAssets = p.economicAssets.map((a) => ({ ...a }));
  agent.socialCapitalLocal = p.socialCapitalLocal;
  agent.socialCapitalInstitutional = p.socialCapitalInstitutional;
  agent.socialCapitalDiaspora = p.socialCapitalDiaspora;
  agent.culturalCapital = p.culturalCapital;

  agent.openness = p.openness;
  agent.conscientiousness = p.conscientiousness;
  agent.extraversion = p.extraversion;
  agent.agreeableness = p.agreeableness;
  agent.neuroticism = p.neuroticism;

  agent.cognitiveAbility = p.cognitiveAbility;
  agent.resilience = p.resilience;
  agent.selfControl = p.selfControl;
  agent.knowledgeAcquisitionRate = p.knowledgeAcquisitionRate;

  agent.riskTolerance = p.riskTolerance;
  agent.lossAversion = p.lossAversion;
  agent.patience = p.patience;

  agent.knowledge = { ...p.knowledge };
  agent.experience = { ...p.experience };
  agent.previousMonthCapital = p.cash;

  // Starting situation → employment.
  if (p.situationAtStart === 'EMPLOYED' && p.startingJob) {
    agent.employmentStatus = 'EMPLOYED';
    agent.occupation = JOB_INDUSTRY[p.startingJob.type];
    agent.monthlyIncome = p.startingJob.monthlySalary;
  } else if (p.situationAtStart === 'SELF_EMPLOYED' && p.startingIncome) {
    agent.employmentStatus = 'SELF_EMPLOYED';
    agent.occupation = DOMAIN_INDUSTRY[p.startingIncome.industry];
    agent.monthlyIncome = p.startingIncome.baseMonthlyRevenue;
  } else {
    // RETURNED_FROM_ABROAD / OPPORTUNITY_PENDING start without a steady income.
    agent.employmentStatus = 'UNEMPLOYED';
    agent.occupation = null;
    agent.monthlyIncome = 0;
  }
  agent.employer = null;
}
