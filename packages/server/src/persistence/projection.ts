import { eq } from 'drizzle-orm';
import { COUNTRY, PARISHES } from '@island/shared';
import type { WorldState } from '@island/shared';
import { db } from './db';
import { company, country, government, legacyScore, parish, person, save } from './schema';

// The snapshot (world_snapshot) is the source of truth. These tables are a
// current-state READ MODEL projected from it each tick so the API and analytics
// can query relationally. Per-month history lives in the snapshot; person/company
// /government/legacy hold the latest state only (overwritten each tick). This is
// also where the engine's string ids collapse into the normalized read model —
// we project player-only `person`, so no cross-id stitching is needed yet.
//
// NOTE: legacy_score is stored (server-side) but the iceberg boundary (P4.2)
// keeps it out of player-facing DTOs until death.

// The drizzle transaction type, derived so projection runs inside saveTick's tx.
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const s = (x: number): string => x.toString();

// Reference data is shared across saves; seed it once, idempotently. Person/
// company rows FK to parish, and government FKs to country, so this must run
// before the first projection.
export async function ensureReferenceData(tx: Tx): Promise<void> {
  await tx
    .insert(country)
    .values({
      id: COUNTRY.id,
      name: COUNTRY.name,
      baseInterestRate: s(COUNTRY.baseInterestRate),
      institutionScore: s(COUNTRY.institutionScore),
      corruptionIndex: s(COUNTRY.corruptionIndex),
      exchangeRate: s(COUNTRY.exchangeRate),
    })
    .onConflictDoNothing();

  await tx
    .insert(parish)
    .values(
      PARISHES.map((p) => ({
        id: p.id,
        countryId: COUNTRY.id,
        name: p.name,
        capital: p.capital,
        population: p.population,
        infrastructureScore: s(p.infrastructureScore),
        marketAccessScore: s(p.marketAccessScore),
      })),
    )
    .onConflictDoNothing();
}

export async function projectWorld(tx: Tx, saveId: string, world: WorldState): Promise<void> {
  // ── person (player only) ──────────────────────────────────────────
  const p = world.player;
  await tx.delete(person).where(eq(person.saveId, saveId));
  const insertedPerson = await tx
    .insert(person)
    .values({
      saveId,
      name: p.name,
      age: p.age,
      parishId: p.parish,
      familyId: null, // engine familyId is not a projected uuid
      isPlayer: true,
      familyBackground: p.familyBackground,
      formativeEvent: p.formativeEvent,
      employmentStatus: p.employmentStatus,
      occupation: p.occupation,
      employerCompanyId: null, // resolved in a later phase
      monthlyIncome: s(p.monthlyIncome),
      monthlyLivingCosts: s(p.monthlyLivingCosts),
      cash: s(p.cash),
      ocean: {
        openness: p.openness,
        conscientiousness: p.conscientiousness,
        extraversion: p.extraversion,
        agreeableness: p.agreeableness,
        neuroticism: p.neuroticism,
      },
      noncognitive: {
        cognitiveAbility: p.cognitiveAbility,
        resilience: p.resilience,
        selfControl: p.selfControl,
        knowledgeAcquisitionRate: p.knowledgeAcquisitionRate,
      },
      capital: {
        socialCapitalLocal: p.socialCapitalLocal,
        socialCapitalInstitutional: p.socialCapitalInstitutional,
        socialCapitalDiaspora: p.socialCapitalDiaspora,
        culturalCapital: p.culturalCapital,
      },
      knowledge: p.knowledge,
      experience: p.experience,
      previousMonthCapital: s(p.previousMonthCapital),
    })
    .returning({ id: person.id });
  const playerRowId = insertedPerson[0]?.id ?? null;
  await tx.update(save).set({ playerPersonId: playerRowId }).where(eq(save.id, saveId));

  // ── company (all) ─────────────────────────────────────────────────
  await tx.delete(company).where(eq(company.saveId, saveId));
  if (world.companies.length > 0) {
    await tx.insert(company).values(
      world.companies.map((c) => ({
        saveId,
        name: c.name,
        industry: c.industry,
        type: c.type,
        parishId: c.parish,
        ownerPersonId: null,
        marketShare: s(c.marketShare),
        employeesCount: c.employees.length,
        baseOperatingCosts: s(c.baseOperatingCosts),
        monthlyRevenue: s(c.monthlyRevenue),
        profit: s(c.profit),
        consecutiveLossMonths: c.consecutiveLossMonths,
        status: c.status,
        estimatedAnnualTax: s(c.estimatedAnnualTax),
      })),
    );
  }

  // ── government (upsert, 1 per save) ───────────────────────────────
  const g = world.government;
  const govValues = {
    countryId: world.country.id,
    monthlyTaxRevenue: s(g.monthlyTaxRevenue),
    fiscalBalance: s(g.fiscalBalance),
    unemploymentRate: s(g.unemploymentRate),
    publicSentiment: s(g.publicSentiment),
    corruptionLevel: s(g.corruptionLevel),
    policies: g.policies,
  };
  await tx
    .insert(government)
    .values({ saveId, ...govValues })
    .onConflictDoUpdate({ target: government.saveId, set: govValues });

  // ── legacy_score (upsert, 1 per save) ─────────────────────────────
  const l = world.playerLegacy;
  const legacyValues = {
    wealthScore: s(l.wealthScore),
    familyScore: s(l.familyScore),
    communityScore: s(l.communityScore),
    innovationScore: s(l.innovationScore),
    environmentScore: s(l.environmentScore),
    reputationScore: s(l.reputationScore),
    lastNetWorth: s(l.lastNetWorth),
  };
  await tx
    .insert(legacyScore)
    .values({ saveId, ...legacyValues })
    .onConflictDoUpdate({ target: legacyScore.saveId, set: legacyValues });
}
