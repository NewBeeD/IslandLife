// The narrative system: the translation layer between the simulation's numbers and
// the life the player reads. Two layers, one voice, invisible seam.
//
// Layer 1 — template engine (Phase 4). Fast, deterministic, grounded prose for
// routine monthly entries. Runs synchronously on advance.
export { generateMonthlyEntries } from './engine';
export { renderMagnitude, formatCurrency, priceDirectionFromHistory } from './magnitude';
export { buildContext } from './context';
export type { MonthContext, Template } from './context';

// The voice gate — every entry (template or LLM) passes this before the player.
export { validateNarrativeEntry } from './validate';
export type { ValidationResult } from './validate';

// Layer 2 — Claude Opus 4.8 generation (Phase 5). Bespoke prose for significant
// events, generated asynchronously so the player never waits.
export {
  callClaude,
  setClaudeClient,
  NARRATIVE_MODEL,
  NARRATIVE_MAX_TOKENS,
} from './claude';
export type { ClaudeClient, ClaudeResult } from './claude';
export {
  createDeepSeekClient,
  DEEPSEEK_DEFAULT_MODEL,
  DEEPSEEK_DEFAULT_BASE_URL,
} from './deepseek';
export type { DeepSeekOptions } from './deepseek';
export { buildSystemPrompt } from './systemPrompt';
export { buildUserPrompt } from './prompts';
export {
  assembleNarrativeContext,
  describeOccupation,
  describePersonality,
  describeFinancialSituation,
} from './narrativeContext';
export type { NarrativeContext } from './narrativeContext';
export {
  getVoiceAgeModifier,
  SEASONAL_VOICE_NOTES,
  PARISH_VOICE_CONTEXT,
} from './voice';
export { generateNarrativeEntry } from './generate';
export type { GenerateResult } from './generate';
export {
  buildDecisionSituation,
  buildDecisionAcknowledgement,
  buildJobTakenAcknowledgement,
  generateConsequenceEntry,
  generateEducationCompletionEntry,
} from './decisions';
export {
  LLM_GENERATION_TRIGGERS,
  detectTriggers,
  captureTriggerSnapshot,
  predictLikelyTriggers,
  narrativeTypeFor,
  triggerKey,
} from './triggers';
export type { LLMTrigger, LLMTriggerId, TriggerSnapshot } from './triggers';
