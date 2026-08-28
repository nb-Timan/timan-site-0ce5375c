import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Eye, Newspaper, RotateCcw, Send, Trash2, Undo2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/context/LanguageContext';
import {
  adminDeleteNewsPost,
  adminListNewsPosts,
  adminPublishNewsPost,
  adminUpdateNewsStatus,
  fetchLatestNews,
  resolvePublicNewsFields,
  type NewsCmsPost,
  type NewsPost,
  type NewsStatus,
} from '@/lib/newsService';
import { useAppUser } from '@/context/AppUserContext';
import { t } from '@/lib/i18n/translations';
import { MESSE_NEWS_ITEMS, type MesseNewsItem } from '@/data/messeNews';
import Timan2620NewsModal from '@/components/messe/Timan2620NewsModal';
import FlyerViewerModal from '@/components/messe/FlyerViewerModal';
import { FlyerFrontPage } from '@/components/messe/TeaserFlyerPages';
import MesseSubpageHeader from '@/components/messe/MesseSubpageHeader';
import PortalHeader from '@/components/portal/PortalHeader';
import PublicNewsPostModal from '@/components/portal/PublicNewsPostModal';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { canManageNewsContent } from '@/lib/portalAccess';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';
import { Button } from '@/components/ui/button';
import { getNewsTemplate } from '@/features/news-cms/templates/registry';
import type { NewsTemplateId } from '@/features/news-cms/templates/types';
import { missingNewsLanguages } from '@/features/news-cms/lib/newsContent';
import { translateNewsContentDynamically } from '@/features/news-cms/lib/dynamicNewsTranslation';
import {
  getAttachmentOptionsForMachine,
  getCombinedAttachmentOptions,
  matchesNewsTopicFilter,
  NEWS_MACHINE_FILTER_TARGETS,
  NEWS_TOPIC_UI_TEXT,
  type NewsTopicOption,
} from '@/features/news-cms/lib/newsTaxonomy';

interface MesseNewsPageProps {
  mode?: 'messe' | 'marketing';
}

function categoryLabel(category: string, language: PortalUiLanguage) {
  return category?.toUpperCase() === 'SERVICE'
    ? t('latestFromTimanServiceTag', language)
    : t('newsCmsBadgeNews', language);
}

function effectiveStatus(row: NewsPost): NewsStatus {
  return row.status || (row.is_active ? 'published' : 'draft');
}

function languageFlag(code: PortalUiLanguage) {
  return code.toUpperCase();
}

export default function MesseNewsPage({ mode = 'messe' }: MesseNewsPageProps) {
  const { language, uiLanguage, setLanguage } = useLanguage();
  const [news, setNews] = useState<NewsPost[] | null>(null);
  const [openModal, setOpenModal] = useState<null | 'article' | 'flyer'>(null);
  const [openPost, setOpenPost] = useState<NewsPost | null>(null);
  const [machineFilter, setMachineFilter] = useState('all');
  const [attachmentFilter, setAttachmentFilter] = useState('all');
  const [savingPostId, setSavingPostId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { appUser, loading, logout } = useAppUser();
  const navigate = useNavigate();
  const isMarketingMode = mode === 'marketing';
  const { effectiveUser, resolving: resolvingEffectiveUser } = useEffectivePortalUserState(appUser);
  const canManage = useMemo(() => canManageNewsContent(effectiveUser), [effectiveUser]);

  const loadNews = async () => {
    setError(null);
    if (isMarketingMode && canManage) {
      const result = await adminListNewsPosts();
      setNews(result.rows);
      setError(result.error);
      return;
    }
    const rows = await fetchLatestNews(12, uiLanguage);
    setNews(rows);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError(null);
      if (isMarketingMode && canManage) {
        const result = await adminListNewsPosts();
        if (cancelled) return;
        setNews(result.rows);
        setError(result.error);
        return;
      }
      const rows = await fetchLatestNews(12, uiLanguage);
      if (cancelled) return;
      setNews(rows);
    };
    if (!loading && appUser) void load();
    return () => {
      cancelled = true;
    };
  }, [appUser, canManage, isMarketingMode, loading, uiLanguage]);

  const cardClass =
    'group relative text-left bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-slate-300 cursor-pointer';

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
  const showCuratedFallback = !isMarketingMode && (news ?? []).length === 0;
  const hasActiveTopicFilter = machineFilter !== 'all' || attachmentFilter !== 'all';

  if (loading || resolvingEffectiveUser) return <div className="min-h-screen bg-slate-50" />;
  if (!appUser) return isMarketingMode ? <Navigate to="/portal" replace /> : null;
  if (isMarketingMode && !canManage) return <Navigate to="/portal/marketing" replace />;

  const updateStatus = async (event: React.MouseEvent, post: NewsPost, status: NewsStatus) => {
    event.stopPropagation();
    setSavingPostId(post.id);
    setMessage(null);
    setError(null);
    if (status === 'published') {
      const template = getNewsTemplate(post.template_id);
      const translationResult = await translateNewsContentDynamically({
        localizedContent: post.localized_content || {},
        previousLocalizedContent: post.localized_content,
        templateData: post.template_data || {},
        fields: template.fields,
        sourceLanguage: uiLanguage,
      });
      if (translationResult.error) {
        setSavingPostId(null);
        setError(`Oversættelse mislykkedes: ${translationResult.error}. Nyheden er ikke publiceret med fallback.`);
        return;
      }

      const missing = missingNewsLanguages(translationResult.localizedContent, template.fields);
      if (missing.length > 0) {
        setSavingPostId(null);
        setError(`${t('newsCmsPublishBlockedTranslations', uiLanguage)} ${missing.map(languageFlag).join(', ')}`);
        return;
      }

      const publishResult = await adminPublishNewsPost({
        id: post.id,
        template_id: post.template_id as NewsTemplateId,
        localized_content: translationResult.localizedContent,
        template_data: translationResult.templateData,
        assets: post.assets || [],
        source_language: uiLanguage,
      });
      setSavingPostId(null);
      if (publishResult.error) {
        setError(publishResult.error);
        return;
      }
      setMessage(t('newsCmsPublished', uiLanguage));
      await loadNews();
      return;
    }

    const result = await adminUpdateNewsStatus(post.id, status);
    setSavingPostId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage(t('newsCmsStatusUpdated', uiLanguage));
    await loadNews();
  };

  const deletePost = async (event: React.MouseEvent, post: NewsPost) => {
    event.stopPropagation();
    if (!window.confirm(`Slet nyheden "${post.title}"?`)) return;
    setSavingPostId(post.id);
    setMessage(null);
    setError(null);
    const result = await adminDeleteNewsPost(post.id);
    setSavingPostId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage('Nyhed slettet.');
    await loadNews();
  };

  const renderAdminActions = (post: NewsPost) => {
    if (!isMarketingMode || !canManage) return null;
    const status = effectiveStatus(post);
    const disabled = savingPostId === post.id;

    return (
      <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-2">
        {status === 'published' ? (
          <button
            type="button"
            disabled={disabled}
            onClick={(event) => void updateStatus(event, post, 'draft')}
            className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-amber-700 shadow-sm ring-1 ring-amber-200 transition hover:bg-amber-50 disabled:opacity-60"
          >
            <Undo2 className="h-3.5 w-3.5" />
            {t('newsCmsUnpublish', uiLanguage)}
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={(event) => void updateStatus(event, post, 'published')}
            className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm ring-1 ring-emerald-200 transition hover:bg-emerald-50 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" />
            {t('newsCmsPublish', uiLanguage)}
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => void deletePost(event, post)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-rose-600 shadow-sm ring-1 ring-rose-200 transition hover:bg-rose-50 disabled:opacity-60"
          aria-label={t('delete', uiLanguage)}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

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
        {renderAdminActions(post)}
        {body}
      </button>
    ) : (
      <article key={post.id} className={cardClass}>
        {renderAdminActions(post)}
        {body}
      </article>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      {isMarketingMode ? (
        <PortalHeader
          user={appUser}
          language={language}
          onLanguageChange={setLanguage}
          onLogout={async () => {
            await logout();
            navigate('/portal', { replace: true });
          }}
        />
      ) : (
        <MesseSubpageHeader backLabel={t('back', uiLanguage)} />
      )}

      <main className="flex-grow max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              {isMarketingMode && (
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50">
                  <Newspaper className="h-5 w-5 text-emerald-700" />
                </div>
              )}
              <h1 className="text-3xl font-bold text-slate-900">{t('messeHomeNews', uiLanguage)}</h1>
            </div>
          </div>
          {isMarketingMode && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void loadNews()}>
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('newsCmsReload', uiLanguage)}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/portal/marketing/news/overview')}>
                <Eye className="mr-2 h-4 w-4" />
                {t('newsCmsOverview', uiLanguage)}
              </Button>
            </div>
          )}
        </div>

        {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>}
        {error && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>{t('newsCmsDatabaseNotReady', uiLanguage)}</strong>
            <span className="ml-1">{error}</span>
          </div>
        )}

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
