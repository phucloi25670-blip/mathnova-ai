import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Clock,
  Heart,
  HeartCrack,
  Loader2,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  Zap,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { GradeLevel, QuizQuestion, WrongQuestionEntry } from '../types';
import { CURRICULUM_CHAPTERS } from '../data/curriculum';
import {
  REVIVE_FORMULA_QUESTIONS,
  ReviveFormulaQuestion,
  SURVIVAL_QUESTIONS,
} from '../data/survivalQuestions';
import { generateGameQuestionsApi } from '../utils/api';
import {
  buildDiversitySeeds,
  fisherYatesShuffle,
  getSeenQuestionHistory,
  recordSeenQuestions,
} from '../utils/antiRepetition';
import {
  playCorrectSound,
  playTickSound,
  playVictorySound,
  playWrongSound,
} from '../utils/soundFx';
import {
  applySurvivalCorrectAnswer,
  applySurvivalWrongOrTimeout,
  createInitialSurvivalState,
  getIslandStructureForDay,
  getNextIslandStructure,
  resolveSurvivalReviveAttempt,
  SURVIVAL_MAX_HEARTS,
  SURVIVAL_QUESTION_SECONDS,
  SurvivalRunState,
} from '../utils/survivalLogic';
import { MathText } from './MathText';

interface SurvivalIslandStageProps {
  grade: GradeLevel;
  chapterTitle: string;
  initialQuestions?: QuizQuestion[];
  onExit: () => void;
  onRestart: () => void;
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
}

function buildSurvivalDeck(grade: GradeLevel, initialAi?: QuizQuestion[]): QuizQuestion[] {
  const validAi = (initialAi || []).filter(
    (q) =>
      q.format === 'multiple_choice' &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      typeof q.correctIndex === 'number'
  );

  if (grade === 'thpt') {
    return [...validAi, ...fisherYatesShuffle(SURVIVAL_QUESTIONS)];
  }
  const primary = fisherYatesShuffle(
    SURVIVAL_QUESTIONS.filter((q) => q.grade === grade)
  );
  const secondary = fisherYatesShuffle(
    SURVIVAL_QUESTIONS.filter((q) => q.grade !== grade)
  );
  return [...validAi, ...primary, ...secondary];
}

export const SurvivalIslandStage: React.FC<SurvivalIslandStageProps> = ({
  grade,
  chapterTitle,
  initialQuestions,
  onExit,
  onRestart,
  onRecordResult,
  onRecordWrongQuestion,
  onRecordActivity,
}) => {
  const [deck, setDeck] = useState<QuizQuestion[]>(() =>
    buildSurvivalDeck(grade, initialQuestions)
  );
  const [qIdx, setQIdx] = useState<number>(0);
  const [runState, setRunState] = useState<SurvivalRunState>(createInitialSurvivalState);
  const [secondsLeft, setSecondsLeft] = useState<number>(SURVIVAL_QUESTION_SECONDS);

  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [timedOut, setTimedOut] = useState<boolean>(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'shield' | 'danger' | 'upgrade';
    text: string;
  } | null>(null);

  // Revive modal state (1-time per run)
  const [reviveQuestion, setReviveQuestion] = useState<ReviveFormulaQuestion>(() =>
    REVIVE_FORMULA_QUESTIONS[Math.floor(Math.random() * REVIVE_FORMULA_QUESTIONS.length)]
  );
  const [reviveSelected, setReviveSelected] = useState<number | null>(null);
  const [reviveFeedback, setReviveFeedback] = useState<string | null>(null);

  // AI question generation inside survival
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [aiStatusMsg, setAiStatusMsg] = useState<string | null>(null);

  const gameFinishedRecordedRef = useRef(false);

  const currentQuestion = deck[qIdx % deck.length];
  const currentStructure = useMemo(
    () => getIslandStructureForDay(runState.day),
    [runState.day]
  );
  const nextStructure = useMemo(
    () => getNextIslandStructure(runState.day),
    [runState.day]
  );

  // Mark finished game once when entering Game Over
  useEffect(() => {
    if (runState.isGameOver && !gameFinishedRecordedRef.current) {
      gameFinishedRecordedRef.current = true;
      onRecordResult({
        xpEarned: 0,
        answeredDelta: 0,
        correctDelta: 0,
        finishedGame: true,
      });
      onRecordActivity?.();
    }
  }, [runState.isGameOver, onRecordResult, onRecordActivity]);

  const handleWrongOrTimeoutOutcome = useCallback(
    (isTimeout: boolean) => {
      playWrongSound();
      if (currentQuestion && currentQuestion.options && onRecordWrongQuestion) {
        const rightIdx = currentQuestion.correctIndex ?? 0;
        onRecordWrongQuestion({
          prompt: currentQuestion.prompt,
          format: 'multiple_choice',
          userAnswerText: isTimeout
            ? '(Hết 30 giây)'
            : '(Chọn sai đáp án)',
          correctAnswerText:
            currentQuestion.options[rightIdx] ??
            `Đáp án ${String.fromCharCode(65 + rightIdx)}`,
          explanation:
            currentQuestion.explanation ||
            'Ôn lại kiến thức trọng tâm để sống sót lâu hơn trên đảo.',
          chapterTitle: currentQuestion.chapterTitle || chapterTitle,
          grade: currentQuestion.grade || String(grade),
        });
      }

      onRecordResult({
        xpEarned: 0,
        answeredDelta: 1,
        correctDelta: 0,
      });
      onRecordActivity?.();

      setRunState((prev) => {
        const { nextState, shieldAbsorbed } = applySurvivalWrongOrTimeout(prev);
        if (shieldAbsorbed) {
          setFeedbackBanner({
            type: 'shield',
            text: isTimeout
              ? '⏰ Hết giờ! 🛡️ Khiên bảo vệ đã đỡ thay cho bạn 1 lần mất máu!'
              : '🛡️ Khiên bảo vệ đã đỡ thay cho bạn 1 trái tim ❤️!',
          });
        } else if (nextState.needsRevive) {
          setReviveQuestion(
            REVIVE_FORMULA_QUESTIONS[
              Math.floor(Math.random() * REVIVE_FORMULA_QUESTIONS.length)
            ]
          );
          setReviveSelected(null);
          setReviveFeedback(null);
          setFeedbackBanner({
            type: 'danger',
            text: '💔 Bạn đã mất trái tim cuối cùng! Kích hoạt Cơ Hội Hồi Sinh 1 Lần!',
          });
        } else if (nextState.isGameOver) {
          setFeedbackBanner({
            type: 'danger',
            text: '💔 Hết lượt sinh tồn! Hành trình trên đảo đã khép lại.',
          });
        } else {
          setFeedbackBanner({
            type: 'danger',
            text: isTimeout
              ? `⏰ Hết 30 giây! Mất 1 ❤️ (còn ${nextState.hearts} ❤️).`
              : `Sai rồi! Mất 1 ❤️ (còn ${nextState.hearts} ❤️).`,
          });
        }
        return nextState;
      });
    },
    [currentQuestion, chapterTitle, grade, onRecordResult, onRecordWrongQuestion, onRecordActivity]
  );

  // 30-second countdown per question
  useEffect(() => {
    if (
      submitted ||
      runState.needsRevive ||
      runState.isGameOver ||
      !currentQuestion
    ) {
      return;
    }
    if (secondsLeft <= 0) {
      setSubmitted(true);
      setTimedOut(true);
      handleWrongOrTimeoutOutcome(true);
      return;
    }

    const timer = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 6 && s > 1) playTickSound();
        return s - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [
    secondsLeft,
    submitted,
    runState.needsRevive,
    runState.isGameOver,
    currentQuestion,
    handleWrongOrTimeoutOutcome,
  ]);

  const handleSelectAnswer = (idx: number) => {
    if (submitted || runState.needsRevive || runState.isGameOver || !currentQuestion) {
      return;
    }
    setSelectedOpt(idx);
    setSubmitted(true);
    setTimedOut(false);

    const isCorrect = idx === currentQuestion.correctIndex;
    if (isCorrect) {
      const { nextState, xpGained, shieldEarned, upgradedStructure } =
        applySurvivalCorrectAnswer(runState);
      setRunState(nextState);
      playCorrectSound(nextState.streak);
      onRecordResult({
        xpEarned: xpGained,
        answeredDelta: 1,
        correctDelta: 1,
      });
      onRecordActivity?.();

      if (upgradedStructure) {
        setFeedbackBanner({
          type: 'upgrade',
          text: `🎉 Nâng cấp công trình đảo: ${upgradedStructure.emoji} ${upgradedStructure.name}! (+${xpGained} XP)`,
        });
      } else if (shieldEarned) {
        setFeedbackBanner({
          type: 'shield',
          text: `🛡️ Đủ tài nguyên chế tạo Khiên Bảo Vệ (+1 🛡️) & +${xpGained} XP!`,
        });
      } else {
        setFeedbackBanner({
          type: 'success',
          text: `✓ Chính xác! Bạn đã sống sót bước sang Ngày ${nextState.day} (+${xpGained} XP).`,
        });
      }
    } else {
      handleWrongOrTimeoutOutcome(false);
    }
  };

  const handleNextDay = () => {
    if (runState.needsRevive || runState.isGameOver) return;
    const nextIdx = qIdx + 1;
    if (nextIdx >= deck.length) {
      setDeck((prev) => [...prev, ...fisherYatesShuffle(SURVIVAL_QUESTIONS)]);
    }
    setQIdx(nextIdx);
    setSelectedOpt(null);
    setSubmitted(false);
    setTimedOut(false);
    setFeedbackBanner(null);
    setSecondsLeft(SURVIVAL_QUESTION_SECONDS);
  };

  const handleAnswerRevive = (idx: number) => {
    if (reviveSelected !== null) return;
    setReviveSelected(idx);
    const isOk = idx === reviveQuestion.correctIndex;
    if (isOk) {
      playVictorySound();
      setReviveFeedback('✨ Tuyệt vời! Bạn đã hồi sinh với 1 ❤️. Sẵn sàng tiếp tục sinh tồn!');
      window.setTimeout(() => {
        setRunState((prev) => resolveSurvivalReviveAttempt(prev, true));
        setQIdx((i) => i + 1);
        setSelectedOpt(null);
        setSubmitted(false);
        setTimedOut(false);
        setFeedbackBanner(null);
        setSecondsLeft(SURVIVAL_QUESTION_SECONDS);
      }, 1100);
    } else {
      playWrongSound();
      setReviveFeedback('💔 Rất tiếc, công thức chưa chính xác. Hồi sinh thất bại!');
      window.setTimeout(() => {
        setRunState((prev) => resolveSurvivalReviveAttempt(prev, false));
      }, 1100);
    }
  };

  const handleFetchAiQuestions = async () => {
    if (isGeneratingAi) return;
    setIsGeneratingAi(true);
    setAiStatusMsg('Đang gọi AI sinh thêm 5 câu hỏi sinh tồn mới...');
    try {
      const seen = [
        ...getSeenQuestionHistory(),
        ...deck.map((q) => q.prompt.slice(0, 80)),
      ];
      const diversitySeeds = buildDiversitySeeds({
        grade,
        selectedChapterId: 'all',
        allChapters: CURRICULUM_CHAPTERS,
        count: 5,
      });
      const aiQs = await generateGameQuestionsApi({
        grade,
        chapterTitle,
        gameType: 'sprint',
        count: 5,
        seenQuestions: seen,
        diversitySeeds,
        onFallbackStatus: (status) => setAiStatusMsg(status),
      });
      const valid = aiQs.filter(
        (q) =>
          q.format === 'multiple_choice' &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          typeof q.correctIndex === 'number'
      );
      if (valid.length > 0) {
        recordSeenQuestions(valid);
        setDeck((prev) => {
          const head = prev.slice(0, qIdx + 1);
          const tail = prev.slice(qIdx + 1);
          return [...head, ...valid, ...tail];
        });
        setAiStatusMsg(`✓ Đã bổ sung +${valid.length} câu hỏi AI mới vào hành trình!`);
      } else {
        setAiStatusMsg('Đã sẵn sàng kho 30 câu hỏi chuẩn GDPT 2018.');
      }
    } catch {
      setAiStatusMsg('AI tạm bận — tiếp tục sử dụng kho 30 câu hỏi chuẩn GDPT 2018.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  return (
    <div
      data-testid="survival-arena-stage"
      className="space-y-6 rounded-2xl bg-gradient-to-br from-emerald-50/70 via-white to-sky-50/70 dark:from-[#071521] dark:via-slate-900 dark:to-[#081A28] border border-emerald-200 dark:border-emerald-500/30 p-5 sm:p-7 shadow-[0_14px_40px_-16px_rgba(16,185,129,0.25)]"
    >
      {/* Top Action Bar & HUD */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-emerald-200/70 dark:border-emerald-500/20">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại</span>
          </button>

          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              🏝️ Đảo Sinh Tồn Toán Học
            </div>
            <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <span data-testid="survival-day-counter" className="tabular-nums">
                Ngày {runState.day}
              </span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-cyan-300">
                {currentStructure.emoji} {currentStructure.name}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleFetchAiQuestions}
          disabled={isGeneratingAi || runState.isGameOver}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 disabled:opacity-60 text-white text-xs font-bold shadow-xs transition-all"
        >
          {isGeneratingAi ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          <span>{isGeneratingAi ? 'Đang sinh câu hỏi...' : 'Sinh thêm câu hỏi AI'}</span>
        </button>
      </div>

      {/* Survival HUD Grid: Hearts, Shield/Resources, Timer */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Hearts Bar */}
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Sinh lực
            </div>
            <div data-testid="survival-hearts-count" className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
              {runState.hearts}/{SURVIVAL_MAX_HEARTS} Tim
            </div>
          </div>
          <div className="flex items-center gap-1.5" aria-label={`Còn ${runState.hearts} trái tim`}>
            {Array.from({ length: SURVIVAL_MAX_HEARTS }).map((_, idx) => {
              const alive = idx < runState.hearts;
              return alive ? (
                <Heart
                  key={idx}
                  className="w-6 h-6 text-rose-500 fill-rose-500 drop-shadow-xs transition-transform scale-100"
                />
              ) : (
                <HeartCrack
                  key={idx}
                  className="w-6 h-6 text-slate-300 dark:text-slate-700 transition-transform scale-90"
                />
              );
            })}
          </div>
        </div>

        {/* Shield & Island Resources Bar */}
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
              <Shield className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
              <span>Khiên bảo vệ: {runState.shields}/2</span>
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
              Tài nguyên {runState.resources}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              style={{ width: `${Math.min(100, runState.resources)}%` }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300"
            />
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>+15 XP / ngày</span>
            {nextStructure && (
              <span>
                Mốc kế: {nextStructure.emoji} Ngày {nextStructure.minDay}
              </span>
            )}
          </div>
        </div>

        {/* 30s Question Countdown & XP */}
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
              <Clock className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              <span>Thời gian câu</span>
            </span>
            <span
              data-testid="survival-timer"
              className={`px-2.5 py-0.5 rounded-lg text-sm font-extrabold tabular-nums ${
                secondsLeft <= 8
                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                  : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-cyan-300'
              }`}
            >
              {secondsLeft}s
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              style={{ width: `${Math.max(0, (secondsLeft / SURVIVAL_QUESTION_SECONDS) * 100)}%` }}
              className={`h-full rounded-full transition-all duration-700 ${
                secondsLeft <= 8 ? 'bg-rose-500' : 'bg-blue-600 dark:bg-cyan-500'
              }`}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="text-amber-600 dark:text-amber-400">
              Chuỗi sống sót: {runState.streak}
            </span>
            <span className="text-blue-600 dark:text-cyan-400 tabular-nums">
              +{runState.xpEarned} XP
            </span>
          </div>
        </div>
      </div>

      {aiStatusMsg && (
        <div className="text-xs font-semibold text-blue-700 dark:text-cyan-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl px-3.5 py-2">
          {aiStatusMsg}
        </div>
      )}

      {/* GAME OVER SCREEN */}
      {runState.isGameOver ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 text-center max-w-lg mx-auto space-y-5 shadow-md">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Trophy className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Tổng Kết Đảo Sinh Tồn
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Bạn đã trụ vững đến <strong className="text-emerald-600 dark:text-emerald-400">Ngày {runState.day}</strong> và xây dựng thành công <strong>{currentStructure.emoji} {currentStructure.name}</strong>!
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                {runState.day}
              </div>
              <div className="text-[11px] font-semibold text-slate-500">Ngày sống sót</div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xl font-black text-amber-600 dark:text-amber-400 tabular-nums">
                {runState.bestStreak}
              </div>
              <div className="text-[11px] font-semibold text-slate-500">Chuỗi cao nhất</div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xl font-black text-blue-600 dark:text-cyan-400 tabular-nums">
                +{runState.xpEarned}
              </div>
              <div className="text-[11px] font-semibold text-slate-500">XP nhận được</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onRestart}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white text-sm font-bold shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Chơi lại lượt mới</span>
            </button>
            <button
              type="button"
              onClick={onExit}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-semibold"
            >
              ← Quay lại sảnh
            </button>
          </div>
        </div>
      ) : runState.needsRevive ? (
        /* ONE-TIME REVIVE CHALLENGE */
        <div
          data-testid="survival-revive-panel"
          className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-amber-400 dark:border-amber-500 p-6 sm:p-7 max-w-2xl mx-auto space-y-5 shadow-xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Cơ hội Hồi Sinh Duy Nhất (1 lần/ván)
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {reviveQuestion.title}
              </h3>
            </div>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300">
            Giải đúng công thức nền tảng dưới đây để khôi phục <strong>1 ❤️</strong> và tiếp tục hành trình tại <strong>Ngày {runState.day}</strong>!
          </p>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-base font-semibold text-slate-900 dark:text-slate-100 math-wrap">
            <MathText text={reviveQuestion.prompt} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {reviveQuestion.options.map((opt, idx) => {
              const isChosen = reviveSelected === idx;
              const isRight = idx === reviveQuestion.correctIndex;
              let cls =
                'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-amber-400 text-slate-900 dark:text-slate-100';
              if (reviveSelected !== null) {
                if (isRight) {
                  cls =
                    'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-900 dark:text-emerald-200';
                } else if (isChosen) {
                  cls =
                    'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-900 dark:text-rose-200';
                }
              }
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={reviveSelected !== null}
                  onClick={() => handleAnswerRevive(idx)}
                  className={`w-full p-3.5 rounded-xl border text-left text-sm font-medium transition-all flex items-start gap-2.5 whitespace-normal break-words min-w-0 math-wrap ${cls}`}
                >
                  <span className="font-bold shrink-0">{String.fromCharCode(65 + idx)}.</span>
                  <span className="flex-1 min-w-0 math-wrap">
                    <MathText text={opt} />
                  </span>
                </button>
              );
            })}
          </div>

          {reviveFeedback && (
            <div className="text-sm font-bold text-center text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              {reviveFeedback}
            </div>
          )}
        </div>
      ) : (
        /* ACTIVE SURVIVAL QUESTION CARD */
        currentQuestion && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7 max-w-3xl mx-auto space-y-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>
                Toán {currentQuestion.grade} · {currentQuestion.chapterTitle}
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Thử thách Ngày {runState.day}
              </span>
            </div>

            <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-relaxed math-wrap">
              <MathText text={currentQuestion.prompt} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentQuestion.options?.map((opt, idx) => {
                const isChosen = selectedOpt === idx;
                const isRight = idx === currentQuestion.correctIndex;
                let cls =
                  'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-emerald-500 text-slate-900 dark:text-slate-100';
                if (submitted) {
                  if (isRight) {
                    cls =
                      'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-900 dark:text-emerald-200';
                  } else if (isChosen) {
                    cls =
                      'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-900 dark:text-rose-200';
                  }
                }
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={submitted}
                    onClick={() => handleSelectAnswer(idx)}
                    className={`w-full p-4 rounded-xl border text-left text-sm font-medium transition-all flex items-start gap-3 whitespace-normal break-words min-w-0 math-wrap ${cls}`}
                  >
                    <span className="font-bold shrink-0">
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    <span className="flex-1 min-w-0 math-wrap">
                      <MathText text={opt} />
                    </span>
                  </button>
                );
              })}
            </div>

            {submitted && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                {feedbackBanner && (
                  <div
                    className={`flex items-center gap-2 text-sm font-bold ${
                      feedbackBanner.type === 'danger'
                        ? 'text-rose-600 dark:text-rose-400'
                        : feedbackBanner.type === 'shield'
                        ? 'text-sky-600 dark:text-cyan-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {feedbackBanner.type === 'danger' ? (
                      <XCircle className="w-4 h-4 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    )}
                    <span>{feedbackBanner.text}</span>
                  </div>
                )}

                <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed math-wrap">
                  <strong className="text-slate-900 dark:text-white">
                    {timedOut ? 'Đáp án & Giải thích: ' : 'Giải thích: '}
                  </strong>
                  <MathText text={currentQuestion.explanation} />
                </div>

                <button
                  type="button"
                  onClick={handleNextDay}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white text-sm font-bold shadow-xs transition-all"
                >
                  Sang Ngày {runState.day} →
                </button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};
