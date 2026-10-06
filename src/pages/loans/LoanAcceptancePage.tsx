import { Link, useParams } from 'react-router-dom';
import LoanShell from '@/pages/loans/LoanShell';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';

export default function LoanAcceptancePage() {
  const { caseId } = useParams();
  const { uiLanguage } = useLanguage();
  return <LoanShell><div className="max-w-3xl"><Link to={`/portal/loans/${caseId}`} className="text-sm text-emerald-800 underline">{t('loansCases', uiLanguage)}</Link><h1 className="mt-4 text-2xl font-semibold">{t('loansAcceptance', uiLanguage)}</h1><p className="mt-4 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">{t('loansTermsMissing', uiLanguage)}</p></div></LoanShell>;
}
