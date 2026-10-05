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

function pdfAttachment(payload: OrderPayload) {
  return {
    kind: 'order_confirmation',
    filename: payload.pdf_filename,
    mime_type: payload.pdf_mime_type,
    content_base64: payload.pdf_base64,
  };
}

export function buildCustomerOrderMailPayload(payload: OrderPayload, recipients: string[]) {
  return {
    ...payload,
    mail_variant: 'customer_order_confirmation',
    recipient_scope: 'customer_dealer',
    idempotency_key: deliveryKey(payload, 'customer'),
    recipients,
    bcc: [],
    bcc_recipients: [],
    bccRecipients: [],
  };
}

export function buildInternalOrderMailPayload(payload: OrderPayload, csv: SubmittedOrderCsvFile) {
  const recipients = [INTERNAL_TIMAN_ORDER_EMAIL];
  return {
    ...payload,
    mail_variant: 'internal_order_copy',
    recipient_scope: 'internal_timan_sales',
    idempotency_key: deliveryKey(payload, 'internal-sales'),
    email_udfylder: INTERNAL_TIMAN_ORDER_EMAIL,
    email_modtager: INTERNAL_TIMAN_ORDER_EMAIL,
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
    attachments: [
      pdfAttachment(payload),
      {
        kind: 'c5_nav_order_csv',
        filename: csv.filename,
        mime_type: csv.mimeType,
        content_base64: csv.base64,
      },
    ],
  };
}
