import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const actionMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  confirm: vi.fn(),
  report: vi.fn(),
}));

vi.mock('@/lib/assistantActionService', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/assistantActionService')>(),
  invokeAssistantAction: actionMocks.invoke,
  confirmAssistantAction: actionMocks.confirm,
  reportAssistantActionResult: actionMocks.report,
}));

vi.mock('@/lib/publishedProductMaster', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/publishedProductMaster')>(),
  isProductActive: () => true,
}));

import {
  classifyAssistantWorkflowInput,
  createAssistantConfiguratorDraft,
  nextAssistantConfiguratorPrompt,
} from '@/lib/assistantConfiguratorWorkflow';
import { AssistantSupportService } from '@/lib/assistantSupportService';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';
import { SUPPORT_TRANSLATIONS } from '@/lib/i18n/supportTranslations';
import type { SupportSendRequest, SupportService } from '@/lib/supportService';
import type { AssistantWorkflowState, SupportMessage } from '@/lib/supportTypes';

const endpoint = readFileSync(resolve('supabase/functions/support-actions/index.ts'), 'utf8');
const migration = readFileSync(resolve('supabase/migrations/20260928202500_support_workflow_navigation.sql'), 'utf8');
const host = readFileSync(resolve('src/components/support/TimanSupportHost.tsx'), 'utf8');

function workflow(): AssistantWorkflowState {
  const draft = createAssistantConfiguratorDraft('Opret tilbud på RC-1000S', 'da');
  const prompt = nextAssistantConfiguratorPrompt(draft, 'da');
  return {
    workflowId: '11111111-1111-4111-8111-111111111111',
    stateVersion: 3,
    status: 'DRAFT',
    configurator: prompt.state.configurator,
    pendingField: prompt.state.pendingField,
    pendingMachineType: prompt.state.pendingMachineType,
    canGoBack: true,
    hasMeaningfulChoices: true,
  };
}

function serverWorkflow(state = workflow()) {
  return {
    id: state.workflowId,
    conversation_id: '22222222-2222-4222-8222-222222222222',
    state: {
      configurator: state.configurator,
      pendingField: state.pendingField,
      pendingMachineType: state.pendingMachineType,
    },
    state_version: state.stateVersion + 1,
    status: state.status,
    can_go_back: false,
    has_meaningful_choices: true,
  };
}

function request(state: AssistantWorkflowState, content: string, command?: SupportSendRequest['command']): SupportSendRequest {
  return {
    content,
    language: 'da',
    conversation: {
      id: '22222222-2222-4222-8222-222222222222',
      messages: [],
      context: { route: '/portal' },
      workflowState: state,
    },
    context: { route: '/portal' },
    workflowState: state,
    requestId: '33333333-3333-4333-8333-333333333333',
    command,
  };
}

function assistantMessage(content: string): SupportMessage {
  return {
    id: 'normal-answer',
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
    status: 'sent',
  };
}

describe('Support workflow input compatibility', () => {
  it('blocks explicit cancellation and unrelated questions before the configurator parser', () => {
    const state = workflow();
    const draft = { configurator: state.configurator, pendingField: state.pendingField, pendingMachineType: state.pendingMachineType };
    expect(classifyAssistantWorkflowInput(draft, 'Jeg vil ikke have et tilbud, men hvor lang og bred er en RC1000', 'da')).toBe('interrupt');
    expect(classifyAssistantWorkflowInput(draft, 'Stop tilbuddet', 'da')).toBe('interrupt');
    expect(classifyAssistantWorkflowInput(draft, 'Hvor bred er RC-1000?', 'da')).toBe('interrupt');
  });

  it('accepts a current choice and clarifies unknown workflow input', () => {
    const state = workflow();
    const draft = { configurator: state.configurator, pendingField: state.pendingField, pendingMachineType: state.pendingMachineType };
    const prompt = nextAssistantConfiguratorPrompt(draft, 'da');
    expect(prompt.card?.choices?.[0]).toBeTruthy();
    expect(classifyAssistantWorkflowInput(draft, prompt.card!.choices![0].label, 'da')).toBe('compatible');
    expect(classifyAssistantWorkflowInput(draft, 'måske den sædvanlige', 'da')).toBe('ambiguous');
  });
});

describe('Support workflow interruption decisions', () => {
  beforeEach(() => {
    actionMocks.invoke.mockReset();
    actionMocks.confirm.mockReset();
    actionMocks.report.mockReset();
  });

  it('abandons canonically and resumes the original message through normal Support', async () => {
    const fallback = { sendMessage: vi.fn().mockResolvedValue(assistantMessage('RC-1000s dimensions answer')) } satisfies SupportService;
    const service = new AssistantSupportService({ email: 'qa@example.invalid' } as never, fallback);
    const state = workflow();
    const original = 'Jeg vil ikke have et tilbud, men hvor lang og bred er en RC1000';
    const interrupted = await service.sendMessage(request(state, original));
    const yes = interrupted.actionCard?.choices?.find((choice) => choice.command.type === 'confirm_topic_switch');
    expect(yes?.command.parameters?.pending_message).toBe(original);

    actionMocks.confirm.mockResolvedValue({ workflow: { ...serverWorkflow(state), status: 'ABANDONED' } });
    const resumed = await service.sendMessage(request(state, yes!.label, yes!.command));

    expect(actionMocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      action: 'abandon_workflow',
      stateVersion: state.stateVersion,
      parameters: { reason: 'TOPIC_SWITCH' },
    }));
    expect(fallback.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: original, workflowState: {} }));
    expect(resumed.content).toBe('RC-1000s dimensions answer');
    expect(resumed.workflowState).toEqual({});
  });

  it('keeps the workflow and repeats the current question when interruption is declined', async () => {
    const fallback = { sendMessage: vi.fn() } satisfies SupportService;
    const service = new AssistantSupportService({ email: 'qa@example.invalid' } as never, fallback);
    const state = workflow();
    const response = await service.sendMessage(request(state, 'Nej, fortsæt tilbud', { type: 'continue_workflow' }));

    expect(response.workflowState).toEqual(state);
    expect(response.content).toBe(nextAssistantConfiguratorPrompt({
      configurator: state.configurator,
      pendingField: state.pendingField,
      pendingMachineType: state.pendingMachineType,
    }, 'da').content);
    expect(actionMocks.confirm).not.toHaveBeenCalled();
    expect(fallback.sendMessage).not.toHaveBeenCalled();
  });

  it('uses canonical versioned actions for Back and Reset', async () => {
    const fallback = { sendMessage: vi.fn() } satisfies SupportService;
    const service = new AssistantSupportService({ email: 'qa@example.invalid' } as never, fallback);
    const state = workflow();
    actionMocks.invoke.mockResolvedValue({ workflow: serverWorkflow(state) });

    const back = await service.sendMessage(request(state, 'Tilbage', { type: 'workflow_back' }));
    expect(actionMocks.invoke).toHaveBeenCalledWith(expect.objectContaining({
      action: 'navigate_workflow_back',
      workflowId: state.workflowId,
      expectedStateVersion: state.stateVersion,
    }));
    expect(back.workflowState?.stateVersion).toBe(state.stateVersion + 1);

    actionMocks.confirm.mockResolvedValue({ workflow: { ...serverWorkflow(state), status: 'ABANDONED' } });
    const reset = await service.sendMessage(request(state, 'Nulstil tilbud', { type: 'reset_workflow' }));
    expect(actionMocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      action: 'abandon_workflow',
      parameters: { reason: 'USER_RESET' },
    }));
    expect(reset.workflowState).toEqual({});
  });
});

describe('canonical workflow navigation contract', () => {
  it('keeps server-owned history, version checks, audit and business references', () => {
    expect(migration).toContain('state_history jsonb');
    expect(migration).toContain('support_assistant_workflows_active_conversation_user_idx');
    expect(endpoint).toContain("navigate_workflow_back: { level: 1, permission: 'support' }");
    expect(endpoint).toContain("abandon_workflow: { level: 2, permission: 'support' }");
    expect(endpoint).toContain('state_history: nextHistory');
    expect(endpoint).toContain("status: 'ABANDONED'");
    expect(endpoint).toContain('preserved_entities');
    expect(endpoint).toContain('state_version: expectedStateVersion! + 1');
    expect(endpoint).toContain('completeAction(service');
  });

  it('shows controls only for active workflows and keeps mobile actions stackable', () => {
    expect(host).toContain('{activeWorkflow && (');
    expect(host).toContain("{ type: 'workflow_back' }");
    expect(host).toContain("{ type: 'reset_workflow' }");
    expect(host).toContain('grid grid-cols-1 gap-2 sm:flex sm:flex-wrap');
    expect(host).toContain('supportCloseLabel');
  });

  it('provides every workflow label in all nine portal languages', () => {
    expect(PORTAL_LANGUAGE_CODES).toHaveLength(9);
    for (const language of PORTAL_LANGUAGE_CODES) {
      const labels = SUPPORT_TRANSLATIONS[language];
      for (const key of [
        'supportWorkflowBack',
        'supportWorkflowReset',
        'supportWorkflowResetTitle',
        'supportWorkflowTopicSwitchPrompt',
        'supportWorkflowTopicSwitchYes',
        'supportWorkflowTopicSwitchNo',
        'supportWorkflowClarify',
        'supportWorkflowInactive',
      ] as const) {
        expect(labels[key].trim(), `${language}.${key}`).not.toBe('');
      }
    }
  });
});
