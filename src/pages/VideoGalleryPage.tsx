import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Wrench, BookOpen } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useConfigurator } from '@/hooks/useConfigurator';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  back:    { da: 'Tilbage til dashboard', en: 'Back to dashboard', de: 'Zurück zum Dashboard', it: 'Torna alla dashboard', hu: 'Vissza az irányítópultra' },
  title:   { da: 'Video Galleri', en: 'Video gallery', de: 'Videogalerie', it: 'Galleria video', hu: 'Videógaléria' },
  intro: {
    da: 'Vælg en kategori for at se maskinvideoer og guides.',
    en: 'Choose a category to see machine videos and guides.',
    de: 'Wählen Sie eine Kategorie, um Maschinenvideos und Anleitungen anzusehen.',
    it: 'Scegli una categoria per vedere video macchine e guide.',
    hu: 'Válasszon kategóriát a gépvideók és útmutatók megtekintéséhez.',
  },
};

interface Category {
  id: string;
  title: string;
  subtitle: Record<Language, string>;
  image?: string;
  icon?: 'wrench' | 'book';
  href?: string;
}

const CATEGORIES: Category[] = [
  {
    id: 'rc-751',
    title: 'Timan RC-751',
    subtitle: { da: 'Fjernstyret skråningsklipper', en: 'Remote-controlled slope mower', de: 'Ferngesteuerter Hangmäher', it: 'Tosaerba radiocomandato per pendii', hu: 'Távirányítású rézsűkaszáló' },
    image: 'https://images.unsplash.com/photo-1590400541360-b2095820ec71?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: 'rc-1000s',
    title: 'Timan RC-1000s',
    subtitle: { da: 'Fjernstyret redskabsbærer', en: 'Remote-controlled tool carrier', de: 'Ferngesteuerter Geräteträger', it: 'Portautensili radiocomandato', hu: 'Távirányítású szerszámhordozó' },
    image: 'https://images.unsplash.com/photo-1533991321616-622ee20c248b?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: '3330',
    title: 'Timan 3330',
    subtitle: { da: 'Redskabsbærer', en: 'Tool carrier', de: 'Geräteträger', it: 'Portautensili', hu: 'Szerszámhordozó' },
    image: 'https://images.unsplash.com/photo-1516937941344-00b4e0337589?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: '2620',
    title: 'Timan 2620',
    subtitle: { da: 'Redskabsbærer', en: 'Tool carrier', de: 'Geräteträger', it: 'Portautensili', hu: 'Szerszámhordozó' },
    image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: 'redskaber',
    title: 'Redskaber',
    subtitle: { da: 'Videoer af koste, klippeborde mm.', en: 'Videos of brushes, cutting decks etc.', de: 'Videos zu Bürsten, Mähdecks usw.', it: 'Video di spazzole, piatti di taglio ecc.', hu: 'Videók kefékről, vágóasztalokról stb.' },
    icon: 'wrench',
  },
  {
    id: 'help',
    title: 'How to install & Help',
    subtitle: { da: 'Vejledninger og teknisk hjælp', en: 'Guides and technical help', de: 'Anleitungen und technische Hilfe', it: 'Guide e supporto tecnico', hu: 'Útmutatók és műszaki segítség' },
    icon: 'book',
  },
];

export default function VideoGalleryPage() {
  const { appUser, loading, logout } = useAppUser();
  const { state, setLanguage } = useConfigurator();
  const navigate = useNavigate();
  const lang = state.language;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }

  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === 'slutkunde') return <Navigate to="/configurator" replace />;

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

      {/* Page header — matches mockup: bg-white, border-b, py-10 */}
      <header className="bg-white border-b border-gray-200 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => navigate('/portal')}
            className="flex items-center text-[#2d5a27] font-semibold mb-4 hover:underline"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            {T.back[lang]}
          </button>
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
              onClick={() => cat.href && navigate(cat.href)}
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
