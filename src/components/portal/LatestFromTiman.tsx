import { useEffect, useState } from 'react';
import { fetchLatestNews, resolvePublicNewsFields, NewsPost } from '@/lib/newsService';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';
import PublicNewsPostModal from '@/components/portal/PublicNewsPostModal';

interface Props {
  language: PortalUiLanguage;
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

const DATE_LOCALE: Record<PortalUiLanguage, string> = {
  da: 'da-DK',
  en: 'en-US',
  de: 'de-DE',
  it: 'it-IT',
  hu: 'hu-HU',
  sv: 'sv-SE',
  fr: 'fr-FR',
  pl: 'pl-PL',
  cs: 'cs-CZ',
};

function categoryStyle(category: string) {
  const c = (category || '').toUpperCase();
  if (c === 'SERVICE') return { bg: 'bg-blue-100', text: 'text-blue-600' };
  return { bg: 'bg-green-100', text: 'text-[#2d5a27]' };
}

function categoryLabel(category: string, language: PortalUiLanguage) {
  const c = (category || '').toUpperCase();
  if (c === 'SERVICE') return t('latestFromTimanServiceTag', language);
  if (c === 'NYHED' || c === 'NEWS') return t('newsCmsBadgeNews', language);
  return c;
}

function buildPlaceholders(language: PortalUiLanguage): NewsPost[] {
  const now = new Date();
  return [
    {
      id: 'placeholder-1',
      title: t('latestFromTimanPlaceholder1Title', language),
      excerpt: t('latestFromTimanPlaceholder1Body', language),
      image_url: null,
      link_url: null,
      category: 'NYHED',
      published_at: now.toISOString(),
      is_active: true,
      source: 'placeholder',
    },
    {
      id: 'placeholder-2',
      title: t('latestFromTimanPlaceholder2Title', language),
      excerpt: t('latestFromTimanPlaceholder2Body', language),
      image_url: null,
      link_url: null,
      category: 'SERVICE',
      published_at: now.toISOString(),
      is_active: true,
      source: 'placeholder',
    },
  ];
}

export default function LatestFromTiman({ language }: Props) {
  const [posts, setPosts] = useState<NewsPost[] | null>(null);
  const [openPost, setOpenPost] = useState<NewsPost | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLatestNews(3, language).then((rows) => {
      if (cancelled) return;
      setPosts(rows.length > 0 ? rows : buildPlaceholders(language));
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const data = posts ?? buildPlaceholders(language);

  return (
    <div className="mt-16 bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{t('latestFromTimanHeading', language)}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {data.map((item) => {
          const styles = categoryStyle(item.category);
          const opensInModal = !item.link_url && item.source !== 'placeholder';
          const localizedItem = resolvePublicNewsFields(item, language);

          const inner = (
            <div className="flex h-full flex-col text-left">
              <img
                src={localizedItem.image_url || FALLBACK_IMAGE}
                alt=""
                onError={(event) => {
                  event.currentTarget.src = FALLBACK_IMAGE;
                }}
                className="aspect-square w-full object-cover rounded-lg mb-4 bg-gray-100"
              />

              <div className={`${styles.bg} ${styles.text} text-xs font-bold px-2 py-1 rounded self-start mb-3`}>
                {categoryLabel(item.category, language)}
              </div>

              <h4 className="font-semibold text-gray-900 mb-2 line-clamp-2">{localizedItem.title}</h4>
              {localizedItem.excerpt && (
                <p className="text-sm text-gray-500 line-clamp-3 mb-3">{localizedItem.excerpt}</p>
              )}

              <div className="mt-auto pt-3 text-xs text-gray-400">
                {new Date(item.published_at).toLocaleDateString(DATE_LOCALE[language], {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            </div>
          );

          return item.link_url ? (
            <a
              key={item.id}
              href={item.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md hover:border-gray-200 transition-all"
            >
              {inner}
            </a>
          ) : (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (opensInModal) setOpenPost(item);
              }}
              className="block bg-white border border-gray-100 rounded-xl p-4 transition-all hover:border-gray-200 hover:shadow-md disabled:hover:shadow-none"
              disabled={!opensInModal}
            >
              {inner}
            </button>
          );
        })}
      </div>
      <PublicNewsPostModal post={openPost} language={language} onClose={() => setOpenPost(null)} />
    </div>
  );
}
