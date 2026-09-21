import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  crmDemoStageLabel,
  crmNextActivityLabel,
  NEXT_ACTIVITY_DEMO_AGREED,
  NEXT_ACTIVITY_DEMO_REQUESTED,
} from '@/lib/crmDemoStageI18n';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260921120628_normalize_crm_demo_stages.sql'),
  'utf8',
);

describe('canonical CRM demo stage normalization', () => {
  it('maps a requested demo to 40% and a dated linked demo to the agreed 50% stage', () => {
    expect(migration).toContain("v_demo_date is null then 'Customer requests a demonstration' else 'Demo agreed'");
    expect(migration).toContain("v_demo_date is null then 40 else 50");
    expect(migration).toContain("next_activity = 'Demo agreed'");
    expect(migration).toContain('next_followup_date = new.demo_date');
  });

  it('preserves expected close and completed-demo lifecycle', () => {
    expect(migration).not.toMatch(/expected_close_date\s*=/);
    expect(migration).toContain("v_lead.demo_has_run = 'yes'");
    expect(migration).toContain("lead.demo_has_run is distinct from 'yes'");
  });

  it('backfills only deterministic requested or linked-dated records without creating rows', () => {
    expect(migration).toContain("lead.next_activity in ('Customer wants a demonstration', 'Customer requests a demonstration')");
    expect(migration).toContain('demo.source_lead_id = lead.id');
    expect(migration).toContain('demo.demo_date is not null');
    expect(migration).not.toMatch(/insert into public\.crm_demo_leads[\s\S]*-- Deterministic live backfill[\s\S]*insert into public\.crm_demo_leads/);
  });

  it('provides requested/agreed labels for all nine portal languages', () => {
    expect(PORTAL_LANGUAGE_CODES).toHaveLength(9);
    for (const language of PORTAL_LANGUAGE_CODES) {
      expect(crmDemoStageLabel('requested', language)).toBeTruthy();
      expect(crmDemoStageLabel('agreed', language)).toBeTruthy();
      expect(crmDemoStageLabel('held', language)).toBeTruthy();
      expect(crmNextActivityLabel(NEXT_ACTIVITY_DEMO_REQUESTED, language)).toBeTruthy();
      expect(crmNextActivityLabel(NEXT_ACTIVITY_DEMO_AGREED, language)).toBeTruthy();
    }
  });

  it('uses the canonical DA/EN/DE terminology', () => {
    expect(crmDemoStageLabel('requested', 'da')).toBe('Ønsker demo');
    expect(crmDemoStageLabel('agreed', 'da')).toBe('Demo aftalt');
    expect(crmDemoStageLabel('requested', 'en')).toBe('Demo requested');
    expect(crmDemoStageLabel('agreed', 'en')).toBe('Demo agreed');
    expect(crmDemoStageLabel('requested', 'de')).toBe('Demo gewünscht');
    expect(crmDemoStageLabel('agreed', 'de')).toBe('Demo vereinbart');
  });
});
