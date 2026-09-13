import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import AcademyPartnerDataGuidance from '@/components/academy/AcademyPartnerDataGuidance';
import { academySandbox } from '@/lib/academySandbox';

describe('Academy Portal Basics Partnerdata guidance', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/portal/dealer-data?academy_mode=true');
    academySandbox.startPortalBasics('da');
  });

  it('requires a Timan-logo home action after Partnerdata opens', () => {
    render(<MemoryRouter><AcademyPartnerDataGuidance /></MemoryRouter>);

    expect(screen.getByText('Academy - Portal Basics - Partnerdata')).toBeInTheDocument();
    expect(screen.getByText('0 / 2 krav')).toBeInTheDocument();
    expect(screen.getByText('Gå ind under Partnerdata og se dine forhandlere.')).toBeInTheDocument();
    expect(screen.queryByText('Case gennemført.')).not.toBeInTheDocument();

    act(() => academySandbox.trackPortalBasicsPartnerData());

    expect(screen.getByText('1 / 2 krav')).toBeInTheDocument();
    expect(screen.getByText(/Næste trin: Klik nu på Timan-logoet øverst til venstre/)).toBeInTheDocument();
    expect(screen.queryByText('Case gennemført.')).not.toBeInTheDocument();

    act(() => academySandbox.trackPortalBasicsLogoHome('/portal/dealer-data'));

    expect(screen.getByText('2 / 2 krav')).toBeInTheDocument();
    expect(screen.getByText('Case gennemført.')).toBeInTheDocument();
  });
});
