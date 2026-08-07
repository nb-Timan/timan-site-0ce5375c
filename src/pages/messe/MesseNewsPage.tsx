import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { fetchLatestNews, type NewsPost } from '@/lib/newsService';
import { Language } from '@/types/configurator';
import { useAppUser } from '@/context/AppUserContext';
import { t } from '@/lib/i18n/translations';
import { MESSE_NEWS_ITEMS, type MesseNewsItem } from '@/data/messeNews';
import Timan2620NewsModal from '@/components/messe/Timan2620NewsModal';
import FlyerViewerModal from '@/components/messe/FlyerViewerModal';
import { FlyerFrontPage } from '@/components/messe/TeaserFlyerPages';
import MesseSubpageHeader from '@/components/messe/MesseSubpageHeader';

const T: Record<string, Record<Language, string>> = {
  back:  { da: 'Tilbage', en: 'Back', de: 'Zurück', it: 'Indietro', hu: 'Vissza' },
  title: { da: 'Seneste nyt', en: 'Latest news', de: 'Aktuelles', it: 'Ultime notizie', hu: 'Legfrissebb hírek' },
  empty: { da: 'Ingen nyheder lige nu.', en: 'No news right now.', de: 'Aktuell keine Nachrichten.', it: 'Nessuna notizia al momento.', hu: 'Jelenleg nincs hír.' },
  read:  { da: 'Læs mere', en: 'Read more', de: 'Mehr lesen', it: 'Leggi di più', hu: 'Tovább' },
};


export default function MesseNewsPage() {
  const { language: lang, uiLanguage } = useLanguage();
  const [news, setNews] = useState<NewsPost[] | null>(null);
  const [openModal, setOpenModal] = useState<null | 'article' | 'flyer'>(null);
  const { appUser } = useAppUser();

  useEffect(() => {
    let cancelled = false;
    fetchLatestNews(12).then(rows => {
      if (cancelled) return;
      setNews(rows);
    });
    return () => { cancelled = true; };
  }, []);

  if (!appUser) return null;

  const cardClass =
    'group text-left bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-slate-300 cursor-pointer';

  const renderCurated = (item: MesseNewsItem) => (
    <button
      key={item.id}
      type="button"
      onClick={() => setOpenModal(item.kind === 'flyer' ? 'flyer' : 'article')}
      className={cardClass}
    >
      <div className="aspect-video bg-slate-100 overflow-hidden relative">
        {item.thumb === 'flyer-front' ? (
          <div className="absolute left-1/2 top-0 w-[72%] -translate-x-1/2 aspect-[1/1.414] transition-transform duration-300 group-hover:scale-[1.03]">
            <FlyerFrontPage lang={uiLanguage} />
          </div>
        ) : (
        <img
          src={item.image}
          alt={t(item.titleKey, uiLanguage)}
          onError={(e) => {
            if (item.imageFallback) (e.currentTarget as HTMLImageElement).src = item.imageFallback;
          }}
          className={`w-full h-full object-cover ${item.imagePositionClass ?? 'object-center'} transition-transform duration-300 group-hover:scale-[1.03]`}
        />
        )}
      </div>
      <div className="p-4 flex-grow flex flex-col">
        <div className="text-[10px] uppercase tracking-wide font-bold text-emerald-700 mb-1">
          {t(item.categoryKey, uiLanguage)}
        </div>
        <h2 className="text-lg font-bold text-slate-900">{t(item.titleKey, uiLanguage)}</h2>
        <p className="text-sm text-slate-600 mt-2 flex-grow">{t(item.descKey, uiLanguage)}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 group-hover:underline">
          {t('messe_news_read', uiLanguage)}
        </span>
      </div>
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <MesseSubpageHeader backLabel={T.back[lang]} />

      <main className="flex-grow max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">{T.title[lang]}</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          {MESSE_NEWS_ITEMS.map(renderCurated)}

          {(news ?? []).map(n => (
            <article key={n.id} className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col h-full">
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
      </main>

      <Timan2620NewsModal open={openModal === 'article'} onClose={() => setOpenModal(null)} lang={uiLanguage} />
      <FlyerViewerModal open={openModal === 'flyer'} onClose={() => setOpenModal(null)} lang={uiLanguage} />
    </div>
  );
}

