/**
 * Backend/Admin-only modal to edit seller + dealer ownership on a single
 * configuration (quote or order). Does NOT touch pricing, products, customer
 * data, totals, PDF, email or webhook fields.
 */
import { useEffect, useMemo, useState } from 'react';
import { X, Search, AlertTriangle, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchBackendUsers } from '@/lib/backendUsersService';
import { fetchDealerAccounts, DealerAccount } from '@/lib/dealerAccountsService';
import { updateConfigurationOwnership } from '@/lib/configurationsService';
import { CrmConfigurationRow } from '@/lib/crmConfigurationsService';
import { useSellerDirectory, resolveDealerSellerInitials } from '@/lib/sellerDirectory';

interface SellerOpt {
  id: string;
  initials: string;
  name: string;
  email: string;
}

interface Props {
  row: CrmConfigurationRow;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditOrderOwnershipModal({ row, canEdit, onClose, onSaved }: Props) {
  const [sellers, setSellers] = useState<SellerOpt[]>([]);
  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sellerId, setSellerId] = useState<string>(row.assigned_seller_id ?? '');
  const [dealerAccountId, setDealerAccountId] = useState<string>(row.dealer_account_id ?? '');
  const [dealerSearch, setDealerSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [u, d] = await Promise.all([fetchBackendUsers(), fetchDealerAccounts()]);
        if (cancelled) return;
        const opts: SellerOpt[] = u.users
          .filter((x) =>
            (x.role === 'timan_seller' || x.role === 'timan_backend') && x.status === 'active'
          )
          .map((x) => ({
            id: x.id,
            initials: x.initials || '',
            name: x.name || '',
            email: x.email || '',
          }))
          .sort((a, b) => a.initials.localeCompare(b.initials));
        setSellers(opts);
        setDealers(d.rows.filter((r) => !r.is_deleted));
        // If current sellerId not in list but seller_email matches, try to map.
        if (!sellerId && row.seller_email) {
          const match = opts.find((o) => o.email.toLowerCase() === (row.seller_email || '').toLowerCase());
          if (match) setSellerId(match.id);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Kunne ikke indlæse data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  const filteredDealers = useMemo(() => {
    const q = dealerSearch.trim().toLowerCase();
    const list = q
      ? dealers.filter((d) =>
          [d.company_name, d.account_number, d.assigned_seller_initials, d.city, d.country]
            .filter(Boolean).join(' ').toLowerCase().includes(q))
      : dealers;
    return list.slice(0, 200);
  }, [dealers, dealerSearch]);

  const handleSave = async () => {
    if (!canEdit) {
      toast.error('Kun backend kan rette sælger og forhandler.');
      return;
    }
    const seller = sellers.find((s) => s.id === sellerId);
    const dealer = dealers.find((d) => d.id === dealerAccountId);
    if (!seller) { toast.error('Vælg en sælger.'); return; }
    if (!dealer)  { toast.error('Vælg en forhandler.'); return; }

    setSaving(true);
    const { ok, error: err } = await updateConfigurationOwnership(row.id, {
      seller_initials: seller.initials || null,
      seller_email: seller.email || null,
      seller_name: seller.name || null,
      assigned_seller_id: seller.id,
      dealer_number: dealer.account_number || null,
      dealer_name: dealer.company_name || null,
      dealer_account_id: dealer.id,
    });
    setSaving(false);
    if (!ok) {
      toast.error(err || 'Kunne ikke opdatere ordren.');
      return;
    }
    toast.success('Ordren er opdateret.');
    onSaved();
    onClose();
  };

  const headerNumber = row.order_number || row.quote_number || row.id.slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Ret sælger og forhandler
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{headerNumber}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Luk">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {!canEdit && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>Kun backend kan rette sælger og forhandler.</div>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Indlæser…
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Sælger</label>
                <select
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value="">— Vælg sælger —</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.initials ? `${s.initials} - ${s.name}` : s.name || s.email}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Nuværende: {row.seller_initials || row.seller_email || '—'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Forhandler</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={dealerSearch}
                    onChange={(e) => setDealerSearch(e.target.value)}
                    placeholder="Søg navn, nummer, sælger…"
                    disabled={!canEdit}
                    className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:bg-slate-50"
                  />
                </div>
                <select
                  value={dealerAccountId}
                  onChange={(e) => setDealerAccountId(e.target.value)}
                  disabled={!canEdit}
                  size={8}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:bg-slate-50"
                >
                  {filteredDealers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.company_name} · #{d.account_number}
                      {d.assigned_seller_initials ? ` · ${d.assigned_seller_initials}` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Nuværende: {row.dealer_name || (row.dealer_number ? `#${row.dealer_number}` : '—')}
                </p>
              </div>

              <div className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3">
                Kun sælger og forhandler kan ændres her. Priser, produkter, rabatter,
                kundeoplysninger, PDF, e-mail og webhook-status berøres ikke.
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-white"
          >
            Annullér
          </button>
          <button
            onClick={handleSave}
            disabled={!canEdit || saving || loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#2d5a27] rounded-lg hover:bg-[#244a20] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Gem
          </button>
        </div>
      </div>
    </div>
  );
}
