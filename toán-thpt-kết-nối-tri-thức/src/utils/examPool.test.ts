import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM_CHAPTERS } from '../data/curriculum';
import { filterChaptersByGrade } from './curriculumFilter';
import {
  drawGameQuestionPackFromPool,
  drawNextExamFromPool,
  ensureExamPoolForGrade,
  EXAM_POOL_REFILL_THRESHOLD,
  EXAM_POOL_SIZE,
  EXAM_POOL_STORAGE_KEY,
  peekExamPoolStatus,
  replenishPoolWithLocalRefill,
  shuffleExamQuestionsAndOptions,
  StorageLike,
} from './examPool';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe('10-Exam Auto-Replenish Pool (mathnova_exam_pool_v1)', () => {
  it('initializes 10 complete 3-part GDPT 2018 exams per grade and persists in mathnova_exam_pool_v1', () => {
    const storage = createMemoryStorage();
    const grades = ['10', '11', '12', 'thpt'] as const;

    for (const grade of grades) {
      const chapters = filterChaptersByGrade(CURRICULUM_CHAPTERS, grade);
      const pool = ensureExamPoolForGrade(grade, chapters, storage);
      assert.equal(pool.slots.length, EXAM_POOL_SIZE);
      assert.equal(pool.slots.filter((s) => !s.used).length, 10);

      for (const slot of pool.slots) {
        const mc = slot.exam.questions.filter((q) => q.format === 'multiple_choice');
        const tf = slot.exam.questions.filter((q) => q.format === 'true_false');
        const sa = slot.exam.questions.filter((q) => q.format === 'short_answer');
        assert.ok(mc.length >= 6, `Grade ${grade} slot ${slot.slotNumber} missing MC`);
        assert.ok(tf.length >= 2, `Grade ${grade} slot ${slot.slotNumber} missing TF`);
        assert.ok(sa.length >= 2, `Grade ${grade} slot ${slot.slotNumber} missing SA`);
      }
    }

    const raw = storage.getItem(EXAM_POOL_STORAGE_KEY);
    assert.ok(raw && raw.includes('"slots"'));
  });

  it('draws unique exams in round-robin without repeating and triggers refill threshold when < 3 remain', () => {
    const storage = createMemoryStorage();
    const chapters = filterChaptersByGrade(CURRICULUM_CHAPTERS, '12');

    const drawnTitles: string[] = [];
    for (let i = 1; i <= 8; i++) {
      const { exam, status } = drawNextExamFromPool({
        grade: '12',
        chapters,
        mcCount: 6,
        tfCount: 2,
        saCount: 2,
        storage,
      });
      drawnTitles.push(exam.title);
      assert.equal(status.currentSlotNumber, i);
      assert.equal(status.readyCount, 10 - i);
      assert.equal(
        status.needsBackgroundRefill,
        10 - i < EXAM_POOL_REFILL_THRESHOLD
      );
    }

    // All 8 drawn exams have distinct titles (#1 through #8) and non-identical question sets
    assert.equal(new Set(drawnTitles).size, 8);
    assert.equal(peekExamPoolStatus('12', chapters, storage).readyCount, 2);

    // Silent background refill restores readyCount back to 10/10
    const { status: refilled } = replenishPoolWithLocalRefill({
      grade: '12',
      chapters,
      onlyUnusedSlots: true,
      storage,
    });
    assert.equal(refilled.readyCount, 10);
    assert.equal(refilled.needsBackgroundRefill, false);
  });

  it('preserves exact correct option text when Fisher-Yates shuffling MCQ options & TF statements', () => {
    const storage = createMemoryStorage();
    const chapters = filterChaptersByGrade(CURRICULUM_CHAPTERS, '11');
    const pool = ensureExamPoolForGrade('11', chapters, storage);
    const original = pool.slots[0].exam;

    const origMcCorrectMap = new Map<string, string>();
    for (const q of original.questions) {
      if (q.format === 'multiple_choice' && q.options && typeof q.correctIndex === 'number') {
        origMcCorrectMap.set(q.id, q.options[q.correctIndex]);
      }
    }

    const shuffled = shuffleExamQuestionsAndOptions(original);
    for (const q of shuffled.questions) {
      if (q.format === 'multiple_choice' && q.options && typeof q.correctIndex === 'number') {
        assert.equal(q.options[q.correctIndex], origMcCorrectMap.get(q.id));
      }
    }
  });

  it('provides fresh question packs for GameArenaView and handles full wrap-around draw', () => {
    const storage = createMemoryStorage();
    const chapters = filterChaptersByGrade(CURRICULUM_CHAPTERS, 'thpt');

    // Draw all 10 + 1 more -> 11th draw auto-regenerates pool cleanly
    for (let i = 1; i <= 11; i++) {
      const pack = drawGameQuestionPackFromPool({
        grade: 'thpt',
        chapters,
        storage,
      });
      assert.ok(pack.mcQuestions.length >= 6);
      assert.ok(pack.tfQuestions.length >= 2);
      if (i === 11) {
        assert.equal(pack.status.readyCount, 9);
        assert.equal(pack.status.currentSlotNumber, 1);
      }
    }
  });

  it('advances monotonically (#2 -> #3 -> #4) when excludeExamId skips previewed slot #1', () => {
    const storage = createMemoryStorage();
    const chapters = filterChaptersByGrade(CURRICULUM_CHAPTERS, '12');
    const pool = ensureExamPoolForGrade('12', chapters, storage);
    let currentExamId = pool.slots[0].exam.id;

    const firstDraw = drawNextExamFromPool({
      grade: '12',
      chapters,
      excludeExamId: currentExamId,
      storage,
    });
    assert.equal(firstDraw.status.currentSlotNumber, 2);
    assert.equal(firstDraw.status.readyCount, 9);
    currentExamId = firstDraw.exam.id;

    const secondDraw = drawNextExamFromPool({
      grade: '12',
      chapters,
      excludeExamId: currentExamId,
      storage,
    });
    assert.equal(secondDraw.status.currentSlotNumber, 3);
    assert.equal(secondDraw.status.readyCount, 8);
    currentExamId = secondDraw.exam.id;

    const thirdDraw = drawNextExamFromPool({
      grade: '12',
      chapters,
      excludeExamId: currentExamId,
      storage,
    });
    assert.equal(thirdDraw.status.currentSlotNumber, 4);
    assert.equal(thirdDraw.status.readyCount, 7);
  });
});
