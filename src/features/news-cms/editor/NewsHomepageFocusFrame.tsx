import { useRef, type PointerEvent } from 'react';
import { Move, RotateCcw } from 'lucide-react';
import type { NewsImageTransform } from '@/features/news-cms/templates/types';
import {
  DEFAULT_NEWS_IMAGE_TRANSFORM,
  normalizeNewsImageTransform,
  readNewsImageTransform,
} from '@/features/news-cms/lib/newsImageTransform';

interface Props {
  imageUrl: string;
  headline: string;
  transform: unknown;
  onTransformChange: (transform: NewsImageTransform) => void;
}

export function NewsHomepageFocusOverlay({ transform, onTransformChange }: Pick<Props, 'transform' | 'onTransformChange'>) {
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
  } | null>(null);
  const selectedTransform = readNewsImageTransform(transform);
  const activeTransform = selectedTransform || DEFAULT_NEWS_IMAGE_TRANSFORM;

  const updateFromPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = drag.originX + ((event.clientX - drag.startX) / drag.width) * 90;
    const y = drag.originY + ((event.clientY - drag.startY) / drag.height) * 90;
    onTransformChange(normalizeNewsImageTransform({ ...activeTransform, x, y }));
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
          startX: event.clientX,
          startY: event.clientY,
          originX: activeTransform.x,
          originY: activeTransform.y,
          width: rect.width || 1,
          height: rect.height || 1,
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
      className="absolute z-20 h-[74%] w-[34%] cursor-grab border-2 border-dashed border-white bg-slate-950/5 shadow-[0_0_0_999px_rgba(15,23,42,0.12)] active:cursor-grabbing"
      style={{
        left: `${50 + activeTransform.x * 0.55}%`,
        top: `${50 + activeTransform.y * 0.3}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/65 text-white">
        <Move className="h-4 w-4" />
      </span>
    </button>
  );
}

export default function NewsHomepageFocusFrame({ imageUrl, headline, transform, onTransformChange }: Props) {
  const selectedTransform = readNewsImageTransform(transform);
  const activeTransform = selectedTransform || DEFAULT_NEWS_IMAGE_TRANSFORM;
  const imageClass = selectedTransform ? 'object-contain' : 'object-cover';

  if (!imageUrl) return null;

  return (
    <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_190px]">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Forsidefokus</h3>
            <p className="mt-1 text-xs text-slate-500">Træk den stiplede ramme i previewet til det udsnit, der skal bruges på forsiden.</p>
          </div>
          <button
            type="button"
            onClick={() => onTransformChange(DEFAULT_NEWS_IMAGE_TRANSFORM)}
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
            className={`h-full w-full ${imageClass}`}
            style={{
              transform: `translate(${activeTransform.x}%, ${activeTransform.y}%) scale(${activeTransform.scale})`,
              transformOrigin: 'center',
            }}
          />
        </div>
        <p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-800">{headline || 'Nyhedstitel'}</p>
      </div>
    </section>
  );
}
