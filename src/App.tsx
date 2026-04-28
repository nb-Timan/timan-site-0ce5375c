import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppUserProvider } from "@/context/AppUserContext";
import { LanguageProvider } from "@/context/LanguageContext";
import PortalPage from "./pages/PortalPage";
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
import TsbAccessGuard from "./components/tsb/TsbAccessGuard";
import WarrantyPage from "./pages/WarrantyPage";
import ServiceInformationPage from "./pages/ServiceInformationPage";
import NotFound from "./pages/NotFound.tsx";
import PreviewRoleSwitcher from "./components/dev/PreviewRoleSwitcher";

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
              <Route path="/portal/service/tsb/new" element={<TsbAccessGuard><NewTsbPage /></TsbAccessGuard>} />
              <Route path="/portal/service/tsb/:id" element={<TsbAccessGuard><TsbDetailPage /></TsbAccessGuard>} />
              {/* Garantiregistrering — admin/dealer split by role inside WarrantyPage */}
              <Route path="/portal/service/warranty" element={<WarrantyPage page="dashboard" />} />
              <Route path="/portal/service/warranty/registrations" element={<WarrantyPage page="registrations" />} />
              <Route path="/portal/service/warranty/new" element={<WarrantyPage page="new" />} />
              {/* Serviceinformation */}
              <Route path="/portal/service/information" element={<ServiceInformationPage />} />
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
