# Island Life — Narrative Generation System
## Design Document v1.2

---

## Overview

The narrative generation system is the translation layer between
the simulation and the player.

The simulation produces numbers.
The player reads a life.

This document defines exactly how simulation state —
market prices, NPC decisions, random events, loan balances,
knowledge levels, social capital scores — becomes the
prose that appears in the player's Daily Life feed.

The system has two layers working together:

**Layer 1: Template engine**
Structured prose templates with variable slots.
Fast, consistent, always grammatically correct.
Used for routine monthly entries — income, expenses,
small observations, minor events.

**Layer 2: LLM narrative generation**
The Claude API called with rich simulation context.
Used for significant events, decisions, relationships,
emotional moments, milestone entries.
This is where the game feels alive rather than procedural.

The two layers are invisible to the player.
All entries look like the same voice, the same world.

---

## The Narrative Voice

Everything the player reads is written in the same voice.

**Second person. Present tense. No sentimentality.
Specific. Grounded. Never explains.**

The voice never tells the player how to feel.
It describes what is happening with precision
and trusts the player to respond.

```
WRONG:
"You feel anxious about the loan payment coming up.
This is a difficult financial situation."

RIGHT:
"The NCB payment comes out on the fifteenth.
You have been watching the date approach
the way you watch weather coming in from the east."
```

```
WRONG:
"The hurricane has severely damaged the fishing industry,
causing supply shocks and price increases."

RIGHT:
"The boats that went out this morning came back fast.
The sea is not right. By afternoon the wharf is empty
and the buyers from Martinique have gone back to their hotel.
Whatever was going to happen today is not happening today."
```

The voice is Caribbean but not caricature.
It does not use dialect as decoration.
It reflects a specific place and life
through detail and specificity, not through accent.

---

## Layer 1: Template Engine

### Template structure

Each template is a prose block with typed variable slots.
Slots are filled from simulation state before rendering.

```typescript
interface NarrativeTemplate {
  id: string;
  type: NarrativeEntryType;
  triggerConditions: TriggerCondition[];
  requiredVariables: VariableDefinition[];
  text: string;  // with {variable} slots
  weight: number; // probability weight when multiple templates match
  cooldownMonths: number; // minimum months before this template fires again
}
```

### Variable types

```typescript
type VariableSlot =
  | { type: 'CURRENCY'; value: number }          // renders as "EC$3,240"
  | { type: 'NAME'; value: string }              // NPC name
  | { type: 'PARISH'; value: Parish }            // place name
  | { type: 'GOOD'; value: Good }                // commodity name
  | { type: 'MONTHS'; value: number }            // "six months", "two years"
  | { type: 'DIRECTION'; value: PriceDirection } // "up", "down", "holding steady"
  | { type: 'MAGNITUDE'; value: number }         // rendered as qualitative descriptor
  | { type: 'RELATIONSHIP'; value: string }      // "your uncle", "the woman at stall 7"
  | { type: 'OCCUPATION'; value: string }        // "a mason", "a civil servant"
```

### Qualitative magnitude rendering

Raw simulation magnitudes — price deltas, percentages, scores, probabilities —
are never shown to the player. They become prose. Specific currency amounts are
the deliberate exception: they appear as written EC$ figures, because a real
life is counted in real money (see voice rule 4 and the Sample Output footer).

```typescript
function renderMagnitude(value: number, context: MagnitudeContext): string {
  // Price change magnitude
  if (context === 'PRICE_CHANGE') {
    if (value < 0.05) return 'barely moved';
    if (value < 0.12) return 'edged up';
    if (value < 0.20) return 'climbed noticeably';
    if (value < 0.35) return 'jumped sharply';
    return 'more than you have seen in years';
  }

  // Income change
  if (context === 'INCOME_CHANGE') {
    if (value < 0.05) return 'about the same as last month';
    if (value < 0.15) return 'a little better than usual';
    if (value < 0.30) return 'a strong month';
    return 'better than you expected';
  }

  // Time period
  if (context === 'DURATION') {
    const months = Math.round(value);
    if (months === 1) return 'last month';
    if (months < 4) return 'the past few months';
    if (months < 7) return 'the past several months';
    if (months < 13) return 'most of this year';
    const years = Math.round(months / 12);
    if (years === 1) return 'the past year';
    return `the past ${years} years`;
  }

  // Debt/loan size relative to monthly income
  if (context === 'LOAN_RELATIVE_SIZE') {
    const monthsOfIncome = value;
    if (monthsOfIncome < 2) return 'manageable';
    if (monthsOfIncome < 5) return 'significant';
    if (monthsOfIncome < 10) return 'serious';
    return 'heavy';
  }

  // Exhaustive guard: every MagnitudeContext is handled above. If a new context
  // is added without a branch, fail loudly rather than interpolate "undefined"
  // into player-facing prose.
  throw new Error(`renderMagnitude: unhandled context "${context}"`);
}
```

---

## Template Library: Routine Monthly Entries

### Fishing income templates

```typescript
const FISHING_INCOME_TEMPLATES: NarrativeTemplate[] = [
  {
    id: 'FISH_GOOD_MONTH',
    type: 'PERSONAL',
    triggerConditions: [
      { field: 'player.occupation', equals: 'FISHING' },
      { field: 'player.monthlyIncome', greaterThan: 'player.averageMonthlyIncome * 1.15' },
    ],
    requiredVariables: ['monthlyIncome', 'priceDirection', 'marketName'],
    text: `The catch has been {incomeQuality} this month.
{marketName} prices are {priceDirection} and the boats
that went out consistently came back with something worth having.
You have been out every day the sea allowed it.`,
    weight: 1.0,
    cooldownMonths: 1,
  },
  {
    id: 'FISH_AVERAGE_MONTH',
    type: 'PERSONAL',
    triggerConditions: [
      { field: 'player.occupation', equals: 'FISHING' },
      { field: 'player.monthlyIncome', between: ['player.averageMonthlyIncome * 0.85',
                                                   'player.averageMonthlyIncome * 1.15'] },
    ],
    text: `A steady month on the water.
Nothing exceptional — the catch was {incomeQuality},
prices {priceDirection}.
You covered your costs and put something aside.
Some months are like that and some months are not.`,
    weight: 1.0,
    cooldownMonths: 1,
  },
  {
    id: 'FISH_POOR_MONTH',
    type: 'PERSONAL',
    triggerConditions: [
      { field: 'player.occupation', equals: 'FISHING' },
      { field: 'player.monthlyIncome', lessThan: 'player.averageMonthlyIncome * 0.75' },
    ],
    text: `It has been a hard month on the water.
The catch was {incomeQuality} and the prices at the wharf
have not helped.
You are covering your costs — just.
{fuelCostNarrative}`,
    weight: 1.0,
    cooldownMonths: 1,
  },
  {
    id: 'FISH_FUEL_OBSERVATION',
    type: 'OBSERVATION',
    triggerConditions: [
      { field: 'player.occupation', equals: 'FISHING' },
      { field: 'markets.FUEL.priceChange', greaterThan: 0.10 },
      { field: 'player.knowledge.fishing', greaterThan: 0.25 },
    ],
    text: `Fuel has gone up again at the dock.
{fuelPriceNarrative}
The margins on a regular catch day are thinner than they were.
The boats that are struggling most are the ones running
the furthest out — the fuel cost on a long day
can eat through a decent catch before you even reach the market.`,
    weight: 0.8,
    cooldownMonths: 2,
  },
];
```

### Agriculture income templates

```typescript
const AGRICULTURE_INCOME_TEMPLATES: NarrativeTemplate[] = [
  {
    id: 'AGRI_HARVEST_GOOD',
    type: 'PERSONAL',
    triggerConditions: [
      { field: 'player.occupation', equals: 'AGRICULTURE' },
      { field: 'player.monthlyIncome', greaterThan: 'player.averageMonthlyIncome * 1.20' },
    ],
    text: `The {primaryCrop} came in well this month.
The land gave what you put into it and the buyers
were there when you needed them.
{exportNarrative}`,
    weight: 1.0,
    cooldownMonths: 1,
  },
  {
    id: 'AGRI_DROUGHT_STRESS',
    type: 'OBSERVATION',
    triggerConditions: [
      { field: 'player.occupation', equals: 'AGRICULTURE' },
      { field: 'world.events', includes: 'DROUGHT' },
      { field: 'player.knowledge.agriculture', greaterThan: 0.30 },
    ],
    text: `The dry has gone on longer than usual.
You can see it in the soil — it cracks at the edges
of the field where it should still be holding moisture.
The {primaryCrop} is not failing yet but it will
if the rain does not come in the next three weeks.

You are watching the sky the way your father taught you.
It does not look promising.`,
    weight: 1.0,
    cooldownMonths: 3,
  },
  {
    id: 'AGRI_PRICE_OBSERVATION',
    type: 'OBSERVATION',
    triggerConditions: [
      { field: 'player.occupation', equals: 'AGRICULTURE' },
      { field: 'markets.primaryCrop.priceChange', not: 0 },
      { field: 'player.knowledge.agriculture', greaterThan: 0.40 },
    ],
    text: `{cropPriceNarrative}
The buyers at the wholesale market {buyerBehaviorNarrative}.
{interpretationNarrative}`,
    weight: 0.9,
    cooldownMonths: 1,
  },
];
```

### Financial templates

```typescript
const FINANCIAL_TEMPLATES: NarrativeTemplate[] = [
  {
    id: 'LOAN_PAYMENT_ROUTINE',
    type: 'MEMORY',
    triggerConditions: [
      { field: 'player.loans', hasActive: true },
      { field: 'player.loanPaymentHistory', hasPayments: true },
    ],
    text: `The {loanPurpose} payment comes out this month.
{paymentAmount}.
{remainingTermNarrative}`,
    weight: 0.6,  // only shows sometimes — not every month
    cooldownMonths: 3,
  },
  {
    id: 'LOAN_PAYMENT_TIGHT',
    type: 'DECISION_REQUIRED',
    triggerConditions: [
      { field: 'player.loans', hasActive: true },
      { field: 'player.cashAfterPayment', lessThan: 500 },
    ],
    text: `The {loanPurpose} payment is due this month.
After it clears you will have {remainingCash} in hand.

That is tight. Not impossible — you have had tighter —
but tight enough that one bad week changes the calculation.`,
    weight: 1.0,
    cooldownMonths: 1,
  },
  {
    id: 'SAVINGS_MILESTONE',
    type: 'PERSONAL',
    triggerConditions: [
      { field: 'player.cash', crossedThreshold: [5000, 10000, 20000, 50000] },
    ],
    text: `You check what you have put aside.
{savingsAmount}.

You have been moving toward this number
for {durationNarrative} without quite counting.
It is not a large amount in some senses.
In others it is.`,
    weight: 1.0,
    cooldownMonths: 0,  // fires when threshold crossed, once per threshold
  },
];
```

---

## Layer 2: LLM Narrative Generation

For significant events — a death in the family, a major business decision,
a hurricane, a migration choice, a legacy moment — templates are insufficient.
The game calls the Claude API with full simulation context
and generates bespoke narrative prose.

### When LLM generation triggers

```typescript
const LLM_GENERATION_TRIGGERS = [
  // Life events
  'FAMILY_MEMBER_DEATH',
  'CHILD_BORN',
  'MARRIAGE',
  'SERIOUS_ILLNESS',
  'MENTOR_CONTACT',

  // Economic events
  'HURRICANE_MAJOR',
  'BUSINESS_FAILURE',
  'FIRST_BUSINESS_STARTED',
  'LOAN_DEFAULT',
  'MAJOR_CONTRACT_WON',
  'MONOPOLY_THRESHOLD_CROSSED',
  'BANK_DISTRESS_AFFECTS_PLAYER',

  // Decision moments
  'MIGRATION_OPPORTUNITY',
  'MAJOR_INVESTMENT_DECISION',
  'BUSINESS_ACQUISITION_OFFER',
  'GOVERNMENT_CONTRACT_OPPORTUNITY',
  'POLITICAL_OPPORTUNITY',

  // Milestone moments
  'ANNUAL_REFLECTION',
  'DECADE_MILESTONE',
  'DEATH_AND_LEGACY',
  'RETURN_FROM_MIGRATION',
  'BUSINESS_REACHES_MONOPOLY',
];
```

### The LLM prompt structure

When a trigger fires, the game assembles a structured prompt
containing all relevant simulation context and calls the API.

```typescript
import Anthropic from '@anthropic-ai/sdk';

// One client per process. Reads ANTHROPIC_API_KEY from the environment and sets
// authentication and the anthropic-version header automatically (the raw fetch
// this replaced was missing both).
const anthropic = new Anthropic();

// Single entry point for every Claude call. The system prompt is byte-for-byte
// identical on every generation, so it is marked for prompt caching. It is
// deliberately padded with a constant WORLD PRIMER so the prefix clears the
// model's ~1024-token minimum cacheable length — below that, the cache_control
// marker silently does nothing. With Opus 4.8 driving generation the cache hit
// is what keeps a long playthrough affordable. Keep the system prompt stable:
// any byte change anywhere in it invalidates the cached prefix. Verify with
// `usage.cache_read_input_tokens` — if it stays 0, something is invalidating it.
async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-8',     // highest-quality prose; prompt caching + async
                                  // prefetch (batchable) offset the higher per-token cost
    max_tokens: 1500,             // room for annual reflections and legacy entries
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');
}

async function generateNarrativeEntry(
  trigger: LLMTrigger,
  player: NPCAgent,
  world: WorldState,
): Promise<NarrativeEntry> {

  const context = assembleNarrativeContext(player, world, trigger);
  const text = await callClaude(buildSystemPrompt(), buildUserPrompt(trigger, context));

  return {
    type: trigger.narrativeType,
    text,
    month: world.month,
    trigger: trigger.id,
  };
}
```

### System prompt (constant across all generations)

```typescript
function buildSystemPrompt(): string {
  return `You are the narrative voice of a life simulation game
set in Dominica, Eastern Caribbean.

Your job is to write narrative entries that the player reads
as events unfold in their simulated life.

VOICE RULES — follow these absolutely:

1. Second person, present tense.
   "You" not "the player". "is" not "was".

2. Never explain the simulation.
   Do not mention game mechanics, probability, or statistics.
   Write life, not systems.

3. Show, never tell.
   Never write what the player should feel.
   Describe what they observe, hear, and experience.
   Trust the player to respond.

4. Specific over general.
   "EC$620" not "money". "the wharf at Portsmouth" not "the harbour".
   "dasheen" not "crops". Specificity creates reality.

5. Caribbean but not caricature.
   This is Dominica. The language should reflect a specific place
   through detail and accuracy, not through dialect performance.
   Real names, real places, real goods, real economic conditions.

6. No sentimentality.
   The voice is clear-eyed. It does not editorialize.
   It does not tell the player their life has been good or hard.
   It describes. The player concludes.

7. Appropriate length.
   Routine entries: 3–5 sentences.
   Significant events: 2–4 short paragraphs.
   Annual reflections: 4–6 paragraphs.
   Death and legacy: as long as the life requires.

8. Never resolve decisions.
   If a decision is pending, describe the situation fully
   and stop. Do not tell the player what to do.
   Do not hint at the right answer.

9. Consequences surface naturally.
   When a past decision's consequence appears, write it
   as something the player notices or experiences —
   not as a reminder of what they chose.
   "Raymond's ice machine operation now services twelve boats"
   not "because you declined Raymond's offer three years ago..."

10. The world is indifferent.
    The hurricane does not care. The bank does not hate you.
    Eunice is running a business like everyone else.
    Write a world that operates on its own logic,
    not a world designed to reward or punish.

────────────────────────────────────────────────────────
WORLD PRIMER — constant reference. None of this changes between
generations; it exists so the prose is grounded in a real place
and so this system prompt is long enough to be served from the
prompt cache. Use it for texture; never quote it back at the player.

THE PLACE.
Dominica — the Commonwealth of Dominica, not the Dominican Republic.
A small mountainous island in the Eastern Caribbean between the French
territories of Guadeloupe and Martinique. Roughly 72,000 people.
Volcanic interior, rainforest, rivers, a rugged Atlantic east coast and
a calmer Caribbean west coast. The capital is Roseau, on the southwest.
Portsmouth is the second town, in the north, on Prince Rupert Bay near
the Indian River. The island is divided into ten parishes, each named for
a saint. Most people know each other or know someone who does. Nothing
that happens in a village stays unknown for long.

THE TEN PARISHES AND THEIR TOWNS.
Saint George — Roseau (capital): government, the cruise berth, the Old
  Market, the most formal economy, best market access.
Saint John — Portsmouth: fishing, the cooperative, the Indian River,
  Douglas/Prince Rupert Bay, some tourism.
Saint Andrew — Marigot: the agricultural and Atlantic-facing north-east;
  the Kalinago Territory is near here; remoter from the capital.
Saint David — Castle Bruce: east coast, agriculture and fishing, remote.
Saint Patrick — Berekua (Grand Bay): southern agriculture and fishing,
  proud and independent in character.
Saint Joseph — Saint Joseph: west coast, agriculture and construction.
Saint Paul — Pointe Michel / Mahaut / Canefield: just north of Roseau,
  retail and services, the Canefield airstrip and market.
Saint Luke — Laplaine: small, southern, agricultural.
Saint Mark — Soufrière: south-west, fishing, tourism, the sulphur springs.
Saint Peter — Colihaut: small north-west farming and fishing villages.

THE ECONOMY.
Currency is the Eastern Caribbean Dollar, written EC$ (code XCD), pegged
to the US dollar at 2.70. Never write bare "$" or "dollars" — always EC$.
Livelihoods: fishing (fresh fish sold at the wharf, some export-grade to
Martinique and Barbados), agriculture (dasheen, bananas for the EU market,
plantain and other provisions, bay oil), construction (cement, lumber,
galvanise/"zinc"), tourism (guesthouses, eco-tours, the odd cruise day),
transport (minibuses with regulated fares, inter-parish cargo), informal
trade, and the civil service. Banks include the National Commercial Bank
(NCB) and credit unions; the credit union reaches the informal sector that
the commercial banks treat warily. Remittances from family in the UK, the
USVI, Canada, the USA and the French islands are a real and steady part of
many households — they swell after a hurricane.

THE WEATHER AND THE YEAR.
Hurricane season runs June to November; the worst risk is August–September.
The dry season runs roughly January–April; trade winds, cooler nights,
calmer seas. People watch the barometer and the sky. December brings the
Christmas season — money moves, returnees come home, tourism picks up.

GOODS, SPECIFICS, TEXTURE.
Fish: not "fish" but the catch — what came back in the boat. Fish spoils
in a day or two without ice; the cooperative's ice machine matters.
Agriculture: dasheen (taro), bananas, plantain, yam, "provisions", bay oil
(distilled from bay leaves, a high-value export). Fuel for boats and buses
is a live cost that eats margins. The road from Roseau to the villages
takes time; remoteness is itself an economic fact.

VOICE CALIBRATION — one more pass.
WRONG: "Fish prices have increased by 23% due to a supply shock."
RIGHT: "You reach the wharf before six and the stalls are thin. Three boats
        didn't go out — the sea was rough and two engines are down. The
        buyers from Martinique are already there, offering prices you have
        not seen in months."
WRONG: "You feel anxious about the loan payment."
RIGHT: "The NCB payment comes out on the fifteenth. You have been watching
        the date the way you watch weather coming in from the east."
The difference is always the same: name the thing, show what is seen and
heard, and let the player draw the conclusion.
────────────────────────────────────────────────────────`;
}
```

### User prompt construction

The user prompt is assembled from simulation state.
Different triggers receive different context structures.

```typescript
function buildUserPrompt(
  trigger: LLMTrigger,
  context: NarrativeContext
): string {

  const base = `
PLAYER PROFILE (never mention these directly — use them to inform the voice):
- Name: ${context.player.name}
- Age: ${context.player.age}
- Parish: ${context.player.parish.name}
- Occupation: ${context.player.occupation}
- Time in current occupation: ${context.player.monthsInOccupation} months
- Education background: ${describeEducation(context.player.culturalCapital)}
- Family background: ${describeFamilyBackground(context.player.familyBackground)}
- Personality: ${describePersonality(context.player)}
- Financial situation: ${describeFinancialSituation(context.player)}
- Social standing: ${describeSocialStanding(context.player)}
- Key relationships: ${describeRelationships(context.player.socialNetwork)}
- Domain knowledge: ${describeKnowledge(context.player.knowledge)}

WORLD STATE:
- Month/Year: ${formatGameDate(context.world.month)}
- Economic cycle: ${context.world.economicCycle.phase}
- Active events: ${describeActiveEvents(context.world.events)}
- Local market conditions: ${describeLocalMarkets(
    context.player.parish,
    context.world.markets
  )}
- Recent events in player's life: ${describeRecentHistory(
    context.player,
    context.world,
    6 // last 6 months
  )}

VOICE CALIBRATION (shape the prose; never mention any of this directly):
${getVoiceAgeModifier(context.player.age)}
Season — ${SEASONAL_VOICE_NOTES[context.world.month % 12]}
Place — ${PARISH_VOICE_CONTEXT[context.player.parish.id] ?? ''}
`;

  // Trigger-specific context
  switch (trigger.id) {

    case 'HURRICANE_MAJOR':
      return base + `
TRIGGER: A major hurricane has struck Dominica.
Severity: ${trigger.data.severity} (0=minor, 1=catastrophic)
Affected industries: ${trigger.data.affectedIndustries.join(', ')}
Duration: ${trigger.data.durationMonths} months of disruption expected

The player ${trigger.data.hasPreWarning
  ? 'received advance warning and had 3 days to prepare'
  : 'had little warning — the storm intensified quickly'}

Impact on player's assets:
${describeHurricaneImpact(context.player, trigger.data)}

Write a narrative entry describing the hurricane's arrival and immediate
aftermath from the player's perspective. Include what they did to prepare
(or couldn't do), what they lost or protected, what the first hours after
were like. Do not resolve what happens next — the player has decisions
to make about recovery. End with the situation as it stands right now.`;

    case 'FAMILY_MEMBER_DEATH':
      return base + `
TRIGGER: A family member has died.
Who: ${trigger.data.relationship} (${trigger.data.npc.name})
Age at death: ${trigger.data.npc.age}
Cause: ${trigger.data.cause}
Relationship quality: ${trigger.data.relationshipQuality}
Economic impact: ${describeEconomicImpact(trigger.data.economicEffect)}

Write a narrative entry about this death as the player experiences it.
This is a life event, not a game event. Do not mention economic consequences
directly — they may surface, but through the reality of the situation,
not as itemized impacts. The relationship history matters.
A distant uncle who left land is different from a parent
who fished alongside you for years.`;

    case 'MIGRATION_OPPORTUNITY':
      return base + `
TRIGGER: A real migration opportunity has surfaced.
Destination: ${trigger.data.destination.name}
Opportunity type: ${trigger.data.opportunityType}
Income: ${formatCurrency(trigger.data.offeredIncome)}/month
Source: ${trigger.data.source} (who told the player about this)
Window: ${trigger.data.windowMonths} months to decide

Current ties keeping player in Dominica:
${describeLocalTies(context.player, context.world)}

Write a narrative entry presenting this opportunity as the player
experiences learning about it. Include the source — how they heard,
from whom, in what context. Convey the genuine complexity of the decision
without tilting it toward either choice. This is one of the most
significant decisions in the game. Do not make it feel small.
End with the options available but do not recommend any.`;

    case 'FIRST_BUSINESS_STARTED':
      return base + `
TRIGGER: The player has started their first business.
Business type: ${trigger.data.businessType}
Industry: ${trigger.data.industry}
Starting capital: ${formatCurrency(trigger.data.startingCapital)}
Financing: ${trigger.data.financing}
First month outcome: ${trigger.data.firstMonthResult}

Write a narrative entry about the first month of this business.
Not the excitement of starting — the reality of operating.
What the first customer or catch or contract felt like.
What went differently than expected. What the player now
understands that they did not understand before they started.`;

    case 'ANNUAL_REFLECTION':
      return base + `
TRIGGER: End of year reflection.
Year number in game: ${trigger.data.yearNumber}
Player age: ${context.player.age}
Key events this year: ${trigger.data.keyEvents.map(e => e.description).join('; ')}
Financial trajectory: ${trigger.data.financialTrajectory}
Relationship changes: ${trigger.data.relationshipChanges.join('; ')}
Decisions made: ${trigger.data.significantDecisions.join('; ')}

Write an annual reflection entry — longer than a normal entry,
written as a kind of internal accounting of the year that has passed.
Not sentimental. Honest. The way a person who works hard
and thinks clearly looks back at a year of their life.
Include what happened, what it meant, what is unresolved.
Do not summarize or conclude — the year is over but the life continues.`;

    case 'DEATH_AND_LEGACY':
      return base + `
TRIGGER: The player's character has died.
Age at death: ${context.player.age}
Cause: ${trigger.data.cause}
Full life summary: ${trigger.data.lifeSummary}
Legacy score breakdown: ${trigger.data.legacyScores}
Key relationships at death: ${trigger.data.keyRelationshipsAtDeath}
Businesses/assets left: ${trigger.data.assetsAtDeath}
Children and their outcomes: ${trigger.data.childrenOutcomes}
Community standing: ${trigger.data.communityStanding}
Notable decisions over lifetime: ${trigger.data.notableDecisions.join('; ')}

Write the obituary and legacy reveal for this life.
This is the final piece of writing the player will read
for this character — it must do justice to what they built,
what they chose, and what they left behind.

Structure it as:
1. A brief, specific obituary (2–3 sentences — who they were, what they did)
2. The life, described honestly (3–5 paragraphs)
3. What they left (specific — people, things, reputation)
4. A final line that does not judge but lands

Do not moralize. Do not rank this life against other lives.
This was one person's existence in one place in one time.
Write it with the weight that deserves.`;

    default:
      return base + `
TRIGGER: ${trigger.id}
Context: ${JSON.stringify(trigger.data, null, 2)}

Write an appropriate narrative entry for this event.
Follow all voice rules. Appropriate length for the significance
of the event. Do not resolve decisions the player must make.`;
  }
}
```

---

## Context Assemblers

These functions translate simulation numbers into descriptive prose
that the LLM can use to write accurately without seeing raw data.

> **`context.player` is an enriched projection, not the raw `NPCAgent`.**
> `assembleNarrativeContext` denormalizes the agent for prose: it resolves the
> agent's `parish` id to the full Parish object (so `parish.name` / `parish.id`
> work), joins the persistent identity/circumstance fields (`name`,
> `familyBackground`, `formativeEvent` — now declared on `NPCAgent`), and derives
> conveniences like `monthsInOccupation`. The raw agent stays numeric; only this
> view is shaped for the prompt.

```typescript
function describePersonality(player: NPCAgent): string {
  const traits: string[] = [];

  if (player.conscientiousness > 0.70)
    traits.push('methodical, follows through on commitments');
  else if (player.conscientiousness < 0.35)
    traits.push('spontaneous, sometimes leaves things unfinished');

  if (player.riskTolerance > 0.65)
    traits.push('comfortable with uncertainty, moves decisively');
  else if (player.riskTolerance < 0.35)
    traits.push('cautious, prefers certainty before acting');

  if (player.extraversion > 0.65)
    traits.push('builds relationships easily, known in the community');
  else if (player.extraversion < 0.35)
    traits.push('quieter, known well by fewer people');

  if (player.lossAversion > 0.65)
    traits.push('feels losses keenly, protects what they have');

  if (player.patience > 0.65)
    traits.push('long-term thinker, willing to wait for outcomes');

  return traits.join('; ');
}

function describeFinancialSituation(player: NPCAgent): string {
  const monthsOfExpenses = player.cash / player.monthlyLivingCosts;
  const hasLoans = player.loans.some(l => l.status === 'ACTIVE');
  const hasAssets = player.economicAssets.length > 0;

  let description = '';

  if (monthsOfExpenses < 1)
    description = 'cash-constrained, living close to the edge';
  else if (monthsOfExpenses < 3)
    description = 'tight but managing, limited buffer';
  else if (monthsOfExpenses < 8)
    description = 'stable, modest savings';
  else if (monthsOfExpenses < 20)
    description = 'reasonably secure, some accumulated savings';
  else
    description = 'financially comfortable by local standards';

  if (hasLoans) {
    const loanBurden = player.loans
      .filter(l => l.status === 'ACTIVE')
      .reduce((sum, l) => sum + l.monthlyPayment, 0) / player.monthlyIncome;
    if (loanBurden > 0.35)
      description += ', carrying significant loan obligations';
    else
      description += ', with manageable loan commitments';
  }

  if (hasAssets)
    description += `, owns: ${player.economicAssets.map(a => a.type.toLowerCase()).join(', ')}`;

  return description;
}

function describeSocialStanding(player: NPCAgent): string {
  const parts: string[] = [];

  if (player.socialCapitalLocal > 0.65)
    parts.push('well-connected locally, trusted in the community');
  else if (player.socialCapitalLocal > 0.40)
    parts.push('known in the community, moderate local connections');
  else
    parts.push('limited local network, still building community ties');

  if (player.socialCapitalInstitutional > 0.55)
    parts.push('comfortable with formal institutions, banks and government');
  else if (player.socialCapitalInstitutional < 0.30)
    parts.push('limited access to formal sector, navigates informally');

  if (player.socialCapitalDiaspora > 0.40)
    parts.push('has meaningful overseas connections');

  return parts.join('; ');
}

function describeLocalMarkets(parish: Parish, markets: Market[]): string {
  const localMarkets = markets.filter(m => m.parish === parish.id);

  return localMarkets.map(market => {
    const good = GOODS.find(g => g.id === market.goodId);
    const priceVsBase = market.currentPrice / good.basePrice;
    const trend = market.priceHistory.length > 2
      ? market.priceHistory[market.priceHistory.length - 1] >
        market.priceHistory[market.priceHistory.length - 3]
        ? 'rising'
        : 'falling'
      : 'stable';

    return `${good.name}: ${
      priceVsBase > 1.20 ? 'well above normal' :
      priceVsBase > 1.05 ? 'slightly above normal' :
      priceVsBase < 0.85 ? 'below normal' :
      'near normal'
    } and ${trend}`;
  }).join('; ');
}

function describeRecentHistory(
  player: NPCAgent,
  world: WorldState,
  monthsBack: number
): string {
  const recentEvents = world.eventLog
    .filter(e =>
      e.month >= world.month - monthsBack &&
      (e.affectedAgents.includes(player.id) || e.global)
    )
    .map(e => e.shortDescription);

  return recentEvents.length > 0
    ? recentEvents.join('; ')
    : 'no significant events in this period';
}
```

---

## Narrative Variety System

The same situation should not always produce the same prose.
The variety system ensures the game feels alive across long playthroughs.

### Variation strategies

**1. Voice aging**
The narrative voice shifts subtly as the player ages.
A 22-year-old player reads entries written with more immediate urgency.
A 45-year-old player reads entries with more accumulated perspective.

```typescript
function getVoiceAgeModifier(age: number): string {
  if (age < 25) return `
The character is young — write with the energy and immediacy
of someone for whom everything is still being established.
Decisions feel consequential because so little is settled yet.`;

  if (age < 40) return `
The character is in the prime working years — write with
the weight of someone who has made enough decisions to know
that some work out and some don't. Less surprised by difficulty.
More precise about what they want.`;

  if (age < 55) return `
The character is established — write with the perspective
of someone who has built something (whatever it is)
and is maintaining and extending it. Children are growing.
Parents are aging. The future is starting to be the past.`;

  return `
The character is older — write with the quality of attention
that comes from knowing time is finite. Not resigned.
Clear. What matters is clearer than it was at thirty.`;
}
```

**2. Seasonal voice**
The Caribbean seasons are felt in the prose.

```typescript
const SEASONAL_VOICE_NOTES: Record<number, string> = {
  0:  'January — dry season, cooler nights, trade winds',
  1:  'February — driest month, boats go out in good conditions',
  2:  'March — end of dry season, some uncertainty about the year ahead',
  3:  'April — mangos starting, heat building',
  4:  'May — pre-season, sea beginning to change',
  5:  'June — hurricane season begins, weather watching starts',
  6:  'July — peak heat, sea warm, storm risk real',
  7:  'August — mid-hurricane season, heightened alertness',
  8:  'September — most active month of hurricane season',
  9:  'October — hurricane season winding down, wet',
  10: 'November — cooling, rainy, end of hurricane season relief',
  11: 'December — Christmas season, money moving, tourism picking up',
};
```

**3. Parish voice**
Entries are grounded in the specific geography of the player's parish.
A Portsmouth entry mentions different landmarks, rhythms, and people
than a Roseau entry.

```typescript
const PARISH_VOICE_CONTEXT: Record<string, string> = {
  SAINT_GEORGE: `
Portsmouth is not involved. This is Roseau — the capital,
the government buildings, the cruise ship berth, the Old Market.
People here are more formally employed, more connected to
institutions. The pace is different from the villages.`,

  SAINT_JOHN: `
This is Portsmouth — the second town, the Indian River,
the Douglas Bay, the fishing community along the waterfront.
Less formal than Roseau. More connected to the sea.
The cooperative is a real presence here.`,

  SAINT_ANDREW: `
This is the agricultural interior and east coast.
Marigot, the Atlantic-facing villages, the farming families.
More remote from the capital's economy. The road to Roseau
takes time. Self-sufficiency matters more here.`,

  // ... other parishes
};
```

---

## Opportunity Decision Interface Generation

When the player must make a significant decision,
the LLM generates the full decision presentation —
the situation, the options, and the framing.

Critically: the options are never pre-labeled as good or bad.
The LLM is explicitly instructed to present genuine tradeoffs.

```typescript
async function generateDecisionInterface(
  decision: PendingDecision,
  player: NPCAgent,
  world: WorldState,
): Promise<DecisionInterface> {

  // System prompt is passed separately (and cached); this is the user turn.
  const userPrompt = `
A decision point has arrived in the player's life.

${assembleNarrativeContext(player, world, decision)}

DECISION: ${decision.type}
${buildDecisionContext(decision, player, world)}

Write:
1. A narrative situation (3–5 sentences describing the full context,
   what is at stake, what the player knows and doesn't know)
2. The options available (2–4 options, each described in 1–2 sentences
   as the player would actually experience them, not as abstract choices)

CRITICAL RULES FOR OPTIONS:
- Never label any option as safe, risky, good, or bad
- Each option must represent a genuine choice a reasonable person could make
- Include the real costs of every option, including the safe options
- Include the real benefits of every option, including the risky ones
- The status quo (doing nothing) is always an option if it's realistic
- Do not hint at which option the simulation favors

Format your response as JSON:
{
  "situation": "...",
  "options": [
    { "id": "A", "label": "Short action label", "description": "..." },
    { "id": "B", "label": "Short action label", "description": "..." }
  ]
}`;

  const response = await callClaude(buildSystemPrompt(), userPrompt);
  return JSON.parse(response);
}
```

---

## Consequence Narrative Generation

When a past decision's consequence surfaces months or years later,
the system generates a consequence entry that connects to the past
without explicitly naming the decision.

```typescript
async function generateConsequenceEntry(
  originalDecision: CompletedDecision,
  currentOutcome: OutcomeEvent,
  player: NPCAgent,
  world: WorldState,
): Promise<NarrativeEntry> {

  const monthsElapsed = world.month - originalDecision.month;

  // System prompt is passed separately (and cached); this is the user turn.
  const userPrompt = `
A consequence of a past decision is now visible.

ORIGINAL DECISION (${renderTimePassed(monthsElapsed)} ago):
The player chose: ${originalDecision.chosenOption.description}
Alternative path not taken: ${originalDecision.alternativePaths
  .map(p => p.description).join('; ')}

WHAT IS NOW VISIBLE:
${currentOutcome.description}

PLAYER'S CURRENT SITUATION:
${assembleNarrativeContext(player, world)}

Write a narrative entry that shows the player this consequence
as something they observe or experience in their life right now.

CRITICAL:
- Do NOT say "because you chose X" or "as a result of your decision"
- The connection between past choice and current reality
  should be visible without being stated
- The player should be able to trace it back if they think about it
- But the game should not explain it for them
- Write what the player sees, hears, or notices today`;

  const response = await callClaude(buildSystemPrompt(), userPrompt);
  return { type: 'MEMORY', text: response, month: world.month };
}
```

---

## Narrative Quality Controls

Before any generated text reaches the player,
it passes through quality filters.

```typescript
function validateNarrativeEntry(
  text: string,
  triggerId?: string,   // pass the generating trigger so long-form entries are exempt
): ValidationResult {
  const issues: string[] = [];

  // Check for forbidden patterns
  const forbiddenPatterns = [
    // Game mechanics exposed
    /\b(stat|score|points?|level|percentage|probability|chance of)\b/i,
    // Explaining the simulation
    /\b(the simulation|the game|the system)\b/i,
    // Telling the player how to feel — emotional labels only.
    // Sensory "you feel the heat / the rope / the wind" is allowed.
    /\byou feel (anxious|worried|happy|sad|excited|nervous|afraid|scared|proud|angry|relieved|guilty|hopeful)\b/i,
    /\byou are (happy|sad|worried|anxious|excited|nervous|afraid|proud|angry|relieved)\b/i,
    // Labeling decisions
    /\b(good choice|bad choice|right decision|wrong decision|risky option)\b/i,
    // Breaking Caribbean setting — bare dollar amounts; "EC$" is allowed
    /\bUSD\b/,
    /\bdollars?\b/i,
    /(?<!EC)\$\d/,   // a "$" amount not prefixed with EC
    // Anachronisms
    /\b(algorithm|blockchain|cryptocurrency|social media)\b/i,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) {
      issues.push(`Forbidden pattern: ${pattern.source}`);
    }
  }

  // Check length appropriateness. Annual reflections (4–6 paragraphs) and the
  // legacy/obituary entry ("as long as the life requires") are intentionally
  // long-form per voice rule 7, so the 400-word cap must not apply to them.
  const LONG_FORM_TRIGGERS = ['ANNUAL_REFLECTION', 'DECADE_MILESTONE', 'DEATH_AND_LEGACY'];
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 400 && !LONG_FORM_TRIGGERS.includes(triggerId ?? '')) {
    issues.push('Entry too long — maximum 400 words except for annual/legacy entries');
  }
  if (wordCount < 20) {
    issues.push('Entry too short — minimum 20 words');
  }

  // Voice drift: the PLAYER is always second person ("you"). NPCs are described
  // in third person, so he/she/they are allowed. Flag first-person narration and
  // any third-person reference to the player. (Quoted NPC dialogue can legitimately
  // contain "I" — strip quoted spans before this check in production.)
  if (/\bthe player\b/i.test(text) || /\b(I|we|me|my)\b/.test(text)) {
    issues.push('Voice drift — narration must be second person');
  }

  return {
    valid: issues.length === 0,
    issues,
    text,
  };
}
```

---

## Narrative Cache and Performance

LLM generation is called asynchronously and results are cached.
The player should never wait for narrative text to appear.

```typescript
class NarrativeCacheManager {
  private cache: Map<string, CachedEntry> = new Map();
  private generationQueue: GenerationRequest[] = [];

  // Pre-generate likely upcoming entries during quiet periods
  async prefetchLikelyEntries(
    player: NPCAgent,
    world: WorldState,
  ): Promise<void> {
    const likelyTriggers = predictLikelyTriggers(player, world, 3); // next 3 months

    for (const trigger of likelyTriggers) {
      if (!this.cache.has(trigger.cacheKey)) {
        this.generationQueue.push({ trigger, player, world });
      }
    }

    // Process queue during idle time
    await this.processQueue();
  }

  private async processQueue(): Promise<void> {
    while (this.generationQueue.length > 0) {
      const request = this.generationQueue.shift();
      const entry = await generateNarrativeEntry(
        request.trigger,
        request.player,
        request.world,
      );
      this.cache.set(request.trigger.cacheKey, {
        entry,
        generatedAt: Date.now(),
        ttl: 30 * 60 * 1000, // 30 minutes
      });
    }
  }
}
```

---

## Sample Output: Full Monthly Feed

This is what the player reads in a typical month,
combining template entries and LLM-generated entries.

```
─────────────────────────────────────────────────────
OCTOBER 2027  ·  Jean-Pierre Laville  ·  Age 24
─────────────────────────────────────────────────────

[OBSERVATION]
The boats that went out this morning came back fast.
The sea is not right. By afternoon the wharf is empty
and the buyers from Martinique have gone back to their hotel.
The radio is saying tropical storm. The barometer
at the cooperative has been dropping since Tuesday.
Whatever was going to happen this week is not happening this week.

[DECISION REQUIRED]
The storm passed north of the island — serious enough
to rough up the sea for five days but not the disaster
it could have been. Your boat is fine. The engine held.

But the ice machine at the cooperative broke down
during the power outage and has not been repaired.
Without ice you cannot keep catch overnight.
Without overnight storage you cannot go out on the long runs
where the better fish are.

Raymond St. Jean — who has his own machine —
has offered to let you use his storage at EC$80 a week.
The cooperative is saying their repair will take three weeks.

[COMMUNITY]
Your uncle mentions at the fish fry on Saturday
that the hotel at Portsmouth is expanding.
They are building twelve new rooms and they need
a reliable fresh fish supplier for the restaurant.
He heard it from the manager directly.
He thinks you should go and speak to them.
You do not know if this is a serious opportunity
or the kind of thing that sounds good at a fish fry.

[PERSONAL]
The Eunice arrangement has been running for
almost two years now. EC$3,200 a month, reliable.
She has not raised the rate. You have not asked.
You have been thinking about whether to ask.
The Canefield market is doing well — you can see that.
Whether that translates into room to negotiate
or a reason for her to stay exactly where she is,
you are not certain.

─────────────────────────────────────────────────────
This month:  EC$2,480 earned  ·  EC$1,890 spent
In hand: EC$6,340                [ADVANCE TO NOVEMBER]
─────────────────────────────────────────────────────
```

---

## References

- Thaler, R. & Sunstein, C. (2008). Nudge.
  — Choice architecture principles applied to
    how options are presented without directing decisions.

- Norman, D. (2013). The Design of Everyday Things.
  — Affordance theory: what actions look available
    shapes what decisions get made.

- Murray, J. (1997). Hamlet on the Holodeck.
  — Procedural narrative theory:
    how rules generate meaningful story.

- Mateas, M. & Stern, A. (2003). Façade.
  — Interactive drama architecture:
    how simulation and narrative co-exist.

- Kreminski, M. & Wardrip-Fruin, N. (2019).
  Why Are We Like This? The AI Architecture of a
  Co-Creative Storytelling Game.
  — Template + LLM hybrid narrative systems.

- Loyer, E. (2015). Inkle Studios narrative design principles.
  — Consequence-forward writing in interactive fiction.

---

*Document version 1.2 — Island Life game design*
*Narrative generation system — template engine and LLM generation*

**Changelog v1.1 → v1.2**
- Fixed `validateNarrativeEntry`: it flagged every entry over 400 words "except
  for annual/legacy entries," but never actually exempted them — so annual
  reflections (voice rule 7: 4–6 paragraphs) and the legacy obituary ("as long as
  the life requires") would be rejected. The function now takes the generating
  `triggerId` and skips the cap for the long-form triggers
  (`ANNUAL_REFLECTION`, `DECADE_MILESTONE`, `DEATH_AND_LEGACY`).
- Model: switched narrative generation from `claude-sonnet-4-6` to
  `claude-opus-4-8` for higher prose quality. Sonnet was never required — it was
  a cost/latency pick by the original author, not an API constraint. The existing
  prompt-cache marker and idle-time prefetch (which can run through the Batches
  API at 50% off) blunt Opus's higher per-token cost.
- Made prompt caching real: the system prompt (the 10 voice rules, ~600 tokens)
  sat below the ~1024-token minimum cacheable prefix, so `cache_control` was a
  silent no-op. Appended a constant WORLD PRIMER (place, ten parishes, economy,
  seasons, goods glossary, calibration examples) to clear the threshold. It is
  fully static — no interpolation — so the prefix stays byte-identical and
  cacheable across every generation.
- Hardened `renderMagnitude`: it had no return for an unmatched `MagnitudeContext`
  (TypeScript `string | undefined`), so a future context would interpolate the
  literal "undefined" into player-facing prose. Added an exhaustive guard that
  throws instead.
- Documented that `context.player` is an enriched projection of `NPCAgent`
  (resolves the parish object, joins `name`/`familyBackground`/`formativeEvent`,
  derives `monthsInOccupation`) — those reads in `buildUserPrompt` looked like a
  schema mismatch otherwise. The backing fields are now declared on `NPCAgent`
  in the world-simulation doc.

**Changelog v1.0 → v1.1**
- Claude API: replaced the raw `fetch` (which had no `x-api-key` and no
  `anthropic-version` header) with the official `@anthropic-ai/sdk`. Added a
  shared `callClaude(system, user)` helper that marks the constant system prompt
  for **prompt caching** (`cache_control: ephemeral`); the decision and
  consequence generators now use it instead of the undefined `callAPI`, and pass
  the system prompt separately rather than embedding it in the user turn.
- Fixed validation false-positives: the currency rule rejected valid `EC$` amounts
  (now allows `EC$`, flags only bare `$`/USD/dollars); the voice-drift rule banned
  all third-person pronouns, which would reject the doc's own NPC-describing
  Sample Output (now flags first-person narration and "the player" only); the
  emotion rule no longer blocks sensory "you feel the heat".
- Wired the variety system (`getVoiceAgeModifier`, `SEASONAL_VOICE_NOTES`,
  `PARISH_VOICE_CONTEXT`) into the user prompt via a VOICE CALIBRATION block — it
  was defined but never injected.
- Schema alignment with the other docs: `player.economicCapital → player.cash`;
  asset rendering uses `Asset.type` (the schema has no `description` field).
- Reconciled "numbers are never shown" with voice rule 4 and the sample footer:
  raw magnitudes are qualitative, but EC$ currency amounts are shown.
