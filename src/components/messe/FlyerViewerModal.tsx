import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import MesseModal from './MesseModal';
import { FLYER_PAGES, FLYER_PDF } from '@/data/messeNews';

interface Props {
  open: boolean;
  onClose: () => void;
  lang: PortalUiLanguage;
}

/**
 * Two-page flyer viewer. Pages are pre-rendered images of the source PDF, so
 * the aspect ratio is preserved (object-contain) and the flyer always fits the
 * available height. The original PDF stays available via open/download.
 */
export default function FlyerViewerModal({ open, onClose, lang }: Props) {
  const [page, setPage] = useState(0);
  const [failed, setFailed] = useState(false);
  const total = FLYER_PAGES.length;

  useEffect(() => {
    if (open) {
      setPage(0);
      setFailed(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setPage((p) => Math.min(p + 1, total - 1));
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(p - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, total]);

  return (
    <MesseModal
      open={open}
      onClose={onClose}
      title={t('messe_news_flyer_modal_title', lang)}
      closeLabel={t('close', lang)}
      widthClass="max-w-4xl"
    >
      <div className="flex items-center gap-2 sm:gap-4">
        <button
          type="button"
          aria-label={t('messe_news_flyer_prev', lang)}
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(p - 1, 0))}
          className="shrink-0 rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex-grow flex items-center justify-center bg-slate-100 rounded-xl overflow-hidden">
          {failed ? (
            <div className="py-16 px-6 text-center text-sm text-slate-500">
              {t('messe_news_flyer_missing', lang)}
            </div>
          ) : (
            <img
              key={FLYER_PAGES[page]}
              src={FLYER_PAGES[page]}
              alt={`${t('messe_news_flyer_modal_title', lang)} — ${t('messe_news_flyer_page', lang)} ${page + 1}`}
              onError={() => setFailed(true)}
              className="max-h-[60vh] w-auto max-w-full object-contain"
            />
          )}
        </div>

        <button
          type="button"
          aria-label={t('messe_news_flyer_next', lang)}
          disabled={page >= total - 1}
          onClick={() => setPage((p) => Math.min(p + 1, total - 1))}
          className="shrink-0 rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-500">
          {t('messe_news_flyer_page', lang)} {page + 1} {t('messe_news_flyer_of', lang)} {total}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={FLYER_PDF}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            {t('messe_news_flyer_open', lang)}
          </a>
          <a
            href={FLYER_PDF}
            download
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            {t('messe_news_flyer_download', lang)}
          </a>
        </div>
      </div>
    </MesseModal>
  );
}
