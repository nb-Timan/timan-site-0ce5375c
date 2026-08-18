/**
 * Claims sidebar layout — adapted 1:1 from the old Timan TSB Hub
 * `ClaimsAdminSidebarLayout.tsx`. Uses this project's PortalHeader so the
 * unified Timan Portal topbar (logo, language, profile, logout) stays the
 * same across all modules. The inner sidebar + content area mirror the
 * old portal exactly.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ClipboardList, LayoutDashboard, type LucideIcon } from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";

export type ClaimsLayoutScope = "admin" | "dealer";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  match: string;
}

// Internal routes are URL-based (?tab=…) so we can keep one route per role
// without changing the existing app routing.
const ADMIN_NAV: NavItem[] = [
  { to: "/portal/service/claims",          label: "Dashboard",   icon: LayoutDashboard, match: "dashboard" },
  { to: "/portal/service/claims?tab=all",  label: "Alle claims", icon: ClipboardList,   match: "all" },
];

const DEALER_NAV: NavItem[] = [
  { to: "/portal/service/claims",            label: "Dashboard",  icon: LayoutDashboard, match: "dashboard" },
  { to: "/portal/service/claims?tab=mine",   label: "Mine claims", icon: ClipboardList,   match: "mine" },
];

interface ClaimsErrorBoundaryState {
  error: Error | null;
}

class ClaimsErrorBoundaryInner extends Component<
  { children: ReactNode },
  ClaimsErrorBoundaryState
> {
  state: ClaimsErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ClaimsErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ClaimsErrorBoundary]", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-900">
          <h2 className="text-xl font-black">Noget gik galt</h2>
          <p className="mt-2 text-sm">Vi kunne ikke vise denne side. Prøv igen.</p>
          <p className="mt-3 font-mono text-xs opacity-70">{this.state.error.message}</p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            Prøv igen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface ClaimsAdminSidebarLayoutProps {
  /** Defaults to "dealer" so the existing dealer routes keep working. */
  scope?: ClaimsLayoutScope;
  intro?: ReactNode;
  children: ReactNode;
}

/** Returns which nav item the current ?tab= matches. */
function activeMatch(search: string, pathname: string): string {
  if (pathname.includes("/portal/service/claims/")) return ""; // detail page
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  if (tab === "all") return "all";
  if (tab === "mine") return "mine";
  return "dashboard";
}

export function ClaimsAdminSidebarLayout({
  scope = "dealer",
  intro,
  children,
}: ClaimsAdminSidebarLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { appUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const nav = scope === "admin" ? ADMIN_NAV : DEALER_NAV;
  const current = activeMatch(location.search, location.pathname);

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
        <aside className="hidden w-64 shrink-0 lg:block">
          <nav className="sticky top-[88px] space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = current === item.match;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
          <ClaimsErrorBoundaryInner>{children}</ClaimsErrorBoundaryInner>
        </div>
      </div>

      <PortalFooter language={lang} />
    </div>
  );
}
