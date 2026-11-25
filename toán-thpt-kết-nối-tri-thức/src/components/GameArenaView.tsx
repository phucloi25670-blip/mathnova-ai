import React, { useEffect, useMemo, useState } from 'react';
import {
  Tv,
  Sparkles,
  Timer,
  Layers,
  ShieldAlert,
  Play,
  RotateCcw,
  Check,
  X as XIcon,
  ExternalLink,
  Info,
  Trophy,
  Link2,
  Volume2,
  VolumeX,
  Flame,
  Flag,
  Loader2,
} from 'lucide-react';
import {
  ChapterData,
  GradeLevel,
  MatchPair,
  QuizQuestion,
  WrongQuestionEntry,
} from '../types';
import { CURRICULUM_CHAPTERS } from '../data/curriculum';
import { SEED_QUESTIONS } from '../data/seedQuestions';
import {
  generateGameQuestionsApi,
  generateMatchingPairsApi,
} from '../utils/api';
import {
  calculateMultiplierXp,
  buildChapterMatchPairs,
  buildChapterQuickQuiz,
  getComboMultiplier,
} from '../utils/formulaQuiz';
import {
  calculateSprintXp,
  isShortAnswerCorrect,
  scoreTrueFalseStatements,
} from '../utils/gameLogic';
import {
  buildDiversitySeeds,
  drawFromShuffleQueue,
  fisherYatesShuffle,
  getSeenQuestionHistory,
  recordSeenQuestions,
} from '../utils/antiRepetition';
import {
  getSoundMuted,
  playCorrectSound,
  playTickSound,
  playVictorySound,
  playWrongSound,
  setSoundMuted,
} from '../utils/soundFx';
import {
  backgroundRefillExamPool,
  drawGameQuestionPackFromPool,
  ExamPoolStatus,
  peekExamPoolStatus,
  replenishExamPoolWithAiOrLocal,
} from '../utils/examPool';
import { MathBlock, MathText } from './MathText';
import { SurvivalIslandStage } from './SurvivalIslandStage';

interface GameArenaViewProps {
  grade: GradeLevel;
  chapters: ChapterData[];
  initialChapterId: string | null;
  millionaireUrl: string;
  onUpdateMillionaireUrl: (url: string) => void;
  onRecordResult: (params: {
    xpEarned: number;
    answeredDelta: number;
    correctDelta: number;
    finishedGame?: boolean;
  }) => void;
  onRecordWrongQuestion?: (
    entry: Omit<WrongQuestionEntry, 'id' | 'questionKey' | 'wrongCount' | 'lastWrongAt'>
  ) => void;
  onRecordActivity?: () => void;
  onOpenApiKeyModal: () => void;
  energy: number;
  onConsumeEnergy: () => boolean;
  initialGameType?: MiniGameType;
  initialArenaMode?: 'millionaire' | 'minigames';
  gameLaunchSignal?: number;
}

type ArenaMode = 'millionaire' | 'minigames';
type MillionaireSource = 'builtin' | 'custom_url';
type MiniGameType = 'matching' | 'sprint' | 'obstacle' | 'survival';

const BUILTIN_MILLIONAIRE_ASSET_PATH =
  '/assets/aistudio/Paste_November_23__2026_-_10_23PM_c3f75ca9';

const MEMORY_MATCH_TIME_LIMIT = 45;

export const GameArenaView: React.FC<GameArenaViewProps> = ({
  grade,
  chapters,
  initialChapterId,
  millionaireUrl,
  onUpdateMillionaireUrl,
  onRecordResult,
  onRecordWrongQuestion,
  onRecordActivity,
  onOpenApiKeyModal,
  energy,
  onConsumeEnergy,
  initialGameType,
  initialArenaMode,
  gameLaunchSignal = 0,
}) => {
  const isThptMode = grade === 'thpt';
  const [arenaMode, setArenaMode] = useState<ArenaMode>(() =>
    initialArenaMode
      ? initialArenaMode
      : initialGameType
      ? 'minigames'
      : grade === 'thpt' && !initialChapterId
      ? 'millionaire'
      : 'minigames'
  );
  const [millionaireSource, setMillionaireSource] =
    useState<MillionaireSource>('builtin');
  const [builtinHtml, setBuiltinHtml] = useState<string>('');
  const [builtinLoading, setBuiltinLoading] = useState<boolean>(false);
  const [builtinError, setBuiltinError] = useState<string | null>(null);

  const [gameType, setGameType] = useState<MiniGameType>(() => initialGameType || 'sprint');
  const [selectedChapterId, setSelectedChapterId] = useState<string>(
    initialChapterId || 'all'
  );
  const [muted, setMuted] = useState<boolean>(() => getSoundMuted());
  const [poolStatus, setPoolStatus] = useState<ExamPoolStatus>(() =>
    peekExamPoolStatus(grade, chapters)
  );
  const [isReplenishingPool, setIsReplenishingPool] = useState<boolean>(false);

  useEffect(() => {
    setPoolStatus(peekExamPoolStatus(grade, chapters));
  }, [grade, chapters]);

  useEffect(() => {
    if (initialArenaMode) {
      setArenaMode(initialArenaMode);
    }
    if (initialGameType) {
      setArenaMode('minigames');
      setGameType(initialGameType);
      setIsPlaying(false);
    }
  }, [initialGameType, initialArenaMode, gameLaunchSignal]);

  useEffect(() => {
    if (grade !== 'thpt') {
      setArenaMode('minigames');
    } else if (initialArenaMode) {
      setArenaMode(initialArenaMode);
    } else if (!initialChapterId && !initialGameType) {
      setArenaMode('millionaire');
    }
  }, [grade, initialChapterId, initialGameType, initialArenaMode]);

  useEffect(() => {
    if (initialChapterId && chapters.some((c) => c.id === initialChapterId)) {
      setSelectedChapterId(initialChapterId);
      setArenaMode('minigames');
    } else if (
      selectedChapterId !== 'all' &&
      !chapters.some((c) => c.id === selectedChapterId)
    ) {
      setSelectedChapterId('all');
    }
  }, [initialChapterId, chapters, selectedChapterId]);

  useEffect(() => {
    if (!isThptMode) return;
    if (builtinHtml) return;
    let active = true;
    setBuiltinLoading(true);
    setBuiltinError(null);
    fetch(BUILTIN_MILLIONAIRE_ASSET_PATH)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Không thể tải mã nguồn trò chơi Ai Là Triệu Phú.');
        }
        return res.text();
      })
      .then((html) => {
        if (active) {
          setBuiltinHtml(html);
          setBuiltinLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setBuiltinError(
            err instanceof Error ? err.message : 'Lỗi tải trò chơi.'
          );
          setBuiltinLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [isThptMode, builtinHtml]);

  // Millionaire URL bar state
  const [urlInput, setUrlInput] = useState(millionaireUrl);
  const [activeIframeUrl, setActiveIframeUrl] = useState(millionaireUrl);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    setUrlInput(millionaireUrl);
    setActiveIframeUrl(millionaireUrl);
  }, [millionaireUrl]);

  useEffect(() => {
    const handleMillionaireMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin &&
        event.origin !== 'null'
      ) {
        return;
      }
      const payload = event.data as
        | {
            type?: unknown;
            event?: unknown;
            isCorrect?: unknown;
            xpEarned?: unknown;
          }
        | null
        | undefined;
      if (!payload || payload.type !== 'MATHNOVA_MILLIONAIRE_XP') return;

      const xpEarned = Math.min(
        200,
        Math.max(0, Math.round(Number(payload.xpEarned) || 0))
      );
      if (payload.event === 'answer') {
        const isCorrect = Boolean(payload.isCorrect);
        onRecordResult({
          xpEarned,
          answeredDelta: 1,
          correctDelta: isCorrect ? 1 : 0,
          finishedGame: false,
        });
        onRecordActivity?.();
      } else if (payload.event === 'gameover') {
        onRecordResult({
          xpEarned,
          answeredDelta: 0,
          correctDelta: 0,
          finishedGame: true,
        });
        onRecordActivity?.();
      }
    };

    window.addEventListener('message', handleMillionaireMessage);
    return () => window.removeEventListener('message', handleMillionaireMessage);
  }, [onRecordResult, onRecordActivity]);

  // Mini-games shared state
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [fallbackStatus, setFallbackStatus] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  // Speed Quiz 60s timer & Combo multiplier
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [sprintScore, setSprintScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [lastXpFlash, setLastXpFlash] = useState<string | null>(null);

  // Active question answer states
  const [selectedMcq, setSelectedMcq] = useState<number | null>(null);
  const [tfAnswers, setTfAnswers] = useState<
    Record<'a' | 'b' | 'c' | 'd', boolean | null>
  >({ a: null, b: null, c: null, d: null });
  const [shortInput, setShortInput] = useState('');
  const [questionSubmitted, setQuestionSubmitted] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const [obstaclesCleared, setObstaclesCleared] = useState(0);

  // Memory Match state (with countdown limit!)
  const [matchPairs, setMatchPairs] = useState<MatchPair[]>([]);
  const [shuffledRight, setShuffledRight] = useState<MatchPair[]>([]);
  const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [wrongFlashId, setWrongFlashId] = useState<string | null>(null);
  const [matchAttempts, setMatchAttempts] = useState(0);
  const [matchSecondsLeft, setMatchSecondsLeft] = useState(MEMORY_MATCH_TIME_LIMIT);
  const [survivalRunKey, setSurvivalRunKey] = useState(0);
  const [survivalAiQuestions, setSurvivalAiQuestions] = useState<QuizQuestion[]>([]);

  const selectedChapterObj = useMemo(
    () => chapters.find((c) => c.id === selectedChapterId) ?? null,
    [chapters, selectedChapterId]
  );

  const selectedChapterTitle = useMemo(() => {
    if (selectedChapterId === 'all') {
      return grade === 'thpt'
        ? 'Tổng hợp trọng tâm Ôn thi THPT'
        : `Toán Lớp ${grade} tổng hợp`;
    }
    return selectedChapterObj?.title || `Toán Lớp ${grade}`;
  }, [selectedChapterId, selectedChapterObj, grade]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  };

  // Sprint 60s countdown effect
  useEffect(() => {
    if (!isPlaying || isFinished || gameType !== 'sprint') return;
    if (secondsLeft <= 0) {
      setIsFinished(true);
      playVictorySound();
      const bonus = Math.max(0, maxCombo - 1) * 5;
      if (bonus > 0) {
        setSessionXp((s) => s + bonus);
      }
      onRecordResult({
        xpEarned: bonus,
        answeredDelta: 0,
        correctDelta: 0,
        finishedGame: true,
      });
      onRecordActivity?.();
      return;
    }
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 6 && s > 1) playTickSound();
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying, isFinished, gameType, secondsLeft, maxCombo, onRecordResult, onRecordActivity]);

  // Memory Match countdown effect
  useEffect(() => {
    if (!isPlaying || isFinished || gameType !== 'matching') return;
    if (matchSecondsLeft <= 0) {
      setIsFinished(true);
      const earned = matchedIds.length * 10;
      setSessionXp(earned);
      onRecordResult({
        xpEarned: earned,
        answeredDelta: matchedIds.length,
        correctDelta: matchedIds.length,
        finishedGame: true,
      });
      onRecordActivity?.();
      return;
    }
    const timer = window.setInterval(() => {
      setMatchSecondsLeft((s) => {
        if (s <= 6 && s > 1) playTickSound();
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying, isFinished, gameType, matchSecondsLeft, matchedIds.length, onRecordResult, onRecordActivity]);

  const resetRoundStates = () => {
    setCurrentIdx(0);
    setSelectedMcq(null);
    setTfAnswers({ a: null, b: null, c: null, d: null });
    setShortInput('');
    setQuestionSubmitted(false);
    setSessionXp(0);
    setSprintScore(0);
    setCombo(0);
    setMaxCombo(0);
    setLastXpFlash(null);
    setSecondsLeft(60);
    setMatchSecondsLeft(MEMORY_MATCH_TIME_LIMIT);
    setObstaclesCleared(0);
    setIsFinished(false);
    setNoticeMsg(null);
  };

  const getLocalPoolQuestions = (mode: MiniGameType): QuizQuestion[] => {
    const gradePool =
      grade === 'thpt'
        ? SEED_QUESTIONS
        : SEED_QUESTIONS.filter((q) => q.grade === grade);

    const chapterPool =
      selectedChapterId === 'all'
        ? gradePool
        : gradePool.filter((q) => q.chapterId === selectedChapterId);

    const basePool = chapterPool.length > 0 ? chapterPool : gradePool;

    if (mode === 'sprint') {
      const seedMcqs = basePool.filter((q) => q.format === 'multiple_choice');
      const formulaMcqs = selectedChapterObj
        ? buildChapterQuickQuiz(selectedChapterObj, CURRICULUM_CHAPTERS, [])
        : chapters.flatMap((c) => buildChapterQuickQuiz(c, CURRICULUM_CHAPTERS, []));
      const combined = [...seedMcqs, ...formulaMcqs];
      return combined.length > 0
        ? combined
        : SEED_QUESTIONS.filter((q) => q.format === 'multiple_choice');
    }

    // Obstacle mode: prioritize GDPT 2018 4-statement True/False hurdles (+ short answer boss if available)
    const tfFirst = [
      ...basePool.filter((q) => q.format === 'true_false'),
      ...basePool.filter((q) => q.format === 'short_answer'),
    ];
    if (tfFirst.length > 0) return tfFirst;
    return SEED_QUESTIONS.filter((q) => q.format === 'true_false');
  };

  const getLocalMatchPairPool = (): MatchPair[] => {
    if (selectedChapterObj) {
      return buildChapterMatchPairs(grade, selectedChapterObj);
    }
    const chapterPairs: MatchPair[] = chapters.flatMap((c) =>
      c.formulas.map((f) => ({
        id: `pair-${f.id}`,
        leftTitle: f.title,
        rightLatex: f.latex,
      }))
    );
    const seedExtra =
      grade === 'thpt'
        ? [
            ...buildChapterMatchPairs('10', null),
            ...buildChapterMatchPairs('11', null),
            ...buildChapterMatchPairs('12', null),
          ]
        : buildChapterMatchPairs(grade, null);

    const seenLatex = new Set<string>();
    const combined: MatchPair[] = [];
    for (const p of [...chapterPairs, ...seedExtra]) {
      if (!seenLatex.has(p.rightLatex)) {
        seenLatex.add(p.rightLatex);
        combined.push(p);
      }
    }
    return combined;
  };

  const triggerBackgroundPoolRefillIfLow = (status: ExamPoolStatus) => {
    if (status.needsBackgroundRefill) {
      void backgroundRefillExamPool({
        grade,
        chapters,
        onCompleted: (refreshed) => setPoolStatus(refreshed),
      });
    }
  };

  const handleReplenishGamePool = async () => {
    setIsReplenishingPool(true);
    setNoticeMsg(null);
    setFallbackStatus(null);
    try {
      const res = await replenishExamPoolWithAiOrLocal({
        grade,
        chapters,
        onFallbackStatus: (msg) => setFallbackStatus(msg),
      });
      setPoolStatus(res.status);
      setNoticeMsg(
        res.usedAi
          ? `Đã nạp mới 10 bộ đề từ AI & Internet (${res.modelUsed || 'gemini-3.8-flash'}) cho Đấu trường!`
          : 'Đã làm mới 10 bộ đề chuẩn GDPT 2018 trong Kho dự trữ!'
      );
    } finally {
      setIsReplenishingPool(false);
      setFallbackStatus(null);
    }
  };

  const startLocalGame = (modeOverride?: MiniGameType, keepSurvivalAi = false) => {
    if (!onConsumeEnergy()) return;
    const activeType = modeOverride || gameType;
    resetRoundStates();

    if (activeType === 'matching') {
      const pairPool = getLocalMatchPairPool();
      const queueKey = `matching:${grade}:${selectedChapterId}`;
      const drawnPairs = drawFromShuffleQueue(queueKey, pairPool, 5);
      setMatchPairs(drawnPairs);
      setShuffledRight(fisherYatesShuffle(drawnPairs));
      setSelectedLeftId(null);
      setMatchedIds([]);
      setMatchAttempts(0);
      recordSeenQuestions([], drawnPairs);
      setIsPlaying(true);
      return;
    }

    // Draw instant non-repeating question pack from the 10-Exam Pool
    const pack = drawGameQuestionPackFromPool({
      grade,
      chapters,
      selectedChapterId,
    });
    setPoolStatus(pack.status);
    triggerBackgroundPoolRefillIfLow(pack.status);

    if (activeType === 'survival') {
      if (!keepSurvivalAi) {
        setSurvivalAiQuestions(pack.mcQuestions);
        recordSeenQuestions(pack.mcQuestions);
      }
      setSurvivalRunKey((k) => k + 1);
      setIsPlaying(true);
      return;
    }

    if (activeType === 'sprint') {
      const localExtra = getLocalPoolQuestions('sprint');
      const combined = [...pack.mcQuestions, ...fisherYatesShuffle(localExtra)];
      const chosen = combined.slice(0, Math.min(combined.length, 10));
      recordSeenQuestions(chosen);
      setQuestions(chosen);
      setIsPlaying(true);
      return;
    }

    // obstacle mode (True/False + Short Answer)
    const tfSaCombined = [...pack.tfQuestions, ...pack.saQuestions];
    const fallbackPool = getLocalPoolQuestions('obstacle');
    const chosen =
      tfSaCombined.length >= 3
        ? tfSaCombined.slice(0, 3)
        : [...tfSaCombined, ...fisherYatesShuffle(fallbackPool)].slice(0, 3);
    recordSeenQuestions(chosen);
    setQuestions(chosen);
    setIsPlaying(true);
  };

  const startAiGame = async () => {
    if (energy <= 0) {
      onConsumeEnergy();
      return;
    }
    setIsLoadingAi(true);
    setFallbackStatus(null);
    setNoticeMsg(null);
    resetRoundStates();

    const seenQuestions = getSeenQuestionHistory();
    const requestCount =
      gameType === 'matching' ? 5 : gameType === 'sprint' || gameType === 'survival' ? 6 : 3;
    const diversitySeeds = buildDiversitySeeds({
      grade,
      selectedChapterId,
      allChapters: CURRICULUM_CHAPTERS,
      count: requestCount,
    });

    try {
      if (gameType === 'matching') {
        const pairs = await generateMatchingPairsApi({
          grade,
          chapterTitle: selectedChapterTitle,
          count: 5,
          seenQuestions,
          diversitySeeds,
          onFallbackStatus: (statusMsg) => setFallbackStatus(statusMsg),
        });
        if (!pairs.length) throw new Error('EMPTY_AI');
        if (!onConsumeEnergy()) return;
        setMatchPairs(pairs);
        setShuffledRight(fisherYatesShuffle(pairs));
        setSelectedLeftId(null);
        setMatchedIds([]);
        setMatchAttempts(0);
        recordSeenQuestions([], pairs);
        setIsPlaying(true);
      } else if (gameType === 'survival') {
        const aiQuestions = await generateGameQuestionsApi({
          grade,
          chapterTitle: selectedChapterTitle,
          gameType: 'sprint',
          count: requestCount,
          seenQuestions,
          diversitySeeds,
          onFallbackStatus: (statusMsg) => setFallbackStatus(statusMsg),
        });
        if (!aiQuestions.length) throw new Error('EMPTY_AI');
        if (!onConsumeEnergy()) return;
        recordSeenQuestions(aiQuestions);
        setSurvivalAiQuestions(aiQuestions);
        setSurvivalRunKey((k) => k + 1);
        setIsPlaying(true);
      } else {
        const apiGameType = gameType === 'obstacle' ? 'obstacle' : 'sprint';
        const aiQuestions = await generateGameQuestionsApi({
          grade,
          chapterTitle: selectedChapterTitle,
          gameType: apiGameType,
          count: requestCount,
          seenQuestions,
          diversitySeeds,
          onFallbackStatus: (statusMsg) => setFallbackStatus(statusMsg),
        });
        if (!aiQuestions.length) throw new Error('EMPTY_AI');
        if (!onConsumeEnergy()) return;
        recordSeenQuestions(aiQuestions);
        setQuestions(aiQuestions);
        setIsPlaying(true);
      }
    } catch (err) {
      // Seamless fallback to curated GDPT 2018 local Shuffle Queue instead of a harsh error block
      const msg = err instanceof Error ? err.message : '';
      startLocalGame(gameType);
      if (msg.includes('API Key') && !/HTTP\s+\d{3}/.test(msg)) {
        setNoticeMsg(
          'Chưa cài Gemini API Key — đã khởi động ngay với Kho đề chuẩn (đã xáo trộn chống trùng).'
        );
      } else {
        setNoticeMsg(
          'Trò chơi đã tự động mở ngay Kho đề chuẩn chống trùng lặp để bạn trải nghiệm mượt mà.'
        );
      }
    } finally {
      setIsLoadingAi(false);
      setFallbackStatus(null);
    }
  };

  const currentQuestion =
    questions.length > 0 ? questions[currentIdx] : undefined;

  const handleAnswerMcq = (idx: number) => {
    if (questionSubmitted || !currentQuestion) return;
    setSelectedMcq(idx);
    setQuestionSubmitted(true);

    const isCorrect = idx === currentQuestion.correctIndex;
    if (!isCorrect && currentQuestion.options && onRecordWrongQuestion) {
      const rightIdx = currentQuestion.correctIndex ?? 0;
      onRecordWrongQuestion({
        prompt: currentQuestion.prompt,
        format: currentQuestion.format,
        userAnswerText:
          currentQuestion.options[idx] ?? `Đáp án ${String.fromCharCode(65 + idx)}`,
        correctAnswerText:
          currentQuestion.options[rightIdx] ??
          `Đáp án ${String.fromCharCode(65 + rightIdx)}`,
        explanation:
          currentQuestion.explanation ||
          'Xem lại định nghĩa và công thức trọng tâm của chương.',
        chapterTitle: currentQuestion.chapterTitle || selectedChapterTitle,
        grade: currentQuestion.grade || String(grade),
      });
    }

    if (gameType === 'sprint') {
      const nextCombo = isCorrect ? combo + 1 : 0;
      const multiplier = getComboMultiplier(nextCombo);
      const earned = isCorrect ? calculateMultiplierXp(15, nextCombo) : 0;
      setCombo(nextCombo);
      setMaxCombo((prev) => Math.max(prev, nextCombo));
      if (isCorrect) {
        setSprintScore((s) => s + 1);
        setSessionXp((s) => s + earned);
        setLastXpFlash(
          multiplier > 1 ? `+${earned} XP (Combo x${multiplier}!)` : `+${earned} XP`
        );
        playCorrectSound(nextCombo);
      } else {
        setLastXpFlash('Mất chuỗi combo!');
        playWrongSound();
      }
      onRecordResult({
        xpEarned: earned,
        answeredDelta: 1,
        correctDelta: isCorrect ? 1 : 0,
      });
      onRecordActivity?.();

      // Rapid arcade auto-advance during 60s Speed Quiz; refill seamlessly from Shuffle Queue if exhausted
      window.setTimeout(() => {
        const nextIdx = currentIdx + 1;
        if (nextIdx >= questions.length) {
          const pool = getLocalPoolQuestions('sprint');
          const extraBatch = drawFromShuffleQueue(
            `sprint:${grade}:${selectedChapterId}`,
            pool,
            Math.min(pool.length, 6)
          );
          recordSeenQuestions(extraBatch);
          setQuestions((prevQ) => [...prevQ, ...extraBatch]);
        }
        setCurrentIdx(nextIdx);
        setSelectedMcq(null);
        setQuestionSubmitted(false);
      }, 650);
    } else {
      const xp = isCorrect ? 25 : 5;
      setSessionXp((s) => s + xp);
      if (isCorrect) {
        setObstaclesCleared((c) => c + 1);
        playCorrectSound(1);
      } else {
        playWrongSound();
      }
      onRecordResult({
        xpEarned: xp,
        answeredDelta: 1,
        correctDelta: isCorrect ? 1 : 0,
      });
      onRecordActivity?.();
    }
  };

  const handleSubmitTrueFalse = () => {
    if (questionSubmitted || !currentQuestion?.statements) return;
    const { correctCount, xpEarned } = scoreTrueFalseStatements(
      currentQuestion.statements,
      tfAnswers
    );
    if (correctCount < currentQuestion.statements.length && onRecordWrongQuestion) {
      const userAnswerText = currentQuestion.statements
        .map((s) => `${s.id}) ${tfAnswers[s.id] ? 'Đúng' : 'Sai'}`)
        .join(' · ');
      const correctAnswerText = currentQuestion.statements
        .map((s) => `${s.id}) ${s.isTrue ? 'Đúng' : 'Sai'}`)
        .join(' · ');
      onRecordWrongQuestion({
        prompt: currentQuestion.prompt,
        format: 'true_false',
        userAnswerText,
        correctAnswerText,
        explanation:
          currentQuestion.explanation ||
          'Kiểm tra kỹ từng mệnh đề Đúng/Sai để tránh bẫy.',
        chapterTitle: currentQuestion.chapterTitle || selectedChapterTitle,
        grade: currentQuestion.grade || String(grade),
      });
    }
    setQuestionSubmitted(true);
    setSessionXp((s) => s + xpEarned);
    if (correctCount >= 3) {
      setObstaclesCleared((c) => c + 1);
      playCorrectSound(correctCount);
    } else {
      playWrongSound();
    }
    onRecordResult({
      xpEarned,
      answeredDelta: 1,
      correctDelta: correctCount >= 3 ? 1 : 0,
    });
    onRecordActivity?.();
  };

  const handleSubmitShortAnswer = (e: React.FormEvent) => {
    e.preventDefault();
    if (questionSubmitted || !currentQuestion?.shortAnswer) return;
    const ok = isShortAnswerCorrect(shortInput, currentQuestion.shortAnswer);
    if (!ok && onRecordWrongQuestion) {
      onRecordWrongQuestion({
        prompt: currentQuestion.prompt,
        format: 'short_answer',
        userAnswerText: shortInput.trim() || '(Để trống)',
        correctAnswerText: currentQuestion.shortAnswer,
        explanation:
          currentQuestion.explanation ||
          'Kiểm tra lại bước biến đổi và làm tròn kết quả.',
        chapterTitle: currentQuestion.chapterTitle || selectedChapterTitle,
        grade: currentQuestion.grade || String(grade),
      });
    }
    const xp = ok ? 30 : 5;
    setQuestionSubmitted(true);
    setSessionXp((s) => s + xp);
    if (ok) {
      setObstaclesCleared((c) => c + 1);
      playCorrectSound(2);
    } else {
      playWrongSound();
    }
    onRecordResult({
      xpEarned: xp,
      answeredDelta: 1,
      correctDelta: ok ? 1 : 0,
    });
    onRecordActivity?.();
  };

  const handleNextQuestion = () => {
    if (currentIdx + 1 >= questions.length) {
      setIsFinished(true);
      playVictorySound();
      if (gameType === 'sprint') {
        const bonus = calculateSprintXp(sprintScore, maxCombo);
        setSessionXp((s) => Math.max(s, bonus));
        onRecordResult({
          xpEarned: 10,
          answeredDelta: 0,
          correctDelta: 0,
          finishedGame: true,
        });
      } else {
        setSessionXp((s) => s + 15);
        onRecordResult({
          xpEarned: 15,
          answeredDelta: 0,
          correctDelta: 0,
          finishedGame: true,
        });
      }
      onRecordActivity?.();
      return;
    }

    setCurrentIdx((i) => i + 1);
    setSelectedMcq(null);
    setTfAnswers({ a: null, b: null, c: null, d: null });
    setShortInput('');
    setQuestionSubmitted(false);
  };

  const handleSelectRightMatch = (rightId: string) => {
    if (!selectedLeftId || matchedIds.includes(rightId)) return;
    setMatchAttempts((a) => a + 1);

    if (selectedLeftId === rightId) {
      const nextMatched = [...matchedIds, rightId];
      setMatchedIds(nextMatched);
      setSelectedLeftId(null);
      playCorrectSound(nextMatched.length);

      if (nextMatched.length === matchPairs.length) {
        const timeBonus = Math.max(0, matchSecondsLeft);
        const earned = Math.max(30, 50 + timeBonus - matchAttempts * 2);
        setSessionXp(earned);
        setIsFinished(true);
        playVictorySound();
        onRecordResult({
          xpEarned: earned,
          answeredDelta: matchPairs.length,
          correctDelta: matchPairs.length,
          finishedGame: true,
        });
        onRecordActivity?.();
      }
    } else {
      playWrongSound();
      setWrongFlashId(rightId);
      window.setTimeout(() => setWrongFlashId(null), 500);
    }
  };

  const handleLoadMillionaire = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = urlInput.trim();
    if (!cleaned) return;
    const finalUrl = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    setUrlInput(finalUrl);
    setActiveIframeUrl(finalUrl);
    setMillionaireSource('custom_url');
    setIframeKey((k) => k + 1);
    onUpdateMillionaireUrl(finalUrl);
  };

  const activeMultiplier = getComboMultiplier(combo);
  const showMillionaire = isThptMode && arenaMode === 'millionaire';

  return (
    <div className="space-y-6">
      {/* Arena Header & Mode Switcher (Ai Là Triệu Phú exclusively inside Ôn thi THPT) */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-[0_8px_24px_-14px_rgba(15,23,42,0.12)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {isThptMode
              ? 'Đấu Trường Ôn Thi Tốt Nghiệp THPT'
              : `Mini-Games Luyện Tập Toán Lớp ${grade}`}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            {isThptMode
              ? 'Chinh phục Ai Là Triệu Phú — Đấu Trường Tốt Nghiệp (10% Lớp 10 · 20% Lớp 11 · 70% Lớp 12) hoặc 4 Mini-games tốc độ & sinh tồn.'
              : `Ôn luyện từng chương Toán ${grade} qua 4 Mini-games tốc độ & sinh tồn với hệ thống xáo trộn đề thông minh chống trùng lặp.`}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto shrink-0">
          {isThptMode && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setArenaMode('millionaire')}
                className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                  arenaMode === 'millionaire'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Tv className="w-4 h-4" />
                Ai Là Triệu Phú - Đấu Trường Tốt Nghiệp
              </button>
              <button
                type="button"
                onClick={() => setArenaMode('minigames')}
                className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                  arenaMode === 'minigames'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                4 Mini-games Toán Học
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Bật âm thanh game' : 'Tắt âm thanh game'}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-sky-600 transition-colors shrink-0"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </section>

      {/* SPECIAL THPT MODE: AI LA TRIEU PHU - DAU TRUONG TOT NGHIEP */}
      {showMillionaire && (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_12px_32px_-16px_rgba(2,132,199,0.2)]">
          <div className="px-4 py-3 bg-gradient-to-r from-sky-600 via-blue-700 to-indigo-800 text-white flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
              <Tv className="w-4 h-4 shrink-0" />
              <span>Ai Là Triệu Phú — Đấu Trường Tốt Nghiệp</span>
            </div>
            <span className="text-xs font-semibold text-sky-100 tabular-nums">
              Ma trận tổng hợp chuẩn thi THPT: 10% Lớp 10 · 20% Lớp 11 · 70% Lớp 12
            </span>
          </div>
          <div className="p-3.5 sm:px-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/60">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setMillionaireSource('builtin')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  millionaireSource === 'builtin'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Phiên bản gốc tích hợp
              </button>
              <button
                type="button"
                onClick={() => setMillionaireSource('custom_url')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  millionaireSource === 'custom_url'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                Nhúng URL khác
              </button>
            </div>

            {millionaireSource === 'builtin' ? (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  data-testid="millionaire-pool-badge"
                  className="inline-flex items-center px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-cyan-300 text-xs font-bold tabular-nums"
                >
                  📦 Kho dự trữ: {poolStatus.readyCount}/{poolStatus.totalCount} đề sẵn sàng (Đề số #{poolStatus.currentSlotNumber})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const pack = drawGameQuestionPackFromPool({ grade, chapters });
                    setPoolStatus(pack.status);
                    triggerBackgroundPoolRefillIfLow(pack.status);
                    setIframeKey((k) => k + 1);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Làm mới ván chơi
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleLoadMillionaire}
                className="flex flex-1 min-w-[260px] max-w-xl items-center gap-2"
              >
                <label htmlFor="millionaire-url-input" className="sr-only">
                  Link game Ai Là Triệu Phú
                </label>
                <input
                  id="millionaire-url-input"
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/ai-la-trieu-phu"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  Tải link
                </button>
                {activeIframeUrl && (
                  <a
                    href={activeIframeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Mở trong tab mới"
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </form>
            )}
          </div>

          {millionaireSource === 'builtin' ? (
            builtinLoading ? (
              <div className="h-[74vh] min-h-[580px] flex items-center justify-center bg-[#040b1e] text-sky-200 text-sm font-medium">
                Đang khởi tạo trường quay Ai Là Triệu Phú...
              </div>
            ) : builtinError ? (
              <div className="p-10 text-center text-rose-600 dark:text-rose-400 text-sm">
                {builtinError}
              </div>
            ) : (
              <div className="relative w-full h-[78vh] min-h-[620px] bg-[#040b1e]">
                <iframe
                  key={`builtin-${iframeKey}`}
                  srcDoc={builtinHtml}
                  title="Ai Là Triệu Phú — Phiên bản gốc"
                  className="w-full h-full border-0"
                  allow="autoplay"
                  allowFullScreen
                />
              </div>
            )
          ) : activeIframeUrl ? (
            <div className="relative w-full h-[74vh] min-h-[580px] bg-slate-100 dark:bg-slate-950">
              <iframe
                key={`url-${iframeKey}`}
                src={activeIframeUrl}
                title="Ai Là Triệu Phú Toán THPT"
                className="w-full h-full border-0"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="p-10 sm:p-16 text-center max-w-xl mx-auto space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Dán đường dẫn game bên ngoài (tùy chọn)
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Bạn có thể dán URL bất kỳ ở ô phía trên hoặc chuyển lại "Phiên bản gốc tích hợp" để chơi ngay lập tức.
              </p>
            </div>
          )}
        </section>
      )}

      {/* MINI-GAMES: 3 ENHANCED CHAPTER PRACTICE MODES */}
      {(!isThptMode || arenaMode === 'minigames') && (
        <div className="space-y-6">
          {/* Setup / Lobby Bar */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-[0_8px_24px_-14px_rgba(15,23,42,0.1)]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                type="button"
                onClick={() => {
                  setGameType('matching');
                  setIsPlaying(false);
                }}
                className={`p-4 rounded-xl border text-left transition-all ${
                  gameType === 'matching'
                    ? 'border-sky-500 bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/50 dark:to-slate-900 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                  Ghép Cặp Tốc Độ
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Nối tên công thức với biểu thức KaTeX chuẩn trong giới hạn 45 giây để nhận thưởng thời gian.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setGameType('sprint');
                  setIsPlaying(false);
                }}
                className={`p-4 rounded-xl border text-left transition-all ${
                  gameType === 'sprint'
                    ? 'border-sky-500 bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/50 dark:to-slate-900 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Timer className="w-4 h-4" />
                  </div>
                  Đua Top 60 Giây
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Trả lời liên tiếp trắc nghiệm nhanh, giữ chuỗi đúng để kích hoạt nhân điểm Combo x2, x3.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setGameType('obstacle');
                  setIsPlaying(false);
                }}
                className={`p-4 rounded-xl border text-left transition-all ${
                  gameType === 'obstacle'
                    ? 'border-sky-500 bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/50 dark:to-slate-900 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  Vượt Chướng Ngại Vật Đúng/Sai
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Chinh phục các chặng câu hỏi Đúng/Sai 4 ý mới và thử thách thực tế để về đích.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setGameType('survival');
                  setIsPlaying(false);
                }}
                className={`p-4 rounded-xl border text-left transition-all ${
                  gameType === 'survival'
                    ? 'border-sky-500 bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/50 dark:to-slate-900 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Flag className="w-4 h-4" />
                  </div>
                  🏝️ Đảo Sinh Tồn Toán Học
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Bắt đầu với 3 trái tim ❤️. Trả lời đúng để vượt qua các làn sóng sinh tồn, sai mất mạng!
                </p>
              </button>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex-1 max-w-md space-y-1.5">
                <label
                  htmlFor="game-chapter-select"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  Chủ đề luyện tập (Khối {grade === 'thpt' ? 'Ôn thi THPT' : grade})
                </label>
                <select
                  id="game-chapter-select"
                  value={selectedChapterId}
                  onChange={(e) => setSelectedChapterId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">Tất cả chương trong khối đang chọn</option>
                  {chapters.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {grade === 'thpt' ? `Lớp ${ch.grade} · ` : ''}Chương {ch.order}: {ch.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  data-testid="btn-play-game-pool"
                  onClick={() => startLocalGame()}
                  disabled={isLoadingAi || isReplenishingPool}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  <Play className="w-4 h-4" />
                  Chơi ngay (Kho 10 đề)
                </button>
                <button
                  type="button"
                  onClick={startAiGame}
                  disabled={isLoadingAi || isReplenishingPool}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap shadow-xs"
                >
                  <Sparkles className="w-4 h-4" />
                  {isLoadingAi ? 'Đang sinh đề AI...' : 'Tạo đề mới bằng Gemini AI'}
                </button>
              </div>
            </div>

            {/* 10-Exam Pool Status Strip in GameArena */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950/75 border border-slate-200 dark:border-blue-500/25 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
              <span
                data-testid="game-pool-badge"
                className="text-xs font-bold text-slate-700 dark:text-cyan-300 tabular-nums"
              >
                📦 Kho dự trữ: {poolStatus.readyCount}/{poolStatus.totalCount} đề sẵn sàng (Đề số #{poolStatus.currentSlotNumber})
              </span>
              <button
                type="button"
                data-testid="btn-game-replenish-pool"
                onClick={handleReplenishGamePool}
                disabled={isReplenishingPool || isLoadingAi}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/10 dark:bg-blue-600/25 hover:bg-blue-600/20 border border-blue-300 dark:border-cyan-400/40 text-blue-700 dark:text-cyan-200 text-xs font-bold transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                {isReplenishingPool ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang nạp mới 10 đề...</span>
                  </>
                ) : (
                  <span>🔄 Nạp mới 10 đề từ AI / Internet</span>
                )}
              </button>
            </div>

            {(isLoadingAi || isReplenishingPool) && fallbackStatus && (
              <p className="text-xs text-sky-600 dark:text-cyan-300/95 font-medium flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>{fallbackStatus}</span>
              </p>
            )}

            {noticeMsg && !isLoadingAi && (
              <div className="rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/70 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-sky-800 dark:text-sky-200">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{noticeMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={onOpenApiKeyModal}
                  className="px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 text-xs font-semibold whitespace-nowrap self-start sm:self-auto"
                >
                  Cài đặt API Key
                </button>
              </div>
            )}
          </section>

          {/* Active Gameplay Stage */}
          {isPlaying && gameType === 'survival' && (
            <SurvivalIslandStage
              key={`survival-${survivalRunKey}`}
              grade={grade}
              chapterTitle={selectedChapterTitle}
              initialQuestions={survivalAiQuestions}
              onExit={() => setIsPlaying(false)}
              onRestart={() => startLocalGame('survival')}
              onRecordResult={onRecordResult}
              onRecordWrongQuestion={onRecordWrongQuestion}
              onRecordActivity={onRecordActivity}
            />
          )}

          {isPlaying && gameType !== 'survival' && (
            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-[0_12px_32px_-16px_rgba(15,23,42,0.14)]">
              {isFinished ? (
                <div className="text-center max-w-md mx-auto py-6 space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto">
                    <Trophy className="w-7 h-7" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Hoàn thành lượt chơi!
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {gameType === 'sprint'
                      ? `Bạn trả lời đúng ${sprintScore} câu với chuỗi combo cao nhất đạt ${maxCombo} (tối đa x${getComboMultiplier(maxCombo)}).`
                      : gameType === 'matching'
                      ? matchedIds.length === matchPairs.length
                        ? `Xuất sắc! Bạn đã ghép chuẩn ${matchPairs.length} cặp công thức trong ${MEMORY_MATCH_TIME_LIMIT - matchSecondsLeft} giây.`
                        : `Hết giờ! Bạn đã ghép đúng ${matchedIds.length}/${matchPairs.length} cặp công thức.`
                      : `Bạn đã vượt qua ${obstaclesCleared}/${questions.length} chướng ngại vật Đúng/Sai GDPT 2018!`}
                  </p>
                  <div className="text-3xl font-extrabold text-sky-600 dark:text-sky-400 tabular-nums">
                    +{sessionXp} XP
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => startLocalGame()}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-semibold text-slate-900 dark:text-slate-100"
                    >
                      Chơi lại
                    </button>
                    <button
                      type="button"
                      onClick={startAiGame}
                      className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-sm font-semibold text-white"
                    >
                      Sinh bộ đề AI mới
                    </button>
                  </div>
                </div>
              ) : gameType === 'matching' ? (
                <div className="space-y-5">
                  {/* Timer + Score Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Ghép Cặp Tốc Độ — Chọn khái niệm bên trái rồi chạm biểu thức bên phải
                    </div>
                    <div className="flex items-center gap-3 tabular-nums">
                      <span className="text-xs font-bold text-sky-600 dark:text-sky-400">
                        Đã nối: {matchedIds.length}/{matchPairs.length}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-lg text-xs font-extrabold ${
                          matchSecondsLeft <= 10
                            ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                            : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                        }`}
                      >
                        Còn {matchSecondsLeft}s
                      </span>
                    </div>
                  </div>

                  {/* Countdown Bar */}
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      style={{
                        width: `${Math.max(0, (matchSecondsLeft / MEMORY_MATCH_TIME_LIMIT) * 100)}%`,
                      }}
                      className={`h-full rounded-full transition-all duration-700 ${
                        matchSecondsLeft <= 10 ? 'bg-rose-500' : 'bg-sky-600'
                      }`}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      {matchPairs.map((pair) => {
                        const isMatched = matchedIds.includes(pair.id);
                        const isSelected = selectedLeftId === pair.id;
                        return (
                          <button
                            key={pair.id}
                            type="button"
                            disabled={isMatched}
                            onClick={() => setSelectedLeftId(pair.id)}
                            className={`w-full text-left p-4 rounded-xl border text-sm font-semibold transition-all ${
                              isMatched
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 opacity-75'
                                : isSelected
                                ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-500 text-sky-800 dark:text-sky-200 ring-2 ring-sky-400/40'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:border-sky-400'
                            }`}
                          >
                            {pair.leftTitle}
                          </button>
                        );
                      })}
                    </div>

                    <div className="space-y-3">
                      {shuffledRight.map((pair) => {
                        const isMatched = matchedIds.includes(pair.id);
                        const isWrong = wrongFlashId === pair.id;
                        return (
                          <button
                            key={pair.id}
                            type="button"
                            disabled={isMatched || !selectedLeftId}
                            onClick={() => handleSelectRightMatch(pair.id)}
                            className={`w-full text-left p-4 rounded-xl border transition-all whitespace-normal break-words min-w-0 math-wrap ${
                              isMatched
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 opacity-75'
                                : isWrong
                                ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-500'
                                : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-sky-400 disabled:opacity-80'
                            }`}
                          >
                            <MathBlock latex={pair.rightLatex} displayMode={false} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                currentQuestion && (
                  <div className="space-y-6 max-w-3xl mx-auto">
                    {/* Obstacle Course Progress Track for Vượt Chướng Ngại Vật */}
                    {gameType === 'obstacle' && (
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5">
                            <Flag className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                            Hành trình vượt chướng ngại vật ({currentIdx + 1}/{questions.length})
                          </span>
                          <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                            Đã vượt: {obstaclesCleared} chặng
                          </span>
                        </div>
                        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${questions.length}, minmax(0, 1fr))` }}>
                          {questions.map((q, idx) => {
                            const isCurrent = idx === currentIdx;
                            const isPast = idx < currentIdx;
                            return (
                              <div
                                key={q.id}
                                className={`h-2.5 rounded-full transition-colors ${
                                  isPast
                                    ? 'bg-emerald-500'
                                    : isCurrent
                                    ? 'bg-sky-600'
                                    : 'bg-slate-200 dark:bg-slate-800'
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Speed Quiz Timer + Combo Multiplier Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
                      <div className="text-slate-500 dark:text-slate-400">
                        {gameType === 'sprint'
                          ? `Câu #${currentIdx + 1}`
                          : `Chặng ${currentIdx + 1} / ${questions.length}`}{' '}
                        ·{' '}
                        {currentQuestion.format === 'multiple_choice'
                          ? 'Trắc nghiệm 4 lựa chọn'
                          : currentQuestion.format === 'true_false'
                          ? 'Đúng / Sai (4 ý)'
                          : 'Trả lời ngắn'}
                        {currentQuestion.isRealWorld ? ' · Vận dụng thực tế' : ''}
                      </div>

                      {gameType === 'sprint' ? (
                        <div className="flex flex-wrap items-center gap-3 tabular-nums">
                          {lastXpFlash && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              {lastXpFlash}
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-extrabold ${
                              activeMultiplier >= 3
                                ? 'bg-amber-500 text-white'
                                : activeMultiplier === 2
                                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <Flame className="w-3.5 h-3.5" />
                            Combo x{activeMultiplier} ({combo})
                          </span>
                          <span className="text-sky-600 dark:text-sky-400 font-bold">
                            +{sessionXp} XP
                          </span>
                          <span
                            className={`px-3 py-1 rounded-lg font-extrabold ${
                              secondsLeft <= 10
                                ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                                : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                            }`}
                          >
                            Còn {secondsLeft}s
                          </span>
                        </div>
                      ) : (
                        <span className="text-sky-600 dark:text-sky-400 tabular-nums">
                          Điểm phiên: +{sessionXp} XP
                        </span>
                      )}
                    </div>

                    {gameType === 'sprint' && (
                      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          style={{ width: `${Math.max(0, (secondsLeft / 60) * 100)}%` }}
                          className={`h-full rounded-full transition-all duration-700 ${
                            secondsLeft <= 10 ? 'bg-rose-500' : 'bg-sky-600'
                          }`}
                        />
                      </div>
                    )}

                    <div className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                      <MathText text={currentQuestion.prompt} />
                    </div>

                    {currentQuestion.format === 'multiple_choice' &&
                      currentQuestion.options && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {currentQuestion.options.map((opt, idx) => {
                            const isChosen = selectedMcq === idx;
                            const isRight = currentQuestion.correctIndex === idx;
                            let style =
                              'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-sky-400 text-slate-900 dark:text-slate-100';
                            if (questionSubmitted) {
                              if (isRight) {
                                style =
                                  'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-900 dark:text-emerald-200';
                              } else if (isChosen) {
                                style =
                                  'bg-rose-50 dark:bg-rose-950/50 border-rose-500 text-rose-900 dark:text-rose-200';
                              }
                            }
                            return (
                              <button
                                key={idx}
                                type="button"
                                disabled={questionSubmitted}
                                onClick={() => handleAnswerMcq(idx)}
                                className={`w-full p-4 rounded-xl border text-left text-sm font-medium transition-colors flex items-start gap-3 whitespace-normal break-words min-w-0 math-wrap ${style}`}
                              >
                                <span className="font-bold shrink-0">
                                  {String.fromCharCode(65 + idx)}.
                                </span>
                                <span className="flex-1 min-w-0 whitespace-normal break-words math-wrap">
                                  <MathText text={opt} />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                    {currentQuestion.format === 'true_false' &&
                      currentQuestion.statements && (
                        <div className="space-y-3">
                          {currentQuestion.statements.map((stmt) => {
                            const userChoice = tfAnswers[stmt.id];
                            const showResult = questionSubmitted;
                            return (
                              <div
                                key={stmt.id}
                                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="text-sm text-slate-800 dark:text-slate-100 flex-1">
                                  <span className="font-bold mr-2">{stmt.id})</span>
                                  <MathText text={stmt.text} />
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    disabled={questionSubmitted}
                                    onClick={() =>
                                      setTfAnswers((prev) => ({ ...prev, [stmt.id]: true }))
                                    }
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                      userChoice === true
                                        ? 'bg-sky-600 text-white border-sky-600'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                                    }`}
                                  >
                                    Đúng
                                  </button>
                                  <button
                                    type="button"
                                    disabled={questionSubmitted}
                                    onClick={() =>
                                      setTfAnswers((prev) => ({ ...prev, [stmt.id]: false }))
                                    }
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                      userChoice === false
                                        ? 'bg-sky-600 text-white border-sky-600'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                                    }`}
                                  >
                                    Sai
                                  </button>
                                  {showResult && (
                                    <span
                                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md ${
                                        userChoice === stmt.isTrue
                                          ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60'
                                          : 'text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/60'
                                      }`}
                                    >
                                      {userChoice === stmt.isTrue ? (
                                        <Check className="w-3.5 h-3.5" />
                                      ) : (
                                        <XIcon className="w-3.5 h-3.5" />
                                      )}
                                      {stmt.isTrue ? 'Đ' : 'S'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {!questionSubmitted && (
                            <button
                              type="button"
                              disabled={Object.values(tfAnswers).some((v) => v === null)}
                              onClick={handleSubmitTrueFalse}
                              className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                            >
                              Vượt chướng ngại vật (Chấm 4 ý)
                            </button>
                          )}
                        </div>
                      )}

                    {currentQuestion.format === 'short_answer' && (
                      <form onSubmit={handleSubmitShortAnswer} className="flex flex-col sm:flex-row gap-3">
                        <label htmlFor="short-answer-input" className="sr-only">
                          Nhập kết quả số
                        </label>
                        <input
                          id="short-answer-input"
                          type="text"
                          disabled={questionSubmitted}
                          value={shortInput}
                          onChange={(e) => setShortInput(e.target.value)}
                          placeholder="Nhập đáp số (vd: 40 hoặc 0,75)"
                          className="flex-1 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        {!questionSubmitted && (
                          <button
                            type="submit"
                            disabled={!shortInput.trim()}
                            className="px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors whitespace-nowrap"
                          >
                            Kiểm tra đáp án
                          </button>
                        )}
                      </form>
                    )}

                    {questionSubmitted && gameType !== 'sprint' && (
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                        {currentQuestion.format === 'short_answer' &&
                          currentQuestion.shortAnswer && (
                            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              Đáp án đúng:{' '}
                              <span className="text-sky-600 dark:text-sky-400 font-mono">
                                {currentQuestion.shortAnswer}
                              </span>
                            </div>
                          )}
                        <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            Giải thích:{' '}
                          </span>
                          <MathText text={currentQuestion.explanation} />
                        </div>
                        <button
                          type="button"
                          onClick={handleNextQuestion}
                          className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-colors"
                        >
                          {currentIdx + 1 >= questions.length
                            ? 'Về đích & Tổng kết'
                            : 'Sang chặng tiếp theo'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};
