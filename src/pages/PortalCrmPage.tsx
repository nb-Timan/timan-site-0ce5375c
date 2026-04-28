import { Navigate, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, Store, Users, Activity, TrendingUp, BarChart3 } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import PlaceholderCard from '@/components/portal/PlaceholderCard';
import { derivePortalRole, hasModuleAccess } from '@/lib/portalAccess';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  back:  { da: 'Tilbage til portal', en: 'Back to portal', de: 'Zurück zum Portal', it: 'Torna al portale', hu: 'Vissza a portálra' },
  title: { da: 'Timan CRM', en: 'Timan CRM', de: 'Timan CRM', it: 'Timan CRM', hu: 'Timan CRM' },
  body:  {
    da: 'Forhandlere, kontakter, aktiviteter og pipeline.',
    en: 'Dealers, contacts, activities and pipeline.',
    de: 'Händler, Kontakte, Aktivitäten und Pipeline.',
    it: 'Rivenditori, contatti, attività e pipeline.',
    hu: 'Kereskedők, kapcsolatok, tevékenységek és pipeline.',
  },
};

interface Card {
  key: string;
  title: Record<Language, string>;
}

const CARDS: Card[] = [
  { key: 'dashboard',       title: { da: 'Dashboard',         en: 'Dashboard',     de: 'Dashboard',     it: 'Dashboard',     hu: 'Irányítópult' } },
  { key: 'mine_forhandlere',title: { da: 'Mine forhandlere',  en: 'My dealers',    de: 'Meine Händler', it: 'I miei rivenditori', hu: 'Saját kereskedők' } },
  { key: 'kontakter',       title: { da: 'Kontakter',         en: 'Contacts',      de: 'Kontakte',      it: 'Contatti',      hu: 'Kapcsolatok' } },
  { key: 'aktiviteter',     title: { da: 'Aktiviteter',       en: 'Activities',    de: 'Aktivitäten',   it: 'Attività',      hu: 'Tevékenységek' } },
  { key: 'pipeline',        title: { da: 'Pipeline',          en: 'Pipeline',      de: 'Pipeline',      it: 'Pipeline',      hu: 'Pipeline' } },
  { key: 'rapporter',       title: { da: 'Rapporter',         en: 'Reports',       de: 'Berichte',      it: 'Report',        hu: 'Riportok' } },
];

export default function PortalCrmPage() {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === 'slutkunde') return <Navigate to="/configurator" replace />;

  const portalRole = derivePortalRole(appUser);
  if (!hasModuleAccess(portalRole, 'timan_crm', appUser.module_access as never)) {
    return <Navigate to="/portal" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow w-full">
        <Link to="/portal" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {T.back[lang]}
        </Link>

        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{T.title[lang]}</h1>
          <p className="text-gray-600 text-base mt-2 max-w-3xl">{T.body[lang]}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {CARDS.map(c => (
            <PlaceholderCard
              key={c.key}
              title={c.title[lang] || c.title.en}
              language={lang}
            />
          ))}
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
