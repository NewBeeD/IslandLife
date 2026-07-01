import { describe, expect, it } from 'vitest';
import type { WorldState } from '@island/shared';
import { buildWorld, simulateOneMonth } from '../index';

// The canonical `complexity.md` cascade, as a scripted shock test (P20.2): inject a
// systemic-credit shock into one world and not its twin, then watch the disturbance
// propagate through system after system over the following months and mean-revert. A
// control twin isolates the shock's signal from ordinary seasonal/price noise.

const constrPrice = (w: WorldState): number => {
  const g = w.goods.find((x) => x.category === 'CONSTRUCTION')!;
  const mkts = w.markets.filter((m) => m.goodId === g.id);
  return mkts.reduce((s, m) => s + m.currentPrice, 0) / mkts.length;
};

interface Frame {
  rate: number;
  credit: number;
  construction: number;
  bizConf: number;
  constrPx: number;
}
const frame = (w: WorldState): Frame => ({
  rate: w.macro.effectiveInterestRate,
  credit: w.macro.creditAvailability,
  construction: w.macro.constructionActivity,
  bizConf: w.macro.businessConfidence,
  constrPx: constrPrice(w),
});

// Run a control and a shocked twin from the same seed; return the per-month delta
// (shocked − control) over the `window` months following the shock at month `warm`.
function shockDeltas(seed: number, warm = 36, window = 24): Frame[] {
  const control = buildWorld(seed, { population: 250 });
  const shock = buildWorld(seed, { population: 250 });
  for (let i = 0; i < warm; i++) {
    simulateOneMonth(control);
    simulateOneMonth(shock);
  }
  shock.macro.systemicStress = 1; // the shock: a systemically-important bank fails
  const out: Frame[] = [];
  for (let i = 0; i < window; i++) {
    simulateOneMonth(control);
    simulateOneMonth(shock);
    const c = frame(control);
    const s = frame(shock);
    out.push({
      rate: s.rate - c.rate,
      credit: s.credit - c.credit,
      construction: s.construction - c.construction,
      bizConf: s.bizConf - c.bizConf,
      constrPx: s.constrPx - c.constrPx,
    });
  }
  return out;
}

describe('P20.2 — the ripple propagates through ≥5 systems and mean-reverts', () => {
  const deltas = shockDeltas(7);
  const peak = deltas.slice(0, 12); // the disturbance window
  const settled = deltas.slice(19); // long after — should have reverted

  const maxOf = (f: (d: Frame) => number) => Math.max(...peak.map(f));
  const minOf = (f: (d: Frame) => number) => Math.min(...peak.map(f));

  it('rates rise (banking cost)', () => {
    expect(maxOf((d) => d.rate)).toBeGreaterThan(0.015);
  });

  it('credit contracts (banks tighten)', () => {
    expect(minOf((d) => d.credit)).toBeLessThan(-0.08);
  });

  it('construction activity is throttled', () => {
    expect(minOf((d) => d.construction)).toBeLessThan(-0.1);
  });

  it('business confidence dips', () => {
    expect(minOf((d) => d.bizConf)).toBeLessThan(-0.02);
  });

  it('the disturbance reaches the goods market (construction prices fall, with a lag)', () => {
    expect(minOf((d) => d.constrPx)).toBeLessThan(-10);
  });

  it('the macro aggregates mean-revert — the twins re-converge', () => {
    for (const d of settled) {
      expect(Math.abs(d.rate)).toBeLessThan(0.005);
      expect(Math.abs(d.credit)).toBeLessThan(0.03);
      expect(Math.abs(d.construction)).toBeLessThan(0.03);
      expect(Math.abs(d.bizConf)).toBeLessThan(0.05);
    }
  });

  it('is deterministic per seed', () => {
    const a = shockDeltas(7);
    const b = shockDeltas(7);
    expect(a).toEqual(b);
  });
});
