import type {
  JobCostLineDTO,
  JobPosting,
  JobsDTO,
  JobPostingDTO,
  TakeJobResultDTO,
  WorldState,
} from '@island/shared';
import {
  attachedCostsTotal,
  jobMonthlyGross,
  jobNetPerMonth,
  type TakeJobResult,
} from '@island/engine';
import { OCCUPATION_LABEL } from './labels';

// GET /saves/:id/jobs — the job market (Phase 16, P16.4). The open slate of postings
// the player can browse and choose from: pay, the costs that come attached to the job
// (transport, food), the net of the two, and the requirements + stability as prose.
// The EC$ pay/cost figures are public offer information and the player's own
// prospective money, shown like the money view; the hidden gating thresholds never
// cross the wire as numbers (S3). Postings are ordered most net-rewarding first.

function formatEc(n: number): string {
  return `EC$${Math.round(n).toLocaleString('en-US')}`;
}

// The pay line in prose — a day rate (with its monthly equivalent) or a flat salary.
function payText(posting: JobPosting): string {
  const monthly = jobMonthlyGross(posting);
  if (posting.wageKind === 'WAGE' && posting.dailyRate != null) {
    return `${formatEc(posting.dailyRate)} a day · about ${formatEc(monthly)} a month`;
  }
  return `${formatEc(monthly)} a month`;
}

function costLines(posting: JobPosting): JobCostLineDTO[] {
  const c = posting.attachedCosts;
  const lines: JobCostLineDTO[] = [];
  if (c.transport >= 1) lines.push({ label: 'Getting to work', amount: Math.round(c.transport) });
  if (c.food >= 1) lines.push({ label: 'Food on the job', amount: Math.round(c.food) });
  if (c.other != null && c.other >= 1) lines.push({ label: 'Other work costs', amount: Math.round(c.other) });
  return lines;
}

// The requirements in prose — never the raw gate numbers. Names the credential and a
// nod to experience without quoting a 0–1 score (S3).
function requirementsText(posting: JobPosting): string {
  const parts: string[] = [];
  if (posting.minCredential && posting.minCredential !== 'NONE') {
    const cred =
      posting.minCredential === 'CERTIFICATE'
        ? 'a skills certificate'
        : posting.minCredential === 'ASSOCIATE'
          ? 'an associate degree'
          : posting.minCredential === 'DEGREE'
            ? 'a degree'
            : "a master's";
    parts.push(`asks for ${cred}`);
  }
  if (posting.minExperience != null && posting.minExperience > 0) {
    parts.push('wants someone who has done the work before');
  }
  if (parts.length === 0) return 'Open to anyone willing to put in the work.';
  return `It ${parts.join(' and ')}.`;
}

function stabilityText(posting: JobPosting): string {
  switch (posting.stability) {
    case 'STEADY':
      return 'Steady work, the same week in and week out.';
    case 'SEASONAL':
      return 'Seasonal — busy in its months, quiet in others.';
    case 'CASUAL':
      return 'Casual work, taken day to day.';
  }
}

function windowText(posting: JobPosting, world: WorldState): string {
  const monthsLeft = posting.surfacedMonth + posting.windowMonths - world.month;
  return monthsLeft <= 1 ? 'Hiring this month.' : 'The post is open for now.';
}

function toPostingDTO(posting: JobPosting, world: WorldState, currentId: string | undefined): JobPostingDTO {
  const grossPerMonth = jobMonthlyGross(posting);
  const costsPerMonth = attachedCostsTotal(posting.attachedCosts);
  return {
    id: posting.id,
    title: posting.title,
    industry: OCCUPATION_LABEL[posting.industry],
    pay: payText(posting),
    grossPerMonth,
    costs: costLines(posting),
    costsPerMonth,
    netPerMonth: grossPerMonth - costsPerMonth,
    requirements: requirementsText(posting),
    stability: stabilityText(posting),
    window: windowText(posting, world),
    current: posting.id === currentId,
  };
}

export function toJobsDTO(world: WorldState): JobsDTO {
  const p = world.player;
  const currentId = p.currentJob?.postingId;

  const postings = world.jobPostings
    .filter((j) => j.status === 'OPEN')
    .map((j) => toPostingDTO(j, world, currentId))
    .sort((a, b) => b.netPerMonth - a.netPerMonth);

  let held: JobsDTO['held'] = null;
  if (p.currentJob) {
    const costs = attachedCostsTotal(p.currentJob.attachedCosts);
    held = { title: p.currentJob.title, netPerMonth: Math.round(p.monthlyIncome) - costs };
  }

  return { held, postings };
}

// POST /saves/:id/jobs/:jobId/take — confirm taking a job, with the player's own
// money facts and a short in-voice acknowledgement.
export function toTakeJobResultDTO(result: TakeJobResult, acknowledgement: string): TakeJobResultDTO {
  return {
    postingId: result.posting.id,
    title: result.posting.title,
    grossPerMonth: result.monthlyGross,
    costsPerMonth: result.attachedCosts,
    netPerMonth: result.netPerMonth,
    acknowledgement,
  };
}
