import { describe, expect, it } from 'vitest';
import type { Company, WorldState } from '@island/shared';
import {
  applyCompetitivePricePressure,
  buildWorld,
  competitiveEntryDraw,
  competitivePressureFactor,
  dominantCaptureExists,
  firmCellShare,
  formCompany,
  governmentAct,
  simulateOneMonth,
  ANTITRUST_MIN_REVENUE,
  COMPETITION_SHARE_THRESHOLD,
} from '../index';

function warmed(seed = 42, months = 3): WorldState {
  const w = buildWorld(seed, { population: 100 });
  for (let i = 0; i < months; i++) simulateOneMonth(w);
  return w;
}

// Make `target` the sole revenue in its parish×industry cell (share → 1), so the
// default player (no ventures → no proxy) does not dilute it.
function makeDominant(w: WorldState, target: Company, revenue: number): void {
  for (const c of w.companies) {
    if (c !== target && c.industry === target.industry && c.parish === target.parish) {
      c.monthlyRevenue = 0;
    }
  }
  target.status = 'HEALTHY';
  target.monthlyRevenue = revenue;
}

describe('P20.4 — the competitive pressure curve', () => {
  it('is 1 up to the threshold and haircuts a dominant share, never to ruin', () => {
    expect(competitivePressureFactor(0.2)).toBe(1);
    expect(competitivePressureFactor(COMPETITION_SHARE_THRESHOLD)).toBe(1);
    const half = competitivePressureFactor(0.6);
    const total = competitivePressureFactor(1);
    expect(half).toBeLessThan(1);
    expect(total).toBeLessThan(half);
    expect(total).toBeGreaterThan(0.7); // pressured, not bankrupted
  });
});

describe('P20.4 — success draws price pressure (any firm)', () => {
  it('haircuts a dominant firm’s revenue; a small-share firm is untouched', () => {
    const w = warmed();
    const dom = w.companies.find((c) => c.status !== 'CLOSED')!;
    makeDominant(w, dom, 40_000);
    expect(firmCellShare(dom, w)).toBeGreaterThan(COMPETITION_SHARE_THRESHOLD);

    // A small-share firm: put it in a cell with a much larger sibling.
    const small = w.companies.find((c) => c !== dom && c.status !== 'CLOSED')!;
    const sibling = w.companies.find(
      (c) => c !== small && c.industry === small.industry && c.parish === small.parish && c.status !== 'CLOSED',
    );
    if (sibling) {
      small.monthlyRevenue = 500;
      sibling.monthlyRevenue = 50_000;
      expect(firmCellShare(small, w)).toBeLessThan(COMPETITION_SHARE_THRESHOLD);
    }

    const domBefore = dom.monthlyRevenue;
    const smallBefore = small.monthlyRevenue;
    applyCompetitivePricePressure(w);

    expect(dom.monthlyRevenue).toBeLessThan(domBefore); // the leader is pressured
    if (sibling) expect(small.monthlyRevenue).toBe(smallBefore); // the small fry is not
  });
});

describe('P20.4 — success draws competitive entry (through Phase 19)', () => {
  it('a dominated cell pulls would-be founders; a balanced cell does not', () => {
    const w = warmed();
    const dom = w.companies.find((c) => c.status !== 'CLOSED')!;
    makeDominant(w, dom, 40_000);
    // The dominated cell reads as a proven, fat trade — draw above 1.
    expect(competitiveEntryDraw(w, dom.industry, dom.parish)).toBeGreaterThan(1);

    // A cell nobody dominates (split evenly) exerts no extra pull.
    const other = w.companies.find(
      (c) => c.industry !== dom.industry && c.status !== 'CLOSED',
    )!;
    const peers = w.companies.filter(
      (c) => c.industry === other.industry && c.parish === other.parish && c.status !== 'CLOSED',
    );
    for (const c of peers) c.monthlyRevenue = 1000; // evenly split, no dominant share
    if (peers.length >= 3) {
      expect(competitiveEntryDraw(w, other.industry, other.parish)).toBe(1);
    }
  });
});

describe('P20.4 — the government notices market capture past a higher bar', () => {
  it('a large, dominant founded firm draws antitrust scrutiny', () => {
    const w = warmed(7);
    const founder = w.agents.find((a) => !a.isPlayer)!;
    founder.cash = 60_000;
    const firm = formCompany(founder, w, 'TRANSPORTATION');
    // A genuinely big, dominant operator: clear the scale bar and own the industry.
    for (const c of w.companies) if (c.industry === 'TRANSPORTATION' && c !== firm) c.monthlyRevenue = 0;
    firm.monthlyRevenue = ANTITRUST_MIN_REVENUE * 1.5;

    expect(dominantCaptureExists(w)).toBe(true);
    governmentAct(w.government, w);
    expect(w.government.policies.some((p) => p.type === 'ANTITRUST')).toBe(true);
  });

  it('a small dominant firm does not — scale is required (staying small avoids it)', () => {
    const w = warmed(7);
    const founder = w.agents.find((a) => !a.isPlayer)!;
    founder.cash = 60_000;
    const firm = formCompany(founder, w, 'AGRICULTURE');
    for (const c of w.companies) if (c.industry === 'AGRICULTURE' && c !== firm) c.monthlyRevenue = 0;
    firm.monthlyRevenue = 6_000; // dominant share, but tiny — below the scale bar

    expect(dominantCaptureExists(w)).toBe(false);
  });

  it('the default (small) player draws no scrutiny', () => {
    const w = warmed(42, 6);
    expect(dominantCaptureExists(w)).toBe(false);
  });
});

describe('P20.4 — deterministic per seed', () => {
  it('reproduces', () => {
    const run = () => {
      const w = buildWorld(3, { population: 200 });
      let antitrust = 0;
      for (let i = 0; i < 60; i++) {
        simulateOneMonth(w);
        if (w.government.policies.some((p) => p.type === 'ANTITRUST')) antitrust++;
      }
      return antitrust;
    };
    expect(run()).toBe(run());
  });
});
