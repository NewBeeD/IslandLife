import { GOODS, REPRESENTATIVE_GOOD, credentialRank } from '@island/shared';
import type {
  CredentialLevel,
  DecisionOption,
  Industry,
  Opportunity,
  PlayerDecision,
  UpgradeSpec,
  WorldState,
} from '@island/shared';
import { assessLoanApplication, originateLoan } from './banking';
import type { LoanAssessment } from './banking';
import { activeVentures, aggregateVentureIncome, hasVentures } from './ventures';
import { credentialLevelOf, enrolPlayer, surfaceEducation } from './education';
import { clamp } from './rng';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 6 — the one decision loop (the vertical slice).
//
// The information-channel filter surfaces Eunice's standing supply-contract
// opportunity to a fishing player with enough local social capital (P6.1); the
// opportunity carries an unlabelled decision (P6.2); resolving it feeds back into
// the player's income behaviour — a standing contract vs. spot-selling trade-off
// (P6.3); a delayed consequence surfaces months later (P6.4).
//
// All of this is pure engine state living on `world` (S1), so it serializes with
// the snapshot and is deterministic. The narrative voice (situation prose, the
// consequence entry) lives in @island/narrative; the engine owns only mechanics.
// ─────────────────────────────────────────────────────────────────────────────

export const EUNICE_OPPORTUNITY_ID = 'OPP_EUNICE';
export const EUNICE_DECISION_ID = 'DEC_EUNICE';
export const EUNICE_NPC_NAME = 'Eunice Charles';

// MARKET_NETWORK information channel (Player Experience doc): a fish buyer's offer
// reaches a fisher who is known around the market — local social capital ≥ 0.30.
const MARKET_NETWORK_CHANNEL = 'MARKET_NETWORK';
const REQUIRED_LOCAL_CAPITAL = 0.3;
// Let a few months pass so the relationship reads as established, not instant.
const SURFACE_FROM_MONTH = 2;
const WINDOW_MONTHS = 2;
// The standing offer is a modest premium over current spot earnings — it buys
// stability, not a windfall, so giving up the open market's good months is a real
// cost (the trade-off must be genuine; the player is never told which is "better").
const STANDING_PREMIUM = 1.3;
// Spot income swings around its base with the local fish price.
const SPOT_MIN_FACTOR = 0.5;
const SPOT_MAX_FACTOR = 2.0;
// Months between the choice and the MEMORY entry that connects back to it (P6.4).
export const CONSEQUENCE_LAG_MONTHS = 6;

export const EUNICE_OPTION_ACCEPT = 'ACCEPT';
export const EUNICE_OPTION_DECLINE = 'DECLINE';

// Round an EC$ figure to a "real" contract number.
function roundContract(n: number): number {
  return Math.max(50, Math.round(n / 50) * 50);
}

function buildEuniceOptions(monthlyAmount: number): DecisionOption[] {
  return [
    {
      id: EUNICE_OPTION_ACCEPT,
      label: "Tell Eunice yes — you'll be her supplier",
      description:
        `A set amount each month, ${formatEc(monthlyAmount)}, as long as you keep her ` +
        'stall supplied. The same money in a good month or a lean one. You would not be ' +
        'free to chase the best price at the wharf — you would have a commitment to meet.',
      effect: { incomeMode: 'STANDING', standingAmount: monthlyAmount },
    },
    {
      id: EUNICE_OPTION_DECLINE,
      label: 'Keep selling at the wharf, the way you always have',
      description:
        'No one to answer to and the whole catch is yours to sell to the highest buyer ' +
        'each week. Some weeks that is more than Eunice is offering. Some weeks the sea ' +
        'gives you little and the price is poor and there is no one guaranteeing anything.',
      effect: { incomeMode: 'SPOT' },
    },
  ];
}

function formatEc(n: number): string {
  return `EC$${Math.round(n).toLocaleString('en-US')}`;
}

// Whether the Eunice opportunity should be surfaced to this player right now.
function euniceConditionsMet(world: WorldState): boolean {
  const p = world.player;
  return (
    p.occupation === 'FISHING' &&
    p.socialCapitalLocal >= REQUIRED_LOCAL_CAPITAL &&
    world.month >= SURFACE_FROM_MONTH
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7 — generative asset-upgrade opportunities.
//
// Every self-employed trade always has a way to grow: a bigger boat, a second
// minibus, more guest rooms. Tiers unlock with experience; the player funds the
// step from savings and/or a financed loan (the financing slider), so there is
// always something to pursue at a risk level the player chooses. Surfacing is
// deterministic from world state (no world.rng), like the Eunice filter.
// ─────────────────────────────────────────────────────────────────────────────

const UPGRADE_CHANNEL = 'SUPPLY_TRADE';
// Months to wait after an upgrade offer is taken or lapses before the next surfaces.
const UPGRADE_COOLDOWN = 2;
const UPGRADE_WINDOW = 3;

interface UpgradeTemplate extends UpgradeSpec {
  vendorName: string;
  minExperience: number; // domain experience the player needs before it is offered
  minCredential?: CredentialLevel; // a credential gate (Phase 9); absent → no gate
}

// Per-industry upgrade ladders (ascending price/ambition). Grounded in everyday
// small-island assets. Prices in EC$.
const UPGRADE_CATALOGUE: Partial<Record<Industry, UpgradeTemplate[]>> = {
  FISHING: [
    { id: 'UPG_FISH_1', vendorName: "Baron's Marine", assetType: 'VEHICLE', assetSize: 'MEDIUM', assetLabel: 'a bigger pirogue and a new outboard engine', assetPrice: 28000, outputScaleDelta: 0.6, operatingCostDelta: 450, riskLevel: 'MEDIUM', minTermMonths: 24, maxTermMonths: 60, minExperience: 0.2 },
    { id: 'UPG_FISH_2', vendorName: "Baron's Marine", assetType: 'VEHICLE', assetSize: 'LARGE', assetLabel: 'a fibreglass boat with twin engines and an ice hold', assetPrice: 65000, outputScaleDelta: 1.2, operatingCostDelta: 1100, riskLevel: 'HIGH', minTermMonths: 36, maxTermMonths: 84, minExperience: 0.45 },
    // A commercial-scale step the bank and the buyers only take you seriously for
    // once you hold a credential — gated on an associate (Phase 9, P9.4).
    { id: 'UPG_FISH_3', vendorName: 'a broker handling the export trade', assetType: 'VEHICLE', assetSize: 'LARGE', assetLabel: 'a commercial longliner rigged for the export market', assetPrice: 140000, outputScaleDelta: 2.4, operatingCostDelta: 2600, riskLevel: 'HIGH', minTermMonths: 48, maxTermMonths: 96, minExperience: 0.6, minCredential: 'ASSOCIATE' },
  ],
  AGRICULTURE: [
    { id: 'UPG_AGRI_1', vendorName: 'a neighbour selling out', assetType: 'LAND', assetSize: 'MEDIUM', assetLabel: 'another acre of provision ground and proper tools', assetPrice: 18000, outputScaleDelta: 0.5, operatingCostDelta: 200, riskLevel: 'MEDIUM', minTermMonths: 24, maxTermMonths: 72, minExperience: 0.2 },
    { id: 'UPG_AGRI_2', vendorName: 'the agro dealer in Roseau', assetType: 'VEHICLE', assetSize: 'LARGE', assetLabel: 'a pickup and an irrigation setup', assetPrice: 40000, outputScaleDelta: 0.9, operatingCostDelta: 600, riskLevel: 'HIGH', minTermMonths: 36, maxTermMonths: 72, minExperience: 0.45 },
  ],
  TRANSPORTATION: [
    { id: 'UPG_TRANS_1', vendorName: 'a driver giving up the road', assetType: 'VEHICLE', assetSize: 'MEDIUM', assetLabel: 'a second-hand minibus for a second route', assetPrice: 35000, outputScaleDelta: 0.8, operatingCostDelta: 900, riskLevel: 'MEDIUM_HIGH', minTermMonths: 24, maxTermMonths: 60, minExperience: 0.2 },
  ],
  CONSTRUCTION: [
    { id: 'UPG_CONST_1', vendorName: 'the hardware on Hillsborough Street', assetType: 'EQUIPMENT', assetSize: 'MEDIUM', assetLabel: 'a full set of power tools and a work truck', assetPrice: 30000, outputScaleDelta: 0.7, operatingCostDelta: 500, riskLevel: 'MEDIUM', minTermMonths: 24, maxTermMonths: 60, minExperience: 0.2 },
  ],
  RETAIL: [
    { id: 'UPG_RETAIL_1', vendorName: 'a wholesaler', assetType: 'EQUIPMENT', assetSize: 'SMALL', assetLabel: 'a chest freezer and a bulk stock run', assetPrice: 12000, outputScaleDelta: 0.4, operatingCostDelta: 250, riskLevel: 'LOW', minTermMonths: 18, maxTermMonths: 48, minExperience: 0.15 },
    { id: 'UPG_RETAIL_2', vendorName: 'a landlord on the main road', assetType: 'EQUIPMENT', assetSize: 'LARGE', assetLabel: 'a second stall and a proper shopfront', assetPrice: 30000, outputScaleDelta: 0.8, operatingCostDelta: 500, riskLevel: 'MEDIUM_HIGH', minTermMonths: 36, maxTermMonths: 72, minExperience: 0.4 },
  ],
  TOURISM: [
    { id: 'UPG_TOUR_1', vendorName: 'a builder you trust', assetType: 'EQUIPMENT', assetSize: 'LARGE', assetLabel: 'two more guest rooms built on', assetPrice: 45000, outputScaleDelta: 0.8, operatingCostDelta: 600, riskLevel: 'MEDIUM_HIGH', minTermMonths: 36, maxTermMonths: 84, minExperience: 0.2 },
  ],
  INFORMAL_TRADE: [
    { id: 'UPG_TRADE_1', vendorName: 'a supplier in Martinique', assetType: 'EQUIPMENT', assetSize: 'SMALL', assetLabel: 'a bulk inventory run across the channel', assetPrice: 9000, outputScaleDelta: 0.45, operatingCostDelta: 150, riskLevel: 'MEDIUM', minTermMonths: 12, maxTermMonths: 36, minExperience: 0.15 },
  ],
};

const DOMAIN_OF: Record<Industry, keyof WorldState['player']['experience']> = {
  FISHING: 'fishing', AGRICULTURE: 'agriculture', CONSTRUCTION: 'construction',
  INFORMAL_TRADE: 'informalTrade', RETAIL: 'retail', TOURISM: 'tourism',
  TRANSPORTATION: 'transportation', FINANCE: 'finance',
};

interface UpgradeCandidate {
  template: UpgradeTemplate;
  industry: Industry;
  ventureId?: string; // undefined → the implicit single-stream player ("venture 0")
}

// A venture asset's id is `${rungId}@${ventureId}` so distinct ventures can each buy
// the same rung; recover the rung id for the ownership check.
function rungIdOf(assetId: string): string {
  const at = assetId.indexOf('@');
  return at === -1 ? assetId : assetId.slice(0, at);
}

// The next eligible rung for a trade: the lowest-priced tier past the experience
// gate (and any credential gate, Phase 9) that the owner does not already hold.
function nextRung(
  industry: Industry,
  experience: number,
  ownedRungIds: Set<string>,
  credential: CredentialLevel,
): UpgradeTemplate | null {
  const ladder = UPGRADE_CATALOGUE[industry];
  if (!ladder) return null;
  for (const t of ladder) {
    if (experience < t.minExperience) continue;
    if (t.minCredential && credentialRank(credential) < credentialRank(t.minCredential)) continue;
    if (ownedRungIds.has(t.id)) continue; // already bought this rung
    return t;
  }
  return null;
}

// The upgrades available right now, one per growable trade. A venture portfolio
// yields a candidate per active venture (each its own ladder, gated by the player's
// experience in that domain); a single-stream self-employed player yields the one
// candidate for their occupation (byte-identical to Phase 7). Deterministic.
function upgradeCandidates(world: WorldState): UpgradeCandidate[] {
  const p = world.player;
  const credential = credentialLevelOf(p);
  const out: UpgradeCandidate[] = [];
  if (hasVentures(p)) {
    for (const v of activeVentures(p)) {
      const exp = p.experience[DOMAIN_OF[v.industry]] ?? 0;
      const owned = new Set(v.assets.map((a) => rungIdOf(a.id)));
      const t = nextRung(v.industry, exp, owned, credential);
      if (t) out.push({ template: t, industry: v.industry, ventureId: v.id });
    }
    return out;
  }
  if (p.employmentStatus !== 'SELF_EMPLOYED' || !p.occupation) return out;
  const exp = p.experience[DOMAIN_OF[p.occupation]] ?? 0;
  const owned = new Set(p.economicAssets.map((a) => a.id));
  const t = nextRung(p.occupation, exp, owned, credential);
  if (t) out.push({ template: t, industry: p.occupation });
  return out;
}

// Whether a cooldown is in effect since the last upgrade offer lapsed or was taken.
function upgradeOnCooldown(world: WorldState): boolean {
  let lastClosedMonth = -Infinity;
  for (const o of world.opportunities) {
    if (o.kind !== 'ASSET_UPGRADE') continue;
    if (o.status === 'OPEN') return true; // one open at a time
    const closed = Math.max(o.surfacedMonth + o.windowMonths, o.surfacedMonth);
    if (closed > lastClosedMonth) lastClosedMonth = closed;
  }
  return world.month - lastClosedMonth < UPGRADE_COOLDOWN;
}

function surfaceUpgrade(world: WorldState): Opportunity | null {
  if (upgradeOnCooldown(world)) return null;
  const candidate = upgradeCandidates(world)[0];
  if (!candidate) return null;
  const { template: t, industry, ventureId } = candidate;
  const suffix = ventureId ? `${ventureId}_` : '';
  const oppId = `OPP_${t.id}_${suffix}${world.month}`;
  const decId = `DEC_${t.id}_${suffix}${world.month}`;
  const opportunity: Opportunity = {
    id: oppId,
    kind: 'ASSET_UPGRADE',
    industry,
    npcName: t.vendorName,
    channelId: UPGRADE_CHANNEL,
    surfacedMonth: world.month,
    windowMonths: UPGRADE_WINDOW,
    status: 'OPEN',
    decisionId: decId,
    monthlyAmount: 0,
    upgrade: {
      id: t.id, assetType: t.assetType, assetSize: t.assetSize, assetLabel: t.assetLabel,
      assetPrice: t.assetPrice, outputScaleDelta: t.outputScaleDelta,
      operatingCostDelta: t.operatingCostDelta, riskLevel: t.riskLevel,
      minTermMonths: t.minTermMonths, maxTermMonths: t.maxTermMonths,
    },
    // Only set when targeting a venture, so the single-stream opportunity is
    // byte-identical to Phase 7 (no `ventureId` key).
    ...(ventureId ? { ventureId } : {}),
  };
  const decision: PlayerDecision = {
    id: decId,
    opportunityId: oppId,
    kind: 'ASSET_UPGRADE',
    surfacedMonth: world.month,
    windowMonths: UPGRADE_WINDOW,
    options: [], // financing is interactive (the slider), not a fixed option list
    chosenOptionId: null,
    resolvedMonth: null,
    consequenceMonth: null,
    consequenceDelivered: false,
  };
  world.opportunities.push(opportunity);
  world.decisions.push(decision);
  return opportunity;
}

// The information-channel filter (P6.1). Expires stale offers and surfaces newly
// available ones. Returns the opportunities that became visible this call (so the
// server can note them). Deterministic — reads world state, never world.rng.
export function surfaceOpportunities(world: WorldState): Opportunity[] {
  // Expire any OPEN opportunity whose window has closed unanswered.
  for (const opp of world.opportunities) {
    if (opp.status === 'OPEN' && world.month > opp.surfacedMonth + opp.windowMonths) {
      opp.status = 'EXPIRED';
    }
  }

  const surfaced: Opportunity[] = [];
  const alreadyHasEunice = world.opportunities.some((o) => o.kind === 'EUNICE_SUPPLY_CONTRACT');
  if (!alreadyHasEunice && euniceConditionsMet(world)) {
    const monthlyAmount = roundContract(world.player.monthlyIncome * STANDING_PREMIUM);
    const decision: PlayerDecision = {
      id: EUNICE_DECISION_ID,
      opportunityId: EUNICE_OPPORTUNITY_ID,
      kind: 'EUNICE_SUPPLY_CONTRACT',
      surfacedMonth: world.month,
      windowMonths: WINDOW_MONTHS,
      options: buildEuniceOptions(monthlyAmount),
      chosenOptionId: null,
      resolvedMonth: null,
      consequenceMonth: null,
      consequenceDelivered: false,
    };
    const opportunity: Opportunity = {
      id: EUNICE_OPPORTUNITY_ID,
      kind: 'EUNICE_SUPPLY_CONTRACT',
      industry: 'FISHING',
      npcName: EUNICE_NPC_NAME,
      channelId: MARKET_NETWORK_CHANNEL,
      surfacedMonth: world.month,
      windowMonths: WINDOW_MONTHS,
      status: 'OPEN',
      decisionId: EUNICE_DECISION_ID,
      monthlyAmount,
    };
    world.opportunities.push(opportunity);
    world.decisions.push(decision);
    surfaced.push(opportunity);
  }

  // Generative asset-upgrade ladder — always something to grow toward (Phase 7).
  const upgrade = surfaceUpgrade(world);
  if (upgrade) surfaced.push(upgrade);

  // Education enrolment — a way to invest in a credential (Phase 9).
  const enrolment = surfaceEducation(world);
  if (enrolment) surfaced.push(enrolment);

  return surfaced;
}

export class DecisionError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'ALREADY_RESOLVED' | 'EXPIRED' | 'BAD_OPTION',
  ) {
    super(message);
    this.name = 'DecisionError';
  }
}

// Resolve a decision into the simulation (P6.3): record the choice and feed it back
// into the player's income behaviour. STANDING fixes income to the contract amount;
// SPOT makes it market-variable from here on (see updatePlayerIncome). Pure —
// mutates the player and the decision/opportunity, never world.rng.
export function resolveDecision(
  world: WorldState,
  decisionId: string,
  optionId: string,
): PlayerDecision {
  const decision = world.decisions.find((d) => d.id === decisionId);
  if (!decision) throw new DecisionError(`decision ${decisionId} not found`, 'NOT_FOUND');
  if (decision.chosenOptionId !== null) {
    throw new DecisionError(`decision ${decisionId} already resolved`, 'ALREADY_RESOLVED');
  }
  const opportunity = world.opportunities.find((o) => o.id === decision.opportunityId);
  if (opportunity && opportunity.status === 'EXPIRED') {
    throw new DecisionError(`decision ${decisionId} has expired`, 'EXPIRED');
  }
  const option = decision.options.find((o) => o.id === optionId);
  if (!option) throw new DecisionError(`option ${optionId} not on decision ${decisionId}`, 'BAD_OPTION');

  decision.chosenOptionId = option.id;
  decision.resolvedMonth = world.month;
  decision.consequenceMonth = world.month + CONSEQUENCE_LAG_MONTHS;

  // Education enrolment (Phase 9): accepting commits the program; declining is a
  // no-op. Completion (and its narrative) is driven by detectEducationCompletions,
  // not the generic consequence path, so clear the consequence month.
  if (decision.kind === 'EDUCATION_ENROLMENT') {
    decision.consequenceMonth = null;
    if (option.effect.enrol && opportunity?.enrolment) {
      enrolPlayer(world, opportunity.enrolment);
      if (opportunity) opportunity.status = 'ACCEPTED';
    } else if (opportunity) {
      opportunity.status = 'DECLINED';
    }
    return decision;
  }

  const player = world.player;
  if (option.effect.incomeMode === 'STANDING') {
    const amount = option.effect.standingAmount ?? player.monthlyIncome;
    player.incomeMode = 'STANDING';
    player.standingContract = { opportunityId: decision.opportunityId, monthlyAmount: amount };
    player.monthlyIncome = amount;
    if (opportunity) opportunity.status = 'ACCEPTED';
  } else {
    player.incomeMode = 'SPOT';
    player.spotBaseIncome = player.monthlyIncome;
    player.standingContract = null;
    if (opportunity) opportunity.status = 'DECLINED';
  }
  return decision;
}

// ── Asset-upgrade financing (Phase 7) ───────────────────────────────────────

// Locate an open ASSET_UPGRADE decision and its spec, or throw the right
// DecisionError (mirrors the validation in resolveDecision).
function findUpgrade(
  world: WorldState,
  decisionId: string,
): { decision: PlayerDecision; opportunity: Opportunity; spec: UpgradeSpec } {
  const decision = world.decisions.find((d) => d.id === decisionId);
  if (!decision || decision.kind !== 'ASSET_UPGRADE') {
    throw new DecisionError(`upgrade decision ${decisionId} not found`, 'NOT_FOUND');
  }
  if (decision.chosenOptionId !== null) {
    throw new DecisionError(`decision ${decisionId} already resolved`, 'ALREADY_RESOLVED');
  }
  const opportunity = world.opportunities.find((o) => o.id === decision.opportunityId);
  if (!opportunity || !opportunity.upgrade) {
    throw new DecisionError(`upgrade opportunity for ${decisionId} not found`, 'NOT_FOUND');
  }
  if (opportunity.status === 'EXPIRED') {
    throw new DecisionError(`decision ${decisionId} has expired`, 'EXPIRED');
  }
  return { decision, opportunity, spec: opportunity.upgrade };
}

// Clamp a requested down payment to what the player can actually put down: between
// nothing and the lesser of the asset's price and the cash on hand.
function clampDown(world: WorldState, spec: UpgradeSpec, downPayment: number): number {
  const max = Math.min(spec.assetPrice, world.player.cash);
  return clamp(Math.round(downPayment), 0, Math.max(0, Math.floor(max)));
}

export interface UpgradeQuote extends LoanAssessment {
  assetLabel: string;
  assetPrice: number;
  downPayment: number;
  requestedLoan: number;
}

// Read-only financing quote for an upgrade decision — the financing slider polls
// this as the player drags the down payment. Pure and deterministic; never mutates.
export function quoteUpgradeFinancing(
  world: WorldState,
  decisionId: string,
  downPayment: number,
  termMonths: number,
): UpgradeQuote {
  const { spec } = findUpgrade(world, decisionId);
  const cappedDown = clampDown(world, spec, downPayment);
  const requestedLoan = Math.max(0, spec.assetPrice - cappedDown);
  const assessment = assessLoanApplication(world, world.player, requestedLoan, termMonths, spec.assetPrice);
  return {
    ...assessment,
    assetLabel: spec.assetLabel,
    assetPrice: spec.assetPrice,
    downPayment: cappedDown,
    requestedLoan,
  };
}

export interface UpgradeResolution {
  decision: PlayerDecision;
  assetLabel: string;
  downPayment: number;
  principal: number;
  interestRate: number;
  monthlyPayment: number;
}

// Resolve an upgrade decision with a chosen down payment and term: assess the loan,
// take the down payment in cash, originate the (approved) loan, buy the asset, and
// raise the player's output and operating costs. The bank's amount is authoritative
// — a COUNTER is honoured by covering the shortfall in cash; a DECLINE or an
// unaffordable down payment throws. Pure (mutates the world, never world.rng).
export function applyUpgradeFinancing(
  world: WorldState,
  decisionId: string,
  downPayment: number,
  termMonths: number,
): UpgradeResolution {
  const { decision, opportunity, spec } = findUpgrade(world, decisionId);
  const p = world.player;
  const cappedDown = clampDown(world, spec, downPayment);
  const requestedLoan = Math.max(0, spec.assetPrice - cappedDown);
  const a = assessLoanApplication(world, p, requestedLoan, termMonths, spec.assetPrice);
  if (a.outcome === 'DECLINED') throw new DecisionError(a.reason, 'BAD_OPTION');

  // Honour the bank's amount: APPROVED lends the request; COUNTER lends less, so the
  // player must cover the larger remaining cost in cash.
  const principal = a.approvedPrincipal;
  const effectiveDown = spec.assetPrice - principal;
  if (p.cash < effectiveDown) {
    throw new DecisionError('You do not have the cash for that down payment.', 'BAD_OPTION');
  }

  p.cash -= effectiveDown;

  // Phase 8: an upgrade may target a specific venture; otherwise it grows the
  // implicit single-stream player. The loan is the player's debt either way.
  const venture = opportunity.ventureId
    ? activeVentures(p).find((v) => v.id === opportunity.ventureId)
    : undefined;
  if (opportunity.ventureId && !venture) {
    throw new DecisionError('That venture is no longer active.', 'NOT_FOUND');
  }
  const purposeIndustry = venture ? venture.industry : p.occupation ?? undefined;
  if (principal > 0) {
    originateLoan(
      world, p, a.bankId, principal, a.interestRate, a.monthlyPayment, a.termMonths,
      purposeIndustry,
    );
  }

  if (venture) {
    // The asset and the output/cost bump land on that venture only — the rest of the
    // portfolio is untouched.
    venture.assets.push({
      id: `${spec.id}@${venture.id}`, type: spec.assetType, size: spec.assetSize, value: spec.assetPrice,
    });
    venture.outputScale += spec.outputScaleDelta;
    venture.monthlyOperatingCosts += spec.operatingCostDelta;
    if (venture.incomeMode === 'STANDING' && venture.standingContract) {
      venture.standingContract.monthlyAmount = Math.round(
        venture.standingContract.monthlyAmount * (1 + spec.outputScaleDelta),
      );
    }
  } else {
    p.economicAssets.push({
      id: spec.id, type: spec.assetType, size: spec.assetSize, value: spec.assetPrice,
    });
    p.outputScale = (p.outputScale ?? 1) + spec.outputScaleDelta;
    p.monthlyOperatingCosts = (p.monthlyOperatingCosts ?? 0) + spec.operatingCostDelta;

    // Income footing: a standing-contract player grows the contract with their new
    // supply; everyone else goes onto a market footing (so seasonality bites) scaled
    // by the bigger output.
    if (p.incomeMode === 'STANDING' && p.standingContract) {
      p.standingContract.monthlyAmount = Math.round(
        p.standingContract.monthlyAmount * (1 + spec.outputScaleDelta),
      );
      p.monthlyIncome = p.standingContract.monthlyAmount;
    } else if (p.incomeMode !== 'SPOT') {
      p.incomeMode = 'SPOT';
      p.spotBaseIncome = p.spotBaseIncome ?? p.monthlyIncome;
    }
  }

  decision.chosenOptionId = 'ACCEPT_UPGRADE';
  decision.resolvedMonth = world.month;
  decision.consequenceMonth = world.month + CONSEQUENCE_LAG_MONTHS;
  opportunity.status = 'ACCEPTED';

  return {
    decision,
    assetLabel: spec.assetLabel,
    downPayment: effectiveDown,
    principal,
    interestRate: a.interestRate,
    monthlyPayment: a.monthlyPayment,
  };
}

// Apply the player's chosen income behaviour for the month. Called by the server
// before simulateOneMonth on advance. A no-op until a decision sets `incomeMode`,
// so the default player's income is untouched (the golden master holds). Pure.
export function updatePlayerIncome(world: WorldState): void {
  const p = world.player;
  // Phase 8: a venture portfolio earns the sum of its active ventures' income; the
  // single-stream fields below are unused once `ventures` is populated.
  if (hasVentures(p)) {
    p.monthlyIncome = aggregateVentureIncome(world);
    return;
  }
  if (p.incomeMode === 'STANDING' && p.standingContract) {
    p.monthlyIncome = p.standingContract.monthlyAmount;
    return;
  }
  if (p.incomeMode === 'SPOT' && p.occupation && p.spotBaseIncome != null) {
    const goodId = REPRESENTATIVE_GOOD[p.occupation];
    if (!goodId) return;
    const good = GOODS.find((g) => g.id === goodId);
    const market = world.markets.find((m) => m.goodId === goodId && m.parish === p.parish);
    if (!good || !market) return;
    const factor = clamp(market.currentPrice / good.basePrice, SPOT_MIN_FACTOR, SPOT_MAX_FACTOR);
    // A bigger boat lands more fish: output scales the spot base; seasonality (in the
    // market price) still swings the month-to-month take, lean spells and all.
    p.monthlyIncome = Math.round(p.spotBaseIncome * (p.outputScale ?? 1) * factor);
  }
}

// Find decisions whose delayed consequence is due this month and mark them
// delivered (P6.4). Mutates the decisions so a consequence surfaces exactly once;
// the server persists the world and the narrative layer renders the entries. Pure.
export function detectDueConsequences(world: WorldState): PlayerDecision[] {
  const due = world.decisions.filter(
    (d) =>
      d.resolvedMonth !== null &&
      d.consequenceMonth === world.month &&
      !d.consequenceDelivered,
  );
  for (const d of due) d.consequenceDelivered = true;
  return due;
}
