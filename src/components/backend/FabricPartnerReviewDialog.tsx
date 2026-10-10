import { useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getPartnerAccountTypeLabel } from '@/lib/partnerAccountTypes';
import { createReviewDraft, EDITABLE_REVIEW_FIELDS, REVIEW_PARTNER_TYPES, REVIEW_STATUSES,
  REVIEW_STATUS_LABELS, validatePartnerReview, type PartnerReviewRow, type ReviewDraft,
  type ReviewParent, type ReviewRow, type ReviewStatus, type ReviewPartnerType, type ReviewValueSource } from '@/lib/fabricPartnerReview';
import { partnerReviewError, savePartnerReview } from '@/lib/fabricPartnerReviewService';

export default function FabricPartnerReviewDialog({ row, parents, history, onClose, onSaved }: {
  row: PartnerReviewRow; parents: ReviewParent[]; history: ReviewRow[];
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ReviewDraft>(() => createReviewDraft(row));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const request = useRef<{ body: string; id: string } | null>(null);
  const source = row.c5[0];
  const portal = row.portal[0];
  const approval = row.active_approval;
  const inputClass = 'mt-1 w-full min-w-0 rounded border border-gray-300 bg-white px-2 py-2 text-sm';
  const save = async () => {
    const validation = validatePartnerReview(row, draft, parents.map(parent => parent.id));
    if (!validation.valid) { setErrors(validation.errors); return; }
    const body = JSON.stringify(draft);
    if (request.current?.body !== body) request.current = { body, id: crypto.randomUUID() };
    setSaving(true); setErrors([]);
    try {
      await savePartnerReview(row, draft, request.current.id);
      await onSaved();
      onClose();
    } catch (error) { setErrors([partnerReviewError(error)]); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent aria-describedby={undefined} className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto p-4 text-left sm:p-6">
      <DialogHeader><DialogTitle className="pr-6 text-lg tracking-normal">Gennemgå {row.account_number} · {source?.company_name ?? portal?.company_name}</DialogTitle></DialogHeader>
      {row.needs_recheck && !approval && <p role="status" className="text-sm text-amber-800">Kilde eller Portal-oplysninger er ændret. Kræver genkontrol.</p>}
      <dl className="grid min-w-0 gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="font-medium">C5 kundetype</dt><dd>{source?.c5_partner_type_code ?? 'Ukendt'}</dd></div>
        <div><dt className="font-medium">Fakturakonto</dt><dd>{source?.c5_invoice_account_number ?? '—'}</dd></div>
        <div><dt className="font-medium">Fakturakæde</dt><dd className="break-words">{row.invoiceChain.join(' → ') || '—'}</dd></div>
        <div><dt className="font-medium">Foreslået forhandler</dt><dd>{row.proposedDealer ?? 'Ikke entydigt bevist'}</dd></div>
        <div><dt className="font-medium">Eksisterende Portal-relation</dt><dd>{portal?.parent_account_number ?? '—'} · {row.relationParity}</dd></div>
        <div><dt className="font-medium">Eksisterende sælger</dt><dd>{portal?.assigned_seller_initials ?? '—'} (bevares)</dd></div>
        <div className="min-w-0 sm:col-span-2"><dt className="font-medium">Konflikter / vurdering</dt><dd className="break-words">{row.reason}</dd></div>
      </dl>
      {approval && <div className="border-y py-2 text-sm" role="status">
        <p>Aktiv Portal-godkendelse · version {approval.version} · {approval.reviewer_name ?? approval.reviewed_by}</p>
        <p>Godkendt relation: {approval.parent_dealer_id
          ? parents.find(parent => parent.id === approval.parent_dealer_id)?.account_number ?? approval.parent_dealer_id : '—'}</p>
        {row.needs_recheck && <p className="text-amber-800">Kræver genkontrol · godkendte værdier og relation bevares.</p>}
      </div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-medium">Beslutning<select className={inputClass} value={draft.status}
          onChange={event => setDraft({ ...draft, status: event.target.value as ReviewStatus })}>
          {REVIEW_STATUSES.map(status => <option key={status} value={status}>{REVIEW_STATUS_LABELS[status]}</option>)}
        </select></label>
        <label className="min-w-0 text-sm font-medium">Foreslået Portal-partnertype<select className={inputClass} value={draft.proposed_partner_type ?? ''}
          onChange={event => setDraft({ ...draft, proposed_partner_type: (event.target.value || null) as ReviewPartnerType | null, parent_dealer_id: null })}>
          <option value="">Vælg type · ukendt</option>
          {REVIEW_PARTNER_TYPES.map(type => <option key={type} value={type}>{getPartnerAccountTypeLabel(type, 'da')}</option>)}
        </select></label>
        {draft.proposed_partner_type === 'dealer_customer' && <label className="min-w-0 text-sm font-medium sm:col-span-2">Godkendt overordnet forhandler<select className={inputClass}
          value={draft.parent_dealer_id ?? ''} onChange={event => setDraft({ ...draft, parent_dealer_id: event.target.value || null })}>
          <option value="">Vælg eksplicit en forhandler</option>
          {parents.map(parent => <option key={parent.id} value={parent.id}>{parent.account_number} · {parent.company_name}</option>)}
        </select></label>}
      </div>
      <div className="divide-y border-y text-sm">
        {EDITABLE_REVIEW_FIELDS.map(field => {
          const portalValue = field.field_name === 'address1' ? portal?.address_line_1 : portal?.[field.portal_field];
          const saved = approval?.fields.find(item => item.field_name === field.field_name);
          return <div key={field.field_name} className="grid min-w-0 gap-2 py-2 sm:grid-cols-[100px_1fr_1fr_170px]">
            <span className="font-medium">{field.label}</span>
            <div className="min-w-0 break-words"><span className="text-gray-500">Portal: </span>{portalValue || '—'}</div>
            <div className="min-w-0 break-words"><span className="text-gray-500">C5: </span>{source?.[field.field_name] || '—'}</div>
            <div className="min-w-0"><label><span className="sr-only">{field.label} ved senere import</span>
              <select aria-label={`${field.label} ved senere import`} className="w-full min-w-0 rounded border bg-white p-1.5"
                value={draft.fields[field.field_name]} onChange={event => setDraft({ ...draft, fields: { ...draft.fields, [field.field_name]: event.target.value as ReviewValueSource } })}>
                <option value="PORTAL" disabled={!portal}>Behold Portal</option><option value="C5">Brug C5</option>
                {saved && <option value="APPROVED">Behold godkendt</option>}
                <option value="OVERRIDE">Portal-korrektion</option>
              </select>
            </label>
              {draft.fields[field.field_name] === 'OVERRIDE' && <input aria-label={`${field.label} Portal-korrektion`}
                className={inputClass} maxLength={1000} value={draft.overrides?.[field.field_name] ?? ''}
                onChange={event => setDraft({ ...draft, overrides: { ...draft.overrides, [field.field_name]: event.target.value } })} />}
              {saved && <p className="mt-1 break-words text-xs text-gray-600">Godkendt: {saved.approved_value ?? '—'}<br />C5 ved godkendelse: {saved.c5_value ?? '—'}</p>}
            </div>
          </div>;
        })}
      </div>
      {approval && (draft.status === 'PENDING' || draft.status === 'IGNORED')
        && <p className="text-sm text-amber-800">Gem denne beslutning for at ophæve den aktive Portal-godkendelse.</p>}
      <label className="text-sm font-medium">Kommentar / dokumenteret begrundelse<textarea className={inputClass} rows={3} maxLength={4000}
        value={draft.comment} onChange={event => setDraft({ ...draft, comment: event.target.value })} /></label>
      {history.length > 0 && <details className="min-w-0 text-sm"><summary className="cursor-pointer font-medium">Beslutningshistorik ({history.length})</summary>
        {history.map(item => <div key={item.id} className="break-words border-b py-2">
          <p>Version {item.version} · {REVIEW_STATUS_LABELS[item.status]} · {item.reviewer_name ?? item.reviewed_by}</p>
          <p>{new Date(item.created_at).toLocaleString('da-DK')} · Snapshot: {item.snapshot_id ?? '—'}</p><p>{item.comment}</p>
        </div>)}
      </details>}
      {errors.length > 0 && <div role="alert" className="text-sm text-red-700">{errors.map(error => <p key={error}>{error}</p>)}</div>}
      <div className="flex justify-end border-t pt-3"><button type="button" disabled={saving} onClick={() => void save()}
        className="inline-flex items-center gap-2 rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Gemmer…' : 'Gem beslutning'}</button></div>
    </DialogContent>
  </Dialog>;
}
