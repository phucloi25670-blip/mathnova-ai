import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  X,
  Gamepad2,
  Lightbulb,
  RotateCw,
  Zap,
  CheckCircle2,
  Clock,
  Volume2,
  VolumeX,
  Trophy,
  BookMarked,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  ChapterData,
  FormulaMasteryStatus,
  GradeLevel,
  QuizQuestion,
  WrongQuestionEntry,
} from '../types';
import { CURRICULUM_CHAPTERS } from '../data/curriculum';
import { searchFormulasInChapters } from '../utils/curriculumFilter';
import { generateGameQuestionsApi } from '../utils/api';
import { buildOfflineQuickQuizBatch } from '../utils/formulaQuiz';
import {
  buildDiversitySeeds,
  getSeenQuestionHistory,
  recordSeenQuestions,
} from '../utils/antiRepetition';
import {
  getSoundMuted,
  playCorrectSound,
  playFlipSound,
  playTickSound,
  playVictorySound,
  playWrongSound,
  setSoundMuted,
} from '../utils/soundFx';
import { MathBlock, MathText } from './MathText';

interface FormulaVaultViewProps {
  grade: GradeLevel;
  chapters: ChapterData[];
  selectedChapterId: string | null;
  onSelectChapterId: (id: string | null) => void;
  onPracticeChapter: (chapterId: string) => void;
  formulaMastery: Record<string, FormulaMasteryStatus>;
  onSetFormulaMastery: (formulaId: string, status: FormulaMasteryStatus) => void;
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
  onAddEnergy?: (amount: number) => void;
}

type MasteryFilter = 'all' | FormulaMasteryStatus;

const MASTERY_META: Record<
  FormulaMasteryStatus,
  { label: string; badgeClass: string; activeBtnClass: string }
> = {
  unlearned: {
    label: 'Chưa thuộc',
    badgeClass:
      'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    activeBtnClass: 'bg-slate-700 text-white border-slate-700',
  },
  reviewing: {
    label: 'Đang ôn',
    badgeClass:
      'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    activeBtnClass: 'bg-amber-500 text-white border-amber-500',
  },
  mastered: {
    label: 'Đã nắm vững',
    badgeClass:
      'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    activeBtnClass: 'bg-emerald-600 text-white border-emerald-600',
  },
};

export const FormulaVaultView: React.FC<FormulaVaultViewProps> = ({
  grade,
  chapters,
  selectedChapterId,
  onSelectChapterId,
  onPracticeChapter,
  formulaMastery,
  onSetFormulaMastery,
  onRecordResult,
  onRecordWrongQuestion,
  onRecordActivity,
  onAddEnergy,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [masteryFilter, setMasteryFilter] = useState<MasteryFilter>('all');
  const [flippedIds, setFlippedIds] = useState<Record<string, boolean>>({});
  const [muted, setMuted] = useState<boolean>(() => getSoundMuted());

  // 30-second chapter quick quiz state
  const [quickQuizChapter, setQuickQuizChapter] = useState<ChapterData | null>(null);
  const [quickQuestions, setQuickQuestions] = useState<QuizQuestion[]>([]);
  const [quickIdx, setQuickIdx] = useState(0);
  const [quickSeconds, setQuickSeconds] = useState(30);
  const [quickCorrect, setQuickCorrect] = useState(0);
  const [quickAnswered, setQuickAnswered] = useState(0);
  const [quickCombo, setQuickCombo] = useState(0);
  const [quickSelectedOpt, setQuickSelectedOpt] = useState<number | null>(null);
  const [quickDone, setQuickDone] = useState(false);
  const [isQuickLoading, setIsQuickLoading] = useState(false);
  const [fallbackStatus, setFallbackStatus] = useState<string | null>(null);
  const [quickSource, setQuickSource] = useState<'ai' | 'procedural'>('procedural');
  const [quickNotice, setQuickNotice] = useState<string | null>(null);
  const quickSessionRef = useRef(0);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  };

  const getMastery = (id: string): FormulaMasteryStatus =>
    formulaMastery[id] ?? 'unlearned';

  // Compute mastery counts across current grade chapters
  const masteryStats = useMemo(() => {
    const scope = selectedChapterId
      ? chapters.filter((c) => c.id === selectedChapterId)
      : chapters;
    let total = 0;
    let unlearned = 0;
    let reviewing = 0;
    let mastered = 0;
    for (const ch of scope) {
      for (const f of ch.formulas) {
        total += 1;
        const st = formulaMastery[f.id] ?? 'unlearned';
        if (st === 'mastered') mastered += 1;
        else if (st === 'reviewing') reviewing += 1;
        else unlearned += 1;
      }
    }
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
    return { total, unlearned, reviewing, mastered, pct };
  }, [chapters, selectedChapterId, formulaMastery]);

  const visibleChapters = useMemo(() => {
    const base = selectedChapterId
      ? chapters.filter((c) => c.id === selectedChapterId)
      : chapters;
    const searched = searchFormulasInChapters(base, searchQuery);
    if (masteryFilter === 'all') return searched;
    return searched
      .map((group) => ({
        chapter: group.chapter,
        formulas: group.formulas.filter((f) => getMastery(f.id) === masteryFilter),
      }))
      .filter((group) => group.formulas.length > 0);
  }, [chapters, selectedChapterId, searchQuery, masteryFilter, formulaMastery]);

  // Close modal on Escape
  useEffect(() => {
    if (!quickQuizChapter) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        quickSessionRef.current += 1;
        setQuickQuizChapter(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [quickQuizChapter]);

  // 30-second quick quiz timer (paused while AI generates 15 questions)
  useEffect(() => {
    if (!quickQuizChapter || quickDone || isQuickLoading || quickQuestions.length === 0) return;
    if (quickSeconds <= 0) {
      setQuickDone(true);
      playVictorySound();
      const earned = quickCorrect * 10 + (quickCorrect >= 3 ? 10 : 0);
      if (earned > 0 || quickAnswered > 0) {
        onRecordResult({
          xpEarned: earned,
          answeredDelta: quickAnswered,
          correctDelta: quickCorrect,
          finishedGame: true,
        });
        onRecordActivity?.();
      }
      return;
    }

    const timer = window.setInterval(() => {
      setQuickSeconds((s) => {
        if (s <= 6 && s > 1) playTickSound();
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [
    quickQuizChapter,
    quickDone,
    isQuickLoading,
    quickQuestions.length,
    quickSeconds,
    quickCorrect,
    quickAnswered,
    onRecordResult,
    onRecordActivity,
  ]);

  const closeQuickQuiz = () => {
    quickSessionRef.current += 1;
    setIsQuickLoading(false);
    setQuickQuizChapter(null);
  };

  const startQuickQuiz = async (chapter: ChapterData) => {
    const sessionId = ++quickSessionRef.current;
    setQuickQuizChapter(chapter);
    setIsQuickLoading(true);
    setFallbackStatus(null);
    setQuickQuestions([]);
    setQuickNotice(null);
    setQuickIdx(0);
    setQuickSeconds(30);
    setQuickCorrect(0);
    setQuickAnswered(0);
    setQuickCombo(0);
    setQuickSelectedOpt(null);
    setQuickDone(false);

    try {
      const seenHistory = getSeenQuestionHistory();
      const diversitySeeds = buildDiversitySeeds({
        grade: chapter.grade,
        selectedChapterId: chapter.id,
        allChapters: CURRICULUM_CHAPTERS,
        count: 15,
      });

      // 1. Fetch initial 3 questions for instant start (with auto-fallback chain status)
      const aiPromise = generateGameQuestionsApi({
        grade: chapter.grade,
        chapterTitle: chapter.title,
        gameType: 'quick_30s',
        count: 3,
        seenQuestions: seenHistory,
        diversitySeeds: diversitySeeds.slice(0, 3),
        onFallbackStatus: (statusMsg) => {
          if (quickSessionRef.current === sessionId) {
            setFallbackStatus(statusMsg);
          }
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(() => {
          reject(new Error('LOCAL_FALLBACK_TIMEOUT'));
        }, 6500);
      });

      const aiRaw = await Promise.race([aiPromise, timeoutPromise]);
      if (quickSessionRef.current !== sessionId) return;

      const validAi = aiRaw.filter(
        (q) =>
          q.format === 'multiple_choice' &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          typeof q.correctIndex === 'number' &&
          q.correctIndex >= 0 &&
          q.correctIndex < 4
      );

      const initialPool =
        validAi.length >= 3
          ? validAi.slice(0, 3)
          : [
              ...validAi,
              ...buildOfflineQuickQuizBatch(
                chapter,
                CURRICULUM_CHAPTERS,
                3 - validAi.length
              ),
            ];

      recordSeenQuestions(initialPool);
      setQuickQuestions(initialPool);
      setQuickSource('ai');
      setQuickNotice(null);
      setFallbackStatus(null);
      setIsQuickLoading(false);

      // 2. Background fetch remaining 12 questions seamlessly
      generateGameQuestionsApi({
        grade: chapter.grade,
        chapterTitle: chapter.title,
        gameType: 'quick_30s',
        count: 12,
        seenQuestions: [...seenHistory, ...initialPool.map((q) => q.prompt)],
        diversitySeeds: diversitySeeds.slice(3, 15),
      })
        .then((remainingRaw) => {
          if (quickSessionRef.current !== sessionId) return;
          const validRemaining = remainingRaw.filter(
            (q) =>
              q.format === 'multiple_choice' &&
              Array.isArray(q.options) &&
              q.options.length === 4 &&
              typeof q.correctIndex === 'number' &&
              q.correctIndex >= 0 &&
              q.correctIndex < 4
          );
          const additionalPool =
            validRemaining.length >= 12
              ? validRemaining.slice(0, 12)
              : [
                  ...validRemaining,
                  ...buildOfflineQuickQuizBatch(
                    chapter,
                    CURRICULUM_CHAPTERS,
                    12 - validRemaining.length
                  ),
                ];
          recordSeenQuestions(additionalPool);
          setQuickQuestions((prev) => [...prev, ...additionalPool]);
        })
        .catch(() => {
          if (quickSessionRef.current !== sessionId) return;
          const offlineExtra = buildOfflineQuickQuizBatch(
            chapter,
            CURRICULUM_CHAPTERS,
            12
          );
          setQuickQuestions((prev) => [...prev, ...offlineExtra]);
        });

      return;
    } catch {
      if (quickSessionRef.current !== sessionId) return;
      const offlineBatch = buildOfflineQuickQuizBatch(
        chapter,
        CURRICULUM_CHAPTERS,
        15
      );
      recordSeenQuestions(offlineBatch);
      setQuickQuestions(offlineBatch);
      setQuickSource('procedural');
      setFallbackStatus(null);
      setQuickNotice('Đang dùng bộ sinh đề biến đổi số liệu tức thì.');
      setIsQuickLoading(false);
    }
  };

  const handleAnswerQuickQuiz = (optIdx: number) => {
    if (
      quickSelectedOpt !== null ||
      quickDone ||
      isQuickLoading ||
      !quickQuestions.length
    ) {
      return;
    }
    const current = quickQuestions[quickIdx % quickQuestions.length];
    setQuickSelectedOpt(optIdx);
    const isOk = optIdx === current.correctIndex;
    setQuickAnswered((n) => n + 1);

    if (isOk) {
      const nextCombo = quickCombo + 1;
      setQuickCombo(nextCombo);
      setQuickCorrect((c) => c + 1);
      playCorrectSound(nextCombo);
    } else {
      setQuickCombo(0);
      playWrongSound();
      if (current.options && onRecordWrongQuestion) {
        const rightIdx = current.correctIndex ?? 0;
        onRecordWrongQuestion({
          prompt: current.prompt,
          format: 'multiple_choice',
          userAnswerText:
            current.options[optIdx] ?? `Đáp án ${String.fromCharCode(65 + optIdx)}`,
          correctAnswerText:
            current.options[rightIdx] ?? `Đáp án ${String.fromCharCode(65 + rightIdx)}`,
          explanation:
            current.explanation ||
            'Xem lại thẻ công thức tương ứng trong chương để ghi nhớ chính xác.',
          chapterTitle:
            current.chapterTitle || quickQuizChapter?.title || 'Kiểm tra nhanh 30s',
          grade: current.grade || String(grade),
        });
      }
    }
    onRecordActivity?.();

    window.setTimeout(() => {
      setQuickSelectedOpt(null);
      setQuickIdx((prev) => {
        const nextIdx = prev + 1;
        if (nextIdx >= quickQuestions.length - 1 && quickQuizChapter) {
          const extra = buildOfflineQuickQuizBatch(
            quickQuizChapter,
            CURRICULUM_CHAPTERS,
            10
          );
          recordSeenQuestions(extra);
          setQuickQuestions((curr) => [...curr, ...extra]);
        }
        return nextIdx;
      });
    }, 520);
  };

  const toggleFlipCard = (formulaId: string) => {
    playFlipSound();
    setFlippedIds((prev) => ({
      ...prev,
      [formulaId]: !prev[formulaId],
    }));
  };

  const activeQuickQuestion =
    quickQuestions.length > 0
      ? quickQuestions[quickIdx % quickQuestions.length]
      : null;

  return (
    <div className="space-y-6">
      {/* Header, Progress, Search & Filters */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-[0_8px_24px_-14px_rgba(15,23,42,0.1)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Học Tương Tác — Flashcards 3D
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {grade === 'thpt'
                ? 'Trọng tâm Ôn thi THPT'
                : `Toán Lớp ${grade} — SGK Kết nối tri thức`}{' '}
              · Bấm vào thẻ để lật xem công thức KaTeX & ví dụ minh họa
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-72">
              <label htmlFor="formula-search-input" className="sr-only">
                Tìm kiếm công thức
              </label>
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="formula-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm công thức (côsin, tích phân...)"
                className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-sky-600 transition-colors"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mastery Progress Bar & Quick Mastery Filter Strip */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
            <span className="text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5">
              <BookMarked className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              Tiến độ ghi nhớ: {masteryStats.mastered}/{masteryStats.total} công thức đã nắm vững
            </span>
            <span className="text-sky-600 dark:text-sky-400 tabular-nums">
              {masteryStats.pct}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              style={{ width: `${masteryStats.pct}%` }}
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-300"
            />
          </div>

          <div
            role="group"
            aria-label="Lọc theo mức độ nhớ"
            className="flex flex-wrap items-center gap-2 pt-1"
          >
            {(
              [
                { id: 'all', label: `Tất cả (${masteryStats.total})` },
                { id: 'unlearned', label: `Chưa thuộc (${masteryStats.unlearned})` },
                { id: 'reviewing', label: `Đang ôn (${masteryStats.reviewing})` },
                { id: 'mastered', label: `Đã nắm vững (${masteryStats.mastered})` },
              ] as Array<{ id: MasteryFilter; label: string }>
            ).map((item) => {
              const active = masteryFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMasteryFilter(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-sky-400'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Chapter Filter Bar */}
        <div
          role="group"
          aria-label="Lọc theo chương"
          className="flex items-center gap-2 overflow-x-auto pb-1"
        >
          <button
            type="button"
            onClick={() => onSelectChapterId(null)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              selectedChapterId === null
                ? 'bg-sky-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Tất cả ({chapters.length} chương)
          </button>
          {chapters.map((ch) => {
            const active = selectedChapterId === ch.id;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelectChapterId(active ? null : ch.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {grade === 'thpt' ? `Lớp ${ch.grade} · ` : ''}Ch.{ch.order}: {ch.title}
              </button>
            );
          })}
        </div>
      </section>

      {/* 30-Second Quick Recall Quiz Modal (portaled to body at z-50 above TopBar & MobileBottomNav) */}
      {quickQuizChapter &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-slate-950/65 flex items-center justify-center p-3 sm:p-6"
            onClick={closeQuickQuiz}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="quick-quiz-modal-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-gradient-to-br from-sky-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-900 dark:to-sky-950/40 border-2 border-sky-400/70 dark:border-sky-600/60 p-4 sm:p-6 pb-8 space-y-4 shadow-[0_24px_60px_-14px_rgba(2,132,199,0.45)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-sky-700 dark:text-sky-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Zap className="w-4 h-4 shrink-0" />
                      KIỂM TRA NHANH 30 GIÂY · CHƯƠNG {quickQuizChapter.order}
                    </span>
                    {!isQuickLoading && quickQuestions.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 text-[11px] font-semibold">
                        <Sparkles className="w-3 h-3" />
                        {quickSource === 'ai'
                          ? 'Gemini AI · 15 câu mới'
                          : 'Đề số liệu động · 15 câu'}
                      </span>
                    )}
                  </div>
                  <h2
                    id="quick-quiz-modal-title"
                    className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5 break-words"
                  >
                    {quickQuizChapter.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {!quickDone && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-extrabold tabular-nums text-sky-600 dark:text-sky-400">
                      <Clock className="w-4 h-4" />
                      <span>{quickSeconds}s</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={closeQuickQuiz}
                    aria-label="Đóng kiểm tra nhanh 30 giây"
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    Đóng
                  </button>
                </div>
              </div>

              {!quickDone && !isQuickLoading && (
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${Math.max(0, (quickSeconds / 30) * 100)}%` }}
                    className={`h-full transition-all duration-700 rounded-full ${
                      quickSeconds <= 8 ? 'bg-rose-500' : 'bg-sky-600'
                    }`}
                  />
                </div>
              )}

              {quickNotice && !isQuickLoading && !quickDone && (
                <div
                  title={quickNotice}
                  className="bg-white/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-lg px-3 py-1.5"
                >
                  <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400 break-words line-clamp-2">
                    {quickNotice}
                  </p>
                </div>
              )}

            {isQuickLoading ? (
              <div className="py-10 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Đang tạo gói 15 câu hỏi mới không trùng lặp...
                  </p>
                  <p
                    className={`text-xs ${
                      fallbackStatus
                        ? 'text-sky-600 dark:text-cyan-300 font-medium'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {fallbackStatus || 'Đồng hồ 30 giây sẽ bắt đầu ngay khi đề sẵn sàng'}
                  </p>
                </div>
              </div>
            ) : quickDone ? (
              <div className="text-center py-4 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto">
                  <Trophy className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Hết 30 giây! Bạn đúng {quickCorrect}/{quickAnswered} câu
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Tích lũy +{quickCorrect * 10 + (quickCorrect >= 3 ? 10 : 0)} XP vào bảng tiến độ.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => startQuickQuiz(quickQuizChapter)}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold"
                  >
                    Thử lại 30s
                  </button>
                  <button
                    type="button"
                    onClick={closeQuickQuiz}
                    className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200"
                  >
                    Quay lại thẻ lật
                  </button>
                </div>
              </div>
            ) : (
              activeQuickQuestion && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>
                      Câu {quickIdx + 1}/{quickQuestions.length} · Đúng: {quickCorrect}
                    </span>
                    <span className="text-amber-600 dark:text-amber-400">
                      Combo x{quickCombo}
                    </span>
                  </div>
                  <div className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-relaxed whitespace-normal break-words min-w-0 math-wrap">
                    <MathText text={activeQuickQuestion.prompt} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
                    {activeQuickQuestion.options?.map((opt, idx) => {
                      const chosen = quickSelectedOpt === idx;
                      const isRight = idx === activeQuickQuestion.correctIndex;
                      let cls =
                        'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-sky-400 text-slate-900 dark:text-slate-100';
                      if (quickSelectedOpt !== null) {
                        if (isRight) {
                          cls =
                            'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-900 dark:text-emerald-200';
                        } else if (chosen) {
                          cls =
                            'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-900 dark:text-rose-200';
                        }
                      }
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={quickSelectedOpt !== null}
                          onClick={() => handleAnswerQuickQuiz(idx)}
                          className={`w-full p-3.5 rounded-xl border text-left text-sm font-medium transition-colors flex items-start gap-2.5 whitespace-normal break-words min-w-0 math-wrap ${cls}`}
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
                </div>
              )
            )}
          </section>
        </div>,
        document.body
      )}

      {/* 3D Flashcards per Chapter */}
      {visibleChapters.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Không có thẻ công thức nào khớp bộ lọc hiện tại
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Hãy thử chuyển mức độ nhớ sang "Tất cả" hoặc xóa từ khóa tìm kiếm.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setMasteryFilter('all');
              onSelectChapterId(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition-colors"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {visibleChapters.map(({ chapter, formulas }) => (
            <section key={chapter.id} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
                <div>
                  <div className="text-xs font-medium text-sky-600 dark:text-sky-400 mb-0.5">
                    Toán {chapter.grade} · Chương {chapter.order}
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                    {chapter.title}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => startQuickQuiz(chapter)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-xs"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Kiểm tra nhanh 30s
                  </button>
                  <button
                    type="button"
                    onClick={() => onPracticeChapter(chapter.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <Gamepad2 className="w-4 h-4" />
                    Đấu trường Game
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {formulas.map((f) => {
                  const isFlipped = Boolean(flippedIds[f.id]);
                  const mastery = getMastery(f.id);
                  const meta = MASTERY_META[mastery];

                  return (
                    <div key={f.id} className="perspective-1200">
                      <div
                        role="button"
                        tabIndex={0}
                        aria-pressed={isFlipped}
                        aria-label={`Thẻ lật ${f.title}. Nhấn để ${
                          isFlipped ? 'quay lại mặt trước' : 'lật xem công thức'
                        }`}
                        onClick={() => toggleFlipCard(f.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleFlipCard(f.id);
                          }
                        }}
                        className={`grid w-full cursor-pointer select-none transition-transform duration-500 transform-style-3d focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-2xl ${
                          isFlipped ? 'rotate-y-180' : ''
                        }`}
                      >
                        {/* FRONT FACE: Formula Title + Memory Prompt */}
                        <article className="col-start-1 row-start-1 backface-hidden rounded-2xl bg-gradient-to-br from-white via-white to-sky-50/70 dark:from-slate-900 dark:via-slate-900 dark:to-sky-950/25 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between gap-5 min-h-[260px] shadow-[0_10px_28px_-14px_rgba(15,23,42,0.12)]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                              Thẻ ghi nhớ · Ch.{chapter.order}
                            </span>
                            <span
                              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border ${meta.badgeClass}`}
                            >
                              {meta.label}
                            </span>
                          </div>

                          <div className="space-y-2.5 my-auto">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
                              {f.title}
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                              Hãy tự nhẩm công thức chuẩn và điều kiện áp dụng cho nội dung này trước khi lật thẻ nhé!
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs font-semibold text-sky-600 dark:text-sky-400">
                            <span className="inline-flex items-center gap-1.5">
                              <RotateCw className="w-3.5 h-3.5" />
                              Chạm để lật xem công thức KaTeX
                            </span>
                            <span>Mặt trước</span>
                          </div>
                        </article>

                        {/* BACK FACE: KaTeX Formula + Short Example + Mastery Selector */}
                        <article className="col-start-1 row-start-1 backface-hidden rotate-y-180 rounded-2xl bg-white dark:bg-slate-900 border-2 border-sky-500/40 dark:border-sky-600/50 p-5 sm:p-6 flex flex-col justify-between gap-4 min-h-[260px] shadow-[0_12px_30px_-14px_rgba(2,132,199,0.22)]">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                {f.title}
                              </h3>
                              <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 inline-flex items-center gap-1 shrink-0">
                                <RotateCw className="w-3 h-3" />
                                Lật lại
                              </span>
                            </div>

                            <div className="rounded-xl bg-slate-50 dark:bg-slate-950/90 border border-slate-200/80 dark:border-slate-800 px-3.5 py-2.5 text-slate-900 dark:text-sky-100 overflow-x-auto">
                              <MathBlock latex={f.latex} displayMode={true} />
                            </div>

                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                              <MathText text={f.description} />
                            </p>

                            {f.practicalNote && (
                              <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/60 px-3 py-2 flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
                                <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <span>
                                  <strong className="font-semibold">Ví dụ & Mẹo: </strong>
                                  <MathText text={f.practicalNote} />
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Self-Rating Mastery Buttons */}
                          <div
                            className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              Mức độ nhớ:
                            </span>
                            <div className="flex items-center gap-1.5">
                              {(['unlearned', 'reviewing', 'mastered'] as FormulaMasteryStatus[]).map(
                                (statusKey) => {
                                  const isSelected = mastery === statusKey;
                                  const statusMeta = MASTERY_META[statusKey];
                                  return (
                                    <button
                                      key={statusKey}
                                      type="button"
                                      onClick={() => {
                                        if (statusKey === 'mastered' && mastery !== 'mastered') {
                                          playCorrectSound(1);
                                          onAddEnergy?.(1);
                                        }
                                        onSetFormulaMastery(f.id, statusKey);
                                      }}
                                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors inline-flex items-center gap-1 ${
                                        isSelected
                                          ? statusMeta.activeBtnClass
                                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-sky-400'
                                      }`}
                                    >
                                      {statusKey === 'mastered' && isSelected && (
                                        <CheckCircle2 className="w-3 h-3" />
                                      )}
                                      {statusMeta.label}
                                    </button>
                                  );
                                }
                              )}
                            </div>
                          </div>
                        </article>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
