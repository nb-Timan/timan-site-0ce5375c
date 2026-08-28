import { Navigate, useNavigate } from "react-router-dom";
import PortalFooter from "@/components/portal/PortalFooter";
import PortalHeader from "@/components/portal/PortalHeader";
import PlaceholderCard from "@/components/portal/PlaceholderCard";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { findBackendSection, type BackendSectionId } from "@/lib/backendNavigation";
import { isBackendActor } from "@/lib/portalAccess";

interface Props {
  sectionId: BackendSectionId;
}

export default function BackendSectionPage({ sectionId }: Props) {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const section = findBackendSection(sectionId);
  const SectionIcon = section?.icon;

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">...</div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!isBackendActor(appUser)) return <Navigate to="/portal/backend" replace />;
  if (!section) return <Navigate to="/portal/backend" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate("/portal", { replace: true });
        }}
      />

      <main className="mx-auto w-full max-w-[1700px] flex-grow px-4 py-10 sm:px-6 lg:px-8 xl:px-12">
        <header className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
            {SectionIcon ? <SectionIcon className="h-6 w-6 text-emerald-700" /> : null}
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-950">{section.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{section.description}</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {section.items.map((item) => (
            <PlaceholderCard
              key={item.title}
              title={item.title}
              language={lang}
              to={item.to}
              icon={item.icon}
              description={item.description}
            />
          ))}
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
