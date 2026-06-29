import type {
  DecisionOption,
  InvestReturnStructure,
  InvestSolicitationSpec,
  NPCAgent,
  Opportunity,
  PlayerDecision,
  PlayerInvestment,
  WorldState,
} from '@island/shared';
import { amortize } from './banking';
import { clamp, clamp01 } from './rng';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 18 — investing in someone else's venture (P18.1 / P18.2).
//
// The other side of crowdfunding. People the player knows come asking the player to
// put money into THEIR work, and the player chooses how the return comes back:
//   • INTEREST — a loan to them: principal returned with interest over a term. The
//     safest, capped return (the player is the creditor).
//   • DIVIDEND — money in now for a yearly cut of the profit, paid in the good months
//     only. Higher expected return, more variable, no principal back.
//   • REVENUE_SHARE — a slice of every month's takings. The most variable of the three.
//
// These solicitations are RARE and SMALL for a poor, unknown player and grow larger,
// more frequent, and riskier as the player's cash and reputation rise (P18.2). Pure
// (S1): surfacing draws from world.rng for variety and is never on the digest path
// (surfaceOpportunities is not called by simulateOneMonth or the golden master);
// monthly accrual runs in updatePlayerIncome (the advance path), off the digest too.
// Additive — a player who never invests is byte-identical (S2).
// ─────────────────────────────────────────────────────────────────────────────

const INVEST_CHANNEL = 'WORD_OF_MOUTH';
const INVEST_WINDOW = 2;
const INVEST_FROM_MONTH = 4;

function formatEc(n: number): string {
  return `EC$${Math.round(n).toLocaleString('en-US')}`;
}

// The people who might come asking: the player's social network, else same-parish
// acquaintances. Deterministic ordering by id so world.rng picks reproducibly.
function acquaintances(world: WorldState): NPCAgent[] {
  const p = world.player;
  const byId = new Map(world.agents.map((a) => [a.id, a]));
  const fromNetwork = p.socialNetwork
    .map((id) => byId.get(id))
    .filter((a): a is NPCAgent => a != null && !a.isPlayer);
  const pool = fromNetwork.length > 0
    ? fromNetwork
    : world.agents.filter((a) => !a.isPlayer && a.parish === p.parish);
  return [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// The player's standing in the eyes of people who might come asking — local plus
// institutional reputation, 0–1. The better known and trusted the player, the more
// (and bigger) the propositions that find their way to them (P18.2).
function reputation(p: NPCAgent): number {
  return clamp01(p.socialCapitalLocal * 0.7 + p.socialCapitalInstitutional * 0.3);
}

// How likely a solicitation reaches the player this month — low for a poor unknown,
// rising with cash and reputation (P18.2). Bounded so even a magnate is not pestered
// every single month.
function solicitationChance(p: NPCAgent): number {
  const wealthPull = clamp01(p.cash / 60000); // ~broke → 0, ~EC$60k+ → 1
  const rep = reputation(p);
  return clamp(0.04 + 0.45 * (0.5 * wealthPull + 0.5 * rep), 0.02, 0.55);
}

// Whether a solicitation is already live or only just lapsed for this investee, so the
// same person does not pester the player twice at once.
function alreadySolicited(world: WorldState, investeeId: string): boolean {
  return world.opportunities.some(
    (o) =>
      o.kind === 'INVEST_SOLICITATION' &&
      o.invest?.investeeId === investeeId &&
      (o.status === 'OPEN' || o.status === 'ACCEPTED'),
  );
}

// Whether ANY invest solicitation is currently open (one proposition at a time).
function hasOpenSolicitation(world: WorldState): boolean {
  return world.opportunities.some((o) => o.kind === 'INVEST_SOLICITATION' && o.status === 'OPEN');
}

// Build the hidden return parameters for a solicitation, sized by the player's wealth
// and reputation (P18.2): a richer, better-known player is asked for more and offered
// riskier (higher-volatility, higher-upside) propositions.
function buildSpec(world: WorldState, investee: NPCAgent): InvestSolicitationSpec {
  const p = world.player;
  const rep = reputation(p);
  const wealthPull = clamp01(p.cash / 60000);
  const scale = 0.5 * wealthPull + 0.5 * rep;

  // The ask: a few thousand for a newcomer, up to tens of thousands for a known,
  // moneyed player — and never more than the investee could plausibly be running.
  const lo = 1500 + Math.round(8000 * scale);
  const hi = 4000 + Math.round(36000 * scale);
  const principal = Math.round(world.rng.int(lo, hi) / 500) * 500;

  // Riskier propositions reach a wealthier/better-known player: more volatility, and a
  // higher headline return to match. A modest INTEREST rate (the safe option) anchors it.
  const volatility = clamp(0.12 + 0.4 * scale + world.rng.range(-0.05, 0.05), 0.08, 0.6);
  const successBias = clamp(1.04 + world.rng.range(-0.12, 0.12) + 0.06 * scale, 0.8, 1.3);
  const interestRate = clamp(
    world.country.baseInterestRate + 0.02 + world.rng.range(0, 0.04),
    0.04,
    0.18,
  );
  // The dividend and revenue-share are pitched above the interest line in expectation,
  // to pay the player for the extra risk they carry on those structures.
  const dividendAnnualRate = clamp(interestRate + 0.05 + 0.08 * scale, 0.08, 0.4);
  const revenueShare = clamp(0.04 + 0.05 * scale + world.rng.range(0, 0.03), 0.03, 0.2);
  const monthlyRevenueBase = Math.round((principal * (0.18 + 0.12 * successBias)) / 10) * 10;

  return {
    id: `INV_${investee.id}_${world.month}`,
    investeeId: investee.id,
    investeeName: investee.name,
    ventureLabel: ventureLabelFor(investee),
    industry: investee.occupation ?? 'INFORMAL_TRADE',
    principal,
    termMonths: world.rng.pick([24, 36, 48]),
    interestRate: Math.round(interestRate * 1000) / 1000,
    dividendAnnualRate: Math.round(dividendAnnualRate * 1000) / 1000,
    revenueShare: Math.round(revenueShare * 1000) / 1000,
    monthlyRevenueBase,
    successBias: Math.round(successBias * 1000) / 1000,
    volatility: Math.round(volatility * 1000) / 1000,
  };
}

function ventureLabelFor(investee: NPCAgent): string {
  const trade = investee.occupation;
  switch (trade) {
    case 'FISHING':
      return 'his boat';
    case 'AGRICULTURE':
      return 'her provision ground';
    case 'TRANSPORTATION':
      return 'his route';
    case 'CONSTRUCTION':
      return 'his crew';
    case 'RETAIL':
      return 'her shop';
    case 'TOURISM':
      return 'her guesthouse';
    case 'FINANCE':
      return 'his little practice';
    default:
      return 'her trade';
  }
}

// Surface an inbound solicitation, if one finds the player this month. Gated on the
// scaling chance (P18.2); picks a willing, money-handling acquaintance. Returns the
// opportunity, or null. Draws world.rng only on the advance path (off the digest).
export function surfaceInvestSolicitation(world: WorldState): Opportunity | null {
  const p = world.player;
  if (world.month < INVEST_FROM_MONTH) return null;
  if (hasOpenSolicitation(world)) return null;
  // The player needs the means to be worth asking, and to plausibly fund the smallest ask.
  if (p.cash < 1500) return null;

  // The reputation/wealth-scaled frequency gate (P18.2): a poor unknown rarely clears it.
  if (world.rng.next() > solicitationChance(p)) return null;

  // A would-be investee: an acquaintance with their own trade, not already soliciting.
  const candidates = acquaintances(world).filter(
    (a) => a.occupation != null && a.employmentStatus === 'SELF_EMPLOYED' && !alreadySolicited(world, a.id),
  );
  if (candidates.length === 0) return null;
  const investee = candidates[world.rng.int(0, candidates.length - 1)]!;

  const spec = buildSpec(world, investee);
  // Don't ask for more than the player could put in.
  if (p.cash < spec.principal) {
    spec.principal = Math.max(1500, Math.round((p.cash * 0.6) / 500) * 500);
    spec.monthlyRevenueBase = Math.round((spec.principal * (0.18 + 0.12 * spec.successBias)) / 10) * 10;
  }

  const oppId = `OPP_${spec.id}`;
  const decId = `DEC_${spec.id}`;
  const options = buildInvestOptions(spec);
  const opportunity: Opportunity = {
    id: oppId,
    kind: 'INVEST_SOLICITATION',
    industry: spec.industry,
    npcName: investee.name,
    channelId: INVEST_CHANNEL,
    surfacedMonth: world.month,
    windowMonths: INVEST_WINDOW,
    status: 'OPEN',
    decisionId: decId,
    monthlyAmount: 0,
    invest: spec,
  };
  const decision: PlayerDecision = {
    id: decId,
    opportunityId: oppId,
    kind: 'INVEST_SOLICITATION',
    surfacedMonth: world.month,
    windowMonths: INVEST_WINDOW,
    options,
    chosenOptionId: null,
    resolvedMonth: null,
    consequenceMonth: null,
    consequenceDelivered: false,
  };
  world.opportunities.push(opportunity);
  world.decisions.push(decision);
  return opportunity;
}

// The three return structures (plus "stay out") as unlabelled options. The prose
// conveys the shape of each return — steady-but-capped vs. a cut of an uncertain
// profit — without quoting a rate or a probability (S3).
export function buildInvestOptions(spec: InvestSolicitationSpec): DecisionOption[] {
  const monthly = Math.round(amortize(spec.principal, spec.interestRate, spec.termMonths));
  const total = monthly * spec.termMonths;
  return [
    {
      id: 'AS_LOAN',
      label: `Put in ${formatEc(spec.principal)} as a loan`,
      description:
        `You lend ${spec.investeeName} the ${formatEc(spec.principal)} and they pay you back over ` +
        `${spec.termMonths} months — about ${formatEc(monthly)} coming back to you each month, ` +
        `${formatEc(total)} in all by the end. Steady and known. Whatever ${spec.ventureLabel} does, ` +
        `good year or bad, the money owed to you does not change.`,
      effect: { invest: { structure: 'INTEREST' as InvestReturnStructure } },
    },
    {
      id: 'AS_DIVIDEND',
      label: `Put in ${formatEc(spec.principal)} for a yearly cut of the profit`,
      description:
        `Your money stays in ${spec.ventureLabel} and you take a share of the profit it throws off — ` +
        `a good slice in the strong months, little or nothing in the poor ones. No fixed sum owed to ` +
        `you, and the ${formatEc(spec.principal)} stays in the work; what you make of it rides on how ` +
        `the venture does.`,
      effect: { invest: { structure: 'DIVIDEND' as InvestReturnStructure } },
    },
    {
      id: 'AS_REVENUE',
      label: `Put in ${formatEc(spec.principal)} for a slice of every month's takings`,
      description:
        `You take a cut off the top of what ${spec.ventureLabel} sells, month in and month out — ` +
        `paid on the takings whether the month was profitable or not, but rising and falling with how ` +
        `much comes through the door. The most tied to the venture's fortunes of the three, up and down.`,
      effect: { invest: { structure: 'REVENUE_SHARE' as InvestReturnStructure } },
    },
    {
      id: 'STAY_OUT',
      label: 'Keep your money where it is',
      description:
        'You hear them out and keep your hand on your own purse. Other people’s ventures are ' +
        'other people’s worries, and what you have, you keep.',
      effect: {},
    },
  ];
}

// Commit a chosen investment: move the principal from the player to the investee and
// record the claim. Called from resolveDecision when an INVEST_SOLICITATION resolves.
export function applyInvestment(
  world: WorldState,
  spec: InvestSolicitationSpec,
  structure: InvestReturnStructure,
): PlayerInvestment {
  const p = world.player;
  const investee = world.agents.find((a) => a.id === spec.investeeId);
  p.cash = Math.max(0, p.cash - spec.principal);
  if (investee) investee.cash += spec.principal;

  const base: PlayerInvestment = {
    id: `INVH_${spec.id}`,
    investeeId: spec.investeeId,
    investeeName: spec.investeeName,
    ventureLabel: spec.ventureLabel,
    industry: spec.industry,
    structure,
    principal: spec.principal,
    startMonth: world.month,
    status: 'ACTIVE',
    lastReturn: 0,
    totalReturned: 0,
  };
  if (structure === 'INTEREST') {
    base.interestRate = spec.interestRate;
    base.termMonths = spec.termMonths;
    base.remainingPrincipal = spec.principal;
    base.monthlyPayment = Math.round(amortize(spec.principal, spec.interestRate, spec.termMonths));
  } else {
    base.successBias = spec.successBias;
    base.volatility = spec.volatility;
    if (structure === 'DIVIDEND') {
      base.dividendAnnualRate = spec.dividendAnnualRate;
    } else {
      base.revenueShare = spec.revenueShare;
      base.monthlyRevenueBase = spec.monthlyRevenueBase;
    }
  }
  (p.investments ??= []).push(base);
  return base;
}

// This month's performance factor of an NPC venture: its hidden success bias plus a
// random swing of its volatility, floored at 0 (a venture cannot earn negative).
function performanceFactor(world: WorldState, inv: PlayerInvestment): number {
  const bias = inv.successBias ?? 1;
  const vol = inv.volatility ?? 0.2;
  return Math.max(0, bias + world.rng.gaussian(0, vol));
}

// Accrue one month of returns across the player's active investments and return the
// total inflow, which the caller (updatePlayerIncome) folds into the player's monthly
// income — so it reaches the player's cash through phase 5 like any other income (the
// inflow is NOT added to player cash here, to avoid double-counting). The investee
// pays it where they can cover it (their cash falls; they keep running either way).
// Pure; draws world.rng only for the dividend/revenue swing, on the advance path (off
// the digest). A no-op without investments, so the no-feature path is byte-identical.
export function accruePlayerInvestments(world: WorldState): number {
  const p = world.player;
  if (!p.investments || p.investments.length === 0) return 0;
  const byId = new Map(world.agents.map((a) => [a.id, a]));
  let total = 0;
  for (const inv of p.investments) {
    if (inv.status !== 'ACTIVE') {
      inv.lastReturn = 0;
      continue;
    }
    let inflow = 0;
    if (inv.structure === 'INTEREST') {
      const remaining = inv.remainingPrincipal ?? 0;
      const monthly = inv.monthlyPayment ?? 0;
      const interest = remaining * ((inv.interestRate ?? 0) / 12);
      const pay = Math.min(monthly, remaining + interest);
      inflow = Math.round(pay);
      inv.remainingPrincipal = Math.max(0, Math.round(remaining + interest - pay));
      if (inv.remainingPrincipal <= 0) inv.status = 'CLOSED';
    } else if (inv.structure === 'DIVIDEND') {
      const f = performanceFactor(world, inv);
      // A dividend is paid out of profit — nothing in a poor month (f below ~0.6).
      if (f >= 0.6) {
        inflow = Math.round((inv.principal * ((inv.dividendAnnualRate ?? 0) / 12)) * f);
      }
    } else {
      const f = performanceFactor(world, inv);
      inflow = Math.round((inv.monthlyRevenueBase ?? 0) * (inv.revenueShare ?? 0) * f);
    }

    const investee = byId.get(inv.investeeId);
    if (investee) investee.cash = Math.max(0, investee.cash - inflow);
    inv.lastReturn = inflow;
    inv.totalReturned = (inv.totalReturned ?? 0) + inflow;
    total += inflow;
  }
  return total;
}

// The player's active investments, for the money view (Phase 18). Read-only.
export function activeInvestments(p: NPCAgent): PlayerInvestment[] {
  return (p.investments ?? []).filter((i) => i.status === 'ACTIVE');
}

// A representative monthly inflow figure for an investment, for the money view: the
// last accrued return if there is one, else a steady estimate. Read-only (no rng).
export function estimatedMonthlyReturn(inv: PlayerInvestment): number {
  if (inv.lastReturn != null && inv.lastReturn > 0) return inv.lastReturn;
  if (inv.structure === 'INTEREST') return inv.monthlyPayment ?? 0;
  if (inv.structure === 'DIVIDEND') {
    return Math.round((inv.principal * ((inv.dividendAnnualRate ?? 0) / 12)) * (inv.successBias ?? 1));
  }
  return Math.round((inv.monthlyRevenueBase ?? 0) * (inv.revenueShare ?? 0) * (inv.successBias ?? 1));
}
