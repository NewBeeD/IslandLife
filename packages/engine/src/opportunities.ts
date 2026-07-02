import {
  GOODS,
  JUICE_STAND,
  JUICE_STAND_REFERENCE_REVENUE,
  OFFER_REOFFER_COOLDOWN_MONTHS,
  PARISHES,
  REPRESENTATIVE_GOOD,
  credentialRank,
  hasRecentEquivalentOffer,
  opportunityLogicalKey,
} from '@island/shared';
import { OPERATOR_SHARE } from '@island/shared';
import type {
  Asset,
  CredentialLevel,
  DecisionOption,
  EducationProgram,
  Industry,
  NewVentureSpec,
  Opportunity,
  PlayerDecision,
  SideJobSpec,
  UpgradeSpec,
  Venture,
  WorldState,
} from '@island/shared';
import { assessLoanApplication, originateLoan } from './banking';
import type { LoanAssessment } from './banking';
import {
  activeVentures,
  aggregateVentureIncome,
  discontinueVenture,
  ensurePlayerVentures,
  freeTime,
  hasVentures,
  refreshVenturePerformance,
  ventureAssetType,
  ventureProfileForRisk,
  ventureTimeLoadForTier,
} from './ventures';
import {
  STUDY_LOAN_MAX_TERM_MONTHS,
  STUDY_LOAN_MIN_TERM_MONTHS,
  credentialLevelOf,
  enrolPlayer,
  surfaceEducation,
} from './education';
import {
  applyBackerFunding,
  applyPartnership,
  surfaceCrowdfund,
  surfacePartnership,
} from './funding';
import { operatorShareForEmployer } from './reputation';
import {
  accruePlayerInvestments,
  applyInvestment,
  surfaceInvestSolicitation,
} from './investing';
import { isWageIndustry, refreshWageRates, wageDailyRate, wageMonthlyIncome } from './wages';
import { surfaceJobs } from './jobs';
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
  // P17.5 — consider EVERY active venture's next rung, not only the first, so an
  // established venture (a grown juice stand, a second boat) is reachable for its own
  // upgrade and not blocked by another venture always being first in line. Pick the
  // first candidate whose rung is not still live or freshly lapsed (P13.1).
  const candidates = upgradeCandidates(world);
  let chosen: UpgradeCandidate | null = null;
  let opportunity: Opportunity | null = null;
  for (const candidate of candidates) {
    const { template: t, industry, ventureId } = candidate;
    const suffix = ventureId ? `${ventureId}_` : '';
    const oppId = `OPP_${t.id}_${suffix}${world.month}`;
    const decId = `DEC_${t.id}_${suffix}${world.month}`;
    const built: Opportunity = {
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
    // P13.1 — skip a rung still live or only just lapsed, so a declined/expired upgrade
    // stops piling up duplicate "Passed" rows; try the next venture's ladder instead.
    if (hasRecentEquivalentOffer(world.opportunities, opportunityLogicalKey(built), world.month, OFFER_REOFFER_COOLDOWN_MONTHS)) {
      continue;
    }
    chosen = candidate;
    opportunity = built;
    break;
  }
  if (!chosen || !opportunity) return null;
  const { decisionId: decId } = opportunity;
  const oppId = opportunity.id;
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

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 10 — cross-domain new ventures, side hustles, and saturation.
//
// Opportunities reach beyond the player's own trade: a fisher can buy a minibus, a
// lecturer can run a boat. Low-barrier hustles (a roadside juice stand) are cheap
// and always offerable but their takings saturate as more people pile in (P10.3,
// applied in ventures.ts). Bigger plays gate on cash and credentials (P10.4). Each
// accepted venture stands up a new income stream (Phase 8) funded through the same
// financing slider as an upgrade (P7.6). Surfacing draws from world.rng for variety.
// ─────────────────────────────────────────────────────────────────────────────

const NEW_VENTURE_CHANNEL = 'WORD_AROUND';
const NEW_VENTURE_WINDOW = 3;
const NEW_VENTURE_COOLDOWN = 2;
const NEW_VENTURE_FROM_MONTH = 2;

// Cross-domain entry catalogue across every industry and barrier tier. Prices in EC$.
const NEW_VENTURE_CATALOGUE: NewVentureSpec[] = [
  // LOW barrier — cheap, fast, always offerable; takings saturate as people crowd in.
  { id: 'NV_JUICE', industry: 'RETAIL', label: 'a roadside juice and snack stand', ventureLabel: 'the juice stand', entryCost: 1500, startingOutputIncome: JUICE_STAND_REFERENCE_REVENUE, operatingCost: JUICE_STAND.fruitCostPerBag + JUICE_STAND.sugarTransportPerBag, barrierTier: 'LOW', riskLevel: 'LOW', minTermMonths: 12, maxTermMonths: 24, production: 'JUICE_STAND' },
  { id: 'NV_RESALE', industry: 'INFORMAL_TRADE', label: 'a small resale line — phone cards, household bits', ventureLabel: 'the resale line', entryCost: 2200, startingOutputIncome: 750, operatingCost: 180, barrierTier: 'LOW', riskLevel: 'MEDIUM', minTermMonths: 12, maxTermMonths: 24 },
  // MEDIUM barrier — a real piece of kit, some capital, steadier money.
  { id: 'NV_PROVISION', industry: 'AGRICULTURE', label: 'a rented provision plot and tools', ventureLabel: 'the provision garden', entryCost: 12000, startingOutputIncome: 1100, operatingCost: 250, barrierTier: 'MEDIUM', riskLevel: 'MEDIUM', minTermMonths: 24, maxTermMonths: 60, minCash: 2500 },
  { id: 'NV_PIROGUE', industry: 'FISHING', label: 'a small pirogue and an outboard', ventureLabel: 'the boat', entryCost: 22000, startingOutputIncome: 1600, operatingCost: 450, barrierTier: 'MEDIUM', riskLevel: 'MEDIUM_HIGH', minTermMonths: 24, maxTermMonths: 60, minCash: 4000 },
  { id: 'NV_MINIBUS', industry: 'TRANSPORTATION', label: 'a second-hand minibus and a route', ventureLabel: 'the minibus', entryCost: 35000, startingOutputIncome: 2200, operatingCost: 900, barrierTier: 'MEDIUM', riskLevel: 'MEDIUM_HIGH', minTermMonths: 24, maxTermMonths: 60, minCash: 6000 },
  // HIGH barrier — a substantial play; gated on real capital.
  { id: 'NV_SHOP', industry: 'RETAIL', label: 'a rented shopfront and opening stock', ventureLabel: 'the shop', entryCost: 45000, startingOutputIncome: 2600, operatingCost: 600, barrierTier: 'HIGH', riskLevel: 'HIGH', minTermMonths: 36, maxTermMonths: 72, minCash: 9000 },
  { id: 'NV_GUESTROOMS', industry: 'TOURISM', label: 'a couple of rooms set up to let to visitors', ventureLabel: 'the guest rooms', entryCost: 60000, startingOutputIncome: 2800, operatingCost: 700, barrierTier: 'HIGH', riskLevel: 'HIGH', minTermMonths: 36, maxTermMonths: 84, minCash: 12000 },
  // Credential-gated — the formal sector only opens to a qualification (Phase 9).
  { id: 'NV_BOOKKEEPING', industry: 'FINANCE', label: 'a small bookkeeping practice for local traders', ventureLabel: 'the bookkeeping practice', entryCost: 8000, startingOutputIncome: 2400, operatingCost: 300, barrierTier: 'HIGH', riskLevel: 'MEDIUM', minTermMonths: 12, maxTermMonths: 36, minCash: 2000, minCredential: 'DEGREE' },
];

// Whether the player already works a given trade (an active venture in it, or — for
// a single-stream player — their occupation). Used so new ventures are cross-domain.
function playerRunsIndustry(world: WorldState, industry: Industry): boolean {
  const p = world.player;
  if (hasVentures(p)) return activeVentures(p).some((v) => v.industry === industry);
  return p.occupation === industry;
}

// The minimum cash to be offered a venture (P10.4 wealth gate): an explicit floor, or
// a tenth of the entry cost so a player who could not plausibly fund it isn't teased.
function ventureCashGate(spec: NewVentureSpec): number {
  return spec.minCash ?? Math.round(spec.entryCost * 0.1);
}

// The new ventures the player could be offered now: cross-domain, past the credential
// gate, and within the wealth gate.
function eligibleNewVentures(world: WorldState): NewVentureSpec[] {
  const p = world.player;
  const credential = credentialLevelOf(p);
  return NEW_VENTURE_CATALOGUE.filter((spec) => {
    if (playerRunsIndustry(world, spec.industry)) return false;
    if (spec.minCredential && credentialRank(credential) < credentialRank(spec.minCredential)) return false;
    return p.cash >= ventureCashGate(spec);
  });
}

// One new-venture offer at a time, with a short cooldown after one lapses or is taken.
function newVentureOnCooldown(world: WorldState): boolean {
  let lastClosed = -Infinity;
  for (const o of world.opportunities) {
    if (o.kind !== 'NEW_VENTURE') continue;
    if (o.status === 'OPEN') return true;
    const closed = o.surfacedMonth + o.windowMonths;
    if (closed > lastClosed) lastClosed = closed;
  }
  return world.month - lastClosed < NEW_VENTURE_COOLDOWN;
}

// Surface a cross-domain new-venture offer if one is eligible (P10.1). Picks from the
// eligible set via world.rng for variety; a low-barrier hustle is essentially always
// among them, so there is usually something to start (P10.2). The decision is
// financed interactively (the slider), like an asset upgrade.
function surfaceNewVenture(world: WorldState): Opportunity | null {
  if (world.month < NEW_VENTURE_FROM_MONTH || newVentureOnCooldown(world)) return null;
  // P13.1 — exclude any spec whose offer is still live or only just lapsed, so the
  // random pick can never re-surface a juice stand that just expired (a duplicate
  // "Passed" row). Filtering before the draw keeps the choice among fresh offers.
  const eligible = eligibleNewVentures(world).filter(
    (spec) => !hasRecentEquivalentOffer(world.opportunities, `NEW_VENTURE:${spec.id}`, world.month, OFFER_REOFFER_COOLDOWN_MONTHS),
  );
  if (eligible.length === 0) return null;
  const spec = world.rng.pick(eligible);

  const oppId = `OPP_${spec.id}_${world.month}`;
  const decId = `DEC_${spec.id}_${world.month}`;
  const opportunity: Opportunity = {
    id: oppId,
    kind: 'NEW_VENTURE',
    industry: spec.industry,
    npcName: 'someone looking to pass it on',
    channelId: NEW_VENTURE_CHANNEL,
    surfacedMonth: world.month,
    windowMonths: NEW_VENTURE_WINDOW,
    status: 'OPEN',
    decisionId: decId,
    monthlyAmount: 0,
    newVenture: spec,
  };
  const decision: PlayerDecision = {
    id: decId,
    opportunityId: oppId,
    kind: 'NEW_VENTURE',
    surfacedMonth: world.month,
    windowMonths: NEW_VENTURE_WINDOW,
    options: [], // financed interactively (the slider), not a fixed option list
    chosenOptionId: null,
    resolvedMonth: null,
    consequenceMonth: null,
    consequenceDelivered: false,
  };
  world.opportunities.push(opportunity);
  world.decisions.push(decision);
  return opportunity;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 15 — independent side jobs for an experienced wage worker (P15.3).
//
// Once a wage worker (construction day labour) has put in enough time to work on
// their own, short paid-on-completion gigs start coming their way — a few days
// finishing a house, paid when the job is done (idea 1). A green worker is not
// offered them; they unlock with experience. Surfaced from world.rng for variety.
// ─────────────────────────────────────────────────────────────────────────────

const SIDE_JOB_CHANNEL = 'WORD_AROUND';
const SIDE_JOB_WINDOW = 2;
const SIDE_JOB_COOLDOWN = 3;
// A worker is only offered independent jobs once they could plausibly work alone.
const SIDE_JOB_FROM_MONTH = 6;
const SIDE_JOB_MIN_EXPERIENCE = 0.35;
// Independent work pays a premium over a day's wage on someone else's site.
const SIDE_JOB_RATE_PREMIUM = 1.25;

// The player's wage-work trade and their experience in it, or null if they are not a
// wage worker. Reads "venture 0" when a portfolio runs, else the single-stream fields.
function playerWageContext(world: WorldState): { industry: Industry; experience: number } | null {
  const p = world.player;
  if (hasVentures(p)) {
    for (const v of activeVentures(p)) {
      if (v.wageProfile) {
        return { industry: v.industry, experience: p.experience[DOMAIN_OF[v.industry]] ?? 0 };
      }
    }
    return null;
  }
  if (p.wageProfile && p.occupation) {
    return { industry: p.occupation, experience: p.experience[DOMAIN_OF[p.occupation]] ?? 0 };
  }
  return null;
}

function sideJobOnCooldown(world: WorldState): boolean {
  let lastClosed = -Infinity;
  for (const o of world.opportunities) {
    if (o.kind !== 'SIDE_JOB') continue;
    if (o.status === 'OPEN') return true;
    const closed = o.surfacedMonth + o.windowMonths;
    if (closed > lastClosed) lastClosed = closed;
  }
  return world.month - lastClosed < SIDE_JOB_COOLDOWN;
}

function parishName(world: WorldState): string {
  return PARISHES.find((p) => p.id === world.player.parish)?.name ?? 'the parish';
}

// Surface an independent side job if the worker is experienced enough (P15.3). The
// payout is the worker's own day rate × the days × an independence premium, so a more
// skilled worker is offered more lucrative gigs. Draws days from world.rng for variety.
function surfaceSideJob(world: WorldState): Opportunity | null {
  if (world.month < SIDE_JOB_FROM_MONTH || sideJobOnCooldown(world)) return null;
  const ctx = playerWageContext(world);
  if (!ctx || ctx.experience < SIDE_JOB_MIN_EXPERIENCE) return null;

  const days = world.rng.int(4, 9);
  const payout = Math.round(wageDailyRate(world.player, ctx.industry) * days * SIDE_JOB_RATE_PREMIUM);
  const place = parishName(world);
  const spec: SideJobSpec = {
    id: `SJ_${ctx.industry}_${world.month}`,
    industry: ctx.industry,
    label: `${days} days finishing a job in ${place}`,
    payout,
    days,
  };

  const oppId = `OPP_${spec.id}`;
  const decId = `DEC_${spec.id}`;
  const options: DecisionOption[] = [
    {
      id: 'TAKE',
      label: 'Take the work',
      description:
        `${days} days on the job, ${formatEc(payout)} in your hand when it is finished. ` +
        'Extra on top of your usual week — yours if you want it.',
      effect: { sideJobPayout: payout },
    },
    {
      id: 'PASS',
      label: 'Leave it — your hands are full',
      description: 'You have enough on already. Let someone else take this one.',
      effect: {},
    },
  ];
  const decision: PlayerDecision = {
    id: decId,
    opportunityId: oppId,
    kind: 'SIDE_JOB',
    surfacedMonth: world.month,
    windowMonths: SIDE_JOB_WINDOW,
    options,
    chosenOptionId: null,
    resolvedMonth: null,
    consequenceMonth: null,
    consequenceDelivered: false,
  };
  const opportunity: Opportunity = {
    id: oppId,
    kind: 'SIDE_JOB',
    industry: ctx.industry,
    npcName: 'a contractor short of hands',
    channelId: SIDE_JOB_CHANNEL,
    surfacedMonth: world.month,
    windowMonths: SIDE_JOB_WINDOW,
    status: 'OPEN',
    decisionId: decId,
    monthlyAmount: 0,
    sideJob: spec,
  };
  world.opportunities.push(opportunity);
  world.decisions.push(decision);
  return opportunity;
}

// How long a settled (EXPIRED/ACCEPTED/DECLINED) opportunity is kept on the world
// before it is swept away (P13.3). Long enough to outlast the re-offer cooldown and
// any delayed consequence, so pruning never races the lifecycle that still needs it.
const PRUNE_AFTER_MONTHS = 18;

// Sweep long-settled opportunities (and their fully-resolved decisions) off the
// world so the snapshot JSONB stops growing without bound over a long life (P13.3).
// A decision whose delayed consequence (the MEMORY) is still pending is kept until
// it fires. A player who has never had an opportunity is byte-identical: the early
// return means no mutation and the no-opportunity golden master holds (S2).
function pruneOpportunities(world: WorldState): void {
  if (world.opportunities.length === 0) return;
  const dropped = new Set<string>();
  world.opportunities = world.opportunities.filter((o) => {
    if (o.status === 'OPEN') return true;
    if (world.month - (o.surfacedMonth + o.windowMonths) < PRUNE_AFTER_MONTHS) return true;
    dropped.add(o.id);
    return false;
  });
  if (dropped.size === 0) return;
  world.decisions = world.decisions.filter((d) => {
    if (!dropped.has(d.opportunityId)) return true;
    // Keep a resolved decision whose consequence MEMORY has not yet surfaced.
    return d.resolvedMonth !== null && d.consequenceMonth !== null && !d.consequenceDelivered;
  });
}

// The information-channel filter (P6.1). Expires stale offers and surfaces newly
// available ones. Returns the opportunities that became visible this call (so the
// server can note them). Deterministic in (world state, world.rng).
export function surfaceOpportunities(world: WorldState): Opportunity[] {
  // Expire any OPEN opportunity whose window has closed unanswered.
  for (const opp of world.opportunities) {
    if (opp.status === 'OPEN' && world.month > opp.surfacedMonth + opp.windowMonths) {
      opp.status = 'EXPIRED';
    }
  }
  // Drop long-settled offers so world.opportunities stays bounded over a long life.
  pruneOpportunities(world);

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

  // Cross-domain new ventures & side hustles — diversify beyond the player's trade
  // (Phase 10). Surfaced last so the existing decisions keep their stable ordering.
  const newVenture = surfaceNewVenture(world);
  if (newVenture) surfaced.push(newVenture);

  // Raising money from friends, and forming a shared firm with a partner (Phase 11).
  const crowdfund = surfaceCrowdfund(world);
  if (crowdfund) surfaced.push(crowdfund);
  const partnership = surfacePartnership(world);
  if (partnership) surfaced.push(partnership);

  // Independent side jobs for an experienced wage worker (Phase 15).
  const sideJob = surfaceSideJob(world);
  if (sideJob) surfaced.push(sideJob);

  // Inbound invitations to invest in someone else's venture (Phase 18). Rare/small for
  // a poor unknown, larger and more frequent as cash and reputation rise (P18.2).
  // Surfaced after the existing surfacers so it draws world.rng last, leaving their
  // rng-dependent outcomes unchanged.
  const solicitation = surfaceInvestSolicitation(world);
  if (solicitation) surfaced.push(solicitation);

  // The job market — a rotating slate of postings the player can browse (Phase 16).
  // Maintained on world.jobPostings (not returned here, since it is not an
  // Opportunity). Run last so it draws world.rng after the existing surfacers, leaving
  // their rng-dependent outcomes unchanged.
  surfaceJobs(world);

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

  // Crowdfunding (Phase 11): a chosen backer's money comes in as a friend-loan or an
  // equity stake; "raise nothing" is a no-op. The delayed MEMORY uses the consequence
  // path scheduled above.
  if (decision.kind === 'CROWDFUND') {
    if (option.effect.funding) {
      applyBackerFunding(world, option.effect.funding);
      if (opportunity) opportunity.status = 'ACCEPTED';
    } else {
      decision.consequenceMonth = null;
      if (opportunity) opportunity.status = 'DECLINED';
    }
    return decision;
  }

  // Side job (Phase 15): taking it pays the gig on completion (cash now); passing is
  // a no-op. No delayed MEMORY — a few days' work is its own small chapter.
  if (decision.kind === 'SIDE_JOB') {
    decision.consequenceMonth = null;
    if (option.effect.sideJobPayout != null) {
      world.player.cash += option.effect.sideJobPayout;
      if (opportunity) opportunity.status = 'ACCEPTED';
    } else if (opportunity) {
      opportunity.status = 'DECLINED';
    }
    return decision;
  }

  // Investing in someone else's venture (Phase 18, P18.1): the chosen option carries
  // the return structure (loan / dividend / revenue share); "stay out" is a no-op. The
  // principal must be on hand. A delayed MEMORY uses the consequence path above.
  if (decision.kind === 'INVEST_SOLICITATION') {
    const structure = option.effect.invest?.structure;
    if (structure && opportunity?.invest) {
      if (world.player.cash < opportunity.invest.principal) {
        // Roll back the partial resolution and refuse — the player cannot fund it.
        decision.chosenOptionId = null;
        decision.resolvedMonth = null;
        decision.consequenceMonth = null;
        throw new DecisionError('You do not have the money to put in.', 'BAD_OPTION');
      }
      applyInvestment(world, opportunity.invest, structure);
      if (opportunity) opportunity.status = 'ACCEPTED';
    } else {
      decision.consequenceMonth = null;
      if (opportunity) opportunity.status = 'DECLINED';
    }
    return decision;
  }

  // Partnership (Phase 11): going in forms the shared firm; staying out is a no-op.
  if (decision.kind === 'PARTNERSHIP') {
    if (option.effect.accept && opportunity?.partnership) {
      applyPartnership(world, opportunity.partnership);
      if (opportunity) opportunity.status = 'ACCEPTED';
    } else {
      decision.consequenceMonth = null;
      if (opportunity) opportunity.status = 'DECLINED';
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

// ── Financed purchases: asset upgrades (Phase 7) & new ventures (Phase 10) ───
//
// Both an upgrade and a new venture are bought through the same financing slider:
// a price up front, paid in cash and/or a bank loan, the bank's amount authoritative.
// `Financeable` is the common shape behind either kind so one quote/resolve path
// serves both; resolution then branches on the kind (grow an asset vs. stand up a
// venture).

interface Financeable {
  label: string; // the thing being bought/started
  price: number; // EC$ up front
  // The collateral the bank prices the loan against: the asset for an upgrade/new
  // venture (secured), 0 for a study loan (unsecured — Phase 14, P14.5).
  collateralValue: number;
  minTermMonths: number;
  maxTermMonths: number;
}

// The financeable purchase behind an opportunity, or null if it has none.
function financeableOf(opp: Opportunity): Financeable | null {
  if (opp.upgrade) {
    const u = opp.upgrade;
    return { label: u.assetLabel, price: u.assetPrice, collateralValue: u.assetPrice, minTermMonths: u.minTermMonths, maxTermMonths: u.maxTermMonths };
  }
  if (opp.newVenture) {
    const n = opp.newVenture;
    return { label: n.label, price: n.entryCost, collateralValue: n.entryCost, minTermMonths: n.minTermMonths, maxTermMonths: n.maxTermMonths };
  }
  if (opp.enrolment) {
    // A study loan is unsecured — no collateral (P14.5). The "price" is the tuition the
    // player can fund themselves and/or borrow toward.
    const e = opp.enrolment;
    return { label: e.name, price: e.totalCost, collateralValue: 0, minTermMonths: STUDY_LOAN_MIN_TERM_MONTHS, maxTermMonths: STUDY_LOAN_MAX_TERM_MONTHS };
  }
  return null;
}

// Locate an open financed decision (ASSET_UPGRADE, NEW_VENTURE, or EDUCATION_ENROLMENT)
// and its purchase, or throw the right DecisionError (mirrors resolveDecision).
function findFinanceable(
  world: WorldState,
  decisionId: string,
): { decision: PlayerDecision; opportunity: Opportunity; spec: Financeable } {
  const decision = world.decisions.find((d) => d.id === decisionId);
  if (
    !decision ||
    (decision.kind !== 'ASSET_UPGRADE' &&
      decision.kind !== 'NEW_VENTURE' &&
      decision.kind !== 'EDUCATION_ENROLMENT')
  ) {
    throw new DecisionError(`financed decision ${decisionId} not found`, 'NOT_FOUND');
  }
  if (decision.chosenOptionId !== null) {
    throw new DecisionError(`decision ${decisionId} already resolved`, 'ALREADY_RESOLVED');
  }
  const opportunity = world.opportunities.find((o) => o.id === decision.opportunityId);
  const spec = opportunity ? financeableOf(opportunity) : null;
  if (!opportunity || !spec) {
    throw new DecisionError(`financed opportunity for ${decisionId} not found`, 'NOT_FOUND');
  }
  if (opportunity.status === 'EXPIRED') {
    throw new DecisionError(`decision ${decisionId} has expired`, 'EXPIRED');
  }
  return { decision, opportunity, spec };
}

// Clamp a requested down payment to what the player can actually put down: between
// nothing and the lesser of the price and the cash on hand.
function clampDown(world: WorldState, price: number, downPayment: number): number {
  const max = Math.min(price, world.player.cash);
  return clamp(Math.round(downPayment), 0, Math.max(0, Math.floor(max)));
}

export interface UpgradeQuote extends LoanAssessment {
  assetLabel: string;
  assetPrice: number;
  downPayment: number;
  requestedLoan: number;
}

// Read-only financing quote for a financed decision — the slider polls this as the
// player drags the down payment. Serves upgrades and new ventures alike. Pure and
// deterministic; never mutates.
export function quoteUpgradeFinancing(
  world: WorldState,
  decisionId: string,
  downPayment: number,
  termMonths: number,
): UpgradeQuote {
  const { spec } = findFinanceable(world, decisionId);
  const cappedDown = clampDown(world, spec.price, downPayment);
  const requestedLoan = Math.max(0, spec.price - cappedDown);
  const assessment = assessLoanApplication(world, world.player, requestedLoan, termMonths, spec.collateralValue);
  return {
    ...assessment,
    assetLabel: spec.label,
    assetPrice: spec.price,
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

// Resolve a financed decision with a chosen down payment and term: assess the loan,
// take the down payment in cash, originate the (approved) loan, and then either grow
// an asset (ASSET_UPGRADE) or stand up a new income stream (NEW_VENTURE). The bank's
// amount is authoritative — a COUNTER is honoured by covering the shortfall in cash;
// a DECLINE or an unaffordable down payment throws. Pure (mutates the world, never
// world.rng).
// How the player resolves a new venture that would over-fill their working time
// (Phase 17, P17.1). SOLO — run it themselves (rejected if there is no time). HIRE —
// take someone on to run it (passive, a cut of the takings). SWITCH — wind down a
// venture they already run to free the time, then run the new one themselves.
export type VentureCommitment =
  | { mode: 'SOLO' }
  | { mode: 'HIRE' }
  | { mode: 'SWITCH'; closeVentureId: string };

export function applyUpgradeFinancing(
  world: WorldState,
  decisionId: string,
  downPayment: number,
  termMonths: number,
  commitment?: VentureCommitment,
): UpgradeResolution {
  const { decision, opportunity, spec } = findFinanceable(world, decisionId);
  const p = world.player;
  const cappedDown = clampDown(world, spec.price, downPayment);
  const requestedLoan = Math.max(0, spec.price - cappedDown);
  const a = assessLoanApplication(world, p, requestedLoan, termMonths, spec.collateralValue);
  if (a.outcome === 'DECLINED') throw new DecisionError(a.reason, 'BAD_OPTION');
  const principal = a.approvedPrincipal;

  // Education (P14.5): a study loan is a liquidity bridge, not a prepayment — tuition
  // still drains monthly (Phase 9). The loan proceeds land in cash now to offset that
  // drain, and the unborrowed share is simply funded from the drain, so there is no
  // upfront down payment to find. Completion (not the generic consequence path) drives
  // the narrative, so the consequence month is cleared.
  if (opportunity.kind === 'EDUCATION_ENROLMENT' && opportunity.enrolment) {
    applyEnrolmentFinancing(world, opportunity.enrolment, a, principal);
    decision.chosenOptionId = 'ACCEPT_ENROL';
    decision.resolvedMonth = world.month;
    decision.consequenceMonth = null;
    opportunity.status = 'ACCEPTED';
    return {
      decision,
      assetLabel: spec.label,
      downPayment: Math.max(0, spec.price - principal),
      principal,
      interestRate: a.interestRate,
      monthlyPayment: a.monthlyPayment,
    };
  }

  // Honour the bank's amount: APPROVED lends the request; COUNTER lends less, so the
  // player must cover the larger remaining cost in cash.
  const effectiveDown = spec.price - principal;
  if (p.cash < effectiveDown) {
    throw new DecisionError('You do not have the cash for that down payment.', 'BAD_OPTION');
  }

  if (opportunity.kind === 'NEW_VENTURE' && opportunity.newVenture) {
    applyNewVenture(world, opportunity.newVenture, effectiveDown, a, principal, commitment);
  } else if (opportunity.upgrade) {
    applyUpgrade(world, opportunity, opportunity.upgrade, effectiveDown, a, principal);
  } else {
    throw new DecisionError(`financed opportunity for ${decisionId} not found`, 'NOT_FOUND');
  }

  decision.chosenOptionId = 'ACCEPT_UPGRADE';
  decision.resolvedMonth = world.month;
  decision.consequenceMonth = world.month + CONSEQUENCE_LAG_MONTHS;
  opportunity.status = 'ACCEPTED';

  return {
    decision,
    assetLabel: spec.label,
    downPayment: effectiveDown,
    principal,
    interestRate: a.interestRate,
    monthlyPayment: a.monthlyPayment,
  };
}

// Grow an asset upgrade (Phase 7/8): take the down payment, book the loan, and bump
// the targeted venture (or the implicit single-stream player) output & costs.
function applyUpgrade(
  world: WorldState,
  opportunity: Opportunity,
  spec: UpgradeSpec,
  effectiveDown: number,
  a: LoanAssessment,
  principal: number,
): void {
  const p = world.player;
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
      // Phase 24.3: fresh gear — stamp its vintage so it starts to age from now, and it
      // renews the venture (the output bump above offsets accumulated wear).
      acquiredMonth: world.month,
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
      acquiredMonth: world.month, // Phase 24.3: fresh gear ages from now on
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
}

// Stand up a new venture (Phase 10): materialize the player's existing income as
// "venture 0" so the new stream earns alongside it, take the down payment, book the
// loan, and push the new ACTIVE venture (carrying its starting equipment & barrier).
function applyNewVenture(
  world: WorldState,
  spec: NewVentureSpec,
  effectiveDown: number,
  a: LoanAssessment,
  principal: number,
  commitment?: VentureCommitment,
): void {
  const p = world.player;
  ensurePlayerVentures(world);

  // P17.1 — resolve the time commitment before any money moves. HIRE makes the venture
  // passive (an operator runs it for a cut); SWITCH winds down an existing venture to
  // free the time; otherwise the player runs it themselves, which is refused when their
  // day is already full (a full-time job, or other hands-on ventures).
  const handsOnLoad = ventureTimeLoadForTier(spec.timeLoad, spec.barrierTier);
  let operatedBy: 'PLAYER' | 'OPERATOR' = 'PLAYER';
  if (commitment?.mode === 'HIRE') {
    operatedBy = 'OPERATOR';
  } else if (commitment?.mode === 'SWITCH') {
    discontinueVenture(world, commitment.closeVentureId);
  }
  if (operatedBy === 'PLAYER' && handsOnLoad > freeTime(p) + 1e-6) {
    throw new DecisionError(
      'You do not have the time to run this yourself — you would have to take someone on to run it, or step back from something you already do.',
      'BAD_OPTION',
    );
  }

  p.cash -= effectiveDown;

  if (principal > 0) {
    originateLoan(
      world, p, a.bankId, principal, a.interestRate, a.monthlyPayment, a.termMonths, spec.industry,
    );
  }

  const ventureId = `VEN_${spec.id}_${world.month}`;
  // P17.2 — attribute the venture's fixed fuel/upkeep to its physical asset, so a
  // future shared asset is charged once. The juice stand's cost is variable (fruit &
  // sugar, sampled monthly), so it stays a venture-level cost instead.
  const assetBacked = spec.entryCost > 0 && spec.production !== 'JUICE_STAND';
  const asset: Asset | null =
    spec.entryCost > 0
      ? {
          id: `${spec.id}@${ventureId}`,
          type: ventureAssetType(spec.industry),
          value: spec.entryCost,
          acquiredMonth: world.month, // Phase 24.3: the venture's equipment ages from now
          ...(assetBacked ? { monthlyUpkeep: spec.operatingCost } : {}),
        }
      : null;
  const venture: Venture = {
    id: ventureId,
    industry: spec.industry,
    label: spec.ventureLabel,
    incomeMode: 'SPOT',
    spotBaseIncome: spec.startingOutputIncome,
    standingContract: null,
    outputScale: 1,
    monthlyOperatingCosts: assetBacked ? 0 : spec.operatingCost,
    assets: asset ? [asset] : [],
    status: 'ACTIVE',
    barrierTier: spec.barrierTier,
    timeLoad: handsOnLoad,
    operatedBy,
    // Phase 21: the operator's cut reflects the player's standing as an employer — a
    // well-regarded one attracts hands for a smaller share, a poorly-regarded one pays
    // more. Neutral standing → the base OPERATOR_SHARE (byte-identical pre-Phase-21).
    ...(operatedBy === 'OPERATOR'
      ? { operatorShare: operatorShareForEmployer(p, OPERATOR_SHARE) }
      : {}),
    // P17.4 — a hidden success/volatility profile so some ventures underperform or fail.
    profile: ventureProfileForRisk(spec.riskLevel, world.rng),
    performanceFactor: 1,
    ...(spec.production ? { production: spec.production } : {}),
  };
  (p.ventures ??= []).push(venture);
  // Reflect the new stream in monthly income immediately (recomputed each advance).
  p.monthlyIncome = aggregateVentureIncome(world);
}

// Enrol on a study loan (Phase 10/14, P14.5): the loan proceeds land in cash to
// cushion the monthly tuition (which still drains, Phase 9), the loan is booked as the
// player's own debt, and the program commits. With no loan (the player funds it all
// themselves) this is exactly the old monthly-drain enrolment.
function applyEnrolmentFinancing(
  world: WorldState,
  program: EducationProgram,
  a: LoanAssessment,
  principal: number,
): void {
  const p = world.player;
  if (principal > 0) {
    p.cash += principal;
    originateLoan(world, p, a.bankId, principal, a.interestRate, a.monthlyPayment, a.termMonths);
  }
  enrolPlayer(world, program);
}

// Apply the player's chosen income behaviour for the month. Called by the server
// before simulateOneMonth on advance. A no-op until a decision sets `incomeMode`,
// so the default player's income is untouched (the golden master holds). Pure.
export function updatePlayerIncome(world: WorldState): void {
  const p = world.player;
  // Phase 15: refresh wage day-rates from current skill before income is summed, so a
  // wage worker's rate climbs as experience/tools/credentials accrue (P15.2). A no-op
  // for a non-wage player, so the digest holds.
  refreshWageRates(world);
  // Phase 17 (P17.3/P17.4): resample each venture's month — randomized juice-stand
  // sales and the good/bad-season swing — before income is summed, so a venture's take
  // varies month to month. A no-op for a venture with no production model or profile.
  refreshVenturePerformance(world);
  // Phase 18 (P18.1): one month's returns on the player's investments in other people's
  // ventures, folded into income below. 0 (and a no-op) without investments, so the
  // digest holds. Accrued once here (the advance path), off the golden-master path.
  const investIncome = accruePlayerInvestments(world);
  // Phase 8: a venture portfolio earns the sum of its active ventures' income; the
  // single-stream fields below are unused once `ventures` is populated.
  if (hasVentures(p)) {
    p.monthlyIncome = aggregateVentureIncome(world) + investIncome;
    return;
  }
  // Phase 15: a single-stream wage worker banks dailyRate × workdays (idea 1).
  if (p.wageProfile && isWageIndustry(p.occupation)) {
    p.monthlyIncome = wageMonthlyIncome(p.wageProfile) + investIncome;
    return;
  }
  if (p.incomeMode === 'STANDING' && p.standingContract) {
    p.monthlyIncome = p.standingContract.monthlyAmount + investIncome;
    return;
  }
  if (p.incomeMode === 'SPOT' && p.occupation && p.spotBaseIncome != null) {
    const goodId = REPRESENTATIVE_GOOD[p.occupation];
    if (!goodId) {
      p.monthlyIncome = (p.monthlyIncome ?? 0) + investIncome;
      return;
    }
    const good = GOODS.find((g) => g.id === goodId);
    const market = world.markets.find((m) => m.goodId === goodId && m.parish === p.parish);
    if (!good || !market) {
      p.monthlyIncome = (p.monthlyIncome ?? 0) + investIncome;
      return;
    }
    const factor = clamp(market.currentPrice / good.basePrice, SPOT_MIN_FACTOR, SPOT_MAX_FACTOR);
    // A bigger boat lands more fish: output scales the spot base; seasonality (in the
    // market price) still swings the month-to-month take, lean spells and all.
    p.monthlyIncome = Math.round(p.spotBaseIncome * (p.outputScale ?? 1) * factor) + investIncome;
    return;
  }
  // No active income mode but the player still draws investment returns: surface them.
  if (investIncome > 0) p.monthlyIncome = (p.monthlyIncome ?? 0) + investIncome;
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
