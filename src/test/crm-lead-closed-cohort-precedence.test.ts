import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isLostLead,
  isOpenLead,
  isWonLead,
  NEXT_ACTIVITY_LOST,
  NEXT_ACTIVITY_WON,
} from '@/lib/leadStatus';
import type { CrmLead } from '@/lib/crmLeadsService';

const migration = readFileSync(
  'supabase/migrations/20260928103153_canonical_crm_lead_closed_precedence.sql',
  'utf8',
);

function lead(overrides: Partial<CrmLead>): CrmLead {
  return {
    id: 'lead',
    lead_no: 1200,
    title: 'Regression fixture',
    owner_user_id: null,
    owner_name: null,
    linked_dealer_id: null,
    first_contact_date: null,
    expected_close_date: null,
    next_followup_date: null,
    machine_types: [],
    next_activity: 'Follow-up on leads',
    demo_has_run: null,
    contact_type: null,
    customer_type: null,
    contact_information: null,
    trade_fair: null,
    country: null,
    notes: null,
    estimated_value: null,
    probability: 25,
    pipeline_stage: 'Qualified',
    lost_competitor: null,
    lost_reason: null,
    lost_comment: null,
    attachments: [],
    status: 'open',
    created_at: '',
    updated_at: '',
    ...overrides,
  } as CrmLead;
}

describe('canonical CRM lead closed cohort precedence', () => {
  const rows = [
    lead({ id: 'g-5166', lead_no: 5166, status: 'closed', pipeline_stage: 'Lost', probability: 0, next_activity: NEXT_ACTIVITY_LOST, demo_has_run: 'yes' }),
    lead({ id: 'g-won', lead_no: 5017, status: 'closed', pipeline_stage: 'Won', probability: 100, next_activity: NEXT_ACTIVITY_WON, demo_has_run: 'yes' }),
    lead({ id: 'modern-open', lead_no: 1200, status: 'open', pipeline_stage: 'Qualified', demo_has_run: 'yes' }),
  ];

  it('uses the same canonical predicates for open, won and lost counters', () => {
    expect({
      open: rows.filter(isOpenLead).length,
      won: rows.filter(isWonLead).length,
      lost: rows.filter(isLostLead).length,
    }).toEqual({ open: 1, won: 1, lost: 1 });
  });

  it('keeps legacy closure activities out of open even when demo history remains', () => {
    const legacyLost = lead({ next_activity: NEXT_ACTIVITY_LOST, demo_has_run: 'yes' });
    const legacyWon = lead({ next_activity: NEXT_ACTIVITY_WON, demo_has_run: 'yes' });

    expect(isOpenLead(legacyLost)).toBe(false);
    expect(isLostLead(legacyLost)).toBe(true);
    expect(isOpenLead(legacyWon)).toBe(false);
    expect(isWonLead(legacyWon)).toBe(true);
  });

  it('patches list rows and counters through the same tab_bucket cohort', () => {
    expect(migration).toContain("count(*) filter (where tab_bucket = ''open'')");
    expect(migration).toContain("when ''open'' then r.tab_bucket = ''open''");
    expect(migration).toContain('crm_leads_page_query');
    expect(migration).toContain('crm_dashboard_lead_kpis');
  });

  it('does not rewrite CRM lead, demo, owner or history rows', () => {
    expect(migration).not.toMatch(/update\s+public\.crm_leads/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.crm_leads/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.crm_leads/i);
    expect(migration).not.toMatch(/disable\s+row\s+level\s+security/i);
  });
});
