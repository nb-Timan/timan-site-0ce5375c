import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import MesseModal from './MesseModal';
import { FLYER_PAGES } from '@/data/messeNews';

interface Props {
  open: boolean;
  onClose: () => void;
  lang: PortalUiLanguage;
}

/**
 * Opened-brochure flyer view. Both pre-rendered pages are shown side by side
 * (front page left, back page right) with a soft centre fold, so it reads as a
 * printed A4 brochure lying open rather than a PDF viewer.
 */
export default function FlyerViewerModal({ open, onClose, lang }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (open) setFailed(false);
  }, [open]);

  const pageClass =
    'bg-white p-1.5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-200';

  return (
    <MesseModal
      open={open}
      onClose={onClose}
      title={t('messe_news_flyer_modal_title', lang)}
      closeLabel={t('close', lang)}
      widthClass="max-w-[86rem]"
      bodyClass="px-3 sm:px-4 py-3"
    >
      {failed ? (
        <div className="py-16 px-6 text-center text-sm text-slate-500">
          {t('messe_news_flyer_missing', lang)}
        </div>
      ) : (
        <div className="relative flex items-stretch justify-center gap-2 sm:gap-3 rounded-xl bg-slate-100 p-[22px]">
          <div className={`${pageClass} rounded-l-sm`}>
            <img
              src={FLYER_PAGES[0]}
              alt={`${t('messe_news_flyer_modal_title', lang)} — 1`}
              onError={() => setFailed(true)}
              className="h-[56vh] w-auto max-w-full object-contain"
            />
          </div>

          <div className={`${pageClass} rounded-r-sm`}>
            <img
              src={FLYER_PAGES[1]}
              alt={`${t('messe_news_flyer_modal_title', lang)} — 2`}
              onError={() => setFailed(true)}
              className="h-[56vh] w-auto max-w-full object-contain"
            />
          </div>

          {/* Soft centre fold */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-[22px] left-1/2 w-16 -translate-x-1/2 bg-gradient-to-r from-transparent via-slate-900/15 to-transparent"
          />
        </div>
      )}
    </MesseModal>
  );
}
