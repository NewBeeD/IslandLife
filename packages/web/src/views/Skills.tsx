import type { SkillsDTO } from '@island/shared';

// View — Skills (Phase 15, P15.4). The trades the player has built up over the
// years, their formal credential, and (for a wage worker) their current day rate.
// Qualitative prose, not numbers — the underlying skill scores never cross the wire.
export function Skills({ skills }: { skills: SkillsDTO }) {
  const { headline, credential, trades, wage } = skills;

  return (
    <div className="skills">
      <section className="skills__headline">
        <p className="skills__headline-text">{headline}</p>
      </section>

      {wage && (
        <section className="skills__wage">
          <h3>{wage.label}</h3>
          <p className="skills__wage-rate">
            <strong>EC${wage.dailyRate.toLocaleString('en-US')}</strong>
            <span className="muted"> a day</span>
            <span className="muted"> · about EC${wage.perMonth.toLocaleString('en-US')} a month</span>
          </p>
          <p className="skills__wage-detail muted">{wage.detail}</p>
        </section>
      )}

      <section className="skills__credential">
        <h3>Qualifications</h3>
        <p>{credential}</p>
      </section>

      <section className="skills__trades">
        <h3>What you can do</h3>
        {trades.length > 0 ? (
          trades.map((t) => (
            <article key={t.label} className="skill">
              <div className="skill__head">
                <strong>{t.label}</strong>
                <span className="muted">{t.standing}</span>
              </div>
              <p className="skill__detail">{t.detail}</p>
            </article>
          ))
        ) : (
          <p className="muted">
            You are only at the start of your working life. The skills will come — they always do,
            one job at a time.
          </p>
        )}
      </section>
    </div>
  );
}
