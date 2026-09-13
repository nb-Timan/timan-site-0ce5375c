import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AcademyGuidancePanel from './AcademyGuidancePanel';
import { academyPartnerDataSandbox as sandbox, ACADEMY_PARTNER_CHANGED } from '@/lib/academyPartnerDataSandbox';

export default function AcademyPartnerDataGuidance() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    window.addEventListener(ACADEMY_PARTNER_CHANGED, update);
    return () => window.removeEventListener(ACADEMY_PARTNER_CHANGED, update);
  }, []);
  if (!sandbox.isActive()) return null;
  const state = sandbox.getState();
  const progress = sandbox.getProgress();
  const part = state.activePart;
  const tasks = part === 1 ? [
    { label: 'Kontaktperson gemt', complete: state.contacts.some((row) => !!row.name?.trim()) },
    { label: 'Første kontakt valgt', complete: state.contacts.some((row) => row.is_primary && !!row.name?.trim()) },
    { label: 'YouTube-kanal gemt', complete: /^https?:\/\/(www\.)?youtube\.com\//i.test(state.dealers[0].social_youtube ?? '') },
  ] : part === 2 ? [
    { label: 'Partnerrelation læst i Aftalehistorik', complete: state.relationReviewed },
    { label: 'Fakturaaccept indsendt lokalt', complete: progress.invoiceFlowReviewed },
  ] : [{ label: 'Partnerdata åbnet', complete: true }];
  return <>
    <AcademyGuidancePanel title={part ? `Partnerdata - Part ${part}` : 'Portal Basics - Partnerdata'}
      description="Du bruger den almindelige Partnerdata-side med lokale Academy-data."
      tasks={tasks} next={part === 1 ? 'Åbn Academy Maskiner. Gem en kontaktperson, vælg første kontakt og tilføj YouTube-kanalen.' : part === 2 ? 'Læs relationen i Aftalehistorik, og udfyld fakturaaccepten for Academy Servicepartner.' : 'Brug Timan-logoet til at vende tilbage til forsiden.'} />
    {part === 2 && <Link className="mb-4 inline-block text-sm font-semibold text-emerald-800 underline" to="/portal/misc/forms/dealer-invoice-accept?academy_mode=true">Åbn Forhandler Accept - Fakturering</Link>}
  </>;
}
