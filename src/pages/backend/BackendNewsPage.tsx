import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Newspaper, RotateCcw } from 'lucide-react';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';
import { canManageNewsContent } from '@/lib/portalAccess';
import {
  adminListNewsPosts,
  adminPublishNewsPost,
  adminSaveNewsDraft,
  type NewsCmsPost,
} from '@/lib/newsService';
import NewsSharedEditor from '@/features/news-cms/editor/NewsSharedEditor';

export default function BackendNewsPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language, uiLanguage, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [rows, setRows] = useState<NewsCmsPost[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      <main className="mx-auto w-full max-w-[1400px] flex-grow px-4 py-10 sm:px-6 lg:px-8">
        <Link to="/portal/backend" className="mb-6 inline-flex items-center text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('newsCmsBackToBackend', uiLanguage)}
        </Link>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
              <Newspaper className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{t('newsCmsTitle', uiLanguage)}</h1>
              <p className="mt-1 text-sm text-slate-500">{t('newsCmsSubtitle', uiLanguage)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('newsCmsReload', uiLanguage)}
          </button>
        </div>

        {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>}
        {error && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>{t('newsCmsDatabaseNotReady', uiLanguage)}</strong>
            <span className="ml-1">{error}</span>
          </div>
        )}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">{t('newsCmsOverview', uiLanguage)}</h2>
            <p className="text-sm text-slate-500">{t('newsCmsOverviewHelp', uiLanguage)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">{t('newsCmsColumnTitle', uiLanguage)}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('newsCmsColumnTemplate', uiLanguage)}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('newsCmsColumnStatus', uiLanguage)}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('newsCmsColumnUpdated', uiLanguage)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.title}</td>
                    <td className="px-4 py-3 text-slate-600">{row.template_id || 'legacy'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {row.status || (row.is_active ? 'published' : 'draft')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{row.updated_at ? new Date(row.updated_at).toLocaleString('da-DK') : '-'}</td>
                  </tr>
                ))}
                {!loadingRows && rows.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={4}>
                      {t('newsCmsNoRows', uiLanguage)}
                    </td>
                  </tr>
                )}
                {loadingRows && (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={4}>{t('loading', uiLanguage)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <NewsSharedEditor
          uiLanguage={uiLanguage}
          saving={saving}
          onSaveDraft={async (payload) => {
            setSaving(true);
            setMessage(null);
            const result = await adminSaveNewsDraft({
              template_id: payload.templateId,
              localized_content: payload.localizedContent,
            });
            setSaving(false);
            if (result.error) {
              setError(result.error);
              return;
            }
            setMessage(t('newsCmsDraftSaved', uiLanguage));
            await reload();
          }}
          onPublish={async (payload) => {
            setSaving(true);
            setMessage(null);
            const result = await adminPublishNewsPost({
              template_id: payload.templateId,
              localized_content: payload.localizedContent,
            });
            setSaving(false);
            if (result.error) {
              setError(result.error);
              return;
            }
            setMessage(t('newsCmsPublished', uiLanguage));
            await reload();
          }}
        />
      </main>

      <PortalFooter language={language} />
    </div>
  );
}
