import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Image, Loader2, Upload, X } from 'lucide-react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { NewsFieldDefinition, NewsImageTransform } from '@/features/news-cms/templates/types';
import { supabase } from '@/lib/supabase';

interface Props {
  lang: PortalUiLanguage;
  field: NewsFieldDefinition;
  value: string;
  onChange: (value: string) => void;
  transform?: Partial<NewsImageTransform>;
  onTransformChange?: (value: NewsImageTransform) => void;
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100';

const DEFAULT_TRANSFORM: NewsImageTransform = { x: 0, y: 0, scale: 1 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTransform(value?: Partial<NewsImageTransform>): NewsImageTransform {
  return {
    x: clamp(typeof value?.x === 'number' ? value.x : DEFAULT_TRANSFORM.x, -45, 45),
    y: clamp(typeof value?.y === 'number' ? value.y : DEFAULT_TRANSFORM.y, -45, 45),
    scale: clamp(typeof value?.scale === 'number' ? value.scale : DEFAULT_TRANSFORM.scale, 1, 2.5),
  };
}

function extensionFromFile(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  return 'jpg';
}

export default function NewsImageUploadField({ lang, field, value, onChange, transform, onTransformChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
  } | null>(null);
  const movedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeTransform = normalizeTransform(transform);

  const updateTransform = (next: Partial<NewsImageTransform>) => {
    onTransformChange?.(normalizeTransform({ ...activeTransform, ...next }));
  };

  const resetTransform = () => {
    onTransformChange?.(DEFAULT_TRANSFORM);
  };

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError(t('newsCmsImageInvalidFile', lang));
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const ext = extensionFromFile(file);
      const day = new Date().toISOString().slice(0, 10);
      const path = `images/${day}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('news-assets')
        .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('news-assets').getPublicUrl(path);
      onChange(data.publicUrl);
      resetTransform();
    } catch (err) {
      console.warn('[NewsImageUploadField] upload failed:', err);
      setError(t('newsCmsImageUploadFailed', lang));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="block">
      <span className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
        {t(field.labelKey, lang)}
        {field.required && <span className="text-rose-500">*</span>}
      </span>

      <div
        role="button"
        tabIndex={0}
        aria-disabled={uploading}
        onClick={() => {
          if (uploading) return;
          if (movedRef.current) {
            movedRef.current = false;
            return;
          }
          inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (uploading) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void uploadFile(file);
        }}
        className={`group flex min-h-[148px] w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed px-4 py-4 text-center transition ${
          dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/40'
        }`}
      >
        {value ? (
          <span
            className="relative block h-28 w-full touch-none overflow-hidden rounded-lg bg-white"
            onPointerDown={(event: PointerEvent<HTMLSpanElement>) => {
              if (!onTransformChange) return;
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              panRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                originX: activeTransform.x,
                originY: activeTransform.y,
                width: rect.width || 1,
                height: rect.height || 1,
              };
              movedRef.current = false;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event: PointerEvent<HTMLSpanElement>) => {
              const pan = panRef.current;
              if (!pan || pan.pointerId !== event.pointerId || !onTransformChange) return;
              event.preventDefault();
              const nextX = pan.originX + ((event.clientX - pan.startX) / pan.width) * 100;
              const nextY = pan.originY + ((event.clientY - pan.startY) / pan.height) * 100;
              if (Math.abs(nextX - pan.originX) > 0.4 || Math.abs(nextY - pan.originY) > 0.4) movedRef.current = true;
              onTransformChange(normalizeTransform({ ...activeTransform, x: nextX, y: nextY }));
            }}
            onPointerUp={(event: PointerEvent<HTMLSpanElement>) => {
              if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
            }}
            onPointerCancel={() => {
              panRef.current = null;
            }}
          >
            <img
              src={value}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
              style={{
                transform: `translate(${activeTransform.x}%, ${activeTransform.y}%) scale(${activeTransform.scale})`,
                transformOrigin: 'center',
              }}
            />
            <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 text-sm font-bold text-white opacity-0 transition group-hover:bg-slate-950/35 group-hover:opacity-100">
              {t('newsCmsImageReplace', lang)}
            </span>
          </span>
        ) : (
          <>
            <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            </span>
            <span className="text-sm font-bold text-slate-800">
              {uploading ? t('newsCmsImageUploading', lang) : t('newsCmsImageDropTitle', lang)}
            </span>
            <span className="mt-1 text-xs text-slate-500">{t('newsCmsImageDropHelp', lang)}</span>
          </>
        )}
      </div>

      {value && onTransformChange && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Billedplacering</p>
            <button type="button" onClick={resetTransform} className="text-xs font-bold text-emerald-700 hover:text-emerald-800">
              Nulstil
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-500">Træk i billedet eller brug skyderne.</p>
          <label className="block text-xs font-semibold text-slate-500">
            Zoom
            <input
              type="range"
              min="1"
              max="2.5"
              step="0.05"
              value={activeTransform.scale}
              onChange={(event) => updateTransform({ scale: Number(event.target.value) })}
              className="mt-1 w-full accent-emerald-600"
            />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-500">
              Vandret
              <input
                type="range"
                min="-45"
                max="45"
                step="1"
                value={activeTransform.x}
                onChange={(event) => updateTransform({ x: Number(event.target.value) })}
                className="mt-1 w-full accent-emerald-600"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-500">
              Lodret
              <input
                type="range"
                min="-45"
                max="45"
                step="1"
                value={activeTransform.y}
                onChange={(event) => updateTransform({ y: Number(event.target.value) })}
                className="mt-1 w-full accent-emerald-600"
              />
            </label>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void uploadFile(file);
        }}
      />

      <div className="mt-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Image className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="url"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={`${inputClass} pl-9`}
            placeholder={t('newsCmsImagePasteUrl', lang)}
          />
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            title={t('newsCmsImageRemove', lang)}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="mt-1 text-xs text-slate-400">{t('newsCmsImageManualUrlHelp', lang)}</p>
      {error && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{error}</p>}
      {field.helpKey && <p className="mt-1 text-xs text-slate-400">{t(field.helpKey, lang)}</p>}
    </div>
  );
}
