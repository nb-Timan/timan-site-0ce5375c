import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import AcademyPartnerDataGuidance from '@/components/academy/AcademyPartnerDataGuidance';
import { readFileSync } from 'node:fs';
import { academySandbox } from '@/lib/academySandbox';

describe('Academy Portal Basics Partnerdata guidance', () => {
  it('uses a local-only target news item instead of mutating or depending on the production feed', () => {
    const latest = readFileSync('src/components/portal/LatestFromTiman.tsx', 'utf8');
    expect(latest).toContain("id: 'academy-news-rc1000s-disc-mower'");
    expect(latest).toContain("title: 'Skivehøster til Timan RC-1000s'");
    expect(latest).toContain('if (academySandbox.isActive())');
  });

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
