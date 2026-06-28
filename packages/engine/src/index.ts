export { createRng, clamp, clamp01 } from './rng';
export { buildWorld } from './worldBuild';
export type { BuildOptions } from './worldBuild';
export { simulateOneMonth } from './simulateOneMonth';
export { updateMarketPrice } from './market';
export {
  checkBankSolvency,
  amortize,
  assessLoanApplication,
  originateLoan,
} from './banking';
export type { LoanAssessment } from './banking';
export {
  computeCompanyRevenue,
  checkCompanySolvency,
  applyClosureCascade,
} from './company';
export { rollRandomEvents } from './events';
export { governmentAct, computeTaxRevenue } from './government';
export { computeLegacyIncrement, netWorthOf } from './legacy';
export { npcDecide, applyAction, triggerPersonalLoanDefault } from './agents';
export {
  surfaceOpportunities,
  resolveDecision,
  quoteUpgradeFinancing,
  applyUpgradeFinancing,
  updatePlayerIncome,
  detectDueConsequences,
  DecisionError,
  EUNICE_OPPORTUNITY_ID,
  EUNICE_DECISION_ID,
  EUNICE_NPC_NAME,
  EUNICE_OPTION_ACCEPT,
  EUNICE_OPTION_DECLINE,
  CONSEQUENCE_LAG_MONTHS,
} from './opportunities';
export type { UpgradeQuote, UpgradeResolution } from './opportunities';
export {
  hasVentures,
  activeVentures,
  ventureIncomeLines,
  aggregateVentureIncome,
  totalOperatingCosts,
  tradeOperatorCount,
  ensurePlayerVentures,
  ventureAssetType,
} from './ventures';
export {
  credentialLevelOf,
  isEnrolled,
  eligiblePrograms,
  surfaceEducation,
  enrolPlayer,
  chargeTuition,
  detectEducationCompletions,
  monthlyTuition,
} from './education';
export { worldDigest } from './digest';
export { serializeWorld, deserializeWorld } from './serialize';
export type { SerializedWorld, SerializedAgent, SerializedCompany } from './serialize';
export {
  newDraft,
  finalizeProfile,
  createBaseProfile,
  createCharacter,
  applyForks,
  emptyKnowledge,
  emptyExperience,
} from './characterCreation';
export type { ProfileDraft, CreationChoices, ForkOption, BackgroundOption } from './characterCreation';
