import React, { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { CURRICULUM_CHAPTERS } from './data/curriculum';
import {
  AccountWorkspaceData,
  ChatMessage,
  CustomReminder,
  DrawnShapeRecord,
  FormulaMasteryStatus,
  GradeLevel,
  TabId,
  UserProgress,
  WrongQuestionEntry,
} from './types';
import { filterChaptersByGrade } from './utils/curriculumFilter';
import { buildTopicKey } from './utils/roadmapLogic';
import {
  appendDrawnShape,
  appendWrongQuestion,
  createDefaultUserProgress,
  createDefaultWelcomeChat,
  getTodayIsoDate,
  importAccountBackupCode,
  normalizeProgressForFirestore,
  RealLeaderboardUser,
  recordDailyActivityStreak,
  refreshStreakOnLoad,
  removeWrongQuestion,
  sanitizeChatHistoryForFirestore,
  sanitizeForFirestore,
  toggleWrongQuestionMastered,
} from './utils/accountStore';
import {
  fetchHealthStatus,
  getSavedApiKey,
  saveApiKey,
} from './utils/api';
import {
  getFirebaseRuntime,
  handleFirestoreError,
  inferAuthProviderKind,
  OperationType,
  signOutFirebase,
  subscribeFirebaseRuntimeChange,
  updateFirebaseDisplayName,
} from './firebase';
import { HeaderBar } from './components/HeaderBar';
import { DashboardView } from './components/DashboardView';
import { FormulaVaultView } from './components/FormulaVaultView';
import { GameArenaView } from './components/GameArenaView';
import { ExamGeneratorView } from './components/ExamGeneratorView';
import { SocraticTutorView } from './components/SocraticTutorView';
import { MathLabView } from './components/MathLabView';
import { LeaderboardView } from './components/LeaderboardView';
import { ComicReaderView } from './components/ComicReaderView';
import { AccountModal } from './components/AccountModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { MathNovaLogo } from './components/MathNovaLogo';

const STORAGE_PROGRESS_KEY = 'toanthpt_progress_v1';
const STORAGE_THEME_KEY = 'toanthpt_theme_v1';
const STORAGE_GRADE_KEY = 'toanthpt_grade_v1';
const STORAGE_GUEST_DRAWN_KEY = 'mathnova_guest_drawn_v1';
const STORAGE_GUEST_NOTEBOOK_KEY = 'mathnova_guest_notebook_v1';

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Đã xảy ra lỗi hệ thống.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070B19] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl bg-[#0F172A] border border-rose-500/30 p-6 space-y-4 text-center">
            <h1 className="text-lg font-extrabold text-white">
              MathNova AI gặp sự cố kết nối
            </h1>
            <p className="text-xs text-slate-300 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold"
            >
              Tải lại ứng dụng
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function loadInitialGuestProgress(): UserProgress {
  const today = getTodayIsoDate();
  const fallback = createDefaultUserProgress(today);

  try {
    const raw = localStorage.getItem(STORAGE_PROGRESS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<UserProgress>;
    const normalized = normalizeProgressForFirestore(parsed, today);
    const streak = refreshStreakOnLoad(
      normalized.streak,
      normalized.lastCompletedActivityDate,
      today
    );
    return {
      ...normalized,
      streak,
      lastActiveDate: today,
    };
  } catch {
    return fallback;
  }
}

function loadJsonArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function sanitizeGrade(raw: unknown): GradeLevel {
  if (raw === '10' || raw === '11' || raw === '12' || raw === 'thpt') {
    return raw;
  }
  return '12';
}

function MathNovaAppContent() {
  const [firebaseVersion, setFirebaseVersion] = useState(0);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [activeAccount, setActiveAccount] = useState<AccountWorkspaceData | null>(
    null
  );
  const [realLeaderboardUsers, setRealLeaderboardUsers] = useState<
    RealLeaderboardUser[]
  >([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState<boolean>(true);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const pendingSignupProfileRef = useRef<{
    displayName: string;
    grade: GradeLevel;
    avatar: string;
  } | null>(null);

  const [grade, setGrade] = useState<GradeLevel>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_GRADE_KEY) as GradeLevel | null;
      if (saved === '10' || saved === '11' || saved === '12' || saved === 'thpt') {
        return saved;
      }
    } catch {
      // ignore
    }
    return '12';
  });

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [preferredMiniGame, setPreferredMiniGame] = useState<
    'matching' | 'sprint' | 'obstacle' | 'survival' | undefined
  >(undefined);
  const [preferredArenaMode, setPreferredArenaMode] = useState<
    'minigames' | 'millionaire' | undefined
  >(undefined);
  const [gameLaunchSignal, setGameLaunchSignal] = useState<number>(0);

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      if (saved !== null) return saved === 'dark';
    } catch {
      // ignore
    }
    return false;
  });

  const [guestProgress, setGuestProgress] = useState<UserProgress>(
    loadInitialGuestProgress
  );
  const [guestDrawnHistory, setGuestDrawnHistory] = useState<DrawnShapeRecord[]>(
    () => loadJsonArray<DrawnShapeRecord>(STORAGE_GUEST_DRAWN_KEY)
  );
  const [guestWrongNotebook, setGuestWrongNotebook] = useState<WrongQuestionEntry[]>(
    () => loadJsonArray<WrongQuestionEntry>(STORAGE_GUEST_NOTEBOOK_KEY)
  );
  const [guestChatHistory, setGuestChatHistory] = useState<ChatMessage[]>(() =>
    createDefaultWelcomeChat()
  );

  const [apiKey, setApiKey] = useState<string>(() => getSavedApiKey());
  const [hasServerKey, setHasServerKey] = useState<boolean>(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);
  const [apiKeyModalInitialTab, setApiKeyModalInitialTab] = useState<
    'gemini' | 'firebase'
  >('gemini');
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);

  const guestSnapshotRef = useRef({
    grade,
    guestProgress,
    guestDrawnHistory,
    guestWrongNotebook,
    guestChatHistory,
  });
  guestSnapshotRef.current = {
    grade,
    guestProgress,
    guestDrawnHistory,
    guestWrongNotebook,
    guestChatHistory,
  };

  const activeProgress = activeAccount ? activeAccount.progress : guestProgress;
  const activeDrawnHistory = activeAccount
    ? activeAccount.drawnHistory
    : guestDrawnHistory;
  const activeWrongNotebook = activeAccount
    ? activeAccount.wrongNotebook
    : guestWrongNotebook;
  const activeChatHistory = activeAccount
    ? activeAccount.chatHistory
    : guestChatHistory;

  // Listen for custom Firebase JSON overrides from Settings Modal
  useEffect(() => {
    return subscribeFirebaseRuntimeChange(() => {
      setFirebaseVersion((v) => v + 1);
    });
  }, []);

  // Subscribe to real Cloud Firestore Leaderboard (100% real users only)
  useEffect(() => {
    const { db } = getFirebaseRuntime();
    setIsLoadingLeaderboard(true);
    setLeaderboardError(null);

    const leaderboardQuery = query(
      collection(db, 'leaderboard'),
      orderBy('xp', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      leaderboardQuery,
      (snapshot) => {
        const users: RealLeaderboardUser[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          users.push({
            id: docSnap.id,
            displayName: String(data.displayName || 'Học viên'),
            avatar: String(data.avatar || '🚀'),
            grade: sanitizeGrade(data.grade),
            xp: Number(data.xp) || 0,
            streak: Number(data.streak) || 0,
          });
        });
        setRealLeaderboardUsers(users);
        setIsLoadingLeaderboard(false);
        setLeaderboardError(null);
      },
      (err) => {
        setIsLoadingLeaderboard(false);
        setLeaderboardError(
          'Không thể đồng bộ Bảng Xếp Hạng từ Cloud Firestore lúc này. Vui lòng kiểm tra kết nối hoặc Cấu hình Firebase JSON.'
        );
        try {
          handleFirestoreError(err, OperationType.LIST, 'leaderboard');
        } catch {
          // Structured error logged inside handleFirestoreError
        }
      }
    );

    return () => unsubscribe();
  }, [firebaseVersion]);

  // Subscribe to Firebase Auth & User Workspace Document
  useEffect(() => {
    const { auth, db } = getFirebaseRuntime();
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (!user) {
        setActiveAccount(null);
        return;
      }

      const userDocRef = doc(db, 'users', user.uid);
      const leaderboardDocRef = doc(db, 'leaderboard', user.uid);
      const today = getTodayIsoDate();

      try {
        const existingSnap = await getDoc(userDocRef);
        const provider = inferAuthProviderKind(user);

        if (!existingSnap.exists()) {
          const pending = pendingSignupProfileRef.current;
          pendingSignupProfileRef.current = null;
          const guestSnap = guestSnapshotRef.current;

          const fallbackName =
            pending?.displayName ||
            user.displayName ||
            user.email?.split('@')[0] ||
            'Học viên MathNova';
          const initialName = fallbackName.trim().slice(0, 60) || 'Học viên';
          const initialGrade = sanitizeGrade(pending?.grade ?? guestSnap.grade);
          const initialAvatar = pending?.avatar || '🚀';

          const initialProgress = normalizeProgressForFirestore(
            {
              ...guestSnap.guestProgress,
              lastActiveDate: today,
            },
            today
          );
          const initialChats = sanitizeChatHistoryForFirestore(
            guestSnap.guestChatHistory.length > 1
              ? guestSnap.guestChatHistory
              : createDefaultWelcomeChat()
          );
          const initialDrawn = guestSnap.guestDrawnHistory.slice(0, 30);
          const initialWrong = guestSnap.guestWrongNotebook.slice(0, 100);

          await setDoc(
            userDocRef,
            sanitizeForFirestore({
              uid: user.uid,
              displayName: initialName,
              email: (user.email || '').slice(0, 120),
              provider,
              grade: initialGrade,
              avatar: initialAvatar,
              progress: initialProgress,
              chatHistory: initialChats,
              drawnHistory: initialDrawn,
              wrongNotebook: initialWrong,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          );

          await setDoc(
            leaderboardDocRef,
            sanitizeForFirestore({
              uid: user.uid,
              displayName: initialName,
              avatar: initialAvatar,
              grade: initialGrade,
              xp: Math.max(0, Number(initialProgress.xp) || 0),
              streak: Math.max(0, Number(initialProgress.streak) || 0),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          );
        } else {
          // Ensure public leaderboard entry also exists for returning users
          const lbSnap = await getDoc(leaderboardDocRef);
          const data = existingSnap.data();
          if (!lbSnap.exists()) {
            const p = normalizeProgressForFirestore(
              data.progress as Partial<UserProgress> | undefined,
              today
            );
            await setDoc(
              leaderboardDocRef,
              sanitizeForFirestore({
                uid: user.uid,
                displayName: String(data.displayName || user.displayName || 'Học viên').slice(0, 60),
                avatar: String(data.avatar || '🚀').slice(0, 16),
                grade: sanitizeGrade(data.grade),
                xp: Math.max(0, Number(p.xp) || 0),
                streak: Math.max(0, Number(p.streak) || 0),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
            );
          }
        }
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        } catch {
          // Error already logged with context
        }
      }

      unsubscribeUserDoc = onSnapshot(
        userDocRef,
        (docSnap) => {
          if (!docSnap.exists()) return;
          const data = docSnap.data();
          const rawProgress = (data.progress ?? {}) as Partial<UserProgress>;
          const mergedProgress = normalizeProgressForFirestore(rawProgress, today);
          mergedProgress.streak = refreshStreakOnLoad(
            mergedProgress.streak,
            mergedProgress.lastCompletedActivityDate,
            today
          );

          const workspace: AccountWorkspaceData = {
            profile: {
              id: user.uid,
              uid: user.uid,
              email: typeof data.email === 'string' ? data.email : user.email ?? '',
              provider:
                data.provider === 'google' ||
                data.provider === 'facebook' ||
                data.provider === 'password'
                  ? data.provider
                  : inferAuthProviderKind(user),
              displayName: String(
                data.displayName || user.displayName || 'Học viên'
              ),
              grade: sanitizeGrade(data.grade),
              avatar: String(data.avatar || '🚀'),
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            progress: mergedProgress,
            chatHistory:
              Array.isArray(data.chatHistory) && data.chatHistory.length > 0
                ? (data.chatHistory as ChatMessage[])
                : createDefaultWelcomeChat(),
            drawnHistory: Array.isArray(data.drawnHistory)
              ? (data.drawnHistory as DrawnShapeRecord[])
              : [],
            wrongNotebook: Array.isArray(data.wrongNotebook)
              ? (data.wrongNotebook as WrongQuestionEntry[])
              : [],
          };

          setActiveAccount(workspace);
          setGrade(workspace.profile.grade);
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
          } catch {
            // Logged structured context
          }
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, [firebaseVersion]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(STORAGE_THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_GRADE_KEY, grade);
    } catch {
      // ignore
    }
  }, [grade]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PROGRESS_KEY, JSON.stringify(guestProgress));
    } catch {
      // ignore
    }
  }, [guestProgress]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_GUEST_DRAWN_KEY,
        JSON.stringify(guestDrawnHistory)
      );
    } catch {
      // ignore
    }
  }, [guestDrawnHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_GUEST_NOTEBOOK_KEY,
        JSON.stringify(guestWrongNotebook)
      );
    } catch {
      // ignore
    }
  }, [guestWrongNotebook]);

  useEffect(() => {
    fetchHealthStatus().then((status) => {
      setHasServerKey(status.hasServerKey);
    });
  }, []);

  const persistWorkspaceFields = useCallback(
    async (
      uid: string,
      fields: Partial<{
        displayName: string;
        grade: GradeLevel;
        avatar: string;
        progress: UserProgress;
        chatHistory: ChatMessage[];
        drawnHistory: DrawnShapeRecord[];
        wrongNotebook: WrongQuestionEntry[];
      }>,
      leaderboardSync?: {
        displayName: string;
        avatar: string;
        grade: GradeLevel;
        xp: number;
        streak: number;
      }
    ) => {
      const { db } = getFirebaseRuntime();
      const sanitizedFields = sanitizeForFirestore({
        ...fields,
        ...(fields.progress
          ? { progress: normalizeProgressForFirestore(fields.progress) }
          : {}),
        updatedAt: serverTimestamp(),
      });

      try {
        await updateDoc(doc(db, 'users', uid), sanitizedFields);
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
        } catch {
          // Structured error logged
        }
      }

      if (leaderboardSync) {
        const cleanDisplayName =
          (leaderboardSync.displayName || 'Học viên').trim().slice(0, 60) || 'Học viên';
        const cleanAvatar = (leaderboardSync.avatar || '🚀').trim().slice(0, 16) || '🚀';
        const cleanGrade = sanitizeGrade(leaderboardSync.grade);
        const cleanXp = Math.max(0, Number(leaderboardSync.xp) || 0);
        const cleanStreak = Math.max(0, Number(leaderboardSync.streak) || 0);

        const leaderboardRef = doc(db, 'leaderboard', uid);
        try {
          await updateDoc(
            leaderboardRef,
            sanitizeForFirestore({
              displayName: cleanDisplayName,
              avatar: cleanAvatar,
              grade: cleanGrade,
              xp: cleanXp,
              streak: cleanStreak,
              updatedAt: serverTimestamp(),
            })
          );
        } catch (err) {
          const code = (err as { code?: string })?.code ?? '';
          if (code === 'not-found') {
            try {
              await setDoc(
                leaderboardRef,
                sanitizeForFirestore({
                  uid,
                  displayName: cleanDisplayName,
                  avatar: cleanAvatar,
                  grade: cleanGrade,
                  xp: cleanXp,
                  streak: cleanStreak,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                })
              );
              return;
            } catch (createErr) {
              try {
                handleFirestoreError(createErr, OperationType.CREATE, `leaderboard/${uid}`);
              } catch {
                // Structured error logged
              }
              return;
            }
          }
          try {
            handleFirestoreError(err, OperationType.UPDATE, `leaderboard/${uid}`);
          } catch {
            // Structured error logged
          }
        }
      }
    },
    []
  );

  const updateActiveProgress = useCallback(
    (updater: (prev: UserProgress) => UserProgress) => {
      if (firebaseUser && activeAccount) {
        const nextProgress = updater(activeAccount.progress);
        setActiveAccount((prev) =>
          prev
            ? {
                ...prev,
                profile: { ...prev.profile, updatedAt: Date.now() },
                progress: nextProgress,
              }
            : null
        );
        void persistWorkspaceFields(
          firebaseUser.uid,
          { progress: nextProgress },
          {
            displayName: activeAccount.profile.displayName,
            avatar: activeAccount.profile.avatar,
            grade: activeAccount.profile.grade,
            xp: nextProgress.xp,
            streak: nextProgress.streak,
          }
        );
      } else {
        setGuestProgress((prev) => updater(prev));
      }
    },
    [firebaseUser, activeAccount, persistWorkspaceFields]
  );

  const visibleChapters = useMemo(
    () => filterChaptersByGrade(CURRICULUM_CHAPTERS, grade),
    [grade]
  );

  const handleSelectGrade = (nextGrade: GradeLevel) => {
    setGrade(nextGrade);
    setSelectedChapterId(null);
  };

  const handleSelectTab = (tab: TabId) => {
    if (tab !== 'games') {
      setPreferredMiniGame(undefined);
      setPreferredArenaMode(undefined);
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLaunchArena = (
    mode: 'minigames' | 'millionaire',
    gameType?: 'survival'
  ) => {
    if (mode === 'millionaire' && grade !== 'thpt') {
      setGrade('thpt');
      setSelectedChapterId(null);
    }
    setPreferredArenaMode(mode);
    setPreferredMiniGame(mode === 'minigames' ? gameType : undefined);
    setGameLaunchSignal((n) => n + 1);
    setActiveTab('games');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRecordActivity = useCallback(() => {
    const today = getTodayIsoDate();
    updateActiveProgress((prev) => {
      const streakUpdate = recordDailyActivityStreak(
        prev.streak,
        prev.lastCompletedActivityDate,
        today
      );
      return {
        ...prev,
        streak: streakUpdate.streak,
        lastActiveDate: today,
        lastCompletedActivityDate: streakUpdate.lastCompletedActivityDate,
      };
    });
  }, [updateActiveProgress]);

  const handleToggleChapterComplete = useCallback(
    (chapterId: string) => {
      const today = getTodayIsoDate();
      updateActiveProgress((prev) => {
        const exists = prev.completedChapterIds.includes(chapterId);
        const nextCompleted = exists
          ? prev.completedChapterIds.filter((id) => id !== chapterId)
          : [...prev.completedChapterIds, chapterId];
        const xpDelta = exists ? -20 : 20;
        const prevDaily = prev.dailyXp ?? {};
        const nextTodayXp = Math.max(0, (prevDaily[today] ?? 0) + xpDelta);
        return {
          ...prev,
          xp: Math.max(0, prev.xp + xpDelta),
          completedChapterIds: nextCompleted,
          lastStudiedChapterId: chapterId,
          dailyXp: {
            ...prevDaily,
            [today]: nextTodayXp,
          },
        };
      });
    },
    [updateActiveProgress]
  );

  const handleToggleTopicComplete = useCallback(
    (chapterId: string, topicIndex: number) => {
      const today = getTodayIsoDate();
      const key = buildTopicKey(chapterId, topicIndex);
      updateActiveProgress((prev) => {
        const prevTopics = prev.completedTopicKeys ?? [];
        const exists = prevTopics.includes(key);
        const nextTopics = exists
          ? prevTopics.filter((item) => item !== key)
          : [...prevTopics, key];
        const xpDelta = exists ? -5 : 5;
        const prevDaily = prev.dailyXp ?? {};
        const nextTodayXp = Math.max(0, (prevDaily[today] ?? 0) + xpDelta);
        return {
          ...prev,
          xp: Math.max(0, prev.xp + xpDelta),
          completedTopicKeys: nextTopics,
          lastStudiedChapterId: chapterId,
          dailyXp: {
            ...prevDaily,
            [today]: nextTodayXp,
          },
        };
      });
    },
    [updateActiveProgress]
  );

  const handleRecordGameResult = useCallback(
    (params: {
      xpEarned: number;
      answeredDelta: number;
      correctDelta: number;
      finishedGame?: boolean;
    }) => {
      const today = getTodayIsoDate();
      updateActiveProgress((prev) => {
        const prevDaily = prev.dailyXp ?? {};
        return {
          ...prev,
          xp: prev.xp + params.xpEarned,
          questionsAnswered: prev.questionsAnswered + params.answeredDelta,
          questionsCorrect: prev.questionsCorrect + params.correctDelta,
          gamesPlayed: prev.gamesPlayed + (params.finishedGame ? 1 : 0),
          dailyXp: {
            ...prevDaily,
            [today]: (prevDaily[today] ?? 0) + params.xpEarned,
          },
        };
      });
    },
    [updateActiveProgress]
  );

  const handleUpdateMillionaireUrl = useCallback(
    (url: string) => {
      updateActiveProgress((prev) => ({
        ...prev,
        millionaireUrl: url,
      }));
    },
    [updateActiveProgress]
  );

  const handleSetFormulaMastery = useCallback(
    (formulaId: string, status: FormulaMasteryStatus) => {
      const today = getTodayIsoDate();
      const matchedChapter = CURRICULUM_CHAPTERS.find((c) =>
        c.formulas.some((f) => f.id === formulaId)
      );
      updateActiveProgress((prev) => {
        const prevMap = prev.formulaMastery ?? {};
        const prevStatus = prevMap[formulaId] ?? 'unlearned';
        const xpDelta =
          prevStatus !== 'mastered' && status === 'mastered'
            ? 5
            : prevStatus === 'mastered' && status !== 'mastered'
            ? -5
            : 0;
        const prevDaily = prev.dailyXp ?? {};
        return {
          ...prev,
          xp: Math.max(0, prev.xp + xpDelta),
          lastStudiedChapterId: matchedChapter?.id ?? prev.lastStudiedChapterId ?? '',
          formulaMastery: {
            ...prevMap,
            [formulaId]: status,
          },
          dailyXp:
            xpDelta !== 0
              ? {
                  ...prevDaily,
                  [today]: Math.max(0, (prevDaily[today] ?? 0) + xpDelta),
                }
              : prevDaily,
        };
      });
    },
    [updateActiveProgress]
  );

  const handleRecordWrongQuestion = useCallback(
    (
      entry: Omit<
        WrongQuestionEntry,
        'id' | 'questionKey' | 'wrongCount' | 'lastWrongAt'
      >
    ) => {
      if (firebaseUser && activeAccount) {
        const nextNotebook = appendWrongQuestion(activeAccount.wrongNotebook, entry);
        setActiveAccount((prev) =>
          prev ? { ...prev, wrongNotebook: nextNotebook } : null
        );
        void persistWorkspaceFields(firebaseUser.uid, {
          wrongNotebook: nextNotebook,
        });
      } else {
        setGuestWrongNotebook((prev) => appendWrongQuestion(prev, entry));
      }
    },
    [firebaseUser, activeAccount, persistWorkspaceFields]
  );

  const handleToggleWrongMastered = useCallback(
    (entryId: string) => {
      if (firebaseUser && activeAccount) {
        const nextNotebook = toggleWrongQuestionMastered(
          activeAccount.wrongNotebook,
          entryId
        );
        setActiveAccount((prev) =>
          prev ? { ...prev, wrongNotebook: nextNotebook } : null
        );
        void persistWorkspaceFields(firebaseUser.uid, {
          wrongNotebook: nextNotebook,
        });
      } else {
        setGuestWrongNotebook((prev) =>
          toggleWrongQuestionMastered(prev, entryId)
        );
      }
    },
    [firebaseUser, activeAccount, persistWorkspaceFields]
  );

  const handleDeleteWrongEntry = useCallback(
    (entryId: string) => {
      if (firebaseUser && activeAccount) {
        const nextNotebook = removeWrongQuestion(
          activeAccount.wrongNotebook,
          entryId
        );
        setActiveAccount((prev) =>
          prev ? { ...prev, wrongNotebook: nextNotebook } : null
        );
        void persistWorkspaceFields(firebaseUser.uid, {
          wrongNotebook: nextNotebook,
        });
      } else {
        setGuestWrongNotebook((prev) => removeWrongQuestion(prev, entryId));
      }
    },
    [firebaseUser, activeAccount, persistWorkspaceFields]
  );

  const handleSaveDrawnShape = useCallback(
    (shape: Omit<DrawnShapeRecord, 'id' | 'timestamp'>) => {
      if (firebaseUser && activeAccount) {
        const nextDrawn = appendDrawnShape(activeAccount.drawnHistory, shape);
        setActiveAccount((prev) =>
          prev ? { ...prev, drawnHistory: nextDrawn } : null
        );
        void persistWorkspaceFields(firebaseUser.uid, {
          drawnHistory: nextDrawn,
        });
      } else {
        setGuestDrawnHistory((prev) => appendDrawnShape(prev, shape));
      }
    },
    [firebaseUser, activeAccount, persistWorkspaceFields]
  );

  const handleChatMessagesChange = useCallback(
    (msgs: ChatMessage[]) => {
      const trimmed = msgs.slice(-60);
      if (firebaseUser && activeAccount) {
        const sanitized = sanitizeChatHistoryForFirestore(trimmed);
        setActiveAccount((prev) =>
          prev ? { ...prev, chatHistory: trimmed } : null
        );
        void persistWorkspaceFields(firebaseUser.uid, {
          chatHistory: sanitized,
        });
      } else {
        setGuestChatHistory(trimmed);
      }
    },
    [firebaseUser, activeAccount, persistWorkspaceFields]
  );

  const handleUpdateProfile = async (params: {
    displayName: string;
    grade: GradeLevel;
    avatar: string;
  }) => {
    if (!firebaseUser || !activeAccount) return;

    const cleanName = params.displayName.trim().slice(0, 60);
    setActiveAccount((prev) =>
      prev
        ? {
            ...prev,
            profile: {
              ...prev.profile,
              displayName: cleanName,
              grade: params.grade,
              avatar: params.avatar,
              updatedAt: Date.now(),
            },
          }
        : null
    );
    setGrade(params.grade);

    try {
      await updateFirebaseDisplayName(cleanName);
    } catch {
      // Non-fatal if Firebase Auth profile update throttles
    }

    await persistWorkspaceFields(
      firebaseUser.uid,
      {
        displayName: cleanName,
        grade: params.grade,
        avatar: params.avatar,
      },
      {
        displayName: cleanName,
        avatar: params.avatar,
        grade: params.grade,
        xp: activeAccount.progress.xp,
        streak: activeAccount.progress.streak,
      }
    );
  };

  const handleLogout = async () => {
    await signOutFirebase();
    setActiveAccount(null);
  };

  const handleImportBackupCode = async (code: string) => {
    const imported = importAccountBackupCode(code);
    if (firebaseUser && activeAccount) {
      const mergedProgress = imported.progress;
      const sanitizedChat = sanitizeChatHistoryForFirestore(imported.chatHistory);
      const drawn = imported.drawnHistory.slice(0, 30);
      const wrong = imported.wrongNotebook.slice(0, 100);

      setActiveAccount((prev) =>
        prev
          ? {
              ...prev,
              progress: mergedProgress,
              chatHistory: imported.chatHistory,
              drawnHistory: drawn,
              wrongNotebook: wrong,
            }
          : null
      );
      await persistWorkspaceFields(
        firebaseUser.uid,
        {
          progress: mergedProgress,
          chatHistory: sanitizedChat,
          drawnHistory: drawn,
          wrongNotebook: wrong,
        },
        {
          displayName: activeAccount.profile.displayName,
          avatar: activeAccount.profile.avatar,
          grade: activeAccount.profile.grade,
          xp: mergedProgress.xp,
          streak: mergedProgress.streak,
        }
      );
    } else {
      setGuestProgress(imported.progress);
      setGuestDrawnHistory(imported.drawnHistory);
      setGuestWrongNotebook(imported.wrongNotebook);
      setGuestChatHistory(imported.chatHistory);
      setGrade(imported.profile.grade);
    }
  };

  const handleSaveApiKey = (newKey: string) => {
    saveApiKey(newKey);
    setApiKey(newKey);
  };

  const handleOpenChapterFormulas = (chapterId: string) => {
    setSelectedChapterId(chapterId);
    updateActiveProgress((prev) => ({ ...prev, lastStudiedChapterId: chapterId }));
    handleSelectTab('formulas');
  };

  const handleOpenChapterGame = (chapterId: string) => {
    setPreferredMiniGame(undefined);
    setSelectedChapterId(chapterId);
    updateActiveProgress((prev) => ({ ...prev, lastStudiedChapterId: chapterId }));
    handleSelectTab('games');
  };

  const handleAddReminder = useCallback(
    (reminder: Omit<CustomReminder, 'id' | 'createdAt' | 'completed'>) => {
      const newRem: CustomReminder = {
        ...reminder,
        id: `rem-${Date.now()}`,
        createdAt: Date.now(),
        completed: false,
      };
      updateActiveProgress((prev) => ({
        ...prev,
        customReminders: [newRem, ...(prev.customReminders || [])],
      }));
    },
    [updateActiveProgress]
  );

  const handleToggleReminder = useCallback(
    (id: string) => {
      updateActiveProgress((prev) => ({
        ...prev,
        customReminders: (prev.customReminders || []).map((r) =>
          r.id === id ? { ...r, completed: !r.completed } : r
        ),
      }));
    },
    [updateActiveProgress]
  );

  const handleDeleteReminder = useCallback(
    (id: string) => {
      updateActiveProgress((prev) => ({
        ...prev,
        customReminders: (prev.customReminders || []).filter((r) => r.id !== id),
      }));
    },
    [updateActiveProgress]
  );

  const handleRecordXpReward = useCallback(
    (xp: number) => {
      handleRecordGameResult({
        xpEarned: xp,
        answeredDelta: 0,
        correctDelta: 0,
      });
    },
    [handleRecordGameResult]
  );

  const [isEnergyModalOpen, setIsEnergyModalOpen] = useState(false);

  const handleConsumeEnergy = useCallback((): boolean => {
    const current = typeof activeProgress.energy === 'number' ? activeProgress.energy : 5;
    if (current <= 0) {
      setIsEnergyModalOpen(true);
      return false;
    }
    updateActiveProgress((prev) => ({
      ...prev,
      energy: Math.max(0, (prev.energy ?? 5) - 1),
    }));
    return true;
  }, [activeProgress.energy, updateActiveProgress]);

  const handleAddEnergy = useCallback((amount: number) => {
    updateActiveProgress((prev) => ({
      ...prev,
      energy: Math.min(5, (prev.energy ?? 5) + amount),
    }));
  }, [updateActiveProgress]);

  const handleClaimComicReward = useCallback((): boolean => {
    const today = getTodayIsoDate();
    if (activeProgress.lastComicRewardDate === today) {
      return false;
    }
    updateActiveProgress((prev) => {
      if (prev.lastComicRewardDate === today) return prev;
      const prevDaily = prev.dailyXp ?? {};
      const streakUpdate = recordDailyActivityStreak(
        prev.streak,
        prev.lastCompletedActivityDate,
        today
      );
      return {
        ...prev,
        xp: prev.xp + 15,
        energy: Math.min(10, (prev.energy ?? 5) + 2),
        lastComicRewardDate: today,
        streak: streakUpdate.streak,
        lastActiveDate: today,
        lastCompletedActivityDate: streakUpdate.lastCompletedActivityDate,
        dailyXp: {
          ...prevDaily,
          [today]: (prevDaily[today] ?? 0) + 15,
        },
      };
    });
    return true;
  }, [activeProgress.lastComicRewardDate, updateActiveProgress]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50/90 via-white to-slate-50 dark:bg-none dark:bg-[#070B19] text-slate-900 dark:text-slate-100 flex flex-col selection:bg-blue-500 selection:text-white">
      <HeaderBar
        grade={grade}
        onSelectGrade={handleSelectGrade}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onLaunchArena={handleLaunchArena}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
        hasCustomKey={Boolean(apiKey)}
        onOpenApiKeyModal={() => {
          setApiKeyModalInitialTab('gemini');
          setIsApiKeyModalOpen(true);
        }}
        activeAccount={activeAccount}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
        energy={typeof activeProgress.energy === 'number' ? activeProgress.energy : 5}
        onOpenEnergyModal={() => setIsEnergyModalOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-20">
        {activeTab === 'dashboard' && (
          <DashboardView
            grade={grade}
            chapters={visibleChapters}
            progress={activeProgress}
            isDark={isDark}
            onToggleChapterComplete={handleToggleChapterComplete}
            onToggleTopicComplete={handleToggleTopicComplete}
            onNavigateTab={handleSelectTab}
            onLaunchSurvival={() => {
              setPreferredArenaMode('minigames');
              setPreferredMiniGame('survival');
              setGameLaunchSignal((n) => n + 1);
              handleSelectTab('games');
            }}
            onOpenChapterFormulas={handleOpenChapterFormulas}
            onOpenChapterGame={handleOpenChapterGame}
            onSelectGrade={handleSelectGrade}
            onAddReminder={handleAddReminder}
            onToggleReminder={handleToggleReminder}
            onDeleteReminder={handleDeleteReminder}
            onRecordXpReward={handleRecordXpReward}
          />
        )}

        {activeTab === 'formulas' && (
          <FormulaVaultView
            grade={grade}
            chapters={visibleChapters}
            selectedChapterId={selectedChapterId}
            onSelectChapterId={setSelectedChapterId}
            onPracticeChapter={handleOpenChapterGame}
            formulaMastery={activeProgress.formulaMastery ?? {}}
            onSetFormulaMastery={handleSetFormulaMastery}
            onRecordResult={handleRecordGameResult}
            onRecordWrongQuestion={handleRecordWrongQuestion}
            onRecordActivity={handleRecordActivity}
            onAddEnergy={handleAddEnergy}
          />
        )}

        {activeTab === 'games' && (
          <GameArenaView
            grade={grade}
            chapters={visibleChapters}
            initialChapterId={selectedChapterId}
            millionaireUrl={activeProgress.millionaireUrl}
            onUpdateMillionaireUrl={handleUpdateMillionaireUrl}
            onRecordResult={handleRecordGameResult}
            onRecordWrongQuestion={handleRecordWrongQuestion}
            onRecordActivity={handleRecordActivity}
            onOpenApiKeyModal={() => {
              setApiKeyModalInitialTab('gemini');
              setIsApiKeyModalOpen(true);
            }}
            energy={typeof activeProgress.energy === 'number' ? activeProgress.energy : 5}
            onConsumeEnergy={handleConsumeEnergy}
            initialGameType={preferredMiniGame}
            initialArenaMode={preferredArenaMode}
            gameLaunchSignal={gameLaunchSignal}
          />
        )}

        {activeTab === 'comics' && (
          <ComicReaderView
            todayIso={getTodayIsoDate()}
            lastComicRewardDate={activeProgress.lastComicRewardDate}
            onClaimComicReward={handleClaimComicReward}
          />
        )}

        {activeTab === 'exam' && (
          <ExamGeneratorView
            grade={grade}
            chapters={visibleChapters}
            onRecordResult={handleRecordGameResult}
            onRecordWrongQuestion={handleRecordWrongQuestion}
            onRecordActivity={handleRecordActivity}
            onOpenApiKeyModal={() => {
              setApiKeyModalInitialTab('gemini');
              setIsApiKeyModalOpen(true);
            }}
          />
        )}

        {activeTab === 'tutor' && (
          <SocraticTutorView
            grade={grade}
            onOpenApiKeyModal={() => {
              setApiKeyModalInitialTab('gemini');
              setIsApiKeyModalOpen(true);
            }}
            accountKey={activeAccount ? activeAccount.profile.id : 'guest'}
            initialMessages={activeChatHistory}
            onMessagesChange={handleChatMessagesChange}
            onRecordActivity={handleRecordActivity}
            onAddEnergy={handleAddEnergy}
          />
        )}

        {activeTab === 'lab' && (
          <MathLabView
            onOpenApiKeyModal={() => {
              setApiKeyModalInitialTab('gemini');
              setIsApiKeyModalOpen(true);
            }}
            drawnHistory={activeDrawnHistory}
            onSaveDrawnShape={handleSaveDrawnShape}
            onRecordActivity={handleRecordActivity}
          />
        )}

        {activeTab === 'leaderboard' && (
          <LeaderboardView
            activeAccount={activeAccount}
            realUsers={realLeaderboardUsers}
            isLoadingLeaderboard={isLoadingLeaderboard}
            leaderboardError={leaderboardError}
            wrongNotebook={activeWrongNotebook}
            onToggleWrongMastered={handleToggleWrongMastered}
            onDeleteWrongEntry={handleDeleteWrongEntry}
            onOpenAccountModal={() => setIsAccountModalOpen(true)}
            onPracticeGames={() => handleSelectTab('games')}
          />
        )}
      </main>

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        activeAccount={activeAccount}
        onUpdateProfile={handleUpdateProfile}
        onLogout={handleLogout}
        onImportBackupCode={handleImportBackupCode}
        onNavigateTab={(tab) => handleSelectTab(tab)}
        onOpenFirebaseSettings={() => {
          setApiKeyModalInitialTab('firebase');
          setIsApiKeyModalOpen(true);
        }}
        pendingSignupProfileRef={pendingSignupProfileRef}
      />

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        apiKey={apiKey}
        onSave={handleSaveApiKey}
        hasServerKey={hasServerKey}
        initialTab={apiKeyModalInitialTab}
      />

      {isEnergyModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setIsEnergyModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-amber-500/40 p-6 space-y-5 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto text-2xl font-bold">
              ⚡
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Hết Lượt Thể Lực Tri Thức!
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Bạn đã dùng hết ⚡ thể lực hôm nay. Hãy ôn tập công thức trong Kho thẻ hoặc hỏi Gia sư AI để tích lũy thêm lượt chơi, hoặc nạp nhanh ngay bây giờ!
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  handleAddEnergy(5);
                  setIsEnergyModalOpen(false);
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-bold shadow-md shadow-amber-500/25"
              >
                Nạp đầy 5 ⚡ Miễn Phí
              </button>
              <button
                type="button"
                onClick={() => setIsEnergyModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-auto py-8 bg-white dark:bg-[#070B19] border-t border-slate-200 dark:border-blue-500/20 text-slate-600 dark:text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MathNovaLogo size={32} />
            <div>
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>MathNova AI</span>
                <span className="text-[10px] text-blue-600 dark:text-cyan-400 font-semibold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-cyan-500/10 border border-blue-200 dark:border-cyan-500/20">
                  GDPT 2018
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Học Toán THPT 10–12 Trực Quan 3D & AI Socratic
              </p>
            </div>
          </div>
          <div className="text-center sm:text-right text-[11px] text-slate-500">
            © 2026 MathNova AI. Nền tảng học toán THPT toàn diện.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <MathNovaAppContent />
    </AppErrorBoundary>
  );
}
