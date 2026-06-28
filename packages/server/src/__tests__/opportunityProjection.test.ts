import { describe, expect, it } from 'vitest';
import { buildWorld } from '@island/engine';
import type { NewVentureSpec, Opportunity, OpportunityStatus, WorldState } from '@island/shared';
import { toOpportunitiesDTO } from '../projection';

// PHASE 13 (P13.2) — the "Passed" projection collapses duplicate lapsed offers to one
// per logical offer and caps the list, so a juice stand that lapsed many times stops
// appearing as a wall of identical "Passed" rows.

const JUICE: NewVentureSpec = {
  id: 'NV_JUICE',
  industry: 'RETAIL',
  label: 'a roadside juice and snack stand',
  ventureLabel: 'the juice stand',
  entryCost: 1500,
  startingOutputIncome: 650,
  operatingCost: 150,
  barrierTier: 'LOW',
  riskLevel: 'LOW',
  minTermMonths: 12,
  maxTermMonths: 24,
};

function ventureOpp(
  spec: NewVentureSpec,
  month: number,
  status: OpportunityStatus,
): Opportunity {
  return {
    id: `OPP_${spec.id}_${month}`,
    kind: 'NEW_VENTURE',
    industry: spec.industry,
    npcName: 'someone looking to pass it on',
    channelId: 'WORD_AROUND',
    surfacedMonth: month,
    windowMonths: 3,
    status,
    decisionId: `DEC_${spec.id}_${month}`,
    monthlyAmount: 0,
    newVenture: spec,
  };
}

function emptyWorld(): WorldState {
  const world = buildWorld(1, { population: 20 });
  world.opportunities = [];
  world.decisions = [];
  world.month = 60;
  return world;
}

describe('P13.2 — Passed list dedupe + cap', () => {
  it('collapses repeated lapses of the same offer to one row (the most recent)', () => {
    const world = emptyWorld();
    // The same juice stand lapsed five times across the years.
    world.opportunities = [4, 12, 20, 28, 36].map((m) => ventureOpp(JUICE, m, 'EXPIRED'));

    const dto = toOpportunitiesDTO(world);
    const juice = dto.expired.filter((o) => o.id.startsWith('OPP_NV_JUICE_'));
    expect(juice).toHaveLength(1); // one logical offer, one row
    expect(juice[0]!.id).toBe('OPP_NV_JUICE_36'); // the most recent lapse
  });

  it('caps the Passed list at a bounded length', () => {
    const world = emptyWorld();
    // Twenty distinct lapsed offers (distinct keys via distinct spec ids).
    world.opportunities = Array.from({ length: 20 }, (_, i) =>
      ventureOpp({ ...JUICE, id: `NV_${i}`, ventureLabel: `venture ${i}` }, i + 1, 'EXPIRED'),
    );

    const dto = toOpportunitiesDTO(world);
    expect(dto.expired.length).toBeLessThanOrEqual(8);
    // The most recent lapses are the ones kept.
    expect(dto.expired[0]!.id).toBe('OPP_NV_19_20');
  });

  it('does not show a lapsed row for an offer that is now live or accepted (P13.4)', () => {
    const world = emptyWorld();
    // An earlier juice stand lapsed; the player later took up a fresh one (ACCEPTED).
    world.opportunities = [
      ventureOpp(JUICE, 8, 'EXPIRED'),
      ventureOpp(JUICE, 24, 'ACCEPTED'),
    ];

    const dto = toOpportunitiesDTO(world);
    expect(dto.expired.filter((o) => o.id.startsWith('OPP_NV_JUICE_'))).toHaveLength(0);

    // Likewise an OPEN instance supersedes its own earlier lapse — it shows as active.
    world.opportunities = [ventureOpp(JUICE, 8, 'EXPIRED'), ventureOpp(JUICE, 24, 'OPEN')];
    const dto2 = toOpportunitiesDTO(world);
    expect(dto2.expired.filter((o) => o.id.startsWith('OPP_NV_JUICE_'))).toHaveLength(0);
    expect(dto2.active).toHaveLength(1);
  });
});
