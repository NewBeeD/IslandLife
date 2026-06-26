import { formatCurrency } from './magnitude';
import {
  describeActiveEvents,
  describeDomainKnowledgeFor,
  describeEconomy,
  describeEducation,
  describeFamilyBackground,
  describeFinancialSituation,
  describeLocalMarkets,
  describeOccupation,
  describePersonality,
  describeRecentHistory,
  describeRelationships,
  describeSocialStanding,
  type NarrativeContext,
} from './narrativeContext';
import { getVoiceAgeModifier, PARISH_VOICE_CONTEXT, SEASONAL_VOICE_NOTES } from './voice';
import type { Industry } from '@island/shared';
import type { LLMTrigger } from './triggers';

// The shared opening of every user prompt: who the player is and where the world
// stands, all as prose. The model writes FROM this, never quotes it back — the
// PLAYER PROFILE lines exist to inform the voice, not to be recited. No hidden
// numeric scores appear here; only their qualitative meaning (S3).
function buildBase(ctx: NarrativeContext): string {
  const { player, world } = ctx;
  return `PLAYER PROFILE (never mention these directly — use them to inform the voice):
- Name: ${player.name}
- Age: ${player.age}
- Parish: ${ctx.parishName}
- Occupation: ${describeOccupation(player.occupation)}
- Education background: ${describeEducation(player.culturalCapital)}
- Family background: ${describeFamilyBackground(player.familyBackground)}
- Personality: ${describePersonality(player)}
- Financial situation: ${describeFinancialSituation(player)}
- Social standing: ${describeSocialStanding(player)}
- Key relationships: ${describeRelationships(player, world)}
- Domain knowledge: ${describeDomainKnowledgeFor(player)}

WORLD STATE:
- Month/Year: ${ctx.monthLabel}
- Wider economy: ${describeEconomy(world)}
- Active events: ${describeActiveEvents(world)}
- Local market conditions: ${describeLocalMarkets(ctx.parishId, world.markets)}
- Recent events in the player's life: ${describeRecentHistory(player, world, 6)}

VOICE CALIBRATION (shape the prose; never mention any of this directly):
${getVoiceAgeModifier(player.age)}
Season — ${SEASONAL_VOICE_NOTES[ctx.monthIndex]}
Place — ${PARISH_VOICE_CONTEXT[ctx.parishId]}
`;
}

function industryLabel(value: unknown): string {
  return typeof value === 'string' ? (value as Industry).toLowerCase().replace(/_/g, ' ') : 'their trade';
}

// Build the trigger-specific user turn. The system prompt (the cached voice rules
// + world primer) is passed separately to callClaude; this is only the user turn.
export function buildUserPrompt(trigger: LLMTrigger, ctx: NarrativeContext): string {
  const base = buildBase(ctx);

  switch (trigger.id) {
    case 'HURRICANE_MAJOR': {
      const affected = Array.isArray(trigger.data.affectedIndustries)
        ? (trigger.data.affectedIndustries as Industry[]).map(industryLabel).join(', ')
        : 'much of the island';
      const hit = trigger.data.playerIndustryHit === true;
      return (
        base +
        `
TRIGGER: A major hurricane has struck Dominica.
Affected livelihoods: ${affected}
Disruption expected: ${String(trigger.data.durationMonths ?? 'several')} months
The player ${
          trigger.data.hasPreWarning
            ? 'received advance warning and had a few days to prepare'
            : 'had little warning — the storm intensified quickly'
        }.
The player's own work ${hit ? 'is directly in the storm\'s path' : 'is not the worst hit, but nothing on the island is untouched'}.

Write a narrative entry describing the hurricane's arrival and immediate
aftermath from the player's perspective. Include what they did to prepare
(or couldn't), what they lost or protected, what the first hours after were
like. Do not resolve what happens next — recovery is still ahead. End with
the situation as it stands right now.`
      );
    }

    case 'FIRST_BUSINESS_STARTED':
      return (
        base +
        `
TRIGGER: The player has started their first business.
Industry: ${industryLabel(trigger.data.industry)}
${trigger.data.wasFirstInIndustryInParish ? 'They are the first to try this in their parish.' : 'Others in the parish already do this kind of work.'}

Write a narrative entry about the first month of this business.
Not the excitement of starting — the reality of operating.
What the first customer or catch or contract felt like.
What went differently than expected. What the player now
understands that they did not understand before they started.`
      );

    case 'ANNUAL_REFLECTION':
      return (
        base +
        `
TRIGGER: End-of-year reflection.
Year ${String(trigger.data.yearNumber ?? '')} of this life. The player is ${ctx.player.age}.

Write an annual reflection — longer than a normal entry, written as a kind
of internal accounting of the year that has passed. Not sentimental. Honest.
The way a person who works hard and thinks clearly looks back at a year of
their life. Include what happened, what it meant, what is unresolved. Do not
summarize or conclude — the year is over but the life continues.`
      );

    case 'DEATH_AND_LEGACY':
      return (
        base +
        `
TRIGGER: The player's character has died. Age at death: ${ctx.player.age}.

Write the obituary and legacy reveal for this life — the final piece of
writing the player will read for this character.
Structure it as:
1. A brief, specific obituary (2–3 sentences — who they were, what they did)
2. The life, described honestly (3–5 paragraphs)
3. What they left (specific — people, things, reputation)
4. A final line that does not judge but lands
Do not moralize. Do not rank this life against other lives.`
      );

    default:
      return (
        base +
        `
TRIGGER: ${trigger.id}

Write an appropriate narrative entry for this event. Follow all voice rules.
Appropriate length for the significance of the event. Do not resolve any
decision the player must make.`
      );
  }
}

// Re-exported so callers building prompts have the currency formatter at hand
// (the EC$ exception to "numbers become prose").
export { formatCurrency };
