import type { SessionUser } from '@/context/AppUserContext';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { buildConfiguratorOwnership } from '@/lib/configuratorOwnership';
import { buildConfiguratorPdf, buildConfiguratorPdfFilename } from '@/lib/configuratorPdf';
import {
  ensureReferenceNumbers,
  markPdfDownloaded,
  saveConfiguration,
  uploadSentPdf,
} from '@/lib/configurationsService';
import { createLead, type NewCrmLead } from '@/lib/crmLeadsService';
import { buildStructuredContactInformation, structuredCrmLeadContactColumns } from '@/lib/crmLeadValidation';
import { logMailAuditEvent } from '@/lib/mailAuditService';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { getQuoteWebhookUrl } from '@/lib/webhookUrls';
import { t as configuratorTranslation } from '@/data/translations';
import type { ConfiguratorState } from '@/types/configurator';
import { resolveConfiguratorPartnerAccountType } from '@/lib/importerDiscount';
import { TIMAN_COMPANY_PROFILE } from '../../supabase/functions/_shared/timanCompanyProfile';

const INTERNAL_TIMAN_COPY_EMAIL = 'sales@timan.dk';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AssistantDealer {
  id?: string | null;
  account_number?: string | null;
  company_name?: string | null;
  country?: string | null;
  city?: string | null;
  customer_type?: string | null;
  customer_type_label?: string | null;
  dealer_type?: string | null;
}

export interface AssistantContact {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface AssistantTimanSeller {
  id?: string | null;
  contact_id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  initials?: string | null;
}

export interface GeneratedAssistantPdf {
  filename: string;
  blob: Blob;
  base64: string;
  path: string | null;
}

function labelForQuote(state: ConfiguratorState, dealer?: AssistantDealer | null): string {
  const machine = state.machineConfigs.map((item) => `${item.qty} x ${item.type}`).join(', ');
  return [dealer?.company_name, machine].filter(Boolean).join(' - ') || `Timan tilbud ${new Date().toISOString().slice(0, 10)}`;
}

function splitRecipients(state: ConfiguratorState): string[] {
  const values = [state.email, state.emailRecipient]
    .flatMap((value) => String(value || '').split(/[,;\s]+/))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!values.length || values.some((value) => !EMAIL.test(value))) throw new Error('INVALID_RECIPIENT');
  return [...new Set(values)];
}

export function applyAssistantCustomer(
  state: ConfiguratorState,
  dealer?: AssistantDealer | null,
  contact?: AssistantContact | null,
): ConfiguratorState {
  const customer = {
    firmanavn: dealer?.company_name || state.firmanavn,
    kontaktperson: contact?.name || state.kontaktperson,
    telefon: contact?.phone || state.telefon,
    emailRecipient: contact?.email || state.emailRecipient,
    address: state.address,
    postalCode: state.postalCode,
    city: dealer?.city || state.city,
    country: dealer?.country || state.country,
  };
  return {
    ...state,
    ...customer,
    ...(dealer ? { partnerAccountType: resolveConfiguratorPartnerAccountType({ dealer }) } : {}),
    customerMode: 'dealer',
    dealerContactId: contact?.id || state.dealerContactId,
    dealerCustomerData: customer,
  };
}

export function applyAssistantTimanSeller(
  state: ConfiguratorState,
  seller?: AssistantTimanSeller | null,
): ConfiguratorState {
  return seller?.email ? { ...state, email: seller.email.toLowerCase() } : state;
}

export async function createAssistantQuote(input: {
  state: ConfiguratorState;
  appUser: SessionUser;
  dealer?: AssistantDealer | null;
  contact?: AssistantContact | null;
  timanSeller?: AssistantTimanSeller | null;
}): Promise<{ entity_id: string; quote_number: string | null }> {
  const state = applyAssistantTimanSeller(
    applyAssistantCustomer(input.state, input.dealer, input.contact),
    input.timanSeller,
  );
  const ownership = await buildConfiguratorOwnership(input.appUser, {
    seller: {
      initials: input.timanSeller?.initials || input.appUser.initials,
      email: input.timanSeller?.email || input.appUser.email,
      name: input.timanSeller?.name || input.appUser.display_name,
    },
    sellerVerifiedByServer: Boolean(input.timanSeller?.id && input.timanSeller?.contact_id),
    dealer: input.dealer ? {
      account_id: input.dealer.id,
      account_number: input.dealer.account_number,
      company_name: input.dealer.company_name,
    } : null,
  });
  const saved = await saveConfiguration(state, labelForQuote(state, input.dealer), input.appUser.email.toLowerCase(), { ownership });
  if (saved.error || !saved.id) throw new Error(saved.error || 'QUOTE_SAVE_FAILED');
  const references = await ensureReferenceNumbers(saved.id, false);
  return { entity_id: saved.id, quote_number: references.quote_number };
}

export async function createAssistantLead(input: {
  state: ConfiguratorState;
  appUser: SessionUser;
  dealer?: AssistantDealer | null;
  contact?: AssistantContact | null;
  timanSeller?: AssistantTimanSeller | null;
}): Promise<{ entity_id: string; lead_no: number | null }> {
  const state = applyAssistantTimanSeller(
    applyAssistantCustomer(input.state, input.dealer, input.contact),
    input.timanSeller,
  );
  const calc = calculateConfiguration(state);
  const ownerId = input.timanSeller?.id || await resolveSellerId(input.timanSeller?.email || input.appUser.email) || input.appUser.id || null;
  const contact = {
    company: state.firmanavn,
    contactPerson: state.kontaktperson,
    phone: state.telefon,
    email: state.emailRecipient,
    address: state.address,
    postalCode: state.postalCode,
    city: state.city,
    zipCity: [state.postalCode, state.city].filter(Boolean).join(' '),
    country: state.country || input.dealer?.country || '',
  };
  const lead: NewCrmLead = {
    lead_no: null,
    title: labelForQuote(state, input.dealer),
    owner_user_id: ownerId,
    owner_name: input.timanSeller?.name || input.appUser.display_name || input.appUser.email,
    owner_email: (input.timanSeller?.email || input.appUser.email).toLowerCase(),
    linked_dealer_id: input.dealer?.id || null,
    linked_dealer_contact_id: input.contact?.id || state.dealerContactId || null,
    first_contact_date: new Date().toISOString().slice(0, 10),
    expected_close_date: null,
    next_followup_date: null,
    machine_types: state.machineConfigs.map((machine) => machine.type),
    next_activity: 'Offer sent to the customer',
    demo_has_run: Object.values(state.demoMachines).some(Boolean) ? 'yes' : 'no',
    contact_type: 'Timan',
    customer_type: 'Needs to be filled in',
    ...structuredCrmLeadContactColumns(contact),
    contact_information: buildStructuredContactInformation(contact) || null,
    trade_fair: null,
    country: state.country || input.dealer?.country || null,
    notes: ['Created from Timan Assistant configuration workflow.', state.internalNote].filter(Boolean).join(' '),
    estimated_value: Math.round(calc.currentPrice),
    pipeline_value_snapshot: null,
    pipeline_value_snapshot_reason: null,
    pipeline_value_snapshot_updated_at: null,
    probability: 25,
    pipeline_stage: 'Lead',
    lost_competitor: null,
    lost_reason: null,
    lost_comment: null,
    attachments: [],
    status: 'aktiv',
    move_to_working_qty: null,
    converted_demo_lead_id: null,
    incomplete_from_configurator: true,
    demo_registration_pending: false,
    linked_sales_event: null,
  };
  const created = await createLead(lead, { requireRemote: true });
  return { entity_id: created.id, lead_no: created.lead_no ?? null };
}

async function renderAssistantPdf(
  state: ConfiguratorState,
  configurationId: string,
  quoteNumber: string | null,
  persistOnConfiguration: boolean,
): Promise<GeneratedAssistantPdf> {
  const [{ jsPDF }] = await Promise.all([import('jspdf')]);
  const T = (key: string) => configuratorTranslation(key, state.language);
  const pdf = buildConfiguratorPdf({
    jsPDF,
    state,
    calcResult: calculateConfiguration(state),
    flowType: 'quote',
    quoteNumber,
    showPrices: true,
    uiLanguage: state.language,
    contentLanguage: state.language,
    T,
    TC: T,
  });
  const filename = buildConfiguratorPdfFilename({ flowType: 'quote', refNumber: quoteNumber, T });
  const dataUri = String(pdf.output('datauristring'));
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : '';
  const blob = pdf.output('blob') as Blob;
  if (!base64 || !blob) throw new Error('PDF_GENERATION_FAILED');
  const upload = await uploadSentPdf(configurationId, blob, filename, { persistOnConfiguration });
  if (upload.error) throw new Error(upload.error);
  return { filename, blob, base64, path: upload.path };
}

export async function generateAssistantQuotePdf(input: {
  state: ConfiguratorState;
  configurationId: string;
  quoteNumber: string | null;
}): Promise<{ entity_id: string; pdf_path: string | null; pdf_filename: string }> {
  const generated = await renderAssistantPdf(input.state, input.configurationId, input.quoteNumber, false);
  return { entity_id: input.configurationId, pdf_path: generated.path, pdf_filename: generated.filename };
}

export function prepareAssistantQuoteEmail(input: {
  state: ConfiguratorState;
  quoteNumber: string | null;
  pdfPath?: string | null;
}) {
  const recipients = splitRecipients(input.state);
  return {
    to: recipients,
    cc: [] as string[],
    bcc: [INTERNAL_TIMAN_COPY_EMAIL],
    subject: `Tilbud ${input.quoteNumber || ''}`.trim(),
    body: `Hej ${input.state.kontaktperson || ''}\n\nVedhæftet finder du tilbuddet fra ${TIMAN_COMPANY_PROFILE.companyName}.\n\nMed venlig hilsen\n${TIMAN_COMPANY_PROFILE.companyName}`,
    pdf_path: input.pdfPath || null,
  };
}

export async function sendAssistantQuoteEmail(input: {
  state: ConfiguratorState;
  configurationId: string;
  quoteNumber: string | null;
  idempotencyKey: string;
  timanSeller?: AssistantTimanSeller | null;
}): Promise<{ entity_id: string; delivered: true; recipients: string[]; pdf_path: string | null }> {
  const recipients = splitRecipients(input.state);
  const bcc = [INTERNAL_TIMAN_COPY_EMAIL];
  const generated = await renderAssistantPdf(input.state, input.configurationId, input.quoteNumber, true);
  const summary = buildQuoteContentSummary(input.state);
  const payload = {
    idempotency_key: input.idempotencyKey,
    assistant_action_id: input.idempotencyKey,
    case_id: input.configurationId,
    document_type: 'Tilbud',
    quote_number: input.quoteNumber || '',
    order_number: '',
    source_quote_number: '',
    firma: input.state.firmanavn,
    kontaktperson: input.state.kontaktperson,
    telefon: input.state.telefon,
    email_udfylder: input.state.email.trim().toLowerCase(),
    email_modtager: input.state.emailRecipient.trim().toLowerCase(),
    recipients,
    to: recipients,
    cc: [] as string[],
    bcc,
    bcc_recipients: bcc,
    kommentar: input.state.comment,
    pdf_url: '',
    pdf_storage_path: generated.path || '',
    pdf_filename: generated.filename,
    pdf_mime_type: 'application/pdf',
    pdf_base64: generated.base64,
    language: input.state.language,
    sender_company: summary.issuer,
    currency: summary.currency,
    payment_terms: summary.payment_terms,
    purchase_order_number: summary.purchase_order_number,
    delivery: summary.delivery,
    machines: summary.machines,
    totals: summary.totals,
    state_summary: summary,
    main_categories: input.state.machineConfigs.map((machine) => machine.type),
  };
  let delivered = false;
  let failureReason = '';
  let responseText = '';
  try {
    const response = await fetch(getQuoteWebhookUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify(payload),
    });
    responseText = await response.text().catch(() => '');
    delivered = response.ok && response.type !== 'opaque' && response.type !== 'opaqueredirect';
    if (!delivered) failureReason = response.type === 'opaque' ? 'Opaque response' : `HTTP ${response.status}`;
  } catch (error) {
    failureReason = error instanceof Error ? error.message : String(error);
  }
  const sellerId = input.timanSeller?.id || await resolveSellerId(input.timanSeller?.email || input.state.email || undefined);
  try {
    await logMailAuditEvent({
      sent_at: delivered ? new Date().toISOString() : null,
      category: 'quote',
      source_module: 'Timan Assistant',
      source_action: 'send_quote',
      subject: `Tilbud ${input.quoteNumber || ''}`.trim(),
      to_addresses: recipients,
      cc_addresses: [],
      bcc_addresses: bcc,
      responsible_user_id: sellerId,
      responsible_seller_id: sellerId,
      related_entity_type: 'configuration',
      related_entity_id: input.configurationId,
      related_entity_label: input.quoteNumber || input.configurationId,
      status: delivered ? 'sent' : 'failed',
      provider: 'n8n:timan-afsend-tilbud',
      provider_message_id: null,
      attachment_count: 1,
      error_message: delivered ? null : `${failureReason}${responseText ? `: ${responseText.slice(0, 300)}` : ''}`,
    });
  } catch { /* Delivery result remains authoritative if audit logging fails. */ }
  if (!delivered) throw new Error(failureReason || 'QUOTE_SEND_FAILED');
  await markPdfDownloaded(input.configurationId, 'quote');
  return { entity_id: input.configurationId, delivered: true, recipients, pdf_path: generated.path };
}
