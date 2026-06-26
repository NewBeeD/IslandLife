import { useCallback, useState } from 'react';
import type { DecisionDTO, OpportunitiesDTO, OpportunityDTO } from '@island/shared';
import { api } from '../api/client';

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
          {busy ? 'A word with her…' : 'Hear her out'}
        </button>
      )}

      {decision && (
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
