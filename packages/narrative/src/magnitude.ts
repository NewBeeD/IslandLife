import type { MagnitudeContext, PriceDirection } from '@island/shared';

// Raw simulation magnitudes — price deltas, percentages, scores — are never shown
// to the player. They become prose. Specific EC$ currency amounts are the
// deliberate exception (voice rule 4): a real life is counted in real money.
// Ported verbatim from the Narrative Generation doc (v1.2), including the
// exhaustive guard that throws rather than interpolate "undefined".
export function renderMagnitude(value: number, context: MagnitudeContext): string {
  // Price change magnitude
  if (context === 'PRICE_CHANGE') {
    if (value < 0.05) return 'barely moved';
    if (value < 0.12) return 'edged up';
    if (value < 0.2) return 'climbed noticeably';
    if (value < 0.35) return 'jumped sharply';
    return 'more than you have seen in years';
  }

  // Income change
  if (context === 'INCOME_CHANGE') {
    if (value < 0.05) return 'about the same as last month';
    if (value < 0.15) return 'a little better than usual';
    if (value < 0.3) return 'a strong month';
    return 'better than you expected';
  }

  // Time period
  if (context === 'DURATION') {
    const months = Math.round(value);
    if (months === 1) return 'last month';
    if (months < 4) return 'the past few months';
    if (months < 7) return 'the past several months';
    if (months < 13) return 'most of this year';
    const years = Math.round(months / 12);
    if (years === 1) return 'the past year';
    return `the past ${years} years`;
  }

  // Debt/loan size relative to monthly income
  if (context === 'LOAN_RELATIVE_SIZE') {
    const monthsOfIncome = value;
    if (monthsOfIncome < 2) return 'manageable';
    if (monthsOfIncome < 5) return 'significant';
    if (monthsOfIncome < 10) return 'serious';
    return 'heavy';
  }

  // Exhaustive guard: every MagnitudeContext is handled above. If a new context
  // is added without a branch, fail loudly rather than interpolate "undefined"
  // into player-facing prose.
  throw new Error(`renderMagnitude: unhandled context "${context}"`);
}

// EC$ amounts ARE shown (voice rule 4). Always written with the EC$ prefix and
// grouped thousands — never a bare "$" (the validator rejects that).
export function formatCurrency(value: number): string {
  return `EC$${Math.round(value).toLocaleString('en-US')}`;
}

// A price series → a qualitative direction word for the prose. Compares the most
// recent price to a few months back so a single noisy month doesn't read as a trend.
export function priceDirectionFromHistory(history: readonly number[]): PriceDirection {
  if (history.length < 2) return 'holding steady';
  const last = history[history.length - 1]!;
  const ref = history[Math.max(0, history.length - 4)]!;
  const change = (last - ref) / ref;
  if (change > 0.04) return 'up';
  if (change < -0.04) return 'down';
  return 'holding steady';
}

// Magnitude of recent price movement (absolute fraction vs a few months back).
export function priceChangeMagnitude(history: readonly number[]): number {
  if (history.length < 2) return 0;
  const last = history[history.length - 1]!;
  const ref = history[Math.max(0, history.length - 4)]!;
  return Math.abs((last - ref) / ref);
}
