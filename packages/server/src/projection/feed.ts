import { gameDateLabel } from '@island/shared';
import type { FeedDTO, FeedEntryDTO, NarrativeEntry } from '@island/shared';

// GET /saves/:id/feed?month= — the Daily Life feed. Strips the triggerId and any
// other server-side bookkeeping: the player sees only the type and the prose.
export function toFeedDTO(month: number, entries: NarrativeEntry[]): FeedDTO {
  const dto: FeedEntryDTO[] = entries.map((e) => ({ type: e.type, text: e.text }));
  return { month, monthLabel: gameDateLabel(month), entries: dto };
}
