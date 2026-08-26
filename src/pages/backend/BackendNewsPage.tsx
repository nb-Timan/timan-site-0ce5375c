import NewsRenderSurface from '@/features/news-cms/editor/NewsRenderSurface';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Archive, ArrowDown, ArrowUp, Eye, FilePenLine, GripVertical, Newspaper, Plus, RotateCcw, Search, Send, Trash2, Undo2 } from 'lucide-react';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Button } from '@/components/ui/button';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { completedNewsLanguages, missingNewsLanguages, resolveNewsRenderContent } from '@/features/news-cms/lib/newsContent';
import { translateNewsContentDynamically } from '@/features/news-cms/lib/dynamicNewsTranslation';
import NewsSharedEditor from '@/features/news-cms/editor/NewsSharedEditor';
import { getNewsTemplate, NEWS_TEMPLATE_REGISTRY } from '@/features/news-cms/templates/registry';
import type { NewsTemplateId } from '@/features/news-cms/templates/types';
import { t } from '@/lib/i18n/translations';
import { PORTAL_LANGUAGES, type PortalUiLanguage } from '@/lib/portalLanguages';
import { canManageNewsContent } from '@/lib/portalAccess';
import {
  getAttachmentOptionsForMachine,
  getCombinedAttachmentOptions,
  getNewsAttachmentLabel,
  getNewsMachineLabel,
  getNewsTopicForDisplay,
  getNewsTopicLabel,
  matchesNewsTopicFilter,
  NEWS_MACHINE_FILTER_TARGETS,
  NEWS_TOPIC_UI_TEXT,
  type NewsTopicOption,
} from '@/features/news-cms/lib/newsTaxonomy';
import {
  adminListNewsPosts,
  adminDeleteNewsPost,
  adminPublishNewsPost,
  adminSaveNewsDraft,
  adminUpdateNewsManualOrder,
  adminUpdateNewsStatus,
  getNewsManualOrder,
  sortNewsByManualOrder,
  type NewsCmsPost,
  type NewsStatus,
} from '@/lib/newsService';

type ViewMode = 'dashboard' | 'editor';
type StatusFilter = 'all' | NewsStatus;
type SortKey = 'manual' | 'title' | 'template' | 'status' | 'updated' | 'published';

function effectiveStatus(row: NewsCmsPost): NewsStatus {
  return row.status || (row.is_active ? 'published' : 'draft');
}

const DATE_LOCALES: Record<string, string> = {
  da: 'da-DK', en: 'en-GB', de: 'de-DE', it: 'it-IT', hu: 'hu-HU',
  sv: 'sv-SE', fr: 'fr-FR', pl: 'pl-PL', cs: 'cs-CZ',
};

function formatDate(value: string | null | undefined, lang: PortalUiLanguage) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString(DATE_LOCALES[lang] || 'da-DK', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function statusClass(status: NewsStatus) {
  if (status === 'published') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'archived') return 'bg-slate-100 text-slate-500 ring-slate-200';
  return 'bg-amber-50 text-amber-700 ring-amber-200';
}

function languageFlag(code: PortalUiLanguage) {
  return PORTAL_LANGUAGES.find((item) => item.code === code)?.flag || code.toUpperCase();
}

function getRowLanguage(row: NewsCmsPost) {
  if (row.template_id === 'legacy') return 'DA';
  const template = getNewsTemplate(row.template_id);
  const complete = completedNewsLanguages(row.localized_content, template.fields);
  return complete.length ? complete.map(languageFlag).join(', ') : '-';
}

function getMissingRowLanguages(row: NewsCmsPost) {
  if (row.template_id === 'legacy') return [];
  const template = getNewsTemplate(row.template_id);
  return missingNewsLanguages(row.localized_content, template.fields);
}

function getPreviewContent(row: NewsCmsPost, lang: PortalUiLanguage) {
  const template = getNewsTemplate(row.template_id);
  return resolveNewsRenderContent(row.localized_content, lang, template.fields, {
    headline: row.title,
    subtitle: row.excerpt || '',
    mainImage: row.image_url || '',
  });
}

function getEditablePost(row: NewsCmsPost): NewsCmsPost {
  if (row.template_id !== 'legacy') return row;

  return {
    ...row,
    template_id: 'template-01-product-announcement',
    localized_content: {
      da: {
        headline: row.title,
        subtitle: row.excerpt || '',
        body: '',
        mainImage: row.image_url || '',
      },
    },
    template_data: row.template_data || { news_topic: { type: 'misc', target: 'diverse' } },
    assets: row.assets || [],
  };
}

export default function BackendNewsPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language, uiLanguage, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [rows, setRows] = useState<NewsCmsPost[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [editingPost, setEditingPost] = useState<NewsCmsPost | null>(null);
  const [previewPost, setPreviewPost] = useState<NewsCmsPost | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [machineFilter, setMachineFilter] = useState('all');
  const [attachmentFilter, setAttachmentFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('manual');
  const [draggingPostId, setDraggingPostId] = useState<string | null>(null);

  const canManage = useMemo(() => canManageNewsContent(appUser), [appUser]);

  const reload = async () => {
    setLoadingRows(true);
    setError(null);
    const result = await adminListNewsPosts();
    setRows(result.rows);
    setError(result.error);
    setLoadingRows(false);
  };

  useEffect(() => {
    if (!loading && appUser && canManage) void reload();
  }, [loading, appUser?.email, canManage]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return [...rows]
      .filter((row) => statusFilter === 'all' || effectiveStatus(row) === statusFilter)
      .filter((row) => templateFilter === 'all' || row.template_id === templateFilter)
      .filter((row) => {
        if (languageFilter === 'all') return true;
        if (row.template_id === 'legacy') return languageFilter === 'da';
        const template = getNewsTemplate(row.template_id);
        return completedNewsLanguages(row.localized_content, template.fields).includes(languageFilter as PortalUiLanguage);
      })
      .filter((row) => matchesNewsTopicFilter(row, machineFilter, attachmentFilter))
      .filter((row) => {
        if (!normalizedSearch) return true;
        const topicLabel = getNewsTopicLabel(getNewsTopicForDisplay(row), uiLanguage).toLowerCase();
        return [row.title, row.excerpt || '', topicLabel].some((value) => value.toLowerCase().includes(normalizedSearch));
      })
      .sort((a, b) => {
        if (sortKey === 'manual') {
          const orderDiff = getNewsManualOrder(a) - getNewsManualOrder(b);
          if (orderDiff !== 0) return orderDiff;
          return new Date(b.published_at || b.updated_at || b.created_at || 0).getTime() - new Date(a.published_at || a.updated_at || a.created_at || 0).getTime();
        }
        if (sortKey === 'title') return a.title.localeCompare(b.title, 'da');
        if (sortKey === 'template') return String(a.template_id || '').localeCompare(String(b.template_id || ''), 'da');
        if (sortKey === 'status') return effectiveStatus(a).localeCompare(effectiveStatus(b), 'da');
        const aDate = sortKey === 'published' ? a.published_at : a.updated_at || a.published_at;
        const bDate = sortKey === 'published' ? b.published_at : b.updated_at || b.published_at;
        return new Date(bDate || 0).getTime() - new Date(aDate || 0).getTime();
      });
  }, [rows, searchTerm, sortKey, statusFilter, templateFilter, languageFilter, machineFilter, attachmentFilter, uiLanguage]);

  const targetOptions = useMemo<NewsTopicOption[]>(() => {
    if (machineFilter === 'all') return getCombinedAttachmentOptions();
    return getAttachmentOptionsForMachine(machineFilter);
  }, [machineFilter]);

  const counts = useMemo(() => ({
    all: rows.length,
    draft: rows.filter((row) => effectiveStatus(row) === 'draft').length,
    published: rows.filter((row) => effectiveStatus(row) === 'published').length,
    archived: rows.filter((row) => effectiveStatus(row) === 'archived').length,
  }), [rows]);

  const updateStatus = async (row: NewsCmsPost, status: NewsStatus) => {
    setSaving(true);
    setMessage(null);
    setError(null);
    if (status === 'published') {
      const template = getNewsTemplate(row.template_id);
      const translationResult = await translateNewsContentDynamically({
        localizedContent: row.localized_content || {},
        previousLocalizedContent: row.localized_content,
        templateData: row.template_data || {},
        fields: template.fields,
        sourceLanguage: uiLanguage,
      });
      if (translationResult.error) {
        setSaving(false);
        setError(`Oversættelse mislykkedes: ${translationResult.error}. Nyheden er ikke publiceret med fallback.`);
        return;
      }

      const missing = missingNewsLanguages(translationResult.localizedContent, template.fields);
      if (missing.length > 0) {
        setSaving(false);
        setError(`${t('newsCmsPublishBlockedTranslations', uiLanguage)} ${missing.map(languageFlag).join(', ')}`);
        return;
      }

      const publishResult = await adminPublishNewsPost({
        id: row.id,
        template_id: row.template_id as NewsTemplateId,
        localized_content: translationResult.localizedContent,
        template_data: translationResult.templateData,
        assets: row.assets || [],
        source_language: uiLanguage,
      });
      setSaving(false);
      if (publishResult.error) {
        setError(publishResult.error);
        return;
      }
      setMessage(t('newsCmsPublished', uiLanguage));
      await reload();
      return;
    }
    const result = await adminUpdateNewsStatus(row.id, status);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage(t('newsCmsStatusUpdated', uiLanguage));
    await reload();
  };

  const saveManualOrder = async (reorderedRows: NewsCmsPost[]) => {
    setSaving(true);
    setMessage(null);
    setError(null);
    setSortKey('manual');
    const result = await adminUpdateNewsManualOrder(reorderedRows);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRows(sortNewsByManualOrder(reorderedRows));
    setMessage('Nyhedsrækkefølge gemt.');
  };

  const movePost = async (row: NewsCmsPost, direction: -1 | 1) => {
    const orderedRows = sortNewsByManualOrder(rows);
    const currentIndex = orderedRows.findIndex((item) => item.id === row.id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedRows.length) return;

    const reorderedRows = [...orderedRows];
    [reorderedRows[currentIndex], reorderedRows[nextIndex]] = [reorderedRows[nextIndex], reorderedRows[currentIndex]];

    await saveManualOrder(reorderedRows);
  };

  const moveDraggedPost = async (targetRow: NewsCmsPost) => {
    if (!draggingPostId || draggingPostId === targetRow.id) {
      setDraggingPostId(null);
      return;
    }

    const orderedRows = sortNewsByManualOrder(rows);
    const draggedIndex = orderedRows.findIndex((item) => item.id === draggingPostId);
    const targetIndex = orderedRows.findIndex((item) => item.id === targetRow.id);
    if (draggedIndex < 0 || targetIndex < 0) {
      setDraggingPostId(null);
      return;
    }

    const reorderedRows = [...orderedRows];
    const [draggedRow] = reorderedRows.splice(draggedIndex, 1);
    reorderedRows.splice(targetIndex, 0, draggedRow);
    setDraggingPostId(null);
    await saveManualOrder(reorderedRows);
  };

  const deletePost = async (row: NewsCmsPost) => {
    if (!window.confirm(`Slet nyheden "${row.title}"?`)) return;

    setSaving(true);
    setMessage(null);
    setError(null);
    const result = await adminDeleteNewsPost(row.id);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage('Nyhed slettet.');
    await reload();
  };

  if (loading) return <div className="min-h-screen bg-slate-50" />;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!canManage) return <Navigate to="/portal/backend" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={language}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate('/portal', { replace: true });
        }}
      />

      <main className="mx-auto w-full max-w-[1500px] flex-grow px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
              <Newspaper className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{viewMode === 'editor' ? t('newsCmsCreateCardTitle', uiLanguage) : t('newsCmsOverview', uiLanguage)}</h1>
              <p className="mt-1 text-sm text-slate-500">{t('newsCmsSubtitle', uiLanguage)}</p>
            </div>
          </div>
          {viewMode === 'dashboard' && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void reload()}>
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('newsCmsReload', uiLanguage)}
              </Button>
              <Button type="button" onClick={() => { setEditingPost(null); setViewMode('editor'); }}>
                <Plus className="mr-2 h-4 w-4" />
                {t('newsCmsCreateButton', uiLanguage)}
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

        {viewMode === 'editor' ? (
          <NewsSharedEditor
            uiLanguage={uiLanguage}
            initialPost={editingPost}
            saving={saving}
            onCancel={() => {
              setEditingPost(null);
              setViewMode('dashboard');
            }}
            onSaveDraft={async (payload) => {
              setSaving(true);
              setMessage(null);
              const result = await adminSaveNewsDraft({
                id: payload.id,
                template_id: payload.templateId,
                localized_content: payload.localizedContent,
                template_data: payload.templateData,
                source_language: payload.sourceLanguage,
              });
              setSaving(false);
              if (result.error) {
                setError(result.error);
                throw new Error(result.error);
              }
              setMessage(t('newsCmsDraftSaved', uiLanguage));
              await reload();
            }}
            onPublish={async (payload) => {
              setSaving(true);
              setMessage(null);
              const result = await adminPublishNewsPost({
                id: payload.id,
                template_id: payload.templateId,
                localized_content: payload.localizedContent,
                template_data: payload.templateData,
                source_language: payload.sourceLanguage,
              });
              setSaving(false);
              if (result.error) {
                setError(result.error);
                throw new Error(result.error);
              }
              setMessage(t('newsCmsPublished', uiLanguage));
              setEditingPost(null);
              setViewMode('dashboard');
              await reload();
            }}
          />
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{t('newsCmsOverview', uiLanguage)}</h2>
                  <p className="text-sm text-slate-500">{t('newsCmsDashboardHelp', uiLanguage)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  {(['all', 'draft', 'published', 'archived'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      className={`rounded-full px-3 py-2 font-bold ${statusFilter === status ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {t(`newsCmsFilter${status[0].toUpperCase()}${status.slice(1)}`, uiLanguage)} ({counts[status]})
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_180px_180px_180px_120px_180px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={t('newsCmsSearchPlaceholder', uiLanguage)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <select value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                  <option value="all">{t('newsCmsAllTemplates', uiLanguage)}</option>
                  {NEWS_TEMPLATE_REGISTRY.map((template) => (
                    <option key={template.id} value={template.id}>Template {template.number}</option>
                  ))}
                  <option value="legacy">{t('newsCmsLegacy', uiLanguage)}</option>
                </select>
                <select value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                  <option value="all">{t('newsCmsAllLanguages', uiLanguage)}</option>
                  {PORTAL_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>{lang.label}</option>
                  ))}
                </select>
                <select
                  value={machineFilter}
                  onChange={(event) => {
                    setMachineFilter(event.target.value);
                    setAttachmentFilter('all');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
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
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="all">{NEWS_TOPIC_UI_TEXT.attachmentFilterPlaceholder[uiLanguage]}</option>
                  {targetOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.labels[uiLanguage]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setMachineFilter('all');
                    setAttachmentFilter('all');
                  }}
                  disabled={machineFilter === 'all' && attachmentFilter === 'all'}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {NEWS_TOPIC_UI_TEXT.resetFilterLabel[uiLanguage]}
                </button>
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                  <option value="manual">Sortér: valgt rækkefølge</option>
                  <option value="updated">{t('newsCmsSortUpdated', uiLanguage)}</option>
                  <option value="published">{t('newsCmsSortPublished', uiLanguage)}</option>
                  <option value="title">{t('newsCmsSortTitle', uiLanguage)}</option>
                  <option value="template">{t('newsCmsSortTemplate', uiLanguage)}</option>
                  <option value="status">{t('newsCmsSortStatus', uiLanguage)}</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-[120px] px-4 py-3 text-left font-semibold">Rækkefølge</th>
                    <th className="px-4 py-3 text-left font-semibold">{t('newsCmsColumnTitle', uiLanguage)}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t('newsCmsColumnTemplate', uiLanguage)}</th>
                    <th className="px-4 py-3 text-left font-semibold">{NEWS_TOPIC_UI_TEXT.topicColumn[uiLanguage]}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t('newsCmsColumnStatus', uiLanguage)}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t('newsCmsColumnLanguage', uiLanguage)}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t('newsCmsColumnCreated', uiLanguage)}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t('newsCmsColumnUpdated', uiLanguage)}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t('newsCmsColumnPublished', uiLanguage)}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t('newsCmsColumnActions', uiLanguage)}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => {
                    const status = effectiveStatus(row);
                    const template = getNewsTemplate(row.template_id);
                    const topic = getNewsTopicForDisplay(row);
                    const orderedRows = sortNewsByManualOrder(rows);
                    const manualIndex = orderedRows.findIndex((item) => item.id === row.id);
                    return (
                      <tr
                        key={row.id}
                        draggable={!saving}
                        onDragStart={() => setDraggingPostId(row.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => void moveDraggedPost(row)}
                        onDragEnd={() => setDraggingPostId(null)}
                        className={`border-t border-slate-100 align-top hover:bg-slate-50/70 ${draggingPostId === row.id ? 'opacity-50' : ''}`}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1">
                            <GripVertical className="h-4 w-4 cursor-grab text-slate-300" aria-hidden="true" />
                            <span className="min-w-6 text-xs font-bold text-slate-500">{index + 1}</span>
                            <button
                              type="button"
                              disabled={saving || manualIndex <= 0}
                              onClick={() => void movePost(row, -1)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                              aria-label="Flyt nyhed op"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={saving || manualIndex < 0 || manualIndex >= orderedRows.length - 1}
                              onClick={() => void movePost(row, 1)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                              aria-label="Flyt nyhed ned"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="min-w-[260px] px-4 py-4">
                          <div className="font-semibold text-slate-900">{row.title}</div>
                          {row.excerpt && <div className="mt-1 line-clamp-2 max-w-md text-xs text-slate-500">{row.excerpt}</div>}
                        </td>
                        <td className="px-4 py-4 text-slate-600">{row.template_id === 'legacy' ? t('newsCmsLegacy', uiLanguage) : `Template ${template.number}`}</td>
                        <td className="px-4 py-4 text-slate-600">
                          <div className="font-semibold text-slate-700">{getNewsMachineLabel(topic, uiLanguage)}</div>
                          {getNewsAttachmentLabel(topic, uiLanguage) && (
                            <div className="mt-0.5 text-xs text-slate-500">{getNewsAttachmentLabel(topic, uiLanguage)}</div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1 ${statusClass(status)}`}>
                            {t(`newsCmsStatus${status[0].toUpperCase()}${status.slice(1)}`, uiLanguage)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          <div>{getRowLanguage(row)}</div>
                          {row.template_id !== 'legacy' && getMissingRowLanguages(row).length > 0 && (
                            <div className="mt-1 text-[11px] font-semibold text-amber-700">
                              {t('newsCmsMissingShort', uiLanguage)} {getMissingRowLanguages(row).map(languageFlag).join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-slate-500">{formatDate(row.created_at, uiLanguage)}</td>
                        <td className="px-4 py-4 text-slate-500">{formatDate(row.updated_at || row.published_at, uiLanguage)}</td>
                        <td className="px-4 py-4 text-slate-500">{status === 'published' ? formatDate(row.published_at, uiLanguage) : '-'}</td>
                        <td className="min-w-[250px] px-4 py-4">
                          <div className="flex flex-wrap justify-end gap-2">
                            {status !== 'archived' && (
                              <button type="button" onClick={() => { setEditingPost(getEditablePost(row)); setViewMode('editor'); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                <FilePenLine className="h-3.5 w-3.5" /> {t('edit', uiLanguage)}
                              </button>
                            )}
                            <button type="button" onClick={() => setPreviewPost(row)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                              <Eye className="h-3.5 w-3.5" /> {t('newsCmsPreview', uiLanguage)}
                            </button>
                            {status === 'draft' && (
                              <button type="button" disabled={saving} onClick={() => void updateStatus(row, 'published')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                                <Send className="h-3.5 w-3.5" /> {t('newsCmsPublish', uiLanguage)}
                              </button>
                            )}
                            {status === 'published' && (
                              <button type="button" disabled={saving} onClick={() => void updateStatus(row, 'draft')} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                                <Undo2 className="h-3.5 w-3.5" /> {t('newsCmsUnpublish', uiLanguage)}
                              </button>
                            )}
                            {status !== 'archived' ? (
                              <button type="button" disabled={saving} onClick={() => void updateStatus(row, 'archived')} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                                <Archive className="h-3.5 w-3.5" /> {t('newsCmsArchive', uiLanguage)}
                              </button>
                            ) : (
                              <button type="button" disabled={saving} onClick={() => void updateStatus(row, 'draft')} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                                <Undo2 className="h-3.5 w-3.5" /> {t('newsCmsRestore', uiLanguage)}
                              </button>
                            )}
                            <button type="button" disabled={saving} onClick={() => void deletePost(row)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100">
                              <Trash2 className="h-3.5 w-3.5" /> {t('delete', uiLanguage)}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!loadingRows && filteredRows.length === 0 && (
                    <tr>
                      <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={10}>
                        {t('newsCmsNoRows', uiLanguage)}
                      </td>
                    </tr>
                  )}
                  {loadingRows && (
                    <tr>
                      <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={10}>{t('loading', uiLanguage)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {previewPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{previewPost.title}</h2>
                <p className="text-sm text-slate-500">{t('newsCmsPreview', uiLanguage)}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setPreviewPost(null)}>{t('close', uiLanguage)}</Button>
            </div>
            {(() => {
              const template = getNewsTemplate(previewPost.template_id);
              return (
                <NewsRenderSurface
                  lang={uiLanguage}
                  template={template}
                  content={getPreviewContent(previewPost, uiLanguage)}
                  templateData={previewPost.template_data}
                  mode="preview"
                />
              );
            })()}
          </div>
        </div>
      )}

      <PortalFooter language={language} />
    </div>
  );
}
