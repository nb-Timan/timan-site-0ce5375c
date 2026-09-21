import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NEXT_ACTIVITY_OPTIONS } from '@/lib/crmLeadsService';
import { crmDemoDateRequiredLabel, crmDemoMissingLabel, crmNextActivityLabel, normalizeDemoActivity, NEXT_ACTIVITY_DEMO_AGREED, NEXT_ACTIVITY_DEMO_REQUESTED } from '@/lib/crmDemoStageI18n';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';
import { nextActivityToProbability, nextActivityToLeadStatus } from '@/lib/leadStatus';

const migration = readFileSync('supabase/migrations/20260921144341_enforce_dated_crm_demo_registration.sql', 'utf8');
const form = readFileSync('src/pages/crm/CrmNewDemoLeadPage.tsx', 'utf8');
const leadForm = readFileSync('src/pages/crm/CrmNewLeadPage.tsx', 'utf8');

describe('dated canonical demo registration', () => {
  it('offers one requested option and retains legacy read compatibility', () => {
    expect(NEXT_ACTIVITY_OPTIONS.filter(value => value === NEXT_ACTIVITY_DEMO_REQUESTED)).toHaveLength(1);
    expect(NEXT_ACTIVITY_OPTIONS).not.toContain('Customer wants a demonstration');
    expect(NEXT_ACTIVITY_OPTIONS).not.toContain('Demo agreed');
    expect(normalizeDemoActivity('Customer wants a demonstration')).toBe(NEXT_ACTIVITY_DEMO_REQUESTED);
    expect(normalizeDemoActivity('Demo agreed')).toBe(NEXT_ACTIVITY_DEMO_AGREED);
    expect(normalizeDemoActivity('Offer sent to the customer')).toBe('Offer sent to the customer');
  });

  it('maps requested to 40 and scheduled to 50', () => {
    expect(nextActivityToProbability(NEXT_ACTIVITY_DEMO_REQUESTED)).toBe(40);
    expect(nextActivityToLeadStatus(NEXT_ACTIVITY_DEMO_REQUESTED)).toBe('Ønsker demo');
    expect(nextActivityToProbability(NEXT_ACTIVITY_DEMO_AGREED)).toBe(50);
    expect(nextActivityToLeadStatus(NEXT_ACTIVITY_DEMO_AGREED)).toBe('Demo aftalt');
  });

  it.each(PORTAL_LANGUAGE_CODES)('translates both activities and the incomplete warning in %s', language => {
    expect(crmNextActivityLabel(NEXT_ACTIVITY_DEMO_REQUESTED, language)).toBeTruthy();
    expect(crmNextActivityLabel(NEXT_ACTIVITY_DEMO_AGREED, language)).toBeTruthy();
    expect(crmDemoMissingLabel(language)).toBeTruthy();
    expect(crmDemoDateRequiredLabel(language)).toBeTruthy();
    if (language !== 'en') expect(crmDemoMissingLabel(language)).not.toBe(crmDemoMissingLabel('en'));
  });

  it('routes scheduled selection into the same-lead form instead of persisting a dropdown status', () => {
    expect(leadForm).toContain('if (na === NEXT_ACTIVITY_DEMO_AGREED && !repository.academy)');
    expect(leadForm).toContain('/portal/crm/demo-leads/new?fromLead=${encodeURIComponent(editId)}');
    expect(form).toContain('startCrmDemoRegistration(sourceLeadId)');
    expect(form).toContain('if (!repository.academy && !demoDate)');
    expect(form).toContain('crmDemoMissingLabel(uiLanguage)');
  });

  it('requires dated, non-cancelled same-lead evidence in the database', () => {
    expect(migration).toContain('source_lead_id = p_lead_id and demo_date is not null');
    expect(migration).toContain("not in ('canceled', 'cancelled')");
    expect(migration).toContain("message = 'DEMO_REGISTRATION_REQUIRED'");
    expect(migration).toContain("message = ''DEMO_DATE_REQUIRED''");
    expect(migration).toContain('new.owner_user_id is distinct from v_lead.owner_user_id');
    expect(migration).toContain('new.source_lead_id is distinct from old.source_lead_id');
  });

  it('only updates follow-up when explicitly requested, never writes expected close', () => {
    expect(migration).toContain("p_demo ->> ''update_followup''");
    expect(migration).toContain("then nullif(p_demo ->> ''followup_date'', '''')::date else next_followup_date end");
    expect(migration).toContain("position('next_followup_date =' in v) > 0");
    expect(migration).not.toMatch(/expected_close_date\s*=/);
    expect(form).toContain('update_followup: followupEdited');
  });

  it('keeps the existing unique demo/calendar model, history and invoker security', () => {
    expect(migration).not.toMatch(/create table|create policy|alter policy/i);
    expect(migration).toContain('for update');
    expect(migration).toContain('DEMO_ALREADY_LINKED');
    expect(migration).toContain("'demo_registration_started'");
    expect(migration).toContain("'demo_date_changed'");
    expect(migration).not.toMatch(/update public\.crm_activities/);
    expect(migration).toContain('security invoker');
    expect(migration).toContain('revoke all on function public.start_crm_demo_registration(uuid) from public, anon');
  });
});
