import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendDrawnShape,
  appendWrongQuestion,
  buildRankedLeaderboard,
  createNewAccountWorkspace,
  exportAccountBackupCode,
  importAccountBackupCode,
  normalizeAuthIdentifier,
  parseFirebaseConfigInput,
  recordDailyActivityStreak,
  refreshStreakOnLoad,
  removeWrongQuestion,
  sanitizeChatHistoryForFirestore,
  toggleWrongQuestionMastered,
} from './accountStore';

test('daily activity streak increments only once per day and resets on missed days', () => {
  const day1 = recordDailyActivityStreak(0, '', '2026-11-20');
  assert.equal(day1.streak, 1);
  assert.equal(day1.lastCompletedActivityDate, '2026-11-20');
  assert.equal(day1.incrementedToday, true);

  const day1Again = recordDailyActivityStreak(
    day1.streak,
    day1.lastCompletedActivityDate,
    '2026-11-20'
  );
  assert.equal(day1Again.streak, 1);
  assert.equal(day1Again.incrementedToday, false);

  const day2 = recordDailyActivityStreak(
    day1Again.streak,
    day1Again.lastCompletedActivityDate,
    '2026-11-21'
  );
  assert.equal(day2.streak, 2);
  assert.equal(day2.incrementedToday, true);

  assert.equal(refreshStreakOnLoad(2, '2026-11-21', '2026-11-21'), 2);
  assert.equal(refreshStreakOnLoad(2, '2026-11-21', '2026-11-22'), 2);

  assert.equal(refreshStreakOnLoad(2, '2026-11-21', '2026-11-23'), 0);
  const restarted = recordDailyActivityStreak(2, '2026-11-21', '2026-11-23');
  assert.equal(restarted.streak, 1);
});

test('wrong-answer notebook deduplicates repeated mistakes, toggles mastered, and deletes cleanly', () => {
  const step1 = appendWrongQuestion([], {
    prompt: 'Tính đạo hàm của y = x^3 - 3x',
    format: 'multiple_choice',
    userAnswerText: '3x^2 + 3',
    correctAnswerText: '3x^2 - 3',
    explanation: 'Áp dụng công thức (x^n)\' = n x^{n-1}.',
    chapterTitle: 'Đạo hàm',
    grade: '11',
  });
  assert.equal(step1.length, 1);
  assert.equal(step1[0].wrongCount, 1);
  assert.equal(step1[0].mastered, false);

  const step2 = appendWrongQuestion(step1, {
    prompt: '  Tính đạo hàm   của y = x^3 - 3x ',
    format: 'multiple_choice',
    userAnswerText: 'x^2 - 3',
    correctAnswerText: '3x^2 - 3',
    explanation: 'Áp dụng công thức (x^n)\' = n x^{n-1}.',
    chapterTitle: 'Đạo hàm',
    grade: '11',
  });
  assert.equal(step2.length, 1);
  assert.equal(step2[0].wrongCount, 2);
  assert.equal(step2[0].userAnswerText, 'x^2 - 3');

  const toggled = toggleWrongQuestionMastered(step2, step2[0].id);
  assert.equal(toggled[0].mastered, true);

  const removed = removeWrongQuestion(toggled, step2[0].id);
  assert.equal(removed.length, 0);
});

test('drawn shape history deduplicates by prompt and keeps most recent first', () => {
  const first = appendDrawnShape([], {
    title: 'Mặt cầu tâm I(1,2,3)',
    prompt: 'Mặt cầu tâm I(1,2,3) bán kính 4',
    mode: '3d',
    commandSet: {
      title: 'Mặt cầu',
      desmos2d: ['x^2 + y^2 = 16'],
      geogebra3d: ['(x-1)^2+(y-2)^2+(z-3)^2=16'],
      notes: '3D sphere',
      source: 'local',
    },
  });
  const second = appendDrawnShape(first, {
    title: 'Parabol y = x^2',
    prompt: 'y = x^2',
    mode: '2d',
    commandSet: {
      title: 'Parabol',
      desmos2d: ['y = x^2'],
      geogebra3d: [],
      notes: '2D curve',
      source: 'local',
    },
  });
  assert.equal(second.length, 2);
  assert.equal(second[0].title, 'Parabol y = x^2');
});

test('account backup code roundtrips Vietnamese UTF-8 profiles and rejects invalid format', () => {
  const ws = createNewAccountWorkspace(
    {
      displayName: 'Nguyễn Minh Quân',
      grade: '12',
      avatar: '🚀',
    },
    '2026-11-24'
  );
  ws.progress.xp = 420;
  ws.progress.streak = 6;
  ws.progress.lastCompletedActivityDate = '2026-11-24';
  ws.wrongNotebook = appendWrongQuestion([], {
    prompt: 'Tìm nguyên hàm của cos(2x)',
    format: 'multiple_choice',
    userAnswerText: 'sin(2x) + C',
    correctAnswerText: '1/2 sin(2x) + C',
    explanation: 'Nhớ chia cho hệ số a = 2.',
    chapterTitle: 'Nguyên hàm - Tích phân',
    grade: '12',
  });

  const code = exportAccountBackupCode(ws);
  assert.ok(code.startsWith('MATHNOVA_V1:'));

  const restored = importAccountBackupCode(code, '2026-11-24');
  assert.equal(restored.profile.displayName, 'Nguyễn Minh Quân');
  assert.equal(restored.profile.grade, '12');
  assert.equal(restored.progress.xp, 420);
  assert.equal(restored.progress.streak, 6);
  assert.equal(restored.wrongNotebook.length, 1);

  assert.throws(() => importAccountBackupCode('INVALID_CODE'), /MATHNOVA_V1:/);
});

test('leaderboard displays zero fake users when empty and ranks real users accurately', () => {
  // No fake/sample users when Cloud Firestore has 0 registered users
  assert.deepEqual(buildRankedLeaderboard([], 'streak'), []);

  const realUsers = [
    { id: 'u1', displayName: 'Minh Khang 12A7', avatar: '⚡', grade: '12' as const, xp: 520, streak: 4 },
    { id: 'u2', displayName: 'Thảo Vy 11A1', avatar: '🚀', grade: '11' as const, xp: 980, streak: 2 },
    { id: 'u3', displayName: 'Quang Huy 10A2', avatar: '🧠', grade: '10' as const, xp: 300, streak: 7 },
  ];

  const byStreak = buildRankedLeaderboard(realUsers, 'streak', 'u1');
  assert.equal(byStreak.length, 3);
  assert.equal(byStreak[0].id, 'u3');
  assert.equal(byStreak[0].rank, 1);
  assert.equal(byStreak[1].id, 'u1');
  assert.equal(byStreak[1].isCurrentUser, true);

  const byXp = buildRankedLeaderboard(realUsers, 'xp', 'u1');
  assert.equal(byXp[0].id, 'u2');
  assert.equal(byXp[0].rank, 1);
  assert.equal(byXp[1].id, 'u1');
  assert.equal(byXp[1].isCurrentUser, true);
});

test('normalizeAuthIdentifier supports both email and username formats', () => {
  const fromEmail = normalizeAuthIdentifier('MinhKhang@Gmail.com');
  assert.equal(fromEmail.email, 'minhkhang@gmail.com');
  assert.equal(fromEmail.isUsernameOnly, false);

  const fromUsername = normalizeAuthIdentifier('Minh Khang 12A7');
  assert.equal(fromUsername.email, 'minh.khang.12a7@mathnova.app');
  assert.equal(fromUsername.displayNameHint, 'Minh Khang 12A7');
  assert.equal(fromUsername.isUsernameOnly, true);

  assert.throws(() => normalizeAuthIdentifier('ab'), /tối thiểu 3/);
  assert.throws(() => normalizeAuthIdentifier('bad@email'), /không hợp lệ/);
});

test('parseFirebaseConfigInput accepts both strict JSON and Firebase Console JS snippet', () => {
  const strictJson = `{
    "apiKey": "AIzaTest123",
    "authDomain": "test-app.firebaseapp.com",
    "projectId": "test-app",
    "appId": "1:123:web:abc"
  }`;
  const parsedJson = parseFirebaseConfigInput(strictJson);
  assert.equal(parsedJson.projectId, 'test-app');
  assert.equal(parsedJson.appId, '1:123:web:abc');

  const jsSnippet = `
    // Your web app's Firebase configuration
    const firebaseConfig = {
      apiKey: 'AIzaJsSnippet',
      authDomain: 'js-app.firebaseapp.com',
      projectId: 'js-app',
      storageBucket: 'js-app.firebasestorage.app',
    };
  `;
  const parsedJs = parseFirebaseConfigInput(jsSnippet);
  assert.equal(parsedJs.apiKey, 'AIzaJsSnippet');
  assert.equal(parsedJs.projectId, 'js-app');
  assert.equal(parsedJs.storageBucket, 'js-app.firebasestorage.app');

  assert.throws(() => parseFirebaseConfigInput('{ "apiKey": "only" }'), /apiKey.*authDomain.*projectId/);
});

test('sanitizeChatHistoryForFirestore strips huge base64 image payloads safely', () => {
  const hugeImg = 'data:image/png;base64,' + 'A'.repeat(3000);
  const sanitized = sanitizeChatHistoryForFirestore([
    { id: '1', role: 'user', content: 'Giải bài này', imageDataUrl: hugeImg, timestamp: 100 },
    { id: '2', role: 'model', content: 'Bước 1...', timestamp: 101 },
  ]);
  assert.equal(sanitized[0].imageDataUrl, undefined);
  assert.ok(sanitized[0].content.includes('[Ảnh đề toán]'));
  assert.equal(sanitized[1].content, 'Bước 1...');
});
