import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { fetchLatestNews, resolvePublicNewsFields, type NewsPost } from '@/lib/newsService';
import { useAppUser } from '@/context/AppUserContext';
import { t } from '@/lib/i18n/translations';
import { MESSE_NEWS_ITEMS, type MesseNewsItem } from '@/data/messeNews';
import Timan2620NewsModal from '@/components/messe/Timan2620NewsModal';
import FlyerViewerModal from '@/components/messe/FlyerViewerModal';
import { FlyerFrontPage } from '@/components/messe/TeaserFlyerPages';
import MesseSubpageHeader from '@/components/messe/MesseSubpageHeader';
import PublicNewsPostModal from '@/components/portal/PublicNewsPostModal';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import {
  getAttachmentOptionsForMachine,
  getCombinedAttachmentOptions,
  matchesNewsTopicFilter,
  NEWS_MACHINE_FILTER_TARGETS,
  NEWS_TOPIC_UI_TEXT,
  type NewsTopicOption,
} from '@/features/news-cms/lib/newsTaxonomy';

function categoryLabel(category: string, language: PortalUiLanguage) {
  return category?.toUpperCase() === 'SERVICE'
    ? t('latestFromTimanServiceTag', language)
    : t('newsCmsBadgeNews', language);
}

export default function MesseNewsPage() {
  const { uiLanguage } = useLanguage();
  const [news, setNews] = useState<NewsPost[] | null>(null);
  const [openModal, setOpenModal] = useState<null | 'article' | 'flyer'>(null);
  const [openPost, setOpenPost] = useState<NewsPost | null>(null);
  const [machineFilter, setMachineFilter] = useState('all');
  const [attachmentFilter, setAttachmentFilter] = useState('all');
  const { appUser } = useAppUser();

  useEffect(() => {
    let cancelled = false;
    fetchLatestNews(12, uiLanguage).then((rows) => {
      if (cancelled) return;
      setNews(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [uiLanguage]);

  if (!appUser) return null;

  const cardClass =
    'group text-left bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-slate-300 cursor-pointer';

  const targetOptions = useMemo<NewsTopicOption[]>(() => {
    if (machineFilter === 'all') return getCombinedAttachmentOptions();
    return getAttachmentOptionsForMachine(machineFilter);
  }, [machineFilter]);

  const filteredCuratedNews = useMemo(
    () =>
      MESSE_NEWS_ITEMS.filter((item) =>
        matchesNewsTopicFilter(
          { template_data: { news_topic: item.newsTopic } },
          machineFilter,
          attachmentFilter,
        ),
      ),
    [machineFilter, attachmentFilter],
  );

  const filteredCmsNews = useMemo(
    () => (news ?? []).filter((post) => matchesNewsTopicFilter(post, machineFilter, attachmentFilter)),
    [news, machineFilter, attachmentFilter],
  );
  const showCuratedFallback = (news ?? []).length === 0;
  const hasActiveTopicFilter = machineFilter !== 'all' || attachmentFilter !== 'all';

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
            onError={(event) => {
              if (item.imageFallback) event.currentTarget.src = item.imageFallback;
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

  const renderCmsPost = (post: NewsPost) => {
    const isCmsPost = post.source === 'news_cms' || !!post.localized_content;
    const localizedPost = resolvePublicNewsFields(post, uiLanguage);
    const body = (
      <>
        {localizedPost.image_url ? (
          <div className="aspect-video bg-slate-200">
            <img
              src={localizedPost.image_url}
              alt={localizedPost.title}
              className="w-full h-full object-cover"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          </div>
        ) : (
          <div className="aspect-video bg-gradient-to-br from-emerald-100 to-emerald-200" />
        )}
        <div className="p-4 flex-grow flex flex-col">
          <div className="text-[10px] uppercase tracking-wide font-bold text-emerald-700 mb-1">
            {categoryLabel(post.category, uiLanguage)}
          </div>
          <h2 className="text-lg font-bold text-slate-900">{localizedPost.title}</h2>
          {localizedPost.excerpt && <p className="text-sm text-slate-600 mt-2 flex-grow">{localizedPost.excerpt}</p>}
          {post.link_url && (
            <a href={post.link_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">
              {t('messe_news_read', uiLanguage)} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </>
    );

    return isCmsPost && !post.link_url ? (
      <button key={post.id} type="button" onClick={() => setOpenPost(post)} className={cardClass}>
        {body}
      </button>
    ) : (
      <article key={post.id} className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col h-full">
        {body}
      </article>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <MesseSubpageHeader backLabel={t('back', uiLanguage)} />

      <main className="flex-grow max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">{t('messeHomeNews', uiLanguage)}</h1>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <select
            value={machineFilter}
            onChange={(event) => {
              setMachineFilter(event.target.value);
              setAttachmentFilter('all');
            }}
            className="min-w-[180px] rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            <option value="all">{NEWS_TOPIC_UI_TEXT.machineFilterPlaceholder[uiLanguage]}</option>
            {NEWS_MACHINE_FILTER_TARGETS.map((option) => (
              <option key={option.value} value={option.value}>{option.labels[uiLanguage]}</option>
            ))}
          </select>
          <select
            value={attachmentFilter}
            onChange={(event) => setAttachmentFilter(event.target.value)}
            disabled={targetOptions.length === 0}
            className="min-w-[180px] rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="all">{NEWS_TOPIC_UI_TEXT.attachmentFilterPlaceholder[uiLanguage]}</option>
            {targetOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.labels[uiLanguage]}</option>
            ))}
          </select>
          {hasActiveTopicFilter && (
            <button
              type="button"
              onClick={() => {
                setMachineFilter('all');
                setAttachmentFilter('all');
              }}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-emerald-200 hover:text-emerald-700"
            >
              {NEWS_TOPIC_UI_TEXT.resetFilterLabel[uiLanguage]}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          {showCuratedFallback && filteredCuratedNews.map(renderCurated)}
          {filteredCmsNews.map(renderCmsPost)}
        </div>
      </main>

      <Timan2620NewsModal open={openModal === 'article'} onClose={() => setOpenModal(null)} lang={uiLanguage} />
      <FlyerViewerModal open={openModal === 'flyer'} onClose={() => setOpenModal(null)} lang={uiLanguage} />
      <PublicNewsPostModal post={openPost} language={uiLanguage} onClose={() => setOpenPost(null)} />
    </div>
  );
}
