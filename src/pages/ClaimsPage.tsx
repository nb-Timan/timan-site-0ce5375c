/**
 * Service / Claims — role router.
 *
 * Routes the same URLs to different page bodies based on Timan Portal role:
 *   - Internal roles (Timan Backend / Service / Sælger) → admin views
 *   - Dealer roles (Importør / Forhandler / Service Partner) → dealer views
 *   - Dealer User → dealer views, fully read-only
 *
 * URL conventions:
 *   /portal/service/claims              → dashboard
 *   /portal/service/claims?tab=all      → admin "Alle claims"
 *   /portal/service/claims?tab=mine     → dealer "Mine claims"
 *   /portal/service/claims/new          → new claim (dealer-side only)
 *   /portal/service/claims/:claimId     → claim detail (handled by ClaimDetailPage)
 */

import { Navigate, useLocation } from "react-router-dom";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { t } from "@/lib/i18n/translations";
import {
  derivePortalRole,
  getUserModuleAccessOverride,
  getPortalPermissions,
  hasModuleAccess,
  getClaimsViewVariant,
} from "@/lib/portalAccess";
import AdminClaimsDashboardPage from "@/pages/claims/AdminClaimsDashboardPage";
import AdminClaimsAllPage from "@/pages/claims/AdminClaimsAllPage";
import DealerClaimsDashboardPage from "@/pages/claims/DealerClaimsDashboardPage";
import DealerClaimsMinePage from "@/pages/claims/DealerClaimsMinePage";

export default function ClaimsPage() {
  const { appUser, loading } = useAppUser();
  const location = useLocation();
  const { uiLanguage } = useLanguage();


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">…</div>
      </div>
    );
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  // Legacy `role='slutkunde'` may coexist with a real portal_role (e.g. timan_dealer).
  // Only redirect true end-customers with no portal role to the configurator —
  // otherwise dealer-side users get bounced out of Claims.
  {
    const portalRole = (appUser as { portal_role?: string | null }).portal_role ?? null;
    if (appUser.role === "slutkunde" && !portalRole) {
      return <Navigate to="/configurator" replace />;
    }
  }

  const role = derivePortalRole(appUser);
  const allowed = hasModuleAccess(
    role,
    "claims",
    getUserModuleAccessOverride(appUser),
  );
  const variant = getClaimsViewVariant(role);
  const perms = role ? getPortalPermissions(role) : null;
  const isReadOnly = !perms?.canEditData;

  if (!allowed || variant === "none") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-black">{t('noAccessTitle', uiLanguage)}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {t('noAccessClaims', uiLanguage)}
          </p>
        </div>
      </div>
    );
  }

  const tab = new URLSearchParams(location.search).get("tab");

  if (variant === "internal") {
    if (tab === "all") return <AdminClaimsAllPage />;
    return <AdminClaimsDashboardPage />;
  }

  // Dealer-side
  const dealerName = appUser.company_dealer || appUser.display_name || appUser.email;
  if (tab === "mine") {
    return <DealerClaimsMinePage readOnly={isReadOnly} dealerName={dealerName} />;
  }
  return <DealerClaimsDashboardPage readOnly={isReadOnly} dealerName={dealerName} />;
}
