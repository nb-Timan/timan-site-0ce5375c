/// <reference types="vite/client" />

declare const __TIMAN_BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_PORTAL_SITE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_GOOGLE_PLACES_API_KEY?: string;
  readonly VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY?: string;
  readonly VITE_N8N_CRM_CALENDAR_WEBHOOK_URL?: string;
  readonly VITE_CARTO_BASEMAP_KEY?: string;
  readonly VITE_CARTO_MAPS_API_KEY?: string;
  readonly VITE_CARTO_API_KEY?: string;
}

interface Window {
  __TIMAN_BUILD_ID__?: string;
  __TIMAN_STARTUP_DIAGNOSTICS__?: () => import('@/lib/portalStartupDiagnostics').PortalStartupDiagnostic[];
  __TIMAN_ENTRY_READY__?: () => void;
  __TIMAN_STATIC_RETRY__?: () => void;
  __TIMAN_STATIC_LOGIN__?: () => void;
  __TIMAN_PUBLIC_CONFIG__?: {
    VITE_PORTAL_SITE_URL?: string;
    VITE_CARTO_BASEMAP_KEY?: string;
    VITE_CARTO_MAPS_API_KEY?: string;
    VITE_CARTO_API_KEY?: string;
  };
}
