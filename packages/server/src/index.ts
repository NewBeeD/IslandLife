// Phase 4 — the Fastify API:
//   - app.ts (buildApp: saves, advance, state, money, feed, community, opportunities)
//   - projection/ (DTO mappers — THE ICEBERG BOUNDARY; strips hidden state)
//   - persistence/ (Drizzle schema + snapshot save/load + narrative feed)
// Layer-2 narrative jobs (Claude prefetch workers) land in Phase 5.

// API (Phase 4).
export { buildApp } from './app';
export {
  toStateDTO,
  toMoneyDTO,
  toFeedDTO,
  toCommunityDTO,
  toOpportunitiesDTO,
} from './projection';

// Persistence (Phase 2) — save/load against Postgres.
export { createSave, loadSave, saveTick } from './persistence/saves';
export type { CreateSaveOptions } from './persistence/saves';
export { saveNarrativeEntries, loadFeed } from './persistence/narratives';
export { db, client, DATABASE_URL } from './persistence/db';
export * as schema from './persistence/schema';
