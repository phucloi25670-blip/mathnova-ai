import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Sparkles,
  Check,
  ExternalLink,
  Info,
  Shapes,
  Trash2,
  Wand2,
  Palette,
  RotateCw,
  Sliders,
  BookOpen,
  Lightbulb,
  Camera,
  History,
  Loader2,
  Eye,
  Calculator,
  ArrowLeft,
} from 'lucide-react';
import { DrawnShapeRecord, LabCommandSet } from '../types';
import {
  buildLocalLabCommands,
  ensureLabPedagogy,
  inferRecommendedLabMode,
  LAB_PRESETS,
  LabPresetItem,
} from '../utils/labParser';
import {
  translateLabCommandsApi,
  translateLabFromImageApi,
} from '../utils/api';
import { prepareImageForVision } from '../utils/imageUtils';
import { ThreeCanvasStudio } from './ThreeCanvasStudio';
import { Graph2DCanvas } from './Graph2DCanvas';
import { MathBlock, MathText } from './MathText';

interface MathLabViewProps {
  onOpenApiKeyModal: () => void;
  drawnHistory?: DrawnShapeRecord[];
  onSaveDrawnShape?: (shape: Omit<DrawnShapeRecord, 'id' | 'timestamp'>) => void;
  onRecordActivity?: () => void;
}

type LabMode = '2d' | '3d';
type StudioSubTab = 'simulator' | 'calculus' | 'casio';

const TECH_COLORS = [
  { name: 'Cyan Tech', hex: '#06B6D4' },
  { name: 'Neon Violet', hex: '#8B5CF6' },
  { name: 'Amber Glow', hex: '#F59E0B' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Azure Blue', hex: '#3B82F6' },
];

function getCasioKeyClass(keyLabel: string): string {
  const upper = keyLabel.toUpperCase();
  if (upper === 'SHIFT') {
    return 'bg-amber-500/20 border-amber-400/60 text-amber-300';
  }
  if (upper === 'ALPHA') {
    return 'bg-rose-500/20 border-rose-400/60 text-rose-300';
  }
  if (upper === 'MENU' || upper === 'MODE' || upper === 'ON') {
    return 'bg-blue-500/25 border-blue-400/60 text-cyan-200';
  }
  if (upper === '=' || upper === 'CALC' || upper === '∫') {
    return 'bg-cyan-500/25 border-cyan-400/60 text-cyan-200';
  }
  return 'bg-slate-800 border-slate-600 text-slate-100';
}

export const MathLabView: React.FC<MathLabViewProps> = ({
  onOpenApiKeyModal: _onOpenApiKeyModal,
  drawnHistory = [],
  onSaveDrawnShape,
  onRecordActivity,
}) => {
  const [labMode, setLabMode] = useState<LabMode>('3d');
  const [activeSubTab, setActiveSubTab] = useState<StudioSubTab>('simulator');
  const [activePresetId, setActivePresetId] = useState<string>(LAB_PRESETS[0].id);
  const [problemInput, setProblemInput] = useState(LAB_PRESETS[0].prompt);
  const [commandSet, setCommandSet] = useState<LabCommandSet>(() =>
    buildLocalLabCommands(LAB_PRESETS[0].prompt)
  );
  const [isTranslating, setIsTranslating] = useState(false);
  const [isVisionScanning, setIsVisionScanning] = useState(false);
  const [fallbackStatus, setFallbackStatus] = useState<string | null>(null);
  const [visionPreviewUrl, setVisionPreviewUrl] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [plotFeedback, setPlotFeedback] = useState<string | null>(null);
  const visionInputRef = React.useRef<HTMLInputElement>(null);

  // Visual Customization States
  const [activeColor, setActiveColor] = useState(TECH_COLORS[0]);
  const [objectOpacity, setObjectOpacity] = useState(0.45);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [showHiddenEdges, setShowHiddenEdges] = useState(true);

  const pedagogySet = useMemo(
    () => ensureLabPedagogy(commandSet, problemInput),
    [commandSet, problemInput]
  );

  const handleClearAllBoards = useCallback(() => {
    setCommandSet({
      title: 'Khung tọa độ trống',
      desmos2d: [],
      geogebra3d: [],
      notes: 'Nhập đề bài hoặc chọn mô hình mẫu để vẽ.',
      source: 'local',
      problemSummary: 'Chưa có đề bài nào được chọn.',
      solutionTitle: 'Chưa có bài toán đang phân tích',
      solutionSteps: [
        {
          title: 'Chọn mô hình mẫu hoặc nhập phương trình',
          detail: 'Chuyển sang tab Mô phỏng 3D & Đồ thị để chọn một Preset hoặc nhập hàm số $y = f(x)$, hệ thống sẽ tự động cập nhật lời giải tại đây.',
        },
      ],
      casioSteps: [
        {
          title: 'Chờ đề bài để tạo tổ hợp phím Casio fx-580VNX',
          keys: ['MENU', '1'],
          explanation: 'Chọn một mô hình mẫu hoặc bấm "Vẽ ngay lên đồ thị" để xem hướng dẫn bấm máy chi tiết.',
        },
      ],
    });
    setActivePresetId('');
    setPlotFeedback('Đã làm sạch không gian đồ họa.');
    window.setTimeout(() => setPlotFeedback(null), 2400);
  }, []);

  const executePlot = useCallback((_nextSet: LabCommandSet, targetMode: LabMode) => {
    setLabMode(targetMode);
    setPlotFeedback(
      targetMode === '2d'
        ? 'Đã vẽ đồ thị 2D Canvas tương tác!'
        : 'Đã dựng mô hình 3D WebGL Three.js!'
    );
    window.setTimeout(() => setPlotFeedback(null), 2500);
  }, []);

  const handleSelectPreset = (preset: LabPresetItem) => {
    setActivePresetId(preset.id);
    setProblemInput(preset.prompt);
    const parsed = buildLocalLabCommands(preset.prompt);
    setCommandSet(parsed);
    setNoticeMsg(null);
    executePlot(parsed, preset.recommendedMode);
    onSaveDrawnShape?.({
      title: preset.label,
      prompt: preset.prompt,
      mode: preset.recommendedMode,
      commandSet: parsed,
    });
    onRecordActivity?.();
  };

  const handleAutoPlotCurrent = () => {
    const trimmed = problemInput.trim();
    if (!trimmed) return;
    setActivePresetId('');
    const mode = inferRecommendedLabMode(trimmed);
    const parsed = buildLocalLabCommands(trimmed);
    setCommandSet(parsed);
    setNoticeMsg(null);
    executePlot(parsed, mode);
    onSaveDrawnShape?.({
      title: parsed.title || trimmed.slice(0, 48),
      prompt: trimmed,
      mode,
      commandSet: parsed,
    });
    onRecordActivity?.();
  };

  const handleAiGenerateAndPlot = async () => {
    const trimmed = problemInput.trim();
    if (!trimmed) return;
    setIsTranslating(true);
    setFallbackStatus(null);
    setNoticeMsg(null);
    setActivePresetId('');
    const targetMode = inferRecommendedLabMode(trimmed);

    try {
      const rawResult = await translateLabCommandsApi(trimmed, (statusMsg) =>
        setFallbackStatus(statusMsg)
      );
      const enriched = ensureLabPedagogy(rawResult, trimmed);
      setCommandSet(enriched);
      executePlot(enriched, targetMode);
      onSaveDrawnShape?.({
        title: enriched.title || trimmed.slice(0, 48),
        prompt: trimmed,
        mode: targetMode,
        commandSet: enriched,
      });
      onRecordActivity?.();
    } catch {
      const localFallback = buildLocalLabCommands(trimmed);
      setCommandSet(localFallback);
      executePlot(localFallback, targetMode);
      onSaveDrawnShape?.({
        title: localFallback.title || trimmed.slice(0, 48),
        prompt: trimmed,
        mode: targetMode,
        commandSet: localFallback,
      });
      onRecordActivity?.();
      setNoticeMsg('Đã tự động dịch đề bằng bộ phân tích cục bộ siêu tốc để dựng hình ngay.');
    } finally {
      setIsTranslating(false);
      setFallbackStatus(null);
    }
  };

  const handleVisionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsVisionScanning(true);
    setFallbackStatus(null);
    setNoticeMsg(null);
    setActivePresetId('');

    try {
      const prepared = await prepareImageForVision(file);
      setVisionPreviewUrl(prepared.dataUrl);
      const rawResult = await translateLabFromImageApi({
        imageBase64: prepared.base64,
        mimeType: prepared.mimeType,
        extraPrompt: problemInput.trim(),
        onFallbackStatus: (statusMsg) => setFallbackStatus(statusMsg),
      });
      const enriched = ensureLabPedagogy(rawResult, rawResult.recognizedProblem);
      setProblemInput(rawResult.recognizedProblem);
      setCommandSet(enriched);
      executePlot(enriched, rawResult.recommendedMode);
      onSaveDrawnShape?.({
        title: enriched.title || rawResult.recognizedProblem.slice(0, 48),
        prompt: rawResult.recognizedProblem,
        mode: rawResult.recommendedMode,
        commandSet: enriched,
      });
      onRecordActivity?.();
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      setNoticeMsg(`Không thể quét ảnh bài toán: ${rawMsg}`);
    } finally {
      setIsVisionScanning(false);
      setFallbackStatus(null);
    }
  };

  const handleLoadDrawnRecord = (record: DrawnShapeRecord) => {
    setActivePresetId('');
    setProblemInput(record.prompt);
    const enriched = ensureLabPedagogy(record.commandSet, record.prompt);
    setCommandSet(enriched);
    executePlot(enriched, record.mode);
  };

  const externalUrl =
    labMode === '2d'
      ? 'https://www.desmos.com/calculator'
      : 'https://www.geogebra.org/3d';

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <section className="rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 p-6 sm:p-7 text-white shadow-[0_20px_50px_-15px_rgba(37,99,235,0.4)] border border-blue-400/30 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-white/20 text-xs font-bold text-white mb-1">
            <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
            <span>WebGL Three.js · Đồ thị 2D Canvas Tương Tác</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Phòng Thí Nghiệm Đồ Họa 3D & Tích Phân
          </h1>
          <p className="text-sm text-blue-100/90">
            Xoay 360° với nét đứt cạnh khuất chuẩn SGK, đồ thị 2D tự động bắt giao điểm/cực trị và lời giải Casio đồng bộ.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleClearAllBoards}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-rose-600/90 hover:bg-rose-600 text-xs font-bold text-white shadow-md transition-all whitespace-nowrap"
          >
            <Trash2 className="w-4 h-4" />
            Làm sạch khung vẽ
          </button>

          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/25 text-xs font-bold text-white transition-all whitespace-nowrap"
          >
            <ExternalLink className="w-4 h-4" />
            Mở toàn trang
          </a>
        </div>
      </section>

      {/* Sub-Tabs Bar */}
      <div
        role="group"
        aria-label="Chế độ Studio 3D"
        className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-[#0F172A]/80 border border-blue-500/20"
      >
        <button
          type="button"
          onClick={() => setActiveSubTab('simulator')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeSubTab === 'simulator'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/30'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <Box className="w-4 h-4 text-cyan-400" />
          <span>Mô phỏng 3D & Đồ thị</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('calculus')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeSubTab === 'calculus'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/30'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <BookOpen className="w-4 h-4 text-emerald-400" />
          <span>Giải tích Thể tích & Bước giải</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('casio')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeSubTab === 'casio'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/30'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <Lightbulb className="w-4 h-4 text-amber-400" />
          <span>Mẹo Casio & Luyện tập</span>
        </button>
      </div>

      {activeSubTab === 'calculus' ? (
        <section className="rounded-3xl bg-[#0F172A]/90 border border-blue-500/20 p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-blue-500/20 pb-5">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-300">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Lời giải tự động theo đề bài đang chọn</span>
              </div>
              <h2 className="text-xl font-bold text-white">
                <MathText text={pedagogySet.solutionTitle || pedagogySet.title} />
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                <span className="font-semibold text-cyan-300">Đề bài: </span>
                <MathText text={pedagogySet.problemSummary || problemInput || pedagogySet.title} />
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveSubTab('simulator')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#070B19] hover:bg-slate-800 border border-blue-500/30 text-xs font-bold text-cyan-300 transition-colors shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Quay lại hình vẽ
            </button>
          </div>

          <div className="space-y-4">
            {(pedagogySet.solutionSteps || []).map((step, idx) => (
              <div
                key={`sol-step-${idx}`}
                className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-5 space-y-3"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-extrabold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <h3 className="text-sm sm:text-base font-bold text-cyan-300">
                    <MathText text={step.title} />
                  </h3>
                </div>
                <div className="text-xs sm:text-sm text-slate-200 leading-relaxed pl-8">
                  <MathText text={step.detail} />
                </div>
                {step.formulaLatex && (
                  <div className="ml-8 p-3.5 rounded-xl bg-slate-900/90 border border-blue-500/25 text-center text-cyan-300 overflow-x-auto">
                    <MathBlock latex={step.formulaLatex} displayMode={true} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {pedagogySet.finalResultLatex && (
            <div className="rounded-2xl bg-gradient-to-r from-emerald-950/80 to-cyan-950/70 border border-emerald-500/40 p-5 space-y-2">
              <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                Kết luận & Đáp số chuẩn
              </div>
              <div className="text-emerald-200 overflow-x-auto">
                <MathBlock latex={pedagogySet.finalResultLatex} displayMode={true} />
              </div>
            </div>
          )}
        </section>
      ) : activeSubTab === 'casio' ? (
        <section className="rounded-3xl bg-[#0F172A]/90 border border-blue-500/20 p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-blue-500/20 pb-5">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs font-bold text-amber-300">
                <Calculator className="w-3.5 h-3.5" />
                <span>Casio fx-580VNX · Tối ưu riêng cho bài toán hiện tại</span>
              </div>
              <h2 className="text-xl font-bold text-white">
                <MathText text={`Mẹo bấm máy cho: ${pedagogySet.title}`} />
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                <span className="font-semibold text-amber-300">Áp dụng cho đề: </span>
                <MathText text={pedagogySet.problemSummary || problemInput || pedagogySet.title} />
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveSubTab('simulator')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#070B19] hover:bg-slate-800 border border-blue-500/30 text-xs font-bold text-cyan-300 transition-colors shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Quay lại hình vẽ
            </button>
          </div>

          <div className="space-y-4">
            {(pedagogySet.casioSteps || []).map((cStep, idx) => (
              <div
                key={`casio-step-${idx}`}
                className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-5 space-y-3"
              >
                <h3 className="text-sm sm:text-base font-bold text-amber-300 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 shrink-0 text-amber-400" />
                  <MathText text={cStep.title} />
                </h3>

                {Array.isArray(cStep.keys) && cStep.keys.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {cStep.keys.map((keyCap, kIdx) => (
                      <React.Fragment key={`k-${kIdx}`}>
                        <span
                          className={`inline-flex items-center justify-center min-w-[30px] px-2.5 py-1 rounded-lg border text-xs font-extrabold font-mono shadow-sm ${getCasioKeyClass(
                            keyCap
                          )}`}
                        >
                          {keyCap}
                        </span>
                        {kIdx < cStep.keys.length - 1 && (
                          <span className="text-slate-500 text-xs font-bold">›</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                <div className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  <MathText text={cStep.explanation} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        /* Studio Simulator Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Three.js WebGL 3D Canvas / Interactive HTML5 2D Canvas */}
          <section className="lg:col-span-7 rounded-3xl bg-[#0F172A]/90 border-2 border-cyan-500/30 overflow-hidden shadow-[0_20px_50px_rgba(7,11,25,0.8)]">
            <div className="px-5 py-3.5 border-b border-blue-500/20 flex flex-wrap items-center justify-between gap-2 text-xs bg-[#070B19]">
              <span className="font-bold text-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                {labMode === '3d'
                  ? 'WebGL Three.js 3D Studio (Interactive Orbit)'
                  : 'Đồ thị 2D Canvas Tương Tác (Dark Mode)'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLabMode('3d')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    labMode === '3d' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  3D Three.js
                </button>
                <button
                  type="button"
                  onClick={() => setLabMode('2d')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    labMode === '2d' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  2D Canvas
                </button>
              </div>
            </div>

            {plotFeedback && (
              <div className="px-5 py-2 bg-cyan-600 text-slate-950 text-xs font-extrabold flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{plotFeedback}</span>
              </div>
            )}

            <div className="relative w-full h-[480px] lg:h-[620px] bg-[#0B1021]">
              {labMode === '3d' ? (
                <ThreeCanvasStudio
                  commandSet={commandSet}
                  isAutoRotating={isAutoRotating}
                  objectOpacity={objectOpacity}
                  highlightColor={activeColor.hex}
                  showHiddenEdges={showHiddenEdges}
                />
              ) : (
                <Graph2DCanvas
                  commandSet={commandSet}
                  highlightColor={activeColor.hex}
                />
              )}
            </div>
          </section>

          {/* Right: Visual Presets & Custom Input Deck */}
          <section className="lg:col-span-5 rounded-3xl bg-[#0F172A]/90 border border-blue-500/20 p-5 sm:p-6 space-y-6 shadow-[0_10px_30px_rgba(7,11,25,0.6)]">
            {/* Visual Presets List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white inline-flex items-center gap-2">
                  <Shapes className="w-4 h-4 text-cyan-400" />
                  Mô Hình Mẫu Tiêu Biểu (Visual Presets)
                </h2>
                <span className="text-[11px] font-semibold text-cyan-400">Chạm để dựng</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {LAB_PRESETS.map((preset) => {
                  const isActive = activePresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`flex items-center justify-between gap-2.5 px-3.5 py-3 rounded-2xl border text-left text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-gradient-to-r ' + preset.colorTheme + ' text-white border-transparent shadow-md shadow-blue-500/30'
                          : 'bg-[#070B19] border-blue-500/20 text-slate-300 hover:border-cyan-400'
                      }`}
                    >
                      <span className="truncate">{preset.label}</span>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-xl shrink-0 ${
                          isActive ? 'bg-white/25 text-white' : 'bg-blue-500/20 text-cyan-300'
                        }`}
                      >
                        {preset.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Customization Deck */}
            <div className="space-y-3.5 pt-3 border-t border-blue-500/20">
              <h2 className="text-sm font-bold text-white inline-flex items-center gap-2">
                <Palette className="w-4 h-4 text-cyan-400" />
                Tinh Chỉnh Đồ Họa 3D & SGK
              </h2>

              <div className="flex items-center gap-2">
                {TECH_COLORS.map((c) => {
                  const selected = activeColor.hex === c.hex;
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      title={c.name}
                      onClick={() => setActiveColor(c)}
                      style={{ backgroundColor: c.hex }}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        selected ? 'border-white ring-2 ring-cyan-400 scale-110 shadow-md' : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                    />
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#070B19] border border-blue-500/20 p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                      Độ trong suốt
                    </span>
                    <span className="tabular-nums font-bold text-cyan-400">
                      {Math.round(objectOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                    value={objectOpacity}
                    onChange={(e) => setObjectOpacity(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-[#070B19] border border-blue-500/20 p-3">
                  <span className="text-xs font-semibold text-slate-300 inline-flex items-center gap-1.5">
                    <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                    Tự động xoay 360°
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAutoRotating((v) => !v)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                      isAutoRotating ? 'bg-cyan-500 text-slate-950 shadow-xs' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {isAutoRotating ? 'Bật' : 'Tắt'}
                  </button>
                </div>
              </div>

              {/* Hidden-line SGK Toggle */}
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#070B19] border border-blue-500/25 px-3.5 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Eye className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-100 truncate">
                      Chế độ Nét đứt Cạnh khuất (Chuẩn SGK)
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      Cạnh thấy nét liền · Cạnh khuất nét đứt động 360°
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showHiddenEdges}
                  aria-label="Chế độ Nét đứt Cạnh khuất (Chuẩn SGK)"
                  onClick={() => setShowHiddenEdges((v) => !v)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    showHiddenEdges
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {showHiddenEdges ? 'Đang Bật' : 'Đã Tắt'}
                </button>
              </div>
            </div>

            {/* Prompt Input, Camera/Vision & Auto-Plot */}
            <div className="space-y-3 pt-3 border-t border-blue-500/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="lab-problem-textarea"
                  className="block text-xs font-semibold text-slate-300"
                >
                  <MathText text="Nhập hàm số $f(x)$ hoặc phương trình không gian Oxyz:" />
                </label>

                <input
                  ref={visionInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleVisionImageUpload}
                  className="hidden"
                  aria-label="Quét Camera hoặc chọn ảnh đề bài"
                />
                <button
                  type="button"
                  onClick={() => visionInputRef.current?.click()}
                  disabled={isVisionScanning}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600/80 to-cyan-600/80 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-60 text-white text-xs font-bold border border-cyan-400/30 shadow-sm transition-all"
                >
                  {isVisionScanning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang quét ảnh AI...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-3.5 h-3.5" />
                      <span>Quét Camera / Chọn Ảnh Đề Bài</span>
                    </>
                  )}
                </button>
              </div>

              {visionPreviewUrl && (
                <div className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-[#070B19] border border-cyan-500/30">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={visionPreviewUrl}
                      alt="Ảnh đề bài đã tải"
                      className="w-12 h-12 rounded-xl object-cover border border-blue-500/30 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-cyan-300 truncate">
                        {isVisionScanning ? 'Gemini Vision đang đọc đề bài...' : 'Đã nhận diện đề bài từ ảnh'}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        gemini-3.8-flash Multimodal
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVisionPreviewUrl(null)}
                    className="text-[11px] font-bold text-slate-400 hover:text-white px-2 py-1"
                  >
                    Ẩn ảnh
                  </button>
                </div>
              )}

              <textarea
                id="lab-problem-textarea"
                rows={2}
                value={problemInput}
                onChange={(e) => setProblemInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleAutoPlotCurrent();
                  }
                }}
                placeholder="Ví dụ: mặt cầu tâm I(1,2,3) bán kính 4, hoặc y = x^3 - 3x..."
                className="w-full px-3.5 py-3 rounded-2xl bg-[#070B19] border border-blue-500/30 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleAutoPlotCurrent}
                  disabled={!problemInput.trim()}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 disabled:opacity-50 text-white text-sm font-bold shadow-md shadow-blue-500/30 hover:scale-105 transition-transform"
                >
                  <Wand2 className="w-4 h-4" />
                  Vẽ ngay lên đồ thị (1 Chạm)
                </button>
                <button
                  type="button"
                  onClick={handleAiGenerateAndPlot}
                  disabled={isTranslating || !problemInput.trim()}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#070B19] hover:bg-slate-800 disabled:opacity-50 text-slate-200 text-sm font-bold border border-blue-500/30 transition-all"
                >
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  {isTranslating ? 'Đang dịch...' : 'AI Dịch đề'}
                </button>
              </div>
            </div>

            {(isTranslating || isVisionScanning) && fallbackStatus && (
              <p className="text-xs text-cyan-300/95 font-medium flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-cyan-400" />
                <span>{fallbackStatus}</span>
              </p>
            )}

            {noticeMsg && !(isTranslating || isVisionScanning) && (
              <div className="rounded-2xl bg-blue-950/60 border border-blue-500/30 p-3 flex items-start gap-2 text-xs text-blue-200">
                <Info className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
                <span>{noticeMsg}</span>
              </div>
            )}

            {/* Drawn 2D/3D History for Current Account */}
            {drawnHistory.length > 0 && (
              <div className="space-y-2.5 pt-3 border-t border-blue-500/20">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-300 inline-flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-cyan-400" />
                    Lịch sử hình 2D/3D đã vẽ ({drawnHistory.length})
                  </h3>
                  <span className="text-[11px] text-slate-400">Chạm để vẽ lại</span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {drawnHistory.slice(0, 8).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleLoadDrawnRecord(item)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#070B19] border border-blue-500/20 hover:border-cyan-400 text-left transition-all"
                    >
                      <span className="text-xs font-semibold text-slate-200 truncate">
                        {item.title || item.prompt}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 text-cyan-300 text-[10px] font-extrabold uppercase shrink-0">
                        {item.mode}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
