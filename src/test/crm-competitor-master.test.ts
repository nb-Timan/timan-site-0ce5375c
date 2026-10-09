import { describe, expect, it } from 'vitest';
import { competitorGroupsForMachine, findPotentialCompetitorDuplicate, normalizeCompetitorName, type CrmCompetitor } from '@/lib/crmCompetitorsService';
import { crmCompetitorText } from '@/lib/crmCompetitorI18n';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261004084418_crm_competitor_master_demo_inline.sql'), 'utf8');
const hako: CrmCompetitor = { id: 'hako-id', name: 'Hako', active: true, country_code: null, website_url: null, created_at: '', updated_at: '', machine_groups: ['RC-1000s', 'Timan 3330'] };

describe('canonical CRM competitor master', () => {
  it('warns on spelling/case/company-suffix duplicates without merging names', () => {
    expect(normalizeCompetitorName('HAKO GmbH')).toBe('hako');
    expect(normalizeCompetitorName('AS Motor')).toBe('as motor');
    expect(normalizeCompetitorName('Motor')).toBe('motor');
    expect(findPotentialCompetitorDuplicate('HAKO GmbH', [hako])?.id).toBe(hako.id);
    expect(findPotentialCompetitorDuplicate('Hako', [hako], hako.id)).toBeUndefined();
  });
  it('reuses canonical machine groups and treats country as metadata', () => {
    expect(competitorGroupsForMachine('RC-1000s')).toEqual(['RC-1000s']);
    expect(competitorGroupsForMachine('Timan 3330')).toEqual(['Timan 3330']);
    expect(hako.machine_groups).toHaveLength(2);
  });
  it('has complete competitor UI labels for all nine portal languages', () => {
    expect(PORTAL_LANGUAGE_CODES).toHaveLength(9);
    for (const language of PORTAL_LANGUAGE_CODES) {
      for (const key of ['competitor', 'choose', 'relevant', 'all', 'new', 'country', 'website', 'machines', 'active', 'inactive', 'otherName'] as const) {
        expect(crmCompetitorText(key, language)).toBeTruthy();
      }
    }
  });
  it('keeps text snapshots, maps only exact matches, and exports relational data', () => {
    expect(migration).toContain('lower(btrim(l.lost_competitor)) = lower(btrim(c.name))');
    expect(migration).toContain('lower(btrim(d.competitor_name)) = lower(btrim(c.name))');
    expect(migration).toContain('create or replace view analytics_export.crm_competitor_machine_groups');
    expect(migration).toContain('create or replace view analytics_export.crm_lost_deals');
    expect(migration).toContain('demo.interest_level as customer_interest');
    expect(migration).toContain('demo.competitor_id, c.name as competitor_name');
    expect(migration).toContain('revoke all on analytics_export.crm_competitors');
    expect(migration).not.toContain('delete from public.crm_leads');
  });
});
