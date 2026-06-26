import { and, asc, eq, inArray } from 'drizzle-orm';
import type { NarrativeEntry, NarrativeEntryType } from '@island/shared';
import { db } from './db';
import { narrativeEntry } from './schema';

// The Daily Life feed is persisted to `narrative_entry`. Layer-1 template entries
// are written synchronously on advance; Layer-2 (Claude) entries will land here
// asynchronously in Phase 5. Writing is idempotent per (saveId, month) so
// re-advancing or replaying a month never duplicates the feed.
export async function saveNarrativeEntries(
  saveId: string,
  month: number,
  entries: NarrativeEntry[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(narrativeEntry)
      .where(and(eq(narrativeEntry.saveId, saveId), eq(narrativeEntry.month, month)));
    if (entries.length > 0) {
      await tx.insert(narrativeEntry).values(
        entries.map((e) => ({
          saveId,
          month: e.month,
          type: e.type,
          triggerId: e.triggerId ?? null,
          text: e.text,
        })),
      );
    }
  });
}

// Append Layer-2 (Claude) entries to an already-written month WITHOUT disturbing
// the Layer-1 templates that `saveNarrativeEntries` wrote synchronously on advance.
// LLM entries arrive asynchronously after the response, so this must add to the
// feed, not replace it. Idempotent per (saveId, month, triggerId): a re-generated
// or re-delivered entry for the same trigger replaces its prior row rather than
// duplicating — so a prefetch hit and a later live generation can't both land.
export async function appendNarrativeEntries(
  saveId: string,
  month: number,
  entries: NarrativeEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  const triggerIds = entries
    .map((e) => e.triggerId)
    .filter((id): id is string => Boolean(id));
  await db.transaction(async (tx) => {
    if (triggerIds.length > 0) {
      await tx
        .delete(narrativeEntry)
        .where(
          and(
            eq(narrativeEntry.saveId, saveId),
            eq(narrativeEntry.month, month),
            inArray(narrativeEntry.triggerId, triggerIds),
          ),
        );
    }
    await tx.insert(narrativeEntry).values(
      entries.map((e) => ({
        saveId,
        month: e.month,
        type: e.type,
        triggerId: e.triggerId ?? null,
        text: e.text,
      })),
    );
  });
}

export async function loadFeed(saveId: string, month: number): Promise<NarrativeEntry[]> {
  const rows = await db
    .select()
    .from(narrativeEntry)
    .where(and(eq(narrativeEntry.saveId, saveId), eq(narrativeEntry.month, month)))
    .orderBy(asc(narrativeEntry.createdAt));
  return rows.map((r) => ({
    type: r.type as NarrativeEntryType,
    text: r.text,
    month: r.month,
    triggerId: r.triggerId ?? undefined,
  }));
}
