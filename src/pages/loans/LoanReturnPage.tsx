import { Link, useParams } from 'react-router-dom';
import LoanShell from '@/pages/loans/LoanShell';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';

export default function LoanReturnPage() {
  const { caseId } = useParams();
  const { uiLanguage } = useLanguage();
  return <LoanShell><div className="max-w-3xl"><Link to={`/portal/loans/${caseId}`} className="text-sm text-emerald-800 underline">{t('loansCases', uiLanguage)}</Link><h1 className="mt-4 text-2xl font-semibold">{t('loansReturn', uiLanguage)}</h1><p className="mt-3 text-sm text-slate-600">{t('loansEquipmentUnavailable', uiLanguage)}</p></div></LoanShell>;
}
