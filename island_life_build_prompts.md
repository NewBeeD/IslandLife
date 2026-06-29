# Island Life — Build Playbook (Prompt Sequence)

This document lists, in order, the prompts that drive the build from the current
state to a running vertical slice and beyond. Each prompt is a self-contained unit
of work with an acceptance test, the files it touches, and its dependencies.

- **Design source of truth:** the five `island_life_*.md` docs.
- **Build sequence:** `island_life_technical_architecture.md` → "Build Sequence".
- **Current state:** Phases 0–11 complete (scaffold, headless engine, persistence,
  character creation, the Fastify API + iceberg projection + template narrative
  + React/Vite client, the Layer-2 Claude Opus 4.8 narrative, the vertical
  slice — one unlabelled decision loop with a delayed consequence, the grounded
  livelihoods + generative opportunity + bank financing + real money view of
  Phase 7, the Phase 8 venture portfolio — concurrent income streams that sum each
  month, Phase 9 education & credentials — programs that drain tuition over
  months, raise knowledge, and unlock credential-gated opportunities, Phase 10
  diversified opportunities — cross-domain new ventures financed through the same
  slider, low-barrier side hustles that saturate as a parish trade crowds, and a
  market-watch line on the money view, and Phase 11 equity, crowdfunding & NPC
  partnerships — a cap table on ventures/firms, friend-funded loans and equity
  stakes, and shared firms with an NPC partner that split profit by share), and
  Phase 12 asset collateral & secured borrowing (borrow against assets, sell assets,
  collateral seizure on default), and Phase 13 opportunity lifecycle hygiene — lapsed
  offers deduped by logical identity, surfacing suppressed within a re-offer cooldown,
  a bounded prune of long-settled offers, and a deduped/capped "Passed" list with no
  phantom expired enrolment), and Phase 14 loan lifecycle & financing controls (loans
  amortize and close, pay off early / resize installments, paid-vs-remaining on the money
  view, friend-loan installment preview, and a financing slider on every investment
  including a study loan for tuition). **Next:** the rest of the `ideas.md` playtest
  backlog — **Phases 15–19** (the wage model, a job market, venture realism, and
  negotiable/always-on deals), then the original post-slice backlog (P-B1 firm formation
  onward).

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

## Phase 7 — Grounded life, generative opportunities, real money ✅ DONE

> Goal: ground character creation in everyday small-island livelihoods; make
> opportunities **always available** for the player's trade at varying risk and
> financing (a fisher can always pursue a bigger boat + engine, funded by savings
> and/or a bank loan); and let the player **see their own finances** — assets,
> loans, monthly interest, net worth.

> **S3 amendment (scoped, deliberate).** The iceberg still holds for *other people
> and the world* — NPC psychology (OCEAN, capitals, tendencies), opportunity
> `expectedReturn`, hidden `riskLevel`, NPC loan internals never cross the wire.
> But the player may now see **their own** money in full: their loan's
> `interestRate`, asset values, and a computed `netWorth`. `netWorth` is still
> **derived in the projection, never stored** (S4 holds). The iceberg-leak test is
> re-scoped to encode exactly this split, not deleted. This partially lands the
> player-loan slice of **P-B3 — Banking depth**.

- **P7.1 — Eight grounded livelihoods.** Expand `FamilyBackground` (4 → 8) mapped
  onto the 8 `Industry` values; widen the creation `ForkOption` to `A`–`H` (only
  the `background` fork uses E–H); add the four new `fork1` cases + `FAMILY_INDUSTRY`
  entries (minibus driver → TRANSPORTATION, mason → CONSTRUCTION, guesthouse →
  TOURISM, shopkeeper → RETAIL); give the web `background` fork eight concrete,
  Dominica-specific prose options. *Files:* `shared/enums.ts`,
  `engine/characterCreation/forks.ts`, `web/views/CharacterCreation.tsx`.
  *Acceptance:* each background hydrates the right occupation/knowledge; choosing
  any of the eight begins a coherent life; no-choices golden master unchanged.

- **P7.2 — Real money view (the S3 amendment).** `MoneyDTO` gains per-asset `value`,
  per-loan `interestRate` + `principal` + next-payment interest/principal split, a
  top-level computed `netWorth`, and a `monthlyOperatingCosts` expense line.
  *Files:* `shared/dto.ts`, `server/projection/money.ts`, `web/views/Money.tsx`,
  `web/styles.css`. *Acceptance:* the Money view shows the player's loan interest
  rate, asset values, and net worth; the re-scoped iceberg test passes (money DTO
  may carry `interestRate`/`netWorth`; every other DTO still may not, and
  `expectedReturn`/`riskLevel`/NPC mechanics leak nowhere).

- **P7.3 — Player economic fields + seasonal lean months.** Add `outputScale` (1),
  `monthlyOperatingCosts` (0), `loanArrearsMonths` (0) to `NPCAgent`, defaulted so
  NPCs and a no-upgrade player are byte-identical (S2). `updatePlayerIncome` earns
  `spotBaseIncome * outputScale * seasonalMarketFactor` (seasonality already lives
  in `Good.seasonality`), so off-season income drops while fixed loan + operating
  costs stay → genuine cash-negative spells. `simulateOneMonth` phase 5 subtracts
  operating costs (0 for NPCs); the **player** accrues `loanArrearsMonths` and draws
  down cash before defaulting (instant default replaced for the player only).
  *Files:* `shared/types.ts`, `engine/{opportunities,simulateOneMonth,
  characterCreation/hydrate,serialize}.ts`. *Acceptance:* a bigger-boat fisher runs
  positive in season and negative off-season; arrears accrue before default; engine
  digest unchanged.

- **P7.4 — Generative upgrade opportunities.** Broaden `OpportunityKind` with
  `ASSET_UPGRADE`; generalize `Opportunity` with optional upgrade fields
  (`assetType`, `assetPrice`, `outputScaleDelta`, `operatingCostDelta`, hidden
  `riskLevel`, `minCash`/`minExperience`). A per-industry catalogue (fishing → boat
  + engine, farming → land/irrigation/pickup, transport → second minibus,
  construction → tools/crew, retail → fridge/stock, tourism → rooms, trade → bulk
  run) at 1–2 risk/capital tiers. `surfaceOpportunities` guarantees the player's
  trade always has an open upgrade (cooldown after decline/expire), drawn from
  `world.rng`, gated by capital/experience. *Files:* `shared/types.ts`,
  `engine/opportunities.ts`. *Acceptance:* a fishing player always has a bigger-boat
  opportunity in `GET /opportunities`; higher tiers gate on capital/experience; the
  Eunice path is untouched.

- **P7.5 — Bank financing (credit, amortization, counter-offers).** `banking.ts`
  gains `amortize(principal, rate, term)`, `assessLoanApplication(world, applicant,
  requestedPrincipal, downPayment, termMonths)` → `{ outcome:
  APPROVED|COUNTER|DECLINED, approvedPrincipal, interestRate, monthlyPayment, term,
  reason }` from hidden creditworthiness (job stability, cash, asset value, DTI,
  institutional capital, kept/broken promises, bank appetite/state/bias, base rate),
  and `originateLoan(...)`. **Apply-and-find-out:** no raw score shown; an over-ask
  returns a `COUNTER` with the creditworthiness ceiling ("the bank offers you a
  lesser amount"); declines carry a plain reason. *Files:* `engine/banking.ts`.
  *Acceptance:* strong applicants get full approval at a lower rate; weak applicants
  are countered down or declined with a readable reason; payments amortize correctly.

- **P7.6 — Financing slider + quote flow (interactive decision).** `DecisionDTO`
  gains `interaction: 'OPTIONS' | 'FINANCING'` + a `FinancingControlDTO` (price,
  max/min down-payment, term options); add `FinancingQuoteDTO`. New read-only
  `POST /saves/:id/decisions/:did/quote { downPayment, termMonths }` returns a live
  quote (loan size, monthly payment, approve/counter/decline) the slider polls;
  `POST /decisions/:did` accepts `{ financing }`, re-quotes server-side
  (authoritative), and `resolveDecision` deducts the down payment, originates the
  approved loan, pushes the `Asset`, and bumps `outputScale`/operating costs.
  *Files:* `shared/dto.ts`, `engine/opportunities.ts`, `server/app.ts`,
  `server/projection/{opportunities,decisions}.ts`, `web/views/Opportunities.tsx`,
  `web/api/client.ts`, `web/styles.css`. *Acceptance:* dragging the down-payment
  slider updates loan size / monthly payment / approval live; accepting buys the
  asset, books the loan, and the Money view reflects all of it next month.

- **P7.7 — Upgrade narrative.** `narrative/decisions.ts` frames the `ASSET_UPGRADE`
  choice and its trade-off in voice, acknowledges the purchase/loan, and renders a
  delayed `MEMORY` entry on how the season treated the bet — second person, no raw
  mechanics (S7). *Acceptance:* the upgrade situation, acknowledgement, and
  consequence all pass the voice validator.

- *Phase acceptance:* `npm run typecheck && npm run typecheck:web && npm test` green
  (determinism digest unchanged; re-scoped iceberg test passing); end-to-end with
  `serve` + `dev:web`, a fishing life buys a bigger boat on a part-cash/part-loan
  deal via the slider and rides a negative off-season month against the payment.

---

## Phase 8 — A portfolio of ventures (the income spine) ✅ DONE

> Goal: the player stops being one-occupation / one-income and becomes a set of
> **concurrent ventures**, each with its own assets, output, operating cost, and
> income, summed each month. A lecturer can draw a salary *and* run a boat *and*
> sell juice. Everything in Phases 9–11 (education unlocks, cross-domain entry,
> side hustles, partnerships) hangs off this.
>
> **Determinism note (S2 / P-X2).** New venture state is additive and optional: a
> player with no explicit `ventures` keeps the current single-stream behaviour
> **byte-identically**, so the no-choices golden master is untouched. Any digest
> change appears only once a real venture exists, and is committed deliberately
> with a note.

- **P8.1 — Venture data model.** Add a `Venture` interface to `@island/shared`
  (`{ id, industry, label, incomeMode: 'SPOT' | 'STANDING', spotBaseIncome,
  standingContract, outputScale, monthlyOperatingCosts, assets: Asset[], status }`)
  and an optional `ventures?: Venture[]` on `NPCAgent`. The existing player income
  fields (`incomeMode`/`spotBaseIncome`/`standingContract`/`outputScale`/
  `monthlyOperatingCosts`) remain the implicit "venture 0" when `ventures` is
  undefined. *Files:* `shared/types.ts`, `engine/serialize.ts`. *Acceptance:*
  ventures round-trip through serialize; a player with no `ventures` produces the
  unchanged determinism digest.

- **P8.2 — Income aggregation.** Generalize `updatePlayerIncome` to compute each
  venture's income (the existing SPOT/STANDING logic, per venture) and sum them
  into `player.monthlyIncome`; `simulateOneMonth` phase 5 sums operating costs
  across ventures. When `ventures` is empty/undefined the code path is the current
  single-stream one (byte-identical). *Files:* `engine/ventures.ts` (new, pure, S1),
  `engine/opportunities.ts`, `engine/simulateOneMonth.ts`. *Acceptance:* a
  two-venture player's monthly income equals the sum of both; the no-venture golden
  master holds.

- **P8.3 — Upgrades target a venture.** Generalize the upgrade catalogue and
  `nextUpgradeFor`/`applyUpgradeFinancing` to operate **per venture** (a fisher's
  boat venture and a taxi venture each carry their own upgrade ladder and
  experience gate); financing bumps that venture's `outputScale`/operating cost and
  pushes the asset onto it. *Files:* `engine/opportunities.ts`, `shared/types.ts`.
  *Acceptance:* upgrading the taxi venture leaves the fishing venture untouched; the
  per-venture experience gate still applies.

- **P8.4 — Money view by venture.** `MoneyDTO` income/expense lines break down per
  venture (label + its net contribution); no hidden mechanics added. *Files:*
  `shared/dto.ts`, `server/projection/money.ts`, `web/views/Money.tsx`,
  `web/styles.css`. *Acceptance:* the Money view shows each venture's contribution
  and they reconcile to phase-5 cash math; the iceberg test stays green.

- **P8.5 — Experience per active venture.** `simulateOneMonth` phase 9 credits
  experience to **every** active venture's domain, not only `player.occupation`.
  Guarded so the no-venture player still credits exactly one domain (digest holds).
  *Files:* `engine/simulateOneMonth.ts`. *Acceptance:* running two ventures grows
  two experience domains; the single-occupation path is unchanged.

- *Phase acceptance:* ✅ `npm run typecheck && npm run typecheck:web && npm test`
  green (103 tests; the no-venture path is byte-identical so the determinism digest
  is **unchanged** — ventures are additive and only the with-ventures path differs);
  a fishing player who also runs a taxi sees two income lines that sum on the Money
  view. New `engine/ventures.ts` (`hasVentures`/`activeVentures`/`ventureIncomeLines`/
  `aggregateVentureIncome`/`totalOperatingCosts`); `Venture` + optional `ventures?`
  on `NPCAgent` and `ventureId?` on `Opportunity`; per-venture income aggregation,
  upgrade targeting, money-view breakdown, and experience credit; 6 new tests in
  `engine/src/__tests__/ventures.test.ts`.

---

## Phase 9 — Education & credentials ✅ DONE

> Goal: the player can invest **money + time** in education (certificate →
> associate → degree → master's), which raises knowledge / cultural capital and
> **unlocks gated opportunities**. The cleanest, most self-contained phase — the
> substrate (`knowledge`, `culturalCapital`, `generalLiteracy`) already exists.
>
> **Depends on:** nothing in Phases 8/10/11 (can ship independently), but its
> credential gates (P9.4) are what make Phase 10's higher-value ventures meaningful.

- **P9.1 — Credential model.** Add a `CredentialLevel` enum (`NONE`, `CERTIFICATE`,
  `ASSOCIATE`, `DEGREE`, `MASTERS`) and optional `education?: { level: CredentialLevel;
  enrolled?: { programId; field: Industry | 'GENERAL'; targetLevel; monthsRemaining;
  monthlyCost; completionMonth } }` on `NPCAgent`. Optional/defaulted → the
  no-education player is byte-identical. *Files:* `shared/enums.ts`,
  `shared/types.ts`, `engine/serialize.ts`. *Acceptance:* education round-trips; the
  default player carries `NONE`/no program and the digest is unchanged.

- **P9.2 — Enrolment as an opportunity.** New `OpportunityKind` `'EDUCATION_ENROLMENT'`;
  a program catalogue (field, target level, prerequisite level, total cost, duration
  in months). Surfaced when affordable, not already enrolled, and not already
  holding the level — drawn from `world.rng` for variety (S2). Resolving commits the
  program onto `education.enrolled`. *Files:* `shared/types.ts`,
  `engine/opportunities.ts`. *Acceptance:* an enrolment offer appears for an
  eligible player; accepting starts the program; you cannot enrol in a level you
  already hold.

- **P9.3 — Tuition & completion in the loop.** `simulateOneMonth` phase 5 subtracts
  `monthlyCost` while enrolled (so a degree is a real multi-month cash drain); at
  `completionMonth` it raises the relevant `knowledge` domain + `generalLiteracy` +
  `culturalCapital`, advances `education.level`, clears the program, and flags a
  narrative trigger. *Files:* `engine/simulateOneMonth.ts`. *Acceptance:* tuition
  drains cash monthly; on completion knowledge rises and the level advances; the
  no-education path is unchanged.

- **P9.4 — Credential-gated opportunities.** Add optional `minCredential` /
  `minKnowledge` gates to opportunity + venture templates; `surfaceOpportunities`
  enforces them. A degree unlocks higher-value (e.g. formal-sector) ventures that
  stay hidden without it. *Files:* `engine/opportunities.ts`. *Acceptance:* a gated
  opportunity is absent before the credential and surfaces after it is earned.

- **P9.5 — Education narrative + money view.** `narrative/decisions.ts` frames the
  enrol decision and renders a completion `MEMORY` entry (second person, no raw
  mechanics, S7); `MoneyDTO` shows a tuition expense line while enrolled. *Files:*
  `narrative/decisions.ts`, `shared/dto.ts`, `server/projection/money.ts`,
  `web/views/{Money,Opportunities}.tsx`. *Acceptance:* the tuition line shows while
  enrolled; the enrol and completion prose pass the voice validator.

- *Phase acceptance:* ✅ `typecheck` + `typecheck:web` + `npm test` green (113
  tests; +10 for Phase 9). A player enrols and pays tuition each month (a real cash
  drain vs. a declined baseline), and on completion the credential advances,
  knowledge + cultural capital rise, and a credential-gated upgrade (the commercial
  longliner, `UPG_FISH_3`, gated on an associate) that was hidden now surfaces;
  iceberg clean; the no-education determinism digest is **unchanged** (education is
  additive and `surfaceEducation` is deterministic — never draws `world.rng` — so
  existing replays are byte-compatible). New `engine/education.ts` (`CredentialLevel`
  + `Education`/`EducationProgram`/`EnrolledProgram`; `surfaceEducation`,
  `enrolPlayer`, `chargeTuition`, `detectEducationCompletions`, `credentialLevelOf`);
  enrolment is an OPTIONS decision resolved through `resolveDecision`; tuition in
  `simulateOneMonth` phase 5; a `minCredential` gate on the upgrade ladder; enrol
  framing + completion `MEMORY` in `narrative/decisions.ts`; a tuition line on the
  Money view; 7 tests in `education.test.ts` + 3 in `decisions.test.ts`. The slice
  test now targets the Eunice opportunity by kind (education may also be open).

---

## Phase 10 — Diversified opportunities, side hustles & saturation ✅ DONE

> Goal: opportunities reach **beyond the player's trade** (buy a boat or run a bus
> whatever your job); **low-barrier side hustles** exist but **saturate** as more
> people pile in; **more capital unlocks more**. This is where the world starts to
> feel like an open economy rather than a single career.
>
> **Depends on:** Phase 8 (a new opportunity creates a new `Venture`). Saturation
> reads the live agent population that already exists in `world.agents`.

- **P10.1 — New-venture opportunities (cross-domain).** New `OpportunityKind`
  `'NEW_VENTURE'`: a catalogue of entry opportunities across **all** industries
  (start a fishing venture, buy a minibus route, open a juice stand), each with an
  entry cost, starting output, operating cost, and barrier tier. Surfacing offers
  ventures the player does **not** already run, gated by cash / credential, drawn
  from `world.rng`. Resolving creates a `Venture` (Phase 8), funded by cash and/or a
  bank loan through the existing financing slider (P7.6). *Files:* `shared/types.ts`,
  `engine/opportunities.ts`. *Acceptance:* a lecturer is offered a boat venture;
  accepting adds a fishing venture that earns alongside the salary.

- **P10.2 — Side hustles (low barrier).** Tag catalogue entries with
  `barrierTier: 'LOW' | 'MEDIUM' | 'HIGH'`. Low-barrier hustles (roadside juice,
  small resale) are cheap, fast to start, and **always** offerable — but their
  return is saturation-scaled (P10.3). *Files:* `shared/types.ts`,
  `engine/opportunities.ts`. *Acceptance:* a near-free juice-stand venture is always
  available to offer; its base return is deliberately modest.

- **P10.3 — Saturation.** Recompute, as a monthly **aggregate** (S5), the
  participation per `(industry × parish × barrierTier)` from `world.agents` +
  player ventures, and scale a low-barrier venture's income inversely with crowding
  (more entrants → lower per-head take, recovering as they leave). All draws via
  `world.rng` (S2). *Files:* `engine/ventures.ts`, `engine/simulateOneMonth.ts`,
  `shared/types.ts`. *Acceptance:* a juice-stand return falls as agents crowd in and
  recovers as they leave; the result is deterministic per seed.

- **P10.4 — Wealth-gated surfacing.** Generalize the surfacing gate with a
  `minCash` threshold so higher-capital ventures only surface once the player can
  plausibly fund them. *Files:* `engine/opportunities.ts`. *Acceptance:* a
  high-capital venture is hidden when the player is broke and surfaces once liquid.

- **P10.5 — Market visibility (scoped).** Decide *buy/sell* vs. *abstracted*.
  **Minimal (this phase):** surface the local market prices the player's SPOT
  ventures already read (`updatePlayerIncome`), so the player can see why a venture's
  income swings. **Fuller (deferred):** player inventory + explicit buy/sell actions
  — noted as a later prompt, not built here. *Files:* `server/projection/*`,
  `web/views/*`. *Acceptance:* relevant market prices are visible and tied to venture
  income; explicit trading is documented as deferred.

- **P10.6 — Diversification narrative.** `narrative/decisions.ts` frames
  cross-domain entry and the "everybody's selling juice now" saturation beat; the
  Opportunities view groups offers by domain and conveys barrier / crowding **in
  prose, never as a stat** (S3). *Files:* `narrative/decisions.ts`,
  `web/views/Opportunities.tsx`. *Acceptance:* the prose passes the voice validator;
  no raw saturation number crosses the wire.

- *Phase acceptance:* ✅ `typecheck` + `typecheck:web` + `npm test` green (120
  tests; +7 for Phase 10). A salaried lecturer is offered a cross-domain venture
  outside their trade; accepting materializes the existing income as an explicit
  "venture 0" (`ensurePlayerVentures`) and stands the new stream up beside it, so the
  salary keeps earning while the boat earns too. A near-broke fisher is always
  offered the low-barrier juice stand (a cross-domain hustle clears its tenth-of-cost
  wealth gate); its takings fall as RETAIL operators crowd the parish and recover
  exactly to the uncrowded take as they leave — deterministic per seed. Wealthier
  players unlock the HIGH-barrier plays a broke player never sees (P10.4). New
  ventures and asset upgrades now share one financing path (`findFinanceable` /
  `applyUpgradeFinancing` branch on kind), funded through the same down-payment +
  loan slider. The money view carries an "At the market" line (`MarketWatchLine`,
  P10.5) showing the public local prices the player's SPOT ventures read, so income
  swings have a visible cause; explicit buy/sell trading stays deferred. Narrative
  frames cross-domain entry and renders the "everybody's selling juice now"
  saturation beat in prose — no raw saturation number crosses the wire (iceberg
  clean). New `NEW_VENTURE` opportunity kind + `NewVentureSpec` catalogue (8 entries
  across every industry / barrier tier, one credential-gated); saturation in
  `engine/ventures.ts` (`tradeOperatorCount`, `lowBarrierSaturationFactor`); 4 tests
  in `newVentures.test.ts` + 3 in `decisions.test.ts`. The Phase 6.1 / iceberg tests
  now assert the Eunice contract **by kind** (a new venture may surface alongside it).
  The determinism digest changes from Phase 9 — `surfaceNewVenture` draws `world.rng`
  for an eligible baseline player — but stays self-consistent per seed; this is
  expected and additive (no replay regression beyond the new draw).

---

## Phase 11 — Equity, crowdfunding & NPC partnerships ✅ DONE

> Goal: raise money from **friends** (NPCs in the social network) as **debt or
> equity**, and **partner with NPCs** in a shared company that splits debt and
> income. This introduces the one genuinely new financial concept — a **cap table /
> profit share**. (Partnering with *other human players* stays deferred to P-B10.)
>
> **Depends on:** Phase 8 (ventures hold the equity split) and the banking flow
> (P7.5) for friend-loans. Reuses `socialNetwork`, NPC `cash`, and the
> personality fields (`agreeableness`/`riskTolerance`/`patience`) already on agents.

- **P11.1 — Equity / cap table.** Add optional `equityHolders?: { personId; share }[]`
  to `Venture` (and `Company`); outside shares sum to ≤ 1, the player holds the
  remainder. Monthly venture income distributes by share — the player banks only
  their slice. Optional/defaulted → sole ventures are byte-identical. *Files:*
  `shared/types.ts`, `engine/ventures.ts`, `engine/serialize.ts`. *Acceptance:* a
  venture with a 30% outside holder pays the player 70% of its take; a sole venture
  is unchanged and the digest holds.

- **P11.2 — Crowdfunding offers.** New `OpportunityKind` `'CROWDFUND'`: when the
  player needs capital, generate a slate of offers from `socialNetwork` NPCs. Each
  backer's terms derive from their personality + cash — a **loan** at an interest
  rate, or **equity** for a profit share. *Files:* `shared/types.ts`,
  `engine/opportunities.ts`, `engine/banking.ts` (reuse `amortize`/`originateLoan`
  with `borrowerPersonId` for friend-loans). *Acceptance:* a player with friends
  gets a mixed slate of interest-rate and equity offers whose terms vary by backer.

- **P11.3 — Accept funding.** Resolving a `CROWDFUND` decision either originates a
  personal loan from the friend (debt: their cash → player, a `Loan` booked) or
  records an `equityHolder` on the funded venture (equity: their cash → player, a
  future profit claim that dilutes the player's take). *Files:*
  `engine/opportunities.ts`, `engine/ventures.ts`. *Acceptance:* taking a friend's
  loan adds the loan and their cash; taking equity adds a holder + their cash and
  reduces the player's future share.

- **P11.4 — NPC partnership (shared firm).** New `OpportunityKind` `'PARTNERSHIP'`:
  form a shared `Company` (`COOPERATIVE`/`ASSOCIATION`) with an NPC partner who
  contributes cash/assets for a share; capital is pooled, any loan is booked against
  the company (`borrowerCompanyId`), and monthly profit splits by share. *Files:*
  `shared/types.ts`, `engine/company.ts`, `engine/opportunities.ts`. *Acceptance:*
  forming a partnership pools capital, books the loan against the company, and
  splits monthly profit by share.

- **P11.5 — Backer & partner consequences.** Backers/partners react over time: a
  good run pays them and lifts the player's `socialCapitalLocal`; a default or a
  sustained loss strains the relationship (`brokenContracts++`, social-capital hit)
  and surfaces as a delayed `MEMORY`. *Files:* `engine/simulateOneMonth.ts`,
  `engine/opportunities.ts`, `narrative/decisions.ts`. *Acceptance:* paying backers
  raises local social capital; defaulting on a friend's loan costs it; the
  consequence surfaces in voice on schedule.

- **P11.6 — Funding/partnership money view + narrative.** `MoneyDTO` shows the
  player's ownership share, outside equity claims, and friend-loan terms (the
  player's **own** debt is visible per the P7 S3 amendment; backers' hidden
  psychology is not). `narrative/decisions.ts` frames raising money from friends and
  forming the partnership. *Files:* `shared/dto.ts`, `server/projection/money.ts`,
  `web/views/{Money,Opportunities}.tsx`, `narrative/decisions.ts`. *Acceptance:* the
  player sees their ownership %, friend-loan rates, and partner; NPC internals never
  leak.

- *Phase acceptance:* ✅ `npm run typecheck && npm run typecheck:web && npm test`
  green (136 tests; +16 for Phase 11). Equity is additive — a venture/firm with no
  `equityHolders` is byte-identical, so the no-Phase-11 determinism digest is
  **unchanged** (the new monthly distributions and friend-default strain are all
  no-ops without Phase-11 state; surfacing draws `world.rng` only in
  `surfaceOpportunities`, which neither `simulateOneMonth` nor the golden master
  calls). A self-employed player with well-off friends gets a mixed crowdfunding
  slate — some backers lend (a friend-loan booked at a gentler-than-bank rate), some
  take an equity stake (a profit share that dilutes the player's take); accepting
  moves the backer's cash to the player and either books the loan or records the
  holder. A partnership forms a player-owned `COOPERATIVE` with the NPC partner as an
  equity holder, pools both contributions, books the firm's loan against the company
  (`borrowerCompanyId`), and splits monthly profit by share. A good run pays
  backers/partners and lifts `socialCapitalLocal`; a friend-loan default strains the
  tie (`brokenContracts++`, a social-capital hit) exactly once and surfaces a delayed
  `MEMORY` in voice. New `EquityHolder` + optional `equityHolders?` on `Venture`/
  `Company`; `CROWDFUND` + `PARTNERSHIP` opportunity kinds with `BackerOffer`/
  `CrowdfundSpec`/`PartnershipSpec`; `engine/funding.ts` (`surfaceCrowdfund`,
  `surfacePartnership`, `applyBackerFunding`, `applyPartnership`,
  `distributePartnershipProfit`, `strainFriendDefaults`, friend-loan id helpers) and
  `engine/ventures.ts` equity split (`ventureGrossIncome`, `playerShareOf`,
  `distributeVentureEquity`); a money-view ownership section + friend-loan source
  labels (`OwnershipLine`); narrative framing + acknowledgements + delayed `MEMORY`
  for both kinds; 9 tests in `funding.test.ts`, 6 in `decisions.test.ts`, and a
  Phase-11 case in the iceberg contract (backer psychology, equity shares, and
  friend-loan rates never cross the wire). Partnering with **other human players**
  remains deferred to P-B10.

---

## Phase 12 — Asset collateral & secured borrowing ✅ DONE

> Goal: the player can borrow **against** their assets (secured loans), sell assets
> (spot or patient), and a defaulted secured loan is settled by seizing its collateral.
> *(Landed ahead of this playbook — see `engine/assets.ts`, `assetFlow.test.ts`; this
> partially closes the collateral slice of P-B3.)*

---

# Backlog from `ideas.md` — playtest fixes & depth (Phases 13–19)

> These phases turn the 19 playtest notes in `ideas.md` into sequenced, testable
> work. **Bugs first** (Phases 13–14 are mostly correctness fixes the player can
> already feel), then the realism + depth features (15–19). Every prompt still obeys
> the Standing rules S1–S7 — engine stays pure, determinism via `world.rng`, the
> iceberg holds for everyone but the player's own money, new behaviour ships with a
> test, and the no-feature path stays byte-identical so the golden master holds.
>
> **Idea → phase map:** 6,19 → P13 · 4a/b/c,9,12 → P14 · 1,2,8,7 → P15 · 16,18 →
> P16 · 3,10,15,17 → P17 · 5,11,13,14 → P18. (Idea numbers below refer to `ideas.md`.)

## Phase 13 — Opportunity lifecycle hygiene (bug) ✅ DONE

> Goal: lapsed opportunities stop **piling up and duplicating** in the "Passed" list,
> and an enrolment the player already accepted stops showing "The moment has passed."
> **Root cause (confirmed):** `world.opportunities` grows without bound; surfacing
> pushes a *fresh* opportunity each cycle (a new juice-stand `NEW_VENTURE`, a new
> `ASSET_UPGRADE`, a new `EDUCATION_ENROLMENT`) without checking for an equivalent
> already on the world, and `toOpportunitiesDTO` re-emits **every** `EXPIRED` row — so
> the same offer appears many times, and a stale expired education duplicate still
> reads "The moment has passed" even after the player enrolled via another instance.
>
> **Covers ideas 19 (duplicate "Passed" entries) and 6 (education "moment has passed"
> after enrolling).** Depends on nothing; pure projection + surfacing-guard work.

- **P13.1 — One live offer per (kind, target).** In `surfaceOpportunities`
  (`engine/opportunities.ts`), before surfacing each generative kind, suppress it when
  an **equivalent** opportunity is already `OPEN` *or was recently `EXPIRED`* within a
  cooldown — keyed by `(kind, ventureId/assetType/programId/partnerId)`, not by the
  random `id`. The Eunice guard (`alreadyHasEunice`) is the existing pattern; generalize
  it. *Files:* `engine/opportunities.ts` (+ `education.ts`/`funding.ts` surfacers).
  *Acceptance:* advancing many months never produces two simultaneously-`OPEN` juice
  stands, nor a fresh duplicate of an offer that just lapsed; deterministic per seed.

- **P13.2 — Dedupe + cap the Passed projection.** In `toOpportunitiesDTO`
  (`server/projection/opportunities.ts`) collapse `EXPIRED` rows to **one per logical
  offer** (keep the most recent by `surfacedMonth`) and cap the list (e.g. last N). The
  `active` list is unaffected. *Files:* `server/projection/opportunities.ts`.
  *Acceptance:* the iceberg test still passes; a 36-month run shows each lapsed offer
  **once** under Passed and the list length is bounded.

- **P13.3 — Prune resolved/old opportunities from world state.** Add a bounded sweep in
  `surfaceOpportunities` (or a small `pruneOpportunities`) that drops `ACCEPTED`/
  `DECLINED` and long-expired entries (and their resolved `decisions`) so the snapshot
  JSONB stops growing forever. Guard so a never-resolved player is byte-identical (S2).
  *Files:* `engine/opportunities.ts`, `engine/serialize.ts` (if needed).
  *Acceptance:* `world.opportunities` length stays bounded over a long run; the
  no-opportunity golden master digest is unchanged.

- **P13.4 — Enrolment status is unambiguous.** Confirm `resolveDecision` sets the
  *accepted* education opportunity to `ACCEPTED` (it does, `opportunities.ts:505`) and
  that no sibling duplicate remains `OPEN`/`EXPIRED` to show "moment has passed" — the
  P13.1 guard plus a regression test. *Files:* `engine/__tests__/education.test.ts`.
  *Acceptance:* after enrolling, neither the Opportunities `active` nor `expired` list
  contains a "go back to study" entry for the program just started.

- *Phase acceptance:* ✅ `npm run typecheck && npm run typecheck:web && npm test` green
  (162 tests; +9 for Phase 13). Surfacing is now deduped by the *logical* offer, not
  the random id: a new shared `opportunityLogicalKey(opp)` (a `(kind, target)` key —
  Eunice / upgrade rung+venture / programId / new-venture spec / crowdfund venture /
  partnership partner+firm) plus `hasRecentEquivalentOffer(...)` suppress re-surfacing
  any offer that is still live or only just lapsed within
  `OFFER_REOFFER_COOLDOWN_MONTHS` (9), wired into every generative surfacer
  (`surfaceUpgrade`/`surfaceNewVenture` in `opportunities.ts`, `surfaceEducation` in
  `education.ts`, `surfaceCrowdfund`/`surfacePartnership` in `funding.ts`) — so a
  declined/expired juice stand, upgrade rung, or enrolment stops breeding duplicate
  rows (P13.1). A bounded `pruneOpportunities` sweep in `surfaceOpportunities` drops
  settled offers older than 18 months (and their fully-resolved decisions, keeping any
  whose delayed MEMORY is still pending), so `world.opportunities` stays bounded over a
  long life; a player who never sees an opportunity is byte-identical (the sweep early-
  returns, golden master unchanged — S2) (P13.3). The Passed projection
  (`toOpportunitiesDTO`) collapses `EXPIRED` rows to one per logical offer (the most
  recent by `surfacedMonth`), caps the list at 8, and hides any lapsed row whose offer
  is now OPEN/ACCEPTED/DECLINED — so an enrolment the player took up no longer reads
  "the moment has passed" (P13.2 + P13.4, ideas 19 & 6). 6 tests in
  `opportunityHygiene.test.ts` + 3 in `opportunityProjection.test.ts`; iceberg contract
  still green; determinism digest unchanged.

## Phase 14 — Loan lifecycle & financing controls (bug + feature) ✅ DONE

> Goal: loans actually **amortize and close**, the player can **see what they've paid
> and what's left**, and can **pay off early / resize installments** — for bank loans
> *and* friend/crowdfund loans. **Root cause (confirmed):** the phase-5 loop in
> `simulateOneMonth.ts` subtracts `monthlyPayment` from cash but **never decrements
> `loan.remainingPrincipal`** and never marks a fully-repaid loan `PAID` (only the
> collateral-seizure path in `assets.ts:275` ever does), so balances never fall and a
> paid-off loan lingers forever with live charges.
>
> **Covers ideas 4a (early payoff / adjust installment), 4b (paid-vs-remaining, balance
> not reducing), 4c (paid loan still shows), 9 (crowdfund installment total), 12 (loan
> option on every investment).** Depends on Phase 7 banking (`amortize`/`originateLoan`).

- **P14.1 — Amortize in the monthly loop.** In `simulateOneMonth` phase 5, split each
  `ACTIVE` loan's `monthlyPayment` into interest (`remainingPrincipal * monthlyRate`)
  and principal, decrement `remainingPrincipal`, and when it reaches ≤ 0 set
  `status = 'PAID'`, zero the payment, and stop charging it. Reuse the `amortize` math
  from `banking.ts`. Applies to bank **and** friend loans (`funding.ts`). *Files:*
  `engine/simulateOneMonth.ts`, `engine/banking.ts`. *Acceptance:* a loan's
  `remainingPrincipal` falls each month and the loan flips to `PAID` on its final
  payment; once `PAID` it no longer deducts cash. **This is a deliberate digest change
  for any world with a loan — commit it with a note (S2/P-X2).**

- **P14.2 — Pay off early & resize installments.** Add engine ops `repayLoan(world,
  loanId, amount)` (lump-sum against `remainingPrincipal`, closes to `PAID` at 0) and
  `setLoanInstallment(world, loanId, newMonthlyPayment)` (re-derives `termMonths`,
  validated against a floor that at least covers interest). Surface as
  `POST /saves/:id/loans/:loanId/repay` and `.../installment`. *Files:*
  `engine/banking.ts`, `server/app.ts`, `web/views/Money.tsx`, `web/api/client.ts`.
  *Acceptance:* paying excess cash against a loan reduces remaining/closes it and frees
  the monthly charge; raising the installment shortens the term; rejected when cash is
  insufficient or below the interest floor.

- **P14.3 — Paid-to-date & remaining on the Money view.** Project per-loan `principal`,
  `remainingPrincipal`, `paidToDate` (= `principal − remainingPrincipal`), and
  `monthsLeft` (already on the loan DTO). The player's own debt is visible per the P7
  S3 amendment; NPC loan internals still never leak. *Files:* `shared/dto.ts`,
  `server/projection/money.ts`, `web/views/Money.tsx`. *Acceptance:* the Money view
  shows paid vs remaining per loan and both reconcile to the engine; a `PAID` loan
  drops off the debts list; iceberg test green.

- **P14.4 — Crowdfund/friend-loan installment preview (idea 9).** When a `CROWDFUND`
  loan offer is surfaced, include the projected `monthlyPayment` + total repayment in
  the decision/quote projection so the player sees the installment **before** accepting.
  *Files:* `engine/funding.ts`, `server/projection/decisions.ts`,
  `web/views/Opportunities.tsx`. *Acceptance:* a friend-loan offer shows its monthly
  installment and total before acceptance; figures match what gets booked.

- **P14.5 — A financing option on every investment (idea 12).** Ensure **education
  enrolment** and every `NEW_VENTURE`/`ASSET_UPGRADE` decision exposes the
  `interaction: 'FINANCING'` slider (down-payment + loan) — not just asset upgrades.
  Education tuition becomes financeable (a study loan amortized like any other).
  *Files:* `engine/{opportunities,education}.ts`, `server/projection/decisions.ts`,
  `web/views/Opportunities.tsx`. *Acceptance:* enrolling offers a put-down-some /
  borrow-the-rest option; accepting books a study loan and the tuition drain is offset
  by the loan proceeds.

- *Phase acceptance:* ✅ `npm run typecheck && npm run typecheck:web && npm test` green
  (176 tests; +14 for Phase 14). Loans now **amortize and close**: two helpers in
  `banking.ts` — `loanPaymentDue` (the read-only cash a loan needs this month) and
  `amortizeLoanMonth` (splits the level payment into interest + principal, pays the
  balance down, and flips a fully-repaid loan to `PAID`, zeroing its payment) — are wired
  into `simulateOneMonth` phase 4 (company loans) and phase 5 (person loans), so a
  balance falls every month and a paid-off loan stops charging (P14.1). **This is the
  deliberate digest change called for above** — every world carries company loans, so the
  no-feature determinism still reproduces and diverges per seed (the unit determinism
  tests are value-free), but the DB golden master digest moves once; commit it as
  expected (S2/P-X2). The player can now **pay a loan off early** (`repayLoan` — a lump
  sum off the balance that closes the loan at zero and brings the payoff date forward) and
  **resize the installment** (`setLoanInstallment` — raising it shortens the term, lowering
  it lengthens it, rejected below the interest floor), surfaced at
  `POST /saves/:id/loans/:loanId/{repay,installment}` returning a `LoanActionResultDTO`,
  with controls on the Money view (P14.2). Each debt line now shows **paid-to-date vs
  remaining** (`DebtLine` gains `loanId` + `paidToDate`) and a `PAID` loan drops off the
  debts list (P14.3). A `CROWDFUND` friend-loan offer **previews its monthly installment
  and total repayment** in its option prose before acceptance, computed from the same
  `amortize` that books it so the figures match (P14.4, idea 9). And **education enrolment
  is now financeable** like any investment: it surfaces as a `FINANCING` slider (pay it
  yourself and/or take a study loan toward tuition). A study loan is unsecured — its
  proceeds land in cash as a liquidity bridge while the monthly tuition still drains
  (Phase 9 preserved), and the loan is repaid like any other; self-funding the whole cost
  books no loan and moves no cash up front (P14.5, idea 12). New `LoanError`;
  `repayLoan`/`setLoanInstallment`/`amortizeLoanMonth`/`loanPaymentDue` exported from
  `@island/engine`; `STUDY_LOAN_{MIN,MAX}_TERM_MONTHS`; `LoanActionResultDTO` +
  `toLoanActionResultDTO`; a `DebtRow` with repay/resize controls on the Money view;
  9 tests in `loanLifecycle.test.ts`, 2 each in `education.test.ts` (study loan) /
  `loanProjection.test.ts` (paid-to-date), 1 in `funding.test.ts` (installment preview);
  the iceberg contract stays green (the loan figures shown are the player's own books).

## Phase 15 — The wage model & worker progression (bug + realism) 🟠

> Goal: replace the opaque single `monthlyIncome` for **wage work** with a grounded
> `dailyRate × workdays` model, so the per-day figure the player sees and the money
> banked **agree**; start an unskilled worker at the Dominica base and let
> **skill / experience / tools / credentials** raise the rate over time; and give the
> player a screen to **see the skills they've earned**. **Confirmed gaps:** there is no
> daily-rate or days-per-month concept anywhere; `CONSTRUCTION_LABOR` is priced at
> $120/day in `shared/constants.ts:54` while the banked wage is an unrelated
> `rng.range(800,1400)` roll (`worldBuild.ts:153`); a credential currently changes no
> pay.
>
> **Covers ideas 1 (wage/month mismatch + base→skilled progression), 2 (ground in the
> ~$7.50/hr basic rate), 8 (credentials raise pay), 7 (a skills view).** Depends on
> Phase 8 ventures (the wage is "venture 0") and Phase 9 credentials.

- **P15.1 — A grounded wage model.** Add a `WageProfile` to a wage venture/agent
  (`{ dailyRate, workdaysPerMonth, hoursPerDay }`) and a shared `DOMINICA_BASE_DAY`
  constant (basic ~$7.50/hr → a new unskilled worker starts a defined % above the
  legal base, per idea 2). Derive `monthlyIncome = dailyRate × workdaysPerMonth`.
  *Files:* `shared/{constants,types}.ts`, `engine/{ventures,worldBuild,
  characterCreation/hydrate}.ts`. *Acceptance:* a construction worker's displayed
  daily rate × workdays equals the banked monthly income (idea 1 resolved); seed a
  new worker at the calibrated base.

- **P15.2 — Rate rises with skill, experience, tools & credentials (ideas 2, 8).**
  Make `dailyRate = base × f(experience, knowledge, credentialLevel, ownedTools)`,
  recomputed monthly. An unskilled start earns the base; months of `experience.*`
  growth, a tools upgrade (Phase 7 asset), and a completed credential each lift it,
  within a realistic ceiling. *Files:* `engine/{ventures,simulateOneMonth}.ts`.
  *Acceptance:* the same worker's daily rate climbs as experience/credential/tools
  accrue; a fresh certificate produces a visible pay increase (idea 8 resolved);
  deterministic per seed.

- **P15.3 — Independent side jobs unlock with experience (idea 1 cont.).** After a
  threshold of months/experience, surface paid-by-the-day or paid-on-completion side
  jobs for an experienced worker (gated like other opportunities). *Files:*
  `engine/opportunities.ts`. *Acceptance:* a green worker is not offered independent
  side jobs; an experienced one is.

- **P15.4 — A skills & credentials view (idea 7).** Add a `SkillsDTO` projecting the
  player's acquired knowledge/experience domains and credential level **as qualitative
  prose with descriptions** (no raw 0–1 scores — S3), exposed at
  `GET /saves/:id/skills`, rendered as a new web view. *Files:* `shared/dto.ts`,
  `server/projection/skills.ts` (new), `server/app.ts`, `web/views/Skills.tsx` (new),
  `web/App.tsx`. *Acceptance:* the player can see the skills they've earned with
  descriptions; iceberg test green (no numeric capitals leak).

- *Phase acceptance:* `typecheck` ×2 + `npm test` green; a construction worker starts
  at the Dominica base, the per-day and per-month figures reconcile, and the rate
  visibly grows with experience, tools, and a credential — all on a new Skills view.
  Deliberate, noted digest change where wage workers exist.

## Phase 16 — Jobs & the job market (feature) 🟡

> Goal: a real **job market** the player can browse and choose from — jobs with varying
> pay, **attached expenses** (transport, food), **qualification + experience
> requirements**, and **come-and-go availability**, just like opportunities — plus more
> job variety. The player weighs each job's net pay against its costs and switches
> trades by taking a new job. **Covers ideas 18 (job market) and 16 (more jobs).**
> Depends on Phase 15 (the wage model) and Phase 9 (credential gates).

- **P16.1 — Job posting model.** Add a `JobPosting` type (`{ id, title, industry,
  dailyRate/monthlySalary, attachedCosts: { transport, food, … }, minCredential,
  minExperience, stability, surfacedMonth, windowMonths }`) and a catalogue across the
  eight industries. *Files:* `shared/types.ts`, `engine/jobs.ts` (new, pure).
  *Acceptance:* postings round-trip through serialize; a default player with no job
  market is byte-identical (S2).

- **P16.2 — A market that opens and closes.** `surfaceJobs(world)` posts a rotating
  slate gated by the player's credentials/experience, drawn from `world.rng`, with
  windows that expire (reuse the Phase 13 hygiene so postings don't duplicate).
  *Files:* `engine/jobs.ts`, `engine/opportunities.ts`. *Acceptance:* postings appear
  and lapse over time; gated postings are hidden until the player qualifies;
  deterministic per seed.

- **P16.3 — Taking a job (net of expenses).** A `TAKE_JOB` decision replaces/var the
  player's wage venture and books the posting's `attachedCosts` as a monthly operating
  line, so the Money view shows **gross pay minus transport/food**. *Files:*
  `engine/{jobs,ventures,opportunities}.ts`, `server/projection/{decisions,money}.ts`.
  *Acceptance:* taking a higher-gross job with high transport cost can net **less**
  than a closer lower-gross one — the trade-off is visible and the player chooses.

- **P16.4 — Job market view + narrative.** A `GET /saves/:id/jobs` projection and a web
  "Jobs" view listing postings with pay, net-of-cost, and requirements (prose for the
  qualitative parts, S7). *Files:* `shared/dto.ts`, `server/projection/jobs.ts` (new),
  `server/app.ts`, `web/views/Jobs.tsx` (new), `web/App.tsx`, `narrative/decisions.ts`.
  *Acceptance:* the player browses available jobs, sees pay vs expenses vs
  requirements, and picks one; voice validator passes.

- *Phase acceptance:* `typecheck` ×2 + `npm test` green; a job market opens and closes,
  the player compares net pay across postings and switches jobs; digest change noted.

## Phase 17 — Venture realism: commitment, upgrades, shared assets, risk & exit 🟡

> Goal: ventures stop being free-stacking and frictionless. A full-time job **costs
> time**, so a side venture forces a real choice (stay / switch / hire an operator); a
> shared vehicle is **one** fuel cost, not one per business; ventures can **fail,
> fluctuate, and be exited** (discontinue / sell assets / shelve); the juice stand
> uses a **concrete, randomized** economic model. **Covers ideas 3 (time commitment +
> hire-an-operator + upgrade the business), 15 (shared-vehicle double-charge bug), 10
> (juice-stand economics + randomized sales), 17 (investments fail/fluctuate + exit).**
> Depends on Phase 8 ventures and Phase 12 assets/sales.

- **P17.1 — Time budget & commitment (idea 3).** Give each venture a `timeLoad`
  (a full-time job ≈ full); surfacing a hands-on venture that exceeds the player's free
  time presents the three-way choice — **stay**, **switch** (close/scale the current
  one), or **hire an operator** for a % of takings. A hired operator turns the venture
  passive at a wage/share cost. *Files:* `shared/types.ts`,
  `engine/{ventures,opportunities,simulateOneMonth}.ts`. *Acceptance:* a full-time
  worker can't silently also run a hands-on stand; choosing "hire" yields reduced but
  passive income net of the operator's cut.

- **P17.2 — Shared-asset operating costs (idea 15 — bug).** Attribute fuel/upkeep to
  the **physical asset**, not per-venture, so two ventures sharing one `VEHICLE` incur
  **one** fuel charge. Fix `totalOperatingCosts`/upkeep summation
  (`engine/ventures.ts`, `simulateOneMonth.ts:83`) to de-duplicate shared assets.
  *Files:* `engine/{ventures,assets,simulateOneMonth}.ts`. *Acceptance:* a player whose
  two ventures use one truck pays a single fuel/upkeep line; two trucks → two lines;
  digest change noted.

- **P17.3 — Juice-stand model (idea 10).** Model the side hustle concretely: a bag of
  passion fruit (~$150) yields ~350–500 bottles at ~$5, expenses = fruit + sugar +
  transport (+ operator share if hired), ~1 bag/month (up to 2+ in good months), **sales
  randomized** via `world.rng` to reflect competition and poor months (compose with the
  Phase 10 saturation factor). *Files:* `engine/ventures.ts`, `shared/constants.ts`.
  *Acceptance:* juice-stand monthly profit varies month to month around a realistic
  mean and reflects crowding; deterministic per seed.

- **P17.4 — Ventures fail, fluctuate & can be exited (idea 17).** Not every venture
  succeeds: on creation assign a hidden success/volatility profile so some underperform
  or fail; add player exit ops — **discontinue**, **sell assets** (reuse Phase 12 spot/
  patient sale), or **shelve** (pause, no income, reduced upkeep) when it can't be sold.
  *Files:* `engine/{ventures,assets,opportunities}.ts`, `server/app.ts`,
  `web/views/Money.tsx`. *Acceptance:* some ventures lose money/fluctuate; the player
  can discontinue, liquidate, or shelve one and the Money view reflects it.

- **P17.5 — Upgrade an existing business (idea 3 cont.).** Ensure the per-venture
  upgrade ladder (P8.3) is reachable for **any** active venture, not only the starting
  trade, so a business can grow past its initial stage. *Files:*
  `engine/opportunities.ts`. *Acceptance:* an established juice stand is offered a
  next-stage upgrade; accepting raises its output/cost.

- **P17.6 — Narrative for commitment, failure & exit.** Frame the stay/switch/hire
  choice, the bad-season fluctuation, and a wind-down in voice (S7). *Files:*
  `narrative/decisions.ts`. *Acceptance:* the prose passes the voice validator and
  leaks no raw success/volatility numbers (S3).

- *Phase acceptance:* `typecheck` ×2 + `npm test` green; one truck → one fuel line, a
  juice stand's takings swing realistically, a venture fails and is shelved, and a
  hands-on side hustle forces a genuine time trade-off; digest changes noted.

## Phase 18 — Deal-making: terms, returns & always-on funding 🟢

> Goal: investment and partnership offers become **negotiable** and **wealth-scaled**,
> crowdfunding is **always reachable** rather than a rare event, and schooling can be
> **paused and resumed**. **Covers ideas 5 (choose how you receive returns; offers
> scale with money + reputation), 14 (counter-propose partnership terms), 11
> (crowdfunding always available), 13 (pause/resume school).** Depends on Phase 11
> equity/crowdfunding/partnerships and Phase 9 education.

- **P18.1 — Choose your return structure (idea 5).** When the player *invests in
  someone else's* venture, offer a choice of how capital comes back —
  interest + principal, a dividend, or a share of revenue — each a different
  `BackerOffer`/claim shape on the funded party. *Files:* `shared/types.ts`,
  `engine/funding.ts`, `server/projection/decisions.ts`, `web/views/Opportunities.tsx`.
  *Acceptance:* the same opportunity can be taken as a loan, a dividend, or a revenue
  share, and the monthly inflow differs accordingly.

- **P18.2 — Offers scale with wealth & reputation (idea 5 cont.).** Make inbound
  invest-in-a-friend solicitations **rare and small** when the player is poor/unknown
  and **more frequent, larger, and riskier** as cash and `socialCapital*` rise.
  *Files:* `engine/{opportunities,funding}.ts`. *Acceptance:* a broke newcomer rarely
  gets solicited and only for small sums; a wealthy, well-known player gets bigger,
  more frequent (riskier) propositions; deterministic per seed.

- **P18.3 — Counter-propose partnership terms (idea 14).** Turn a `PARTNERSHIP`
  decision into a negotiable one: instead of a fixed 50/50, the player proposes an
  alternate split (e.g. 35% for a smaller contribution); the NPC accepts/counters/
  declines based on their hidden utility (no score shown — apply-and-find-out). *Files:*
  `shared/{types,dto.ts}`, `engine/{funding,company}.ts`, `server/app.ts`,
  `web/views/Opportunities.tsx`. *Acceptance:* proposing 35%-for-less is accepted,
  countered, or refused depending on the partner; the booked company reflects the
  agreed split.

- **P18.4 — Crowdfunding always available (idea 11).** Make raising money among friends
  a **standing action** (like the always-on upgrade ladder) rather than a surfaced
  one-off — the player can initiate it whenever they have a fundable venture, with the
  backer slate generated on demand. *Files:* `engine/funding.ts`,
  `engine/opportunities.ts`, `server/app.ts`, `web/views/Opportunities.tsx`.
  *Acceptance:* a player with a venture and friends can start a crowdfund at will; the
  slate still derives from backers' cash/personality.

- **P18.5 — Pause & resume schooling (idea 13).** Add `pauseEducation` / `resumeEducation`
  ops: pausing freezes `monthsRemaining` and stops the tuition drain; resuming
  continues from where it left off. *Files:* `engine/education.ts`, `server/app.ts`,
  `web/views/Opportunities.tsx`. *Acceptance:* a paused program stops charging tuition
  and makes no progress; resuming finishes the remaining months and confers the
  credential as normal.

- *Phase acceptance:* `typecheck` ×2 + `npm test` green; the player picks a return
  structure on an investment, counters a partnership to 35%, raises a crowdfund on
  demand, and pauses then resumes a course; iceberg clean, digest changes noted.

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
  bias), player loan applications, collateral, the bank-distress cascade. *(Player
  loan applications + risk-priced rates land in Phase 7 / P7.5; collateral and the
  fuller distress cascade remain here.)*
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
- **P-B10 — Accounts & multiplayer economy** (the largest upgrade; deferred by
  design). Partnering and crowdfunding with **other human players** (vs. the NPC
  partnerships/backers built in Phase 11) lands here, along with a shared world and
  reconciled decision streams.

---

*Build playbook v1.0 — companion to the five Island Life design documents and the
technical architecture specification.*
