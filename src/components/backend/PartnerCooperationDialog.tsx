import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isDealerInactive, type DealerAccount } from '@/lib/dealerAccountsService';
import { resolvePartnerAccountType } from '@/lib/partnerAccountTypes';
import { changePartnerCooperation, loadPartnerCooperationHistory, partnerCooperationError,
  type PartnerCooperationAction, type PartnerCooperationHistory } from '@/lib/partnerRelationsService';

export default function PartnerCooperationDialog({ customerId, action, initialDealerId, dealers, onClose, onSaved }: {
  customerId: string; action: PartnerCooperationAction | 'HISTORY'; initialDealerId?: string;
  dealers: DealerAccount[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [history, setHistory] = useState<PartnerCooperationHistory | null>(null);
  const [dealerId, setDealerId] = useState(initialDealerId ?? '');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const request = useRef<{ body: string; id: string } | null>(null);
  useEffect(() => {
    let active = true;
    loadPartnerCooperationHistory(customerId).then(data => { if (active) setHistory(data); })
      .catch(err => { if (active) setError(partnerCooperationError(err)); });
    return () => { active = false; };
  }, [customerId]);
  const title = action === 'END' ? 'Afslut samarbejde' : action === 'SWITCH' ? 'Skift forhandler'
    : action === 'ACTIVATE' ? 'Godkend forhandlerrelation' : 'Samarbejdshistorik';
  const newRelation = action === 'ACTIVATE' || action === 'SWITCH';
  const save = async () => {
    if (!history || action === 'HISTORY') return;
    if (!reason.trim() || (newRelation && (!dealerId || !confirmed))) {
      setError('Angiv en årsag og godkend den nye relation, hvis du vælger en forhandler.'); return;
    }
    const body = JSON.stringify({ dealerId, reason, confirmed });
    if (request.current?.body !== body) request.current = { body, id: crypto.randomUUID() };
    setSaving(true); setError(null);
    try {
      await changePartnerCooperation({ customerId, expectedVersion: history.version, action,
        newDealerId: newRelation ? dealerId : null, confirmed, reason, requestId: request.current.id });
      await onSaved(); onClose();
    } catch (err) { setError(partnerCooperationError(err)); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent aria-describedby={undefined} className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto p-4 sm:p-6">
      <DialogHeader><DialogTitle className="pr-6 text-lg tracking-normal">{title}</DialogTitle></DialogHeader>
      <p className="break-words text-sm">{dealers.find(dealer => dealer.id === customerId)?.company_name}</p>
      {newRelation && <label className="text-sm font-medium">Ny forhandler<select aria-label="Ny forhandler"
        className="mt-1 w-full min-w-0 rounded border p-2" value={dealerId}
        onChange={event => { setDealerId(event.target.value); setConfirmed(false); }}>
        <option value="">Vælg forhandler</option>
        {dealers.filter(dealer => resolvePartnerAccountType(dealer) === 'dealer'
          && !isDealerInactive(dealer)).map(dealer => <option key={dealer.id} value={dealer.id}>
          {dealer.account_number} · {dealer.company_name}</option>)}
      </select></label>}
      {action !== 'HISTORY' && <label className="text-sm font-medium">Årsag<textarea aria-label="Årsag" maxLength={4000}
        className="mt-1 w-full rounded border p-2" value={reason} rows={3} onChange={event => setReason(event.target.value)} /></label>}
      {newRelation && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed}
        onChange={event => setConfirmed(event.target.checked)} />Jeg godkender denne nye forhandlerrelation</label>}
      {!history && !error && <p role="status" className="text-sm">Henter samarbejdshistorik…</p>}
      {history && <details className="min-w-0 text-sm" open={action === 'HISTORY'}><summary>Samarbejdshistorik ({history.events.length})</summary>
        {history.events.map(event => <div key={event.id} className="break-words border-b py-2">
          <p>{event.action === 'END' ? 'Afsluttet' : event.action === 'SWITCH' ? 'Forhandler skiftet' : 'Godkendt'} · {new Date(event.created_at).toLocaleString('da-DK')}</p>
          <p>{event.reviewer_name ?? event.reviewed_by} · {event.reason}</p>
          <p>{dealers.find(dealer => dealer.id === event.previous_dealer_id)?.company_name ?? '—'} → {dealers.find(dealer => dealer.id === event.new_dealer_id)?.company_name ?? '—'}</p>
        </div>)}
      </details>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {action !== 'HISTORY' && <button type="button" disabled={saving || !history} onClick={() => void save()}
        className="inline-flex items-center justify-center gap-2 rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50">
        <Save className="h-4 w-4" />{saving ? 'Gemmer…' : title}
      </button>}
    </DialogContent>
  </Dialog>;
}
