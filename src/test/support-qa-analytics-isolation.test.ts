import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260928183336_support_qa_interaction_isolation.sql'),
  'utf8',
);

describe('Support QA analytics isolation', () => {
  it('marks QA conversations without deleting immutable action evidence', () => {
    expect(migration).toContain('add column if not exists is_qa boolean not null default false');
    expect(migration).not.toContain('delete from public.support_assistant_action_audit');
    expect(migration).not.toContain('drop table public.support_assistant_action_audit');
  });

  it('excludes QA conversations from every production-facing action metric', () => {
    const metricKeys = [
      'configuration_started',
      'configuration_completed',
      'quote_previewed',
      'quote_created',
      'lead_created_or_linked',
      'pdf_generated',
      'email_prepared',
      'email_sent',
      'sales_handoffs',
      'service_handoffs',
      'failed_actions',
      'open_workflows',
    ];

    for (const key of metricKeys) {
      expect(migration).toContain(`'${key}'`);
    }
    expect(migration.match(/and not c\.is_qa/g)).toHaveLength(metricKeys.length);
  });

  it('keeps the action overview protected by canonical Support authorization', () => {
    expect(migration).toContain('if not public.can_access_support() then');
    expect(migration).toContain("raise exception 'FORBIDDEN'");
    expect(migration).toContain('grant execute on function public.get_support_action_overview() to authenticated');
  });
});
