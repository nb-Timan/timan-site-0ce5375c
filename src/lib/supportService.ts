import { t } from '@/lib/i18n/translations';
import { supabase } from '@/lib/supabase';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type {
  SupportConversation,
  AssistantActionCommand,
  SupportMessage,
  SupportPageContext,
  SupportQuickIntent,
  SupportWorkflowState,
  SupportPortalHelpContext,
  SupportHowToContext,
  SupportCompanyInfoContext,
  SupportSparePartsIdentificationContext,
} from '@/lib/supportTypes';
import type { SupportProductDiscoveryContext } from '@/lib/supportProductDiscovery';
import type { SupportProductPriceLookupContext } from '@/lib/supportProductPriceLookup';
import { findPortalCapabilityContract } from '../../supabase/functions/_shared/portalCapabilityContract';
import { SPARE_PARTS_PORTAL, sparePartsPortalLabel } from '../../supabase/functions/_shared/sparePartsPortal';

export interface SupportSendRequest {
  content: string;
  language: PortalUiLanguage;
  conversation: SupportConversation;
  context: SupportPageContext;
  workflowState: SupportWorkflowState;
  intent?: SupportQuickIntent;
  requestId?: string;
  viewAsActive?: boolean;
  command?: AssistantActionCommand;
  productDiscovery?: SupportProductDiscoveryContext;
  productPriceLookup?: SupportProductPriceLookupContext;
  portalHelp?: SupportPortalHelpContext;
  howTo?: SupportHowToContext;
  companyInfo?: SupportCompanyInfoContext;
  sparePartsIdentification?: SupportSparePartsIdentificationContext;
}

export interface SupportService {
  sendMessage(request: SupportSendRequest): Promise<SupportMessage>;
}

const MOCK_LATENCY_MS = 450;

function createMessageId() {
  return `support-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function responseKey(request: SupportSendRequest): string {
  const normalized = request.content.toLocaleLowerCase();
  if (request.intent === 'machine-info' || normalized.includes('3330')) return 'supportMock3330';
  if (request.intent === 'portal-help' || normalized.includes('portal')) return 'supportMockPortal';
  if (request.intent === 'timan-website' || normalized.includes('timan.dk')) return 'supportMockTimanWebsite';
  return 'supportMockGeneric';
}

export class MockSupportService implements SupportService {
  constructor(private readonly latencyMs = MOCK_LATENCY_MS) {}

  async sendMessage(request: SupportSendRequest): Promise<SupportMessage> {
    await new Promise((resolve) => window.setTimeout(resolve, this.latencyMs));

    // Deterministic test hook for the visible retry state. It never calls a network service.
    if (request.content.trim() === '__mock_error__') {
      throw new Error('mock-support-error');
    }

    return {
      id: createMessageId(),
      role: 'assistant',
      content: t(responseKey(request), request.language),
      timestamp: new Date().toISOString(),
      status: 'sent',
    };
  }
}

interface SupportChatResponse {
  request_id: string;
  response_id?: string;
  answer: string;
  answer_status: 'ACCEPTED' | 'NO_ANSWER' | 'ERROR';
  citations?: SupportMessage['citations'];
  confidence_level?: SupportMessage['confidenceLevel'];
  confidence_score?: number;
  confidence_reason?: string;
  outcome_type?: string;
  suggest_quote_workflow?: boolean;
  portal_navigation?: {
    type: 'PORTAL_NAVIGATION';
    feature_key: string;
    label: string;
    route: string;
  } | null;
  external_link?: {
    type: 'EXTERNAL_NAVIGATION';
    key: string;
    label: string;
    url: string;
  } | null;
}

function validatedNavigationAction(value: SupportChatResponse['portal_navigation']) {
  if (!value || value.type !== 'PORTAL_NAVIGATION') return undefined;
  const contract = findPortalCapabilityContract(value.feature_key);
  if (!contract) return undefined;
  const routeMatches = contract.routeUsesDealerNumber
    ? /^\/portal\/dealer-data\?accountNumber=[^&#]+$/.test(value.route) || value.route === '/portal/dealer-data'
    : value.route === contract.route;
  if (!routeMatches) return undefined;
  return {
    type: value.type,
    featureKey: contract.featureKey,
    label: value.label,
    route: value.route,
  } as const;
}

export function validatedExternalLinkAction(
  value: SupportChatResponse['external_link'],
  language: PortalUiLanguage,
) {
  if (!value || value.type !== 'EXTERNAL_NAVIGATION' || value.key !== SPARE_PARTS_PORTAL.key) return undefined;
  if (value.url !== SPARE_PARTS_PORTAL.url) return undefined;
  return {
    type: 'EXTERNAL_NAVIGATION' as const,
    key: SPARE_PARTS_PORTAL.key,
    label: sparePartsPortalLabel(language),
    url: SPARE_PARTS_PORTAL.url,
  };
}

function validatedCitations(citations: SupportChatResponse['citations']): SupportMessage['citations'] {
  return (citations || []).map((citation) => {
    if (!citation.url) return citation;
    try {
      const url = new URL(citation.url);
      if (url.protocol === 'https:' && ['timan.dk', 'www.timan.dk'].includes(url.hostname.toLowerCase())) return citation;
    } catch { /* Drop unsafe citation URLs while preserving their labels. */ }
    const safeCitation = { ...citation };
    delete safeCitation.url;
    return safeCitation;
  });
}

export class ApiSupportService implements SupportService {
  async sendMessage(request: SupportSendRequest): Promise<SupportMessage> {
    const requestId = request.requestId || crypto.randomUUID();
    const { data, error } = await supabase.functions.invoke<SupportChatResponse>('support-chat', {
      body: {
        request_id: requestId,
        conversation_id: request.conversation.id,
        message: request.content,
        language: request.language,
        context: {
          route: request.context.route,
          machineId: request.context.machineId,
          productId: request.context.productId,
        },
        intent: request.intent,
        product_discovery: request.productDiscovery,
        product_price_lookup: request.productPriceLookup,
        portal_help: request.portalHelp,
        how_to: request.howTo,
        company_info: request.companyInfo,
        spare_parts_identification: request.sparePartsIdentification,
        view_as_active: request.viewAsActive === true,
      },
    });
    if (error || !data?.answer) {
      throw new Error(error?.message || 'support-chat-error');
    }
    const actionCard = data.suggest_quote_workflow ? {
      kind: 'choices' as const,
      title: t('supportDiscoveryQuoteTitle', request.language),
      choices: [{
        id: 'start-quote-from-discovery',
        label: t('supportDiscoveryQuoteAction', request.language),
        command: { type: 'start_quote' as const },
      }],
    } : undefined;
    return {
      id: data.response_id || `support-${requestId}`,
      role: 'assistant',
      content: data.answer,
      timestamp: new Date().toISOString(),
      status: 'sent',
      requestId: data.request_id,
      citations: validatedCitations(data.citations),
      answerStatus: data.answer_status,
      confidenceLevel: data.confidence_level,
      confidenceScore: data.confidence_score,
      confidenceReason: data.confidence_reason,
      outcomeType: data.outcome_type,
      actionCard,
      navigationAction: validatedNavigationAction(data.portal_navigation),
      externalLinkAction: validatedExternalLinkAction(data.external_link, request.language),
    };
  }
}

export const supportService: SupportService = new ApiSupportService();
