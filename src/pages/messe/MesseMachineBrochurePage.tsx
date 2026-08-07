import { ExternalLink, FileText } from 'lucide-react';
import MesseSubpageHeader from '@/components/messe/MesseSubpageHeader';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  back: { da: 'Tilbage', en: 'Back', de: 'Zurück', it: 'Indietro', hu: 'Vissza' },
  brochure: { da: 'Brochure', en: 'Brochure', de: 'Broschüre', it: 'Brochure', hu: 'Brosúra' },
  openNew: { da: 'Åbn PDF', en: 'Open PDF', de: 'PDF öffnen', it: 'Apri PDF', hu: 'PDF megnyitása' },
};

interface MesseMachineBrochurePageProps {
  title: string;
  pdfSrc: string;
}

export default function MesseMachineBrochurePage({ title, pdfSrc }: MesseMachineBrochurePageProps) {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();

  if (!appUser) return null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <MesseSubpageHeader backLabel={T.back[lang]} />

      <main className="flex-grow w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[#2d5a27]">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{title}</h1>
              <p className="text-sm text-slate-500">{T.brochure[lang]}</p>
            </div>
          </div>

          <a
            href={pdfSrc}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800"
          >
            <ExternalLink className="h-4 w-4" />
            {T.openNew[lang]}
          </a>
        </div>

        <div className="h-[calc(100vh-190px)] min-h-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <iframe
            title={`${title} ${T.brochure[lang]}`}
            src={`${pdfSrc}#view=FitH`}
            className="h-full w-full bg-slate-100"
          />
        </div>
      </main>
    </div>
  );
}
