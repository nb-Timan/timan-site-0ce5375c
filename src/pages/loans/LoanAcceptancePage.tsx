import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import LoanShell from '@/pages/loans/LoanShell';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';
import { acceptLoanCaseVersion, createLoanCaseVersion, getLoanApprovalData, type LoanApprovalData } from '@/lib/loanService';

export default function LoanAcceptancePage() {
  const { caseId } = useParams();
  const { uiLanguage } = useLanguage();
  const label = (key: string) => t(key, uiLanguage);
  const [data, setData] = useState<LoanApprovalData | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  useEffect(() => {
    let cancelled = false;
    if (caseId) void getLoanApprovalData(caseId).then((value) => { if (!cancelled) setData(value); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : label('loansLoadError')); });
    return () => { cancelled = true; };
    // Language changes do not restart the canonical review load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);
  const submit = async () => {
    if (!caseId || !data || !confirmed || saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      if (data.state.can_review && data.state.terms_ready) await createLoanCaseVersion(caseId, true);
      else if (data.state.can_accept && data.versionId && data.terms) await acceptLoanCaseVersion(caseId, data.versionId);
      else return;
      setData(await getLoanApprovalData(caseId)); setConfirmed(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : label('loansLoadError')); }
    finally { saving.current = false; setBusy(false); }
  };
  return <LoanShell><div className="max-w-3xl space-y-4">
    <Link to={`/portal/loans/${caseId}`} className="text-sm text-emerald-800 underline">{label('loansOpen')}</Link>
    <h1 className="text-2xl font-semibold">{data?.number} · {label(data?.state.can_review ? 'loansReviewCheckout' : 'loansAcceptance')}</h1>
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!data && !error && <p>{label('loansLoading')}</p>}
    {data && <>
      {data.terms ? <section className="rounded border bg-white p-4"><h2 className="font-semibold">{data.terms.title}</h2><p className="mt-3 whitespace-pre-wrap text-sm">{data.terms.body}</p></section>
        : <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">{label('loansTermsMissing')}</p>}
      {(data.state.can_review || data.state.can_accept) && <>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} disabled={busy || !data.terms}
          onChange={(event) => setConfirmed(event.target.checked)} />{label(data.state.can_review ? 'loansReviewConfirmation' : 'loansAcceptConfirmation')}</label>
        <button type="button" disabled={busy || !confirmed || !data.terms} onClick={() => void submit()}
          className="min-h-10 rounded bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{label(data.state.can_review ? 'loansCreateVersion' : 'loansConfirmAcceptance')}</button>
      </>}
      {!data.state.can_review && !data.state.can_accept && <p>{label('loansNoNextApproval')}</p>}
    </>}
  </div></LoanShell>;
}
