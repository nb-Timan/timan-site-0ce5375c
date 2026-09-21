import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const original = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260828130247_audit_log_operational.sql'), 'utf8');
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260921135240_crm_demo_audit_optional_customer_type.sql'), 'utf8');
const originalFunction = original.slice(original.indexOf('create or replace function public.audit_crm_lead_change()'), original.indexOf('do $$', original.indexOf('create or replace function public.audit_crm_lead_change()')));
const patched = originalFunction
  .replaceAll('new.customer_type', "(to_jsonb(new) ->> 'customer_type')")
  .replaceAll('old.customer_type', "(to_jsonb(old) ->> 'customer_type')");

describe('shared CRM lead/demo audit trigger', () => {
  it('uses nullable JSON extraction for the optional field on insert, update and delete', () => {
    expect(migration).toContain("replace(v_definition, 'new.customer_type', '(to_jsonb(new) ->> ''customer_type'')')");
    expect(migration).toContain("replace(v_definition, 'old.customer_type', '(to_jsonb(old) ->> ''customer_type'')')");
    expect(patched).not.toMatch(/\b(?:new|old)\.customer_type/);
    expect(patched).toContain("label := coalesce(new.title, (to_jsonb(new) ->> 'customer_type'), new.id::text)");
    expect(patched).toContain("label := coalesce(new.title, old.title, (to_jsonb(new) ->> 'customer_type'), (to_jsonb(old) ->> 'customer_type'), new.id::text)");
    expect(patched).toContain("label := coalesce(old.title, (to_jsonb(old) ->> 'customer_type'), old.id::text)");
  });

  it('preserves audit payloads, changed fields, actor attribution and no-op handling', () => {
    for (const contract of ['public.audit_current_actor()', 'public.audit_filter_payload(to_jsonb(new))', 'public.audit_filter_payload(to_jsonb(old))', 'public.audit_changed_fields(old_payload, new_payload)', 'insert into public.audit_log', 'a.actor_user_id', "coalesce(array_length(changed, 1), 0) = 0", 'tg_table_name']) {
      expect(patched).toContain(contract);
    }
  });

  it('does not change RLS, privileges, security mode, trigger attachments or business data', () => {
    expect(migration).toContain("pg_get_functiondef('public.audit_crm_lead_change()'::regprocedure)");
    expect(migration).not.toMatch(/security definer|create policy|alter policy|grant |revoke |disable trigger|drop trigger|update public\.|delete from public\./i);
    expect(migration).toContain("raise exception 'Unexpected CRM audit function");
  });
});
