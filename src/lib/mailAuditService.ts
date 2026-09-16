import { supabase } from '@/lib/supabase';

export const MAIL_AUDIT_CATEGORIES = [
  'messe_lead', 'crm_lead', 'quote', 'order', 'invoice',
  'warranty', 'service', 'claim', 'contract', 'system',
] as const;
export type MailAuditCategory = typeof MAIL_AUDIT_CATEGORIES[number];
export type MailAuditStatus = 'queued' | 'sent' | 'failed';

export type MailAuditEvent = {
  id: string;
  created_at: string;
  sent_at: string | null;
  category: MailAuditCategory;
  source_module: string;
  source_action: string;
  subject: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  responsible_user_id: string | null;
  responsible_seller_id: string | null;
  triggered_by_user_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  related_entity_label: string | null;
  status: MailAuditStatus;
  provider: string | null;
  provider_message_id: string | null;
  attachment_count: number;
  error_message: string | null;
  responsible_seller?: { initials: string | null; full_name: string | null; email: string | null } | null;
};

export type LogMailAuditEventInput = Omit<MailAuditEvent, 'id' | 'created_at' | 'triggered_by_user_id'>;

function cleanAddresses(addresses: string[] | null | undefined): string[] {
  return Array.from(new Set((addresses || []).map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

function cleanText(value: string | null | undefined, max = 1000): string | null {
  const text = value?.trim();
  return text ? text.slice(0, max) : null;
}

/** Logs metadata only. A logging failure never retries or resends email. */
export async function logMailAuditEvent(input: LogMailAuditEventInput): Promise<void> {
  const { error } = await supabase.from('mail_audit_events').insert({
    ...input,
    sent_at: input.status === 'sent' ? (input.sent_at || new Date().toISOString()) : input.sent_at,
    subject: cleanText(input.subject),
    to_addresses: cleanAddresses(input.to_addresses),
    cc_addresses: cleanAddresses(input.cc_addresses),
    bcc_addresses: cleanAddresses(input.bcc_addresses),
    related_entity_type: cleanText(input.related_entity_type, 100),
    related_entity_id: cleanText(input.related_entity_id, 200),
    related_entity_label: cleanText(input.related_entity_label, 500),
    provider: cleanText(input.provider, 200),
    provider_message_id: cleanText(input.provider_message_id, 500),
    error_message: input.status === 'failed' ? cleanText(input.error_message, 2000) : null,
  });
  if (error) throw error;
}

export async function fetchMailAuditEvents(limit = 500): Promise<MailAuditEvent[]> {
  const { data, error } = await supabase
    .from('mail_audit_events')
    .select('*, responsible_seller:app_users!mail_audit_events_responsible_seller_id_fkey(initials, full_name, email)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as MailAuditEvent[];
}

export const MAIL_AUDIT_CATEGORY_LABELS: Record<MailAuditCategory, string> = {
  messe_lead: 'Messe lead',
  crm_lead: 'CRM / Lead',
  quote: 'Tilbud',
  order: 'Ordre',
  invoice: 'Faktura',
  warranty: 'Garanti',
  service: 'Service',
  claim: 'Claims',
  contract: 'Kontrakt',
  system: 'System',
};
