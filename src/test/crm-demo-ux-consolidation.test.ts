import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const leadDetail = readFileSync('src/pages/crm/CrmNewLeadPage.tsx', 'utf8');
const demoDetail = readFileSync('src/pages/crm/CrmDemoLeadDetailPage.tsx', 'utf8');
const demoOverview = readFileSync('src/pages/crm/CrmDemoLeadsPage.tsx', 'utf8');
const demoStats = readFileSync('src/components/crm/DemoStatsSection.tsx', 'utf8');
const demoRegistration = readFileSync('src/pages/crm/CrmNewDemoLeadPage.tsx', 'utf8');
const canonicalLifecycle = readFileSync('supabase/migrations/20260921082820_canonical_lead_demo_lifecycle.sql', 'utf8');

describe('canonical CRM Lead and Demo UX', () => {
  it('places the linked Demo section beside the lead header before the editable form', () => {
    expect(leadDetail.indexOf('<CrmLeadDemoSection leadId={editId} />')).toBeGreaterThan(0);
    expect(leadDetail.indexOf('<CrmLeadDemoSection leadId={editId} />')).toBeLessThan(leadDetail.indexOf('<form onSubmit={handleSubmit}>'));
    expect(leadDetail.match(/<CrmLeadDemoSection leadId=\{editId\} \/>/g)).toHaveLength(1);
  });

  it('uses one explicit lead return path and one canonical result route', () => {
    expect(demoDetail).toContain("text('backToLead')");
    expect(demoDetail).toContain("setParams({result: '1'})");
    expect(demoDetail).not.toContain('>CRM</Link>');
  });

  it('retires only the duplicate overview while preserving create and detail routes', () => {
    expect(demoOverview).toContain('<Navigate to="/portal/crm/leads?type=demo" replace />');
    expect(demoStats).toContain('to="/portal/crm/leads?type=demo"');
    expect(demoRegistration).toContain('/academy/crm/leads/${sourceLeadId}?academy_mode=true&academy_part=${academyPart}');
    expect(demoRegistration).toContain("'/portal/crm/leads?type=demo'");
  });

  it('keeps linked demos represented by their canonical lead row', () => {
    expect(canonicalLifecycle).toContain("from public.crm_demo_leads d where d.source_lead_id is null");
    expect(canonicalLifecycle).toContain('crm_demo_leads_one_source_lead');
  });
});
