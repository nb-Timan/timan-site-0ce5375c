/**
 * Backend → Messe settings.
 *
 * - Shows the login-protected Messe entry URL
 * - Copy link to clipboard
 * - Download QR PNG (rendered client-side from the live URL)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { QrCode, Copy, Download, Check, ExternalLink } from 'lucide-react';
import QRCode from 'qrcode';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { isBackendActor } from '@/lib/portalAccess';
import { getMesseUrl, isMesseEnabled, setMesseEnabled } from '@/lib/exhibitionMode';

export default function BackendMesseSettingsPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [enabled, setEnabledState] = useState<boolean>(() => isMesseEnabled());
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const url = useMemo(() => getMesseUrl(), []);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 320, margin: 2 }).catch(() => { /* ignore */ });
  }, [url]);

  const isBackend = isBackendActor(appUser);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!isBackend) return <Navigate to="/portal/backend" replace />;

  function toggle() {
    const next = !enabled;
    setMesseEnabled(next);
    setEnabledState(next);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  async function downloadQr() {
    const dataUrl = await QRCode.toDataURL(url, { width: 1024, margin: 2 });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'timan-messe-qr.png';
    a.click();
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage} onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 flex-grow w-full">
        <div className="mb-8 flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
            <QrCode className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Messe</h1>
            <p className="text-slate-500 mt-1 text-sm">Login-beskyttet Messe-adgang til demo-portalen for messer og events.</p>
          </div>
        </div>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Messe-adgang</h2>
              <p className="text-sm text-slate-500 mt-1">
                Når aktiv, kan brugere med Portal variant = "Messe Portal" scanne QR-koden, logge ind og blive sendt direkte til demo-portalen.
                {' '}Når deaktiveret, viser <code>/messe</code> en venlig besked.
              </p>
            </div>
            <button
              type="button"
              onClick={toggle}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${enabled ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
            >
              {enabled ? 'Aktiv' : 'Deaktiveret'}
            </button>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Messe login-link</h2>
          <p className="text-sm text-slate-500 mb-4">Brug dette link eller QR-koden på messen. Besøgeren skal logge ind før adgang til Messe Portal.</p>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-sm text-slate-800 hover:bg-slate-200 break-all"
            >
              {url}
              <ExternalLink className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            </a>
            <button onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Kopieret' : 'Kopiér link'}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="bg-white p-3 rounded-xl border border-slate-200">
              <canvas ref={canvasRef} className="block" />
            </div>
            <div className="flex-grow">
              <p className="text-sm text-slate-600 mb-3">QR-koden peger på login-siden. Når en Messe Portal-bruger logger ind, sendes vedkommende automatisk til <code>/messe</code>. Print eller download som PNG til skilte og stande.</p>
              <button onClick={downloadQr} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                <Download className="h-4 w-4" /> Download QR (PNG)
              </button>
            </div>
          </div>
        </section>
      </main>
      <PortalFooter language={lang} />
    </div>
  );
}
