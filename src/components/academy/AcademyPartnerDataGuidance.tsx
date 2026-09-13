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
    { label: 'Academy Maskiner åbnet', complete: progress.academyMachineOpened },
    { label: 'Virksomheds- og persondata åbnet', complete: progress.companyDataOpened },
    { label: 'Kontaktperson under Salg gemt', complete: progress.salesContactSaved },
    { label: 'Første kontakt valgt', complete: progress.primarySalesContactSelected },
    { label: 'Hjemmesideadresse tilføjet', complete: progress.websiteAdded },
    { label: 'YouTube-kanal gemt', complete: progress.youtubeAdded },
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
  const part1Next = !progress.academyMachineOpened
    ? 'Åbn Academy Maskiner.'
    : !progress.companyDataOpened
      ? 'Gå til Virksomheds- og persondata.'
      : !progress.salesContactSaved
        ? 'Gem en kontaktperson under Salg.'
        : !progress.primarySalesContactSelected
          ? 'Vælg kontaktpersonen som første kontakt.'
          : !progress.websiteAdded
            ? 'Tilføj virksomhedens hjemmesideadresse.'
            : !progress.youtubeAdded
              ? 'Tilføj Academy YouTube-kanalen.'
              : 'Alle oplysninger er gemt lokalt.';
  return <>
    <AcademyGuidancePanel title={part ? `Partnerdata - Part ${part}` : 'Portal Basics - Partnerdata'}
      description="Du bruger den almindelige Partnerdata-side med lokale Academy-data."
      route={part === 1 ? ['Academy Maskiner', 'Virksomheds- og persondata', 'Gem en kontaktperson under Salg', 'Tilføj virksomhedens hjemmesideadresse'] : undefined}
      explanation={part === 1 ? <>
        <p className="font-semibold">Hvorfor denne opgave?</p>
        <p className="mt-1">Én gang om året skal I gennemgå jeres virksomheds- og kontaktoplysninger og sikre, at de stadig er korrekte. Det hjælper både jer og Timan med at undgå at bruge tid på forkerte kontaktpersoner, gamle telefonnumre eller manglende oplysninger.</p>
        <p className="mt-2">I en travl hverdag bliver den slags oplysninger ikke altid opdateret løbende. Derfor vil I én gang om året blive bedt om at kontrollere og opdatere jeres kontaktdata.</p>
      </> : undefined}
      tasks={tasks} next={part === 1 ? part1Next : part === 2 ? 'Læs relationen i Aftalehistorik, og udfyld fakturaaccepten for Academy Servicepartner.' : portalBasicsNext}
      completion={part === 1 ? { nextUnlock: 'Partnerdata - Part 2 - Samarbejdspartnere og fakturering' } : part === 2} />
    {part === 2 && <Link className="mb-4 inline-block text-sm font-semibold text-emerald-800 underline" to="/portal/misc/forms/dealer-invoice-accept?academy_mode=true">Åbn Forhandler Accept - Fakturering</Link>}
  </>;
}
