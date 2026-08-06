import timanLogo from '@/assets/timan-logo-transparent-trimmed.png';
const FLYER_IMG = '/images/timan-2620/flyer';
const machineImg = { url: `${FLYER_IMG}/f_machine.jpg` };
const b1 = { url: `${FLYER_IMG}/b1.jpg` };
const b2 = { url: `${FLYER_IMG}/b2.jpg` };
const b3 = { url: `${FLYER_IMG}/b3.jpg` };
const b4 = { url: `${FLYER_IMG}/b4.jpg` };

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

/** Root font-size of a page, in container-height units (set on the inner box). */
const PAGE_FONT = { fontSize: '2.15cqh' } as const;


interface Props {
  lang: PortalUiLanguage;
}

function FrontPage({ lang }: Props) {
  return (
    <div className={PAGE_BASE} style={{ containerType: 'size' }}>
      <div className="absolute inset-0" style={PAGE_FONT}>
      {/* background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100" />
      <div
        className="absolute -left-[14%] -top-[6%] h-[112%] w-[11%] -skew-x-[22deg]"
        style={{
          background:
            'linear-gradient(90deg, #15803d 0 42%, #ffffff 42% 56%, #16a34a 56% 100%)',
        }}
      />
      <div
        className="absolute -right-[12%] -top-[6%] h-[112%] w-[12%] -skew-x-[22deg]"
        style={{
          background:
            'linear-gradient(90deg, #ef4444 0 34%, #ffffff 34% 46%, #dc2626 46% 100%)',
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
    <div className={PAGE_BASE} style={{ containerType: 'size' }}>
      <div className="absolute inset-0" style={PAGE_FONT}>
      <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-white" />
      <div className="absolute inset-0" style={{ backgroundImage: stripes }} />
      <div
        className="absolute -left-[7%] -top-[8%] h-[30%] w-[16%] -skew-x-[22deg]"
        style={{
          background:
            'linear-gradient(90deg, #dc2626 0 40%, #ffffff 40% 54%, #f87171 54% 100%)',
        }}
      />
      <div
        className="absolute -bottom-[8%] -right-[7%] h-[26%] w-[14%] -skew-x-[22deg]"
        style={{
          background:
            'linear-gradient(90deg, #22c55e 0 42%, #ffffff 42% 56%, #15803d 56% 100%)',
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
    </div>
  );
}

export { FrontPage as FlyerFrontPage, BackPage as FlyerBackPage };
