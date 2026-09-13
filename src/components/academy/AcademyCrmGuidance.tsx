import { useEffect, useState } from 'react';
import AcademyGuidancePanel from '@/components/academy/AcademyGuidancePanel';
import { academyCrmSandbox } from '@/lib/academyCrmSandbox';
import { useOptionalLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';

export default function AcademyCrmGuidance({ part = academyCrmSandbox.getPart() }: { part?: 1 | 2 }) {
  const { uiLanguage } = useOptionalLanguage();
  const tr = (key: string) => t(key, uiLanguage);
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((revision) => revision + 1);
    window.addEventListener('timan:academy-crm-changed', update);
    return () => window.removeEventListener('timan:academy-crm-changed', update);
  }, []);
  const progress = academyCrmSandbox.getProgress();
  return <AcademyGuidancePanel
    title={part === 1 ? tr('academyCrmCase1Title') : tr('academyCrmCase2Title')}
    description={tr('academyCrmDescription')}
    steps={part === 1 ? [
      {
        title: tr('academyCrmOverdueTitle'),
        description: tr('academyCrmOverdueText'),
        tasks: [{ label: tr('academyCrmOverdueTask'), complete: progress.overdueUpdated }],
      },
      {
        title: tr('academyCrmConfiguratorTitle'),
        description: tr('academyCrmConfiguratorText'),
        tasks: [{ label: tr('academyCrmConfiguratorTask'), complete: progress.configuratorCompleted }],
      },
    ] : [
      { title: tr('academyCrmActivity'), tasks: [{ label: tr('academyCrmActivityTask'), complete: progress.activityUpdated }] },
      { title: tr('academyCrmShare'), tasks: [{ label: tr('academyCrmShareTask'), complete: progress.shared }] },
      { title: 'Opret lokal demo', tasks: [{ label: 'Lokal demo oprettet', complete: progress.demoConverted }] },
    ]}
    next={part === 1 ? !progress.overdueUpdated ? tr('academyCrmOverdueTitle') : tr('academyCrmConfiguratorTitle') : !progress.activityUpdated ? tr('academyCrmActivity') : !progress.shared ? tr('academyCrmShare') : tr('academyCrmDemo')}
    completion={part === 1 ? { nextUnlock: tr('academyCrmCase2Title') } : true}
  />;
}
