# Island Life — Build Playbook (Prompt Sequence)

This document lists, in order, the prompts that drive the build from the current
state to a running vertical slice and beyond. Each prompt is a self-contained unit
of work with an acceptance test, the files it touches, and its dependencies.

- **Design source of truth:** the five `island_life_*.md` docs.
- **Build sequence:** `island_life_technical_architecture.md` → "Build Sequence".
- **Current state:** Phases 0–6 complete (scaffold, headless engine, persistence,
  character creation, the Fastify API + iceberg projection + template narrative
  + React/Vite client, the Layer-2 Claude Opus 4.8 narrative, and the vertical
  slice — one unlabelled decision loop with a delayed consequence). Next: the
  post-slice backlog (P-B1 firm formation onward).

## How to read this

- `P<phase>.<n>` — a prompt. Do them in order within a phase; phases are ordered.
- **Acceptance** — how we know it's done (usually a command + observable result).
- A prompt is finished only when **typecheck + tests are green** and acceptance holds.
- You can hand me one prompt at a time, or say "do Phase N" and I'll run its prompts.

---

## Standing rules (apply to EVERY prompt)

These are the guardrails I follow on every change; they're not steps, they're constraints.

- **S1 — Engine stays pure.** `packages/engine` never imports the DB, the server,
  the SDK, or `node:fs`. It takes a `WorldState` and mutates/returns it.
- **S2 — Determinism.** Every stochastic draw goes through `world.rng`. Never call
  `Math.random()` in engine code. Persist `rng` state with the world.
- **S3 — The iceberg is the API boundary.** Hidden state (OCEAN, capitals, derived
  tendencies, loan `interestRate`/`approvalScore`, opportunity `expectedReturn`,
  `legacyScore.*`, NPC utilities) never crosses the wire. DTOs are projections.
- **S4 — One schema.** Shared types live in `packages/shared` and are imported,
  never reduplicated. Derived values (`netWorth`) are never stored.
- **S5 — Aggregates are recomputed, never hand-edited in cascades.** (Bank NPL,
  government tax.) Cascades change inputs; the owning phase derives the aggregate.
- **S6 — Green gate.** After each prompt: `npm run typecheck && npm test`. New
  behaviour ships with a test.
- **S7 — Voice rules** apply to all generated prose (Narrative doc, rules 1–10).

---

## Phase 0 — Scaffold ✅ DONE

- **P0.1** Monorepo (npm workspaces), TS config, Vitest, `.gitignore`, README.
- **P0.2** `packages/{shared,engine,narrative,server,web}` + `tools/sim-cli` stubs.
- *Acceptance:* `npm install && npm run typecheck` green. ✅

## Phase 1 — Headless engine ✅ DONE

- **P1.1** Seeded RNG (`rng.ts`), shared types & seed constants.
- **P1.2** `buildWorld(seed)` → hydrated entity graph.
- **P1.3** `simulateOneMonth` — all 10 phases, mutable entity graph.
- **P1.4** `sim-cli` headless runner; determinism test suite.
- *Acceptance:* `npm run sim` prints causal, seed-divergent aggregates; same seed →
  same digest; `npm test` green. ✅

---

## Phase 2 — Persistence (Postgres, snapshot-first)

> Goal: the CLI can stop, persist, and resume to byte-identical output.

- **P2.1 — Stand up Postgres + Drizzle.** ✅ Added `packages/server/src/persistence`
  (`schema.ts` with `save` + `world_snapshot`, `db.ts` connection, `migrate.ts`),
  `drizzle.config.ts`, `db:generate`/`db:migrate`/`db:up` scripts, `.env.example`,
  and `docker-compose.yml`. *Acceptance:* ✅ verified — `npm run db:generate` emits
  the migration offline; `npm run db:migrate` applied it to a live Neon Postgres;
  `npm run db:check` confirms `save` (8 cols) + `world_snapshot` (3 cols) exist.

- **P2.2 — Schema migrations.** ✅ Full normalized schema in `schema.ts`
  (`country`, `parish`, `family`, `person`, `company`, `asset`, `bank`, `loan`,
  `job`, `market`, `government`, `event`, `narrative_entry`, `decision`,
  `legacy_score` + the 5 Postgres enums), squashed to one clean `0001` migration.
  *Acceptance:* ✅ applied to Neon; `db:check` reports 17 tables, 5 enums
  (industry 8 / employment 4 / bank_state 4 / company_status 3 / loan_status 3),
  31 FKs. `net_worth` deliberately not stored (derived).

- **P2.3 — World (de)serialization.** ✅ `packages/engine/src/serialize.ts`
  (`serializeWorld`/`deserializeWorld`, `schemaVersion: 1`) flattens
  `employer`/`employees`/`player` to ids and round-trips the `rng` state; pure,
  stays in the engine (S1). *Acceptance:* ✅ 4 tests — digest equality,
  JSON stringify/parse safety, graph + player-identity re-stitch, and RNG
  continuity (save→resume→advance matches the original digest).

- **P2.4 — Save/load.** ✅ `packages/server/src/persistence/saves.ts` —
  `createSave(seed)`, `loadSave(id)`, `saveTick(saveId, world)` writing one
  `world_snapshot` row per month and advancing `save.current_month` + `rng_state`
  in one transaction; exported from `@island/server`. *Acceptance:* ✅
  `npm run db:goldenmaster` against live Neon — a 24-month uninterrupted run and a
  run persisted at month 10 / reloaded / continued to 24 produce the identical
  digest (`1845634156`); the verifier cleans up its save afterward.

- **P2.5 — Projection writers (minimal).** ✅ `projection.ts` —
  `ensureReferenceData` (seeds `country`/`parish` FK targets) + `projectWorld`
  (player `person`, all `company`, `government`, `legacy_score`), run inside the
  `createSave`/`saveTick` transaction. *Acceptance:* ✅ `npm run db:projectcheck`
  queries the relational tables for player cash + firm-status counts; golden master
  still passes, so projection doesn't disturb the save boundary.

> **Phase 2 complete.** Postgres + Drizzle, full schema, world (de)serialization,
> transactional save/load, and the projection read model — all verified against a
> live Neon database.

---

## Phase 3 — Character creation → agent #1

> Goal: the five forks produce a hidden `CharacterProfile` that hydrates the player.

- **P3.1 — Profile schema + base distributions.** ✅ `CharacterProfile` +
  supporting types in `@island/shared`; `characterCreation/` (`ProfileDraft`,
  `newDraft` base distributions, `finalizeProfile` clamp/derive, `createBaseProfile`)
  in the engine, all via seeded RNG. *Acceptance:* ✅ 5 tests — deterministic per
  seed, seeds diverge, traits clamp to [0.05,0.95], derived in [0,1], base profile
  starts empty.

- **P3.2 — The five forks.** ✅ `forks.ts` — Forks 1–5 as pure functions porting
  every documented modifier; `applyForks`/`createCharacter`. `FAMILY_INDUSTRY` map
  + civil-servant null-domain fallback (`knowledgeDomainFor`→finance,
  `experienceDomainFor`→retail). *Acceptance:* ✅ 16 tests — every fork option's
  signature effect + the Fork 2C/5B/3D null-industry edge cases + clamps.

- **P3.3 — Derive + assemble.** ✅ Steps 3–4 (derived tendencies + fork modifiers)
  live in `finalizeProfile`; Step-5 world-seeding hooks are carried on the profile
  (`mentorContact`/`startingJob`/`startingIncome`/`startingOpportunity`/`flags`).
  *Acceptance:* ✅ derived assertions — 3A→loss aversion↑, 3C→entrepreneurial drive↑
  / institutional trust↓, 4A→patience↑.

- **P3.4 — Hydrate the player.** ✅ `hydratePlayerInto` maps `CharacterProfile` →
  `NPCAgent` (agent #1); `buildWorld({ choices })` builds the player from the forks
  (no-choices path byte-identical, golden master still `1845634156`). The profile
  is server-side only. *Acceptance:* ✅ player reflects chosen forks; deterministic;
  iceberg test asserts profile-only fields don't ride on the agent (full API-leak
  test lands in P4.2).

> **Phase 3 complete.** Character creation: profile schema, base distributions,
> the five forks, derive/assemble, and player hydration — 36 engine tests green.

---

## Phase 4 — API + minimal web

> Goal: click through months and read a (template-only) life with a finances panel.

- **P4.1 — Fastify server + advance route.** ✅ `packages/server/src/app.ts`
  (`buildApp()`): `POST /saves` (runs the five forks, hydrates agent #1, persists
  month 0), `GET /saves/:id/state`, `POST /saves/:id/advance` (loads world, runs
  `simulateOneMonth`, fires Layer-1 templates, persists snapshot + feed, returns
  the transition blurb + ready feed). Plus `server.ts` entry + `npm run serve`.
  *Acceptance:* ✅ `npm run db:apicheck` (Fastify `inject`, live Neon) advances a
  save and `save.current_month` increments in Postgres; cleans up after itself.

- **P4.2 — The projection layer (iceberg boundary).** ✅ `packages/server/src/
  projection` — pure `state`/`money`/`feed`/`community`/`opportunities` DTO mappers
  + shared `labels.ts`; all DTO types live in `@island/shared` (S4). *Acceptance:*
  ✅ the **iceberg-leak contract test** (P-X1, `__tests__/iceberg.test.ts`) snapshots
  every DTO across 3 seeds × 18 months and asserts no denylisted key (OCEAN,
  capital, tendencies, `interestRate`, `*Utility`, `legacyScore`…) ever serializes;
  a loan exposes `monthlyPayment`/`monthsLeft` but never its rate.

- **P4.3 — Money + feed routes.** ✅ `GET /saves/:id/money` (income/expense lines
  reconciled to engine phase-5 cash math, assets, debts, contextual short-month
  note; **no net worth, no interest rate**), `GET /saves/:id/feed?month=` (persisted
  entries, defaults to latest month). *Acceptance:* ✅ responses match the Player
  Experience Money view; iceberg test confirms no hidden numbers.

- **P4.4 — Template narrative engine.** ✅ `packages/narrative` — `renderMagnitude`
  + `formatCurrency` (magnitude.ts), the Layer-1 template library
  (income/event/finance/market/season/community), `generateMonthlyEntries(world)`
  (deterministic in `(seed, month)` via a local PRNG — never touches `world.rng`,
  S2), and `validateNarrativeEntry`. Wired into `advance`. *Acceptance:* ✅ 3–8
  grounded entries/month over a 36-month run; every entry passes the voice
  validator across 4 seeds × 24 months.

- **P4.5 — React/Vite client.** ✅ `packages/web`: Daily Life + Money views, an
  "Advance to next month" button, a typed `api/client.ts` importing shared DTO
  types, Vite `/api` proxy → the API. Own `tsconfig.json` (DOM/JSX) +
  `typecheck:web`; excluded from the headless gate. *Acceptance:* ✅ `build:web`
  bundles; with `serve` + `dev:web` running, the browser path (Vite proxy → API)
  begins a life and advances months end-to-end against live Postgres.

> **Phase 4 complete.** Fastify API + the iceberg projection layer + the Layer-1
> template narrative engine + a React/Vite client. 46 tests green (incl. the
> P-X1 iceberg contract); both typecheck gates clean; verified live end-to-end.

---

## Phase 5 — Narrative LLM (Claude Opus 4.8) ✅ DONE

> Goal: significant events generate bespoke prose; the player never waits.

- **P5.1 — `callClaude` + cached system prompt.** ✅ `packages/narrative`:
  `claude.ts` (lazy `@anthropic-ai/sdk` client, `callClaude(system, user, client?)`,
  `NARRATIVE_MODEL = 'claude-opus-4-8'`, `max_tokens 1500`, system marked
  `cache_control: ephemeral`); `systemPrompt.ts` — the frozen `buildSystemPrompt()`
  (ten voice rules + the constant WORLD PRIMER that clears the ~1024-token cache
  minimum; zero interpolation so the prefix stays byte-identical). *Acceptance:* ✅
  `npm run narrative:smoke` (live) generates an entry and reports
  `cache_read_input_tokens` > 0 on the second call; the offline suite asserts the
  same caching contract against a fake client.

- **P5.2 — `buildUserPrompt` + context assembler.** ✅ `narrativeContext.ts`
  (`assembleNarrativeContext` + the `describe*` helpers turning hidden numeric
  state into qualitative prose — no raw scores cross into the prompt, S3),
  `voice.ts` (age/season/parish variety), `prompts.ts` (`buildUserPrompt` with the
  trigger switch). Adapted to the real schema (parish id → name, government
  standing → economy, world events → recent history). *Acceptance:* ✅ a
  `FIRST_BUSINESS_STARTED` prompt is in-voice and leaks no mechanics.

- **P5.3 — Validator + async worker.** ✅ `generate.ts`
  (`generateNarrativeEntry` — assemble → prompt → `callClaude` → `validateNarrativeEntry`
  gate with one retry, rejecting on persistent failure); the in-process
  `packages/server/src/narrative/worker.ts` (`createNarrativeWorker`, dependency-
  injected generate/persist, `idle()` for tests/shutdown, `NOOP` when no
  `ANTHROPIC_API_KEY`); `appendNarrativeEntries` (idempotent per
  `(saveId, month, triggerId)`); `triggers.ts` (`detectTriggers` for
  HURRICANE_MAJOR / FIRST_BUSINESS_STARTED / ANNUAL_REFLECTION). `advance` snapshots
  pre-advance, enqueues post-advance, and returns immediately. *Acceptance:* ✅
  advancing never blocks on the API (NOOP/async); the worker persists ready entries
  to `narrative_entry` for a later `feed` poll; invalid generations are rejected.

- **P5.4 — Prefetch.** ✅ `predictLikelyTriggers` (the upcoming annual reflection)
  + the worker's prefetch cache; `advance` warms the next ~3 months during idle
  time. *Acceptance:* ✅ a prefetched entry is served from cache the instant its
  trigger fires (no second generation), verified in the worker test.

> **Phase 5 complete.** Layer-2 Claude Opus 4.8 narrative: cached system prompt,
> the context assembler + trigger-specific user prompts, the validator-gated async
> worker with prefetch, and the `advance` wiring. 61 tests green (15 new, incl. the
> caching contract and the prefetch cache-hit); both typecheck gates clean. The
> headless gate stays offline — Layer-2 only reaches the network when
> `ANTHROPIC_API_KEY` is set, and is verified live via `npm run narrative:smoke`.

---

## Phase 6 — One decision loop → THE VERTICAL SLICE ✅ DONE

> Goal: a real, unlabelled decision with a delayed consequence, end to end.

- **P6.1 — Opportunity surfacing.** ✅ `packages/engine/src/opportunities.ts` —
  `surfaceOpportunities(world)` is the information-channel filter (MARKET_NETWORK,
  local social capital ≥ 0.30, a fishing player, a few months in). It pushes
  Eunice's standing supply contract + its decision onto `world.opportunities` /
  `world.decisions` (serialized with the snapshot), and expires unanswered offers.
  `toOpportunitiesDTO` projects the OPEN/expired ones; the hidden `monthlyAmount`
  becomes prose, never a field. *Acceptance:* ✅ it appears in `GET /opportunities`
  for the fishing player with local capital and not for a non-fisher / low-capital
  player (engine `opportunities.test.ts`).

- **P6.2 — Decision generation.** ✅ The engine builds the unlabelled options (no
  "safe/risky"); `buildDecisionSituation` (narrative) frames the moment in voice;
  `toDecisionDTO` emits `{id,label,description}` only. *Acceptance:* ✅
  `GET /decisions/:id` returns 2 genuine options (standing arrangement vs. the
  wharf); the iceberg test surfaces the offer and asserts no `expectedReturn`,
  `riskLevel`, `monthlyAmount`, or income-mode mechanics leak.

- **P6.3 — Resolve into the simulation.** ✅ `resolveDecision` records the choice
  and sets the player's `incomeMode`; `updatePlayerIncome` (called by `advance`
  before `simulateOneMonth`) makes STANDING a fixed contract amount and SPOT
  market-variable from the local fish price. `POST /decisions/:id` persists it.
  Gated behind a flag that is unset for the default player, so the golden master
  digest is untouched. *Acceptance:* ✅ accept holds income steady while decline
  tracks the market — subsequent months' income behaviour diverges.

- **P6.4 — Delayed consequence.** ✅ `resolveDecision` schedules
  `consequenceMonth = resolvedMonth + 6`; `detectDueConsequences` fires it once;
  `generateConsequenceEntry` (narrative) renders a `MEMORY` entry that connects to
  the path taken or not taken without naming it a decision. *Acceptance:* ✅ it
  appears on schedule and passes the voice validator for both choices.

- **P6.5 — Slice acceptance.** ✅ The Opportunities view + decision interface wire
  the loop into the React client (`build:web` clean). The whole life — surface →
  choose → changed income → delayed consequence, every entry voice-validated — is
  proven offline by `packages/narrative/src/__tests__/slice.test.ts` (one fishing
  life in Saint John, replaying the exact `advance` sequence). *Acceptance:* ✅ the
  vertical slice is playable in the browser (`serve` + `dev:web` against Postgres).

---

## Cross-cutting prompts (do alongside the phases)

- **P-X1 — Iceberg-leak contract test.** Snapshot every API DTO; assert it contains
  none of a denylist of hidden keys. The single most important test. (Land in P4.2.)
- **P-X2 — Golden-master CI.** Check in a `digest(seed=…, months=…)` value; CI fails
  on unintended engine drift. Update intentionally with a note.
- **P-X3 — Engine balance pass.** Address the deferred calibration gaps as their
  systems land: firm formation (P-B1), payroll↔company-cash reconciliation, a real
  consumption model, NPC prospect-theory decisions.
- **P-X4 — Save-format versioning.** Once `world_snapshot` JSONB shape changes,
  add a `schemaVersion` and a migration path for in-flight saves.

---

## Backlog — beyond the slice (post-vertical-slice)

Sequenced roughly; each is additive on the proven foundation.

- **P-B1 — Firm formation.** NPC `START_BUSINESS`; closures are replaced; firm count
  stops monotonically declining.
- **P-B2 — Full NPC decision engine.** Prospect theory + probability weighting +
  time discounting (Kahneman/Tversky, Prelec) replacing the Phase-1 stub.
- **P-B3 — Banking depth.** `computeLoanInterestRate` (risk-priced, cultural-capital
  bias), player loan applications, collateral, the bank-distress cascade.
- **P-B4 — Migration.** The Barbados move as a real second world; the Dominica
  simulation continues in the player's absence.
- **P-B5 — Business acquisition & leverage.** Earnings-based valuation, buyouts,
  leverage, debt-financed growth.
- **P-B6 — Monopoly & systemic importance.** Market-share thresholds → second/third
  -order effects (competitor failure, supplier dependence, government antitrust vs.
  capture, "too big to fail").
- **P-B7 — Death & the legacy reveal.** Aging/health → death trigger; the obituary
  and legacy reveal (the only time legacy is shown).
- **P-B8 — Personality drift, family, generations.** Slow OCEAN drift; children;
  generational handoff.
- **P-B9 — Rust hot-loop port** (only if Node becomes the bottleneck) behind the
  unchanged `simulateOneMonth` interface.
- **P-B10 — Accounts & multiplayer economy** (the largest upgrade; deferred by design).

---

*Build playbook v1.0 — companion to the five Island Life design documents and the
technical architecture specification.*
