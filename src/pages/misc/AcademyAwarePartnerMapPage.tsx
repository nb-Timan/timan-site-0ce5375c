import { Map, MapPinned } from 'lucide-react';
import { useState } from 'react';
import PortalFooter from '@/components/portal/PortalFooter';
import PortalHeader from '@/components/portal/PortalHeader';
import AcademyGuidancePanel from '@/components/academy/AcademyGuidancePanel';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { getLocalAcademyUser } from '@/lib/academyCurriculum';
import { academySandbox } from '@/lib/academySandbox';
import PartnerMapPage from './PartnerMapPage';

const AREAS = ['Danmark', 'Sverige', 'Tyskland'] as const;

/** Keeps the Portal Basics map exercise local while regular users use PartnerMapPage. */
export default function AcademyAwarePartnerMapPage() {
  if (!academySandbox.isActive()) return <PartnerMapPage />;
  return <AcademyPartnerMapPage />;
}

function AcademyPartnerMapPage() {
  const { appUser, logout } = useAppUser();
  const { language, setLanguage } = useLanguage();
  const user = appUser || getLocalAcademyUser();
  const [completed, setCompleted] = useState(() => academySandbox.getPortalBasics().mapAreaChanged);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <PortalHeader user={user} language={language} onLanguageChange={setLanguage} onLogout={logout} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <AcademyGuidancePanel
          title="Portal Basics - Partnerkort"
          description="Vælg et område på det lokale Academy-kort. Det rigtige Partnerkort og dets partnerdata åbnes ikke i træningen."
          tasks={[{ label: 'Område ændret', complete: completed }]}
          next="vælg et område, som ikke er det nuværende valg."
        />
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-[#126a45]" /><h1 className="text-xl font-bold text-slate-900">Partnerkort</h1></div>
          <p className="mt-2 text-sm text-slate-600">Lokalt Academy-kort. Valget gemmes kun i Academy-fremdriften.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {AREAS.map((area) => (
              <button key={area} type="button" onClick={() => { academySandbox.trackPortalBasicsMapArea(area); setCompleted(true); }} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border border-slate-200 p-4 text-sm font-semibold text-slate-800 transition hover:border-emerald-600 hover:bg-emerald-50">
                <Map className="h-5 w-5 text-[#126a45]" />{area}
              </button>
            ))}
          </div>
        </section>
      </main>
      <PortalFooter language={language} />
    </div>
  );
}
