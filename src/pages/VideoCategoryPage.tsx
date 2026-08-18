import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Play } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { getCategoryById } from '@/data/videoCategories';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  back:     { da: 'Tilbage til kategorier', en: 'Back to categories', de: 'Zurück zu Kategorien', it: 'Torna alle categorie', hu: 'Vissza a kategóriákhoz' },
  intro:    { da: 'Nyeste videoer og vejledninger.', en: 'Latest videos and guides.', de: 'Neueste Videos und Anleitungen.', it: 'Ultimi video e guide.', hu: 'Legújabb videók és útmutatók.' },
  notFound: { da: 'Kategori ikke fundet', en: 'Category not found', de: 'Kategorie nicht gefunden', it: 'Categoria non trovata', hu: 'Kategória nem található' },
  empty:    { da: 'Ingen videoer endnu.', en: 'No videos yet.', de: 'Noch keine Videos.', it: 'Ancora nessun video.', hu: 'Még nincsenek videók.' },
};

const localeMap: Record<Language, string> = {
  da: 'da-DK', en: 'en-GB', de: 'de-DE', it: 'it-IT', hu: 'hu-HU',
};

export default function VideoCategoryPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId: string }>();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }

  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === 'slutkunde') return <Navigate to="/configurator" replace />;

  const category = categoryId ? getCategoryById(categoryId) : undefined;

  const videos = (category?.videos ?? [])
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate('/portal', { replace: true });
        }}
      />

      {/* Page header */}
      <header className="bg-white border-b border-gray-200 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {category?.title ?? T.notFound[lang]}
          </h1>
          <p className="text-gray-500 mt-2">{T.intro[lang]}</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full flex-grow">
        {videos.length === 0 ? (
          <p className="text-sm text-gray-500">{T.empty[lang]}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
            {videos.map((video, idx) => {
              const isPlaceholder = video.id.startsWith('placeholder');
              const thumbUrl = isPlaceholder
                ? 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&q=80&w=400'
                : `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`;
              const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;
              const dateLabel = new Date(video.date).toLocaleDateString(localeMap[lang]);

              return (
                <a
                  key={`${video.id}-${idx}`}
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer group flex flex-col h-full transition-all duration-300 hover:-translate-y-1.5 hover:shadow-md"
                >
                  <div className="relative h-32 bg-gray-200">
                    <img src={thumbUrl} alt={video.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#2d5a27] shadow-lg">
                        <Play className="h-4 w-4 ml-0.5" fill="currentColor" />
                      </div>
                    </div>
                  </div>
                  <div className="p-3 flex-grow">
                    <h4 className="font-bold text-xs text-gray-900 leading-tight mb-1">{video.title}</h4>
                    <p className="text-[10px] text-gray-500 line-clamp-2">{video.desc}</p>
                  </div>
                  <div className="px-3 py-2 border-t border-gray-50 text-[10px] text-gray-400">
                    {dateLabel}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
