import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const activityService = readFileSync('src/lib/crmActivitiesService.ts', 'utf8');
const leadService = readFileSync('src/lib/crmLeadsService.ts', 'utf8');
const noteService = readFileSync('src/lib/crmLeadNotesService.ts', 'utf8');
const historyPanel = readFileSync('src/components/crm/CrmLeadHistoryPanel.tsx', 'utf8');
const overview = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');
const detail = readFileSync('src/pages/crm/CrmNewLeadPage.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260918072352_crm_lead_activity_history.sql', 'utf8');

describe('CRM lead quick notes and history', () => {
  it('uses the canonical append-only activity stream, rather than a parallel notes table', () => {
    expect(noteService).toContain("from('crm_activities')");
    expect(noteService).toContain("activity_type: 'comment'");
    expect(noteService).toContain('lead_id: input.leadId');
    expect(activityService).toContain('lead_id: string | null');
    expect(activityService).toContain('lead_id: row.lead_id');
  });

  it('makes the lead relation first-class and backfills only deterministic legacy metadata', () => {
    expect(migration).toContain('add column if not exists lead_id uuid references public.crm_leads(id)');
    expect(migration).toContain("activity.meta ? 'lead_id'");
    expect(migration).toContain("activity.meta ->> 'lead_id' = lead.id::text");
    expect(migration).toContain('crm_activities_lead_comment_created_idx');
  });

  it('inherits the existing crm_leads RLS scope for new lead comments', () => {
    expect(migration).toContain('crm_activities_lead_history_scoped_access');
    expect(migration).toContain('from public.crm_leads lead');
    expect(migration).toContain('where lead.id = crm_activities.lead_id');
    expect(migration).not.toContain('create table public.crm_lead_notes');
  });

  it('keeps newly created lead activity tied to the same lead', () => {
    expect(leadService).toContain('lead_id: row.id');
    expect(leadService).toContain('lead_id: row.id,\n        machine_types');
  });

  it('shows the same chronological history from the overview and lead detail', () => {
    expect(overview).toContain('<CrmLeadHistoryPanel');
    expect(overview).toContain('initialLimit={3}');
    expect(overview).toContain('notesByLeadId');
    expect(detail).toContain('<CrmLeadHistoryPanel');
    expect(noteService).toContain("order('created_at', { ascending: false })");
    expect(historyPanel).toContain('Vis hele historikken');
  });

  it('preserves legacy lead free text without rewriting it into guessed records', () => {
    expect(historyPanel).toContain('Tidligere noter');
    expect(historyPanel).toContain('legacyNotes.trim()');
    expect(migration).not.toContain('update public.crm_leads set notes');
  });
});
