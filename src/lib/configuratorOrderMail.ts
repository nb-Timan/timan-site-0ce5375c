import type { SubmittedOrderCsvFile } from '@/lib/submittedOrderCsv';

export const INTERNAL_TIMAN_ORDER_EMAIL = 'sales@timan.dk';

type OrderPayload = Record<string, unknown> & {
  case_id: string;
  order_number: string;
  pdf_filename: string;
  pdf_mime_type: string;
  pdf_base64: string;
};

function deliveryKey(payload: OrderPayload, audience: 'customer' | 'internal-sales'): string {
  const revision = String(payload.revision_id || payload.confirmation_revision || 'initial');
  return `configurator-order:${payload.case_id}:${payload.order_number}:${revision}:${audience}`;
}

function orderCompany(payload: OrderPayload): string {
  return String(payload.firma || '').trim();
}

export function customerOrderMailSubject(payload: OrderPayload): string {
  const company = orderCompany(payload);
  return `Ny ordre fra Timan configurator${company ? ` - ${company}` : ''}`;
}

export function internalOrderMailSubject(payload: OrderPayload): string {
  const company = orderCompany(payload);
  return `C5/NAV CSV - Ordre ${payload.order_number}${company ? ` - ${company}` : ''}`;
}

function internalOrderMailBody(payload: OrderPayload): string {
  const submitter = String(payload.email_udfylder || '').trim();
  const externalRecipient = String(payload.email_modtager || '').trim();
  const quoteNumber = String(payload.quote_number || '').trim();
  const company = orderCompany(payload);

  return [
    'C5/NAV ordreeksport',
    '',
    `Ordrenr.: ${payload.order_number}`,
    `Tilbudsnr.: ${quoteNumber || '-'}`,
    `Firma: ${company || '-'}`,
    `Oprettet af: ${submitter || '-'}`,
    `Ekstern modtager: ${externalRecipient || '-'}`,
    '',
    'CSV-filen er vedhæftet til intern C5/NAV-behandling.',
  ].join('\n');
}

export function buildCustomerOrderMailPayload(payload: OrderPayload, recipients: string[]) {
  return {
    ...payload,
    mail_variant: 'customer_order_confirmation',
    recipient_scope: 'customer_dealer',
    subject: customerOrderMailSubject(payload),
    idempotency_key: deliveryKey(payload, 'customer'),
    recipients,
    bcc: [INTERNAL_TIMAN_ORDER_EMAIL],
    bcc_recipients: [INTERNAL_TIMAN_ORDER_EMAIL],
    bccRecipients: [INTERNAL_TIMAN_ORDER_EMAIL],
  };
}

export function buildInternalOrderMailPayload(payload: OrderPayload, csv: SubmittedOrderCsvFile) {
  const recipients = [INTERNAL_TIMAN_ORDER_EMAIL];
  const orderContext = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !key.startsWith('pdf_')),
  );
  const originalSubmitter = String(payload.email_udfylder || '').trim();
  const externalRecipient = String(payload.email_modtager || '').trim();
  return {
    ...orderContext,
    mail_variant: 'internal_c5_nav',
    recipient_scope: 'internal_c5_nav',
    subject: internalOrderMailSubject(payload),
    body: internalOrderMailBody(payload),
    idempotency_key: deliveryKey(payload, 'internal-sales'),
    email_udfylder: originalSubmitter,
    email_modtager: INTERNAL_TIMAN_ORDER_EMAIL,
    original_submitter_email: originalSubmitter,
    external_recipient: externalRecipient,
    recipients,
    bcc: [],
    bcc_recipients: [],
    bccRecipients: [],
    csv_generated: true,
    csv_filename: csv.filename,
    csv_mime_type: csv.mimeType,
    csv_base64: csv.base64,
    csv_encoding: csv.encoding,
    csv_delimiter: csv.delimiter,
    csv_line_count: csv.lineCount,
    csv_matches_order_total: csv.matchesOrderTotal,
    attachment_filename: csv.filename,
    attachment_mime_type: csv.mimeType,
    attachment_base64: csv.base64,
    attachments: [
      {
        kind: 'c5_nav_order_csv',
        filename: csv.filename,
        mime_type: csv.mimeType,
        content_base64: csv.base64,
      },
    ],
  };
}
