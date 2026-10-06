import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261006101528_configurator_planning_availability_rpc.sql',
  'utf8',
);

describe('Configurator Planning availability RPC security', () => {
  it('authorizes only active approved internal Timan users or canonical account 100', () => {
    expect(migration).toContain("actor.portal_role::text in ('timan_backend', 'timan_seller', 'timan_service')");
    expect(migration).toContain("btrim(coalesce(actor.dealer_number, '')) = '100'");
    expect(migration).toContain('actor.approved is true');
    expect(migration).toContain('actor.is_active is true');
  });

  it('uses a locked definer boundary without broad Planning grants or RLS changes', () => {
    expect(migration.match(/security definer/g)).toHaveLength(2);
    expect(migration.match(/set search_path = ''/g)).toHaveLength(2);
    expect(migration).toContain('CONFIGURATOR_AVAILABILITY_ACCESS_DENIED');
    expect(migration).toContain('revoke all on function public.planning_get_configurator_availability');
    expect(migration).toContain('from public, anon');
    expect(migration).toContain('to authenticated');
    expect(migration).not.toMatch(/grant\s+(select|insert|update|delete)\s+on/i);
    expect(migration).not.toMatch(/create\s+policy|alter\s+policy/i);
  });

  it('returns only the five aggregate Configurator fields', () => {
    const returnBlock = migration.slice(migration.indexOf("return pg_catalog.jsonb_build_object("));
    const keys = [...returnBlock.matchAll(/'([a-z_]+)'\s*,/g)].map((match) => match[1]);
    expect(keys).toEqual([
      'sku',
      'free_stock_qty',
      'next_incoming_date',
      'next_incoming_qty',
      'availability_status',
    ]);
  });

  it('never returns identifiers or commercial and reservation relations', () => {
    const returnBlock = migration.slice(migration.indexOf("return pg_catalog.jsonb_build_object("));
    for (const forbidden of [
      'serial_number', 'reservation_type', 'configuration_id', 'order_number',
      'customer_name', 'dealer_account_id', 'sales_order_number',
    ]) {
      expect(returnBlock).not.toContain(`'${forbidden}'`);
    }
  });
});
