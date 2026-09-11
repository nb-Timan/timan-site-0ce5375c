import { useRef, type PointerEvent } from 'react';
import { Move, RotateCcw } from 'lucide-react';
import {
  DEFAULT_NEWS_HOMEPAGE_FOCUS,
  HOMEPAGE_FOCUS_FRAME_SIZE,
  normalizeNewsHomepageFocus,
  readNewsHomepageFocus,
  type NewsHomepageFocus,
} from '@/features/news-cms/lib/newsHomepageFocus';

interface Props {
  imageUrl: string;
  headline: string;
  focus: unknown;
  onFocusChange: (focus: NewsHomepageFocus) => void;
}

export function NewsHomepageFocusOverlay({ focus, onFocusChange }: Pick<Props, 'focus' | 'onFocusChange'>) {
  const dragRef = useRef<{
    pointerId: number;
    bounds: DOMRect;
  } | null>(null);
  const activeFocus = readNewsHomepageFocus(focus) || DEFAULT_NEWS_HOMEPAGE_FOCUS;

  const updateFromPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = ((event.clientX - drag.bounds.left) / drag.bounds.width) * 100;
    const y = ((event.clientY - drag.bounds.top) / drag.bounds.height) * 100;
    onFocusChange(normalizeNewsHomepageFocus({ x, y }));
  };

  return (
    <button
      type="button"
      aria-label="Flyt forsidefokus"
      onPointerDown={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.parentElement?.getBoundingClientRect();
        if (!rect) return;
        dragRef.current = {
          pointerId: event.pointerId,
          bounds: rect,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={updateFromPointer}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      className="absolute z-20 aspect-square cursor-grab border-2 border-dashed border-white bg-slate-950/5 shadow-[0_0_0_999px_rgba(15,23,42,0.12)] active:cursor-grabbing"
      style={{
        width: `${HOMEPAGE_FOCUS_FRAME_SIZE}%`,
        left: `${activeFocus.x}%`,
        top: `${activeFocus.y}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/65 text-white">
        <Move className="h-4 w-4" />
      </span>
    </button>
  );
}

export default function NewsHomepageFocusFrame({ imageUrl, headline, focus, onFocusChange }: Props) {
  const activeFocus = readNewsHomepageFocus(focus) || DEFAULT_NEWS_HOMEPAGE_FOCUS;

  if (!imageUrl) return null;

  return (
    <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_190px]">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Forsidefokus</h3>
            <p className="mt-1 text-xs text-slate-500">Hero-billedet er låst. Træk kun den stiplede ramme i previewet til det udsnit, der skal bruges på forsiden.</p>
          </div>
          <button
            type="button"
            onClick={() => onFocusChange(DEFAULT_NEWS_HOMEPAGE_FOCUS)}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Nulstil
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Forsidekort</p>
        <div className="aspect-square overflow-hidden rounded-lg bg-slate-100">
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
            style={{ objectPosition: `${activeFocus.x}% ${activeFocus.y}%` }}
          />
        </div>
        <p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-800">{headline || 'Nyhedstitel'}</p>
      </div>
    </section>
  );
}
