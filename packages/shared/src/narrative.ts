// Narrative entry types shared across the template engine (@island/narrative),
// the server (persists to `narrative_entry`, projects to the feed DTO), and the
// web client. The text is always written in the narrative voice (second person,
// present tense — see the Narrative Generation doc). No mechanics leak here.

export type NarrativeEntryType =
  | 'PERSONAL'
  | 'OBSERVATION'
  | 'MEMORY'
  | 'DECISION_REQUIRED'
  | 'COMMUNITY';

// Qualitative price movement, never a raw delta (voice rule: numbers become prose,
// EC$ amounts being the deliberate exception).
export type PriceDirection = 'up' | 'down' | 'holding steady';

// The contexts `renderMagnitude` knows how to turn into prose.
export type MagnitudeContext =
  | 'PRICE_CHANGE'
  | 'INCOME_CHANGE'
  | 'DURATION'
  | 'LOAN_RELATIVE_SIZE';

// A single rendered narrative entry. Produced by the template engine (Layer 1)
// and, later, by the LLM (Layer 2). `triggerId` records what generated it (a
// template id or an LLM trigger) — server-side only; the feed DTO drops it.
export interface NarrativeEntry {
  type: NarrativeEntryType;
  text: string;
  month: number;
  triggerId?: string;
}
