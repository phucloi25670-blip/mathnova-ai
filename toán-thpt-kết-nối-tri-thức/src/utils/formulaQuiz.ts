import { ChapterData, GradeLevel, MatchPair, QuizQuestion } from '../types';
import { SEED_MATCH_PAIRS, SEED_QUESTIONS } from '../data/seedQuestions';
import {
  drawFromShuffleQueue,
  fisherYatesShuffle,
  getSeenQuestionHistory,
} from './antiRepetition';
import { generateProceduralChapterQuestions } from './proceduralQuiz';

/**
 * Combo multiplier progression for Đua Top 60 Giây:
 * - streak < 2 => x1
 * - streak 2..3 => x2
 * - streak >= 4 => x3
 */
export function getComboMultiplier(streak: number): 1 | 2 | 3 {
  if (streak >= 4) return 3;
  if (streak >= 2) return 2;
  return 1;
}

export function calculateMultiplierXp(basePoints: number, streakAfterAnswer: number): number {
  return basePoints * getComboMultiplier(streakAfterAnswer);
}

function buildStaticChapterQuestions(
  chapter: ChapterData,
  allChapters: ChapterData[],
  seedQuestions: QuizQuestion[],
  rng: () => number
): QuizQuestion[] {
  const formulaQuestions: QuizQuestion[] = [];
  const otherFormulas = allChapters
    .filter((c) => c.grade === chapter.grade && c.id !== chapter.id)
    .flatMap((c) => c.formulas);
  const fallbackPool = allChapters.flatMap((c) => c.formulas);

  chapter.formulas.forEach((target) => {
    const sameChapterOthers = chapter.formulas.filter((f) => f.id !== target.id);
    const distractorCandidates = [
      ...sameChapterOthers,
      ...otherFormulas,
      ...fallbackPool,
    ].filter(
      (f, pos, arr) =>
        f.id !== target.id &&
        f.latex !== target.latex &&
        arr.findIndex((x) => x.latex === f.latex) === pos
    );

    const distractors = fisherYatesShuffle(distractorCandidates, rng)
      .slice(0, 3)
      .map((d) => `$${d.latex}$`);
    if (distractors.length < 3) return;

    const correctOpt = `$${target.latex}$`;
    const shuffledOptions = fisherYatesShuffle([correctOpt, ...distractors], rng);
    const correctIndex = shuffledOptions.indexOf(correctOpt);

    formulaQuestions.push({
      id: `quick-${target.id}`,
      grade: chapter.grade,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      format: 'multiple_choice',
      prompt: `Biểu thức chuẩn cho **${target.title}** là công thức nào sau đây?`,
      options: shuffledOptions,
      correctIndex,
      explanation: `${target.description}${target.practicalNote ? ` (${target.practicalNote})` : ''}`,
    });
  });

  const matchingSeedMcqs = seedQuestions.filter(
    (q) => q.chapterId === chapter.id && q.format === 'multiple_choice'
  );

  return [...matchingSeedMcqs, ...formulaQuestions];
}

/**
 * Generates an instant 30-second recall quiz package (15 diverse questions by default)
 * for any chapter by mixing formula recall, chapter SEED MCQs, and randomized
 * procedural calculation problems (so even 2-formula chapters like 10-c2 get 15+ unique questions).
 */
export function buildChapterQuickQuiz(
  chapter: ChapterData,
  allChapters: ChapterData[],
  seedQuestions: QuizQuestion[] = SEED_QUESTIONS,
  targetCount = 15,
  rng: () => number = Math.random
): QuizQuestion[] {
  const staticPool = buildStaticChapterQuestions(chapter, allChapters, seedQuestions, rng);
  const staticCount = Math.min(staticPool.length, Math.max(2, Math.floor(targetCount * 0.35)));
  const selectedStatic = fisherYatesShuffle(staticPool, rng).slice(0, staticCount);

  const proceduralNeeded = Math.max(1, targetCount - selectedStatic.length);
  const procedural = generateProceduralChapterQuestions(chapter, proceduralNeeded, rng);

  const combined = [...selectedStatic, ...procedural];
  return fisherYatesShuffle(combined, rng).slice(0, targetCount);
}

/**
 * Offline / Instant Anti-Repetition Quick Quiz builder:
 * Uses the persistent Fisher-Yates Shuffle Queue for static formula cards so no definition
 * repeats back-to-back, combined with freshly randomized numerical questions that avoid seen prompts.
 */
export function buildOfflineQuickQuizBatch(
  chapter: ChapterData,
  allChapters: ChapterData[],
  count = 15,
  rng: () => number = Math.random
): QuizQuestion[] {
  const staticPool = buildStaticChapterQuestions(chapter, allChapters, SEED_QUESTIONS, rng);
  const staticQuota = Math.min(staticPool.length, Math.max(2, Math.floor(count * 0.3)));
  const queuedStatic =
    staticPool.length > 0
      ? drawFromShuffleQueue(`formula-quick:${chapter.id}`, staticPool, staticQuota, rng)
      : [];

  const seenSet = new Set(getSeenQuestionHistory());
  const proceduralCount = Math.max(1, count - queuedStatic.length);
  const procedural = generateProceduralChapterQuestions(
    chapter,
    proceduralCount,
    rng,
    seenSet
  );

  // Interleave static & procedural cleanly
  return fisherYatesShuffle([...queuedStatic, ...procedural], rng).slice(0, count);
}

/**
 * Builds Memory Match pairs tailored to a specific chapter (if chosen) or grade.
 */
export function buildChapterMatchPairs(
  grade: GradeLevel,
  chapter: ChapterData | null
): MatchPair[] {
  if (chapter && chapter.formulas.length >= 2) {
    const chapterPairs: MatchPair[] = chapter.formulas.slice(0, 5).map((f) => ({
      id: `pair-${f.id}`,
      leftTitle: f.title,
      rightLatex: f.latex,
    }));

    if (chapterPairs.length >= 4) {
      return chapterPairs;
    }

    const gradeKey = chapter.grade;
    const extra = SEED_MATCH_PAIRS[gradeKey].filter(
      (p) => !chapterPairs.some((cp) => cp.rightLatex === p.rightLatex)
    );
    return [...chapterPairs, ...extra].slice(0, 5);
  }

  const gKey = grade === 'thpt' ? '12' : grade;
  return SEED_MATCH_PAIRS[gKey];
}
