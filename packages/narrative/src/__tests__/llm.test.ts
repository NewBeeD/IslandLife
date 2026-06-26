import { describe, expect, it } from 'vitest';
import { buildWorld, simulateOneMonth } from '@island/engine';
import {
  assembleNarrativeContext,
  buildSystemPrompt,
  buildUserPrompt,
  callClaude,
  captureTriggerSnapshot,
  detectTriggers,
  generateNarrativeEntry,
  NARRATIVE_MODEL,
  predictLikelyTriggers,
  validateNarrativeEntry,
  type ClaudeClient,
  type LLMTrigger,
} from '../index';

// A fake Claude client that returns canned text and a usage record. The first call
// reports a cache miss; every call after reports a cache read (mirroring the real
// caching behaviour the smoke test verifies live).
function fakeClient(texts: string[]): { client: ClaudeClient; calls: () => number } {
  let i = 0;
  const client: ClaudeClient = {
    messages: {
      create: async (params) => {
        const text = texts[Math.min(i, texts.length - 1)] ?? '';
        i += 1;
        return {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: params.model,
          stop_reason: 'end_turn',
          stop_sequence: null,
          content: [{ type: 'text', text, citations: null }],
          usage: {
            input_tokens: 12,
            output_tokens: 40,
            cache_creation_input_tokens: i === 1 ? 1100 : 0,
            cache_read_input_tokens: i === 1 ? 0 : 1100,
            server_tool_use: null,
            service_tier: null,
          },
          // The fake only needs the fields callClaude reads; cast the rest.
        } as unknown as Awaited<ReturnType<ClaudeClient['messages']['create']>>;
      },
    },
  };
  return { client, calls: () => i };
}

const IN_VOICE =
  `The first month on the water teaches you what the talking never did.
You reach the wharf before six and load the ice yourself. Some days the
catch is thin and some days it is not. The buyers from Martinique come when
the sea allows it. You are learning to read the weather the way the old men
on the jetty read it, by the colour of the water and the feel of the wind.`;

const OUT_OF_VOICE = `You feel anxious about the catch. The simulation says prices rose 23%.`;

function firstBusinessTrigger(): LLMTrigger {
  return {
    id: 'FIRST_BUSINESS_STARTED',
    narrativeType: 'PERSONAL',
    data: { industry: 'FISHING', wasFirstInIndustryInParish: true },
  };
}

describe('system prompt (P5.1)', () => {
  it('is a frozen constant — identical on every call', () => {
    expect(buildSystemPrompt()).toBe(buildSystemPrompt());
  });

  it('carries the voice rules and the WORLD PRIMER, and clears the cache-minimum length', () => {
    const sys = buildSystemPrompt();
    expect(sys).toContain('VOICE RULES');
    expect(sys).toContain('WORLD PRIMER');
    expect(sys).toContain('Eastern Caribbean Dollar');
    // The voice rules alone sit under the ~1024-token cache minimum; the primer
    // pads it well past that. ~4 chars/token, so comfortably > 4000 chars.
    expect(sys.length).toBeGreaterThan(4000);
  });
});

describe('callClaude (P5.1)', () => {
  it('targets Opus 4.8, marks the system prompt for caching, and returns joined text + usage', async () => {
    let captured: Parameters<ClaudeClient['messages']['create']>[0] | undefined;
    const client: ClaudeClient = {
      messages: {
        create: async (params) => {
          captured = params;
          return {
            content: [
              { type: 'text', text: 'one. ' },
              { type: 'text', text: 'two.' },
            ],
            usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 },
          } as unknown as Awaited<ReturnType<ClaudeClient['messages']['create']>>;
        },
      },
    };
    const result = await callClaude('SYS', 'USER', client);
    expect(result.text).toBe('one. two.');
    expect(captured?.model).toBe(NARRATIVE_MODEL);
    expect(NARRATIVE_MODEL).toBe('claude-opus-4-8');
    const system = captured?.system as { text: string; cache_control?: { type: string } }[];
    expect(system[0]?.cache_control).toEqual({ type: 'ephemeral' });
    expect(system[0]?.text).toBe('SYS');
  });

  it('reads from cache on the second identical call (fake mirrors real caching)', async () => {
    const { client } = fakeClient([IN_VOICE]);
    const first = await callClaude('SYS', 'USER', client);
    const second = await callClaude('SYS', 'USER', client);
    expect(first.usage.cache_read_input_tokens).toBe(0);
    expect(second.usage.cache_read_input_tokens).toBeGreaterThan(0);
  });
});

describe('context + user prompt (P5.2)', () => {
  it('assembles an in-voice prompt that never leaks raw mechanics', () => {
    const world = buildWorld(42, { population: 200 });
    for (let m = 0; m < 6; m++) simulateOneMonth(world);
    const ctx = assembleNarrativeContext(world);
    const prompt = buildUserPrompt(firstBusinessTrigger(), ctx);

    expect(prompt).toContain('PLAYER PROFILE');
    expect(prompt).toContain('TRIGGER: The player has started their first business');
    expect(prompt).toContain(world.player.name);
    // No raw hidden scores — OCEAN traits, capitals, tendencies stay numeric in the
    // agent and qualitative in the prompt.
    expect(prompt).not.toMatch(/conscientiousness|riskTolerance|socialCapital|culturalCapital/);
    // The voice-calibration block is wired in.
    expect(prompt).toContain('VOICE CALIBRATION');
  });
});

describe('trigger detection (P5.3)', () => {
  it('fires ANNUAL_REFLECTION in December and not before', () => {
    const world = buildWorld(7, { population: 200 });
    world.month = 5;
    expect(detectTriggers(world).some((t) => t.id === 'ANNUAL_REFLECTION')).toBe(false);
    world.month = 11;
    expect(detectTriggers(world).some((t) => t.id === 'ANNUAL_REFLECTION')).toBe(true);
  });

  it('fires FIRST_BUSINESS_STARTED only when a new business appears since the snapshot', () => {
    const world = buildWorld(7, { population: 200 });
    const snapshot = captureTriggerSnapshot(world);
    expect(detectTriggers(world, snapshot).some((t) => t.id === 'FIRST_BUSINESS_STARTED')).toBe(false);
    world.player.businessesStarted.push({ industry: 'FISHING', wasFirstInIndustryInParish: true });
    expect(detectTriggers(world, snapshot).some((t) => t.id === 'FIRST_BUSINESS_STARTED')).toBe(true);
  });

  it('fires HURRICANE_MAJOR for a storm formed this month that touches the player', () => {
    const world = buildWorld(7, { population: 200 });
    world.player.occupation = 'FISHING';
    world.events.push({
      id: 'HURRICANE_MAJOR_0',
      definitionId: 'HURRICANE_MAJOR',
      severity: 0.8,
      startedMonth: world.month,
      durationRemaining: 5,
      affectedIndustries: ['FISHING', 'AGRICULTURE'],
    });
    expect(detectTriggers(world).some((t) => t.id === 'HURRICANE_MAJOR')).toBe(true);
  });

  it('predicts the upcoming annual reflection for prefetch', () => {
    const world = buildWorld(7, { population: 200 });
    world.month = 9;
    const predicted = predictLikelyTriggers(world, 3);
    expect(predicted.some((t) => t.id === 'ANNUAL_REFLECTION' && t.data.prefetchForMonth === 11)).toBe(true);
  });
});

describe('generateNarrativeEntry (P5.3)', () => {
  const world = buildWorld(42, { population: 200 });

  it('returns a validated entry tagged with the trigger', async () => {
    const { client } = fakeClient([IN_VOICE]);
    const result = await generateNarrativeEntry(firstBusinessTrigger(), world, client);
    expect(result.entry).not.toBeNull();
    expect(result.entry?.triggerId).toBe('FIRST_BUSINESS_STARTED');
    expect(result.entry?.type).toBe('PERSONAL');
    expect(result.entry?.month).toBe(world.month);
    expect(validateNarrativeEntry(result.entry!.text).valid).toBe(true);
  });

  it('retries once past an invalid generation, then succeeds', async () => {
    const { client, calls } = fakeClient([OUT_OF_VOICE, IN_VOICE]);
    const result = await generateNarrativeEntry(firstBusinessTrigger(), world, client);
    expect(result.entry).not.toBeNull();
    expect(result.attempts).toBe(2);
    expect(calls()).toBe(2);
  });

  it('rejects (entry: null) when generation never passes the voice gate', async () => {
    const { client } = fakeClient([OUT_OF_VOICE]);
    const result = await generateNarrativeEntry(firstBusinessTrigger(), world, client);
    expect(result.entry).toBeNull();
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
