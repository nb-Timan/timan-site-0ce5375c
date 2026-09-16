import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAIL_AUDIT_CATEGORIES,
  MAIL_AUDIT_CATEGORY_LABELS,
} from '@/lib/mailAuditService';
import { buildMesseLeadInternalMailRouting, MESSE_LEAD_BCC_EMAIL } from '@/lib/messeLeadMail';

const migration = readFileSync('supabase/migrations/20260916052808_create_mail_audit_events.sql', 'utf8');
const messePage = readFileSync('src/pages/messe/MesseFollowUpPage.tsx', 'utf8');
const overview = readFileSync('src/pages/backend/BackendMailOverviewPage.tsx', 'utf8');

describe('central mail audit', () => {
  it('keeps the canonical category set and backend-only read policy', () => {
    expect(MAIL_AUDIT_CATEGORIES).toEqual([
      'messe_lead', 'crm_lead', 'quote', 'order', 'invoice',
      'warranty', 'service', 'claim', 'contract', 'system',
    ]);
    expect(Object.keys(MAIL_AUDIT_CATEGORY_LABELS)).toEqual(MAIL_AUDIT_CATEGORIES);
    expect(migration).toContain('create table if not exists public.mail_audit_events');
    expect(migration).toContain('alter table public.mail_audit_events enable row level security');
    expect(migration).toContain('mail_audit_events_select_backend_only');
    expect(migration).toContain("au.portal_role::text = 'timan_backend'");
    expect(migration).not.toContain('for update');
    expect(migration).not.toContain('for delete');
  });

  it('records metadata fields without retaining a mail body', () => {
    for (const field of ['to_addresses', 'cc_addresses', 'bcc_addresses', 'related_entity_id', 'provider_message_id', 'attachment_count', 'error_message']) {
      expect(migration).toContain(field);
    }
    expect(migration).not.toContain('body text');
    expect(migration).not.toContain('html_body');
  });

  it('logs one messe outcome with the selected seller only and preserves attachment metadata', () => {
    const customerEmail = 'customer-test@invalid.example';
    const routing = buildMesseLeadInternalMailRouting('jtn@timan.dk');
    expect(routing.to).toEqual(['jtn@timan.dk']);
    expect(routing.bcc).toEqual([MESSE_LEAD_BCC_EMAIL]);
    expect([...routing.to, ...routing.bcc]).not.toContain(customerEmail);
    expect(messePage).toContain("category: 'messe_lead'");
    expect(messePage).toContain("status: 'sent'");
    expect(messePage).toContain("status: 'failed'");
    expect(messePage).toContain('attachment_count: leadAttachments.length');
    expect(messePage).toContain("provider: 'n8n:timan-messe-lead'");
  });

  it('renders backend filters, row detail, and a CRM lead link without exposing the view to external roles', () => {
    for (const label of ['Dato', 'Alle kategorier', 'Alle statusser', 'Alle kilder', 'Alle ansvarlige', 'Maildetaljer']) {
      expect(overview).toContain(label);
    }
    expect(overview).toContain("if (!isBackend) return <Navigate to=\"/portal/backend\" replace />;");
    expect(overview).toContain("return `/portal/crm/leads/${event.related_entity_id}`;");
  });
});
