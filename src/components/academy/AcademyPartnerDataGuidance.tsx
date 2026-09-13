import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AcademyGuidancePanel from './AcademyGuidancePanel';
import { academyPartnerDataSandbox as sandbox, ACADEMY_PARTNER_CHANGED } from '@/lib/academyPartnerDataSandbox';
import { ACADEMY_PROGRESS_CHANGED, academySandbox } from '@/lib/academySandbox';

export default function AcademyPartnerDataGuidance() {
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
  const tasks = part === 1 ? [
    { label: 'Kontaktperson gemt', complete: state.contacts.some((row) => !!row.name?.trim()) },
    { label: 'Første kontakt valgt', complete: state.contacts.some((row) => row.is_primary && !!row.name?.trim()) },
    { label: 'YouTube-kanal gemt', complete: /^https?:\/\/(www\.)?youtube\.com\//i.test(state.dealers[0].social_youtube ?? '') },
  ] : part === 2 ? [
    { label: 'Partnerrelation læst i Aftalehistorik', complete: state.relationReviewed },
    { label: 'Fakturaaccept indsendt lokalt', complete: progress.invoiceFlowReviewed },
  ] : [
    {
      label: 'Åbn Partnerdata',
      description: 'Gå ind under Partnerdata og se dine forhandlere.',
      complete: portalBasics.partnerDataOpened,
    },
    {
      label: 'Brug Timan-logoet til at gå tilbage til forsiden',
      description: 'Klik på Timan-logoet øverst til venstre. Timan-logoet fungerer altid som genvej tilbage til portalens forside.',
      complete: portalBasics.returnedHomeFromPartnerData,
    },
  ];
  const portalBasicsNext = !portalBasics.partnerDataOpened
    ? 'Gå ind under Partnerdata og se dine forhandlere.'
    : !portalBasics.returnedHomeFromPartnerData
      ? 'Klik nu på Timan-logoet øverst til venstre for at gå tilbage til portalens forside.'
      : 'Partnerdata og Timan-logoet er gennemført.';
  return <>
    <AcademyGuidancePanel title={part ? `Partnerdata - Part ${part}` : 'Portal Basics - Partnerdata'}
      description="Du bruger den almindelige Partnerdata-side med lokale Academy-data."
      tasks={tasks} next={part === 1 ? 'Åbn Academy Maskiner. Gem en kontaktperson, vælg første kontakt og tilføj YouTube-kanalen.' : part === 2 ? 'Læs relationen i Aftalehistorik, og udfyld fakturaaccepten for Academy Servicepartner.' : portalBasicsNext}
      completion={part === 1 ? { nextUnlock: 'Partnerdata - Part 2 - Samarbejdspartnere og fakturering' } : part === 2} />
    {part === 2 && <Link className="mb-4 inline-block text-sm font-semibold text-emerald-800 underline" to="/portal/misc/forms/dealer-invoice-accept?academy_mode=true">Åbn Forhandler Accept - Fakturering</Link>}
  </>;
}
