import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TimanSupportHost from '@/components/support/TimanSupportHost';
import { deriveSupportPageContext } from '@/lib/supportContext';
import { createAssistantConfiguratorDraft, nextAssistantConfiguratorPrompt } from '@/lib/assistantConfiguratorWorkflow';

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

const feedback = vi.hoisted(() => ({
  fetch: vi.fn(async () => ({})),
  save: vi.fn(async (input: { conversationId: string; responseId: string; userId: string; sentiment: 'POSITIVE' | 'NEGATIVE'; reasonCode?: string | null }) => ({
    id: '55555555-5555-4555-8555-555555555555',
    conversation_id: input.conversationId,
    response_id: input.responseId,
    submitted_by_user_id: input.userId,
    sentiment: input.sentiment,
    reason_code: input.reasonCode || null,
    created_at: '2026-09-30T00:00:00.000Z',
    updated_at: '2026-09-30T00:00:00.000Z',
  })),
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
        id: '11111111-1111-4111-8111-111111111111', role: 'assistant', content: 'Dette er et testsvar.',
        timestamp: '2026-09-27T10:00:00.000Z', status: 'sent', answerStatus: 'ACCEPTED',
      })),
    },
  };
});

vi.mock('@/lib/supportFeedbackService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supportFeedbackService')>();
  return { ...actual, fetchSupportAnswerFeedback: feedback.fetch, saveSupportAnswerFeedback: feedback.save };
});

function renderSupport(path = '/portal') {
  return render(<MemoryRouter initialEntries={[path]}><TimanSupportHost /></MemoryRouter>);
}

describe('Timan Support UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    state.resolving = false;
    state.user = {
      id: '22222222-2222-4222-8222-222222222222', email: 'backend@timan.dk', role: 'timan_backend', portal_role: 'timan_backend',
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
    expect(screen.getByRole('button', { name: 'Nyttigt svar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ikke nyttigt svar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nulstil tilbud' })).not.toBeInTheDocument();
  });

  it('persists positive and negative feedback and offers an optional reason', async () => {
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: 'Åbn Timan Support' }));
    fireEvent.change(screen.getByPlaceholderText('Skriv dit spørgsmål...'), { target: { value: 'Test svar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send besked' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nyttigt svar' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Nyttigt svar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nyttigt svar' })).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.click(screen.getByRole('button', { name: 'Ikke nyttigt svar' }));
    await waitFor(() => expect(screen.getByLabelText('Vælg evt. årsag')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Vælg evt. årsag'), { target: { value: 'MISSING_INFORMATION' } });
    await waitFor(() => expect(feedback.save).toHaveBeenLastCalledWith(expect.objectContaining({
      sentiment: 'NEGATIVE', reasonCode: 'MISSING_INFORMATION',
    })));
  });

  it('offers a compact new-conversation menu without showing workflow reset controls', async () => {
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: 'Åbn Timan Support' }));
    fireEvent.change(screen.getByPlaceholderText('Skriv dit spørgsmål...'), { target: { value: 'Hej' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send besked' }));
    await waitFor(() => expect(screen.getByText('Dette er et testsvar.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Flere handlinger' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nulstil tilbud' })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Tilbage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nulstil tilbud' })).not.toBeInTheDocument();
  });

  it('shows active workflow controls, keeps X as close, and uses the reset confirmation', () => {
    const prompt = nextAssistantConfiguratorPrompt(createAssistantConfiguratorDraft('Opret tilbud på RC-1000S', 'da'), 'da');
    window.sessionStorage.setItem('timan.support.session.v1:backend@timan.dk', JSON.stringify({
      id: '22222222-2222-4222-8222-222222222222',
      messages: [],
      context: { route: '/portal' },
      workflowState: {
        workflowId: '11111111-1111-4111-8111-111111111111',
        stateVersion: 2,
        status: 'DRAFT',
        configurator: prompt.state.configurator,
        pendingField: prompt.state.pendingField,
        canGoBack: true,
        hasMeaningfulChoices: true,
      },
    }));

    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: 'Åbn Timan Support' }));
    expect(screen.getByRole('button', { name: 'Tilbage' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Nulstil tilbud' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('De valgte oplysninger i dette tilbudsflow bliver nulstillet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Annuller' }));

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Timan Support' })).getByRole('button', { name: 'Luk Timan Support' }));
    fireEvent.click(screen.getByRole('button', { name: 'Åbn Timan Support' }));
    expect(screen.getByRole('button', { name: 'Nulstil tilbud' })).toBeInTheDocument();
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
