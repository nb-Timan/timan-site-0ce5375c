import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const script = readFileSync('scripts/backfill-mail-audit-2026-09-02-to-16.sql', 'utf8');

describe('14-day mail audit backfill', () => {
  it('is fixed to the approved 14-day window and only uses documented configurator sends', () => {
    expect(script).toContain("timestamptz '2026-09-02 05:43:52.891514+00' as window_start");
    expect(script).toContain("timestamptz '2026-09-16 05:43:52.891514+00' as window_end");
    expect(script).toContain('c.quote_sent_at >= k.window_start');
    expect(script).toContain('c.order_sent_at >= k.window_start');
    expect(script).toContain("'n8n:timan-afsend-tilbud'::text as provider");
    expect(script).toContain("'n8n:timan-afsend-ordre'::text as provider");
  });

  it('reconstructs only metadata and protects against stale state and duplicate imports', () => {
    expect(script).toContain("c.updated_at <= c.quote_sent_at + interval '1 second'");
    expect(script).toContain("c.updated_at <= c.order_sent_at + interval '1 second'");
    expect(script).toContain("c.state_json ->> 'email'");
    expect(script).toContain("c.state_json ->> 'emailRecipient'");
    expect(script).toContain("'sales@timan.dk'::text as internal_bcc");
    expect(script).toContain('lock table public.mail_audit_events in share row exclusive mode');
    expect(script).toContain('and not exists (');
    expect(script).toContain('existing.related_entity_id = n.configuration_id');
    expect(script).not.toMatch(/html_body|text_body|attachment_content/i);
  });

  it('does not claim unavailable n8n metadata as historical fact', () => {
    expect(script).toContain('null, -- n8n execution history is unavailable; do not fabricate a subject.');
    expect(script).toContain('null, -- Provider message IDs are not stored in the portal for this period.');
    expect(script).toContain('Deliberately excluded: Messe and all other categories.');
  });
});
