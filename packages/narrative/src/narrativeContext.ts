import {
  GOODS,
  INDUSTRY_DOMAIN,
  PARISHES,
  gameDate,
} from '@island/shared';
import type {
  FamilyBackground,
  Industry,
  KnowledgeDomains,
  Market,
  NPCAgent,
  ParishId,
  WorldEvent,
  WorldState,
} from '@island/shared';

// The enriched projection of the world that the LLM prompt is built from. The raw
// NPCAgent stays numeric (hidden state — OCEAN, capitals, derived tendencies never
// cross the wire, S3); this view turns those numbers into the qualitative prose the
// model writes from, so it never sees a raw score. `assembleNarrativeContext`
// produces it. Generation only reads the world — it never touches world.rng (S2).
export interface NarrativeContext {
  player: NPCAgent;
  world: WorldState;
  parishId: ParishId;
  parishName: string;
  monthLabel: string; // "October 2027"
  monthIndex: number; // 0–11
}

export function assembleNarrativeContext(world: WorldState): NarrativeContext {
  const player = world.player;
  const parish = PARISHES.find((p) => p.id === player.parish);
  const date = gameDate(world.month);
  return {
    player,
    world,
    parishId: player.parish,
    parishName: parish?.name ?? 'the parish',
    monthLabel: date.label,
    monthIndex: date.monthIndex,
  };
}

// ── Descriptive helpers ──────────────────────────────────────────────────────
// Each turns hidden numeric state into qualitative prose. The model never sees a
// raw score, only its meaning. Kept deliberately coarse so the prose stays in the
// voice rather than leaking the simulation's precision.

const OCCUPATION_LABEL: Record<Industry, string> = {
  FISHING: 'a fisherman',
  AGRICULTURE: 'a farmer',
  CONSTRUCTION: 'a mason',
  INFORMAL_TRADE: 'an informal trader',
  RETAIL: 'a shopkeeper',
  TOURISM: 'in tourism',
  TRANSPORTATION: 'a minibus driver',
  FINANCE: 'a clerk',
};

export function describeOccupation(occupation: Industry | null): string {
  return occupation ? OCCUPATION_LABEL[occupation] : 'between work';
}

export function describeEducation(culturalCapital: number): string {
  if (culturalCapital > 0.7) return 'well-schooled, comfortable on paper and in offices';
  if (culturalCapital > 0.45) return 'a solid secondary education';
  if (culturalCapital > 0.25) return 'some schooling, learned most of it by doing';
  return 'little formal schooling — the work taught them what they know';
}

const FAMILY_BACKGROUND_PROSE: Record<FamilyBackground, string> = {
  FISHING_PORTSMOUTH: 'a Portsmouth fishing family — the sea was the household economy',
  FARMING_INTERIOR: 'an interior farming family — provisions grounds and hard ground',
  CIVIL_SERVANT_ROSEAU: 'a Roseau civil-service household — salaried, formal, close to institutions',
  TRADING_ROSEAU: 'a Roseau trading family — buying and selling was the trade learned young',
};

export function describeFamilyBackground(bg: FamilyBackground): string {
  return FAMILY_BACKGROUND_PROSE[bg];
}

export function describePersonality(player: NPCAgent): string {
  const traits: string[] = [];

  if (player.conscientiousness > 0.7) traits.push('methodical, follows through on commitments');
  else if (player.conscientiousness < 0.35) traits.push('spontaneous, sometimes leaves things unfinished');

  if (player.riskTolerance > 0.65) traits.push('comfortable with uncertainty, moves decisively');
  else if (player.riskTolerance < 0.35) traits.push('cautious, prefers certainty before acting');

  if (player.extraversion > 0.65) traits.push('builds relationships easily, known in the community');
  else if (player.extraversion < 0.35) traits.push('quieter, known well by fewer people');

  if (player.lossAversion > 0.65) traits.push('feels losses keenly, protects what they have');
  if (player.patience > 0.65) traits.push('long-term thinker, willing to wait for outcomes');

  return traits.length > 0 ? traits.join('; ') : 'even-keeled, hard to read';
}

export function describeFinancialSituation(player: NPCAgent): string {
  const monthsOfExpenses = player.monthlyLivingCosts > 0 ? player.cash / player.monthlyLivingCosts : Infinity;
  const activeLoans = player.loans.filter((l) => l.status === 'ACTIVE');
  const hasAssets = player.economicAssets.length > 0;

  let description: string;
  if (monthsOfExpenses < 1) description = 'cash-constrained, living close to the edge';
  else if (monthsOfExpenses < 3) description = 'tight but managing, limited buffer';
  else if (monthsOfExpenses < 8) description = 'stable, modest savings';
  else if (monthsOfExpenses < 20) description = 'reasonably secure, some accumulated savings';
  else description = 'financially comfortable by local standards';

  if (activeLoans.length > 0) {
    const loanBurden =
      player.monthlyIncome > 0
        ? activeLoans.reduce((sum, l) => sum + l.monthlyPayment, 0) / player.monthlyIncome
        : 1;
    description +=
      loanBurden > 0.35
        ? ', carrying significant loan obligations'
        : ', with manageable loan commitments';
  }

  if (hasAssets) {
    description += `, owns: ${player.economicAssets.map((a) => a.type.toLowerCase()).join(', ')}`;
  }

  return description;
}

export function describeSocialStanding(player: NPCAgent): string {
  const parts: string[] = [];

  if (player.socialCapitalLocal > 0.65) parts.push('well-connected locally, trusted in the community');
  else if (player.socialCapitalLocal > 0.4) parts.push('known in the community, moderate local connections');
  else parts.push('limited local network, still building community ties');

  if (player.socialCapitalInstitutional > 0.55)
    parts.push('comfortable with formal institutions, banks and government');
  else if (player.socialCapitalInstitutional < 0.3)
    parts.push('limited access to the formal sector, navigates informally');

  if (player.socialCapitalDiaspora > 0.4) parts.push('has meaningful overseas connections');

  return parts.join('; ');
}

export function describeKnowledge(knowledge: KnowledgeDomains): string {
  const domains: { key: keyof KnowledgeDomains; label: string }[] = [
    { key: 'fishing', label: 'the sea and the catch' },
    { key: 'agriculture', label: 'the land and what grows' },
    { key: 'construction', label: 'building and materials' },
    { key: 'retail', label: 'buying and selling' },
    { key: 'tourism', label: 'visitors and hospitality' },
    { key: 'transportation', label: 'the roads and the routes' },
    { key: 'finance', label: 'money and the banks' },
    { key: 'informalTrade', label: 'the informal trade' },
  ];
  const strong = domains.filter((d) => knowledge[d.key] > 0.5).map((d) => d.label);
  if (strong.length === 0) return 'still learning every part of the work';
  return `knows ${strong.join(', ')} well`;
}

// Resolve the player's social-network ids to NPC names for "key relationships".
export function describeRelationships(player: NPCAgent, world: WorldState): string {
  const byId = new Map(world.agents.map((a) => [a.id, a.name] as const));
  const names = player.socialNetwork.map((id) => byId.get(id)).filter((n): n is string => Boolean(n));
  if (names.length === 0) return 'a small circle, mostly family and a few from the work';
  if (names.length <= 4) return names.join(', ');
  return `${names.slice(0, 4).join(', ')}, and others`;
}

// Human, in-world phrasing for an active world event, keyed by its definition.
const EVENT_PROSE: Record<string, string> = {
  HURRICANE_MAJOR: 'a major hurricane and its long aftermath',
  HURRICANE_MINOR: 'a passing storm that roughed up the sea',
  DROUGHT: 'a dry spell dragging on past its season',
  TOURISM_BOOM: 'an unusually strong run of visitors',
  FUEL_PRICE_SHOCK: 'fuel climbing hard at the dock and the pump',
  FISHING_STOCK_DECLINE: 'the fish running thin and far out',
};

function eventPhrase(event: WorldEvent): string {
  return EVENT_PROSE[event.definitionId] ?? event.definitionId.toLowerCase().replace(/_/g, ' ');
}

export function describeActiveEvents(world: WorldState): string {
  if (world.events.length === 0) return 'nothing out of the ordinary across the island';
  return world.events.map(eventPhrase).join('; ');
}

// Events that touch the player's industry and are recent enough to still be felt.
export function describeRecentHistory(player: NPCAgent, world: WorldState, monthsBack: number): string {
  const relevant = world.events.filter(
    (e) =>
      e.startedMonth >= world.month - monthsBack &&
      (player.occupation === null || e.affectedIndustries.includes(player.occupation)),
  );
  if (relevant.length === 0) return 'no significant events in this period';
  return relevant.map(eventPhrase).join('; ');
}

export function describeLocalMarkets(parishId: ParishId, markets: Market[]): string {
  const local = markets.filter((m) => m.parish === parishId);
  const lines = local
    .map((market) => {
      const good = GOODS.find((g) => g.id === market.goodId);
      if (!good) return null;
      const priceVsBase = market.currentPrice / good.basePrice;
      const h = market.priceHistory;
      const trend =
        h.length > 2 ? (h[h.length - 1]! > h[h.length - 3]! ? 'rising' : 'falling') : 'stable';
      const level =
        priceVsBase > 1.2
          ? 'well above normal'
          : priceVsBase > 1.05
            ? 'slightly above normal'
            : priceVsBase < 0.85
              ? 'below normal'
              : 'near normal';
      return `${good.name}: ${level} and ${trend}`;
    })
    .filter((l): l is string => l !== null);
  return lines.length > 0 ? lines.join('; ') : 'no notable local price movement';
}

// Qualitative read of the wider economy from the government's standing — used in
// place of an explicit business-cycle phase, which the engine does not model.
export function describeEconomy(world: WorldState): string {
  const u = world.government.unemploymentRate;
  const sentiment = world.government.publicSentiment;
  const jobs =
    u > 0.18 ? 'work is scarce' : u > 0.1 ? 'work is uneven' : 'work is steady enough';
  const mood = sentiment < 0.35 ? 'people are uneasy' : sentiment > 0.6 ? 'the mood is good' : 'people are getting on with it';
  return `${jobs}; ${mood}`;
}

export function describeDomainKnowledgeFor(player: NPCAgent): string {
  if (!player.occupation) return describeKnowledge(player.knowledge);
  const key = INDUSTRY_DOMAIN[player.occupation];
  const level = player.knowledge[key];
  if (level > 0.7) return `deep, hard-earned knowledge of ${OCCUPATION_LABEL[player.occupation]}'s work`;
  if (level > 0.4) return 'competent at the work, still learning its harder lessons';
  return 'new to the work, much still ahead to learn';
}
