import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { activeBillingBranches, billingBranchLabel, type BillingPreview, type BillingRelation } from '@/lib/partnerBillingRelations';
import { loadBillingRelations } from '@/lib/partnerBillingRelationsService';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

export function BillingBranchList({ rows, mainId, language='da' }: {
  rows: BillingRelation[]; mainId: string; language?: PortalUiLanguage;
}) {
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const active=activeBillingBranches(rows,mainId);
  const selected=active.find(row=>row.id===selectedId)??null;
  if (!active.length) return null;
  return <section aria-label={billingBranchLabel(language)} className="min-w-0">
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{billingBranchLabel(language)}</h3>
    <ul className="space-y-2">{active.map(row=><li key={row.id}>
      <button type="button" onClick={()=>setSelectedId(row.id)} className="w-full min-w-0 rounded-lg border border-violet-200 bg-violet-50 p-3 text-left hover:bg-violet-100">
        <span className="block break-words text-sm font-semibold">{row.billing_name}</span>
        <span className="mt-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">{billingBranchLabel(language)} · #{row.billing_account_number}</span>
      </button>
    </li>)}</ul>
    {selected && <Dialog open onOpenChange={open=>{if(!open)setSelectedId(null);}}>
      <DialogContent aria-describedby={undefined} className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle className="break-words pr-6">{selected.billing_name}</DialogTitle></DialogHeader>
        <p className="text-sm text-violet-800">{billingBranchLabel(language)} · #{selected.billing_account_number}</p>
        <dl className="grid min-w-0 grid-cols-1 gap-2 break-words text-sm sm:grid-cols-2">
          <div><dt className="font-semibold">Firma / konto</dt><dd>{selected.billing_name} · #{selected.billing_account_number}</dd></div>
          <div><dt className="font-semibold">Adresse</dt><dd>{[selected.address,selected.postal_code,selected.city,selected.country].filter(Boolean).join(', ')||'—'}</dd></div>
          <div><dt className="font-semibold">Faktura-e-mail</dt><dd>{selected.invoice_email||'—'}</dd></div>
          <div><dt className="font-semibold">Valuta / betalingsbetingelser</dt><dd>{selected.currency||'—'} · {selected.payment||'—'}</dd></div>
          <div><dt className="font-semibold">C5 INVOICEACCOUNT</dt><dd>{selected.c5_invoice_account||'Tomt / uafklaret'}</dd></div>
          <div><dt className="font-semibold">Godkendt</dt><dd>{selected.approved_at ? new Date(selected.approved_at).toLocaleDateString('da-DK') : '—'}</dd></div>
        </dl>
        <p className="break-words text-sm">Kilde: {selected.approval_source} · {selected.approval_reason}</p>
      </DialogContent>
    </Dialog>}
  </section>;
}

/** Never requests financial data in Academy or an external/view-as partner context. */
export default function BillingBranchesPanel({ mainId, enabled, language='da' }: {
  mainId: string; enabled: boolean; language?: PortalUiLanguage;
}) {
  const [data,setData]=useState<{mainId:string;preview:BillingPreview}|null>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let cancelled=false;setData(null);setFailed(false);
    if(enabled)void loadBillingRelations(mainId).then(preview=>{if(!cancelled)setData({mainId,preview});}).catch(()=>{if(!cancelled)setFailed(true);});
    return()=>{cancelled=true;};
  },[mainId,enabled]);
  if(!enabled)return null;
  if(failed)return <p role="status" className="text-xs text-amber-700">Betalingsrelationer kunne ikke indlæses.</p>;
  return data?.mainId===mainId ? <BillingBranchList rows={data.preview.relations} mainId={mainId} language={language}/> : null;
}
