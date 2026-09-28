import { supabase } from '@/lib/supabase';
import type { ConfiguratorState } from '@/types/configurator';

export type AssistantEndpointAction =
  | 'load_workflow'
  | 'get_machine_configuration_options'
  | 'calculate_quote_preview'
  | 'preview_quote'
  | 'find_dealer'
  | 'find_partner_contact'
  | 'inspect_lead'
  | 'create_configuration_draft'
  | 'set_configuration_option'
  | 'navigate_workflow_back'
  | 'abandon_workflow'
  | 'prepare_quote_email'
  | 'request_confirmation'
  | 'create_quote_draft'
  | 'create_or_link_lead'
  | 'generate_quote_pdf'
  | 'handoff_to_sales'
  | 'handoff_to_service'
  | 'send_quote_email';

export interface AssistantServerWorkflow {
  id: string;
  conversation_id: string;
  state: {
    configurator?: ConfiguratorState;
    pendingField?: string | null;
    pendingMachineType?: string | null;
    dealer?: Record<string, unknown> | null;
    contact?: Record<string, unknown> | null;
    quoteKind?: 'ordinary' | 'demo';
    [key: string]: unknown;
  };
  state_version: number;
  status: string;
  dealer_account_id?: string | null;
  dealer_number?: string | null;
  dealer_contact_id?: string | null;
  lead_id?: string | null;
  configuration_id?: string | null;
  quote_number?: string | null;
  pricing_snapshot?: Record<string, unknown> | null;
  email_draft?: Record<string, unknown> | null;
  can_go_back?: boolean;
  has_meaningful_choices?: boolean;
}

export interface AssistantActionResponse {
  workflow?: AssistantServerWorkflow | null;
  preview?: Record<string, unknown>;
  options?: Array<Record<string, unknown>>;
  dealers?: Array<Record<string, unknown>>;
  contacts?: Array<Record<string, unknown>>;
  lead?: Record<string, unknown>;
  email?: Record<string, unknown>;
  confirmation_token?: string;
  expires_at?: string;
  execution_required?: boolean;
  execution_action_id?: string;
  execution_kind?: 'quote' | 'lead' | 'pdf' | 'mail';
  duplicate?: boolean;
  action_id?: string;
  status?: string;
  result?: Record<string, unknown> | null;
  handoff_id?: string;
  service_ticket_id?: string | null;
  target?: string;
  error?: string;
  current_state_version?: number;
}

interface InvokeInput {
  action: AssistantEndpointAction;
  conversationId: string;
  workflowId?: string | null;
  expectedStateVersion?: number | null;
  parameters?: Record<string, unknown>;
  confirmationToken?: string;
  idempotencyKey?: string;
  actionId?: string;
}

function requestId(): string {
  return crypto.randomUUID();
}

export async function invokeAssistantAction(input: InvokeInput): Promise<AssistantActionResponse> {
  const { data, error } = await supabase.functions.invoke<AssistantActionResponse>('support-actions', {
    body: {
      action: input.action,
      action_id: input.actionId || requestId(),
      idempotency_key: input.idempotencyKey || `${input.action}:${requestId()}`,
      conversation_id: input.conversationId,
      workflow_id: input.workflowId || null,
      expected_state_version: input.expectedStateVersion ?? null,
      parameters: input.parameters || {},
      confirmation_token: input.confirmationToken || null,
    },
  });
  if (error) throw new Error(error.message || 'ASSISTANT_ACTION_FAILED');
  if (!data) throw new Error('ASSISTANT_ACTION_EMPTY_RESPONSE');
  if (data.error) throw new Error(data.error);
  return data;
}

export async function reportAssistantActionResult(input: {
  executionActionId: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}): Promise<AssistantActionResponse> {
  const { data, error } = await supabase.functions.invoke<AssistantActionResponse>('support-actions', {
    body: {
      action: 'report_action_result',
      execution_action_id: input.executionActionId,
      success: input.success,
      result: input.result || {},
      error: input.error || null,
    },
  });
  if (error) throw new Error(error.message || 'ASSISTANT_ACTION_REPORT_FAILED');
  if (!data || data.error) throw new Error(data?.error || 'ASSISTANT_ACTION_REPORT_FAILED');
  return data;
}

export async function confirmAssistantAction(input: {
  conversationId: string;
  workflowId: string;
  stateVersion: number;
  action: Exclude<AssistantEndpointAction, 'request_confirmation' | 'report_action_result'>;
  parameters: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<AssistantActionResponse> {
  const confirmationInput = {
    action: 'request_confirmation',
    conversationId: input.conversationId,
    workflowId: input.workflowId,
    expectedStateVersion: input.stateVersion,
    idempotencyKey: `confirmation:${input.idempotencyKey}`,
    parameters: { target_action: input.action, target_parameters: input.parameters },
  } as const;
  let confirmation = await invokeAssistantAction(confirmationInput);
  if (confirmation.duplicate && !confirmation.confirmation_token) {
    confirmation = await invokeAssistantAction({
      ...confirmationInput,
      idempotencyKey: `${confirmationInput.idempotencyKey}:retry:${requestId()}`,
    });
  }
  if (!confirmation.confirmation_token) throw new Error('CONFIRMATION_TOKEN_MISSING');
  return invokeAssistantAction({
    action: input.action,
    conversationId: input.conversationId,
    workflowId: input.workflowId,
    expectedStateVersion: input.stateVersion,
    parameters: input.parameters,
    confirmationToken: confirmation.confirmation_token,
    idempotencyKey: input.idempotencyKey,
  });
}
