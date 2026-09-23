import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import AcademyPartnerDataGuidance from '@/components/academy/AcademyPartnerDataGuidance';
import { ACADEMY_PARTNER_ACCOUNT, academyPartnerDataSandbox as sandbox } from '@/lib/academyPartnerDataSandbox';
import { ACADEMY_TRANSLATIONS } from '@/lib/i18n/academyTranslations';

describe('Academy Partnerdata Part 1 guidance', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/portal/dealer-data?academy_mode=true&academy_part=1');
    sandbox.start(1);
  });

  it('shows compact numbered points, annual explanation and dynamic next point', () => {
    render(<MemoryRouter><AcademyPartnerDataGuidance /></MemoryRouter>);

    expect(screen.getByText('Punkt 1: Åbn Academy Maskiner')).toBeInTheDocument();
    expect(screen.getByText('Punkt 2: Gå til Virksomheds- og persondata')).toBeInTheDocument();
    expect(screen.getByText('Punkt 3: Gem en kontaktperson under Salg')).toBeInTheDocument();
    expect(screen.getByText(/Brug gerne dig selv med korrekte oplysninger/)).toBeInTheDocument();
    expect(screen.getByText('Punkt 5: Tilføj hjemmesideadresse')).toBeInTheDocument();
    expect(screen.getByText('Hvorfor denne opgave?')).toBeInTheDocument();
    expect(screen.getByText(/Senere i Academy bruger vi den gemte kontaktperson i bl.a. Leads og Configurator/)).toBeInTheDocument();
    expect(screen.getByText('0 / 6 krav')).toBeInTheDocument();
    expect(screen.getByText('Næste punkt: Punkt 1: Åbn Academy Maskiner.')).toBeInTheDocument();

    act(() => sandbox.trackAcademyMachineOpened(ACADEMY_PARTNER_ACCOUNT));
    expect(screen.getByText('Næste punkt: Punkt 2: Gå til Virksomheds- og persondata.')).toBeInTheDocument();

    act(() => sandbox.trackCompanyDataOpened(ACADEMY_PARTNER_ACCOUNT));
    expect(screen.getByText('Næste punkt: Punkt 3: Gem en kontaktperson under Salg.')).toBeInTheDocument();
  });

  it('uses the same point cards for Partnerdata Part 2', async () => {
    const dealer = sandbox.listDealers()[0];
    sandbox.trackAcademyMachineOpened(ACADEMY_PARTNER_ACCOUNT);
    sandbox.trackCompanyDataOpened(ACADEMY_PARTNER_ACCOUNT);
    await sandbox.updateDealerAccount(dealer.id, { website: 'https://academy.example', social_youtube: 'https://youtube.com/@academy' });
    await sandbox.upsertDealerContact({ dealer_account_id: dealer.id, contact_area: 'sales', name: 'Academy Kontakt', is_primary: true });
    sandbox.start(2);

    const { container } = render(<MemoryRouter><AcademyPartnerDataGuidance /></MemoryRouter>);

    expect(screen.getByText('Punkt 1: Udfyld Forhandler Accept - Fakturering')).toBeInTheDocument();
    expect(screen.getByText('Punkt 2: Gennemgå partnerrelation og aftalehistorik')).toBeInTheDocument();
    expect(screen.getByText('Næste punkt: Punkt 1: Udfyld Forhandler Accept - Fakturering.')).toBeInTheDocument();
    expect(screen.getByText(/Her lærer du først at registrere en fakturaaccept/)).toBeInTheDocument();
    expect(container.querySelector('ol')).toHaveClass('md:grid-cols-2');
  });

  it('provides the Part 2 invoice, history, and event copy in every Academy language', () => {
    for (const locale of ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs']) {
      const translations = ACADEMY_TRANSLATIONS[locale];
      expect(translations.academyPartnerDataInvoice).toBeTruthy();
      expect(translations.academyPartnerDataRelation).toBeTruthy();
      expect(translations.academyPartnerDataPart2Why).toBeTruthy();
      expect(translations.academyPartnerDataReadHistoryEvent).toBeTruthy();
      expect(translations.academyPartnerDataHistoryRelationTitle).toBeTruthy();
      expect(translations.academyPartnerDataHistoryContractTitle).toBeTruthy();
      expect(translations.academyPartnerDataHistoryInvoiceTitle).toBeTruthy();
    }
  });
});
