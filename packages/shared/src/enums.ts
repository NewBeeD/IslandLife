// Enumerations shared across engine, server, and (later) web.
// Kept as string-literal unions rather than TS `enum` so they serialize cleanly
// to JSON and to the Postgres enum types in the architecture doc.

export type Tri = 'LOW' | 'MEDIUM' | 'HIGH';

export const PARISH_IDS = [
  'SAINT_GEORGE',
  'SAINT_JOHN',
  'SAINT_ANDREW',
  'SAINT_DAVID',
  'SAINT_PATRICK',
  'SAINT_LUKE',
  'SAINT_MARK',
  'SAINT_PAUL',
  'SAINT_JOSEPH',
  'SAINT_PETER',
] as const;
export type ParishId = (typeof PARISH_IDS)[number];

// Industry is also the GoodCategory namespace (a good's category IS an industry).
export const INDUSTRIES = [
  'FISHING',
  'AGRICULTURE',
  'CONSTRUCTION',
  'INFORMAL_TRADE',
  'RETAIL',
  'TOURISM',
  'TRANSPORTATION',
  'FINANCE',
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export type EmploymentStatus = 'EMPLOYED' | 'SELF_EMPLOYED' | 'INFORMAL' | 'UNEMPLOYED';
export type CompanyStatus = 'HEALTHY' | 'DISTRESSED' | 'CLOSED';
export type BankState = 'HEALTHY' | 'STRESSED' | 'DISTRESSED' | 'INSOLVENT';
export type LoanStatus = 'ACTIVE' | 'PAID' | 'DEFAULT';

export type FamilyBackground =
  | 'FISHING_PORTSMOUTH'
  | 'FARMING_INTERIOR'
  | 'CIVIL_SERVANT_ROSEAU'
  | 'TRADING_ROSEAU';

export type FormativeEvent = 'HURRICANE' | 'DIASPORA_REMITTANCE' | 'EXPLOITATION' | 'MENTOR';

// Maps an Industry to its knowledge/experience domain key. The two namespaces
// differ in case and spelling ('FISHING' vs 'fishing'); always map before
// indexing a domain object, or you get undefined -> NaN.
export const INDUSTRY_DOMAIN: Record<Industry, keyof ExperienceDomains> = {
  FISHING: 'fishing',
  AGRICULTURE: 'agriculture',
  CONSTRUCTION: 'construction',
  INFORMAL_TRADE: 'informalTrade',
  RETAIL: 'retail',
  TOURISM: 'tourism',
  TRANSPORTATION: 'transportation',
  FINANCE: 'finance',
};

// Re-declared here to avoid a circular import with types.ts.
export interface ExperienceDomains {
  fishing: number;
  agriculture: number;
  construction: number;
  informalTrade: number;
  retail: number;
  tourism: number;
  transportation: number;
  finance: number;
}
