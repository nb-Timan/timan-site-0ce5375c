import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AcademyGuidancePanel from './AcademyGuidancePanel';
import { academyPartnerDataSandbox as sandbox, ACADEMY_PARTNER_CHANGED } from '@/lib/academyPartnerDataSandbox';
import { ACADEMY_PROGRESS_CHANGED, academySandbox } from '@/lib/academySandbox';
import { useOptionalLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';

export default function AcademyPartnerDataGuidance() {
  const { uiLanguage } = useOptionalLanguage();
  const tr = (key: string) => t(key, uiLanguage);
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    window.addEventListener(ACADEMY_PARTNER_CHANGED, update);
    window.addEventListener(ACADEMY_PROGRESS_CHANGED, update);
    return () => {
      window.removeEventListener(ACADEMY_PARTNER_CHANGED, update);
      window.removeEventListener(ACADEMY_PROGRESS_CHANGED, update);
    };
  }, []);
  if (!sandbox.isActive()) return null;
  const state = sandbox.getState();
  const progress = sandbox.getProgress();
  const portalBasics = academySandbox.getPortalBasics();
  const part = academySandbox.getActiveCase() === 'portal.basics_5' ? null : state.activePart;
  const tasks = part === 1 || part === 2 ? [] : [
    {
      label: tr('academyPartnerDataOpen'),
      description: tr('academyPartnerDataOpenDescription'),
      complete: portalBasics.partnerDataOpened,
    },
    {
      label: tr('academyPartnerDataLogo'),
      description: tr('academyPartnerDataLogoDescription'),
      complete: portalBasics.returnedHomeFromPartnerData,
    },
  ];
  const portalBasicsNext = !portalBasics.partnerDataOpened
    ? tr('academyPartnerDataOpenDescription')
    : !portalBasics.returnedHomeFromPartnerData
      ? tr('academyPartnerDataLogoNext')
      : tr('academyPartnerDataLogoComplete');
  const part1Next = !progress.academyMachineOpened
    ? tr('academyPartnerDataStep1')
    : !progress.companyDataOpened
      ? tr('academyPartnerDataStep2')
      : !progress.salesContactSaved
        ? tr('academyPartnerDataStep3')
        : !progress.primarySalesContactSelected
          ? tr('academyPartnerDataStep4')
          : !progress.websiteAdded
            ? tr('academyPartnerDataStep5')
            : !progress.youtubeAdded
              ? tr('academyPartnerDataStep6')
              : tr('academyPartnerDataComplete');
  return <>
    <AcademyGuidancePanel title={part === 1 ? tr('academyPartnerDataPart1Title') : part === 2 ? tr('academyPartnerDataPart2Title') : tr('academyPortalBasicsPartnerDataTitle')}
      description={tr('academyPartnerDataDescription')}
      explanation={part === 1 ? <>
        <p className="font-semibold">{tr('academyWhyThisTask')}</p>
        <p className="mt-1">{tr('academyPartnerDataWhyOne')}</p>
        <p className="mt-2">{tr('academyPartnerDataWhyTwo')}</p>
      </> : undefined}
      tasks={tasks}
      steps={part === 1 ? [
        { title: tr('academyPartnerDataMachine'), tasks: [{ label: tr('academyPartnerDataMachineOpened'), complete: progress.academyMachineOpened }] },
        { title: tr('academyPartnerDataCompany'), tasks: [{ label: tr('academyPartnerDataCompanyOpened'), complete: progress.companyDataOpened }] },
        { title: tr('academyPartnerDataContact'), tasks: [{ label: tr('academyPartnerDataContactSaved'), complete: progress.salesContactSaved }] },
        { title: tr('academyPartnerDataPrimary'), tasks: [{ label: tr('academyPartnerDataPrimarySelected'), complete: progress.primarySalesContactSelected }] },
        { title: tr('academyPartnerDataWebsite'), tasks: [
          { label: tr('academyPartnerDataWebsiteAdded'), complete: progress.websiteAdded },
          { label: tr('academyPartnerDataYoutubeSaved'), complete: progress.youtubeAdded },
        ] },
      ] : part === 2 ? [
        { title: tr('academyPartnerDataRelation'), tasks: [{ label: tr('academyPartnerDataRelationRead'), complete: state.relationReviewed }] },
        { title: tr('academyPartnerDataInvoice'), tasks: [{ label: tr('academyPartnerDataInvoiceSaved'), complete: progress.invoiceFlowReviewed }] },
      ] : undefined}
      next={part === 1 ? part1Next : part === 2 ? !state.relationReviewed ? tr('academyPartnerDataPart2Step1') : tr('academyPartnerDataPart2Step2') : portalBasicsNext}
      completion={part === 1 ? { nextUnlock: tr('academyPartnerDataPart2Title') } : part === 2} />
    {part === 2 && <Link className="mb-4 inline-block text-sm font-semibold text-emerald-800 underline" to="/portal/misc/forms/dealer-invoice-accept?academy_mode=true">{tr('academyPartnerDataOpenInvoice')}</Link>}
  </>;
}
