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

interface Props {
  configuration: ViewerConfiguration;
  /** Optional className for the outer wrapper. */
  className?: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;
/** Pixels of horizontal drag to advance one frame. */
const DRAG_PX_PER_FRAME = 30;
const AUTO_ROTATE_INTERVAL_MS = 120;

export default function ProductImageViewer({
  configuration: config,
  className,
}: Props) {
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
    setFrame(0);
    setZoom(1);
    setActiveHotspot(null);
    setAutoRotate(false);
    setPreloaded(false);
  }, [config.key]);

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

    if (activePointersRef.current.size === 2) {
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

    if (pinchStateRef.current && activePointersRef.current.size === 2) {
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
    if (e.deltaY === 0) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2))));
  }

  const currentSrc = hasImage ? (config.imageSequence[frame] || config.imageSequence[0]) : '';
  const frameHotspots = config.hotspots.filter(h => h.frame === 0 || h.frame === frame + 1);

  const hasCalloutHotspot = activeHotspot?.variant === 'callout';

  return (
    <div className={`w-full select-none ${className ?? ''}`}>
      {/* Image stage — responsive: fixed aspect on mobile, large height on desktop */}
      <div
        ref={stageRef}
        className="relative w-full bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 touch-none aspect-[4/3] lg:aspect-auto lg:h-[72vh] lg:max-h-[900px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        {hasImage ? (
          <img
            src={currentSrc}
            alt={`${config.label} – billede ${frame + 1}/${total}`}
            draggable={false}
            className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-all duration-300 ${
              hasCalloutHotspot ? 'scale-110 blur-sm brightness-75' : ''
            }`}
            style={hasCalloutHotspot ? undefined : { transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <ImageOff className="h-10 w-10 mb-2" />
            <div className="text-sm font-medium text-slate-500">Billede mangler endnu</div>
            <div className="text-xs text-slate-400 mt-1">Denne kombination er ikke fotograferet endnu.</div>
          </div>
        )}

        {/* Hotspots */}
        {hasImage && frameHotspots.map(h => {
          if (h.variant === 'callout') {
            const placement = h.calloutPlacement ?? 'right';
            // Card offset from the anchor point. Connector line spans the gap.
            const cardStyle: CSSProperties = { left: `${h.x}%`, top: `${h.y}%` };
            const cardTransform =
              placement === 'right' ? 'translate(24px, -50%)'
              : placement === 'left' ? 'translate(calc(-100% - 24px), -50%)'
              : placement === 'top' ? 'translate(-50%, calc(-100% - 24px))'
              : 'translate(-50%, 24px)';
            return (
              <div key={h.id} className="absolute z-[5]" style={cardStyle}>
                {/* Connector line */}
                <span
                  aria-hidden
                  className="absolute bg-emerald-600/70"
                  style={
                    placement === 'right'
                      ? { left: 0, top: '50%', width: 24, height: 2, transform: 'translateY(-50%)' }
                      : placement === 'left'
                      ? { right: 0, top: '50%', width: 24, height: 2, transform: 'translateY(-50%)' }
                      : placement === 'top'
                      ? { left: '50%', bottom: 0, width: 2, height: 24, transform: 'translateX(-50%)' }
                      : { left: '50%', top: 0, width: 2, height: 24, transform: 'translateX(-50%)' }
                  }
                />
                {/* Anchor dot */}
                <span
                  aria-hidden
                  className="absolute h-3 w-3 rounded-full bg-emerald-600 border-2 border-white shadow"
                  style={{ left: 0, top: 0, transform: 'translate(-50%, -50%)' }}
                />
                {/* Callout card */}
                <button
                  type="button"
                  onClick={() => setActiveHotspot(h)}
                  className="flex items-center gap-2 bg-white border-2 border-emerald-600 rounded-full pl-1.5 pr-4 py-1.5 shadow-md hover:shadow-lg hover:scale-[1.03] transition text-left min-h-[56px] min-w-[160px] max-w-[240px]"
                  style={{ transform: cardTransform }}
                  aria-label={`${h.title}${h.subtitle ? ` – ${h.subtitle}` : ''}`}
                >
                  <span className="flex-shrink-0 h-9 w-9 rounded-full bg-emerald-600 text-white flex items-center justify-center text-lg font-bold leading-none">
                    +
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="text-[13px] font-bold text-slate-900">{h.title}</span>
                    {h.subtitle && (
                      <span className="text-[11px] text-slate-600">{h.subtitle}</span>
                    )}
                  </span>
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
              className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/85 hover:bg-white shadow flex items-center justify-center"
              aria-label="Forrige billede"
            >
              <ChevronLeft className="h-5 w-5 text-slate-700" />
            </button>
            <button
              type="button"
              onClick={() => advance(1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/85 hover:bg-white shadow flex items-center justify-center"
              aria-label="Næste billede"
            >
              <ChevronRight className="h-5 w-5 text-slate-700" />
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

      {/* Callout hotspot detail modal */}
      {activeHotspot && hasCalloutHotspot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="viewer-hotspot-title"
          onClick={() => setActiveHotspot(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            {activeHotspot.imageUrl ? (
              <img
                src={activeHotspot.imageUrl}
                alt=""
                className="w-full h-48 object-contain bg-slate-50"
              />
            ) : (
              <div className="w-full h-48 bg-slate-100 flex items-center justify-center text-slate-400">
                <ImageOff className="h-10 w-10" />
              </div>
            )}
            <div className="p-5">
              <h3 id="viewer-hotspot-title" className="text-xl font-bold text-slate-900">
                {activeHotspot.title}
              </h3>
              {activeHotspot.subtitle && (
                <p className="text-sm text-emerald-700 font-semibold mt-0.5">
                  {activeHotspot.subtitle}
                </p>
              )}
              {activeHotspot.description && (
                <p className="text-sm text-slate-600 mt-2">{activeHotspot.description}</p>
              )}
              {activeHotspot.bullets && activeHotspot.bullets.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {activeHotspot.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-700">
                      <span className="text-emerald-600 font-bold leading-tight">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
              {activeHotspot.technical && activeHotspot.technical.length > 0 && (
                <div className="mt-4 border-t border-slate-200 pt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Tekniske data
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {activeHotspot.technical.map((t, i) => (
                      <div key={i} className="contents">
                        <dt className="text-slate-500">{t.label}</dt>
                        <dd className="text-slate-900 font-medium text-right">{t.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveHotspot(null)}
                  className="px-4 py-2 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold"
                >
                  Tilbage til maskinen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {hasImage && (
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
