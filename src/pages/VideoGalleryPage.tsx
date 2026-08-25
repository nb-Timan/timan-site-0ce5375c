import { Navigate, useNavigate } from 'react-router-dom';
import { Play, Wrench, BookOpen } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  title:   { da: 'Video Galleri', en: 'Video gallery', de: 'Videogalerie', it: 'Galleria video', hu: 'Videógaléria' },
  intro: {
    da: 'Vælg en kategori for at se maskinvideoer og guides.',
    en: 'Choose a category to see machine videos and guides.',
    de: 'Wählen Sie eine Kategorie, um Maschinenvideos und Anleitungen anzusehen.',
    it: 'Scegli una categoria per vedere video macchine e guide.',
    hu: 'Válasszon kategóriát a gépvideók és útmutatók megtekintéséhez.',
  },
};

import { VIDEO_CATEGORIES } from '@/data/videoCategories';

const CATEGORIES = VIDEO_CATEGORIES;

export default function VideoGalleryPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }

  if (!appUser) return <Navigate to="/portal" replace />;
  {
    const portalRole = (appUser as { portal_role?: string | null }).portal_role ?? null;
    const dealerSideRoles = new Set(['timan_dealer','timan_importer','timan_service_partner','dealer_user','private_end_user','timan_backend','timan_seller','timan_service']);
    if (appUser.role === 'slutkunde' && !(portalRole && dealerSideRoles.has(portalRole))) {
      return <Navigate to="/configurator" replace />;
    }
  }

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
          <h1 className="text-3xl font-bold text-gray-900">{T.title[lang]}</h1>
          <p className="text-gray-500 mt-2">{T.intro[lang]}</p>
        </div>
      </header>

      {/* Grid — 1 / 2 / 3 columns, gap-8 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full flex-grow">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => navigate(`/portal/videos/${cat.id}`)}
              className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 cursor-pointer group text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-md"
            >
              {cat.image ? (
                <div className="h-48 bg-gray-200 relative">
                  <img src={cat.image} alt={cat.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
                      <Play className="h-6 w-6 text-[#2d5a27] ml-0.5" fill="currentColor" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-48 bg-gray-100 flex items-center justify-center relative">
                  {cat.icon === 'wrench' ? (
                    <Wrench className="h-20 w-20 text-gray-300" strokeWidth={1} />
                  ) : (
                    <BookOpen className="h-20 w-20 text-gray-300" strokeWidth={1} />
                  )}
                  <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
              )}
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-900">{cat.title}</h3>
                <p className="text-sm text-gray-500 mt-1">{cat.subtitle[lang]}</p>
              </div>
            </button>
          ))}
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
