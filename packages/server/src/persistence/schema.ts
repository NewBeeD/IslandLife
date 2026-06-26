import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// P2.2: the full normalized projection schema from the architecture doc.
// Snapshot-first persistence keeps the authoritative WorldState in
// `world_snapshot` (JSONB); these tables are the relational read model the API
// and analytics query. Derived values (net worth) are never stored.

// ── Enums ──────────────────────────────────────────────────────────
export const industryEnum = pgEnum('industry', [
  'FISHING', 'AGRICULTURE', 'CONSTRUCTION', 'INFORMAL_TRADE',
  'RETAIL', 'TOURISM', 'TRANSPORTATION', 'FINANCE',
]);
export const employmentEnum = pgEnum('employment', [
  'EMPLOYED', 'SELF_EMPLOYED', 'INFORMAL', 'UNEMPLOYED',
]);
export const companyStatusEnum = pgEnum('company_status', ['HEALTHY', 'DISTRESSED', 'CLOSED']);
export const bankStateEnum = pgEnum('bank_state', ['HEALTHY', 'STRESSED', 'DISTRESSED', 'INSOLVENT']);
export const loanStatusEnum = pgEnum('loan_status', ['ACTIVE', 'PAID', 'DEFAULT']);

// ── Reference (shared across saves) ────────────────────────────────
export const country = pgTable('country', {
  id: text('id').primaryKey(), // 'DM','BB','MQ','TT'
  name: text('name').notNull(),
  baseInterestRate: numeric('base_interest_rate').notNull(),
  institutionScore: numeric('institution_score').notNull(),
  corruptionIndex: numeric('corruption_index').notNull(),
  exchangeRate: numeric('exchange_rate').notNull(),
});

export const parish = pgTable('parish', {
  id: text('id').primaryKey(), // 'SAINT_GEORGE', …
  countryId: text('country_id').notNull().references(() => country.id),
  name: text('name').notNull(),
  capital: text('capital').notNull(),
  population: integer('population').notNull(),
  infrastructureScore: numeric('infrastructure_score').notNull(),
  marketAccessScore: numeric('market_access_score').notNull(),
});

// ── Per-save world ─────────────────────────────────────────────────
export const save = pgTable('save', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id'),
  seed: bigint('seed', { mode: 'number' }).notNull(),
  rngState: jsonb('rng_state').notNull(),
  currentMonth: integer('current_month').notNull().default(0),
  playerPersonId: uuid('player_person_id'),
  status: text('status').notNull().default('ALIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const worldSnapshot = pgTable(
  'world_snapshot',
  {
    saveId: uuid('save_id').notNull().references(() => save.id, { onDelete: 'cascade' }),
    month: integer('month').notNull(),
    state: jsonb('state').notNull(),
  },
  (t) => [primaryKey({ columns: [t.saveId, t.month] })],
);

// ── Normalized projections ─────────────────────────────────────────
export const family = pgTable('family', {
  id: uuid('id').defaultRandom().primaryKey(),
  saveId: uuid('save_id').notNull().references(() => save.id, { onDelete: 'cascade' }),
  surname: text('surname'),
  parishId: text('parish_id').references(() => parish.id),
});

export const person = pgTable(
  'person',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    saveId: uuid('save_id').notNull().references(() => save.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    age: integer('age').notNull(),
    parishId: text('parish_id').references(() => parish.id),
    familyId: uuid('family_id').references(() => family.id),
    isPlayer: boolean('is_player').notNull().default(false),
    familyBackground: text('family_background'),
    formativeEvent: text('formative_event'),
    employmentStatus: employmentEnum('employment_status').notNull(),
    occupation: industryEnum('occupation'),
    employerCompanyId: uuid('employer_company_id').references((): AnyPgColumn => company.id, {
      onDelete: 'set null',
    }),
    monthlyIncome: numeric('monthly_income').notNull().default('0'),
    monthlyLivingCosts: numeric('monthly_living_costs').notNull(),
    cash: numeric('cash').notNull(),
    // numeric profile blocks read together, never queried column-wise.
    ocean: jsonb('ocean').notNull(),
    noncognitive: jsonb('noncognitive').notNull(),
    capital: jsonb('capital').notNull(),
    knowledge: jsonb('knowledge').notNull(),
    experience: jsonb('experience').notNull(),
    previousMonthCapital: numeric('previous_month_capital').notNull().default('0'),
    // net_worth is DERIVED (cash + Σ assets − Σ loan principal). NEVER stored.
  },
  (t) => [index('person_save_idx').on(t.saveId)],
);

export const company = pgTable(
  'company',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    saveId: uuid('save_id').notNull().references(() => save.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    industry: industryEnum('industry').notNull(),
    type: text('type').notNull(),
    parishId: text('parish_id').references(() => parish.id),
    ownerPersonId: uuid('owner_person_id').references(() => person.id, { onDelete: 'set null' }),
    marketShare: numeric('market_share').notNull(),
    employeesCount: integer('employees_count').notNull(),
    baseOperatingCosts: numeric('base_operating_costs').notNull(),
    monthlyRevenue: numeric('monthly_revenue').notNull().default('0'),
    profit: numeric('profit').notNull().default('0'),
    consecutiveLossMonths: integer('consecutive_loss_months').notNull().default(0),
    status: companyStatusEnum('status').notNull().default('HEALTHY'),
    estimatedAnnualTax: numeric('estimated_annual_tax').notNull().default('0'),
  },
  (t) => [index('company_save_idx').on(t.saveId)],
);

export const asset = pgTable(
  'asset',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    saveId: uuid('save_id').notNull().references(() => save.id, { onDelete: 'cascade' }),
    ownerPersonId: uuid('owner_person_id').references(() => person.id, { onDelete: 'cascade' }),
    ownerCompanyId: uuid('owner_company_id').references(() => company.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    size: text('size'),
    value: numeric('value').notNull(),
  },
  (t) => [
    check(
      'asset_owner_chk',
      sql`${t.ownerPersonId} IS NOT NULL OR ${t.ownerCompanyId} IS NOT NULL`,
    ),
  ],
);

export const bank = pgTable(
  'bank',
  {
    id: text('id').notNull(), // 'NCB','RBTT','CREDIT_UNION_DM'
    saveId: uuid('save_id').notNull().references(() => save.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(),
    countryId: text('country_id').references(() => country.id),
    totalAssets: numeric('total_assets').notNull(),
    totalLoans: numeric('total_loans').notNull(),
    nplRatio: numeric('npl_ratio').notNull(),
    solvencyScore: numeric('solvency_score').notNull(),
    lendingAppetite: numeric('lending_appetite').notNull(),
    baseLendingAppetite: numeric('base_lending_appetite').notNull(),
    biasTowardFormalSector: numeric('bias_toward_formal_sector').notNull(),
    state: bankStateEnum('state').notNull().default('HEALTHY'),
  },
  (t) => [primaryKey({ columns: [t.saveId, t.id] })],
);

export const loan = pgTable(
  'loan',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    saveId: uuid('save_id').notNull().references(() => save.id, { onDelete: 'cascade' }),
    bankId: text('bank_id').notNull(),
    borrowerPersonId: uuid('borrower_person_id').references(() => person.id, { onDelete: 'cascade' }),
    borrowerCompanyId: uuid('borrower_company_id').references(() => company.id, { onDelete: 'cascade' }),
    principal: numeric('principal').notNull(),
    remainingPrincipal: numeric('remaining_principal').notNull(),
    interestRate: numeric('interest_rate').notNull(),
    monthlyPayment: numeric('monthly_payment').notNull(),
    termMonths: integer('term_months').notNull(),
    originMonth: integer('origin_month').notNull(),
    purposeIndustry: industryEnum('purpose_industry'),
    status: loanStatusEnum('status').notNull().default('ACTIVE'),
  },
  (t) => [
    index('loan_bank_idx').on(t.saveId, t.bankId),
    foreignKey({ columns: [t.saveId, t.bankId], foreignColumns: [bank.saveId, bank.id] }),
  ],
);

export const job = pgTable('job', {
  id: uuid('id').defaultRandom().primaryKey(),
  saveId: uuid('save_id').notNull().references(() => save.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => person.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').references(() => company.id, { onDelete: 'set null' }),
  title: text('title'),
  monthlySalary: numeric('monthly_salary').notNull(),
  startMonth: integer('start_month').notNull(),
  endMonth: integer('end_month'),
});

export const market = pgTable('market', {
  id: uuid('id').defaultRandom().primaryKey(),
  saveId: uuid('save_id').notNull().references(() => save.id, { onDelete: 'cascade' }),
  goodId: text('good_id').notNull(),
  parishId: text('parish_id').references(() => parish.id),
  currentPrice: numeric('current_price').notNull(),
  demand: numeric('demand').notNull(),
  supply: numeric('supply').notNull(),
  priceHistory: jsonb('price_history').notNull().default(sql`'[]'::jsonb`),
});

export const government = pgTable('government', {
  saveId: uuid('save_id').primaryKey().references(() => save.id, { onDelete: 'cascade' }),
  countryId: text('country_id').references(() => country.id),
  monthlyTaxRevenue: numeric('monthly_tax_revenue').notNull(),
  fiscalBalance: numeric('fiscal_balance').notNull(),
  unemploymentRate: numeric('unemployment_rate').notNull(),
  publicSentiment: numeric('public_sentiment').notNull(),
  corruptionLevel: numeric('corruption_level').notNull(),
  policies: jsonb('policies').notNull().default(sql`'[]'::jsonb`),
});

export const event = pgTable('event', {
  id: uuid('id').defaultRandom().primaryKey(),
  saveId: uuid('save_id').notNull().references(() => save.id, { onDelete: 'cascade' }),
  definitionId: text('definition_id').notNull(),
  severity: numeric('severity').notNull(),
  startedMonth: integer('started_month').notNull(),
  durationRemaining: integer('duration_remaining').notNull(),
  affectedIndustries: jsonb('affected_industries').notNull(),
});

// ── Player-facing surface ──────────────────────────────────────────
export const narrativeEntry = pgTable(
  'narrative_entry',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    saveId: uuid('save_id').notNull().references(() => save.id, { onDelete: 'cascade' }),
    month: integer('month').notNull(),
    type: text('type').notNull(),
    triggerId: text('trigger_id'),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('feed_idx').on(t.saveId, t.month)],
);

export const decision = pgTable('decision', {
  id: uuid('id').defaultRandom().primaryKey(),
  saveId: uuid('save_id').notNull().references(() => save.id, { onDelete: 'cascade' }),
  month: integer('month').notNull(),
  type: text('type').notNull(),
  situation: text('situation').notNull(),
  options: jsonb('options').notNull(),
  chosenOption: text('chosen_option'),
  resolvedMonth: integer('resolved_month'),
});

export const legacyScore = pgTable('legacy_score', {
  saveId: uuid('save_id').primaryKey().references(() => save.id, { onDelete: 'cascade' }),
  wealthScore: numeric('wealth_score').notNull().default('0'),
  familyScore: numeric('family_score').notNull().default('0'),
  communityScore: numeric('community_score').notNull().default('0'),
  innovationScore: numeric('innovation_score').notNull().default('0'),
  environmentScore: numeric('environment_score').notNull().default('0'),
  reputationScore: numeric('reputation_score').notNull().default('0'),
  lastNetWorth: numeric('last_net_worth').notNull().default('0'),
});

export type SaveRow = typeof save.$inferSelect;
export type NewSaveRow = typeof save.$inferInsert;
export type WorldSnapshotRow = typeof worldSnapshot.$inferSelect;
export type PersonRow = typeof person.$inferSelect;
export type CompanyRow = typeof company.$inferSelect;
