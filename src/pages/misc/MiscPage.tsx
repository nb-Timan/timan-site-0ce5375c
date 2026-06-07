import { useNavigate } from 'react-router-dom';
import { ClipboardList, Map } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import { useChangelog, formatChangedDate, t as ct } from '@/lib/portalChangelog';
import MiscPageShell from './MiscPageShell';
import { Language } from '@/types/configurator';
import { cn } from '@/lib/utils';

const T: Record<string, Record<Language, string>> = {
  title: { da: 'Diverse', en: 'Miscellaneous', de: 'Verschiedenes', it: 'Varie', hu: 'Egyéb' },
  intro: {
    da: 'Diverse værktøjer og formularer samlet ét sted.',
    en: 'Miscellaneous tools and forms in one place.',
    de: 'Verschiedene Werkzeuge und Formulare an einem Ort.',
    it: 'Strumenti e moduli vari in un unico posto.',
    hu: 'Vegyes eszközök és űrlapok egy helyen.',
  },
  formsTitle: { da: 'Formularer', en: 'Forms', de: 'Formulare', it: 'Moduli', hu: 'Űrlapok' },
  formsDesc: {
    da: 'Indsend interne formularer til Timan — fx budget-tilbagemelding, faktura-accept og kontaktinformation.',
    en: 'Submit internal forms to Timan — e.g. budget feedback, invoice acceptance and contact information.',
    de: 'Interne Formulare an Timan senden — z. B. Budget-Feedback, Rechnungsannahme und Kontaktdaten.',
    it: 'Invia moduli interni a Timan — es. feedback budget, accettazione fattura e contatti.',
    hu: 'Belső űrlapok küldése a Timannak — pl. budget visszajelzés, számla elfogadás és kapcsolati adatok.',
  },
  formsCta: { da: 'Åbn formularer →', en: 'Open forms →', de: 'Formulare öffnen →', it: 'Apri moduli →', hu: 'Űrlapok megnyitása →' },
  mapTitle: { da: 'Partnerkort', en: 'Partner map', de: 'Partnerkarte', it: 'Mappa partner', hu: 'Partnertérkép' },
  mapDesc: {
    da: 'Globalt overblik over Timans partnere — forhandlere, servicepartnere, importører og demo-lokationer.',
    en: 'Global overview of Timan partners — dealers, service partners, importers and demo locations.',
    de: 'Globaler Überblick über Timan-Partner — Händler, Servicepartner, Importeure und Demo-Standorte.',
    it: 'Panoramica globale dei partner Timan — rivenditori, partner di servizio, importatori e demo.',
    hu: 'Globális áttekintés a Timan partnerekről.',
  },
  mapCta: { da: 'Åbn kort →', en: 'Open map →', de: 'Karte öffnen →', it: 'Apri mappa →', hu: 'Térkép megnyitása →' },
};

export default function MiscPage() {
  const { language: lang } = useLanguage();
  const { appUser } = useAppUser();
  const navigate = useNavigate();
  const { submoduleBadge, markSubmoduleRead } = useChangelog(appUser, lang);
  const partnerBadge = submoduleBadge('partner_map');

  const openPartnerMap = () => {
    markSubmoduleRead('partner_map');
    navigate('/portal/misc/partner-map');
  };

  return (
    <MiscPageShell title={T.title[lang]} intro={T.intro[lang]}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <button
          type="button"
          onClick={() => navigate('/portal/misc/forms')}
          className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm cursor-pointer group text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-md"
        >
          <div className="w-12 h-12 bg-[#2d5a27] rounded-lg flex items-center justify-center text-white mb-6">
            <ClipboardList className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-bold mb-2 text-gray-900">{T.formsTitle[lang]}</h3>
          <p className="text-gray-500 text-sm mb-4">{T.formsDesc[lang]}</p>
          <span className="text-[#2d5a27] font-bold text-sm uppercase">{T.formsCta[lang]}</span>
        </button>

        <button
          type="button"
          onClick={openPartnerMap}
          className="relative bg-white p-8 rounded-2xl border border-gray-100 shadow-sm cursor-pointer group text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-md"
        >
          {partnerBadge && (
            <span
              className={cn(
                'absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide',
                partnerBadge.kind === 'major' ? 'bg-rose-100 text-rose-700' : 'bg-green-100 text-[#2d5a27]',
              )}
              title={[
                formatChangedDate(partnerBadge.latest.changed_at),
                partnerBadge.latest.title?.[lang] || partnerBadge.latest.title?.da || '',
                partnerBadge.latest.description?.[lang] || partnerBadge.latest.description?.da || '',
              ].filter(Boolean).join('\n')}
            >
              {partnerBadge.kind === 'major' ? ct('important', lang).toUpperCase() : ct('newTag', lang).toUpperCase()}
              {partnerBadge.count > 1 ? ` ${partnerBadge.count}` : ''}
            </span>
          )}
          <div className="w-12 h-12 bg-[#2d5a27] rounded-lg flex items-center justify-center text-white mb-6">
            <Map className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-bold mb-2 text-gray-900">{T.mapTitle[lang]}</h3>
          <p className="text-gray-500 text-sm mb-4">{T.mapDesc[lang]}</p>
          <span className="text-[#2d5a27] font-bold text-sm uppercase">{T.mapCta[lang]}</span>
        </button>
      </div>
    </MiscPageShell>
  );
}
