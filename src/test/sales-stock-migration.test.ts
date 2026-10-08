import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261008115114_sales_stock_configurator_flow.sql', 'utf8');

describe('sales-stock database boundary', () => {
  it('uses additive source fields, physical snapshots and one live reservation per Fabric asset', () => {
    expect(sql).toContain('add column if not exists sales_source_type');
    expect(sql).toContain('create table if not exists public.sales_stock_configuration_assets');
    expect(sql).toContain("where reservation_status in ('ACTIVE','SOLD')");
    expect(sql).toContain("raise exception 'Physical asset is already reserved or sold'");
  });

  it('enforces internal roles, exact Fabric identity and controlled review/conflict state server-side', () => {
    expect(sql).toContain("u.portal_role::text in ('timan_backend','timan_seller')");
    expect(sql).toContain("v_fabric.classification <> 'LOAN_CANDIDATE'");
    expect(sql).toContain('v_fabric.review_required or v_fabric.identity_conflict');
    expect(sql).toContain("v_fabric.warehouse_location_code not in ('2','4')");
  });

  it('keeps pricing audit append-only and does not write Fabric-owned rows', () => {
    expect(sql).toContain('create table if not exists public.sales_stock_pricing_audit');
    expect(sql).toContain("raise exception 'Sales-stock pricing audit is append-only'");
    expect(sql).not.toMatch(/update\s+public\.fabric_loan_assets_current/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.fabric_loan_assets_current/i);
  });

  it('marks submitted assets sold and exposes the same reservation in the canonical stock snapshot', () => {
    expect(sql).toContain("then 'SOLD'");
    expect(sql).toContain('s.sales_committed');
    expect(sql).toContain('or s.sales_committed');
  });

  it('preserves scoped CRM view execution and keeps internal authorization out of browser RPC', () => {
    expect(sql).toMatch(/crm_configurations_view\s+with \(security_invoker = true\)/i);
    expect(sql).toMatch(
      /revoke all on function public\.sales_stock_actor_can_manage\(\) from public, anon, authenticated/i,
    );
    expect(sql).not.toMatch(/grant execute on function public\.sales_stock_actor_can_manage\(\) to authenticated/i);
  });
});
