# Island Life — Depth & Realism Build Playbook (Phases 19+)

This is the companion to `island_life_build_prompts.md`, extending it to turn the
design principles in **`complexity.md`** into sequenced, testable phases. It picks up
the numbering where the existing playbook ends (Phases 0–18 complete) and absorbs the
post-slice backlog (`P-B1`–`P-B10`) into a dependency-ordered plan.

- **Design source:** `complexity.md` (18 Core Mechanics `C1`–`C18`; 25 Advanced
  Elements `A1`–`A25`; the Democracy-4 meta-goal `#26`).
- **Build conventions:** identical to the existing playbook — `P<phase>.<n>` prompts,
  each with an **Acceptance** check and the **Files** it touches; a prompt is done only
  when `npm run typecheck && npm run typecheck:web && npm test` are green and acceptance
  holds.
- **Standing rules S1–S7 still apply to every prompt** (engine purity, determinism via
  `world.rng`, the iceberg, one schema, recomputed aggregates, the green gate, voice).

---

## Read this first — the honest prioritization

`complexity.md` is a vision, not a plan. Its 44 principles are **not** 44 equal features
— they collapse to about **8 distinct mechanics**, and they have a strict dependency
order. The single most important fact:

> **Almost everything interesting in `complexity.md` is blocked on one thing: the NPC
> decision engine is currently a stub.** `agents.ts:npcDecide` returns `SEEK_EMPLOYMENT`
> or `SAVE` and ignores every OCEAN trait, capital, and tendency already on the agent.
> "AI adapts" (C10), "people behave irrationally" (C7/A6), "success creates competition"
> (C9), "businesses learn" (A15), "AI personalities" (A23), "emergent stories" (A25), and
> "surprise even the designer" (C17) are **all the same unbuilt system** seen from
> different angles. Build that engine first and six principles light up at once.

**The Democracy-4 comparison (`#26`) is the most useful and most misread line in the
document.** Democracy 4 is deep because it is **selective**: ~40 variables in a dense web
of feedback loops, with *no* logistics, *no* per-citizen simulation, *no* supply chains.
Its depth is the *web*, not the *headcount*. The trap in `complexity.md` is the opposite
instinct — "simulate every citizen's mortgage" (A2), "every link in the supply chain"
(A12) — which is where ambitious sims die. **Favour the web (Phases 19–21) over the
headcount (Phases 23, 25, 27).**

### Recommended order, by cost vs. impact

| Phase | Theme | Impact | Cost | Verdict |
|------:|-------|:------:|:----:|---------|
| **19** | **Living NPC decision engine** | ⭐⭐⭐⭐⭐ | High | **Do first. The keystone.** |
| **20** | **The economic web (systemic interaction)** | ⭐⭐⭐⭐⭐ | Med | **Do second. This *is* `#26`.** |
| **21** | **Reputation, trust & memory** | ⭐⭐⭐⭐ | Low | **Do third. Cheap, high payoff.** |
| 22 | Information economy & imperfect info | ⭐⭐⭐ | Low | High value per unit cost. |
| 24 | The evolving market (tastes, tech, aging) | ⭐⭐⭐ | Med | Good once the web exists. |
| 26 | Time as a resource / prioritization | ⭐⭐⭐ | Low | Builds on Phase 17. |
| 23 | Supply chains, logistics & scarcity | ⭐⭐ | **High** | Expensive; defer or scope hard. |
| 25 | Scale, internal politics, crime | ⭐⭐ | **High** | Only matters at empire scale. |
| 27 | Political pressure & per-citizen life | ⭐ | **Very high** | The A2 trap. Probably never. |

**If you build only Phases 19, 20, and 21, you get ~80% of the "Democracy 4 feel."**
Everything after is diminishing returns at rising cost. Treat 23/25/27 as optional.

### Two standing rules this work adds

- **S2 is already right — keep it.** `complexity.md` asks for luck (C8), irrationality
  (C7), black swans (A7), and uncertain R&D (A16). None of this conflicts with
  determinism: every draw goes through `world.rng` (seeded), so the *same seed* still
  reproduces the *same game*. This is how roguelikes get both surprise and reproducibility.
  **Never reach for `Math.random()` to satisfy a "randomness" principle.** The temptation
  will be strong in Phases 19 and 24 — resist it.
- **S8 (new) — Abstract the busywork (C18/A2).** Every feature below must pass one filter
  before it ships: *is the **decision** realistic, or only the **chore**?* Refinancing debt
  is a decision (kept). Approving every paycheck, clicking every supply-chain link, reading
  every citizen's mortgage is a chore (abstract it to an aggregate). When a principle says
  "every person/link/store," read it as "the *aggregate behaviour* of all of them, surfaced
  only when it forces a player decision."

### Principle → phase map

> C5,C9,C22… → P20 · C7,C10,C17,A6,A15,A23 → **P19** · C11,A3,A11,A19 → P21 ·
> C2,C14,A1 → P22 · C13,A7,A10,A16,A20,A21 → P24 · C16,A14 → P26 · A4,A12,A13 → P23 ·
> C12,A5,A9,A17,A18 → P25 · A2,A8 → P27 · C1,C3,C4,C6,C8,C15,C18,A24,A25,#26 → already
> seeded across Phases 6–18, deepened by the web. (Letters: `C`=Core 1–18, `A`=Advanced
> 1–25 in `complexity.md`.)

---

## Phase 19 — The living NPC decision engine (THE KEYSTONE)

> **Covers C7 (irrational people), C10 (AI adapts), C17 (surprise the designer), A6
> (human psychology), A15 (businesses learn), A23 (AI personalities).** Absorbs backlog
> **P-B1** (firm formation) and **P-B2** (prospect-theory engine).
>
> Goal: replace the `npcDecide` stub (`agents.ts:13`) with a real utility-based engine
> driven by the **OCEAN traits, capitals, and derived tendencies already on every agent**
> (`openness…neuroticism`, `riskTolerance/lossAversion/patience`, the social capitals).
> Today every NPC is economically inert — they hold or look for work and nothing else, so
> the world cannot compete, adapt, or surprise. This phase is the foundation the rest of
> the document stands on; build it first.
>
> **Determinism note (S2/P-X2).** This is a deliberate digest change — NPC behaviour drives
> the simulation, so `simulateOneMonth` output moves the moment the engine is non-trivial.
> Commit the new golden-master digest with a note. Every new draw goes through `world.rng`.

- **P19.1 — Prospect-theory valuation.** Replace `npcDecide` with an `evaluateOptions`
  that scores candidate actions (seek work, start a business, expand, borrow, save, exit)
  using Kahneman–Tversky value (reference-dependent gains/losses, `lossAversion`),
  Prelec probability weighting, and hyperbolic time-discounting keyed off the agent's
  existing `patience`/`riskTolerance`. Pure, seeded. *Files:* `engine/agents.ts`,
  `engine/decision/` (new). *Acceptance:* a high-`lossAversion` agent and a high-
  `riskTolerance` agent facing identical options choose differently and reproducibly per
  seed; loss-framed options are over-weighted exactly as the model predicts.

- **P19.2 — Personality archetypes (A23).** Derive each NPC's *standing strategy* from
  their traits into one of the six `complexity.md` archetypes — Risk Taker, Conservative,
  Innovator, Cost Cutter, Brand Builder, Predator — as a soft weighting over P19.1's
  scores (not a hard label; an agent is "mostly conservative"). No new fields if it can be
  derived from OCEAN; otherwise one cached `strategyBias`. *Files:* `engine/agents.ts`.
  *Acceptance:* the same market seeded twice with different agent populations evolves
  differently (a predator-heavy parish sees price wars; a conservative-heavy one stays
  placid); the archetype is inferable from the agent's actions, never projected as a label.

- **P19.3 — Memory & learning (C10/A15).** Give agents a small bounded **observation
  memory** (recent player/competitor moves: undercut, expanded, defaulted) and let
  `evaluateOptions` condition on it: an agent who keeps losing on price stops competing on
  price and shifts to quality/premium; competitors copy a winning move. Memory is a fixed-
  size ring (S8 — aggregate, not a full history) and serializes with the agent. *Files:*
  `engine/agents.ts`, `shared/types.ts`, `engine/serialize.ts`. *Acceptance:* a player who
  repeatedly undercuts trains nearby agents to *stop* matching price and differentiate
  instead; the adaptation is visible in their subsequent actions; deterministic per seed.

- **P19.4 — Irrational overrides (C7/A6).** Layer bounded irrationality on top of the
  rational score: herd behaviour (pile into a trend), panic (over-cut in a downturn scaled
  by `neuroticism`), overconfidence (over-expand after a good run scaled by low
  `neuroticism`/high `extraversion`), and brand loyalty stickiness. These *perturb* the
  utility, they don't replace it (the best players still win over many games — C8). *Files:*
  `engine/agents.ts`. *Acceptance:* a boom produces visible over-expansion and a bust
  visible panic-cutting beyond what pure optimization would do; over many seeds, high-skill
  configurations still outperform — irrationality adds noise, not dominance.

- **P19.5 — NPC firm formation & exit (P-B1).** Wire `evaluateOptions` to a
  `START_BUSINESS` action so agents found firms when the expected value clears their
  threshold, and let failing firms exit — so the company count stops monotonically
  declining and new entrants replace closures. Reuse `company.ts` formation/closure.
  *Files:* `engine/agents.ts`, `engine/company.ts`, `engine/simulateOneMonth.ts` (phase 6).
  *Acceptance:* over a 120-month run the firm count is dynamically stable (births ≈ deaths,
  not a death spiral); a profitable industry attracts entrants; deterministic per seed.

- **P19.6 — Engine balance pass (P-X3).** Recalibrate the deferred gaps this engine
  exposes: payroll↔company-cash reconciliation, a real consumption model, hiring tied to
  firm decisions rather than the flat `applyAction` chance. *Files:* `engine/{company,
  simulateOneMonth,agents}.ts`. *Acceptance:* wages paid by firms reconcile against firm
  cash; unemployment moves because firms hire/fire on their P&L, not a constant.

- *Phase acceptance:* `typecheck` + `typecheck:web` + `npm test` green (new
  `decision/__tests__` suite); the determinism digest moves **once**, deliberately, with a
  committed note (S2/P-X2); the iceberg holds (archetypes, memory, utilities never cross
  the wire — S3); a long run shows a living economy (firm births/deaths, price wars,
  adaptation) where before it was inert.

---

## Phase 20 — The economic web (systemic interaction) — *this is `#26`*

> **Covers C5 (systems interact), C9 (success creates competition), C22→A22
> (interconnected financial system), and the Democracy-4 meta-goal `#26`.** Absorbs the
> banking-cascade slice of backlog **P-B3** and **P-B6** (systemic importance).
>
> Goal: make one event **ripple through many systems** instead of staying isolated. The
> pieces exist as stubs — `events.ts`, the company closure cascade, `checkBankSolvency`,
> `government.ts` — but they don't feed each other in a loop. Build the dense feedback web
> that is the actual source of Democracy-4 depth (`#26`): a handful of macro variables,
> tightly connected, each reading and writing the others each month. **Favour ~12 well-
> connected variables over 100 shallow ones (S8).**
>
> **Depends on Phase 19** — a ripple is only interesting if NPCs *respond* to it.

- **P20.1 — Macro state & feedback variables.** Add a `MacroState` to the world: base
  interest rate, credit availability, aggregate demand, construction activity, business
  confidence, consumer confidence — each a single number recomputed each month from the
  others plus the agent/firm/bank aggregates (S5 — derived, never hand-edited). *Files:*
  `shared/types.ts`, `engine/macro.ts` (new), `engine/serialize.ts`. *Acceptance:* the
  macro variables round-trip and are recomputed (not stored as truth); a no-event baseline
  is stable; deterministic per seed.

- **P20.2 — The ripple (the core loop).** Implement the canonical `complexity.md` cascade
  as feedback edges, run as a new ordered phase in `simulateOneMonth`: *rates ↑ → borrowing
  ↓ → construction ↓ → input demand ↓ → layoffs ↑ → unemployment ↑ → consumer spending ↓ →
  firm revenue ↓ → defaults ↑ → banks tighten → rates effectively ↑*. Each edge is a small
  weighted function; the loop closes. *Files:* `engine/macro.ts`, `engine/simulateOneMonth.ts`,
  `engine/{market,company,banking,government}.ts`. *Acceptance:* a rate shock (or a hurricane
  via `events.ts`) propagates measurably through ≥5 systems over the following months and
  then *mean-reverts*; the chain is legible in the aggregates; deterministic per seed.

- **P20.3 — Interbank linkage & systemic crisis (A22).** Let banks hold claims on each
  other so one bank failing **freezes credit** for solvent firms (not just its own
  borrowers): `lendingAppetite` contracts system-wide on a major failure, refinancing dries
  up, and the P20.2 loop amplifies it into a possible systemic crunch rather than an
  isolated bankruptcy. Reuse `checkBankSolvency`. *Files:* `engine/banking.ts`,
  `engine/macro.ts`. *Acceptance:* failing the largest bank triggers a measurable
  system-wide credit contraction and a wave of refinancing failures; a small bank failing
  does not; deterministic per seed.

- **P20.4 — Success creates competition (C9).** When the player (or any firm) crosses a
  market-share threshold in a parish×industry, surface a *response* through Phase 19: nearby
  agents cut price, enter the same trade, advertise, or poach — and at a higher threshold
  the government notices (antitrust vs. capture, P-B6). Generalize the Phase 10 saturation
  read into a targeted competitive response. *Files:* `engine/{agents,opportunities,
  government}.ts`, `engine/macro.ts`. *Acceptance:* a dominant player draws visible
  competitive entry/price pressure and, past a higher share, government attention; staying
  small avoids the target; deterministic per seed.

- **P20.5 — Web narrative & visibility.** Surface the *causes* in voice — "money got tight
  all over the island this season," "everybody's chasing the same trade you cornered" — as
  Layer-1/Layer-2 triggers, and add the macro mood (not raw numbers — S3) to the money
  view's market-watch line. *Files:* `narrative/{triggers,decisions}.ts`,
  `server/projection/money.ts`. *Acceptance:* a credit crunch and a competitive response
  each produce in-voice entries that pass the validator and leak no raw macro numbers.

- *Phase acceptance:* `typecheck` + `typecheck:web` + `npm test` green; the determinism
  digest moves deliberately (committed note); a scripted shock test asserts the full ripple
  and its mean-reversion; the iceberg holds (macro internals never cross the wire as
  numbers); the world now behaves as a connected web where one event echoes for months.

---

## Phase 21 — Reputation, trust & memory (cheap, high payoff)

> **Covers C11 (reputation matters), A3 (trust is a currency), A11 (reputation has
> memory), A19 (markets have memory).** Absorbs the reputation slice of P-B6.
>
> Goal: a single **reputation/trust ledger** that takes years to build and is lost in a
> month, remembered by banks, suppliers, employees, customers, and government. The
> substrate already exists — `keptPromises`, `brokenContracts`, the three social capitals,
> the Phase 11 friend-strain — but it is fragmented and has no decay/memory curve. Unify it
> into one slowly-moving, slowly-forgiving signal that the rest of the systems read.
>
> **Depends on Phases 19–20** (so reputation actually changes how NPCs/banks behave).
> **Low cost** — mostly wiring and a decay curve over fields that already exist.

- **P21.1 — The reputation ledger.** Add a derived, multi-dimensional reputation (financial
  reliability, fair dealing, employer quality, civic standing) computed from the existing
  promise/contract/capital fields with **asymmetric dynamics**: rises slowly, drops sharply,
  decays back toward neutral over *years* not months. Derived/recomputed (S5), not a new
  source of truth where the substrate exists. *Files:* `engine/reputation.ts` (new),
  `engine/simulateOneMonth.ts`, `shared/types.ts`. *Acceptance:* one default tanks financial
  reputation immediately and it recovers only over many months; a long clean record builds
  it slowly; deterministic per seed.

- **P21.2 — Reputation feeds the systems.** Wire it in: banks price loans and set approval
  off financial reputation (lands the rest of **P-B3**'s risk-priced
  `computeLoanInterestRate` with a cultural-capital bias); suppliers/partners demand upfront
  terms or offer better ones; employees (Phase 19 agents) avoid or seek the player as an
  employer; government permit speed reflects civic standing. *Files:* `engine/{banking,
  funding,agents,government}.ts`. *Acceptance:* the canonical bankruptcy cascade from
  `complexity.md` C11 holds — after a default, banks charge more, suppliers want cash,
  employees shy off — and each effect fades on the recovery curve; deterministic per seed.

- **P21.3 — Markets remember (A19).** Customer-side reputation persists: a quality/scandal
  event (e.g. a food-poisoning beat) depresses a venture's demand and recovers only slowly
  even after the cause is fixed, with lingering competitor advantage. *Files:*
  `engine/{ventures,market,events}.ts`. *Acceptance:* a scandal event cuts a venture's take
  and the recovery lags the fix by many months; deterministic per seed.

- **P21.4 — Reputation narrative & money view.** Surface standing as **prose bands**, never
  a score (S3) — on the skills/money views and as triggered entries ("the bank remembers";
  "people trust you with bigger jobs now"). *Files:* `server/projection/{money,skills}.ts`,
  `narrative/decisions.ts`, `web/views/{Money,Skills}.tsx`. *Acceptance:* the player reads
  their standing qualitatively; the iceberg test confirms no raw reputation number leaks.

- *Phase acceptance:* `typecheck` + `typecheck:web` + `npm test` green; reputation is
  additive over existing fields so the no-reputation-event baseline digest is unchanged
  where possible (note any deliberate move); the iceberg holds; a default's long shadow is
  demonstrable end-to-end.

---

## Phase 22 — Information economy & imperfect information

> **Covers C2 (imperfect information), C14 (don't let math solve everything), A1
> (information is a commodity).**
>
> Goal: stop handing the player clean numbers. The iceberg already hides *mechanics*; this
> phase makes *information itself* a purchasable, imperfect good — market-research forecasts
> given as **ranges** (`11,000–16,000`, not `14,382`), credit ratings, competitor
> intelligence — so a player who invests in information has an edge (A1) and pure
> spreadsheet optimization can't win (C14).
>
> **Low cost, high flavour.** Depends on the macro web (Phase 20) for something worth
> forecasting.

- **P22.1 — Forecasts as ranges.** Add an information layer that converts hidden future
  state (next-season demand, price trend) into a **confidence interval** whose width
  reflects volatility and the player's paid information level. *Files:* `engine/info.ts`
  (new), `server/projection/`. *Acceptance:* a forecast surfaces as a range, not a point;
  the true outcome lands inside it most of the time but not always; deterministic per seed.

- **P22.2 — Buy better information.** Surface market-research / credit-agency / scouting as
  purchasable actions (a cost for a *narrower* range or a competitor read), reusing the
  opportunity/financing plumbing. *Files:* `engine/{info,opportunities}.ts`,
  `server/app.ts`, `web/`. *Acceptance:* paying narrows the forecast band and reveals
  otherwise-hidden competitor signals; skipping it leaves the player guessing.

- **P22.3 — Information narrative.** Frame forecasts and intelligence in voice — a research
  firm's hedged estimate, a rumour from the market — never as a bare stat (S3, S7). *Files:*
  `narrative/decisions.ts`. *Acceptance:* the prose conveys the uncertainty and passes the
  validator.

- *Phase acceptance:* green gate; the iceberg holds (the *true* number behind a range never
  crosses the wire); a player who buys information measurably out-decides one who doesn't,
  over many seeds.

---

## Phase 24 — The evolving market (tastes, technology, aging)

> **Covers C13 (the market evolves), A7 (black swan events), A10 (culture), A16 (innovation
> isn't guaranteed), A20 (businesses age), A21 (dynamic consumer trends).** Absorbs P-B8's
> drift mechanics where they touch demand.
>
> Goal: there is no single permanent "best strategy." Consumer tastes drift, technology
> makes equipment obsolete, parishes have distinct cultural demand, R&D pays off only
> sometimes, and assets age. The substrate (`Good.seasonality`, parish fields, `Asset.value`)
> exists but nothing changes over the long run. **Depends on Phases 19–20.**

- **P24.1 — Consumer taste & trend drift (A21/C13).** Let goods' effective demand drift
  organically from events, demographics, and social influence (health trend cuts sugary
  drinks; a celebrity beat spikes one good) — emergent, not scripted, all via `world.rng`.
  *Files:* `engine/{market,events}.ts`, `shared/types.ts`. *Acceptance:* the most profitable
  trade shifts over a long run without a scripted event; deterministic per seed.

- **P24.2 — Culture per parish (A10).** Give each parish a cultural demand profile (a
  tourist parish skews luxury, an agricultural one practical) that biases local demand and
  marketing effectiveness. *Files:* `shared/types.ts`, `engine/market.ts`, `worldBuild.ts`.
  *Acceptance:* the same good sells differently across parishes; deterministic per seed.

- **P24.3 — Asset aging & obsolescence (A20).** Assets depreciate and become inefficient
  over time (rising upkeep, falling output) so the player must reinvest; technology steps
  occasionally make a whole asset class obsolete. *Files:* `engine/{assets,ventures,
  simulateOneMonth}.ts`. *Acceptance:* an un-renewed venture's margins decay over years; a
  tech step devalues old equipment; deterministic per seed.

- **P24.4 — R&D with uncertain payoff (A16).** An optional research action: spend for a
  *probability* distribution of outcomes (mostly small gains, rarely a breakthrough, often
  nothing) via `world.rng`, never a guaranteed return. *Files:* `engine/research.ts` (new),
  `engine/opportunities.ts`. *Acceptance:* identical research spend yields different,
  seed-reproducible outcomes across the documented distribution.

- **P24.5 — Black swans (A7).** A rare-event layer distinct from seasonal events: low-
  probability, high-impact shocks (pandemic, new technology, major spill) that reshape
  optimal strategy — calibrated rare, not annual. *Files:* `engine/events.ts`. *Acceptance:*
  black swans fire rarely over a long run, hit hard, and shift the best strategy; the macro
  web (Phase 20) propagates them; deterministic per seed.

- *Phase acceptance:* green gate; the iceberg holds; a 240-month run shows the optimal
  strategy genuinely changing over time (taste shifts, obsolescence, a black swan), not a
  solved-once equilibrium.

---

## Phase 26 — Time as a resource / prioritization

> **Covers C16 (the player must prioritize), A14 (time is a resource).** Builds directly on
> Phase 17's `timeLoad`/operator model.
>
> Goal: the player can't do everything each month. Generalize Phase 17's per-venture time
> load into a whole **attention/management budget** — a labour strike, a supplier shortage,
> a launch, an audit, a price war, an acquisition all competing for limited attention, where
> the skill is choosing what to ignore (C16). **Abstract the busywork (S8):** unattended
> matters resolve on a default, they don't pile up as chores.

- **P26.1 — The attention budget (A14).** Give the player a monthly management capacity;
  hands-on activities (running a venture, negotiating, inspecting) draw it down. Surface a
  prioritization screen when demands exceed capacity. *Files:* `shared/types.ts`,
  `engine/{ventures,opportunities}.ts`, `server/projection/`, `web/`. *Acceptance:* a player
  stretched thin must choose which matters to act on; unaddressed ones resolve on a
  (usually worse) default, not as an infinite backlog (S8); deterministic per seed.

- **P26.2 — Competing demands (C16).** Generate the `complexity.md` slate — strike,
  shortage, launch, audit, price war, acquisition — as attention-costing events the player
  triages. Reuse the opportunity/decision plumbing. *Files:* `engine/{events,
  opportunities}.ts`, `narrative/decisions.ts`. *Acceptance:* multiple simultaneous demands
  force a real triage with visible consequences for the ignored ones.

- *Phase acceptance:* green gate; the iceberg holds; prioritization is a felt mechanic, and
  the unattended path degrades gracefully rather than nagging.

---

## Phase 23 — Supply chains, logistics & scarcity  *(expensive — scope hard or defer)*

> **Covers A4 (logistics wins wars), A12 (supply chains), A13 (resource scarcity).**
>
> ⚠️ **Cost warning.** This is the first phase whose *minimum* viable version is large, and
> the `complexity.md` framing (A12 "every link can fail," A4 "one bridge can change an
> economy") invites a multi-week subsystem. **Do not build the full graph.** Model the
> *aggregate* (S8): a small number of choke points and scarce inputs, not a per-shipment
> simulation. Defer entirely unless logistics is meant to be a pillar of the game.

- **P23.1 — Scarce inputs (A13).** Make a few key inputs finite and contested — skilled
  workers, fuel, a critical material — so their price/availability rises with aggregate
  demand and gates expansion. Reuse the macro web (Phase 20). *Files:* `engine/{macro,
  market}.ts`, `shared/types.ts`. *Acceptance:* a boom drives up a scarce input's cost and
  throttles everyone's growth, not just the player's; deterministic per seed.

- **P23.2 — Choke points & disruption (A4).** Model transport/route access as a parish-level
  factor (not per-truck): a flood/landslide event cuts a route, stores run dry, prices spike,
  and whoever has stock or an alternative profits. *Files:* `engine/{events,market}.ts`.
  *Acceptance:* a route-cut event measurably disrupts supply and rewards resilience;
  deterministic per seed.

- **P23.3 — Abstracted supply chain (A12).** Represent the farm→processor→…→retailer chain
  as a small set of stages with a fragility factor, **not** individual shipments — a stage
  failure ripples (S8). *Files:* `engine/supply.ts` (new). *Acceptance:* a stage failure
  raises downstream cost/scarcity; the model stays aggregate (no per-link micromanagement).

- *Phase acceptance:* green gate; the iceberg holds; logistics matters *and* the
  implementation stayed aggregate. **If this phase balloons, cut it — it is not load-bearing
  for the core experience.**

---

## Phase 25 — Scale, internal politics, hidden weaknesses & crime  *(empire-scale only)*

> **Covers C12 (scale increases complexity), A5 (internal politics), A9 (hidden weaknesses),
> A17 (employees aren't interchangeable), A18 (crime).** Absorbs the rest of P-B5/P-B6.
>
> ⚠️ Only meaningful once a player can run *many* businesses. Until acquisition/empire play
> exists (P-B5), this is premature. Sequence after the player can reach that scale.

- **P25.1 — Diseconomies of scale (C12).** Past a size threshold, new problems appear that
  small operators never face — coordination loss, regional variance, oversight cost — so a
  big operation is *not* a small one with bigger numbers. *Files:* `engine/company.ts`,
  `shared/types.ts`. *Acceptance:* per-unit efficiency falls past a scale threshold absent
  active management investment; deterministic per seed.
- **P25.2 — Internal politics (A5).** Large firms develop internal friction (departments
  compete, mistakes get hidden) as an efficiency drag scaling with size/neglect. *Acceptance:*
  a large neglected firm loses output to internal inefficiency; attention (Phase 26) mitigates.
- **P25.3 — Hidden weaknesses & crime (A9/A18).** Firms can carry concealed liabilities
  (debt, poor maintenance, fraud, theft) that surface as eventual failures; the player
  invests in prevention vs. accepting losses. *Acceptance:* a firm that looks healthy can
  break from a hidden weakness; prevention spend trades against the loss rate.
- **P25.4 — Employees aren't interchangeable (A17).** Key personnel carry individual quality;
  losing a manager dents performance for a stretch. Reuse the rich agent fields. *Acceptance:*
  replacing a strong manager measurably reduces a firm's output until recovery.

- *Phase acceptance:* green gate; the iceberg holds; scale genuinely changes the game.
  **Defer this whole phase until empire-scale play exists.**

---

## Phase 27 — Political pressure & the citizen-life cascade  *(the A2 trap — probably never)*

> **Covers A8 (political pressure) and A2 (every person has a life).**
>
> ⚠️ **A2 is the single most expensive principle in `complexity.md` and the classic sim-
> killer.** Simulating every citizen's family, mortgage, and children is months of work for
> marginal felt impact, because the player can't perceive most of it. **Do the aggregate
> version or skip it.** Listed for completeness, not recommended.

- **P27.1 — Emergent politics (A8).** Replace one-button government with pressure from
  aggregates already in the world — business lobbying, unemployment-driven sentiment, union
  bargaining — so policy *emerges* from the macro web (Phase 20) rather than firing on a
  timer. *Files:* `engine/government.ts`, `engine/macro.ts`. *Acceptance:* policy shifts
  trace to economic pressure (high unemployment → public works; player dominance →
  scrutiny); deterministic per seed. *(This much is worth doing — it's cheap on Phase 20.)*

- **P27.2 — Citizen-life cascade, aggregated (A2).** Model the *aggregate* of the
  job-loss→family-spends-less→local-business-suffers chain as a demand multiplier in the
  macro web, **not** per-citizen households (S8). *Files:* `engine/macro.ts`. *Acceptance:*
  a layoff wave measurably depresses local demand through the aggregate; **no per-citizen
  mortgage/children simulation is built.** *(Per-citizen detail beyond this is explicitly
  out of scope — the cost/benefit doesn't justify it.)*

- *Phase acceptance:* green gate; politics emerges from the web; the citizen cascade is an
  aggregate effect, not a simulation of every person. **Anything beyond P27.1 + the
  aggregate P27.2 is not recommended.**

---

## What was already there (don't rebuild it)

Several `complexity.md` principles are **already satisfied** by Phases 6–18 — credit them,
deepen them via the web, don't reimplement:

- **C1 opportunity cost** — the financing slider, the venture portfolio, and Phase 17's time
  budget already force trade-offs. Phase 26 deepens it.
- **C3 delayed consequences** — the Phase 6.4 delayed `MEMORY` already does this.
- **C4 every advantage creates a problem** — upgrades already add operating cost/upkeep;
  Phase 25 (scale) extends it.
- **C6 never enough money** — cash scarcity and seasonal lean months are already felt.
- **C8 luck matters but doesn't dominate** — events + Phase 17 venture volatility, all
  seeded; Phase 24 adds black swans.
- **C15 failure from many small mistakes** — the arrears→selective-default cascade already
  models this; the web (Phase 20) makes the chain longer.
- **A24 multiple paths to success** — eight industries + cross-domain ventures already exist.
- **A25 emergent stories & C17 surprise** — these are **outcomes**, not features. They
  appear for free once Phases 19–20 give the systems enough agency to interact. Don't build
  them; build the substrate and let them emerge.

---

## Cross-cutting (carry through every phase above)

- **P-X1 iceberg test** — extend the denylist as each phase adds hidden state (utilities,
  archetypes, memory, macro internals, reputation scores, true-value-behind-a-range).
- **P-X2 golden master** — Phases 19 and 20 move the digest deliberately; commit each move
  with a note. Phases 21–27 should stay additive/byte-identical on their no-feature baseline
  wherever possible.
- **P-X4 save-format versioning** — `MacroState`, the reputation ledger, agent memory, and
  attention budget all change the snapshot JSONB shape; bump `schemaVersion` and add the
  migration path the first time each lands.

---

*Depth & realism playbook v1.0 — companion to `complexity.md` and
`island_life_build_prompts.md`. Build 19 → 20 → 21 first; treat 23/25/27 as optional.*
