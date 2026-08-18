/**
 * TSB sidebar layout — adapted from the old Timan TSB Hub
 * `TsbAdminSidebarLayout.tsx` for visual parity. Uses this project's
 * shared PortalHeader / PortalFooter / AppUserContext / LanguageContext
 * underneath so the unified Timan Portal topbar (logo, language, profile,
 * logout) stays consistent across modules.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Building2, FileText, Globe, LayoutDashboard, Settings, Users, Wrench, type LucideIcon } from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  match: string;
  exact?: boolean;
}

const TSB_NAV: NavItem[] = [
  { to: "/portal/service/tsb/dashboard", label: "Dashboard", icon: LayoutDashboard, match: "/portal/service/tsb/dashboard" },
  { to: "/portal/service/tsb",           label: "TSB'er",    icon: FileText,        match: "/portal/service/tsb", exact: true },
  { to: "/portal/service/tsb/dealers",   label: "Forhandlere", icon: Building2,     match: "/portal/service/tsb/dealers" },
  { to: "/portal/service/tsb/machines",  label: "Maskiner",    icon: Wrench,        match: "/portal/service/tsb/machines" },
  { to: "/portal/service/tsb/users",     label: "Brugere",     icon: Users,         match: "/portal/service/tsb/users" },
  { to: "/portal/service/tsb/countries", label: "Landeliste",  icon: Globe,         match: "/portal/service/tsb/countries" },
  { to: "/portal/service/tsb/settings",  label: "Indstillinger", icon: Settings,    match: "/portal/service/tsb/settings" },
];

class TsbErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[TsbErrorBoundary]", error, info);
  }
  reset = () => this.setState({ error: null });
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-900">
          <h2 className="text-xl font-black">Noget gik galt</h2>
          <p className="mt-2 text-sm">Vi kunne ikke vise denne side. Prøv igen.</p>
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

interface TsbSidebarLayoutProps {
  intro?: ReactNode;
  children: ReactNode;
}

export function TsbSidebarLayout({ intro, children }: TsbSidebarLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { appUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();

  if (!appUser) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }}
      />

      <div className="mx-auto flex max-w-[1700px] gap-6 px-4 sm:px-6 lg:px-8 py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-[88px] space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="px-3 py-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
              TSB Portal
            </div>
            {TSB_NAV.map((item) => {
              const Icon = item.icon;
              const active = item.exact
                ? location.pathname === item.match
                : location.pathname === item.match || location.pathname.startsWith(item.match + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                    active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          {intro && <div className="mb-5">{intro}</div>}
          <TsbErrorBoundary>{children}</TsbErrorBoundary>
        </div>
      </div>

      <PortalFooter language={lang} />
    </div>
  );
}
