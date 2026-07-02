import {
  FULL_TIME_LOAD,
  OFFER_REOFFER_COOLDOWN_MONTHS,
  hasRecentEquivalentOffer,
  opportunityLogicalKey,
} from '@island/shared';
import type {
  DecisionOption,
  DemandKind,
  DemandSpec,
  NPCAgent,
  Opportunity,
  PlayerDecision,
  Venture,
  WorldState,
} from '@island/shared';
import { clamp, clamp01 } from './rng';
import { activeVentures, discontinueVenture, ventureGrossIncome, ventureTimeLoad } from './ventures';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 26 — time as a resource / prioritization (C16, A14).
//
// Phase 17 gave each hands-on venture a standing time load. This layer generalizes
// that into a whole monthly ATTENTION budget and makes the player triage against it.
// A working month holds only so much management bandwidth (`ATTENTION_CAPACITY`);
// running ventures hands-on already spends part of it, and transient MATTERS — a
// supplier shortage, a labour dispute, a launch, an audit, a price war, a buyer
// circling — each cost attention to steer. When several land at once the player
// cannot handle them all, so the skill is choosing what to ignore (C16). A matter the
// player does not act on resolves on its own DEFAULT when its window closes — usually
// the worse outcome — and then it is gone; it never piles up as a chore (S8, A14).
//
// Like reputation, the macro web, and information, this is player-only and lives
// entirely on the surfacing/decision layer the server drives — never inside
// `simulateOneMonth`. Demands roll on their OWN (seed, month) side-stream, independent
// of `world.rng`, so the pre-Phase-26 seed stream and the determinism digest stay
// byte-identical until a matter actually lands and legitimately moves the player's
// money. The attention budget itself is DERIVED from the player's ventures and their
// open/handled demands (S5) — nothing new is persisted for it.
// ─────────────────────────────────────────────────────────────────────────────

// One working month of management bandwidth, on the same 0–1 scale as Phase 17's time
// load (FULL_TIME_LOAD). Everything below is a fraction of it.
export const ATTENTION_CAPACITY = FULL_TIME_LOAD;

// The share of a hands-on venture's time load that is ongoing MANAGEMENT (deciding,
// checking, chasing) rather than pure labour — so running businesses already eats into
// the budget, and a diversified hands-on operator has little left to firefight with.
const VENTURE_MANAGEMENT_DRAW = 0.5;

// How much of the budget a matter of a given kind draws to HANDLE, before its severity
// scales it up. Chosen so a lightly-committed player can usually manage one matter,
// sometimes two, but three at once forces a real choice about what to drop.
const BASE_ATTENTION_COST: Record<DemandKind, number> = {
  SUPPLIER_SHORTAGE: 0.24,
  LABOUR_TROUBLE: 0.3,
  LAUNCH: 0.3,
  AUDIT: 0.26,
  PRICE_WAR: 0.3,
  ACQUISITION: 0.2,
};

// Per-eligible-month chance each kind of matter arises, rolled off the side-stream.
// Calibrated so matters are a regular feature of a busy life without being constant,
// and occasionally coincide — the triage moment. LAUNCH is near-certain because it is
// gated to the month right after a venture is stood up (it should reliably follow).
const DEMAND_PROBABILITY: Record<DemandKind, number> = {
  SUPPLIER_SHORTAGE: 0.05,
  LABOUR_TROUBLE: 0.05,
  LAUNCH: 0.85,
  AUDIT: 0.02,
  PRICE_WAR: 0.05,
  ACQUISITION: 0.03,
};

// Give a new life a little room before matters start competing for attention, keep the
// window short (act soon or it resolves itself), and cap how many press at once so the
// player triages a real slate rather than an unbounded pile.
const DEMAND_FROM_MONTH = 4;
const DEMAND_WINDOW = 2;
const MAX_OPEN_DEMANDS = 3;

// A crowded trade for the PRICE_WAR gate — mirrors ventures.ts's saturation baseline.
const CROWDED_TRADE = 6;
// A venture is "doing well" enough to attract a buyer (ACQUISITION) once it has grown.
const ACQUISITION_OUTPUT_SCALE = 1.6;
// The floor a fumbled launch / neglected matter drops a venture's demand memory to; it
// then recovers over months through the existing recoverVentureReputations plumbing.
const OUTPUT_FLOOR = 0.2;

// ── The attention budget (P26.1) ─────────────────────────────────────────────

// The player's monthly management capacity. A constant for now — one person's month.
export function attentionCapacity(_agent: NPCAgent): number {
  return ATTENTION_CAPACITY;
}

// Attention already spoken for by running ventures hands-on. An operator-run (passive)
// venture draws none (ventureTimeLoad is 0 for it), so hiring out genuinely frees the
// mind as well as the hours.
export function committedAttention(world: WorldState): number {
  const drawn = activeVentures(world.player).reduce((s, v) => s + ventureTimeLoad(v), 0);
  return clamp01(drawn * VENTURE_MANAGEMENT_DRAW);
}

// The demand decisions the player has HANDLED this month, and the attention they drew —
// so a second and third matter compete against what earlier ones already cost. Excludes
// one decision by id (the one being resolved right now, so it is not counted twice).
function attentionSpentThisMonth(world: WorldState, excludeDecisionId?: string): number {
  let spent = 0;
  for (const d of world.decisions) {
    if (d.kind !== 'MANAGEMENT_DEMAND') continue;
    if (d.resolvedMonth !== world.month || d.id === excludeDecisionId) continue;
    const opt = d.options.find((o) => o.id === d.chosenOptionId);
    if (opt?.effect.demandAction !== 'HANDLE') continue;
    const opp = world.opportunities.find((o) => o.id === d.opportunityId);
    if (opp?.demand) spent += opp.demand.attentionCost;
  }
  return spent;
}

// What is left of the budget for one more matter this month (0–1). Excludes the given
// decision from the "already handled" tally so the gate does not count itself.
export function freeAttention(world: WorldState, excludeDecisionId?: string): number {
  const left =
    attentionCapacity(world.player) -
    committedAttention(world) -
    attentionSpentThisMonth(world, excludeDecisionId);
  return Math.max(0, left);
}

// Whether the player has the attention left to HANDLE this matter (P26.1 — the budget
// is a real constraint: over it, they must let something go).
export function canHandleDemand(world: WorldState, demand: DemandSpec, decisionId: string): boolean {
  return demand.attentionCost <= freeAttention(world, decisionId) + 1e-6;
}

// The open matters still on the table and the attention they would ALL take together —
// the read behind the prioritization prose (when this exceeds what is free, the player
// cannot do everything and must triage).
export function openDemands(world: WorldState): Opportunity[] {
  return world.opportunities.filter((o) => o.kind === 'MANAGEMENT_DEMAND' && o.status === 'OPEN');
}
function openDemandLoad(world: WorldState): number {
  return openDemands(world).reduce((s, o) => s + (o.demand?.attentionCost ?? 0), 0);
}

// A qualitative read on the month's attention pressure — the only shape it ever takes on
// the wire (S3). LIGHT: room to spare. STEADY: comfortably managing. STRETCHED: the plate
// is nearly full. OVERWHELMED: more is being asked than can be met — something must give.
export type AttentionPressure = 'LIGHT' | 'STEADY' | 'STRETCHED' | 'OVERWHELMED';
export function attentionPressure(world: WorldState): AttentionPressure {
  const committed = committedAttention(world);
  const wanted = committed + openDemandLoad(world);
  const capacity = attentionCapacity(world.player);
  if (wanted > capacity + 1e-6) return 'OVERWHELMED';
  if (wanted >= capacity * 0.8) return 'STRETCHED';
  if (committed >= capacity * 0.5 || openDemands(world).length > 0) return 'STEADY';
  return 'LIGHT';
}

// ── Surfacing competing demands (P26.2) ──────────────────────────────────────

// A small self-contained PRNG (as the events layer uses) so demands are deterministic
// in (seed, month) WITHOUT drawing from world.rng — keeping the pre-Phase-26 seed
// stream byte-identical until a matter actually lands. A distinct salt from the supply
// and black-swan streams so none perturbs another.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A candidate matter before its severity/stakes are drawn: which kind, and the venture
// (if any) it concerns.
interface DemandCandidate {
  kind: DemandKind;
  venture?: Venture;
}

// A venture's current gross monthly take — the base the money stakes scale off.
function ventureMonthly(world: WorldState, v: Venture): number {
  return ventureGrossIncome(world, world.player.parish, v);
}

// How crowded a venture's trade is in the player's parish (the PRICE_WAR gate). Kept
// local to avoid importing the private saturation internals.
function tradeCrowd(world: WorldState, v: Venture): number {
  let n = 0;
  for (const a of world.agents) {
    if (a.occupation === v.industry && a.parish === world.player.parish) n += 1;
    for (const ven of a.ventures ?? []) {
      if (ven.status === 'ACTIVE' && ven.industry === v.industry && a.parish === world.player.parish) n += 1;
    }
  }
  return n;
}

// The matters that COULD arise from the player's situation this month, one entry per
// eligible (kind, venture). Pure read over world state; the roll and the stakes come
// after. AUDIT is a whole-player matter (no venture); the rest attach to a venture.
function demandCandidates(world: WorldState): DemandCandidate[] {
  const p = world.player;
  const out: DemandCandidate[] = [];
  const running = activeVentures(p).filter((v) => !v.wageProfile);

  for (const v of running) {
    // A young venture (an asset acquired just last advance) is bedding in — a launch.
    const justStarted = v.assets.some((a) => a.acquiredMonth === world.month - 1);
    if (justStarted) out.push({ kind: 'LAUNCH', venture: v });
    // A hands-on, consumer-facing venture can hit a supplier shortage.
    if (ventureTimeLoad(v) > 0) out.push({ kind: 'SUPPLIER_SHORTAGE', venture: v });
    // A venture run by a hired operator can face a staff dispute.
    if (v.operatedBy === 'OPERATOR') out.push({ kind: 'LABOUR_TROUBLE', venture: v });
    // A venture in a crowded trade can be drawn into a price war.
    if (v.barrierTier && tradeCrowd(world, v) > CROWDED_TRADE) out.push({ kind: 'PRICE_WAR', venture: v });
    // A venture that has grown well attracts a buyer.
    if (v.outputScale >= ACQUISITION_OUTPUT_SCALE) out.push({ kind: 'ACQUISITION', venture: v });
  }
  // On the taxman's radar once there is a real operation to examine.
  if (p.monthlyIncome >= 3000) out.push({ kind: 'AUDIT' });
  return out;
}

// Fill in a candidate's severity, attention cost, and hidden money/effect figures from
// a side-stream draw. `roll` is the same PRNG the surfacing pass uses, so the whole
// month's demands are reproducible per seed.
function buildDemand(
  world: WorldState,
  candidate: DemandCandidate,
  roll: () => number,
): DemandSpec {
  const { kind, venture } = candidate;
  const severity = clamp01(0.35 + roll() * 0.6); // 0.35–0.95
  const attentionCost = clamp(BASE_ATTENTION_COST[kind] * (0.85 + severity * 0.4), 0.15, 0.6);
  const monthly = venture ? Math.max(300, ventureMonthly(world, venture)) : Math.max(1000, world.player.monthlyIncome);
  const industry = venture ? venture.industry : world.player.occupation ?? 'FINANCE';
  const base: DemandSpec = {
    id: `DEM_${kind}_${venture?.id ?? 'PLAYER'}_${world.month}`,
    kind,
    industry,
    severity,
    attentionCost,
    ...(venture ? { ventureId: venture.id, ventureLabel: venture.label } : {}),
  };
  switch (kind) {
    case 'SUPPLIER_SHORTAGE':
      base.handleCashCost = Math.round(monthly * 0.5 * severity);
      base.ignoreCashPenalty = Math.round(monthly * 1.2 * severity);
      base.ignoreDemandFloor = 0.8;
      break;
    case 'LABOUR_TROUBLE':
      base.handleCashCost = Math.round(monthly * 0.4 * severity);
      base.ignoreCashPenalty = Math.round(monthly * severity);
      base.ignoreDemandFloor = 0.75;
      break;
    case 'LAUNCH':
      base.handleOutputDelta = 0.12 + severity * 0.1;
      base.ignoreOutputDelta = -(0.06 + severity * 0.08);
      base.ignoreDemandFloor = 0.8;
      break;
    case 'AUDIT':
      base.handleCashCost = Math.round(monthly * 0.25);
      base.ignoreCashPenalty = Math.round(monthly * 1.5 * severity);
      base.reputationHit = 0.08 + severity * 0.08;
      break;
    case 'PRICE_WAR':
      base.handleCashCost = Math.round(monthly * 0.4 * severity);
      base.ignoreDemandFloor = clamp(0.75 - severity * 0.25, 0.5, 0.8);
      break;
    case 'ACQUISITION':
      base.acquisitionOffer = Math.round(monthly * (12 + severity * 10));
      break;
  }
  return base;
}

// Neutral, unlabelled option prose for a matter (P26.2) — the HANDLE choice and the
// LET_GO choice, framed as a genuine trade-off with no mechanics, no "safe"/"risky".
// The richer situation framing lives in @island/narrative.
function demandOptions(demand: DemandSpec): DecisionOption[] {
  const what = demand.ventureLabel ?? 'the work';
  const table: Record<DemandKind, { handle: [string, string]; letGo: [string, string] }> = {
    SUPPLIER_SHORTAGE: {
      handle: [
        'Chase down the supply yourself',
        `Put the hours and the money into finding what ${what} needs elsewhere, and keep it moving.`,
      ],
      letGo: [
        'Let it run short this once',
        'Leave it be. What you cannot get in, you cannot sell — you take the shortfall and carry on.',
      ],
    },
    LABOUR_TROUBLE: {
      handle: [
        'Sit down and sort it out',
        `Give it your time — hear them out, settle the dispute, and keep ${what} running as it should.`,
      ],
      letGo: [
        'Leave them to cool off',
        'Stay out of it and hope it passes. It might settle on its own — or it might cost you before it does.',
      ],
    },
    LAUNCH: {
      handle: [
        'Be there while it finds its feet',
        `Put your own hands on ${what} through the early weeks, and give it the best start you can.`,
      ],
      letGo: [
        'Let it find its own way',
        'You have enough on. Leave it to run itself and hope it beds in without you standing over it.',
      ],
    },
    AUDIT: {
      handle: [
        'Get the books in order',
        'Set aside the time, pay someone who knows the forms, and meet them with everything straight.',
      ],
      letGo: [
        'Deal with it if it comes to it',
        'Let it slide for now and answer them later. If the books do not hold up, it will cost you.',
      ],
    },
    PRICE_WAR: {
      handle: [
        'Meet them head on',
        `Give it your attention and shave your own margin to hold ${what}'s custom while the fight lasts.`,
      ],
      letGo: [
        'Ride it out',
        'Do nothing and let them undercut you. You keep your margin, but the custom drifts their way for a while.',
      ],
    },
    ACQUISITION: {
      handle: [
        'Hear the offer out',
        `Sit down with the buyer and see the money on the table for ${what}. Sell, and it is theirs.`,
      ],
      letGo: [
        'Send them on their way',
        `Keep ${what}. There will be other offers, or there will not — but it stays yours for now.`,
      ],
    },
  };
  const t = table[demand.kind];
  return [
    { id: 'HANDLE', label: t.handle[0], description: t.handle[1], effect: { demandAction: 'HANDLE' } },
    { id: 'LET_GO', label: t.letGo[0], description: t.letGo[1], effect: { demandAction: 'LET_GO' } },
  ];
}

// Whether a matter of this (kind, venture) is already open or was only recently
// resolved/lapsed — so the same matter is not re-pushed on top of itself.
function demandAlreadyLive(world: WorldState, kind: DemandKind, ventureId?: string): boolean {
  const key = `MANAGEMENT_DEMAND:${kind}:${ventureId ?? ''}`;
  return hasRecentEquivalentOffer(world.opportunities, key, world.month, OFFER_REOFFER_COOLDOWN_MONTHS);
}

// Surface this month's competing demands (P26.2). Rolls each eligible matter on the
// side-stream, respecting the concurrent cap and the no-duplicate rule, and stands each
// up as a MANAGEMENT_DEMAND opportunity + decision the player triages. Returns the
// matters that became visible this call. Never touches world.rng; deterministic per
// seed. A player running nothing has no candidates, so this is a no-op for them.
export function surfaceDemands(world: WorldState): Opportunity[] {
  if (world.month < DEMAND_FROM_MONTH) return [];
  const surfaced: Opportunity[] = [];
  let openCount = openDemands(world).length;
  if (openCount >= MAX_OPEN_DEMANDS) return surfaced;

  const roll = mulberry32(
    (Math.imul(world.seed >>> 0, 0x2c1b3c6d) + world.month * 0x297a2d39 + 0x85ebca6b) >>> 0,
  );
  for (const candidate of demandCandidates(world)) {
    if (openCount >= MAX_OPEN_DEMANDS) break;
    const ventureId = candidate.venture?.id;
    if (demandAlreadyLive(world, candidate.kind, ventureId)) continue;
    // One roll per candidate keeps the stream stable regardless of which fire.
    const r = roll();
    if (r >= DEMAND_PROBABILITY[candidate.kind]) continue;
    const demand = buildDemand(world, candidate, roll);
    const decId = `DDEC_${demand.id}`;
    const opp: Opportunity = {
      id: `OPP_${demand.id}`,
      kind: 'MANAGEMENT_DEMAND',
      industry: demand.industry,
      npcName: 'the matter at hand',
      channelId: 'ON_YOUR_PLATE',
      surfacedMonth: world.month,
      windowMonths: DEMAND_WINDOW,
      status: 'OPEN',
      decisionId: decId,
      monthlyAmount: 0,
      demand,
    };
    const decision: PlayerDecision = {
      id: decId,
      opportunityId: opp.id,
      kind: 'MANAGEMENT_DEMAND',
      surfacedMonth: world.month,
      windowMonths: DEMAND_WINDOW,
      options: demandOptions(demand),
      chosenOptionId: null,
      resolvedMonth: null,
      consequenceMonth: null,
      consequenceDelivered: false,
    };
    world.opportunities.push(opp);
    world.decisions.push(decision);
    surfaced.push(opp);
    openCount += 1;
  }
  return surfaced;
}

// ── Applying a matter's outcome ──────────────────────────────────────────────

// Drop a venture's customer demand memory to a floor (a neglected matter shadows
// takings), never lifting it. Reuses the Phase 21 customerReputation shadow, which
// recoverVentureReputations then eases back toward whole over months.
function dropDemand(venture: Venture, floor: number): void {
  venture.customerReputation = Math.min(venture.customerReputation ?? 1, floor);
}

function playerVenture(world: WorldState, ventureId?: string): Venture | undefined {
  if (!ventureId) return undefined;
  return (world.player.ventures ?? []).find((v) => v.id === ventureId);
}

// Apply a matter's mechanical outcome (Phase 26). `handled` true = the player spent the
// attention to steer it (HANDLE); false = it resolved on its DEFAULT (let go, or left
// unattended past its window). Pure of world.rng; mutates the player and the venture.
export function applyDemandOutcome(world: WorldState, demand: DemandSpec, handled: boolean): void {
  const p = world.player;
  const venture = playerVenture(world, demand.ventureId);

  if (handled) {
    if (demand.handleCashCost) p.cash = Math.max(0, p.cash - demand.handleCashCost);
    if (demand.kind === 'LAUNCH' && venture && demand.handleOutputDelta) {
      venture.outputScale += demand.handleOutputDelta;
    }
    if (demand.kind === 'ACQUISITION' && venture && demand.acquisitionOffer) {
      p.cash += demand.acquisitionOffer;
      // The buyer takes it over — wind the venture down for good (its assets remain the
      // player's to sell, exactly as a voluntary discontinuation, Phase 17).
      if (venture.status === 'ACTIVE') discontinueVenture(world, venture.id);
    }
    return;
  }

  // The default (worse) outcome.
  if (demand.ignoreCashPenalty) p.cash = Math.max(0, p.cash - demand.ignoreCashPenalty);
  if (demand.ignoreDemandFloor != null && venture) dropDemand(venture, demand.ignoreDemandFloor);
  if (demand.kind === 'LAUNCH' && venture && demand.ignoreOutputDelta) {
    venture.outputScale = Math.max(OUTPUT_FLOOR, venture.outputScale + demand.ignoreOutputDelta);
  }
  if (demand.kind === 'AUDIT' && demand.reputationHit && p.reputation) {
    p.reputation.financialReliability = clamp01(p.reputation.financialReliability - demand.reputationHit);
    p.reputation.civicStanding = clamp01(p.reputation.civicStanding - demand.reputationHit);
  }
}

// A short in-voice notice of what happened when a matter was left unattended past its
// window (S8 — it resolved itself and is gone, not nagging). Pushed to the player
// notifications the advance loop surfaces as a feed line. Plain, no mechanics.
function unattendedNotice(demand: DemandSpec): string {
  const what = demand.ventureLabel ?? 'the work';
  switch (demand.kind) {
    case 'SUPPLIER_SHORTAGE':
      return `The supply you never chased down ran dry, and ${what} lost sales it will not get back this season. The week moved on without you.`;
    case 'LABOUR_TROUBLE':
      return `The dispute you stayed out of festered a while before it settled, and ${what} ran ragged through it. It is quiet again now, at a cost.`;
    case 'LAUNCH':
      return `${capitalise(what)} found its own feet while your back was turned. It stands, but shakier than it might have, and custom was slow to trust it.`;
    case 'AUDIT':
      return 'The letter you set aside caught up with you. The books did not hold up as they should have, and it cost you to put right.';
    case 'PRICE_WAR':
      return `You rode out the undercutting rather than fight it, and custom drifted to the cheaper man for a spell. ${capitalise(what)} will win it back slowly.`;
    case 'ACQUISITION':
      return `The buyer who came sniffing around ${what} moved on when you never sat down with them. Perhaps another will come; perhaps not.`;
  }
}

// Resolve every matter left unattended past its window: apply its default outcome, mark
// it lapsed (so it leaves the plate — S8), and leave the player a plain notice. Called
// on the advance path BEFORE the generic opportunity expiry so the fallout lands before
// the offer is swept to "expired". Idempotent — a matter is only resolved while still
// OPEN, then flipped to EXPIRED so it is never applied twice.
export function resolveUnattendedDemands(world: WorldState): void {
  for (const opp of world.opportunities) {
    if (opp.kind !== 'MANAGEMENT_DEMAND' || opp.status !== 'OPEN' || !opp.demand) continue;
    if (world.month <= opp.surfacedMonth + opp.windowMonths) continue;
    applyDemandOutcome(world, opp.demand, false);
    opp.status = 'EXPIRED';
    world.playerNotifications.push(unattendedNotice(opp.demand));
  }
}

function capitalise(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}
