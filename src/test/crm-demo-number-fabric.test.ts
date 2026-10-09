import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatDemoNo } from '@/lib/crmLeadsService';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20261004075514_crm_demo_number_leads_fabric.sql');
const overview = read('src/pages/crm/CrmLeadsPage.tsx');

describe('CRM Demo number identity', () => {
  it('uses the canonical D-prefix exactly once and rejects invalid values', () => {
    expect(formatDemoNo(8028)).toBe('D-8028');
    expect(formatDemoNo('8028')).toBe('D-8028');
    expect(formatDemoNo('D-8028')).toBe('D-8028');
    expect(formatDemoNo('d-8028')).toBe('D-8028');
    expect(formatDemoNo('D-D-8028')).toBe('—');
    expect(formatDemoNo(null)).toBe('—');
  });

  it('renders a linked Demo number below the existing Lead reference without another column', () => {
    expect(overview).toContain("r.type === 'open' && r.demo_id && r.demo_no != null");
    expect(overview).toContain('data-testid="crm-leads-compact-demo-reference"');
    expect(overview).toContain('{compactDemoReference}');
    expect(overview).not.toContain("tt('col_demo_number', lang)");
  });

  it('returns the linked Demo identity and supports prefixed and number-only search', () => {
    expect(migration).toContain('dsl.linked_demo_id');
    expect(migration).toContain("''demo_id'', linked_demo_id");
    expect(migration).toContain("''demo_no'', linked_demo_no");
    expect(migration).toContain("r.linked_demo_no::text");
    expect(migration).toContain("''D-'' || r.linked_demo_no::text");
  });
});

describe('CRM Demo Fabric projection', () => {
  it('exports Demo and Lead identities as separate explicit columns', () => {
    expect(migration).toContain('create or replace view analytics_export.crm_demo_leads');
    expect(migration).toContain('demo.id as demo_id');
    expect(migration).toContain('demo.demo_no as demo_number');
    expect(migration).toContain('demo.source_lead_id');
    expect(migration).toContain('lead.id as lead_id');
    expect(migration).toContain('lead.lead_no as lead_number');
    expect(migration).not.toMatch(/jsonb_build_object[\s\S]*analytics_export\.crm_demo_leads/i);
  });

  it('keeps the analytics surface read-only and outside portal roles', () => {
    expect(migration).toContain('EXPLICIT_COLUMNS_ONLY');
    expect(migration).toContain('revoke all on schema analytics_export from public, anon, authenticated');
    expect(migration).toContain('revoke all on analytics_export.crm_demo_leads from public, anon, authenticated');
    expect(migration).toContain('grant select on analytics_export.crm_demo_leads to service_role');
    expect(migration).toContain("rolname = 'fabric_reader'");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all).*fabric_reader/i);
  });
});
