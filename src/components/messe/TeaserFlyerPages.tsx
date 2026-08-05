import timanLogo from '@/assets/timan-logo-transparent-trimmed.png';
import machineImg from '@/assets/flyer/f_machine.jpg.asset.json';
import b1 from '@/assets/flyer/b1.jpg.asset.json';
import b2 from '@/assets/flyer/b2.jpg.asset.json';
import b3 from '@/assets/flyer/b3.jpg.asset.json';
import b4 from '@/assets/flyer/b4.jpg.asset.json';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

/**
 * Digital, fully localized recreation of the printed Timan 2620 teaser flyer.
 *
 * Both pages are pure HTML/CSS (no PDF page images) so every string follows the
 * active Messe language and updates live when the language changes.
 *
 * Sizing: each page is a size container whose root font-size is expressed in
 * `cqh`, so the whole layout scales with the page height while text still wraps
 * naturally — longer DE/FR/PL/HU/CS strings grow in line count, not in scale.
 */

const PAGE_BASE =
  'relative h-full aspect-[1/1.414] overflow-hidden bg-white text-slate-800';

/** Diagonal red/green ribbon backdrop from the printed flyer. */
const stripes =
  'repeating-linear-gradient(115deg, rgba(148,163,184,0.16) 0 10px, transparent 10px 34px)';

interface Props {
  lang: PortalUiLanguage;
}

function FrontPage({ lang }: Props) {
  return (
    <div
      className={PAGE_BASE}
      style={{ containerType: 'size', fontSize: '2.15cqh' }}
    >
      {/* background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100" />
      <div className="absolute inset-0" style={{ backgroundImage: stripes }} />
      <div
        className="absolute -left-[18%] top-0 h-full w-[26%] -skew-x-[25deg] opacity-80"
        style={{
          background:
            'repeating-linear-gradient(0deg, #15803d 0 14%, #ffffff 14% 20%, #16a34a 20% 34%, transparent 34% 100%)',
        }}
      />
      <div
        className="absolute -right-[16%] top-0 h-full w-[30%] -skew-x-[25deg] opacity-90"
        style={{
          background:
            'repeating-linear-gradient(0deg, #dc2626 0 16%, #ffffff 16% 21%, #ef4444 21% 32%, transparent 32% 100%)',
        }}
      />

      <div className="relative flex h-full flex-col px-[6%] pb-[4%] pt-[4%]">
        <img
          src={timanLogo}
          alt="Timan"
          className="ml-auto h-[7em] w-auto object-contain"
        />

        <div
          className="mt-[0.2em] -rotate-[8deg] self-start font-serif italic text-[3.6em] font-bold leading-none text-red-600"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          {t('messe_flyer_front_badge', lang)}
        </div>

        <div className="mt-[1.1em] text-center">
          <h3
            className="text-[3.3em] font-bold leading-none tracking-tight text-[#0f7a37]"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            TIMAN 2620
          </h3>
          <p
            className="mx-auto mt-[0.55em] max-w-[15em] text-balance text-[1.35em] font-bold leading-tight text-[#0f7a37]"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            {t('messe_flyer_front_subtitle', lang)}
          </p>

          <div className="mt-[0.7em] flex items-center gap-[0.8em]">
            <span className="h-px flex-1 bg-slate-400" />
            <span
              className="max-w-[18em] text-[0.95em] font-semibold leading-tight text-slate-700"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              {t('messe_flyer_front_note', lang)}
            </span>
            <span className="h-px flex-1 bg-slate-400" />
          </div>
        </div>

        <div className="relative -mx-[6%] mt-[0.6em] flex-1">
          <img
            src={machineImg.url}
            alt="Timan 2620"
            className="h-full w-full object-contain"
          />
        </div>

        <div
          className="mt-[0.4em] text-center text-[2.3em] font-bold leading-[1.15] text-[#0f7a37]"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          <div className="text-balance">{t('messe_flyer_front_compact', lang)}</div>
          <div className="text-balance">{t('messe_flyer_front_comfort', lang)}</div>
        </div>
      </div>
    </div>
  );
}

function Feature({
  titleKey,
  textKey,
  image,
  lang,
}: {
  titleKey: string;
  textKey: string;
  image: string;
  lang: PortalUiLanguage;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <h4
        className="text-balance text-center text-[1.35em] font-bold leading-tight text-slate-900"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      >
        {titleKey && t(titleKey, lang)}
      </h4>
      <p className="mx-auto mt-[0.25em] max-w-[17em] text-balance text-center text-[0.95em] leading-snug text-slate-600">
        {t(textKey, lang)}
      </p>
      <div className="mt-[0.5em] min-h-0 flex-1 overflow-hidden rounded-[0.2em] border-[0.14em] border-red-600">
        <img src={image} alt="" className="h-full w-full object-cover" />
      </div>
    </div>
  );
}

function BackPage({ lang }: Props) {
  return (
    <div
      className={PAGE_BASE}
      style={{ containerType: 'size', fontSize: '2.15cqh' }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-white" />
      <div className="absolute inset-0" style={{ backgroundImage: stripes }} />
      <div
        className="absolute -left-[8%] -top-[6%] h-[34%] w-[30%] -skew-x-[25deg]"
        style={{
          background:
            'repeating-linear-gradient(0deg, #dc2626 0 34%, #ffffff 34% 44%, #f87171 44% 70%, transparent 70% 100%)',
        }}
      />
      <div
        className="absolute -bottom-[6%] -right-[8%] h-[26%] w-[26%] -skew-x-[25deg]"
        style={{
          background:
            'repeating-linear-gradient(0deg, #15803d 0 40%, #ffffff 40% 50%, #22c55e 50% 80%, transparent 80% 100%)',
        }}
      />

      <div className="relative flex h-full flex-col px-[5%] pb-[3%] pt-[6%]">
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-x-[1.4em] gap-y-[1.2em]">
          <Feature titleKey="messe_flyer_back_comfort_title" textKey="messe_flyer_back_comfort_text" image={b1.url} lang={lang} />
          <Feature titleKey="messe_flyer_back_compact_title" textKey="messe_flyer_back_compact_text" image={b2.url} lang={lang} />
          <Feature titleKey="messe_flyer_back_yearround_title" textKey="messe_flyer_back_yearround_text" image={b3.url} lang={lang} />
          <Feature titleKey="messe_flyer_back_operation_title" textKey="messe_flyer_back_operation_text" image={b4.url} lang={lang} />
        </div>

        <div className="mt-[1.1em] shrink-0 space-y-[0.1em] text-center text-[1.55em] font-bold leading-tight text-slate-800">
          <div className="text-balance">{t('messe_flyer_specs_engine', lang)}</div>
          <div>{t('messe_flyer_specs_power', lang)}</div>
          <div>{t('messe_flyer_specs_drive', lang)}</div>
          <div className="text-balance">{t('messe_flyer_specs_speed', lang)}</div>
          <div className="text-balance">{t('messe_flyer_specs_width', lang)}</div>
        </div>
      </div>
    </div>
  );
}

export { FrontPage as FlyerFrontPage, BackPage as FlyerBackPage };
