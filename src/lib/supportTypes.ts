import type { ConfiguratorState } from '@/types/configurator';
import type { SupportPortalHelpContext } from '@/lib/supportPortalHelp';
import type { SupportHowToContext } from '@/lib/supportHowTo';
import type { SupportCompanyInfoContext } from '@/lib/supportCompanyInfo';
import type { SupportSparePartsIdentificationContext } from '@/lib/supportSparePartsIdentification';

export type { SupportPortalHelpContext } from '@/lib/supportPortalHelp';
export type { SupportHowToContext } from '@/lib/supportHowTo';
export type { SupportCompanyInfoContext } from '@/lib/supportCompanyInfo';
export type { SupportSparePartsIdentificationContext } from '@/lib/supportSparePartsIdentification';

export type SupportMessageRole = 'user' | 'assistant';
export type SupportMessageStatus = 'sending' | 'sent' | 'error';

export interface SupportCitation {
  id: string;
  label: string;
  language: string;
  url?: string;
  page_start?: number | null;
  page_end?: number | null;
  heading?: string | null;
}

export interface SupportMessage {
  id: string;
  role: SupportMessageRole;
  content: string;
  timestamp: string;
  status: SupportMessageStatus;
  requestId?: string;
  citations?: SupportCitation[];
  answerStatus?: 'ACCEPTED' | 'NO_ANSWER' | 'ERROR';
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_GROUNDED_ANSWER';
  confidenceScore?: number;
  confidenceReason?: string;
  outcomeType?: string;
  actionCard?: SupportActionCard;
  navigationAction?: SupportNavigationAction;
  externalLinkAction?: SupportExternalLinkAction;
  workflowState?: SupportWorkflowState;
}

export interface SupportNavigationAction {
  type: 'PORTAL_NAVIGATION';
  featureKey: string;
  label: string;
  route: string;
}

export interface SupportExternalLinkAction {
  type: 'EXTERNAL_NAVIGATION';
  key: 'interactive_spares';
  label: string;
  url: string;
}

export interface SupportPageContext {
  route: string;
  machineId?: string;
  productId?: string;
}

export type AssistantActionName =
  | 'create_quote_draft'
  | 'create_or_link_lead'
  | 'generate_quote_pdf'
  | 'prepare_quote_email'
  | 'send_quote_email'
  | 'handoff_to_sales'
  | 'handoff_to_service';

export interface AssistantActionCommand {
  type: 'start_quote' | 'select_machine' | 'select_accessory' | 'set_delivery_method'
    | 'select_dealer' | 'select_contact' | 'select_timan_seller' | 'change_timan_seller'
    | 'set_quote_kind' | 'set_campaign_disabled' | 'propose_action' | 'confirm_action'
    | 'workflow_back' | 'reset_workflow' | 'confirm_topic_switch' | 'continue_workflow';
  value?: string;
  action?: AssistantActionName;
  parameters?: Record<string, unknown>;
}

export interface SupportActionChoice {
  id: string;
  label: string;
  command: AssistantActionCommand;
  emphasis?: 'primary' | 'danger';
}

export interface SupportActionCard {
  kind: 'choices' | 'preview' | 'confirmation' | 'result' | 'handoff';
  title: string;
  lines?: Array<{ label: string; value: string }>;
  choices?: SupportActionChoice[];
  warning?: string;
}

export interface AssistantWorkflowState extends Record<string, unknown> {
  workflowId: string;
  stateVersion: number;
  status: string;
  configurator: ConfiguratorState;
  pendingField?: string | null;
  pendingMachineType?: string | null;
  dealer?: Record<string, unknown> | null;
  contact?: Record<string, unknown> | null;
  timanSeller?: Record<string, unknown> | null;
  canChangeTimanSeller?: boolean;
  quoteKind?: 'ordinary' | 'demo';
  configurationId?: string | null;
  quoteNumber?: string | null;
  leadId?: string | null;
  emailDraft?: Record<string, unknown> | null;
  canGoBack?: boolean;
  hasMeaningfulChoices?: boolean;
}

export type SupportWorkflowState = Partial<AssistantWorkflowState> & Record<string, unknown>;

export interface SupportConversation {
  id: string;
  messages: SupportMessage[];
  context: SupportPageContext;
  workflowState: SupportWorkflowState;
}

export type SupportSessionStatus = 'idle' | 'sending' | 'error';

export interface SupportFailedRequest {
  messageId: string;
  requestId: string;
  content: string;
  intent?: SupportQuickIntent;
  command?: AssistantActionCommand;
}

export interface SupportSessionState {
  conversation: SupportConversation;
  status: SupportSessionStatus;
  error: string | null;
  failedRequest: SupportFailedRequest | null;
}

export type SupportQuickIntent = 'machine-info' | 'portal-help' | 'timan-company-info' | 'timan-how-to'
  | 'spare-parts-ordering' | 'spare-parts-identification' | 'spare-parts-portal-help' | 'spare-parts-delivery'
  | 'timan-website' | 'product-discovery' | 'product-price-lookup' | 'create-quote';
