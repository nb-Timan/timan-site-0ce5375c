import { useEffect, useState } from 'react';
import AcademyGuidancePanel from '@/components/academy/AcademyGuidancePanel';
import { academyCrmSandbox } from '@/lib/academyCrmSandbox';

export default function AcademyCrmGuidance({ part = 1 }: { part?: 1 | 2 }) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((revision) => revision + 1);
    window.addEventListener('timan:academy-crm-changed', update);
    return () => window.removeEventListener('timan:academy-crm-changed', update);
  }, []);
  const progress = academyCrmSandbox.getProgress();
  return <AcademyGuidancePanel
    title={part === 1 ? 'CRM Case 1 - Prioritér og færdiggør leads' : 'CRM Case 2 - Del lead og opret demo'}
    description="Arbejd i den normale CRM. Leads, deling og demoer gemmes kun lokalt i Academy."
    tasks={part === 1 ? [
      { label: 'Forfaldent lead opdateret', complete: progress.overdueUpdated },
      { label: 'Configurator-lead færdigoprettet', complete: progress.configuratorCompleted },
    ] : [
      { label: 'Aktivitet/opfølgning gemt', complete: progress.activityUpdated },
      { label: 'Lead delt med Academy-forhandler', complete: progress.shared },
      { label: 'Lokal demo oprettet', complete: progress.demoConverted },
    ]}
    next={part === 1 ? 'flyt den forfaldne opfølgning frem, og gem derefter Configurator-leadet med alle påkrævede oplysninger.' : 'gem næste aktivitet, del leadet og brug derefter Konverter til demo.'}
  />;
}
