# Island Life

A Dominica life & economics simulator — *simulation-first*. The five design
documents in this repo (`island_life_*.md`) specify the game; this codebase
implements it, starting from the engine.

See `island_life_technical_architecture.md` for the full stack, schema, API, and
build sequence. This README covers what is **built so far** (Phases 0–6).

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Monorepo scaffold (npm workspaces, TS, Vitest) | ✅ done |
| 1 | Headless deterministic engine + `simulateOneMonth` + CLI + tests | ✅ done |
| 2 | Postgres persistence (schema, save/load, projection read model) | ✅ done |
| 3 | Character creation → agent #1 | ✅ done |
| 4 | Fastify API + iceberg projection + template narrative + React/Vite client | ✅ done |
| 5 | Narrative LLM (Claude Opus 4.8) | ✅ done |
| 6 | One decision loop → **vertical slice** | ✅ done |

## Quick start

```bash
npm install
npm run typecheck          # tsc across all packages
npm test                   # engine determinism suite (Vitest)
npm run sim -- --seed 42 --months 60 --pop 400
```

The CLI prints a periodic macro snapshot (GDP proxy, unemployment, average cash,
firm health H/D/C, max bank NPL, active events) and a final player line. The same
`--seed` always yields the same `world digest` — the determinism guarantee the
whole design rests on.

## Persistence (Phase 2, in progress)

Postgres via Drizzle, snapshot-first (the engine owns a JSONB `WorldState`;
normalized projection tables are a read model added in P2.2).

```bash
cp .env.example .env          # set DATABASE_URL to your local Postgres
npm run db:up                 # optional: start the bundled Postgres (needs Docker)
npm run db:generate           # regenerate migration SQL from the Drizzle schema (offline)
npm run db:migrate            # apply migrations to the DB in DATABASE_URL
```

`db:generate` is offline and always works (it just diffs the schema). `db:migrate`
needs a reachable Postgres whose credentials match `DATABASE_URL` — either the
bundled `docker compose` instance or your own. Initial schema: `save` +
`world_snapshot`.

## API + web (Phase 4)

The Fastify API projects the world into player-facing DTOs (the **iceberg
boundary** — hidden state never crosses the wire) and renders routine months
through the Layer-1 template narrative engine. The React/Vite client reads those
DTOs and lets you click through months.

```bash
npm run serve              # Fastify API on :3001 (needs DATABASE_URL)
npm run dev:web            # Vite client on :5173, proxies /api → :3001
npm run typecheck:web      # the web client typechecks separately (DOM/JSX)
npm run db:apicheck        # end-to-end: begin a life, advance, assert month++ in Postgres
```

Open http://localhost:5173, **Begin a life**, and **Advance to next month** — the
Daily Life feed fills with template prose and the Money view tracks your cash.
Routes: `POST /saves`, `GET /saves/:id/{state,money,feed,community,opportunities}`,
`GET|POST /saves/:id/decisions/:did`, `POST /saves/:id/advance`. The single most
important test is the **iceberg-leak contract**
(`packages/server/src/__tests__/iceberg.test.ts`): every DTO is snapshot and asserted
to contain no hidden key.

The **Phase 6 vertical slice**: play a fishing life and, once you are known enough
around the market, **Eunice's standing supply contract** surfaces in the
Opportunities view. The decision is unlabelled — a steady monthly arrangement vs.
the freedom of selling at the wharf — and your choice changes how your income
behaves from then on. Months later a **Memory** entry surfaces in the feed that
connects back to the choice without naming it. The whole loop is verified offline by
`packages/narrative/src/__tests__/slice.test.ts`.

## Layout

```
packages/shared   — single source of truth: enums, types, seed constants, DTOs
packages/engine   — pure TS simulation (rng, worldBuild, simulateOneMonth, …)
packages/narrative— Layer-1 template engine (renderMagnitude, generateMonthlyEntries)
packages/server   — Fastify API + the iceberg projection layer + persistence
packages/web      — React/Vite client (Daily Life + Money views)
tools/sim-cli     — headless runner (the Phase 1 deliverable)
```

Dependency rule: `web → server → {engine, narrative} → shared`. The engine has
**no I/O** — it takes a `WorldState` and mutates it, which is what makes it
deterministic and testable headless.

## What the engine models today

Seeded RNG · market price dynamics (supply/demand, seasonality, event shocks,
mean reversion) · company revenue/cost/solvency with a closure cascade
(unemployment, loan defaults, parish property softening) · bank NPL & lending
appetite with recovery · a government (taxes, aging policies) · random events
(hurricanes, drought, fuel shocks, fishing-stock decline, tourism booms) ·
agent wages/consumption/personal-loan default · knowledge/experience drift ·
hidden legacy accrual.

Every number has a cause, and different seeds diverge — a hard-luck seed can
collapse the fishing economy while a kinder one keeps half the firms alive.

## Deliberately deferred (calibration & later-phase systems)

These are **known gaps**, not bugs — they belong to later phases and are called
out so the engine's current behaviour reads honestly:

- **No firm formation.** Companies can close but none are created yet, so the
  firm count only ratchets down. NPC `START_BUSINESS` (Agents) is a later system.
- **Payroll not reconciled cash-for-cash.** Company P&L treats payroll as part of
  `baseOperatingCosts`; the agent-side wage is paid separately. A later phase ties
  company cash to payroll.
- **Crude consumption.** Agents spend living costs + 50% of surplus, so average
  cash still drifts up over decades. A real consumption/savings model comes later.
- **Simplified NPC decisions.** The full prospect-theory engine (Kahneman &
  Tversky) from the design doc is stubbed to seek-work / hold for now.
- **Single decision, single channel.** Phase 6 ships one genuine decision (Eunice's
  standing supply contract) surfaced through the MARKET_NETWORK information channel.
  The full channel catalogue, negotiation sub-interface, and the wider opportunity
  set are later work; the loop — surface → choose → consequence — is proven end to end.

## Determinism

Every stochastic draw goes through `world.rng` (mulberry32, serializable state).
A `(seed, decisions)` pair reproduces a world exactly — this is what lets the game
later say *"you made the right decision, you just got unlucky"* and mean it.
