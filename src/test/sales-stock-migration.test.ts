import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261008115114_sales_stock_configurator_flow.sql', 'utf8');
const sharedBrikSql = readFileSync('supabase/migrations/20261009054436_shared_brik_physical_groups.sql', 'utf8');

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

describe('shared Brik physical groups', () => {
  it('removes only global Brik uniqueness and preserves per-row Fabric identity', () => {
    expect(sharedBrikSql).toContain('drop constraint if exists loan_asset_portal_metadata_brik_number_key');
    expect(sharedBrikSql).toContain('loan_asset_portal_metadata_company_brik_idx');
    expect(sharedBrikSql).not.toMatch(/update\s+public\.fabric_loan_assets_current/i);
    expect(sharedBrikSql).not.toMatch(/delete\s+from\s+public\.fabric_loan_assets_current/i);
  });

  it('keeps Brik edits append-only audited with actor, old/new values and timestamp', () => {
    expect(sharedBrikSql).toContain('create table if not exists public.loan_asset_brik_audit');
    expect(sharedBrikSql).toContain('old_brik_number');
    expect(sharedBrikSql).toContain('new_brik_number');
    expect(sharedBrikSql).toContain('actor_app_user_id');
    expect(sharedBrikSql).toContain('changed_at timestamptz not null default now()');
    expect(sharedBrikSql).toContain('revoke all on public.loan_asset_brik_audit from public, anon, authenticated');
  });

  it('locks and protects the physical Brik group across loans and sales', () => {
    expect(sharedBrikSql).toContain("'loan-brik:'||v_company||':'||v_brik");
    expect(sharedBrikSql).toContain("raise exception 'Physical asset group is already allocated'");
    expect(sharedBrikSql).toContain("raise exception 'Physical asset group is already reserved or sold'");
    expect(sharedBrikSql).toContain('sales_stock_guard_physical_group_trigger');
  });

  it('keeps shared rows visible while flagging multiple serialized identities', () => {
    expect(sharedBrikSql).toContain('brik_group_size');
    expect(sharedBrikSql).toContain('brik_group_serial_conflict');
    expect(sharedBrikSql).toContain("raise exception 'Physical asset group has conflicting serial identities'");
  });
});
