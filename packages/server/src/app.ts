import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import {
  DecisionError,
  JobError,
  LoanError,
  SaleError,
  applyUpgradeFinancing,
  borrowAgainstAsset,
  detectDueConsequences,
  detectEducationCompletions,
  findBorrowerAsset,
  listAssetForSale,
  quoteCollateralLoan,
  quoteUpgradeFinancing,
  repayLoan,
  resolveDecision,
  sellAssetNow,
  setLoanInstallment,
  simulateOneMonth,
  surfaceOpportunities,
  takeJob,
  updatePlayerIncome,
  type CreationChoices,
} from '@island/engine';
import {
  buildDecisionAcknowledgement,
  buildJobTakenAcknowledgement,
  captureTriggerSnapshot,
  detectTriggers,
  generateConsequenceEntry,
  generateEducationCompletionEntry,
  generateMonthlyEntries,
  generateNarrativeEntry,
} from '@island/narrative';
import { gameDateLabel } from '@island/shared';
import type {
  AdvanceResultDTO,
  CreateSaveResultDTO,
  DecisionResultDTO,
  NarrativeEntry,
  SaleMode,
  WorldState,
} from '@island/shared';
import { createSave, loadSave, saveTick } from './persistence/saves';
import { appendNarrativeEntries, loadFeed, saveNarrativeEntries } from './persistence/narratives';
import {
  createNarrativeWorker,
  NOOP_NARRATIVE_WORKER,
  type NarrativeWorker,
} from './narrative/worker';
import {
  toAssetSaleResultDTO,
  toBorrowResultDTO,
  toCollateralQuoteDTO,
  toCommunityDTO,
  toDecisionDTO,
  toFeedDTO,
  toFinancingQuoteDTO,
  toJobsDTO,
  toLoanActionResultDTO,
  toMoneyDTO,
  toOpportunitiesDTO,
  toSkillsDTO,
  toStateDTO,
  toTakeJobResultDTO,
} from './projection';

interface CreateSaveBody {
  seed?: number;
  creationChoices?: CreationChoices;
  playerName?: string;
}

function defaultSeed(): number {
  const env = process.env.WORLD_DEFAULT_SEED;
  if (env && Number.isFinite(Number(env))) return Number(env);
  return Math.floor(Math.random() * 1_000_000_000);
}

// A quiet, in-voice line marking the turn of the month. No mechanics — it reads
// like the top of a page in the player's life, not a system message.
function transitionBlurb(world: WorldState): string {
  return `The calendar turns to ${gameDateLabel(world.month)}.`;
}

// Load a save's world or send a 404. Returns null when it has answered the reply,
// so handlers can `if (!world) return;` and stop.
async function loadOr404(
  id: string,
  reply: FastifyReply,
): Promise<{ world: WorldState; currentMonth: number } | null> {
  try {
    return await loadSave(id);
  } catch {
    await reply.code(404).send({ error: `save ${id} not found` });
    return null;
  }
}

// Choose the narrative worker. Layer-2 generation only runs when a provider key is
// configured — DEEPSEEK_API_KEY (cheap) or ANTHROPIC_API_KEY. Otherwise the app
// stays Layer-1 (template) only, so the headless gate and template-only local runs
// never reach the network.
function defaultNarrativeWorker(): NarrativeWorker {
  if (!process.env.DEEPSEEK_API_KEY && !process.env.ANTHROPIC_API_KEY) return NOOP_NARRATIVE_WORKER;
  return createNarrativeWorker({
    generate: (trigger, world) => generateNarrativeEntry(trigger, world),
    persist: appendNarrativeEntries,
  });
}

export interface BuildAppOptions {
  // Inject a worker (tests, or a future Redis/BullMQ-backed implementation).
  narrativeWorker?: NarrativeWorker;
}

// The Fastify API. Every response is a projected DTO (the iceberg boundary). The
// app is built without listening so tests and the entry point can share it.
export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const narrativeWorker = opts.narrativeWorker ?? defaultNarrativeWorker();

  // POST /saves — begin a life. Runs the five forks server-side, hydrates agent #1,
  // builds the world, persists month 0. The hidden CharacterProfile is NOT returned.
  app.post<{ Body: CreateSaveBody }>('/saves', async (req, reply) => {
    const body = req.body ?? {};
    const seed = body.seed ?? defaultSeed();
    const { saveId, world } = await createSave(seed, {
      choices: body.creationChoices,
      playerName: body.playerName,
    });
    const result: CreateSaveResultDTO = {
      saveId,
      month: world.month,
      monthLabel: gameDateLabel(world.month),
    };
    return reply.code(201).send(result);
  });

  // GET /saves/:id/state — the header bar.
  app.get<{ Params: { id: string } }>('/saves/:id/state', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    return toStateDTO(req.params.id, loaded.world);
  });

  // GET /saves/:id/money — the Money view.
  app.get<{ Params: { id: string } }>('/saves/:id/money', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    return toMoneyDTO(loaded.world);
  });

  // GET /saves/:id/feed?month= — the Daily Life feed (defaults to the latest month).
  app.get<{ Params: { id: string }; Querystring: { month?: string } }>(
    '/saves/:id/feed',
    async (req, reply) => {
      const loaded = await loadOr404(req.params.id, reply);
      if (!loaded) return;
      const month =
        req.query.month != null && req.query.month !== ''
          ? Number(req.query.month)
          : loaded.currentMonth;
      const entries = await loadFeed(req.params.id, month);
      return toFeedDTO(month, entries);
    },
  );

  // GET /saves/:id/skills — the trades, credential, and wage day rate the player has
  // built up (Phase 15). Qualitative prose; no hidden 0–1 scores cross the wire.
  app.get<{ Params: { id: string } }>('/saves/:id/skills', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    return toSkillsDTO(loaded.world);
  });

  // GET /saves/:id/jobs — the job market: the open slate of postings the player can
  // browse, with pay, net-of-cost, and requirements as prose (Phase 16).
  app.get<{ Params: { id: string } }>('/saves/:id/jobs', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    return toJobsDTO(loaded.world);
  });

  // POST /saves/:id/jobs/:jobId/take — take a posting from the market (Phase 16).
  // Switches the player into the position, books its attached costs, persists.
  app.post<{ Params: { id: string; jobId: string } }>(
    '/saves/:id/jobs/:jobId/take',
    async (req, reply) => {
      const loaded = await loadOr404(req.params.id, reply);
      if (!loaded) return;
      const { world } = loaded;
      try {
        const result = takeJob(world, req.params.jobId);
        const acknowledgement = buildJobTakenAcknowledgement(world, result.taken);
        await saveTick(req.params.id, world);
        return toTakeJobResultDTO(result, acknowledgement);
      } catch (err) {
        if (err instanceof JobError) {
          return reply.code(err.code === 'NOT_FOUND' ? 404 : 409).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // GET /saves/:id/community — relationships + reputation as prose.
  app.get<{ Params: { id: string } }>('/saves/:id/community', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    return toCommunityDTO(loaded.world);
  });

  // GET /saves/:id/opportunities — only what the player has heard of, through their
  // own information channels (P6.1).
  app.get<{ Params: { id: string } }>('/saves/:id/opportunities', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    return toOpportunitiesDTO(loaded.world);
  });

  // GET /saves/:id/decisions/:did — the decision interface: situation + unlabelled
  // options (P6.2). The hidden option mechanics never cross the wire.
  app.get<{ Params: { id: string; did: string } }>(
    '/saves/:id/decisions/:did',
    async (req, reply) => {
      const loaded = await loadOr404(req.params.id, reply);
      if (!loaded) return;
      const dto = toDecisionDTO(loaded.world, req.params.did);
      if (!dto) return reply.code(404).send({ error: `decision ${req.params.did} not found` });
      return dto;
    },
  );

  // POST /saves/:id/decisions/:did/quote — a read-only financing quote for an
  // asset-upgrade decision (the down-payment slider polls this as the player drags).
  // Loads the world, assesses the loan, returns the live terms, and DOES NOT persist.
  // Body: { downPayment, termMonths }.
  app.post<{
    Params: { id: string; did: string };
    Body: { downPayment?: number; termMonths?: number };
  }>('/saves/:id/decisions/:did/quote', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    const downPayment = Number(req.body?.downPayment ?? 0);
    const termMonths = Number(req.body?.termMonths ?? 0);
    if (!Number.isFinite(downPayment) || !Number.isFinite(termMonths) || termMonths <= 0) {
      return reply.code(400).send({ error: 'downPayment and a positive termMonths are required' });
    }
    try {
      const quote = quoteUpgradeFinancing(loaded.world, req.params.did, downPayment, termMonths);
      return toFinancingQuoteDTO(quote);
    } catch (err) {
      if (err instanceof DecisionError) {
        const code = err.code === 'NOT_FOUND' ? 404 : err.code === 'EXPIRED' ? 409 : 400;
        return reply.code(code).send({ error: err.message });
      }
      throw err;
    }
  });

  // POST /saves/:id/decisions/:did — submit a choice. For an option-based decision
  // (Eunice), body is { optionId }. For an asset upgrade, body is
  // { financing: { downPayment, termMonths } } — the server re-quotes authoritatively,
  // takes the down payment, books the approved loan, buys the asset, and persists.
  app.post<{
    Params: { id: string; did: string };
    Body: { optionId?: string; financing?: { downPayment?: number; termMonths?: number } };
  }>('/saves/:id/decisions/:did', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    const { world } = loaded;
    const financing = req.body?.financing;

    let decision;
    try {
      if (financing) {
        const downPayment = Number(financing.downPayment ?? 0);
        const termMonths = Number(financing.termMonths ?? 0);
        if (!Number.isFinite(downPayment) || !Number.isFinite(termMonths) || termMonths <= 0) {
          return reply.code(400).send({ error: 'financing requires downPayment and a positive termMonths' });
        }
        decision = applyUpgradeFinancing(world, req.params.did, downPayment, termMonths).decision;
      } else {
        const optionId = req.body?.optionId;
        if (!optionId) return reply.code(400).send({ error: 'optionId or financing is required' });
        decision = resolveDecision(world, req.params.did, optionId);
      }
    } catch (err) {
      if (err instanceof DecisionError) {
        const code =
          err.code === 'NOT_FOUND' ? 404 : err.code === 'ALREADY_RESOLVED' ? 409 : err.code === 'EXPIRED' ? 409 : 400;
        return reply.code(code).send({ error: err.message });
      }
      throw err;
    }

    await saveTick(req.params.id, world);

    const result: DecisionResultDTO = {
      decisionId: decision.id,
      chosenOptionId: decision.chosenOptionId!,
      acknowledgement: buildDecisionAcknowledgement(world, decision),
    };
    return result;
  });

  // POST /saves/:id/assets/:assetId/sell — sell an owned asset for cash (Phase 12).
  // Body { mode }: QUICK settles now at a fire-sale price; PATIENT lists it to settle
  // in a couple of months at a fuller price. Re-quoted authoritatively, then persists.
  app.post<{ Params: { id: string; assetId: string }; Body: { mode?: SaleMode } }>(
    '/saves/:id/assets/:assetId/sell',
    async (req, reply) => {
      const loaded = await loadOr404(req.params.id, reply);
      if (!loaded) return;
      const { world } = loaded;
      const mode: SaleMode = req.body?.mode === 'PATIENT' ? 'PATIENT' : 'QUICK';
      const asset = findBorrowerAsset(world.player, req.params.assetId);
      if (!asset) return reply.code(404).send({ error: `asset ${req.params.assetId} not found` });
      // Capture the asset's shape now: a QUICK sale removes it before the DTO is built.
      const captured = { ...asset };
      try {
        let dto;
        if (mode === 'PATIENT') {
          const sale = listAssetForSale(world, req.params.assetId);
          dto = toAssetSaleResultDTO(world, captured, 'PATIENT', {
            proceeds: sale.expectedPrice,
            settlesInMonths: sale.resolveMonth - sale.listedMonth,
            settled: false,
            ventureClosed: false,
          });
        } else {
          const result = sellAssetNow(world, req.params.assetId);
          dto = toAssetSaleResultDTO(world, captured, 'QUICK', {
            proceeds: result.price,
            settlesInMonths: 0,
            settled: true,
            ventureClosed: result.ventureClosed,
          });
        }
        await saveTick(req.params.id, world);
        return dto;
      } catch (err) {
        if (err instanceof SaleError) return reply.code(409).send({ error: err.message });
        throw err;
      }
    },
  );

  // POST /saves/:id/assets/:assetId/borrow/quote — live terms for a loan secured by an
  // asset, read-only (the amount slider polls this). Body { termMonths, principal? }.
  app.post<{
    Params: { id: string; assetId: string };
    Body: { termMonths?: number; principal?: number };
  }>('/saves/:id/assets/:assetId/borrow/quote', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    const termMonths = Number(req.body?.termMonths ?? 0);
    if (!Number.isFinite(termMonths) || termMonths <= 0) {
      return reply.code(400).send({ error: 'a positive termMonths is required' });
    }
    const principal = req.body?.principal != null ? Number(req.body.principal) : undefined;
    try {
      const quote = quoteCollateralLoan(loaded.world, req.params.assetId, termMonths, principal);
      return toCollateralQuoteDTO(quote);
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });

  // POST /saves/:id/assets/:assetId/borrow — book a loan secured by the asset. Body
  // { termMonths, principal }. Pledges the asset, pays out the cash, persists.
  app.post<{
    Params: { id: string; assetId: string };
    Body: { termMonths?: number; principal?: number };
  }>('/saves/:id/assets/:assetId/borrow', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    const { world } = loaded;
    const termMonths = Number(req.body?.termMonths ?? 0);
    const principal = Number(req.body?.principal ?? 0);
    if (
      !Number.isFinite(termMonths) ||
      termMonths <= 0 ||
      !Number.isFinite(principal) ||
      principal <= 0
    ) {
      return reply.code(400).send({ error: 'principal and a positive termMonths are required' });
    }
    if (!findBorrowerAsset(world.player, req.params.assetId)) {
      return reply.code(404).send({ error: `asset ${req.params.assetId} not found` });
    }
    try {
      const { loan } = borrowAgainstAsset(world, req.params.assetId, principal, termMonths);
      await saveTick(req.params.id, world);
      return toBorrowResultDTO(world, loan);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // POST /saves/:id/loans/:loanId/repay — pay a lump sum off a loan early (Phase 14).
  // Body { amount }. Reduces the balance (closing the loan if it clears it), then
  // persists. The amount comes out of cash; the player can only act on their own loans.
  app.post<{ Params: { id: string; loanId: string }; Body: { amount?: number } }>(
    '/saves/:id/loans/:loanId/repay',
    async (req, reply) => {
      const loaded = await loadOr404(req.params.id, reply);
      if (!loaded) return;
      const { world } = loaded;
      const amount = Number(req.body?.amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return reply.code(400).send({ error: 'a positive amount is required' });
      }
      try {
        const loan = repayLoan(world, req.params.loanId, amount);
        await saveTick(req.params.id, world);
        return toLoanActionResultDTO(world, loan, 'REPAY');
      } catch (err) {
        if (err instanceof LoanError) {
          return reply.code(err.code === 'NOT_FOUND' ? 404 : 400).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // POST /saves/:id/loans/:loanId/installment — resize a loan's monthly payment
  // (Phase 14). Body { monthlyPayment }. Raising it shortens the term, lowering it
  // lengthens it; rejected below the interest floor. Re-derives the term, then persists.
  app.post<{ Params: { id: string; loanId: string }; Body: { monthlyPayment?: number } }>(
    '/saves/:id/loans/:loanId/installment',
    async (req, reply) => {
      const loaded = await loadOr404(req.params.id, reply);
      if (!loaded) return;
      const { world } = loaded;
      const monthlyPayment = Number(req.body?.monthlyPayment ?? 0);
      if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) {
        return reply.code(400).send({ error: 'a positive monthlyPayment is required' });
      }
      try {
        const loan = setLoanInstallment(world, req.params.loanId, monthlyPayment);
        await saveTick(req.params.id, world);
        return toLoanActionResultDTO(world, loan, 'INSTALLMENT');
      } catch (err) {
        if (err instanceof LoanError) {
          return reply.code(err.code === 'NOT_FOUND' ? 404 : 400).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // POST /saves/:id/advance — advance one month. Runs simulateOneMonth, fires the
  // Layer-1 template narrative synchronously, persists both, and returns the
  // transition blurb plus the immediately-available feed. The world never pauses
  // for prose — Layer-2 (Claude) entries are enqueued and polled later (Phase 5).
  app.post<{ Params: { id: string } }>('/saves/:id/advance', async (req, reply) => {
    const loaded = await loadOr404(req.params.id, reply);
    if (!loaded) return;
    const { world } = loaded;

    // Snapshot the pre-advance world so post-advance trigger detection can see
    // transitions (a new business, a freshly-formed storm).
    const snapshot = captureTriggerSnapshot(world);

    // Apply the player's chosen income behaviour (standing contract vs. spot
    // selling) before the month runs (P6.3). A no-op until a decision sets it.
    updatePlayerIncome(world);

    simulateOneMonth(world);
    const entries = generateMonthlyEntries(world);

    // Phase 12: surface any in-month notices the engine queued this advance (a patient
    // sale that settled, collateral seized after a default) as feed entries, then
    // clear the queue so each notice is shown exactly once.
    for (const note of world.playerNotifications) {
      entries.push({ type: 'PERSONAL', text: note, month: world.month });
    }
    world.playerNotifications = [];

    // Surface any newly-available opportunity through the information channels
    // (P6.1), and render any delayed consequence that comes due this month as a
    // MEMORY entry alongside the template feed (P6.4). Both are deterministic and
    // ride the synchronous write, so the slice plays fully offline.
    surfaceOpportunities(world);
    const consequences: NarrativeEntry[] = detectDueConsequences(world).map((d) =>
      generateConsequenceEntry(world, d),
    );
    entries.push(...consequences);

    // Finalize any education program that completed this month (Phase 9): the engine
    // applies the knowledge gain + credential, and we render a completion MEMORY.
    const completions: NarrativeEntry[] = detectEducationCompletions(world).map((prog) =>
      generateEducationCompletionEntry(world, prog),
    );
    entries.push(...completions);

    await saveTick(req.params.id, world);
    await saveNarrativeEntries(req.params.id, world.month, entries);

    // Layer 2: detect significant-event triggers and hand them to the async worker.
    // The world never pauses for prose — these entries are generated off the
    // request path and surface on a later `GET /feed` poll. Then warm the next few
    // months' likely entries during this idle moment.
    const triggers = detectTriggers(world, snapshot);
    narrativeWorker.enqueue(req.params.id, world, triggers);
    narrativeWorker.prefetch(req.params.id, world);

    const result: AdvanceResultDTO = {
      month: world.month,
      monthLabel: gameDateLabel(world.month),
      blurb: transitionBlurb(world),
      feed: toFeedDTO(world.month, entries).entries,
    };
    return result;
  });

  return app;
}
