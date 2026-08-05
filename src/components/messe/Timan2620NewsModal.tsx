import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import MesseModal from './MesseModal';
import {
  TIMAN_2620_BODY_KEYS,
  TIMAN_2620_HIGHLIGHT_KEYS,
  TIMAN_2620_ROUTE,
} from '@/data/messeNews';

interface Props {
  open: boolean;
  onClose: () => void;
  lang: PortalUiLanguage;
}

/** Editorial news modal for the Timan 2620 launch item. */
export default function Timan2620NewsModal({ open, onClose, lang }: Props) {
  const navigate = useNavigate();

  return (
    <MesseModal
      open={open}
      onClose={onClose}
      title={t('messe_news_2620_modal_title', lang)}
      closeLabel={t('close', lang)}
      widthClass="max-w-3xl"
    >
      <div className="rounded-xl overflow-hidden bg-slate-100 mb-5">
        <img
          src="/images/timan-2620/standard/01.jpg"
          alt={t('messe_news_2620_card_title', lang)}
          className="w-full h-56 sm:h-72 object-contain"
        />
      </div>

      <div className="space-y-4 text-slate-700 leading-relaxed">
        {TIMAN_2620_BODY_KEYS.map((k) => (
          <p key={k}>{t(k, lang)}</p>
        ))}
      </div>

      <h3 className="mt-6 mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
        {t('messe_news_highlights', lang)}
      </h3>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {TIMAN_2620_HIGHLIGHT_KEYS.map((k) => (
          <li key={k} className="flex items-start gap-2 text-sm text-slate-700">
            <Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
            <span>{t(k, lang)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-7 flex justify-end">
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate(TIMAN_2620_ROUTE);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
        >
          {t('messe_news_2620_cta', lang)}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </MesseModal>
  );
}
