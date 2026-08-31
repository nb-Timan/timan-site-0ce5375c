/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CARTO_BASEMAP_KEY?: string;
  readonly VITE_CARTO_MAPS_API_KEY?: string;
  readonly VITE_CARTO_API_KEY?: string;
}

interface Window {
  __TIMAN_PUBLIC_CONFIG__?: {
    VITE_CARTO_BASEMAP_KEY?: string;
    VITE_CARTO_MAPS_API_KEY?: string;
    VITE_CARTO_API_KEY?: string;
  };
}
