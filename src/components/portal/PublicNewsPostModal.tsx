import { useEffect } from 'react';
import { X } from 'lucide-react';
import { resolvePublicNewsFields, type NewsPost } from '@/lib/newsService';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';
import { resolveNewsRenderContent } from '@/features/news-cms/lib/newsContent';
import NewsRenderSurface from '@/features/news-cms/editor/NewsRenderSurface';
import { NEWS_TEMPLATE_REGISTRY } from '@/features/news-cms/templates/registry';

interface Props {
  post: NewsPost | null;
  language: PortalUiLanguage;
  onClose: () => void;
}

const FALLBACK_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240">
       <rect width="400" height="240" fill="#f3f4f6"/>
       <text x="50%" y="50%" font-family="Inter, sans-serif" font-size="22" font-weight="700"
             fill="#2d5a27" text-anchor="middle" dominant-baseline="middle">TIMAN</text>
     </svg>`,
  );

export default function PublicNewsPostModal({ post, language, onClose }: Props) {
  useEffect(() => {
    if (!post) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [post, onClose]);

  if (!post) return null;

  const template = post.template_id
    ? NEWS_TEMPLATE_REGISTRY.find((item) => item.id === post.template_id)
    : null;
  const localizedPost = resolvePublicNewsFields(post, language);
  const content = template
    ? resolveNewsRenderContent(post.localized_content, language, template.fields, {
        headline: localizedPost.title,
        subtitle: localizedPost.excerpt,
        mainImage: localizedPost.image_url,
      })
    : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              {post.category?.toUpperCase() === 'SERVICE' ? t('latestFromTimanServiceTag', language) : t('newsCmsBadgeNews', language)}
            </p>
            <h2 className="text-xl font-bold text-slate-950">{localizedPost.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t('close', language)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-auto bg-slate-100 p-4 sm:p-6">
          {template && content ? (
            <NewsRenderSurface lang={language} template={template} content={content} mode="public" />
          ) : (
            <article className="mx-auto max-w-3xl rounded-2xl bg-white p-5 shadow-sm">
              <img
                src={localizedPost.image_url || FALLBACK_IMAGE}
                alt=""
                className="mb-5 aspect-video w-full rounded-xl bg-slate-100 object-cover"
                onError={(event) => {
                  event.currentTarget.src = FALLBACK_IMAGE;
                }}
              />
              <h3 className="text-2xl font-bold text-slate-950">{localizedPost.title}</h3>
              {localizedPost.excerpt && <p className="mt-3 text-base leading-7 text-slate-700">{localizedPost.excerpt}</p>}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
