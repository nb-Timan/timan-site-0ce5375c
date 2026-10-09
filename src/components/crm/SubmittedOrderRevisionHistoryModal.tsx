import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import {
  listSubmittedOrderRevisions,
  type SubmittedOrderRevision,
} from '@/lib/submittedOrderCorrectionService';
import type { CrmConfigurationRow } from '@/lib/crmConfigurationsService';
import { orderPurchaseReferenceSummary } from '@/lib/orderPurchaseReferences';
import { normalizeConfiguratorState } from '@/lib/configuratorState';
import { buildSubmittedOrderDocument } from '@/lib/submittedOrderConfirmation';

interface Props {
  row: CrmConfigurationRow;
  onClose: () => void;
}

interface OrderSnapshotSummary {
  customer: string;
  deliveryDate: string;
  paymentTerms: string;
  purchaseOrder: string;
  itemCount: number;
  totalPrice: string;
}

function snapshotSummary(snapshot: Record<string, unknown> | null): OrderSnapshotSummary {
  const configuration = (snapshot?.configuration ?? {}) as Record<string, unknown>;
  const state = (configuration.state_json ?? {}) as Record<string, unknown>;
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const totalPrice = configuration.total_price;
  const purchaseOrder = orderPurchaseReferenceSummary(normalizeConfiguratorState(state)).headerValue ?? '—';
  return {
    customer: typeof state.firmanavn === 'string' && state.firmanavn.trim() ? state.firmanavn : '—',
    deliveryDate: typeof configuration.delivery_date === 'string' && configuration.delivery_date
      ? new Date(`${configuration.delivery_date.slice(0, 10)}T00:00:00`).toLocaleDateString('da-DK')
      : '—',
    paymentTerms: typeof state.paymentTerms === 'string' && state.paymentTerms.trim() ? state.paymentTerms : '—',
    purchaseOrder,
    itemCount: items.length,
    totalPrice: typeof totalPrice === 'number'
      ? new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(totalPrice)
      : '—',
  };
}

function Snapshot({ label, snapshot }: { label: string; snapshot: Record<string, unknown> | null }) {
  const summary = snapshotSummary(snapshot);
  let detail: ReturnType<typeof buildSubmittedOrderDocument> | null = null;
  let warning = '';
  if (snapshot) {
    try {
      const configuration = snapshot.configuration as Record<string, unknown>;
      detail = buildSubmittedOrderDocument(normalizeConfiguratorState(configuration.state_json));
    } catch (error) { warning = error instanceof Error ? error.message : 'Historiske linjer kunne ikke indlæses.'; }
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700">
        <div><dt className="text-slate-500">Kunde</dt><dd className="truncate font-medium" title={summary.customer}>{summary.customer}</dd></div>
        <div><dt className="text-slate-500">Levering</dt><dd className="font-medium">{summary.deliveryDate}</dd></div>
        <div><dt className="text-slate-500">Betaling</dt><dd className="font-medium">{summary.paymentTerms}</dd></div>
        <div><dt className="text-slate-500">REK./PO</dt><dd className="font-medium">{summary.purchaseOrder}</dd></div>
        <div><dt className="text-slate-500">Linjer / total</dt><dd className="font-medium">{summary.itemCount} / {summary.totalPrice}</dd></div>
      </dl>
      {snapshot && <details className="mt-3 text-xs">
        <summary className="cursor-pointer font-medium">Vis historiske ordrelinjer</summary>
        {warning && <p className="mt-2 text-amber-800">{warning}</p>}
        {detail && <ul className="mt-2 space-y-2">{detail.lines.map((line, index) => <li key={index}>
          <span className="font-mono">{line.itemNo}</span> · {line.description} · {line.quantity} × {line.unitPrice} = {line.total}
          {line.purchaseReferences?.length ? ` · REK./PO: ${line.purchaseReferences.join(', ')}` : ''}
        </li>)}</ul>}
      </details>}
    </div>
  );
}

function Revision({ revision }: { revision: SubmittedOrderRevision }) {
  return (
    <li className="border-b border-slate-100 py-4 last:border-0">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-900">Revision {revision.revision_number}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {new Date(revision.started_at).toLocaleString('da-DK')}
            {revision.completed_at ? ` · afsluttet ${new Date(revision.completed_at).toLocaleString('da-DK')}` : ' · stadig åben'}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">Ændret af {revision.actor_name || revision.actor_email || 'ukendt Backend-bruger'}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${revision.status === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {revision.status === 'completed' ? 'Afsluttet' : revision.status === 'active' ? 'Aktiv' : 'Udløbet'}
        </span>
      </div>
      <p className="mb-3 text-sm text-slate-700"><span className="font-medium">Begrundelse:</span> {revision.reason}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Snapshot label="Før" snapshot={revision.before_snapshot} />
        <Snapshot label="Efter" snapshot={revision.after_snapshot} />
      </div>
    </li>
  );
}

export default function SubmittedOrderRevisionHistoryModal({ row, onClose }: Props) {
  const [revisions, setRevisions] = useState<SubmittedOrderRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listSubmittedOrderRevisions(row.id);
      if (cancelled) return;
      setRevisions(result.revisions);
      setError(result.error);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [row.id]);

  const orderNumber = row.order_number || row.quote_number || row.id.slice(0, 8);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Revisionshistorik · {orderNumber}</h3>
            <p className="mt-0.5 text-xs text-slate-500">Backend-rettelser med canonical før- og efter-snapshots.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Luk revisionshistorik"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {loading ? <div className="flex justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Indlæser…</div> : null}
          {error ? <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div> : null}
          {!loading && !error && revisions.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Ingen Backend-rettelser er registreret på denne ordre.</p> : null}
          {!loading && !error && revisions.length > 0 ? <ol>{revisions.map((revision) => <Revision key={revision.id} revision={revision} />)}</ol> : null}
        </div>
      </div>
    </div>
  );
}
