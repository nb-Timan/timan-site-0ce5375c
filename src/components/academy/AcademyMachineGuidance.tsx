import { useEffect, useState } from 'react';
import AcademyGuidancePanel from './AcademyGuidancePanel';
import { useOptionalLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';
import { academySandbox, ACADEMY_PROGRESS_CHANGED, ACADEMY_MACHINE_TARGET_SERIAL } from '@/lib/academySandbox';

export default function AcademyMachineGuidance() {
  const { uiLanguage } = useOptionalLanguage();
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((value) => value + 1);
    window.addEventListener(ACADEMY_PROGRESS_CHANGED, update);
    return () => window.removeEventListener(ACADEMY_PROGRESS_CHANGED, update);
  }, []);
  const state = academySandbox.getServiceCase1();
  const keys = ['academyMachineOpenSearch', 'academyMachineSearchTarget', 'academyMachineOpenTarget', 'academyMachineReadHistory'];
  const flags = [state.searchOpened, state.targetSearched, state.targetOpened, state.historyOpened];
  const labels = keys.map((key) => t(key, uiLanguage).replace('{serial}', ACADEMY_MACHINE_TARGET_SERIAL));
  return <AcademyGuidancePanel
    title={t('academyServiceCase1Title', uiLanguage)}
    description={t('academyMachineDescription', uiLanguage)}
    steps={labels.map((label, index) => ({ title: label, tasks: [{ label, complete: flags[index] }] }))}
    stepColumns={2} stepLabelKey="academyPoint" nextLabelKey="academyNextPoint"
    next={labels[flags.indexOf(false)] ?? t('academyCaseCompleted', uiLanguage)}
  />;
}
