import { describe, expect, it, vi } from 'vitest';

// END-TO-END WIRING TEST (Phase 12). Drives the REAL Fastify routes via in-process
// injection — HTTP → handler → engine → projection → DTO — with the Postgres
// persistence swapped for an in-memory store. The store still round-trips through the
// real serializeWorld/deserializeWorld, so this also proves the new asset/collateral
// state survives a save/load. (No database is needed or used here.)

vi.mock('../persistence/narratives', () => ({
  appendNarrativeEntries: vi.fn(async () => {}),
  loadFeed: vi.fn(async () => []),
  saveNarrativeEntries: vi.fn(async () => {}),
}));

vi.mock('../persistence/saves', async () => {
  const engine = await import('@island/engine');
  const store = new Map<string, unknown>();
  let n = 0;
  return {
    createSave: async (seed: number, opts: { population?: number; choices?: unknown; playerName?: string } = {}) => {
      const world = engine.buildWorld(seed, {
        population: opts.population ?? 60,
        choices: opts.choices as never,
        playerName: opts.playerName,
      });
      const id = `save-${++n}`;
      store.set(id, engine.serializeWorld(world));
      return { saveId: id, world };
    },
    loadSave: async (id: string) => {
      const s = store.get(id);
      if (!s) throw new Error(`no save ${id}`);
      const world = engine.deserializeWorld(s as never);
      return { world, currentMonth: world.month };
    },
    saveTick: async (id: string, world: never) => {
      store.set(id, engine.serializeWorld(world));
    },
  };
});

import { buildApp } from '../app';
import { NOOP_NARRATIVE_WORKER } from '../narrative/worker';

// Background B → owns ASSET_LAND (EC$18k); situation A → employed with a steady
// salary, so a loan secured by the land is approved.
const LANDED_EMPLOYED = { background: 'B', school: 'B', formative: 'A', tendency: 'A', situation: 'A' };

async function newSave(app: ReturnType<typeof buildApp>, seed: number) {
  const res = await app.inject({
    method: 'POST',
    url: '/saves',
    payload: { seed, creationChoices: LANDED_EMPLOYED },
  });
  expect(res.statusCode).toBe(201);
  return res.json().saveId as string;
}

describe('Phase 12 — borrow-against-asset flow through the real API', () => {
  it('create → quote → borrow → pledged, and the pledged asset cannot be sold', async () => {
    const app = buildApp({ narrativeWorker: NOOP_NARRATIVE_WORKER });
    const saveId = await newSave(app, 7);

    // The money view surfaces the land with a resale quote (it is unpledged).
    const money1 = (await app.inject({ method: 'GET', url: `/saves/${saveId}/money` })).json();
    const land = money1.assets.find((a: { id: string }) => a.id === 'ASSET_LAND');
    expect(land).toBeTruthy();
    expect(land.resale.quickPrice).toBeGreaterThan(0);
    expect(land.pledged).toBeUndefined();

    // A live collateral quote — the player's own prospective loan.
    const quoteRes = await app.inject({
      method: 'POST',
      url: `/saves/${saveId}/assets/ASSET_LAND/borrow/quote`,
      payload: { termMonths: 60 },
    });
    expect(quoteRes.statusCode).toBe(200);
    const quote = quoteRes.json();
    expect(quote.outcome).not.toBe('DECLINED');
    expect(quote.maxPrincipal).toBeGreaterThan(0);

    // Book the loan: cash is paid out, the asset is pledged.
    const principal = Math.min(5000, quote.maxPrincipal);
    const borrowRes = await app.inject({
      method: 'POST',
      url: `/saves/${saveId}/assets/ASSET_LAND/borrow`,
      payload: { principal, termMonths: 60 },
    });
    expect(borrowRes.statusCode).toBe(200);
    const borrow = borrowRes.json();
    expect(borrow.loanId).toBeTruthy();
    expect(borrow.principal).toBeGreaterThan(0);
    expect(borrow.cashInHand).toBeGreaterThan(money1.cashInHand);

    // The money view now shows the land pledged (no resale) and a new debt line.
    const money2 = (await app.inject({ method: 'GET', url: `/saves/${saveId}/money` })).json();
    const landAfter = money2.assets.find((a: { id: string }) => a.id === 'ASSET_LAND');
    expect(landAfter.pledged).toBe(true);
    expect(landAfter.resale).toBeUndefined();
    expect(money2.debts.length).toBeGreaterThan(0);

    // A pledged asset cannot be sold (the engine refuses; the route answers 409).
    const sellPledged = await app.inject({
      method: 'POST',
      url: `/saves/${saveId}/assets/ASSET_LAND/sell`,
      payload: { mode: 'QUICK' },
    });
    expect(sellPledged.statusCode).toBe(409);

    // The world still advances cleanly with the secured loan in place.
    const adv = await app.inject({ method: 'POST', url: `/saves/${saveId}/advance` });
    expect(adv.statusCode).toBe(200);
  });

  it('a patient sale settles after a wait and the notice reaches the feed', async () => {
    const app = buildApp({ narrativeWorker: NOOP_NARRATIVE_WORKER });
    const saveId = await newSave(app, 11);

    // List the land for a patient sale.
    const listRes = await app.inject({
      method: 'POST',
      url: `/saves/${saveId}/assets/ASSET_LAND/sell`,
      payload: { mode: 'PATIENT' },
    });
    expect(listRes.statusCode).toBe(200);
    const listing = listRes.json();
    expect(listing.settled).toBe(false);
    expect(listing.proceeds).toBeGreaterThan(0);

    // It is now listed (no resale offered) and still owned for the moment.
    const money = (await app.inject({ method: 'GET', url: `/saves/${saveId}/money` })).json();
    const land = money.assets.find((a: { id: string }) => a.id === 'ASSET_LAND');
    expect(land.listedForSale).toBe(true);

    // Advance a few months; the sale settles and pushes a feed notice on the way.
    const texts: string[] = [];
    for (let i = 0; i < 4; i++) {
      const adv = await app.inject({ method: 'POST', url: `/saves/${saveId}/advance` });
      expect(adv.statusCode).toBe(200);
      for (const e of adv.json().feed as { text: string }[]) texts.push(e.text);
    }
    expect(texts.some((t) => /sale/i.test(t))).toBe(true);

    // After settling, the land is gone from the books.
    const after = (await app.inject({ method: 'GET', url: `/saves/${saveId}/money` })).json();
    expect(after.assets.find((a: { id: string }) => a.id === 'ASSET_LAND')).toBeUndefined();
  });
});
