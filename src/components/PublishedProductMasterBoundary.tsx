import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  loadPublishedConfiguratorPricesWithRetry,
  ProductMasterLoadError,
} from '@/lib/configuratorPublishedPrices';

function isProductMasterBlockingRoute(pathname: string): boolean {
  return pathname === '/configurator'
    || pathname === '/messe/konfigurator'
    || pathname === '/portal/marketing/configurator';
}

/** Load once before current catalog consumers mount, including non-Configurator routes. */
export default function PublishedProductMasterBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const refresh = async () => {
    setFailed(false);
    try {
      await loadPublishedConfiguratorPricesWithRetry();
      setReady(true);
    } catch (error) {
      const details = error instanceof ProductMasterLoadError
        ? { ...error.diagnostic, attempts: error.attempts }
        : error;
      console.error('[product-master] Published catalog unavailable', details);
      setFailed(true);
    }
  };
  useEffect(() => {
    let cancelled = false;
    const load = () => loadPublishedConfiguratorPricesWithRetry().then(() => {
      if (!cancelled) { setReady(true); setFailed(false); }
    }).catch(error => {
      const details = error instanceof ProductMasterLoadError
        ? { ...error.diagnostic, attempts: error.attempts }
        : error;
      console.error('[product-master] Published catalog unavailable', details);
      if (!cancelled) setFailed(true);
    });
    void load();
    window.addEventListener('timan:product-master-published', load);
    return () => { cancelled = true; window.removeEventListener('timan:product-master-published', load); };
  }, []);
  const authRoute = /(?:login|password|auth)(?:\/|$)/.test(pathname);
  const mustWaitForCatalog = isProductMasterBlockingRoute(pathname);
  if (!ready && !authRoute && mustWaitForCatalog) return <div role="status" className="p-6 text-sm">{failed
    ? <button type="button" onClick={() => void refresh()}>Produktdata kunne ikke hentes. Prøv igen</button>
    : 'Henter produktdata...'}</div>;
  return children;
}
