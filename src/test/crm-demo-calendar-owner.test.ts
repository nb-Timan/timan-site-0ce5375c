import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260921141040_crm_demo_calendar_owner_initials.sql'), 'utf8');

describe('linked demo calendar owner parity', () => {
  it('derives owner initials from the canonical owner id on insert and update', () => {
    expect(migration).toContain('seller_user_id, seller_name, seller_initials, activity_type');
    expect(migration).toContain('upper(trim(owner.initials))');
    expect(migration).toContain('from public.app_users owner where owner.id = new.owner_user_id');
    expect(migration).toContain('seller_initials = excluded.seller_initials');
  });

  it('preserves existing event upsert, scope and data without hardcoding a seller', () => {
    expect(migration).toContain("pg_get_functiondef('public.sync_crm_demo_calendar()'::regprocedure)");
    expect(migration).not.toMatch(/create policy|alter policy|grant |revoke |'AKR'|http|webhook|update public\./i);
    expect(migration).toContain("raise exception 'Demo calendar owner lookup was not installed'");
  });
});
