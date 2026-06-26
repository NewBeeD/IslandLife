import Anthropic from '@anthropic-ai/sdk';
import { createDeepSeekClient } from './deepseek';

// Layer 2 of the narrative system: bespoke prose from Claude for significant
// events. This module owns the single point of contact with the Anthropic API.
//
// Standing rules in play: the narrative package may import the SDK, but never the
// DB or the server (S1 is about the engine; the queue + persistence live in the
// server). Generation only ever READS world state — it never draws from world.rng
// (S2), so prose can't perturb the simulation or the golden master.

// Highest-quality prose. Prompt caching (the constant system prompt) plus async
// generation + idle prefetch (batchable) offset Opus's higher per-token cost.
export const NARRATIVE_MODEL = 'claude-opus-4-8';

// Room for annual reflections and the legacy/obituary entry, which are
// deliberately long-form (voice rule 7). Routine significant events use far less.
export const NARRATIVE_MAX_TOKENS = 1500;

// Cap for non-long-form entries, which the validator holds to 400 words. ~600
// tokens covers 400 English words (~0.67 words/token) with headroom, so the
// physical ceiling can't exceed the validator's word gate — defense in depth
// against a provider (e.g. DeepSeek) that runs long for the same instruction.
export const NARRATIVE_MAX_TOKENS_SHORT = 600;

// The minimal slice of the SDK that callClaude needs. Declaring it structurally
// lets tests inject a fake client without standing up the real SDK or a network —
// the real `Anthropic` instance satisfies it.
export interface ClaudeClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

// One client per process, created lazily so importing this module never requires
// an API key (tests and the headless gate don't have one). Provider is chosen by
// which key is present: DeepSeek (cheap) when DEEPSEEK_API_KEY is set, otherwise
// the Anthropic SDK (reads ANTHROPIC_API_KEY + sets the version header itself).
// Both speak the same structural ClaudeClient interface, so callClaude is blind to
// the choice.
let defaultClient: ClaudeClient | null = null;
function getDefaultClient(): ClaudeClient {
  if (!defaultClient) {
    defaultClient = process.env.DEEPSEEK_API_KEY ? createDeepSeekClient() : new Anthropic();
  }
  return defaultClient;
}

// Test seam: override the process-wide client (e.g. with a fake). Pass null to
// restore the lazily-created real client.
export function setClaudeClient(client: ClaudeClient | null): void {
  defaultClient = client;
}

export interface ClaudeResult {
  text: string;
  usage: Anthropic.Usage;
}

// Single entry point for every Claude call. The system prompt is byte-for-byte
// identical on every generation, so it is marked for prompt caching. Keep it
// stable: any byte change anywhere in it invalidates the cached prefix. Verify
// with `result.usage.cache_read_input_tokens` — if it stays 0, something is
// invalidating the cache (a date or id leaking into the system prompt).
export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  client: ClaudeClient = getDefaultClient(),
  maxTokens: number = NARRATIVE_MAX_TOKENS,
): Promise<ClaudeResult> {
  const message = await client.messages.create({
    model: NARRATIVE_MODEL,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return { text, usage: message.usage };
}
