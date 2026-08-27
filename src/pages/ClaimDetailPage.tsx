/**
 * Service / Claims — claim detail role router.
 *
 * Routes /portal/service/claims/:claimId to the imported old admin or dealer
 * detail layout based on Timan Portal role:
 *   - Internal roles (Timan Backend / Service / Sælger) → admin scope
 *   - Dealer roles (Importør / Forhandler / Service Partner) → dealer scope
 *   - Dealer User → dealer scope, fully read-only
 *
 * This file used to render a custom legacy layout that read from a different
 * data source (claimsService) than the Claims list (claims-store), which made
 * every visible claim appear as "Sag ikke fundet". We now delegate 1:1 to the
 * imported old detail page that uses the same claims-store as the list.
 */

import { Navigate } from "react-router-dom";
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
import ImportedClaimDetailPage from "@/pages/claims/ClaimDetailPage";

export default function ClaimDetailPage() {
  const { appUser, loading } = useAppUser();
  const { uiLanguage } = useLanguage();


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">…</div>
      </div>
    );
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === "slutkunde") return <Navigate to="/configurator" replace />;

  const role = derivePortalRole(appUser);
  const allowed = hasModuleAccess(
    role,
    "claims",
    getUserModuleAccessOverride(appUser),
  );
  const variant = getClaimsViewVariant(role);

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

  const perms = role ? getPortalPermissions(role) : null;
  const isReadOnly = !perms?.canEditData;

  // Internal roles → old Timan Admin claim detail (1:1)
  // Dealer roles → old Dealer claim detail (1:1); Dealer User forces read-only
  const scope = variant === "internal" ? "admin" : "dealer";
  return <ImportedClaimDetailPage scope={scope} readOnly={scope === "dealer" && isReadOnly} />;
}
