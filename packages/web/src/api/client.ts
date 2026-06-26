import type {
  AdvanceResultDTO,
  CommunityDTO,
  CreateSaveResultDTO,
  FeedDTO,
  MoneyDTO,
  OpportunitiesDTO,
  StateDTO,
} from '@island/shared';

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
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
  advance(saveId: string) {
    return post<AdvanceResultDTO>(`/saves/${saveId}/advance`);
  },
};
