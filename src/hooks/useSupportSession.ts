import { useCallback, useEffect, useRef, useState } from 'react';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { supportService, type SupportService } from '@/lib/supportService';
import type {
  SupportConversation,
  AssistantActionCommand,
  SupportMessage,
  SupportPageContext,
  SupportQuickIntent,
  SupportSessionState,
  SupportWorkflowState,
} from '@/lib/supportTypes';

const SESSION_VERSION = 1;
const SESSION_PREFIX = `timan.support.session.v${SESSION_VERSION}`;

function createId() {
  return crypto.randomUUID();
}

export function createSupportSession(context: SupportPageContext): SupportSessionState {
  return {
    conversation: {
      id: createId(),
      messages: [],
      context,
      workflowState: {},
    },
    status: 'idle',
    error: null,
    failedRequest: null,
  };
}

export function supportSessionStorageKey(identity: string): string {
  return `${SESSION_PREFIX}:${identity.trim().toLocaleLowerCase() || 'anonymous'}`;
}

export function readSupportSession(storageKey: string, context: SupportPageContext): SupportSessionState {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return createSupportSession(context);
    const conversation = JSON.parse(raw) as SupportConversation;
    if (!conversation?.id || !Array.isArray(conversation.messages)) return createSupportSession(context);
    return {
      conversation: {
        ...conversation,
        context,
        workflowState: conversation.workflowState || {},
      },
      status: 'idle',
      error: null,
      failedRequest: null,
    };
  } catch {
    return createSupportSession(context);
  }
}

interface SupportSnapshot {
  key: string;
  state: SupportSessionState;
}

interface UseSupportSessionOptions {
  identity: string;
  enabled: boolean;
  language: PortalUiLanguage;
  context: SupportPageContext;
  service?: SupportService;
  viewAsActive?: boolean;
}

export function useSupportSession({
  identity,
  enabled,
  language,
  context,
  service = supportService,
  viewAsActive = false,
}: UseSupportSessionOptions) {
  const storageKey = supportSessionStorageKey(identity);
  const [snapshot, setSnapshot] = useState<SupportSnapshot>(() => ({
    key: storageKey,
    state: readSupportSession(storageKey, context),
  }));
  const state = snapshot.key === storageKey
    ? snapshot.state
    : readSupportSession(storageKey, context);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (snapshot.key !== storageKey) {
      setSnapshot({ key: storageKey, state: readSupportSession(storageKey, context) });
    }
  }, [context, snapshot.key, storageKey]);

  useEffect(() => {
    if (!enabled || snapshot.key !== storageKey) return;
    window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot.state.conversation));
  }, [enabled, snapshot, storageKey]);

  useEffect(() => {
    if (snapshot.key !== storageKey) return;
    setSnapshot((current) => ({
      ...current,
      state: {
        ...current.state,
        conversation: {
          ...current.state.conversation,
          context: {
            route: context.route,
            machineId: context.machineId,
            productId: context.productId,
          },
        },
      },
    }));
  }, [context.machineId, context.productId, context.route, snapshot.key, storageKey]);

  const updateState = useCallback((updater: (current: SupportSessionState) => SupportSessionState) => {
    setSnapshot((current) => {
      const currentState = current.key === storageKey
        ? current.state
        : readSupportSession(storageKey, context);
      return { key: storageKey, state: updater(currentState) };
    });
  }, [context, storageKey]);

  const runRequest = useCallback(async (
    content: string,
    intent?: SupportQuickIntent,
    retryMessageId?: string,
    command?: AssistantActionCommand,
  ) => {
    const trimmed = content.trim();
    if (!enabled || !trimmed || stateRef.current.status === 'sending') return;

    const userMessage: SupportMessage = retryMessageId
      ? stateRef.current.conversation.messages.find((message) => message.id === retryMessageId) || {
          id: retryMessageId,
          role: 'user',
          content: trimmed,
          timestamp: new Date().toISOString(),
          status: 'sending',
          requestId: crypto.randomUUID(),
        }
      : {
          id: createId(),
          role: 'user',
          content: trimmed,
          timestamp: new Date().toISOString(),
          status: 'sending',
          requestId: crypto.randomUUID(),
        };
    const requestId = userMessage.requestId || crypto.randomUUID();

    updateState((current) => ({
      ...current,
      conversation: {
        ...current.conversation,
        messages: retryMessageId
          ? current.conversation.messages.map((message) => (
              message.id === retryMessageId ? { ...message, status: 'sending' } : message
            ))
          : [...current.conversation.messages, userMessage],
      },
      status: 'sending',
      error: null,
      failedRequest: null,
    }));

    const requestConversation: SupportConversation = {
      ...stateRef.current.conversation,
      messages: retryMessageId
        ? stateRef.current.conversation.messages
        : [...stateRef.current.conversation.messages, userMessage],
    };

    try {
      const response = await service.sendMessage({
        content: trimmed,
        language,
        conversation: requestConversation,
        context: requestConversation.context,
        workflowState: requestConversation.workflowState,
        intent,
        requestId,
        viewAsActive,
        command,
      });
      updateState((current) => ({
        ...current,
        conversation: {
          ...current.conversation,
          workflowState: response.workflowState || current.conversation.workflowState,
          messages: [
            ...current.conversation.messages.map((message) => (
              message.id === userMessage.id ? { ...message, status: 'sent' as const } : message
            )),
            response,
          ],
        },
        status: 'idle',
        error: null,
        failedRequest: null,
      }));
    } catch {
      updateState((current) => ({
        ...current,
        conversation: {
          ...current.conversation,
          messages: current.conversation.messages.map((message) => (
            message.id === userMessage.id ? { ...message, status: 'error' as const } : message
          )),
        },
        status: 'error',
        error: 'supportError',
        failedRequest: { messageId: userMessage.id, requestId, content: trimmed, intent, command },
      }));
    }
  }, [enabled, language, service, updateState, viewAsActive]);

  const sendMessage = useCallback(
    (content: string, intent?: SupportQuickIntent, command?: AssistantActionCommand) => runRequest(content, intent, undefined, command),
    [runRequest],
  );

  const retry = useCallback(() => {
    const failed = stateRef.current.failedRequest;
    if (!failed) return Promise.resolve();
    return runRequest(failed.content, failed.intent, failed.messageId, failed.command);
  }, [runRequest]);

  const setWorkflowState = useCallback((workflowState: SupportWorkflowState) => {
    updateState((current) => ({
      ...current,
      conversation: { ...current.conversation, workflowState },
    }));
  }, [updateState]);

  return { state, sendMessage, retry, setWorkflowState };
}
