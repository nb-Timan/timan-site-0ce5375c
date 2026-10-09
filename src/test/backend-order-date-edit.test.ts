import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { updateSubmittedOrderTimelineDetails } from '@/lib/configurationsService';

const migrationPath = 'supabase/migrations/20260917102138_backend_submitted_order_date_edit.sql';

describe('Backend submitted-order date edit', () => {
  it('validates chronological date input before calling the scoped RPC', async () => {
    expect((await updateSubmittedOrderTimelineDetails('order-id', {
      createdDate: '2026-09-15',
      sentDate: '2026-09-14',
    })).error).toContain('før');
  });

  it('keeps the server path Backend-only, audited, and limited to the two timeline dates', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const rpc = migration.slice(migration.indexOf('create or replace function public.update_submitted_order_timeline_dates'));

    expect(rpc).toContain('if not public.is_timan_backend() then');
    expect(rpc).toContain('security invoker');
    expect(rpc).toContain("set_config('app.submitted_order_date_edit', target.id::text, true)");
    expect(rpc).toContain("'submitted_order_dates_updated'");
    expect(rpc).toContain('set created_at = next_created_at,');
    expect(rpc).toContain('order_sent_at = next_order_sent_at');
    expect(rpc).not.toContain('delivery_date =');
    expect(rpc).not.toContain('submitted_at =');
    expect(rpc).not.toContain('total_price =');
    expect(rpc).not.toContain('payment_terms =');
  });

  it('extends the submitted-order guard only for the exact scoped date RPC', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain("current_setting('app.submitted_order_date_edit', true) = old.id::text");
    expect(migration).toContain("raise exception 'Submitted configurator orders are read-only'");
    expect(migration).toContain('revoke all on function public.update_submitted_order_timeline_dates(uuid, date, date) from public, anon');
  });
});
