import { useState } from 'react';
import type { JobsDTO } from '@island/shared';
import { api } from '../api/client';

// View — Jobs (Phase 16). The job market: a slate of postings the player can browse
// and choose from, each showing its pay, the costs that come attached (transport,
// food), the net of the two, and the requirements + stability in prose. Taking a job
// switches the player's livelihood; the figures shown are their own prospective money.
export function Jobs({
  saveId,
  jobs,
  onTaken,
}: {
  saveId: string;
  jobs: JobsDTO;
  onTaken: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const take = async (jobId: string) => {
    setBusy(jobId);
    setError(null);
    setNote(null);
    try {
      const result = await api.takeJob(saveId, jobId);
      setNote(result.acknowledgement);
      onTaken();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const ec = (n: number) => `EC$${n.toLocaleString('en-US')}`;

  return (
    <div className="jobs">
      {jobs.held && (
        <section className="jobs__held">
          <p className="muted">
            You are working as <strong>{jobs.held.title}</strong> — about{' '}
            {ec(jobs.held.netPerMonth)} a month after what it costs you to get there.
          </p>
        </section>
      )}

      {note && <p className="jobs__note">{note}</p>}
      {error && <p className="error">{error}</p>}

      <h3 className="jobs__heading">Work going around</h3>
      {jobs.postings.length === 0 ? (
        <p className="muted">Nothing is hiring that suits you just now. Check back next month.</p>
      ) : (
        jobs.postings.map((j) => (
          <article key={j.id} className={`job${j.current ? ' job--current' : ''}`}>
            <div className="job__head">
              <strong>{j.title}</strong>
              <span className="muted">{j.industry}</span>
            </div>
            <p className="job__pay">{j.pay}</p>

            <ul className="job__costs">
              {j.costs.map((c) => (
                <li key={c.label}>
                  <span>{c.label}</span>
                  <span className="muted">−{ec(c.amount)}</span>
                </li>
              ))}
              <li className="job__net">
                <span>In your pocket</span>
                <strong>about {ec(j.netPerMonth)} a month</strong>
              </li>
            </ul>

            <p className="job__detail muted">{j.requirements}</p>
            <p className="job__detail muted">{j.stability}</p>
            <div className="job__foot">
              <span className="muted">{j.window}</span>
              {j.current ? (
                <span className="job__badge">Your job now</span>
              ) : (
                <button className="primary" disabled={busy != null} onClick={() => take(j.id)}>
                  {busy === j.id ? 'Signing on…' : 'Take this job'}
                </button>
              )}
            </div>
          </article>
        ))
      )}
    </div>
  );
}
