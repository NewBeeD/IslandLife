import { useCallback, useState } from 'react';
import type { FeedEntryDTO, MoneyDTO, OpportunitiesDTO, StateDTO } from '@island/shared';
import { api } from './api/client';
import { DailyLife } from './views/DailyLife';
import { Money } from './views/Money';
import { Opportunities } from './views/Opportunities';

type View = 'daily' | 'money' | 'opportunities';

export function App() {
  const [saveId, setSaveId] = useState<string | null>(null);
  const [view, setView] = useState<View>('daily');
  const [state, setState] = useState<StateDTO | null>(null);
  const [feed, setFeed] = useState<FeedEntryDTO[]>([]);
  const [money, setMoney] = useState<MoneyDTO | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunitiesDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (id: string) => {
    const [s, f, m, o] = await Promise.all([
      api.state(id),
      api.feed(id),
      api.money(id),
      api.opportunities(id),
    ]);
    setState(s);
    setFeed(f.entries);
    setMoney(m);
    setOpportunities(o);
  }, []);

  const begin = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createSave({});
      setSaveId(created.saveId);
      await refresh(created.saveId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const advance = useCallback(async () => {
    if (!saveId) return;
    setBusy(true);
    setError(null);
    try {
      await api.advance(saveId);
      await refresh(saveId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [saveId, refresh]);

  if (!saveId || !state) {
    return (
      <main className="start">
        <h1>Island Life</h1>
        <p className="muted">A life and economy in Dominica, one month at a time.</p>
        <button className="primary" onClick={begin} disabled={busy}>
          {busy ? 'Beginning…' : 'Begin a life'}
        </button>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  const openCount = opportunities?.active.length ?? 0;

  return (
    <main className="app">
      <header className="bar">
        <div className="bar__who">
          <strong>{state.name}</strong>
          <span className="muted">
            {state.occupation ? `${state.occupation} · ` : ''}
            {state.parish} · Age {state.age}
          </span>
        </div>
        <div className="bar__when">
          <span className="muted">{state.monthLabel}</span>
          <strong>EC${state.cashInHand.toLocaleString('en-US')}</strong>
        </div>
      </header>

      <nav className="tabs">
        <button className={view === 'daily' ? 'active' : ''} onClick={() => setView('daily')}>
          Daily Life
        </button>
        <button className={view === 'money' ? 'active' : ''} onClick={() => setView('money')}>
          Money
        </button>
        <button
          className={view === 'opportunities' ? 'active' : ''}
          onClick={() => setView('opportunities')}
        >
          Opportunities
          {openCount > 0 && <span className="tab__badge">{openCount}</span>}
        </button>
      </nav>

      <section className="content">
        {view === 'daily' && <DailyLife entries={feed} />}
        {view === 'money' && money && <Money money={money} />}
        {view === 'opportunities' && opportunities && (
          <Opportunities
            saveId={saveId}
            opportunities={opportunities}
            onResolved={() => refresh(saveId)}
          />
        )}
      </section>

      {error && <p className="error">{error}</p>}

      <footer className="advance">
        <button className="primary" onClick={advance} disabled={busy}>
          {busy ? 'A month passes…' : 'Advance to next month'}
        </button>
      </footer>
    </main>
  );
}
