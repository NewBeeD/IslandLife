import { describe, expect, it } from 'vitest';
import { createDeepSeekClient } from '../deepseek';
import { callClaude } from '../claude';

// A fake fetch that captures the outgoing request and returns a DeepSeek-shaped
// response. The first call reports a cache miss; later calls report a cache hit,
// mirroring DeepSeek's automatic prefix caching.
function fakeFetch() {
  const requests: { url: string; body: any; headers: Record<string, string> }[] = [];
  let calls = 0;
  const impl: typeof fetch = async (url, init) => {
    calls += 1;
    requests.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const body = {
      choices: [{ message: { content: 'A quiet month on the water.' } }],
      usage: {
        prompt_tokens: 1200,
        completion_tokens: 60,
        prompt_cache_hit_tokens: calls === 1 ? 0 : 1100,
        prompt_cache_miss_tokens: calls === 1 ? 1200 : 100,
      },
    };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { impl, requests, calls: () => calls };
}

describe('DeepSeek adapter', () => {
  it('translates the Anthropic-shaped call to /chat/completions and back', async () => {
    const fake = fakeFetch();
    const client = createDeepSeekClient({ apiKey: 'sk-test', fetchImpl: fake.impl });

    const result = await callClaude('SYSTEM PROMPT', 'USER PROMPT', client);

    // callClaude received the joined text.
    expect(result.text).toBe('A quiet month on the water.');

    const req = fake.requests[0];
    expect(req.url).toBe('https://api.deepseek.com/chat/completions');
    expect(req.headers.authorization).toBe('Bearer sk-test');
    // The Anthropic system block + user message became OpenAI-style messages.
    expect(req.body.model).toBe('deepseek-chat');
    expect(req.body.messages[0]).toEqual({ role: 'system', content: 'SYSTEM PROMPT' });
    expect(req.body.messages[1]).toEqual({ role: 'user', content: 'USER PROMPT' });
  });

  it('maps DeepSeek cache-hit tokens onto cache_read_input_tokens', async () => {
    const fake = fakeFetch();
    const client = createDeepSeekClient({ apiKey: 'sk-test', fetchImpl: fake.impl });

    const first = await callClaude('SYS', 'USER', client);
    const second = await callClaude('SYS', 'USER', client);

    expect(first.usage.cache_read_input_tokens).toBe(0);
    expect(second.usage.cache_read_input_tokens).toBeGreaterThan(0);
    expect(second.usage.input_tokens).toBe(1200);
    expect(second.usage.output_tokens).toBe(60);
  });

  it('throws with status detail on a non-OK response', async () => {
    const impl: typeof fetch = async () =>
      new Response('bad key', { status: 401, statusText: 'Unauthorized' });
    const client = createDeepSeekClient({ apiKey: 'sk-bad', fetchImpl: impl });

    await expect(callClaude('SYS', 'USER', client)).rejects.toThrow(/401/);
  });
});
