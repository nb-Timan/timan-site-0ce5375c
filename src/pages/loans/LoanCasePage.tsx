import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Camera, CheckCircle2, History, RotateCcw, Trash2, UploadCloud } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import LoanShell from '@/pages/loans/LoanShell';
import LoanStockPanel from '@/pages/loans/LoanStockPanel';
import { addFabricLoanAsset } from '@/lib/fabricLoanStockService';
import type { FabricLoanAsset } from '@/lib/fabricLoanStock';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import { t } from '@/lib/i18n/translations';
import { getLoanPreparationIssues, isLoanDateRangeValid } from '@/lib/loanDomain';
import { derivePortalRole, isInternalTimanPortalRole } from '@/lib/portalAccess';
import {
  createLoanCase,
  confirmLoanDraftSerials,
  getLoanCase,
  listLoanCaseHistory,
  listLoanContacts,
  listLoanPartners,
  listLoanSellers,
  removeLoanItem,
  removeLoanItemPhoto,
  reopenLoanForEdit,
  submitLoanCaseForReview,
  updateLoanDraft,
  updateLoanCaseRelationships,
  updateLoanItemUsage,
  uploadLoanItemPhoto,
  validateLoanImage,
  type LoanCase,
  type LoanCaseEvent,
  type LoanCaseItem,
  type LoanContact,
  type LoanItemPhoto,
  type LoanPartner,
  type LoanPhotoKind,
  type LoanSeller,
} from '@/lib/loanService';

const fieldClass = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none';
const textareaClass = 'min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none';

export default function LoanCasePage() {
  const { appUser } = useAppUser();
  const { caseId } = useParams();
  const isNew = !caseId;
  const role = derivePortalRole(appUser);
  const canManageCase = isInternalTimanPortalRole(role);
  const canAdministerCase = role === 'timan_backend';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { uiLanguage } = useLanguage();
  const label = useCallback((key: string) => t(key, uiLanguage), [uiLanguage]);
  const hydratedCaseId = useRef<string | null>(null);
  const refreshGeneration = useRef(0);

  const [sellers, setSellers] = useState<LoanSeller[]>([]);
  const [partners, setPartners] = useState<LoanPartner[]>([]);
  const [contacts, setContacts] = useState<LoanContact[]>([]);
  const [loanCase, setLoanCase] = useState<LoanCase | null>(null);
  const [items, setItems] = useState<LoanCaseItem[]>([]);
  const [photos, setPhotos] = useState<LoanItemPhoto[]>([]);
  const [history, setHistory] = useState<LoanCaseEvent[]>([]);
  const [sellerId, setSellerId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [contactId, setContactId] = useState('');
  const [loanDate, setLoanDate] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [notes, setNotes] = useState('');
  const [alternative, setAlternative] = useState(false);
  const [address, setAddress] = useState('');
  const [postal, setPostal] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [addressContact, setAddressContact] = useState('');
  const [addressNote, setAddressNote] = useState('');
  const [readingDrafts, setReadingDrafts] = useState<Record<string, string>>({});
  const [unitDrafts, setUnitDrafts] = useState<Record<string, '' | 'km' | 'hours'>>({});
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
  const [serialConfirmed, setSerialConfirmed] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async (targetId = caseId) => {
    if (!targetId) return;
    const generation = ++refreshGeneration.current;
    const [detail, events] = await Promise.all([getLoanCase(targetId), listLoanCaseHistory(targetId)]);
    if (generation !== refreshGeneration.current) return;
    setLoanCase(detail.loanCase);
    setItems(detail.items);
    setPhotos(detail.photos);
    setHistory(events);
    setReadingDrafts(Object.fromEntries(detail.items.map((item) => [item.id, item.usage_reading_value?.toString() ?? ''])));
    setUnitDrafts(Object.fromEntries(detail.items.map((item) => [item.id, item.usage_reading_unit ?? ''])));
    setLimitDrafts(Object.fromEntries(detail.items.map((item) => [item.id, item.driving_use_limit ?? ''])));
    if (hydratedCaseId.current !== targetId) {
      hydratedCaseId.current = targetId;
      setSellerId(detail.loanCase.responsible_user_id);
      setPartnerId(detail.loanCase.dealer_account_id);
      setContactId(detail.loanCase.dealer_contact_id);
      setLoanDate(detail.loanCase.loan_date ?? '');
      setExpectedReturn(detail.loanCase.expected_return_date ?? '');
      setNotes(detail.loanCase.notes ?? '');
      setAlternative(detail.loanCase.alternative_delivery_address);
      setAddress(detail.loanCase.delivery_address ?? '');
      setPostal(detail.loanCase.delivery_postal_code ?? '');
      setCity(detail.loanCase.delivery_city ?? '');
      setCountry(detail.loanCase.delivery_country ?? '');
      setAddressContact(detail.loanCase.delivery_contact ?? '');
      setAddressNote(detail.loanCase.delivery_note ?? '');
      setSerialConfirmed(Boolean(detail.loanCase.serial_numbers_confirmed_at));
    }
  }, [caseId]);

  useEffect(() => {
    if (!canManageCase) return;
    void listLoanSellers().then(setSellers).catch(() => setError(label('loansLoadError')));
  }, [canManageCase, label]);
  useEffect(() => {
    if (!caseId) return;
    void refresh().catch(() => setError(label('loansLoadError')));
  }, [caseId, label, refresh]);
  useEffect(() => {
    if (!canManageCase || !sellerId) { setPartners([]); return; }
    void listLoanPartners(sellerId).then((next) => {
      setPartners(next);
      if (partnerId && !next.some((partner) => partner.id === partnerId)) { setPartnerId(''); setContactId(''); }
    }).catch(() => setError(label('loansLoadError')));
  }, [canManageCase, label, partnerId, sellerId]);
  useEffect(() => {
    if (!canManageCase || !partnerId) { setContacts([]); return; }
    void listLoanContacts(partnerId).then((next) => {
      setContacts(next);
      if (contactId && !next.some((contact) => contact.id === contactId)) setContactId('');
    }).catch(() => setError(label('loansLoadError')));
  }, [canManageCase, contactId, label, partnerId]);

  const dateRangeValid = isLoanDateRangeValid(loanDate || null, expectedReturn || null);

  const draftInput = useMemo(() => ({
    loanDate: loanDate || null,
    expectedReturnDate: expectedReturn || null,
    notes: notes || null,
    alternativeDeliveryAddress: alternative,
    address: alternative ? address || null : null,
    postalCode: alternative ? postal || null : null,
    city: alternative ? city || null : null,
    country: alternative ? country || null : null,
    addressContact: alternative ? addressContact || null : null,
    addressNote: alternative ? addressNote || null : null,
  }), [address, addressContact, addressNote, alternative, city, country, expectedReturn, loanDate, notes, postal]);

  const saveDraft = async () => {
    const headerIssues = [!sellerId && 'seller', !partnerId && 'partner', !contactId && 'contact', !dateRangeValid && 'date_range'].filter(Boolean) as string[];
    if (headerIssues.length > 0) { setValidationIssues(headerIssues); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      if (caseId) {
        if (canAdministerCase) await updateLoanCaseRelationships(caseId, { sellerId, partnerId, contactId });
        await updateLoanDraft(caseId, draftInput);
        await persistUsageDrafts(caseId);
        await confirmLoanDraftSerials(caseId, serialConfirmed);
        await refresh();
        setNotice(label('loansDraftSaved'));
      } else {
        const id = await createLoanCase({ sellerId, partnerId, contactId, ...draftInput });
        navigate(`/portal/loans/${id}`, { replace: true });
      }
    } catch (cause) { setError(errorText(cause, label)); }
    finally { setBusy(false); }
  };

  const persistUsageDrafts = async (id: string) => {
    for (const item of items.filter((entry) => entry.item_type === 'machine')) {
      const raw = readingDrafts[item.id]?.replace(',', '.').trim();
      const value = raw ? Number(raw) : null;
      const unit = value === null ? null : unitDrafts[item.id] || null;
      const limit = limitDrafts[item.id]?.trim() || null;
      if (value !== null && (!Number.isFinite(value) || value < 0 || !unit)) throw new Error('Invalid usage reading');
      if (value !== item.usage_reading_value || unit !== item.usage_reading_unit || limit !== item.driving_use_limit) {
        await updateLoanItemUsage(id, item.id, { value, unit, limit });
      }
    }
  };

  const addAsset = async (asset: FabricLoanAsset) => {
    if (!dateRangeValid || (isNew && (!sellerId || !partnerId || !contactId))) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const id = caseId ?? await createLoanCase({ sellerId, partnerId, contactId, ...draftInput });
      if (!caseId) navigate(`/portal/loans/${id}`, { replace: true });
      await addFabricLoanAsset(id, asset.asset_id);
      setSerialConfirmed(false);
      await refresh(id);
    } catch (cause) { setError(errorText(cause, label)); }
    finally { setBusy(false); await queryClient.invalidateQueries({ queryKey: ['fabric-loan-stock'] }); }
  };

  const saveUsage = async (itemId: string) => {
    if (!caseId) return;
    const raw = readingDrafts[itemId]?.replace(',', '.').trim();
    const value = raw ? Number(raw) : null;
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    setBusy(true); setError('');
    try {
      await updateLoanItemUsage(caseId, itemId, {
        value,
        unit: value === null ? null : unitDrafts[itemId] || null,
        limit: limitDrafts[itemId]?.trim() || null,
      });
      setSerialConfirmed(false);
      await refresh();
    }
    catch (cause) { setError(errorText(cause, label)); }
    finally { setBusy(false); }
  };

  const removeAsset = async (item: LoanCaseItem) => {
    if (!caseId) return;
    setBusy(true); setError('');
    try {
      for (const photo of photos.filter((entry) => entry.case_item_id === item.id)) await removeLoanItemPhoto(caseId, photo);
      await removeLoanItem(caseId, item.id);
      setSerialConfirmed(false);
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['fabric-loan-stock'] })]);
    } catch (cause) { setError(errorText(cause, label)); }
    finally { setBusy(false); }
  };

  const upload = async (itemId: string, file: File | undefined, kind: LoanPhotoKind) => {
    if (!caseId || !file) return;
    const key = `${itemId}:${kind}`;
    setBusy(true); setError(''); setUploadProgress((current) => ({ ...current, [key]: 1 }));
    try {
      validateLoanImage(file);
      const existing = photos.find((photo) => photo.case_item_id === itemId && photo.photo_kind === kind);
      if (existing) await removeLoanItemPhoto(caseId, existing);
      await uploadLoanItemPhoto(caseId, itemId, file, kind, (value) => setUploadProgress((current) => ({ ...current, [key]: value })));
      setSerialConfirmed(false);
      await refresh();
    } catch (cause) { setError(errorText(cause, label)); }
    finally { setBusy(false); setUploadProgress((current) => { const next = { ...current }; delete next[key]; return next; }); }
  };

  const removePhoto = async (photo: LoanItemPhoto) => {
    if (!caseId) return;
    setBusy(true); setError('');
    try { await removeLoanItemPhoto(caseId, photo); setSerialConfirmed(false); await refresh(); }
    catch (cause) { setError(errorText(cause, label)); }
    finally { setBusy(false); }
  };

  const continueToReview = async () => {
    if (!caseId || !loanCase) return;
    const issues = getLoanPreparationIssues({
      loanDate: loanDate || null,
      expectedReturnDate: expectedReturn || null,
      serialNumbersConfirmed: serialConfirmed,
      items: items.map((item) => ({
        ...item,
        usage_reading_value: readingDrafts[item.id]?.trim() ? Number(readingDrafts[item.id].replace(',', '.')) : null,
        usage_reading_unit: unitDrafts[item.id] || null,
        photoKinds: photos.filter((photo) => photo.case_item_id === item.id).map((photo) => photo.photo_kind),
      })),
    });
    setValidationIssues(issues);
    if (issues.length > 0) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await updateLoanDraft(caseId, draftInput);
      await persistUsageDrafts(caseId);
      await submitLoanCaseForReview(caseId, true);
      setNotice(label('loansReviewReady'));
      await refresh();
    } catch (cause) { setError(errorText(cause, label)); }
    finally { setBusy(false); }
  };

  const reopen = async () => {
    if (!caseId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await reopenLoanForEdit(caseId);
      await refresh();
      setSerialConfirmed(false);
      setValidationIssues([]);
      setNotice(label('loansReopened'));
    }
    catch (cause) { setError(errorText(cause, label)); }
    finally { setBusy(false); }
  };

  if (isNew && !canManageCase) return <Navigate to="/portal/loans" replace />;

  return <LoanShell>
    <div className="mb-4"><Link to="/portal/loans" className="text-sm font-medium text-emerald-800 underline">{label('loansCases')}</Link></div>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold text-slate-900">{isNew ? label('loansNewCase') : loanCase?.loan_number ?? label('loansLoading')}</h1>
      {canAdministerCase && loanCase && ['READY_FOR_REVIEW','AWAITING_ACCEPTANCE','ACCEPTED'].includes(loanCase.status) && <button type="button" disabled={busy} onClick={() => void reopen()} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800"><RotateCcw className="h-4 w-4" />{label('loansReopen')}</button>}
    </div>
    {error && <p role="alert" className="mt-4 border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mt-4 border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}

    <div className="mt-5 max-w-5xl space-y-5">
      {loanCase?.status === 'READY_FOR_REVIEW' && <section className="border-l-4 border-emerald-600 bg-emerald-50 p-4" aria-label={label('loansReviewReady')}>
        <div className="flex items-start gap-2 text-emerald-900"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><h2 className="font-semibold">{label('loansReviewReady')}</h2><p className="mt-1 text-sm">{label('loansSerialConfirmation')}</p></div></div>
      </section>}
      <fieldset disabled={busy || !canManageCase || (!isNew && loanCase?.status !== 'DRAFT')} className="min-w-0 space-y-5">
      <section className="border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-semibold uppercase text-slate-700">{label('loansAgreement')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {isNew || (canAdministerCase && loanCase?.status === 'DRAFT') ? <>
            <Field label={label('loansSeller')} invalid={validationIssues.includes('seller') && !sellerId} error={label('loansRequiredSeller')}><select className={controlClass(validationIssues.includes('seller') && !sellerId)} value={sellerId} onChange={(event) => { setSellerId(event.target.value); setPartnerId(''); setContactId(''); }}><option value="">{label('loansSelectSeller')}</option>{sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.initials} · {seller.display_name}</option>)}</select></Field>
            <Field label={label('loansPartner')} invalid={validationIssues.includes('partner') && !partnerId} error={label('loansRequiredPartner')}><select className={controlClass(validationIssues.includes('partner') && !partnerId)} value={partnerId} onChange={(event) => { setPartnerId(event.target.value); setContactId(''); }} disabled={!sellerId}><option value="">{label('loansSelectPartner')}</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.account_number} · {partner.company_name}</option>)}</select></Field>
            <Field label={label('loansContact')} invalid={validationIssues.includes('contact') && !contactId} error={label('loansRequiredContact')}><select className={controlClass(validationIssues.includes('contact') && !contactId)} value={contactId} onChange={(event) => setContactId(event.target.value)} disabled={!partnerId || contacts.length === 0}><option value="">{label('loansSelectContact')}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.role_title ? ` · ${contact.role_title}` : ''}</option>)}</select>{partnerId && contacts.length === 0 && <p className="mt-1 text-xs text-amber-800">{label('loansNoContacts')}</p>}</Field>
          </> : <>
            <Info label={label('loansSeller')} value={sellers.find((seller) => seller.id === sellerId)?.display_name ?? sellerId} />
            <Info label={label('loansPartner')} value={partners.find((partner) => partner.id === partnerId)?.company_name ?? partnerId} />
            <Info label={label('loansContact')} value={contacts.find((contact) => contact.id === contactId)?.name ?? contactId} />
          </>}
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2" data-testid="loan-date-row">
            <Input label={label('loansLoanDate')} value={loanDate} setValue={setLoanDate} type="date" invalid={validationIssues.includes('loan_date') && !loanDate} error={label('loansRequiredLoanDate')} />
            <Input label={label('loansExpectedReturn')} value={expectedReturn} setValue={setExpectedReturn} type="date" invalid={validationIssues.includes('expected_return_date') && !expectedReturn} error={label('loansRequiredReturnDate')} />
          </div>
          {!dateRangeValid && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{label('loansDateRangeError')}</p>}
          <Field label={label('loansNotes')} wide><textarea className={textareaClass} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={alternative} onChange={(event) => setAlternative(event.target.checked)} />{label('loansAlternativeAddress')}</label>
        {alternative && <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input label={label('loansAddress')} value={address} setValue={setAddress} /><Input label={label('loansPostalCode')} value={postal} setValue={setPostal} /><Input label={label('loansCity')} value={city} setValue={setCity} /><Input label={label('loansCountry')} value={country} setValue={setCountry} /><Input label={label('loansAddressContact')} value={addressContact} setValue={setAddressContact} /><Input label={label('loansAddressNote')} value={addressNote} setValue={setAddressNote} /></div>}
      </section>
      </fieldset>

      <section className="border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">{label('loansAssets')}</h2>{caseId && <span className="text-xs text-slate-500">{items.length}</span>}</div>
        {canManageCase && (isNew || loanCase?.status === 'DRAFT') && <div className="mt-4">
          <LoanStockPanel busy={busy} selectionReady={dateRangeValid && (!isNew || Boolean(sellerId && partnerId && contactId))} onSelect={(asset) => void addAsset(asset)} />
        </div>}

        <div className="mt-4 space-y-4">
          {items.map((item) => <LoanItemCard key={item.id} item={item} photos={photos.filter((photo) => photo.case_item_id === item.id)} editable={canManageCase && loanCase?.status === 'DRAFT'} busy={busy} validationIssues={validationIssues}
            reading={readingDrafts[item.id] ?? ''} setReading={(value) => setReadingDrafts((current) => ({ ...current, [item.id]: value }))}
            unit={unitDrafts[item.id] ?? ''} setUnit={(value) => setUnitDrafts((current) => ({ ...current, [item.id]: value }))}
            limit={limitDrafts[item.id] ?? ''} setLimit={(value) => setLimitDrafts((current) => ({ ...current, [item.id]: value }))}
            onSaveUsage={() => void saveUsage(item.id)} onUpload={(file, kind) => void upload(item.id, file, kind)} onRemovePhoto={(photo) => void removePhoto(photo)} onRemoveAsset={() => void removeAsset(item)} uploadProgress={uploadProgress} label={label} />)}
        </div>

        {caseId && canManageCase && loanCase?.status === 'DRAFT' && <label className={`mt-5 flex items-start gap-3 border-t p-3 text-sm font-medium ${validationIssues.includes('serial_confirmation') && !serialConfirmed ? 'border-red-400 bg-red-50 text-red-900' : 'border-slate-200 text-slate-800'}`}><input className="mt-0.5 h-4 w-4" type="checkbox" checked={serialConfirmed} onChange={(event) => setSerialConfirmed(event.target.checked)} /><span>{label('loansSerialConfirmation')}{validationIssues.includes('serial_confirmation') && !serialConfirmed && <span className="mt-1 block text-xs text-red-700">{label('loansRequiredConfirmation')}</span>}</span></label>}
      </section>

      {validationIssues.length > 0 && <div role="alert" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-medium">{label('loansPreparationMissing')}</p><ul className="mt-2 list-disc pl-5">{validationIssues.map((issue) => <li key={issue}>{issueLabel(issue, label)}</li>)}</ul></div>}

      {canManageCase && (!loanCase || loanCase.status === 'DRAFT') && <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={() => void saveDraft()} className="h-10 rounded-md border border-emerald-700 bg-white px-4 text-sm font-medium text-emerald-800 disabled:opacity-50">{label('loansSaveDraft')}</button>
        {caseId && <button type="button" disabled={busy} onClick={() => void continueToReview()} className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50">{label('loansContinueReview')}</button>}
      </div>}
      {caseId && history.length > 0 && <section className="border border-slate-200 bg-white p-4" aria-label={label('loansHistory')}><h2 className="flex items-center gap-2 font-semibold text-slate-900"><History className="h-4 w-4" />{label('loansHistory')}</h2><ol className="mt-3 divide-y divide-slate-200">{history.slice(0, 20).map((event) => <li key={event.id} className="py-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-slate-800">{historyLabel(event, label)}</span><time className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString(uiLanguage)}</time></div><p className="mt-1 text-xs text-slate-600">{event.actor_name}</p></li>)}</ol></section>}
    </div>
  </LoanShell>;
}

function LoanItemCard({ item, photos, editable, busy, reading, setReading, unit, setUnit, limit, setLimit, onSaveUsage, onUpload, onRemovePhoto, onRemoveAsset, uploadProgress, validationIssues, label }: {
  item: LoanCaseItem;
  photos: LoanItemPhoto[];
  editable: boolean;
  busy: boolean;
  reading: string;
  setReading: (value: string) => void;
  unit: '' | 'km' | 'hours';
  setUnit: (value: '' | 'km' | 'hours') => void;
  limit: string;
  setLimit: (value: string) => void;
  onSaveUsage: () => void;
  onUpload: (file: File | undefined, kind: LoanPhotoKind) => void;
  onRemovePhoto: (photo: LoanItemPhoto) => void;
  onRemoveAsset: () => void;
  uploadProgress: Record<string, number>;
  validationIssues: string[];
  label: (key: string) => string;
}) {
  const photo = (kind: LoanPhotoKind) => photos.find((entry) => entry.photo_kind === kind);
  const readingInvalid = validationIssues.includes('usage_reading_value') && !reading.trim();
  const unitInvalid = validationIssues.includes('usage_reading_unit') && !unit;
  const plateInvalid = validationIssues.includes('type_plate_photo') && !photo('serial_plate');
  return <article className="border border-slate-200 bg-slate-50 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="font-semibold text-slate-900">{item.product_name_snapshot ?? item.product_sku}</p><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600"><span>{label('loansItemNumber')}: {item.product_sku}</span><span>{label('loansSerialNumber')}: {item.serial_snapshot ?? '—'}</span><span>{label('loansWarehouse')}: {item.warehouse_snapshot ?? item.warehouse_location_code_snapshot ?? '—'}</span><span>{label('loansStockAccount')}: {item.fabric_account_number_snapshot ?? '—'}</span>{item.fabric_order_number_snapshot && <span>{label('loansStockOrder')}: {item.fabric_order_number_snapshot}</span>}</div></div>
      <div className="flex items-center gap-2"><span className="rounded-sm bg-white px-2 py-1 text-xs font-medium text-slate-700">{label(item.item_type === 'machine' ? 'loansMachine' : 'loansEquipment')}</span>{editable && <button type="button" onClick={onRemoveAsset} disabled={busy} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 text-red-700" title={label('loansRemoveAsset')}><Trash2 className="h-4 w-4" /></button>}</div>
    </div>
    {item.item_type === 'machine' && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1.4fr)_auto]">
      <Field label={`${label('loansHourMeterCheckout')} *`} invalid={readingInvalid} error={label('loansRequiredHourValue')}><input type="number" inputMode="decimal" min="0" step="any" className={controlClass(readingInvalid)} value={reading} onChange={(event) => setReading(event.target.value)} disabled={!editable} /></Field>
      <Field label={`${label('loansUsageUnit')} *`} invalid={unitInvalid} error={label('loansRequiredUsageUnit')}><select className={controlClass(unitInvalid)} value={unit} onChange={(event) => setUnit(event.target.value as '' | 'km' | 'hours')} disabled={!editable}><option value="">—</option><option value="hours">h</option><option value="km">km</option></select></Field>
      <Field label={label('loansUseLimit')}><input className={fieldClass} value={limit} onChange={(event) => setLimit(event.target.value)} disabled={!editable} /></Field>
      <button type="button" onClick={onSaveUsage} disabled={!editable || busy} className="h-10 self-end rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 disabled:opacity-50">{label('loansSaveReading')}</button>
    </div>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <PhotoField label={`${label('loansTypePlatePhoto')} *`} photo={photo('serial_plate')} progress={uploadProgress[`${item.id}:serial_plate`]} editable={editable} onFile={(file) => onUpload(file, 'serial_plate')} onRemove={onRemovePhoto} copy={label} invalid={plateInvalid} />
      <PhotoField label={`${label(item.item_type === 'machine' ? 'loansMachineConditionPhoto' : 'loansEquipmentConditionPhoto')} · ${label('loansOptional')}`} photo={photo('overview')} progress={uploadProgress[`${item.id}:overview`]} editable={editable} onFile={(file) => onUpload(file, 'overview')} onRemove={onRemovePhoto} copy={label} />
    </div>
  </article>;
}

function PhotoField({ label, photo, progress, editable, onFile, onRemove, copy, invalid = false }: { label: string; photo?: LoanItemPhoto; progress?: number; editable: boolean; onFile: (file: File | undefined) => void; onRemove: (photo: LoanItemPhoto) => void; copy: (key: string) => string; invalid?: boolean }) {
  const uploading = progress !== undefined;
  return <div className={`rounded-md border p-3 ${invalid ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'}`}>
    <p className="text-sm font-medium text-slate-700">{label}</p>
    {photo?.preview_url ? <img src={photo.preview_url} alt={label} className="mt-2 aspect-video w-full rounded-sm object-cover" /> : <div className="mt-2 flex aspect-video items-center justify-center rounded-sm bg-slate-100 text-slate-400"><Camera className="h-7 w-7" /></div>}
    {photo && <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-800"><CheckCircle2 className="h-4 w-4" />{copy('loansPhotoUploaded')}</p>}
    {invalid && <p className="mt-2 text-xs text-red-700">{copy('loansRequiredTypePlate')}</p>}
    {uploading && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${Math.max(progress, 8)}%` }} /></div>}
    {editable && <div className="mt-2 flex flex-wrap gap-2">
      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800"><Camera className="h-4 w-4" />{copy('loansTakePhoto')}<input className="sr-only" type="file" accept="image/*" capture="environment" disabled={uploading} onChange={(event) => onFile(event.target.files?.[0])} /></label>
      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800"><UploadCloud className="h-4 w-4" />{uploading ? copy('loansUploading') : photo ? copy('loansReplacePhoto') : copy('loansUploadPhoto')}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => onFile(event.target.files?.[0])} /></label>
      {photo && <button type="button" onClick={() => onRemove(photo)} className="min-h-10 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700">{copy('loansRemovePhoto')}</button>}
    </div>}
  </div>;
}

function Field({ label, children, wide = false, invalid = false, error }: { label: string; children: ReactNode; wide?: boolean; invalid?: boolean; error?: string }) { return <label className={`block text-sm font-medium ${invalid ? 'text-red-800' : 'text-slate-700'} ${wide ? 'sm:col-span-2' : ''}`}><span className="mb-1 block">{label}</span>{children}{invalid && error && <span className="mt-1 block text-xs text-red-700">{error}</span>}</label>; }
function Input({ label, value, setValue, type = 'text', invalid = false, error }: { label: string; value: string; setValue: (value: string) => void; type?: string; invalid?: boolean; error?: string }) { return <Field label={label} invalid={invalid} error={error}><input type={type} className={controlClass(invalid)} value={value} onChange={(event) => setValue(event.target.value)} /></Field>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className="mt-1 break-words text-sm text-slate-900">{value}</p></div>; }

function controlClass(invalid: boolean) { return invalid ? `${fieldClass} border-red-500 bg-red-50 focus:border-red-600` : fieldClass; }

function issueLabel(issue: string, label: (key: string) => string): string {
  const keys: Record<string, string> = {
    loan_date: 'loansRequiredLoanDate', expected_return_date: 'loansRequiredReturnDate', date_range: 'loansDateRangeError',
    asset: 'loansRequiredAsset', serial: 'loansRequiredSerial', type_plate_photo: 'loansRequiredTypePlate',
    usage_reading_value: 'loansRequiredHourValue', usage_reading_unit: 'loansUsageUnit', serial_confirmation: 'loansRequiredConfirmation',
  };
  return label(keys[issue] ?? 'loansPreparationMissing');
}

function historyLabel(event: LoanCaseEvent, label: (key: string) => string): string {
  const field = typeof event.metadata.field === 'string' ? event.metadata.field : '';
  const oldValue = event.metadata.old_value == null ? '—' : String(event.metadata.old_value);
  const newValue = event.metadata.new_value == null ? '—' : String(event.metadata.new_value);
  if (event.event_type === 'EXPECTED_RETURN_CHANGED') return `${label('loansExpectedReturn')}: ${oldValue} → ${newValue}`;
  if (event.event_type === 'CASE_REOPENED_FOR_EDIT') return label('loansReopened');
  if (event.event_type === 'ASSET_ADDED') return label('loansHistoryAssetAdded');
  if (event.event_type === 'ASSET_REMOVED') return label('loansHistoryAssetRemoved');
  if (field) return `${field}: ${oldValue} → ${newValue}`;
  return event.event_type.replaceAll('_', ' ');
}

function errorText(cause: unknown, label: (key: string) => string): string {
  if (cause instanceof Error && cause.message === 'loan_image_type') return label('loansImageTypeError');
  if (cause instanceof Error && cause.message === 'loan_image_size') return label('loansImageSizeError');
  return cause instanceof Error ? cause.message : label('loansLoadError');
}
