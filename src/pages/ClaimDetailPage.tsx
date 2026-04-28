import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LifeBuoy, AlertCircle, Lock } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Language } from '@/types/configurator';
import { derivePortalRole, getPortalPermissions, hasModuleAccess, getClaimsViewVariant, ModuleAccessKey } from '@/lib/portalAccess';
import { getClaimById, ServiceClaim, ClaimStatus } from '@/lib/claimsService';

const T: Record<string, Record<Language, string>> = {
  back:        { da: 'Tilbage til sagsoversigt', en: 'Back to claims list', de: 'Zurück zur Fallübersicht', it: 'Torna ai reclami', hu: 'Vissza az ügylistához' },
  title:       { da: 'Sagsdetaljer', en: 'Claim details', de: 'Falldetails', it: 'Dettagli reclamo', hu: 'Ügy részletei' },
  noAccess:    { da: 'Ingen adgang til Service / Claims.', en: 'No access to Service / Claims.', de: 'Kein Zugriff.', it: 'Nessun accesso.', hu: 'Nincs hozzáférés.' },
  loading:     { da: 'Indlæser…', en: 'Loading…', de: 'Lädt…', it: 'Caricamento…', hu: 'Betöltés…' },
  notFound:    { da: 'Sag ikke fundet.', en: 'Claim not found.', de: 'Fall nicht gefunden.', it: 'Reclamo non trovato.', hu: 'Az ügy nem található.' },
  mockNote:    { da: 'Viser eksempeldata (backend-tabel ikke tilgængelig).', en: 'Showing sample data (backend table unavailable).', de: 'Beispieldaten (Backend nicht verfügbar).', it: 'Dati di esempio (backend non disponibile).', hu: 'Mintaadatok (backend nem elérhető).' },
  readOnly:    { da: 'Skrivebeskyttet', en: 'Read-only', de: 'Nur-Lesen', it: 'Sola lettura', hu: 'Csak olvasható' },
  fClaimNo:    { da: 'Sagsnummer', en: 'Claim number', de: 'Fallnummer', it: 'N. reclamo', hu: 'Ügyszám' },
  fStatus:     { da: 'Status', en: 'Status', de: 'Status', it: 'Stato', hu: 'Állapot' },
  fCreated:    { da: 'Oprettet', en: 'Created', de: 'Erstellt', it: 'Creato', hu: 'Létrehozva' },
  fCreatedBy:  { da: 'Oprettet af', en: 'Created by', de: 'Erstellt von', it: 'Creato da', hu: 'Létrehozta' },
  sMachine:    { da: 'Maskininformation', en: 'Machine information', de: 'Maschineninformation', it: 'Informazioni macchina', hu: 'Gép adatai' },
  fModel:      { da: 'Model', en: 'Model', de: 'Modell', it: 'Modello', hu: 'Modell' },
  fSerial:     { da: 'Serienummer', en: 'Serial number', de: 'Seriennummer', it: 'Numero di serie', hu: 'Sorozatszám' },
  sCustomer:   { da: 'Kundeoplysninger', en: 'Customer information', de: 'Kundeninformation', it: 'Informazioni cliente', hu: 'Ügyfél adatai' },
  fCustomer:   { da: 'Kunde', en: 'Customer', de: 'Kunde', it: 'Cliente', hu: 'Ügyfél' },
  sDesc:       { da: 'Beskrivelse af sagen', en: 'Case description', de: 'Fallbeschreibung', it: 'Descrizione del caso', hu: 'Ügy leírása' },
  viewInternal:{ da: 'Intern visning', en: 'Internal view', de: 'Interne Ansicht', it: 'Vista interna', hu: 'Belső nézet' },
  viewDealer:  { da: 'Forhandlervisning', en: 'Dealer view', de: 'Händleransicht', it: 'Vista rivenditore', hu: 'Kereskedői nézet' },
};

const STATUS_LABEL: Record<ClaimStatus, Record<Language, string>> = {
  open:      { da: 'Åben', en: 'Open', de: 'Offen', it: 'Aperto', hu: 'Nyitott' },
  in_review: { da: 'Under behandling', en: 'In review', de: 'In Prüfung', it: 'In revisione', hu: 'Vizsgálat alatt' },
  approved:  { da: 'Godkendt', en: 'Approved', de: 'Genehmigt', it: 'Approvato', hu: 'Jóváhagyva' },
  rejected:  { da: 'Afvist', en: 'Rejected', de: 'Abgelehnt', it: 'Respinto', hu: 'Elutasítva' },
  closed:    { da: 'Lukket', en: 'Closed', de: 'Geschlossen', it: 'Chiuso', hu: 'Lezárva' },
};

const STATUS_CLASS: Record<ClaimStatus, string> = {
  open:      'bg-amber-100 text-amber-800',
  in_review: 'bg-blue-100 text-blue-800',
  approved:  'bg-green-100 text-green-800',
  rejected:  'bg-rose-100 text-rose-800',
  closed:    'bg-gray-100 text-gray-700',
};

function Field({ label, value, readOnly }: { label: string; value: string; readOnly: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">{label}</label>
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        disabled={readOnly}
        className={`w-full rounded-lg border px-3 py-2 text-sm ${readOnly ? 'bg-gray-50 border-gray-200 text-gray-700 cursor-default' : 'bg-white border-gray-300 text-gray-900'}`}
      />
    </div>
  );
}

export default function ClaimDetailPage() {
  const { appUser, loading: authLoading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const { claimId } = useParams<{ claimId: string }>();

  const [claim, setClaim] = useState<ServiceClaim | null>(null);
  const [source, setSource] = useState<'supabase' | 'mock' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!claimId) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const res = await getClaimById(claimId);
        if (!active) return;
        setClaim(res.claim);
        setSource(res.source);
        setError(res.error ?? null);
      } catch (e) {
        if (!active) return;
        setClaim(null);
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [claimId]);

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
  const allowed = hasModuleAccess(portalRole, 'claims', (appUser.module_access as ModuleAccessKey[] | null | undefined) ?? null);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;
  const readOnly = !perms?.canCreateClaim; // dealer_user → read-only
  const viewVariant = getClaimsViewVariant(portalRole);

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
            onClick={() => navigate('/portal/service/claims')}
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
              <h1 className="text-3xl font-bold text-gray-900">
                {T.title[lang]}{claim ? ` — ${claim.claim_number}` : ''}
              </h1>
              <p className="text-gray-500 mt-1 text-sm">Service / Claims</p>
            </div>
          </div>
          {allowed && readOnly && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
              <Lock className="h-3.5 w-3.5" />
              {T.readOnly[lang]}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full">
        {!allowed ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 flex items-center gap-3 text-gray-700">
            <AlertCircle className="h-5 w-5 text-rose-500" />
            {T.noAccess[lang]}
          </div>
        ) : loading ? (
          <div className="text-sm text-gray-500">{T.loading[lang]}</div>
        ) : !claim ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 flex items-center gap-3 text-gray-700">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            {T.notFound[lang]}
          </div>
        ) : (
          <>
            {source === 'mock' && (
              <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {T.mockNote[lang]}
                {error && <span className="text-amber-600 ml-1">— {error}</span>}
              </div>
            )}

            {/* Top summary */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label={T.fClaimNo[lang]} value={claim.claim_number} readOnly={true} />
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">{T.fStatus[lang]}</label>
                  <div>
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_CLASS[claim.status]}`}>
                      {STATUS_LABEL[claim.status][lang] || STATUS_LABEL[claim.status].en}
                    </span>
                  </div>
                </div>
                <Field
                  label={T.fCreated[lang]}
                  value={new Date(claim.created_at).toLocaleString(lang === 'en' ? 'en-GB' : lang)}
                  readOnly={true}
                />
                <Field label={T.fCreatedBy[lang]} value={claim.created_by_email || '—'} readOnly={true} />
              </div>
            </div>

            {/* Machine */}
            <section className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{T.sMachine[lang]}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label={T.fModel[lang]} value={claim.machine_model || '—'} readOnly={readOnly} />
                <Field label={T.fSerial[lang]} value={claim.machine_serial || '—'} readOnly={readOnly} />
              </div>
            </section>

            {/* Customer */}
            <section className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{T.sCustomer[lang]}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label={T.fCustomer[lang]} value={claim.customer_name || '—'} readOnly={readOnly} />
              </div>
            </section>

            {/* Description */}
            <section className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{T.sDesc[lang]}</h2>
              <textarea
                value={claim.description}
                readOnly={readOnly}
                disabled={readOnly}
                rows={6}
                className={`w-full rounded-lg border px-3 py-2 text-sm ${readOnly ? 'bg-gray-50 border-gray-200 text-gray-700' : 'bg-white border-gray-300 text-gray-900'}`}
              />
            </section>
          </>
        )}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
