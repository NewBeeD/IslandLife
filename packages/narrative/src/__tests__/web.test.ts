import { describe, expect, it } from 'vitest';
import {
  buildWorld,
  formCompany,
  initialMacroState,
  injectSystemicShock,
  simulateOneMonth,
} from '@island/engine';
import type { WorldState } from '@island/shared';
import { generateMonthlyEntries, validateNarrativeEntry } from '../index';
import { captureTriggerSnapshot, detectTriggers } from '../triggers';

function warmed(seed = 7, months = 24): WorldState {
  const w = buildWorld(seed, { population: 250 });
  for (let i = 0; i < months; i++) simulateOneMonth(w);
  return w;
}

// Reset the macro to a calm baseline, so a test controls exactly which web condition
// is present (a warmed world may already be mid-crunch, and the feed shows one web
// cause at a time — a crunch would otherwise pre-empt a squeeze).
function calm(w: WorldState): void {
  Object.assign(w.macro, initialMacroState(w.country.baseInterestRate));
}

// Stand up `n` founded firms in the player's own trade & parish (a competitive scrum).
function crowdPlayerTrade(w: WorldState, n: number): void {
  const occ = w.player.occupation!;
  const founders = w.agents.filter((a) => !a.isPlayer).slice(0, n);
  for (const f of founders) {
    f.parish = w.player.parish;
    f.cash = 50_000;
    formCompany(f, w, occ);
  }
}

describe('P20.5 — the web’s causes surface in voice', () => {
  it('a credit crunch produces an in-voice entry that leaks no raw numbers', () => {
    const w = warmed();
    injectSystemicShock(w.macro, 1);
    simulateOneMonth(w);
    const entries = generateMonthlyEntries(w);
    const crunch = entries.find((e) => e.triggerId === 'CREDIT_CRUNCH');
    expect(crunch).toBeDefined();
    const res = validateNarrativeEntry(crunch!.text, crunch!.triggerId);
    expect(res.issues).toEqual([]);
    expect(crunch!.text).not.toMatch(/\d/); // no macro numbers leak (S3)
  });

  it('a competitive squeeze produces an in-voice entry that leaks no raw numbers', () => {
    const w = warmed();
    calm(w); // isolate the squeeze — no crunch to pre-empt it
    crowdPlayerTrade(w, 4);
    const entries = generateMonthlyEntries(w);
    const squeeze = entries.find((e) => e.triggerId === 'COMPETITIVE_SQUEEZE');
    expect(squeeze).toBeDefined();
    const res = validateNarrativeEntry(squeeze!.text, squeeze!.triggerId);
    expect(res.issues).toEqual([]);
    expect(squeeze!.text).not.toMatch(/\d/);
  });

  it('every generated entry still passes the voice validator through a crunch', () => {
    const w = warmed();
    injectSystemicShock(w.macro, 1);
    for (let i = 0; i < 6; i++) {
      simulateOneMonth(w);
      for (const e of generateMonthlyEntries(w)) {
        expect(validateNarrativeEntry(e.text, e.triggerId).issues, e.triggerId).toEqual([]);
      }
    }
  });
});

describe('P20.5 — Layer-2 triggers fire on the onset', () => {
  it('CREDIT_CRUNCH fires when the island’s credit freezes', () => {
    const w = warmed();
    calm(w); // ensure the pre-advance snapshot is genuinely calm (an onset, not a hold)
    const prev = captureTriggerSnapshot(w); // pre-crunch (credit calm)
    expect(prev.creditTight).toBe(false);
    injectSystemicShock(w.macro, 1);
    simulateOneMonth(w);
    const ids = detectTriggers(w, prev).map((t) => t.id);
    expect(ids).toContain('CREDIT_CRUNCH');
  });

  it('COMPETITIVE_SQUEEZE fires as a crowd arrives in the player’s trade', () => {
    const w = warmed();
    const prev = captureTriggerSnapshot(w); // player's trade not yet crowded
    expect(prev.tradeRivals).toBeLessThan(3);
    crowdPlayerTrade(w, 4);
    const ids = detectTriggers(w, prev).map((t) => t.id);
    expect(ids).toContain('COMPETITIVE_SQUEEZE');
  });

  it('a calm month fires neither', () => {
    const w = warmed(42);
    calm(w);
    const prev = captureTriggerSnapshot(w);
    simulateOneMonth(w);
    const ids = detectTriggers(w, prev).map((t) => t.id);
    expect(ids).not.toContain('CREDIT_CRUNCH');
    expect(ids).not.toContain('COMPETITIVE_SQUEEZE');
  });
});
