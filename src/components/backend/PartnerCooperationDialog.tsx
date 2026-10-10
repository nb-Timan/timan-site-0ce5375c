import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isDealerInactive } from '@/lib/dealerAccountsService';
import { resolvePartnerAccountType } from '@/lib/partnerAccountTypes';
import { cooperationBillingLabel, cooperationTypeLabel, validCooperationTypes, type CooperationPartner } from '@/lib/partnerCooperation';
import { changePartnerCooperation, loadPartnerCooperationHistory, partnerCooperationError,
  type PartnerCooperationAction, type PartnerCooperationHistory, type PartnerAccountRelationType } from '@/lib/partnerRelationsService';

export default function PartnerCooperationDialog({ customerId, action, initialDealerId, dealers, onClose, onSaved,
  relationType, previousRelationId, billingInvoiceAccount }: {
  customerId: string; action: PartnerCooperationAction | 'HISTORY'; initialDealerId?: string;
  dealers: CooperationPartner[]; onClose: () => void; onSaved: () => Promise<void>;
  relationType?: PartnerAccountRelationType; previousRelationId?: string; billingInvoiceAccount?: string | null;
}) {
  const [history, setHistory] = useState<PartnerCooperationHistory | null>(null);
  const [dealerId, setDealerId] = useState(initialDealerId ?? '');
  const [selectedType, setSelectedType] = useState(relationType);
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
  const title = action === 'END' ? 'Afslut samarbejde' : action === 'SWITCH' ? (relationType ? 'Skift samarbejdspartner' : 'Skift forhandler')
    : action === 'ACTIVATE' ? (relationType ? 'Godkend samarbejde' : 'Godkend forhandlerrelation') : 'Samarbejdshistorik';
  const child = dealers.find(dealer => dealer.id === customerId);
  const parent = dealers.find(dealer => dealer.id === dealerId);
  const allowedTypes = parent && child ? validCooperationTypes(parent, child) : [];
  const parentLabel = relationType ? 'Samarbejdspartner / overordnet partner' : 'Ny forhandler';
  const newRelation = action === 'ACTIVATE' || action === 'SWITCH';
  const upgradeRequired = Boolean(relationType && selectedType !== 'dealer_has_dealer_customer' && history && !history.billing);
  const save = async () => {
    if (!history || action === 'HISTORY' || upgradeRequired) return;
    if (!reason.trim() || (newRelation && (!dealerId || !confirmed || (relationType && !allowedTypes.includes(selectedType!))))) {
      setError('Angiv en årsag og godkend den nye relation, hvis du vælger en forhandler.'); return;
    }
    const body = JSON.stringify({ dealerId, reason, confirmed, selectedType, previousRelationId });
    if (request.current?.body !== body) request.current = { body, id: crypto.randomUUID() };
    setSaving(true); setError(null);
    try {
      await changePartnerCooperation({ customerId, expectedVersion: history.version, action,
        newDealerId: newRelation ? dealerId : null, confirmed, reason, requestId: request.current.id,
        ...(relationType ? { relationType: selectedType, previousRelationId } : {}) });
      await onSaved(); onClose();
    } catch (err) { setError(partnerCooperationError(err)); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent aria-describedby={undefined} className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto p-4 sm:p-6">
      <DialogHeader><DialogTitle className="pr-6 text-lg tracking-normal">{title}</DialogTitle></DialogHeader>
      <p className="break-words text-sm">{child?.company_name} · #{child?.account_number}</p>
      {relationType && <div className="rounded border bg-slate-50 p-3 text-sm" aria-label="Fakturering · kun læsning">
        <p className="font-medium">Fakturering · C5-oplysning, kun læsning</p>
        <p className="break-words">{cooperationBillingLabel(child?.account_number ?? '', billingInvoiceAccount !== undefined
          ? billingInvoiceAccount : history?.billing?.source_count === 1 ? history.billing.invoice_account : undefined)}</p>
        <p className="mt-1 text-xs">Samarbejdet ændrer ikke fakturakonto eller sælgeransvar.</p>
      </div>}
      {newRelation && <label className="text-sm font-medium">{parentLabel}<select aria-label={parentLabel}
        className="mt-1 w-full min-w-0 rounded border p-2" value={dealerId}
        onChange={event => { const next = dealers.find(dealer => dealer.id === event.target.value);
          setDealerId(event.target.value); setConfirmed(false);
          if (relationType) setSelectedType(next && child ? validCooperationTypes(next, child)[0] : undefined);
        }}>
        <option value="">{relationType ? 'Vælg eksisterende partner' : 'Vælg forhandler'}</option>
        {dealers.filter(dealer => (relationType ? child && validCooperationTypes(dealer, child).some(type =>
          (type === 'service_partner_has_dealer') === (relationType === 'service_partner_has_dealer')) : resolvePartnerAccountType(dealer) === 'dealer')
          && dealer.id !== customerId && dealer.is_active !== false
          && !isDealerInactive({ is_deleted: dealer.is_deleted ?? false, is_blocked: dealer.is_blocked ?? false })).map(dealer => <option key={dealer.id} value={dealer.id}>
          {dealer.account_number} · {dealer.company_name}</option>)}
      </select></label>}
      {relationType && newRelation && <label className="text-sm font-medium">Relationstype<select aria-label="Relationstype"
        className="mt-1 w-full min-w-0 rounded border p-2" value={selectedType ?? ''}
        onChange={event => { setSelectedType(event.target.value as PartnerAccountRelationType); setConfirmed(false); }}>
        <option value="">Vælg gyldig relationstype</option>
        {allowedTypes.map(type => <option key={type} value={type}>{cooperationTypeLabel(type)}</option>)}
      </select></label>}
      {action !== 'HISTORY' && <label className="text-sm font-medium">Årsag<textarea aria-label="Årsag" maxLength={4000}
        className="mt-1 w-full rounded border p-2" value={reason} rows={3} onChange={event => setReason(event.target.value)} /></label>}
      {newRelation && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed}
        onChange={event => setConfirmed(event.target.checked)} />{relationType ? 'Jeg godkender samarbejdet og relationens eksisterende adgangsomfang' : 'Jeg godkender denne nye forhandlerrelation'}</label>}
      {relationType && newRelation && <p className="text-xs text-gray-600">Godkendelsen kan give overordnet partners autoriserede samarbejdsadministratorer adgang til denne partner gennem eksisterende adgangsregler. Ingen nye brugerroller oprettes.</p>}
      {!history && !error && <p role="status" className="text-sm">Henter samarbejdshistorik…</p>}
      {upgradeRequired && <p role="status" className="text-sm text-amber-800">Den nye relationsgodkendelse afventer databasefrigivelse. Ingen ændring er gemt.</p>}
      {history && <details className="min-w-0 text-sm" open={action === 'HISTORY'}><summary>Samarbejdshistorik ({history.events.length})</summary>
        {history.events.map(event => <div key={event.id} className="break-words border-b py-2">
          <p>{event.action === 'END' ? 'Afsluttet' : event.action === 'SWITCH' ? 'Samarbejdspartner skiftet' : 'Godkendt'} · {new Date(event.created_at).toLocaleString('da-DK')}</p>
          <p>{event.reviewer_name ?? event.reviewed_by} · {event.reason}</p>
          {event.relation_type && <p>{cooperationTypeLabel(event.relation_type)}</p>}
          <p>{dealers.find(dealer => dealer.id === event.previous_dealer_id)?.company_name ?? '—'} → {dealers.find(dealer => dealer.id === event.new_dealer_id)?.company_name ?? '—'}</p>
        </div>)}
      </details>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {action !== 'HISTORY' && <button type="button" disabled={saving || !history || upgradeRequired} onClick={() => void save()}
        className="inline-flex items-center justify-center gap-2 rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50">
        <Save className="h-4 w-4" />{saving ? 'Gemmer…' : title}
      </button>}
    </DialogContent>
  </Dialog>;
}
