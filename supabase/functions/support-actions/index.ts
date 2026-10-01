import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1';
import {
  buildCanonicalTimanSalesContacts,
  resolveCanonicalTimanQuoteSeller,
  type DealerSalesAssignment,
  type TimanQuoteSeller,
} from '../_shared/timanSalesContact.ts';
import { canApplyExtraDealerDiscount } from '../_shared/configuratorPermissionContract.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_JSON_BYTES = 250_000;
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

type Client = ReturnType<typeof createClient>;
type Json = Record<string, unknown>;
type Actor = {
  id: string;
  auth_user_id: string | null;
  email: string;
  portal_role: string | null;
  dealer_number: string | null;
  allowed_areas: string[] | null;
  allowed_modules: string[] | null;
  module_access: string[] | null;
  permissions: Record<string, boolean> | null;
  can_view_prices: boolean | null;
  can_submit_order: boolean | null;
  can_edit_discount: boolean | null;
};

type ActionDefinition = {
  level: 0 | 1 | 2 | 3;
  permission: 'support' | 'price' | 'quote' | 'lead' | 'discount' | 'service';
  clientExecution?: 'quote' | 'lead' | 'pdf' | 'mail';
};

const ACTIONS: Record<string, ActionDefinition> = {
  load_workflow: { level: 0, permission: 'support' },
  get_machine_configuration_options: { level: 0, permission: 'support' },
  calculate_quote_preview: { level: 0, permission: 'price' },
  preview_quote: { level: 0, permission: 'price' },
  find_dealer: { level: 0, permission: 'support' },
  find_partner_contact: { level: 0, permission: 'support' },
  resolve_timan_sales_contact: { level: 0, permission: 'support' },
  inspect_lead: { level: 0, permission: 'lead' },
  create_configuration_draft: { level: 1, permission: 'support' },
  set_configuration_option: { level: 1, permission: 'support' },
  navigate_workflow_back: { level: 1, permission: 'support' },
  abandon_workflow: { level: 2, permission: 'support' },
  prepare_quote_email: { level: 1, permission: 'quote' },
  request_confirmation: { level: 1, permission: 'support' },
  create_quote_draft: { level: 2, permission: 'quote', clientExecution: 'quote' },
  create_or_link_lead: { level: 2, permission: 'lead', clientExecution: 'lead' },
  generate_quote_pdf: { level: 2, permission: 'quote', clientExecution: 'pdf' },
  handoff_to_sales: { level: 2, permission: 'quote' },
  handoff_to_service: { level: 2, permission: 'service' },
  send_quote_email: { level: 3, permission: 'quote', clientExecution: 'mail' },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function object(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function text(value: unknown, max = 2_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function uuid(value: unknown, required = true): string | null {
  const valueText = text(value, 64);
  if (!valueText && !required) return null;
  if (!UUID.test(valueText)) throw new Error('INVALID_UUID');
  return valueText;
}

function integer(value: unknown, min = 1): number {
  if (!Number.isInteger(value) || Number(value) < min) throw new Error('INVALID_INTEGER');
  return Number(value);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Json).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, stable(item)]));
}

async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sanitizedError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason || 'ACTION_FAILED');
  return message.replace(/[\r\n\t]+/g, ' ').slice(0, 500);
}

async function resolveActor(service: Client, authUser: { id: string; email?: string | null }): Promise<Actor> {
  const selection = 'id, auth_user_id, email, portal_role, dealer_number, allowed_areas, allowed_modules, module_access, permissions, can_view_prices, can_submit_order, can_edit_discount, approved, is_active';
  let result = await service.from('app_users').select(selection).eq('auth_user_id', authUser.id).limit(1).maybeSingle();
  if (!result.data && authUser.email) {
    result = await service.from('app_users').select(selection).ilike('email', authUser.email).limit(1).maybeSingle();
  }
  if (result.error || !result.data?.approved || !result.data?.is_active) throw new Error('FORBIDDEN');
  return result.data as Actor;
}

async function authorize(request: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization) throw new Error('UNAUTHORIZED');
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) throw new Error('UNAUTHORIZED');
  const { data: supportAllowed, error: supportError } = await userClient.rpc('can_access_support');
  if (supportError || supportAllowed !== true) throw new Error('FORBIDDEN');
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { userClient, service, actor: await resolveActor(service, authData.user) };
}

function moduleAllowed(actor: Actor, module: string): boolean {
  if (actor.portal_role === 'timan_backend') return true;
  return (actor.allowed_modules ?? actor.module_access ?? []).includes(module);
}

function priceAllowed(actor: Actor): boolean {
  if (actor.can_view_prices === true) return true;
  if (actor.can_view_prices === false) return false;
  return ['timan_backend', 'timan_seller', 'timan_service', 'timan_dealer', 'timan_importer', 'timan_service_partner', 'dealer_customer']
    .includes(actor.portal_role || '');
}

function leadAllowed(actor: Actor): boolean {
  const explicit = actor.permissions?.can_save_configurator_as_lead;
  if (explicit !== undefined) return explicit === true;
  return actor.portal_role === 'timan_backend' || actor.portal_role === 'timan_seller';
}

function discountAllowed(actor: Actor): boolean {
  return canApplyExtraDealerDiscount({
    portalRole: actor.portal_role,
    permissions: actor.permissions,
    canEditDiscount: actor.can_edit_discount,
  });
}

function permissionAllowed(actor: Actor, permission: ActionDefinition['permission']): boolean {
  if (permission === 'support') return true;
  if (permission === 'price') return priceAllowed(actor);
  if (permission === 'quote') return moduleAllowed(actor, 'tilbud');
  if (permission === 'lead') return leadAllowed(actor) && moduleAllowed(actor, 'timan_crm');
  if (permission === 'discount') return discountAllowed(actor);
  if (permission === 'service') {
    return actor.portal_role === 'timan_backend'
      || ((actor.allowed_areas || []).includes('teknik_service') && moduleAllowed(actor, 'service_tickets'));
  }
  return false;
}

async function ensureConversation(service: Client, actor: Actor, conversationId: string) {
  const { data: existing, error } = await service.from('support_conversations')
    .select('id, started_by_user_id').eq('id', conversationId).maybeSingle();
  if (error) throw error;
  if (existing && existing.started_by_user_id !== actor.id) throw new Error('FORBIDDEN');
  if (!existing) {
    const { error: insertError } = await service.from('support_conversations').insert({
      id: conversationId, started_by_user_id: actor.id, role_snapshot: actor.portal_role,
    });
    if (insertError) throw insertError;
  }
}

async function loadWorkflow(service: Client, actor: Actor, workflowId: string | null, conversationId: string) {
  let query = service.from('support_assistant_workflows').select('*').eq('user_id', actor.id);
  query = workflowId
    ? query.eq('id', workflowId).eq('conversation_id', conversationId)
    : query.eq('conversation_id', conversationId)
      .in('status', ['DRAFT', 'READY', 'QUOTE_CREATED', 'PDF_GENERATED', 'EMAIL_PREPARED'])
      .order('updated_at', { ascending: false })
      .limit(1);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function audit(service: Client, input: {
  actionId?: string | null; actor: Actor; conversationId: string; workflowId?: string | null;
  eventType: string; actionType: string; level: number; stateVersion?: number | null;
  permissionResult?: Json; parameters?: Json; result?: unknown;
  affectedEntityType?: string | null; affectedEntityId?: string | null; error?: string | null;
}) {
  const { error } = await service.from('support_assistant_action_audit').insert({
    action_id: input.actionId ?? null, user_id: input.actor.id, conversation_id: input.conversationId,
    workflow_id: input.workflowId ?? null, event_type: input.eventType, action_type: input.actionType,
    confirmation_level: input.level, state_version: input.stateVersion ?? null,
    permission_result: input.permissionResult ?? {}, parameters: input.parameters ?? {}, result: input.result ?? null,
    affected_entity_type: input.affectedEntityType ?? null, affected_entity_id: input.affectedEntityId ?? null,
    sanitized_error: input.error ?? null,
  });
  if (error) throw error;
}

async function completeAction(service: Client, input: {
  actionId: string; actor: Actor; conversationId: string; workflowId?: string | null;
  actionType: string; level: number; stateVersion?: number | null; permissionResult: Json;
  result: Json; affectedEntityType?: string | null; affectedEntityId?: string | null;
}) {
  const { error } = await service.from('support_assistant_actions').update({
    status: 'SUCCEEDED', result: input.result, affected_entity_type: input.affectedEntityType ?? null,
    affected_entity_id: input.affectedEntityId ?? null, completed_at: new Date().toISOString(),
  }).eq('action_id', input.actionId).eq('user_id', input.actor.id).eq('status', 'RUNNING');
  if (error) throw error;
  await audit(service, {
    actionId: input.actionId, actor: input.actor, conversationId: input.conversationId,
    workflowId: input.workflowId, eventType: 'ACTION_EXECUTED', actionType: input.actionType,
    level: input.level, stateVersion: input.stateVersion, permissionResult: input.permissionResult,
    result: input.result, affectedEntityType: input.affectedEntityType, affectedEntityId: input.affectedEntityId,
  });
}

async function failAction(service: Client, actionId: string | null, error: string) {
  if (!actionId) return;
  await service.from('support_assistant_actions').update({
    status: 'FAILED', sanitized_error: error, completed_at: new Date().toISOString(),
  }).eq('action_id', actionId).eq('status', 'RUNNING');
}

async function consumeConfirmation(service: Client, input: {
  token: string; actor: Actor; workflowId: string; actionType: string; stateVersion: number; parameters: Json;
}) {
  const { data, error } = await service.rpc('support_consume_assistant_confirmation', {
    p_token_hash: await hash(input.token), p_user_id: input.actor.id, p_workflow_id: input.workflowId,
    p_action_type: input.actionType, p_state_version: input.stateVersion,
    p_parameters_hash: await hash({ action: input.actionType, parameters: input.parameters }),
  });
  if (error || data !== true) throw new Error('CONFIRMATION_REQUIRED');
}

function publicWorkflow(row: Json | null) {
  if (!row) return null;
  const history = Array.isArray(row.state_history) ? row.state_history : [];
  const state = object(row.state_json);
  const configurator = object(state.configurator);
  const hasMeaningfulChoices = history.length > 0
    || (Array.isArray(configurator.machineConfigs) && configurator.machineConfigs.length > 0)
    || Boolean(configurator.date || configurator.deliveryMethod || state.dealer || state.contact || state.quoteKind);
  return {
    id: row.id, conversation_id: row.conversation_id, state: row.state_json,
    state_version: row.state_version, status: row.status, dealer_account_id: row.dealer_account_id,
    dealer_number: row.dealer_number, dealer_contact_id: row.dealer_contact_id, lead_id: row.lead_id,
    configuration_id: row.configuration_id, quote_number: row.quote_number,
    pricing_snapshot: row.pricing_snapshot, email_draft: row.email_draft,
    last_calculated_at: row.last_calculated_at, updated_at: row.updated_at,
    can_go_back: ['DRAFT', 'READY'].includes(String(row.status)) && history.length > 0,
    has_meaningful_choices: hasMeaningfulChoices,
  };
}

function canChangeTimanSeller(actor: Actor): boolean {
  return actor.portal_role === 'timan_backend' || actor.portal_role === 'timan_seller';
}

async function loadTimanSalesContext(service: Client, dealer: DealerSalesAssignment) {
  const { data: timanAccount, error: accountError } = await service.from('dealer_accounts')
    .select('id').eq('account_number', '100').eq('is_deleted', false).limit(1).maybeSingle();
  if (accountError) throw accountError;
  if (!timanAccount?.id) throw new Error('TIMAN_ACCOUNT_100_NOT_FOUND');
  const [{ data: contacts, error: contactError }, { data: users, error: userError }] = await Promise.all([
    service.from('dealer_contacts')
      .select('id, contact_area, name, email, phone')
      .eq('dealer_account_id', timanAccount.id)
      .eq('contact_area', 'sales'),
    service.from('app_users')
      .select('id, email, display_name, initials, portal_role, status, approved')
      .eq('dealer_number', '100')
      .eq('approved', true)
      .eq('is_active', true),
  ]);
  if (contactError) throw contactError;
  if (userError) throw userError;
  const sellers = buildCanonicalTimanSalesContacts(contacts || [], users || []);
  if (!sellers.length) throw new Error('TIMAN_SALES_CONTACT_NOT_FOUND');
  return { sellers, resolution: resolveCanonicalTimanQuoteSeller(dealer, sellers) };
}

async function reportClientResult(service: Client, userClient: Client, actor: Actor, payload: Json) {
  const executionActionId = uuid(payload.execution_action_id)!;
  const { data: action, error } = await service.from('support_assistant_actions').select('*')
    .eq('action_id', executionActionId).eq('user_id', actor.id).eq('status', 'RUNNING').maybeSingle();
  if (error || !action) throw new Error('ACTION_NOT_RUNNING');
  const success = payload.success === true;
  const result = object(payload.result);
  const entityId = uuid(result.entity_id, false);
  const expectedType = action.action_type === 'create_or_link_lead' ? 'lead' : 'configuration';
  if (success && !entityId) throw new Error('AFFECTED_ENTITY_REQUIRED');
  if (success && entityId) {
    const table = expectedType === 'lead' ? 'crm_leads' : 'configurations';
    const { data: visible } = await userClient.from(table).select('id').eq('id', entityId).maybeSingle();
    if (!visible) throw new Error('AFFECTED_ENTITY_NOT_VISIBLE');
  }
  const workflowId = action.workflow_id as string | null;
  const workflow = workflowId ? await loadWorkflow(service, actor, workflowId, action.conversation_id as string) : null;
  if (success && workflow) {
    const patch: Json = {};
    if (action.action_type === 'create_quote_draft') {
      patch.configuration_id = entityId; patch.quote_number = text(result.quote_number, 100) || null; patch.status = 'QUOTE_CREATED';
    } else if (action.action_type === 'create_or_link_lead') patch.lead_id = entityId;
    else if (action.action_type === 'generate_quote_pdf') patch.status = 'PDF_GENERATED';
    else if (action.action_type === 'send_quote_email') { patch.status = 'EMAIL_SENT'; patch.completed_at = new Date().toISOString(); }
    if (Object.keys(patch).length) await service.from('support_assistant_workflows').update(patch).eq('id', workflow.id).eq('user_id', actor.id);
  }
  if (success) {
    await completeAction(service, {
      actionId: executionActionId, actor, conversationId: action.conversation_id as string, workflowId,
      actionType: action.action_type as string, level: Number(action.confirmation_level),
      stateVersion: action.state_version as number | null, permissionResult: object(action.permission_result),
      result, affectedEntityType: expectedType, affectedEntityId: entityId,
    });
  } else {
    const errorText = text(payload.error, 500) || 'CLIENT_EXECUTION_FAILED';
    await failAction(service, executionActionId, errorText);
    await audit(service, {
      actionId: executionActionId, actor, conversationId: action.conversation_id as string, workflowId,
      eventType: 'ACTION_FAILED', actionType: action.action_type as string,
      level: Number(action.confirmation_level), stateVersion: action.state_version as number | null,
      permissionResult: object(action.permission_result), error: errorText,
    });
  }
  const refreshedWorkflow = workflowId
    ? await loadWorkflow(service, actor, workflowId, action.conversation_id as string)
    : null;
  return { ok: true, workflow: publicWorkflow(refreshedWorkflow) };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  let service: Client | null = null;
  let actionId: string | null = null;
  let actor: Actor | null = null;
  let conversationId = '';
  let actionType = '';
  let definition: ActionDefinition | null = null;
  let workflowId: string | null = null;
  let expectedStateVersion: number | null = null;
  let permissionResult: Json = {};
  try {
    if (Number(request.headers.get('content-length') || 0) > MAX_JSON_BYTES) return json({ error: 'PAYLOAD_TOO_LARGE' }, 413);
    const payload = object(await request.json());
    const auth = await authorize(request);
    service = auth.service;
    actor = auth.actor;
    if (text(payload.action) === 'report_action_result') return json(await reportClientResult(service, auth.userClient, actor, payload));
    actionType = text(payload.action, 100);
    definition = ACTIONS[actionType] || null;
    if (!definition) return json({ error: 'UNKNOWN_ACTION' }, 400);
    conversationId = uuid(payload.conversation_id)!;
    workflowId = uuid(payload.workflow_id, false);
    expectedStateVersion = payload.expected_state_version == null ? null : integer(payload.expected_state_version);
    const parameters = object(payload.parameters);
    const idempotencyKey = text(payload.idempotency_key, 200);
    actionId = uuid(payload.action_id)!;
    if (!idempotencyKey) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
    if (JSON.stringify(parameters).length > MAX_JSON_BYTES) throw new Error('PAYLOAD_TOO_LARGE');
    await ensureConversation(service, actor, conversationId);
    const allowed = permissionAllowed(actor, definition.permission);
    permissionResult = { support_access: true, business_permission: definition.permission, allowed, portal_role: actor.portal_role };
    if (!allowed) throw new Error('PERMISSION_DENIED');

    if (actionType === 'request_confirmation') {
      const targetAction = text(parameters.target_action, 100);
      const targetDefinition = ACTIONS[targetAction];
      if (!targetDefinition || targetDefinition.level < 2) throw new Error('INVALID_CONFIRMATION_TARGET');
      if (!permissionAllowed(actor, targetDefinition.permission)) throw new Error('PERMISSION_DENIED');
      if (!workflowId || expectedStateVersion == null) throw new Error('WORKFLOW_VERSION_REQUIRED');
      const workflow = await loadWorkflow(service, actor, workflowId, conversationId);
      if (!workflow || workflow.state_version !== expectedStateVersion) throw new Error('STALE_WORKFLOW');
      const targetParameters = object(parameters.target_parameters);
      const requestHash = await hash({
        action: actionType, workflow_id: workflowId, state_version: expectedStateVersion,
        target_action: targetAction, target_parameters: targetParameters,
      });
      const { data: claimRows, error: claimError } = await service.rpc('support_claim_assistant_action', {
        p_action_id: actionId, p_idempotency_key: idempotencyKey, p_user_id: actor.id,
        p_conversation_id: conversationId, p_workflow_id: workflowId, p_action_type: actionType,
        p_confirmation_level: definition.level, p_expected_state_version: expectedStateVersion,
        p_request_hash: requestHash, p_permission_result: permissionResult,
      });
      if (claimError) throw claimError;
      const claim = claimRows?.[0];
      if (claim?.decision === 'DUPLICATE') {
        return json({ duplicate: true, action_id: claim.existing_action_id, status: claim.existing_status, result: claim.existing_result });
      }
      if (claim?.decision === 'CONFLICT') return json({ error: 'IDEMPOTENCY_KEY_REUSED' }, 409);
      if (claim?.decision === 'STALE') return json({ error: 'STALE_WORKFLOW', ...object(claim.existing_result) }, 409);
      if (claim?.decision !== 'CLAIMED') return json({ error: 'WORKFLOW_NOT_FOUND' }, 404);
      const token = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
      const parametersHash = await hash({ action: targetAction, parameters: targetParameters });
      const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString();
      const { error } = await service.from('support_assistant_confirmations').insert({
        token_hash: await hash(token), user_id: actor.id, workflow_id: workflowId, action_type: targetAction,
        confirmation_level: targetDefinition.level, state_version: expectedStateVersion,
        parameters_hash: parametersHash, expires_at: expiresAt,
      });
      if (error) throw error;
      await audit(service, {
        actionId, actor, conversationId, workflowId, eventType: 'USER_CONFIRMATION', actionType: targetAction,
        level: targetDefinition.level, stateVersion: expectedStateVersion, permissionResult,
        parameters: { parameters_hash: parametersHash }, result: { expires_at: expiresAt },
      });
      await completeAction(service, {
        actionId, actor, conversationId, workflowId, actionType, level: definition.level,
        stateVersion: expectedStateVersion, permissionResult,
        result: { target_action: targetAction, expires_at: expiresAt },
      });
      return json({ confirmation_token: token, expires_at: expiresAt, state_version: expectedStateVersion });
    }

    const requestHash = await hash({ action: actionType, workflow_id: workflowId, state_version: expectedStateVersion, parameters });
    const { data: claimRows, error: claimError } = await service.rpc('support_claim_assistant_action', {
      p_action_id: actionId, p_idempotency_key: idempotencyKey, p_user_id: actor.id,
      p_conversation_id: conversationId, p_workflow_id: workflowId, p_action_type: actionType,
      p_confirmation_level: definition.level, p_expected_state_version: expectedStateVersion,
      p_request_hash: requestHash, p_permission_result: permissionResult,
    });
    if (claimError) throw claimError;
    const claim = claimRows?.[0];
    if (claim?.decision === 'DUPLICATE') return json({ duplicate: true, action_id: claim.existing_action_id, status: claim.existing_status, result: claim.existing_result });
    if (claim?.decision === 'CONFLICT') return json({ error: 'IDEMPOTENCY_KEY_REUSED' }, 409);
    if (claim?.decision === 'STALE') return json({ error: 'STALE_WORKFLOW', ...object(claim.existing_result) }, 409);
    if (claim?.decision !== 'CLAIMED') return json({ error: 'WORKFLOW_NOT_FOUND' }, 404);
    await audit(service, {
      actionId, actor, conversationId, workflowId, eventType: 'USER_REQUEST', actionType,
      level: definition.level, stateVersion: expectedStateVersion, permissionResult,
      parameters: { request_hash: requestHash },
    });
    if (parameters.ai_interpretation) await audit(service, {
      actionId, actor, conversationId, workflowId, eventType: 'AI_INTERPRETATION', actionType,
      level: definition.level, stateVersion: expectedStateVersion, permissionResult,
      parameters: { interpretation: text(parameters.ai_interpretation, 1_000) },
    });
    if (definition.level >= 2) {
      if (!workflowId || expectedStateVersion == null) throw new Error('WORKFLOW_VERSION_REQUIRED');
      await consumeConfirmation(service, {
        token: text(payload.confirmation_token, 500), actor, workflowId, actionType,
        stateVersion: expectedStateVersion, parameters,
      });
    }

    if (actionType === 'load_workflow') {
      const workflow = await loadWorkflow(service, actor, workflowId, conversationId);
      const result = { workflow: publicWorkflow(workflow) };
      await completeAction(service, { actionId, actor, conversationId, workflowId, actionType, level: 0, permissionResult, result });
      return json(result);
    }
    if (actionType === 'create_configuration_draft') {
      const state = object(parameters.state);
      const existing = await loadWorkflow(service, actor, null, conversationId);
      if (existing) {
        const result = { workflow: publicWorkflow(existing), resumed: true };
        await completeAction(service, { actionId, actor, conversationId, workflowId: existing.id, actionType, level: 1, stateVersion: existing.state_version, permissionResult, result });
        return json(result);
      }
      const dealerResult = actor.dealer_number
        ? await auth.userClient.from('dealer_accounts').select('id, account_number, company_name, country, city, customer_type, customer_type_label, dealer_type, assigned_seller_id, assigned_seller_initials, assigned_seller_name, assigned_seller_email').eq('account_number', actor.dealer_number).maybeSingle()
        : { data: null, error: null };
      const dealer = dealerResult.data;
      const {
        dealer: _untrustedDealer,
        contact: _untrustedContact,
        timanSeller: _untrustedTimanSeller,
        canChangeTimanSeller: _untrustedCanChangeTimanSeller,
        ...safeState
      } = state;
      const initialState = dealer ? { ...safeState, dealer } : safeState;
      const { data: workflow, error } = await service.from('support_assistant_workflows').insert({
        conversation_id: conversationId, user_id: actor.id, state_json: initialState,
        state_hash: await hash(initialState), status: 'DRAFT',
        dealer_account_id: dealer?.id || null, dealer_number: dealer?.account_number || actor.dealer_number || null,
      }).select('*').single();
      if (error) throw error;
      workflowId = workflow.id;
      const result = { workflow: publicWorkflow(workflow) };
      await completeAction(service, { actionId, actor, conversationId, workflowId, actionType, level: 1, stateVersion: workflow.state_version, permissionResult, result });
      return json(result);
    }

    const workflow = await loadWorkflow(service, actor, workflowId, conversationId);
    if (!workflow && !['find_dealer', 'get_machine_configuration_options'].includes(actionType)) throw new Error('WORKFLOW_NOT_FOUND');
    if ([
      'create_quote_draft', 'create_or_link_lead', 'generate_quote_pdf', 'prepare_quote_email',
      'send_quote_email', 'handoff_to_sales', 'handoff_to_service',
    ].includes(actionType) && !text(object(object(workflow?.state_json).timanSeller).id, 64)) {
      throw new Error('TIMAN_SELLER_REQUIRED');
    }

    if (actionType === 'set_configuration_option') {
      const state = object(parameters.state);
      if (Number(state.manualDealerDiscountPct || 0) > 0 && !discountAllowed(actor)) throw new Error('EXTRA_DISCOUNT_DENIED');
      const stateDealer = object(state.dealer);
      const stateContact = object(state.contact);
      const stateSeller = object(state.timanSeller);
      const stateDealerId = text(stateDealer.id, 64);
      const stateContactId = text(stateContact.id, 64);
      const stateSellerId = text(stateSeller.id, 64);
      if (stateDealerId) {
        if (!UUID.test(stateDealerId)) throw new Error('INVALID_DEALER');
        const { data: visibleDealer, error: dealerError } = await auth.userClient.from('dealer_accounts')
          .select('id').eq('id', stateDealerId).maybeSingle();
        if (dealerError || !visibleDealer) throw new Error('DEALER_OUT_OF_SCOPE');
      }
      if (stateContactId) {
        if (!UUID.test(stateContactId) || !stateDealerId) throw new Error('INVALID_CONTACT');
        const { data: visibleContact, error: contactError } = await auth.userClient.from('dealer_contacts')
          .select('id, dealer_account_id, contact_area').eq('id', stateContactId).eq('dealer_account_id', stateDealerId).maybeSingle();
        if (contactError || !visibleContact || !['director', 'sales'].includes(String(visibleContact.contact_area))) {
          throw new Error('CONTACT_OUT_OF_SCOPE');
        }
      }
      if (stateSellerId) {
        if (!UUID.test(stateSellerId) || !stateDealerId) throw new Error('INVALID_TIMAN_SELLER');
        const { data: dealerForSeller, error: sellerDealerError } = await auth.userClient.from('dealer_accounts')
          .select('country, assigned_seller_id, assigned_seller_email, assigned_seller_initials')
          .eq('id', stateDealerId).maybeSingle();
        if (sellerDealerError || !dealerForSeller) throw new Error('DEALER_OUT_OF_SCOPE');
        const context = await loadTimanSalesContext(service, dealerForSeller);
        const forced = resolveCanonicalTimanQuoteSeller({ ...dealerForSeller, assigned_seller_id: null, assigned_seller_email: null, assigned_seller_initials: null }, context.sellers);
        const allowed = [context.resolution.seller, ...forced.choices]
          .filter((seller): seller is TimanQuoteSeller => Boolean(seller));
        const selected = allowed.find((seller) => (
          seller.id === stateSellerId
          && seller.contact_id === text(stateSeller.contact_id, 64)
          && seller.email === text(stateSeller.email, 320).toLowerCase()
        ));
        if (!selected || (!canChangeTimanSeller(actor) && selected.id !== context.resolution.seller?.id)) {
          throw new Error('TIMAN_SELLER_OUT_OF_SCOPE');
        }
        state.timanSeller = selected;
        state.canChangeTimanSeller = canChangeTimanSeller(actor);
      }
      const history = Array.isArray(workflow.state_history) ? workflow.state_history : [];
      const nextHistory = [...history.slice(-49), workflow.state_json];
      const { data: updated, error } = await service.from('support_assistant_workflows').update({
        state_json: state, state_hash: await hash(state), state_version: expectedStateVersion! + 1,
        state_history: nextHistory,
        status: 'DRAFT', pricing_snapshot: null, last_calculated_at: null,
        dealer_account_id: stateDealerId || null,
        dealer_number: text(stateDealer.account_number, 100) || null,
        dealer_contact_id: stateContactId || null,
      }).eq('id', workflowId!).eq('user_id', actor.id).eq('state_version', expectedStateVersion!).select('*').maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error('STALE_WORKFLOW');
      await service.from('support_assistant_confirmations').update({ invalidated_at: new Date().toISOString() })
        .eq('workflow_id', workflowId!).is('consumed_at', null).is('invalidated_at', null);
      const result = { workflow: publicWorkflow(updated) };
      await completeAction(service, { actionId, actor, conversationId, workflowId, actionType, level: 1, stateVersion: updated.state_version, permissionResult, result });
      return json(result);
    }
    if (actionType === 'navigate_workflow_back') {
      if (!['DRAFT', 'READY'].includes(String(workflow.status))) throw new Error('WORKFLOW_BACK_NOT_ALLOWED');
      const history = Array.isArray(workflow.state_history) ? workflow.state_history : [];
      if (!history.length) throw new Error('WORKFLOW_HISTORY_EMPTY');
      const restoredState = object(history[history.length - 1]);
      const restoredDealer = object(restoredState.dealer);
      const restoredContact = object(restoredState.contact);
      const restoredDealerId = text(restoredDealer.id, 64);
      const restoredContactId = text(restoredContact.id, 64);
      const { data: updated, error } = await service.from('support_assistant_workflows').update({
        state_json: restoredState,
        state_hash: await hash(restoredState),
        state_history: history.slice(0, -1),
        state_version: expectedStateVersion! + 1,
        status: 'DRAFT',
        pricing_snapshot: null,
        last_calculated_at: null,
        dealer_account_id: restoredDealerId || null,
        dealer_number: text(restoredDealer.account_number, 100) || null,
        dealer_contact_id: restoredContactId || null,
      }).eq('id', workflowId!).eq('user_id', actor.id).eq('state_version', expectedStateVersion!).select('*').maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error('STALE_WORKFLOW');
      await service.from('support_assistant_confirmations').update({ invalidated_at: new Date().toISOString() })
        .eq('workflow_id', workflowId!).is('consumed_at', null).is('invalidated_at', null);
      const result = { workflow: publicWorkflow(updated) };
      await completeAction(service, { actionId, actor, conversationId, workflowId, actionType, level: 1, stateVersion: updated.state_version, permissionResult, result });
      return json(result);
    }
    if (actionType === 'abandon_workflow') {
      if (['EMAIL_SENT', 'HANDED_OFF', 'ABANDONED', 'FAILED'].includes(String(workflow.status))) {
        throw new Error('WORKFLOW_ALREADY_TERMINAL');
      }
      const completedAt = new Date().toISOString();
      const { data: updated, error } = await service.from('support_assistant_workflows').update({
        status: 'ABANDONED',
        state_version: expectedStateVersion! + 1,
        completed_at: completedAt,
      }).eq('id', workflowId!).eq('user_id', actor.id).eq('state_version', expectedStateVersion!).select('*').maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error('STALE_WORKFLOW');
      await service.from('support_assistant_confirmations').update({ invalidated_at: completedAt })
        .eq('workflow_id', workflowId!).is('consumed_at', null).is('invalidated_at', null);
      const result = {
        workflow: publicWorkflow(updated),
        abandoned: true,
        preserved_entities: {
          configuration_id: workflow.configuration_id || null,
          lead_id: workflow.lead_id || null,
          quote_number: workflow.quote_number || null,
        },
      };
      await completeAction(service, { actionId, actor, conversationId, workflowId, actionType, level: 2, stateVersion: updated.state_version, permissionResult, result });
      return json(result);
    }
    if (actionType === 'get_machine_configuration_options') {
      let query = auth.userClient.from('price_list_published')
        .select('id, item_number, item_text_da, item_text_en, item_text_de, identity_aliases, price_dkk, price_eur, price_sek, published_at')
        .order('item_number').limit(500);
      const search = text(parameters.search, 100);
      if (search) query = query.ilike('item_text_da', `%${search}%`);
      const { data, error } = await query;
      if (error) throw error;
      const options = priceAllowed(actor) ? data : (data || []).map(({ price_dkk: _d, price_eur: _e, price_sek: _s, ...row }) => row);
      const result = { options };
      await completeAction(service, { actionId, actor, conversationId, actionType, level: 0, permissionResult, result });
      return json(result);
    }
    if (actionType === 'find_dealer') {
      const search = text(parameters.search, 120);
      if (search.length < 2) throw new Error('SEARCH_TOO_SHORT');
      const { data, error } = await auth.userClient.from('dealer_accounts')
        .select('id, account_number, company_name, country, city, primary_contact_name, primary_contact_email, primary_contact_phone, sales_contact_name, sales_contact_email, sales_contact_phone, customer_type, customer_type_label, dealer_type, assigned_seller_id, assigned_seller_initials, assigned_seller_name, assigned_seller_email, is_blocked, is_deleted')
        .or(`company_name.ilike.%${search.replace(/[,%()]/g, '')}%,account_number.ilike.%${search.replace(/[,%()]/g, '')}%`)
        .eq('is_deleted', false).limit(20);
      if (error) throw error;
      const result = { dealers: data || [] };
      await completeAction(service, { actionId, actor, conversationId, workflowId, actionType, level: 0, permissionResult, result });
      return json(result);
    }
    if (actionType === 'find_partner_contact') {
      const dealerId = uuid(parameters.dealer_account_id)!;
      const { data: visibleDealer } = await auth.userClient.from('dealer_accounts').select('id').eq('id', dealerId).maybeSingle();
      if (!visibleDealer) throw new Error('DEALER_OUT_OF_SCOPE');
      const { data, error } = await auth.userClient.from('dealer_contacts')
        .select('id, dealer_account_id, contact_area, role_title, name, email, phone, is_primary')
        .eq('dealer_account_id', dealerId)
        .in('contact_area', ['director', 'sales'])
        .order('is_primary', { ascending: false }).order('created_at');
      if (error) throw error;
      const result = { contacts: data || [] };
      await completeAction(service, { actionId, actor, conversationId, workflowId, actionType, level: 0, permissionResult, result });
      return json(result);
    }
    if (actionType === 'resolve_timan_sales_contact') {
      const dealerId = uuid(parameters.dealer_account_id)!;
      const { data: dealer, error: dealerError } = await auth.userClient.from('dealer_accounts')
        .select('id, country, assigned_seller_id, assigned_seller_email, assigned_seller_initials')
        .eq('id', dealerId).maybeSingle();
      if (dealerError || !dealer) throw new Error('DEALER_OUT_OF_SCOPE');
      const context = await loadTimanSalesContext(service, dealer);
      const canChange = canChangeTimanSeller(actor);
      const forceChoices = parameters.force_choices === true;
      if (forceChoices && !canChange) throw new Error('TIMAN_SELLER_CHANGE_DENIED');
      const manual = forceChoices
        ? resolveCanonicalTimanQuoteSeller({ ...dealer, assigned_seller_id: null, assigned_seller_email: null, assigned_seller_initials: null }, context.sellers)
        : context.resolution;
      const result = {
        seller: forceChoices ? null : manual.seller,
        seller_choices: manual.choices,
        resolution_reason: manual.reason,
        can_change_seller: canChange,
      };
      await completeAction(service, { actionId, actor, conversationId, workflowId, actionType, level: 0, permissionResult, result });
      return json(result);
    }
    if (actionType === 'inspect_lead') {
      const leadId = uuid(parameters.lead_id)!;
      const { data, error } = await auth.userClient.from('crm_leads').select('*').eq('id', leadId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('LEAD_NOT_FOUND_OR_OUT_OF_SCOPE');
      const result = { lead: data };
      await completeAction(service, { actionId, actor, conversationId, workflowId, actionType, level: 0, permissionResult, result });
      return json(result);
    }
    if (actionType === 'calculate_quote_preview' || actionType === 'preview_quote') {
      const preview = object(parameters.preview);
      const pricingSnapshot = object(parameters.pricing_snapshot);
      const calculatedAt = new Date().toISOString();
      const { data: updated, error } = await service.from('support_assistant_workflows').update({
        pricing_snapshot: pricingSnapshot, last_calculated_at: calculatedAt, status: 'READY',
      }).eq('id', workflowId!).eq('user_id', actor.id).eq('state_version', expectedStateVersion!).select('*').maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error('STALE_WORKFLOW');
      const result = { preview, workflow: publicWorkflow(updated) };
      await audit(service, { actionId, actor, conversationId, workflowId, eventType: 'SYSTEM_CALCULATION', actionType, level: 0, stateVersion: expectedStateVersion, permissionResult, result: { pricing_hash: await hash(pricingSnapshot), calculated_at: calculatedAt } });
      await completeAction(service, { actionId, actor, conversationId, workflowId, actionType, level: 0, stateVersion: expectedStateVersion, permissionResult, result });
      return json(result);
    }
    if (actionType === 'prepare_quote_email') {
      const recipients = Array.isArray(parameters.to) ? parameters.to.map((item) => text(item, 320)).filter(Boolean) : [];
      if (!recipients.length || recipients.some((address) => !EMAIL.test(address))) throw new Error('INVALID_RECIPIENT');
      const emailDraft = {
        to: [...new Set(recipients)],
        cc: Array.isArray(parameters.cc) ? [...new Set(parameters.cc.map((item) => text(item, 320)).filter((item) => EMAIL.test(item)))] : [],
        subject: text(parameters.subject, 300), body: text(parameters.body, 10_000),
        pdf_path: text(parameters.pdf_path, 1_000) || null,
      };
      const { data: updated, error } = await service.from('support_assistant_workflows').update({
        email_draft: emailDraft, status: 'EMAIL_PREPARED',
      }).eq('id', workflowId!).eq('user_id', actor.id).eq('state_version', expectedStateVersion!).select('*').maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error('STALE_WORKFLOW');
      const result = { email: emailDraft, workflow: publicWorkflow(updated) };
      await completeAction(service, { actionId, actor, conversationId, workflowId, actionType, level: 1, stateVersion: expectedStateVersion, permissionResult, result });
      return json(result);
    }
    if (actionType === 'handoff_to_sales' || actionType === 'handoff_to_service') {
      const target = actionType === 'handoff_to_sales' ? 'SALES' : 'TECHNICAL_SERVICE';
      const summary = text(parameters.summary, 5_000);
      const reasonCode = text(parameters.reason_code, 100);
      if (!summary || !reasonCode) throw new Error('HANDOFF_CONTEXT_REQUIRED');
      // The production portal currently has no canonical service_tickets table.
      // Keep the handoff in the Phase 7 queue instead of creating a parallel case model.
      const serviceTicketId: string | null = null;
      const { data: handoff, error } = await service.from('support_assistant_handoffs').insert({
        action_id: actionId, workflow_id: workflowId, conversation_id: conversationId,
        requested_by_user_id: actor.id, target, reason_code: reasonCode, summary,
        authorized_context: object(parameters.authorized_context), configuration_id: workflow?.configuration_id || null,
        lead_id: workflow?.lead_id || null, service_ticket_id: serviceTicketId,
      }).select('*').single();
      if (error) throw error;
      await service.from('support_assistant_workflows').update({ status: 'HANDED_OFF' }).eq('id', workflowId!).eq('user_id', actor.id);
      const result = { handoff_id: handoff.id, target, service_ticket_id: serviceTicketId };
      await completeAction(service, { actionId, actor, conversationId, workflowId, actionType, level: 2, stateVersion: expectedStateVersion, permissionResult, result, affectedEntityType: serviceTicketId ? 'service_ticket' : 'assistant_handoff', affectedEntityId: serviceTicketId || handoff.id });
      return json(result);
    }
    if (definition.clientExecution) return json({ execution_required: true, execution_action_id: actionId, execution_kind: definition.clientExecution, workflow: publicWorkflow(workflow) }, 202);
    throw new Error('ACTION_NOT_IMPLEMENTED');
  } catch (reason) {
    const code = sanitizedError(reason);
    if (service) await failAction(service, actionId, code);
    if (service && actor && conversationId && definition) {
      try {
        await audit(service, { actionId, actor, conversationId, workflowId, eventType: 'ACTION_FAILED', actionType, level: definition.level, stateVersion: expectedStateVersion, permissionResult, error: code });
      } catch { /* Telemetry never replaces the original action error. */ }
    }
    if (code === 'UNAUTHORIZED') return json({ error: code }, 401);
    if (code === 'FORBIDDEN' || code === 'PERMISSION_DENIED' || code.endsWith('_DENIED') || code.endsWith('_OUT_OF_SCOPE')) return json({ error: code }, 403);
    if (code === 'STALE_WORKFLOW' || code === 'IDEMPOTENCY_KEY_REUSED') return json({ error: code }, 409);
    if (code === 'CONFIRMATION_REQUIRED') return json({ error: code }, 412);
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    return json({ error: code }, 400);
  }
});
