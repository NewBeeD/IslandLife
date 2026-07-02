import { useCallback, useEffect, useState } from 'react';
import type {
  DecisionDTO,
  EducationStatusDTO,
  FinancingQuoteDTO,
  OpportunitiesDTO,
  OpportunityDTO,
  PartnershipNegotiationResultDTO,
} from '@island/shared';
import { api, type VentureCommitmentInput } from '../api/client';

function ec(n: number): string {
  if (!Number.isFinite(n)) n = 0;
  return `EC$${Math.round(n).toLocaleString('en-US')}`;
}
function pct(rate: number): string {
  if (!Number.isFinite(rate)) rate = 0;
  return `${(rate * 100).toFixed(2)}%`;
}

// View 4 — Opportunities. Only what the player has heard of, through their own
// information channels (P6.1). Acting on an OPEN opportunity opens its decision: a
// narrative moment with unlabelled options (P6.2). Choosing one resolves it back
// into the simulation (P6.3); `onResolved` refreshes the rest of the app.
export function Opportunities({
  saveId,
  opportunities,
  onResolved,
}: {
  saveId: string;
  opportunities: OpportunitiesDTO;
  onResolved: () => void | Promise<void>;
}) {
  const { active, possible, expired, attention } = opportunities;
  const nothing = active.length === 0 && possible.length === 0 && expired.length === 0;

  return (
    <div className="opps">
      {/* Phase 26: the month's management attention — how full the plate is, and whether
          everything on it can be seen to (P26.1). */}
      {attention && <p className="opps__attention">{attention}</p>}

      {/* Phase 18: standing actions the player can take any time, not surfaced offers. */}
      <section className="opps__standing">
        <RaiseMoneyButton saveId={saveId} onResolved={onResolved} />
        <StudiesPanel saveId={saveId} onResolved={onResolved} />
      </section>

      {nothing && (
        <p className="muted">
          You have not heard of anything worth acting on yet. Word travels — keep at the work
          and keep your ears open.
        </p>
      )}
      {active.length > 0 && (
        <section className="opps__group">
          <h3>Open</h3>
          {active.map((o) => (
            <OpportunityCard key={o.id} saveId={saveId} opp={o} onResolved={onResolved} />
          ))}
        </section>
      )}
      {possible.length > 0 && (
        <section className="opps__group">
          <h3>Possible</h3>
          {possible.map((o) => (
            <OpportunityCard key={o.id} saveId={saveId} opp={o} onResolved={onResolved} />
          ))}
        </section>
      )}
      {expired.length > 0 && (
        <section className="opps__group opps__group--expired">
          <h3>Passed</h3>
          {expired.map((o) => (
            <OpportunityCard key={o.id} saveId={saveId} opp={o} onResolved={onResolved} />
          ))}
        </section>
      )}
    </div>
  );
}

function OpportunityCard({
  saveId,
  opp,
  onResolved,
}: {
  saveId: string;
  opp: OpportunityDTO;
  onResolved: () => void | Promise<void>;
}) {
  const [decision, setDecision] = useState<DecisionDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    if (!opp.decisionId) return;
    setBusy(true);
    setError(null);
    try {
      setDecision(await api.decision(saveId, opp.decisionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [saveId, opp.decisionId]);

  const choose = useCallback(
    async (optionId: string) => {
      if (!opp.decisionId) return;
      setBusy(true);
      setError(null);
      try {
        await api.resolveDecision(saveId, opp.decisionId, optionId);
        setDecision(null);
        await onResolved();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [saveId, opp.decisionId, onResolved],
  );

  return (
    <article className="opp">
      <h4 className="opp__title">{opp.title}</h4>
      <p className="opp__desc">{opp.description}</p>
      <p className="opp__meta muted">
        {opp.source} · {opp.window}
      </p>

      {opp.status === 'OPEN' && !decision && (
        <button className="primary" onClick={open} disabled={busy}>
          {busy ? 'Looking into it…' : 'Look into it'}
        </button>
      )}

      {decision && decision.interaction === 'FINANCING' && decision.financing && (
        <div className="decision">
          <p className="decision__situation">{decision.situation}</p>
          <FinancingPanel
            saveId={saveId}
            decisionId={decision.id}
            financing={decision.financing}
            onResolved={onResolved}
            onCancel={() => setDecision(null)}
          />
        </div>
      )}

      {decision && decision.interaction === 'OPTIONS' && (
        <div className="decision">
          <p className="decision__situation">{decision.situation}</p>
          {decision.negotiation && (
            <NegotiationPanel
              saveId={saveId}
              decisionId={decision.id}
              negotiation={decision.negotiation}
              onResolved={async () => {
                setDecision(null);
                await onResolved();
              }}
            />
          )}
          <div className="decision__options">
            {decision.options.map((o) => (
              <button key={o.id} className="decision__option" onClick={() => choose(o.id)} disabled={busy}>
                <strong>{o.label}</strong>
                <span className="muted">{o.description}</span>
              </button>
            ))}
          </div>
          <button className="decision__back" onClick={() => setDecision(null)} disabled={busy}>
            Not now
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </article>
  );
}

// The down-payment slider for an asset upgrade. The player drags how much to put
// down; the panel polls the bank for live terms (loan size, monthly payment, the
// approve/counter/decline result). A COUNTER means the bank will lend less — one
// click takes the bank's smaller loan (by putting the rest down in cash).
function FinancingPanel({
  saveId,
  decisionId,
  financing,
  onResolved,
  onCancel,
}: {
  saveId: string;
  decisionId: string;
  financing: NonNullable<DecisionDTO['financing']>;
  onResolved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [down, setDown] = useState(
    Math.min(financing.maxDownPayment, Math.round(financing.assetPrice * 0.2)),
  );
  const [term, setTerm] = useState(financing.termOptions[0] ?? 36);
  // P17.1 — the time-commitment choice for a hands-on new venture. Default to running
  // it yourself when you have the time, otherwise no choice is preselected (the player
  // must hire or switch before they can commit).
  const commitment = financing.commitment;
  const [commitMode, setCommitMode] = useState<VentureCommitmentInput | null>(
    commitment ? (commitment.required ? null : { mode: 'SOLO' }) : null,
  );
  const [quote, setQuote] = useState<FinancingQuoteDTO | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live-quote on every change to down payment or term (debounced).
  useEffect(() => {
    let cancelled = false;
    setQuoting(true);
    const id = setTimeout(() => {
      api
        .quoteFinancing(saveId, decisionId, down, term)
        .then((q) => {
          if (!cancelled) setQuote(q);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [saveId, decisionId, down, term]);

  // Accepting a counter-offer = put the rest down in cash (borrow the bank's max).
  const takeCounter = useCallback(() => {
    if (!quote) return;
    setDown(financing.assetPrice - quote.approvedLoan);
  }, [quote, financing.assetPrice]);

  const accept = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await api.resolveFinancing(saveId, decisionId, down, term, commitMode ?? undefined);
      await onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [saveId, decisionId, down, term, commitMode, onResolved]);

  const counterShortfall = quote ? financing.assetPrice - quote.approvedLoan : 0;
  const canTakeCounter = quote?.outcome === 'COUNTER' && counterShortfall <= financing.cashOnHand;
  // A hands-on venture needs the time question answered before committing.
  const commitmentSatisfied = !commitment || commitMode !== null;
  const canAccept =
    !!quote &&
    commitmentSatisfied &&
    (quote.outcome === 'APPROVED' ||
      (quote.outcome === 'COUNTER' && quote.approvedLoan + down >= financing.assetPrice));

  return (
    <div className="financing">
      <div className="financing__head">
        <span>{financing.assetLabel}</span>
        <strong>{ec(financing.assetPrice)}</strong>
      </div>

      <label className="financing__field">
        <span>
          Put down <strong>{ec(down)}</strong>{' '}
          <span className="muted">(you have {ec(financing.cashOnHand)})</span>
        </span>
        <input
          type="range"
          min={financing.minDownPayment}
          max={financing.maxDownPayment}
          step={100}
          value={down}
          onChange={(e) => setDown(Number(e.target.value))}
          disabled={busy}
        />
      </label>

      <label className="financing__field">
        <span>Pay it back over</span>
        <select value={term} onChange={(e) => setTerm(Number(e.target.value))} disabled={busy}>
          {financing.termOptions.map((t) => (
            <option key={t} value={t}>
              {t} months ({Math.round(t / 12)} yr)
            </option>
          ))}
        </select>
      </label>

      <div className={`financing__quote financing__quote--${quote?.outcome.toLowerCase() ?? 'pending'}`}>
        {quoting && !quote && <p className="muted">Asking the bank…</p>}
        {quote && quote.requestedLoan === 0 && (
          <p>You are paying in full — no loan, no payment. The asset is yours outright.</p>
        )}
        {quote && quote.requestedLoan > 0 && (
          <>
            <div className="financing__line">
              <span>Borrow</span>
              <span>{ec(quote.approvedLoan)}</span>
            </div>
            {quote.outcome !== 'DECLINED' && (
              <>
                <div className="financing__line">
                  <span>Monthly payment</span>
                  <span>{ec(quote.monthlyPayment)}</span>
                </div>
                <div className="financing__line muted">
                  <span>
                    {quote.bankLabel} · {pct(quote.interestRate)} · {quote.termMonths} months
                  </span>
                </div>
              </>
            )}
            <p className={`financing__reason financing__reason--${quote.outcome.toLowerCase()}`}>
              {quote.reason}
            </p>
            {canTakeCounter && (
              <button className="financing__counter" onClick={takeCounter} disabled={busy}>
                Take the bank's offer — put down {ec(counterShortfall)}, borrow {ec(quote.approvedLoan)}
              </button>
            )}
          </>
        )}
      </div>

      {commitment && (
        <div className="financing__commitment">
          <p className="muted">{commitment.timeNote}</p>
          {!commitment.required && (
            <label className="financing__commit-option">
              <input
                type="radio"
                name="commit"
                checked={commitMode?.mode === 'SOLO'}
                onChange={() => setCommitMode({ mode: 'SOLO' })}
                disabled={busy}
              />
              <span>Run it yourself</span>
            </label>
          )}
          {commitment.canHire && (
            <label className="financing__commit-option">
              <input
                type="radio"
                name="commit"
                checked={commitMode?.mode === 'HIRE'}
                onChange={() => setCommitMode({ mode: 'HIRE' })}
                disabled={busy}
              />
              <span>Take someone on to run it — {commitment.operatorNote}</span>
            </label>
          )}
          {commitment.switchable.map((s) => (
            <label className="financing__commit-option" key={s.ventureId}>
              <input
                type="radio"
                name="commit"
                checked={commitMode?.mode === 'SWITCH' && commitMode.closeVentureId === s.ventureId}
                onChange={() => setCommitMode({ mode: 'SWITCH', closeVentureId: s.ventureId })}
                disabled={busy}
              />
              <span>Wind down {s.label} and run this yourself</span>
            </label>
          ))}
        </div>
      )}

      <div className="financing__actions">
        <button className="primary" onClick={accept} disabled={busy || !canAccept}>
          {busy ? 'Signing…' : 'Do it'}
        </button>
        <button className="decision__back" onClick={onCancel} disabled={busy}>
          Not now
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

// Phase 18 (P18.4): a standing action to raise money among friends whenever the player
// has work worth funding — not a surfaced one-off. Opening a round adds a crowdfund
// decision the player can then act on like any other.
function RaiseMoneyButton({
  saveId,
  onResolved,
}: {
  saveId: string;
  onResolved: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const raise = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await api.startCrowdfund(saveId);
      setNote(r.reason);
      if (r.started) await onResolved();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [saveId, onResolved]);

  return (
    <div className="opps__action">
      <button className="secondary" onClick={raise} disabled={busy}>
        {busy ? 'Asking around…' : 'Raise money among friends'}
      </button>
      {note && <span className="muted"> {note}</span>}
    </div>
  );
}

// Phase 18 (P18.5): the player's current studies, with pause/resume. Pausing stops the
// tuition going out and freezes progress; resuming picks up where it left off.
function StudiesPanel({
  saveId,
  onResolved,
}: {
  saveId: string;
  onResolved: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<EducationStatusDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.education(saveId));
    } catch {
      /* studies are optional; ignore a fetch error */
    }
  }, [saveId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = useCallback(
    async (which: 'pause' | 'resume') => {
      setBusy(true);
      try {
        await (which === 'pause' ? api.pauseEducation(saveId) : api.resumeEducation(saveId));
        await refresh();
        await onResolved();
      } catch {
        /* surfaced elsewhere; keep the panel quiet */
      } finally {
        setBusy(false);
      }
    },
    [saveId, refresh, onResolved],
  );

  if (!status || !status.enrolled) return null;
  return (
    <div className="opps__studies">
      <span>
        Studying <strong>{status.programName}</strong> — {status.monthsLeft} month
        {status.monthsLeft === 1 ? '' : 's'} to go{status.paused ? ' (paused)' : ''}.
      </span>
      {status.paused ? (
        <button className="secondary" onClick={() => act('resume')} disabled={busy}>
          Take it back up
        </button>
      ) : (
        <button className="secondary" onClick={() => act('pause')} disabled={busy}>
          Pause for now
        </button>
      )}
    </div>
  );
}

// Phase 18 (P18.3): propose a profit split on a partnership. The player drags their own
// share; the partner accepts, counters, or declines. A counter can be taken in one click.
function NegotiationPanel({
  saveId,
  decisionId,
  negotiation,
  onResolved,
}: {
  saveId: string;
  decisionId: string;
  negotiation: NonNullable<DecisionDTO['negotiation']>;
  onResolved: () => void | Promise<void>;
}) {
  const [yourShare, setYourShare] = useState(negotiation.defaultYourSharePct);
  const [result, setResult] = useState<PartnershipNegotiationResultDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const propose = useCallback(
    async (partnerSharePct: number) => {
      setBusy(true);
      try {
        const r = await api.proposePartnership(saveId, decisionId, partnerSharePct);
        setResult(r);
        if (r.outcome === 'ACCEPT') await onResolved();
      } catch {
        /* leave the panel; the player can try a different split */
      } finally {
        setBusy(false);
      }
    },
    [saveId, decisionId, onResolved],
  );

  return (
    <div className="negotiation">
      <label className="financing__field">
        <span>
          Propose to take <strong>{yourShare}%</strong> for yourself
          <span className="muted"> (they get {100 - yourShare}%)</span>
        </span>
        <input
          type="range"
          min={5}
          max={95}
          step={5}
          value={yourShare}
          onChange={(e) => setYourShare(Number(e.target.value))}
          disabled={busy}
        />
      </label>
      <button className="secondary" onClick={() => propose(100 - yourShare)} disabled={busy}>
        {busy ? 'Putting it to them…' : 'Propose this split'}
      </button>
      {result && result.outcome !== 'ACCEPT' && (
        <div className={`negotiation__result negotiation__result--${result.outcome.toLowerCase()}`}>
          <p>{result.reason}</p>
          {result.outcome === 'COUNTER' && result.counterPartnerSharePct != null && (
            <button
              className="secondary"
              onClick={() => propose(result.counterPartnerSharePct!)}
              disabled={busy}
            >
              Take their offer — they hold {result.counterPartnerSharePct}%, you{' '}
              {100 - result.counterPartnerSharePct}%
            </button>
          )}
        </div>
      )}
    </div>
  );
}
