import type { FeedEntryDTO, NarrativeEntryType } from '@island/shared';

// The Daily Life feed — a curated list of the month's narrative entries. The entry
// type is shown only as a quiet label; the prose carries the weight. (Template-only
// in Phase 4; Layer-2 Claude entries join the same feed in Phase 5, indistinguishable.)
const TYPE_LABEL: Record<NarrativeEntryType, string> = {
  PERSONAL: 'Personal',
  OBSERVATION: 'Observation',
  MEMORY: 'Memory',
  DECISION_REQUIRED: 'Decision',
  COMMUNITY: 'Community',
};

export function DailyLife({ entries }: { entries: FeedEntryDTO[] }) {
  if (entries.length === 0) {
    return <p className="muted">Nothing yet. Advance a month to begin the life.</p>;
  }
  return (
    <div className="feed">
      {entries.map((e, i) => (
        <article key={i} className={`entry entry--${e.type.toLowerCase()}`}>
          <span className="entry__type">{TYPE_LABEL[e.type]}</span>
          <p className="entry__text">{e.text}</p>
        </article>
      ))}
    </div>
  );
}
