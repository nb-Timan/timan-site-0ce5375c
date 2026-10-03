import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { rpc, from, update, eq } = vi.hoisted(() => {
  const single = vi.fn(async () => ({ data: { id: 'demo-1', demo_date: '2026-10-17' }, error: null }));
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  return {
    rpc: vi.fn(async () => ({
      data: { lead_id: 'lead-1', lead_no: 1048, demo_id: 'demo-1', demo_no: 8001, demo_date: null },
      error: null,
    })),
    from: vi.fn(() => ({ update })),
    update,
    eq,
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, from } }));

import { createCrmDemoLifecycle, saveCrmDemoResult, updateDemoLeadDate } from '@/lib/crmLeadsService';
import { EMPTY_DEMO_RESULT } from '@/lib/crmDemoFlow';
import { demoFlowText } from '@/lib/crmDemoFlowI18n';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import {
  deriveLegacyPipelineStage,
  effectiveLeadProbability,
  effectiveLeadStatus,
  nextActivityToLeadStatus,
} from '@/lib/leadStatus';

const baseDemo = {
  title: 'TEST demo',
  owner_user_id: 'seller-1', owner_name: 'AKR', owner_email: 'akr@timan.dk',
  dealer_company: 'Test dealer', dealer_rep: null, customer_name: 'TEST customer', customer_address: null,
  notes: null, machine_category: ['Timan machine'], demo_machine: 'RC-751', demo_equipment: [],
  demo_date: null, interest_level: 3, wants_offer: 'no' as const, followup_date: '2026-11-12',
  estimated_value: 1000, probability: 40, competitors_present: 'no' as const, competitor_name: null,
  notes_after_demo: null, result_status: 'Warm lead', attachments: [], source_lead_id: 'lead-1',
};

describe('canonical lead → demo lifecycle', () => {
  it('records results through the same scoped demo without a create operation', async () => {
    const result = { ...EMPTY_DEMO_RESULT, interest_level: 4, competitors_present: 'yes' as const };
    await saveCrmDemoResult('demo-1', result, 'seller-1');
    expect(rpc).toHaveBeenLastCalledWith('save_crm_demo_result', {
      p_demo_id: 'demo-1', p_result: result, p_effective_user_id: 'seller-1',
    });
  });

  it('edits the same demo and lead with explicit effective scope', async () => {
    await createCrmDemoLifecycle({ ...baseDemo, demo_id: 'demo-1', effective_user_id: 'seller-1' });
    expect(rpc).toHaveBeenLastCalledWith('save_crm_demo_registration', expect.objectContaining({
      p_demo_id: 'demo-1', p_source_lead_id: 'lead-1', p_effective_user_id: 'seller-1',
    }));
  });

  it('keeps an existing lead as the source of truth and sends its id to the atomic RPC', async () => {
    const result = await createCrmDemoLifecycle({ ...baseDemo, dealer_account_id: 'dealer-1', machine_interest: ['RC-751'] });
    expect(result).toMatchObject({ lead_id: 'lead-1', demo_id: 'demo-1', lead_no: 1048 });
    expect(rpc).toHaveBeenCalledWith('save_crm_demo_registration', expect.objectContaining({
      p_source_lead_id: 'lead-1',
      p_demo: expect.objectContaining({
        dealer_account_id: 'dealer-1',
        dealer_rep_contact_id: null,
        dealer_rep_user_id: null,
        machine_interest: ['RC-751'],
        demo_date: null,
      }),
    }));
  });

  it('sends the selected canonical dealer-person reference with the name snapshot', async () => {
    await createCrmDemoLifecycle({
      ...baseDemo,
      dealer_account_id: 'dealer-1',
      dealer_rep: 'Dag Vilster Petersen',
      dealer_rep_user_id: 'user-dvp',
      machine_interest: ['RC-751'],
    });
    expect(rpc).toHaveBeenCalledWith('save_crm_demo_registration', expect.objectContaining({
      p_demo: expect.objectContaining({
        dealer_rep: 'Dag Vilster Petersen',
        dealer_rep_contact_id: null,
        dealer_rep_user_id: 'user-dvp',
      }),
    }));
  });

  it('distinguishes a requested demo from an agreed demo without using expected close as the demo date', () => {
    expect(nextActivityToLeadStatus('Customer wants a demonstration')).toBe('Ønsker demo');
    expect(effectiveLeadProbability({ next_activity: 'Customer wants a demonstration', pipeline_stage: 'Qualified', probability: 40 })).toBe(40);
    expect(nextActivityToLeadStatus('Customer requests a demonstration')).toBe('Ønsker demo');
    expect(effectiveLeadProbability({ next_activity: 'Customer requests a demonstration', pipeline_stage: 'Qualified', probability: 40 })).toBe(40);
    expect(nextActivityToLeadStatus('Demo agreed')).toBe('Demo aftalt');
    expect(effectiveLeadProbability({ next_activity: 'Demo agreed', pipeline_stage: 'Qualified', probability: 50 })).toBe(50);
    expect(deriveLegacyPipelineStage('Customer wants a demonstration')).toBe('Qualified');
    expect(effectiveLeadStatus({ next_activity: 'Customer wants a demonstration', pipeline_stage: 'Qualified' })).toBe('Ønsker demo');
    expect(effectiveLeadStatus({
      next_activity: 'Demo agreed', pipeline_stage: 'Qualified', demo_has_run: 'yes',
    })).toBe('Demo afholdt');
  });

  it('keeps the existing demo-held toggle in the canonical activity and calendar path', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260921085622_lead_demo_held_status_history.sql'), 'utf8');
    expect(sql).toContain("'demo_held'");
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain('append_crm_demo_held_history');
  });

  it('lets the server resolve the authenticated actor when no view-as id is available', async () => {
    const result = { ...EMPTY_DEMO_RESULT, interest_level: 4, competitors_present: 'yes' as const };
    await saveCrmDemoResult('demo-1', result, null);
    expect(rpc).toHaveBeenLastCalledWith('save_crm_demo_result', {
      p_demo_id: 'demo-1', p_result: result, p_effective_user_id: null,
    });
  });

  it('localizes the simplified result flow in every portal language', () => {
    const languages: PortalUiLanguage[] = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];
    for (const language of languages) {
      for (const key of ['demoRun', 'open', 'edit', 'recordResult', 'editResult', 'interestSummary', 'competitorsSummary', 'yes', 'no'] as const) {
        expect(demoFlowText(key, language)).toBeTruthy();
        expect(demoFlowText(key, language)).not.toBe(key);
      }
    }
  });

  it('allows completed operational edits without changing result or completion fields', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261003221848_allow_completed_demo_operational_edits.sql'), 'utf8');
    const operationalUpdate = sql.match(/update crm_demo_leads set[\s\S]*?where id=p_demo_id returning \* into demo;/)?.[0] ?? '';
    expect(sql).not.toContain('DEMO_ALREADY_COMPLETED');
    expect(sql).toContain('security invoker');
    expect(operationalUpdate).toContain("demo_date=(payload->>'demo_date')::date");
    expect(operationalUpdate).toContain('dealer_account_id=dealer.id');
    expect(operationalUpdate).not.toMatch(/\b(interest_level|competitors_present|completed_at|completed_by|result_status)\s*=/);
  });

  it('keeps commercial lead data out of the current demo-result write path', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261003203723_simplify_crm_demo_result.sql'), 'utf8');
    const leadUpdate = sql.match(/update public\.crm_leads[\s\S]*?where id = lead_row\.id;/)?.[0] ?? '';
    expect(leadUpdate).toContain("demo_has_run = 'yes'");
    expect(leadUpdate).toContain('demo_registration_pending = false');
    expect(leadUpdate).not.toMatch(/\b(probability|estimated_value|next_followup_date|next_activity|status|pipeline_stage|notes)\s*=/);
    expect(sql).toContain('interest_level = interest');
    expect(sql).toContain('competitors_present = competitors');
    expect(sql).toContain('completed_at = coalesce(completed_at, now())');
    expect(sql).not.toMatch(/drop\s+column/i);
  });

  it('records one canonical completion event with demo date and dealer context', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261003203723_simplify_crm_demo_result.sql'), 'utf8');
    expect(sql).toContain("old.demo_has_run is not distinct from 'yes'");
    expect(sql).toContain("'demo_date', v_demo.demo_date");
    expect(sql).toContain("'dealer_company', nullif(v_demo.dealer_company, '')");
    expect(sql).toContain("to_char(v_demo.demo_date, 'DD-MM-YYYY')");
  });

  it('guards one linked demo and one calendar event per canonical demo in the migration', () => {
    const baseSql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260921082820_canonical_lead_demo_lifecycle.sql'), 'utf8');
    const normalizedSql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260921120628_normalize_crm_demo_stages.sql'), 'utf8');
    expect(baseSql).toContain('crm_demo_leads_one_source_lead');
    expect(baseSql).toContain('crm_calendar_activities_one_demo');
    expect(normalizedSql).toContain('on conflict (demo_lead_id)');
    expect(normalizedSql).toContain("'Demo agreed'");
    expect(normalizedSql).toContain('next_followup_date = new.demo_date');
    expect(normalizedSql).not.toMatch(/expected_close_date\s*=/);
  });

  it('reschedules the existing demo record, allowing the calendar trigger to update its one event', async () => {
    await updateDemoLeadDate('demo-1', '2026-10-17');
    expect(from).toHaveBeenCalledWith('crm_demo_leads');
    expect(update).toHaveBeenCalledWith({ demo_date: '2026-10-17' });
    expect(eq).toHaveBeenCalledWith('id', 'demo-1');
  });
});
