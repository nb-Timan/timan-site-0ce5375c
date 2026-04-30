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
import CrmAccountsPage from "./pages/crm/CrmAccountsPage";
import CrmAccountDetailPage from "./pages/crm/CrmAccountDetailPage";
import CrmActivitiesPage from "./pages/crm/CrmActivitiesPage";
import CrmComingSoonPage from "./pages/crm/CrmComingSoonPage";
import CrmLeadsPage from "./pages/crm/CrmLeadsPage";
import CrmNewLeadPage from "./pages/crm/CrmNewLeadPage";
import CrmDemoLeadsPage from "./pages/crm/CrmDemoLeadsPage";
import CrmNewDemoLeadPage from "./pages/crm/CrmNewDemoLeadPage";
import CrmDemoLeadDetailPage from "./pages/crm/CrmDemoLeadDetailPage";
import CrmBudgetPage from "./pages/crm/CrmBudgetPage";
import ConfiguratorPage from "./pages/ConfiguratorPage";
import VideoGalleryPage from "./pages/VideoGalleryPage";
import VideoCategoryPage from "./pages/VideoCategoryPage";
import ResourcesPage from "./pages/ResourcesPage";
import DriftberegnerPage from "./pages/DriftberegnerPage";
import Co2CalculatorPage from "./pages/Co2CalculatorPage";
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
import ServiceInformationPage from "./pages/ServiceInformationPage";
import BackendUsersPage from "./pages/backend/BackendUsersPage";
import BackendRolesPage from "./pages/backend/BackendRolesPage";
import BackendModuleAccessPage from "./pages/backend/BackendModuleAccessPage";
import BackendAuditLogPage from "./pages/backend/BackendAuditLogPage";
import NotFound from "./pages/NotFound.tsx";
import PreviewRoleSwitcher from "./components/dev/PreviewRoleSwitcher";
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
              {/* Portal is the new landing page after login */}
              <Route path="/" element={<Navigate to="/portal" replace />} />
              <Route path="/portal" element={<PortalPage />} />
              <Route path="/portal/teknik-service" element={<PortalAreaPage areaId="teknik_service" />} />
              <Route path="/portal/salg-marketing" element={<PortalAreaPage areaId="salg_marketing" />} />
              <Route path="/portal/backend" element={<PortalAreaPage areaId="timan_backend" />} />
              <Route path="/portal/crm" element={<PortalCrmPage />} />
              <Route path="/portal/crm/dashboard"  element={<CrmDashboardPage />} />
              <Route path="/portal/crm/accounts"   element={<CrmAccountsPage />} />
              <Route path="/portal/crm/accounts/:id" element={<CrmAccountDetailPage />} />
              <Route path="/portal/crm/activities" element={<CrmActivitiesPage />} />
              <Route path="/portal/crm/leads"          element={<CrmLeadsPage />} />
              <Route path="/portal/crm/leads/new"      element={<CrmNewLeadPage />} />
              <Route path="/portal/crm/demo-leads"     element={<CrmDemoLeadsPage />} />
              <Route path="/portal/crm/demo-leads/new" element={<CrmNewDemoLeadPage />} />
              <Route path="/portal/crm/demo-leads/:id" element={<CrmDemoLeadDetailPage />} />
              <Route path="/portal/crm/budget"     element={<CrmBudgetPage />} />
              <Route path="/portal/crm/quotes"     element={<CrmComingSoonPage titleKey="quotes" />} />
              <Route path="/portal/crm/orders"     element={<CrmComingSoonPage titleKey="orders" />} />
              <Route path="/portal/crm/reports"    element={<CrmComingSoonPage titleKey="reports" />} />
              <Route path="/portal/videos" element={<VideoGalleryPage />} />
              <Route path="/portal/videos/:categoryId" element={<VideoCategoryPage />} />
              <Route path="/portal/resources" element={<ResourcesPage />} />
              <Route path="/portal/resources/driftberegner" element={<DriftberegnerPage />} />
              <Route path="/portal/resources/co2" element={<Co2CalculatorPage />} />
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
              {/* Serviceinformation */}
              <Route path="/portal/service/information" element={<ServiceInformationPage />} />
              {/* Timan Backend → Users / Roles / Module access / Audit log */}
              <Route path="/portal/backend/users" element={<BackendUsersPage />} />
              <Route path="/portal/backend/roles" element={<BackendRolesPage />} />
              <Route path="/portal/backend/module-access" element={<BackendModuleAccessPage />} />
              <Route path="/portal/backend/audit-log" element={<BackendAuditLogPage />} />
              {/* Existing configurator is preserved at /configurator */}
              <Route path="/configurator" element={<ConfiguratorPage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <PreviewRoleSwitcher />
          </LanguageProvider>
        </AppUserProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
