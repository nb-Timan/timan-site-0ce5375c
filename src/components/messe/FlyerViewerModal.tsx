import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import MesseModal from './MesseModal';
import { FlyerFrontPage, FlyerBackPage } from './TeaserFlyerPages';

interface Props {
  open: boolean;
  onClose: () => void;
  lang: PortalUiLanguage;
}

/**
 * Opened-brochure flyer view. Both pages are the dynamic, fully localized
 * HTML/CSS recreation of the printed teaser flyer (front page left, back page
 * right) with a soft centre fold — no PDF pages, no viewer controls.
 */
export default function FlyerViewerModal({ open, onClose, lang }: Props) {
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
      <div className="relative flex items-stretch justify-center gap-2 sm:gap-3 rounded-xl bg-slate-100 p-[22px]">
        <div className={`${pageClass} rounded-l-sm`}>
          <div className="h-[56vh]">
            <FlyerFrontPage lang={lang} />
          </div>
        </div>

        <div className={`${pageClass} rounded-r-sm`}>
          <div className="h-[56vh]">
            <FlyerBackPage lang={lang} />
          </div>
        </div>

        {/* Soft centre fold */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-[22px] left-1/2 w-16 -translate-x-1/2 bg-gradient-to-r from-transparent via-slate-900/15 to-transparent"
        />
      </div>
    </MesseModal>
  );
}
