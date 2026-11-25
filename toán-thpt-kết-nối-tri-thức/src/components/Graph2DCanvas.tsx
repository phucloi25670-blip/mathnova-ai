import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, ZoomIn, ZoomOut } from 'lucide-react';
import { LabCommandSet } from '../types';
import {
  findFunctionExtrema,
  findFunctionIntersections,
  GraphPointFeature,
  parseDesmosCommandsForCanvas,
} from '../utils/graph2dMath';

interface Graph2DCanvasProps {
  commandSet: LabCommandSet;
  highlightColor?: string;
}

interface ViewportState {
  centerX: number;
  centerY: number;
  pixelsPerUnit: number;
}

const CURVE_PALETTE = ['#06B6D4', '#8B5CF6', '#F59E0B', '#10B981'];

function chooseGridStep(pixelsPerUnit: number): number {
  const targetPx = 68;
  const rawStep = targetPx / Math.max(pixelsPerUnit, 1e-4);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  if (norm <= 1.5) return 1 * mag;
  if (norm <= 3.5) return 2 * mag;
  if (norm <= 7.5) return 5 * mag;
  return 10 * mag;
}

function formatTickLabel(val: number, step: number): string {
  if (Math.abs(val) < 1e-9) return '0';
  if (step >= 1) return String(Math.round(val));
  const decimals = Math.min(4, Math.max(1, -Math.floor(Math.log10(step)) + 1));
  return Number(val.toFixed(decimals)).toString();
}

export const Graph2DCanvas: React.FC<Graph2DCanvasProps> = ({
  commandSet,
  highlightColor = '#06B6D4',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 700, height: 540 });

  const parsedScene = useMemo(
    () => parseDesmosCommandsForCanvas(commandSet.desmos2d || []),
    [commandSet.desmos2d]
  );

  const computeInitialViewport = useCallback(
    (w: number, h: number): ViewportState => {
      const { xMin, xMax, yMin, yMax } = parsedScene.suggestedBounds;
      const spanX = Math.max(2, xMax - xMin);
      const spanY = Math.max(2, yMax - yMin);
      const ppuX = w / spanX;
      const ppuY = h / spanY;
      const ppu = Math.max(18, Math.min(180, Math.min(ppuX, ppuY)));
      return {
        centerX: (xMin + xMax) / 2,
        centerY: (yMin + yMax) / 2,
        pixelsPerUnit: ppu,
      };
    },
    [parsedScene]
  );

  const [viewport, setViewport] = useState<ViewportState>(() =>
    computeInitialViewport(size.width, size.height)
  );
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origCenterX: number;
    origCenterY: number;
  }>({ active: false, startX: 0, startY: 0, origCenterX: 0, origCenterY: 0 });

  // Reset viewport cleanly whenever commandSet changes
  useEffect(() => {
    setViewport(computeInitialViewport(size.width, size.height));
  }, [commandSet, computeInitialViewport, size.width, size.height]);

  // Observe container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const w = el.clientWidth || 700;
      const h = el.clientHeight || 540;
      setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute key intersections and extrema in current visible x-range
  const features = useMemo<GraphPointFeature[]>(() => {
    const halfWorldW = size.width / (2 * viewport.pixelsPerUnit);
    const xLo = viewport.centerX - halfWorldW - 0.5;
    const xHi = viewport.centerX + halfWorldW + 0.5;
    const list: GraphPointFeature[] = [];

    // Intersections between pairs of functions first (highest visual priority)
    if (parsedScene.functions.length >= 2) {
      const f1 = parsedScene.functions[0];
      const f2 = parsedScene.functions[1];
      const inters = findFunctionIntersections(f1.fn, f2.fn, xLo, xHi);
      list.push(...inters.slice(0, 6));
    }

    // Extrema of non-constant functions
    parsedScene.functions.slice(0, 2).forEach((fnItem) => {
      if (fnItem.expr.trim() === '0') return;
      const dLo = fnItem.domain ? Math.max(xLo, fnItem.domain[0]) : xLo;
      const dHi = fnItem.domain ? Math.min(xHi, fnItem.domain[1]) : xHi;
      if (dHi <= dLo) return;
      const ex = findFunctionExtrema(fnItem.fn, dLo, dHi);
      list.push(...ex.slice(0, 6));
    });

    return list;
  }, [parsedScene.functions, size.width, viewport.centerX, viewport.pixelsPerUnit]);

  // Draw 2D Graph onto high-DPI HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = size;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const { centerX, centerY, pixelsPerUnit: ppu } = viewport;
    const toPxX = (wx: number) => width / 2 + (wx - centerX) * ppu;
    const toPxY = (wy: number) => height / 2 - (wy - centerY) * ppu;
    const toWorldX = (px: number) => centerX + (px - width / 2) / ppu;
    const toWorldY = (py: number) => centerY - (py - height / 2) / ppu;

    const xMin = toWorldX(0);
    const xMax = toWorldX(width);
    const yMin = toWorldY(height);
    const yMax = toWorldY(0);

    // 1. Background (#0B1021 Deep Tech Navy)
    ctx.fillStyle = '#0B1021';
    ctx.fillRect(0, 0, width, height);

    // Subtle radial accent glow
    const bgGlow = ctx.createRadialGradient(
      width * 0.5,
      height * 0.45,
      20,
      width * 0.5,
      height * 0.45,
      Math.max(width, height) * 0.65
    );
    bgGlow.addColorStop(0, 'rgba(6, 182, 212, 0.07)');
    bgGlow.addColorStop(1, 'rgba(11, 16, 33, 0)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, width, height);

    // 2. Gridlines (Minor & Major)
    const majorStep = chooseGridStep(ppu);
    const minorStep = majorStep / 5;

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.07)';
    ctx.beginPath();
    const startMinorX = Math.floor(xMin / minorStep) * minorStep;
    for (let x = startMinorX; x <= xMax; x += minorStep) {
      const px = Math.round(toPxX(x)) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
    }
    const startMinorY = Math.floor(yMin / minorStep) * minorStep;
    for (let y = startMinorY; y <= yMax; y += minorStep) {
      const py = Math.round(toPxY(y)) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.18)';
    ctx.beginPath();
    const startMajorX = Math.floor(xMin / majorStep) * majorStep;
    for (let x = startMajorX; x <= xMax; x += majorStep) {
      const px = Math.round(toPxX(x)) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
    }
    const startMajorY = Math.floor(yMin / majorStep) * majorStep;
    for (let y = startMajorY; y <= yMax; y += majorStep) {
      const py = Math.round(toPxY(y)) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
    }
    ctx.stroke();

    // 3. Axes (Ox, Oy)
    const originPxX = toPxX(0);
    const originPxY = toPxY(0);

    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    if (originPxY >= -2 && originPxY <= height + 2) {
      ctx.moveTo(0, originPxY);
      ctx.lineTo(width, originPxY);
    }
    if (originPxX >= -2 && originPxX <= width + 2) {
      ctx.moveTo(originPxX, 0);
      ctx.lineTo(originPxX, height);
    }
    ctx.stroke();

    // Axis Arrowheads & Labels (x, y)
    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    if (originPxY >= 12 && originPxY <= height - 12) {
      ctx.beginPath();
      ctx.moveTo(width - 10, originPxY - 4);
      ctx.lineTo(width - 2, originPxY);
      ctx.lineTo(width - 10, originPxY + 4);
      ctx.fill();
      ctx.fillText('x', width - 16, originPxY - 10);
    }
    if (originPxX >= 12 && originPxX <= width - 12) {
      ctx.beginPath();
      ctx.moveTo(originPxX - 4, 10);
      ctx.lineTo(originPxX, 2);
      ctx.lineTo(originPxX + 4, 10);
      ctx.fill();
      ctx.fillText('y', originPxX + 10, 16);
    }

    // Tick numeric labels
    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    const labelYPos = Math.min(height - 14, Math.max(16, originPxY + 15));
    const labelXPos = Math.min(width - 34, Math.max(8, originPxX + 7));

    for (let x = startMajorX; x <= xMax; x += majorStep) {
      if (Math.abs(x) < majorStep * 0.25) continue;
      const px = toPxX(x);
      if (px < 18 || px > width - 22) continue;
      const lbl = formatTickLabel(x, majorStep);
      ctx.textAlign = 'center';
      ctx.fillText(lbl, px, labelYPos);
    }

    for (let y = startMajorY; y <= yMax; y += majorStep) {
      if (Math.abs(y) < majorStep * 0.25) continue;
      const py = toPxY(y);
      if (py < 18 || py > height - 18) continue;
      const lbl = formatTickLabel(y, majorStep);
      ctx.textAlign = 'left';
      ctx.fillText(lbl, labelXPos, py + 4);
    }

    if (originPxX >= 4 && originPxX <= width - 16 && originPxY >= 12 && originPxY <= height - 8) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#CBD5E1';
      ctx.fillText('O', originPxX - 6, originPxY + 14);
    }

    // 4. Shaded Integration Regions (between a and b)
    for (const region of parsedScene.shadedRegions) {
      const steps = 160;
      const a = region.a;
      const b = region.b;
      if (b <= a) continue;

      ctx.save();
      const grad = ctx.createLinearGradient(toPxX(a), 0, toPxX(b), 0);
      grad.addColorStop(0, 'rgba(6, 182, 212, 0.32)');
      grad.addColorStop(0.5, 'rgba(59, 130, 246, 0.28)');
      grad.addColorStop(1, 'rgba(139, 92, 246, 0.34)');
      ctx.fillStyle = grad;

      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= steps; i++) {
        const x = a + ((b - a) * i) / steps;
        const yUp = region.upperFn(x);
        if (!Number.isFinite(yUp)) continue;
        const px = toPxX(x);
        const py = Math.max(-height, Math.min(height * 2, toPxY(yUp)));
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      for (let i = steps; i >= 0; i--) {
        const x = a + ((b - a) * i) / steps;
        const yLo = region.lowerFn(x);
        if (!Number.isFinite(yLo)) continue;
        const px = toPxX(x);
        const py = Math.max(-height, Math.min(height * 2, toPxY(yLo)));
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Dashed vertical boundary markers x = a and x = b
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
      ctx.lineWidth = 1.4;
      [a, b].forEach((boundX) => {
        const u = region.upperFn(boundX);
        const l = region.lowerFn(boundX);
        if (Number.isFinite(u) && Number.isFinite(l)) {
          ctx.beginPath();
          ctx.moveTo(toPxX(boundX), toPxY(u));
          ctx.lineTo(toPxX(boundX), toPxY(l));
          ctx.stroke();
        }
      });
      ctx.restore();
    }

    // 5. Polygons
    for (const poly of parsedScene.polygons) {
      if (poly.points.length < 3) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(6, 182, 212, 0.16)';
      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      poly.points.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(toPxX(px), toPxY(py));
        else ctx.lineTo(toPxX(px), toPxY(py));
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 6. Circles
    for (const c of parsedScene.circles) {
      const px = toPxX(c.cx);
      const py = toPxY(c.cy);
      const pr = c.r * ppu;
      ctx.save();
      ctx.fillStyle = 'rgba(139, 92, 246, 0.14)';
      ctx.strokeStyle = '#8B5CF6';
      ctx.shadowColor = '#8B5CF6';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 7. Function Curves (Glowing Cyan / Violet)
    parsedScene.functions.forEach((fnItem, idx) => {
      const strokeColor = idx === 0 ? highlightColor : CURVE_PALETTE[idx % CURVE_PALETTE.length];
      const [dLo, dHi] = fnItem.domain ?? [xMin, xMax];
      const drawStart = Math.max(xMin, dLo);
      const drawEnd = Math.min(xMax, dHi);
      if (drawEnd <= drawStart) return;

      // Full faint reference outside domain if domain-restricted
      if (fnItem.domain) {
        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.globalAlpha = 0.25;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        let drawing = false;
        let prevPy = 0;
        const stepsBg = Math.max(240, Math.round(width / 2));
        for (let i = 0; i <= stepsBg; i++) {
          const wx = xMin + ((xMax - xMin) * i) / stepsBg;
          const wy = fnItem.fn(wx);
          if (!Number.isFinite(wy) || Math.abs(wy) > 1e4) {
            drawing = false;
            continue;
          }
          const px = toPxX(wx);
          const py = toPxY(wy);
          if (!drawing || Math.abs(py - prevPy) > height * 0.75) {
            ctx.moveTo(px, py);
            drawing = true;
          } else {
            ctx.lineTo(px, py);
          }
          prevPy = py;
        }
        ctx.stroke();
        ctx.restore();
      }

      // Main glowing curve
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.8;
      ctx.shadowColor = strokeColor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      let drawing = false;
      let prevPy = 0;
      const steps = Math.max(360, Math.round(width));
      for (let i = 0; i <= steps; i++) {
        const wx = drawStart + ((drawEnd - drawStart) * i) / steps;
        const wy = fnItem.fn(wx);
        if (!Number.isFinite(wy) || Math.abs(wy) > 1e4) {
          drawing = false;
          continue;
        }
        const px = toPxX(wx);
        const py = toPxY(wy);
        if (!drawing || Math.abs(py - prevPy) > height * 0.75) {
          ctx.moveTo(px, py);
          drawing = true;
        } else {
          ctx.lineTo(px, py);
        }
        prevPy = py;
      }
      ctx.stroke();
      ctx.restore();
    });

    // 8. Points + Auto Intersections & Extrema
    const allMarkers: Array<{ x: number; y: number; label: string; color: string }> = [
      ...parsedScene.points.map((p) => ({
        x: p.x,
        y: p.y,
        label: p.label || `(${p.x}; ${p.y})`,
        color: '#22D3EE',
      })),
      ...features.map((f) => ({
        x: f.x,
        y: f.y,
        label: f.label,
        color: f.kind === 'intersection' ? '#F59E0B' : '#10B981',
      })),
    ];

    // Deduplicate overlapping screen markers
    const drawnBoxes: Array<{ x: number; y: number }> = [];
    for (const m of allMarkers) {
      const px = toPxX(m.x);
      const py = toPxY(m.y);
      if (px < -10 || px > width + 10 || py < -10 || py > height + 10) continue;
      if (drawnBoxes.some((b) => Math.hypot(b.x - px, b.y - py) < 18)) continue;
      drawnBoxes.push({ x: px, y: py });

      ctx.save();
      ctx.fillStyle = m.color;
      ctx.shadowColor = m.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Label badge
      ctx.font = '700 11px Inter, system-ui, sans-serif';
      const textW = ctx.measureText(m.label).width;
      const boxW = textW + 12;
      const boxH = 20;
      const boxX = Math.min(width - boxW - 6, Math.max(6, px + 8));
      const boxY = Math.max(6, py - 24);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#F8FAFC';
      ctx.textAlign = 'left';
      ctx.fillText(m.label, boxX + 6, boxY + 13.5);
      ctx.restore();
    }

    ctx.restore();
  }, [features, highlightColor, parsedScene, size, viewport]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origCenterX: viewport.centerX,
      origCenterY: viewport.centerY,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setViewport((prev) => ({
      ...prev,
      centerX: dragRef.current.origCenterX - dx / prev.pixelsPerUnit,
      centerY: dragRef.current.origCenterY + dy / prev.pixelsPerUnit,
    }));
  };

  const handleMouseUp = () => {
    dragRef.current.active = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.14 : 0.88;
    setViewport((prev) => {
      const nextPpu = Math.max(12, Math.min(400, prev.pixelsPerUnit * factor));
      const worldX = prev.centerX + (mouseX - size.width / 2) / prev.pixelsPerUnit;
      const worldY = prev.centerY - (mouseY - size.height / 2) / prev.pixelsPerUnit;
      return {
        pixelsPerUnit: nextPpu,
        centerX: worldX - (mouseX - size.width / 2) / nextPpu,
        centerY: worldY + (mouseY - size.height / 2) / nextPpu,
      };
    });
  };

  const zoomBy = (factor: number) => {
    setViewport((prev) => ({
      ...prev,
      pixelsPerUnit: Math.max(12, Math.min(400, prev.pixelsPerUnit * factor)),
    }));
  };

  const resetView = () => {
    setViewport(computeInitialViewport(size.width, size.height));
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[480px] lg:h-[620px] bg-[#0B1021] overflow-hidden select-none"
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={resetView}
        className="w-full h-full block cursor-grab active:cursor-grabbing"
      />

      {/* Top-Left Formula Legend */}
      <div className="absolute top-3 left-3 max-w-[70%] flex flex-col gap-1.5 pointer-events-none">
        {parsedScene.functions.map((fnItem, idx) => {
          const color = idx === 0 ? highlightColor : CURVE_PALETTE[idx % CURVE_PALETTE.length];
          return (
            <div
              key={`${fnItem.name}-${idx}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0F172A]/95 border border-blue-500/30 text-xs font-mono text-slate-100 shadow-md"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="truncate">
                {fnItem.name}(x) = {fnItem.expr}
                {fnItem.domain ? ` [${fnItem.domain[0]}; ${fnItem.domain[1]}]` : ''}
              </span>
            </div>
          );
        })}
        {parsedScene.circles.map((c, idx) => (
          <div
            key={`circle-${idx}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0F172A]/95 border border-purple-500/30 text-xs font-mono text-purple-200 shadow-md"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
            <span className="truncate">{c.label}</span>
          </div>
        ))}
      </div>

      {/* Top-Right Zoom Controls */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-[#0F172A]/95 border border-blue-500/30 rounded-xl p-1 shadow-lg">
        <button
          type="button"
          onClick={() => zoomBy(1.22)}
          title="Phóng to"
          aria-label="Phóng to đồ thị 2D"
          className="p-1.5 rounded-lg text-slate-200 hover:bg-blue-500/20 hover:text-cyan-300 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(0.82)}
          title="Thu nhỏ"
          aria-label="Thu nhỏ đồ thị 2D"
          className="p-1.5 rounded-lg text-slate-200 hover:bg-blue-500/20 hover:text-cyan-300 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={resetView}
          title="Đặt lại góc nhìn"
          aria-label="Đặt lại góc nhìn 2D"
          className="p-1.5 rounded-lg text-slate-200 hover:bg-blue-500/20 hover:text-cyan-300 transition-colors"
        >
          <LocateFixed className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Interaction Hint */}
      <div className="absolute bottom-3 left-3 right-3 pointer-events-none flex items-center justify-between text-xs font-semibold px-4 py-2 rounded-xl bg-[#0F172A]/95 border border-blue-500/30 text-cyan-300 shadow-lg">
        <span>Đồ thị 2D Canvas · Kéo chuột để di chuyển · Cuộn chuột để phóng to/thu nhỏ</span>
        <span className="text-emerald-400 font-bold hidden sm:inline">Giao điểm & Cực trị tự động</span>
      </div>
    </div>
  );
};
