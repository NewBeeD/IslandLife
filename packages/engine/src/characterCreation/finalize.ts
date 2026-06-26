import type { CharacterProfile, ExperienceDomains, KnowledgeDomains } from '@island/shared';
import { clamp01 } from '../rng';
import type { ProfileDraft } from './draft';

// No trait should ever be absolute — humans are not fully anything.
const clampTrait = (x: number): number => Math.min(0.95, Math.max(0.05, x));

function clampKnowledge(k: KnowledgeDomains): KnowledgeDomains {
  const out = { ...k };
  for (const key of Object.keys(out) as (keyof KnowledgeDomains)[]) {
    out[key] = clamp01(out[key]);
  }
  return out;
}
function clampExperience(e: ExperienceDomains): ExperienceDomains {
  const out = { ...e };
  for (const key of Object.keys(out) as (keyof ExperienceDomains)[]) {
    out[key] = clamp01(out[key]);
  }
  return out;
}

// Steps 2–4: clamp accumulated traits, derive behavioral tendencies from OCEAN,
// then apply fork-specific modifiers. Fork-set fields fall back to neutral
// defaults so a bare base draft still yields a complete (if unremarkable) profile
// — the forks (P3.2) replace these with real choices.
export function finalizeProfile(d: ProfileDraft): CharacterProfile {
  const openness = clampTrait(d.openness);
  const conscientiousness = clampTrait(d.conscientiousness);
  const extraversion = clampTrait(d.extraversion);
  const agreeableness = clampTrait(d.agreeableness);
  const neuroticism = clampTrait(d.neuroticism);

  const cognitiveAbility = clampTrait(d.cognitiveAbility);
  const resilience = clampTrait(d.resilience);
  const selfControl = clampTrait(d.selfControl);

  const socialCapitalLocal = clampTrait(d.socialCapitalLocal);
  const socialCapitalInstitutional = clampTrait(d.socialCapitalInstitutional);
  const socialCapitalDiaspora = clampTrait(d.socialCapitalDiaspora);
  const culturalCapital = clampTrait(d.culturalCapital);

  const cash = Math.max(0, d.cash);
  const economicAssets = d.economicAssets;
  const netWorth = cash + economicAssets.reduce((s, a) => s + a.value, 0);

  // Step 3: derive from OCEAN, then Step 4: apply fork modifiers, clamp to [0,1].
  const riskTolerance = clamp01(openness * 0.4 + (1 - neuroticism) * 0.6 + d.riskToleranceModifier);
  const lossAversion = clamp01(neuroticism * 0.7 + (1 - openness) * 0.3 + d.lossAversionModifier);
  const patience = clamp01(conscientiousness * 0.6 + (1 - neuroticism) * 0.4 + d.patienceModifier);
  const institutionalTrust = clamp01(
    agreeableness * 0.5 + culturalCapital * 0.5 + d.institutionalTrustModifier,
  );
  const entrepreneurialDrive = clamp01(0.5 * riskTolerance + d.entrepreneurialDriveModifier);

  return {
    openness, conscientiousness, extraversion, agreeableness, neuroticism,
    cognitiveAbility, resilience, selfControl,
    knowledgeAcquisitionRate: Math.max(0, d.knowledgeAcquisitionRate),
    cash, economicAssets, netWorth,
    socialCapitalLocal, socialCapitalInstitutional, socialCapitalDiaspora, culturalCapital,
    knowledge: clampKnowledge(d.knowledge),
    experience: clampExperience(d.experience),
    birthParish: d.birthParish ?? 'SAINT_GEORGE',
    familyBackground: d.familyBackground ?? 'CIVIL_SERVANT_ROSEAU',
    formativeEvent: d.formativeEvent ?? 'MENTOR',
    educationScore: clamp01(d.educationScore),
    unlockedPaths: d.unlockedPaths,
    personalityTendency: d.personalityTendency ?? 'DELIBERATE',
    riskTolerance, lossAversion, patience, institutionalTrust, entrepreneurialDrive,
    mentorContact: d.mentorContact,
    situationAtStart: d.situationAtStart ?? 'EMPLOYED',
    startingJob: d.startingJob,
    startingIncome: d.startingIncome,
    startingOpportunity: d.startingOpportunity,
    flags: d.flags,
  };
}
