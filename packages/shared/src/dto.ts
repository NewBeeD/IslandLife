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
import type { SaleMode } from './enums';

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
// assets, debts, and (Phase 7, the scoped S3 amendment) the player's OWN finances
// in full: asset values, each loan's interest rate + interest/principal split, and
// a derived net worth. This is the one DTO permitted to carry `interestRate` and
// `netWorth` — it is the player looking at their own books. Other people's hidden
// mechanics (NPC psychology, opportunity expected value/risk) still never leak.
// `netWorth` is DERIVED here, never stored (S4 holds).
export interface MoneyLine {
  label: string;
  amount: number; // EC$, always positive; the section gives the sign
}

// What the player could get for an asset if they sold it (Phase 12). A QUICK fire
// sale pays now at a haircut; a PATIENT listing waits for a fuller price. These are
// the player's own books, so EC$ figures are shown.
export interface AssetResaleDTO {
  quickPrice: number; // EC$ paid today (fire sale)
  patientPrice: number; // EC$ expected after a wait
  settlesInMonths: number; // how long the patient sale takes to settle
}

export interface AssetLine {
  id: string; // the asset's id, so the player can sell or pledge it (Phase 12)
  label: string;
  ownership: string; // "Yours"
  value: number; // EC$ — the asset's worth (Phase 7: shown to the player)
  // Phase 12. `pledged` — backing a loan, so it cannot be sold. `listedForSale` — a
  // patient sale is already in flight. `resale` — what a sale would fetch now;
  // absent when the asset is pledged or already listed.
  pledged?: boolean;
  listedForSale?: boolean;
  resale?: AssetResaleDTO;
}

export interface DebtLine {
  loanId: string; // the loan this line is for (so the player can repay/resize it)
  label: string;
  remaining: number; // EC$ remaining principal
  principal: number; // EC$ original principal borrowed
  paidToDate: number; // EC$ of principal repaid so far (= principal − remaining)
  monthlyPayment: number; // EC$/month (the agreed payment)
  interestRate: number; // annual rate, e.g. 0.0925 (Phase 7: the player's own loan, shown)
  interestPortion: number; // EC$ of the next payment that is interest
  principalPortion: number; // EC$ of the next payment that pays down principal
  monthsLeft: number;
}

// A local market price the player's SPOT income reads (Phase 10, P10.5). Market
// prices are public information (the NEWSPAPER channel) — showing them lets the
// player see why a venture's income swings month to month. No hidden mechanics.
export interface MarketWatchLine {
  label: string; // "Fresh fish (local)"
  unit: string; // "lb"
  price: number; // EC$ per unit, current local price
  trend: 'STRONG' | 'TYPICAL' | 'WEAK'; // current price vs. the good's base
}

// The player's stake in a venture or shared firm with outside equity (Phase 11). The
// player sees their own ownership % and who else holds a share — backers' hidden
// psychology never crosses the wire, only their name and share. Shares are plain
// percentages, not the hidden `share`/`equityHolders` engine fields.
export interface OwnershipShareDTO {
  name: string; // "Marcus Charles" / "you"
  sharePct: number; // 0–100
}
export interface OwnershipLine {
  label: string; // the venture/firm — "the boat", "a two-boat fishing co-op"
  yourSharePct: number; // 0–100 — the player's own share
  holders: OwnershipShareDTO[]; // the outside holders (name + %)
}

export interface MoneyDTO {
  monthLabel: string;
  cashInHand: number;
  income: { lines: MoneyLine[]; total: number };
  expenses: { lines: MoneyLine[]; total: number };
  thisMonthDelta: number; // income total − expense total (can be negative)
  assets: AssetLine[];
  debts: DebtLine[];
  netWorth: number; // EC$ — cash + Σ asset value − Σ remaining principal (derived)
  notes: string[]; // contextual prose, e.g. a short-this-month warning.
  // Local market prices the player's SPOT ventures read (P10.5). Empty when the
  // player has no market-driven income. Optional for back-compatibility.
  marketWatch?: MarketWatchLine[];
  // The player's ownership where outside backers/partners hold a share (Phase 11).
  // Empty/absent when everything the player runs is wholly their own.
  ownership?: OwnershipLine[];
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
  // The decision to open when the player acts on an OPEN opportunity. Null once the
  // opportunity is resolved (no further choice to make).
  decisionId: string | null;
}

export interface OpportunitiesDTO {
  active: OpportunityDTO[];
  possible: OpportunityDTO[];
  expired: OpportunityDTO[];
}

// GET /saves/:id/decisions/:did — the decision interface. Situation as a narrative
// moment, options as unlabelled prose. No expectedReturn, no riskLevel, no "safe"
// or "risky" labels — the player must think (Player Experience doc).
export interface DecisionOptionDTO {
  id: string;
  label: string; // the action, e.g. "Tell Eunice yes — you'll supply her"
  description: string; // what it means, in prose; no value/probability/risk label
}

// An asset-upgrade decision is financed interactively (the down-payment slider),
// not chosen from a fixed option list. This describes the slider's bounds; the live
// terms come from the quote endpoint (Phase 7). `interestRate` here is the player's
// own prospective loan — permitted, like the money view (the scoped S3 amendment).
export interface FinancingControlDTO {
  assetLabel: string; // "a bigger pirogue and a new outboard engine"
  assetPrice: number; // EC$ full cost
  maxDownPayment: number; // EC$ — min(cash, price)
  minDownPayment: number; // EC$ — usually 0
  cashOnHand: number; // EC$ — what the player has to put down
  termOptions: number[]; // selectable loan terms in months
}

export interface DecisionDTO {
  id: string;
  title: string; // "Eunice's offer" / "A bigger boat"
  situation: string; // the narrative framing of the choice
  // 'OPTIONS' — a fixed list of unlabelled choices (the Eunice path). 'FINANCING' —
  // an interactive down-payment slider + quote (asset upgrades).
  interaction: 'OPTIONS' | 'FINANCING';
  options: DecisionOptionDTO[]; // populated for 'OPTIONS'
  financing?: FinancingControlDTO; // populated for 'FINANCING'
  status: 'OPEN' | 'RESOLVED' | 'EXPIRED';
  window: string; // "She needs an answer this month"
  chosenOptionId: string | null;
}

// POST /saves/:id/decisions/:did/quote — a live financing quote for the slider. The
// outcome may be a COUNTER: the bank offers `approvedLoan` (less than `requestedLoan`)
// to fit the player's risk profile, which means putting more down. No raw credit
// score is exposed — the player applies and finds out.
export interface FinancingQuoteDTO {
  downPayment: number; // EC$ the player chose to put down
  requestedLoan: number; // EC$ they asked to borrow (price − downPayment)
  outcome: 'APPROVED' | 'COUNTER' | 'DECLINED';
  approvedLoan: number; // EC$ the bank will actually lend (≤ requested)
  interestRate: number; // annual, e.g. 0.0925 (the player's own prospective loan)
  monthlyPayment: number; // EC$/month for the approved loan
  termMonths: number;
  bankLabel: string; // "NCB" / "the credit union"
  reason: string; // plain language ("Approved." / "Put more down…")
}

// POST /saves/:id/decisions/:did — the resolution. Confirms the choice and carries
// a short in-voice line acknowledging it. No mechanics, no outcome forecast.
export interface DecisionResultDTO {
  decisionId: string;
  chosenOptionId: string;
  acknowledgement: string;
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

// POST /saves/:id/assets/:assetId/sell — the outcome of selling an asset (Phase 12).
// A QUICK sale settles immediately (cash now); a PATIENT sale is listed and settles
// later, so `settled` is false and `proceeds` is the expected price.
export interface AssetSaleResultDTO {
  assetId: string;
  mode: SaleMode;
  settled: boolean; // true: paid now (QUICK). false: listed, settles later (PATIENT)
  proceeds: number; // EC$ paid now (QUICK) or expected at settlement (PATIENT)
  settlesInMonths: number; // 0 for QUICK
  ventureClosed: boolean; // a venture lost its last asset and wound down
  cashInHand: number; // EC$ after the sale
  acknowledgement: string; // a short in-voice line
}

// POST /saves/:id/assets/:assetId/borrow/quote — a live quote for a loan secured by
// an existing asset (Phase 12). Like the financing quote, this is the player's OWN
// prospective loan, so `interestRate` is permitted; the bank's hidden score is not.
export interface CollateralQuoteDTO {
  assetId: string;
  assetValue: number; // EC$ — the asset pledged as collateral
  outcome: 'APPROVED' | 'COUNTER' | 'DECLINED';
  maxPrincipal: number; // EC$ the bank will lend against it
  interestRate: number; // annual, the player's own prospective loan
  monthlyPayment: number; // EC$/month for maxPrincipal at this term
  termMonths: number;
  bankLabel: string;
  reason: string; // plain language
}

// POST /saves/:id/assets/:assetId/borrow — the loan booked against the pledged asset.
export interface BorrowResultDTO {
  loanId: string;
  principal: number; // EC$ borrowed
  monthlyPayment: number; // EC$/month
  interestRate: number; // annual (the player's own loan)
  termMonths: number;
  cashInHand: number; // EC$ after the loan is paid out
  acknowledgement: string;
}

// POST /saves/:id/loans/:loanId/{repay,installment} — the player acting on their own
// loan (Phase 14): a lump-sum early payoff or a resized installment. These are the
// player's own books, so the loan's figures are shown in full.
export interface LoanActionResultDTO {
  loanId: string;
  status: 'ACTIVE' | 'PAID'; // PAID once a repayment clears the balance
  remaining: number; // EC$ remaining principal after the action
  monthlyPayment: number; // EC$/month (0 once PAID)
  monthsLeft: number; // re-derived from the new balance/installment
  cashInHand: number; // EC$ after the action
  acknowledgement: string; // a short in-voice line
}
