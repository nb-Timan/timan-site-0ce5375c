import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppUserProvider } from "@/context/AppUserContext";
import { LanguageProvider } from "@/context/LanguageContext";
import TsbAccessGuard from "./components/tsb/TsbAccessGuard";
import VisitorTracker from "./components/portal/VisitorTracker";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { getActiveSellerView, type SellerView } from "@/lib/activeMode";
import { supabase } from "@/lib/supabase";

function PreferredLanguageBootstrap() {
  const { appUser } = useAppUser();
  const { applyPreferredLanguage, resetLanguageForIdentity } = useLanguage();
  const [activeSellerView, setActiveSellerView] = useState<SellerView | null>(() => getActiveSellerView(appUser?.email));
  const [sellerPreferredLanguage, setSellerPreferredLanguage] = useState<string | null | undefined>(null);
  const lastIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    const refreshActiveSeller = () => setActiveSellerView(getActiveSellerView(appUser?.email));
    refreshActiveSeller();
    window.addEventListener('timan:active-mode-changed', refreshActiveSeller);
    window.addEventListener('storage', refreshActiveSeller);
    return () => {
      window.removeEventListener('timan:active-mode-changed', refreshActiveSeller);
      window.removeEventListener('storage', refreshActiveSeller);
    };
  }, [appUser?.email]);

  useEffect(() => {
    let cancelled = false;
    if (!activeSellerView?.email) {
      setSellerPreferredLanguage(null);
      return;
    }

    setSellerPreferredLanguage(undefined);
    supabase
      .from('app_users')
      .select('preferred_language')
      .eq('email', activeSellerView.email.toLowerCase())
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.warn('Could not load seller preferred language', error);
        setSellerPreferredLanguage((data?.preferred_language as string | null | undefined) ?? null);
      });

    return () => { cancelled = true; };
  }, [activeSellerView?.email]);

  useEffect(() => {
    if (!appUser?.email) {
      if (lastIdentityRef.current !== 'anonymous') {
        lastIdentityRef.current = 'anonymous';
        resetLanguageForIdentity(null);
      }
      return;
    }

    if (activeSellerView?.email && sellerPreferredLanguage === undefined) return;

    const identityKey = activeSellerView?.email
      ? `seller:${activeSellerView.key}:${activeSellerView.email.toLowerCase()}`
      : `user:${appUser.email.toLowerCase()}`;
    const preferredLanguage = activeSellerView?.email ? sellerPreferredLanguage : appUser.preferred_language;

    if (lastIdentityRef.current !== identityKey) {
      lastIdentityRef.current = identityKey;
      resetLanguageForIdentity(preferredLanguage);
      return;
    }

    applyPreferredLanguage(preferredLanguage);
  }, [
    appUser?.email,
    appUser?.preferred_language,
    activeSellerView?.key,
    activeSellerView?.email,
    sellerPreferredLanguage,
    resetLanguageForIdentity,
    applyPreferredLanguage,
  ]);
  return null;
}
import { MesseRouteGuard, PortalLockGuard } from "./components/messe/MesseGuards";
import { DealerUserServiceGuard } from "./components/guards/DealerUserServiceGuard";

import { ensureAkrSeed } from "./lib/akrTestSeed";

// Seed AKR realistic test data once per browser (idempotent — versioned flag).
ensureAkrSeed();

const queryClient = new QueryClient();

const PortalPage = lazy(() => import("./pages/PortalPage"));
const PortalAreaPage = lazy(() => import("./pages/PortalAreaPage"));
const PortalCrmPage = lazy(() => import("./pages/PortalCrmPage"));
const DealerDataPage = lazy(() => import("./pages/portal/DealerDataPage"));
const UpdatePasswordPage = lazy(() => import("./pages/UpdatePasswordPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const CrmDashboardPage = lazy(() => import("./pages/crm/CrmDashboardPage"));
const CrmMyDealersPage = lazy(() => import("./pages/crm/CrmMyDealersPage"));
const CrmDealerDetailPage = lazy(() => import("./pages/crm/CrmDealerDetailPage"));
const CrmAccountDetailPage = lazy(() => import("./pages/crm/CrmAccountDetailPage"));
const CrmActivitiesPage = lazy(() => import("./pages/crm/CrmActivitiesPage"));
const CrmQuotesOrdersPage = lazy(() => import("./pages/crm/CrmQuotesOrdersPage"));
const CrmLeadsPage = lazy(() => import("./pages/crm/CrmLeadsPage"));
const CrmLegacyLeadsImportPreviewPage = lazy(() => import("./pages/crm/CrmLegacyLeadsImportPreviewPage"));
const CrmLegacyLeadImportPreviewDetailPage = lazy(() => import("./pages/crm/CrmLegacyLeadImportPreviewDetailPage"));
const CrmNewLeadPage = lazy(() => import("./pages/crm/CrmNewLeadPage"));
const CrmDemoLeadsPage = lazy(() => import("./pages/crm/CrmDemoLeadsPage"));
const CrmNewDemoLeadPage = lazy(() => import("./pages/crm/CrmNewDemoLeadPage"));
const CrmDemoLeadDetailPage = lazy(() => import("./pages/crm/CrmDemoLeadDetailPage"));
const CrmBudgetPage = lazy(() => import("./pages/crm/CrmBudgetPage"));
const CrmBudgetDashboardPage = lazy(() => import("./pages/crm/CrmBudgetDashboardPage"));
const CrmCalendarPage = lazy(() => import("./pages/crm/CrmCalendarPage"));

const ConfiguratorPage = lazy(() => import("./pages/ConfiguratorPage"));
const VideoGalleryPage = lazy(() => import("./pages/VideoGalleryPage"));
const VideoCategoryPage = lazy(() => import("./pages/VideoCategoryPage"));
const ResourcesPage = lazy(() => import("./pages/ResourcesPage"));
const DriftberegnerPage = lazy(() => import("./pages/DriftberegnerPage"));
const Co2CalculatorPage = lazy(() => import("./pages/Co2CalculatorPage"));
const Timan2620TrialPage = lazy(() => import("./pages/Timan2620TrialPage"));
const ContractsPage = lazy(() => import("./pages/contracts/ContractsPage"));

const ClaimsPage = lazy(() => import("./pages/ClaimsPage"));
const ClaimDetailPage = lazy(() => import("./pages/ClaimDetailPage"));
const NewClaimPage = lazy(() => import("./pages/NewClaimPage"));
const WarrantyPage = lazy(() => import("./pages/WarrantyPage"));
const ServiceMaintenancePage = lazy(() => import("./pages/ServiceMaintenancePage"));
const ServiceRegistrationDetailPage = lazy(() => import("./pages/service/ServiceRegistrationDetailPage"));
const ServiceTicketsPage = lazy(() => import("./pages/service/ServiceTicketsPage"));
const ServiceTicketDetailPage = lazy(() => import("./pages/service/ServiceTicketDetailPage"));
const MachineSearchPage = lazy(() => import("./pages/service/MachineSearchPage"));
const MachineJournalPage = lazy(() => import("./pages/service/MachineJournalPage"));
const TsbDashboardPage = lazy(() => import("./pages/tsb/TsbDashboardPage"));
const TsbListPage = lazy(() => import("./pages/tsb/TsbListPage"));
const TsbDetailPage = lazy(() => import("./pages/tsb/TsbDetailPage"));
const NewTsbPage = lazy(() => import("./pages/tsb/NewTsbPage"));
const TsbDealersPage = lazy(() => import("./pages/tsb/TsbDealersPage"));
const TsbMachinesPage = lazy(() => import("./pages/tsb/TsbMachinesPage"));
const TsbUsersPage = lazy(() => import("./pages/tsb/TsbUsersPage"));
const TsbCountriesPage = lazy(() => import("./pages/tsb/TsbCountriesPage"));
const TsbSettingsPage = lazy(() => import("./pages/tsb/TsbSettingsPage"));

const BackendUsersPage = lazy(() => import("./pages/backend/BackendUsersPage"));
const BackendRolesPage = lazy(() => import("./pages/backend/BackendRolesPage"));
const BackendModuleAccessPage = lazy(() => import("./pages/backend/BackendModuleAccessPage"));
const BackendAuditLogPage = lazy(() => import("./pages/backend/BackendAuditLogPage"));
const BackendPortalAnalyticsPage = lazy(() => import("./pages/backend/BackendPortalAnalyticsPage"));
const BackendPersistenceAuditPage = lazy(() => import("./pages/backend/BackendPersistenceAuditPage"));
const BackendDealerAccountsPage = lazy(() => import("./pages/backend/BackendDealerAccountsPage"));
const BackendContractApprovalsPage = lazy(() => import("./pages/backend/BackendContractApprovalsPage"));
const BackendDealerImportPage = lazy(() => import("./pages/backend/BackendDealerImportPage"));
const BackendBudgetImportPage = lazy(() => import("./pages/backend/BackendBudgetImportPage"));
const BackendSellersPage = lazy(() => import("./pages/backend/BackendSellersPage"));
const BackendPriceListsPage = lazy(() => import("./pages/backend/BackendPriceListsPage"));
const BackendDataIntegrationsPage = lazy(() => import("./pages/backend/BackendDataIntegrationsPage"));
const BackendGeocodingPage = lazy(() => import("./pages/backend/BackendGeocodingPage"));
const BackendChangelogPage = lazy(() => import("./pages/backend/BackendChangelogPage"));
const BackendPartnerRelationsPage = lazy(() => import("./pages/backend/BackendPartnerRelationsPage"));
const BackendMesseSettingsPage = lazy(() => import("./pages/backend/BackendMesseSettingsPage"));
const BackendNewsPage = lazy(() => import("./pages/backend/BackendNewsPage"));
const Backend2620TrialsPage = lazy(() => import("./pages/backend/Backend2620TrialsPage"));
const BackendSystemMapPage = lazy(() => import("./pages/backend/BackendSystemMapPage"));
const BackendSectionPage = lazy(() => import("./pages/backend/BackendSectionPage"));

const MiscPage = lazy(() => import("./pages/misc/MiscPage"));
const MiscFormsPage = lazy(() => import("./pages/misc/MiscFormsPage"));
const BudgetFeedbackFormPage = lazy(() => import("./pages/misc/BudgetFeedbackFormPage"));
const DealerInvoiceAcceptFormPage = lazy(() => import("./pages/misc/DealerInvoiceAcceptFormPage"));
const CompanyContactInfoFormPage = lazy(() => import("./pages/misc/CompanyContactInfoFormPage"));
const PartnerMapPage = lazy(() => import("./pages/misc/PartnerMapPage"));

const MesseHomePage = lazy(() => import("./pages/messe/MesseHomePage"));
const MesseVideoPage = lazy(() => import("./pages/messe/MesseVideoPage"));
const MesseNewsPage = lazy(() => import("./pages/messe/MesseNewsPage"));
const MesseTiman2620Page = lazy(() => import("./pages/messe/MesseTiman2620Page"));
const MesseFollowUpPage = lazy(() => import("./pages/messe/MesseFollowUpPage"));
const MesseMachineBrochurePage = lazy(() => import("./pages/messe/MesseMachineBrochurePage"));
const MesseConfiguratorPage = lazy(() =>
  import("./pages/messe/MesseWrappers").then((module) => ({ default: module.MesseConfiguratorPage }))
);
const MessePartnerMapPage = lazy(() =>
  import("./pages/messe/MesseWrappers").then((module) => ({ default: module.MessePartnerMapPage }))
);

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
      Henter...
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppUserProvider>
          <LanguageProvider>
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public Timan Messe / exhibition routes (no auth required) */}
              <Route path="/messe" element={<MesseRouteGuard><MesseHomePage /></MesseRouteGuard>} />
              <Route path="/messe/konfigurator" element={<MesseRouteGuard><MesseConfiguratorPage /></MesseRouteGuard>} />
              <Route path="/messe/partner-map" element={<MesseRouteGuard><MessePartnerMapPage /></MesseRouteGuard>} />
              <Route path="/messe/video" element={<MesseRouteGuard><MesseVideoPage /></MesseRouteGuard>} />
              <Route path="/messe/nyt" element={<MesseRouteGuard><MesseNewsPage /></MesseRouteGuard>} />
              <Route path="/messe/follow-up" element={<MesseRouteGuard blockDealerUser><MesseFollowUpPage /></MesseRouteGuard>} />
              <Route path="/messe/rc-751" element={<MesseRouteGuard><MesseMachineBrochurePage machineKey="rc-751" title="Timan RC-751" pdfSrc="/brochures/rc-751-da.pdf" pageBase="/brochures/pages/rc-751" pageCount={13} /></MesseRouteGuard>} />
              <Route path="/messe/rc-1000s" element={<MesseRouteGuard><MesseMachineBrochurePage machineKey="rc-1000s" title="Timan RC-1000s" pdfSrc="/brochures/rc-1000s-da.pdf" pageBase="/brochures/pages/rc-1000s" pageCount={13} /></MesseRouteGuard>} />
              <Route path="/messe/timan-2620" element={<MesseRouteGuard><MesseMachineBrochurePage machineKey="timan-2620" title="Timan 2620" pdfSrc="/brochures/timan-2620-da.pdf" pageBase="/brochures/pages/timan-2620" pageCount={4} /></MesseRouteGuard>} />
              <Route path="/messe/timan-2620/360" element={<MesseRouteGuard><MesseTiman2620Page backTo="/messe/timan-2620" /></MesseRouteGuard>} />
              <Route path="/messe/timan-3330" element={<MesseRouteGuard><MesseMachineBrochurePage machineKey="timan-3330" title="Timan 3330" pdfSrc="/brochures/timan-3330-da.pdf" pageBase="/brochures/pages/timan-3330" pageCount={17} /></MesseRouteGuard>} />
              <Route path="/messe/resources/driftberegner" element={<MesseRouteGuard><DriftberegnerPage /></MesseRouteGuard>} />
              <Route path="/messe/resources/co2" element={<MesseRouteGuard><Co2CalculatorPage /></MesseRouteGuard>} />
              <Route path="/messe/timan-2620-afproevning" element={<MesseRouteGuard blockDealerUser><Timan2620TrialPage variant="messe" /></MesseRouteGuard>} />


              {/* Portal is the new landing page after login */}
              <Route path="/" element={<PortalLockGuard><Navigate to="/portal" replace /></PortalLockGuard>} />
              <Route path="/update-password" element={<UpdatePasswordPage />} />
              <Route path="/reset-password" element={<UpdatePasswordPage />} />
              <Route path="/portal" element={<PortalLockGuard><PortalPage /></PortalLockGuard>} />
              <Route path="/portal/teknik-service" element={<DealerUserServiceGuard><PortalAreaPage areaId="teknik_service" /></DealerUserServiceGuard>} />
              <Route path="/portal/salg-marketing" element={<PortalAreaPage areaId="salg_marketing" />} />
              <Route path="/portal/marketing" element={<PortalAreaPage areaId="marketing" />} />
              <Route path="/portal/marketing/news" element={<MesseNewsPage mode="marketing" />} />
              <Route path="/portal/marketing/news/overview" element={<BackendNewsPage />} />
              <Route path="/portal/marketing/site-features" element={<BackendChangelogPage />} />
              <Route path="/portal/backend" element={<PortalAreaPage areaId="timan_backend" />} />
              <Route path="/portal/backend/brugerstyring" element={<BackendSectionPage sectionId="user-management" />} />
              <Route path="/portal/backend/partnerstyring" element={<BackendSectionPage sectionId="partner-management" />} />
              <Route path="/portal/backend/data-integrationer" element={<BackendSectionPage sectionId="data-integrations" />} />
              <Route path="/portal/backend/analyse" element={<BackendSectionPage sectionId="analytics" />} />
              <Route path="/portal/backend/system" element={<BackendSectionPage sectionId="system" />} />
              <Route path="/portal/dealer-data" element={<DealerDataPage />} />
              <Route path="/portal/crm" element={<PortalCrmPage />} />
              <Route path="/portal/crm/dashboard"  element={<CrmDashboardPage />} />
              <Route path="/portal/crm/accounts"   element={<Navigate to="/portal/crm/my-dealers" replace />} />
              <Route path="/portal/crm/konti"      element={<Navigate to="/portal/crm/my-dealers" replace />} />
              <Route path="/portal/crm/my-dealers" element={<CrmMyDealersPage />} />
              <Route path="/portal/crm/my-dealers/:accountNumber" element={<CrmDealerDetailPage />} />
              <Route path="/portal/crm/accounts/:id" element={<CrmAccountDetailPage />} />
              <Route path="/portal/crm/activities" element={<CrmActivitiesPage />} />
              <Route path="/portal/crm/leads"          element={<CrmLeadsPage />} />
              <Route path="/portal/crm/leads/import-preview" element={<CrmLegacyLeadsImportPreviewPage />} />
              <Route path="/portal/crm/leads/import-preview/:legacyId" element={<CrmLegacyLeadImportPreviewDetailPage />} />
             <Route path="/portal/crm/leads/new"      element={<CrmNewLeadPage />} />
             <Route path="/portal/crm/leads/:id"      element={<CrmNewLeadPage />} />
              <Route path="/portal/crm/demo-leads"     element={<CrmDemoLeadsPage />} />
              <Route path="/portal/crm/demo-leads/new" element={<CrmNewDemoLeadPage />} />
              <Route path="/portal/crm/demo-leads/:id" element={<CrmDemoLeadDetailPage />} />
              <Route path="/portal/crm/budget"     element={<CrmBudgetPage />} />
              <Route path="/portal/crm/budget-dashboard" element={<CrmBudgetDashboardPage />} />
              <Route path="/portal/crm/calendar"   element={<CrmCalendarPage />} />
              <Route path="/portal/crm/quotes"     element={<CrmQuotesOrdersPage mode="quote" />} />
              <Route path="/portal/crm/orders"     element={<CrmQuotesOrdersPage mode="order" />} />
              <Route path="/portal/crm/reports"    element={<Navigate to="/portal/crm/dashboard" replace />} />
              <Route path="/portal/videos" element={<VideoGalleryPage />} />
              <Route path="/portal/videos/:categoryId" element={<VideoCategoryPage />} />
              <Route path="/portal/resources" element={<ResourcesPage />} />
              <Route path="/portal/resources/driftberegner" element={<DriftberegnerPage />} />
              <Route path="/portal/resources/co2" element={<Co2CalculatorPage />} />
              <Route path="/portal/timan-2620-afproevning" element={<Timan2620TrialPage />} />
              <Route path="/portal/contracts" element={<ContractsPage />} />
              <Route path="/portal/contracts/:contractId" element={<ContractsPage />} />
              <Route path="/portal/timan-2620" element={<MesseTiman2620Page backTo="/portal" />} />
              {/* Salg & Marketing > Diverse > Formularer */}
              <Route path="/portal/misc" element={<MiscPage />} />
              <Route path="/portal/misc/forms" element={<MiscFormsPage />} />
              <Route path="/portal/misc/forms/budget-feedback" element={<BudgetFeedbackFormPage />} />
              <Route path="/portal/misc/forms/dealer-invoice-accept" element={<DealerInvoiceAcceptFormPage />} />
              <Route path="/portal/misc/forms/company-contact-info" element={<CompanyContactInfoFormPage />} />
              <Route path="/portal/misc/partner-map" element={<PartnerMapPage />} />
              <Route element={<DealerUserServiceGuard />}>
                <Route path="/portal/service/claims" element={<ClaimsPage />} />
                <Route path="/portal/service/claims/new" element={<NewClaimPage />} />
                <Route path="/portal/service/claims/:claimId" element={<ClaimDetailPage />} />
                {/* TSB Portal — internal-only (Timan Backend / Service / Sælger) */}
                <Route path="/portal/service/tsb" element={<TsbAccessGuard><TsbListPage /></TsbAccessGuard>} />
                <Route path="/portal/service/tsb/dashboard" element={<TsbAccessGuard><TsbDashboardPage /></TsbAccessGuard>} />
                <Route path="/portal/service/tsb/new" element={<TsbAccessGuard requireCreate><NewTsbPage /></TsbAccessGuard>} />
                <Route path="/portal/service/tsb/dealers" element={<TsbAccessGuard><TsbDealersPage /></TsbAccessGuard>} />
                <Route path="/portal/service/tsb/machines" element={<TsbAccessGuard><TsbMachinesPage /></TsbAccessGuard>} />
                <Route path="/portal/service/tsb/users" element={<TsbAccessGuard><TsbUsersPage /></TsbAccessGuard>} />
                <Route path="/portal/service/tsb/countries" element={<TsbAccessGuard><TsbCountriesPage /></TsbAccessGuard>} />
                <Route path="/portal/service/tsb/settings" element={<TsbAccessGuard><TsbSettingsPage /></TsbAccessGuard>} />
                <Route path="/portal/service/tsb/:id" element={<TsbAccessGuard><TsbDetailPage /></TsbAccessGuard>} />
                {/* Garantiregistrering — admin/dealer split by role inside WarrantyPage */}
                <Route path="/portal/service/warranty" element={<WarrantyPage page="dashboard" />} />
                <Route path="/portal/service/warranty/registrations" element={<WarrantyPage page="registrations" />} />
                <Route path="/portal/service/warranty/new" element={<WarrantyPage page="new" />} />
                <Route path="/portal/service/warranty/sync" element={<WarrantyPage page="sync" />} />
                <Route path="/portal/service/maintenance" element={<ServiceMaintenancePage />} />
                <Route path="/portal/service/maintenance/registrations/:registrationId" element={<ServiceRegistrationDetailPage />} />
                <Route path="/portal/service/tickets" element={<ServiceTicketsPage />} />
                <Route path="/portal/service/tickets/:ticketId" element={<ServiceTicketDetailPage />} />
                <Route path="/portal/service/machines" element={<MachineSearchPage />} />
                <Route path="/portal/service/machines/:serialNumber" element={<MachineJournalPage />} />
              </Route>

              {/* Timan Backend → Users / Roles / Module access / Audit log */}
              <Route path="/portal/backend/users" element={<BackendUsersPage />} />
              <Route path="/portal/backend/roles" element={<BackendRolesPage />} />
              <Route path="/portal/backend/module-access" element={<BackendModuleAccessPage />} />
              <Route path="/portal/backend/audit-log" element={<BackendAuditLogPage />} />
              <Route path="/portal/backend/portal-analytics" element={<BackendPortalAnalyticsPage />} />
              <Route path="/portal/backend/dealer-accounts" element={<BackendDealerAccountsPage />} />
              <Route path="/portal/backend/contracts" element={<BackendContractApprovalsPage />} />
              <Route path="/portal/backend/dealer-import" element={<BackendDealerImportPage />} />
              <Route path="/portal/backend/budget-import" element={<BackendBudgetImportPage />} />
              <Route path="/portal/backend/sellers" element={<BackendSellersPage />} />
              <Route path="/portal/backend/persistence-audit" element={<BackendPersistenceAuditPage />} />
              <Route path="/portal/backend/price-lists" element={<BackendPriceListsPage />} />
              <Route path="/portal/backend/data" element={<BackendDataIntegrationsPage />} />
              <Route path="/portal/backend/geocoding" element={<BackendGeocodingPage />} />
              <Route path="/portal/backend/changelog" element={<BackendChangelogPage />} />
              <Route path="/portal/backend/news" element={<BackendNewsPage />} />
              <Route path="/portal/backend/partner-relations" element={<BackendPartnerRelationsPage />} />
              <Route path="/portal/backend/messe" element={<BackendMesseSettingsPage />} />
              <Route path="/portal/backend/timan-2620-afproevning" element={<Backend2620TrialsPage />} />
              <Route path="/portal/backend/system-map" element={<BackendSystemMapPage />} />

              {/* Existing configurator is preserved at /configurator */}
              <Route path="/configurator" element={<PortalLockGuard><ConfiguratorPage /></PortalLockGuard>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            <VisitorTracker />
            <PreferredLanguageBootstrap />
          </LanguageProvider>
        </AppUserProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
