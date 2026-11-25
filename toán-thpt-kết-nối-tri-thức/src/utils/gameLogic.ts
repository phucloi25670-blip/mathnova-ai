import { TrueFalseStatement } from '../types';

/**
 * Official GDPT 2018 (2025+) True/False 4-statement scoring rule:
 * - 1 correct sub-item: 0.10 points
 * - 2 correct sub-items: 0.25 points
 * - 3 correct sub-items: 0.50 points
 * - 4 correct sub-items: 1.00 point
 */
export function scoreTrueFalseStatements(
  statements: TrueFalseStatement[],
  userAnswers: Record<'a' | 'b' | 'c' | 'd', boolean | null>
): { correctCount: number; points: number; xpEarned: number } {
  let correctCount = 0;
  for (const stmt of statements) {
    if (userAnswers[stmt.id] === stmt.isTrue) {
      correctCount += 1;
    }
  }

  let points = 0;
  if (correctCount === 1) points = 0.1;
  else if (correctCount === 2) points = 0.25;
  else if (correctCount === 3) points = 0.5;
  else if (correctCount === 4) points = 1.0;

  const xpEarned = Math.round(points * 40);
  return { correctCount, points, xpEarned };
}

/**
 * Parses numeric or fraction string (supports Vietnamese comma decimals like "1,25" or fractions "3/4").
 */
export function parseNumericAnswer(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s+/g, '').replace(/,/g, '.');
  if (!cleaned) return null;

  if (/^[+-]?\d+(\.\d+)?\/[+-]?\d+(\.\d+)?$/.test(cleaned)) {
    const [numStr, denStr] = cleaned.split('/');
    const num = Number(numStr);
    const den = Number(denStr);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return num / den;
  }

  const val = Number(cleaned);
  return Number.isFinite(val) ? val : null;
}

export function isShortAnswerCorrect(
  userInput: string,
  expectedAnswer: string,
  tolerance = 0.01
): boolean {
  const trimmedUser = userInput.trim().toLowerCase().replace(/\s+/g, '');
  const trimmedExpected = expectedAnswer.trim().toLowerCase().replace(/\s+/g, '');

  if (!trimmedUser) return false;
  if (trimmedUser === trimmedExpected) return true;

  const userNum = parseNumericAnswer(userInput);
  const expectedNum = parseNumericAnswer(expectedAnswer);
  if (userNum !== null && expectedNum !== null) {
    return Math.abs(userNum - expectedNum) <= tolerance;
  }

  return false;
}

export function computeUpdatedStreak(
  currentStreak: number,
  lastActiveDate: string,
  todayDate: string
): { streak: number; lastActiveDate: string } {
  if (!lastActiveDate) {
    return { streak: 1, lastActiveDate: todayDate };
  }
  if (lastActiveDate === todayDate) {
    return { streak: Math.max(1, currentStreak), lastActiveDate: todayDate };
  }

  const prev = new Date(`${lastActiveDate}T00:00:00Z`).getTime();
  const curr = new Date(`${todayDate}T00:00:00Z`).getTime();
  const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    return { streak: currentStreak + 1, lastActiveDate: todayDate };
  }
  return { streak: 1, lastActiveDate: todayDate };
}

export function calculateSprintXp(
  correctCount: number,
  maxCombo: number
): number {
  return correctCount * 15 + Math.max(0, maxCombo - 1) * 5;
}

export interface DailyProgressPoint {
  date: string;
  label: string;
  xp: number;
  heightPct: number;
  isToday: boolean;
}

const DAY_LABELS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function buildWeeklyProgressSeries(
  dailyXp: Record<string, number> | undefined,
  todayDate: string
): DailyProgressPoint[] {
  const baseDate = new Date(`${todayDate}T00:00:00Z`);
  const points: Array<{ date: string; label: string; xp: number; isToday: boolean }> = [];

  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(baseDate.getTime() - offset * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const iso = `${y}-${m}-${day}`;
    const label = offset === 0 ? 'Hôm nay' : DAY_LABELS_VI[d.getUTCDay()];
    const xp = Math.max(0, dailyXp?.[iso] ?? 0);
    points.push({ date: iso, label, xp, isToday: offset === 0 });
  }

  const maxXp = Math.max(50, ...points.map((p) => p.xp));
  return points.map((p) => ({
    ...p,
    heightPct: p.xp === 0 ? 8 : Math.max(14, Math.round((p.xp / maxXp) * 100)),
  }));
}
