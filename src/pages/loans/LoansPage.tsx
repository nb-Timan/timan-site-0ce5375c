import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, PackageCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import LoanShell from '@/pages/loans/LoanShell';
import LoanStockPanel from '@/pages/loans/LoanStockPanel';
import LoanPageHeader from '@/pages/loans/LoanPageHeader';
import SalesStockSalePanel from '@/pages/loans/SalesStockSalePanel';
import LoanNextAction from '@/pages/loans/LoanNextAction';
import LoanCancelDialog from '@/pages/loans/LoanCancelDialog';
import LoanOverviewInfoPopover, { type LoanOverviewInfoLoader } from '@/pages/loans/LoanOverviewInfoPopover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getLoanOverviewInfo, listLoanCases, updateLoanExpectedReturn, type LoanCaseSummary, type LoanOverviewInfo } from '@/lib/loanService';
import { isLoanClosed, loanDerivedTimingStatus, loanMatchesOverviewFilter, loanStatusTranslationKey, type LoanOverviewFilter } from '@/lib/loanDomain';
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
  const requestedStatus = searchParams.get('status');
  const statusFilter: LoanOverviewFilter = requestedStatus === 'closed' || requestedStatus === 'all' ? requestedStatus : 'active';
  const [cases, setCases] = useState<LoanCaseSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [editingReturn, setEditingReturn] = useState<LoanCaseSummary | null>(null);
  const [returnDate, setReturnDate] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [returnError, setReturnError] = useState('');
  const [savingReturn, setSavingReturn] = useState(false);
  const [cancellingCase, setCancellingCase] = useState<LoanCaseSummary | null>(null);
  const [stockSummaryTarget, setStockSummaryTarget] = useState<HTMLDivElement | null>(null);
  const visibleCases = cases?.filter((item) => loanMatchesOverviewFilter(item.status, statusFilter)) ?? [];

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
    <LoanPageHeader title={label('area_loans_title')} description={label('area_loans_desc')}
      summaryRef={view === 'stock' ? setStockSummaryTarget : undefined}
      action={canManageCases && <Link to="/portal/loans/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800"><Plus className="h-4 w-4" />{label('loansNewCase')}</Link>} />
    {canManageCases && <div className="mb-5 flex gap-5 border-b border-slate-200" role="tablist" aria-label={label('area_loans_title')}>
      {(['loans', 'stock', ...(canSellStock ? ['sale' as const] : [])] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={view === value}
        onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('view', value); return next; })}
        className={`min-h-11 border-b-2 px-1 text-sm font-semibold ${view === value ? 'border-emerald-700 text-emerald-900' : 'border-transparent text-slate-600'}`}>
        {value === 'loans' ? label('loansView') : value === 'stock' ? label('loansStockView') : 'Sælg salgslagermaskine'}</button>)}
    </div>}
    {view === 'stock' ? <LoanStockPanel summaryTarget={stockSummaryTarget} /> : view === 'sale' ? <SalesStockSalePanel /> : <>
      <div role="group" aria-label={label('loansLifecycleFilter')} className="mb-4 flex flex-wrap gap-2">
        {(['active', 'closed', 'all'] as const).map((value) => <button key={value} type="button" aria-pressed={statusFilter === value}
          onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('status', value); return next; })}
          className={`min-h-10 rounded-md border px-3 text-sm font-semibold ${statusFilter === value ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
          {label(value === 'active' ? 'loansActiveCases' : value === 'closed' ? 'loansClosedCases' : 'loansAllCases')}
        </button>)}
      </div>
      {error ? <p role="alert" className="border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">{label('loansLoadError')}</p>
        : cases === null ? <p className="text-sm text-slate-600">{label('loansLoading')}</p>
          : visibleCases.length === 0 ? <p className="border-l-4 border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">{label('loansNoCases')}</p>
            : <LoanOverview cases={visibleCases} label={label} onEditReturn={openReturnEditor}
              onCancel={setCancellingCase} canCancel={activeRole === 'timan_backend'} showReceivedDate={statusFilter !== 'active'} />}
    </>}

    <LoanCancelDialog target={cancellingCase} label={label} onClose={() => setCancellingCase(null)} onCancelled={loadCases} />

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

function LoanOverview({ cases, label, onEditReturn, onCancel, canCancel, showReceivedDate }: {
  cases: LoanCaseSummary[]; label: (key: string) => string; onEditReturn: (item: LoanCaseSummary) => void;
  onCancel: (item: LoanCaseSummary) => void; canCancel: boolean; showReceivedDate: boolean;
}) {
  // Share one lazy read across fields and responsive representations.
  // Refreshing the overview invalidates its local, view-owned cache.
  const infoRequests = useMemo(() => new Map<string, Promise<LoanOverviewInfo> | null>(cases.map((item) => [item.id, null])), [cases]);
  const loadInfo = useCallback<LoanOverviewInfoLoader>((caseId) => {
    const existing = infoRequests.get(caseId);
    if (existing) return existing;
    const request = getLoanOverviewInfo(caseId).catch((error) => { infoRequests.set(caseId, null); throw error; });
    infoRequests.set(caseId, request);
    return request;
  }, [infoRequests]);
  return <>
    <div className="space-y-3 md:hidden">{cases.map((item) => <LoanMobileCard key={item.id} item={item} label={label} loadInfo={loadInfo} onEditReturn={onEditReturn} onCancel={onCancel} canCancel={canCancel} showReceivedDate={showReceivedDate} />)}</div>
    <div className="hidden overflow-x-auto border border-slate-200 bg-white md:block"><table className="w-full min-w-[940px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>
      <th className="px-3 py-2">{label('loansNumber')}</th><th className="px-3 py-2">{label('loansPartner')}</th><th className="px-3 py-2">{label('loansResponsible')}</th><th className="px-3 py-2">{label('loansAssetCount')}</th><th className="px-3 py-2">{label('loansLoanDate')}</th>{showReceivedDate && <th className="px-3 py-2">{label('loansLastReceivedDate')}</th>}<th className="px-3 py-2">{label('loansExpectedReturn')}</th><th className="px-3 py-2">{label('loansStatus')}</th><th className="px-3 py-2">{label('loansActions')}</th>
    </tr></thead><tbody>{cases.map((item) => {
      const timing = loanDerivedTimingStatus(item.status, item.expected_return_date);
      return <tr key={item.id} className={`border-t border-slate-200 ${timing === 'OVERDUE' ? 'bg-red-50' : timing === 'DUE_SOON' ? 'bg-amber-50' : ''}`}>
        <td className="px-3 py-3 font-semibold text-slate-950"><LoanOverviewInfoPopover item={item} kind="assets" label={label} loadInfo={loadInfo} /></td><td className="px-3 py-3"><LoanOverviewInfoPopover item={item} kind="delivery" label={label} loadInfo={loadInfo} /></td><td className="px-3 py-3"><LoanOverviewInfoPopover item={item} kind="notes" label={label} loadInfo={loadInfo} /></td><td className="px-3 py-3 tabular-nums">{item.asset_count}</td><td className="px-3 py-3 whitespace-nowrap">{item.loan_date ?? '—'}</td>{showReceivedDate && <td className="px-3 py-3 whitespace-nowrap">{item.lifecycle_state?.last_received_at?.slice(0, 10) ?? '—'}</td>}<td className="px-3 py-3 whitespace-nowrap"><ReturnDate value={item.expected_return_date} timing={timing} label={label} /></td><td className="px-3 py-3">{label(loanStatusTranslationKey(item.return_state?.presentation_state ?? item.status))}</td><td className="px-3 py-3"><div className="flex flex-wrap items-center gap-3">{item.can_edit_expected_return && !isLoanClosed(item.status) && <button type="button" onClick={() => onEditReturn(item)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300" title={label('loansEditReturn')}><Pencil className="h-4 w-4" /></button>}<LoanNextAction caseId={item.id} state={item.action_state} label={label} />{item.return_state?.can_receive && <Link className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white" to={`/portal/loans/${item.id}/return`}><PackageCheck className="h-4 w-4" />{label('loansReceive')}</Link>}<Link className="font-medium text-emerald-800 underline" to={`/portal/loans/${item.id}`}>{label('loansOpen')}</Link>{canCancel && item.lifecycle_state?.can_cancel_draft && <DeleteButton label={label} onClick={() => onCancel(item)} />}</div></td>
      </tr>;
    })}</tbody></table></div>
  </>;
}

function LoanMobileCard({ item, label, loadInfo, onEditReturn, onCancel, canCancel, showReceivedDate }: {
  loadInfo: LoanOverviewInfoLoader;
  item: LoanCaseSummary; label: (key: string) => string; onEditReturn: (item: LoanCaseSummary) => void;
  onCancel: (item: LoanCaseSummary) => void; canCancel: boolean; showReceivedDate: boolean;
}) {
  const timing = loanDerivedTimingStatus(item.status, item.expected_return_date);
  return <article className={`border p-4 ${timing === 'OVERDUE' ? 'border-red-300 bg-red-50' : timing === 'DUE_SOON' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-slate-950"><LoanOverviewInfoPopover item={item} kind="assets" label={label} loadInfo={loadInfo} /></p><p className="mt-1 text-sm text-slate-700"><LoanOverviewInfoPopover item={item} kind="delivery" label={label} loadInfo={loadInfo} /></p></div><span className="text-right text-xs font-medium text-slate-600">{label(loanStatusTranslationKey(item.return_state?.presentation_state ?? item.status))}</span></div>
    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div className="min-w-0"><dt className="text-xs text-slate-500">{label('loansResponsible')}</dt><dd><LoanOverviewInfoPopover item={item} kind="notes" label={label} loadInfo={loadInfo} /></dd></div><div><dt className="text-xs text-slate-500">{label('loansAssetCount')}</dt><dd>{item.asset_count}</dd></div><div><dt className="text-xs text-slate-500">{label('loansLoanDate')}</dt><dd>{item.loan_date ?? '—'}</dd></div><div><dt className="text-xs text-slate-500">{label('loansExpectedReturn')}</dt><dd><ReturnDate value={item.expected_return_date} timing={timing} label={label} /></dd></div>{showReceivedDate && <div><dt className="text-xs text-slate-500">{label('loansLastReceivedDate')}</dt><dd>{item.lifecycle_state?.last_received_at?.slice(0, 10) ?? '—'}</dd></div>}</dl>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{item.can_edit_expected_return && !isLoanClosed(item.status) && <button type="button" onClick={() => onEditReturn(item)} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm"><CalendarClock className="h-4 w-4" />{label('loansEditReturn')}</button>}<LoanNextAction caseId={item.id} state={item.action_state} label={label} />{item.return_state?.can_receive && <Link className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white" to={`/portal/loans/${item.id}/return`}><PackageCheck className="h-4 w-4" />{label('loansReceive')}</Link>}{canCancel && item.lifecycle_state?.can_cancel_draft && <DeleteButton label={label} onClick={() => onCancel(item)} />}</div><Link className="text-sm font-medium text-emerald-800 underline" to={`/portal/loans/${item.id}`}>{label('loansOpen')}</Link></div>
  </article>;
}

function DeleteButton({ label, onClick }: { label: (key: string) => string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-red-200 px-2 text-xs font-semibold text-red-700"><Trash2 className="h-4 w-4" />{label('loansDelete')}</button>;
}

function ReturnDate({ value, timing, label }: { value: string | null; timing: 'DUE_SOON' | 'OVERDUE' | null; label: (key: string) => string }) {
  return <span className={timing === 'OVERDUE' ? 'font-semibold text-red-800' : timing === 'DUE_SOON' ? 'font-semibold text-amber-900' : ''}>{value ?? '—'}{timing && <span className="ml-1 text-xs">· {label(timing === 'OVERDUE' ? 'loansOverdue' : 'loansDueSoon')}</span>}</span>;
}
