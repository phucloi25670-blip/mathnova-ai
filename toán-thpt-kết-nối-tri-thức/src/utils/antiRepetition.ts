import { ChapterData, GradeLevel, MatchPair, QuizQuestion } from '../types';
import { getChapterRoadmapMeta } from '../data/roadmapMeta';

const SEEN_STORAGE_KEY = 'toanthpt_seen_questions_v1';
const QUEUE_STORAGE_KEY = 'toanthpt_shuffle_queues_v1';
const MAX_SEEN_HISTORY = 60;

export interface DiversitySeed {
  gradeTag: '10' | '11' | '12';
  chapterTitle: string;
  subtopic: string;
  paramHint: string;
}

interface ShuffleQueueState {
  order: string[];
  cursor: number;
  lastDrawnId?: string;
}

// In-memory fallback for environments without sessionStorage (e.g. Node unit tests)
const memorySeenStore: string[] = [];
const memoryQueueStore: Record<string, ShuffleQueueState> = {};

function hasSessionStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Unbiased Fisher-Yates shuffle returning a new array.
 */
export function fisherYatesShuffle<T>(
  items: readonly T[],
  rng: () => number = Math.random
): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function readAllQueues(): Record<string, ShuffleQueueState> {
  if (!hasSessionStorage()) {
    return { ...memoryQueueStore };
  }
  try {
    const raw = window.sessionStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ShuffleQueueState>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllQueues(queues: Record<string, ShuffleQueueState>): void {
  if (!hasSessionStorage()) {
    if (queues === memoryQueueStore) return;
    Object.keys(memoryQueueStore).forEach((k) => delete memoryQueueStore[k]);
    Object.assign(memoryQueueStore, queues);
    return;
  }
  try {
    window.sessionStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queues));
  } catch {
    // ignore quota issues
  }
}

export function clearShuffleQueues(): void {
  if (!hasSessionStorage()) {
    Object.keys(memoryQueueStore).forEach((k) => delete memoryQueueStore[k]);
    return;
  }
  try {
    window.sessionStorage.removeItem(QUEUE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function buildFreshShuffledOrder(
  ids: string[],
  avoidFirstId: string | undefined,
  rng: () => number
): string[] {
  const shuffled = fisherYatesShuffle(ids, rng);
  if (shuffled.length > 1 && avoidFirstId && shuffled[0] === avoidFirstId) {
    const swapIdx = 1 + Math.floor(rng() * (shuffled.length - 1));
    [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
  }
  return shuffled;
}

/**
 * Smart Shuffle Queue:
 * Shuffles the entire question pool using Fisher-Yates and draws sequentially
 * until every item has been served once before starting a newly shuffled cycle.
 */
export function drawFromShuffleQueue<T extends { id: string }>(
  queueKey: string,
  pool: readonly T[],
  drawCount: number,
  rng: () => number = Math.random
): T[] {
  if (pool.length === 0 || drawCount <= 0) return [];

  const poolMap = new Map<string, T>();
  const validIds: string[] = [];
  for (const item of pool) {
    if (!poolMap.has(item.id)) {
      poolMap.set(item.id, item);
      validIds.push(item.id);
    }
  }

  const targetCount = Math.min(drawCount, validIds.length);
  const allQueues = readAllQueues();
  let state = allQueues[queueKey];

  const validIdSet = new Set(validIds);
  const hasSameSet =
    state &&
    Array.isArray(state.order) &&
    state.order.length === validIds.length &&
    state.order.every((id) => validIdSet.has(id));

  if (!hasSameSet) {
    state = {
      order: buildFreshShuffledOrder(validIds, undefined, rng),
      cursor: 0,
    };
  }

  const drawnIds: string[] = [];
  const drawnSet = new Set<string>();

  while (drawnIds.length < targetCount) {
    if (state.cursor >= state.order.length) {
      state = {
        order: buildFreshShuffledOrder(validIds, state.lastDrawnId, rng),
        cursor: 0,
        lastDrawnId: state.lastDrawnId,
      };
    }

    const nextId = state.order[state.cursor];
    state.cursor += 1;
    if (!drawnSet.has(nextId)) {
      drawnIds.push(nextId);
      drawnSet.add(nextId);
      state.lastDrawnId = nextId;
    }
  }

  allQueues[queueKey] = state;
  writeAllQueues(allQueues);

  return drawnIds
    .map((id) => poolMap.get(id))
    .filter((item): item is T => Boolean(item));
}

/**
 * Compact normalized summary of a question or matching pair for AI anti-repetition prompts.
 */
export function extractQuestionSignature(q: QuizQuestion): string {
  const cleanPrompt = q.prompt
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 110);
  const topic = q.chapterTitle ? `${q.chapterTitle}: ` : '';
  return `[Lớp ${q.grade}] ${topic}${cleanPrompt}`;
}

export function extractPairSignature(pair: MatchPair): string {
  return `Ghép thẻ: ${pair.leftTitle} (${pair.rightLatex.slice(0, 60)})`;
}

export function getSeenQuestionHistory(): string[] {
  if (!hasSessionStorage()) {
    return [...memorySeenStore];
  }
  try {
    const raw = window.sessionStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function recordSeenQuestions(
  questions: readonly QuizQuestion[],
  pairs: readonly MatchPair[] = []
): string[] {
  const incoming = [
    ...questions.map(extractQuestionSignature),
    ...pairs.map(extractPairSignature),
  ];
  const existing = getSeenQuestionHistory();
  const seenSet = new Set(existing);
  const merged = [...existing];

  for (const sig of incoming) {
    if (sig && !seenSet.has(sig)) {
      seenSet.add(sig);
      merged.push(sig);
    }
  }

  const trimmed = merged.slice(-MAX_SEEN_HISTORY);

  if (!hasSessionStorage()) {
    memorySeenStore.splice(0, memorySeenStore.length, ...trimmed);
    return trimmed;
  }

  try {
    window.sessionStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore quota issues
  }
  return trimmed;
}

export function clearSeenQuestionHistory(): void {
  if (!hasSessionStorage()) {
    memorySeenStore.splice(0, memorySeenStore.length);
    return;
  }
  try {
    window.sessionStorage.removeItem(SEEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const CONTEXT_THEMES = [
  'vật lí chuyển động / vận tốc',
  'tài chính ngân hàng / lãi kép / tối ưu chi phí',
  'kiến trúc / đo đạc thực địa / xây dựng',
  'cảm biến IoT / trạm phát sóng không gian Oxyz',
  'xác suất y tế / kiểm định chất lượng sản phẩm',
  'thủy triều / sóng âm / dao động điều hòa',
  'thống kê dữ liệu điểm thi / doanh thu cửa hàng',
  'quy hoạch sản xuất / tối ưu lợi nhuận xưởng',
];

function buildRandomParamHint(rng: () => number): string {
  const randInt = (min: number, max: number) =>
    min + Math.floor(rng() * (max - min + 1));
  const a = randInt(2, 9);
  const b = randInt(-8, 12) || 3;
  const c = randInt(1, 15);
  const p = randInt(15, 85) / 100;
  const xStart = randInt(0, 3);
  const xEnd = xStart + randInt(2, 6);
  const theme = CONTEXT_THEMES[Math.floor(rng() * CONTEXT_THEMES.length)];
  return `Hệ số ngẫu nhiên (a=${a}, b=${b}, c=${c}, đoạn [${xStart}; ${xEnd}], tỉ lệ p=${p.toFixed(2)}), bối cảnh: ${theme}`;
}

/**
 * Picks randomized non-consecutive sub-topics and arithmetic parameters before calling Gemini AI,
 * guaranteeing consecutive questions target different problem sub-types and fresh numbers.
 * When grade === 'thpt' and selectedChapterId === 'all', enforces 10% Lớp 10 / 20% Lớp 11 / 70% Lớp 12.
 */
export function buildDiversitySeeds(params: {
  grade: GradeLevel;
  selectedChapterId: string;
  allChapters: readonly ChapterData[];
  count: number;
  rng?: () => number;
}): DiversitySeed[] {
  const { grade, selectedChapterId, allChapters, count, rng = Math.random } = params;
  if (count <= 0) return [];

  const targetChapter =
    selectedChapterId !== 'all'
      ? allChapters.find((c) => c.id === selectedChapterId)
      : undefined;

  type CandidateSlot = {
    gradeTag: '10' | '11' | '12';
    chapterTitle: string;
    subtopic: string;
  };

  const expandChapterSlots = (chs: readonly ChapterData[]): CandidateSlot[] => {
    const slots: CandidateSlot[] = [];
    for (const ch of chs) {
      const meta = getChapterRoadmapMeta(ch.id);
      for (const topic of meta.topics) {
        slots.push({
          gradeTag: ch.grade,
          chapterTitle: ch.title,
          subtopic: topic,
        });
      }
    }
    return slots;
  };

  let orderedSlots: CandidateSlot[] = [];

  if (targetChapter) {
    orderedSlots = fisherYatesShuffle(expandChapterSlots([targetChapter]), rng);
  } else if (grade === 'thpt') {
    const g10Slots = fisherYatesShuffle(
      expandChapterSlots(allChapters.filter((c) => c.grade === '10')),
      rng
    );
    const g11Slots = fisherYatesShuffle(
      expandChapterSlots(allChapters.filter((c) => c.grade === '11')),
      rng
    );
    const g12Slots = fisherYatesShuffle(
      expandChapterSlots(allChapters.filter((c) => c.grade === '12')),
      rng
    );

    const n10 = count >= 3 ? Math.max(1, Math.round(count * 0.1)) : 0;
    const n11 = count >= 3 ? Math.max(1, Math.round(count * 0.2)) : 0;
    const n12 = Math.max(1, count - n10 - n11);

    const picked = [
      ...g10Slots.slice(0, n10),
      ...g11Slots.slice(0, n11),
      ...g12Slots.slice(0, n12),
    ];
    orderedSlots = fisherYatesShuffle(picked, rng);
  } else {
    orderedSlots = fisherYatesShuffle(
      expandChapterSlots(allChapters.filter((c) => c.grade === grade)),
      rng
    );
  }

  if (orderedSlots.length === 0) {
    return [];
  }

  const result: DiversitySeed[] = [];
  let lastSubtopic = '';
  let cursor = 0;

  for (let i = 0; i < count; i++) {
    if (cursor >= orderedSlots.length) {
      orderedSlots = fisherYatesShuffle(orderedSlots, rng);
      cursor = 0;
    }

    let chosen = orderedSlots[cursor];
    cursor += 1;

    // Avoid consecutive duplicate subtopics when >= 2 distinct subtopics exist
    if (orderedSlots.length > 1 && chosen.subtopic === lastSubtopic) {
      const altIdx = orderedSlots.findIndex((s) => s.subtopic !== lastSubtopic);
      if (altIdx !== -1) {
        chosen = orderedSlots[altIdx];
      }
    }

    lastSubtopic = chosen.subtopic;
    result.push({
      ...chosen,
      paramHint: buildRandomParamHint(rng),
    });
  }

  return result;
}
