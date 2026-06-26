# Island Life — Player Experience Layer
## Design Document v1.1

---

## Overview

The player experience layer is the surface of the iceberg.
Everything beneath it — markets, behavioral agents, bank solvency,
legacy scores, personality drift — runs invisibly.

The player sees:
- A life being lived
- Information arriving imperfectly
- Decisions with unclear consequences
- A world that reacts to what they do

The player never sees:
- Their own stats
- NPC utility scores
- Probability percentages
- Market equations
- Legacy score totals

This document defines exactly what the player interface looks like,
how information reaches the player, what decisions feel like,
and what a month of play actually involves moment to moment.

---

## Core Design Principles

### 1. Show consequences, not mechanics

Every system communicates through story, not numbers.

```
WRONG (gamey):
"Fish prices have increased by 23% due to supply shock."

RIGHT (lived):
"You arrive at the Roseau market at 5am and find the stalls
thin. Three boats didn't go out this week — the sea was rough
and two engines are down. The buyers from Martinique are here
early, offering prices you haven't seen in months."
```

### 2. Information is always imperfect

The player never receives a clean data report.
Information arrives through channels that reflect their social position.

A fisher with strong local social capital hears things at the wharf
before they appear in any newspaper.
A person with low institutional connections never hears about
the government contract until it's been awarded.

### 3. Decisions have no labels

No decision is marked as GOOD, RISKY, or OPTIMAL.
The player reads a situation and makes a judgment.
Sometimes the right judgment fails anyway.
Sometimes the wrong judgment succeeds.

### 4. Time is the most important resource

The game's central tension is not money — it's time.
Months pass. Opportunities expire. Children grow up.
Skills atrophy if unused. Bodies age.
The player feels this.

### 5. The world does not pause

When the player is deciding, the world is not waiting.
A contract window closes. A price returns to normal.
A competitor moves first. Life does not pause
for anyone to make up their mind.

---

## Screen Architecture

The player interface has four persistent views and one contextual layer.

```
┌─────────────────────────────────────────────────────┐
│  YOUR LIFE                          Month 14 · 2024  │
│  Jean-Pierre Laville · Age 21 · Portsmouth           │
├─────────────────────────────────────────────────────┤
│                                                      │
│  [DAILY LIFE]  [COMMUNITY]  [MONEY]  [OPPORTUNITIES] │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │                                              │   │
│  │         Main content area                   │   │
│  │                                              │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  This month:  EC$1,840 earned · EC$1,620 spent│  │
│  │  In hand: EC$3,240        [ADVANCE TO NEXT MONTH]│
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

The four views are always accessible. The bottom bar is always visible.
Advancing to next month is the player's decision — they can spend
as long as they want in a month before advancing.
But the world does not stop. Opportunity windows tick down
even within a month, shown as narrative urgency, not a timer bar.

---

## View 1: Daily Life

The main narrative view. This is where the player reads what is
happening in their life and in the world around them.

### Structure

The Daily Life view presents a curated feed of narrative entries.
Not a newspaper. Not a dashboard. A life.

Each month generates between 3 and 8 narrative entries depending on
how much is happening in the simulation. Each entry is written in
second person, present tense, grounded in the player's specific
parish, occupation, and social position.

### Narrative entry types

```typescript
type NarrativeEntryType =
  | 'PERSONAL'          // something happening directly to the player
  | 'COMMUNITY'         // something heard through social network
  | 'OVERHEARD'         // partial information, source unclear
  | 'NEWS'              // newspaper or radio — available to all
  | 'OBSERVATION'       // player notices something in their environment
  | 'MEMORY'            // a consequence of a past decision surfaces
  | 'OPPORTUNITY'       // something actionable is available
  | 'DECISION_REQUIRED' // something that must be addressed this month
```

### Examples of narrative entries by information type

**PERSONAL — direct experience**
```
The catch this week was the best you have had in three months.
The sea was calm all the way to the north side of the island
and you came back with the boat sitting low. You sold out by
8am at the wharf — the buyers from Martinique were already there.
You have been thinking about whether it is time to approach
the cooperative about a second boat.
```

**COMMUNITY — heard through social network**
(Only visible if player has sufficient local social capital)
```
Your uncle mentions at the fish fry on Saturday that
Wilfred Joseph is looking to sell his truck.
Engine is good, he says. Wilfred just got a job at the
hotel and doesn't need it anymore. He's asking EC$18,000
but your uncle thinks there's room to negotiate.
```

**OVERHEARD — partial, possibly inaccurate**
```
You hear something at the market — someone saying the
government is planning road works on the Roseau-Portsmouth
road. You don't know who said it or whether it's true.
Construction contracts, if the work is real, would be
worth having.
```

**NEWS — available to everyone**
```
The Chronicle reports that Eastern Caribbean tourism
arrivals were up 14% in the first quarter compared to
last year. Dominica is mentioned as a growing destination
for eco-tourism. What this means for local prices
and opportunities is not stated.
```

**OBSERVATION — player notices through their domain knowledge**
(Only appears if player has sufficient knowledge in relevant domain.
A player with low fishing knowledge would not notice this.)
```
You notice the fuel dock at Portsmouth has been busy all week.
The boats going out are running longer routes than usual —
which either means the fish have moved, or the closer
grounds are getting thin. Either way, fuel costs are up
and the best catches are further out.
```

**MEMORY — delayed consequence**
```
The loan repayment you took out eight months ago to buy
the new engine comes out automatically this month.
EC$620. You knew it was coming. Knowing it was coming
does not make it easier when the cash is actually gone.
```

**OPPORTUNITY — actionable**
```
Eunice from the market has been buying your excess catch
for years. She finds you this week with a different kind
of conversation. She is expanding her stall to the Canefield
market and she wants a reliable supplier — not a one-off
sale but a standing arrangement. EC$3,200 a month, guaranteed,
for as much fish as you can deliver. The arrangement would
start next month. She needs an answer by the end of the week.
```

**DECISION_REQUIRED — must address**
```
The engine on the boat has been making a sound you don't like
for two months. This morning it cut out entirely halfway back
from the fishing grounds. Your cousin towed you in.
The mechanic says it needs a rebuild — EC$4,800 — or
a replacement engine at EC$9,500. He can have you back
in the water in four days either way.
Without the boat you are not working.
```

---

## View 2: Community

The player's social network, reputation, and relationships.

### What the player sees

A list of named relationships — family, friends, acquaintances,
professional contacts, rivals. Not a social graph diagram.
Named people with a sentence or two about who they are
and what the relationship currently is.

```
YOUR PEOPLE

─── Family ────────────────────────────────────────────

  Aunt Celestine                          Portsmouth
  Your mother's sister. She has a market stall in town
  and has been selling produce for thirty years.
  She trusts you. She has helped you before.
  [VISIT]

  Claude Laville (father)                 Portsmouth
  Retired fisherman. Knows the sea better than anyone
  you have met. His health has been poor this year.
  [VISIT]

─── Work ──────────────────────────────────────────────

  Eunice Charles                          Roseau market
  Produce buyer. Has offered you a supply contract.
  Awaiting your response.
  [RESPOND TO OFFER]

  Wilfred Joseph                          Portsmouth
  Owner of a truck that may be for sale.
  Heard about it through your uncle.
  [REACH OUT]

─── Community ─────────────────────────────────────────

  Pastor Magloire                         Portsmouth
  Respected in the community. Has known your family
  for decades. Has not asked anything of you yet.
  [VISIT]

─── Rivals ────────────────────────────────────────────

  Desmond Charles                         Portsmouth
  Another fisherman, younger than you.
  Works hard. Has been undercutting prices at the wharf.
  You don't know if it's deliberate or if he just needs
  the money.
```

### Reputation

Reputation is not a number. It is a set of sentences
generated from the player's history of actions.

```
YOUR REPUTATION IN PORTSMOUTH

People here know you as a reliable fisher who pays
what he owes. Your uncle speaks well of you.
One person — you don't know who — mentioned to someone
that you drove a hard bargain with a buyer last spring.
Whether that is said with respect or resentment
you cannot tell.
```

The player never sees a reputation score.
They see evidence of how they are perceived,
filtered through imperfect social information.

---

## View 3: Money

The player's financial picture. Deliberately simple on the surface.
The complexity is in the world, not the display.

```
YOUR FINANCES                               November 2024

Cash in hand          EC$ 3,240
─────────────────────────────────────────
Money coming in (this month)
  Fishing sales                    EC$ 1,840
  ─────────────────────────────────────────
  Total in                         EC$ 1,840

Money going out (this month)
  Food and household               EC$ 480
  Fuel for boat                    EC$ 620
  Loan repayment (engine - NCB)    EC$ 620
  ─────────────────────────────────────────
  Total out                        EC$ 1,720

This month                        +EC$ 120

─────────────────────────────────────────
Assets
  Fishing boat (2018 Yamaha)       Yours
  Engine (rebuilt, 8 months old)   Yours

Debts
  NCB engine loan                  EC$ 3,840 remaining
  (EC$ 620/month · 6 months left)
─────────────────────────────────────────
```

### What is deliberately hidden

- Net worth total (never shown — players must feel it, not read it)
- Interest rate on their loan (they agreed to it once, now they pay)
- Projected future cash flow
- Any form of financial forecast

The player must do their own mental accounting.
That is part of the game.

### What appears here contextually

If the player is close to defaulting on a loan,
the entry in Money does not say "WARNING: DEFAULT RISK."
It says:

```
  Loan repayment (NCB engine loan)   EC$ 620
  ⚠  You are short this month.
     The payment will not clear unless
     something changes before month end.
```

The player must decide what to do about it.

---

## View 4: Opportunities

A curated list of currently open opportunities.
Not everything available in the world — only what the player
has heard about through their specific information channels.

```
OPEN OPPORTUNITIES

─── Active ────────────────────────────────────────────

  Supply contract — Eunice Charles
  EC$3,200/month guaranteed fish supply.
  Requires: Consistent monthly volume.
  Heard: Directly from Eunice.
  Window: She needs an answer this month.
  [ACCEPT]  [DECLINE]  [NEGOTIATE]

  Truck purchase — Wilfred Joseph
  EC$18,000 asking price. May negotiate.
  Heard: Through your uncle.
  Condition: Unknown. You have not seen it yet.
  Window: Unknown — could sell any time.
  [REACH OUT TO WILFRED]

─── Possible ──────────────────────────────────────────

  Government road contract
  Heard: Overheard at the market. Unconfirmed.
  Details: Unknown. Could be nothing.
  Window: Unknown.
  [INVESTIGATE]

─── Expired ───────────────────────────────────────────

  Ice machine partnership (Raymond St. Jean)
  You did not respond in time.
  Raymond found another partner.
  This month: EC$0. What Raymond is making: unknown.
```

Expired opportunities remain visible.
The player should feel what inaction costs.
Not through a penalty notification —
through watching something they had a chance at
become something someone else is doing.

---

## The Decision Interface

When the player takes an action — responds to an opportunity,
makes a financial decision, has a conversation — the interface
presents the decision as a narrative moment, not a form.

### Example: Responding to Eunice's supply contract

```
EUNICE'S OFFER

Eunice Charles wants to buy from you exclusively
for the Canefield market expansion.

EC$3,200 a month, guaranteed, for as much fish
as you can reliably supply. She has a stall already
arranged and buyers lined up.

The arrangement would lock you in as her supplier.
She would not go elsewhere while you are delivering.
You would not be free to sell to the highest bidder
each week — you would have a commitment to meet.

She is a fair person. You have dealt with her for
three years. You believe she would honour the terms.

What do you tell her?

[ACCEPT THE OFFER]
[DECLINE FOR NOW]
[ASK FOR TIME TO THINK]
[TRY TO NEGOTIATE TERMS]
```

No probability estimates.
No expected value calculation.
No risk rating.

The player must think.

### Negotiation sub-interface

If the player tries to negotiate:

```
YOU TELL EUNICE YOU WANT TO TALK TERMS.

She listens. She is businesslike but not cold.
She tells you the price is fair — she has priced it
to keep you interested while protecting her margins.

What do you push for?

[A HIGHER MONTHLY RATE]
[THE RIGHT TO SELL EXCESS CATCH ELSEWHERE]
[A SHORTER INITIAL COMMITMENT PERIOD]
[PAYMENT WEEKLY INSTEAD OF MONTHLY]
```

Each choice has hidden mechanical effects on the outcome.
Her response is generated from her NPC personality profile —
she has a conscientiousness score, an agreeableness score,
a business situation with its own pressures.
The player does not know any of this.
They read her response and calibrate.

```
Eunice thinks for a moment.

She says she cannot go higher on the monthly rate —
she has her own margins to protect — but she is willing
to let you sell anything above 400 lbs a week elsewhere.
She says she does not need exclusivity on your surplus,
only on your reliable supply.

She can give you a three-month trial period
if you want to see how the arrangement works before
committing to a full year.

What do you say?
```

---

## The Monthly Advance

When the player clicks ADVANCE TO NEXT MONTH,
a brief transition plays. Not a loading screen.
A moment.

```
November passes.

The sea is getting rougher as the year ends.
You made EC$120 more than you spent.
The engine loan has six months left.

Eunice's stall opened at Canefield.
You are her supplier now.

December begins.
```

Then the Daily Life feed populates with December's entries.

---

## How Consequences Surface

This is the most important design problem in the game.
The player must be able to trace consequences back to decisions —
but not immediately, and not with a label.

### The Memory entry type

Consequences that arrive months or years after a decision
surface as Memory entries in the Daily Life feed.

```
Three years ago you turned down Raymond St. Jean's offer
to go into the ice machine business together. You did not
have the money and the risk felt too large.

Raymond's operation now services twelve fishing boats
in Portsmouth. He has two machines and a small shed
near the wharf. You buy ice from him every week.

You do not regret the decision. You made it with what
you knew then. You notice it, though.
```

No judgment. No "you made the wrong choice" notification.
The player sees the alternative path that didn't happen
and draws their own conclusions.

### The Observation entry type

For consequences that are environmental rather than personal:

```
Walking through the market you notice something.
Produce prices are higher than they were six months ago.
Your food bill has been creeping up for three months
and you had not noticed until now.

You don't know why. It could be the dry spell.
It could be something else entirely.
```

The player has to decide whether to investigate —
or just absorb the higher cost and keep moving.

### The Recognition moment

Occasionally — rarely — the game gives the player
a moment of explicit recognition that something they did
produced something visible.

```
You hear that the Canefield market is doing well.
Eunice's stall is one of the busiest.
Someone mentions your name in connection with
the quality of the fish she sells.

You are not famous. But in a small place,
being known for something reliable is not nothing.
```

These moments are not rewards. They are information.
The player's reputation is building or eroding
in ways they experience indirectly.

---

## Aging and the Passage of Time

The player ages. The game makes this felt.

### Annual summary

At the end of each in-game year, the player receives
a single narrative entry — longer than usual —
that reflects on the year as a whole.

Not a statistics report. A reflection.

```
YEAR FOUR — 2027

You are twenty-four years old.

The boat is paid off. You did that.
The catch has been decent, the sea mostly cooperating,
though the storm in September took two weeks from you
and cost more in repairs than you had set aside.

Aunt Celestine's health has not been good this year.
You have been to visit her more than usual.
She asks about your plans the way older people do —
with the patience of someone who has watched plans
change many times.

Eunice's supply arrangement has been solid.
You have been her main supplier for almost three years.
She has not raised the monthly rate. You have not asked.
You have been thinking about whether to ask.

Four years in Portsmouth.
You wonder, sometimes, what you would be doing in Barbados.

```

No statistics. No net worth comparison.
Just time, felt.

### Physical aging effects (after age 40)

Communicated through narrative:

```
The early mornings are harder than they used to be.
You notice it most on the long days — out before dawn,
back in the afternoon, boat to clean, gear to check.
You did all of this at twenty without thinking about it.
You still do it. You just think about it now.
```

Mechanical effects — slightly lower output in physical industries,
slightly higher susceptibility to illness events — are never stated.
The player feels them in their earnings and in their narrative.

---

## Information Channels by Social Position

The player's starting profile determines which information channels
they have access to and how early they receive signals.

```typescript
interface InformationChannel {
  id: string;
  name: string;
  requiredSocialCapital: {
    local?: number;
    institutional?: number;
    diaspora?: number;
  };
  requiredKnowledge?: {
    domain: string;
    minimum: number;
  };
  leadTimeAdvantage: number;   // weeks before general population knows
  accuracy: number;            // 0–1, how reliable is this channel
  narrativeVoice: string;      // who is delivering this information
}

const INFORMATION_CHANNELS: InformationChannel[] = [
  {
    id: 'WHARF_TALK',
    name: 'Wharf and fishing community',
    requiredSocialCapital: { local: 0.40 },
    requiredKnowledge: { domain: 'fishing', minimum: 0.20 },
    leadTimeAdvantage: 3,       // weeks before newspaper
    accuracy: 0.75,
    narrativeVoice: 'A fisherman you know mentions...',
  },
  {
    id: 'MARKET_NETWORK',
    name: 'Market vendors and buyers',
    requiredSocialCapital: { local: 0.30 },
    leadTimeAdvantage: 2,
    accuracy: 0.70,
    narrativeVoice: 'Someone at the market tells you...',
  },
  {
    id: 'CHURCH_NETWORK',
    name: 'Church and community leaders',
    requiredSocialCapital: { local: 0.50 },
    leadTimeAdvantage: 1,
    accuracy: 0.80,
    narrativeVoice: 'After service, the pastor mentions...',
  },
  {
    id: 'BANK_INSIDER',
    name: 'Banking and formal sector contacts',
    requiredSocialCapital: { institutional: 0.60 },
    leadTimeAdvantage: 4,
    accuracy: 0.90,
    narrativeVoice: 'A contact at the bank tells you quietly...',
  },
  {
    id: 'GOVERNMENT_CONTACTS',
    name: 'Government and civil service network',
    requiredSocialCapital: { institutional: 0.55 },
    leadTimeAdvantage: 5,
    accuracy: 0.85,
    narrativeVoice: 'Someone in the ministry says...',
  },
  {
    id: 'DIASPORA_NETWORK',
    name: 'Overseas family and contacts',
    requiredSocialCapital: { diaspora: 0.30 },
    leadTimeAdvantage: 0,       // no lead time for local info
    accuracy: 0.65,             // filtered through distance
    narrativeVoice: 'Your cousin calls from London...',
  },
  {
    id: 'NEWSPAPER',
    name: 'The Chronicle / local radio',
    requiredSocialCapital: {},  // available to all
    leadTimeAdvantage: 0,
    accuracy: 0.85,
    narrativeVoice: 'The Chronicle reports...',
  },
  {
    id: 'RUMOUR',
    name: 'General community rumour',
    requiredSocialCapital: {},  // available to all
    leadTimeAdvantage: -1,      // actually lags behind other channels
    accuracy: 0.45,             // often inaccurate
    narrativeVoice: 'You hear people talking about...',
  },
];
```

---

## The Knowledge Advantage in Play

When the player has domain knowledge, the game surfaces
information that other players — or NPCs — cannot see.

This is never announced. It simply appears in their feed.

### Example: Player with high fishing knowledge

```
OBSERVATION (visible only to player with fishing knowledge > 0.50)

The pattern of boats going out this week tells you something.
The boats that came back heaviest were all running north-northeast —
further than usual. The fish have moved. If you run the same
routes you ran last month you will come back light.

Nobody told you this. You noticed it.
```

### Example: Player with high agricultural knowledge

```
OBSERVATION (visible only to player with agriculture knowledge > 0.45)

The dasheen at the market is coming in undersized this week.
That is a dry season problem — the soil in the interior
has not had rain since October. If the pattern holds
through December, provisions will be expensive by January.

You are two months ahead of this.
What you do with that information is your choice.
```

### Example: Player with financial knowledge

```
OBSERVATION (visible only to player with finance knowledge > 0.40)

You look at the terms of the loan Wilfred is offering
to pass on to the buyer of his truck — an arrangement
with the credit union he says he can transfer.

The rate is 11.5%. For a used vehicle with uncertain
maintenance history, being sold informally, that is
above what a direct credit union application would give you.
Wilfred either does not know this or is hoping you don't.
```

---

## Migration

Migration is a real option. Not a game-over condition.
Not a failure. A genuine economic decision that real
Caribbean people face.

When the player's diaspora social capital is sufficient,
or their openness trait is high enough, or conditions
on the island deteriorate significantly, migration
surfaces as an opportunity.

```
OPPORTUNITY

Your cousin in Barbados — the one who has been there
for six years — calls to tell you there is a position
at the fish processing plant in Bridgetown.
EC$2,800 a month equivalent. Steady work. Legal.

He has already spoken to the supervisor.
They want someone reliable who knows fish.
You would need to be there within three weeks.

Leaving means leaving everything here —
the boat, the arrangement with Eunice,
Aunt Celestine's health, the relationships
you have built in Portsmouth over four years.

Going means something different and possibly better.
Or possibly worse. Barbados is larger and more expensive
and you would start there with nothing but your cousin
and whatever skills you carry.

What do you do?

[GO TO BARBADOS]
[STAY IN DOMINICA]
[ASK FOR MORE TIME]
[CALL YOUR COUSIN BACK WITH QUESTIONS]
```

If the player migrates, the game continues —
now set in Barbados, with different market conditions,
different social networks to build, different
institutions, different opportunities and constraints.

The Dominican simulation continues running.
The player's relationships there age in their absence.
Eunice finds another supplier.
Aunt Celestine's health continues declining.
Occasionally, a message arrives.

```
A message from Portsmouth.

Your uncle says the wharf has been quiet this year.
Fuel prices went up again and three of the smaller
boats have stopped going out regularly.
Desmond Charles — the one who used to undercut you
on prices — has apparently done well for himself.
He bought a second boat.

Aunt Celestine says to tell you she is fine.
She always says she is fine.
```

---

## Death and the Legacy Reveal

The player's character eventually dies.
This is not a failure state.
It is the end of the game and the moment the player
discovers what their life meant in the simulation.

### Death trigger

Natural aging combined with health events.
A character in poor health (high physical labour,
inadequate nutrition in earlier years, no healthcare
access) may die in their 50s.
A character who made different choices may reach 75.
The player does not know when this will happen.

### The final month

```
DECEMBER 2061

You are fifty-eight years old.

The doctor in Roseau has been direct with you
for the past year about what is happening.
You have been direct with yourself.

You have made arrangements.
The boat — the third one, the good one —
goes to your son Marcus. He knows the sea.
The house is paid for.

You are tired in a way that sleep does not fix.
But you are at home, in Portsmouth,
and that is where you wanted to be.

[SPEND YOUR LAST MONTHS]
```

A final set of narrative entries — visits from family,
a conversation with an old friend, a view of the harbour,
a memory of a decision made forty years ago —
and then:

### The legacy reveal

Not a scorecard. A life, described.

```
─────────────────────────────────────────────────────
JEAN-PIERRE LAVILLE
Born: Portsmouth, Dominica · 2003
Died: Portsmouth, Dominica · 2062
Age: 59
─────────────────────────────────────────────────────

He was a fisherman.

He fished the Atlantic coast from Portsmouth for
thirty-one years, becoming one of the most reliable
suppliers in the cooperative. At his peak he ran
three boats and employed four men from the village.

He never left Dominica, though he came close
more than once. He stayed for reasons he did not
always explain clearly, even to himself.

His son Marcus fishes the same waters today.
His daughter Céleste became a nurse and works at
the Princess Margaret Hospital in Roseau.
She bought her own apartment last year.

Eunice Charles, who was his buyer for twenty years,
spoke at his funeral. She said he was the most
reliable person she did business with in forty
years of trading.

He carried a loan for most of his working life —
the boat, then the second boat, then the house.
He paid every one of them.

He was known in Portsmouth as someone you could trust.
That is not the smallest thing a person can leave behind.

─────────────────────────────────────────────────────

WHAT HE LEFT

  Wealth created              EC$240,000 net
  Businesses built            2 (fishing operations)
  People employed             4 (at peak)
  Children                    2
  Their outcomes              Good
  Community standing          High
  Environmental impact        Neutral
  Institutions affected       None

  The world he found          Hard
  The world he left           Slightly better, in one corner of it

─────────────────────────────────────────────────────

  Play again?      [YES — NEW LIFE]
  Different start? [YES — CHANGE BEGINNING]
─────────────────────────────────────────────────────
```

No score out of 100.
No comparison to other players.
No "you could have done better if..."

A life, evaluated on its own terms.

---

## Difficulty and Accessibility

The game has no difficulty settings in the traditional sense.

What varies between playthroughs is circumstance, not game rules.

A player born into a fishing family in Portsmouth in a hurricane year
with low social capital and a formative event of exploitation
is playing a harder game than a player born into a civil servant
household in Roseau with strong institutional connections.

Both are playing the same game.
The rules are the same.
The circumstances are not.

That is the point.

---

## What the Game Teaches Without Teaching

A player who finishes one full playthrough will have experienced:

- That information asymmetry is not a textbook concept —
  it is the difference between knowing the fish have moved
  and arriving at the same grounds as everyone else.

- That institutional access shapes outcomes before merit
  has a chance to express itself.

- That a correct decision can still fail because
  of factors outside your control.

- That small decisions compound — the loan taken at 22
  affects cash flow at 30 affects investment capacity at 35.

- That social capital is a form of wealth that
  banks cannot see and that government policy ignores.

- That leaving and staying are both legitimate economic strategies
  with genuine costs and genuine benefits,
  and that neither is obviously correct.

- That legacy is not the same as wealth,
  and that the two are often in tension.

None of these things are stated.
All of them are felt.

---

## References

- Kahneman, D. (2011). Thinking, Fast and Slow.
  — The dual-process model informs how players are
    given time to think vs. pressured by urgency.

- Gladwell, M. (2008). Outliers.
  — The role of circumstance in outcome,
    used as a design principle for starting conditions.

- Duflo, E. (2012). Human values and the design of
  the fight against poverty. Tanner Lectures.
  — The principle that poor people make rational decisions
    given their constraints, used throughout NPC design
    and in how the game presents economic hardship.

- Thaler, R. & Sunstein, C. (2008). Nudge.
  — Information architecture principles: how choices
    are presented shapes decisions without removing agency.

- Sen, A. (1999). Development as Freedom.
  — The capability approach: what matters is not just
    income but what people are able to do and become.
    Used in the legacy scoring philosophy.

- Bourdieu, P. (1984). Distinction.
  — Cultural capital as the invisible filter
    on institutional access. Used throughout.

---

*Document version 1.1 — Island Life game design*
*Player experience layer — interface, information delivery, monthly loop*

**Changelog v1.0 → v1.1**
- Fixed an age contradiction in the death sequence: the final-month vignette said
  "You are sixty-seven years old" in December 2061, but the obituary card states
  Born 2003 / Died 2062 / Age 59 (and the other docs date birth to 2003). In
  December 2061 the character is 58 — corrected the vignette to "fifty-eight."
