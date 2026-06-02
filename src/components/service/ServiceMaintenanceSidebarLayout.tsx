/**
 * Sidebar layout for "Service registrering og vedligehold".
 * Mirrors the TSB / Warranty sidebar shells so the module feels consistent
 * with the rest of Teknik & Service.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  ClipboardList,
  LayoutDashboard,
  PlusCircle,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { getPortalBackTarget, goBackOrFallback } from "@/lib/portalBackNav";
import type { Language } from "@/types/configurator";

export type ServiceMaintView =
  | "dashboard"
  | "registrations"
  | "create"
  | "dealers"
  | "machines"
  | "settings";

interface NavItem {
  view: ServiceMaintView;
  icon: LucideIcon;
  internalOnly?: boolean;
}

const NAV: NavItem[] = [
  { view: "dashboard", icon: LayoutDashboard },
  { view: "registrations", icon: ClipboardList },
  { view: "create", icon: PlusCircle },
  { view: "dealers", icon: Building2, internalOnly: true },
  { view: "machines", icon: Wrench, internalOnly: true },
  { view: "settings", icon: Settings, internalOnly: true },
];

const L: Record<ServiceMaintView, Record<Language, string>> = {
  dashboard: { da: "Dashboard", en: "Dashboard", de: "Dashboard", it: "Dashboard", hu: "Dashboard" },
  registrations: {
    da: "Service registreringer / Maskinoversigt",
    en: "Service registrations / Machine overview",
    de: "Serviceerfassungen / Maschinenübersicht",
    it: "Registrazioni servizio / Panoramica macchine",
    hu: "Szervizregisztrációk / Gépek áttekintése",
  },
  create: {
    da: "Opret service registrering",
    en: "Create service registration",
    de: "Serviceerfassung erstellen",
    it: "Crea registrazione servizio",
    hu: "Szervizregisztráció létrehozása",
  },
  dealers: { da: "Forhandlere", en: "Dealers", de: "Händler", it: "Rivenditori", hu: "Kereskedők" },
  machines: { da: "Maskiner", en: "Machines", de: "Maschinen", it: "Macchine", hu: "Gépek" },
  settings: { da: "Indstillinger", en: "Settings", de: "Einstellungen", it: "Impostazioni", hu: "Beállítások" },
};

const BACK_LABEL: Record<Language, string> = {
  da: "Tilbage til Teknik & Service",
  en: "Back to Technical & Service",
  de: "Zurück zu Technik & Service",
  it: "Torna a Tecnico & Assistenza",
  hu: "Vissza a Műszaki & Szervizhez",
};

const SECTION_LABEL: Record<Language, string> = {
  da: "Service & vedligehold",
  en: "Service & maintenance",
  de: "Service & Wartung",
  it: "Servizio & manutenzione",
  hu: "Szerviz & karbantartás",
};

class ServiceErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ServiceMaintErrorBoundary]", error, info);
  }
  reset = () => this.setState({ error: null });
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-900">
          <h2 className="text-xl font-black">Noget gik galt</h2>
          <p className="mt-3 font-mono text-xs opacity-70">{this.state.error.message}</p>
          <button onClick={this.reset} className="mt-5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">
            Prøv igen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface Props {
  currentView: ServiceMaintView;
  onViewChange: (v: ServiceMaintView) => void;
  isInternal: boolean;
  intro?: ReactNode;
  children: ReactNode;
}

export function ServiceMaintenanceSidebarLayout({
  currentView, onViewChange, isInternal, intro, children,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { appUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();

  if (!appUser) return null;

  const items = NAV.filter((n) => isInternal || !n.internalOnly);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }}
      />

      <div className="bg-white border-b border-slate-200 py-3">
        <div className="mx-auto max-w-[1700px] px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => goBackOrFallback(navigate, location)}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {BACK_LABEL[lang] ?? BACK_LABEL.en}
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1700px] gap-6 px-4 sm:px-6 lg:px-8 py-6">
        <aside className="hidden w-64 shrink-0 lg:block">
          <nav className="sticky top-[88px] space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="px-3 py-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
              {SECTION_LABEL[lang] ?? SECTION_LABEL.en}
            </div>
            {items.map((item) => {
              const Icon = item.icon;
              const active = currentView === item.view;
              const label = L[item.view][lang] ?? L[item.view].en;
              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => onViewChange(item.view)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                    active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          {intro && <div className="mb-5">{intro}</div>}
          <ServiceErrorBoundary>{children}</ServiceErrorBoundary>
        </div>
      </div>

      <PortalFooter language={lang} />
    </div>
  );
}
