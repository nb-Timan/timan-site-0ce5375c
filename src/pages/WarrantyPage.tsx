/**
 * Warranty router page — picks Admin vs Dealer view variant by portal role
 * (mirrors the old Service Portal where Timan Admin and Dealer Admin had
 * different shells). The actual page (Dashboard / Registrations / New form)
 * is decided by the route used in App.tsx.
 */
import { Navigate } from "react-router-dom";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { t } from "@/lib/i18n/translations";
import { WarrantyAdminSidebarLayout } from "@/components/warranty/WarrantyAdminSidebarLayout";
import {
  WarrantyDashboardBody,
  WarrantyDashboardIntro,
} from "@/components/warranty/WarrantyDashboardBody";
import WarrantySharePointSyncPanel from "@/components/warranty/WarrantySharePointSyncPanel";
import { WarrantyDealerLinkBackfillPanel } from "@/components/warranty/WarrantyDealerLinkBackfillPanel";
import {
  WarrantyRegistrationsHeader,
  WarrantyRegistrationsTable,
} from "@/components/warranty/WarrantyRegistrationsTable";
import {
  WarrantyNewForm,
  WarrantyNewFormIntro,
} from "@/components/warranty/WarrantyNewForm";
import {
  derivePortalRole,
  getPortalPermissions,
  getWarrantyViewVariant,
} from "@/lib/portalAccess";

type Page = "dashboard" | "registrations" | "new" | "sync";

export default function WarrantyPage({ page }: { page: Page }) {
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

  const portalRole = derivePortalRole(appUser);
  const variant = getWarrantyViewVariant(portalRole);

  if (variant === "none") {
    return <Navigate to="/portal" replace />;
  }

  const perms = portalRole ? getPortalPermissions(portalRole) : null;
  const canCreate = !!perms?.canCreateWarranty;
  const readOnly = !perms?.canEditData;
  const dealerName = appUser.company_dealer ?? "";

  // /new is dealer-side only and never available to read-only users
  if (page === "new" && (variant !== "dealer" || !canCreate)) {
    return <Navigate to="/portal/service/warranty" replace />;
  }

  // /sync is admin-only (Timan Backend / Service / Sælger)
  if (page === "sync" && variant !== "admin") {
    return <Navigate to="/portal/service/warranty" replace />;
  }

  if (page === "dashboard") {
    return (
      <WarrantyAdminSidebarLayout
        scope={variant}
        readOnly={readOnly}
        intro={<WarrantyDashboardIntro scope={variant} showCreate={canCreate} />}
      >
        <WarrantyDashboardBody scope={variant} dealerName={dealerName} />
      </WarrantyAdminSidebarLayout>
    );
  }

  if (page === "sync") {
    return (
      <WarrantyAdminSidebarLayout
        scope="admin"
        readOnly={false}
        intro={
          <div>
            <h1 className="text-3xl font-black tracking-tight">Synkronisering</h1>
            <p className="mt-1 text-sm text-slate-500">
              SharePoint-synkronisering og match til forhandlere.
            </p>
          </div>
        }
      >
        <WarrantySharePointSyncPanel />
        <WarrantyDealerLinkBackfillPanel />
      </WarrantyAdminSidebarLayout>
    );
  }

  if (page === "registrations") {
    const title =
      variant === "admin" ? t('warrantyRegAdminTitle', uiLanguage) : t('warrantyRegDealerTitle', uiLanguage);
    const subtitle =
      variant === "admin"
        ? t('warrantyRegAdminSubtitle', uiLanguage)
        : t('warrantyRegDealerSubtitle', uiLanguage);
    return (
      <WarrantyAdminSidebarLayout
        scope={variant}
        readOnly={readOnly}
        intro={
          <WarrantyRegistrationsHeader
            scope={variant}
            title={title}
            subtitle={subtitle}
            showCreate={canCreate}
          />
        }
      >
        <WarrantyRegistrationsTable
          scope={variant}
          dealerName={dealerName}
          showCertificateActions={variant === "admin"}
        />
      </WarrantyAdminSidebarLayout>
    );
  }

  // page === "new"
  return (
    <WarrantyAdminSidebarLayout
      scope="dealer"
      readOnly={false}
      intro={<WarrantyNewFormIntro />}
    >
      <WarrantyNewForm defaultDealerName={dealerName} role={portalRole} />
    </WarrantyAdminSidebarLayout>
  );
}
