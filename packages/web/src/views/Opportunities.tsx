import { useCallback, useEffect, useState } from 'react';
import type {
  DecisionDTO,
  FinancingQuoteDTO,
  OpportunitiesDTO,
  OpportunityDTO,
} from '@island/shared';
import { api } from '../api/client';

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
  const { active, possible, expired } = opportunities;
  const nothing = active.length === 0 && possible.length === 0 && expired.length === 0;

  if (nothing) {
    return (
      <p className="muted">
        You have not heard of anything worth acting on yet. Word travels — keep at the work
        and keep your ears open.
      </p>
    );
  }

  return (
    <div className="opps">
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
      await api.resolveFinancing(saveId, decisionId, down, term);
      await onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [saveId, decisionId, down, term, onResolved]);

  const counterShortfall = quote ? financing.assetPrice - quote.approvedLoan : 0;
  const canTakeCounter = quote?.outcome === 'COUNTER' && counterShortfall <= financing.cashOnHand;
  const canAccept =
    !!quote &&
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
