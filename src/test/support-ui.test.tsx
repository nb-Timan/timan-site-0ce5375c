import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TimanSupportHost from '@/components/support/TimanSupportHost';
import { deriveSupportPageContext } from '@/lib/supportContext';

const state = vi.hoisted(() => ({
  user: {
    email: 'backend@timan.dk',
    role: 'timan_backend',
    portal_role: 'timan_backend',
    partner_type: null,
    approved: true,
    is_active: true,
    permissions: { support_access: true },
  } as Record<string, unknown> | null,
  resolving: false,
}));

vi.mock('@/context/AppUserContext', () => ({
  useAppUser: () => ({ appUser: state.user, loading: false }),
}));

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({ uiLanguage: 'da', language: 'da' }),
}));

vi.mock('@/lib/viewAsUser', () => ({
  useEffectivePortalUserState: () => ({ effectiveUser: state.user, resolving: state.resolving }),
}));

vi.mock('@/lib/supportService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supportService')>();
  return {
    ...actual,
    supportService: {
      sendMessage: vi.fn(async () => ({
        id: 'assistant-ui', role: 'assistant', content: 'Dette er et testsvar.',
        timestamp: '2026-09-27T10:00:00.000Z', status: 'sent',
      })),
    },
  };
});

function renderSupport(path = '/portal') {
  return render(<MemoryRouter initialEntries={[path]}><TimanSupportHost /></MemoryRouter>);
}

describe('Timan Support UI', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    state.resolving = false;
    state.user = {
      email: 'backend@timan.dk', role: 'timan_backend', portal_role: 'timan_backend',
      partner_type: null, approved: true, is_active: true,
      permissions: { support_access: true },
    };
  });

  it('renders only for the canonical effective Backend permission', () => {
    const { rerender } = renderSupport();
    expect(screen.getByRole('button', { name: 'Åbn Timan Support' })).toBeInTheDocument();

    state.user = { ...state.user!, portal_role: 'timan_seller' };
    rerender(<MemoryRouter initialEntries={['/portal']}><TimanSupportHost /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Åbn Timan Support' })).not.toBeInTheDocument();
  });

  it('opens the panel, blocks blank sends and preserves messages after close/reopen', async () => {
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: 'Åbn Timan Support' }));
    expect(screen.getByRole('dialog', { name: 'Timan Support' })).toBeInTheDocument();
    expect(screen.getByText('Kun Backend')).toBeInTheDocument();

    const send = screen.getByRole('button', { name: 'Send besked' });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Skriv dit spørgsmål...'), { target: { value: 'Hej Support' } });
    fireEvent.click(send);

    await waitFor(() => expect(screen.getByText('Dette er et testsvar.')).toBeInTheDocument());
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Timan Support' })).getByRole('button', { name: 'Luk Timan Support' }));
    fireEvent.click(screen.getByRole('button', { name: 'Åbn Timan Support' }));
    expect(screen.getByText('Hej Support')).toBeInTheDocument();
    expect(screen.getByText('Dette er et testsvar.')).toBeInTheDocument();
  });

  it('exposes quick actions and responsive desktop/mobile panel constraints', () => {
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: 'Åbn Timan Support' }));
    expect(screen.getByRole('button', { name: 'Maskininfo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Portalhjælp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timan.dk' })).toBeInTheDocument();
    const panel = screen.getByRole('dialog', { name: 'Timan Support' });
    expect(panel.className).toContain('h-[min(88dvh,46rem)]');
    expect(panel.className).toContain('sm:w-[420px]');
  });

  it('derives minimal route context without retrieval or data fetching', () => {
    expect(deriveSupportPageContext('/portal/service/machines/ACA-123')).toEqual({
      route: '/portal/service/machines/ACA-123', machineId: 'ACA-123', productId: undefined,
    });
    expect(deriveSupportPageContext('/configurator', '?productId=712000')).toEqual({
      route: '/configurator', machineId: undefined, productId: '712000',
    });
  });
});
