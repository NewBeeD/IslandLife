import type { NarrativeEntry, WorldState } from '@island/shared';
import type Anthropic from '@anthropic-ai/sdk';
import {
  callClaude,
  NARRATIVE_MAX_TOKENS,
  NARRATIVE_MAX_TOKENS_SHORT,
  type ClaudeClient,
} from './claude';
import { assembleNarrativeContext } from './narrativeContext';
import { buildUserPrompt } from './prompts';
import { buildSystemPrompt } from './systemPrompt';
import { LONG_FORM_TRIGGERS, validateNarrativeEntry } from './validate';
import type { LLMTrigger } from './triggers';

export interface GenerateResult {
  // The validated entry, or null if generation never passed the voice gate.
  entry: NarrativeEntry | null;
  // Usage from the final attempt — `usage.cache_read_input_tokens` confirms the
  // cached system prompt is doing its job from the second call onward.
  usage: Anthropic.Usage | null;
  // The voice-validator issues from the final attempt (empty when entry !== null).
  issues: string[];
  attempts: number;
}

// Generate one Layer-2 narrative entry for a fired trigger. The text passes the
// voice validator before it is returned; an invalid generation is retried once
// (the model is non-deterministic, so a re-roll often clears a stray pattern),
// and if it still fails it is rejected (entry: null) rather than shown. Generation
// only reads the world — it never touches world.rng (S2).
export async function generateNarrativeEntry(
  trigger: LLMTrigger,
  world: WorldState,
  client?: ClaudeClient,
  maxAttempts = 2,
): Promise<GenerateResult> {
  const ctx = assembleNarrativeContext(world);
  const system = buildSystemPrompt();
  const user = buildUserPrompt(trigger, ctx);
  const month = world.month;

  // Long-form triggers (annual/legacy) are exempt from the 400-word gate and get
  // the full budget; everything else is capped so the output can't physically
  // exceed the validator's word limit.
  const maxTokens = LONG_FORM_TRIGGERS.includes(trigger.id)
    ? NARRATIVE_MAX_TOKENS
    : NARRATIVE_MAX_TOKENS_SHORT;

  let lastUsage: Anthropic.Usage | null = null;
  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { text, usage } = await callClaude(system, user, client, maxTokens);
    lastUsage = usage;
    const result = validateNarrativeEntry(text, trigger.id);
    if (result.valid) {
      const entry: NarrativeEntry = {
        type: trigger.narrativeType,
        text: text.trim(),
        month,
        triggerId: trigger.id,
      };
      return { entry, usage, issues: [], attempts: attempt };
    }
    lastIssues = result.issues;
  }

  return { entry: null, usage: lastUsage, issues: lastIssues, attempts: maxAttempts };
}
