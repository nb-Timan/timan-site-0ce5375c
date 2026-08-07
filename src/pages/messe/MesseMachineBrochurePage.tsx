import { useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, FileText } from 'lucide-react';
import MesseSubpageHeader from '@/components/messe/MesseSubpageHeader';
import MesseModal from '@/components/messe/MesseModal';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  back: { da: 'Tilbage', en: 'Back', de: 'Zurück', it: 'Indietro', hu: 'Vissza' },
  brochure: { da: 'Brochure', en: 'Brochure', de: 'Broschüre', it: 'Brochure', hu: 'Brosúra' },
  openBrochure: { da: 'Åbn brochure', en: 'Open brochure', de: 'Broschüre öffnen', it: 'Apri brochure', hu: 'Brosúra megnyitása' },
  openNew: { da: 'Åbn PDF', en: 'Open PDF', de: 'PDF öffnen', it: 'Apri PDF', hu: 'PDF megnyitása' },
  previous: { da: 'Forrige', en: 'Previous', de: 'Zurück', it: 'Precedente', hu: 'Előző' },
  next: { da: 'Næste', en: 'Next', de: 'Weiter', it: 'Successivo', hu: 'Következő' },
  close: { da: 'Luk', en: 'Close', de: 'Schließen', it: 'Chiudi', hu: 'Bezárás' },
};

interface MesseMachineBrochurePageProps {
  title: string;
  pdfSrc: string;
  pageBase: string;
  pageCount: number;
}

export default function MesseMachineBrochurePage({ title, pdfSrc, pageBase, pageCount }: MesseMachineBrochurePageProps) {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const [brochureOpen, setBrochureOpen] = useState(false);
  const [leftPage, setLeftPage] = useState(1);

  if (!appUser) return null;

  const pageSrc = (page: number) => `${pageBase}/page-${page}.jpg`;
  const rightPage = leftPage + 1;
  const canGoBack = leftPage > 1;
  const canGoNext = rightPage < pageCount;
  const goBack = () => setLeftPage((page) => Math.max(1, page - 2));
  const goNext = () => setLeftPage((page) => Math.min(pageCount, page + 2));

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <MesseSubpageHeader backLabel={T.back[lang]} />

      <main className="flex-grow w-full max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">{title}</h1>

        <div className="mb-6 inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-slate-200">
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-emerald-800 shadow-sm"
          >
            <BookOpen className="h-4 w-4" />
            {T.brochure[lang]}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <button
            type="button"
            onClick={() => {
              setLeftPage(1);
              setBrochureOpen(true);
            }}
            className="group text-left bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-slate-300"
          >
            <div className="aspect-[4/3] bg-slate-100 overflow-hidden relative p-5">
              <div className="relative h-full w-full rounded-xl bg-white shadow-[0_18px_45px_-24px_rgba(15,23,42,0.75)] ring-1 ring-slate-200 transition-transform duration-300 group-hover:scale-[1.03]">
                <div className="absolute inset-y-5 left-1/2 w-10 -translate-x-1/2 bg-gradient-to-r from-transparent via-slate-900/15 to-transparent" />
                <div className="grid h-full grid-cols-2 overflow-hidden rounded-xl">
                  <div className="flex flex-col items-center justify-center gap-3 border-r border-slate-100 bg-gradient-to-br from-white to-slate-50">
                    <img src={pageSrc(1)} alt="" className="h-full w-full object-cover object-top" />
                  </div>
                  <div className="flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-white to-slate-50 px-4 text-center">
                    <FileText className="h-10 w-10 text-slate-700" />
                    <span className="text-sm font-bold text-slate-900">{T.openBrochure[lang]}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4">
              <div className="text-[10px] uppercase tracking-wide font-bold text-emerald-700 mb-1">
                {T.brochure[lang]}
              </div>
              <h2 className="text-lg font-bold text-slate-900">{title}</h2>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 group-hover:underline">
                {T.openBrochure[lang]}
              </span>
            </div>
          </button>
        </div>
      </main>

      <MesseModal
        open={brochureOpen}
        onClose={() => setBrochureOpen(false)}
        title={`${title} ${T.brochure[lang]}`}
        closeLabel={T.close[lang]}
        widthClass="max-w-[92rem]"
        bodyClass="px-3 sm:px-5 py-4"
      >
        <div className="relative rounded-xl bg-slate-100 p-3 sm:p-5">
          <div className="relative grid h-[76vh] min-h-[620px] grid-cols-1 overflow-hidden rounded-lg bg-white shadow-[0_18px_45px_-20px_rgba(15,23,42,0.65)] ring-1 ring-slate-200 md:grid-cols-2">
            <div className="flex min-h-0 items-center justify-center bg-white p-2 md:border-r md:border-slate-100">
              <img
                src={pageSrc(leftPage)}
                alt={`${title} side ${leftPage}`}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="hidden min-h-0 items-center justify-center bg-white p-2 md:flex">
              {rightPage <= pageCount ? (
                <img
                  src={pageSrc(rightPage)}
                  alt={`${title} side ${rightPage}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="h-full w-full rounded-sm bg-slate-50" />
              )}
            </div>
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-5 left-1/2 hidden w-16 -translate-x-1/2 bg-gradient-to-r from-transparent via-slate-900/15 to-transparent md:block"
          />

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={!canGoBack}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              {T.previous[lang]}
            </button>
            <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">
              {leftPage}-{Math.min(rightPage, pageCount)} / {pageCount}
            </div>
            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {T.next[lang]}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <a
            href={pdfSrc}
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-8 right-8 hidden items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 sm:inline-flex"
          >
            <ExternalLink className="h-4 w-4" />
            {T.openNew[lang]}
          </a>
        </div>
      </MesseModal>
    </div>
  );
}
