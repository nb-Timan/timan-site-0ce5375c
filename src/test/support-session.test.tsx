import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupportSession, readSupportSession, supportSessionStorageKey, useSupportSession } from '@/hooks/useSupportSession';
import type { SupportService } from '@/lib/supportService';

const context = { route: '/portal/service/machines/ACA-1', machineId: 'ACA-1' };

describe('Timan Support session state', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('stores conversation, page context and workflow state in sessionStorage only', async () => {
    const service: SupportService = {
      sendMessage: vi.fn(async () => ({
        id: 'assistant-1', role: 'assistant', content: 'Testsvar',
        timestamp: '2026-09-27T10:00:00.000Z', status: 'sent',
      })),
    };
    const { result } = renderHook(() => useSupportSession({
      identity: 'backend@timan.dk', enabled: true, language: 'da', context, service,
    }));

    await act(async () => result.current.sendMessage('Hej'));
    act(() => result.current.setWorkflowState({ step: 'future-action' }));

    await waitFor(() => expect(result.current.state.conversation.messages).toHaveLength(2));
    const storageKey = supportSessionStorageKey('backend@timan.dk');
    await waitFor(() => expect(window.sessionStorage.getItem(storageKey)).toContain('Testsvar'));
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    const restored = readSupportSession(storageKey, context);
    expect(restored.conversation.context).toEqual(context);
    expect(restored.conversation.workflowState).toEqual({ step: 'future-action' });
  });

  it('keeps failed messages and retries without duplicating the user message', async () => {
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({
        id: 'assistant-2', role: 'assistant', content: 'OK',
        timestamp: '2026-09-27T10:00:00.000Z', status: 'sent',
      });
    const { result } = renderHook(() => useSupportSession({
      identity: 'backend@timan.dk', enabled: true, language: 'da', context,
      service: { sendMessage },
    }));

    await act(async () => result.current.sendMessage('Prøv'));
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.conversation.messages).toHaveLength(1);
    expect(result.current.state.conversation.messages[0].status).toBe('error');

    await act(async () => result.current.retry());
    expect(result.current.state.status).toBe('idle');
    expect(result.current.state.conversation.messages.map((message) => message.content)).toEqual(['Prøv', 'OK']);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('does not write a session for an unauthorized surface', () => {
    const storageKey = supportSessionStorageKey('seller@timan.dk');
    renderHook(() => useSupportSession({
      identity: 'seller@timan.dk', enabled: false, language: 'da', context,
    }));
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it('creates the future-safe conversation shape', () => {
    expect(createSupportSession(context)).toMatchObject({
      conversation: { messages: [], context, workflowState: {} },
      status: 'idle', error: null, failedRequest: null,
    });
  });

  it('starts a new conversation without deleting the stored backend history', async () => {
    const service: SupportService = {
      sendMessage: vi.fn(async () => ({
        id: 'assistant-3', role: 'assistant', content: 'Svar', timestamp: '', status: 'sent',
      })),
    };
    const { result } = renderHook(() => useSupportSession({
      identity: 'backend@timan.dk', enabled: true, language: 'da', context, service,
    }));
    const firstId = result.current.state.conversation.id;
    await act(async () => result.current.sendMessage('Hej'));
    act(() => result.current.startNewConversation());
    expect(result.current.state.conversation.id).not.toBe(firstId);
    expect(result.current.state.conversation.messages).toEqual([]);
    expect(result.current.state.conversation.workflowState).toEqual({});
  });
});
