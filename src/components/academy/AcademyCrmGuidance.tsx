import { useEffect, useState } from 'react';
import AcademyGuidancePanel from '@/components/academy/AcademyGuidancePanel';
import { academyCrmSandbox } from '@/lib/academyCrmSandbox';

export default function AcademyCrmGuidance({ part = academyCrmSandbox.getPart() }: { part?: 1 | 2 }) {
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
    steps={part === 1 ? [
      {
        title: 'Find det forfaldne lead og opdatér opfølgning',
        description: 'Åbn det røde lead, hvor datoen for næste opfølgning er overskredet. Under “Næste opfølgning” vælger du en ny dato efter dags dato – helst den dato, hvor du realistisk forventer næste kontakt eller aktivitet med kunden.',
        tasks: [{ label: 'Forfaldent lead opdateret', complete: progress.overdueUpdated }],
      },
      {
        title: 'Færdiggør Configurator-leadet',
        description: 'Åbn leadet og udfyld de manglende oplysninger. Leadet er fx kommet fra et tilbud i Configurator og mangler derfor stadig oplysninger, som skal tilføjes i CRM – herunder næste aktivitet/opfølgning og øvrige relevante manglende felter.',
        tasks: [{ label: 'Configurator-lead færdigoprettet', complete: progress.configuratorCompleted }],
      },
    ] : [
      { title: 'Gem næste aktivitet', tasks: [{ label: 'Aktivitet/opfølgning gemt', complete: progress.activityUpdated }] },
      { title: 'Del leadet', tasks: [{ label: 'Lead delt med Academy-forhandler', complete: progress.shared }] },
      { title: 'Opret lokal demo', tasks: [{ label: 'Lokal demo oprettet', complete: progress.demoConverted }] },
    ]}
    next={part === 1 ? !progress.overdueUpdated ? 'Trin 1: Find det røde lead og flyt næste opfølgning frem.' : 'Trin 2: Færdiggør Configurator-leadet.' : !progress.activityUpdated ? 'Trin 1: Gem næste aktivitet.' : !progress.shared ? 'Trin 2: Del leadet med Academy-forhandleren.' : 'Trin 3: Konvertér leadet til en lokal demo.'}
    completion={part === 1 ? { nextUnlock: 'CRM Case 2 - Del lead og opret demo' } : true}
  />;
}
