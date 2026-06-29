import { INDUSTRIES, INDUSTRY_DOMAIN } from '@island/shared';
import type {
  CredentialLevel,
  Industry,
  SkillTradeDTO,
  SkillsDTO,
  WageProfile,
  WageSummaryDTO,
  WorldState,
} from '@island/shared';
import { activeVentures, credentialLevelOf, hasVentures, wageMonthlyIncome } from '@island/engine';
import { OCCUPATION_LABEL } from './labels';

// GET /saves/:id/skills — the Skills view (Phase 15, P15.4). The trades the player
// has built up over the years, their formal credential, and (for a wage worker)
// their current day rate. The hidden 0–1 skill/capital scores never cross the wire
// (S3): each trade reads as a qualitative band with a description, not a number. The
// wage figures are the player's own money facts, like the money view.

// A trade is worth listing once the player has built up a little standing in it.
const TRADE_FLOOR = 0.12;

// A qualitative band for how far the player has come in a trade, from a blended
// skill score. Worded to avoid naming the hidden measures it derives from.
function bandFor(score: number): { standing: string; detail: string } {
  if (score >= 0.75) {
    return {
      standing: 'A master of the trade',
      detail:
        'Years on the job have made this second nature. People come to you for the work, and for the word of how it should be done.',
    };
  }
  if (score >= 0.5) {
    return {
      standing: 'A seasoned hand',
      detail:
        'You know this work well — the shortcuts and the pitfalls both. You can be left to get on with it, and it gets done right.',
    };
  }
  if (score >= 0.3) {
    return {
      standing: 'Capable and steady',
      detail:
        'You hold your own in this trade. The everyday work is yours; the trickier jobs still teach you something now and then.',
    };
  }
  return {
    standing: 'Still learning the trade',
    detail:
      'You have made a start in this work. The hands are willing; the skill is coming, the way it always does — one job at a time.',
  };
}

// The trades the player has built up, most accomplished first. Blends the two hidden
// measures of standing in a trade into a single score, then bands it.
function buildTrades(world: WorldState): SkillTradeDTO[] {
  const p = world.player;
  const out: { score: number; dto: SkillTradeDTO }[] = [];
  for (const industry of INDUSTRIES) {
    const domain = INDUSTRY_DOMAIN[industry];
    const score = (p.experience[domain] ?? 0) * 0.6 + (p.knowledge[domain] ?? 0) * 0.4;
    if (score < TRADE_FLOOR) continue;
    const band = bandFor(score);
    out.push({ score, dto: { label: OCCUPATION_LABEL[industry], standing: band.standing, detail: band.detail } });
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.dto);
}

// The player's formal qualification, in prose. Their highest earned credential.
function credentialText(level: CredentialLevel): string {
  switch (level) {
    case 'CERTIFICATE':
      return 'You hold a skills certificate from the community college.';
    case 'ASSOCIATE':
      return 'You hold an associate degree.';
    case 'DEGREE':
      return "You hold a bachelor's degree.";
    case 'MASTERS':
      return "You hold a master's degree.";
    default:
      return 'You hold no formal qualification yet — what you have, you earned on the job.';
  }
}

// The player's current wage day rate, if they work a wage trade (Phase 15). Reads
// "venture 0" when a portfolio runs, else the single-stream wage profile.
function wageSummary(world: WorldState): WageSummaryDTO | undefined {
  const p = world.player;
  let industry: Industry | null = null;
  let profile: WageProfile | undefined;
  if (hasVentures(p)) {
    const v = activeVentures(p).find((x) => x.wageProfile);
    if (v) {
      industry = v.industry;
      profile = v.wageProfile;
    }
  } else if (p.wageProfile && p.occupation) {
    industry = p.occupation;
    profile = p.wageProfile;
  }
  if (!industry || !profile) return undefined;
  return {
    label: `${OCCUPATION_LABEL[industry]} day rate`,
    dailyRate: Math.round(profile.dailyRate),
    perMonth: wageMonthlyIncome(profile),
    detail:
      'Your rate is set by what you bring to the job — the skill in your hands, the tools you own, and any paper to your name. It climbs as those do.',
  };
}

export function toSkillsDTO(world: WorldState): SkillsDTO {
  const trades = buildTrades(world);
  const level = credentialLevelOf(world.player);
  const headline =
    trades.length === 0
      ? 'You are at the start of your working life. The skills come with the years.'
      : `Over the years you have become ${trades[0]!.standing.toLowerCase()} at ${trades[0]!.label.toLowerCase()}, among other things you have picked up.`;
  return {
    headline,
    credential: credentialText(level),
    trades,
    wage: wageSummary(world),
  };
}
