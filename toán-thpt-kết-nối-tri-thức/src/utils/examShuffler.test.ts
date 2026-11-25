import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM_CHAPTERS } from '../data/curriculum';
import {
  buildLocalCurriculumExam,
  generateShuffledExamVariants,
  gradeExamSubmission,
  normalizeRawQuestions,
} from './examShuffler';

function createSeededRng(seed = 42): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('normalizeRawQuestions filters out legacy complex-number questions and normalizes KaTeX & prefixes', () => {
  const raw = [
    {
      format: 'multiple_choice',
      prompt: 'Tìm môđun của số phức \\(z = 3 + 4i\\)',
      options: ['A. 5', 'B. 7', 'C. 1', 'D. 25'],
      correctIndex: 0,
      explanation: 'Số phức có môđun 5',
    },
    {
      format: 'multiple_choice',
      prompt: 'Tính tích phân \\(I = \\int_0^1 2x\\,dx\\).',
      options: ['A. $1$', 'B. $2$', 'C. $0$', 'D. $4$'],
      correctAnswer: 'A',
      explanation: 'Nguyên hàm là \\(x^2\\), kết quả $1$.',
    },
    {
      format: 'short_answer',
      prompt: 'Tính \\(\\int_0^2 3x^2\\,dx\\)',
      shortAnswer: '$8$',
      explanation: '\\(x^3|_0^2 = 8\\)',
    },
  ];

  const normalized = normalizeRawQuestions(raw, '12');
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].format, 'multiple_choice');
  assert.equal(normalized[0].prompt, 'Tính tích phân $I = \\int_0^1 2x\\,dx$.');
  assert.deepEqual(normalized[0].options, ['$1$', '$2$', '$0$', '$4$']);
  assert.equal(normalized[0].correctIndex, 0);
  assert.equal(normalized[1].shortAnswer, '8');
});

test('buildLocalCurriculumExam constructs standard 3-part GDPT 2018 exam without duplicates', () => {
  const grade12Chapters = CURRICULUM_CHAPTERS.filter((c) => c.grade === '12');
  const exam = buildLocalCurriculumExam({
    grade: '12',
    chapters: grade12Chapters,
    mcCount: 6,
    tfCount: 2,
    saCount: 3,
    durationMinutes: 45,
    rng: createSeededRng(101),
  });

  const mc = exam.questions.filter((q) => q.format === 'multiple_choice');
  const tf = exam.questions.filter((q) => q.format === 'true_false');
  const sa = exam.questions.filter((q) => q.format === 'short_answer');

  assert.equal(mc.length, 6);
  assert.equal(tf.length, 2);
  assert.equal(sa.length, 3);
  assert.equal(exam.durationMinutes, 45);

  const uniquePrompts = new Set(exam.questions.map((q) => q.prompt));
  assert.equal(uniquePrompts.size, exam.questions.length);
});

test('generateShuffledExamVariants preserves correct answers after option and statement shuffling', () => {
  const grade12Chapters = CURRICULUM_CHAPTERS.filter((c) => c.grade === '12');
  const baseExam = buildLocalCurriculumExam({
    grade: '12',
    chapters: grade12Chapters,
    mcCount: 6,
    tfCount: 2,
    saCount: 2,
    durationMinutes: 45,
    rng: createSeededRng(7),
  });

  const variants = generateShuffledExamVariants(baseExam, 3, 101, createSeededRng(99));
  assert.equal(variants.length, 3);
  assert.deepEqual(
    variants.map((v) => v.code),
    ['101', '102', '103']
  );

  // Build map from question id -> original correct option text & original TF truth map
  const origMcCorrectText = new Map<string, string>();
  const origTfTruth = new Map<string, Map<string, boolean>>();
  for (const q of baseExam.questions) {
    if (q.format === 'multiple_choice' && q.options && typeof q.correctIndex === 'number') {
      origMcCorrectText.set(q.id, q.options[q.correctIndex]);
    }
    if (q.format === 'true_false' && q.statements) {
      origTfTruth.set(
        q.id,
        new Map(q.statements.map((st) => [st.text, st.isTrue]))
      );
    }
  }

  for (const variant of variants) {
    assert.equal(variant.questions.length, baseExam.questions.length);
    for (const q of variant.questions) {
      if (q.format === 'multiple_choice') {
        const expectedText = origMcCorrectText.get(q.id);
        assert.ok(q.options && typeof q.correctIndex === 'number');
        assert.equal(q.options[q.correctIndex], expectedText);
      } else if (q.format === 'true_false') {
        const truthMap = origTfTruth.get(q.id)!;
        assert.deepEqual(
          q.statements?.map((s) => s.id),
          ['a', 'b', 'c', 'd']
        );
        for (const st of q.statements || []) {
          assert.equal(st.isTrue, truthMap.get(st.text));
        }
      }
    }
  }
});

test('gradeExamSubmission computes accurate THPT 10-point score for all 3 parts', () => {
  const grade12Chapters = CURRICULUM_CHAPTERS.filter((c) => c.grade === '12');
  const exam = buildLocalCurriculumExam({
    grade: '12',
    chapters: grade12Chapters,
    mcCount: 12,
    tfCount: 4,
    saCount: 6,
    durationMinutes: 90,
    rng: createSeededRng(123),
  });

  // Perfect answers => score10 === 10
  const mc: Record<string, number | undefined> = {};
  const tf: Record<string, Record<'a' | 'b' | 'c' | 'd', boolean | null>> = {};
  const sa: Record<string, string> = {};

  for (const q of exam.questions) {
    if (q.format === 'multiple_choice') {
      mc[q.id] = q.correctIndex ?? 0;
    } else if (q.format === 'true_false') {
      const map: Record<'a' | 'b' | 'c' | 'd', boolean | null> = {
        a: null,
        b: null,
        c: null,
        d: null,
      };
      for (const st of q.statements || []) {
        map[st.id] = st.isTrue;
      }
      tf[q.id] = map;
    } else {
      sa[q.id] = q.shortAnswer || '';
    }
  }

  const perfect = gradeExamSubmission(exam.questions, { mc, tf, sa });
  assert.equal(perfect.rawMax, 10);
  assert.equal(perfect.rawEarned, 10);
  assert.equal(perfect.score10, 10);
  assert.equal(perfect.mcCorrect, 12);
  assert.equal(perfect.saCorrect, 6);
});
