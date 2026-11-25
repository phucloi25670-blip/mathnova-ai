import {
  AccountStoreState,
  AccountWorkspaceData,
  ChatMessage,
  DrawnShapeRecord,
  GradeLevel,
  LeaderboardEntry,
  UserAccountProfile,
  UserProgress,
  WrongQuestionEntry,
} from '../types';

export const ACCOUNT_STORE_STORAGE_KEY = 'mathnova_accounts_v1';
const BACKUP_PREFIX = 'MATHNOVA_V1:';

export const AVATAR_OPTIONS = [
  { id: 'rocket', emoji: '🚀', label: 'Tên lửa' },
  { id: 'brain', emoji: '🧠', label: 'Trí tuệ' },
  { id: 'compass', emoji: '📐', label: 'Hình học' },
  { id: 'bolt', emoji: '⚡', label: 'Tốc độ' },
  { id: 'galaxy', emoji: '🌌', label: 'Tinh vân' },
  { id: 'owl', emoji: '🦉', label: 'Cú thông thái' },
  { id: 'fox', emoji: '🦊', label: 'Cáo nhanh nhẹn' },
  { id: 'trophy', emoji: '🏆', label: 'Nhà vô địch' },
  { id: 'target', emoji: '🎯', label: 'Chính xác' },
  { id: 'atom', emoji: '⚛️', label: 'Khoa học' },
];


export function getTodayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function createDefaultUserProgress(todayIso: string = getTodayIsoDate()): UserProgress {
  return {
    xp: 0,
    streak: 0,
    lastActiveDate: todayIso,
    lastCompletedActivityDate: '',
    completedChapterIds: [],
    completedTopicKeys: [],
    lastStudiedChapterId: undefined,
    gamesPlayed: 0,
    questionsAnswered: 0,
    questionsCorrect: 0,
    millionaireUrl: '',
    dailyXp: {},
    formulaMastery: {},
    customReminders: [],
    energy: 5,
    lastEnergyRefillDate: todayIso,
    lastComicRewardDate: '',
  };
}

export function checkAndRefillDailyEnergy(
  progress: UserProgress,
  todayIso: string = getTodayIsoDate()
): UserProgress {
  const currentEnergy = typeof progress.energy === 'number' ? progress.energy : 5;
  const lastRefill = progress.lastEnergyRefillDate || todayIso;
  if (lastRefill !== todayIso) {
    const refilled = Math.min(5, currentEnergy + 2);
    return {
      ...progress,
      energy: refilled,
      lastEnergyRefillDate: todayIso,
    };
  }
  return {
    ...progress,
    energy: currentEnergy,
    lastEnergyRefillDate: lastRefill,
  };
}

/**
 * Checks whether streak is still active (either completed today or yesterday).
 * If >1 day gap passed without completing an activity, resets displayed streak to 0.
 */
export function refreshStreakOnLoad(
  currentStreak: number,
  lastCompletedActivityDate: string | undefined,
  todayIso: string
): number {
  if (!lastCompletedActivityDate) return 0;
  if (lastCompletedActivityDate === todayIso) return Math.max(1, currentStreak);

  const prev = new Date(`${lastCompletedActivityDate}T00:00:00Z`).getTime();
  const curr = new Date(`${todayIso}T00:00:00Z`).getTime();
  const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) {
    return Math.max(1, currentStreak);
  }
  return 0;
}

/**
 * Records completion of a daily learning activity (practice quiz, game, or 2D/3D drawing).
 * Automatically increments streak once per day when consecutive days are maintained.
 */
export function recordDailyActivityStreak(
  currentStreak: number,
  lastCompletedActivityDate: string | undefined,
  todayIso: string
): { streak: number; lastCompletedActivityDate: string; incrementedToday: boolean } {
  if (!lastCompletedActivityDate) {
    return { streak: 1, lastCompletedActivityDate: todayIso, incrementedToday: true };
  }
  if (lastCompletedActivityDate === todayIso) {
    return {
      streak: Math.max(1, currentStreak),
      lastCompletedActivityDate: todayIso,
      incrementedToday: false,
    };
  }

  const prev = new Date(`${lastCompletedActivityDate}T00:00:00Z`).getTime();
  const curr = new Date(`${todayIso}T00:00:00Z`).getTime();
  const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    return {
      streak: Math.max(1, currentStreak) + 1,
      lastCompletedActivityDate: todayIso,
      incrementedToday: true,
    };
  }

  return {
    streak: 1,
    lastCompletedActivityDate: todayIso,
    incrementedToday: true,
  };
}

export function createDefaultWelcomeChat(): ChatMessage[] {
  return [
    {
      id: 'welcome',
      role: 'model',
      content:
        'Chào em! Thầy/Cô là Gia Sư **MathNova AI** theo phương pháp **Socratic**. Em hãy gửi đề bài hoặc chụp ảnh bài toán — phản hồi sẽ hiện ngay từng dòng để chúng ta cùng tháo gỡ từng bước nhé.',
      timestamp: Date.now(),
    },
  ];
}

export function createNewAccountWorkspace(
  params: {
    displayName: string;
    grade: GradeLevel;
    avatar: string;
    initialProgress?: UserProgress;
  },
  todayIso: string = getTodayIsoDate()
): AccountWorkspaceData {
  const now = Date.now();
  const id = `acc-${now}-${Math.random().toString(36).slice(2, 7)}`;
  const profile: UserAccountProfile = {
    id,
    displayName: params.displayName.trim(),
    grade: params.grade,
    avatar: params.avatar || '🚀',
    createdAt: now,
    updatedAt: now,
  };

  return {
    profile,
    progress: params.initialProgress
      ? { ...createDefaultUserProgress(todayIso), ...params.initialProgress }
      : createDefaultUserProgress(todayIso),
    chatHistory: createDefaultWelcomeChat(),
    drawnHistory: [],
    wrongNotebook: [],
  };
}

export function normalizeQuestionKey(prompt: string): string {
  return prompt.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 160);
}

export function appendWrongQuestion(
  existing: WrongQuestionEntry[],
  input: Omit<WrongQuestionEntry, 'id' | 'questionKey' | 'wrongCount' | 'lastWrongAt'>
): WrongQuestionEntry[] {
  const key = normalizeQuestionKey(input.prompt);
  const now = Date.now();
  const existingIdx = existing.findIndex((item) => item.questionKey === key);

  if (existingIdx >= 0) {
    const target = existing[existingIdx];
    const updated: WrongQuestionEntry = {
      ...target,
      userAnswerText: input.userAnswerText,
      correctAnswerText: input.correctAnswerText,
      explanation: input.explanation || target.explanation,
      wrongCount: target.wrongCount + 1,
      lastWrongAt: now,
      mastered: false,
    };
    const rest = existing.filter((_, idx) => idx !== existingIdx);
    return [updated, ...rest].slice(0, 100);
  }

  const newEntry: WrongQuestionEntry = {
    ...input,
    id: `wrong-${now}-${Math.random().toString(36).slice(2, 6)}`,
    questionKey: key,
    wrongCount: 1,
    lastWrongAt: now,
    mastered: false,
  };

  return [newEntry, ...existing].slice(0, 100);
}

export function toggleWrongQuestionMastered(
  existing: WrongQuestionEntry[],
  entryId: string
): WrongQuestionEntry[] {
  return existing.map((item) =>
    item.id === entryId ? { ...item, mastered: !item.mastered } : item
  );
}

export function removeWrongQuestion(
  existing: WrongQuestionEntry[],
  entryId: string
): WrongQuestionEntry[] {
  return existing.filter((item) => item.id !== entryId);
}

export function appendDrawnShape(
  existing: DrawnShapeRecord[],
  shape: Omit<DrawnShapeRecord, 'id' | 'timestamp'>
): DrawnShapeRecord[] {
  const now = Date.now();
  const normalizedPrompt = shape.prompt.trim().toLowerCase();
  const filtered = existing.filter(
    (item) => item.prompt.trim().toLowerCase() !== normalizedPrompt
  );
  const next: DrawnShapeRecord = {
    ...shape,
    id: `draw-${now}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
  };
  return [next, ...filtered].slice(0, 30);
}

function utf8ToBase64(str: string): string {
  if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
  }
  return Buffer.from(str, 'utf8').toString('base64');
}

function base64ToUtf8(b64: string): string {
  if (typeof TextDecoder !== 'undefined' && typeof atob === 'function') {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function exportAccountBackupCode(workspace: AccountWorkspaceData): string {
  const payload = {
    v: 1,
    exportedAt: Date.now(),
    workspace,
  };
  const encoded = utf8ToBase64(JSON.stringify(payload));
  return `${BACKUP_PREFIX}${encoded}`;
}

export function importAccountBackupCode(
  rawCode: string,
  todayIso: string = getTodayIsoDate()
): AccountWorkspaceData {
  const trimmed = rawCode.trim();
  if (!trimmed.startsWith(BACKUP_PREFIX)) {
    throw new Error('Mã sao lưu không đúng định dạng (cần bắt đầu bằng MATHNOVA_V1:).');
  }

  const encoded = trimmed.slice(BACKUP_PREFIX.length);
  let parsed: { v?: number; workspace?: Partial<AccountWorkspaceData> };
  try {
    const jsonStr = base64ToUtf8(encoded);
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('Không thể giải mã chuỗi sao lưu. Vui lòng kiểm tra lại toàn bộ mã.');
  }

  const ws = parsed?.workspace;
  if (!ws || !ws.profile || !ws.profile.displayName) {
    throw new Error('Dữ liệu hồ sơ trong mã sao lưu không hợp lệ.');
  }

  const now = Date.now();
  const profile: UserAccountProfile = {
    id: ws.profile.id || `acc-${now}-${Math.random().toString(36).slice(2, 7)}`,
    displayName: String(ws.profile.displayName).trim(),
    grade:
      ws.profile.grade === '10' ||
      ws.profile.grade === '11' ||
      ws.profile.grade === '12' ||
      ws.profile.grade === 'thpt'
        ? ws.profile.grade
        : '12',
    avatar: ws.profile.avatar || '🚀',
    createdAt: Number(ws.profile.createdAt) || now,
    updatedAt: now,
  };

  const progress: UserProgress = {
    ...createDefaultUserProgress(todayIso),
    ...(ws.progress || {}),
  };
  progress.streak = refreshStreakOnLoad(
    progress.streak,
    progress.lastCompletedActivityDate,
    todayIso
  );

  return {
    profile,
    progress,
    chatHistory:
      Array.isArray(ws.chatHistory) && ws.chatHistory.length > 0
        ? ws.chatHistory
        : createDefaultWelcomeChat(),
    drawnHistory: Array.isArray(ws.drawnHistory) ? ws.drawnHistory : [],
    wrongNotebook: Array.isArray(ws.wrongNotebook) ? ws.wrongNotebook : [],
  };
}

export interface RealLeaderboardUser {
  id: string;
  displayName: string;
  avatar: string;
  grade: GradeLevel;
  xp: number;
  streak: number;
}

export interface CustomFirebaseConfig {
  projectId: string;
  appId?: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

export function buildRankedLeaderboard(
  realUsers: RealLeaderboardUser[],
  sortBy: 'streak' | 'xp',
  currentUserId?: string | null
): LeaderboardEntry[] {
  const deduped = new Map<string, RealLeaderboardUser>();
  for (const user of realUsers) {
    if (!user?.id || !user?.displayName) continue;
    deduped.set(user.id, user);
  }

  const pool: Array<Omit<LeaderboardEntry, 'rank'>> = Array.from(deduped.values()).map(
    (u) => ({
      id: u.id,
      displayName: u.displayName,
      avatar: u.avatar || '🚀',
      grade: u.grade || '12',
      xp: Math.max(0, Number(u.xp) || 0),
      streak: Math.max(0, Number(u.streak) || 0),
      isCurrentUser: Boolean(currentUserId && u.id === currentUserId),
    })
  );

  const sorted = [...pool].sort((a, b) => {
    if (sortBy === 'streak') {
      if (b.streak !== a.streak) return b.streak - a.streak;
      if (b.xp !== a.xp) return b.xp - a.xp;
    } else {
      if (b.xp !== a.xp) return b.xp - a.xp;
      if (b.streak !== a.streak) return b.streak - a.streak;
    }
    if (a.isCurrentUser !== b.isCurrentUser) {
      return a.isCurrentUser ? -1 : 1;
    }
    return a.displayName.localeCompare(b.displayName, 'vi');
  });

  return sorted.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}

export function normalizeAuthIdentifier(rawInput: string): {
  email: string;
  displayNameHint: string;
  isUsernameOnly: boolean;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Vui lòng nhập Tên đăng nhập hoặc Email.');
  }

  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    const parts = email.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1].includes('.')) {
      throw new Error('Địa chỉ Email không hợp lệ.');
    }
    return {
      email,
      displayNameHint: trimmed.split('@')[0] || 'Học viên',
      isUsernameOnly: false,
    };
  }

  const normalizedLocal = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');

  if (normalizedLocal.length < 3) {
    throw new Error('Tên đăng nhập cần tối thiểu 3 ký tự chữ cái hoặc số.');
  }

  return {
    email: `${normalizedLocal}@mathnova.app`,
    displayNameHint: trimmed,
    isUsernameOnly: true,
  };
}

export function parseFirebaseConfigInput(rawText: string): CustomFirebaseConfig {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Vui lòng dán đoạn cấu hình Firebase JSON hoặc firebaseConfig.');
  }

  // Strip JS wrapper if user pasted directly from Firebase Console
  let candidate = trimmed
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim();

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Không tìm thấy khối cấu hình dạng { ... } hợp lệ.');
  }
  candidate = candidate.slice(firstBrace, lastBrace + 1);

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    // Support JS object literal format (single quotes, unquoted keys, trailing commas)
    const jsonLike = candidate
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner: string) =>
        JSON.stringify(inner)
      )
      .replace(/([{,]\s*)([a-zA-Z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
      .replace(/,\s*([}\]])/g, '$1');
    try {
      parsed = JSON.parse(jsonLike) as Record<string, unknown>;
    } catch {
      throw new Error(
        'Cú pháp Firebase JSON không hợp lệ. Vui lòng kiểm tra lại dấu ngoặc và dấu phẩy.'
      );
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Dữ liệu cấu hình Firebase phải là một JSON Object.');
  }

  const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
  const authDomain = typeof parsed.authDomain === 'string' ? parsed.authDomain.trim() : '';
  const projectId = typeof parsed.projectId === 'string' ? parsed.projectId.trim() : '';

  if (!apiKey || !authDomain || !projectId) {
    throw new Error(
      'Cấu hình Firebase bắt buộc phải có đủ 3 trường: "apiKey", "authDomain" và "projectId".'
    );
  }

  const result: CustomFirebaseConfig = {
    apiKey,
    authDomain,
    projectId,
  };

  if (typeof parsed.appId === 'string' && parsed.appId.trim()) {
    result.appId = parsed.appId.trim();
  }
  if (typeof parsed.firestoreDatabaseId === 'string' && parsed.firestoreDatabaseId.trim()) {
    result.firestoreDatabaseId = parsed.firestoreDatabaseId.trim();
  }
  if (typeof parsed.storageBucket === 'string' && parsed.storageBucket.trim()) {
    result.storageBucket = parsed.storageBucket.trim();
  }
  if (typeof parsed.messagingSenderId === 'string' && parsed.messagingSenderId.trim()) {
    result.messagingSenderId = parsed.messagingSenderId.trim();
  }
  if (typeof parsed.measurementId === 'string' && parsed.measurementId.trim()) {
    result.measurementId = parsed.measurementId.trim();
  }

  return result;
}

export function sanitizeChatHistoryForFirestore(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.slice(-60).map((m) => {
    if (m.imageDataUrl && m.imageDataUrl.length > 2000) {
      return {
        id: m.id,
        role: m.role,
        content: m.content.includes('[Ảnh đề toán]')
          ? m.content
          : `[Ảnh đề toán] ${m.content}`,
        timestamp: m.timestamp,
      };
    }
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      ...(m.imageDataUrl ? { imageDataUrl: m.imageDataUrl } : {}),
      timestamp: m.timestamp,
    };
  });
}

export function loadAccountStore(
  todayIso: string = getTodayIsoDate()
): AccountStoreState {
  const empty: AccountStoreState = { activeAccountId: null, accounts: {} };
  if (typeof localStorage === 'undefined') return empty;
  try {
    const raw = localStorage.getItem(ACCOUNT_STORE_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<AccountStoreState>;
    const accounts: Record<string, AccountWorkspaceData> = {};
    if (parsed.accounts && typeof parsed.accounts === 'object') {
      for (const [id, ws] of Object.entries(parsed.accounts)) {
        if (!ws || !ws.profile) continue;
        const progress: UserProgress = {
          ...createDefaultUserProgress(todayIso),
          ...(ws.progress || {}),
        };
        progress.streak = refreshStreakOnLoad(
          progress.streak,
          progress.lastCompletedActivityDate,
          todayIso
        );
        accounts[id] = {
          profile: ws.profile,
          progress,
          chatHistory:
            Array.isArray(ws.chatHistory) && ws.chatHistory.length > 0
              ? ws.chatHistory
              : createDefaultWelcomeChat(),
          drawnHistory: Array.isArray(ws.drawnHistory) ? ws.drawnHistory : [],
          wrongNotebook: Array.isArray(ws.wrongNotebook) ? ws.wrongNotebook : [],
        };
      }
    }
    const activeAccountId =
      parsed.activeAccountId && accounts[parsed.activeAccountId]
        ? parsed.activeAccountId
        : null;
    return { activeAccountId, accounts };
  } catch {
    return empty;
  }
}

export function saveAccountStore(store: AccountStoreState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ACCOUNT_STORE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota errors
  }
}
