import type {
  AdvanceResultDTO,
  AssetSaleResultDTO,
  BorrowResultDTO,
  CollateralQuoteDTO,
  CommunityDTO,
  CreateSaveResultDTO,
  DecisionDTO,
  DecisionResultDTO,
  FeedDTO,
  FinancingQuoteDTO,
  JobsDTO,
  LoanActionResultDTO,
  MoneyDTO,
  OpportunitiesDTO,
  SaleMode,
  SkillsDTO,
  StateDTO,
  TakeJobResultDTO,
  VentureActionResultDTO,
} from '@island/shared';

// The time-commitment choice for a hands-on new venture (Phase 17, P17.1). Mirrors the
// engine's VentureCommitment, kept structural so the web does not depend on @island/engine.
export type VentureCommitmentInput =
  | { mode: 'SOLO' }
  | { mode: 'HIRE' }
  | { mode: 'SWITCH'; closeVentureId: string };

// Typed client for the Island Life API. Every method returns a projected DTO
// imported straight from @island/shared — the same types the server builds, so a
// shape change is a compile error on both sides. The client renders prose, prices,
// and choices; it is never authoritative and never sees hidden state.

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  // Only send a JSON content-type when there's actually a body. A bodyless POST
  // (e.g. /advance) with content-type: application/json trips Fastify's
  // FST_ERR_CTP_EMPTY_JSON_BODY (400).
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export interface CreationChoicesInput {
  background: string;
  school: string;
  formative: string;
  tendency: string;
  situation: string;
}

export const api = {
  createSave(opts: { seed?: number; creationChoices?: CreationChoicesInput; playerName?: string } = {}) {
    return post<CreateSaveResultDTO>('/saves', opts);
  },
  state(saveId: string) {
    return get<StateDTO>(`/saves/${saveId}/state`);
  },
  money(saveId: string) {
    return get<MoneyDTO>(`/saves/${saveId}/money`);
  },
  feed(saveId: string, month?: number) {
    const q = month != null ? `?month=${month}` : '';
    return get<FeedDTO>(`/saves/${saveId}/feed${q}`);
  },
  community(saveId: string) {
    return get<CommunityDTO>(`/saves/${saveId}/community`);
  },
  opportunities(saveId: string) {
    return get<OpportunitiesDTO>(`/saves/${saveId}/opportunities`);
  },
  skills(saveId: string) {
    return get<SkillsDTO>(`/saves/${saveId}/skills`);
  },
  jobs(saveId: string) {
    return get<JobsDTO>(`/saves/${saveId}/jobs`);
  },
  takeJob(saveId: string, jobId: string) {
    return post<TakeJobResultDTO>(`/saves/${saveId}/jobs/${jobId}/take`);
  },
  decision(saveId: string, decisionId: string) {
    return get<DecisionDTO>(`/saves/${saveId}/decisions/${decisionId}`);
  },
  resolveDecision(saveId: string, decisionId: string, optionId: string) {
    return post<DecisionResultDTO>(`/saves/${saveId}/decisions/${decisionId}`, { optionId });
  },
  quoteFinancing(saveId: string, decisionId: string, downPayment: number, termMonths: number) {
    return post<FinancingQuoteDTO>(`/saves/${saveId}/decisions/${decisionId}/quote`, {
      downPayment,
      termMonths,
    });
  },
  resolveFinancing(
    saveId: string,
    decisionId: string,
    downPayment: number,
    termMonths: number,
    commitment?: VentureCommitmentInput,
  ) {
    return post<DecisionResultDTO>(`/saves/${saveId}/decisions/${decisionId}`, {
      financing: { downPayment, termMonths, ...(commitment ? { commitment } : {}) },
    });
  },
  ventureAction(saveId: string, ventureId: string, action: 'discontinue' | 'shelve' | 'reopen') {
    return post<VentureActionResultDTO>(`/saves/${saveId}/ventures/${ventureId}/${action}`);
  },
  sellAsset(saveId: string, assetId: string, mode: SaleMode) {
    return post<AssetSaleResultDTO>(`/saves/${saveId}/assets/${assetId}/sell`, { mode });
  },
  quoteBorrow(saveId: string, assetId: string, termMonths: number, principal?: number) {
    return post<CollateralQuoteDTO>(`/saves/${saveId}/assets/${assetId}/borrow/quote`, {
      termMonths,
      ...(principal != null ? { principal } : {}),
    });
  },
  borrowAgainstAsset(saveId: string, assetId: string, principal: number, termMonths: number) {
    return post<BorrowResultDTO>(`/saves/${saveId}/assets/${assetId}/borrow`, {
      principal,
      termMonths,
    });
  },
  repayLoan(saveId: string, loanId: string, amount: number) {
    return post<LoanActionResultDTO>(`/saves/${saveId}/loans/${loanId}/repay`, { amount });
  },
  setLoanInstallment(saveId: string, loanId: string, monthlyPayment: number) {
    return post<LoanActionResultDTO>(`/saves/${saveId}/loans/${loanId}/installment`, {
      monthlyPayment,
    });
  },
  advance(saveId: string) {
    return post<AdvanceResultDTO>(`/saves/${saveId}/advance`);
  },
};
