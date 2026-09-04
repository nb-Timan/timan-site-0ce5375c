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
import { FileText, ShoppingCart, Search, AlertTriangle, Pencil, Trash2, ExternalLink } from 'lucide-react';
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
import EditOrderOwnershipModal from '@/components/crm/EditOrderOwnershipModal';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { buildJournalScope } from '@/lib/machineJournalScope';
import { isExternalCrmRole } from '@/lib/crmScope';
import { getActiveSellerView } from '@/lib/activeMode';
import {
  listCrmConfigurations,
  softDeleteConfiguration,
  CrmConfigurationRow,
  CrmDocumentType,
} from '@/lib/crmConfigurationsService';
import { logActivity } from '@/lib/crmActivitiesService';
import { Language } from '@/types/configurator';

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
  col_title: { da: 'Titel', en: 'Title', de: 'Titel', it: 'Titolo', hu: 'Cím' },
  col_seller: { da: 'Sælger', en: 'Seller', de: 'Verkäufer', it: 'Venditore', hu: 'Értékesítő' },
  col_dealer: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő' },
  col_status: { da: 'Status', en: 'Status', de: 'Status', it: 'Stato', hu: 'Státusz' },
  col_created: { da: 'Oprettet', en: 'Created', de: 'Erstellt', it: 'Creato', hu: 'Létrehozva' },
  col_sent: { da: 'Sendt', en: 'Sent', de: 'Gesendet', it: 'Inviato', hu: 'Elküldve' },
  count_label: { da: 'rækker', en: 'rows', de: 'Zeilen', it: 'righe', hu: 'sor' },
  scope_backend: { da: 'Viser alle (Backend)', en: 'Showing all (Backend)', de: 'Alle (Backend)', it: 'Tutti (Backend)', hu: 'Mind (Backend)' },
  scope_seller: { da: 'Viser kun egne', en: 'Showing only own', de: 'Nur eigene', it: 'Solo i propri', hu: 'Csak sajátok' },
  scope_dealer: { da: 'Viser kun egen forhandler', en: 'Showing only own dealer', de: 'Nur eigener Händler', it: 'Solo proprio rivenditore', hu: 'Csak saját kereskedő' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('da-DK'); } catch { return '—'; }
}

function statusBadge(row: Pick<CrmConfigurationRow, 'case_status' | 'status' | 'submitted_at' | 'order_sent_at'>): { label: string; cls: string } {
  const s = (row.case_status || row.status || 'aktiv').toLowerCase();
  if (row.order_sent_at || row.submitted_at) return { label: 'Ordre afgivet', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (s === 'ordre_afgivet') return { label: 'Ordre afgivet', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (s === 'pause')         return { label: 'Pause',         cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (s === 'aktiv')         return { label: 'Aktiv',         cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  return { label: row.case_status || row.status || '—', cls: 'bg-slate-50 text-slate-700 border-slate-200' };
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dealerParam = searchParams.get('dealer') || '';

  const [rows, setRows] = useState<CrmConfigurationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(dealerParam);
  const [reloadKey, setReloadKey] = useState(0);
  const [editingRow, setEditingRow] = useState<CrmConfigurationRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<CrmConfigurationRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => { if (dealerParam) setSearch(dealerParam); }, [dealerParam]);

  const isBackendFull = portalRole === 'timan_backend' && !getActiveSellerView(appUser?.email);
  const isSeller = portalRole === 'timan_seller';
  // Backend/admin can always edit ownership, even when "viewing as" a seller.
  const canEditOwnership = portalRole === 'timan_backend' && mode === 'order';
  // Soft-delete UI is Backend-only and hidden in seller-view mode / external roles.
  const canDelete = isBackendFull;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const sellerId = await resolveSellerId(appUser?.email);
      const sellerView = getActiveSellerView(appUser?.email);
      const sellerInitials = sellerView?.initials
        ?? (isSeller && appUser?.display_name ? appUser.display_name.match(/^([A-ZÆØÅ]{2,4})/)?.[1] ?? null : null);
      const sellerEmail = sellerView?.email ?? (isSeller ? appUser?.email?.toLowerCase() ?? null : null);
      const dealerNumber = effectiveDealerNumber;
      const dealerNumbers = isExternalCrmRole(portalRole)
        ? Array.from((await buildJournalScope(effectiveUser, portalRole)).dealerNumbers)
        : null;

      const { rows: fetched, error: err } = await listCrmConfigurations({
        role: portalRole,
        sellerId,
        sellerInitials,
        sellerEmail,
        dealerNumber,
        dealerNumbers,
        documentType: mode,
      });
      if (cancelled) return;
      if (err) setError(err);
      setRows(fetched);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [
    appUser?.email,
    appUser?.display_name,
    effectiveUserEmail,
    effectiveUserDisplayName,
    effectiveUserPortalRole,
    effectiveUserRole,
    effectiveUserPartnerType,
    effectiveDealerNumber,
    effectiveCompanyDealer,
    portalRole,
    mode,
    isSeller,
    reloadKey,
  ]);

  const handleRowClick = useCallback((r: CrmConfigurationRow) => {
    if (canEditOwnership) setEditingRow(r);
  }, [canEditOwnership]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingRow) return;
    setDeleteBusy(true);
    const { error: delErr } = await softDeleteConfiguration(deletingRow.id);
    setDeleteBusy(false);
    if (delErr) {
      console.error('[CrmQuotesOrdersPage] delete failed', delErr);
      toast.error('Kunne ikke slette. Prøv igen.');
      return;
    }

    // Audit trail: log the deletion as a CRM activity. Activities are stored
    // in a separate table and are not affected by the soft-delete on the
    // configuration row, so the entry remains visible in CRM → Aktiviteter.
    const isOrder = mode === 'order';
    const docNumber = isOrder
      ? (deletingRow.order_number || deletingRow.quote_number || deletingRow.id)
      : (deletingRow.quote_number || deletingRow.id);
    const company = deletingRow.dealer_company_name || deletingRow.dealer_name || null;
    const actorName = appUser?.display_name || appUser?.email || null;
    try {
      await logActivity({
        activity_type: isOrder ? 'order_deleted' : 'quote_deleted',
        title: `${isOrder ? 'Ordre' : 'Tilbud'} slettet: ${docNumber}${company ? ` · ${company}` : ''}`,
        description: `Slettet af ${actorName || 'ukendt bruger'}`,
        configuration_id: deletingRow.id,
        quote_id: isOrder ? null : (deletingRow.quote_number || null),
        order_id: isOrder ? (deletingRow.order_number || null) : null,
        dealer_account_id: deletingRow.dealer_account_id,
        dealer_number: deletingRow.dealer_number,
        dealer_name: company,
        seller_user_id: deletingRow.assigned_seller_id,
        seller_email: deletingRow.seller_email,
        seller_initials: deletingRow.seller_initials,
        seller_name: deletingRow.seller_name,
        account_name: company,
        created_by_email: appUser?.email ?? null,
        created_by_name: actorName,
        meta: {
          deleted_number: docNumber,
          deleted_document_type: isOrder ? 'order' : 'quote',
          deleted_at: new Date().toISOString(),
          deleted_by_email: appUser?.email ?? null,
          deleted_by_name: actorName,
          dealer_company_name: company,
        },
      });
    } catch (e) {
      console.warn('[CrmQuotesOrdersPage] activity log failed (delete still applied)', e);
    }

    setRows((prev) => prev.filter((x) => x.id !== deletingRow.id));
    toast.success(isOrder ? 'Ordren er slettet.' : 'Tilbuddet er slettet.');
    setDeletingRow(null);
    setReloadKey((k) => k + 1);
  }, [deletingRow, mode, appUser?.display_name, appUser?.email]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.quote_number, r.order_number, r.title,
        r.seller_initials, r.seller_email, r.seller_name,
        r.dealer_number, r.dealer_name, r.dealer_company_name,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

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
              {filtered.length} {T.count_label[lang]}
            </span>
          </div>
        </div>

        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={T.search[lang]}
            className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
          />
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
                  <th className="text-left px-3 py-2 font-semibold">{T.col_number[lang]}</th>
                  <th className="text-left px-3 py-2 font-semibold">{T.col_title[lang]}</th>
                  <th className="text-left px-3 py-2 font-semibold">{T.col_seller[lang]}</th>
                  <th className="text-left px-3 py-2 font-semibold">{T.col_dealer[lang]}</th>
                  <th className="text-left px-3 py-2 font-semibold">{T.col_status[lang]}</th>
                  <th className="text-left px-3 py-2 font-semibold">{T.col_created[lang]}</th>
                  <th className="text-left px-3 py-2 font-semibold">{T.col_sent[lang]}</th>
                  {canEditOwnership && <th className="px-3 py-2 font-semibold w-10"></th>}
                  {canDelete && <th className="px-3 py-2 font-semibold w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const number = mode === 'order'
                    ? (r.order_number || r.quote_number || r.id.slice(0, 8))
                    : (r.quote_number || r.id.slice(0, 8));
                  const sentAt = mode === 'order' ? (r.order_sent_at || r.submitted_at) : r.quote_sent_at;
                  const badge = statusBadge(r);
                  const dealerLabel = r.dealer_company_name
                    ?? r.dealer_name
                    ?? (r.dealer_number ? `#${r.dealer_number}` : '—');
                  return (
                    <tr
                      key={r.id}
                      onClick={() => handleRowClick(r)}
                      className={`border-b border-slate-100 hover:bg-slate-50/60 ${canEditOwnership ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-3 py-2.5 font-mono text-[12px] text-slate-700 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); navigate(`/configurator?configId=${r.id}`); }}
                          className="inline-flex items-center gap-1 text-[#2d5a27] hover:underline"
                          title={lang === 'da' ? 'Åbn i konfigurator' : 'Open in configurator'}
                        >
                          {number}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-slate-800 max-w-[280px]">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); navigate(`/configurator?configId=${r.id}`); }}
                          className="text-left truncate w-full text-slate-800 hover:text-[#2d5a27] hover:underline"
                          title={lang === 'da' ? 'Åbn i konfigurator' : 'Open in configurator'}
                        >
                          {r.title || '—'}
                        </button>
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
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(sentAt)}</td>
                      {canEditOwnership && (
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditingRow(r); }}
                            className="inline-flex items-center gap-1 text-[12px] text-slate-600 hover:text-[#2d5a27]"
                            title="Ret sælger og forhandler"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
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
        <EditOrderOwnershipModal
          row={editingRow}
          canEdit={canEditOwnership}
          onClose={() => setEditingRow(null)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}

      <AlertDialog
        open={!!deletingRow}
        onOpenChange={(open) => { if (!open && !deleteBusy) setDeletingRow(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {mode === 'order' ? 'Slet ordre?' : 'Slet tilbud?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {mode === 'order'
                ? 'Er du sikker på, at du vil slette denne ordre? Ordren fjernes fra portalen og kan ikke bruges i CRM, Dashboard eller Budget.'
                : 'Er du sikker på, at du vil slette dette tilbud? Tilbuddet fjernes fra portalen og kan ikke bruges i CRM, Dashboard eller Budget.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Annuller</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmDelete(); }}
              disabled={deleteBusy}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteBusy ? '…' : 'Ja, slet'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
