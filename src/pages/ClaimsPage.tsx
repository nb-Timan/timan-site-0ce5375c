import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, LifeBuoy, Plus, AlertCircle } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Language } from '@/types/configurator';
import { derivePortalRole, getPortalPermissions, hasModuleAccess } from '@/lib/portalAccess';
import { loadClaims, ServiceClaim, ClaimStatus } from '@/lib/claimsService';

const T: Record<string, Record<Language, string>> = {
  back:        { da: 'Tilbage til Timan Portalen', en: 'Back to Timan Portal', de: 'Zurück zum Timan Portal', it: 'Torna al Portale Timan', hu: 'Vissza a Timan Portálra' },
  title:       { da: 'Service / Claims', en: 'Service / Claims', de: 'Service / Reklamationen', it: 'Assistenza / Reclami', hu: 'Szerviz / Reklamációk' },
  intro:       { da: 'Overblik over service- og garantisager.', en: 'Overview of service and warranty cases.', de: 'Übersicht über Service- und Garantiefälle.', it: 'Panoramica dei casi di assistenza e garanzia.', hu: 'Szerviz- és garanciaesetek áttekintése.' },
  newClaim:    { da: 'Ny sag', en: 'New claim', de: 'Neuer Fall', it: 'Nuovo reclamo', hu: 'Új ügy' },
  readOnly:    { da: 'Skrivebeskyttet adgang', en: 'Read-only access', de: 'Nur-Lese-Zugriff', it: 'Accesso in sola lettura', hu: 'Csak olvasható hozzáférés' },
  noAccess:    { da: 'Ingen adgang til Service / Claims.', en: 'No access to Service / Claims.', de: 'Kein Zugriff auf Service / Reklamationen.', it: 'Nessun accesso a Assistenza / Reclami.', hu: 'Nincs hozzáférés a Szerviz / Reklamációkhoz.' },
  loading:     { da: 'Indlæser…', en: 'Loading…', de: 'Lädt…', it: 'Caricamento…', hu: 'Betöltés…' },
  empty:       { da: 'Ingen sager fundet.', en: 'No claims found.', de: 'Keine Fälle gefunden.', it: 'Nessun reclamo trovato.', hu: 'Nincs találat.' },
  mockNote:    { da: 'Viser eksempeldata (backend-tabel ikke tilgængelig).', en: 'Showing sample data (backend table unavailable).', de: 'Beispieldaten werden angezeigt (Backend nicht verfügbar).', it: 'Dati di esempio (tabella backend non disponibile).', hu: 'Mintaadatok megjelenítése (backend tábla nem elérhető).' },
  colNumber:   { da: 'Sagsnr.', en: 'Claim #', de: 'Fall-Nr.', it: 'N. reclamo', hu: 'Ügyszám' },
  colModel:    { da: 'Model / Serienr.', en: 'Model / Serial', de: 'Modell / Seriennr.', it: 'Modello / Seriale', hu: 'Modell / Sorozatszám' },
  colCustomer: { da: 'Kunde', en: 'Customer', de: 'Kunde', it: 'Cliente', hu: 'Ügyfél' },
  colDesc:     { da: 'Beskrivelse', en: 'Description', de: 'Beschreibung', it: 'Descrizione', hu: 'Leírás' },
  colStatus:   { da: 'Status', en: 'Status', de: 'Status', it: 'Stato', hu: 'Állapot' },
  colDate:     { da: 'Oprettet', en: 'Created', de: 'Erstellt', it: 'Creato', hu: 'Létrehozva' },
};

const STATUS_LABEL: Record<ClaimStatus, Record<Language, string>> = {
  open:      { da: 'Åben',         en: 'Open',        de: 'Offen',        it: 'Aperto',       hu: 'Nyitott' },
  in_review: { da: 'Under behandling', en: 'In review', de: 'In Prüfung', it: 'In revisione', hu: 'Vizsgálat alatt' },
  approved:  { da: 'Godkendt',     en: 'Approved',    de: 'Genehmigt',    it: 'Approvato',    hu: 'Jóváhagyva' },
  rejected:  { da: 'Afvist',       en: 'Rejected',    de: 'Abgelehnt',    it: 'Respinto',     hu: 'Elutasítva' },
  closed:    { da: 'Lukket',       en: 'Closed',      de: 'Geschlossen',  it: 'Chiuso',       hu: 'Lezárva' },
};

const STATUS_CLASS: Record<ClaimStatus, string> = {
  open:      'bg-amber-100 text-amber-800',
  in_review: 'bg-blue-100 text-blue-800',
  approved:  'bg-green-100 text-green-800',
  rejected:  'bg-rose-100 text-rose-800',
  closed:    'bg-gray-100 text-gray-700',
};

export default function ClaimsPage() {
  const { appUser, loading: authLoading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const [claims, setClaims] = useState<ServiceClaim[]>([]);
  const [source, setSource] = useState<'supabase' | 'mock' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await loadClaims();
        if (!active) return;
        setClaims(res.claims);
        setSource(res.source);
      } catch {
        if (!active) return;
        setClaims([]);
        setSource('mock');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }

  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === 'slutkunde') return <Navigate to="/configurator" replace />;

  const portalRole = derivePortalRole(appUser);
  const allowed = hasModuleAccess(portalRole, 'claims', (appUser.module_access as import('@/lib/portalAccess').ModuleAccessKey[] | null | undefined) ?? null);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;
  const canCreate = !!perms?.canCreateClaim;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />

      {/* Back button */}
      <div className="bg-white border-b border-gray-200 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => navigate('/portal')}
            className="flex items-center text-[#2d5a27] font-semibold hover:underline"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            {T.back[lang]}
          </button>
        </div>
      </div>

      {/* Page header */}
      <header className="bg-white border-b border-gray-200 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center">
              <LifeBuoy className="h-6 w-6 text-rose-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{T.title[lang]}</h1>
              <p className="text-gray-500 mt-1 text-sm">{T.intro[lang]}</p>
            </div>
          </div>

          {allowed && (
            canCreate ? (
              <button
                type="button"
                onClick={() => { /* form modal in next phase */ }}
                className="inline-flex items-center gap-2 bg-[#2d5a27] text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#244820] transition"
              >
                <Plus className="h-4 w-4" />
                {T.newClaim[lang]}
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                {T.readOnly[lang]}
              </span>
            )
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full">
        {!allowed ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 flex items-center gap-3 text-gray-700">
            <AlertCircle className="h-5 w-5 text-rose-500" />
            {T.noAccess[lang]}
          </div>
        ) : loading ? (
          <div className="text-sm text-gray-500">{T.loading[lang]}</div>
        ) : (
          <>
            {source === 'mock' && (
              <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {T.mockNote[lang]}
              </div>
            )}

            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">{T.colNumber[lang]}</th>
                      <th className="px-4 py-3 text-left">{T.colModel[lang]}</th>
                      <th className="px-4 py-3 text-left">{T.colCustomer[lang]}</th>
                      <th className="px-4 py-3 text-left">{T.colDesc[lang]}</th>
                      <th className="px-4 py-3 text-left">{T.colStatus[lang]}</th>
                      <th className="px-4 py-3 text-left">{T.colDate[lang]}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {claims.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{T.empty[lang]}</td></tr>
                    ) : claims.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/portal/service/claims/${c.id}`)}>
                        <td className="px-4 py-3 font-semibold text-[#2d5a27] hover:underline">{c.claim_number}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <div className="font-medium">{c.machine_model || '—'}</div>
                          <div className="text-xs text-gray-500">{c.machine_serial || ''}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{c.customer_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-md truncate">{c.description}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_CLASS[c.status]}`}>
                            {STATUS_LABEL[c.status][lang] || STATUS_LABEL[c.status].en}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {new Date(c.created_at).toLocaleDateString(lang === 'en' ? 'en-GB' : lang)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
