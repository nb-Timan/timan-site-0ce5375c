/**
 * HotspotDetailModal — shared kiosk-style detail overlay for viewer hotspots.
 *
 * Extracted from ProductImageViewer so the same modal (and the exact same
 * content payload) can be opened from other entry points, e.g. the
 * "REDSKABER" links in the Timan 2620 sidebar.
 *
 * Closes on: overlay click, X button, "Tilbage til maskinen" button, Escape.
 * Clicks inside the modal never close it.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ImageOff, X } from 'lucide-react';
import SpecificationGrid from './SpecificationGrid';
import type { ViewerHotspot } from './types';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';

export interface HotspotDetailModalNav {
  /** Selectable items rendered in the modal's left sidebar. */
  items: { id: string; label: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Future attachments: muted, struck-through, non-interactive. */
  comingSoon?: { label: string; gapBefore?: boolean }[];
  title?: string;
}

export interface HotspotDetailModalProps {
  hotspot: ViewerHotspot | null;
  onClose: () => void;
  /** Optional in-modal navigation sidebar (attachment information browser). */
  nav?: HotspotDetailModalNav;
}

export default function HotspotDetailModal({ hotspot, onClose, nav }: HotspotDetailModalProps) {
  const { uiLanguage } = useLanguage();

  useEffect(() => {
    if (!hotspot) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotspot, onClose]);

  if (!hotspot) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="viewer-hotspot-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full overflow-hidden animate-scale-in flex flex-col relative"
        style={{
          maxWidth: 'min(92rem, calc(100vw - 2rem))',
          maxHeight: 'calc(100vh - 2rem)',
          minHeight: 'min(56rem, calc(100vh - 2rem))',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('m2620_back_to_machine', uiLanguage)}
          className="absolute top-4 right-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow border border-slate-200 hover:text-emerald-700 hover:border-emerald-500 transition"
        >
          <X className="h-5 w-5" />
        </button>
        <div
          className={`grid grid-cols-1 flex-1 min-h-0 overflow-y-auto ${
            nav ? 'md:grid-cols-[16.5rem_1.2fr_1fr]' : 'md:grid-cols-2'
          }`}
        >
          {nav && (
            <nav className="border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 px-6 py-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
                {nav.title ?? 'Redskabsinformation'}
              </div>
              <div className="flex flex-col items-start gap-3">
                {nav.items.map(item => {
                  const active = item.id === nav.activeId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => nav.onSelect(item.id)}
                      className={`w-full max-w-[13rem] px-5 py-1.5 rounded-full text-sm font-semibold border transition text-center ${
                        active
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-500 hover:text-emerald-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              {nav.comingSoon && nav.comingSoon.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {nav.comingSoon.map(item => (
                    <li
                      key={item.label}
                      aria-disabled="true"
                      className={`text-sm text-slate-400 line-through select-none ${item.gapBefore ? 'pt-3' : ''}`}
                    >
                      {item.label}
                    </li>
                  ))}
                </ul>
              )}
            </nav>
          )}
          {/* Visual / future-video area */}
          <div className="bg-slate-100 relative min-h-[300px] md:min-h-[520px] flex items-center justify-center">
            {hotspot.imageUrl ? (
              <img
                src={hotspot.imageUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-contain p-4"
                style={{ transform: `scale(${(hotspot.imageScale ?? 1) * 1.2})` }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                <ImageOff className="h-12 w-12 mb-3" />
                <div className="text-sm font-medium text-slate-500">{t('m2620_media_placeholder_title', uiLanguage)}</div>
                <div className="text-xs text-slate-400 mt-1">{t('m2620_media_placeholder_sub', uiLanguage)}</div>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-6 lg:p-8 flex flex-col">
            <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-700 font-semibold">
              Timan 2620
            </div>
            <h3 id="viewer-hotspot-title" className="text-2xl lg:text-3xl font-bold text-slate-900 mt-1">
              {hotspot.title}
            </h3>
            {hotspot.subtitle && (
              <p className="text-base text-emerald-700 font-semibold mt-1">{hotspot.subtitle}</p>
            )}
            {hotspot.description && (
              <p className="text-sm lg:text-base text-slate-600 mt-3 leading-relaxed">
                {hotspot.description}
              </p>
            )}
            {hotspot.bullets && hotspot.bullets.length > 0 && (
              <ul className="mt-4 space-y-2">
                {hotspot.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2.5 text-sm lg:text-base text-slate-700">
                    <span className="text-emerald-600 font-bold leading-tight">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {hotspot.technical && hotspot.technical.length > 0 && (
              <SpecificationGrid
                className="mt-5 border-t border-slate-200 pt-4"
                title={t('m2620_spec_heading', uiLanguage)}
                items={hotspot.technical}
                splitAt={hotspot.technicalSplitAt}
                columns={hotspot.technicalColumns}
              />
            )}
            {hotspot.extra && hotspot.extra.length > 0 && (
              <SpecificationGrid
                className="mt-5 border-t border-slate-200 pt-4"
                title={hotspot.extraTitle ?? t('m2620_extra_heading', uiLanguage)}
                badge={t('m2620_extra_badge', uiLanguage)}
                items={hotspot.extra}
                splitAt={hotspot.extraSplitAt}
              />
            )}
          </div>
        </div>
        <div className="border-t border-slate-200 p-4 lg:p-5 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-sm lg:text-base font-semibold shadow"
          >
            <ChevronLeft className="h-5 w-5" />
            {t('m2620_back_to_machine', uiLanguage)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
