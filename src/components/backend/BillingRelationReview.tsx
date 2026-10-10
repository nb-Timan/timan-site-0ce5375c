import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DealerAccount } from '@/lib/dealerAccountsService';
import { resolvePartnerAccountType } from '@/lib/partnerAccountTypes';
import { type BillingAction, type BillingPreview } from '@/lib/partnerBillingRelations';
import { billingRelationError, changeBillingRelation, loadBillingRelations } from '@/lib/partnerBillingRelationsService';

export default function BillingRelationReview({ partners, onSaved }: {partners:DealerAccount[];onSaved:()=>Promise<void>}) {
  const [open,setOpen]=useState(false),[mainId,setMainId]=useState(''),[account,setAccount]=useState('');
  const [data,setData]=useState<BillingPreview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [action,setAction]=useState<BillingAction>('PROPOSE'),[reason,setReason]=useState(''),[source,setSource]=useState(''),[confirmed,setConfirmed]=useState(false);
  const request=useRef<{body:string;id:string}|null>(null);
  useEffect(()=>{
    let cancelled=false;setData(null);setAccount('');setConfirmed(false);setError('');
    setReason('');setSource('');
    if(open&&mainId)void loadBillingRelations(mainId).then(result=>{if(!cancelled){setData(result);setAction(result.relations.some(r=>r.active)?'SWITCH':'PROPOSE');}}).catch(()=>{if(!cancelled)setError('Review kunne ikke indlæses.');});
    return()=>{cancelled=true;};
  },[open,mainId]);
  const eligible=partners.filter(p=>!p.is_deleted&&!p.is_blocked&&p.is_active!==false
    && ['dealer','importer','service_partner'].includes(resolvePartnerAccountType(p)));
  const active=data?.relations.find(r=>r.active), version=Math.max(0,...(data?.history.map(h=>h.version)??[]));
  async function save(){
    if(!mainId||!data?.enabled||!reason.trim()||!source.trim()||(action!=='END'&&!account)||(action!=='PROPOSE'&&!confirmed)){
      setError('Vælg hovedpartner og konto, angiv kilde/begrundelse og godkend handlingen eksplicit.');return;
    }
    const body=JSON.stringify({mainId,account,action,version,reason,source,confirmed});
    if(request.current?.body!==body)request.current={body,id:crypto.randomUUID()};
    setBusy(true);setError('');
    try{
      await changeBillingRelation({mainId,accountNumber:action==='END'?null:account,action,expectedVersion:version,reason,source,confirmed,requestId:request.current.id});
      await onSaved();setOpen(false);
    }catch(e){setError(billingRelationError(e));}finally{setBusy(false);}
  }
  return <>
    <button type="button" onClick={()=>setOpen(true)} className="rounded border border-violet-200 px-3 py-2 text-sm text-violet-800">Gennemgå betalingsfilial</button>
    {open&&<Dialog open onOpenChange={value=>{if(!busy)setOpen(value);}}>
      <DialogContent aria-describedby={undefined} className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>Betalingsfilial · Backend-godkendelse</DialogTitle></DialogHeader>
        <p className="text-sm">Økonomisk relation. Partnertype, kommerciel parent, sælger og Portal-adgang ændres ikke.</p>
        <label className="text-sm">Hovedpartner<select className="mt-1 w-full min-w-0 rounded border p-2" value={mainId} onChange={e=>setMainId(e.target.value)}>
          <option value="">Vælg eksplicit hovedpartner</option>{eligible.map(p=><option key={p.id} value={p.id}>{p.company_name} · #{p.account_number}</option>)}
        </select></label>
        {data&&!data.enabled&&<p role="status" className="text-sm text-amber-800">Databasemodellen afventer særskilt produktionsgodkendelse. Ingen ændring kan gemmes.</p>}
        {data?.enabled&&<>
          <p className="text-sm">C5-fakturakonto for hovedpartneren: {data.candidates.find(c=>c.account_number===partners.find(p=>p.id===mainId)?.account_number)?.invoice_account||'Tomt / uafklaret'} · kun kildeoplysning</p>
          <label className="text-sm">Handling<select className="mt-1 w-full rounded border p-2" value={action} onChange={e=>{setAction(e.target.value as BillingAction);setConfirmed(false);}}>
            <option value="PROPOSE" disabled={!!active}>Gem forslag</option><option value="ACTIVATE" disabled={!!active}>Godkend relation</option>
            <option value="END" disabled={!active}>Afslut relation</option><option value="SWITCH" disabled={!active}>Skift relation</option>
          </select></label>
          {active&&<p className="text-sm">Aktuel betalingsfilial: {active.billing_name} · #{active.billing_account_number}</p>}
          {data.relations.filter(r=>!r.active&&!r.approved_at).map(r=><p key={r.id} className="text-sm text-amber-800">Forslag: {r.billing_name} · #{r.billing_account_number} · afventer godkendelse</p>)}
          {action!=='END'&&<label className="text-sm">Betalingsfilial · C5-konto<select value={account} onChange={e=>setAccount(e.target.value)} className="mt-1 w-full min-w-0 rounded border p-2">
            <option value="">Vælg konto · ingen automatisk udledning</option>{data.candidates.filter(c=>c.account_number!==partners.find(p=>p.id===mainId)?.account_number).map(c=><option key={c.account_number} value={c.account_number}>{c.company_name} · #{c.account_number} · C5-type {c.c5_type??'ukendt'}</option>)}
          </select></label>}
          <label className="text-sm">Kilde<input value={source} maxLength={1000} onChange={e=>setSource(e.target.value)} className="mt-1 w-full rounded border p-2"/></label>
          <label className="text-sm">Begrundelse<textarea value={reason} maxLength={4000} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded border p-2"/></label>
          {action!=='PROPOSE'&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Jeg godkender denne betalingsrelation/afslutning eksplicit</label>}
          <details className="text-sm"><summary>Revisionshistorik ({data.history.length})</summary>{data.history.map(h=><p className="break-words border-b py-2" key={h.id}>{h.version} · {h.action} · {h.previous_billing_account_number??'—'} → {h.new_billing_account_number??'—'} · {h.reason}</p>)}</details>
        </>}
        {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="button" disabled={busy||!data?.enabled} onClick={()=>void save()} className="rounded bg-violet-800 p-2 text-sm text-white disabled:opacity-50">{busy?'Gemmer…':'Gem betalingsbeslutning'}</button>
      </DialogContent>
    </Dialog>}
  </>;
}
