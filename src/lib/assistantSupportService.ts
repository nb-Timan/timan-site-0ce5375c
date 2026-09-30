import type { SessionUser } from '@/context/AppUserContext';
import { formatMoney } from '@/data/machines';
import {
  confirmAssistantAction,
  invokeAssistantAction,
  reportAssistantActionResult,
  type AssistantActionResponse,
  type AssistantServerWorkflow,
} from '@/lib/assistantActionService';
import {
  applyAssistantCustomer,
  createAssistantLead,
  createAssistantQuote,
  generateAssistantQuotePdf,
  prepareAssistantQuoteEmail,
  sendAssistantQuoteEmail,
  type AssistantContact,
  type AssistantDealer,
} from '@/lib/assistantCanonicalActions';
import {
  applyAssistantConfiguratorCommand,
  applyAssistantTextInput,
  classifyAssistantWorkflowInput,
  createAssistantConfiguratorDraft,
  hydrateAssistantWorkflow,
  matchAssistantWorkflowTextChoice,
  nextAssistantConfiguratorPrompt,
} from '@/lib/assistantConfiguratorWorkflow';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { createConfiguratorPricingSnapshot } from '@/lib/configuratorPricing';
import type { SupportSendRequest, SupportService } from '@/lib/supportService';
import type {
  AssistantActionCommand,
  AssistantActionName,
  AssistantWorkflowState,
  SupportActionCard,
  SupportMessage,
  SupportWorkflowState,
} from '@/lib/supportTypes';
import type { ConfiguratorState } from '@/types/configurator';
import { t } from '@/lib/i18n/translations';
import { normalizePortalLanguageCode } from '@/lib/portalLanguages';
import {
  buildSupportProductDiscoveryContext,
  isProductDiscoveryQuestion,
} from '@/lib/supportProductDiscovery';
import {
  buildSupportProductPriceLookupContext,
  isProductPriceQuestion,
} from '@/lib/supportProductPriceLookup';
import { buildSupportPortalHelpContext } from '@/lib/supportPortalHelp';
import { buildSupportHowToContext } from '@/lib/supportHowTo';
import { buildSupportCompanyInfoContext } from '@/lib/supportCompanyInfo';
import { buildSparePartsIdentificationContext } from '@/lib/supportSparePartsIdentification';

function id(): string {
  return crypto.randomUUID();
}

function message(
  content: string,
  workflowState?: SupportWorkflowState,
  actionCard?: SupportActionCard,
): SupportMessage {
  return {
    id: `support-action-${id()}`,
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
    status: 'sent',
    workflowState,
    actionCard,
    outcomeType: 'ASSISTANT_ACTION',
  };
}

function isQuoteIntent(request: SupportSendRequest): boolean {
  if (request.intent === 'create-quote') return true;
  return /\b(opret|lav|start|create|make|starten|erstellen|crea|készíts|skapa|créer|utwórz|vytvoř)\b.{0,24}\b(tilbud|quote|angebot|offerta|ajánlat|offert|devis|ofert|nabídku)\b/i.test(request.content);
}

function clientWorkflow(server: AssistantServerWorkflow): AssistantWorkflowState {
  return {
    workflowId: server.id,
    stateVersion: server.state_version,
    status: server.status,
    configurator: server.state.configurator as ConfiguratorState,
    pendingField: server.state.pendingField as string | null | undefined,
    pendingMachineType: server.state.pendingMachineType as string | null | undefined,
    dealer: (server.state.dealer as Record<string, unknown> | null | undefined) || null,
    contact: (server.state.contact as Record<string, unknown> | null | undefined) || null,
    quoteKind: server.state.quoteKind,
    configurationId: server.configuration_id || null,
    quoteNumber: server.quote_number || null,
    leadId: server.lead_id || null,
    emailDraft: server.email_draft || null,
    canGoBack: server.can_go_back === true,
    hasMeaningfulChoices: server.has_meaningful_choices === true,
  };
}

function workflowFromRequest(request: SupportSendRequest): AssistantWorkflowState | null {
  const workflow = request.workflowState as AssistantWorkflowState;
  const activeStatuses = ['DRAFT', 'READY', 'QUOTE_CREATED', 'PDF_GENERATED', 'EMAIL_PREPARED'];
  return workflow?.workflowId && workflow.configurator && activeStatuses.includes(workflow.status) ? workflow : null;
}

function uiLanguage(language: string) {
  return normalizePortalLanguageCode(language) || 'en';
}

function topicSwitchMessage(
  workflow: AssistantWorkflowState,
  pendingMessage: string,
  language: string,
): SupportMessage {
  const lang = uiLanguage(language);
  return message(t('supportWorkflowTopicSwitchPrompt', lang), workflow, {
    kind: 'confirmation',
    title: t('supportWorkflowTopicSwitchTitle', lang),
    choices: [
      {
        id: `interrupt-yes-${id()}`,
        label: t('supportWorkflowTopicSwitchYes', lang),
        emphasis: 'danger',
        command: { type: 'confirm_topic_switch', parameters: { pending_message: pendingMessage } },
      },
      {
        id: `interrupt-no-${id()}`,
        label: t('supportWorkflowTopicSwitchNo', lang),
        command: { type: 'continue_workflow' },
      },
    ],
  });
}

function dealerFrom(value: Record<string, unknown>): AssistantDealer {
  return {
    id: String(value.id || '') || null,
    account_number: String(value.account_number || '') || null,
    company_name: String(value.company_name || '') || null,
    country: String(value.country || '') || null,
    city: String(value.city || '') || null,
  };
}

function contactFrom(value: Record<string, unknown>): AssistantContact {
  return {
    id: String(value.id || '') || null,
    name: String(value.name || '') || null,
    email: String(value.email || '') || null,
    phone: String(value.phone || '') || null,
  };
}

function recordParameter(command: AssistantActionCommand, key: string): Record<string, unknown> {
  const value = command.parameters?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function actionTitle(action: AssistantActionName, language: string): string {
  const da: Record<AssistantActionName, string> = {
    create_quote_draft: 'Opret officielt tilbud',
    create_or_link_lead: 'Opret eller tilknyt lead',
    generate_quote_pdf: 'Generér tilbuds-PDF',
    prepare_quote_email: 'Klargør tilbudsmail',
    send_quote_email: 'Send tilbudsmail',
    handoff_to_sales: 'Overdrag til salg',
    handoff_to_service: 'Overdrag til Teknisk & Service',
  };
  if (language === 'da') return da[action];
  return action.replaceAll('_', ' ');
}

function actionParameters(action: AssistantActionName, workflow: AssistantWorkflowState) {
  if (action === 'handoff_to_sales' || action === 'handoff_to_service') {
    const internalNote = String(workflow.configurator.internalNote || '').trim();
    return {
      reason_code: action === 'handoff_to_sales' ? 'ASSISTANT_SALES_REQUEST' : 'ASSISTANT_SERVICE_REQUEST',
      summary: [
        `Assistant workflow ${workflow.workflowId}.`,
        workflow.quoteNumber ? `Quote ${workflow.quoteNumber}.` : '',
        internalNote,
      ].filter(Boolean).join(' '),
      authorized_context: { configuration_id: workflow.configurationId || null, lead_id: workflow.leadId || null },
    };
  }
  return {
    configuration_id: workflow.configurationId || null,
    quote_number: workflow.quoteNumber || null,
  };
}

function confirmationMessage(action: AssistantActionName, workflow: AssistantWorkflowState, language: string) {
  const title = actionTitle(action, language);
  const external = action === 'send_quote_email';
  const key = `${action}:${workflow.workflowId}:${workflow.stateVersion}:${id()}`;
  return message(
    language === 'da' ? `Bekræft handlingen: ${title}.` : `Confirm action: ${title}.`,
    workflow,
    {
      kind: 'confirmation',
      title,
      warning: external
        ? (language === 'da' ? 'Dette sender en rigtig ekstern e-mail med det samme.' : 'This sends a real external email immediately.')
        : (language === 'da' ? 'Handlingen skriver til systemet.' : 'This action writes to the system.'),
      choices: [{
        id: `confirm-${key}`,
        label: language === 'da' ? 'Bekræft' : 'Confirm',
        emphasis: external ? 'danger' : 'primary',
        command: {
          type: 'confirm_action',
          action,
          parameters: { ...actionParameters(action, workflow), idempotency_key: key },
        },
      }],
    },
  );
}

export class AssistantSupportService implements SupportService {
  constructor(
    private readonly appUser: SessionUser,
    private readonly fallback: SupportService,
  ) {}

  private async abandonWorkflow(
    request: SupportSendRequest,
    workflow: AssistantWorkflowState,
    reason: 'USER_RESET' | 'TOPIC_SWITCH',
  ) {
    return confirmAssistantAction({
      conversationId: request.conversation.id,
      workflowId: workflow.workflowId,
      stateVersion: workflow.stateVersion,
      action: 'abandon_workflow',
      parameters: { reason },
      idempotencyKey: `abandon:${reason}:${workflow.workflowId}:${workflow.stateVersion}`,
    });
  }

  private repeatCurrentPrompt(request: SupportSendRequest, workflow: AssistantWorkflowState): SupportMessage {
    const prompt = nextAssistantConfiguratorPrompt(hydrateAssistantWorkflow(workflow), request.language);
    return message(prompt.content, workflow, prompt.card);
  }

  private async persist(
    request: SupportSendRequest,
    workflow: AssistantWorkflowState,
    state: ReturnType<typeof hydrateAssistantWorkflow>,
  ): Promise<AssistantWorkflowState> {
    const response = await invokeAssistantAction({
      action: 'set_configuration_option',
      conversationId: request.conversation.id,
      workflowId: workflow.workflowId,
      expectedStateVersion: workflow.stateVersion,
      parameters: { state },
    });
    if (!response.workflow) throw new Error('WORKFLOW_UPDATE_FAILED');
    return clientWorkflow(response.workflow);
  }

  private async promptAndPersist(
    request: SupportSendRequest,
    workflow: AssistantWorkflowState,
    draft: ReturnType<typeof hydrateAssistantWorkflow>,
  ): Promise<SupportMessage> {
    let prompt = nextAssistantConfiguratorPrompt(draft, request.language);
    if (prompt.state.pendingField === 'contact' && draft.dealer && !draft.contact) {
      const dealerId = String(draft.dealer.id || '');
      const contacts = await invokeAssistantAction({
        action: 'find_partner_contact',
        conversationId: request.conversation.id,
        workflowId: workflow.workflowId,
        expectedStateVersion: workflow.stateVersion,
        parameters: { dealer_account_id: dealerId },
      });
      if ((contacts.contacts || []).length === 1) {
        draft.contact = contacts.contacts![0];
        prompt = nextAssistantConfiguratorPrompt(draft, request.language);
      } else if ((contacts.contacts || []).length > 1) {
        const updated = await this.persist(request, workflow, prompt.state);
        return message(request.language === 'da' ? 'Vælg kontaktpersonen.' : 'Choose the contact.', updated, {
          kind: 'choices',
          title: request.language === 'da' ? 'Kontaktperson' : 'Contact',
          choices: contacts.contacts!.map((contact) => ({
            id: `contact-${String(contact.id)}`,
            label: String(contact.name || contact.email || 'Contact'),
            command: { type: 'select_contact', value: String(contact.id), parameters: { contact } },
          })),
        });
      } else {
        draft.contact = {
          id: null,
          name: String(draft.dealer.primary_contact_name || draft.dealer.sales_contact_name || ''),
          email: String(draft.dealer.primary_contact_email || draft.dealer.sales_contact_email || ''),
          phone: String(draft.dealer.primary_contact_phone || draft.dealer.sales_contact_phone || ''),
        };
        prompt = nextAssistantConfiguratorPrompt(draft, request.language);
      }
    }
    const updated = await this.persist(request, workflow, prompt.state);
    if (!prompt.ready) return message(prompt.content, updated, prompt.card);
    return this.preview(request, updated);
  }

  private async preview(request: SupportSendRequest, workflow: AssistantWorkflowState): Promise<SupportMessage> {
    const dealer = workflow.dealer ? dealerFrom(workflow.dealer) : null;
    const contact = workflow.contact ? contactFrom(workflow.contact) : null;
    const state = applyAssistantCustomer(workflow.configurator, dealer, contact);
    const calc = calculateConfiguration(state);
    const response = await invokeAssistantAction({
      action: 'calculate_quote_preview',
      conversationId: request.conversation.id,
      workflowId: workflow.workflowId,
      expectedStateVersion: workflow.stateVersion,
      parameters: {
        preview: {
          subtotal: calc.subtotal,
          total_discount: calc.totalDiscount,
          final_price: calc.currentPrice,
          currency: state.language === 'da' ? 'DKK' : 'EUR',
          machine_count: state.machineConfigs.reduce((sum, machine) => sum + machine.qty, 0),
        },
        pricing_snapshot: createConfiguratorPricingSnapshot(state),
      },
    });
    const updated = response.workflow ? clientWorkflow(response.workflow) : { ...workflow, configurator: state };
    const currency = state.language === 'da' ? 'DKK' : 'EUR';
    return message(
      request.language === 'da' ? 'Her er den canonical prisberegning fra Configurator.' : 'Here is the canonical Configurator price calculation.',
      updated,
      {
        kind: 'preview',
        title: request.language === 'da' ? 'Tilbudsoversigt' : 'Quote preview',
        lines: [
          { label: request.language === 'da' ? 'Maskiner' : 'Machines', value: String(state.machineConfigs.reduce((sum, machine) => sum + machine.qty, 0)) },
          { label: request.language === 'da' ? 'Subtotal' : 'Subtotal', value: formatMoney(calc.subtotal, state.language) },
          { label: request.language === 'da' ? 'Rabat' : 'Discount', value: formatMoney(calc.totalDiscount, state.language) },
          { label: request.language === 'da' ? 'Total ekskl. moms' : 'Total excl. VAT', value: `${formatMoney(calc.currentPrice, state.language)} ${currency}` },
        ],
        choices: [
          { id: 'create-quote', label: actionTitle('create_quote_draft', request.language), emphasis: 'primary', command: { type: 'propose_action', action: 'create_quote_draft' } },
          { id: 'create-lead', label: actionTitle('create_or_link_lead', request.language), command: { type: 'propose_action', action: 'create_or_link_lead' } },
          { id: 'handoff-sales', label: actionTitle('handoff_to_sales', request.language), command: { type: 'propose_action', action: 'handoff_to_sales' } },
          { id: 'handoff-service', label: actionTitle('handoff_to_service', request.language), command: { type: 'propose_action', action: 'handoff_to_service' } },
        ],
      },
    );
  }

  private async executeConfirmed(
    request: SupportSendRequest,
    workflow: AssistantWorkflowState,
    command: AssistantActionCommand,
  ): Promise<SupportMessage> {
    if (!command.action) throw new Error('ACTION_MISSING');
    const parameters: Record<string, unknown> = { ...actionParameters(command.action, workflow), ...(command.parameters || {}) };
    const idempotencyKey = String(parameters.idempotency_key || `${command.action}:${workflow.workflowId}:${workflow.stateVersion}`);
    delete parameters.idempotency_key;
    const lease = await confirmAssistantAction({
      conversationId: request.conversation.id,
      workflowId: workflow.workflowId,
      stateVersion: workflow.stateVersion,
      action: command.action,
      parameters,
      idempotencyKey,
    });
    if (lease.duplicate && lease.result) {
      return message(request.language === 'da' ? 'Handlingen var allerede gennemført.' : 'The action was already completed.', workflow, { kind: 'result', title: actionTitle(command.action, request.language) });
    }
    if (!lease.execution_required) {
      const nextWorkflow = lease.workflow ? clientWorkflow(lease.workflow) : workflow;
      return message(request.language === 'da' ? 'Overdragelsen er oprettet.' : 'The handoff has been created.', nextWorkflow, {
        kind: 'handoff', title: actionTitle(command.action, request.language),
      });
    }
    if (!lease.execution_action_id) throw new Error('EXECUTION_LEASE_MISSING');
    try {
      const dealer = workflow.dealer ? dealerFrom(workflow.dealer) : null;
      const contact = workflow.contact ? contactFrom(workflow.contact) : null;
      const state = applyAssistantCustomer(workflow.configurator, dealer, contact);
      let result: Record<string, unknown>;
      if (command.action === 'create_quote_draft') {
        result = await createAssistantQuote({ state, appUser: this.appUser, dealer, contact });
      } else if (command.action === 'create_or_link_lead') {
        result = await createAssistantLead({ state, appUser: this.appUser, dealer, contact });
      } else if (command.action === 'generate_quote_pdf') {
        if (!workflow.configurationId) throw new Error('QUOTE_REQUIRED');
        result = await generateAssistantQuotePdf({ state, configurationId: workflow.configurationId, quoteNumber: workflow.quoteNumber || null });
      } else if (command.action === 'send_quote_email') {
        if (!workflow.configurationId) throw new Error('QUOTE_REQUIRED');
        result = await sendAssistantQuoteEmail({ state, configurationId: workflow.configurationId, quoteNumber: workflow.quoteNumber || null, idempotencyKey });
      } else {
        throw new Error('CLIENT_ACTION_NOT_SUPPORTED');
      }
      const reported = await reportAssistantActionResult({ executionActionId: lease.execution_action_id, success: true, result });
      const next: AssistantWorkflowState = reported.workflow ? clientWorkflow(reported.workflow) : {
        ...workflow,
        configurationId: String(result.entity_id || workflow.configurationId || '') || null,
        quoteNumber: String(result.quote_number || workflow.quoteNumber || '') || null,
        leadId: command.action === 'create_or_link_lead' ? String(result.entity_id || '') || null : workflow.leadId,
      };
      if (command.action === 'create_quote_draft') {
        next.configurationId = String(result.entity_id || '');
        next.quoteNumber = String(result.quote_number || '') || null;
      }
      const choices = command.action === 'create_quote_draft'
        ? [
            { id: 'pdf', label: actionTitle('generate_quote_pdf', request.language), command: { type: 'propose_action' as const, action: 'generate_quote_pdf' as const } },
            { id: 'prepare-email', label: actionTitle('prepare_quote_email', request.language), command: { type: 'propose_action' as const, action: 'prepare_quote_email' as const } },
          ]
        : command.action === 'generate_quote_pdf'
          ? [{ id: 'prepare-email', label: actionTitle('prepare_quote_email', request.language), command: { type: 'propose_action' as const, action: 'prepare_quote_email' as const } }]
          : [];
      return message(request.language === 'da' ? 'Handlingen er gennemført.' : 'The action is complete.', next, {
        kind: 'result', title: actionTitle(command.action, request.language), choices,
      });
    } catch (error) {
      await reportAssistantActionResult({
        executionActionId: lease.execution_action_id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
      throw error;
    }
  }

  private async prepareEmail(request: SupportSendRequest, workflow: AssistantWorkflowState): Promise<SupportMessage> {
    if (!workflow.configurationId) throw new Error('QUOTE_REQUIRED');
    const draft = prepareAssistantQuoteEmail({ state: workflow.configurator, quoteNumber: workflow.quoteNumber || null });
    const response = await invokeAssistantAction({
      action: 'prepare_quote_email',
      conversationId: request.conversation.id,
      workflowId: workflow.workflowId,
      expectedStateVersion: workflow.stateVersion,
      parameters: draft,
    });
    const next = response.workflow ? clientWorkflow(response.workflow) : { ...workflow, emailDraft: draft };
    return message(request.language === 'da' ? 'Mailen er klargjort. Kontrollér modtageren før afsendelse.' : 'The email is prepared. Check the recipient before sending.', next, {
      kind: 'preview',
      title: actionTitle('prepare_quote_email', request.language),
      lines: [
        { label: request.language === 'da' ? 'Til' : 'To', value: draft.to.join(', ') },
        { label: request.language === 'da' ? 'Emne' : 'Subject', value: draft.subject },
      ],
      choices: [{ id: 'send-email', label: actionTitle('send_quote_email', request.language), emphasis: 'danger', command: { type: 'propose_action', action: 'send_quote_email' } }],
    });
  }

  async sendMessage(request: SupportSendRequest): Promise<SupportMessage> {
    const workflow = workflowFromRequest(request);
    const command = request.command;
    if (!workflow && !command && !isQuoteIntent(request)) {
      const companyInfo = buildSupportCompanyInfoContext(request.content, request.language);
      if (companyInfo) {
        return this.fallback.sendMessage({
          ...request,
          intent: 'timan-company-info',
          companyInfo,
        });
      }
      const portalHelp = buildSupportPortalHelpContext(request.content, request.language, this.appUser);
      if (portalHelp) {
        return this.fallback.sendMessage({
          ...request,
          intent: 'portal-help',
          portalHelp,
        });
      }
      const howTo = buildSupportHowToContext(request.content);
      if (howTo) {
        return this.fallback.sendMessage({
          ...request,
          intent: howTo.intent === 'SPARE_PARTS_ORDERING'
            ? 'spare-parts-ordering'
            : howTo.intent === 'SPARE_PARTS_PORTAL_HELP'
              ? 'spare-parts-portal-help'
              : 'spare-parts-delivery',
          howTo,
        });
      }
      const sparePartsIdentification = await buildSparePartsIdentificationContext(
        request.content,
        request.language,
        this.appUser,
        request.viewAsActive === true,
      );
      if (sparePartsIdentification) {
        return this.fallback.sendMessage({
          ...request,
          intent: 'spare-parts-identification',
          sparePartsIdentification,
        });
      }
      if (isProductPriceQuestion(request.content)) {
        const catalog = await invokeAssistantAction({
          action: 'get_machine_configuration_options',
          conversationId: request.conversation.id,
        });
        const productPriceLookup = buildSupportProductPriceLookupContext(
          request.content,
          request.language,
          catalog.options || [],
        );
        return this.fallback.sendMessage({
          ...request,
          intent: 'product-price-lookup',
          productPriceLookup: productPriceLookup || undefined,
        });
      }
      if (!isProductDiscoveryQuestion(request.content)) return this.fallback.sendMessage(request);
      const catalog = await invokeAssistantAction({
        action: 'get_machine_configuration_options',
        conversationId: request.conversation.id,
      });
      const productDiscovery = buildSupportProductDiscoveryContext(
        request.content,
        request.language,
        catalog.options || [],
      );
      return this.fallback.sendMessage({
        ...request,
        intent: productDiscovery ? 'product-discovery' : request.intent,
        productDiscovery: productDiscovery || undefined,
      });
    }
    if (!workflow && command && command.type !== 'start_quote') {
      return message(t('supportWorkflowInactive', uiLanguage(request.language)), {});
    }

    if (!workflow) {
      const initial = createAssistantConfiguratorDraft(request.content, request.language);
      initial.configurator = {
        ...initial.configurator,
        email: this.appUser.email.toLowerCase(),
        internalNote: `Timan Assistant request: ${request.content.slice(0, 500)}`,
      };
      const prompt = nextAssistantConfiguratorPrompt(initial, request.language);
      const response = await invokeAssistantAction({
        action: 'create_configuration_draft',
        conversationId: request.conversation.id,
        parameters: { state: prompt.state, ai_interpretation: `quote workflow: ${request.content.slice(0, 500)}` },
      });
      if (!response.workflow) throw new Error('WORKFLOW_CREATE_FAILED');
      const created = clientWorkflow(response.workflow);
      return prompt.ready ? this.preview(request, created) : message(prompt.content, created, prompt.card);
    }

    if (command?.type === 'propose_action' && command.action) {
      if (command.action === 'prepare_quote_email') return this.prepareEmail(request, workflow);
      return confirmationMessage(command.action, workflow, request.language);
    }
    if (command?.type === 'confirm_action') return this.executeConfirmed(request, workflow, command);
    if (command?.type === 'workflow_back') {
      const response = await invokeAssistantAction({
        action: 'navigate_workflow_back',
        conversationId: request.conversation.id,
        workflowId: workflow.workflowId,
        expectedStateVersion: workflow.stateVersion,
      });
      if (!response.workflow) throw new Error('WORKFLOW_BACK_FAILED');
      return this.repeatCurrentPrompt(request, clientWorkflow(response.workflow));
    }
    if (command?.type === 'reset_workflow') {
      await this.abandonWorkflow(request, workflow, 'USER_RESET');
      return message(t('supportWorkflowResetDone', uiLanguage(request.language)), {});
    }
    if (command?.type === 'confirm_topic_switch') {
      const pendingMessage = String(command.parameters?.pending_message || '').trim();
      if (!pendingMessage) throw new Error('PENDING_MESSAGE_MISSING');
      await this.abandonWorkflow(request, workflow, 'TOPIC_SWITCH');
      const resumed = await this.fallback.sendMessage({
        ...request,
        content: pendingMessage,
        workflowState: {},
        intent: undefined,
        command: undefined,
      });
      return { ...resumed, workflowState: {} };
    }
    if (command?.type === 'continue_workflow') return this.repeatCurrentPrompt(request, workflow);

    const draft = hydrateAssistantWorkflow(workflow);
    if (command?.type === 'select_dealer') {
      draft.dealer = recordParameter(command, 'dealer');
      const dealerId = String(draft.dealer.id || '');
      const contacts = await invokeAssistantAction({
        action: 'find_partner_contact', conversationId: request.conversation.id,
        workflowId: workflow.workflowId, expectedStateVersion: workflow.stateVersion,
        parameters: { dealer_account_id: dealerId },
      });
      if ((contacts.contacts || []).length === 1) draft.contact = contacts.contacts![0];
      else if ((contacts.contacts || []).length > 1) {
        draft.pendingField = 'contact';
        const updated = await this.persist(request, workflow, draft);
        return message(request.language === 'da' ? 'Vælg kontaktpersonen.' : 'Choose the contact.', updated, {
          kind: 'choices', title: request.language === 'da' ? 'Kontaktperson' : 'Contact',
          choices: contacts.contacts!.map((contact) => ({
            id: `contact-${String(contact.id)}`, label: String(contact.name || contact.email || 'Contact'),
            command: { type: 'select_contact', value: String(contact.id), parameters: { contact } },
          })),
        });
      } else {
        draft.contact = {
          id: null,
          name: String(draft.dealer.primary_contact_name || draft.dealer.sales_contact_name || ''),
          email: String(draft.dealer.primary_contact_email || draft.dealer.sales_contact_email || ''),
          phone: String(draft.dealer.primary_contact_phone || draft.dealer.sales_contact_phone || ''),
        };
      }
      return this.promptAndPersist(request, workflow, draft);
    }
    if (command?.type === 'select_contact') {
      draft.contact = recordParameter(command, 'contact');
      return this.promptAndPersist(request, workflow, draft);
    }
    if (command) {
      const next = applyAssistantConfiguratorCommand(draft, command);
      return this.promptAndPersist(request, workflow, next);
    }
    const compatibility = classifyAssistantWorkflowInput(draft, request.content, request.language);
    if (compatibility === 'interrupt') return topicSwitchMessage(workflow, request.content, request.language);
    if (compatibility === 'ambiguous') {
      const prompt = nextAssistantConfiguratorPrompt(draft, request.language);
      return message(
        `${t('supportWorkflowClarify', uiLanguage(request.language))}\n\n${prompt.content}`,
        workflow,
        prompt.card,
      );
    }
    const matchedChoice = matchAssistantWorkflowTextChoice(draft, request.content, request.language);
    if (matchedChoice) {
      const next = applyAssistantConfiguratorCommand(draft, matchedChoice);
      return this.promptAndPersist(request, workflow, next);
    }
    if (draft.pendingField === 'dealer') {
      const response = await invokeAssistantAction({
        action: 'find_dealer', conversationId: request.conversation.id,
        workflowId: workflow.workflowId, expectedStateVersion: workflow.stateVersion,
        parameters: { search: request.content },
      });
      const dealers = response.dealers || [];
      if (!dealers.length) return message(request.language === 'da' ? 'Jeg fandt ingen forhandler. Prøv et andet navn.' : 'No dealer was found. Try another name.', workflow);
      return message(request.language === 'da' ? 'Vælg den rigtige forhandler.' : 'Choose the correct dealer.', workflow, {
        kind: 'choices', title: request.language === 'da' ? 'Forhandler' : 'Dealer',
        choices: dealers.map((dealer) => ({
          id: `dealer-${String(dealer.id)}`,
          label: [dealer.company_name, dealer.account_number, dealer.city].filter(Boolean).join(' · '),
          command: { type: 'select_dealer', value: String(dealer.id), parameters: { dealer } },
        })),
      });
    }
    const next = applyAssistantTextInput(draft, request.content);
    return this.promptAndPersist(request, workflow, next);
  }
}
