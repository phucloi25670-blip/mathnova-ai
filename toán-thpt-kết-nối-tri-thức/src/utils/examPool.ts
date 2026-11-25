import {
  ChapterData,
  ExamPaper,
  ExamSourceLink,
  GradeLevel,
  QuizQuestion,
} from '../types';
import { CURRICULUM_CHAPTERS } from '../data/curriculum';
import { SEED_QUESTIONS } from '../data/seedQuestions';
import { fisherYatesShuffle } from './antiRepetition';
import { filterChaptersByGrade } from './curriculumFilter';
import {
  buildLocalCurriculumExam,
  partitionExamQuestions,
} from './examShuffler';
import {
  generateProceduralChapterQuestions,
  generateProceduralTrueFalseQuestions,
} from './proceduralQuiz';
import { replenishExamPoolApi } from './api';

export const EXAM_POOL_STORAGE_KEY = 'mathnova_exam_pool_v1';
export const EXAM_POOL_SIZE = 10;
export const EXAM_POOL_REFILL_THRESHOLD = 3;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PooledExamSlot {
  slotNumber: number; // 1..10
  used: boolean;
  exam: ExamPaper;
}

export interface GradeExamPool {
  grade: GradeLevel;
  slots: PooledExamSlot[];
  lastDrawnSlotNumber: number;
  lastRefilledAt: number;
  lastRefillMode: 'initial' | 'ai_internet' | 'auto_local' | 'auto_ai';
  lastModelUsed?: string;
  lastSources?: ExamSourceLink[];
}

export type ExamPoolStore = Partial<Record<GradeLevel, GradeExamPool>>;

export interface ExamPoolStatus {
  readyCount: number;
  totalCount: number;
  currentSlotNumber: number;
  needsBackgroundRefill: boolean;
  lastRefillMode: GradeExamPool['lastRefillMode'];
  lastModelUsed?: string;
}

function getSafeStorage(injected?: StorageLike | null): StorageLike | null {
  if (injected) return injected;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gradeOffset(grade: GradeLevel): number {
  switch (grade) {
    case '10':
      return 101;
    case '11':
      return 211;
    case '12':
      return 331;
    case 'thpt':
      return 443;
  }
}

export function shuffleExamQuestionsAndOptions(
  exam: ExamPaper,
  rng: () => number = Math.random
): ExamPaper {
  const { part1, part2, part3 } = partitionExamQuestions(exam.questions);

  const shuffledPart1 = fisherYatesShuffle(part1, rng).map((q) => {
    const origOpts = q.options && q.options.length === 4 ? q.options : ['', '', '', ''];
    const origCorrect =
      typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex < 4
        ? q.correctIndex
        : 0;
    const tagged = origOpts.map((text, idx) => ({
      text,
      isCorrect: idx === origCorrect,
    }));
    const mixed = fisherYatesShuffle(tagged, rng);
    const newCorrectIdx = mixed.findIndex((item) => item.isCorrect);
    return {
      ...q,
      options: mixed.map((m) => m.text),
      correctIndex: newCorrectIdx >= 0 ? newCorrectIdx : 0,
    };
  });

  const shuffledPart2 = fisherYatesShuffle(part2, rng).map((q) => {
    const origStmts = q.statements || [];
    const mixedStmts = fisherYatesShuffle(origStmts, rng).map((st, idx) => ({
      ...st,
      id: (['a', 'b', 'c', 'd'][idx] ?? 'a') as 'a' | 'b' | 'c' | 'd',
    }));
    return {
      ...q,
      statements: mixedStmts,
    };
  });

  const shuffledPart3 = fisherYatesShuffle(part3, rng).map((q) => ({ ...q }));

  return {
    ...exam,
    questions: [...shuffledPart1, ...shuffledPart2, ...shuffledPart3],
  };
}

function createDiverseSlotExam(params: {
  grade: GradeLevel;
  chapters: ChapterData[];
  slotNumber: number;
  generationNonce: number;
  mcCount?: number;
  tfCount?: number;
  saCount?: number;
  durationMinutes?: number;
}): ExamPaper {
  const { grade, chapters, slotNumber, generationNonce } = params;
  const rng = mulberry32(
    gradeOffset(grade) * 997 + slotNumber * 7919 + generationNonce * 104729
  );
  const mcCount = params.mcCount ?? 12;
  const tfCount = params.tfCount ?? 4;
  const saCount = params.saCount ?? 6;
  const durationMinutes = params.durationMinutes ?? 45;

  // Rotate focused chapters per slot so every slot emphasizes a distinct mix
  const rotatedChapters =
    chapters.length > 0
      ? chapters.map((_, idx) => chapters[(idx + slotNumber - 1) % chapters.length])
      : [];
  const focusSubset =
    rotatedChapters.length >= 3
      ? rotatedChapters.slice(0, Math.min(4, rotatedChapters.length)).map((c) => c.id)
      : undefined;

  const baseExam = buildLocalCurriculumExam({
    grade,
    chapters,
    selectedChapterIds: focusSubset,
    mcCount,
    tfCount,
    saCount,
    durationMinutes,
    rng,
  });

  // Replace or top up Part I (MC) and Part II (TF) with extra procedural variety unique to this slot
  const procTfBank = generateProceduralTrueFalseQuestions(grade, tfCount + 2, rng);
  const existingParts = partitionExamQuestions(baseExam.questions);

  const uniqueTf: QuizQuestion[] = [];
  const tfPrompts = new Set<string>();
  for (const q of [...procTfBank, ...existingParts.part2]) {
    if (uniqueTf.length >= tfCount) break;
    const key = q.prompt.trim();
    if (tfPrompts.has(key)) continue;
    tfPrompts.add(key);
    uniqueTf.push(q);
  }

  // Ensure Part I hits mcCount cleanly across all chapters
  const extraMcBank: QuizQuestion[] = [];
  for (const ch of fisherYatesShuffle(rotatedChapters, rng)) {
    extraMcBank.push(...generateProceduralChapterQuestions(ch, 4, rng));
  }
  const uniqueMc: QuizQuestion[] = [];
  const mcPrompts = new Set<string>();
  for (const q of [...existingParts.part1, ...extraMcBank]) {
    if (uniqueMc.length >= mcCount) break;
    const key = q.prompt.trim();
    if (mcPrompts.has(key)) continue;
    mcPrompts.add(key);
    uniqueMc.push(q);
  }

  // Ensure Part III hits saCount
  const saFallbackPool = SEED_QUESTIONS.filter((q) => q.format === 'short_answer');
  const uniqueSa: QuizQuestion[] = [];
  const saPrompts = new Set<string>();
  for (const q of [...existingParts.part3, ...fisherYatesShuffle(saFallbackPool, rng)]) {
    if (uniqueSa.length >= saCount) break;
    const key = q.prompt.trim();
    if (saPrompts.has(key)) continue;
    saPrompts.add(key);
    uniqueSa.push(q);
  }

  const gradeTitle =
    grade === 'thpt' ? 'Ôn thi Tốt nghiệp THPT' : `Toán Lớp ${grade}`;
  const focusTitle =
    rotatedChapters.length > 0
      ? rotatedChapters[0].title
      : 'Tổng hợp Kết nối tri thức';

  return {
    ...baseExam,
    id: `pool-${grade}-s${slotNumber}-${generationNonce}`,
    title: `Đề số #${slotNumber} · ${gradeTitle} (GDPT 2018)`,
    subtitle: `Trọng tâm: ${focusTitle} & tổng hợp liên chương · SGK Kết nối tri thức`,
    questions: [...uniqueMc, ...uniqueTf, ...uniqueSa],
    createdAt: Date.now(),
  };
}

export function buildInitialPoolForGrade(
  grade: GradeLevel,
  chapters: ChapterData[] = filterChaptersByGrade(CURRICULUM_CHAPTERS, grade),
  generationNonce = 1
): GradeExamPool {
  const safeChapters =
    chapters.length > 0 ? chapters : filterChaptersByGrade(CURRICULUM_CHAPTERS, grade);
  const slots: PooledExamSlot[] = [];
  for (let i = 1; i <= EXAM_POOL_SIZE; i++) {
    slots.push({
      slotNumber: i,
      used: false,
      exam: createDiverseSlotExam({
        grade,
        chapters: safeChapters,
        slotNumber: i,
        generationNonce,
      }),
    });
  }
  return {
    grade,
    slots,
    lastDrawnSlotNumber: 0,
    lastRefilledAt: Date.now(),
    lastRefillMode: 'initial',
  };
}

export function readExamPoolStore(storage?: StorageLike | null): ExamPoolStore {
  const store = getSafeStorage(storage);
  if (!store) return {};
  try {
    const raw = store.getItem(EXAM_POOL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ExamPoolStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeExamPoolStore(
  data: ExamPoolStore,
  storage?: StorageLike | null
): void {
  const store = getSafeStorage(storage);
  if (!store) return;
  try {
    store.setItem(EXAM_POOL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

export function ensureExamPoolForGrade(
  grade: GradeLevel,
  chapters?: ChapterData[],
  storage?: StorageLike | null
): GradeExamPool {
  const store = readExamPoolStore(storage);
  const existing = store[grade];
  if (
    existing &&
    Array.isArray(existing.slots) &&
    existing.slots.length === EXAM_POOL_SIZE &&
    existing.slots.every((s) => s && s.exam && Array.isArray(s.exam.questions) && s.exam.questions.length > 0)
  ) {
    return existing;
  }

  const fresh = buildInitialPoolForGrade(
    grade,
    chapters && chapters.length > 0
      ? chapters
      : filterChaptersByGrade(CURRICULUM_CHAPTERS, grade),
    1
  );
  store[grade] = fresh;
  writeExamPoolStore(store, storage);
  return fresh;
}

export function computePoolStatus(pool: GradeExamPool): ExamPoolStatus {
  const readyCount = pool.slots.filter((s) => !s.used).length;
  return {
    readyCount,
    totalCount: pool.slots.length,
    currentSlotNumber: pool.lastDrawnSlotNumber || 1,
    needsBackgroundRefill: readyCount < EXAM_POOL_REFILL_THRESHOLD,
    lastRefillMode: pool.lastRefillMode,
    lastModelUsed: pool.lastModelUsed,
  };
}

export function peekExamPoolStatus(
  grade: GradeLevel,
  chapters?: ChapterData[],
  storage?: StorageLike | null
): ExamPoolStatus {
  const pool = ensureExamPoolForGrade(grade, chapters, storage);
  return computePoolStatus(pool);
}

function tailorExamQuestions(
  rawExam: ExamPaper,
  params: {
    grade: GradeLevel;
    chapters: ChapterData[];
    selectedChapterIds?: string[];
    mcCount?: number;
    tfCount?: number;
    saCount?: number;
    durationMinutes?: number;
  },
  rng: () => number
): ExamPaper {
  const parts = partitionExamQuestions(rawExam.questions);
  const mcTarget = params.mcCount ?? (parts.part1.length || 6);
  const tfTarget = params.tfCount ?? (parts.part2.length || 2);
  const saTarget = params.saCount ?? (parts.part3.length || 2);

  let part1 = parts.part1;
  let part2 = parts.part2;
  let part3 = parts.part3;

  // If user selected specific chapters in Matrix Builder, blend/filter smoothly
  if (params.selectedChapterIds && params.selectedChapterIds.length > 0) {
    const selectedSet = new Set(params.selectedChapterIds);
    const matchingMc = part1.filter((q) => selectedSet.has(q.chapterId));
    const matchingTf = part2.filter((q) => selectedSet.has(q.chapterId));
    const matchingSa = part3.filter((q) => selectedSet.has(q.chapterId));

    const supplementary = buildLocalCurriculumExam({
      grade: params.grade,
      chapters: params.chapters,
      selectedChapterIds: params.selectedChapterIds,
      mcCount: mcTarget,
      tfCount: tfTarget,
      saCount: saTarget,
      durationMinutes: params.durationMinutes ?? rawExam.durationMinutes,
      rng,
    });
    const suppParts = partitionExamQuestions(supplementary.questions);

    part1 = [...matchingMc, ...suppParts.part1];
    part2 = [...matchingTf, ...suppParts.part2];
    part3 = [...matchingSa, ...suppParts.part3];
  }

  // Deduplicate prompts & trim to requested counts
  const dedupe = (list: QuizQuestion[], limit: number) => {
    const seen = new Set<string>();
    const out: QuizQuestion[] = [];
    for (const q of list) {
      if (out.length >= limit) break;
      const sig = q.prompt.trim();
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(q);
    }
    return out;
  };

  const finalMc = dedupe(part1, mcTarget);
  const finalTf = dedupe(part2, tfTarget);
  const finalSa = dedupe(part3, saTarget);

  const shuffled = shuffleExamQuestionsAndOptions(
    {
      ...rawExam,
      durationMinutes: params.durationMinutes ?? rawExam.durationMinutes,
      questions: [...finalMc, ...finalTf, ...finalSa],
    },
    rng
  );

  return shuffled;
}

export function drawNextExamFromPool(params: {
  grade: GradeLevel;
  chapters?: ChapterData[];
  selectedChapterIds?: string[];
  mcCount?: number;
  tfCount?: number;
  saCount?: number;
  durationMinutes?: number;
  excludeExamId?: string;
  storage?: StorageLike | null;
  rng?: () => number;
}): { exam: ExamPaper; status: ExamPoolStatus } {
  const safeChapters =
    params.chapters && params.chapters.length > 0
      ? params.chapters
      : filterChaptersByGrade(CURRICULUM_CHAPTERS, params.grade);
  const rng = params.rng ?? Math.random;
  const store = readExamPoolStore(params.storage);
  let pool = ensureExamPoolForGrade(params.grade, safeChapters, params.storage);

  const totalSlots = pool.slots.length;
  const startIdx =
    totalSlots > 0 && pool.lastDrawnSlotNumber > 0
      ? pool.lastDrawnSlotNumber % totalSlots
      : 0;

  let nextIdx = -1;
  for (let offset = 0; offset < totalSlots; offset++) {
    const idx = (startIdx + offset) % totalSlots;
    const candidate = pool.slots[idx];
    if (
      !candidate.used &&
      (!params.excludeExamId || candidate.exam.id !== params.excludeExamId)
    ) {
      nextIdx = idx;
      break;
    }
  }
  if (nextIdx === -1) {
    for (let offset = 0; offset < totalSlots; offset++) {
      const idx = (startIdx + offset) % totalSlots;
      if (!pool.slots[idx].used) {
        nextIdx = idx;
        break;
      }
    }
  }
  if (nextIdx === -1) {
    // All 10 were consumed -> synchronously generate 10 brand new exams first
    pool = buildInitialPoolForGrade(
      params.grade,
      safeChapters,
      Math.floor(Date.now() % 100000) + 7
    );
    pool.lastRefillMode = 'auto_local';
    nextIdx = 0;
  }

  const chosenSlot = pool.slots[nextIdx];
  pool.slots[nextIdx] = { ...chosenSlot, used: true };
  pool.lastDrawnSlotNumber = chosenSlot.slotNumber;

  store[params.grade] = pool;
  writeExamPoolStore(store, params.storage);

  const tailored = tailorExamQuestions(
    chosenSlot.exam,
    {
      grade: params.grade,
      chapters: safeChapters,
      selectedChapterIds: params.selectedChapterIds,
      mcCount: params.mcCount,
      tfCount: params.tfCount,
      saCount: params.saCount,
      durationMinutes: params.durationMinutes,
    },
    rng
  );

  return {
    exam: tailored,
    status: computePoolStatus(pool),
  };
}

export function drawGameQuestionPackFromPool(params: {
  grade: GradeLevel;
  chapters?: ChapterData[];
  selectedChapterId?: string;
  storage?: StorageLike | null;
  rng?: () => number;
}): {
  mcQuestions: QuizQuestion[];
  tfQuestions: QuizQuestion[];
  saQuestions: QuizQuestion[];
  allQuestions: QuizQuestion[];
  status: ExamPoolStatus;
} {
  const selectedChapterIds =
    params.selectedChapterId && params.selectedChapterId !== 'all'
      ? [params.selectedChapterId]
      : undefined;

  const { exam, status } = drawNextExamFromPool({
    grade: params.grade,
    chapters: params.chapters,
    selectedChapterIds,
    mcCount: 12,
    tfCount: 4,
    saCount: 4,
    storage: params.storage,
    rng: params.rng,
  });

  const parts = partitionExamQuestions(exam.questions);
  return {
    mcQuestions: parts.part1,
    tfQuestions: parts.part2,
    saQuestions: parts.part3,
    allQuestions: exam.questions,
    status,
  };
}

export function replenishPoolWithLocalRefill(params: {
  grade: GradeLevel;
  chapters?: ChapterData[];
  onlyUnusedSlots?: boolean;
  storage?: StorageLike | null;
}): { pool: GradeExamPool; status: ExamPoolStatus } {
  const safeChapters =
    params.chapters && params.chapters.length > 0
      ? params.chapters
      : filterChaptersByGrade(CURRICULUM_CHAPTERS, params.grade);
  const store = readExamPoolStore(params.storage);
  const current = ensureExamPoolForGrade(params.grade, safeChapters, params.storage);
  const nonce = Math.floor((Date.now() % 100000) + Math.random() * 1000);

  const nextSlots: PooledExamSlot[] = current.slots.map((slot) => {
    if (params.onlyUnusedSlots && !slot.used) {
      return slot;
    }
    return {
      slotNumber: slot.slotNumber,
      used: false,
      exam: createDiverseSlotExam({
        grade: params.grade,
        chapters: safeChapters,
        slotNumber: slot.slotNumber,
        generationNonce: nonce + slot.slotNumber,
      }),
    };
  });

  const updated: GradeExamPool = {
    ...current,
    slots: nextSlots,
    lastRefilledAt: Date.now(),
    lastRefillMode: 'auto_local',
  };
  store[params.grade] = updated;
  writeExamPoolStore(store, params.storage);
  return { pool: updated, status: computePoolStatus(updated) };
}

function buildAiDistributedPool(params: {
  grade: GradeLevel;
  chapters: ChapterData[];
  aiQuestions: QuizQuestion[];
  sources: ExamSourceLink[];
  modelUsed?: string;
  onlyUsedSlots?: boolean;
  existingPool?: GradeExamPool;
}): GradeExamPool {
  const { grade, chapters, aiQuestions, sources, modelUsed } = params;
  const aiParts = partitionExamQuestions(aiQuestions);
  const nonce = Math.floor(Date.now() % 100000) + 19;

  const baseSlots: PooledExamSlot[] = [];
  for (let i = 1; i <= EXAM_POOL_SIZE; i++) {
    const existingSlot = params.existingPool?.slots[i - 1];
    if (params.onlyUsedSlots && existingSlot && !existingSlot.used) {
      baseSlots.push(existingSlot);
      continue;
    }

    // Start with procedural/curated base then layer unique AI-grounded questions on top
    const localBase = createDiverseSlotExam({
      grade,
      chapters,
      slotNumber: i,
      generationNonce: nonce + i * 3,
    });
    const localParts = partitionExamQuestions(localBase.questions);

    // Pick rotated slice of AI questions for this slot so every slot gets fresh AI content
    const slotAiMc: QuizQuestion[] = [];
    for (let k = 0; k < Math.min(4, aiParts.part1.length); k++) {
      const candidate = aiParts.part1[(i - 1 + k * 2) % aiParts.part1.length];
      if (candidate && !slotAiMc.some((x) => x.prompt === candidate.prompt)) {
        slotAiMc.push({ ...candidate, id: `ai-s${i}-${k}-${candidate.id}` });
      }
    }

    const slotAiTf: QuizQuestion[] = [];
    if (aiParts.part2.length > 0) {
      const tfCandidate = aiParts.part2[(i - 1) % aiParts.part2.length];
      if (tfCandidate) {
        slotAiTf.push({ ...tfCandidate, id: `ai-tf-s${i}-${tfCandidate.id}` });
      }
    }

    const slotAiSa: QuizQuestion[] = [];
    if (aiParts.part3.length > 0) {
      const saCandidate = aiParts.part3[(i - 1) % aiParts.part3.length];
      if (saCandidate) {
        slotAiSa.push({ ...saCandidate, id: `ai-sa-s${i}-${saCandidate.id}` });
      }
    }

    const mergedMc = [...slotAiMc, ...localParts.part1].slice(0, 12);
    const mergedTf = [...slotAiTf, ...localParts.part2].slice(0, 4);
    const mergedSa = [...slotAiSa, ...localParts.part3].slice(0, 6);

    const hasAi = slotAiMc.length > 0 || slotAiTf.length > 0 || slotAiSa.length > 0;
    const gradeTitle =
      grade === 'thpt' ? 'Ôn thi Tốt nghiệp THPT' : `Toán Lớp ${grade}`;

    baseSlots.push({
      slotNumber: i,
      used: false,
      exam: {
        ...localBase,
        id: `pool-ai-${grade}-s${i}-${nonce}`,
        title: `Đề số #${i} · ${gradeTitle} (AI + Internet)`,
        subtitle: hasAi
          ? `Đã cập nhật câu hỏi mới từ Internet & chuẩn hóa GDPT 2018 (${modelUsed || 'gemini-3.8-flash'})`
          : localBase.subtitle,
        sourceType: hasAi ? 'search' : 'local',
        sources: hasAi ? sources : [],
        modelUsed: hasAi ? modelUsed : undefined,
        questions: [...mergedMc, ...mergedTf, ...mergedSa],
        createdAt: Date.now(),
      },
    });
  }

  return {
    grade,
    slots: baseSlots,
    lastDrawnSlotNumber: params.onlyUsedSlots
      ? params.existingPool?.lastDrawnSlotNumber ?? 0
      : 0,
    lastRefilledAt: Date.now(),
    lastRefillMode: params.onlyUsedSlots ? 'auto_ai' : 'ai_internet',
    lastModelUsed: modelUsed,
    lastSources: sources,
  };
}

const activeBackgroundRefills = new Set<GradeLevel>();

/**
 * Explicit user-triggered refresh ('🔄 Nạp mới 10 đề từ AI / Internet').
 * Uses gemini-3.8-flash (auto-fallback chain) + googleSearch; gracefully falls back to
 * fresh local generation if offline/no API key so user always gets 10/10 fresh exams.
 */
export async function replenishExamPoolWithAiOrLocal(params: {
  grade: GradeLevel;
  chapters?: ChapterData[];
  onFallbackStatus?: (msg: string) => void;
  storage?: StorageLike | null;
}): Promise<{
  status: ExamPoolStatus;
  usedAi: boolean;
  modelUsed?: string;
  sources: ExamSourceLink[];
}> {
  const safeChapters =
    params.chapters && params.chapters.length > 0
      ? params.chapters
      : filterChaptersByGrade(CURRICULUM_CHAPTERS, params.grade);

  try {
    const res = await replenishExamPoolApi({
      grade: params.grade,
      chapterTitles: safeChapters.slice(0, 5).map((c) => c.title),
      mcPerExam: 12,
      tfPerExam: 4,
      saPerExam: 6,
      durationMinutes: 45,
      seedHint: `Làm mới kho 10 đề lúc ${new Date().toISOString()}`,
      onFallbackStatus: params.onFallbackStatus,
    });

    const store = readExamPoolStore(params.storage);
    const updated = buildAiDistributedPool({
      grade: params.grade,
      chapters: safeChapters,
      aiQuestions: res.questions,
      sources: res.sources || [],
      modelUsed: res.modelUsed,
    });
    store[params.grade] = updated;
    writeExamPoolStore(store, params.storage);
    return {
      status: computePoolStatus(updated),
      usedAi: true,
      modelUsed: res.modelUsed,
      sources: res.sources || [],
    };
  } catch {
    const { status } = replenishPoolWithLocalRefill({
      grade: params.grade,
      chapters: safeChapters,
      onlyUnusedSlots: false,
      storage: params.storage,
    });
    return {
      status,
      usedAi: false,
      sources: [],
    };
  }
}

/**
 * Silent Background Auto-Refill triggered automatically whenever remaining ready exams < 3.
 * Never throws or blocks UI; tries AI silently first, then falls back cleanly to local replenishment.
 */
export async function backgroundRefillExamPool(params: {
  grade: GradeLevel;
  chapters?: ChapterData[];
  onCompleted?: (status: ExamPoolStatus) => void;
  storage?: StorageLike | null;
}): Promise<ExamPoolStatus> {
  if (activeBackgroundRefills.has(params.grade)) {
    return peekExamPoolStatus(params.grade, params.chapters, params.storage);
  }
  activeBackgroundRefills.add(params.grade);

  const safeChapters =
    params.chapters && params.chapters.length > 0
      ? params.chapters
      : filterChaptersByGrade(CURRICULUM_CHAPTERS, params.grade);

  try {
    const existing = ensureExamPoolForGrade(params.grade, safeChapters, params.storage);
    const res = await replenishExamPoolApi({
      grade: params.grade,
      chapterTitles: safeChapters.slice(0, 5).map((c) => c.title),
      seedHint: `Auto-refill background batch ${Date.now()}`,
    });

    const store = readExamPoolStore(params.storage);
    const updated = buildAiDistributedPool({
      grade: params.grade,
      chapters: safeChapters,
      aiQuestions: res.questions,
      sources: res.sources || [],
      modelUsed: res.modelUsed,
      onlyUsedSlots: true,
      existingPool: existing,
    });
    store[params.grade] = updated;
    writeExamPoolStore(store, params.storage);
    const status = computePoolStatus(updated);
    params.onCompleted?.(status);
    return status;
  } catch {
    const { status } = replenishPoolWithLocalRefill({
      grade: params.grade,
      chapters: safeChapters,
      onlyUnusedSlots: true,
      storage: params.storage,
    });
    params.onCompleted?.(status);
    return status;
  } finally {
    activeBackgroundRefills.delete(params.grade);
  }
}
