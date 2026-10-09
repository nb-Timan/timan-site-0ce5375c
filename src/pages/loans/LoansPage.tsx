import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, PackageCheck, Pencil, Plus } from 'lucide-react';
import LoanShell from '@/pages/loans/LoanShell';
import LoanStockPanel from '@/pages/loans/LoanStockPanel';
import SalesStockSalePanel from '@/pages/loans/SalesStockSalePanel';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { listLoanCases, updateLoanExpectedReturn, type LoanCaseSummary } from '@/lib/loanService';
import { loanDerivedTimingStatus, loanStatusTranslationKey } from '@/lib/loanDomain';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import { t } from '@/lib/i18n/translations';
import { derivePortalRole, isInternalTimanPortalRole } from '@/lib/portalAccess';

export default function LoansPage() {
  const { appUser } = useAppUser();
  const { uiLanguage } = useLanguage();
  const label = useCallback((key: string) => t(key, uiLanguage), [uiLanguage]);
  const canManageCases = isInternalTimanPortalRole(derivePortalRole(appUser));
  const activeRole = derivePortalRole(appUser);
  const canSellStock = activeRole === 'timan_backend' || activeRole === 'timan_seller';
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const view = canManageCases && requestedView === 'stock'
    ? 'stock'
    : canSellStock && requestedView === 'sale'
      ? 'sale'
      : 'loans';
  const partnerId = searchParams.get('partner');
  const [cases, setCases] = useState<LoanCaseSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [editingReturn, setEditingReturn] = useState<LoanCaseSummary | null>(null);
  const [returnDate, setReturnDate] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [returnError, setReturnError] = useState('');
  const [savingReturn, setSavingReturn] = useState(false);

  const loadCases = useCallback(async () => {
    setError(false);
    try { setCases(await listLoanCases(partnerId)); }
    catch { setError(true); }
  }, [partnerId]);
  useEffect(() => { void loadCases(); }, [loadCases]);

  const openReturnEditor = (item: LoanCaseSummary) => {
    setEditingReturn(item);
    setReturnDate(item.expected_return_date ?? '');
    setReturnNote('');
    setReturnError('');
  };
  const saveReturn = async () => {
    if (!editingReturn || !returnDate || !returnNote.trim()) {
      setReturnError(label('loansReturnChangeRequired'));
      return;
    }
    setSavingReturn(true); setReturnError('');
    try {
      await updateLoanExpectedReturn(editingReturn.id, returnDate, returnNote.trim());
      await loadCases();
      setEditingReturn(null);
    } catch (cause) {
      setReturnError(cause instanceof Error ? cause.message : label('loansLoadError'));
    } finally { setSavingReturn(false); }
  };

  return <LoanShell>
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold text-slate-900">{label('area_loans_title')}</h1><p className="mt-1 text-sm text-slate-600">{label('area_loans_desc')}</p></div>
      {canManageCases && <Link to="/portal/loans/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800"><Plus className="h-4 w-4" />{label('loansNewCase')}</Link>}
    </header>
    {canManageCases && <div className="mb-5 flex gap-5 border-b border-slate-200" role="tablist" aria-label={label('area_loans_title')}>
      {(['loans', 'stock', ...(canSellStock ? ['sale' as const] : [])] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={view === value}
        onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('view', value); return next; })}
        className={`min-h-11 border-b-2 px-1 text-sm font-semibold ${view === value ? 'border-emerald-700 text-emerald-900' : 'border-transparent text-slate-600'}`}>
        {value === 'loans' ? label('loansView') : value === 'stock' ? label('loansStockView') : 'Sælg salgslagermaskine'}</button>)}
    </div>}
    {view === 'stock' ? <LoanStockPanel /> : view === 'sale' ? <SalesStockSalePanel /> : <>
      {error ? <p role="alert" className="border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">{label('loansLoadError')}</p>
        : cases === null ? <p className="text-sm text-slate-600">{label('loansLoading')}</p>
          : cases.length === 0 ? <div className="border border-slate-200 bg-white p-5 text-sm text-slate-600">{label('loansNoCases')}</div>
            : <LoanOverview cases={cases} label={label} onEditReturn={openReturnEditor} />}
    </>}

    <Dialog open={Boolean(editingReturn)} onOpenChange={(open) => { if (!open && !savingReturn) setEditingReturn(null); }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>{label('loansEditReturn')}</DialogTitle>
          <DialogDescription>{label('loansReturnChangeDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div><p className="text-xs font-medium uppercase text-slate-500">{label('loansCurrentReturn')}</p><p className="mt-1 text-sm text-slate-900">{editingReturn?.expected_return_date ?? '—'}</p></div>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">{label('loansNewReturn')}</span><input aria-label={label('loansNewReturn')} type="date" value={returnDate} onChange={(event) => { setReturnDate(event.target.value); setReturnError(''); }} className="h-10 w-full rounded-md border border-slate-300 px-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">{label('loansChangeNote')}</span><textarea aria-label={label('loansChangeNote')} value={returnNote} onChange={(event) => { setReturnNote(event.target.value); setReturnError(''); }} className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          {returnError && <p role="alert" className="text-sm text-red-700">{returnError}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingReturn(null)} disabled={savingReturn} className="h-10 rounded-md border border-slate-300 px-3 text-sm">{label('cancel')}</button><button type="button" onClick={() => void saveReturn()} disabled={savingReturn} className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50">{label('save')}</button></div>
        </div>
      </DialogContent>
    </Dialog>
  </LoanShell>;
}

function LoanOverview({ cases, label, onEditReturn }: { cases: LoanCaseSummary[]; label: (key: string) => string; onEditReturn: (item: LoanCaseSummary) => void }) {
  return <>
    <div className="space-y-3 md:hidden">{cases.map((item) => <LoanMobileCard key={item.id} item={item} label={label} onEditReturn={onEditReturn} />)}</div>
    <div className="hidden overflow-x-auto border border-slate-200 bg-white md:block"><table className="w-full min-w-[940px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>
      <th className="px-3 py-2">{label('loansNumber')}</th><th className="px-3 py-2">{label('loansPartner')}</th><th className="px-3 py-2">{label('loansResponsible')}</th><th className="px-3 py-2">{label('loansAssetCount')}</th><th className="px-3 py-2">{label('loansLoanDate')}</th><th className="px-3 py-2">{label('loansExpectedReturn')}</th><th className="px-3 py-2">{label('loansStatus')}</th><th className="px-3 py-2">{label('loansActions')}</th>
    </tr></thead><tbody>{cases.map((item) => {
      const timing = loanDerivedTimingStatus(item.status, item.expected_return_date);
      return <tr key={item.id} className={`border-t border-slate-200 ${timing === 'OVERDUE' ? 'bg-red-50' : timing === 'DUE_SOON' ? 'bg-amber-50' : ''}`}>
        <td className="px-3 py-3 font-semibold text-slate-950">{item.loan_number}</td><td className="px-3 py-3">{item.partner_name}</td><td className="px-3 py-3">{item.responsible_name}</td><td className="px-3 py-3 tabular-nums">{item.asset_count}</td><td className="px-3 py-3 whitespace-nowrap">{item.loan_date ?? '—'}</td><td className="px-3 py-3 whitespace-nowrap"><ReturnDate value={item.expected_return_date} timing={timing} label={label} /></td><td className="px-3 py-3">{label(loanStatusTranslationKey(item.return_state?.presentation_state ?? item.status))}</td><td className="px-3 py-3"><div className="flex flex-wrap items-center gap-3">{item.can_edit_expected_return && <button type="button" onClick={() => onEditReturn(item)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300" title={label('loansEditReturn')}><Pencil className="h-4 w-4" /></button>}{item.return_state?.can_receive && <Link className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white" to={`/portal/loans/${item.id}/return`}><PackageCheck className="h-4 w-4" />{label('loansReceive')}</Link>}<Link className="font-medium text-emerald-800 underline" to={`/portal/loans/${item.id}`}>{label('loansOpen')}</Link></div></td>
      </tr>;
    })}</tbody></table></div>
  </>;
}

function LoanMobileCard({ item, label, onEditReturn }: { item: LoanCaseSummary; label: (key: string) => string; onEditReturn: (item: LoanCaseSummary) => void }) {
  const timing = loanDerivedTimingStatus(item.status, item.expected_return_date);
  return <article className={`border p-4 ${timing === 'OVERDUE' ? 'border-red-300 bg-red-50' : timing === 'DUE_SOON' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
    <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{item.loan_number}</p><p className="mt-1 text-sm text-slate-700">{item.partner_name}</p></div><span className="text-right text-xs font-medium text-slate-600">{label(loanStatusTranslationKey(item.return_state?.presentation_state ?? item.status))}</span></div>
    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">{label('loansResponsible')}</dt><dd>{item.responsible_name}</dd></div><div><dt className="text-xs text-slate-500">{label('loansAssetCount')}</dt><dd>{item.asset_count}</dd></div><div><dt className="text-xs text-slate-500">{label('loansLoanDate')}</dt><dd>{item.loan_date ?? '—'}</dd></div><div><dt className="text-xs text-slate-500">{label('loansExpectedReturn')}</dt><dd><ReturnDate value={item.expected_return_date} timing={timing} label={label} /></dd></div></dl>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{item.can_edit_expected_return && <button type="button" onClick={() => onEditReturn(item)} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm"><CalendarClock className="h-4 w-4" />{label('loansEditReturn')}</button>}{item.return_state?.can_receive && <Link className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white" to={`/portal/loans/${item.id}/return`}><PackageCheck className="h-4 w-4" />{label('loansReceive')}</Link>}</div><Link className="text-sm font-medium text-emerald-800 underline" to={`/portal/loans/${item.id}`}>{label('loansOpen')}</Link></div>
  </article>;
}

function ReturnDate({ value, timing, label }: { value: string | null; timing: 'DUE_SOON' | 'OVERDUE' | null; label: (key: string) => string }) {
  return <span className={timing === 'OVERDUE' ? 'font-semibold text-red-800' : timing === 'DUE_SOON' ? 'font-semibold text-amber-900' : ''}>{value ?? '—'}{timing && <span className="ml-1 text-xs">· {label(timing === 'OVERDUE' ? 'loansOverdue' : 'loansDueSoon')}</span>}</span>;
}
