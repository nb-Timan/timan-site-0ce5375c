/**
 * Warranty sidebar layout — adapted 1:1 from the old Timan TSB Hub
 * `WarrantyAdminSidebarLayout`. Uses this project's PortalHeader so the
 * unified Timan Portal topbar (logo, language, profile, logout) stays the
 * same across all modules. The inner sidebar + content area mirror the
 * old portal exactly.
 *
 * One shared shell: PortalHeader + sticky white card sidebar + content area.
 * The sidebar items, labels, header titles and link targets switch by `scope`.
 */

import type { ReactNode } from "react";
import { Component, type ErrorInfo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ClipboardList,
  FileBadge,
  LayoutDashboard,
  PlusCircle,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";

export type WarrantyLayoutScope = "admin" | "dealer";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  match: string;
  exact?: boolean;
}

const ADMIN_NAV: NavItem[] = [
  { to: "/portal/service/warranty", label: "Dashboard", icon: LayoutDashboard, match: "/portal/service/warranty", exact: true },
  { to: "/portal/service/warranty/registrations", label: "Registrerede garantibeviser", icon: FileBadge, match: "/portal/service/warranty/registrations" },
  { to: "/portal/service/warranty/sync", label: "Synkronisering", icon: RefreshCw, match: "/portal/service/warranty/sync" },
];

const DEALER_NAV: NavItem[] = [
  { to: "/portal/service/warranty", label: "Dashboard", icon: LayoutDashboard, match: "/portal/service/warranty", exact: true },
  { to: "/portal/service/warranty/registrations", label: "Mine registreringer", icon: ClipboardList, match: "/portal/service/warranty/registrations" },
  { to: "/portal/service/warranty/new", label: "Ny registrering", icon: PlusCircle, match: "/portal/service/warranty/new" },
];

const DEALER_NAV_READONLY: NavItem[] = [
  { to: "/portal/service/warranty", label: "Dashboard", icon: LayoutDashboard, match: "/portal/service/warranty", exact: true },
  { to: "/portal/service/warranty/registrations", label: "Mine registreringer", icon: ClipboardList, match: "/portal/service/warranty/registrations" },
];

interface WarrantyErrorBoundaryState {
  error: Error | null;
}

class WarrantyErrorBoundaryInner extends Component<
  { children: ReactNode },
  WarrantyErrorBoundaryState
> {
  state: WarrantyErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): WarrantyErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[WarrantyErrorBoundary]", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-900">
          <h2 className="text-xl font-black">Noget gik galt</h2>
          <p className="mt-2 text-sm">
            Der opstod en fejl ved indlæsning af garantiregistrering. Prøv igen.
          </p>
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

interface WarrantyAdminSidebarLayoutProps {
  scope: WarrantyLayoutScope;
  /** When true (Dealer User read-only), hides the "Ny registrering" item. */
  readOnly?: boolean;
  intro?: ReactNode;
  children: ReactNode;
}

export function WarrantyAdminSidebarLayout({
  scope,
  readOnly = false,
  intro,
  children,
}: WarrantyAdminSidebarLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { appUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();

  const nav =
    scope === "admin" ? ADMIN_NAV : readOnly ? DEALER_NAV_READONLY : DEALER_NAV;

  if (!appUser) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate("/portal", { replace: true });
        }}
      />

      <div className="mx-auto flex max-w-[1700px] gap-6 px-4 sm:px-6 lg:px-8 py-6">
        <aside className="hidden w-64 shrink-0 lg:block">
          <nav className="sticky top-[88px] space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = item.exact
                ? location.pathname === item.match
                : location.pathname === item.match || location.pathname.startsWith(item.match + "/");
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
          <WarrantyErrorBoundaryInner>{children}</WarrantyErrorBoundaryInner>
        </div>
      </div>

      <PortalFooter language={lang} />
    </div>
  );
}
