import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { fetchLatestNews, type NewsPost } from '@/lib/newsService';
import { Language } from '@/types/configurator';
import DemoModeBadge from '@/components/messe/DemoModeBadge';
import BackendExitButton from '@/components/messe/BackendExitButton';
import BackendRolePreviewSwitcher from '@/components/messe/BackendRolePreviewSwitcher';
import timanLogo from '@/assets/timan-logo.png';


const T: Record<string, Record<Language, string>> = {
  back:  { da: 'Tilbage', en: 'Back', de: 'Zurück', it: 'Indietro', hu: 'Vissza' },
  title: { da: 'Seneste nyt', en: 'Latest news', de: 'Aktuelles', it: 'Ultime notizie', hu: 'Legfrissebb hírek' },
  empty: { da: 'Ingen nyheder lige nu.', en: 'No news right now.', de: 'Aktuell keine Nachrichten.', it: 'Nessuna notizia al momento.', hu: 'Jelenleg nincs hír.' },
  read:  { da: 'Læs mere', en: 'Read more', de: 'Mehr lesen', it: 'Leggi di più', hu: 'Tovább' },
};

const PLACEHOLDER: NewsPost[] = [
  { id: 'p1', title: 'Velkommen til Timan på messen', excerpt: 'Vi viser hele maskinprogrammet — kom forbi og prøv konfiguratoren.', image_url: null, link_url: null, category: 'NYHED', published_at: new Date().toISOString(), is_active: true, source: null },
  { id: 'p2', title: 'Ny generation af redskaber', excerpt: 'Lær om de nye redskaber til Timan-maskinerne.', image_url: null, link_url: null, category: 'NYHED', published_at: new Date().toISOString(), is_active: true, source: null },
];

export default function MesseNewsPage() {
  const { language: lang } = useLanguage();
  const [news, setNews] = useState<NewsPost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLatestNews(12).then(rows => {
      if (cancelled) return;
      setNews(rows.length > 0 ? rows : PLACEHOLDER);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/messe" className="flex items-center gap-3">
            <img src={timanLogo} alt="Timan" className="h-10 sm:h-12 w-auto" />
            <DemoModeBadge />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/messe" className="inline-flex items-center text-sm font-semibold text-emerald-800 hover:underline">
              <ArrowLeft className="h-4 w-4 mr-1" /> {T.back[lang]}
            </Link>
            <BackendExitButton />
          </div>

        </div>
      </header>

      <main className="flex-grow max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">{T.title[lang]}</h1>

        {news && news.length === 0 ? (
          <div className="text-slate-500">{T.empty[lang]}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {(news ?? []).map(n => (
              <article key={n.id} className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col">
                {n.image_url ? (
                  <div className="aspect-video bg-slate-200"><img src={n.image_url} alt={n.title} className="w-full h-full object-cover" /></div>
                ) : (
                  <div className="aspect-video bg-gradient-to-br from-emerald-100 to-emerald-200" />
                )}
                <div className="p-4 flex-grow flex flex-col">
                  <div className="text-[10px] uppercase tracking-wide font-bold text-emerald-700 mb-1">{n.category}</div>
                  <h2 className="text-lg font-bold text-slate-900">{n.title}</h2>
                  {n.excerpt && <p className="text-sm text-slate-600 mt-2 flex-grow">{n.excerpt}</p>}
                  {n.link_url && (
                    <a href={n.link_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">
                      {T.read[lang]} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
