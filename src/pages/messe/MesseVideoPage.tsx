import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, X } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { MESSE_VIDEOS, MESSE_VIDEO_CATEGORY_LABEL, extractYouTubeId, youtubeThumbnail, type MesseVideo, type MesseVideoCategory } from '@/data/messeVideos';
import { Language } from '@/types/configurator';
import DemoModeBadge from '@/components/messe/DemoModeBadge';
import PortalHeader from '@/components/portal/PortalHeader';
import { useMesseMode } from '@/lib/messeMode';
import { useAppUser } from '@/context/AppUserContext';
import { leaveExhibitionMode } from '@/lib/exhibitionMode';
import { supabase } from '@/lib/supabase';
import timanLogo from '@/assets/timan-logo.png';



const T: Record<string, Record<Language, string>> = {
  back:   { da: 'Tilbage', en: 'Back', de: 'Zurück', it: 'Indietro', hu: 'Vissza' },
  title:  { da: 'Video Akademi', en: 'Video Academy', de: 'Video-Akademie', it: 'Video Academy', hu: 'Videó Akadémia' },
  latest: { da: 'Seneste videoer', en: 'Latest videos', de: 'Neueste Videos', it: 'Ultimi video', hu: 'Legújabb videók' },
  none:   { da: 'Ingen videoer', en: 'No videos', de: 'Keine Videos', it: 'Nessun video', hu: 'Nincs videó' },
};

const CATEGORY_ORDER: MesseVideoCategory[] = ['maskiner', 'redskaber', 'service', 'salg'];

export default function MesseVideoPage() {
  const { language: lang, setLanguage } = useLanguage();
  const [active, setActive] = useState<MesseVideo | null>(null);
  const cachedRealUser = useCachedRealBackendUser();
  const { appUser, setAppUser } = useAppUser();
  const realUser = getRealBackendUserFromAppUser(appUser) || cachedRealUser;
  const navigate = useNavigate();

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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      {realUser ? (
        <>
          <PortalHeader
            user={realUser}
            language={lang}
            onLanguageChange={setLanguage}
            onLogout={async () => {
              leaveExhibitionMode();
              try { await supabase.auth.signOut(); } catch { /* ignore */ }
              setAppUser(null);
              navigate('/portal', { replace: true });
            }}
          />
          <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-center gap-2">
              <DemoModeBadge />
              <Link to="/messe" className="inline-flex items-center font-semibold text-emerald-800 hover:underline">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> {T.back[lang]}
              </Link>
            </div>
          </div>
        </>
      ) : (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <Link to="/messe" className="flex items-center gap-3">
              <img src={timanLogo} alt="Timan" className="h-10 sm:h-12 w-auto" />
              <DemoModeBadge />
            </Link>
            <Link to="/messe" className="inline-flex items-center text-sm font-semibold text-emerald-800 hover:underline">
              <ArrowLeft className="h-4 w-4 mr-1" /> {T.back[lang]}
            </Link>
          </div>
        </header>
      )}

      <main className="flex-grow max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-10">
        <h1 className="text-3xl font-bold text-slate-900">{T.title[lang]}</h1>

        <Section title={T.latest[lang]} videos={latest} lang={lang} onPlay={setActive} />
        {CATEGORY_ORDER.map(cat => (
          <Section
            key={cat}
            title={MESSE_VIDEO_CATEGORY_LABEL[cat][lang]}
            videos={byCategory[cat]}
            lang={lang}
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
            aria-label="Close"
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
                  title={active.title[lang] || active.id}
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

function Section({ title, videos, lang, onPlay }: { title: string; videos: MesseVideo[]; lang: Language; onPlay: (v: MesseVideo) => void }) {
  if (videos.length === 0) return null;
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
                {thumb ? <img src={thumb} alt={v.title[lang] || v.id} className="w-full h-full object-cover" /> : null}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition">
                  <div className="h-14 w-14 rounded-full bg-white flex items-center justify-center">
                    <Play className="h-6 w-6 text-emerald-700 ml-0.5" fill="currentColor" />
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="font-bold text-slate-900">{v.title[lang] || v.title.da || v.id}</div>
                <div className="text-sm text-slate-500 mt-1">{v.description[lang] || v.description.da || ''}</div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
