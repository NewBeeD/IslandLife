// ─────────────────────────────────────────────────────────────────────────────
// PROJECTED DTOs — THE ICEBERG BOUNDARY (architecture doc, "API Design").
//
// Every value the client receives is shaped here. Hidden engine state — OCEAN,
// derived tendencies, cultural capital, loan interest rates, opportunity expected
// returns, NPC utilities, the legacy total before death — NEVER appears in a DTO.
// The projection layer (server/projection) is the one place allowed to read the
// hidden world and it emits only these shapes. The iceberg-leak contract test
// asserts no DTO serializes a denylisted key.
//
// One schema (S4): these live in @island/shared and are imported by both the
// server (to build them) and the web client (to consume them).
// ─────────────────────────────────────────────────────────────────────────────

import type { NarrativeEntryType } from './narrative';

// GET /saves/:id/state — the header bar. No scores.
export interface StateDTO {
  saveId: string;
  month: number;
  monthLabel: string; // "October 2027"
  name: string;
  age: number;
  parish: string; // display name, e.g. "Saint John"
  occupation: string | null; // display label, e.g. "Fishing"
  cashInHand: number; // EC$
}

// GET /saves/:id/money — the Money view. Income/expense lines, this-month delta,
// assets, debts. Deliberately no net worth, no interest rate, no forecast.
export interface MoneyLine {
  label: string;
  amount: number; // EC$, always positive; the section gives the sign
}

export interface AssetLine {
  label: string;
  ownership: string; // "Yours"
}

export interface DebtLine {
  label: string;
  remaining: number; // EC$ remaining principal
  monthlyPayment: number; // EC$/month (the agreed payment — NOT the interest rate)
  monthsLeft: number;
}

export interface MoneyDTO {
  monthLabel: string;
  cashInHand: number;
  income: { lines: MoneyLine[]; total: number };
  expenses: { lines: MoneyLine[]; total: number };
  thisMonthDelta: number; // income total − expense total (can be negative)
  assets: AssetLine[];
  debts: DebtLine[];
  notes: string[]; // contextual prose, e.g. a short-this-month warning. No numbers beyond EC$.
}

// GET /saves/:id/feed?month= — the Daily Life feed for a month.
export interface FeedEntryDTO {
  type: NarrativeEntryType;
  text: string;
}

export interface FeedDTO {
  month: number;
  monthLabel: string;
  entries: FeedEntryDTO[];
}

// GET /saves/:id/community — named relationships + reputation, as prose.
export interface RelationshipDTO {
  name: string;
  relationship: string; // "your uncle", "the woman at stall 7"
  standing: string; // prose, no score
}

export interface CommunityDTO {
  reputation: string; // prose summary, no number
  relationships: RelationshipDTO[];
}

// GET /saves/:id/opportunities — only what the player has heard of, unlabelled.
// No expectedReturn, no riskLevel — genuine tradeoffs in prose.
export interface OpportunityDTO {
  id: string;
  title: string;
  description: string;
  source: string; // "Heard: directly from Eunice"
  window: string; // "She needs an answer this month"
  status: 'OPEN' | 'POSSIBLE' | 'EXPIRED';
}

export interface OpportunitiesDTO {
  active: OpportunityDTO[];
  possible: OpportunityDTO[];
  expired: OpportunityDTO[];
}

// POST /saves/:id/advance — the month-transition response. Carries the blurb and
// whatever feed entries are ready synchronously (templates always; LLM cache hits
// later). The world never pauses for prose.
export interface AdvanceResultDTO {
  month: number;
  monthLabel: string;
  blurb: string;
  feed: FeedEntryDTO[];
}

// POST /saves — begin a life. The hidden CharacterProfile is never returned.
export interface CreateSaveResultDTO {
  saveId: string;
  month: number;
  monthLabel: string;
}
