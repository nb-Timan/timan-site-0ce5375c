import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import AcademyCaseCompletionModalHost from '@/components/academy/AcademyCaseCompletionModalHost';
import { academySandbox } from '@/lib/academySandbox';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function completePartnerMap() {
  academySandbox.trackPartnerMapOwnDealer();
  academySandbox.trackPartnerMapFullscreen();
  academySandbox.trackPartnerMapWarrantyLayer();
  academySandbox.trackPartnerMapWarrantyOpened();
}

describe('Academy Partnerkort completion modal', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/academy');
    academySandbox.enterSession();
    academySandbox.startPartnerMap();
  });

  it('opens above the route shell on completion and returns to Min Academy', async () => {
    render(
      <MemoryRouter initialEntries={['/portal/misc/partner-map?academy_mode=true']}>
        <AcademyCaseCompletionModalHost />
        <LocationProbe />
      </MemoryRouter>,
    );

    act(() => completePartnerMap());

    expect(await screen.findByRole('dialog')).toHaveTextContent('Partnerkort');
    expect(screen.getByRole('dialog')).toHaveTextContent('Alle 4 af 4 krav er opfyldt.');
    fireEvent.click(screen.getByRole('button', { name: 'Tilbage til Min Academy' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/academy'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not replay a persisted completion after reopening the route', () => {
    completePartnerMap();

    render(
      <MemoryRouter initialEntries={['/portal/misc/partner-map?academy_mode=true']}>
        <AcademyCaseCompletionModalHost />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
