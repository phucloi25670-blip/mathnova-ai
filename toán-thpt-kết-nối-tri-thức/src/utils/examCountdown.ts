export const EXAM_DATES_STORAGE_KEY = 'mathnova_exam_dates_v3';

export interface ExamMilestone {
  id: 'thpt2027' | 'semester' | 'hanoi2027' | 'tphcm2027';
  shortLabel: string;
  name: string;
  date: string;
}

export const DEFAULT_EXAM_MILESTONES: ExamMilestone[] = [
  {
    id: 'thpt2027',
    shortLabel: 'THPTQG 2027',
    name: 'Kỳ thi Tốt nghiệp THPT Quốc gia 2027',
    date: '2027-06-10T07:30:00+07:00',
  },
  {
    id: 'semester',
    shortLabel: 'Học kỳ II',
    name: 'Kiểm tra Học kỳ II (2026-2027)',
    date: '2027-04-19T07:30:00+07:00',
  },
  {
    id: 'hanoi2027',
    shortLabel: 'ĐGNL HN',
    name: 'ĐGNL ĐHQG Hà Nội (HSA) 2027',
    date: '2027-03-13T07:30:00+07:00',
  },
  {
    id: 'tphcm2027',
    shortLabel: 'ĐGNL TP.HCM',
    name: 'ĐGNL ĐHQG TP.HCM 2027 (Đợt 1)',
    date: '2027-03-28T07:30:00+07:00',
  },
];

export function loadSavedExamDates(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(EXAM_DATES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const clean: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string' && !Number.isNaN(new Date(val).getTime())) {
        clean[key] = val;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveExamDates(dates: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(EXAM_DATES_STORAGE_KEY, JSON.stringify(dates));
    window.dispatchEvent(new CustomEvent('mathnova:exam-dates-updated'));
  } catch {
    // Ignore storage quota errors
  }
}

export function getExamTargetDate(
  examId: ExamMilestone['id'],
  customDates: Record<string, string> = loadSavedExamDates()
): string {
  if (customDates[examId]) {
    return customDates[examId];
  }
  const found = DEFAULT_EXAM_MILESTONES.find((m) => m.id === examId);
  return found ? found.date : DEFAULT_EXAM_MILESTONES[0].date;
}

export function calculateDaysRemainingBadge(
  targetIso: string,
  nowMs: number = Date.now()
): number {
  const targetMs = new Date(targetIso).getTime();
  const diff = targetMs - nowMs;
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function calculateCountdownParts(
  targetIso: string,
  nowMs: number = Date.now()
): { days: number; hours: number; mins: number; secs: number; isPast: boolean } {
  const targetMs = new Date(targetIso).getTime();
  const diff = targetMs - nowMs;
  if (diff <= 0) {
    return { days: 0, hours: 0, mins: 0, secs: 0, isPast: true };
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const secs = Math.floor((diff / 1000) % 60);
  return { days, hours, mins, secs, isPast: false };
}
