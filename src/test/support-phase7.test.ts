import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/publishedProductMaster', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/publishedProductMaster')>(),
  isProductActive: () => true,
}));
import {
  applyAssistantConfiguratorCommand,
  createAssistantConfiguratorDraft,
  nextAssistantConfiguratorPrompt,
  resolveAssistantMachine,
} from '@/lib/assistantConfiguratorWorkflow';

const migration = readFileSync(resolve('supabase/migrations/20260927190156_support_assistant_actions_handoff.sql'), 'utf8');
const endpoint = readFileSync(resolve('supabase/functions/support-actions/index.ts'), 'utf8');
const canonicalActions = readFileSync(resolve('src/lib/assistantCanonicalActions.ts'), 'utf8');
const actionService = readFileSync(resolve('src/lib/assistantActionService.ts'), 'utf8');
const configuratorHook = readFileSync(resolve('src/hooks/useConfigurator.ts'), 'utf8');

describe('Phase 7 conversational configuration', () => {
  it('resolves canonical Timan machines without inventing a product', () => {
    expect(resolveAssistantMachine('Lav tilbud på 2 Timan 3330')).toBe('Timan 3330');
    expect(resolveAssistantMachine('quote for RC-1000S')).toBe('RC-1000S');
    expect(resolveAssistantMachine('imaginary moon tractor')).toBeNull();
  });

  it('starts a quote in canonical Configurator state and asks for missing choices', () => {
    const draft = createAssistantConfiguratorDraft('Lav tilbud på 2 Timan 3330 med T2', 'da');
    expect(draft.configurator.machineConfigs[0]).toMatchObject({ type: 'Timan 3330', qty: 2 });
    expect(draft.configurator.flowType).toBe('quote');
    const prompt = nextAssistantConfiguratorPrompt(draft, 'da');
    expect(prompt.ready).toBe(false);
    expect(prompt.state.pendingField).toBe('accessory:mentioned');
    expect(prompt.card?.title).toBe('T2');
    expect(draft.configurator.machineConfigs[0].qty).toBe(2);
  });

  it('does not interpret unrelated numbers in free text as machine quantity', () => {
    const draft = createAssistantConfiguratorDraft('Create a quote for a Timan 3330 with T2. PHASE 7 QA TEST.', 'en');
    expect(draft.configurator.machineConfigs[0].qty).toBe(1);
  });

  it('applies button choices through the shared domain function', () => {
    const draft = createAssistantConfiguratorDraft('Tilbud RC-1000S', 'da');
    const prompt = nextAssistantConfiguratorPrompt(draft, 'da');
    const choice = prompt.card?.choices?.[0];
    expect(choice).toBeTruthy();
    const next = applyAssistantConfiguratorCommand(prompt.state, choice!.command);
    expect(next.configurator.individualUnitConfigs.m0_1.acc.length).toBeGreaterThan(0);
  });

  it('retains every mandatory choice while advancing a 3330 workflow', () => {
    let draft = createAssistantConfiguratorDraft('Create a quote for a Timan 3330 with T2', 'en');
    const t2Prompt = nextAssistantConfiguratorPrompt(draft, 'en');
    expect(t2Prompt.card?.choices).toHaveLength(2);
    const t2Choice = t2Prompt.card?.choices?.find((choice) => choice.command.value === '0::720125');
    expect(t2Choice).toBeTruthy();
    draft = applyAssistantConfiguratorCommand(t2Prompt.state, t2Choice!.command);
    const expectedGroups = ['aircon', 'doors', 'seats', 'roof'];

    for (const group of expectedGroups) {
      const prompt = nextAssistantConfiguratorPrompt(draft, 'en');
      expect(prompt.state.pendingField).toBe(`accessory:${group}`);
      const choice = prompt.card?.choices?.[0];
      expect(choice).toBeTruthy();
      draft = applyAssistantConfiguratorCommand(prompt.state, choice!.command);
    }

    const selected = draft.configurator.individualUnitConfigs.m0_1.acc;
    expect(selected).toEqual(expect.arrayContaining(['712050', '712146', '712141', '712142', '720125']));
    expect(nextAssistantConfiguratorPrompt(draft, 'en').state.pendingField).toBe('delivery_date');
  });

  it('keeps the normal Configurator on the same domain functions', () => {
    for (const fn of ['setConfiguratorMachineQuantity', 'setConfiguratorMode', 'toggleConfiguratorAccessory']) {
      expect(configuratorHook).toContain(fn);
    }
  });
});

describe('Phase 7 protected actions and human handoff', () => {
  it('contains no order submission action', () => {
    const actionMap = endpoint.slice(endpoint.indexOf('const ACTIONS'), endpoint.indexOf('function json'));
    expect(actionMap).not.toMatch(/submit_order|send_order|create_order|markAsOrderSubmitted/);
    expect(canonicalActions).not.toContain('getOrderWebhookUrl');
    expect(canonicalActions).not.toContain('markAsOrderSubmitted');
  });

  it('checks auth, support access and business permission server-side', () => {
    expect(endpoint).toContain('userClient.auth.getUser()');
    expect(endpoint).toContain("userClient.rpc('can_access_support')");
    expect(endpoint).toContain('permissionAllowed(actor, definition.permission)');
    expect(endpoint).toContain("auth.userClient.from('dealer_accounts')");
    expect(endpoint).toContain('DEALER_OUT_OF_SCOPE');
    expect(endpoint).toContain('CONTACT_OUT_OF_SCOPE');
  });

  it('claims every write with an idempotency key and expected workflow version', () => {
    expect(migration).toContain('unique (user_id, idempotency_key)');
    expect(migration).toContain('v_workflow.state_version <> p_expected_state_version');
    expect(endpoint).toContain("p_idempotency_key: idempotencyKey");
    expect(endpoint).toContain("claim?.decision === 'DUPLICATE'");
    expect(migration).toContain('v_existing.request_hash <> p_request_hash');
    expect(endpoint).toContain("claim?.decision === 'CONFLICT'");
    const confirmation = endpoint.slice(endpoint.indexOf("if (actionType === 'request_confirmation')"), endpoint.indexOf('const requestHash = await hash', endpoint.indexOf("if (actionType === 'request_confirmation')") + 1000));
    expect(confirmation).toContain("service.rpc('support_claim_assistant_action'");
  });

  it('binds single-use confirmations to user, action, workflow, version and parameters', () => {
    for (const token of ['token_hash', 'user_id = p_user_id', 'workflow_id = p_workflow_id', 'action_type = p_action_type', 'state_version = p_state_version', 'parameters_hash = p_parameters_hash', 'consumed_at is null', 'expires_at > now()']) {
      expect(migration).toContain(token);
    }
    expect(endpoint).toContain('await consumeConfirmation');
    expect(actionService).toContain('confirmation.duplicate && !confirmation.confirmation_token');
    expect(actionService).toContain('confirmationInput.idempotencyKey}:retry:');
  });

  it('preserves an append-only action audit and separates event kinds', () => {
    expect(migration).toContain('before update or delete on public.support_assistant_action_audit');
    expect(migration).toContain('Assistant action audit is append-only');
    expect(migration).toContain('revoke all on public.support_assistant_action_audit from public, anon, authenticated');
    for (const event of ['USER_REQUEST', 'AI_INTERPRETATION', 'SYSTEM_CALCULATION', 'USER_CONFIRMATION', 'ACTION_EXECUTED', 'ACTION_FAILED']) {
      expect(migration).toContain(event);
    }
  });

  it('uses canonical pricing, persistence, PDF and lead services on the client lease', () => {
    expect(canonicalActions).toContain('calculateConfiguration(state)');
    expect(canonicalActions).toContain('saveConfiguration(');
    expect(canonicalActions).toContain('ensureReferenceNumbers(');
    expect(canonicalActions).toContain('buildConfiguratorPdf(');
    expect(canonicalActions).toContain('createLead(');
    expect(canonicalActions).toContain('getQuoteWebhookUrl()');
    expect(canonicalActions).toContain('initials: input.appUser.initials');
    expect(canonicalActions).toContain('input.appUser.id || null');
  });

  it('requires immediate confirmation before the external quote webhook', () => {
    expect(endpoint).toContain("send_quote_email: { level: 3");
    expect(endpoint).toContain('await consumeConfirmation');
    expect(canonicalActions).toContain("'Idempotency-Key': input.idempotencyKey");
  });

  it('supports sales and Technical & Service handoff without a parallel service-ticket model', () => {
    expect(endpoint).toContain("'TECHNICAL_SERVICE'");
    expect(endpoint).not.toContain("auth.userClient.from('service_tickets').insert");
    expect(endpoint).toContain("service.from('support_assistant_handoffs').insert");
    expect(migration).toContain('service_ticket_id uuid');
    expect(migration).not.toContain('references public.service_tickets');
  });

  it('keeps action tables inaccessible to browser clients and exposes only the protected function', () => {
    for (const table of ['support_assistant_workflows', 'support_assistant_confirmations', 'support_assistant_actions', 'support_assistant_action_audit', 'support_assistant_handoffs']) {
      expect(migration).toContain(`revoke all on public.${table} from public, anon, authenticated`);
    }
    expect(migration).toContain('grant all on public.support_assistant_actions to service_role');
  });
});
