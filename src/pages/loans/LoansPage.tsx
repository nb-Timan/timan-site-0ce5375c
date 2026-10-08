import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import LoanShell from '@/pages/loans/LoanShell';
import LoanStockPanel from '@/pages/loans/LoanStockPanel';
import { listLoanCases, type LoanCase } from '@/lib/loanService';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import { t } from '@/lib/i18n/translations';
import { derivePortalRole, isInternalTimanPortalRole } from '@/lib/portalAccess';

export default function LoansPage() {
  const { appUser } = useAppUser();
  const { uiLanguage } = useLanguage();
  const label = (key: string) => t(key, uiLanguage);
  const canManageCases = isInternalTimanPortalRole(derivePortalRole(appUser));
  const [searchParams, setSearchParams] = useSearchParams();
  const view = canManageCases && searchParams.get('view') === 'stock' ? 'stock' : 'loans';
  const partnerId = searchParams.get('partner');
  const [cases, setCases] = useState<LoanCase[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void listLoanCases(partnerId).then(setCases).catch(() => setError(true)); }, [partnerId]);
  return <LoanShell>
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold text-slate-900">{label('area_loans_title')}</h1><p className="mt-1 text-sm text-slate-600">{label('area_loans_desc')}</p></div>
      {canManageCases && <Link to="/portal/loans/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800"><Plus className="h-4 w-4" />{label('loansNewCase')}</Link>}
    </header>
    {canManageCases && <div className="mb-5 flex gap-5 border-b border-slate-200" role="tablist" aria-label={label('area_loans_title')}>
      {(['loans', 'stock'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={view === value}
        onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('view', value); return next; })}
        className={`min-h-11 border-b-2 px-1 text-sm font-semibold ${view === value ? 'border-emerald-700 text-emerald-900' : 'border-transparent text-slate-600'}`}>
        {label(value === 'loans' ? 'loansView' : 'loansStockView')}</button>)}
    </div>}
    {view === 'stock' ? <LoanStockPanel /> : <>
    {error ? <p role="alert" className="border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">{label('loansLoadError')}</p>
      : cases === null ? <p className="text-sm text-slate-600">{label('loansLoading')}</p>
        : cases.length === 0 ? <div className="border border-slate-200 bg-white p-5 text-sm text-slate-600">{label('loansNoCases')}</div>
          : <div className="overflow-x-auto border border-slate-200 bg-white"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-3 py-2">ID</th><th className="px-3 py-2">{label('loansStatus')}</th><th className="px-3 py-2">{label('loansExpectedReturn')}</th><th className="px-3 py-2"></th></tr></thead><tbody>{cases.map((item) => <tr key={item.id} className="border-t border-slate-200"><td className="px-3 py-3 font-medium">{item.case_number}</td><td className="px-3 py-3">{item.status}</td><td className="px-3 py-3">{item.expected_return_date ?? '—'}</td><td className="px-3 py-3 text-right"><Link className="font-medium text-emerald-800 underline" to={`/portal/loans/${item.id}`}>{label('loansCases')}</Link></td></tr>)}</tbody></table></div>}
    </>}
  </LoanShell>;
}
