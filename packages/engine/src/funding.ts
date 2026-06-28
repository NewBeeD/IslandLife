import {
  REPRESENTATIVE_GOOD,
  GOODS,
  OFFER_REOFFER_COOLDOWN_MONTHS,
  hasRecentEquivalentOffer,
} from '@island/shared';
import type {
  BackerOffer,
  Company,
  CrowdfundSpec,
  DecisionOption,
  Industry,
  Loan,
  NPCAgent,
  Opportunity,
  PartnershipSpec,
  PlayerDecision,
  Venture,
  WorldState,
} from '@island/shared';
import { amortize } from './banking';
import { activeVentures, ensurePlayerVentures, hasVentures, ventureGrossIncome } from './ventures';
import { clamp } from './rng';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 11 — equity, crowdfunding & NPC partnerships.
//
// Two new ways to raise money and grow, both from people the player already knows:
//   • CROWDFUND — a slate of friend offers to fund the player, each either a LOAN
//     (repaid with interest) or EQUITY (a profit share). Terms derive from the
//     backer's hidden personality + cash; the player reads them as prose (S3).
//   • PARTNERSHIP — form a shared firm with an NPC partner who pools cash for a
//     share; capital is combined, any loan is booked against the firm, and monthly
//     profit splits by share.
//
// Pure (S1). Surfacing draws from world.rng for variety; it is not on the digest
// path (surfaceOpportunities is never called by simulateOneMonth or the golden
// master). Resolution mutates the world (backer/partner cash, the player's debt and
// ventures/companies) — additive, so the no-Phase-11 path is byte-identical (S2).
// ─────────────────────────────────────────────────────────────────────────────

const FRIEND_BANK_PREFIX = 'FRIEND:';
export function isFriendLoanBank(bankId: string): boolean {
  return bankId.startsWith(FRIEND_BANK_PREFIX);
}
export function friendBankId(backerId: string): string {
  return `${FRIEND_BANK_PREFIX}${backerId}`;
}
export function friendBackerId(bankId: string): string {
  return bankId.slice(FRIEND_BANK_PREFIX.length);
}

const FUNDING_CHANNEL = 'WORD_OF_MOUTH';
const CROWDFUND_WINDOW = 2;
const CROWDFUND_COOLDOWN = 4;
const CROWDFUND_FROM_MONTH = 3;
const PARTNERSHIP_WINDOW = 2;
const PARTNERSHIP_COOLDOWN = 6;
const PARTNERSHIP_FROM_MONTH = 4;

// The months a friend-funded round's delayed MEMORY waits before surfacing (P11.5).
export const FUNDING_CONSEQUENCE_LAG_MONTHS = 6;

function formatEc(n: number): string {
  return `EC$${Math.round(n).toLocaleString('en-US')}`;
}
function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

// The people the player can ask: their social network if populated, else the
// acquaintances around them (same-parish agents). Deterministic ordering by id so
// world.rng picks reproducibly.
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

// ── Crowdfunding (P11.2 / P11.3) ─────────────────────────────────────────────

// The venture an equity stake would attach to: the player's biggest active stream,
// or the sentinel 'VEN_BASE' (materialized on accept) for a single-stream player.
function equityTarget(world: WorldState): { id: string; label: string; annualValue: number } {
  const p = world.player;
  if (hasVentures(p)) {
    const vs = activeVentures(p);
    let best: Venture | null = null;
    let bestGross = -Infinity;
    for (const v of vs) {
      const g = ventureGrossIncome(world, p.parish, v);
      if (g > bestGross) {
        bestGross = g;
        best = v;
      }
    }
    if (best) return { id: best.id, label: best.label, annualValue: Math.max(bestGross * 12, 1000) };
  }
  return { id: 'VEN_BASE', label: 'your work', annualValue: Math.max(p.monthlyIncome * 12, 1000) };
}

// One backer's offer, derived from their personality + cash. Risk-tolerant friends
// want a share (EQUITY); steadier ones lend (LOAN) at a rate gentler than a bank's,
// softened further by agreeableness and patience. Null if they cannot put in enough.
function makeOffer(
  world: WorldState,
  backer: NPCAgent,
  target: { id: string; annualValue: number },
): BackerOffer | null {
  const capacity = Math.floor(Math.min(backer.cash * 0.5, 30000) / 500) * 500;
  if (capacity < 1000) return null;
  if (backer.riskTolerance > 0.5) {
    const share = clamp(capacity / target.annualValue, 0.05, 0.4);
    return {
      backerId: backer.id,
      backerName: backer.name,
      amount: capacity,
      fundingKind: 'EQUITY',
      share: Math.round(share * 100) / 100,
      ventureId: target.id,
    };
  }
  const rate = clamp(
    world.country.baseInterestRate + (1 - backer.agreeableness) * 0.05 - backer.patience * 0.02,
    0.02,
    0.16,
  );
  const term = world.rng.pick([18, 24, 36]);
  return {
    backerId: backer.id,
    backerName: backer.name,
    amount: capacity,
    fundingKind: 'LOAN',
    interestRate: Math.round(rate * 1000) / 1000,
    termMonths: term,
  };
}

function fundingOnCooldown(world: WorldState, kind: Opportunity['kind'], cooldown: number): boolean {
  let lastClosed = -Infinity;
  for (const o of world.opportunities) {
    if (o.kind !== kind) continue;
    if (o.status === 'OPEN') return true;
    const closed = o.surfacedMonth + o.windowMonths;
    if (closed > lastClosed) lastClosed = closed;
  }
  return world.month - lastClosed < cooldown;
}

function backerOptionText(offer: BackerOffer): { label: string; description: string } {
  if (offer.fundingKind === 'EQUITY') {
    return {
      label: `Take ${formatEc(offer.amount)} from ${offer.backerName} — for a share`,
      description:
        `${offer.backerName} puts in ${formatEc(offer.amount)} and takes a cut of what the ` +
        `work makes from here — about a ${Math.round((offer.share ?? 0) * 100)} in a hundred ` +
        `of it, good months and bad. No payments to find, but their share is theirs for good.`,
    };
  }
  return {
    label: `Borrow ${formatEc(offer.amount)} from ${offer.backerName}`,
    description:
      `${offer.backerName} lends you ${formatEc(offer.amount)}, paid back over ` +
      `${offer.termMonths} months at about ${pct(offer.interestRate ?? 0)} a year — gentler than ` +
      `the bank, but it is a friend's money, and a friend remembers.`,
  };
}

// Surface a crowdfunding round if the player has people to ask and something to put
// the money into (a venture or a self-employed trade). Picks 2–3 backers via
// world.rng and varies their terms (P11.2). Returns the opportunity, or null.
export function surfaceCrowdfund(world: WorldState): Opportunity | null {
  const p = world.player;
  if (world.month < CROWDFUND_FROM_MONTH) return null;
  if (!(hasVentures(p) || p.employmentStatus === 'SELF_EMPLOYED')) return null;
  if (fundingOnCooldown(world, 'CROWDFUND', CROWDFUND_COOLDOWN)) return null;

  const target = equityTarget(world);
  // P13.1 — don't re-open a round for the same venture while one is live or only
  // just lapsed (keyed by the funded venture, before any backer draws).
  if (
    hasRecentEquivalentOffer(
      world.opportunities,
      `CROWDFUND:${target.id}`,
      world.month,
      OFFER_REOFFER_COOLDOWN_MONTHS,
    )
  ) {
    return null;
  }
  const candidates = acquaintances(world).filter((a) => a.cash >= 2000);
  if (candidates.length === 0) return null;

  // Up to three backers, drawn for variety.
  const chosen: NPCAgent[] = [];
  const pool = [...candidates];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = world.rng.int(0, pool.length - 1);
    chosen.push(pool.splice(idx, 1)[0]!);
  }
  const offers: BackerOffer[] = [];
  for (const backer of chosen) {
    const offer = makeOffer(world, backer, target);
    if (offer) offers.push(offer);
  }
  if (offers.length === 0) return null;

  const oppId = `OPP_CROWDFUND_${world.month}`;
  const decId = `DEC_CROWDFUND_${world.month}`;
  const options: DecisionOption[] = offers.map((offer, i) => {
    const { label, description } = backerOptionText(offer);
    return { id: `BACKER_${i}`, label, description, effect: { funding: offer } };
  });
  options.push({
    id: 'RAISE_NOTHING',
    label: 'Raise nothing — keep it your own',
    description:
      'You keep your hands free of other people’s money. Slower, maybe, but what you build is ' +
      'wholly yours and you owe no one an explanation.',
    effect: {},
  });

  const spec: CrowdfundSpec = { ventureId: target.id, ventureLabel: target.label, offers };
  const opportunity: Opportunity = {
    id: oppId,
    kind: 'CROWDFUND',
    industry: p.occupation ?? 'FINANCE',
    npcName: 'people who know you',
    channelId: FUNDING_CHANNEL,
    surfacedMonth: world.month,
    windowMonths: CROWDFUND_WINDOW,
    status: 'OPEN',
    decisionId: decId,
    monthlyAmount: 0,
    crowdfund: spec,
  };
  const decision: PlayerDecision = {
    id: decId,
    opportunityId: oppId,
    kind: 'CROWDFUND',
    surfacedMonth: world.month,
    windowMonths: CROWDFUND_WINDOW,
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

// Apply a chosen backer's funding: the backer's cash moves to the player, and either
// a friend-loan is booked (debt) or an equity stake is recorded on the venture
// (a future profit claim that dilutes the player's take). Mutates the world.
export function applyBackerFunding(world: WorldState, offer: BackerOffer): void {
  const p = world.player;
  const backer = world.agents.find((a) => a.id === offer.backerId);
  if (backer) backer.cash = Math.max(0, backer.cash - offer.amount);
  p.cash += offer.amount;

  if (offer.fundingKind === 'LOAN') {
    const rate = offer.interestRate ?? world.country.baseInterestRate;
    const term = offer.termMonths ?? 24;
    const loan: Loan = {
      id: `LOAN_${friendBankId(offer.backerId)}_${world.month}`,
      bankId: friendBankId(offer.backerId),
      borrowerPersonId: p.id,
      principal: offer.amount,
      remainingPrincipal: offer.amount,
      interestRate: rate,
      monthlyPayment: Math.round(amortize(offer.amount, rate, term)),
      termMonths: term,
      originMonth: world.month,
      status: 'ACTIVE',
    };
    p.loans.push(loan);
    return;
  }

  // EQUITY: attach the stake to the target venture, materializing "venture 0" if the
  // player is still single-stream.
  ensurePlayerVentures(world);
  const wantId = offer.ventureId === 'VEN_BASE' ? p.ventures?.[0]?.id : offer.ventureId;
  const venture = activeVentures(p).find((v) => v.id === wantId) ?? activeVentures(p)[0];
  if (venture) {
    (venture.equityHolders ??= []).push({
      personId: offer.backerId,
      name: offer.backerName,
      share: offer.share ?? 0,
    });
  }
}

// ── NPC partnership (P11.4) ──────────────────────────────────────────────────

// A small catalogue of partnership ventures the player can form with a partner.
// Each names a target monthly revenue (sized so the firm is modestly profitable) and
// how much capital the two sides pool. Prices in EC$.
interface PartnershipTemplate {
  id: string;
  industry: Industry;
  companyName: string;
  targetMonthlyRevenue: number;
  playerContribution: number;
  partnerContribution: number;
  loanPrincipal: number;
  minPlayerCash: number;
}

const PARTNERSHIP_CATALOGUE: PartnershipTemplate[] = [
  { id: 'PT_FISH_COOP', industry: 'FISHING', companyName: 'a two-boat fishing co-op', targetMonthlyRevenue: 9000, playerContribution: 8000, partnerContribution: 8000, loanPrincipal: 12000, minPlayerCash: 8000 },
  { id: 'PT_FARM', industry: 'AGRICULTURE', companyName: 'a shared provision farm', targetMonthlyRevenue: 7000, playerContribution: 6000, partnerContribution: 6000, loanPrincipal: 8000, minPlayerCash: 6000 },
  { id: 'PT_SHOP', industry: 'RETAIL', companyName: 'a corner shop, the two of you behind it', targetMonthlyRevenue: 11000, playerContribution: 10000, partnerContribution: 10000, loanPrincipal: 15000, minPlayerCash: 10000 },
];

function partnershipOutputUnits(industry: Industry, targetRevenue: number): number {
  const goodId = REPRESENTATIVE_GOOD[industry];
  const good = goodId ? GOODS.find((g) => g.id === goodId) : undefined;
  const basePrice = good?.basePrice ?? 1;
  return Math.max(1, Math.round(targetRevenue / basePrice));
}

// Surface a partnership offer if the player can pool a stake and there is a willing
// partner with cash to match. One partnership at a time, on a cooldown. world.rng
// picks the template and the partner. Returns the opportunity, or null.
export function surfacePartnership(world: WorldState): Opportunity | null {
  const p = world.player;
  if (world.month < PARTNERSHIP_FROM_MONTH) return null;
  if (fundingOnCooldown(world, 'PARTNERSHIP', PARTNERSHIP_COOLDOWN)) return null;

  const affordable = PARTNERSHIP_CATALOGUE.filter((t) => p.cash >= t.minPlayerCash);
  if (affordable.length === 0) return null;
  const template = world.rng.pick(affordable);

  const partners = acquaintances(world).filter((a) => a.cash >= template.partnerContribution);
  if (partners.length === 0) return null;
  const partner = partners[world.rng.int(0, partners.length - 1)]!;

  const totalCapital = template.playerContribution + template.partnerContribution + template.loanPrincipal;
  const partnerShare = Math.round((template.partnerContribution / totalCapital) * 100) / 100;
  const spec: PartnershipSpec = {
    id: template.id,
    partnerId: partner.id,
    partnerName: partner.name,
    industry: template.industry,
    companyName: template.companyName,
    partnerContribution: template.partnerContribution,
    playerContribution: template.playerContribution,
    loanPrincipal: template.loanPrincipal,
    partnerShare,
    monthlyOutputUnits: partnershipOutputUnits(template.industry, template.targetMonthlyRevenue),
    baseOperatingCosts: Math.round(template.targetMonthlyRevenue * 0.6),
  };

  // P13.1 — don't re-offer the same partner/firm pairing while one is live or only
  // just lapsed, so a declined partnership stops re-appearing as a duplicate.
  if (
    hasRecentEquivalentOffer(
      world.opportunities,
      `PARTNERSHIP:${spec.partnerId}:${spec.id}`,
      world.month,
      OFFER_REOFFER_COOLDOWN_MONTHS,
    )
  ) {
    return null;
  }

  const oppId = `OPP_${template.id}_${world.month}`;
  const decId = `DEC_${template.id}_${world.month}`;
  const options: DecisionOption[] = [
    {
      id: 'GO_IN',
      label: `Go in with ${partner.name} — ${formatEc(template.playerContribution)} from you`,
      description:
        `You put in ${formatEc(template.playerContribution)}, ${partner.name} matches it, and the ` +
        `bank carries the rest. You share the work, the worry, and the takings — about a ` +
        `${Math.round(partnerShare * 100)} in a hundred goes to ${partner.name}. Two hands are ` +
        `steadier than one, until the day they pull a different way.`,
      effect: { accept: true },
    },
    {
      id: 'STAY_OUT',
      label: 'Keep to your own work',
      description:
        'You stay your own boss, answerable to no partner. What you make is yours, and so is ' +
        'every risk. The chance may come round again, or it may not.',
      effect: {},
    },
  ];

  const opportunity: Opportunity = {
    id: oppId,
    kind: 'PARTNERSHIP',
    industry: template.industry,
    npcName: partner.name,
    channelId: FUNDING_CHANNEL,
    surfacedMonth: world.month,
    windowMonths: PARTNERSHIP_WINDOW,
    status: 'OPEN',
    decisionId: decId,
    monthlyAmount: 0,
    partnership: spec,
  };
  const decision: PlayerDecision = {
    id: decId,
    opportunityId: oppId,
    kind: 'PARTNERSHIP',
    surfacedMonth: world.month,
    windowMonths: PARTNERSHIP_WINDOW,
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

// Form the shared firm: pool both contributions, book any loan against the company
// (borrowerCompanyId), and add it to the world owned by the player with the partner
// as an equity holder. Monthly profit is split by share in simulateOneMonth (P11.4).
export function applyPartnership(world: WorldState, spec: PartnershipSpec): Company {
  const p = world.player;
  const partner = world.agents.find((a) => a.id === spec.partnerId);
  p.cash = Math.max(0, p.cash - spec.playerContribution);
  if (partner) partner.cash = Math.max(0, partner.cash - spec.partnerContribution);

  const companyId = `CO_PART_${spec.id}_${world.month}`;
  const loans: Loan[] = [];
  if (spec.loanPrincipal > 0) {
    const rate = world.country.baseInterestRate + 0.035;
    const term = 60;
    loans.push({
      id: `LOAN_${companyId}`,
      bankId: 'NCB',
      borrowerCompanyId: companyId,
      principal: spec.loanPrincipal,
      remainingPrincipal: spec.loanPrincipal,
      interestRate: rate,
      monthlyPayment: Math.round(amortize(spec.loanPrincipal, rate, term)),
      termMonths: term,
      originMonth: world.month,
      purposeIndustry: spec.industry,
      status: 'ACTIVE',
    });
  }

  const company: Company = {
    id: companyId,
    name: spec.companyName,
    industry: spec.industry,
    type: 'COOPERATIVE',
    parish: p.parish,
    ownerId: p.id,
    marketShare: 0.02,
    monthlyOutputUnits: spec.monthlyOutputUnits,
    employees: [],
    loans,
    baseOperatingCosts: spec.baseOperatingCosts,
    monthlyRevenue: 0,
    profit: 0,
    consecutiveLossMonths: 0,
    status: 'HEALTHY',
    isSolvent: true,
    estimatedAnnualTax: 0,
    equityHolders: [{ personId: spec.partnerId, name: spec.partnerName, share: spec.partnerShare }],
  };
  world.companies.push(company);
  return company;
}

// Distribute this month's positive profit of every player-owned shared firm to the
// player and their partners by share (P11.4), and lift the player's local social
// capital for a partner who got paid (P11.5). Additive — a company with no
// equityHolders does nothing, so the no-Phase-11 path is byte-identical (S2).
export function distributePartnershipProfit(world: WorldState): void {
  const p = world.player;
  const byId = new Map(world.agents.map((a) => [a.id, a]));
  for (const c of world.companies) {
    if (c.status === 'CLOSED' || c.ownerId !== p.id) continue;
    const holders = c.equityHolders ?? [];
    if (holders.length === 0 || c.profit <= 0) continue;
    let outside = 0;
    let paidAny = false;
    for (const h of holders) {
      const partner = byId.get(h.personId);
      if (partner) {
        partner.cash += Math.round(c.profit * h.share);
        paidAny = true;
      }
      outside += h.share;
    }
    p.cash += Math.round(c.profit * clamp(1 - outside, 0, 1));
    if (paidAny) p.socialCapitalLocal = clamp(p.socialCapitalLocal + 0.002, 0, 1);
  }
}

// Strain on the player's friendships when their friend-loans fall into default
// (P11.5): each defaulted friend-loan costs a broken contract and a hit to local
// social capital. Returns the number of friendships strained (so the caller can flag
// a consequence). Call right after the player's loans are marked DEFAULT.
export function strainFriendDefaults(world: WorldState): number {
  const p = world.player;
  let strained = 0;
  for (const loan of p.loans) {
    if (loan.status === 'DEFAULT' && isFriendLoanBank(loan.bankId) && !loan.friendStrainApplied) {
      loan.friendStrainApplied = true;
      p.brokenContracts += 1;
      p.socialCapitalLocal = clamp(p.socialCapitalLocal - 0.04, 0, 1);
      strained += 1;
    }
  }
  return strained;
}
