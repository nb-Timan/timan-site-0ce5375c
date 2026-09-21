import { logActivity, type CrmActivity } from '@/lib/crmActivitiesService';
import { supabase } from '@/lib/supabase';

export type CrmLeadNote = Pick<
  CrmActivity,
  'id' | 'lead_id' | 'description' | 'created_at' | 'activity_date' | 'created_by_name' | 'created_by_user_id'
> & {
  priority_position: CrmLeadNotePriority | null;
};

export type CrmLeadNotePriority = 1 | 2 | 3;

export interface CrmLeadDemoHistoryEvent {
  id: string;
  lead_id: string | null;
  title: string | null;
  description: string | null;
  created_at: string;
  created_by_name: string | null;
  activity_type?: string;
  registration_event?: boolean;
}

export interface CreateCrmLeadNoteInput {
  leadId: string;
  text: string;
  leadTitle?: string | null;
  authorUserId?: string | null;
  authorName?: string | null;
  ownerUserId?: string | null;
  ownerName?: string | null;
}

export interface CrmLeadFollowupState {
  nextFollowupDate: string;
  nextActivity: string;
  probability: number | null;
  pipelineStage: string | null;
}

export interface SaveCrmLeadNoteFollowupInput {
  noteId: string;
  leadId: string;
  leadTitle?: string | null;
  text: string;
  nextFollowupDate: string;
  nextActivity: string;
  addToCalendar: boolean;
}

export interface SaveCrmLeadNoteFollowupResult {
  note: CrmLeadNote;
  lead: CrmLeadFollowupState;
  calendarActivityId: string | null;
}

function mapNote(row: Record<string, unknown>): CrmLeadNote {
  return {
    id: String(row.id ?? ''),
    lead_id: typeof row.lead_id === 'string' ? row.lead_id : null,
    description: typeof row.description === 'string' ? row.description : null,
    created_at: String(row.created_at ?? row.activity_date ?? ''),
    activity_date: String(row.activity_date ?? row.created_at ?? ''),
    created_by_name: typeof row.created_by_name === 'string' ? row.created_by_name : null,
    created_by_user_id: typeof row.created_by_user_id === 'string' ? row.created_by_user_id : null,
    priority_position: row.priority_position === 1 || row.priority_position === 2 || row.priority_position === 3
      ? row.priority_position
      : null,
  };
}

/** Pinned positions always come before ordinary notes, which stay newest-first. */
export function sortCrmLeadNotes(notes: CrmLeadNote[]): CrmLeadNote[] {
  return [...notes].sort((left, right) => {
    const leftPriority = left.priority_position ?? 4;
    const rightPriority = right.priority_position ?? 4;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return right.created_at.localeCompare(left.created_at);
  });
}

/** Read normalized lead comments from the canonical CRM activity stream. */
export async function listCrmLeadNotes(leadIds: string[], limit = 300): Promise<CrmLeadNote[]> {
  const ids = [...new Set(leadIds.filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('crm_activities')
    .select('id, lead_id, description, created_at, activity_date, created_by_name, created_by_user_id, priority_position')
    .eq('activity_type', 'comment')
    .in('lead_id', ids)
    .order('priority_position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return sortCrmLeadNotes(((data ?? []) as Record<string, unknown>[]).map(mapNote));
}

/** Demo events use the same append-only CRM activity stream as lead notes. */
export async function listCrmLeadDemoHistory(leadId: string): Promise<CrmLeadDemoHistoryEvent[]> {
  if (!leadId) return [];
  const { data, error } = await supabase
    .from('crm_activities')
    .select('id, lead_id, title, description, created_at, created_by_name, activity_type, meta')
    .in('activity_type', ['demo_requested', 'demo_registration_started', 'demo_scheduled', 'demo_date_changed', 'demo_held'])
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ''),
    lead_id: typeof row.lead_id === 'string' ? row.lead_id : null,
    title: typeof row.title === 'string' ? row.title : null,
    activity_type: typeof row.activity_type === 'string' ? row.activity_type : undefined,
    registration_event: (row.meta as Record<string, unknown> | null)?.source === 'crm_demo_registration',
    description: typeof row.description === 'string' ? row.description : null,
    created_at: String(row.created_at ?? ''),
    created_by_name: typeof row.created_by_name === 'string' ? row.created_by_name : null,
  }));
}

/** Atomically assigns a unique pinned position within the note's existing lead scope. */
export async function setCrmLeadNotePriority(noteId: string, priority: CrmLeadNotePriority | null): Promise<void> {
  const { error } = await supabase.rpc('set_crm_lead_note_priority', {
    p_note_id: noteId,
    p_priority: priority,
  });
  if (error) throw error;
}

/** Read the same canonical fields used by the lead editor and overview. */
export async function getCrmLeadFollowupState(leadId: string): Promise<CrmLeadFollowupState> {
  const { data, error } = await supabase
    .from('crm_leads')
    .select('next_followup_date, next_activity, probability, pipeline_stage')
    .eq('id', leadId)
    .single();
  if (error) throw error;
  const row = data as Record<string, unknown>;
  return {
    nextFollowupDate: typeof row.next_followup_date === 'string' ? row.next_followup_date : '',
    nextActivity: typeof row.next_activity === 'string' ? row.next_activity : '',
    probability: typeof row.probability === 'number' ? row.probability : null,
    pipelineStage: typeof row.pipeline_stage === 'string' ? row.pipeline_stage : null,
  };
}

/**
 * Save a note and its follow-up/calendar changes in one RLS-scoped transaction.
 * Reusing noteId makes retries idempotent and the calendar relation is unique.
 */
export async function saveCrmLeadNoteFollowup(
  input: SaveCrmLeadNoteFollowupInput,
): Promise<SaveCrmLeadNoteFollowupResult> {
  const text = input.text.trim();
  if (!text) throw new Error('Noten må ikke være tom.');
  if (input.addToCalendar && !input.nextFollowupDate) {
    throw new Error('Vælg en opfølgningsdato før kalenderen tilføjes.');
  }
  const { data, error } = await supabase.rpc('save_crm_lead_note_followup', {
    p_note_id: input.noteId,
    p_lead_id: input.leadId,
    p_note: text,
    p_next_followup_date: input.nextFollowupDate || null,
    p_next_activity: input.nextActivity || null,
    p_add_to_calendar: input.addToCalendar,
    p_lead_title: input.leadTitle || null,
  });
  if (error) throw error;
  const result = (data ?? {}) as Record<string, unknown>;
  const noteRow = (result.note ?? {}) as Record<string, unknown>;
  const leadRow = (result.lead ?? {}) as Record<string, unknown>;
  return {
    note: mapNote(noteRow),
    lead: {
      nextFollowupDate: typeof leadRow.next_followup_date === 'string' ? leadRow.next_followup_date : '',
      nextActivity: typeof leadRow.next_activity === 'string' ? leadRow.next_activity : '',
      probability: typeof leadRow.probability === 'number' ? leadRow.probability : null,
      pipelineStage: typeof leadRow.pipeline_stage === 'string' ? leadRow.pipeline_stage : null,
    },
    calendarActivityId: typeof result.calendar_activity_id === 'string' ? result.calendar_activity_id : null,
  };
}

/** Append a lead note without mutating the lead's legacy free-text fields. */
export async function createCrmLeadNote(input: CreateCrmLeadNoteInput): Promise<CrmLeadNote> {
  const text = input.text.trim();
  if (!text) throw new Error('Noten må ikke være tom.');
  const activity = await logActivity({
    activity_type: 'comment',
    lead_id: input.leadId,
    title: input.leadTitle || 'Lead-note',
    description: text,
    created_by_user_id: input.authorUserId ?? null,
    created_by_name: input.authorName ?? null,
    assigned_owner_user_id: input.ownerUserId ?? null,
    assigned_owner_name: input.ownerName ?? null,
    meta: { lead_id: input.leadId, source: 'crm_lead_note' },
  }, { strict: true });
  return {
    id: activity.id,
    lead_id: activity.lead_id,
    description: activity.description,
    created_at: activity.created_at,
    activity_date: activity.activity_date,
    created_by_name: activity.created_by_name,
    created_by_user_id: activity.created_by_user_id,
    priority_position: null,
  };
}
