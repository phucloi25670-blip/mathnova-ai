export interface IslandStructureTier {
  level: number;
  name: string;
  emoji: string;
  minDay: number;
  description: string;
}

export const ISLAND_STRUCTURES: IslandStructureTier[] = [
  {
    level: 1,
    name: 'Lều Lá Khởi Đầu',
    emoji: '⛺',
    minDay: 1,
    description: 'Trại trú ẩn cơ bản trên bờ biển Toán học.',
  },
  {
    level: 2,
    name: 'Chòi Gỗ Thông Thái',
    emoji: '🛖',
    minDay: 4,
    description: 'Nơi lưu trữ công thức đại số và hình học.',
  },
  {
    level: 3,
    name: 'Tháp Canh Oxyz',
    emoji: '🗼',
    minDay: 8,
    description: 'Quan sát toàn cảnh không gian ba chiều sắc nét.',
  },
  {
    level: 4,
    name: 'Pháo Đài Tích Phân',
    emoji: '🏰',
    minDay: 14,
    description: 'Thành lũy kiên cố bảo vệ trước mọi bài toán vận dụng cao.',
  },
  {
    level: 5,
    name: 'Kỳ Quan MathNova',
    emoji: '🏛️',
    minDay: 21,
    description: 'Đế chế Toán học bất khả chiến bại trên đảo sinh tồn!',
  },
];

export const SURVIVAL_MAX_HEARTS = 3;
export const SURVIVAL_QUESTION_SECONDS = 30;
export const SURVIVAL_XP_PER_CORRECT = 15;

export interface SurvivalRunState {
  day: number;
  hearts: number;
  shields: number;
  resources: number; // 0..100 progress toward next island structure or shield
  streak: number;
  bestStreak: number;
  xpEarned: number;
  correctCount: number;
  answeredCount: number;
  hasUsedRevive: boolean;
  needsRevive: boolean;
  isGameOver: boolean;
}

export function createInitialSurvivalState(): SurvivalRunState {
  return {
    day: 1,
    hearts: SURVIVAL_MAX_HEARTS,
    shields: 0,
    resources: 0,
    streak: 0,
    bestStreak: 0,
    xpEarned: 0,
    correctCount: 0,
    answeredCount: 0,
    hasUsedRevive: false,
    needsRevive: false,
    isGameOver: false,
  };
}

export function getIslandStructureForDay(day: number): IslandStructureTier {
  let current = ISLAND_STRUCTURES[0];
  for (const tier of ISLAND_STRUCTURES) {
    if (day >= tier.minDay) {
      current = tier;
    }
  }
  return current;
}

export function getNextIslandStructure(day: number): IslandStructureTier | null {
  for (const tier of ISLAND_STRUCTURES) {
    if (day < tier.minDay) {
      return tier;
    }
  }
  return null;
}

export function applySurvivalCorrectAnswer(state: SurvivalRunState): {
  nextState: SurvivalRunState;
  xpGained: number;
  shieldEarned: boolean;
  upgradedStructure: IslandStructureTier | null;
} {
  const prevTier = getIslandStructureForDay(state.day);
  const nextDay = state.day + 1;
  const nextTier = getIslandStructureForDay(nextDay);
  const nextStreak = state.streak + 1;

  // Earn +25 resources per correct answer; at 100 resources grant +1 shield (max 2)
  let nextResources = state.resources + 25;
  let nextShields = state.shields;
  let shieldEarned = false;

  if (nextResources >= 100) {
    nextResources -= 100;
    if (nextShields < 2) {
      nextShields += 1;
      shieldEarned = true;
    }
  }

  return {
    nextState: {
      ...state,
      day: nextDay,
      shields: nextShields,
      resources: nextResources,
      streak: nextStreak,
      bestStreak: Math.max(state.bestStreak, nextStreak),
      xpEarned: state.xpEarned + SURVIVAL_XP_PER_CORRECT,
      correctCount: state.correctCount + 1,
      answeredCount: state.answeredCount + 1,
    },
    xpGained: SURVIVAL_XP_PER_CORRECT,
    shieldEarned,
    upgradedStructure: nextTier.level > prevTier.level ? nextTier : null,
  };
}

export function applySurvivalWrongOrTimeout(state: SurvivalRunState): {
  nextState: SurvivalRunState;
  shieldAbsorbed: boolean;
} {
  if (state.shields > 0) {
    return {
      nextState: {
        ...state,
        shields: state.shields - 1,
        streak: 0,
        answeredCount: state.answeredCount + 1,
      },
      shieldAbsorbed: true,
    };
  }

  const nextHearts = Math.max(0, state.hearts - 1);
  if (nextHearts === 0) {
    if (!state.hasUsedRevive) {
      return {
        nextState: {
          ...state,
          hearts: 0,
          streak: 0,
          answeredCount: state.answeredCount + 1,
          needsRevive: true,
          isGameOver: false,
        },
        shieldAbsorbed: false,
      };
    }
    return {
      nextState: {
        ...state,
        hearts: 0,
        streak: 0,
        answeredCount: state.answeredCount + 1,
        needsRevive: false,
        isGameOver: true,
      },
      shieldAbsorbed: false,
    };
  }

  return {
    nextState: {
      ...state,
      hearts: nextHearts,
      streak: 0,
      answeredCount: state.answeredCount + 1,
    },
    shieldAbsorbed: false,
  };
}

export function resolveSurvivalReviveAttempt(
  state: SurvivalRunState,
  isCorrect: boolean
): SurvivalRunState {
  if (isCorrect) {
    return {
      ...state,
      hearts: 1,
      hasUsedRevive: true,
      needsRevive: false,
      isGameOver: false,
    };
  }
  return {
    ...state,
    hearts: 0,
    hasUsedRevive: true,
    needsRevive: false,
    isGameOver: true,
  };
}
