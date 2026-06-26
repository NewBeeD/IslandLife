// P5.1 acceptance — a live smoke test. Generates a real Layer-2 entry twice and
// confirms the system prompt is served from the prompt cache on the second call
// (`usage.cache_read_input_tokens` > 0). Provider-agnostic: runs against whichever
// key is set — DeepSeek (cheap) or Anthropic. NOT part of `npm test` (the headless
// gate stays offline). Run with:
//
//   DEEPSEEK_API_KEY=…  npm run narrative:smoke
//   ANTHROPIC_API_KEY=… npm run narrative:smoke
//
import { buildWorld, simulateOneMonth } from '@island/engine';
import { generateNarrativeEntry } from './generate';
import type { LLMTrigger } from './triggers';

async function main(): Promise<void> {
  const provider = process.env.DEEPSEEK_API_KEY
    ? 'DeepSeek'
    : process.env.ANTHROPIC_API_KEY
      ? 'Anthropic'
      : null;
  if (!provider) {
    console.error('No provider key set (DEEPSEEK_API_KEY or ANTHROPIC_API_KEY) — cannot run the live smoke test.');
    process.exit(1);
  }
  console.log(`provider: ${provider}`);

  const world = buildWorld(42, { population: 200 });
  for (let m = 0; m < 6; m++) simulateOneMonth(world);

  const trigger: LLMTrigger = {
    id: 'FIRST_BUSINESS_STARTED',
    narrativeType: 'PERSONAL',
    data: { industry: world.player.occupation ?? 'FISHING', wasFirstInIndustryInParish: true },
  };

  console.log('— first generation (cache write) —');
  const first = await generateNarrativeEntry(trigger, world);
  console.log(first.entry?.text ?? `[rejected: ${first.issues.join('; ')}]`);
  console.log('usage:', JSON.stringify(first.usage));

  console.log('\n— second generation (cache read) —');
  const second = await generateNarrativeEntry(trigger, world);
  console.log(second.entry?.text ?? `[rejected: ${second.issues.join('; ')}]`);
  console.log('usage:', JSON.stringify(second.usage));

  const cacheRead = second.usage?.cache_read_input_tokens ?? 0;
  if (cacheRead > 0) {
    console.log(`\n✅ cache hit on the second call: cache_read_input_tokens = ${cacheRead}`);
  } else {
    console.error('\n❌ no cache read on the second call — the system prompt prefix is being invalidated.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
