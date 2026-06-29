# Island Life — Difficulty & Calibration Targets

Companion to `complexity.md`, `complexity_build_prompts.md`, and the technical playbook.
This doc fixes **what "realistic and hard" actually means in numbers**, so difficulty is a
*calibrated, testable property* of the simulation — not a vibe that drifts every time a
feature lands. It is the concrete form of the deferred balance pass (`P-X3`).

The thesis from the design review, in one line:

> **Difficulty should come from the world, not the dice. Most lives should be hard, skill
> should compound over the long run, and every failure should be reconstructable.**

Everything below turns that into thresholds and tests.

---

## 0. The four calibration laws (the non-negotiables)

These are constraints every future phase must keep green, the way S1–S7 are constraints on
every prompt. Call them **D1–D4**.

- **D1 — Asymmetric outcomes, not a wall.** The outcome distribution across many lives is
  *skewed*: most players end modest or worse, a few climb a lot. Not "everyone loses" (a
  treadmill) and not "everyone wins" (no stakes).
- **D2 — Skill compounds.** Over many seeds, skilled/patient play beats reckless play by a
  widening margin as the life lengthens. If it doesn't, the game is a slot machine.
- **D3 — The world is the difficulty, not the dice.** The dominant source of loss is
  *competition, macro conditions, and the player's own choices* — not single unlucky RNG
  rolls. Pure-chance ruin is rare and never sudden.
- **D4 — Legible failure.** Every bankruptcy is reconstructable from a short causal chain
  the player could have seen coming. No loss is a surprise with no antecedent.

If a new feature makes any of D1–D4 fail its test (below), the feature is mis-tuned, not the
law.

---

## 1. The target outcome distribution (D1)

Measured over a **cohort**: ≥ 200 seeds, a fixed neutral character build, played by a
**reference baseline policy** (a simple, non-expert "sensible" decision rule — take the
obvious opportunity, don't over-borrow), to a fixed horizon (e.g. 360 months / 30 years).

Outcome = real net worth at horizon relative to the starting position, bucketed:

| Bucket | Definition | Target share |
|--------|------------|:------------:|
| **Ruined** | bankrupt at least once; ends near zero | **20–35%** |
| **Treading water** | ends within ±50% of where they started, real terms | **35–50%** |
| **Climbed** | 2×–10× real growth | **15–25%** |
| **Thrived** | > 10× real growth | **3–8%** |

Shape rules:

- **Median life is "treading water," not "climbing."** Getting meaningfully richer is the
  exception, exactly as in a real small-island economy.
- **The ruin bucket is real but not the majority.** If > ~40% of *sensible* baseline plays
  go bankrupt, the game is a treadmill (fails D1) — dial down operating costs / loss
  volatility / shock frequency. If < ~10%, there are no stakes — dial them up.
- **"Thrived" must stay rare and must require good play, not luck** (this is also the D2
  test). A thriving outcome from the *reckless* policy is a calibration bug.

**Test — `D1_outcome_distribution`:** run the cohort headless via `tools/sim-cli` (extend
`run.ts` to emit a per-seed outcome bucket), assert each bucket share lands in its band.
Deterministic per seed, so the test is stable; it moves only when balance constants change,
and then deliberately (like the golden master, `P-X2`).

---

## 2. Skill must compound (D2)

Define three fixed policies the headless runner can execute without narrative/LLM:

- **`reckless`** — always takes the biggest opportunity, max leverage, no reserve.
- **`sensible`** — the baseline above (the D1 cohort policy).
- **`patient`** — keeps a cash reserve, prioritizes education/reputation early, borrows
  conservatively, diversifies before expanding.

**Targets, over the same ≥ 200 seeds:**

- At a **short** horizon (≈ 60 months), `reckless` may *lead* `patient` (early aggression
  pays off first — this is C3, "bad decisions feel good at first," working correctly).
- At the **full** horizon (≈ 360 months), `patient` **median** > `sensible` median >
  `reckless` median, and the **gap widens** with horizon.
- `reckless` has a **much fatter ruin tail** than `patient` (higher variance, worse median).

**Test — `D2_skill_compounds`:** assert the median ordering at the long horizon and that the
`patient − reckless` median gap at 360 months is strictly larger than at 60 months. This is
the single most important difficulty test — if it fails, difficulty is noise, not depth.

---

## 3. The world is the difficulty, not the dice (D3)

Difficulty should be **endogenous** (competition, macro web, the player's own leverage) far
more than **exogenous-random** (a hurricane, a black swan, a bad venture roll).

**Attribution target** — of all bankruptcies in the D1 cohort, classify the proximate cause:

| Cause class | Examples | Target share of ruins |
|-------------|----------|:----------------------:|
| **Endogenous** | over-leverage, competition (C9), recession via the macro web (C5), reputation spiral (C11), bad expansion timing | **≥ 70%** |
| **Exogenous-random** | single hurricane, black swan, a venture's volatility roll | **≤ 30%** |
| **Pure-chance sudden** | one RNG roll takes a solvent, sensibly-run player to zero in one month | **≈ 0% (cap ~2%)** |

Rules:

- **No one-roll ruin of a healthy player.** A single `world.rng` draw must never move a
  solvent, low-leverage player straight to bankruptcy. Shocks hit through *channels* that
  take months to bite (the Phase 20 ripple, arrears accruing before default) — never an
  instant kill. The player's existing arrears grace (`PLAYER_ARREARS_LIMIT = 3`) is the
  pattern; keep that shape everywhere.
- **Luck shapes the season, not the life.** Variance should change *how a year goes*, while
  the *trajectory over decades* is dominated by decisions (this is C8 done right).

**Test — `D3_world_not_dice`:** the headless runner tags each ruin with its proximate cause
(the engine already knows *why* a default fired); assert the class shares hit the table, and
assert **zero** instances where a player with leverage below a threshold and positive cash
trend goes bankrupt within one month of a single shock.

---

## 4. Legible failure (D4) — the most important UX constraint

A hard game is *fun* only if loss feels **earned and foreseeable**. Behind the iceberg, the
player can't see raw numbers — so the burden is on the *causal chain* being reconstructable
in prose.

**The rule:** every bankruptcy must be the end of a **traceable chain of ≥ 3 player-visible
signals** that appeared *before* the failure, spaced out enough to have acted on. The
canonical `complexity.md` C15 chain is the template:

> small loan → another loan → demand dips → inventory/idle → cash thins → a missed payment →
> credit tightens → another bad month → bankruptcy.

Concretely:

- **Each link must have surfaced as a player-facing entry or money-view change** at the time
  it happened (a lean-month note, a tightening-credit beat, an arrears warning) — not
  retroactively. The Phase 6.4 delayed-`MEMORY` machinery already proves we can connect a
  consequence back to its cause in voice; reuse it for the *terminal* chain.
- **No "silent" failures.** A bankruptcy whose causal chain has fewer than 3 prior visible
  signals is a calibration *bug*: either the pressure built too fast (fails D3's no-sudden
  rule) or the signals weren't surfaced (a projection/narrative gap).
- **The iceberg stays intact.** Legibility is *qualitative* — "money got tight," "the bank
  grew wary," "the season turned" — never the raw arrears count, NPL ratio, or macro number
  (S3 holds). The player reconstructs *the story*, not *the spreadsheet*.

**Test — `D4_legible_failure`:** for every ruin in a sampled cohort, assert the engine logged
≥ 3 distinct causal signals to the player feed in the N months before default, and that an
"obituary"/post-mortem entry can be assembled from them that passes the voice validator. This
is both a balance test (pressure didn't spike) and a content test (signals were surfaced).

---

## 5. Cadence of the big shocks

Rare-but-real, calibrated to the Dominica setting — not an annual disaster carousel.

| Shock | Source | Target frequency | Notes |
|-------|--------|------------------|-------|
| **Major hurricane** | `events.ts` | ~1 in 5–8 years per life | Already a trigger (`HURRICANE_MAJOR`); regional, seasonal, survivable with reserves. |
| **Recession / credit crunch** | macro web (P20.2/P20.3) | ~1 in 8–12 years, variable | Builds over months, mean-reverts; the main *endogenous* hard period. |
| **Black swan** (A7) | `events.ts` (P24.5) | ~1 in 15–25 years | Reshapes optimal strategy; must stay genuinely rare. |
| **Local competitive squeeze** (C9) | Phase 19/20.4 | triggered by success, not a clock | The "winning paints a target" pressure — frequency is *earned*, not random. |

Rules:

- **Shocks compose, they don't stack into instant death.** A hurricane *during* a recession
  is harder, but the player who kept a reserve (D2 `patient`) survives — that's the design
  working. Two shocks should never combine into an unavoidable one-month wipeout (D3).
- **Frequency is per-life expectation, drawn from `world.rng`** — so seed reproducibility
  holds and a given life might see more or fewer.

**Test — `cadence_shock_frequency`:** over the long-horizon cohort, assert each shock's
realized mean frequency lands in its band (with tolerance), and that no two-shock overlap
produces a sub-`PLAYER_ARREARS_LIMIT` instant bankruptcy of a low-leverage player.

---

## 6. The up-escalator must exist (the anti-treadmill guarantee)

D1's ruin/tread bands are downward pressure; without a credible path *up*, the game is
demoralizing. The climb must be real, earned, and slow:

- **Reinvestment compounds** — ploughing surplus into upgrades/education/diversification
  produces super-linear long-run growth for the `patient` policy (verified by D2).
- **Reputation is an asset that pays** — a long clean record visibly lowers borrowing cost
  and opens bigger deals (Phase 21), so good standing is a compounding advantage, not just
  the absence of a penalty.
- **Multiple paths reach "Climbed"** (A24) — no single dominant strategy. **Test —
  `paths_diversity`:** of the "Climbed"/"Thrived" outcomes, assert they arise from ≥ 4
  distinct industry/strategy mixes, not one optimal build. A single dominant path is a
  balance failure (and a C14/"math solves everything" failure).

---

## 7. How this stays green

- **Add a `difficulty:cohort` script** alongside `npm run sim` that runs the D1–D4 cohort
  headless (no DB, no LLM — pure engine, seeded) and prints the distribution, the skill-gap
  curve, the ruin-attribution table, and the legibility check.
- **Wire the four laws into CI as tolerance-banded assertions**, not exact equalities — they
  should fail on a *drift out of band*, and be re-baselined deliberately (with a note) when a
  balance constant is intentionally changed, exactly like the golden master (`P-X2`).
- **Run it after every Phase 19–27 prompt.** A new system that pushes a band out of range
  hasn't "made the game harder" — it's broken the calibration and must be re-tuned. Hardness
  is a *target*, not a direction.

---

## 8. The one-paragraph summary for the team

The game is **realistic** when the outcome distribution looks like a real small-island
economy: most lives tread water, a fifth-to-a-third hit ruin, a few climb, very few thrive
(§1). It is **hard in the good way** when skill compounds over decades (§2), when the world —
competition, recessions, your own leverage — is what beats you rather than the dice (§3), and
when every failure is the legible end of a chain you could have seen and acted on (§4), all
behind an intact iceberg. It is **not** hard in the bad way: no one-roll ruin, no opaque
loss, no treadmill with no way up (§3, §6). Tune to these bands, keep them green in CI, and
"realistic and hard to advance" stops being a hope and becomes a tested property of the build.

---

*Difficulty & calibration v1.0 — the testable form of `P-X3`. Laws D1–D4 join S1–S7 as
standing constraints; the `difficulty:cohort` run joins the green gate for Phases 19+.*
