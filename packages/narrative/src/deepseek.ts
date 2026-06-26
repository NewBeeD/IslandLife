import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeClient } from './claude';

// A DeepSeek-backed implementation of the structural ClaudeClient interface. The
// rest of the narrative layer (callClaude, generate, the worker) is provider-blind:
// it speaks the Anthropic message shape and reads { content[].text, usage }. This
// adapter translates that shape to DeepSeek's OpenAI-compatible /chat/completions
// endpoint and back, so swapping providers is a key-presence decision, not a
// rewrite. DeepSeek is dramatically cheaper than Opus for the same async,
// significant-event-only generation pattern.
//
// DeepSeek caches identical prompt prefixes automatically (no cache_control needed)
// and reports prompt_cache_hit_tokens; we map that onto cache_read_input_tokens so
// the existing caching-observability contract (smoke test) keeps working.

export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com';
// deepseek-chat (V3) is the right pick for prose — fast and inexpensive. The
// reasoner model would burn tokens on hidden chain-of-thought we don't surface.
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

export interface DeepSeekOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  // Injectable for tests — defaults to the global fetch (Node 18+).
  fetchImpl?: typeof fetch;
}

interface DeepSeekResponse {
  choices?: { message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
}

// Flatten an Anthropic `system` (string or text-block array) to a single string.
function systemToText(system: Anthropic.MessageCreateParamsNonStreaming['system']): string {
  if (!system) return '';
  if (typeof system === 'string') return system;
  return system.map((block) => (typeof block === 'string' ? block : block.text)).join('');
}

// Flatten an Anthropic message content (string or block array) to a string. Our
// prompts are plain strings, but handle the block form defensively.
function contentToText(content: Anthropic.MessageParam['content']): string {
  if (typeof content === 'string') return content;
  return content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
}

export function createDeepSeekClient(opts: DeepSeekOptions = {}): ClaudeClient {
  const apiKey = opts.apiKey ?? process.env.DEEPSEEK_API_KEY ?? '';
  const baseUrl = opts.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? DEEPSEEK_DEFAULT_BASE_URL;
  const model = opts.model ?? process.env.DEEPSEEK_MODEL ?? DEEPSEEK_DEFAULT_MODEL;
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    messages: {
      // Note: params.model (the Anthropic model id) is intentionally ignored — the
      // DeepSeek model is chosen here. Everything else maps across faithfully.
      async create(params) {
        const messages = [
          { role: 'system', content: systemToText(params.system) },
          ...params.messages.map((m) => ({ role: m.role, content: contentToText(m.content) })),
        ];

        const res = await doFetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: params.max_tokens,
            messages,
            stream: false,
          }),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`DeepSeek request failed: ${res.status} ${res.statusText} ${detail}`.trim());
        }

        const body = (await res.json()) as DeepSeekResponse;
        const text = body.choices?.[0]?.message?.content ?? '';
        const usage = body.usage ?? {};

        // Re-shape into the minimal Anthropic.Message that callClaude reads.
        return {
          id: 'deepseek',
          type: 'message',
          role: 'assistant',
          model,
          stop_reason: 'end_turn',
          stop_sequence: null,
          content: [{ type: 'text', text, citations: null }],
          usage: {
            input_tokens: usage.prompt_tokens ?? 0,
            output_tokens: usage.completion_tokens ?? 0,
            cache_creation_input_tokens: usage.prompt_cache_miss_tokens ?? 0,
            cache_read_input_tokens: usage.prompt_cache_hit_tokens ?? 0,
            server_tool_use: null,
            service_tier: null,
          },
        } as unknown as Anthropic.Message;
      },
    },
  };
}
