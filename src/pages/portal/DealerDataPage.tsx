// Phase 50 — "Partnerdata" external module.
// Reuses dealer_accounts, app_users, configurations and portal_form_submissions.
// External roles see ONLY their own dealer record (RLS enforced server-side).
// V1: own-account only — importer/service-partner → sub-dealer relations deferred.

import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Building2, CheckCircle2, Clock, FileText, Hash, Package, User, Wrench, XCircle } from 'lucide-react';

import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { formatCountry } from '@/lib/formatCountry';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  fetchDealerAccountByNumber,
  type DealerAccount,
} from '@/lib/dealerAccountsService';
import {
  listCrmConfigurations,
  type CrmConfigurationRow,
} from '@/lib/crmConfigurationsService';
import {
  listPortalFormSubmissions,
  type PortalFormSubmission,
} from '@/lib/portalFormsService';
import { listDealerContacts, type DealerContact } from '@/lib/dealerContactsService';
import { derivePortalRole } from '@/lib/portalAccess';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { buildJournalScope } from '@/lib/machineJournalScope';
import {
  getDemoOverviewMachines,
  listDealerMachineRegister,
  type DealerMachineRegisterRow,
} from '@/lib/dealerMachineRegisterService';

import { supabase } from '@/lib/supabase';
import DealerProfileEditor from '@/components/portal/DealerProfileEditor';
import RegisteredUsersTable from '@/components/portal/RegisteredUsersTable';
import LastChangedLine from '@/components/portal/LastChangedLine';

interface DealerUserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  portal_role: string | null;
  status: string | null;
  approved: boolean | null;
  is_active: boolean | null;
  last_login: string | null;
  preferred_language: string | null;
  account_owner_initials?: string | null;
  account_owner_name?: string | null;
  account_owner_email?: string | null;
}


import type { Language } from '@/types/configurator';

const LOCALE_MAP: Record<Language, string> = {
  da: 'da-DK', en: 'en-GB', de: 'de-DE', it: 'it-IT', hu: 'hu-HU',
};

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
  accept:       { da: 'Forhandler accept / Fakturering', en: 'Dealer acceptance / Invoicing', de: 'Händlerannahme / Rechnungsstellung', it: 'Accettazione rivenditore / Fatturazione', hu: 'Kereskedői elfogadás / Számlázás' },
  noSubs:       { da: 'Ingen indsendelser fundet.', en: 'No submissions found.', de: 'Keine Einreichungen gefunden.', it: 'Nessun invio trovato.', hu: 'Nem található beküldés.' },
  date:         { da: 'Dato', en: 'Date', de: 'Datum', it: 'Data', hu: 'Dátum' },
  companyCust:  { da: 'Firma/kunde', en: 'Company/customer', de: 'Firma/Kunde', it: 'Azienda/cliente', hu: 'Cég/ügyfél' },
  vat:          { da: 'CVR', en: 'VAT', de: 'USt-IdNr.', it: 'P.IVA', hu: 'Adószám' },
  decision:     { da: 'Beslutning', en: 'Decision', de: 'Entscheidung', it: 'Decisione', hu: 'Döntés' },
  comment:      { da: 'Kommentar', en: 'Comment', de: 'Kommentar', it: 'Commento', hu: 'Megjegyzés' },
  submittedBy:  { da: 'Indsendt af', en: 'Submitted by', de: 'Eingereicht von', it: 'Inviato da', hu: 'Beküldte' },
  accepted:     { da: 'Accepteret', en: 'Accepted', de: 'Akzeptiert', it: 'Accettato', hu: 'Elfogadva' },
  rejected:     { da: 'Afvist', en: 'Rejected', de: 'Abgelehnt', it: 'Rifiutato', hu: 'Elutasítva' },
  noCoop:       { da: 'Ønsker ikke samarbejde', en: 'Does not want cooperation', de: 'Wünscht keine Zusammenarbeit', it: 'Non desidera collaborazione', hu: 'Nem kíván együttműködni' },
  unknown:      { da: 'Ukendt', en: 'Unknown', de: 'Unbekannt', it: 'Sconosciuto', hu: 'Ismeretlen' },
  openQuotes:   { da: 'Åbne tilbud', en: 'Open quotes', de: 'Offene Angebote', it: 'Preventivi aperti', hu: 'Nyitott árajánlatok' },
  orders:       { da: 'Ordrer', en: 'Orders', de: 'Aufträge', it: 'Ordini', hu: 'Rendelések' },
  overview:     { da: 'Overblik', en: 'Overview', de: 'Übersicht', it: 'Panoramica', hu: 'Áttekintés' },
  documents:    { da: 'Dokumenter', en: 'Documents', de: 'Dokumente', it: 'Documenti', hu: 'Dokumentumok' },
  machines:     { da: 'Maskiner', en: 'Machines', de: 'Maschinen', it: 'Macchine', hu: 'Gépek' },
  demoMachines: { da: 'Demo-maskiner', en: 'Demo machines', de: 'Demomaschinen', it: 'Macchine demo', hu: 'Demógépek' },
  demoNone:     { da: 'Ingen aktive demo-opmærksomheder.', en: 'No active demo attention items.', de: 'Keine aktiven Demo-Hinweise.', it: 'Nessuna demo da evidenziare.', hu: 'Nincs aktív demó figyelmeztetés.' },
  viewMachines: { da: 'Se maskiner', en: 'View machines', de: 'Maschinen anzeigen', it: 'Vedi macchine', hu: 'Gépek megtekintése' },
  all:          { da: 'Alle', en: 'All', de: 'Alle', it: 'Tutte', hu: 'Összes' },
  serial:       { da: 'Serienummer', en: 'Serial number', de: 'Seriennummer', it: 'Numero di serie', hu: 'Sorozatszám' },
  model:        { da: 'Model/type', en: 'Model/type', de: 'Modell/Typ', it: 'Modello/tipo', hu: 'Modell/típus' },
  orderNo:      { da: 'Ordrenr.', en: 'Order no.', de: 'Auftragsnr.', it: 'N. ordine', hu: 'Rendelésszám' },
  delivery:     { da: 'Levering', en: 'Delivery', de: 'Lieferung', it: 'Consegna', hu: 'Szállítás' },
  customer:     { da: 'Kunde', en: 'Customer', de: 'Kunde', it: 'Cliente', hu: 'Ügyfél' },
  warranty:     { da: 'Garanti/SP', en: 'Warranty/SP', de: 'Garantie/SP', it: 'Garanzia/SP', hu: 'Garancia/SP' },
  lifecycle:    { da: 'Lifecycle-status', en: 'Lifecycle status', de: 'Lifecycle-Status', it: 'Stato lifecycle', hu: 'Életciklus állapot' },
  normalMachine:{ da: 'Normal', en: 'Normal', de: 'Normal', it: 'Normale', hu: 'Normál' },
  activeDemo:   { da: 'Aktiv demo', en: 'Active demo', de: 'Aktive Demo', it: 'Demo attiva', hu: 'Aktív demó' },
  readySale:    { da: 'Klar til salg', en: 'Ready for sale', de: 'Verkaufsbereit', it: 'Pronta per la vendita', hu: 'Eladásra kész' },
  soldEarly:    { da: 'Solgt før tilladt dato', en: 'Sold before allowed date', de: 'Vor erlaubtem Datum verkauft', it: 'Venduta prima della data consentita', hu: 'Engedélyezett dátum előtt eladva' },
  soldRegistered:{ da: 'Solgt/garantiregistreret', en: 'Sold/warranty registered', de: 'Verkauft/garantieregistriert', it: 'Venduta/registrata in garanzia', hu: 'Eladva/garanciára regisztrálva' },
  deliveryMissing:{ da: 'Demo - leveringsdato mangler', en: 'Demo - delivery date missing', de: 'Demo - Lieferdatum fehlt', it: 'Demo - data consegna mancante', hu: 'Demó - szállítási dátum hiányzik' },
  daysLeft:     { da: 'dage tilbage', en: 'days left', de: 'Tage verbleiben', it: 'giorni rimanenti', hu: 'nap van hátra' },
  daysEarly:    { da: 'dage før tid', en: 'days early', de: 'Tage zu früh', it: 'giorni in anticipo', hu: 'nappal korábban' },
  after9Months: { da: 'efter 9 mdr.', en: 'after 9 months', de: 'nach 9 Monaten', it: 'dopo 9 mesi', hu: '9 hónap után' },
  noEntries:    { da: 'Ingen poster.', en: 'No entries.', de: 'Keine Einträge.', it: 'Nessuna voce.', hu: 'Nincs bejegyzés.' },
  number:       { da: 'Nr.', en: 'No.', de: 'Nr.', it: 'N.', hu: 'Sz.' },
  title:        { da: 'Titel', en: 'Title', de: 'Titel', it: 'Titolo', hu: 'Cím' },
  created:      { da: 'Oprettet', en: 'Created', de: 'Erstellt', it: 'Creato', hu: 'Létrehozva' },
  amount:       { da: 'Beløb', en: 'Amount', de: 'Betrag', it: 'Importo', hu: 'Összeg' },
} as const;

function fmtDate(s: string | null | undefined, lang: Language = 'da'): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(LOCALE_MAP[lang]); } catch { return '—'; }
}
function fmtDateTime(s: string | null | undefined, lang: Language = 'da'): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(LOCALE_MAP[lang]); } catch { return '—'; }
}
function fmtMoney(n: number | null | undefined, lang: Language = 'da'): string {
  if (n == null) return '—';
  try { return new Intl.NumberFormat(LOCALE_MAP[lang], { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(n); }
  catch { return String(n); }
}

function formatOwnerLabel(owner: Pick<DealerUserRow, 'account_owner_initials' | 'account_owner_name' | 'account_owner_email'> | null | undefined): string | null {
  const initials = (owner?.account_owner_initials || '').trim();
  const name = (owner?.account_owner_name || owner?.account_owner_email || '').trim();
  if (initials && name) return `${initials} - ${name}`;
  return initials || name || null;
}

function formatDealerSellerLabel(dealer: Pick<DealerAccount, 'assigned_seller_initials' | 'assigned_seller_name' | 'assigned_seller_email'> | null | undefined): string | null {
  const initials = (dealer?.assigned_seller_initials || '').trim();
  const name = (dealer?.assigned_seller_name || dealer?.assigned_seller_email || '').trim();
  if (initials && name) return `${initials} - ${name}`;
  return initials || name || null;
}

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
  const [users, setUsers] = useState<DealerUserRow[]>([]);
  const [contacts, setContacts] = useState<DealerContact[]>([]);
  const [submissions, setSubmissions] = useState<PortalFormSubmission[]>([]);
  const [quotes, setQuotes] = useState<CrmConfigurationRow[]>([]);
  const [orders, setOrders] = useState<CrmConfigurationRow[]>([]);
  const [machines, setMachines] = useState<DealerMachineRegisterRow[]>([]);
  const [machineStatusFilter, setMachineStatusFilter] = useState<'all' | 'demo_attention'>('all');
  const [accountOwnerLabel, setAccountOwnerLabel] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    let cancelled = false;
    if (!dealerNumber) {
      setDealer(null);
      setUsers([]);
      setContacts([]);
      setSubmissions([]);
      setQuotes([]);
      setOrders([]);
      setMachines([]);
      setAccountOwnerLabel(null);
      setLoadingData(false);
      return;
    }

    (async () => {
      setLoadingData(true);
      setError(null);
      setAccountOwnerLabel(null);
      try {
        const [dealerRes, configsQuoteRes, configsOrderRes, subsRes, usersRes] = await Promise.all([
          fetchDealerAccountByNumber(dealerNumber),
          listCrmConfigurations({
            role: portalRole,
            sellerId: null,
            dealerNumber,
            documentType: 'quote',
          }),
          listCrmConfigurations({
            role: portalRole,
            sellerId: null,
            dealerNumber,
            documentType: 'order',
          }),
          listPortalFormSubmissions({ formType: 'dealer_invoice_accept', dealerAccountNumber: dealerNumber, limit: 100 }),
          supabase
            .from('app_users')
            .select('id, email, full_name, role, portal_role, status, approved, is_active, last_login, preferred_language, account_owner_initials, account_owner_name, account_owner_email')
            .eq('dealer_number', dealerNumber)
            .order('email', { ascending: true }),
        ]);
        if (cancelled) return;

        if (dealerRes.error) setError(toErrorText(dealerRes.error));
        setDealer(dealerRes.row);

        setQuotes(configsQuoteRes.rows.filter((r) => r.dealer_number === dealerNumber));
        setOrders(configsOrderRes.rows.filter((r) => r.dealer_number === dealerNumber));

        setSubmissions(subsRes ?? []);

        const u = (usersRes.data ?? []) as DealerUserRow[];
        setUsers(u);
        const ownerSource = u.find((row) => row.account_owner_initials || row.account_owner_name || row.account_owner_email);
        setAccountOwnerLabel(formatOwnerLabel(ownerSource));

        // Load extra dealer_contacts once the dealer row is known.
        if (dealerRes.row?.id) {
          const c = await listDealerContacts(dealerRes.row.id);
          if (!cancelled) setContacts(c);
        } else {
          setContacts([]);
        }

        if (dealerRes.row) {
          const machineScope = await buildJournalScope(effectiveUser, portalRole);
          const rows = await listDealerMachineRegister(dealerRes.row, machineScope);
          if (!cancelled) setMachines(rows);
        } else {
          setMachines([]);
        }

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

  const dealerName = dealer?.company_name || effectiveUser?.company_dealer || '—';
  const demoOverviewMachines = useMemo(() => getDemoOverviewMachines(machines), [machines]);
  const displayedMachines = useMemo(() => (
    machineStatusFilter === 'demo_attention' ? demoOverviewMachines : machines
  ), [demoOverviewMachines, machineStatusFilter, machines]);

  // Status label for dealer_invoice_accept submissions
  const acceptLabel = (payload: Record<string, unknown>): { label: string; tone: 'ok' | 'warn' | 'no' } => {
    const decision = String(payload?.decision ?? payload?.beslutning ?? '').toLowerCase();
    if (decision.includes('accept') || decision === 'accepteret' || decision === 'ja') return { label: T.accepted[lang], tone: 'ok' };
    if (decision.includes('afvis') || decision === 'nej')                                 return { label: T.rejected[lang], tone: 'no' };
    if (decision.includes('ikke') || decision.includes('samarbejd'))                      return { label: T.noCoop[lang],    tone: 'warn' };
    return { label: decision || T.unknown[lang], tone: 'warn' };
  };

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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="flex flex-wrap h-auto bg-transparent p-0 border-b border-slate-200 rounded-none gap-1 w-full justify-start">
              {([
                ['overview', T.overview[lang]],
                ['users', `${T.users[lang]} (${users.length + contacts.length})`],
                ['documents', T.documents[lang]],
                ['machines', `${T.machines[lang]} (${machines.length})`],
              ] as const).map(([key, label]) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-semibold text-slate-600 shadow-none data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:text-slate-950 data-[state=active]:shadow-none"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="mt-0 space-y-4">
            {/* 1) Stamdata (read-only) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Hash className="h-5 w-5 text-slate-500" /> {T.stamdata[lang]}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <Field label={T.companyName[lang]} value={dealerName} />
                <Field label={T.accountNo[lang]} value={dealer.account_number || '—'} />
                <Field label={T.dealerType[lang]} value={dealer.customer_type_label || dealer.customer_type || '—'} />
                <Field label={T.country[lang]} value={formatCountry(dealer.country, lang) || '—'} />
                <Field label={T.seller[lang]} value={accountOwnerLabel || formatDealerSellerLabel(dealer) || '—'} />
                <Field label={T.status[lang]} value={dealer.is_blocked ? (<Badge className="bg-rose-600 hover:bg-rose-600 text-white">{T.blocked[lang]}</Badge>) : dealer.is_deleted ? T.deleted[lang] : T.active[lang]} />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
              {/* 3) Dealer profile (Phase 52 — self-service) */}
              <DealerProfileEditor
                dealer={dealer}
                language={lang}
                canEdit={canEditProfile}
                onUpdated={(next) => setDealer(next)}
              />
              <DemoMachinesWidget
                rows={demoOverviewMachines}
                lang={lang}
                t={T}
                onOpenMachines={() => {
                  setMachineStatusFilter('demo_attention');
                  setActiveTab('machines');
                }}
              />
            </div>
            </TabsContent>

            <TabsContent value="users" className="mt-0 space-y-4">
            {/* 2) Registrerede brugere — portal users + dealer_contacts deduped */}
            <Card id="users" className="scroll-mt-24">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-slate-500" /> {T.users[lang]}
                  <Badge variant="secondary" className="ml-1">{users.length + contacts.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RegisteredUsersTable portalUsers={users} contacts={contacts} language={lang} />
              </CardContent>
            </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-0 space-y-4">
            {/* 4) Forhandler accept / Fakturering */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-slate-500" /> {T.accept[lang]}
                  <Badge variant="secondary" className="ml-1">{submissions.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {submissions.length === 0 ? (
                  <p className="text-sm text-slate-500">{T.noSubs[lang]}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase text-slate-500 border-b">
                        <tr>
                          <th className="py-2 pr-4">{T.date[lang]}</th>
                          <th className="py-2 pr-4">{T.companyCust[lang]}</th>
                          <th className="py-2 pr-4">{T.vat[lang]}</th>
                          <th className="py-2 pr-4">{T.decision[lang]}</th>
                          <th className="py-2 pr-4">{T.comment[lang]}</th>
                          <th className="py-2 pr-4">{T.submittedBy[lang]}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submissions.map((s) => {
                          const p = (s.payload || {}) as Record<string, unknown>;
                          const company = (p.company_name ?? p.firma ?? p.customer_name ?? p.customer ?? '—') as string;
                          const cvr = (p.cvr ?? p.vat ?? p.vat_number ?? '—') as string;
                          const comment = (p.comment ?? p.note ?? p.kommentar ?? '') as string;
                          const a = acceptLabel(p);
                          return (
                            <tr key={s.id} className="border-b last:border-0 align-top">
                              <td className="py-2 pr-4 whitespace-nowrap">{fmtDateTime(s.created_at, lang)}</td>
                              <td className="py-2 pr-4">{String(company)}</td>
                              <td className="py-2 pr-4">{String(cvr)}</td>
                              <td className="py-2 pr-4">
                                {a.tone === 'ok' && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 mr-1" />{a.label}</Badge>}
                                {a.tone === 'no' && <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{a.label}</Badge>}
                                {a.tone === 'warn' && <Badge variant="secondary">{a.label}</Badge>}
                              </td>
                              <td className="py-2 pr-4 max-w-[260px]">{String(comment) || '—'}</td>
                              <td className="py-2 pr-4">{s.submitted_by_email || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 5) Åbne tilbud */}
            <DocsTable
              title={T.openQuotes[lang]}
              icon={<FileText className="h-5 w-5 text-slate-500" />}
              rows={quotes}
              numberKey="quote_number"
              showStatus
              lang={lang}
              t={T}
            />

            {/* 6) Lukkede / vundne ordrer */}
            <DocsTable
              title={T.orders[lang]}
              icon={<Package className="h-5 w-5 text-slate-500" />}
              rows={orders}
              numberKey="order_number"
              showStatus
              lang={lang}
              t={T}
            />
            </TabsContent>

            <TabsContent value="machines" className="mt-0 space-y-4">
              <MachineRegisterTable
                rows={displayedMachines}
                allCount={machines.length}
                filter={machineStatusFilter}
                onFilterChange={setMachineStatusFilter}
                lang={lang}
                t={T}
              />
            </TabsContent>
          </Tabs>
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

function lifecycleMeta(row: DealerMachineRegisterRow, lang: Language, t: typeof T) {
  switch (row.lifecycle) {
    case 'active_demo':
      return {
        label: t.activeDemo[lang],
        detail: row.daysRemaining != null ? `${row.daysRemaining} ${t.daysLeft[lang]}` : null,
        badge: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
        icon: <Clock className="h-3.5 w-3.5" />,
      };
    case 'ready_for_sale':
      return {
        label: t.readySale[lang],
        detail: row.demoSaleEligibleAt ? `${t.after9Months[lang]}: ${fmtDate(row.demoSaleEligibleAt, lang)}` : null,
        badge: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      };
    case 'sold_early':
      return {
        label: t.soldEarly[lang],
        detail: row.daysSoldEarly != null ? `${row.daysSoldEarly} ${t.daysEarly[lang]}` : null,
        badge: 'bg-rose-100 text-rose-800 hover:bg-rose-100',
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
      };
    case 'sold_registered':
      return {
        label: t.soldRegistered[lang],
        detail: row.warrantyRegistrationDate ? fmtDate(row.warrantyRegistrationDate, lang) : null,
        badge: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      };
    case 'demo_missing_delivery':
      return {
        label: t.deliveryMissing[lang],
        detail: null,
        badge: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
      };
    default:
      return {
        label: t.normalMachine[lang],
        detail: null,
        badge: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
        icon: null,
      };
  }
}

function DemoMachinesWidget({
  rows, lang, t, onOpenMachines,
}: {
  rows: DealerMachineRegisterRow[];
  lang: Language;
  t: typeof T;
  onOpenMachines: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Wrench className="h-5 w-5 text-slate-500" /> {t.demoMachines[lang]}
          <Badge variant="secondary" className="ml-1">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">{t.demoNone[lang]}</p>
        ) : (
          <div className="space-y-2">
            {rows.slice(0, 4).map((row) => {
              const meta = lifecycleMeta(row, lang, t);
              return (
                <div key={row.normalizedSerial} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-sm font-semibold text-slate-900">{row.serial}</div>
                      <div className="text-xs text-slate-500">{row.machineModel || row.machineType || '—'}</div>
                    </div>
                    <Badge className={`${meta.badge} inline-flex gap-1`}>
                      {meta.icon}{meta.label}
                    </Badge>
                  </div>
                  {meta.detail && <div className="mt-1 text-xs text-slate-600">{meta.detail}</div>}
                </div>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={onOpenMachines}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t.viewMachines[lang]}
        </button>
      </CardContent>
    </Card>
  );
}

function MachineRegisterTable({
  rows, allCount, filter, onFilterChange, lang, t,
}: {
  rows: DealerMachineRegisterRow[];
  allCount: number;
  filter: 'all' | 'demo_attention';
  onFilterChange: (next: 'all' | 'demo_attention') => void;
  lang: Language;
  t: typeof T;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wrench className="h-5 w-5 text-slate-500" /> {t.machines[lang]}
            <Badge variant="secondary" className="ml-1">{allCount}</Badge>
          </CardTitle>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
            <button
              type="button"
              onClick={() => onFilterChange('all')}
              className={`rounded-md px-3 py-1.5 font-semibold ${filter === 'all' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}
            >
              {t.all[lang]}
            </button>
            <button
              type="button"
              onClick={() => onFilterChange('demo_attention')}
              className={`rounded-md px-3 py-1.5 font-semibold ${filter === 'demo_attention' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}
            >
              {t.demoMachines[lang]}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">{t.noEntries[lang]}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500 border-b">
                <tr>
                  <th className="py-2 pr-4">{t.serial[lang]}</th>
                  <th className="py-2 pr-4">{t.model[lang]}</th>
                  <th className="py-2 pr-4">{t.orderNo[lang]}</th>
                  <th className="py-2 pr-4">{t.delivery[lang]}</th>
                  <th className="py-2 pr-4">{t.dealerType[lang]}</th>
                  <th className="py-2 pr-4">{t.customer[lang]}</th>
                  <th className="py-2 pr-4">{t.warranty[lang]}</th>
                  <th className="py-2 pr-4">{t.lifecycle[lang]}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const meta = lifecycleMeta(row, lang, t);
                  return (
                    <tr key={row.normalizedSerial} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-4 font-mono font-semibold whitespace-nowrap">{row.serial}</td>
                      <td className="py-2 pr-4">{row.machineModel || row.machineType || '—'}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{row.orderNumber || '—'}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(row.deliveryDate, lang)}</td>
                      <td className="py-2 pr-4">{row.machineKind === 'demo' ? 'Demo' : t.normalMachine[lang]}</td>
                      <td className="py-2 pr-4">{row.customerName || '—'}</td>
                      <td className="py-2 pr-4">
                        <div>{row.warrantyCertificate || '—'}</div>
                        {row.warrantyRegistrationDate && <div className="text-xs text-slate-500">{fmtDate(row.warrantyRegistrationDate, lang)}</div>}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge className={`${meta.badge} inline-flex gap-1`}>
                          {meta.icon}{meta.label}
                        </Badge>
                        {meta.detail && <div className="mt-1 text-xs text-slate-500">{meta.detail}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function DocsTable({
  title, icon, rows, numberKey, showStatus, lang, t,
}: {
  title: string;
  icon: React.ReactNode;
  rows: CrmConfigurationRow[];
  numberKey: 'quote_number' | 'order_number';
  showStatus?: boolean;
  lang: Language;
  t: typeof T;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          {icon} {title}
          <Badge variant="secondary" className="ml-1">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">{t.noEntries[lang]}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500 border-b">
                <tr>
                  <th className="py-2 pr-4">{t.number[lang]}</th>
                  <th className="py-2 pr-4">{t.title[lang]}</th>
                  <th className="py-2 pr-4">{t.created[lang]}</th>
                  {showStatus && <th className="py-2 pr-4">{t.status[lang]}</th>}
                  <th className="py-2 pr-4 text-right">{t.amount[lang]}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap">{r[numberKey] || '—'}</td>
                    <td className="py-2 pr-4">{r.title || '—'}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(r.created_at, lang)}</td>
                    {showStatus && <td className="py-2 pr-4">{r.case_status || r.status || '—'}</td>}
                    <td className="py-2 pr-4 text-right">{fmtMoney(r.total_price, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
