/**
 * ProductImageViewer — reusable, exhibition-friendly Timan product image viewer.
 *
 * Renders a single configuration (one image set + optional hotspots).
 * Selection UI (base machine, equipment, badges) lives in the wrapper that
 * picks the active configuration.
 *
 * Features:
 *   - Drag-to-rotate (mouse + touch) when the configuration has ≥ 2 frames.
 *   - Pinch-to-zoom on touch, mouse-wheel zoom on desktop.
 *   - Zoom in / zoom out / reset zoom buttons.
 *   - Auto-rotate toggle (only when there are ≥ 2 frames).
 *   - Prev / next frame arrows (only when there are ≥ 2 frames).
 *   - Preloads every image of the active configuration before allowing
 *     interaction (prevents flicker / drag lag).
 *   - Hotspot overlay with title / description / optional image + link.
 *   - Friendly placeholder when the image set is empty.
 *
 * IMPORTANT: images are rendered as-is, with object-fit: contain. We never
 * recolor, crop, upscale or recompress the originals.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, RotateCw, Pause, ImageOff } from 'lucide-react';
import type { ViewerConfiguration, ViewerHotspot } from './types';

import HotspotDetailModal from './HotspotDetailModal';

import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';


interface Props {
  configuration: ViewerConfiguration;
  /** Optional className for the outer wrapper. */
  className?: string;
  /** Optional visual layer shown over the image and below hotspots. */
  stageOverlayClassName?: string;
  /** Hide zoom / rotate toolbar (kiosk mode). */
  hideControls?: boolean;
  /** Lock zoom at 1 and ignore wheel/pinch zoom (kiosk mode). */
  disableZoom?: boolean;
  /** Enlarge prev/next arrow buttons for touchscreen use. */
  largeArrows?: boolean;
}


const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;
/** Pixels of horizontal drag to advance one frame. */
const DRAG_PX_PER_FRAME = 30;
const AUTO_ROTATE_INTERVAL_MS = 120;

/**
 * Compute a callout's centre position (percent). Prefers an explicit
 * `calloutCenter` so callouts can orbit around the machine silhouette without
 * overlapping. Falls back to the legacy placement-based offset.
 */
function computeCalloutPosition(h: ViewerHotspot): { cx: number; cy: number } {
  const EDGE = 7; // % margin from canvas edges
  if (h.calloutCenter) {
    return {
      cx: Math.max(EDGE, Math.min(100 - EDGE, h.calloutCenter.cx)),
      cy: Math.max(EDGE, Math.min(100 - EDGE, h.calloutCenter.cy)),
    };
  }
  const OFFSET = 28;
  const placement = h.calloutPlacement ?? 'right';
  let dx = 0, dy = 0;
  if (placement === 'right') dx = 1;
  else if (placement === 'left') dx = -1;
  else if (placement === 'top') dy = -1;
  else dy = 1;

  let cx = h.x + dx * OFFSET;
  let cy = h.y + dy * OFFSET;
  if (dx !== 0 && (cx < EDGE || cx > 100 - EDGE)) cx = h.x - dx * OFFSET;
  if (dy !== 0 && (cy < EDGE || cy > 100 - EDGE)) cy = h.y - dy * OFFSET;
  cx = Math.max(EDGE, Math.min(100 - EDGE, cx));
  cy = Math.max(EDGE, Math.min(100 - EDGE, cy));
  return { cx, cy };
}

export default function ProductImageViewer({
  configuration: config,
  className,
  stageOverlayClassName,
  hideControls = false,
  disableZoom = false,
  largeArrows = false,
}: Props) {
  const { uiLanguage } = useLanguage();
  const [frame, setFrame] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [autoRotate, setAutoRotate] = useState(false);
  const [activeHotspot, setActiveHotspot] = useState<ViewerHotspot | null>(null);
  const [preloaded, setPreloaded] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startFrame: number; pointerId: number | null }>({
    startX: 0, startFrame: 0, pointerId: null,
  });
  const pinchStateRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  const total = config.imageSequence.length;
  const canRotate = total > 1;
  const hasImage = total > 0;

  // Reset transient state when the configuration changes.
  useEffect(() => {
    setFrame(current => (total > 0 ? Math.min(current, total - 1) : 0));
    setZoom(1);
    setActiveHotspot(null);
    setAutoRotate(false);
    setPreloaded(false);
  }, [config.key, total]);

  // Preload every image of the active configuration.
  useEffect(() => {
    if (!hasImage) { setPreloaded(true); return; }
    let cancelled = false;
    let loaded = 0;
    const onDone = () => {
      loaded += 1;
      if (!cancelled && loaded === config.imageSequence.length) setPreloaded(true);
    };
    config.imageSequence.forEach(src => {
      const img = new Image();
      img.onload = onDone;
      img.onerror = onDone; // don't block UI on a missing file
      img.src = src;
    });
    return () => { cancelled = true; };
  }, [config, hasImage]);

  // Auto-rotate.
  useEffect(() => {
    if (!autoRotate || !canRotate || !preloaded) return;
    const id = window.setInterval(() => {
      setFrame(f => (f + 1) % total);
    }, AUTO_ROTATE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [autoRotate, canRotate, preloaded, total]);

  const advance = useCallback((delta: number) => {
    if (!canRotate) return;
    setFrame(f => (f + delta + total) % total);
  }, [canRotate, total]);

  // ---- Pointer (drag-to-rotate + pinch zoom) ----
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (!disableZoom && activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStateRef.current = { startDist: dist, startZoom: zoom };
      dragStateRef.current.pointerId = null;
      return;
    }

    if (canRotate && zoom === 1) {
      dragStateRef.current = { startX: e.clientX, startFrame: frame, pointerId: e.pointerId };
      setAutoRotate(false);
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (!disableZoom && pinchStateRef.current && activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = dist / pinchStateRef.current.startDist;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStateRef.current.startZoom * ratio));
      setZoom(next);
      return;
    }

    if (dragStateRef.current.pointerId === e.pointerId && canRotate) {
      const dx = e.clientX - dragStateRef.current.startX;
      const advanceFrames = Math.round(dx / DRAG_PX_PER_FRAME);
      const next = (dragStateRef.current.startFrame - advanceFrames) % total;
      setFrame(next < 0 ? next + total : next);
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) pinchStateRef.current = null;
    if (dragStateRef.current.pointerId === e.pointerId) dragStateRef.current.pointerId = null;
  }

  function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
    if (disableZoom) return;
    if (e.deltaY === 0) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2))));
  }

  const currentSrc = hasImage ? (config.imageSequence[frame] || config.imageSequence[0]) : '';
  const frameHotspots = config.hotspots.filter(h => h.frame === 0 || h.frame === frame + 1);

  const hasCalloutHotspot = activeHotspot?.variant === 'callout';

  return (
    <div className={`w-full h-full select-none ${className ?? ''}`}>
      {/* Image stage — kiosk-friendly large stage on desktop */}
      <div
        ref={stageRef}
        className="relative w-full bg-transparent overflow-hidden touch-none aspect-[4/3] lg:aspect-auto lg:h-[72vh] lg:max-h-[900px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        {hasImage && stageOverlayClassName && (
          <div aria-hidden className={`absolute inset-0 pointer-events-none z-0 ${stageOverlayClassName}`} />
        )}

        {hasImage ? (
          <img
            src={currentSrc}
            alt={`${config.label} – billede ${frame + 1}/${total}`}
            draggable={false}
            className={`absolute inset-0 z-[1] w-full h-full object-contain pointer-events-none transition-all duration-300 ${
              hasCalloutHotspot ? 'blur-sm brightness-75' : ''
            }`}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <ImageOff className="h-10 w-10 mb-2" />
            <div className="text-sm font-medium text-slate-500">Billede mangler endnu</div>
            <div className="text-xs text-slate-400 mt-1">Denne kombination er ikke fotograferet endnu.</div>
          </div>
        )}

        {/* Hotspot connector lines (single SVG overlay so lines never escape the canvas) */}
        {hasImage && (
          <svg
            aria-hidden
            className="absolute inset-0 w-full h-full pointer-events-none z-[4]"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {frameHotspots.filter(h => h.variant === 'callout').map(h => {
              const p = computeCalloutPosition(h);
              return (
                <line
                  key={`line-${h.id}`}
                  x1={h.x} y1={h.y} x2={p.cx} y2={p.cy}
                  stroke="rgb(5 150 105 / 0.85)"
                  strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
        )}

        {/* Hotspots */}
        {hasImage && frameHotspots.map(h => {
          if (h.variant === 'callout') {
            const p = computeCalloutPosition(h);
            return (
              <div key={h.id} className="absolute inset-0 pointer-events-none z-[5]">
                {/* Green plus anchor marker on the machine */}
                <button
                  type="button"
                  onClick={() => setActiveHotspot(h)}
                  className="absolute pointer-events-auto h-7 w-7 rounded-full bg-emerald-600 border-2 border-white shadow-md flex items-center justify-center text-white text-base font-bold leading-none hover:scale-110 transition"
                  style={{ left: `${h.x}%`, top: `${h.y}%`, transform: 'translate(-50%, -50%)' }}
                  aria-label={`${h.title}${h.subtitle ? ` – ${h.subtitle}` : ''}`}
                >
                  +
                </button>
                {/* Round callout bubble — outside the machine */}
                <button
                  type="button"
                  onClick={() => setActiveHotspot(h)}
                  className="absolute pointer-events-auto flex flex-col items-center justify-center bg-white border border-slate-200 rounded-full shadow-md hover:shadow-lg hover:scale-[1.04] transition text-center h-[104px] w-[104px] p-2"
                  style={{ left: `${p.cx}%`, top: `${p.cy}%`, transform: 'translate(-50%, -50%)' }}
                  aria-label={`${h.title}${h.subtitle ? ` – ${h.subtitle}` : ''}`}
                >
                  <span className="text-[12px] font-bold text-slate-900 leading-tight">{h.title}</span>
                  {h.subtitle && (
                    <span className="text-[10px] text-slate-600 leading-tight mt-0.5 px-1">{h.subtitle}</span>
                  )}
                </button>
              </div>
            );
          }
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => setActiveHotspot(h)}
              className="absolute -translate-x-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-emerald-600 border-2 border-white shadow-md hover:scale-110 transition"
              style={{ left: `${h.x}%`, top: `${h.y}%` }}
              aria-label={h.title}
            >
              <span className="block h-full w-full rounded-full animate-ping bg-emerald-400/60" />
            </button>
          );
        })}




        {/* Prev/next arrows */}
        {canRotate && (
          <>
            <button
              type="button"
              onClick={() => advance(-1)}
              className={`absolute left-7 top-1/2 -translate-y-1/2 z-[3] rounded-full bg-white/50 hover:bg-white/70 border border-slate-200/50 shadow-sm backdrop-blur-sm flex items-center justify-center ${largeArrows ? 'h-14 w-14' : 'h-10 w-10'}`}
              aria-label="Forrige billede"
            >
              <ChevronLeft className={`text-slate-500 ${largeArrows ? 'h-7 w-7' : 'h-5 w-5'}`} />
            </button>
            <button
              type="button"
              onClick={() => advance(1)}
              className={`absolute right-7 top-1/2 -translate-y-1/2 z-[3] rounded-full bg-white/50 hover:bg-white/70 border border-slate-200/50 shadow-sm backdrop-blur-sm flex items-center justify-center ${largeArrows ? 'h-14 w-14' : 'h-10 w-10'}`}
              aria-label="Næste billede"
            >
              <ChevronRight className={`text-slate-500 ${largeArrows ? 'h-7 w-7' : 'h-5 w-5'}`} />
            </button>
          </>
        )}

        {/* Frame counter */}
        {canRotate && (
          <div className="absolute bottom-3 left-3 bg-black/60 text-white text-xs font-mono px-2 py-1 rounded-md">
            {frame + 1}/{total}
          </div>
        )}

        {hasImage && !preloaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-sm">
            <div className="text-xs text-slate-600 font-medium">Indlæser billeder…</div>
          </div>
        )}

        {/* Inline (dot-style) hotspot popover */}
        {activeHotspot && !hasCalloutHotspot && (
          <div
            className="absolute z-10 max-w-xs bg-white border border-slate-200 rounded-xl shadow-lg p-3"
            style={{
              left: `${Math.min(activeHotspot.x, 70)}%`,
              top: `${Math.min(activeHotspot.y + 4, 80)}%`,
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="font-bold text-slate-900 text-sm">{activeHotspot.title}</div>
              <button
                type="button"
                onClick={() => setActiveHotspot(null)}
                className="text-slate-400 hover:text-slate-700 text-lg leading-none"
                aria-label="Luk"
              >
                ×
              </button>
            </div>
            {activeHotspot.imageUrl && (
              <img src={activeHotspot.imageUrl} alt="" className="w-full h-24 object-cover rounded-md mb-2" />
            )}
            {activeHotspot.description && (
              <p className="text-xs text-slate-600">{activeHotspot.description}</p>
            )}
            {activeHotspot.linkUrl && (
              <a href={activeHotspot.linkUrl} target="_blank" rel="noreferrer"
                 className="mt-2 inline-block text-xs font-semibold text-emerald-700 hover:underline">
                Læs mere
              </a>
            )}
          </div>
        )}
      </div>

      {/* Callout hotspot detail overlay — large kiosk-style window */}
      {hasCalloutHotspot && (
        <HotspotDetailModal hotspot={activeHotspot} onClose={() => setActiveHotspot(null)} />
      )}


      {/* Toolbar */}
      {hasImage && !hideControls && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setZoom(z => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium">
            <ZoomIn className="h-4 w-4" /> Zoom ind
          </button>
          <button type="button" onClick={() => setZoom(z => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium">
            <ZoomOut className="h-4 w-4" /> Zoom ud
          </button>
          <button type="button" onClick={() => setZoom(1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium">
            <Maximize2 className="h-4 w-4" /> Nulstil zoom
          </button>
          {canRotate && (
            <button type="button" onClick={() => setAutoRotate(a => !a)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md border text-sm font-medium ${
                      autoRotate
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}>
              {autoRotate ? <Pause className="h-4 w-4" /> : <RotateCw className="h-4 w-4" />}
              {autoRotate ? 'Stop rotation' : 'Auto-rotér'}
            </button>
          )}
          <span className="ml-auto text-xs text-slate-500">
            {canRotate ? 'Træk for at rotere · Knib eller scroll for at zoome' : 'Knib eller scroll for at zoome'}
          </span>
        </div>
      )}
    </div>
  );
}
