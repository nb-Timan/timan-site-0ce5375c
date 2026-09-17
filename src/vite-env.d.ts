/// <reference types="vite/client" />

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
  __TIMAN_PUBLIC_CONFIG__?: {
    VITE_PORTAL_SITE_URL?: string;
    VITE_CARTO_BASEMAP_KEY?: string;
    VITE_CARTO_MAPS_API_KEY?: string;
    VITE_CARTO_API_KEY?: string;
  };
}
