/**
 * CRM Quotes & Orders pages.
 *
 * Lists configurator quotes (or orders) the current user is allowed to see,
 * scoped via crmConfigurationsService.ts. Rendered by both /portal/crm/quotes
 * and /portal/crm/orders via the `mode` prop.
 *
 * No pricing, configurator, PDF or webhook logic is touched here.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, ShoppingCart, Search, AlertTriangle, Pencil, Trash2, ExternalLink, History, CalendarDays, Eye, ArrowDown, ArrowUp, Check, ChevronsUpDown, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import CrmLayout from '@/components/crm/CrmLayout';
import EditOrderContactModal from '@/components/crm/EditOrderContactModal';
import EditOrderTimelineModal from '@/components/crm/EditOrderTimelineModal';
import SubmittedOrderRevisionHistoryModal from '@/components/crm/SubmittedOrderRevisionHistoryModal';
import ReadOnlyOrderConfirmationModal from '@/components/crm/ReadOnlyOrderConfirmationModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { loadSubmittedOrderConfirmation } from '@/lib/configurationsService';
import { useAppUser, type SessionUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { buildJournalScope } from '@/lib/machineJournalScope';
import { isExternalCrmRole } from '@/lib/crmScope';
import { getActiveSellerView } from '@/lib/activeMode';
import {
  listCrmConfigurations,
  fetchCrmConfigurationVisible,
  permanentlyDeleteConfiguration,
  getCrmConfigurationDeepLink,
  getCrmConfigurationLeadDeepLink,
  CrmConfigurationRow,
  CrmConfigurationFilter,
  CrmDocumentType,
} from '@/lib/crmConfigurationsService';
import { isSavedConfigurationOrderLocked, loadConfigurationByIdUnscoped, type SavedConfiguration } from '@/lib/configurationsService';
import { Language } from '@/types/configurator';
import {
  DEFAULT_CRM_DOCUMENT_FILTERS,
  buildCrmDocumentCountries,
  buildCrmDocumentDealerOptions,
  buildCrmDocumentStatuses,
  crmDocumentDealerLabel,
  crmDocumentNumber,
  crmDocumentSentAt,
  crmDocumentStatus,
  filterAndSortCrmDocuments,
  type CrmDocumentDealerOption,
  type CrmDocumentSort,
} from '@/lib/crmDocumentListFilters';

interface Props { mode: CrmDocumentType }

const T: Record<string, Record<Language, string>> = {
  title_quotes: { da: 'Tilbud', en: 'Quotes', de: 'Angebote', it: 'Preventivi', hu: 'Árajánlatok' },
  title_orders: { da: 'Ordrer', en: 'Orders', de: 'Aufträge', it: 'Ordini', hu: 'Rendelések' },
  subtitle_quotes: {
    da: 'Tilbud oprettet via Timan-konfiguratoren.',
    en: 'Quotes created from the Timan configurator.',
    de: 'Im Konfigurator erstellte Angebote.',
    it: 'Preventivi creati dal configuratore.',
    hu: 'A Timan konfigurátorban készült árajánlatok.',
  },
  subtitle_orders: {
    da: 'Ordrer oprettet via Timan-konfiguratoren.',
    en: 'Orders created from the Timan configurator.',
    de: 'Im Konfigurator erstellte Aufträge.',
    it: 'Ordini creati dal configuratore.',
    hu: 'A Timan konfigurátorban készült rendelések.',
  },
  search: { da: 'Søg…', en: 'Search…', de: 'Suchen…', it: 'Cerca…', hu: 'Keresés…' },
  all_dealers: { da: 'Alle forhandlere', en: 'All dealers', de: 'Alle Händler', it: 'Tutti i rivenditori', hu: 'Minden kereskedő' },
  search_dealer: { da: 'Søg forhandler eller kontonr.', en: 'Search dealer or account no.', de: 'Händler oder Kontonr. suchen', it: 'Cerca rivenditore o conto', hu: 'Kereskedő vagy ügyfélszám keresése' },
  no_dealers: { da: 'Ingen forhandlere fundet.', en: 'No dealers found.', de: 'Keine Händler gefunden.', it: 'Nessun rivenditore trovato.', hu: 'Nem található kereskedő.' },
  all_countries: { da: 'Alle lande', en: 'All countries', de: 'Alle Länder', it: 'Tutti i paesi', hu: 'Minden ország' },
  all_statuses: { da: 'Alle statusser', en: 'All statuses', de: 'Alle Status', it: 'Tutti gli stati', hu: 'Minden állapot' },
  sorting: { da: 'Sortering', en: 'Sorting', de: 'Sortierung', it: 'Ordinamento', hu: 'Rendezés' },
  sort_standard: { da: 'Standardvisning', en: 'Default view', de: 'Standardansicht', it: 'Vista standard', hu: 'Alapértelmezett nézet' },
  sort_newest: { da: 'Nyeste først', en: 'Newest first', de: 'Neueste zuerst', it: 'Più recenti', hu: 'Legújabb elöl' },
  sort_oldest: { da: 'Ældste først', en: 'Oldest first', de: 'Älteste zuerst', it: 'Meno recenti', hu: 'Legrégebbi elöl' },
  sort_sent_newest: { da: 'Senest sendt først', en: 'Most recently sent', de: 'Zuletzt gesendet', it: 'Ultimo invio', hu: 'Legutóbb küldött' },
  sort_sent_oldest: { da: 'Ældst sendt først', en: 'Oldest sent first', de: 'Älteste Sendung', it: 'Primo invio', hu: 'Legrégebben küldött' },
  sort_number_asc: { da: 'Nummer stigende', en: 'Number ascending', de: 'Nummer aufsteigend', it: 'Numero crescente', hu: 'Szám szerint növekvő' },
  sort_number_desc: { da: 'Nummer faldende', en: 'Number descending', de: 'Nummer absteigend', it: 'Numero decrescente', hu: 'Szám szerint csökkenő' },
  sort_dealer_asc: { da: 'Forhandler A–Å', en: 'Dealer A–Z', de: 'Händler A–Z', it: 'Rivenditore A–Z', hu: 'Kereskedő A–Z' },
  sort_dealer_desc: { da: 'Forhandler Å–A', en: 'Dealer Z–A', de: 'Händler Z–A', it: 'Rivenditore Z–A', hu: 'Kereskedő Z–A' },
  reset_filters: { da: 'Nulstil filtre', en: 'Reset filters', de: 'Filter zurücksetzen', it: 'Reimposta filtri', hu: 'Szűrők törlése' },
  status_submitted: { da: 'Ordre afgivet', en: 'Order submitted', de: 'Auftrag aufgegeben', it: 'Ordine inviato', hu: 'Rendelés leadva' },
  status_sent: { da: 'Sendt', en: 'Sent', de: 'Gesendet', it: 'Inviato', hu: 'Elküldve' },
  status_active: { da: 'Aktiv', en: 'Active', de: 'Aktiv', it: 'Attivo', hu: 'Aktív' },
  status_paused: { da: 'Pause', en: 'Paused', de: 'Pausiert', it: 'In pausa', hu: 'Szünetel' },
  status_unknown: { da: 'Ukendt', en: 'Unknown', de: 'Unbekannt', it: 'Sconosciuto', hu: 'Ismeretlen' },
  empty_quotes: {
    da: 'Ingen tilbud at vise. Opret et tilbud i konfiguratoren.',
    en: 'No quotes to show. Create one in the configurator.',
    de: 'Keine Angebote vorhanden.',
    it: 'Nessun preventivo da mostrare.',
    hu: 'Nincs megjeleníthető árajánlat.',
  },
  empty_orders: {
    da: 'Ingen ordrer at vise. Opret en ordre i konfiguratoren.',
    en: 'No orders to show. Create one in the configurator.',
    de: 'Keine Aufträge vorhanden.',
    it: 'Nessun ordine da mostrare.',
    hu: 'Nincs megjeleníthető rendelés.',
  },
  col_number: { da: 'Nummer', en: 'Number', de: 'Nummer', it: 'Numero', hu: 'Szám' },
  col_order_number: { da: 'Ordrenr.', en: 'Order no.', de: 'Auftragsnr.', it: 'N. ordine', hu: 'Rendelésszám' },
  col_quote_number: { da: 'Tilbudsnr.', en: 'Quote no.', de: 'Angebotsnr.', it: 'N. preventivo', hu: 'Ajánlatszám' },
  col_title: { da: 'Titel', en: 'Title', de: 'Titel', it: 'Titolo', hu: 'Cím' },
  col_seller: { da: 'Sælger', en: 'Seller', de: 'Verkäufer', it: 'Venditore', hu: 'Értékesítő' },
  col_dealer: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő' },
  col_status: { da: 'Status', en: 'Status', de: 'Status', it: 'Stato', hu: 'Státusz' },
  col_expected_delivery: { da: 'Forventet levering', en: 'Expected delivery', de: 'Voraussichtliche Lieferung', it: 'Consegna prevista', hu: 'Várható szállítás' },
  col_purchase_order: { da: 'REK./PO nr.', en: 'Requisition / PO no.', de: 'Bestellreferenz / PO-Nr.', it: 'Riferimento / n. PO', hu: 'Beszerzési / PO-szám' },
  col_created: { da: 'Oprettet', en: 'Created', de: 'Erstellt', it: 'Creato', hu: 'Létrehozva' },
  col_sent: { da: 'Sendt', en: 'Sent', de: 'Gesendet', it: 'Inviato', hu: 'Elküldve' },
  col_actions: { da: 'Handling', en: 'Actions', de: 'Aktionen', it: 'Azioni', hu: 'Műveletek' },
  open_configurator: { da: 'Åbn i Configurator', en: 'Open in Configurator', de: 'Im Konfigurator öffnen', it: 'Apri nel Configuratore', hu: 'Megnyitás a konfigurátorban' },
  open_lead: { da: 'Åbn Lead', en: 'Open Lead', de: 'Lead öffnen', it: 'Apri lead', hu: 'Lead megnyitása' },
  no_linked_lead: { da: 'Intet tilknyttet lead', en: 'No linked lead', de: 'Kein verknüpfter Lead', it: 'Nessun lead collegato', hu: 'Nincs kapcsolt lead' },
  count_label: { da: 'rækker', en: 'rows', de: 'Zeilen', it: 'righe', hu: 'sor' },
  scope_backend: { da: 'Viser alle (Backend)', en: 'Showing all (Backend)', de: 'Alle (Backend)', it: 'Tutti (Backend)', hu: 'Mind (Backend)' },
  scope_seller: { da: 'Viser kun egne', en: 'Showing only own', de: 'Nur eigene', it: 'Solo i propri', hu: 'Csak sajátok' },
  scope_dealer: { da: 'Viser kun egen forhandler', en: 'Showing only own dealer', de: 'Nur eigener Händler', it: 'Solo proprio rivenditore', hu: 'Csak saját kereskedő' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('da-DK'); } catch { return '—'; }
}

function statusBadge(row: CrmConfigurationRow, mode: CrmDocumentType, lang: Language): { label: string; cls: string } {
  const status = crmDocumentStatus(row, mode);
  if (status === 'submitted' || status === 'ordre_afgivet') return { label: T.status_submitted[lang], cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (status === 'sent') return { label: T.status_sent[lang], cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (status === 'pause') return { label: T.status_paused[lang], cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (status === 'aktiv') return { label: T.status_active[lang], cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  return { label: statusFilterLabel(status, lang), cls: 'bg-slate-50 text-slate-700 border-slate-200' };
}

function statusFilterLabel(status: string, lang: Language): string {
  if (status === 'submitted' || status === 'ordre_afgivet') return T.status_submitted[lang];
  if (status === 'sent') return T.status_sent[lang];
  if (status === 'aktiv') return T.status_active[lang];
  if (status === 'pause') return T.status_paused[lang];
  if (status === 'unknown') return T.status_unknown[lang];
  return status.replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function DealerFilter({
  dealers,
  value,
  onChange,
  lang,
}: {
  dealers: CrmDocumentDealerOption[];
  value: string;
  onChange: (value: string) => void;
  lang: Language;
}) {
  const [open, setOpen] = useState(false);
  const selected = dealers.find((dealer) => dealer.key === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={T.all_dealers[lang]}
          aria-expanded={open}
          className="inline-flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 xl:w-[210px]"
        >
          <span className="truncate">
            {selected
              ? `${selected.label}${selected.accountNumber ? ` · ${selected.accountNumber}` : ''}`
              : T.all_dealers[lang]}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[330px] max-w-[calc(100vw-2rem)] p-0">
        <Command>
          <CommandInput placeholder={T.search_dealer[lang]} />
          <CommandList>
            <CommandEmpty>{T.no_dealers[lang]}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={T.all_dealers[lang]}
                onSelect={() => { onChange('all'); setOpen(false); }}
              >
                <Check className={`mr-2 h-4 w-4 ${value === 'all' ? 'opacity-100' : 'opacity-0'}`} />
                {T.all_dealers[lang]}
              </CommandItem>
              {dealers.map((dealer) => (
                <CommandItem
                  key={dealer.key}
                  value={`${dealer.label} ${dealer.accountNumber ?? ''}`}
                  onSelect={() => { onChange(dealer.key); setOpen(false); }}
                >
                  <Check className={`mr-2 h-4 w-4 ${value === dealer.key ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{dealer.label}</span>
                    {dealer.accountNumber && <span className="block text-[11px] text-slate-500">{dealer.accountNumber}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick: () => void;
}) {
  const DirectionIcon = direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
    >
      {label}
      <DirectionIcon className={`h-3 w-3 ${active ? 'opacity-100' : 'opacity-25'}`} />
    </button>
  );
}

export default function CrmQuotesOrdersPage({ mode }: Props) {
  const { appUser } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  const { language: lang } = useLanguage();
  const portalRole = derivePortalRole(effectiveUser);
  const effectiveUserEmail = effectiveUser?.email ?? null;
  const effectiveUserDisplayName = effectiveUser?.display_name ?? null;
  const effectiveUserPortalRole = effectiveUser?.portal_role ?? null;
  const effectiveUserRole = effectiveUser?.role ?? null;
  const effectiveUserPartnerType = effectiveUser?.partner_type ?? null;
  const effectiveDealerNumber = effectiveUser?.dealer_number ?? null;
  const effectiveCompanyDealer = effectiveUser?.company_dealer ?? null;
  const effectiveOrganizationAccessRole = effectiveUser?.organization_access_role ?? null;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dealerParam = searchParams.get('dealer') || '';

  const [rows, setRows] = useState<CrmConfigurationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(dealerParam);
  const [dealerFilter, setDealerFilter] = useState(DEFAULT_CRM_DOCUMENT_FILTERS.dealerKey);
  const [countryFilter, setCountryFilter] = useState(DEFAULT_CRM_DOCUMENT_FILTERS.country);
  const [statusFilter, setStatusFilter] = useState(DEFAULT_CRM_DOCUMENT_FILTERS.status);
  const [sort, setSort] = useState<CrmDocumentSort>(DEFAULT_CRM_DOCUMENT_FILTERS.sort);
  const [reloadKey, setReloadKey] = useState(0);
  const [editingRow, setEditingRow] = useState<CrmConfigurationRow | null>(null);
  const [editingTimelineRow, setEditingTimelineRow] = useState<CrmConfigurationRow | null>(null);
  const [revisionRow, setRevisionRow] = useState<CrmConfigurationRow | null>(null);
  const [openedOrder, setOpenedOrder] = useState<SavedConfiguration | null>(null);
  const [openingOrderId, setOpeningOrderId] = useState<string | null>(null);
  const [deletingRow, setDeletingRow] = useState<CrmConfigurationRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => { if (dealerParam) setSearch(dealerParam); }, [dealerParam]);

  const isBackendFull = portalRole === 'timan_backend' && !getActiveSellerView(appUser?.email);
  const isSeller = portalRole === 'timan_seller';
  // `portalRole` is derived from the effective user, so this remains hidden
  // when Backend is viewing the portal with a seller or external scope.
  const canEditOrderContacts = portalRole === 'timan_backend' && mode === 'order';
  const canReopenSubmittedOrder = isBackendFull && mode === 'order';
  const canOpenSubmittedOrder = mode === 'order' && (portalRole === 'timan_backend' || portalRole === 'timan_seller');
  // Soft-delete UI is Backend-only and hidden in seller-view mode / external roles.
  const canDelete = isBackendFull;

  // buildJournalScope only needs these external identity fields. Keeping this
  // stable avoids reloading CRM lists when View-as supplies a new object ref.
  const effectiveScopeUser = useMemo<SessionUser | null>(() => {
    if (!effectiveUserEmail) return null;
    return {
      email: effectiveUserEmail,
      display_name: effectiveUserDisplayName ?? undefined,
      dealer_number: effectiveDealerNumber,
      company_dealer: effectiveCompanyDealer,
      organization_access_role: effectiveOrganizationAccessRole,
    } as SessionUser;
  }, [
    effectiveCompanyDealer,
    effectiveDealerNumber,
    effectiveOrganizationAccessRole,
    effectiveUserDisplayName,
    effectiveUserEmail,
  ]);

  const buildCurrentCrmScope = useCallback(async (): Promise<Omit<CrmConfigurationFilter, 'documentType'>> => {
    const sellerId = await resolveSellerId(appUser?.email);
    const sellerView = getActiveSellerView(appUser?.email);
    const sellerInitials = sellerView?.initials
      ?? (isSeller && appUser?.display_name ? appUser.display_name.match(/^([A-ZÆØÅ]{2,4})/)?.[1] ?? null : null);
    const sellerEmail = sellerView?.email ?? (isSeller ? appUser?.email?.toLowerCase() ?? null : null);
    const dealerNumbers = isExternalCrmRole(portalRole)
      ? Array.from((await buildJournalScope(effectiveScopeUser, portalRole)).dealerNumbers)
      : null;
    return {
      role: portalRole,
      sellerId,
      sellerInitials,
      sellerEmail,
      dealerNumber: effectiveDealerNumber,
      dealerNumbers,
    };
  }, [appUser?.display_name, appUser?.email, effectiveDealerNumber, effectiveScopeUser, isSeller, portalRole]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const scope = await buildCurrentCrmScope();

      const { rows: fetched, error: err } = await listCrmConfigurations({
        ...scope,
        documentType: mode,
      });
      if (cancelled) return;
      if (err) setError(err);
      setRows(fetched);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [
    buildCurrentCrmScope,
    effectiveUserEmail,
    effectiveUserDisplayName,
    effectiveUserPortalRole,
    effectiveUserRole,
    effectiveUserPartnerType,
    mode,
    reloadKey,
  ]);

  const handleRowClick = useCallback((r: CrmConfigurationRow) => {
    if (canEditOrderContacts) setEditingRow(r);
  }, [canEditOrderContacts]);

  const handleOpenSubmittedOrder = useCallback(async (row: CrmConfigurationRow) => {
    if (openingOrderId) return;
    setOpeningOrderId(row.id);
    try {
      // View-as runs under the Backend JWT, so enforce the effective CRM
      // scope before loading the full persisted snapshot.
      const scope = await buildCurrentCrmScope();
      const { row: visible, error: visibilityError } = await fetchCrmConfigurationVisible(row.id, scope);
      if (visibilityError || !visible) {
        toast.error('Du har ikke adgang til denne ordre.');
        return;
      }
      const ownerEmail = effectiveUserEmail ?? appUser?.email ?? '';
      if (!ownerEmail) {
        toast.error('Kunne ikke identificere den aktuelle portalbruger.');
        return;
      }
      const saved = await loadSubmittedOrderConfirmation(row.id, ownerEmail, effectiveUser?.id);
      if (!saved || !isSavedConfigurationOrderLocked(saved)) {
        toast.error('Kunne ikke indlæse den afsendte ordre.');
        return;
      }
      setOpenedOrder(saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunne ikke indlæse ordrebekræftelsen.');
    } finally {
      setOpeningOrderId(null);
    }
  }, [appUser?.email, buildCurrentCrmScope, effectiveUserEmail, effectiveUser?.id, openingOrderId]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingRow) return;
    setDeleteBusy(true);
    const { error: delErr } = await permanentlyDeleteConfiguration(deletingRow.id);
    setDeleteBusy(false);
    if (delErr) {
      console.error('[CrmQuotesOrdersPage] delete failed', delErr);
      toast.error('Kunne ikke slette. Prøv igen.');
      return;
    }

    const isOrder = mode === 'order';
    setRows((prev) => prev.filter((x) => x.id !== deletingRow.id));
    toast.success(isOrder ? 'Ordren er slettet.' : 'Tilbuddet er slettet.');
    setDeletingRow(null);
    setReloadKey((k) => k + 1);
  }, [deletingRow, mode]);

  const dealerOptions = useMemo(() => buildCrmDocumentDealerOptions(rows), [rows]);
  const countryOptions = useMemo(() => buildCrmDocumentCountries(rows), [rows]);
  const statusOptions = useMemo(() => buildCrmDocumentStatuses(rows, mode), [mode, rows]);
  useEffect(() => {
    if (dealerFilter !== 'all' && !dealerOptions.some((dealer) => dealer.key === dealerFilter)) setDealerFilter('all');
    if (countryFilter !== 'all' && !countryOptions.includes(countryFilter)) setCountryFilter('all');
    if (statusFilter !== 'all' && !statusOptions.includes(statusFilter)) setStatusFilter('all');
  }, [countryFilter, countryOptions, dealerFilter, dealerOptions, statusFilter, statusOptions]);
  const filtered = useMemo(() => filterAndSortCrmDocuments(rows, {
    search,
    dealerKey: dealerFilter,
    country: countryFilter,
    status: statusFilter,
    sort,
  }, mode), [countryFilter, dealerFilter, mode, rows, search, sort, statusFilter]);
  const filtersActive = Boolean(
    search.trim()
    || dealerFilter !== 'all'
    || countryFilter !== 'all'
    || statusFilter !== 'all'
    || sort !== 'standard',
  );

  const resetFilters = useCallback(() => {
    setSearch('');
    setDealerFilter(DEFAULT_CRM_DOCUMENT_FILTERS.dealerKey);
    setCountryFilter(DEFAULT_CRM_DOCUMENT_FILTERS.country);
    setStatusFilter(DEFAULT_CRM_DOCUMENT_FILTERS.status);
    setSort(DEFAULT_CRM_DOCUMENT_FILTERS.sort);
  }, []);

  const toggleSort = useCallback((ascending: CrmDocumentSort, descending: CrmDocumentSort) => {
    setSort((current) => current === ascending ? descending : ascending);
  }, []);

  const titleKey = mode === 'order' ? 'title_orders' : 'title_quotes';
  const subtitleKey = mode === 'order' ? 'subtitle_orders' : 'subtitle_quotes';
  const emptyKey = mode === 'order' ? 'empty_orders' : 'empty_quotes';
  const Icon = mode === 'order' ? ShoppingCart : FileText;

  const scopeLabel = isBackendFull ? T.scope_backend[lang]
    : isSeller || getActiveSellerView(appUser?.email) ? T.scope_seller[lang]
    : T.scope_dealer[lang];

  return (
    <CrmLayout pageTitle={T[titleKey][lang]}>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-[#2d5a27] border border-emerald-100 flex items-center justify-center">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{T[titleKey][lang]}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{T[subtitleKey][lang]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-3 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
              {scopeLabel}
            </span>
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              {filtersActive ? `${filtered.length} af ${rows.length}` : filtered.length} {T.count_label[lang]}
            </span>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center">
          <div className="relative min-w-0 sm:col-span-2 xl:w-[260px] xl:shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={T.search[lang]}
              aria-label={T.search[lang]}
              className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <DealerFilter
            dealers={dealerOptions}
            value={dealerFilter}
            onChange={setDealerFilter}
            lang={lang}
          />

          <select
            value={countryFilter}
            onChange={(event) => setCountryFilter(event.target.value)}
            aria-label={T.all_countries[lang]}
            className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 xl:w-[150px]"
          >
            <option value="all">{T.all_countries[lang]}</option>
            {countryOptions.map((country) => <option key={country} value={country}>{country}</option>)}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label={T.all_statuses[lang]}
            className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 xl:w-[155px]"
          >
            <option value="all">{T.all_statuses[lang]}</option>
            {statusOptions.map((status) => <option key={status} value={status}>{statusFilterLabel(status, lang)}</option>)}
          </select>

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as CrmDocumentSort)}
            aria-label={T.sorting[lang]}
            className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 xl:w-[180px]"
          >
            <option value="standard">{T.sort_standard[lang]}</option>
            <option value="date-desc">{T.sort_newest[lang]}</option>
            <option value="date-asc">{T.sort_oldest[lang]}</option>
            <option value="sent-desc">{T.sort_sent_newest[lang]}</option>
            <option value="sent-asc">{T.sort_sent_oldest[lang]}</option>
            <option value="number-asc">{T.sort_number_asc[lang]}</option>
            <option value="number-desc">{T.sort_number_desc[lang]}</option>
            <option value="dealer-asc">{T.sort_dealer_asc[lang]}</option>
            <option value="dealer-desc">{T.sort_dealer_desc[lang]}</option>
          </select>

          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:justify-self-start"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {T.reset_filters[lang]}
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 mb-3">
              <Icon className="h-6 w-6" />
            </div>
            <p className="text-sm text-slate-500">{T[emptyKey][lang]}</p>
            <Link to="/configurator" className="inline-block mt-3 text-sm font-medium text-[#2d5a27] hover:underline">
              → Konfigurator
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="text-left px-3 py-2 font-semibold">
                    <SortableHeader
                      label={mode === 'order' ? T.col_order_number[lang] : T.col_quote_number[lang]}
                      active={sort === 'number-asc' || sort === 'number-desc'}
                      direction={sort === 'number-desc' ? 'desc' : 'asc'}
                      onClick={() => toggleSort('number-asc', 'number-desc')}
                    />
                  </th>
                  {mode === 'order' && (
                    <th className="text-left px-3 py-2 font-semibold">{T.col_quote_number[lang]}</th>
                  )}
                  <th className="text-left px-3 py-2 font-semibold">{T.col_title[lang]}</th>
                  <th className="text-left px-3 py-2 font-semibold">{T.col_seller[lang]}</th>
                  <th className="text-left px-3 py-2 font-semibold">
                    <SortableHeader
                      label={T.col_dealer[lang]}
                      active={sort === 'dealer-asc' || sort === 'dealer-desc'}
                      direction={sort === 'dealer-desc' ? 'desc' : 'asc'}
                      onClick={() => toggleSort('dealer-asc', 'dealer-desc')}
                    />
                  </th>
                  <th className="text-left px-3 py-2 font-semibold">{T.col_status[lang]}</th>
                  {mode === 'order' && <th className="text-left px-3 py-2 font-semibold">{T.col_expected_delivery[lang]}</th>}
                  {mode === 'order' && <th className="hidden px-3 py-2 text-left font-semibold sm:table-cell">{T.col_purchase_order[lang]}</th>}
                  <th className="text-left px-3 py-2 font-semibold">
                    <SortableHeader
                      label={T.col_created[lang]}
                      active={sort === 'date-asc' || sort === 'date-desc'}
                      direction={sort === 'date-desc' ? 'desc' : 'asc'}
                      onClick={() => toggleSort('date-asc', 'date-desc')}
                    />
                  </th>
                  <th className="text-left px-3 py-2 font-semibold">
                    <SortableHeader
                      label={T.col_sent[lang]}
                      active={sort === 'sent-asc' || sort === 'sent-desc'}
                      direction={sort === 'sent-desc' ? 'desc' : 'asc'}
                      onClick={() => toggleSort('sent-asc', 'sent-desc')}
                    />
                  </th>
                  {mode === 'quote' && <th className="text-left px-3 py-2 font-semibold">{T.col_actions[lang]}</th>}
                  {canOpenSubmittedOrder && <th className="px-3 py-2 font-semibold">{T.col_actions[lang]}</th>}
                  {canEditOrderContacts && <th className="px-3 py-2 font-semibold w-24"></th>}
                  {canDelete && <th className="px-3 py-2 font-semibold w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const number = crmDocumentNumber(r, mode);
                  const sentAt = crmDocumentSentAt(r, mode);
                  const badge = statusBadge(r, mode, lang);
                  const dealerLabel = crmDocumentDealerLabel(r);
                  const configuratorHref = getCrmConfigurationDeepLink(r);
                  const leadHref = getCrmConfigurationLeadDeepLink(r);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => handleRowClick(r)}
                      className={`border-b border-slate-100 hover:bg-slate-50/60 ${canEditOrderContacts ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-3 py-2.5 font-mono text-[12px] text-slate-700 whitespace-nowrap">
                        {number}
                        {mode === 'order' && r.purchase_order_number && (
                          <span className="mt-0.5 block font-sans text-[11px] text-slate-500" title={r.purchase_order_numbers.join(', ') || undefined}>REK./PO: {r.purchase_order_number}</span>
                        )}
                      </td>
                      {mode === 'order' && (
                        <td className="px-3 py-2.5 font-mono text-[12px] text-slate-700 whitespace-nowrap">
                          {r.quote_number || '—'}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-slate-800 max-w-[280px]">
                        <span className="block truncate" title={r.title || undefined}>{r.title || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                        {r.seller_initials || r.seller_name || r.seller_email || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 max-w-[260px] truncate">
                        {dealerLabel}
                        {r.dealer_country && <span className="ml-1 text-[11px] text-slate-400">· {r.dealer_country}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex text-[11px] px-2 py-0.5 rounded-full border font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      {mode === 'order' && <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(r.delivery_date)}</td>}
                      {mode === 'order' && <td className="hidden px-3 py-2.5 font-mono text-[12px] text-slate-600 sm:table-cell" title={r.purchase_order_numbers.join(', ') || undefined}>{r.purchase_order_number || '—'}</td>}
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(sentAt)}</td>
                      {mode === 'quote' && (
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); navigate(configuratorHref); }}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-[12px] font-medium text-[#2d5a27] hover:bg-emerald-50"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {T.open_configurator[lang]}
                            </button>
                            <button
                              type="button"
                              disabled={!leadHref}
                              onClick={(e) => { e.stopPropagation(); if (leadHref) navigate(leadHref); }}
                              title={!leadHref ? T.no_linked_lead[lang] : undefined}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-400"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {T.open_lead[lang]}
                            </button>
                          </div>
                        </td>
                      )}
                      {canOpenSubmittedOrder && (
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); void handleOpenSubmittedOrder(r); }}
                            disabled={openingOrderId === r.id}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-[12px] font-medium text-[#2d5a27] hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {openingOrderId === r.id ? '…' : 'Åbn'}
                          </button>
                        </td>
                      )}
                      {canEditOrderContacts && (
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingRow(r); }}
                              className="inline-flex items-center gap-1 text-[12px] text-slate-600 hover:text-[#2d5a27]"
                              title="Redigér ordreoplysninger"
                              aria-label="Redigér ordreoplysninger"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingTimelineRow(r); }}
                              className="inline-flex items-center gap-1 text-[12px] text-slate-600 hover:text-[#2d5a27]"
                              title="Redigér oprettet og sendt"
                              aria-label="Redigér oprettet og sendt"
                            >
                              <CalendarDays className="h-3.5 w-3.5" />
                            </button>
                            {canReopenSubmittedOrder && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigate(`${configuratorHref}&orderCorrection=1`); }}
                                className="inline-flex items-center gap-1 text-[12px] text-slate-600 hover:text-[#2d5a27]"
                                title="Åbn i Configurator"
                                aria-label="Åbn i Configurator"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canReopenSubmittedOrder && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setRevisionRow(r); }}
                                className="inline-flex items-center gap-1 text-[12px] text-slate-600 hover:text-[#2d5a27]"
                                title="Revisionshistorik"
                                aria-label="Revisionshistorik"
                              >
                                <History className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                      {canDelete && (
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDeletingRow(r); }}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-red-600 hover:bg-red-50 hover:text-red-700"
                            title={mode === 'order' ? 'Slet ordre' : 'Slet tilbud'}
                            aria-label={mode === 'order' ? 'Slet ordre' : 'Slet tilbud'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingRow && (
        <EditOrderContactModal
          row={editingRow}
          canEdit={canEditOrderContacts}
          onClose={() => setEditingRow(null)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
      {editingTimelineRow && (
        <EditOrderTimelineModal
          row={editingTimelineRow}
          canEdit={canEditOrderContacts}
          onClose={() => setEditingTimelineRow(null)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
      {revisionRow && <SubmittedOrderRevisionHistoryModal row={revisionRow} onClose={() => setRevisionRow(null)} />}
      {openedOrder && <ReadOnlyOrderConfirmationModal order={openedOrder} onClose={() => setOpenedOrder(null)} />}

      <AlertDialog
        open={!!deletingRow}
        onOpenChange={(open) => { if (!open && !deleteBusy) setDeletingRow(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {mode === 'order' ? 'Slet ordre permanent?' : 'Slet tilbud permanent?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {mode === 'order'
                ? 'Ordren slettes permanent fra Timan-systemet og fjernes fra CRM, Dashboard og Budget. Handlingen kan ikke fortrydes.'
                : 'Tilbuddet slettes permanent fra Timan-systemet og fjernes fra CRM, Dashboard og Budget. Handlingen kan ikke fortrydes.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Annuller</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmDelete(); }}
              disabled={deleteBusy}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteBusy ? '…' : 'Ja, slet permanent'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
