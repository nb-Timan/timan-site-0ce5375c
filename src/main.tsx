import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import PortalStartupBoundary from "./components/PortalStartupBoundary.tsx";
import {
  getPortalStartupDiagnostics,
  markPortalStartup,
  PORTAL_BUILD_ID,
} from "./lib/portalStartupDiagnostics.ts";
import "./index.css";

markPortalStartup('app_start');
window.__TIMAN_BUILD_ID__ = PORTAL_BUILD_ID;
window.__TIMAN_STARTUP_DIAGNOSTICS__ = getPortalStartupDiagnostics;
window.__TIMAN_ENTRY_READY__?.();

const buildMeta = document.createElement('meta');
buildMeta.name = 'timan-build-id';
buildMeta.content = PORTAL_BUILD_ID;
document.head.appendChild(buildMeta);

createRoot(document.getElementById("root")!).render(
  <PortalStartupBoundary>
    <App />
  </PortalStartupBoundary>,
);
