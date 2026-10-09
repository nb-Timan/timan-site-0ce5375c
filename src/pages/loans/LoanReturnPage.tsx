import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Camera, CheckCircle2, PackageCheck, UploadCloud, X } from 'lucide-react';
import LoanShell from '@/pages/loans/LoanShell';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import { t } from '@/lib/i18n/translations';
import { calculateLoanUsage, getLoanReturnIssues, loanReceiptGroupKey, type LoanReturnDraftItem, type LoanReturnIssue } from '@/lib/loanDomain';
import { derivePortalRole, isInternalTimanPortalRole } from '@/lib/portalAccess';
import {
  getLoanCase,
  receiveLoanAssets,
  removeLoanReturnPhoto,
  uploadLoanReturnPhoto,
  type LoanCase,
  type LoanCaseItem,
  type LoanItemPhoto,
} from '@/lib/loanService';

type Draft = LoanReturnDraftItem & { note: string };

export default function LoanReturnPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { appUser } = useAppUser();
  const { uiLanguage } = useLanguage();
  const label = useCallback((key: string) => t(key, uiLanguage), [uiLanguage]);
  const internal = isInternalTimanPortalRole(derivePortalRole(appUser));
  const [loanCase, setLoanCase] = useState<LoanCase | null>(null);
  const [items, setItems] = useState<LoanCaseItem[]>([]);
  const [photos, setPhotos] = useState<LoanItemPhoto[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [issues, setIssues] = useState<Record<string, LoanReturnIssue[]>>({});
  const [batchNote, setBatchNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const receiptRequest = useRef<{ payload: string; key: string } | null>(null);
  const submitting = useRef(false);

  const load = useCallback(async () => {
    if (!caseId) return;
    const detail = await getLoanCase(caseId);
    const outstandingIds = new Set(detail.returnSummary.filter((item) => item.is_outstanding).map((item) => item.case_item_id));
    const outstanding = detail.returnState?.can_receive ? detail.items.filter((item) => outstandingIds.has(item.id)) : [];
    setLoanCase(detail.loanCase);
    setItems(outstanding);
    setPhotos(detail.photos);
    setDrafts((current) => Object.fromEntries(outstanding.map((item) => [item.id, {
      ...(current[item.id] ?? createDraft(item, detail.photos)),
      hasMeterPhoto: detail.photos.some((photo) => photo.case_item_id === item.id && photo.photo_kind === 'return_meter' && !photo.return_item_inspection_id),
    }])));
    setLoaded(true);
  }, [caseId]);

  useEffect(() => {
    if (!internal) return;
    void load().catch((cause) => { setError(message(cause, label)); setLoaded(true); });
  }, [internal, label, load]);

  const sharedBrikCounts = useMemo(() => items.reduce<Record<string, number>>((counts, item) => {
    const related = items.filter((other) => loanReceiptGroupKey(other) === loanReceiptGroupKey(item));
    const serials = new Set(related.map((other) => other.serial_snapshot?.trim()).filter(Boolean));
    if (item.brik_number_snapshot && serials.size <= 1) counts[loanReceiptGroupKey(item)] = related.length;
    return counts;
  }, {}), [items]);

  if (!internal || !caseId) return <Navigate to="/portal/loans" replace />;

  const updateDraft = (itemId: string, patch: Partial<Draft>, syncSharedBrik = false) => {
    setDrafts((current) => {
      const next = { ...current, [itemId]: { ...current[itemId], ...patch } };
      const source = items.find((item) => item.id === itemId);
      if (syncSharedBrik && source?.brik_number_snapshot && (sharedBrikCounts[loanReceiptGroupKey(source)] ?? 0) > 1) {
        for (const related of items.filter((item) => loanReceiptGroupKey(item) === loanReceiptGroupKey(source))) {
          next[related.id] = { ...next[related.id], ...patch };
        }
      }
      return next;
    });
    setIssues((current) => ({ ...current, [itemId]: [] }));
  };

  const toggleAll = (selected: boolean) => setDrafts((current) => Object.fromEntries(
    Object.entries(current).map(([id, draft]) => [id, { ...draft, selected }]),
  ));

  const upload = async (itemId: string, file: File | undefined, kind: 'return_meter' | 'return_condition') => {
    if (!file) return;
    setBusy(true); setError('');
    try { await uploadLoanReturnPhoto(caseId, itemId, file, kind); await load(); }
    catch (cause) { setError(message(cause, label)); }
    finally { setBusy(false); }
  };

  const removePhoto = async (photo: LoanItemPhoto) => {
    setBusy(true); setError('');
    try { await removeLoanReturnPhoto(caseId, photo); await load(); }
    catch (cause) { setError(message(cause, label)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (submitting.current || busy) return;
    const selected = Object.values(drafts).filter((draft) => draft.selected);
    if (selected.length === 0) { setError(label('loansReturnSelectAsset')); return; }
    const nextIssues = Object.fromEntries(selected.map((draft) => [draft.caseItemId, getLoanReturnIssues(draft)]));
    setIssues(nextIssues);
    if (Object.values(nextIssues).some((entry) => entry.length > 0)) {
      setError(label('loansReturnValidationError'));
      return;
    }
    const payload = JSON.stringify({ selected, batchNote });
    if (receiptRequest.current?.payload !== payload) receiptRequest.current = { payload, key: crypto.randomUUID() };
    submitting.current = true;
    setBusy(true); setError('');
    try {
      await receiveLoanAssets(caseId, receiptRequest.current.key, selected.map((draft) => ({
        caseItemId: draft.caseItemId,
        serialConfirmed: draft.serialConfirmed,
        brikNumber: draft.observedBrikNumber,
        returnReading: draft.returnReading,
        lowerReadingExplanation: draft.lowerReadingExplanation,
        requiresReview: draft.requiresReview,
        discrepancyNote: draft.discrepancyNote,
        note: draft.note,
      })), batchNote);
      navigate(`/portal/loans/${caseId}`, { replace: true });
    } catch (cause) { setError(message(cause, label)); }
    finally { submitting.current = false; setBusy(false); }
  };

  const close = () => navigate(`/portal/loans/${caseId}`);
  const allSelected = items.length > 0 && items.every((item) => drafts[item.id]?.selected);

  return <LoanShell>
    <Dialog open onOpenChange={(open) => { if (!open && !busy) close(); }}>
      <DialogContent className="flex max-h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-4 pb-4 pt-5 sm:px-6">
          <DialogTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-emerald-700" />{label('loansReceiveTitle')} {loanCase?.loan_number ?? ''}</DialogTitle>
          <DialogDescription>{label('loansReceiveDescription')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {!loaded ? <p className="text-sm text-slate-600">{label('loansLoading')}</p> : <div className="space-y-4">
            {error && <p role="alert" className="border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            {items.length === 0 ? <p className="border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{label('loansNoOutstandingAssets')}</p> : <>
              <label className="flex min-h-11 items-center gap-3 border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800"><input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} />{label('loansSelectAllOutstanding')}</label>
              {items.map((item) => <ReturnAssetCard key={item.id} item={item} draft={drafts[item.id]} photos={photos.filter((photo) => photo.case_item_id === item.id)} issues={issues[item.id] ?? []} sharedBrikCount={item.brik_number_snapshot ? sharedBrikCounts[loanReceiptGroupKey(item)] ?? 1 : 1} busy={busy} label={label} update={(patch, sync) => updateDraft(item.id, patch, sync)} upload={(file, kind) => void upload(item.id, file, kind)} removePhoto={(photo) => void removePhoto(photo)} />)}
              <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">{label('loansReceiptBatchNote')}</span><textarea value={batchNote} onChange={(event) => setBatchNote(event.target.value)} className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            </>}
          </div>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6"><button type="button" onClick={close} disabled={busy} className="h-10 rounded-md border border-slate-300 px-3 text-sm">{label('cancel')}</button><button type="button" onClick={() => void submit()} disabled={busy || items.length === 0} className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? label('loansSavingReceipt') : label('loansCompleteReceipt')}</button></div>
      </DialogContent>
    </Dialog>
  </LoanShell>;
}

function ReturnAssetCard({ item, draft, photos, issues, sharedBrikCount, busy, label, update, upload, removePhoto }: {
  item: LoanCaseItem; draft?: Draft; photos: LoanItemPhoto[]; issues: LoanReturnIssue[]; sharedBrikCount: number; busy: boolean;
  label: (key: string) => string; update: (patch: Partial<Draft>, syncSharedBrik?: boolean) => void;
  upload: (file: File | undefined, kind: 'return_meter' | 'return_condition') => void; removePhoto: (photo: LoanItemPhoto) => void;
}) {
  if (!draft) return null;
  const meterPhoto = photos.find((photo) => photo.photo_kind === 'return_meter' && !photo.return_item_inspection_id);
  const conditionPhoto = photos.find((photo) => photo.photo_kind === 'return_condition' && !photo.return_item_inspection_id);
  const usage = calculateLoanUsage(item.usage_reading_value, draft.returnReading);
  const lower = usage !== null && usage < 0;
  const brikMismatch = item.brik_number_snapshot !== null && draft.observedBrikNumber.trim()
    && Number(draft.observedBrikNumber) !== item.brik_number_snapshot;
  const invalid = (issue: LoanReturnIssue) => issues.includes(issue);
  return <article className={`border p-4 ${draft.selected ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
    <div className="flex items-start gap-3"><input aria-label={label('loansSelectAsset')} className="mt-1 h-4 w-4" type="checkbox" checked={draft.selected} onChange={(event) => update({ selected: event.target.checked }, sharedBrikCount > 1)} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-slate-900">{item.product_name_snapshot ?? item.product_sku}</p><p className="mt-1 text-sm text-slate-600">{label('loansItemNumber')}: {item.product_sku} · {label(item.item_type === 'machine' ? 'loansMachine' : 'loansEquipment')}</p></div><span className="text-xs font-medium text-slate-600">{label('loansStatusOnLoan')}</span></div>
      {sharedBrikCount > 1 && <p className="mt-3 border-l-4 border-sky-500 bg-sky-50 p-2 text-xs text-sky-900">{label('loansSharedBrikGroup').replace('{count}', String(sharedBrikCount))}</p>}
      {draft.selected && <div className="mt-4 space-y-4">
        {item.serial_snapshot && <div className={`rounded-md border p-3 ${invalid('serial_confirmation') ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'}`}><p className="text-xs font-medium uppercase text-slate-500">{label('loansRegisteredSerial')}</p><p className="mt-1 font-mono text-sm font-semibold text-slate-900">{item.serial_snapshot}</p><label className="mt-3 flex items-start gap-2 text-sm"><input className="mt-0.5" type="checkbox" checked={draft.serialConfirmed} onChange={(event) => update({ serialConfirmed: event.target.checked })} />{label('loansConfirmSerial')}</label>{invalid('serial_confirmation') && <InlineError text={label('loansReturnSerialRequired')} />}</div>}
        {item.brik_number_snapshot !== null && <Field label={label('loansObservedBrik')} invalid={invalid('brik_required') || invalid('brik_mismatch')} error={invalid('brik_required') ? label('loansReturnBrikRequired') : invalid('brik_mismatch') ? label('loansReturnBrikMismatch') : undefined}><p className="mb-2 text-xs text-slate-600">{label('loansRegisteredBrik')}: <strong>{item.brik_number_snapshot}</strong></p><input type="number" min="1" step="1" inputMode="numeric" value={draft.observedBrikNumber} onChange={(event) => update({ observedBrikNumber: event.target.value }, sharedBrikCount > 1)} className={inputClass(invalid('brik_required') || invalid('brik_mismatch'))} />{brikMismatch && <p className="mt-2 flex items-center gap-1 text-xs text-amber-800"><AlertTriangle className="h-4 w-4" />{label('loansReturnBrikMismatchWarning')}</p>}</Field>}
        {item.usage_reading_unit && <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border border-slate-200 bg-white p-3"><p className="text-xs font-medium uppercase text-slate-500">{label('loansCheckoutReading')}</p><p className="mt-1 font-semibold">{item.usage_reading_value ?? '—'} {unitLabel(item.usage_reading_unit)}</p></div><Field label={label('loansReturnReading')} invalid={invalid('return_reading')} error={invalid('return_reading') ? label('loansReturnReadingRequired') : undefined}><input type="number" min="0" step="any" inputMode="decimal" value={draft.returnReading} onChange={(event) => update({ returnReading: event.target.value })} className={inputClass(invalid('return_reading'))} /></Field>{usage !== null && <div className="rounded-md border border-slate-200 bg-white p-3 sm:col-span-2"><p className="text-xs font-medium uppercase text-slate-500">{label('loansCalculatedUse')}</p><p className={`mt-1 font-semibold ${lower ? 'text-amber-800' : 'text-slate-900'}`}>{usage} {unitLabel(item.usage_reading_unit)}</p></div>}{lower && <Field label={label('loansLowerReadingExplanation')} invalid={invalid('lower_reading_explanation')} error={invalid('lower_reading_explanation') ? label('loansLowerReadingExplanationRequired') : undefined}><textarea value={draft.lowerReadingExplanation} onChange={(event) => update({ lowerReadingExplanation: event.target.value })} className={textareaClass(invalid('lower_reading_explanation'))} /><p className="mt-1 text-xs text-amber-800">{label('loansLowerReadingWarning')}</p></Field>}</div>}
        <div className="grid gap-3 sm:grid-cols-2">{item.usage_reading_unit && <ReturnPhoto label={`${label('loansReturnMeterPhoto')} *`} photo={meterPhoto} invalid={invalid('return_meter_photo')} error={label('loansReturnMeterPhotoRequired')} busy={busy} onFile={(file) => upload(file, 'return_meter')} onRemove={removePhoto} copy={label} />}<ReturnPhoto label={`${label('loansReturnConditionPhoto')} · ${label('loansOptional')}`} photo={conditionPhoto} busy={busy} onFile={(file) => upload(file, 'return_condition')} onRemove={removePhoto} copy={label} /></div>
        <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-950"><input className="mt-0.5" type="checkbox" checked={draft.requiresReview} onChange={(event) => update({ requiresReview: event.target.checked })} /><span>{label('loansRequiresReview')}<span className="mt-1 block text-xs font-normal">{label('loansRequiresReviewHelp')}</span></span></label>
        {draft.requiresReview && <Field label={`${label('loansDiscrepancyNote')} *`} invalid={invalid('discrepancy_note')} error={invalid('discrepancy_note') ? label('loansDiscrepancyNoteRequired') : undefined}><textarea value={draft.discrepancyNote} onChange={(event) => update({ discrepancyNote: event.target.value })} className={textareaClass(invalid('discrepancy_note'))} /></Field>}
        <Field label={label('loansReceiptNote')}><textarea value={draft.note} onChange={(event) => update({ note: event.target.value })} className={textareaClass(false)} /></Field>
      </div>}
    </div></div>
  </article>;
}

function ReturnPhoto({ label, photo, invalid = false, error, busy, onFile, onRemove, copy }: { label: string; photo?: LoanItemPhoto; invalid?: boolean; error?: string; busy: boolean; onFile: (file: File | undefined) => void; onRemove: (photo: LoanItemPhoto) => void; copy: (key: string) => string }) {
  return <div className={`rounded-md border p-3 ${invalid ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'}`}><p className="text-sm font-medium text-slate-700">{label}</p>{photo?.preview_url ? <img src={photo.preview_url} alt={label} className="mt-2 aspect-video w-full rounded-sm object-cover" /> : <div className="mt-2 flex aspect-video items-center justify-center bg-slate-100 text-slate-400"><Camera className="h-7 w-7" /></div>}{photo && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-800"><CheckCircle2 className="h-4 w-4" />{copy('loansPhotoUploaded')}</p>}{invalid && error && <InlineError text={error} />}<div className="mt-2 flex flex-wrap gap-2"><label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800"><Camera className="h-4 w-4" />{copy('loansTakePhoto')}<input className="sr-only" type="file" accept="image/*" capture="environment" disabled={busy} onChange={(event) => onFile(event.target.files?.[0])} /></label><label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800"><UploadCloud className="h-4 w-4" />{copy('loansUploadPhoto')}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => onFile(event.target.files?.[0])} /></label>{photo && <button type="button" onClick={() => onRemove(photo)} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm text-red-700"><X className="h-4 w-4" />{copy('loansRemovePhoto')}</button>}</div></div>;
}

function createDraft(item: LoanCaseItem, photos: LoanItemPhoto[]): Draft {
  return { caseItemId: item.id, selected: false, serialNumber: item.serial_snapshot, serialConfirmed: false, registeredBrikNumber: item.brik_number_snapshot, observedBrikNumber: '', checkoutReading: item.usage_reading_value, readingUnit: item.usage_reading_unit, returnReading: '', hasMeterPhoto: photos.some((photo) => photo.case_item_id === item.id && photo.photo_kind === 'return_meter'), requiresReview: false, discrepancyNote: '', lowerReadingExplanation: '', note: '' };
}
function Field({ label, children, invalid = false, error }: { label: string; children: ReactNode; invalid?: boolean; error?: string }) { return <label className={`block text-sm font-medium ${invalid ? 'text-red-800' : 'text-slate-700'}`}><span className="mb-1 block">{label}</span>{children}{invalid && error && <InlineError text={error} />}</label>; }
function InlineError({ text }: { text: string }) { return <span className="mt-1 block text-xs text-red-700">{text}</span>; }
function inputClass(invalid: boolean) { return `h-10 w-full rounded-md border px-3 text-sm focus:outline-none ${invalid ? 'border-red-500 bg-red-50 focus:border-red-600' : 'border-slate-300 bg-white focus:border-emerald-600'}`; }
function textareaClass(invalid: boolean) { return `min-h-20 w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${invalid ? 'border-red-500 bg-red-50 focus:border-red-600' : 'border-slate-300 bg-white focus:border-emerald-600'}`; }
function unitLabel(unit: 'km' | 'hours') { return unit === 'hours' ? 'h' : 'km'; }
function message(cause: unknown, label: (key: string) => string) { return cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : label('loansLoadError'); }
