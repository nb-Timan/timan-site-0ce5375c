// Phase 50 — "Partnerdata" external module.
// Reuses dealer_accounts, app_users, configurations and portal_form_submissions.
// External roles see ONLY their own dealer record (RLS enforced server-side).
// V1: own-account only — importer/service-partner → sub-dealer relations deferred.

import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Building2, Hash, User } from 'lucide-react';

import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { formatCountry } from '@/lib/formatCountry';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import {
  fetchDealerAccountByNumber,
  type DealerAccount,
} from '@/lib/dealerAccountsService';
import { derivePortalRole } from '@/lib/portalAccess';
import { useEffectivePortalUser } from '@/lib/viewAsUser';

import DealerProfileEditor from '@/components/portal/DealerProfileEditor';
import LastChangedLine from '@/components/portal/LastChangedLine';
import PartnerAgreementHistory from '@/components/portal/PartnerAgreementHistory';


import type { Language } from '@/types/configurator';

const T = {
  backPortal:   { da: 'Tilbage til portal',     en: 'Back to portal',         de: 'Zurück zum Portal',          it: 'Torna al portale',           hu: 'Vissza a portálra' },
  backDealer:   { da: 'Tilbage til forhandler', en: 'Back to dealer',         de: 'Zurück zum Händler',         it: 'Torna al rivenditore',       hu: 'Vissza a kereskedőhöz' },
  pageTitle:    { da: 'Partnerdata',            en: 'Partner data',           de: 'Partnerdaten',               it: 'Dati partner',               hu: 'Partneradatok' },
  pageSubtitle: { da: 'Din virksomheds stamdata, kontakter, brugere og handelshistorik hos Timan.', en: 'Your company master data, contacts, users and trading history with Timan.', de: 'Stammdaten, Kontakte, Benutzer und Handelshistorie Ihres Unternehmens bei Timan.', it: 'Dati anagrafici, contatti, utenti e storico commerciale della tua azienda con Timan.', hu: 'Cégének törzsadatai, kapcsolattartói, felhasználói és kereskedelmi előzményei a Timannál.' },
  noDealer:     { da: 'Din bruger er ikke knyttet til en partnerkonto endnu. Kontakt Timan for at få adgang til Partnerdata.', en: 'Your user is not linked to a partner account yet. Contact Timan to get access to Partner data.', de: 'Ihr Benutzer ist noch keinem Partnerkonto zugeordnet. Kontaktieren Sie Timan für den Zugriff auf die Partnerdaten.', it: 'Il tuo utente non è ancora collegato a un account partner. Contatta Timan per accedere ai dati partner.', hu: 'A felhasználó még nincs partnerfiókhoz rendelve. Vegye fel a kapcsolatot a Timannal a hozzáférésért.' },
  noDealerTitle:{ da: 'Forhandlerkonto mangler', en: 'Dealer account missing', de: 'Händlerkonto fehlt', it: 'Account rivenditore mancante', hu: 'Hiányzó kereskedői fiók' },
  noDealerUsers:{ da: 'Brugere vises først, når denne bruger er koblet til en forhandlerkonto. Timan-brugere vises ikke her.', en: 'Users are shown once this user is linked to a dealer account. Timan users are not shown here.', de: 'Benutzer werden erst angezeigt, wenn dieser Benutzer einem Händlerkonto zugeordnet ist. Timan-Benutzer werden hier nicht angezeigt.', it: 'Gli utenti vengono mostrati quando questo utente è collegato a un account rivenditore. Gli utenti Timan non vengono mostrati qui.', hu: 'A felhasználók akkor jelennek meg, ha ez a felhasználó kereskedői fiókhoz van rendelve. Timan-felhasználók itt nem jelennek meg.' },
  contactPerson:{ da: 'Kontaktperson', en: 'Contact person', de: 'Kontaktperson', it: 'Referente', hu: 'Kapcsolattartó' },
  email:        { da: 'E-mail', en: 'Email', de: 'E-Mail', it: 'E-mail', hu: 'E-mail' },
  loading:      { da: 'Indlæser…', en: 'Loading…', de: 'Lädt…', it: 'Caricamento…', hu: 'Betöltés…' },
  stamdata:     { da: 'Stamdata', en: 'Master data', de: 'Stammdaten', it: 'Dati anagrafici', hu: 'Törzsadatok' },
  companyName:  { da: 'Firmanavn', en: 'Company name', de: 'Firmenname', it: 'Ragione sociale', hu: 'Cégnév' },
  accountNo:    { da: 'Kontonummer', en: 'Account number', de: 'Kontonummer', it: 'Numero conto', hu: 'Számlaszám' },
  dealerType:   { da: 'Forhandlertype', en: 'Dealer type', de: 'Händlertyp', it: 'Tipo rivenditore', hu: 'Kereskedő típusa' },
  country:      { da: 'Land', en: 'Country', de: 'Land', it: 'Paese', hu: 'Ország' },
  seller:       { da: 'Tilknyttet Timan-sælger', en: 'Assigned Timan seller', de: 'Zugeordneter Timan-Verkäufer', it: 'Venditore Timan assegnato', hu: 'Hozzárendelt Timan értékesítő' },
  status:       { da: 'Status', en: 'Status', de: 'Status', it: 'Stato', hu: 'Állapot' },
  blocked:      { da: 'Spærret', en: 'Blocked', de: 'Gesperrt', it: 'Bloccato', hu: 'Zárolva' },
  deleted:      { da: 'Slettet', en: 'Deleted', de: 'Gelöscht', it: 'Eliminato', hu: 'Törölve' },
  active:       { da: 'Aktiv', en: 'Active', de: 'Aktiv', it: 'Attivo', hu: 'Aktív' },
  users:        { da: 'Registrerede brugere', en: 'Registered users', de: 'Registrierte Benutzer', it: 'Utenti registrati', hu: 'Regisztrált felhasználók' },
} as const;

function toErrorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts: string[] = [];
    if (typeof e.message === 'string' && e.message.trim()) parts.push(e.message);
    if (typeof e.details === 'string' && e.details.trim()) parts.push(e.details);
    if (typeof e.hint === 'string' && e.hint.trim()) parts.push(e.hint);
    if (e.code != null) parts.push(`code=${String(e.code)}`);
    if (parts.length) return parts.join(' - ');
    try { return JSON.stringify(error); } catch { return 'Ukendt fejl'; }
  }
  return String(error);
}

// Phase 52 — full profile editing has moved to DealerProfileEditor.

export default function DealerDataPage() {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const portalRole = useMemo(() => derivePortalRole(effectiveUser), [effectiveUser]);

  // Internal Timan roles may view ANY dealer via ?accountNumber=… from CRM.
  // External dealer roles (forhandler/importer/servicepartner/dealer_user) are
  // ALWAYS locked to their own dealer_number — query parameter is ignored.
  const internalRoles = new Set(['timan_backend', 'timan_seller', 'timan_service']);
  const isInternal = !!portalRole && internalRoles.has(portalRole);
  const overrideAccountNumber = isInternal ? (searchParams.get('accountNumber') || '').trim() || null : null;
  const dealerNumber = overrideAccountNumber ?? effectiveUser?.dealer_number ?? null;
  const cameFromCrm = !!overrideAccountNumber;

  const [dealer, setDealer] = useState<DealerAccount | null>(null);

  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    let cancelled = false;
    if (!dealerNumber) {
      setDealer(null);
      setLoadingData(false);
      return;
    }

    (async () => {
      setLoadingData(true);
      setError(null);
      try {
        const dealerRes = await fetchDealerAccountByNumber(dealerNumber);
        if (cancelled) return;

        if (dealerRes.error) setError(toErrorText(dealerRes.error));
        setDealer(dealerRes.row);
      } catch (e) {
        if (!cancelled) setError(toErrorText(e));
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();

    return () => { cancelled = true; };
  }, [dealerNumber]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  // Only true end-customers (no portal role) get bounced to the configurator.
  // Dealer-side users may still have legacy role='slutkunde' but a real portal_role.
  if (appUser.role === 'slutkunde' && !portalRole) return <Navigate to="/configurator" replace />;

  // Internal Timan staff (backend/seller/service) may always edit the dealer
  // profile they are viewing — including dealers reached via ?accountNumber=…
  // from CRM. External dealer-side roles edit only their own account (RLS).
  const canEditProfile = portalRole === 'timan_backend'
    || portalRole === 'timan_seller'
    || portalRole === 'timan_service'
    || portalRole === 'timan_dealer'
    || portalRole === 'timan_importer'
    || portalRole === 'timan_service_partner'
    || portalRole === 'dealer_customer'
    || portalRole === 'dealer_user';

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[DealerDataPage] canEditProfile:', canEditProfile, 'portalRole:', portalRole, 'dealerNumber:', dealerNumber);
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />

      <main className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-8 flex-grow space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{T.pageTitle[lang]}</h1>
              {dealer?.is_blocked && (
                <span className="inline-flex items-center rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-bold text-white">
                  {T.blocked[lang]}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600">{T.pageSubtitle[lang]}</p>
            <LastChangedLine moduleKey="dealer_data" className="mt-2" />
          </div>
        </div>

        {dealer?.is_blocked && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 font-medium">
            Denne forhandlerkonto er deaktiveret i portalen.
          </div>
        )}

        {!dealerNumber && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Hash className="h-5 w-5 text-slate-500" /> {T.stamdata[lang]}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <Field label={T.companyName[lang]} value={effectiveUser?.company_dealer || (effectiveUser as { company?: string | null } | null)?.company || effectiveUser?.display_name || '—'} />
                <Field label={T.accountNo[lang]} value="—" />
                <Field label={T.dealerType[lang]} value={portalRole === 'timan_dealer' ? 'Forhandler' : portalRole || '—'} />
                <Field label={T.country[lang]} value={formatCountry((effectiveUser as { country?: string | null } | null)?.country, lang) || '—'} />
                <Field label={T.contactPerson[lang]} value={effectiveUser?.display_name || '—'} />
                <Field label={T.email[lang]} value={effectiveUser?.email || '—'} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-5 text-sm text-slate-600">
                <div className="font-semibold text-slate-900">{T.noDealerTitle[lang]}</div>
                <div className="mt-1">{T.noDealer[lang]}</div>
              </CardContent>
            </Card>
            <Card id="users" className="scroll-mt-24">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-slate-500" /> {T.users[lang]}
                  <Badge variant="secondary" className="ml-1">0</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-500">{T.noDealerUsers[lang]}</p>
              </CardContent>
            </Card>
          </>
        )}

        {dealerNumber && loadingData && (
          <Card><CardContent className="py-8 text-center text-sm text-slate-500">{T.loading[lang]}</CardContent></Card>
        )}

        {dealerNumber && !loadingData && error && !dealer && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-rose-600 flex items-center justify-center gap-2">
              <AlertCircle className="h-4 w-4" /> {error}
            </CardContent>
          </Card>
        )}

        {dealerNumber && !loadingData && !error && !dealer && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-amber-700">
              Forhandlerkonto {dealerNumber} blev ikke fundet i forhandlerdata. Tjek at brugeren er koblet til en aktiv konto i dealer_accounts.
            </CardContent>
          </Card>
        )}

        {dealer && (
          <>
            <DealerProfileEditor
              dealer={dealer}
              language={lang}
              canEdit={canEditProfile}
              onUpdated={(next) => setDealer(next)}
            />
            <PartnerAgreementHistory dealerAccountNumber={dealer.account_number} language={lang} />
          </>
        )}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

// ---------- helpers ----------

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm text-slate-900 font-medium">{value}</div>
    </div>
  );
}
