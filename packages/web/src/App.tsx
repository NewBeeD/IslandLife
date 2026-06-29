import { useCallback, useEffect, useState } from 'react';
import type {
  CommunityDTO,
  FeedEntryDTO,
  JobsDTO,
  MoneyDTO,
  OpportunitiesDTO,
  SkillsDTO,
  StateDTO,
} from '@island/shared';
import { api, type CreationChoicesInput } from './api/client';
import { CharacterCreation } from './views/CharacterCreation';
import { Community } from './views/Community';
import { DailyLife } from './views/DailyLife';
import { Jobs } from './views/Jobs';
import { Money } from './views/Money';
import { Opportunities } from './views/Opportunities';
import { Skills } from './views/Skills';

type View = 'daily' | 'community' | 'money' | 'opportunities' | 'skills' | 'jobs';

// The current life is auto-saved every month server-side; we remember which save it
// is here so the player can close the tab and pick up exactly where they left off.
const SAVE_KEY = 'islandlife.saveId';

export function App() {
  const [saveId, setSaveId] = useState<string | null>(null);
  const [view, setView] = useState<View>('daily');
  const [state, setState] = useState<StateDTO | null>(null);
  const [feed, setFeed] = useState<FeedEntryDTO[]>([]);
  const [money, setMoney] = useState<MoneyDTO | null>(null);
  const [community, setCommunity] = useState<CommunityDTO | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunitiesDTO | null>(null);
  const [skills, setSkills] = useState<SkillsDTO | null>(null);
  const [jobs, setJobs] = useState<JobsDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [resuming, setResuming] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (id: string) => {
    const [s, f, m, c, o, k, j] = await Promise.all([
      api.state(id),
      api.feed(id),
      api.money(id),
      api.community(id),
      api.opportunities(id),
      api.skills(id),
      api.jobs(id),
    ]);
    setState(s);
    setFeed(f.entries);
    setMoney(m);
    setCommunity(c);
    setOpportunities(o);
    setSkills(k);
    setJobs(j);
  }, []);

  // On first load, resume the stored save if there is one. A stale id (e.g. the save
  // no longer exists) is cleared and the player starts a fresh life.
  useEffect(() => {
    const stored = localStorage.getItem(SAVE_KEY);
    if (!stored) {
      setResuming(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await refresh(stored);
        if (!cancelled) setSaveId(stored);
      } catch {
        localStorage.removeItem(SAVE_KEY);
      } finally {
        if (!cancelled) setResuming(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const begin = useCallback(
    async (creationChoices: CreationChoicesInput, name: string) => {
      setBusy(true);
      setError(null);
      try {
        // Blank name → omit it so the engine assigns a Dominican name itself.
        const created = await api.createSave({
          creationChoices,
          ...(name ? { playerName: name } : {}),
        });
        localStorage.setItem(SAVE_KEY, created.saveId);
        setSaveId(created.saveId);
        await refresh(created.saveId);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  // Leave the current life behind and start over. The old save stays on the server;
  // the player simply begins a new one.
  const newLife = useCallback(() => {
    if (!window.confirm('Start a new life? Your current one will be left behind.')) return;
    localStorage.removeItem(SAVE_KEY);
    setSaveId(null);
    setState(null);
    setView('daily');
  }, []);

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

  if (resuming) {
    return (
      <main className="app app--loading">
        <p className="muted">Picking up where you left off…</p>
      </main>
    );
  }

  if (!saveId || !state) {
    return <CharacterCreation busy={busy} error={error} onComplete={begin} />;
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
        <button
          className={view === 'community' ? 'active' : ''}
          onClick={() => setView('community')}
        >
          Community
        </button>
        <button className={view === 'money' ? 'active' : ''} onClick={() => setView('money')}>
          Money
        </button>
        <button className={view === 'skills' ? 'active' : ''} onClick={() => setView('skills')}>
          Skills
        </button>
        <button className={view === 'jobs' ? 'active' : ''} onClick={() => setView('jobs')}>
          Jobs
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
        {view === 'community' && community && <Community community={community} />}
        {view === 'money' && money && (
          <Money money={money} saveId={saveId} onChanged={() => refresh(saveId)} />
        )}
        {view === 'skills' && skills && <Skills skills={skills} />}
        {view === 'jobs' && jobs && (
          <Jobs saveId={saveId} jobs={jobs} onTaken={() => refresh(saveId)} />
        )}
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
        <button className="advance__newlife" onClick={newLife} disabled={busy}>
          Start a new life
        </button>
      </footer>
    </main>
  );
}
