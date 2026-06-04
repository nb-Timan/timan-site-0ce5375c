/**
 * Warranty router page — picks Admin vs Dealer view variant by portal role
 * (mirrors the old Service Portal where Timan Admin and Dealer Admin had
 * different shells). The actual page (Dashboard / Registrations / New form)
 * is decided by the route used in App.tsx.
 */
import { Navigate } from "react-router-dom";
import { useAppUser } from "@/context/AppUserContext";
import { WarrantyAdminSidebarLayout } from "@/components/warranty/WarrantyAdminSidebarLayout";
import {
  WarrantyDashboardBody,
  WarrantyDashboardIntro,
} from "@/components/warranty/WarrantyDashboardBody";
import WarrantySharePointSyncPanel from "@/components/warranty/WarrantySharePointSyncPanel";
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

type Page = "dashboard" | "registrations" | "new";

export default function WarrantyPage({ page }: { page: Page }) {
  const { appUser, loading } = useAppUser();

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

  if (page === "dashboard") {
    return (
      <WarrantyAdminSidebarLayout
        scope={variant}
        readOnly={readOnly}
        intro={<WarrantyDashboardIntro scope={variant} showCreate={canCreate} />}
      >
        {variant === "admin" && <WarrantySharePointSyncPanel />}
        <WarrantyDashboardBody scope={variant} dealerName={dealerName} />
      </WarrantyAdminSidebarLayout>
    );
  }

  if (page === "registrations") {
    const title =
      variant === "admin" ? "Registrerede garantibeviser" : "Mine registreringer";
    const subtitle =
      variant === "admin"
        ? "Alle udstedte garantibeviser fra alle forhandlere. Klik på en række for at se eller downloade."
        : "Søg og filtrér i dine garantiregistreringer.";
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
      <WarrantyNewForm defaultDealerName={dealerName} />
    </WarrantyAdminSidebarLayout>
  );
}
