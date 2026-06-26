# Island Life — Technical Architecture Specification
## Design Document v1.0

---

## Overview

This is the fifth and final design document before coding begins. The first four
define *what* Island Life is:

| Doc | Owns |
|---|---|
| **Character Creation** | The five forks → the hidden `CharacterProfile` (agent #1). |
| **World Simulation** | The entity graph, markets, banks, NPCs, government, events, `simulateOneMonth`, legacy. |
| **Narrative Generation** | The template + Claude-API layer that turns simulation state into prose. |
| **Player Experience** | The four views, decision interface, information channels, the monthly loop, death/legacy. |

This document defines *how* to build it: the stack, the repository layout, the
database schema, the API surface, the simulation/persistence boundary, and the
build sequence that gets you from an empty repo to a **running vertical slice** —
one playable life you can advance month by month and read.

It follows the source design's own advice (see the idea PDF): **this is a
simulation problem, not a graphics problem.** Build the engine first, headless;
add the thin client and the LLM layer on top. No game engine (Unity/Unreal/Godot)
is involved at this stage and none is needed for the slice.

---

## Guiding Architectural Principles

1. **Simulation-first.** The core deliverable of Phase 1 is `simulateOneMonth`
   producing believable economic outcomes with no UI. Everything else —
   API, web, narrative — sits on top of a working engine.

2. **The iceberg boundary is the API boundary.** The player must never see
   profile scores, NPC utilities, probabilities, expected returns, or the legacy
   total before death. Hidden state never crosses the wire. DTOs are *projections*
   that strip it; a contract test enforces this (see Testing).

3. **Determinism via a seeded RNG.** A `(seed, player decisions)` pair must
   reproduce a world byte-for-byte. This underwrites the design's central promise
   — *"I made the right decision, I just got unlucky"* is only legible if luck is
   reproducible and inspectable, not a fresh `Math.random()` each run. The four
   design docs write `Math.random()` / `gaussianSample()` illustratively;
   **production threads a single seeded PRNG through the world** (see Determinism).

4. **One source of truth for the shared schema.** `CharacterProfile`, `NPCAgent`,
   `Company`, `Bank`, etc. are defined once in a shared package and imported by
   engine, server, and web. The Seed-vs-Runtime-vs-Derived split from the World
   Simulation doc is honoured everywhere; derived values (`netWorth`) are never
   stored.

5. **Thin client.** The browser renders prose, prices, and choices. All economic
   logic lives server-side. The client cannot be authoritative — it would leak the
   iceberg and enable trivial cheating.

6. **Every number has a cause.** No scripted events, no random interest rates.
   This is an engine constraint, not a UI one — the architecture keeps all pricing
   and approval logic inside the engine where it emerges from state.

---

## System Context

```
                ┌──────────────────────────────────────────────┐
   Browser      │  WEB (React + TypeScript, Vite)              │
   (player) ◀──▶│  Daily Life · Community · Money · Opportunities│
                └───────────────┬──────────────────────────────┘
                                │  HTTPS / JSON (projected DTOs only)
                ┌───────────────▼──────────────────────────────┐
                │  API SERVER (Node + TypeScript, Fastify)      │
                │  auth · save mgmt · advance-month · decisions │
                │  feed · iceberg projection layer              │
                └───────┬───────────────────────┬──────────────┘
                        │                        │
          ┌─────────────▼────────────┐   ┌───────▼─────────────────┐
          │  SIM ENGINE (pure TS lib) │   │  NARRATIVE SERVICE       │
          │  entity graph in memory   │   │  template engine +       │
          │  simulateOneMonth()       │   │  Claude API (Opus 4.8)   │
          │  seeded RNG               │   │  queue · cache · batches │
          └─────────────┬────────────┘   └───────┬─────────────────┘
                        │                        │
                ┌───────▼────────────────────────▼──────────────┐
                │  PostgreSQL  (saves, snapshots, normalized     │
                │  projections, narrative feed, decisions, legacy)│
                └───────────────────────────────────────────────┘
                        ▲
                        │  ANTHROPIC_API_KEY → api.anthropic.com (Claude Opus 4.8)
```

---

## Technology Stack

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | React + TypeScript, **Vite**, TanStack Query, Tailwind | The game is "menus, charts, data, reports, news, finances" — React's strength. Vite for fast dev. TanStack Query for the polling feed. The narrative voice carries the aesthetics, so no heavy UI kit. |
| **API server** | **Node + TypeScript**, **Fastify** | Same language as the engine and shared types — one type system end to end. Fastify for schema-validated routes and low overhead. |
| **Simulation engine** | **Pure TypeScript library** (no I/O, no framework) | A framework-free module is testable headless, embeddable in the server, and runnable from a CLI. Pure-in/pure-out makes determinism and golden-master testing tractable. **Migration path:** if 5,000 agents × decades outgrows Node, port the hot loop to **Rust** (wasm or a sidecar) behind the same interface — the boundary is already clean. |
| **Database** | **PostgreSQL** | The world is highly relational — persons, families, companies, loans, ownership, banks. Postgres (not Mongo) per the source advice; JSONB where the engine's snapshot is opaque. |
| **DB access** | **Drizzle ORM** (TS-first, SQL-shaped) | Typed schema co-located with the shared types; thin, predictable SQL. Prisma is an acceptable alternative if the team prefers its DX. |
| **Narrative queue/cache** | **Redis + BullMQ** (in-process fallback for the slice) | LLM calls are async and must never block the player. Redis caches generated entries and backs the prefetch queue. |
| **LLM** | **`@anthropic-ai/sdk`, Claude `claude-opus-4-8`** | Per the Narrative Generation doc: official SDK, cached constant system prompt, idle-time prefetch batchable at 50%. |
| **Monorepo** | **pnpm workspaces + Turborepo** | Shared types + engine + server + web in one repo, one install, incremental builds. |
| **Testing** | **Vitest**, **Playwright** (later) | Vitest for engine/unit/contract; Playwright once there's UI to drive. |

---

## Repository Structure

A monorepo so the shared schema is imported, not duplicated.

```
island-life/
├── package.json                 # pnpm workspace root
├── turbo.json
├── pnpm-workspace.yaml
├── packages/
│   ├── shared/                  # ← single source of truth
│   │   └── src/
│   │       ├── types/           # CharacterProfile, NPCAgent, Company, Bank,
│   │       │                    #   Loan, Market, Good, Parish, Government,
│   │       │                    #   WorldState, LegacyScore, NarrativeEntry …
│   │       ├── enums.ts         # Parish, Industry, FamilyBackground, …
│   │       └── constants/       # GOODS, BANKS seed, STARTING_COMPANIES, WORLD
│   │
│   ├── engine/                  # pure simulation library (no I/O)
│   │   └── src/
│   │       ├── rng.ts           # seeded PRNG + gaussian/range helpers
│   │       ├── characterCreation/  # five forks → CharacterProfile → hydrate
│   │       ├── market.ts        # updateMarketPrice
│   │       ├── banking.ts       # computeLoanInterestRate, checkBankSolvency
│   │       ├── company.ts       # revenue, checkCompanySolvency, cascade
│   │       ├── agents.ts        # npcDecide, prospect utility, getAvailableActions
│   │       ├── government.ts    # governmentAct, taxes, policies, elections
│   │       ├── events.ts        # rollRandomEvents
│   │       ├── legacy.ts        # computeLegacyIncrement
│   │       ├── simulateOneMonth.ts
│   │       └── worldBuild.ts    # seed literals → hydrated WorldState
│   │
│   ├── narrative/               # template engine + Claude integration
│   │   └── src/
│   │       ├── templates/       # routine monthly templates
│   │       ├── prompt.ts        # buildSystemPrompt (constant) / buildUserPrompt
│   │       ├── callClaude.ts    # @anthropic-ai/sdk, cached system prompt
│   │       ├── validate.ts      # validateNarrativeEntry
│   │       └── assemble.ts      # assembleNarrativeContext (the enriched projection)
│   │
│   ├── server/                  # Fastify API
│   │   └── src/
│   │       ├── routes/          # saves, advance, feed, decisions, finances …
│   │       ├── projection/      # DTO mappers — the iceberg boundary
│   │       ├── persistence/     # Drizzle schema + save/load
│   │       └── jobs/            # narrative prefetch workers
│   │
│   └── web/                     # React client
│       └── src/
│           ├── views/           # DailyLife, Community, Money, Opportunities
│           ├── components/
│           └── api/             # typed client (imports shared DTO types)
│
├── tools/
│   └── sim-cli/                 # headless runner: simulate N months, print aggregates
└── migrations/                  # SQL migrations
```

The dependency rule is one-directional: `web → server → {engine, narrative} → shared`.
`shared` depends on nothing. `engine` never imports `server`, the DB, or the SDK.

---

## Database Schema (PostgreSQL)

Two persistence concerns, kept separate:

1. **Engine state** — the full `WorldState` entity graph. Large, changes every
   tick, only the engine reads it as a whole. Stored as a **JSONB snapshot per
   save** (optionally per month for rewind). The engine owns this truth.
2. **Query/UI projections** — the handful of things the client and analytics need
   to read relationally: the narrative feed, decisions, the player's finances, and
   the legacy record at death. Normalised tables.

This hybrid keeps the slice simple (load snapshot → run → save snapshot) while
giving you the relational target the source design asked for (`Person`, `Family`,
`Company`, `Bank`, `Loan`, `Job`, `Market`, `Asset`, …). As the game matures, push
more hot entities from the snapshot into normalised tables for querying — the
schema below is the destination, not all of it is required for the slice.

```sql
-- ─── Reference / shared across saves ───────────────────────────────
CREATE TYPE industry      AS ENUM ('FISHING','AGRICULTURE','CONSTRUCTION',
  'INFORMAL_TRADE','RETAIL','TOURISM','TRANSPORTATION','FINANCE');
CREATE TYPE employment     AS ENUM ('EMPLOYED','SELF_EMPLOYED','INFORMAL','UNEMPLOYED');
CREATE TYPE company_status AS ENUM ('HEALTHY','DISTRESSED','CLOSED');
CREATE TYPE bank_state     AS ENUM ('HEALTHY','STRESSED','DISTRESSED','INSOLVENT');
CREATE TYPE loan_status    AS ENUM ('ACTIVE','PAID','DEFAULT');

CREATE TABLE country (
  id            TEXT PRIMARY KEY,           -- 'DM','BB','MQ','TT'
  name          TEXT NOT NULL,
  base_interest_rate  NUMERIC NOT NULL,
  institution_score   NUMERIC NOT NULL,
  corruption_index    NUMERIC NOT NULL,
  exchange_rate       NUMERIC NOT NULL
);

CREATE TABLE parish (
  id            TEXT PRIMARY KEY,           -- 'SAINT_GEORGE', …
  country_id    TEXT NOT NULL REFERENCES country(id),
  name          TEXT NOT NULL,
  capital       TEXT NOT NULL,
  population    INTEGER NOT NULL,
  infrastructure_score NUMERIC NOT NULL,
  market_access_score  NUMERIC NOT NULL
);

-- ─── Per-save world ────────────────────────────────────────────────
CREATE TABLE save (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID,                       -- nullable for the local-single-player slice
  seed          BIGINT NOT NULL,            -- determinism root
  rng_state     JSONB NOT NULL,             -- PRNG state at current_month boundary
  current_month INTEGER NOT NULL DEFAULT 0,
  player_person_id UUID,                    -- agent #1
  status        TEXT NOT NULL DEFAULT 'ALIVE', -- ALIVE | DEAD | MIGRATED
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Opaque engine snapshot. One current row per save; keep monthly rows if you
-- want rewind. The engine serialises/deserialises the whole WorldState here.
CREATE TABLE world_snapshot (
  save_id       UUID NOT NULL REFERENCES save(id) ON DELETE CASCADE,
  month         INTEGER NOT NULL,
  state         JSONB NOT NULL,             -- full hydrated WorldState
  PRIMARY KEY (save_id, month)
);

-- ─── Normalised projections (the relational target) ────────────────
CREATE TABLE family (
  id            UUID PRIMARY KEY,
  save_id       UUID NOT NULL REFERENCES save(id) ON DELETE CASCADE,
  surname       TEXT,
  parish_id     TEXT REFERENCES parish(id)
);

CREATE TABLE person (                        -- the NPCAgent, projected
  id            UUID PRIMARY KEY,
  save_id       UUID NOT NULL REFERENCES save(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  age           INTEGER NOT NULL,
  parish_id     TEXT REFERENCES parish(id),
  family_id     UUID REFERENCES family(id),
  is_player     BOOLEAN NOT NULL DEFAULT false,
  family_background TEXT,                    -- circumstance markers
  formative_event   TEXT,
  employment_status employment NOT NULL,
  occupation        industry,
  employer_company_id UUID,                  -- FK added after company
  monthly_income    NUMERIC NOT NULL DEFAULT 0,
  monthly_living_costs NUMERIC NOT NULL,
  cash              NUMERIC NOT NULL,
  -- numeric profile blocks kept as JSONB: they are read together, never queried column-wise
  ocean             JSONB NOT NULL,          -- {openness, conscientiousness, …}
  noncognitive      JSONB NOT NULL,          -- {cognitiveAbility, resilience, selfControl, knowledgeAcquisitionRate}
  capital           JSONB NOT NULL,          -- {socialCapitalLocal, …, culturalCapital}
  knowledge         JSONB NOT NULL,
  experience        JSONB NOT NULL,
  previous_month_capital NUMERIC NOT NULL DEFAULT 0
  -- NOTE: net_worth is DERIVED (cash + Σ assets − Σ loan principal). NEVER stored.
);
CREATE INDEX person_save_idx ON person(save_id);

CREATE TABLE company (
  id            UUID PRIMARY KEY,
  save_id       UUID NOT NULL REFERENCES save(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  industry      industry NOT NULL,
  type          TEXT NOT NULL,
  parish_id     TEXT REFERENCES parish(id),
  owner_person_id UUID REFERENCES person(id),   -- null for co-ops/associations
  market_share  NUMERIC NOT NULL,
  employees_count INTEGER NOT NULL,
  base_operating_costs NUMERIC NOT NULL,
  monthly_revenue NUMERIC NOT NULL DEFAULT 0,
  profit          NUMERIC NOT NULL DEFAULT 0,
  consecutive_loss_months INTEGER NOT NULL DEFAULT 0,
  status        company_status NOT NULL DEFAULT 'HEALTHY',
  estimated_annual_tax NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX company_save_idx ON company(save_id);
ALTER TABLE person ADD CONSTRAINT person_employer_fk
  FOREIGN KEY (employer_company_id) REFERENCES company(id);

CREATE TABLE asset (                          -- land / equipment / vehicle
  id            UUID PRIMARY KEY,
  save_id       UUID NOT NULL REFERENCES save(id) ON DELETE CASCADE,
  owner_person_id  UUID REFERENCES person(id),
  owner_company_id UUID REFERENCES company(id),
  type          TEXT NOT NULL,               -- LAND | EQUIPMENT | VEHICLE
  size          TEXT,
  value         NUMERIC NOT NULL,
  CHECK (owner_person_id IS NOT NULL OR owner_company_id IS NOT NULL)
);

CREATE TABLE bank (
  id            TEXT NOT NULL,               -- 'NCB','RBTT','CREDIT_UNION_DM'
  save_id       UUID NOT NULL REFERENCES save(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  country_id    TEXT REFERENCES country(id),
  total_assets  NUMERIC NOT NULL,
  total_loans   NUMERIC NOT NULL,
  npl_ratio     NUMERIC NOT NULL,            -- recomputed each tick (seed = starting value)
  solvency_score NUMERIC NOT NULL,
  lending_appetite      NUMERIC NOT NULL,
  base_lending_appetite NUMERIC NOT NULL,    -- runtime; captured from seed
  bias_toward_formal_sector NUMERIC NOT NULL,
  state         bank_state NOT NULL DEFAULT 'HEALTHY',
  PRIMARY KEY (save_id, id)
);

CREATE TABLE loan (
  id            UUID PRIMARY KEY,
  save_id       UUID NOT NULL REFERENCES save(id) ON DELETE CASCADE,
  bank_id       TEXT NOT NULL,               -- borrower carries bankId, not a bank object
  borrower_person_id  UUID REFERENCES person(id),
  borrower_company_id UUID REFERENCES company(id),
  principal     NUMERIC NOT NULL,
  remaining_principal NUMERIC NOT NULL,
  interest_rate NUMERIC NOT NULL,
  monthly_payment NUMERIC NOT NULL,
  term_months   INTEGER NOT NULL,
  origin_month  INTEGER NOT NULL,
  purpose_industry industry,
  status        loan_status NOT NULL DEFAULT 'ACTIVE'
);
CREATE INDEX loan_bank_idx ON loan(save_id, bank_id);

CREATE TABLE job (                            -- enables monthsInOccupation, salary history
  id            UUID PRIMARY KEY,
  save_id       UUID NOT NULL REFERENCES save(id) ON DELETE CASCADE,
  person_id     UUID NOT NULL REFERENCES person(id),
  company_id    UUID REFERENCES company(id),
  title         TEXT,
  monthly_salary NUMERIC NOT NULL,
  start_month   INTEGER NOT NULL,
  end_month     INTEGER                       -- null = current
);

CREATE TABLE market (
  id            UUID PRIMARY KEY,
  save_id       UUID NOT NULL REFERENCES save(id) ON DELETE CASCADE,
  good_id       TEXT NOT NULL,               -- references GOODS (code constants)
  parish_id     TEXT REFERENCES parish(id),
  current_price NUMERIC NOT NULL,
  demand        NUMERIC NOT NULL,
  supply        NUMERIC NOT NULL,
  price_history JSONB NOT NULL DEFAULT '[]'  -- last 24 months
);

CREATE TABLE government (
  save_id       UUID PRIMARY KEY REFERENCES save(id) ON DELETE CASCADE,
  country_id    TEXT REFERENCES country(id),
  monthly_tax_revenue NUMERIC NOT NULL,
  fiscal_balance      NUMERIC NOT NULL,
  unemployment_rate   NUMERIC NOT NULL,
  public_sentiment    NUMERIC NOT NULL,
  corruption_level    NUMERIC NOT NULL,
  policies      JSONB NOT NULL DEFAULT '[]'  -- ActivePolicy[] with duration
);

CREATE TABLE event (
  id            UUID PRIMARY KEY,
  save_id       UUID NOT NULL REFERENCES save(id) ON DELETE CASCADE,
  definition_id TEXT NOT NULL,               -- 'HURRICANE_MAJOR', …
  severity      NUMERIC NOT NULL,
  started_month INTEGER NOT NULL,
  duration_remaining INTEGER NOT NULL,
  affected_industries JSONB NOT NULL
);

-- ─── Player-facing surface (read by the client) ────────────────────
CREATE TABLE narrative_entry (
  id            UUID PRIMARY KEY,
  save_id       UUID NOT NULL REFERENCES save(id) ON DELETE CASCADE,
  month         INTEGER NOT NULL,
  type          TEXT NOT NULL,               -- PERSONAL | COMMUNITY | OBSERVATION | …
  trigger_id    TEXT,                        -- LLM trigger, null for template entries
  text          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX feed_idx ON narrative_entry(save_id, month);

CREATE TABLE decision (
  id            UUID PRIMARY KEY,
  save_id       UUID NOT NULL REFERENCES save(id) ON DELETE CASCADE,
  month         INTEGER NOT NULL,            -- when surfaced
  type          TEXT NOT NULL,
  situation     TEXT NOT NULL,
  options       JSONB NOT NULL,              -- [{id,label,description}]
  chosen_option TEXT,                        -- null until answered
  resolved_month INTEGER                     -- for consequence linking
);

CREATE TABLE legacy_score (                   -- hidden until death; one row per save
  save_id          UUID PRIMARY KEY REFERENCES save(id) ON DELETE CASCADE,
  wealth_score     NUMERIC NOT NULL DEFAULT 0,
  family_score     NUMERIC NOT NULL DEFAULT 0,
  community_score  NUMERIC NOT NULL DEFAULT 0,
  innovation_score NUMERIC NOT NULL DEFAULT 0,
  environment_score NUMERIC NOT NULL DEFAULT 0,
  reputation_score NUMERIC NOT NULL DEFAULT 0,
  last_net_worth   NUMERIC NOT NULL DEFAULT 0
);
```

`Good`/`GOODS` and the `Industry` set live as **code constants** in
`packages/shared/constants` (they don't vary per save), referenced by `good_id`
/ the `industry` enum. The `Market` table is per-save because prices diverge.

---

## The Simulation Engine and the Persistence Boundary

The engine is pure: it takes a `WorldState` and returns a `WorldState`
(mutated in place per the entity-graph model). It performs no I/O.

The per-tick lifecycle, orchestrated by the server:

```
load   →  deserialize the latest world_snapshot (+ rng_state) into the
          in-memory entity graph (agents, companies, banks, markets, …)
advance →  world = await simulateOneMonth(world)        // pure, deterministic
persist →  1. write the new world_snapshot (+ advanced rng_state, current_month)
           2. flush projections the UI/analytics need:
              narrative_entry (new feed), person/company/loan/government deltas,
              legacy_score (incremented, still hidden)
```

The snapshot is the source of truth; the normalised tables are a **read model**
projected from it. For the slice you may project lazily (only what a view needs).
A single Postgres transaction wraps `persist` so a save is atomic — you never
half-advance a month.

**Why snapshot-first.** The entity graph is dense with cross-references
(`agent.employer` is a live `Company`; `company.employees` are live agents). Round
-tripping that through fully normalised rows every tick means re-stitching the
object graph on every load — error-prone and slow at 5,000 agents. JSONB lets the
engine own serialization; you normalise only what you must query. The cost is that
the snapshot isn't ad-hoc queryable — which is why the feed, finances, decisions,
and legacy *are* normalised.

---

## Determinism and Seeding

Replace every `Math.random()` / `gaussianSample()` / `randomBetween()` in the four
design docs with calls on a **seeded PRNG carried on the world**.

```typescript
// packages/engine/src/rng.ts
export interface RNG {
  next(): number;                       // [0,1)
  gaussian(mean: number, sd: number): number;
  range(min: number, max: number): number;
  pick<T>(xs: readonly T[]): T;
  serialize(): RngState;                // persisted in save.rng_state
}
export function createRng(seed: bigint, state?: RngState): RNG { /* xoshiro256** */ }
```

- `simulateOneMonth(world)` reads `world.rng` for every stochastic draw — event
  rolls, NPC decision noise, remittance variation, market noise.
- The PRNG state is serialized into `save.rng_state` alongside each snapshot, so
  resuming continues the exact stream.
- **Consequence:** the same seed + the same sequence of player decisions always
  produces the same life. This makes "right decision, bad luck" auditable (you can
  replay and show the hurricane was always coming this seed), enables deterministic
  golden-master tests, and lets the *Different start?* option re-roll cleanly by
  choosing a new seed.

Character creation is likewise seeded: the forks' base OCEAN/capital draws come
from `world.rng`, so a given seed yields a given starting `CharacterProfile`.

---

## API Design

REST over JSON. Every response is a **projected DTO** — the projection layer is
the one place allowed to read hidden engine state, and it strips it. The client
never receives profile scores, NPC utilities, probabilities, expected returns, or
the legacy total before death.

```
POST   /saves                        Begin a life. Body: { creationChoices, seed? }.
                                     Runs the five forks server-side, hydrates
                                     agent #1, builds the world, returns { saveId }.
                                     (The hidden CharacterProfile is NOT returned.)

GET    /saves/:id/state              Header bar: month, year, name, age, parish,
                                     cash in hand. No scores.

GET    /saves/:id/feed?month=        Daily Life: the month's narrative entries
                                     (template + ready LLM entries), typed.

GET    /saves/:id/money              Money view: income lines, expense lines,
                                     this-month delta, assets, debts. No net worth.

GET    /saves/:id/community          Named relationships + reputation as prose.

GET    /saves/:id/opportunities      Open / possible / expired, as the player has
                                     heard of them (filtered by information channels).

POST   /saves/:id/advance            Advance one month. Runs simulateOneMonth,
                                     persists, fires template narrative synchronously,
                                     enqueues LLM entries, returns the month-transition
                                     blurb + immediately-available feed.

GET    /saves/:id/decisions/:did     The full decision presentation (situation +
                                     options), LLM-generated, options unlabelled.
POST   /saves/:id/decisions/:did     Submit a choice. Body: { optionId }.

POST   /saves/:id/people/:pid/visit  Relationship interactions (negotiate, etc.).

GET    /saves/:id/legacy             404/forbidden until save.status = 'DEAD';
                                     then returns the obituary + the reveal.
```

Long narrative isn't awaited on `advance`: the response carries what's ready
(templates + cache hits); the client polls `feed` (or subscribes via SSE) as
LLM entries land. The world never pauses for prose — matching the Player
Experience doc's "the world does not stop."

**Projection contract (the iceberg, enforced):**

| Engine field (hidden) | What the API exposes instead |
|---|---|
| `culturalCapital`, OCEAN, derived tendencies | Nothing — shapes prose only |
| loan `interestRate`, `approvalScore` | The agreed `monthlyPayment` and a prose line |
| `expectedReturn`, `riskLevel` on opportunities | Unlabelled options, prose framing |
| `legacyScore.*` | Nothing until death |
| NPC `prospectUtility`, personality | The NPC's prose response only |

---

## Narrative Service Integration

Per the Narrative Generation doc, with the v1.2 decisions baked in:

- **Two layers.** Template entries render synchronously inside `advance` (instant,
  no API call). Significant events enqueue an LLM job.
- **Claude.** `@anthropic-ai/sdk`, model `claude-opus-4-8`, the constant
  `buildSystemPrompt()` (now padded with the WORLD PRIMER so it clears the
  ~1024-token cache minimum) marked `cache_control: ephemeral`. Verify caching via
  `usage.cache_read_input_tokens`.
- **Never blocks.** Jobs run on BullMQ workers; results cache in Redis and persist
  to `narrative_entry`. `prefetchLikelyEntries` warms the next ~3 months during
  idle time, and because prefetch isn't latency-sensitive it can run through the
  **Batches API at 50% cost**.
- **Validated.** Every generated entry passes `validateNarrativeEntry(text,
  triggerId)` before it reaches `narrative_entry` (the `triggerId` exempts
  annual/legacy long-form from the word cap).

---

## Configuration & Secrets

```
ANTHROPIC_API_KEY=...            # narrative service only; never shipped to the client
DATABASE_URL=postgres://...
REDIS_URL=redis://...
WORLD_DEFAULT_SEED=...           # optional; omitted → random seed per new save
NODE_ENV=development|production
```

The API key lives only in the narrative service's environment. The engine and the
client have no knowledge of it.

---

## Testing Strategy

1. **Golden-master / determinism.** Build a world with a fixed seed, advance N
   months, hash the resulting `WorldState`. The hash is checked into the repo;
   any divergence fails CI. This both proves determinism and catches unintended
   behavioural changes to the engine.
2. **Engine unit tests.** Each system in isolation: a hurricane raises construction
   demand and fish prices; a 6-month loss streak closes a company and unemploys its
   employees *and* Phase 7 sees the defaulted loans; a recovering bank restores
   appetite; `INDUSTRY_DOMAIN` mapping prevents the NaN learning bug.
3. **Iceberg-leak contract test.** Snapshot every API DTO and assert it contains
   **none** of a denylist of hidden keys (`culturalCapital`, `interestRate`,
   `expectedReturn`, `legacyScore`, `*Utility`, OCEAN names, …). This is the single
   most important test — it guards the core design promise.
4. **Narrative validation in CI.** Run `validateNarrativeEntry` over a corpus of
   sampled generations; fail on forbidden patterns or voice drift.
5. **Playwright (post-slice).** Drive the four views once the UI exists.

---

## Build Sequence: Zero to Vertical Slice

Each phase ends with something runnable. Do not start the next before the current
phase's deliverable works.

**Phase 0 — Scaffold.** pnpm workspace, the five packages, TS/lint/CI, an empty
`simulateOneMonth` and shared types compiling. *Deliverable:* `pnpm build` green.

**Phase 1 — Headless engine (the hard part).** Implement `rng`, `worldBuild` (seed
literals → hydrated `WorldState`), markets, banking, company, agents, government,
events, legacy, and `simulateOneMonth`. The `sim-cli` runs a seeded Dominica for,
say, 120 months and prints GDP, unemployment, a sample agent's trajectory, and the
NPL of each bank. *Deliverable:* believable, deterministic aggregates from the CLI,
golden-master test passing. **This is the project's hardest problem; if it works,
the rest is plumbing.**

**Phase 2 — Persistence.** Postgres + migrations + snapshot save/load + `rng_state`.
The CLI can stop, persist, and resume to identical output. *Deliverable:*
save→resume reproduces the golden master.

**Phase 3 — Character creation → agent #1.** Implement the five forks →
`CharacterProfile` → hydrate the player into a fresh seeded world (all server-side;
the profile is never emitted). *Deliverable:* `POST /saves` creates a playable
world with a hydrated player.

**Phase 4 — API + minimal web.** Fastify with `state`, `advance`, `feed`, `money`;
React with **Daily Life** and **Money** views and an **Advance to next month**
button. Template narratives only. *Deliverable:* you can click through months and
read a (template-only) life with a working finances panel.

**Phase 5 — Narrative LLM.** Wire the narrative service: cached system prompt,
`buildUserPrompt`, `callClaude` (Opus 4.8), validator, Redis cache, async worker.
Enable one LLM trigger end-to-end (e.g. a significant monthly event). *Deliverable:*
LLM entries appear in the feed without the player ever waiting.

**Phase 6 — One decision loop.** The Eunice supply-contract opportunity surfaces
through the information channels → the decision interface is generated (unlabelled
options) → the choice feeds back into the simulation → a delayed consequence
surfaces months later as a `MEMORY` entry. Legacy accrues, hidden. *Deliverable:
the vertical slice.*

---

## The Vertical Slice, Defined

The slice is **one playable life** that exercises every layer thinly:

- A fishing-family character (Saint John / Portsmouth), created through the five
  forks, dropped into a seeded Dominica.
- ~24 in-game months, advanced one at a time, the world simulating around them
  (real prices, a hurricane season, NPC competitors, at least one bank under
  some stress).
- A **Daily Life** feed mixing template entries and at least one Opus-generated
  significant event, in the established voice.
- A **Money** view reflecting real income, fuel costs, and (if taken) a loan
  payment — no net worth shown.
- **One genuine decision** (Eunice's standing supply contract) with no labelled
  "right" answer, whose consequence surfaces later without being explained.
- Legacy accruing invisibly the whole time; not revealed (death isn't required for
  the slice).

If that loop is fun to click through and the prose feels like a life, the concept
is proven and every later feature — migration, business acquisition, monopoly
dynamics, the legacy reveal, more parishes and industries — is additive on a sound
foundation.

---

## Performance & Scaling Roadmap

- **Slice:** one save, 5,000 active agents, synchronous monthly ticks. Node handles
  this comfortably; `updateAgentsBatched` yields to the event loop between chunks.
- **Growth:** move the tick to a worker thread so the API stays responsive;
  pre-generate narrative aggressively.
- **If the engine becomes the bottleneck** (more agents, faster time compression,
  many concurrent saves): port the hot loop to **Rust** (wasm in-process or a
  sidecar) behind the same `simulateOneMonth` interface. The pure, I/O-free engine
  boundary established in Phase 1 is what makes this a swap, not a rewrite.
- **Many concurrent players:** each save is an isolated world, so this scales
  horizontally — shard saves across workers; Postgres holds the snapshots.

---

## Open Questions / Deferred

- **Auth & accounts** — out of scope for the slice (local single user); add before
  any hosted multiplayer.
- **Multiplayer shared economy** (the PDF's "biggest upgrade") — deferred; the
  per-save isolation above is single-player by design.
- **Rewind/branching** — the per-month snapshot table enables it but the UI and
  rules are unspecified.
- **Save-format migration** — once the snapshot JSONB shape changes post-launch,
  you'll need versioned migrations for in-flight saves.

---

## References

- Island Life — Character Creation System (hidden `CharacterProfile`, the five forks).
- Island Life — World Simulation Specification (`simulateOneMonth`, entity graph,
  seed-vs-runtime fields).
- Island Life — Narrative Generation System (template + Claude Opus 4.8, prompt
  caching, validation).
- Island Life — Player Experience Layer (the four views, decision interface, monthly loop).
- The originating design conversation (Drug Lord → Economic Life; "simulation
  first, engine later"; PostgreSQL; `simulateOneMonth` as the hardest problem).

---

*Document version 1.0 — Island Life game design*
*Technical architecture specification — stack, schema, API, and the build sequence to a vertical slice*

**Changelog**
- v1.0 — Initial architecture: monorepo + pure TS engine + Fastify API + React/Vite
  client + PostgreSQL (snapshot-first hybrid) + Redis/BullMQ narrative workers
  (Claude Opus 4.8). Established the iceberg-as-API-boundary projection rule, the
  seeded-PRNG determinism model, the seed/runtime/derived persistence mapping, and
  a six-phase build sequence culminating in a defined vertical slice.
