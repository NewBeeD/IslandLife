import type { RNG } from '@island/shared';
import { type ProfileDraft, emptyExperience, emptyKnowledge } from './draft';

// Step 1: base distributions. OCEAN is sampled from cross-cultural Big Five
// research (Schmitt et al., 2007); non-cognitive traits start near the centre of
// the range; capitals begin at a modest population midpoint (so fork modifiers do
// not accumulate from zero). Everything stochastic goes through the seeded RNG.
export function newDraft(rng: RNG): ProfileDraft {
  return {
    // OCEAN — Caribbean agreeableness baseline slightly higher
    openness: rng.gaussian(0.52, 0.12),
    conscientiousness: rng.gaussian(0.55, 0.12),
    extraversion: rng.gaussian(0.54, 0.13),
    agreeableness: rng.gaussian(0.6, 0.11),
    neuroticism: rng.gaussian(0.48, 0.13),

    // Heckman non-cognitive
    cognitiveAbility: rng.gaussian(0.5, 0.13),
    resilience: rng.gaussian(0.5, 0.12),
    selfControl: rng.gaussian(0.5, 0.12),
    knowledgeAcquisitionRate: 0, // offset; Fork 2D adds +0.20

    // Bourdieu capital midpoints
    socialCapitalLocal: 0.3,
    socialCapitalInstitutional: 0.2,
    socialCapitalDiaspora: 0.1,
    culturalCapital: 0.25,

    cash: 0,
    economicAssets: [],

    knowledge: emptyKnowledge(),
    experience: emptyExperience(),

    educationScore: 0,
    unlockedPaths: [],

    mentorContact: null,
    startingJob: null,
    startingIncome: null,
    startingOpportunity: null,
    flags: {},

    riskToleranceModifier: 0,
    lossAversionModifier: 0,
    patienceModifier: 0,
    institutionalTrustModifier: 0,
    entrepreneurialDriveModifier: 0,
  };
}
