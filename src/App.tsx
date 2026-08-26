import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppUserProvider } from "@/context/AppUserContext";
import { LanguageProvider } from "@/context/LanguageContext";
import PortalPage from "./pages/PortalPage";
import PortalAreaPage from "./pages/PortalAreaPage";
import PortalCrmPage from "./pages/PortalCrmPage";
import CrmDashboardPage from "./pages/crm/CrmDashboardPage";

import CrmMyDealersPage from "./pages/crm/CrmMyDealersPage";
import CrmDealerDetailPage from "./pages/crm/CrmDealerDetailPage";
import CrmAccountDetailPage from "./pages/crm/CrmAccountDetailPage";
import CrmActivitiesPage from "./pages/crm/CrmActivitiesPage";
import CrmComingSoonPage from "./pages/crm/CrmComingSoonPage";
import CrmQuotesOrdersPage from "./pages/crm/CrmQuotesOrdersPage";
import CrmLeadsPage from "./pages/crm/CrmLeadsPage";
import CrmNewLeadPage from "./pages/crm/CrmNewLeadPage";
import CrmDemoLeadsPage from "./pages/crm/CrmDemoLeadsPage";
import CrmNewDemoLeadPage from "./pages/crm/CrmNewDemoLeadPage";
import CrmDemoLeadDetailPage from "./pages/crm/CrmDemoLeadDetailPage";
import CrmBudgetPage from "./pages/crm/CrmBudgetPage";
import CrmBudgetDashboardPage from "./pages/crm/CrmBudgetDashboardPage";
import CrmCalendarPage from "./pages/crm/CrmCalendarPage";
import ConfiguratorPage from "./pages/ConfiguratorPage";
import VideoGalleryPage from "./pages/VideoGalleryPage";
import VideoCategoryPage from "./pages/VideoCategoryPage";
import ResourcesPage from "./pages/ResourcesPage";
import DriftberegnerPage from "./pages/DriftberegnerPage";
import Co2CalculatorPage from "./pages/Co2CalculatorPage";
import Timan2620TrialPage from "./pages/Timan2620TrialPage";
import ContractsPage from "./pages/contracts/ContractsPage";
import ClaimsPage from "./pages/ClaimsPage";
import ClaimDetailPage from "./pages/ClaimDetailPage";
import NewClaimPage from "./pages/NewClaimPage";
import TsbDashboardPage from "./pages/tsb/TsbDashboardPage";
import TsbListPage from "./pages/tsb/TsbListPage";
import TsbDetailPage from "./pages/tsb/TsbDetailPage";
import NewTsbPage from "./pages/tsb/NewTsbPage";
import TsbDealersPage from "./pages/tsb/TsbDealersPage";
import TsbMachinesPage from "./pages/tsb/TsbMachinesPage";
import TsbUsersPage from "./pages/tsb/TsbUsersPage";
import TsbCountriesPage from "./pages/tsb/TsbCountriesPage";
import TsbSettingsPage from "./pages/tsb/TsbSettingsPage";
import TsbAccessGuard from "./components/tsb/TsbAccessGuard";
import WarrantyPage from "./pages/WarrantyPage";

import ServiceMaintenancePage from "./pages/ServiceMaintenancePage";
import ServiceRegistrationDetailPage from "./pages/service/ServiceRegistrationDetailPage";
import ServiceTicketsPage from "./pages/service/ServiceTicketsPage";
import ServiceTicketDetailPage from "./pages/service/ServiceTicketDetailPage";
import MachineSearchPage from "./pages/service/MachineSearchPage";
import MachineJournalPage from "./pages/service/MachineJournalPage";

import BackendUsersPage from "./pages/backend/BackendUsersPage";
import BackendRolesPage from "./pages/backend/BackendRolesPage";
import BackendModuleAccessPage from "./pages/backend/BackendModuleAccessPage";
import BackendAuditLogPage from "./pages/backend/BackendAuditLogPage";
import NotFound from "./pages/NotFound.tsx";
import UpdatePasswordPage from "./pages/UpdatePasswordPage";

import MiscPage from "./pages/misc/MiscPage";
import MiscFormsPage from "./pages/misc/MiscFormsPage";
import BudgetFeedbackFormPage from "./pages/misc/BudgetFeedbackFormPage";
import DealerInvoiceAcceptFormPage from "./pages/misc/DealerInvoiceAcceptFormPage";
import CompanyContactInfoFormPage from "./pages/misc/CompanyContactInfoFormPage";
import PartnerMapPage from "./pages/misc/PartnerMapPage";
import DealerDataPage from "./pages/portal/DealerDataPage";

import VisitorTracker from "./components/portal/VisitorTracker";
import { useEffect, useRef, useState } from "react";
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
import BackendPortalAnalyticsPage from "./pages/backend/BackendPortalAnalyticsPage";
import BackendPersistenceAuditPage from "./pages/backend/BackendPersistenceAuditPage";
import BackendDealerAccountsPage from "./pages/backend/BackendDealerAccountsPage";
import BackendDealerImportPage from "./pages/backend/BackendDealerImportPage";
import BackendBudgetImportPage from "./pages/backend/BackendBudgetImportPage";
import BackendSellersPage from "./pages/backend/BackendSellersPage";
import BackendPriceListsPage from "./pages/backend/BackendPriceListsPage";
import BackendDataIntegrationsPage from "./pages/backend/BackendDataIntegrationsPage";
import BackendChangelogPage from "./pages/backend/BackendChangelogPage";
import BackendPartnerRelationsPage from "./pages/backend/BackendPartnerRelationsPage";
import BackendMesseSettingsPage from "./pages/backend/BackendMesseSettingsPage";
import BackendNewsPage from "./pages/backend/BackendNewsPage";
import Backend2620TrialsPage from "./pages/backend/Backend2620TrialsPage";

import MesseHomePage from "./pages/messe/MesseHomePage";
import MesseVideoPage from "./pages/messe/MesseVideoPage";
import MesseNewsPage from "./pages/messe/MesseNewsPage";
import MesseTiman2620Page from "./pages/messe/MesseTiman2620Page";
import MesseFollowUpPage from "./pages/messe/MesseFollowUpPage";
import MesseMachineBrochurePage from "./pages/messe/MesseMachineBrochurePage";
import { MesseConfiguratorPage, MessePartnerMapPage } from "./pages/messe/MesseWrappers";
import { MesseRouteGuard, PortalLockGuard } from "./components/messe/MesseGuards";
import { DealerUserServiceGuard } from "./components/guards/DealerUserServiceGuard";

import { ensureAkrSeed } from "./lib/akrTestSeed";

// Seed AKR realistic test data once per browser (idempotent — versioned flag).
ensureAkrSeed();

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppUserProvider>
          <LanguageProvider>
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
              <Route path="/portal/backend" element={<PortalAreaPage areaId="timan_backend" />} />
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
              <Route path="/portal/crm/reports"    element={<CrmComingSoonPage titleKey="reports" />} />
              <Route path="/portal/videos" element={<VideoGalleryPage />} />
              <Route path="/portal/videos/:categoryId" element={<VideoCategoryPage />} />
              <Route path="/portal/resources" element={<ResourcesPage />} />
              <Route path="/portal/resources/driftberegner" element={<DriftberegnerPage />} />
              <Route path="/portal/resources/co2" element={<Co2CalculatorPage />} />
              <Route path="/portal/timan-2620-afproevning" element={<Timan2620TrialPage />} />
              <Route path="/portal/contracts" element={<ContractsPage />} />
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
              <Route path="/portal/backend/dealer-import" element={<BackendDealerImportPage />} />
              <Route path="/portal/backend/budget-import" element={<BackendBudgetImportPage />} />
              <Route path="/portal/backend/sellers" element={<BackendSellersPage />} />
              <Route path="/portal/backend/persistence-audit" element={<BackendPersistenceAuditPage />} />
              <Route path="/portal/backend/price-lists" element={<BackendPriceListsPage />} />
              <Route path="/portal/backend/data" element={<BackendDataIntegrationsPage />} />
              <Route path="/portal/backend/changelog" element={<BackendChangelogPage />} />
              <Route path="/portal/backend/news" element={<BackendNewsPage />} />
              <Route path="/portal/backend/partner-relations" element={<BackendPartnerRelationsPage />} />
              <Route path="/portal/backend/messe" element={<BackendMesseSettingsPage />} />
              <Route path="/portal/backend/timan-2620-afproevning" element={<Backend2620TrialsPage />} />

              {/* Existing configurator is preserved at /configurator */}
              <Route path="/configurator" element={<PortalLockGuard><ConfiguratorPage /></PortalLockGuard>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <VisitorTracker />
            <PreferredLanguageBootstrap />
          </LanguageProvider>
        </AppUserProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
