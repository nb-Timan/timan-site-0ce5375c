// Partnerdata detail page. The matching list-first entry route is handled by
// PartnerDataRoute; this page renders only a selected, scoped partner account.

import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Building2 } from 'lucide-react';

import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Card, CardContent } from '@/components/ui/card';

import { type DealerAccount } from '@/lib/dealerAccountsService';
import { derivePortalRole } from '@/lib/portalAccess';
import { canEditPartnerDataAccount, listPartnerDataDealers } from '@/lib/partnerDataScope';
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

  // The entry route is list-first. A detail may only use an account from the
  // exact same scoped list, including external users' linked partner accounts.
  const dealerNumber = (searchParams.get('accountNumber') || '').trim() || null;

  const [dealer, setDealer] = useState<DealerAccount | null>(null);

  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    let cancelled = false;
    if (!dealerNumber || !effectiveUser || !portalRole) {
      setDealer(null);
      setLoadingData(false);
      return;
    }

    (async () => {
      setLoadingData(true);
      setError(null);
      try {
        const dealerRes = await listPartnerDataDealers(effectiveUser, portalRole);
        if (cancelled) return;
        if (dealerRes.error) setError(toErrorText(dealerRes.error));
        const selected = dealerRes.rows.find((row) => row.account_number === dealerNumber) ?? null;
        if (!selected && !dealerRes.error) {
          setError('Denne partnerkonto er ikke tilgængelig i dit aktuelle scope.');
        }
        setDealer(selected);
      } catch (e) {
        if (!cancelled) setError(toErrorText(e));
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();

    return () => { cancelled = true; };
  }, [dealerNumber, effectiveUser, portalRole]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!dealerNumber) return <Navigate to="/portal/dealer-data" replace />;
  // Only true end-customers (no portal role) get bounced to the configurator.
  // Dealer-side users may still have legacy role='slutkunde' but a real portal_role.
  if (appUser.role === 'slutkunde' && !portalRole) return <Navigate to="/configurator" replace />;

  // Internal staff can edit their scoped partner accounts. An external partner
  // may view linked accounts, but can edit only its own canonical account.
  const canEditProfile = canEditPartnerDataAccount(effectiveUser, portalRole, dealerNumber);
  const isAssignedSeller = Boolean(
    dealer && effectiveUser && (
      (dealer.assigned_seller_id && effectiveUser.id && dealer.assigned_seller_id === effectiveUser.id)
      || (dealer.assigned_seller_email && dealer.assigned_seller_email.trim().toLowerCase() === effectiveUser.email.trim().toLowerCase())
    ),
  );
  const canManageFinancialTerms = portalRole === 'timan_backend'
    || (portalRole === 'timan_seller' && isAssignedSeller);

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
              canManageFinancialTerms={canManageFinancialTerms}
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
