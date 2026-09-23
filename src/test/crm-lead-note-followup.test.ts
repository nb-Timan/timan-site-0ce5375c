import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));
vi.mock('@/lib/crmActivitiesService', () => ({ logActivity: vi.fn() }));

import {
  getCrmLeadFollowupState,
  saveCrmLeadNoteFollowup,
} from '@/lib/crmLeadNotesService';

const panel = readFileSync('src/components/crm/CrmLeadHistoryPanel.tsx', 'utf8');
const overview = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');
const detail = readFileSync('src/pages/crm/CrmNewLeadPage.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260921103715_crm_lead_note_followup_calendar.sql', 'utf8');

describe('CRM Quick Note follow-up and calendar flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ single: mocks.single });
  });

  it('reads the same canonical follow-up fields used by lead detail and overview', async () => {
    mocks.single.mockResolvedValue({
      data: {
        next_followup_date: '2026-10-12',
        next_activity: 'Follow-up on leads',
        probability: 25,
        pipeline_stage: 'Qualified',
      },
      error: null,
    });

    await expect(getCrmLeadFollowupState('lead-1')).resolves.toEqual({
      nextFollowupDate: '2026-10-12',
      nextActivity: 'Follow-up on leads',
      probability: 25,
      pipelineStage: 'Qualified',
    });
    expect(mocks.from).toHaveBeenCalledWith('crm_leads');
    expect(mocks.select).toHaveBeenCalledWith('next_followup_date, next_activity, probability, pipeline_stage');
    expect(mocks.eq).toHaveBeenCalledWith('id', 'lead-1');
  });

  it('saves note, follow-up and optional calendar through one scoped RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        note: {
          id: '11111111-1111-4111-8111-111111111111',
          lead_id: 'lead-1',
          description: 'Ring om tilbud',
          created_at: '2026-09-21T10:00:00.000Z',
          activity_date: '2026-09-21T10:00:00.000Z',
          created_by_name: 'NB',
          created_by_user_id: 'user-1',
          priority_position: null,
        },
        lead: {
          next_followup_date: '2026-10-12',
          next_activity: 'Follow-up on leads',
          probability: 25,
          pipeline_stage: 'Qualified',
        },
        calendar_activity_id: '22222222-2222-4222-8222-222222222222',
      },
      error: null,
    });

    const result = await saveCrmLeadNoteFollowup({
      noteId: '11111111-1111-4111-8111-111111111111',
      leadId: 'lead-1',
      leadTitle: 'L-1001',
      text: ' Ring om tilbud ',
      nextFollowupDate: '2026-10-12',
      nextActivity: 'Follow-up on leads',
      addToCalendar: true,
    });

    expect(mocks.rpc).toHaveBeenCalledWith('save_crm_lead_note_followup', {
      p_note_id: '11111111-1111-4111-8111-111111111111',
      p_lead_id: 'lead-1',
      p_note: 'Ring om tilbud',
      p_next_followup_date: '2026-10-12',
      p_next_activity: 'Follow-up on leads',
      p_add_to_calendar: true,
      p_lead_title: 'L-1001',
    });
    expect(result.calendarActivityId).toBe('22222222-2222-4222-8222-222222222222');
    expect(result.lead.nextFollowupDate).toBe('2026-10-12');
    expect(result.note.description).toBe('Ring om tilbud');
  });

  it('requires a date before requesting a calendar activity', async () => {
    await expect(saveCrmLeadNoteFollowup({
      noteId: '11111111-1111-4111-8111-111111111111',
      leadId: 'lead-1',
      text: 'Ring senere',
      nextFollowupDate: '',
      nextActivity: 'Follow-up on leads',
      addToCalendar: true,
    })).rejects.toThrow('Vælg en opfølgningsdato');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('enforces one linked calendar event per note and keeps RLS authoritative', () => {
    expect(migration).toContain('lead_activity_id uuid references public.crm_activities(id)');
    expect(migration).toContain('crm_calendar_activities_lead_activity_unique');
    expect(migration).toContain('on conflict (lead_activity_id) where lead_activity_id is not null');
    expect(migration).toContain('security invoker');
    expect(migration).toContain('when v_next_activity is null then lead.probability');
    expect(migration).toContain('when v_next_activity is null then lead.pipeline_stage');
    expect(migration).toContain('Lead not found or not permitted');
    expect(migration).toContain('delete from public.crm_calendar_activities');
    expect(migration).not.toContain('security definer');
    expect(migration).not.toContain('create policy');
  });

  it('uses the shared fields in both overview and detail without changing note history', () => {
    expect(panel).toContain('<CrmLeadFollowupFields');
    expect(panel).toContain("crmLeadText('addFollowupToCalendar', uiLanguage)");
    expect(panel).toContain('pendingNoteIdRef');
    expect(panel).toContain('sortCrmLeadNotes');
    expect(panel).toContain('setCrmLeadNotePriority');
    expect(overview).toContain('onFollowupChanged');
    expect(overview).toContain('void refreshLeads()');
    expect(detail).toContain('onFollowupChanged');
    expect(detail).toContain('setNextFollowup(followup.nextFollowupDate)');
    expect(detail).toContain('setNextActivity(followup.nextActivity)');
  });
});
