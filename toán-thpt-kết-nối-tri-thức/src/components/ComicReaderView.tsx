import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FolderOpen,
  Gift,
  Link2,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface ComicReaderViewProps {
  todayIso: string;
  lastComicRewardDate?: string;
  onClaimComicReward: () => boolean;
}

type ComicSourceKind = 'pdf' | 'iframe';
type ZoomLevel = 'compact' | 'fit' | 'wide';

const COMIC_URL_STORAGE_KEY = 'mathnova_comic_url_v1';
const DEFAULT_COMIC_URL = '/truyen-doraemon.html.pdf';

function stripHashAndQuery(rawUrl: string): string {
  return rawUrl.split('#')[0].split('?')[0].trim().toLowerCase();
}

function inferComicKind(url: string, explicitKind?: ComicSourceKind | null): ComicSourceKind {
  if (explicitKind) return explicitKind;
  const clean = stripHashAndQuery(url);
  if (
    clean.endsWith('.pdf') ||
    clean === '/truyen-doraemon.html' ||
    url.startsWith('data:application/pdf')
  ) {
    return 'pdf';
  }
  return 'iframe';
}

function formatComicSrc(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return DEFAULT_COMIC_URL;
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('/')) {
    return trimmed.split('#')[0];
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const ComicReaderView: React.FC<ComicReaderViewProps> = ({
  todayIso,
  lastComicRewardDate,
  onClaimComicReward,
}) => {
  const [savedUrl, setSavedUrl] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(COMIC_URL_STORAGE_KEY);
      if (stored && stored.trim()) {
        return formatComicSrc(stored);
      }
      return DEFAULT_COMIC_URL;
    } catch {
      return DEFAULT_COMIC_URL;
    }
  });
  const [urlInput, setUrlInput] = useState<string>(savedUrl);
  const [localFileName, setLocalFileName] = useState<string | null>(null);
  const [explicitKind, setExplicitKind] = useState<ComicSourceKind | null>(null);
  const [reloadNonce, setReloadNonce] = useState<number>(0);
  const [isFullscreenOverlay, setIsFullscreenOverlay] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('fit');
  const [rewardToast, setRewardToast] = useState<string | null>(null);

  // PDF.js rendering state
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [pdfPageCount, setPdfPageCount] = useState<number>(0);
  const [renderedPages, setRenderedPages] = useState<number>(0);
  const [pdfErrorMsg, setPdfErrorMsg] = useState<string | null>(null);

  const viewerShellRef = useRef<HTMLDivElement | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  const alreadyClaimedToday = lastComicRewardDate === todayIso;
  const sourceKind = useMemo(
    () => inferComicKind(savedUrl, explicitKind),
    [savedUrl, explicitKind]
  );

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreenOverlay(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreenOverlay(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onKeyDown);
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }
    };
  }, []);

  // Render all PDF pages directly to high-DPI <canvas> elements via pdfjs-dist
  useEffect(() => {
    if (sourceKind !== 'pdf') {
      setPdfStatus('idle');
      setPdfPageCount(0);
      setRenderedPages(0);
      setPdfErrorMsg(null);
      return;
    }

    const container = pdfContainerRef.current;
    if (!container) return;

    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    const cleanPdfUrl = savedUrl.startsWith('blob:') || savedUrl.startsWith('data:')
      ? savedUrl
      : savedUrl.split('#')[0];

    container.innerHTML = '';
    setPdfStatus('loading');
    setPdfPageCount(0);
    setRenderedPages(0);
    setPdfErrorMsg(null);

    const renderPdf = async () => {
      try {
        loadingTask = pdfjsLib.getDocument({ url: cleanPdfUrl });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        const total = pdfDoc.numPages;
        setPdfPageCount(total);

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let pageNum = 1; pageNum <= total; pageNum++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(pageNum);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const targetCssWidth = Math.min(960, Math.max(640, baseViewport.width * 1.35));
          const renderScale = (targetCssWidth / baseViewport.width) * dpr;
          const viewport = page.getViewport({ scale: renderScale });

          const pageCard = document.createElement('div');
          pageCard.className =
            'rounded-2xl overflow-hidden bg-white shadow-lg border border-slate-200/80 dark:border-slate-700/80';

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = 'w-full h-auto block bg-white';
          canvas.setAttribute('data-testid', 'comic-pdf-page');
          canvas.setAttribute('aria-label', `Trang ${pageNum} trên ${total}`);

          const footer = document.createElement('div');
          footer.className =
            'px-3 py-1.5 text-center text-[11px] font-bold text-slate-500 bg-slate-50 border-t border-slate-200/70';
          footer.textContent = `Trang ${pageNum} / ${total}`;

          pageCard.appendChild(canvas);
          pageCard.appendChild(footer);
          container.appendChild(pageCard);

          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          }
          if (!cancelled) {
            setRenderedPages(pageNum);
          }
        }

        if (!cancelled) {
          setPdfStatus('ready');
        }
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.message
            : 'Không thể tải tệp PDF này trực tiếp.';
        setPdfErrorMsg(msg);
        setPdfStatus('error');
      }
    };

    void renderPdf();

    return () => {
      cancelled = true;
      if (loadingTask) {
        void loadingTask.destroy();
      }
    };
  }, [savedUrl, sourceKind, reloadNonce]);

  const handleLoadUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = formatComicSrc(urlInput);
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    setLocalFileName(null);
    setExplicitKind(null);
    setSavedUrl(formatted);
    setUrlInput(formatted);
    setReloadNonce((k) => k + 1);
    try {
      localStorage.setItem(COMIC_URL_STORAGE_KEY, formatted);
    } catch {
      // ignore storage quota errors
    }
  };

  const handleResetDefault = () => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    setLocalFileName(null);
    setExplicitKind(null);
    setSavedUrl(DEFAULT_COMIC_URL);
    setUrlInput(DEFAULT_COMIC_URL);
    setReloadNonce((k) => k + 1);
    try {
      localStorage.setItem(COMIC_URL_STORAGE_KEY, DEFAULT_COMIC_URL);
    } catch {
      // ignore
    }
  };

  const handleUploadLocalComic = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
    }
    const blobUrl = URL.createObjectURL(file);
    activeBlobUrlRef.current = blobUrl;
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    setLocalFileName(file.name);
    setExplicitKind(isPdf ? 'pdf' : 'iframe');
    setSavedUrl(blobUrl);
    setUrlInput(file.name);
    setReloadNonce((k) => k + 1);
    e.target.value = '';
  };

  const handleToggleFullscreen = async () => {
    if (isFullscreenOverlay || document.fullscreenElement) {
      setIsFullscreenOverlay(false);
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // ignore
        }
      }
      return;
    }

    setIsFullscreenOverlay(true);
    if (viewerShellRef.current?.requestFullscreen) {
      try {
        await viewerShellRef.current.requestFullscreen();
      } catch {
        // Fixed-inset overlay remains active cleanly even if browser/iframe blocks native Fullscreen API
      }
    }
  };

  const handleClaim = () => {
    if (alreadyClaimedToday) return;
    const claimed = onClaimComicReward();
    if (claimed) {
      setRewardToast('Tuyệt vời! Bạn vừa nhận +15 XP & +2 ⚡ Thể lực hôm nay!');
    }
  };

  const widthClass =
    zoomLevel === 'compact'
      ? 'max-w-2xl'
      : zoomLevel === 'wide'
      ? 'max-w-6xl'
      : 'max-w-4xl';

  return (
    <div className="space-y-5">
      {/* Header & Compact Episode/URL Bar */}
      <section className="rounded-3xl bg-white dark:bg-[#0F172A]/90 border border-slate-200 dark:border-blue-500/25 p-5 sm:p-6 shadow-[0_12px_32px_-16px_rgba(15,23,42,0.16)] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-blue-50 dark:bg-cyan-500/15 border border-blue-200 dark:border-cyan-500/30 text-blue-700 dark:text-cyan-300 text-xs font-bold">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Thư Viện Truyện Tranh Toán Học · Vừa Học Vừa Giải Trí</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              📖 Doraemon & Toán – Vật Lý 12: Quả Dưa Hấu & Chiếc Ly Parabol
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              Khám phá ứng dụng Tích phân tính thể tích khối tròn xoay qua 12 trang truyện minh họa sinh động.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="comic-fullscreen-btn"
              onClick={handleToggleFullscreen}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:brightness-110 text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-500/25 transition-all whitespace-nowrap"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Mở Toàn Màn Hình (Fullscreen)</span>
            </button>
          </div>
        </div>

        {/* Compact Top Bar for Episode URL / Future PDF & HTML Upload */}
        <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-col md:flex-row md:items-center gap-2.5">
          <form onSubmit={handleLoadUrl} className="flex-1 flex flex-wrap sm:flex-nowrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <label htmlFor="comic-url-input" className="sr-only">
                Đường dẫn tập truyện (.pdf hoặc .html)
              </label>
              <input
                id="comic-url-input"
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="/truyen-doraemon.html.pdf hoặc URL tập mới..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#070B19] border border-slate-200 dark:border-blue-500/25 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 hover:opacity-90 text-white text-xs font-bold whitespace-nowrap transition-opacity"
            >
              Mở tập truyện
            </button>
          </form>

          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.html,.htm"
              onChange={handleUploadLocalComic}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
              <span>Nạp file .PDF / .HTML</span>
            </button>
            <button
              type="button"
              onClick={handleResetDefault}
              title="Khôi phục tập truyện mặc định"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tập gốc</span>
            </button>
          </div>
        </div>

        {localFileName && (
          <div className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
            Đang mở tệp từ máy của bạn: {localFileName}
          </div>
        )}
      </section>

      {/* Embedded Responsive Comic Reader (PDF.js Multi-Page Canvas for PDFs, Iframe for HTML) */}
      <section
        ref={viewerShellRef}
        className={
          isFullscreenOverlay
            ? 'fixed inset-0 z-50 bg-slate-950 flex flex-col p-2 sm:p-4'
            : 'rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-blue-500/30 overflow-hidden shadow-[0_18px_45px_-20px_rgba(15,23,42,0.28)]'
        }
      >
        {/* Top Viewer Status & Zoom Bar */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b ${
            isFullscreenOverlay
              ? 'rounded-t-2xl bg-slate-900/95 border-blue-500/30 text-white'
              : 'bg-slate-50/95 dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-bold">
            <BookOpen className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0" />
            <span>
              {sourceKind === 'pdf'
                ? pdfPageCount > 0
                  ? `Đọc truyện PDF (${renderedPages}/${pdfPageCount} trang)`
                  : 'Đang tải truyện tranh PDF...'
                : 'Trình đọc tập truyện HTML / Web'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {sourceKind === 'pdf' && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setZoomLevel((z) => (z === 'wide' ? 'fit' : 'compact'))
                  }
                  aria-label="Thu nhỏ khung đọc"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300/70 dark:border-slate-700 text-[11px] font-semibold hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel('fit')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                    zoomLevel === 'fit'
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-300/70 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                  }`}
                >
                  Vừa khung
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setZoomLevel((z) => (z === 'compact' ? 'fit' : 'wide'))
                  }
                  aria-label="Phóng to khung đọc"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300/70 dark:border-slate-700 text-[11px] font-semibold hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {isFullscreenOverlay && (
              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="ml-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shrink-0"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Thoát toàn màn hình</span>
              </button>
            )}
          </div>
        </div>

        {sourceKind === 'pdf' ? (
          <div
            data-testid="comic-pdf-viewer"
            className={
              isFullscreenOverlay
                ? 'flex-1 w-full overflow-y-auto bg-slate-900 px-2 sm:px-6 py-4 rounded-b-2xl'
                : 'w-full h-[76vh] min-h-[540px] max-h-[900px] overflow-y-auto bg-slate-200/80 dark:bg-slate-950 px-2 sm:px-5 py-4'
            }
          >
            {pdfStatus === 'loading' && renderedPages === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-600 dark:text-slate-300">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-cyan-400" />
                <p className="text-sm font-semibold">
                  Đang dựng các trang truyện minh họa...
                </p>
              </div>
            )}

            {pdfStatus === 'error' && (
              <div className="max-w-lg mx-auto my-10 rounded-2xl bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 p-5 text-center space-y-3">
                <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  Không thể tải trực tiếp tệp PDF này
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {pdfErrorMsg ||
                    'Nếu là liên kết bên ngoài bị chặn CORS, bạn có thể tải tệp PDF về máy rồi nhấn "Nạp file .PDF / .HTML".'}
                </p>
                <button
                  type="button"
                  onClick={handleResetDefault}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                >
                  Quay lại tập truyện Doraemon mặc định
                </button>
              </div>
            )}

            <div
              ref={pdfContainerRef}
              className={`${widthClass} mx-auto space-y-4 transition-all`}
            />
          </div>
        ) : (
          <div
            className={
              isFullscreenOverlay
                ? 'flex-1 w-full rounded-b-2xl overflow-hidden bg-slate-900'
                : 'w-full h-[76vh] min-h-[540px] max-h-[860px] bg-slate-100 dark:bg-slate-950 overflow-hidden'
            }
          >
            <iframe
              key={`${savedUrl}-${reloadNonce}`}
              data-testid="comic-reader-iframe"
              src={savedUrl}
              title="Truyện Tranh Toán Học — MathNova AI"
              className="w-full h-full border-0 block"
              allowFullScreen
            />
          </div>
        )}
      </section>

      {/* Daily Reading Completion Reward Bar */}
      <section className="rounded-3xl bg-gradient-to-r from-blue-50 via-cyan-50 to-amber-50 dark:from-blue-950/70 dark:via-[#0F172A] dark:to-amber-950/40 border border-blue-200 dark:border-cyan-500/30 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/25">
            <Gift className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Thưởng Đọc Truyện Mỗi Ngày</span>
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Hoàn tất đọc bộ truyện hôm nay để nhận ngay{' '}
              <span className="font-bold text-blue-700 dark:text-cyan-300">+15 XP</span> và{' '}
              <span className="font-bold text-amber-600 dark:text-amber-300">+2 ⚡ Thể lực</span> vào kho game!
            </p>
            {rewardToast && (
              <p
                data-testid="comic-reward-toast"
                className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mt-1.5"
              >
                {rewardToast}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          data-testid="comic-reward-btn"
          disabled={alreadyClaimedToday}
          onClick={handleClaim}
          className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-extrabold transition-all shrink-0 whitespace-nowrap ${
            alreadyClaimedToday
              ? 'bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 cursor-not-allowed'
              : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:brightness-110 text-white shadow-lg shadow-amber-500/25 hover:scale-[1.02]'
          }`}
        >
          {alreadyClaimedToday ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Đã nhận thưởng đọc truyện hôm nay ✓</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              <span>🎉 Đã đọc xong bộ truyện (+15 XP & +2 ⚡ Thể lực)</span>
            </>
          )}
        </button>
      </section>
    </div>
  );
};
