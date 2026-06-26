import type { CommunityDTO } from '@island/shared';

// View 2 — Community. Reputation and named relationships as prose. The underlying
// social-capital scores never cross the wire; the player reads how they are
// perceived, never a number. Named ties are empty until the relationship system
// lands; until then this surfaces the reputation reflection on its own.
export function Community({ community }: { community: CommunityDTO }) {
  const { reputation, relationships } = community;

  return (
    <div className="community">
      <section className="community__rep">
        <h3>How you are known</h3>
        <p className="community__rep-text">{reputation}</p>
      </section>

      {relationships.length > 0 ? (
        <section className="community__people">
          <h3>Your people</h3>
          {relationships.map((r) => (
            <article key={`${r.name}-${r.relationship}`} className="rel">
              <div className="rel__head">
                <strong>{r.name}</strong>
                <span className="muted">{r.relationship}</span>
              </div>
              <p className="rel__standing">{r.standing}</p>
            </article>
          ))}
        </section>
      ) : (
        <p className="muted">
          The people in your life are not yet listed here by name — but they are out there,
          at the wharf and the market and the shop on Saturday, forming their own quiet account
          of who you are.
        </p>
      )}
    </div>
  );
}
