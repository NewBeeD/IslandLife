// Game-calendar helpers. The simulation counts months from 0; the player reads a
// real date. Month 0 is January of START_YEAR. These are shared so the server
// projection, the narrative engine, and the web client all label dates identically.

export const START_YEAR = 2024;

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export interface GameDate {
  year: number;
  monthIndex: number; // 0–11
  monthName: string;
  label: string; // "October 2027"
}

export function gameDate(month: number): GameDate {
  const monthIndex = ((month % 12) + 12) % 12;
  const year = START_YEAR + Math.floor(month / 12);
  const monthName = MONTH_NAMES[monthIndex]!;
  return { year, monthIndex, monthName, label: `${monthName} ${year}` };
}

export function gameDateLabel(month: number): string {
  return gameDate(month).label;
}
