import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lifecycleMigration = () => readFileSync(
  'supabase/migrations/20260916105103_configurator_sent_quote_crm_lead_lifecycle.sql',
  'utf8',
);
const completenessMigration = () => readFileSync(
  'supabase/migrations/20260916123659_restore_configurator_offer_lead_completeness.sql',
  'utf8',
);

describe('Configurator sent offer CRM lead lifecycle', () => {
  it('creates and links one canonical lead for a sent quote without a lead', () => {
    const sql = lifecycleMigration();
    expect(sql).toContain('create or replace function public.ensure_sent_configuration_quote_lead');
    expect(sql).toContain('insert into public.crm_leads');
    expect(sql).toContain("set lead_id = v_lead_id");
    expect(sql).toContain("'Offer sent to the customer'");
    expect(sql).toContain("'Offer sent'");
    expect(sql).toContain("'open'");
  });

  it('preserves the existing lead for a quote started from CRM', () => {
    const sql = lifecycleMigration();
    expect(sql).toContain('v_lead_id := v_configuration.lead_id');
    expect(sql).toContain('if v_lead_id is null then');
    expect(sql).toContain('else\n    -- A manually closed lead is authoritative.');
  });

  it('resolves legacy Configurator auth ids to canonical app user ids', () => {
    const sql = lifecycleMigration();
    expect(sql).toContain('v_created_by_app_user_id uuid');
    expect(sql).toContain('u.auth_user_id = v_configuration.created_by_user_id');
    expect(sql).toContain('v_created_by_app_user_id');
  });

  it('does not reopen a lost or won lead when a quote is re-sent', () => {
    const sql = lifecycleMigration();
    expect(sql).toContain("coalesce(status, 'open') <> 'closed'");
    expect(sql).toContain("coalesce(pipeline_stage, '') not in ('Won', 'Lost')");
    expect(sql).toContain("'Closed with order', 'Closed without order', 'Not relevant'");
  });

  it('backfills only sent, non-order, active quotes and remains idempotent', () => {
    const sql = lifecycleMigration();
    expect(sql).toContain('for update;');
    expect(sql).toContain('quote_sent_at is not null');
    expect(sql).toContain('order_sent_at is null');
    expect(sql).toContain('submitted_at is null');
    expect(sql).toContain("coalesce(lower(case_status), '') <> 'deleted'");
  });

  it('keeps offer progress separate from CRM completion for auto-created leads', () => {
    const sql = completenessMigration();
    expect(sql).toContain("'Offer sent'");
    expect(sql).toContain("'open'");
    expect(sql).toContain('true,\n      v_created_by_app_user_id');
    expect(sql).toContain("l.pipeline_value_snapshot_reason = 'configurator_sent_quote'");
    expect(sql).toContain('incomplete_from_configurator = true');
  });

  it('does not clear incomplete state when a quote is synced before CRM completion', () => {
    const sql = completenessMigration();
    const existingLeadSection = sql.slice(sql.indexOf('else\n    -- A manually closed lead'));
    expect(existingLeadSection).not.toContain('incomplete_from_configurator = false');
  });
});
