import { useEffect, useMemo, useState } from 'react';
import { Play, X } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import { portalLanguageLookupOrder, type PortalUiLanguage } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';
import {
  MESSE_VIDEOS,
  extractYouTubeId,
  youtubeThumbnail,
  type MesseVideo,
  type MesseVideoCategory,
} from '@/data/messeVideos';
import MesseSubpageHeader from '@/components/messe/MesseSubpageHeader';

const CATEGORY_ORDER: MesseVideoCategory[] = ['maskiner', 'redskaber'];

const CATEGORY_LABEL_KEYS: Record<MesseVideoCategory, string> = {
  maskiner: 'messeVideoCategoryMachines',
  redskaber: 'messeVideoCategoryAttachments',
  service: 'messeVideoCategoryService',
  salg: 'messeVideoCategorySales',
};

export default function MesseVideoPage() {
  const { uiLanguage } = useLanguage();
  const [active, setActive] = useState<MesseVideo | null>(null);
  const { appUser } = useAppUser();

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const latest = useMemo(
    () => [...MESSE_VIDEOS].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 6),
    [],
  );
  const byCategory = useMemo(() => {
    const m: Record<MesseVideoCategory, MesseVideo[]> = { maskiner: [], redskaber: [], service: [], salg: [] };
    for (const v of MESSE_VIDEOS) m[v.category].push(v);
    return m;
  }, []);

  if (!appUser) return null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <MesseSubpageHeader backLabel={t('back', uiLanguage)} />

      <main className="flex-grow max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-10">
        <h1 className="text-3xl font-bold text-slate-900">{t('messeHomeVideo', uiLanguage)}</h1>

        <Section title={t('messeVideoLatest', uiLanguage)} videos={latest} lang={uiLanguage} onPlay={setActive} />
        {CATEGORY_ORDER.map(cat => (
          <Section
            key={cat}
            title={t(CATEGORY_LABEL_KEYS[cat], uiLanguage)}
            videos={byCategory[cat]}
            lang={uiLanguage}
            onPlay={setActive}
          />
        ))}
      </main>

      {active && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setActive(null)}>
          <button
            type="button"
            onClick={() => setActive(null)}
            className="absolute top-4 right-4 rounded-full bg-white/10 hover:bg-white/20 text-white p-2"
            aria-label={t('close', uiLanguage)}
          >
            <X className="h-6 w-6" />
          </button>
          <div className="w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const id = extractYouTubeId(active.youtubeUrl);
              return id ? (
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${id}?autoplay=1`}
                  title={localizedVideoText(active.title, uiLanguage, active.id)}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  videos,
  lang,
  onPlay,
}: {
  title: string;
  videos: MesseVideo[];
  lang: PortalUiLanguage;
  onPlay: (v: MesseVideo) => void;
}) {
  return (
    <section>
      <h2 className="text-xl font-bold text-slate-900 mb-3">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {videos.map(v => {
          const thumb = v.thumbnail || youtubeThumbnail(v.youtubeUrl);
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onPlay(v)}
              className="text-left bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition group"
            >
              <div className="relative aspect-video bg-slate-200">
                {thumb ? <img src={thumb} alt={localizedVideoText(v.title, lang, v.id)} className="w-full h-full object-cover" /> : null}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition">
                  <div className="h-14 w-14 rounded-full bg-white flex items-center justify-center">
                    <Play className="h-6 w-6 text-emerald-700 ml-0.5" fill="currentColor" />
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="font-bold text-slate-900">{localizedVideoText(v.title, lang, v.id)}</div>
                <div className="text-sm text-slate-500 mt-1">{localizedVideoText(v.description, lang, '')}</div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function localizedVideoText(
  value: Partial<Record<PortalUiLanguage, string>>,
  language: PortalUiLanguage,
  fallback: string,
) {
  for (const code of portalLanguageLookupOrder(language, true)) {
    const text = value[code as PortalUiLanguage];
    if (text?.trim()) return text;
  }
  return fallback;
}
