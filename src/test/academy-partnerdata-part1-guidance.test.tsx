import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import AcademyPartnerDataGuidance from '@/components/academy/AcademyPartnerDataGuidance';
import { ACADEMY_PARTNER_ACCOUNT, academyPartnerDataSandbox as sandbox } from '@/lib/academyPartnerDataSandbox';

describe('Academy Partnerdata Part 1 guidance', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/portal/dealer-data?academy_mode=true&academy_part=1');
    sandbox.start(1);
  });

  it('shows the real module route, annual explanation and dynamic next step', () => {
    render(<MemoryRouter><AcademyPartnerDataGuidance /></MemoryRouter>);

    expect(screen.getByText('Academy Maskiner')).toBeInTheDocument();
    expect(screen.getByText('Virksomheds- og persondata')).toBeInTheDocument();
    expect(screen.getByText('Gem en kontaktperson under Salg')).toBeInTheDocument();
    expect(screen.getByText('Tilføj virksomhedens hjemmesideadresse')).toBeInTheDocument();
    expect(screen.getByText('Hvorfor denne opgave?')).toBeInTheDocument();
    expect(screen.getByText(/Én gang om året skal I gennemgå jeres virksomheds- og kontaktoplysninger/)).toBeInTheDocument();
    expect(screen.getByText('0 / 6 krav')).toBeInTheDocument();
    expect(screen.getByText('Næste trin: Åbn Academy Maskiner.')).toBeInTheDocument();

    act(() => sandbox.trackAcademyMachineOpened(ACADEMY_PARTNER_ACCOUNT));
    expect(screen.getByText('Næste trin: Gå til Virksomheds- og persondata.')).toBeInTheDocument();

    act(() => sandbox.trackCompanyDataOpened(ACADEMY_PARTNER_ACCOUNT));
    expect(screen.getByText('Næste trin: Gem en kontaktperson under Salg.')).toBeInTheDocument();
  });
});
