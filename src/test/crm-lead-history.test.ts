import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sortCrmLeadNotes, type CrmLeadNote } from '@/lib/crmLeadNotesService';

const activityService = readFileSync('src/lib/crmActivitiesService.ts', 'utf8');
const leadService = readFileSync('src/lib/crmLeadsService.ts', 'utf8');
const noteService = readFileSync('src/lib/crmLeadNotesService.ts', 'utf8');
const historyPanel = readFileSync('src/components/crm/CrmLeadHistoryPanel.tsx', 'utf8');
const overview = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');
const detail = readFileSync('src/pages/crm/CrmNewLeadPage.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260918072352_crm_lead_activity_history.sql', 'utf8');
const priorityMigration = readFileSync('supabase/migrations/20260918075503_crm_lead_note_priority.sql', 'utf8');
const priorityRpcMigration = readFileSync('supabase/migrations/20260918075848_fix_crm_lead_note_priority_rpc_argument.sql', 'utf8');
const priorityReturnMigration = readFileSync('supabase/migrations/20260918080029_fix_crm_lead_note_priority_rpc_return.sql', 'utf8');
const priorityGrantMigration = readFileSync('supabase/migrations/20260918080155_harden_crm_lead_note_priority_rpc_grants.sql', 'utf8');

function note(id: string, createdAt: string, priority: 1 | 2 | 3 | null = null): CrmLeadNote {
  return {
    id,
    lead_id: 'lead-a',
    description: id,
    created_at: createdAt,
    activity_date: createdAt,
    created_by_name: 'BP',
    created_by_user_id: null,
    priority_position: priority,
  };
}

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
    expect(overview).toContain('setHistoryTarget(r)');
    expect(overview).toContain('showComposer={false}');
    expect(detail).toContain('<CrmLeadHistoryPanel');
    expect(noteService).toContain("order('created_at', { ascending: false })");
    expect(historyPanel).toContain('Vis hele historikken');
  });

  it('keeps at most one pinned position per lead and uses the same priority order everywhere', () => {
    expect(priorityMigration).toContain('priority_position smallint');
    expect(priorityMigration).toContain("priority_position in (1, 2, 3)");
    expect(priorityMigration).toContain('crm_activities_lead_comment_priority_unique');
    expect(priorityMigration).toContain('set_crm_lead_note_priority');
    expect(priorityRpcMigration).toContain('p_priority integer');
    expect(priorityRpcMigration).toContain('p_priority::smallint');
    expect(priorityReturnMigration).toContain('returns void');
    expect(priorityReturnMigration).toContain('as occupied');
    expect(priorityGrantMigration).toContain('from anon');
    expect(priorityGrantMigration).toContain('to authenticated');
    expect(noteService).toContain(".order('priority_position', { ascending: true, nullsFirst: false })");
    expect(noteService).toContain('sortCrmLeadNotes');
    expect(historyPanel).toContain('Fastgør:');
    expect(historyPanel).toContain('Fjern');
  });

  it('orders priority 1/2/3 before newer unpinned notes', () => {
    const ordered = sortCrmLeadNotes([
      note('newest-normal', '2026-09-18T12:00:00.000Z'),
      note('priority-3', '2026-09-01T12:00:00.000Z', 3),
      note('priority-1', '2026-09-02T12:00:00.000Z', 1),
      note('priority-2', '2026-09-03T12:00:00.000Z', 2),
      note('older-normal', '2026-09-17T12:00:00.000Z'),
    ]);
    expect(ordered.map((entry) => entry.id)).toEqual([
      'priority-1', 'priority-2', 'priority-3', 'newest-normal', 'older-normal',
    ]);
  });

  it('keeps note dialogs wide on desktop without compromising mobile width', () => {
    expect(overview).toContain('w-[calc(100vw-2rem)] max-w-5xl');
  });

  it('preserves legacy lead free text without rewriting it into guessed records', () => {
    expect(historyPanel).toContain('Tidligere noter');
    expect(historyPanel).toContain('legacyNotes.trim()');
    expect(migration).not.toContain('update public.crm_leads set notes');
  });
});
