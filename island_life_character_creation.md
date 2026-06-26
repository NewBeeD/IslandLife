# Island Life — Character Creation System
## Design Document v1.3

---

## Overview

Character creation consists of five narrative forks. The player sees only story.
Beneath each choice, a hidden character profile is being constructed from
scientifically grounded psychological and sociological models.

**Scientific foundations:**
- Big Five personality model (OCEAN) — McCrae & Costa (1987)
- Non-cognitive skills framework — Heckman & Mosso (2014)
- Capital theory — Bourdieu (1986): economic, social, cultural capital
- Equality of opportunity — Roemer (1998)
- Poor economics / rational poverty decisions — Banerjee & Duflo (2011)

The player never sees the hidden profile. They discover who they are through play.

---

## Hidden Character Profile Schema

Generated at the end of character creation. All values are floats 0.0–1.0
unless otherwise stated.

```typescript
interface CharacterProfile {
  // Big Five (OCEAN)
  openness: number;           // curiosity, new ideas, unconventional thinking
  conscientiousness: number;  // self-discipline, reliability, long-term planning
  extraversion: number;       // sociability, assertiveness, network building
  agreeableness: number;      // cooperation, trust, community orientation
  neuroticism: number;        // anxiety, loss aversion, stress response

  // Heckman non-cognitive
  cognitiveAbility: number;   // learning speed, pattern recognition
  resilience: number;         // recovery speed after shocks
  selfControl: number;        // impulse vs. delayed gratification
  knowledgeAcquisitionRate: number; // global multiplier on in-game learning speed

  // Bourdieu economic capital — split into liquid and total
  cash: number;               // liquid EC$ on hand (actual value, not 0–1)
  economicAssets: Asset[];    // land, equipment, vehicle
  netWorth: number;           // derived: cash + Σ economicAssets.value − debt
                              //   (no debt at character creation, so = cash + assets)
  socialCapitalLocal: number; // community trust, informal network
  socialCapitalInstitutional: number; // bank, government, formal sector
  socialCapitalDiaspora: number;      // overseas network access
  culturalCapital: number;    // education credentials, institutional fluency

  // Starting knowledge domains (0.0–1.0 each)
  knowledge: {
    fishing: number;
    agriculture: number;
    construction: number;
    informalTrade: number;
    retail: number;
    tourism: number;
    transportation: number;
    finance: number;
    generalLiteracy: number;
  };

  // Starting experience domains (separate from knowledge)
  experience: {
    fishing: number;
    agriculture: number;
    construction: number;
    informalTrade: number;
    retail: number;
    tourism: number;
    transportation: number;
    finance: number;
  };

  // Circumstance markers (Roemer — never the player's fault)
  birthParish: Parish;
  familyBackground: FamilyBackground;
  formativeEvent: FormativeEvent;

  // Education outcome (Fork 2)
  educationScore: number;     // 0.0–1.0 summary of schooling
  unlockedPaths: CareerPath[]; // formal tracks opened by credentials

  // Personality tendency (Fork 4)
  personalityTendency: PersonalityTendency;

  // Derived behavioral tendencies (computed from OCEAN + capital)
  riskTolerance: number;      // derived: openness * 0.4 + (1 - neuroticism) * 0.6
  lossAversion: number;       // derived: neuroticism * 0.7 + (1 - openness) * 0.3
  patience: number;           // derived: conscientiousness * 0.6 + (1-neuroticism)*0.4
  institutionalTrust: number; // derived: agreeableness * 0.5 + culturalCapital * 0.5
  entrepreneurialDrive: number; // derived + fork modifiers (self-employment pull)

  // World-seeded entities & starting situation (Forks 3D / 5)
  mentorContact: MentorContact | null;
  situationAtStart: StartingSituation;
  startingJob: StartingJob | null;
  startingIncome: StartingIncome | null;
  startingOpportunity: StartingOpportunity | null;

  // Awareness flags — qualitative; surface relevant information earlier,
  // never shown to the player as a stat
  flags: AwarenessFlags;
}
```

### Supporting types

```typescript
type Tri = "LOW" | "MEDIUM" | "HIGH";

interface KnowledgeDomains {
  fishing: number; agriculture: number; construction: number;
  informalTrade: number; retail: number; tourism: number;
  transportation: number; finance: number; generalLiteracy: number;
}
// experience mirrors knowledge minus generalLiteracy
type ExperienceDomains = Omit<KnowledgeDomains, "generalLiteracy">;

interface Asset {
  type: "LAND" | "EQUIPMENT" | "VEHICLE";
  size?: "SMALL" | "MEDIUM" | "LARGE";
  value: number;  // EC$
}

enum FamilyBackground {
  FISHING_PORTSMOUTH, FARMING_INTERIOR, CIVIL_SERVANT_ROSEAU, TRADING_ROSEAU
}
enum FormativeEvent { HURRICANE, DIASPORA_REMITTANCE, EXPLOITATION, MENTOR }
enum PersonalityTendency { DELIBERATE, INSTINCTIVE, SOCIAL, ANALYTICAL }
enum StartingSituation {
  EMPLOYED, SELF_EMPLOYED, RETURNED_FROM_ABROAD, OPPORTUNITY_PENDING
}
enum CareerPath { CIVIL_SERVICE, UNIVERSITY_TRACK, PROFESSIONAL_SERVICES }

// Parish — the ten parishes of Dominica
enum Parish {
  SAINT_GEORGE, SAINT_JOHN, SAINT_ANDREW, SAINT_DAVID, SAINT_PATRICK,
  SAINT_LUKE, SAINT_MARK, SAINT_PAUL, SAINT_JOSEPH, SAINT_PETER
}

interface MentorContact {
  type: "BUSINESS_OWNER" | "TEACHER" | "COMMUNITY_ELDER" | "PROFESSIONAL";
  domain: keyof KnowledgeDomains;   // aligned with family background
  trustLevel: Tri;
  accessibleFrom: "DAY_ONE";
}

interface StartingJob {
  type: "CIVIL_SERVICE_JUNIOR" | "HOTEL_STAFF" | "COOPERATIVE_WORKER";
  monthlySalary: number;            // EC$
  stability: Tri;
  growthCeiling: Tri;
  socialExposure: Tri;
}

interface StartingIncome {
  type: "SELF_EMPLOYED";
  baseMonthlyRevenue: number;       // EC$, volatile
  volatility: Tri;
  industry: keyof ExperienceDomains;
  growthCeiling: "UNLIMITED" | Tri;
}

interface StartingOpportunity {
  type: "EQUIPMENT_PURCHASE_BELOW_MARKET" | "SMALL_SUPPLY_CONTRACT"
      | "MARKET_GAP_IN_FAMILY_INDUSTRY" | "INFORMAL_PARTNERSHIP_OFFER";
  timeWindow: number;               // days before it disappears
  requiredCapital: number;          // EC$
  expectedReturn: number;           // multiplier — not shown to player
  riskLevel: "LOW" | "MEDIUM" | "MEDIUM_HIGH" | "HIGH";
}

// Optional qualitative markers set by individual forks
interface AwarenessFlags {
  climateRiskAwareness?: Tri;             // Fork 3A
  diasporaNetworkAccess?: "NONE" | "PARTIAL" | "FULL"; // Fork 3B
  migrationOptionEarly?: boolean;         // Fork 3B
  exploitationDetection?: Tri;            // Fork 3C
  migrationOptionFamiliarity?: Tri;       // Fork 5C
  comparativeAdvantageAwareness?: "BASELINE" | "ELEVATED"; // Fork 5C
  patternRecognition?: Tri;               // Fork 4D
  analyticalEdge?: Tri;                   // Fork 4D
}
```

> **Note on field conventions.** `knowledge`/`experience`/`capital` modifiers shown
> in the forks accumulate (see *Character Profile Generation Logic*). Behavioral
> *modifiers* (e.g. `lossAversionModifier`, `riskToleranceModifier`) are applied to
> the derived values in Step 4; qualitative *flags* (e.g. `climateRiskAwareness: HIGH`)
> are written to `flags`. `personalityTendency`, `situationAtStart`, `mentorContact`
> and the three `starting*` objects are set directly by the relevant fork.

---

## Fork 1 — Family Background

### Narrative prompt shown to player

> You are 20 years old and your life is ahead of you.
> Before we begin, tell us where you come from.
>
> **Your family is Dominican. Which of these best describes how you grew up?**

---

### Option A — Fishing family, Portsmouth

> Your father has fished the Atlantic since before you were born.
> Your mother sells at the market on Bay Street most mornings.
> Money was never plentiful but there was always fish on the table
> and people in the yard. Portsmouth knows your family and your
> family knows Portsmouth.

**Hidden mechanical effects:**

```
cash: 2000  (EC$)
economicAssets: []
// netWorth (derived): 2000
birthParish: SAINT_JOHN

// Big Five adjustments (additive to base roll)
extraversion:        +0.15   // tight community upbringing
agreeableness:       +0.10   // cooperative fishing culture
conscientiousness:   +0.10   // early morning work ethic
openness:            +0.05   // sea exposes you to other islands, traders
neuroticism:         +0.10   // weather and income unpredictability

// Heckman
resilience:          +0.15   // physical and economic hardship normalized
selfControl:          0.00   // neutral

// Bourdieu
socialCapitalLocal:        +0.30  // deep community roots
socialCapitalInstitutional: -0.10 // limited formal sector exposure
socialCapitalDiaspora:      +0.05 // some family abroad
culturalCapital:            -0.05 // limited credential exposure

// Knowledge
knowledge.fishing:       0.40
knowledge.informalTrade: 0.20
experience.fishing:      0.25

familyBackground: FISHING_PORTSMOUTH
```

---

### Option B — Farming family, interior village

> Your family works land that has been in the family for two generations.
> Dasheen, bananas, a few provisions. The land gives and the land takes.
> Village life is slow and close. Everyone knows when the harvest is bad.
> You have never been far from soil.

**Hidden mechanical effects:**

```
cash: 1500  (EC$)
economicAssets: [{ type: LAND, size: SMALL, value: 18000 }]
// netWorth (derived): 19500 — asset-rich, cash-poor
birthParish: SAINT_ANDREW  // or SAINT_DAVID — randomised

// Big Five
extraversion:        -0.05   // quieter village life
agreeableness:       +0.15   // cooperative agricultural community
conscientiousness:   +0.20   // farming demands consistency
openness:            -0.05   // less exposure to outside
neuroticism:         +0.15   // weather dependency, harvest anxiety

// Heckman
resilience:          +0.20   // farming failure is survivable, taught early
selfControl:         +0.10   // seasonal patience required

// Bourdieu
socialCapitalLocal:        +0.25
socialCapitalInstitutional: -0.15
socialCapitalDiaspora:      +0.00
culturalCapital:            -0.10

// Knowledge
knowledge.agriculture:   0.50
knowledge.informalTrade: 0.10
experience.agriculture:  0.30

familyBackground: FARMING_INTERIOR
```

---

### Option C — Civil servant household, Roseau

> One of your parents works for the government.
> Not wealthy — nobody in the civil service gets wealthy —
> but steady. The bills were paid. There were books in the house.
> Your parents spoke about pensions and security the way
> other families spoke about the harvest.

**Hidden mechanical effects:**

```
cash: 3500  (EC$)
economicAssets: []
// netWorth (derived): 3500
birthParish: SAINT_GEORGE

// Big Five
extraversion:        +0.05
agreeableness:       +0.10
conscientiousness:   +0.15   // institutional values transmitted
openness:            +0.10   // books, school emphasis
neuroticism:         -0.10   // stable household reduces baseline anxiety

// Heckman
resilience:          -0.05   // less exposure to real hardship
selfControl:         +0.15   // structured upbringing

// Bourdieu
socialCapitalLocal:        +0.10
socialCapitalInstitutional: +0.30  // parents moved in formal circles
socialCapitalDiaspora:      +0.05
culturalCapital:            +0.25  // credential culture in the home

// Knowledge
knowledge.generalLiteracy: 0.50
knowledge.finance:          0.15
experience: {}  // minimal practical experience

familyBackground: CIVIL_SERVANT_ROSEAU
```

---

### Option D — Trading family, Roseau market

> Your parents bought and sold things.
> Sometimes it was produce from the villages.
> Sometimes goods from Martinique or St. Lucia.
> You grew up understanding that price is not fixed,
> that timing matters, and that the person who knows
> what something is worth before the seller does
> has an advantage.

**Hidden mechanical effects:**

```
cash: 4000  (EC$)
economicAssets: []
// netWorth (derived): 4000
birthParish: SAINT_GEORGE

// Big Five
extraversion:        +0.20   // trading requires constant people contact
agreeableness:       +0.05   // friendly but transactional
conscientiousness:   +0.10
openness:            +0.20   // exposure to goods, islands, cultures
neuroticism:         +0.05   // market volatility normalized

// Heckman
resilience:          +0.10
selfControl:         -0.05   // money came and went, less saving culture

// Bourdieu
socialCapitalLocal:        +0.20
socialCapitalInstitutional: +0.10
socialCapitalDiaspora:      +0.15  // trading relationships across islands
culturalCapital:            +0.05

// Knowledge
knowledge.informalTrade: 0.45
knowledge.retail:        0.30
experience.informalTrade: 0.25
experience.retail:        0.15

familyBackground: TRADING_ROSEAU
```

---

## Fork 2 — School Years

### Narrative prompt shown to player

> Secondary school is behind you now.
> **How did it go?**

---

### Option A — You excelled academically

> Five CXCs. Mathematics, English, two sciences and one elective.
> Your teachers said you had potential. A few of them still ask
> about you when they see your mother.
> You had choices that some of your classmates didn't.

**Hidden mechanical effects:**

```
// Heckman
cognitiveAbility:    +0.25
selfControl:         +0.15

// Bourdieu
culturalCapital:     +0.30

// Knowledge
knowledge.generalLiteracy: +0.30
knowledge.finance:          +0.10  // mathematics carries over

// Unlocks
unlockedPaths: [CIVIL_SERVICE, UNIVERSITY_TRACK, PROFESSIONAL_SERVICES]

// Big Five
conscientiousness:   +0.10
openness:            +0.10
neuroticism:         -0.05   // academic success reduces baseline anxiety

educationScore: 0.75
```

---

### Option B — Average but hardworking

> Three CXCs. English and Mathematics among them.
> You passed what mattered and you worked for it.
> Nobody handed you anything. No paths closed,
> none fully opened. You are exactly where most people are:
> somewhere in the middle, with everything still to play for.

**Hidden mechanical effects:**

```
// Heckman
cognitiveAbility:    +0.10
selfControl:         +0.10

// Bourdieu
culturalCapital:     +0.10

// Knowledge
knowledge.generalLiteracy: +0.15

// Big Five — no significant adjustments
conscientiousness:   +0.05

educationScore: 0.45
```

---

### Option C — Left before completing CXC

> Your family needed income.
> You made a decision that wasn't really yours to make.
> You have thought about it since. Not with regret exactly —
> more with a clear eye for what it cost and what it gave you.
> You have been working for two years already.
> That is not nothing.

**Hidden mechanical effects:**

```
cash:                +2500   // two years of income

// Heckman
cognitiveAbility:    +0.00   // intelligence unaffected
selfControl:         +0.05
resilience:          +0.15   // early hardship

// Bourdieu
culturalCapital:     -0.20   // credential gap
socialCapitalLocal:  +0.10   // two years in the workforce = relationships

// Knowledge — add to family background domain
knowledge[familyIndustry]: +0.30
experience[familyIndustry]: +0.30

// Big Five
conscientiousness:   +0.05
neuroticism:         +0.10   // credential insecurity is real

educationScore: 0.20
unlockedPaths: []  // no formal paths, but none permanently closed
```

---

### Option D — Bright but disengaged

> You could have done better. Everyone knew it, including you.
> Two CXCs. The subjects bored you or the circumstances didn't allow
> full focus — it doesn't matter which now.
> What you have always had is a mind that notices things
> other people miss. That has its own value.

**Hidden mechanical effects:**

```
// Heckman
cognitiveAbility:    +0.20   // high natural ability
selfControl:         -0.10   // disengagement pattern established

// Bourdieu
culturalCapital:     +0.00   // credentials weak despite ability

// Hidden bonus — never shown to player
knowledgeAcquisitionRate: +0.20  // learns 20% faster in all domains

// Big Five
openness:            +0.20   // curiosity was always there
conscientiousness:   -0.10
neuroticism:         +0.05

educationScore: 0.35
```

---

## Fork 3 — Formative Event

### Narrative prompt shown to player

> Something happened before you turned 18 that you did not choose
> and could not prevent. It shaped you.
> **Which of these is closest to your experience?**

---

### Option A — A hurricane hit your family hard

> You were fourteen. You remember the sound more than anything.
> Afterwards, your family had almost nothing and rebuilt slowly.
> You watched your parents make decisions under conditions
> that would have broken many people.
> You learned something about what matters and what doesn't.

**Hidden mechanical effects:**

```
// Big Five
neuroticism:         +0.20   // trauma-informed risk perception
conscientiousness:   +0.10   // rebuilding required sustained effort
openness:            -0.05   // disruption can narrow focus

// Heckman
resilience:          +0.30   // most significant resilience builder
selfControl:         +0.10

// Behavioral
lossAversionModifier: +0.20  // seen real loss, averse to repeating it
climateRiskAwareness: HIGH   // surfaces relevant information earlier

formativeEvent: HURRICANE
```

---

### Option B — A family member migrated and sent money back

> Your aunt or uncle or older cousin left for England or Canada
> or the USVI when you were young. The money they sent back
> changed things at home. Not dramatically — but enough.
> You grew up understanding that the world is larger than this island
> and that people who leave sometimes make it possible
> for people who stay to survive.

**Hidden mechanical effects:**

```
// Big Five
openness:            +0.20   // exposure to outside world via family
extraversion:        +0.05

// Heckman
cognitiveAbility:    +0.05   // slightly better resourced schooling

// Bourdieu
socialCapitalDiaspora: +0.30  // direct family connection abroad
cash:                  +1000  // small remittance savings

// Unlocks
migrationOptionEarly: true   // migration surfaces as option within first 2 years
diasporaNetworkAccess: PARTIAL

formativeEvent: DIASPORA_REMITTANCE
```

---

### Option C — You worked for someone who cheated you

> You were sixteen. A job — informal, cash in hand.
> The person who hired you underpaid you, moved the goalposts,
> or took something that was yours.
> It was not the last time you would see this happen.
> But it was the first time it happened to you,
> and you have not forgotten the lesson.

**Hidden mechanical effects:**

```
// Big Five
agreeableness:       -0.20   // trust damaged by experience
neuroticism:         +0.10   // vigilance elevated
openness:            +0.05   // motivated to find better paths
conscientiousness:   +0.10   // self-reliance increased

// Heckman
resilience:          +0.10

// Behavioral
institutionalTrustModifier: -0.20  // formal employment distrust
entrepreneurialDrive:       +0.25  // strong preference for self-employment
exploitationDetection:      HIGH   // notices unfair contracts earlier

formativeEvent: EXPLOITATION
```

---

### Option D — A mentor took an interest in you

> Someone saw something in you before you saw it yourself.
> A teacher, a community elder, a business owner, a pastor.
> They gave you time and attention and a way of thinking
> about the future that your immediate circumstances
> didn't naturally produce.
> You still think about things they said.

**Hidden mechanical effects:**

```
// Big Five
openness:            +0.15
conscientiousness:   +0.10
extraversion:        +0.05

// Heckman
cognitiveAbility:    +0.10   // quality guidance accelerates development
selfControl:         +0.10

// Bourdieu — the mentor is a real contact in the game world
mentorContact: {
  type: randomFrom([BUSINESS_OWNER, TEACHER, COMMUNITY_ELDER, PROFESSIONAL]),
  domain: alignedWithFamilyBackground,
  trustLevel: HIGH,
  accessibleFrom: DAY_ONE
}

// One knowledge domain starts elevated
knowledge[mentorDomain]: 0.60  // mentor's domain, revealed through play

formativeEvent: MENTOR
```

---

## Fork 4 — Personality Tendency

### Narrative prompt shown to player

> This is not who you are entirely.
> People are more than one thing.
> But when you face uncertainty — a decision with no clear answer,
> a risk you can't fully calculate — **what is your tendency?**

---

### Option A — You think before you act

> You gather what information you can.
> You weigh options, consider consequences, move carefully.
> You have missed opportunities because you were still deciding.
> You have also avoided disasters that more impulsive people walked into.
> You are comfortable being the last person in the room to speak.

**Hidden mechanical effects:**

```
// Big Five
conscientiousness:   +0.20
neuroticism:         +0.10   // overthinking has a cost
openness:            -0.05
extraversion:        -0.10

// Behavioral
riskToleranceModifier:   -0.15
patienceModifier:        +0.25
decisionDelayTendency:   HIGH    // takes longer but makes fewer errors
opportunityMissRate:     +0.10   // occasionally too slow

personalityTendency: DELIBERATE
```

---

### Option B — You trust your instincts

> You decide quickly and commit fully.
> You have been wrong. You have also been right when
> more cautious people were still asking questions.
> Hesitation has never felt like safety to you —
> it has always felt like a different kind of risk.

**Hidden mechanical effects:**

```
// Big Five
openness:            +0.15
extraversion:        +0.15
conscientiousness:   -0.10
neuroticism:         -0.10   // low anxiety, high confidence

// Behavioral
riskToleranceModifier:   +0.25
patienceModifier:        -0.20
opportunityCapture:      HIGH    // first to see and act on opportunities
catastrophicFailureRate: +0.15   // also first to walk into disasters

personalityTendency: INSTINCTIVE
```

---

### Option C — You watch people

> You read rooms. You understand networks.
> You know who trusts whom, who owes whom,
> who is afraid of what.
> Pure financial logic has never been your primary mode.
> You think in relationships and you navigate by them.

**Hidden mechanical effects:**

```
// Big Five
extraversion:        +0.10
agreeableness:       +0.20
openness:            +0.10
conscientiousness:   +0.00

// Heckman — social intelligence is a real cognitive skill
cognitiveAbility:    +0.05   // social pattern recognition

// Bourdieu
socialCapitalLocal:        +0.15
socialCapitalInstitutional: +0.10

// Behavioral
reputationBuildRate:   +0.30   // builds trust faster
networkOpportunities:  +0.25   // more opportunities surface through people
marketAnalysis:        -0.10   // less naturally attuned to price signals

personalityTendency: SOCIAL
```

---

### Option D — You think in systems

> You notice patterns. Prices. Cause and effect chains.
> When something happens you find yourself asking why
> before you ask what to do about it.
> People sometimes think you are slow to react.
> You are not slow. You are making sure you understand
> what you are actually reacting to.

**Hidden mechanical effects:**

```
// Big Five
openness:            +0.25   // highest openness of all four options
conscientiousness:   +0.15
extraversion:        -0.15
agreeableness:       -0.05

// Heckman
cognitiveAbility:    +0.15   // systems thinking is a cognitive multiplier

// Behavioral
marketSignalClarity:   +0.30   // sees price patterns earlier
patternRecognition:    HIGH
socialNavigation:      -0.15   // relationships take longer to build
analyticalEdge:        HIGH    // economic decisions are higher quality

personalityTendency: ANALYTICAL
```

---

## Fork 5 — Your Situation Right Now

### Narrative prompt shown to player

> You are twenty years old.
> Character creation ends here. The rest is your life.
> **What is your immediate reality?**

---

### Option A — You have a job lined up

> A relative made a call. Or a teacher put in a word.
> Or you applied and you got it.
> It is not exciting — civil service, a hotel kitchen,
> a fishing cooperative's weighing station —
> but it is income from the first of the month.
> Stability is not nothing, especially at twenty.

**Hidden mechanical effects:**

```
// Starting employment
startingJob: {
  type: randomFrom([CIVIL_SERVICE_JUNIOR, HOTEL_STAFF, COOPERATIVE_WORKER]),
  monthlySalary: randomBetween(1400, 1800),  // EC$
  stability: HIGH,
  growthCeiling: LOW,
  socialExposure: MEDIUM
}

// No cash bonus — salary is the asset
// No immediate opportunity surfaced

// Big Five
conscientiousness:   +0.05   // employment requires showing up

situationAtStart: EMPLOYED
```

---

### Option B — You are self-employed from day one

> You are already doing something.
> Selling, fishing on a cousin's boat, farming the family land,
> running a small hustle at the market.
> There is no salary and no safety net.
> What you earn this month depends entirely
> on decisions you make this month.

**Hidden mechanical effects:**

```
// Starting income
startingIncome: {
  type: SELF_EMPLOYED,
  baseMonthlyRevenue: randomBetween(800, 1400),  // EC$, volatile
  volatility: HIGH,
  industry: alignedWithFamilyBackground,
  growthCeiling: UNLIMITED
}

// Knowledge boost — already operating
knowledge[familyIndustry]:    +0.10
experience[familyIndustry]:   +0.20

// Big Five
conscientiousness:    +0.05
openness:             +0.05

situationAtStart: SELF_EMPLOYED
```

---

### Option C — You just returned from Barbados

> Six months. You went to work, kept your head down, saved hard.
> You came back with money and with something harder to name —
> a sense of what is possible when the market is slightly larger,
> the infrastructure slightly better, the pace slightly faster.
> You are home now. The money is real. The question is what to do with it.

**Hidden mechanical effects:**

```
cash:                +8000   // EC$ savings from Barbados

// Knowledge and exposure
knowledge.informalTrade: +0.10
knowledge.tourism:       +0.05   // Barbados economy observation
experience[any]:         +0.05   // general work experience

// Bourdieu
socialCapitalDiaspora:   +0.10   // Barbados network started
culturalCapital:         +0.05   // wider world exposure

// Behavioral
migrationOptionFamiliarity: HIGH  // knows what leaving looks like
comparativeAdvantageAwareness: ELEVATED  // sees Dominica differently now

// No immediate income — player must decide what to do with capital
startingIncome: null

situationAtStart: RETURNED_FROM_ABROAD
```

---

### Option D — You are about to take a risk

> You have seen something. A gap in the market,
> a piece of equipment someone is selling cheap,
> a contract that nobody else has gone after.
> You have less cash than you might have —
> you spent some getting ready —
> but there is an opportunity in front of you right now
> that will not be there in three months.

**Hidden mechanical effects:**

```
cash:                -500    // spent preparing (applied to base from Fork 1)

// Immediate opportunity surfaced on Day 1 of game
startingOpportunity: {
  type: randomFrom([
    EQUIPMENT_PURCHASE_BELOW_MARKET,
    SMALL_SUPPLY_CONTRACT,
    MARKET_GAP_IN_FAMILY_INDUSTRY,
    INFORMAL_PARTNERSHIP_OFFER
  ]),
  timeWindow: 90,  // days before it disappears
  requiredCapital: randomBetween(1500, 3500),
  expectedReturn: randomBetween(1.4, 2.2),  // multiplier — not shown to player
  riskLevel: MEDIUM_HIGH
}

// Big Five
openness:            +0.10
conscientiousness:   -0.05   // acted before fully ready

situationAtStart: OPPORTUNITY_PENDING
```

---

## Character Profile Generation Logic

After all five forks are resolved, the game computes the final hidden profile.

### Step 1: Establish base distributions

Each Big Five trait starts from a population baseline for a young Dominican adult,
drawn from cross-cultural Big Five research (Schmitt et al., 2007 — 56 nation study).

```typescript
const BASE_OCEAN = {
  openness:          gaussianSample(mean: 0.52, sd: 0.12),
  conscientiousness: gaussianSample(mean: 0.55, sd: 0.12),
  extraversion:      gaussianSample(mean: 0.54, sd: 0.13),
  agreeableness:     gaussianSample(mean: 0.60, sd: 0.11),  // Caribbean baseline higher
  neuroticism:       gaussianSample(mean: 0.48, sd: 0.13),
};
```

The non-cognitive (Heckman) and capital (Bourdieu) traits also start from a
baseline — otherwise the fork modifiers would accumulate from zero, which is
not the intent. Capitals begin at a modest population midpoint; non-cognitive
traits begin near the centre of the range.

```typescript
const BASE_NONCOGNITIVE = {
  cognitiveAbility:         gaussianSample(mean: 0.50, sd: 0.13),
  resilience:              gaussianSample(mean: 0.50, sd: 0.12),
  selfControl:             gaussianSample(mean: 0.50, sd: 0.12),
  knowledgeAcquisitionRate: 0.0,   // offset; fork 2D adds +0.20
};

const BASE_CAPITAL = {
  socialCapitalLocal:         0.30,  // most young adults have some local network
  socialCapitalInstitutional: 0.20,
  socialCapitalDiaspora:      0.10,
  culturalCapital:            0.25,
};

// All knowledge/experience domains start at 0.0 and are written by the forks.
```

### Step 2: Apply fork adjustments

Sum all modifiers from Forks 1–5 onto the Step 1 bases. For the **OCEAN**,
**non-cognitive**, and **capital (0–1)** traits, clamp to [0.05, 0.95].
No trait should ever be absolute — humans are not fully anything.

```typescript
function applyModifiers(base: number, modifiers: number[]): number {
  const total = modifiers.reduce((sum, m) => sum + m, base);
  return Math.min(0.95, Math.max(0.05, total));
}
```

**Knowledge & experience domains** start at 0.0. Fork 1 establishes the family
baseline, and Forks 2–5 add to it; clamp each domain to [0.0, 1.0]:

```typescript
function accumulateDomain(modifiers: number[]): number {
  return Math.min(1.0, Math.max(0.0, modifiers.reduce((s, m) => s + m, 0)));
}
```

**Economic capital (EC$)** is split into liquid `cash` and a derived `netWorth`,
both real currency values, not 0–1. Fork 1 sets the starting `cash`; later forks
add or subtract; floor at 0. `netWorth` is then computed from cash plus assets
(no debt exists at character creation):

```typescript
cash = Math.max(0, cashForkValues.reduce((s, m) => s + m, 0));
netWorth = cash + economicAssets.reduce((s, a) => s + a.value, 0); // − debt (0 here)
```

The split matters downstream: two characters can hold identical `netWorth` but
behave very differently — the farming family (Fork 1B) is asset-rich and
cash-poor (EC$1,500 cash, EC$19,500 net worth), which constrains liquidity and
shapes how a bank later assesses them versus collateral.

Several forks reference `familyIndustry` / `[familyIndustry]`. This resolves
from `familyBackground`:

```typescript
const FAMILY_INDUSTRY: Record<FamilyBackground, keyof ExperienceDomains | null> = {
  FISHING_PORTSMOUTH:   "fishing",
  FARMING_INTERIOR:     "agriculture",
  TRADING_ROSEAU:       "informalTrade",
  CIVIL_SERVANT_ROSEAU: null,  // no inherited trade — see note
};
```

> **Edge case — civil servant household.** This background has no inherited
> industry. When a fork would write to `[familyIndustry]` and it resolves to
> `null` (Fork 2C dropout, Fork 5B self-employed), redirect the bonus to
> `generalLiteracy`/`finance` (knowledge) and `retail` (experience), reflecting
> a household oriented toward formal/clerical rather than trade skills.
>
> The same `null` resolution applies to **every** field aligned with family
> background, not just `[familyIndustry]`. For the civil-servant background:
> Fork 3D's `mentorContact.domain` (and the `knowledge[mentorDomain]: 0.60`
> write) and Fork 5B's `startingIncome.industry` both fall back to `finance` —
> a civil-servant mentor and a clerical hustle read as formal-sector. They must
> never resolve to `null`: `knowledge[null]` and `industry: null` are invalid
> (`industry` is typed `keyof ExperienceDomains`).

### Step 3: Derive behavioral tendencies

These are never set directly. They emerge from OCEAN values.

```typescript
const riskTolerance =
  (openness * 0.40) + ((1 - neuroticism) * 0.60);

const lossAversion =
  (neuroticism * 0.70) + ((1 - openness) * 0.30);

const patience =
  (conscientiousness * 0.60) + ((1 - neuroticism) * 0.40);

const institutionalTrust =
  (agreeableness * 0.50) + (culturalCapital * 0.50);
```

### Step 4: Apply fork-specific modifiers to derived values

Some forks add direct modifiers to behavioral tendencies
(e.g. formative event HURRICANE adds +0.20 to lossAversion via
`lossAversionModifier`). Apply these after the OCEAN-derived base is
computed, then clamp each derived value to [0.0, 1.0]:

```typescript
riskTolerance = clamp01(riskTolerance + riskToleranceModifierSum);
lossAversion  = clamp01(lossAversion  + lossAversionModifierSum);
patience      = clamp01(patience      + patienceModifierSum);
institutionalTrust = clamp01(institutionalTrust + institutionalTrustModifierSum);
```

`entrepreneurialDrive` has no OCEAN formula; it starts at a low base
(≈ `0.5 * riskTolerance`) and is then raised by the fork modifiers that
set it (Fork 3C EXPLOITATION `+0.25`), clamped to [0.0, 1.0].

### Step 5: Seed the game world

The character's birthParish, familyBackground, and formativeEvent
are passed to the world simulation engine to ensure:

- The correct market conditions exist in their starting parish
- Their family NPCs exist in the simulation as real agents
- Any mentor or diaspora contacts are seeded as real simulation entities
- The starting opportunity (if Fork 5D) is real — priced from actual
  market conditions, not scripted

---

## How the profile feeds the simulation

Character creation produces the *initial conditions* for the wider Island Life
simulation. The hidden profile maps onto the five things the simulation uses to
determine outcomes — there are no XP bars or skill points:

| Simulation pillar | Sourced from |
|---|---|
| **Knowledge** — what you know | `knowledge.*`, `culturalCapital`, `educationScore` |
| **Experience** — what you've done | `experience.*` |
| **Reputation** — what others think | seeded from `socialCapitalLocal` / `institutionalTrust`; grows in play |
| **Network** — who you know | `socialCapital*`, `mentorContact`, diaspora flags |
| **Resources** — what you can access | `cash`, `economicAssets`, `netWorth`, `startingJob`/`startingIncome` |

**Competence is not stored** — it emerges in play from `knowledge × experience`
within a domain, accelerated by `knowledgeAcquisitionRate`. A player with high
real-world domain knowledge can substitute for low starting `knowledge.*`; one
without it must learn through play or hire experts. The three paths — *already
know it / study it / pay for it* — are all viable.

**The iceberg holds.** Everything above is below the waterline. The player sees
only narrative, prices, opportunities, and outcomes — never the profile, never
the scores. Legacy (the eventual win condition) is likewise never displayed
during play. This document defines the hidden half of the iceberg for the
character-creation phase only.

---

## Narrative Principles

**No optimal path.** Every fork combination produces a character with genuine
strengths and genuine constraints. A fishing family dropout with high resilience
and a mentor contact is not worse than a civil servant's child with five CXCs.
They are different games.

**Consequences are delayed.** The player will not know what their Fork 3 formative
event costs them until year three or four of play. That is intentional.
Real life works this way.

**The world reacts to who you are, not who you claim to be.**
A player with low cultural capital applying for a bank loan will be treated
differently than one with high cultural capital — even with identical cash.
The bank's NPC loan officer has an implicit bias model derived from
institutionalTrust and culturalCapital. The player will notice this
through outcomes, not through a tooltip.

**Personality is stable but not fixed.** Big Five traits drift slowly
over time in response to major life events. A catastrophic business failure
increases neuroticism. Years of community leadership increase agreeableness.
This mirrors research on personality change in adulthood
(Roberts & Mroczek, 2008).

---

## References

- McCrae, R.R. & Costa, P.T. (1987). Validation of the five-factor model
  of personality across instruments and observers.
- Heckman, J. & Mosso, S. (2014). The economics of human development
  and social mobility.
- Bourdieu, P. (1986). The forms of capital.
- Roemer, J. (1998). Equality of opportunity.
- Banerjee, A. & Duflo, E. (2011). Poor economics.
- Schmitt, D.P. et al. (2007). The geographic distribution of Big Five
  personality traits. Journal of Cross-Cultural Psychology.
- Roberts, B.W. & Mroczek, D. (2008). Personality trait change in adulthood.
- Judge, T.A. et al. (2002). Personality and leadership: A qualitative
  and quantitative review.
- Lahey, B.B. (2009). Public health significance of neuroticism.
- Putnam, R. (2000). Bowling alone: The collapse and revival of
  American community.

---

*Document version 1.3 — Island Life game design*
*Character creation system — all five forks with hidden mechanical effects*

**Changelog v1.2 → v1.3**
- Extended the civil-servant edge case beyond `[familyIndustry]`: Fork 3D's
  `mentorContact.domain` / `knowledge[mentorDomain]` and Fork 5B's
  `startingIncome.industry` also align with family background and so also resolve
  to `null` for that household. Specified the `finance` fallback so the profile
  never emits `knowledge[null]` or `industry: null` (both invalid).
- Cross-doc note: `knowledgeAcquisitionRate` (base 0.0, Fork 2D +0.20) is now
  actually consumed by the world simulation's learning update (World Simulation
  Phase 9, v1.2) — experience grows `× (1 + knowledgeAcquisitionRate)`.

**Changelog v1.1 → v1.2**
- Split `economicCapital` into liquid **`cash`** and derived **`netWorth`**
  (`cash + Σ economicAssets.value − debt`). Updated all five forks and the
  generation logic; surfaced the asset-rich/cash-poor case (Fork 1B) so
  liquidity and collateral can diverge downstream.

**Changelog v1.0 → v1.1**
- Completed `CharacterProfile` schema so every field set by the five forks is
  declared; added a *Supporting types* block (enums, `Asset`, `MentorContact`,
  `StartingJob`/`Income`/`Opportunity`, `AwarenessFlags`).
- Added base distributions for non-cognitive (Heckman) and capital (Bourdieu)
  traits — they no longer accumulate from zero.
- Specified accumulation/clamping rules for knowledge, experience and economic
  capital; defined the `familyIndustry` mapping and the civil-servant edge case.
- Clamped derived behavioral tendencies after fork modifiers in Step 4.
- Added *How the profile feeds the simulation* — maps the profile to the
  Knowledge/Experience/Reputation/Network/Resources model, competence, the
  three knowledge paths, and the iceberg/legacy framing from the source design.
