import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import AcademyPortalBasicsStepSuccessModal from '@/components/academy/AcademyPortalBasicsStepSuccessModal';
import { academySandbox } from '@/lib/academySandbox';

function completeFirstFourTasks() {
  academySandbox.trackPortalBasicsLanguage('fr');
  academySandbox.trackPortalBasicsLanguage('da');
  academySandbox.acknowledgePortalBasicsStepSuccess('language');
  academySandbox.trackPortalBasicsPartnerData();
  academySandbox.trackPortalBasicsLogoHome('/portal/dealer-data');
  academySandbox.acknowledgePortalBasicsStepSuccess('partnerdata');
  academySandbox.trackPortalBasicsFullscreen();
  academySandbox.acknowledgePortalBasicsStepSuccess('fullscreen');
  academySandbox.trackPortalBasicsMapArea('de_plz2');
  academySandbox.acknowledgePortalBasicsStepSuccess('partner_map');
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

describe('Academy Portal Basics step success', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/portal?academy_mode=true');
    academySandbox.startPortalBasics('da');
  });

  it('creates one local success acknowledgement only when a micro-task transitions to complete', () => {
    academySandbox.trackPortalBasicsLanguage('fr');
    expect(academySandbox.getPortalBasicsStepSuccess()).toBeNull();

    academySandbox.trackPortalBasicsLanguage('da');
    expect(academySandbox.getPortalBasicsStepSuccess()).toMatchObject({
      taskId: 'language',
      title: 'Skift portalsprog til fransk og tilbage',
      completed: 1,
      total: 5,
    });

    academySandbox.acknowledgePortalBasicsStepSuccess('language');
    academySandbox.trackPortalBasicsLanguage('fr');
    academySandbox.trackPortalBasicsLanguage('da');
    expect(academySandbox.getPortalBasicsStepSuccess()).toBeNull();
  });

  it('shows the shared success modal once and returns directly to highlighted Portal Basics guidance', async () => {
    const { unmount } = render(<MemoryRouter><AcademyPortalBasicsStepSuccessModal /></MemoryRouter>);

    act(() => {
      academySandbox.trackPortalBasicsLanguage('fr');
      academySandbox.trackPortalBasicsLanguage('da');
    });

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Skift portalsprog til fransk og tilbage'));
    expect(screen.getByRole('dialog')).toHaveTextContent('1 af 5 hurtige gennemført.');
    expect(academySandbox.getPortalBasicsStepSuccess()).toMatchObject({ taskId: 'language' });

    fireEvent.click(screen.getByRole('button', { name: 'Fortsæt til næste opgave' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(academySandbox.getPortalBasicsStepSuccess()).toBeNull();

    unmount();
    render(<MemoryRouter><AcademyPortalBasicsStepSuccessModal /></MemoryRouter>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the active case and navigates to the Portal Basics guidance after continue', async () => {
    render(<MemoryRouter initialEntries={['/portal/misc/partner-map?academy_mode=true']}>
      <AcademyPortalBasicsStepSuccessModal />
      <LocationProbe />
    </MemoryRouter>);

    act(() => academySandbox.trackPortalBasicsMapArea('de_plz2'));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Skift område på Partnerkortet'));

    fireEvent.click(screen.getByRole('button', { name: 'Fortsæt til næste opgave' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/portal?academy_mode=true#academy-guidance'));
    expect(academySandbox.getActiveCase()).toBe('portal.basics_5');
    expect(academySandbox.getPortalBasics().mapAreaChanged).toBe(true);
  });

  it('leaves the fifth transition for the existing full completion modal', () => {
    completeFirstFourTasks();
    academySandbox.trackPortalBasicsNews('Skivehøster til Timan RC-1000s');

    expect(academySandbox.getPortalBasics().completed).toBe(true);
    expect(academySandbox.getPortalBasicsStepSuccess()).toBeNull();
  });
});
