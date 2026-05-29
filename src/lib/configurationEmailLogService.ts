/**
 * Email send audit log for quotes and orders.
 *
 * Writes one row to public.configuration_email_logs per send attempt
 * (success or failed). Never throws — logging failures must never block
 * the actual email send flow.
 *
 * See docs/sql/phase4m_configuration_email_logs.sql for the schema.
 */
import { supabase } from '@/lib/supabase';

export type EmailLogDocumentType = 'quote' | 'order';
export type EmailLogStatus = 'success' | 'failed';

export interface LogConfigurationEmailSendInput {
  configurationId: string;
  documentType: EmailLogDocumentType;
  quoteNumber?: string | null;
  orderNumber?: string | null;
  toRecipients: string[];
  ccRecipients?: string[];
  bccRecipients?: string[];
  sendStatus: EmailLogStatus;
  httpStatus?: number | null;
  errorMessage?: string | null;
  webhookResponse?: string | null;
  webhookUrl?: string | null;
  pdfFilename?: string | null;
  pdfStoragePath?: string | null;
  createdByEmail?: string | null;
  sellerEmail?: string | null;
  sellerInitials?: string | null;
}

const MAX_TEXT = 5000;

function trunc(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) : value;
}

export async function logConfigurationEmailSend(
  input: LogConfigurationEmailSendInput,
): Promise<void> {
  try {
    let createdByUserId: string | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      createdByUserId = data?.user?.id ?? null;
    } catch {
      // ignore auth lookup errors; user_id stays null
    }

    const row = {
      configuration_id: input.configurationId,
      document_type: input.documentType,
      quote_number: input.quoteNumber || null,
      order_number: input.orderNumber || null,
      to_recipients: input.toRecipients ?? [],
      cc_recipients: input.ccRecipients ?? [],
      bcc_recipients: input.bccRecipients ?? [],
      send_status: input.sendStatus,
      http_status: input.httpStatus ?? null,
      error_message: trunc(input.errorMessage),
      webhook_response: trunc(input.webhookResponse),
      webhook_url: input.webhookUrl ?? null,
      pdf_filename: input.pdfFilename ?? null,
      pdf_storage_path: input.pdfStoragePath ?? null,
      created_by_user_id: createdByUserId,
      created_by_email: input.createdByEmail ?? null,
      seller_email: input.sellerEmail ?? null,
      seller_initials: input.sellerInitials ?? null,
    };

    const { error } = await supabase
      .from('configuration_email_logs')
      .insert(row);
    if (error) {
      console.error('[configurationEmailLog] insert failed:', error);
    }
  } catch (err) {
    console.error('[configurationEmailLog] unexpected error:', err);
  }
}
