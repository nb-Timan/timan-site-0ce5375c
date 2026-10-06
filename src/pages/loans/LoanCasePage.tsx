import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Camera, CheckCircle2, Plus } from 'lucide-react';
import LoanShell from '@/pages/loans/LoanShell';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import { t } from '@/lib/i18n/translations';
import { derivePortalRole, isInternalTimanPortalRole } from '@/lib/portalAccess';
import {
  addLoanMachine, createLoanCase, createLoanCaseVersion, getLoanCase, listEligibleLoanMachines,
  listLoanContacts, listLoanPartners, listLoanSellers, uploadLoanItemPhoto,
  type LoanCase, type LoanCaseItem, type LoanContact, type LoanMachine, type LoanPartner, type LoanSeller,
} from '@/lib/loanService';

const fieldClass = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none';
const textareaClass = 'min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none';

export default function LoanCasePage() {
  const { appUser } = useAppUser();
  const { caseId } = useParams();
  const isNew = !caseId;
  const canManageCase = isInternalTimanPortalRole(derivePortalRole(appUser));
  const navigate = useNavigate();
  const { uiLanguage } = useLanguage();
  const label = (key: string) => t(key, uiLanguage);
  const [sellers, setSellers] = useState<LoanSeller[]>([]);
  const [partners, setPartners] = useState<LoanPartner[]>([]);
  const [contacts, setContacts] = useState<LoanContact[]>([]);
  const [machines, setMachines] = useState<LoanMachine[]>([]);
  const [loanCase, setLoanCase] = useState<LoanCase | null>(null);
  const [items, setItems] = useState<LoanCaseItem[]>([]);
  const [sellerId, setSellerId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [contactId, setContactId] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [notes, setNotes] = useState('');
  const [alternative, setAlternative] = useState(false);
  const [address, setAddress] = useState(''); const [postal, setPostal] = useState(''); const [city, setCity] = useState('');
  const [country, setCountry] = useState(''); const [addressContact, setAddressContact] = useState(''); const [addressNote, setAddressNote] = useState('');
  const [machineId, setMachineId] = useState(''); const [reading, setReading] = useState(''); const [readingUnit, setReadingUnit] = useState<'km' | 'hours'>('hours');
  const [useLimit, setUseLimit] = useState(''); const [responsiblePerson, setResponsiblePerson] = useState(''); const [serialVerified, setSerialVerified] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [versionCreated, setVersionCreated] = useState(false);

  const refresh = useCallback(async () => {
    if (!caseId) return;
    const detail = await getLoanCase(caseId);
    setLoanCase(detail.loanCase); setItems(detail.items);
  }, [caseId]);
  useEffect(() => {
    if (canManageCase) {
      void listLoanSellers().then(setSellers).catch(() => setError(t('loansLoadError', uiLanguage)));
    }
    if (caseId) {
      const requests = canManageCase
        ? [refresh(), listEligibleLoanMachines().then(setMachines)]
        : [refresh()];
      void Promise.all(requests).catch(() => setError(t('loansLoadError', uiLanguage)));
    }
  }, [canManageCase, caseId, refresh, uiLanguage]);
  useEffect(() => {
    setPartnerId(''); setContactId(''); setContacts([]);
    if (canManageCase && sellerId) void listLoanPartners(sellerId).then(setPartners).catch(() => setError(t('loansLoadError', uiLanguage)));
    else setPartners([]);
  }, [canManageCase, sellerId, uiLanguage]);
  useEffect(() => {
    setContactId('');
    if (canManageCase && partnerId) void listLoanContacts(partnerId).then(setContacts).catch(() => setError(t('loansLoadError', uiLanguage)));
    else setContacts([]);
  }, [canManageCase, partnerId, uiLanguage]);

  const allWarehousesMissing = useMemo(() => machines.length > 0 && machines.every((machine) => !machine.warehouse_location), [machines]);

  const saveDraft = async () => {
    if (!sellerId || !partnerId || !contactId) return;
    setBusy(true); setError('');
    try {
      const id = await createLoanCase({ sellerId, partnerId, contactId, expectedReturnDate: expectedReturn || null, notes: notes || null,
        alternativeDeliveryAddress: alternative, address: alternative ? address || null : null, postalCode: alternative ? postal || null : null,
        city: alternative ? city || null : null, country: alternative ? country || null : null,
        addressContact: alternative ? addressContact || null : null, addressNote: alternative ? addressNote || null : null });
      navigate(`/portal/loans/${id}`, { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : label('loansLoadError')); } finally { setBusy(false); }
  };

  const addMachine = async () => {
    if (!caseId || !machineId || !serialVerified) return;
    setBusy(true); setError('');
    try {
      await addLoanMachine(caseId, machineId, { usageReadingValue: reading ? Number(reading) : null, usageReadingUnit: reading ? readingUnit : null,
        drivingUseLimit: useLimit || null, responsiblePerson: responsiblePerson || null,
        expectedReturnDate: expectedReturn || loanCase?.expected_return_date || null, serialVerified });
      setMachineId(''); setReading(''); setUseLimit(''); setResponsiblePerson(''); setSerialVerified(false);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : label('loansLoadError')); } finally { setBusy(false); }
  };

  const upload = async (itemId: string, file: File | undefined, kind: 'serial_plate' | 'overview') => {
    if (!caseId || !file) return;
    setBusy(true); setError('');
    try { await uploadLoanItemPhoto(caseId, itemId, file, kind); }
    catch (cause) { setError(cause instanceof Error ? cause.message : label('loansLoadError')); }
    finally { setBusy(false); }
  };

  if (isNew && !canManageCase) return <Navigate to="/portal/loans" replace />;

  return <LoanShell>
    <div className="mb-4"><Link to="/portal/loans" className="text-sm font-medium text-emerald-800 underline">{label('loansCases')}</Link></div>
    <h1 className="text-2xl font-semibold text-slate-900">{isNew ? label('loansNewCase') : loanCase?.case_number ?? label('loansLoading')}</h1>
    {error && <p role="alert" className="mt-4 border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

    {isNew ? <div className="mt-5 max-w-4xl space-y-5">
      <section className="grid gap-4 border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Field label={label('loansSeller')}><select className={fieldClass} value={sellerId} onChange={(event) => setSellerId(event.target.value)}><option value="">{label('loansSelectSeller')}</option>{sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.initials} · {seller.display_name}</option>)}</select></Field>
        <Field label={label('loansPartner')}><select className={fieldClass} value={partnerId} onChange={(event) => setPartnerId(event.target.value)} disabled={!sellerId}><option value="">{label('loansSelectPartner')}</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.account_number} · {partner.company_name}</option>)}</select></Field>
        <Field label={label('loansContact')}><select className={fieldClass} value={contactId} onChange={(event) => setContactId(event.target.value)} disabled={!partnerId || contacts.length === 0}><option value="">{label('loansSelectContact')}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.role_title ? ` · ${contact.role_title}` : ''}</option>)}</select>{partnerId && contacts.length === 0 && <p className="mt-1 text-xs text-amber-800">{label('loansNoContacts')}</p>}</Field>
        <Field label={label('loansExpectedReturn')}><input type="date" className={fieldClass} value={expectedReturn} onChange={(event) => setExpectedReturn(event.target.value)} /></Field>
        <Field label={label('loansNotes')} wide><textarea className={textareaClass} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      </section>
      <section className="border border-slate-200 bg-white p-4"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={alternative} onChange={(event) => setAlternative(event.target.checked)} />{label('loansAlternativeAddress')}</label>{alternative && <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input label={label('loansAddress')} value={address} setValue={setAddress} /><Input label={label('loansPostalCode')} value={postal} setValue={setPostal} /><Input label={label('loansCity')} value={city} setValue={setCity} /><Input label={label('loansCountry')} value={country} setValue={setCountry} /><Input label={label('loansAddressContact')} value={addressContact} setValue={setAddressContact} /><Input label={label('loansAddressNote')} value={addressNote} setValue={setAddressNote} /></div>}</section>
      <button type="button" disabled={busy || !sellerId || !partnerId || !contactId} onClick={() => void saveDraft()} className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50">{label('loansSaveDraft')}</button>
    </div> : loanCase && <div className="mt-5 space-y-5">
      <section className="grid gap-3 border border-slate-200 bg-white p-4 text-sm sm:grid-cols-3"><Info label={label('loansStatus')} value={loanCase.status} /><Info label={label('loansExpectedReturn')} value={loanCase.expected_return_date ?? '—'} /><Info label={label('loansNotes')} value={loanCase.notes ?? '—'} /></section>
      {canManageCase && <section className="border border-slate-200 bg-white p-4"><h2 className="font-semibold text-slate-900">{label('loansMachine')}</h2>
        {allWarehousesMissing && <p className="mt-3 flex items-start gap-2 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{label('loansWarehouseMissing')}</p>}
        {machines.length === 0 ? <p className="mt-3 text-sm text-slate-600">{label('loansNoEligibleMachines')}</p> : <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label={label('loansMachine')}><select className={fieldClass} value={machineId} onChange={(event) => setMachineId(event.target.value)}><option value="">{label('loansMachine')}</option>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.sku} · {machine.serial_number}</option>)}</select></Field><Input label={label('loansUsageReading')} value={reading} setValue={setReading} type="number" /><Field label={label('loansUsageUnit')}><select className={fieldClass} value={readingUnit} onChange={(event) => setReadingUnit(event.target.value as 'km' | 'hours')}><option value="hours">timer</option><option value="km">km</option></select></Field><Input label={label('loansUseLimit')} value={useLimit} setValue={setUseLimit} /><Input label={label('loansResponsiblePerson')} value={responsiblePerson} setValue={setResponsiblePerson} /><label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={serialVerified} onChange={(event) => setSerialVerified(event.target.checked)} />{label('loansSerialVerified')}</label><button type="button" onClick={() => void addMachine()} disabled={busy || !machineId || !serialVerified} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white disabled:opacity-50"><Plus className="h-4 w-4" />{label('loansAddMachine')}</button></div>}
        <p className="mt-4 border-l-4 border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">{label('loansEquipmentUnavailable')}</p>
      </section>}
      {items.map((item) => <section key={item.id} className="border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{item.product_sku} · {item.product_name_snapshot ?? label('loansMachine')}</p><p className="text-sm text-slate-600">{item.serial_snapshot}</p></div>{item.serial_verified && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800"><CheckCircle2 className="h-4 w-4" />{label('loansSerialVerified')}</span>}</div>{canManageCase && <div className="mt-3 grid gap-3 sm:grid-cols-2"><PhotoInput label={label('loansSerialPlatePhoto')} onFile={(file) => void upload(item.id, file, 'serial_plate')} /><PhotoInput label={label('loansGeneralPhoto')} onFile={(file) => void upload(item.id, file, 'overview')} /></div>}</section>)}
      {canManageCase && loanCase.status === 'DRAFT' && <button type="button" disabled={busy || items.length === 0} onClick={() => { if (!caseId) return; setBusy(true); void createLoanCaseVersion(caseId).then(() => { setVersionCreated(true); return refresh(); }).catch((cause) => setError(cause instanceof Error ? cause.message : label('loansLoadError'))).finally(() => setBusy(false)); }} className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50">{label('loansCreateVersion')}</button>}
      {versionCreated && <p className="text-sm text-emerald-800">{label('loansVersionCreated')}</p>}
    </div>}
  </LoanShell>;
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) { return <label className={`block text-sm font-medium text-slate-700 ${wide ? 'sm:col-span-2' : ''}`}><span className="mb-1 block">{label}</span>{children}</label>; }
function Input({ label, value, setValue, type = 'text' }: { label: string; value: string; setValue: (value: string) => void; type?: string }) { return <Field label={label}><input type={type} className={fieldClass} value={value} onChange={(event) => setValue(event.target.value)} /></Field>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className="mt-1 text-slate-900">{value}</p></div>; }
function PhotoInput({ label, onFile }: { label: string; onFile: (file: File | undefined) => void }) { return <label className="flex min-h-20 cursor-pointer items-center gap-3 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-700 hover:border-emerald-600"><Camera className="h-5 w-5" /><span>{label}</span><input className="sr-only" type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} /></label>; }
