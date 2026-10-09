import { Link, useLocation } from "react-router-dom";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { backendDashboardNav, backendSections, getBackendSectionForPath } from "@/lib/backendNavigation";
import { getSupportAdminCopy } from "@/lib/i18n/supportAdminTranslations";
import { canAccessSupport } from "@/lib/supportAccess";
import { cn } from "@/lib/utils";
import { useEffectivePortalUserState } from "@/lib/viewAsUser";

export default function BackendSideNav() {
  const { appUser } = useAppUser();
  const { uiLanguage } = useLanguage();
  const { effectiveUser } = useEffectivePortalUserState(appUser);
  const location = useLocation();
  const active = getBackendSectionForPath(location.pathname, location.search);
  const supportCopy = getSupportAdminCopy(uiLanguage);
  const items = [backendDashboardNav, ...backendSections].filter((item) =>
    item.id !== "ai-support" || canAccessSupport(effectiveUser)
  );

  return (
    <aside
      data-backend-nav
      className="fixed left-4 top-24 z-30 hidden w-60 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:block"
      aria-label="Timan Backend navigation"
    >
      <div className="px-3 pb-3 pt-2">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Timan Backend</p>
      </div>
      <nav className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <Link
              key={item.id}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition",
                isActive
                  ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.id === "ai-support" ? supportCopy.title : item.navLabel}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
