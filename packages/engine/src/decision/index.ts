export {
  evaluateOptions,
  chooseBest,
  valuateCandidate,
  lossAversionLambda,
  gainCurvature,
  discountRate,
  weightProbability,
  discountFactor,
} from './prospect';
export type { Outcome, ActionCandidate, ScoredCandidate } from './prospect';
export {
  ARCHETYPES,
  archetypeAffinities,
  dominantArchetype,
  archetypeBias,
} from './archetype';
export type { Archetype, ActionTag, ArchetypeTraits } from './archetype';
