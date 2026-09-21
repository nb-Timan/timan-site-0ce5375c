import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { loadPublishedConfiguratorPrices } from '@/lib/configuratorPublishedPrices';

/** Load once before current catalog consumers mount, including non-Configurator routes. */
export default function PublishedProductMasterBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => loadPublishedConfiguratorPrices().then(() => {
      if (!cancelled) { setReady(true); setFailed(false); }
    }).catch(error => {
      console.error('[product-master] Published catalog unavailable', error);
      if (!cancelled) setFailed(true);
    });
    void refresh();
    window.addEventListener('timan:product-master-published', refresh);
    return () => { cancelled = true; window.removeEventListener('timan:product-master-published', refresh); };
  }, []);
  const authRoute = /(?:login|password|auth)(?:\/|$)/.test(pathname);
  if (!ready && !authRoute) return <div role="status" className="p-6 text-sm">{failed
    ? <button type="button" onClick={() => window.location.reload()}>Produktdata kunne ikke hentes. Prøv igen</button>
    : 'Henter produktdata...'}</div>;
  return children;
}
