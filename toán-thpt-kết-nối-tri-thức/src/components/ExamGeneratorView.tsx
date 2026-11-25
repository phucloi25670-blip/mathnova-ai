import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Globe,
  KeyRound,
  Layers,
  Loader2,
  Play,
  Printer,
  RotateCcw,
  Search,
  Shuffle,
  Sparkles,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  ChapterData,
  ExamPaper,
  GradeLevel,
  QuizQuestion,
  ShuffledExamVariant,
  WrongQuestionEntry,
} from '../types';
import {
  ExamGradeSummary,
  ExamUserAnswers,
  generateShuffledExamVariants,
  gradeExamSubmission,
  partitionExamQuestions,
} from '../utils/examShuffler';
import {
  backgroundRefillExamPool,
  drawNextExamFromPool,
  ensureExamPoolForGrade,
  ExamPoolStatus,
  peekExamPoolStatus,
  replenishExamPoolWithAiOrLocal,
  shuffleExamQuestionsAndOptions,
} from '../utils/examPool';
import { generateMatrixExamApi, searchOnlineExamApi } from '../utils/api';
import { MathText } from './MathText';

interface ExamGeneratorViewProps {
  grade: GradeLevel;
  chapters: ChapterData[];
  onRecordResult: (params: {
    xpEarned: number;
    answeredDelta: number;
    correctDelta: number;
    finishedGame?: boolean;
  }) => void;
  onRecordWrongQuestion: (
    entry: Omit<
      WrongQuestionEntry,
      'id' | 'questionKey' | 'wrongCount' | 'lastWrongAt'
    >
  ) => void;
  onRecordActivity: () => void;
  onOpenApiKeyModal: () => void;
}

type BuilderMode = 'search' | 'matrix';
type ExamSubView = 'studio' | 'exam_room' | 'shuffle_print';

const SEARCH_SUGGESTIONS = [
  'Tìm đề thi thử THPT Quốc gia 2026 môn Toán có lời giải',
  'Tổng hợp câu hỏi vận dụng cao Oxyz từ đề các trường chuyên',
  'Đề kiểm tra học kỳ 1 Toán 11 Kết nối tri thức',
  'Đề thi giữa học kỳ 2 Toán 12 Nguyên hàm - Tích phân chuẩn GDPT 2018',
];

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ExamGeneratorView: React.FC<ExamGeneratorViewProps> = ({
  grade,
  chapters,
  onRecordResult,
  onRecordWrongQuestion,
  onRecordActivity,
  onOpenApiKeyModal,
}) => {
  const [builderMode, setBuilderMode] = useState<BuilderMode>('search');
  const [subView, setSubView] = useState<ExamSubView>('studio');

  // Search Grounding State
  const [searchQuery, setSearchQuery] = useState<string>(
    'Tìm đề thi thử THPT Quốc gia 2026 môn Toán có lời giải'
  );
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [fallbackStatus, setFallbackStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Matrix Builder State
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [mcCount, setMcCount] = useState<number>(6);
  const [tfCount, setTfCount] = useState<number>(2);
  const [saCount, setSaCount] = useState<number>(2);
  const [durationMinutes, setDurationMinutes] = useState<number>(45);

  // 10-Exam Pool State
  const [poolStatus, setPoolStatus] = useState<ExamPoolStatus>(() =>
    peekExamPoolStatus(grade, chapters)
  );
  const [isReplenishingPool, setIsReplenishingPool] = useState<boolean>(false);
  const [poolNotice, setPoolNotice] = useState<string | null>(null);

  // Active Exam Paper (instant load from Slot #1 of 10-Exam Pool)
  const [activeExam, setActiveExam] = useState<ExamPaper | null>(() => {
    const pool = ensureExamPoolForGrade(grade, chapters);
    const firstSlot = pool.slots.find((s) => !s.used) ?? pool.slots[0];
    if (!firstSlot) return null;
    const parts = partitionExamQuestions(firstSlot.exam.questions);
    return shuffleExamQuestionsAndOptions({
      ...firstSlot.exam,
      durationMinutes: 45,
      questions: [
        ...parts.part1.slice(0, 6),
        ...parts.part2.slice(0, 2),
        ...parts.part3.slice(0, 2),
      ],
    });
  });
  const [showSolutions, setShowSolutions] = useState<boolean>(false);

  // Timed Exam Room State
  const [answers, setAnswers] = useState<ExamUserAnswers>({
    mc: {},
    tf: {},
    sa: {},
  });
  const [secondsLeft, setSecondsLeft] = useState<number>(45 * 60);
  const [gradeSummary, setGradeSummary] = useState<ExamGradeSummary | null>(null);

  // Shuffle & Print Studio State
  const [variantCount, setVariantCount] = useState<number>(3);
  const [startCode, setStartCode] = useState<number>(101);
  const [includeAnswerSheet, setIncludeAnswerSheet] = useState<boolean>(true);
  const [variants, setVariants] = useState<ShuffledExamVariant[]>([]);
  const [activeVariantTab, setActiveVariantTab] = useState<string>('101');

  // Sync pool status & initial exam when grade changes
  useEffect(() => {
    setSelectedChapterIds([]);
    const pool = ensureExamPoolForGrade(grade, chapters);
    const nextStatus = peekExamPoolStatus(grade, chapters);
    setPoolStatus(nextStatus);
    const firstSlot = pool.slots.find((s) => !s.used) ?? pool.slots[0];
    if (firstSlot && subView === 'studio') {
      const parts = partitionExamQuestions(firstSlot.exam.questions);
      setActiveExam(
        shuffleExamQuestionsAndOptions({
          ...firstSlot.exam,
          durationMinutes,
          questions: [
            ...parts.part1.slice(0, mcCount),
            ...parts.part2.slice(0, tfCount),
            ...parts.part3.slice(0, saCount),
          ],
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade]);

  const partitioned = useMemo(() => {
    if (!activeExam) {
      return { part1: [], part2: [], part3: [], ordered: [] };
    }
    return partitionExamQuestions(activeExam.questions);
  }, [activeExam]);

  // Live countdown timer inside exam_room
  useEffect(() => {
    if (subView !== 'exam_room' || gradeSummary !== null) return;

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [subView, gradeSummary]);

  // Auto-submit when timer reaches 0
  useEffect(() => {
    if (subView === 'exam_room' && gradeSummary === null && secondsLeft === 0 && activeExam) {
      handleSubmitExam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, subView, gradeSummary]);

  const toggleChapterSelection = (id: string) => {
    setSelectedChapterIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSearchOnlineExam = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = searchQuery.trim();
    if (!cleaned) {
      setErrorMsg('Vui lòng nhập yêu cầu hoặc từ khóa đề thi muốn tìm trên mạng.');
      return;
    }

    setErrorMsg(null);
    setFallbackStatus(null);
    setIsGenerating(true);
    try {
      const res = await searchOnlineExamApi({
        query: cleaned,
        grade,
        mcCount,
        tfCount,
        saCount,
        onFallbackStatus: (statusMsg) => setFallbackStatus(statusMsg),
      });

      const exam: ExamPaper = {
        id: `exam-search-${Date.now()}`,
        title: res.title,
        subtitle: res.subtitle,
        grade,
        durationMinutes: res.durationMinutes || durationMinutes,
        sourceType: 'search',
        searchQuery: cleaned,
        searchQueriesUsed: res.searchQueriesUsed,
        sources: res.sources || [],
        questions: res.questions,
        modelUsed: res.modelUsed,
        createdAt: Date.now(),
      };
      setActiveExam(exam);
      setShowSolutions(false);
      setSubView('studio');
      onRecordActivity();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể tìm kiếm đề thi trực tuyến. Vui lòng thử lại.'
      );
    } finally {
      setIsGenerating(false);
      setFallbackStatus(null);
    }
  };

  const handleBuildLocalExam = () => {
    setErrorMsg(null);
    setPoolNotice(null);
    const { exam, status } = drawNextExamFromPool({
      grade,
      chapters,
      selectedChapterIds,
      mcCount,
      tfCount,
      saCount,
      durationMinutes,
      excludeExamId: activeExam?.id,
    });
    setActiveExam(exam);
    setPoolStatus(status);
    setShowSolutions(false);
    setSubView('studio');
    onRecordActivity();

    if (status.needsBackgroundRefill) {
      void backgroundRefillExamPool({
        grade,
        chapters,
        onCompleted: (refreshedStatus) => {
          setPoolStatus(refreshedStatus);
        },
      });
    }
  };

  const handleReplenishPoolFromAi = async () => {
    setErrorMsg(null);
    setPoolNotice(null);
    setFallbackStatus(null);
    setIsReplenishingPool(true);
    try {
      const result = await replenishExamPoolWithAiOrLocal({
        grade,
        chapters,
        onFallbackStatus: (msg) => setFallbackStatus(msg),
      });
      setPoolStatus(result.status);
      const { exam, status } = drawNextExamFromPool({
        grade,
        chapters,
        selectedChapterIds,
        mcCount,
        tfCount,
        saCount,
        durationMinutes,
      });
      setActiveExam(exam);
      setPoolStatus(status);
      setShowSolutions(false);
      setPoolNotice(
        result.usedAi
          ? `Đã nạp mới 10 đề chuẩn GDPT 2018 từ AI & Internet (${result.modelUsed || 'gemini-3.8-flash'})!`
          : 'Đã làm mới tức thì 10 đề đa dạng trong Kho dự trữ GDPT 2018!'
      );
    } finally {
      setIsReplenishingPool(false);
      setFallbackStatus(null);
    }
  };

  const handleGenerateAiMatrixExam = async () => {
    setErrorMsg(null);
    setFallbackStatus(null);
    setIsGenerating(true);
    try {
      const chosenTitles =
        selectedChapterIds.length > 0
          ? chapters
              .filter((c) => selectedChapterIds.includes(c.id))
              .map((c) => c.title)
          : [];

      const res = await generateMatrixExamApi({
        grade,
        chapterTitles: chosenTitles,
        mcCount,
        tfCount,
        saCount,
        durationMinutes,
        onFallbackStatus: (statusMsg) => setFallbackStatus(statusMsg),
      });

      const exam: ExamPaper = {
        id: `exam-ai-${Date.now()}`,
        title: res.title,
        subtitle: res.subtitle,
        grade,
        durationMinutes: res.durationMinutes || durationMinutes,
        sourceType: 'ai',
        sources: [],
        questions: res.questions,
        modelUsed: res.modelUsed,
        createdAt: Date.now(),
      };
      setActiveExam(exam);
      setShowSolutions(false);
      setSubView('studio');
      onRecordActivity();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể tạo đề thi AI. Vui lòng kiểm tra API Key.'
      );
    } finally {
      setIsGenerating(false);
      setFallbackStatus(null);
    }
  };

  const handleEnterExamRoom = () => {
    if (!activeExam || activeExam.questions.length === 0) return;
    setAnswers({ mc: {}, tf: {}, sa: {} });
    setGradeSummary(null);
    setSecondsLeft(activeExam.durationMinutes * 60);
    setSubView('exam_room');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitExam = () => {
    if (!activeExam) return;
    const summary = gradeExamSubmission(partitioned.ordered, answers);
    setGradeSummary(summary);

    const totalCorrectCount =
      summary.mcCorrect +
      summary.saCorrect +
      partitioned.part2.filter((q) => summary.results[q.id]?.isFullyCorrect).length;

    onRecordResult({
      xpEarned: summary.xpEarned,
      answeredDelta: partitioned.ordered.length,
      correctDelta: totalCorrectCount,
      finishedGame: true,
    });
    onRecordActivity();

    // Log wrong questions to Sổ tay Bẫy Sai
    for (const q of partitioned.ordered) {
      const res = summary.results[q.id];
      if (res && !res.isFullyCorrect) {
        onRecordWrongQuestion({
          prompt: q.prompt,
          format: q.format,
          userAnswerText: res.userAnswerText,
          correctAnswerText: res.correctAnswerText,
          explanation: q.explanation,
          chapterTitle: q.chapterTitle,
          grade: q.grade,
        });
      }
    }
  };

  const handleOpenShufflePrint = (customCount = variantCount, customStart = startCode) => {
    if (!activeExam || activeExam.questions.length === 0) return;
    const generated = generateShuffledExamVariants(activeExam, customCount, customStart);
    setVariants(generated);
    setActiveVariantTab(generated[0]?.code || String(customStart));
    setSubView('shuffle_print');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRegenerateVariants = (nextCount = variantCount, nextStart = startCode) => {
    if (!activeExam) return;
    const generated = generateShuffledExamVariants(activeExam, nextCount, nextStart);
    setVariants(generated);
    setActiveVariantTab(generated[0]?.code || String(nextStart));
  };

  const handleSelectMc = (questionId: string, optionIdx: number) => {
    if (gradeSummary) return;
    setAnswers((prev) => ({
      ...prev,
      mc: { ...prev.mc, [questionId]: optionIdx },
    }));
  };

  const handleSelectTf = (
    questionId: string,
    stmtId: 'a' | 'b' | 'c' | 'd',
    value: boolean
  ) => {
    if (gradeSummary) return;
    setAnswers((prev) => {
      const current = prev.tf[questionId] ?? {
        a: null,
        b: null,
        c: null,
        d: null,
      };
      return {
        ...prev,
        tf: {
          ...prev.tf,
          [questionId]: { ...current, [stmtId]: value },
        },
      };
    });
  };

  const handleChangeSa = (questionId: string, val: string) => {
    if (gradeSummary) return;
    setAnswers((prev) => ({
      ...prev,
      sa: { ...prev.sa, [questionId]: val },
    }));
  };

  // Answered count for exam room progress bar
  const answeredCount = useMemo(() => {
    return partitioned.ordered.filter((q) => {
      if (q.format === 'multiple_choice') {
        return typeof answers.mc[q.id] === 'number';
      }
      if (q.format === 'true_false') {
        const tf = answers.tf[q.id];
        return tf && (tf.a !== null || tf.b !== null || tf.c !== null || tf.d !== null);
      }
      return Boolean((answers.sa[q.id] || '').trim());
    }).length;
  }, [partitioned.ordered, answers]);

  // ==================== SUB-VIEW: TIMED EXAM ROOM ====================
  if (subView === 'exam_room' && activeExam) {
    return (
      <div className="space-y-6">
        {/* Sticky Exam Timer Bar */}
        <div className="sticky top-18 z-20 rounded-2xl bg-[#0F172A]/95 backdrop-blur-xl border border-blue-500/30 p-4 shadow-[0_12px_32px_rgba(7,11,25,0.85)] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSubView('studio')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay lại đề</span>
            </button>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-white truncate">
                {activeExam.title}
              </h2>
              <p className="text-xs text-slate-400">
                Đã trả lời {answeredCount}/{partitioned.ordered.length} câu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-extrabold tabular-nums ${
                secondsLeft <= 120 && !gradeSummary
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                  : 'bg-[#070B19] border-cyan-500/30 text-cyan-300'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatClock(secondsLeft)}</span>
            </div>

            {!gradeSummary ? (
              <button
                type="button"
                onClick={handleSubmitExam}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-500/30 hover:scale-[1.02] transition-transform"
              >
                Nộp bài & Chấm điểm
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEnterExamRoom}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Làm lại</span>
              </button>
            )}
          </div>
        </div>

        {/* Grading Result Banner */}
        {gradeSummary && (
          <div className="rounded-3xl bg-gradient-to-br from-blue-950/80 via-[#0F172A] to-emerald-950/60 border border-cyan-500/40 p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/30">
                  <Trophy className="w-8 h-8" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Kết quả bài thi chuẩn GDPT 2018
                  </div>
                  <div className="text-3xl sm:text-4xl font-black text-white tabular-nums">
                    {gradeSummary.score10.toFixed(2)}{' '}
                    <span className="text-lg font-bold text-slate-400">/ 10 điểm</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Điểm thô: {gradeSummary.rawEarned}/{gradeSummary.rawMax} · Nhận +{gradeSummary.xpEarned} XP vào hồ sơ học tập
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenShufflePrint()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>Trộn mã đề & In A4</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-[#070B19]/80 border border-blue-500/20 p-3.5">
                <div className="text-xs text-slate-400">Phần I · Trắc nghiệm 4 chọn</div>
                <div className="text-lg font-extrabold text-cyan-300 tabular-nums mt-0.5">
                  {gradeSummary.mcCorrect}/{gradeSummary.mcTotal} câu đúng
                </div>
              </div>
              <div className="rounded-2xl bg-[#070B19]/80 border border-blue-500/20 p-3.5">
                <div className="text-xs text-slate-400">Phần II · Đúng / Sai (1đ/câu)</div>
                <div className="text-lg font-extrabold text-amber-300 tabular-nums mt-0.5">
                  {gradeSummary.tfPoints}/{gradeSummary.tfMaxPoints} điểm
                </div>
              </div>
              <div className="rounded-2xl bg-[#070B19]/80 border border-blue-500/20 p-3.5">
                <div className="text-xs text-slate-400">Phần III · Trả lời ngắn</div>
                <div className="text-lg font-extrabold text-emerald-300 tabular-nums mt-0.5">
                  {gradeSummary.saCorrect}/{gradeSummary.saTotal} câu đúng
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Interactive Exam Questions */}
        <div className="space-y-8">
          {partitioned.part1.length > 0 && (
            <section className="space-y-4">
              <div className="px-4 py-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-cyan-300 text-sm font-extrabold">
                PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn ({partitioned.part1.length} câu)
              </div>
              {partitioned.part1.map((q, idx) => {
                const chosen = answers.mc[q.id];
                const result = gradeSummary?.results[q.id];
                return (
                  <div
                    key={q.id}
                    className="rounded-3xl bg-[#0F172A]/85 border border-blue-500/20 p-5 sm:p-6 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm sm:text-base text-slate-100 leading-relaxed math-wrap">
                        <span className="font-extrabold text-cyan-400 mr-2">
                          Câu {idx + 1}.
                        </span>
                        <MathText text={q.prompt} />
                      </div>
                      {result && (
                        <span
                          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                            result.isFullyCorrect
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {result.isFullyCorrect ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          {result.earnedPoints}/{result.maxPoints}đ
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(q.options || []).map((opt, oIdx) => {
                        const isSelected = chosen === oIdx;
                        const isRight = q.correctIndex === oIdx;
                        let styleClass =
                          'bg-[#070B19]/70 border-slate-700/80 text-slate-200 hover:border-cyan-400/60';
                        if (gradeSummary) {
                          if (isRight) {
                            styleClass =
                              'bg-emerald-500/20 border-emerald-400 text-emerald-200';
                          } else if (isSelected && !isRight) {
                            styleClass =
                              'bg-rose-500/20 border-rose-400 text-rose-200';
                          }
                        } else if (isSelected) {
                          styleClass =
                            'bg-blue-600/30 border-cyan-400 text-white shadow-[0_0_15px_rgba(6,182,212,0.25)]';
                        }

                        return (
                          <button
                            key={oIdx}
                            type="button"
                            disabled={Boolean(gradeSummary)}
                            onClick={() => handleSelectMc(q.id, oIdx)}
                            className={`text-left px-4 py-3 rounded-2xl border text-sm transition-all flex items-start gap-2.5 math-wrap ${styleClass}`}
                          >
                            <span className="font-extrabold text-cyan-400 shrink-0">
                              {OPTION_LETTERS[oIdx]}.
                            </span>
                            <MathText text={opt} />
                          </button>
                        );
                      })}
                    </div>

                    {gradeSummary && (
                      <div className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-4 text-xs sm:text-sm text-slate-300 leading-relaxed math-wrap">
                        <span className="font-bold text-cyan-300">Lời giải: </span>
                        <MathText text={q.explanation} />
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {partitioned.part2.length > 0 && (
            <section className="space-y-4">
              <div className="px-4 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-extrabold">
                PHẦN II. Câu trắc nghiệm đúng sai ({partitioned.part2.length} câu — Chấm 0.1 / 0.25 / 0.5 / 1.0 điểm)
              </div>
              {partitioned.part2.map((q, idx) => {
                const userTf = answers.tf[q.id] ?? { a: null, b: null, c: null, d: null };
                const result = gradeSummary?.results[q.id];
                return (
                  <div
                    key={q.id}
                    className="rounded-3xl bg-[#0F172A]/85 border border-blue-500/20 p-5 sm:p-6 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm sm:text-base text-slate-100 leading-relaxed math-wrap">
                        <span className="font-extrabold text-amber-400 mr-2">
                          Câu {idx + 1}.
                        </span>
                        <MathText text={q.prompt} />
                      </div>
                      {result && (
                        <span className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-bold tabular-nums">
                          {result.earnedPoints}/{result.maxPoints}đ
                        </span>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      {(q.statements || []).map((st) => {
                        const val = userTf[st.id];
                        return (
                          <div
                            key={st.id}
                            className="rounded-2xl bg-[#070B19]/80 border border-slate-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="text-sm text-slate-200 math-wrap">
                              <span className="font-bold text-amber-300 mr-2">
                                {st.id})
                              </span>
                              <MathText text={st.text} />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {[true, false].map((choice) => {
                                const selected = val === choice;
                                const isRightChoice = st.isTrue === choice;
                                let btnStyle =
                                  'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-cyan-400';
                                if (gradeSummary) {
                                  if (isRightChoice) {
                                    btnStyle =
                                      'bg-emerald-500/25 border-emerald-400 text-emerald-200';
                                  } else if (selected && !isRightChoice) {
                                    btnStyle =
                                      'bg-rose-500/25 border-rose-400 text-rose-200';
                                  }
                                } else if (selected) {
                                  btnStyle = choice
                                    ? 'bg-emerald-600 border-emerald-400 text-white'
                                    : 'bg-rose-600 border-rose-400 text-white';
                                }
                                return (
                                  <button
                                    key={String(choice)}
                                    type="button"
                                    disabled={Boolean(gradeSummary)}
                                    onClick={() => handleSelectTf(q.id, st.id, choice)}
                                    className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all ${btnStyle}`}
                                  >
                                    {choice ? 'Đúng' : 'Sai'}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {gradeSummary && (
                      <div className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-4 text-xs sm:text-sm text-slate-300 leading-relaxed math-wrap">
                        <span className="font-bold text-amber-300">Lời giải: </span>
                        <MathText text={q.explanation} />
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {partitioned.part3.length > 0 && (
            <section className="space-y-4">
              <div className="px-4 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-extrabold">
                PHẦN III. Câu trắc nghiệm trả lời ngắn ({partitioned.part3.length} câu)
              </div>
              {partitioned.part3.map((q, idx) => {
                const result = gradeSummary?.results[q.id];
                return (
                  <div
                    key={q.id}
                    className="rounded-3xl bg-[#0F172A]/85 border border-blue-500/20 p-5 sm:p-6 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm sm:text-base text-slate-100 leading-relaxed math-wrap">
                        <span className="font-extrabold text-emerald-400 mr-2">
                          Câu {idx + 1}.
                        </span>
                        <MathText text={q.prompt} />
                      </div>
                      {result && (
                        <span
                          className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold ${
                            result.isFullyCorrect
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {result.earnedPoints}/{result.maxPoints}đ
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <input
                        type="text"
                        disabled={Boolean(gradeSummary)}
                        value={answers.sa[q.id] || ''}
                        onChange={(e) => handleChangeSa(q.id, e.target.value)}
                        placeholder="Nhập đáp số (VD: 20 hoặc 3/4)..."
                        className="w-full sm:max-w-xs px-4 py-2.5 rounded-xl bg-[#070B19] border border-blue-500/30 text-white text-sm font-bold placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                      {gradeSummary && (
                        <span className="text-xs font-bold text-emerald-300">
                          Đáp án chuẩn: {q.shortAnswer}
                        </span>
                      )}
                    </div>

                    {gradeSummary && (
                      <div className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-4 text-xs sm:text-sm text-slate-300 leading-relaxed math-wrap">
                        <span className="font-bold text-emerald-300">Lời giải: </span>
                        <MathText text={q.explanation} />
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </div>
      </div>
    );
  }

  // ==================== SUB-VIEW: SHUFFLE & A4 PRINT STUDIO ====================
  if (subView === 'shuffle_print' && activeExam) {
    return (
      <div className="space-y-6">
        {/* Print Studio Toolbar (hidden during window.print()) */}
        <div className="no-print rounded-3xl bg-[#0F172A]/90 border border-blue-500/30 p-5 sm:p-6 space-y-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSubView('studio')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại</span>
              </button>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-white">
                  Trộn Nhiều Mã Đề & Xuất Bản In A4 / PDF
                </h2>
                <p className="text-xs text-slate-400">
                  Tự động đảo thứ tự câu hỏi từng phần, đảo phương án A/B/C/D và sinh Bảng Đáp Án chuẩn
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-500/30 hover:scale-[1.02] transition-transform"
            >
              <Printer className="w-4 h-4" />
              <span>In / Lưu PDF (A4)</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <label htmlFor="variant-count-select" className="text-xs font-semibold text-slate-300">
                Số lượng mã đề:
              </label>
              <select
                id="variant-count-select"
                value={variantCount}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setVariantCount(next);
                  handleRegenerateVariants(next, startCode);
                }}
                className="px-3 py-1.5 rounded-xl bg-[#070B19] border border-blue-500/30 text-xs font-bold text-cyan-300"
              >
                <option value={2}>2 mã đề ({startCode}–{startCode + 1})</option>
                <option value={3}>3 mã đề ({startCode}–{startCode + 2})</option>
                <option value={4}>4 mã đề ({startCode}–{startCode + 3})</option>
                <option value={6}>6 mã đề ({startCode}–{startCode + 5})</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="start-code-select" className="text-xs font-semibold text-slate-300">
                Mã bắt đầu:
              </label>
              <select
                id="start-code-select"
                value={startCode}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setStartCode(next);
                  handleRegenerateVariants(variantCount, next);
                }}
                className="px-3 py-1.5 rounded-xl bg-[#070B19] border border-blue-500/30 text-xs font-bold text-cyan-300"
              >
                <option value={101}>101, 102...</option>
                <option value={201}>201, 202...</option>
                <option value={301}>301, 302...</option>
              </select>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAnswerSheet}
                onChange={(e) => setIncludeAnswerSheet(e.target.checked)}
                className="rounded border-slate-600 text-cyan-500 focus:ring-cyan-400"
              />
              <span>In kèm trang Bảng Đáp Án</span>
            </label>

            <button
              type="button"
              onClick={() => handleRegenerateVariants()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600/25 hover:bg-blue-600 border border-blue-500/40 text-cyan-300 hover:text-white text-xs font-bold transition-colors"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Trộn lại ngẫu nhiên</span>
            </button>
          </div>

          {/* Preview Variant Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {variants.map((v) => (
              <button
                key={v.code}
                type="button"
                onClick={() => setActiveVariantTab(v.code)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeVariantTab === v.code
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md'
                    : 'bg-[#070B19] text-slate-300 border border-slate-700 hover:border-cyan-400'
                }`}
              >
                Mã đề {v.code}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setActiveVariantTab('answers')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeVariantTab === 'answers'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-[#070B19] text-emerald-300 border border-emerald-500/30 hover:border-emerald-400'
              }`}
            >
              Bảng Đáp Án Tất Cả Mã Đề
            </button>
          </div>
        </div>

        {/* Printable A4 Sheets */}
        <div className="a4-print-root space-y-8">
          {variants.map((variant) => {
            const parts = partitionExamQuestions(variant.questions);
            const isVisibleOnScreen = activeVariantTab === variant.code;

            return (
              <article
                key={variant.code}
                className={`a4-print-sheet bg-white text-slate-900 rounded-2xl shadow-2xl p-7 sm:p-11 max-w-[820px] mx-auto border border-slate-200 ${
                  isVisibleOnScreen ? 'block' : 'hidden print:block'
                }`}
              >
                {/* Vietnamese Standard A4 Exam Header */}
                <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-slate-800">
                  <div className="text-center space-y-0.5 text-xs sm:text-sm">
                    <div className="font-bold uppercase text-slate-700">
                      SỞ GIÁO DỤC & ĐÀO TẠO
                    </div>
                    <div className="font-extrabold uppercase text-slate-900">
                      MATHNOVA AI · CHƯƠNG TRÌNH GDPT 2018
                    </div>
                    <div className="text-[11px] text-slate-500 italic">
                      (Đề thi gồm {variant.questions.length} câu · 3 phần chuẩn)
                    </div>
                  </div>

                  <div className="text-center space-y-1">
                    <div className="font-extrabold uppercase text-xs sm:text-sm text-slate-900">
                      {activeExam.title}
                    </div>
                    <div className="text-xs text-slate-700">
                      Môn: TOÁN · Thời gian: {activeExam.durationMinutes} phút
                    </div>
                    <div className="inline-block px-3 py-1 border-2 border-slate-900 font-black text-xs sm:text-sm">
                      MÃ ĐỀ: {variant.code}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 py-3 border-b border-slate-300 text-xs sm:text-sm text-slate-800">
                  <div>Họ và tên thí sinh: ....................................................</div>
                  <div>Số báo danh: .............................. Lớp: .............</div>
                </div>

                {/* Part I */}
                {parts.part1.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <h3 className="font-extrabold text-sm uppercase text-slate-900">
                      PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.{' '}
                      <span className="font-normal normal-case text-slate-700">
                        Thí sinh trả lời từ câu 1 đến câu {parts.part1.length}. Mỗi câu chỉ chọn một phương án.
                      </span>
                    </h3>
                    <div className="space-y-3.5">
                      {parts.part1.map((q, idx) => (
                        <div key={`${variant.code}-p1-${q.id}`} className="a4-question-block text-sm leading-relaxed">
                          <div className="math-wrap">
                            <span className="font-bold mr-1.5">Câu {idx + 1}:</span>
                            <MathText text={q.prompt} />
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-1.5 pl-2">
                            {(q.options || []).map((opt, oIdx) => (
                              <div key={oIdx} className="flex items-start gap-1.5 math-wrap">
                                <span className="font-bold shrink-0">
                                  {OPTION_LETTERS[oIdx]}.
                                </span>
                                <MathText text={opt} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Part II */}
                {parts.part2.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <h3 className="font-extrabold text-sm uppercase text-slate-900">
                      PHẦN II. Câu trắc nghiệm đúng sai.{' '}
                      <span className="font-normal normal-case text-slate-700">
                        Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.
                      </span>
                    </h3>
                    <div className="space-y-3.5">
                      {parts.part2.map((q, idx) => (
                        <div key={`${variant.code}-p2-${q.id}`} className="a4-question-block text-sm leading-relaxed">
                          <div className="math-wrap">
                            <span className="font-bold mr-1.5">Câu {idx + 1}:</span>
                            <MathText text={q.prompt} />
                          </div>
                          <div className="space-y-1 mt-1.5 pl-4">
                            {(q.statements || []).map((st) => (
                              <div key={st.id} className="flex items-start gap-1.5 math-wrap">
                                <span className="font-bold shrink-0">{st.id})</span>
                                <MathText text={st.text} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Part III */}
                {parts.part3.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <h3 className="font-extrabold text-sm uppercase text-slate-900">
                      PHẦN III. Câu trắc nghiệm trả lời ngắn.{' '}
                      <span className="font-normal normal-case text-slate-700">
                        Thí sinh điền đáp số ngắn gọn vào phiếu trả lời.
                      </span>
                    </h3>
                    <div className="space-y-3">
                      {parts.part3.map((q, idx) => (
                        <div key={`${variant.code}-p3-${q.id}`} className="a4-question-block text-sm leading-relaxed">
                          <div className="math-wrap">
                            <span className="font-bold mr-1.5">Câu {idx + 1}:</span>
                            <MathText text={q.prompt} />
                          </div>
                          <div className="mt-1 text-xs text-slate-600 pl-4">
                            Đáp số: .................................
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-8 pt-3 border-t border-slate-300 text-center text-xs font-semibold text-slate-600">
                  —————— HẾT —————— (Mã đề {variant.code})
                </div>
              </article>
            );
          })}

          {/* Consolidated Answer Key Sheet */}
          <article
            className={`a4-print-sheet bg-white text-slate-900 rounded-2xl shadow-2xl p-7 sm:p-11 max-w-[820px] mx-auto border border-slate-200 ${
              activeVariantTab === 'answers'
                ? 'block'
                : includeAnswerSheet
                ? 'hidden print:block'
                : 'hidden'
            }`}
          >
            <div className="text-center pb-4 border-b-2 border-slate-900 space-y-1">
              <h3 className="text-base sm:text-lg font-black uppercase">
                BẢNG ĐÁP ÁN TỔNG HỢP — {activeExam.title}
              </h3>
              <p className="text-xs text-slate-600">
                Chuẩn cấu trúc 3 phần GDPT 2018 · Gồm {variants.length} mã đề đã trộn
              </p>
            </div>

            <div className="mt-5 space-y-6">
              {variants.map((v) => (
                <div key={`ans-${v.code}`} className="a4-question-block border border-slate-300 rounded-xl p-4 space-y-2.5">
                  <div className="font-black text-sm text-slate-900 border-b border-slate-200 pb-1.5">
                    MÃ ĐỀ {v.code}
                  </div>
                  {v.answerKey.part1.length > 0 && (
                    <div className="text-xs">
                      <span className="font-bold text-slate-800 mr-2">Phần I:</span>
                      <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
                        {v.answerKey.part1.map((item) => (
                          <span key={item.index} className="font-mono">
                            {item.index}.<strong>{item.letter}</strong>
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                  {v.answerKey.part2.length > 0 && (
                    <div className="text-xs">
                      <span className="font-bold text-slate-800 mr-2">Phần II:</span>
                      <span className="inline-flex flex-wrap gap-x-4 gap-y-1">
                        {v.answerKey.part2.map((item) => (
                          <span key={item.index} className="font-mono">
                            Câu {item.index}: <strong>{item.answers}</strong>
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                  {v.answerKey.part3.length > 0 && (
                    <div className="text-xs">
                      <span className="font-bold text-slate-800 mr-2">Phần III:</span>
                      <span className="inline-flex flex-wrap gap-x-4 gap-y-1">
                        {v.answerKey.part3.map((item) => (
                          <span key={item.index} className="font-mono">
                            Câu {item.index}: <strong>{item.answer}</strong>
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    );
  }

  // ==================== MAIN STUDIO VIEW ====================
  return (
    <div className="space-y-8">
      {/* Page Header & Mode Tabs */}
      <section className="rounded-3xl bg-[#0F172A]/85 border border-blue-500/25 p-6 sm:p-8 shadow-[0_20px_50px_rgba(7,11,25,0.7)] space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-bold">
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xưởng Tạo Đề Thi · Chuẩn GDPT 2018</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Tạo & Trộn Đề Thi Thông Minh
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              Tìm kiếm & tổng hợp đề thi thật từ Internet bằng Google Search Grounding, hoặc tạo đề theo ma trận chuyên đề SGK Kết nối tri thức để thi thử bấm giờ và trộn nhiều mã đề in A4/PDF.
            </p>
          </div>

          {/* Builder Mode Switcher */}
          <div className="inline-flex flex-wrap sm:flex-nowrap p-1.5 rounded-2xl bg-[#070B19] border border-blue-500/25 self-start shrink-0">
            <button
              type="button"
              onClick={() => setBuilderMode('search')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-all ${
                builderMode === 'search'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-4 h-4 shrink-0" />
              <span>Tìm Đề Trên Mạng (Google Search)</span>
            </button>
            <button
              type="button"
              onClick={() => setBuilderMode('matrix')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-all ${
                builderMode === 'matrix'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow-md shadow-blue-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              <span>Ma Trận Chuyên Đề</span>
            </button>
          </div>
        </div>

        {/* Shared Exam Structure Count Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
          <div>
            <label htmlFor="exam-mc-count" className="block text-[11px] font-bold text-slate-400 mb-1">
              Phần I · Trắc nghiệm 4 chọn
            </label>
            <select
              id="exam-mc-count"
              value={mcCount}
              onChange={(e) => setMcCount(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-[#070B19] border border-blue-500/25 text-xs font-bold text-white"
            >
              <option value={4}>4 câu</option>
              <option value={6}>6 câu</option>
              <option value={8}>8 câu</option>
              <option value={12}>12 câu (Chuẩn THPT)</option>
            </select>
          </div>

          <div>
            <label htmlFor="exam-tf-count" className="block text-[11px] font-bold text-slate-400 mb-1">
              Phần II · Đúng / Sai (a,b,c,d)
            </label>
            <select
              id="exam-tf-count"
              value={tfCount}
              onChange={(e) => setTfCount(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-[#070B19] border border-blue-500/25 text-xs font-bold text-white"
            >
              <option value={1}>1 câu</option>
              <option value={2}>2 câu</option>
              <option value={4}>4 câu (Chuẩn THPT)</option>
            </select>
          </div>

          <div>
            <label htmlFor="exam-sa-count" className="block text-[11px] font-bold text-slate-400 mb-1">
              Phần III · Trả lời ngắn
            </label>
            <select
              id="exam-sa-count"
              value={saCount}
              onChange={(e) => setSaCount(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-[#070B19] border border-blue-500/25 text-xs font-bold text-white"
            >
              <option value={2}>2 câu</option>
              <option value={4}>4 câu</option>
              <option value={6}>6 câu (Chuẩn THPT)</option>
            </select>
          </div>

          <div>
            <label htmlFor="exam-duration-select" className="block text-[11px] font-bold text-slate-400 mb-1">
              Thời gian làm bài
            </label>
            <select
              id="exam-duration-select"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-[#070B19] border border-blue-500/25 text-xs font-bold text-white"
            >
              <option value={15}>15 phút (Kiểm tra nhanh)</option>
              <option value={45}>45 phút (1 tiết)</option>
              <option value={60}>60 phút</option>
              <option value={90}>90 phút (THPT Quốc gia)</option>
            </select>
          </div>
        </div>

        {/* 10-Exam Auto-Replenish Pool Control Strip */}
        <div className="rounded-2xl bg-[#070B19]/90 border border-cyan-500/30 p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              data-testid="exam-pool-badge"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/15 border border-cyan-400/35 text-cyan-200 text-xs font-extrabold tabular-nums"
            >
              <span>
                📦 Kho dự trữ: {poolStatus.readyCount}/{poolStatus.totalCount} đề sẵn sàng (Đề số #{poolStatus.currentSlotNumber})
              </span>
            </span>
            {poolNotice && (
              <span className="text-xs text-emerald-300 font-semibold">
                {poolNotice}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              data-testid="btn-draw-pool-exam"
              onClick={handleBuildLocalExam}
              disabled={isReplenishingPool}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:brightness-110 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition-all whitespace-nowrap"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>⚡ Tạo / Trộn Đề Mới (Tức thì)</span>
            </button>

            <button
              type="button"
              data-testid="btn-replenish-pool"
              onClick={handleReplenishPoolFromAi}
              disabled={isReplenishingPool || isGenerating}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600/25 hover:bg-blue-600/40 border border-cyan-400/40 text-cyan-200 text-xs font-bold transition-all disabled:opacity-60 whitespace-nowrap"
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
        </div>

        {/* MODE 1: GOOGLE SEARCH GROUNDING */}
        {builderMode === 'search' ? (
          <form onSubmit={handleSearchOnlineExam} className="space-y-4">
            <div className="rounded-2xl bg-[#070B19]/90 border border-cyan-500/30 p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-xs font-extrabold text-cyan-300">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  Tìm Kiếm & Tổng Hợp Đề Trên Mạng (Google Search Grounding)
                </span>
                <span className="px-2.5 py-0.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-[11px] font-mono text-blue-300">
                  gemini-3.8-flash · tools: googleSearch
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-cyan-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="VD: Tìm đề thi thử THPT Quốc gia 2026 môn Toán có lời giải..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0F172A] border border-blue-500/30 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-bold shadow-lg shadow-blue-500/30 hover:scale-[1.01] transition-transform disabled:opacity-60 whitespace-nowrap"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang tra cứu & lọc đề...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Tìm Kiếm & Tổng Hợp Đề</span>
                    </>
                  )}
                </button>
              </div>

              {/* Suggestion Chips */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-400">
                  Gợi ý tìm kiếm nhanh:
                </div>
                <div className="flex flex-wrap gap-2">
                  {SEARCH_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setSearchQuery(suggestion)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors text-left ${
                        searchQuery === suggestion
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-[#0F172A]/80 border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:text-white'
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Hệ thống tự động loại bỏ các câu hỏi chương trình cũ (như Số phức), chuẩn hóa công thức sang KaTeX, sắp xếp theo cấu trúc 3 phần GDPT 2018 và đính kèm link nguồn tham khảo trực tiếp.
              </p>
            </div>
          </form>
        ) : (
          /* MODE 2: MATRIX CHAPTER BUILDER */
          <div className="rounded-2xl bg-[#070B19]/90 border border-blue-500/25 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-cyan-300">
                Chọn chuyên đề SGK Kết nối tri thức ({grade === 'thpt' ? 'Ôn thi THPT 10–12' : `Lớp ${grade}`})
              </span>
              <button
                type="button"
                onClick={() => setSelectedChapterIds([])}
                className="text-xs font-semibold text-slate-400 hover:text-cyan-300"
              >
                {selectedChapterIds.length === 0 ? 'Đang chọn: Tất cả chuyên đề' : 'Chọn lại tất cả'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
              {chapters.map((ch) => {
                const checked = selectedChapterIds.includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => toggleChapterSelection(ch.id)}
                    className={`text-left px-3 py-2 rounded-xl border text-xs transition-all flex items-center gap-2 ${
                      checked
                        ? 'bg-blue-600/25 border-cyan-400 text-white font-semibold'
                        : 'bg-[#0F172A]/70 border-slate-800 text-slate-300 hover:border-blue-500/40'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 text-[10px] ${
                        checked
                          ? 'bg-cyan-500 border-cyan-400 text-slate-950 font-black'
                          : 'border-slate-600'
                      }`}
                    >
                      {checked ? '✓' : ''}
                    </span>
                    <span className="truncate">
                      {ch.grade}.{ch.order} {ch.title}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleBuildLocalExam}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-xs sm:text-sm font-bold shadow-md hover:scale-[1.01] transition-transform"
              >
                <BookCheck className="w-4 h-4" />
                <span>Tạo Đề Nhanh (Kho GDPT 2018)</span>
              </button>

              <button
                type="button"
                disabled={isGenerating}
                onClick={handleGenerateAiMatrixExam}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-md hover:scale-[1.01] transition-transform disabled:opacity-60"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AI đang soạn đề...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Sinh Đề Mới Bằng Gemini AI</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Friendly Fallback Model Switching Status */}
        {isGenerating && fallbackStatus && (
          <p className="text-xs text-cyan-300/95 font-medium flex items-center gap-2 px-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-cyan-400" />
            <span>{fallbackStatus}</span>
          </p>
        )}

        {/* Error Alert (only shown if all models fail) */}
        {errorMsg && !isGenerating && (
          <div className="rounded-2xl bg-amber-950/45 border border-amber-500/35 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm text-amber-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={onOpenApiKeyModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-white text-xs font-bold shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Cài đặt API Key</span>
            </button>
          </div>
        )}
      </section>

      {/* ACTIVE EXAM PREVIEW & ACTIONS */}
      {activeExam && (
        <section className="space-y-6">
          {/* Action Bar & Exam Metadata */}
          <div className="rounded-3xl bg-[#0F172A]/85 border border-blue-500/25 p-5 sm:p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-5 shadow-xl">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${
                    activeExam.sourceType === 'search'
                      ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                      : activeExam.sourceType === 'ai'
                      ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300'
                      : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                  }`}
                >
                  {activeExam.sourceType === 'search'
                    ? 'Google Search Grounding'
                    : activeExam.sourceType === 'ai'
                    ? 'Gemini AI'
                    : 'Kho chuẩn GDPT 2018'}
                </span>
                <span className="text-xs text-slate-400 font-semibold">
                  {activeExam.questions.length} câu hỏi · {activeExam.durationMinutes} phút
                </span>
                {activeExam.modelUsed && (
                  <span className="text-[11px] font-mono text-slate-500">
                    ({activeExam.modelUsed})
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                {activeExam.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">{activeExam.subtitle}</p>
            </div>

            {/* Primary Dual Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowSolutions((s) => !s)}
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-[#070B19] border border-slate-700 hover:border-cyan-400 text-slate-200 text-xs font-bold transition-colors"
              >
                {showSolutions ? (
                  <>
                    <EyeOff className="w-4 h-4 text-slate-400" />
                    <span>Ẩn đáp án</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 text-cyan-400" />
                    <span>Xem đáp án & lời giải</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleEnterExamRoom}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-500/30 hover:scale-[1.02] transition-transform"
              >
                <Play className="w-4 h-4" />
                <span>Vào phòng thi bấm giờ trực tiếp</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenShufflePrint()}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-500/25 hover:scale-[1.02] transition-transform"
              >
                <Printer className="w-4 h-4" />
                <span>Trộn nhiều mã đề & Xuất bản In A4 / PDF</span>
              </button>
            </div>
          </div>

          {/* Structured 3-Part Exam Preview */}
          <div className="space-y-6">
            {partitioned.part1.length > 0 && (
              <div className="space-y-3">
                <div className="px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/25 text-cyan-300 text-xs sm:text-sm font-extrabold">
                  PHẦN I. Trắc nghiệm nhiều phương án lựa chọn ({partitioned.part1.length} câu)
                </div>
                <div className="space-y-3">
                  {partitioned.part1.map((q, idx) => (
                    <PreviewQuestionCard
                      key={q.id}
                      index={idx + 1}
                      question={q}
                      showSolution={showSolutions}
                    />
                  ))}
                </div>
              </div>
            )}

            {partitioned.part2.length > 0 && (
              <div className="space-y-3">
                <div className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs sm:text-sm font-extrabold">
                  PHẦN II. Trắc nghiệm đúng sai ({partitioned.part2.length} câu)
                </div>
                <div className="space-y-3">
                  {partitioned.part2.map((q, idx) => (
                    <PreviewQuestionCard
                      key={q.id}
                      index={idx + 1}
                      question={q}
                      showSolution={showSolutions}
                    />
                  ))}
                </div>
              </div>
            )}

            {partitioned.part3.length > 0 && (
              <div className="space-y-3">
                <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs sm:text-sm font-extrabold">
                  PHẦN III. Trắc nghiệm trả lời ngắn ({partitioned.part3.length} câu)
                </div>
                <div className="space-y-3">
                  {partitioned.part3.map((q, idx) => (
                    <PreviewQuestionCard
                      key={q.id}
                      index={idx + 1}
                      question={q}
                      showSolution={showSolutions}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Grounding Sources (Links) Card */}
          {(activeExam.sources.length > 0 ||
            (activeExam.searchQueriesUsed && activeExam.searchQueriesUsed.length > 0)) && (
            <div className="rounded-3xl bg-[#0F172A]/85 border border-cyan-500/30 p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  <span>Nguồn đề tham khảo (Links)</span>
                </h3>
                <span className="text-xs text-cyan-300 font-semibold">
                  {activeExam.sources.length} liên kết xác thực từ Google Search
                </span>
              </div>

              {activeExam.searchQueriesUsed && activeExam.searchQueriesUsed.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                  <span>Truy vấn đã tìm:</span>
                  {activeExam.searchQueriesUsed.map((qText, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-lg bg-[#070B19] border border-slate-700 text-slate-300"
                    >
                      {qText}
                    </span>
                  ))}
                </div>
              )}

              {activeExam.sources.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {activeExam.sources.map((src, idx) => (
                    <a
                      key={`${src.uri}-${idx}`}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group rounded-2xl bg-[#070B19]/90 border border-blue-500/20 hover:border-cyan-400/60 p-3.5 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-cyan-300 group-hover:text-cyan-200 truncate">
                          {src.title}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{src.uri}</div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-cyan-300 shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

const PreviewQuestionCard: React.FC<{
  index: number;
  question: QuizQuestion;
  showSolution: boolean;
}> = ({ index, question, showSolution }) => {
  return (
    <div className="rounded-2xl bg-[#0F172A]/80 border border-blue-500/20 p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-slate-100 leading-relaxed math-wrap">
          <span className="font-extrabold text-cyan-400 mr-2">Câu {index}.</span>
          <MathText text={question.prompt} />
        </div>
        <span className="shrink-0 px-2 py-0.5 rounded-lg bg-slate-800 text-[10px] font-semibold text-slate-400">
          {question.chapterTitle}
        </span>
      </div>

      {question.format === 'multiple_choice' && question.options && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
          {question.options.map((opt, oIdx) => {
            const isCorrect = showSolution && question.correctIndex === oIdx;
            return (
              <div
                key={oIdx}
                className={`px-3.5 py-2.5 rounded-xl border math-wrap flex items-start gap-2 ${
                  isCorrect
                    ? 'bg-emerald-500/15 border-emerald-400/60 text-emerald-200'
                    : 'bg-[#070B19]/70 border-slate-800 text-slate-300'
                }`}
              >
                <span className="font-bold text-cyan-400 shrink-0">
                  {OPTION_LETTERS[oIdx]}.
                </span>
                <MathText text={opt} />
              </div>
            );
          })}
        </div>
      )}

      {question.format === 'true_false' && question.statements && (
        <div className="space-y-1.5 text-xs sm:text-sm">
          {question.statements.map((st) => (
            <div
              key={st.id}
              className="px-3.5 py-2 rounded-xl bg-[#070B19]/70 border border-slate-800 flex items-center justify-between gap-3"
            >
              <div className="text-slate-200 math-wrap">
                <span className="font-bold text-amber-300 mr-1.5">{st.id})</span>
                <MathText text={st.text} />
              </div>
              {showSolution && (
                <span
                  className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-bold ${
                    st.isTrue
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {st.isTrue ? 'Đúng' : 'Sai'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {question.format === 'short_answer' && showSolution && (
        <div className="text-xs sm:text-sm font-bold text-emerald-300">
          Đáp án: {question.shortAnswer}
        </div>
      )}

      {showSolution && (
        <div className="rounded-xl bg-[#070B19] border border-blue-500/20 p-3.5 text-xs text-slate-300 leading-relaxed math-wrap">
          <span className="font-bold text-cyan-300">Lời giải: </span>
          <MathText text={question.explanation} />
        </div>
      )}
    </div>
  );
};
