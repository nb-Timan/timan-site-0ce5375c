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
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppUserProvider>
          <Routes>
            {/* Portal is the new landing page after login */}
            <Route path="/" element={<Navigate to="/portal" replace />} />
            <Route path="/portal" element={<PortalPage />} />
            <Route path="/portal/videos" element={<VideoGalleryPage />} />
            <Route path="/portal/videos/:categoryId" element={<VideoCategoryPage />} />
            <Route path="/portal/resources" element={<ResourcesPage />} />
            <Route path="/portal/resources/driftberegner" element={<DriftberegnerPage />} />
            <Route path="/portal/resources/co2" element={<Co2CalculatorPage />} />
            {/* Existing configurator is preserved at /configurator */}
            <Route path="/configurator" element={<ConfiguratorPage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppUserProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
