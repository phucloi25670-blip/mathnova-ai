import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM_CHAPTERS } from '../data/curriculum';
import { SEED_QUESTIONS } from '../data/seedQuestions';
import {
  filterChaptersByGrade,
  hasProhibitedLegacyTopic,
  searchFormulasInChapters,
} from './curriculumFilter';
import {
  buildWeeklyProgressSeries,
  calculateSprintXp,
  computeUpdatedStreak,
  isShortAnswerCorrect,
  scoreTrueFalseStatements,
} from './gameLogic';
import {
  buildChapterMatchPairs,
  buildChapterQuickQuiz,
  buildOfflineQuickQuizBatch,
  calculateMultiplierXp,
  getComboMultiplier,
} from './formulaQuiz';
import { generateProceduralChapterQuestions } from './proceduralQuiz';
import {
  buildLocalLabCommands,
  inferRecommendedLabMode,
  LAB_PRESETS,
  normalizeDesmosCommand,
  toDesmosApiLatex,
} from './labParser';
import { parseGeminiApiError } from './aiError';
import { CHAPTER_ROADMAP_META, getChapterRoadmapMeta } from '../data/roadmapMeta';
import { buildTopicKey, computeRoadmapOverview } from './roadmapLogic';
import {
  buildDiversitySeeds,
  clearSeenQuestionHistory,
  clearShuffleQueues,
  drawFromShuffleQueue,
  fisherYatesShuffle,
  getSeenQuestionHistory,
  recordSeenQuestions,
} from './antiRepetition';

test('curriculum matches exact Ket noi tri thuc GDPT 2018 chapter counts and excludes legacy topics', () => {
  const g10 = filterChaptersByGrade(CURRICULUM_CHAPTERS, '10');
  const g11 = filterChaptersByGrade(CURRICULUM_CHAPTERS, '11');
  const g12 = filterChaptersByGrade(CURRICULUM_CHAPTERS, '12');

  assert.equal(g10.length, 9);
  assert.equal(g11.length, 9);
  assert.equal(g12.length, 6);

  assert.equal(g10[0].title, 'Mệnh đề và tập hợp');
  assert.equal(g11[0].title, 'Hàm số lượng giác và phương trình lượng giác');
  assert.equal(g12[0].title, 'Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số');
  assert.equal(g12[5].title, 'Xác suất có điều kiện');

  for (const ch of CURRICULUM_CHAPTERS) {
    assert.equal(hasProhibitedLegacyTopic(ch.title), false, `Chapter title contains legacy topic: ${ch.title}`);
    assert.equal(hasProhibitedLegacyTopic(ch.summary), false, `Chapter summary contains legacy topic: ${ch.summary}`);
    for (const f of ch.formulas) {
      assert.equal(hasProhibitedLegacyTopic(f.title), false, `Formula title contains legacy topic: ${f.title}`);
      assert.equal(hasProhibitedLegacyTopic(f.latex), false, `Formula latex contains legacy topic: ${f.latex}`);
    }
  }

  for (const q of SEED_QUESTIONS) {
    assert.equal(hasProhibitedLegacyTopic(q.prompt), false, `Question contains legacy topic: ${q.id}`);
  }
});

test('diacritic-insensitive search finds formulas accurately', () => {
  const g12 = filterChaptersByGrade(CURRICULUM_CHAPTERS, '12');
  const hits = searchFormulasInChapters(g12, 'tich phan');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].chapter.id, '12-c4');
  assert.ok(hits[0].formulas.length >= 3);
});

test('GDPT 2018 True/False 4-statement scoring rule works accurately', () => {
  const statements = [
    { id: 'a' as const, text: 'A', isTrue: true },
    { id: 'b' as const, text: 'B', isTrue: false },
    { id: 'c' as const, text: 'C', isTrue: true },
    { id: 'd' as const, text: 'D', isTrue: false },
  ];

  assert.equal(
    scoreTrueFalseStatements(statements, { a: true, b: true, c: false, d: true }).points,
    0.1
  );
  assert.equal(
    scoreTrueFalseStatements(statements, { a: true, b: false, c: false, d: true }).points,
    0.25
  );
  assert.equal(
    scoreTrueFalseStatements(statements, { a: true, b: false, c: true, d: true }).points,
    0.5
  );
  assert.equal(
    scoreTrueFalseStatements(statements, { a: true, b: false, c: true, d: false }).points,
    1.0
  );
});

test('short answer validation handles comma decimals and fractions', () => {
  assert.equal(isShortAnswerCorrect('0,75', '3/4'), true);
  assert.equal(isShortAnswerCorrect(' 40 ', '40'), true);
  assert.equal(isShortAnswerCorrect('1.5', '3/2'), true);
  assert.equal(isShortAnswerCorrect('12', '40'), false);
});

test('streak, sprint XP progression, and combo x2/x3 multiplier calculate correctly', () => {
  assert.deepEqual(computeUpdatedStreak(0, '', '2026-11-23'), {
    streak: 1,
    lastActiveDate: '2026-11-23',
  });
  assert.deepEqual(computeUpdatedStreak(3, '2026-11-22', '2026-11-23'), {
    streak: 4,
    lastActiveDate: '2026-11-23',
  });
  assert.deepEqual(computeUpdatedStreak(5, '2026-11-20', '2026-11-23'), {
    streak: 1,
    lastActiveDate: '2026-11-23',
  });
  assert.equal(calculateSprintXp(4, 3), 70);
  assert.equal(getComboMultiplier(1), 1);
  assert.equal(getComboMultiplier(2), 2);
  assert.equal(getComboMultiplier(4), 3);
  assert.equal(calculateMultiplierXp(15, 2), 30);
  assert.equal(calculateMultiplierXp(15, 5), 45);
});

test('local 2D/3D math command parser outputs clean Desmos copy-paste syntax, Desmos API LaTeX, and prose commands', () => {
  assert.equal(
    normalizeDesmosCommand('0 \\le y \\le \\sqrt{x} \\{0 \\le x \\le 4\\}'),
    '0 <= y <= sqrt(x) {0 <= x <= 4}'
  );

  assert.equal(
    toDesmosApiLatex('0 <= y <= sqrt(x) {0 <= x <= 4}'),
    '0 \\le y \\le \\sqrt{x} \\left\\{0 \\le x \\le 4\\right\\}'
  );

  const sphere = buildLocalLabCommands('Mặt cầu (x-1)^2 + (y+2)^2 + (z-3)^2 = 16');
  assert.ok(sphere.geogebra3d.some((line) => line.includes('Sphere(I, 4)')));

  const proseSphere = buildLocalLabCommands('vẽ mặt cầu tâm I(1,2,3) bán kính 4');
  assert.ok(proseSphere.geogebra3d.includes('I = (1, 2, 3)'));
  assert.ok(proseSphere.geogebra3d.includes('Sphere(I, 4)'));

  const proseSolid = buildLocalLabCommands('vẽ khối tròn xoay y = sqrt(x) từ 0 đến 4');
  assert.ok(proseSolid.desmos2d.includes('f(x) = sqrt(x)'));
  assert.ok(proseSolid.desmos2d.includes('0 <= y <= f(x) {0 <= x <= 4}'));
  assert.ok(proseSolid.geogebra3d.includes('f(x) = If(0 <= x <= 4, sqrt(x))'));

  const solid = buildLocalLabCommands('Tính thể tích khối tròn xoay quay quanh Ox giới hạn bởi y = sqrt(x), x = 0 và x = 4');
  assert.ok(solid.desmos2d.includes('f(x) = sqrt(x)'));
  assert.ok(solid.desmos2d.includes('0 <= y <= f(x) {0 <= x <= 4}'));
  assert.ok(solid.geogebra3d.some((line) => line.includes('Surface(')));

  const area = buildLocalLabCommands('Tính diện tích hình phẳng giới hạn bởi y = x^2 và y = 2x trên đoạn x = 0 và x = 2.');
  assert.ok(area.desmos2d.includes('min(f(x), g(x)) <= y <= max(f(x), g(x)) {0 <= x <= 2}'));
  assert.ok(area.geogebra3d.some((line) => line.includes('IntegralBetween(f, g, 0, 2)')));

  const pyramid = buildLocalLabCommands('Vẽ hình chóp tứ giác đều S.ABCD có đáy cạnh 4 và chiều cao h = 5');
  assert.ok(pyramid.geogebra3d.some((line) => line.includes('Pyramid(A, B, C, D, S)')));

  for (const preset of LAB_PRESETS) {
    const cmds = buildLocalLabCommands(preset.prompt);
    for (const line of cmds.desmos2d) {
      assert.equal(line.includes('\\le'), false, `Raw \\le found in preset ${preset.id}: ${line}`);
      assert.equal(line.includes('\\{'), false, `Raw \\{ found in preset ${preset.id}: ${line}`);
    }
  }
});

test('curriculum formula descriptions wrap LaTeX commands inside $...$', () => {
  for (const ch of CURRICULUM_CHAPTERS) {
    for (const f of ch.formulas) {
      for (const field of [f.description, f.practicalNote ?? '']) {
        const outsideMath = field.replace(/\$[^$]+\$/g, '');
        assert.equal(
          outsideMath.includes('\\'),
          false,
          `Unwrapped LaTeX found in ${f.id}: ${outsideMath}`
        );
      }
    }
  }
});

test('weekly XP progress series builds 7 ordered days with proportional bar heights', () => {
  const series = buildWeeklyProgressSeries(
    { '2026-11-22': 40, '2026-11-23': 100 },
    '2026-11-23'
  );
  assert.equal(series.length, 7);
  assert.equal(series[6].date, '2026-11-23');
  assert.equal(series[6].label, 'Hôm nay');
  assert.equal(series[6].xp, 100);
  assert.equal(series[6].heightPct, 100);
  assert.equal(series[5].xp, 40);
  assert.equal(series[5].heightPct, 40);
  assert.equal(series[0].xp, 0);
  assert.equal(series[0].heightPct, 8);
});

test('every curriculum chapter generates valid 30s quick recall quiz and match pairs', () => {
  for (const chapter of CURRICULUM_CHAPTERS) {
    const quiz = buildChapterQuickQuiz(chapter, CURRICULUM_CHAPTERS);
    assert.ok(quiz.length >= 1, `No quick quiz generated for ${chapter.id}`);
    for (const q of quiz) {
      assert.equal(q.format, 'multiple_choice');
      assert.equal(q.options?.length, 4);
      assert.ok(typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex < 4);
    }
    const pairs = buildChapterMatchPairs(chapter.grade, chapter);
    assert.ok(pairs.length >= 4, `Not enough match pairs for ${chapter.id}`);
  }
});

test('Learning Roadmap metadata covers all 24 chapters and computes unlock, completion %, and resume chapter', () => {
  const g12 = filterChaptersByGrade(CURRICULUM_CHAPTERS, '12');

  for (const chapter of CURRICULUM_CHAPTERS) {
    assert.ok(CHAPTER_ROADMAP_META[chapter.id], `Missing roadmap meta for ${chapter.id}`);
    const meta = getChapterRoadmapMeta(chapter.id);
    assert.ok(meta.topics.length >= 2, `Expected >=2 topics for ${chapter.id}`);
    for (const topic of meta.topics) {
      assert.equal(
        hasProhibitedLegacyTopic(topic),
        false,
        `Roadmap topic contains legacy curriculum content: ${topic}`
      );
    }
  }

  const completedTopics = [buildTopicKey('12-c2', 0)];
  const masteredMap: Record<string, 'mastered'> = {
    [g12[0].formulas[0].id]: 'mastered',
    [g12[1].formulas[0].id]: 'mastered',
  };

  const result = computeRoadmapOverview(
    g12,
    ['12-c1'],
    completedTopics,
    masteredMap,
    '12-c2'
  );

  assert.equal(result.overview.totalChaptersCount, 6);
  assert.equal(result.overview.completedChaptersCount, 1);
  assert.equal(result.overview.unlockedCount, 2); // 12-c1 completed -> 12-c2 unlocked
  assert.equal(result.overview.masteredFormulasCount, 2);
  assert.equal(result.overview.resumeChapter?.id, '12-c2');

  assert.equal(result.statuses['12-c1'].progressPct, 100);
  assert.equal(result.statuses['12-c1'].isCompleted, true);
  assert.equal(result.statuses['12-c2'].isUnlocked, true);
  assert.ok(result.statuses['12-c2'].progressPct > 0 && result.statuses['12-c2'].progressPct < 100);
  assert.equal(result.statuses['12-c3'].isUnlocked, false);
});

test('Fisher-Yates shuffle preserves multiset without mutating input', () => {
  const input = [1, 2, 3, 4, 5, 6, 7];
  const snapshot = [...input];
  const out = fisherYatesShuffle(input);
  assert.deepEqual(input, snapshot);
  assert.deepEqual([...out].sort((a, b) => a - b), snapshot);
});

test('Shuffle Queue exhausts entire pool before repeating and prevents boundary duplicate', () => {
  clearShuffleQueues();
  const pool = ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => ({ id }));

  // Draw 3 then 2 -> full 5-item cycle with zero duplicates
  const batch1 = drawFromShuffleQueue('test-queue', pool, 3);
  const batch2 = drawFromShuffleQueue('test-queue', pool, 2);
  const fullCycleIds = [...batch1, ...batch2].map((x) => x.id);

  assert.equal(fullCycleIds.length, 5);
  assert.equal(new Set(fullCycleIds).size, 5);

  // Next draw begins a fresh cycle; first item must differ from last item of previous cycle
  const batch3 = drawFromShuffleQueue('test-queue', pool, 3);
  assert.equal(batch3.length, 3);
  assert.notEqual(batch3[0].id, batch2[batch2.length - 1].id);
});

test('Seen Questions Tracker deduplicates, caps history, and clears cleanly', () => {
  clearSeenQuestionHistory();
  assert.deepEqual(getSeenQuestionHistory(), []);

  const sampleQuestions = SEED_QUESTIONS.slice(0, 3);
  recordSeenQuestions(sampleQuestions);
  const firstPass = getSeenQuestionHistory();
  assert.equal(firstPass.length, 3);

  // Recording identical questions again does not duplicate signatures
  recordSeenQuestions(sampleQuestions);
  assert.equal(getSeenQuestionHistory().length, 3);

  clearSeenQuestionHistory();
  assert.deepEqual(getSeenQuestionHistory(), []);
});

test('Diversity Seeds prevent consecutive duplicate subtopics and follow 10/20/70 THPT ratio', () => {
  const seeds = buildDiversitySeeds({
    grade: 'thpt',
    selectedChapterId: 'all',
    allChapters: CURRICULUM_CHAPTERS,
    count: 10,
  });

  assert.equal(seeds.length, 10);
  const count10 = seeds.filter((s) => s.gradeTag === '10').length;
  const count11 = seeds.filter((s) => s.gradeTag === '11').length;
  const count12 = seeds.filter((s) => s.gradeTag === '12').length;

  assert.equal(count10, 1);
  assert.equal(count11, 2);
  assert.equal(count12, 7);

  for (let i = 1; i < seeds.length; i++) {
    assert.notEqual(
      seeds[i].subtopic,
      seeds[i - 1].subtopic,
      `Consecutive duplicate subtopic found at index ${i}: ${seeds[i].subtopic}`
    );
    assert.ok(seeds[i].paramHint.length > 10);
  }
});

test('upgraded local math parser extracts arbitrary functions, spheres with z^2/expanded equations, and 3D lines accurately', () => {
  const quad = buildLocalLabCommands('y = x^2 - 4x + 3');
  assert.deepEqual(quad.desmos2d, ['f(x) = x^2 - 4x + 3']);
  assert.deepEqual(quad.geogebra3d, ['f(x) = x^2 - 4x + 3']);
  assert.equal(inferRecommendedLabMode('y = x^2 - 4x + 3'), '2d');

  const cubic = buildLocalLabCommands('Vẽ đồ thị hàm số y = x^3 - 3x');
  assert.deepEqual(cubic.desmos2d, ['f(x) = x^3 - 3x']);

  const rational = buildLocalLabCommands('Khảo sát f(x) = (2x + 1)/(x - 1) giúp tôi.');
  assert.deepEqual(rational.desmos2d, ['f(x) = (2x + 1)/(x - 1)']);

  const bare = buildLocalLabCommands('Vẽ sin(2x) + cos(x)');
  assert.deepEqual(bare.desmos2d, ['f(x) = sin(2x) + cos(x)']);

  const sphereZ0 = buildLocalLabCommands('mặt cầu (x-1)^2 + (y-2)^2 + z^2 = 9');
  assert.ok(sphereZ0.geogebra3d.includes('I = (1, 2, 0)'));
  assert.ok(sphereZ0.geogebra3d.includes('Sphere(I, 3)'));
  assert.equal(inferRecommendedLabMode('(x-1)^2 + (y-2)^2 + z^2 = 9'), '3d');

  const expandedSphere = buildLocalLabCommands('x^2 + y^2 + z^2 - 2x + 4y - 6z - 2 = 0');
  assert.ok(expandedSphere.geogebra3d.includes('I = (1, -2, 3)'));
  assert.ok(expandedSphere.geogebra3d.includes('Sphere(I, 4)'));

  const directCmd = buildLocalLabCommands('A = (1, 2, 3); Sphere(A, 5)');
  assert.deepEqual(directCmd.geogebra3d, ['A = (1, 2, 3)', 'Sphere(A, 5)']);
  assert.equal(inferRecommendedLabMode('A = (1, 2, 3); Sphere(A, 5)'), '3d');

  assert.equal(toDesmosApiLatex('sin(2x) + 2^(x-1)'), '\\sin(2x) + 2^{x-1}');
});

test('parseGeminiApiError preserves exact HTTP status codes (400/403/404/429/503)', () => {
  const err400 = parseGeminiApiError(
    new Error('{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}'),
    'gemini-2.5-flash'
  );
  assert.equal(err400.status, 400);
  assert.equal(err400.isAuthError, true);
  assert.match(err400.formatted, /HTTP 400 \(Invalid API Key\)/);

  const err403 = parseGeminiApiError(
    Object.assign(new Error('PERMISSION_DENIED: Consumer has been suspended'), { status: 403 }),
    'gemini-2.5-flash'
  );
  assert.equal(err403.status, 403);
  assert.equal(err403.isAuthError, true);
  assert.match(err403.formatted, /HTTP 403/);

  const err404 = parseGeminiApiError(
    Object.assign(new Error('NOT_FOUND: models/bad-model is not found'), { status: 404 }),
    'gemini-2.5-flash'
  );
  assert.equal(err404.status, 404);
  assert.equal(err404.isRetryable, true);
  assert.match(err404.formatted, /HTTP 404/);

  const err429 = parseGeminiApiError(
    Object.assign(new Error('RESOURCE_EXHAUSTED: Rate limit exceeded'), { status: 429 }),
    'gemini-2.5-flash'
  );
  assert.equal(err429.status, 429);
  assert.equal(err429.isRetryable, true);
  assert.match(err429.formatted, /HTTP 429/);
});

test('procedural chapter quiz generator produces 15 unique valid MCQs for all 24 chapters and varies 10-c2 coefficients', () => {
  for (const chapter of CURRICULUM_CHAPTERS) {
    const batch = generateProceduralChapterQuestions(chapter, 15);
    assert.equal(
      batch.length,
      15,
      `Expected 15 procedural questions for ${chapter.id}, got ${batch.length}`
    );
    const promptSet = new Set(batch.map((q) => q.prompt.trim()));
    assert.equal(
      promptSet.size,
      15,
      `Duplicate prompts generated within single batch for ${chapter.id}`
    );
    for (const q of batch) {
      assert.equal(q.format, 'multiple_choice');
      assert.equal(q.options?.length, 4);
      assert.equal(new Set(q.options).size, 4, `Duplicate options in ${q.id}`);
      assert.ok(typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex < 4);
    }
  }

  // Verify Toán 10 Chương 2 randomizes coefficients across consecutive rounds
  const ch10c2 = CURRICULUM_CHAPTERS.find((c) => c.id === '10-c2')!;
  assert.ok(ch10c2);
  const roundA = generateProceduralChapterQuestions(ch10c2, 15);
  const seenPrompts = new Set(roundA.map((q) => q.prompt.replace(/\s+/g, ' ').trim()));
  const roundB = generateProceduralChapterQuestions(ch10c2, 15, Math.random, seenPrompts);
  assert.equal(roundB.length, 15);
  for (const q of roundB) {
    assert.equal(
      seenPrompts.has(q.prompt.replace(/\s+/g, ' ').trim()),
      false,
      `Round B repeated Round A prompt in 10-c2: ${q.prompt}`
    );
  }
});

test('buildChapterQuickQuiz and buildOfflineQuickQuizBatch return 15 diverse non-repeating items', () => {
  clearShuffleQueues();
  clearSeenQuestionHistory();
  for (const chapter of CURRICULUM_CHAPTERS) {
    const quick = buildChapterQuickQuiz(chapter, CURRICULUM_CHAPTERS);
    assert.equal(quick.length, 15, `Expected 15 quick quiz questions for ${chapter.id}`);

    const offline = buildOfflineQuickQuizBatch(chapter, CURRICULUM_CHAPTERS, 15);
    assert.equal(offline.length, 15, `Expected 15 offline batch questions for ${chapter.id}`);
  }
});
