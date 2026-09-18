import { logActivity, type CrmActivity } from '@/lib/crmActivitiesService';
import { supabase } from '@/lib/supabase';

export type CrmLeadNote = Pick<
  CrmActivity,
  'id' | 'lead_id' | 'description' | 'created_at' | 'activity_date' | 'created_by_name' | 'created_by_user_id'
> & {
  priority_position: CrmLeadNotePriority | null;
};

export type CrmLeadNotePriority = 1 | 2 | 3;

export interface CreateCrmLeadNoteInput {
  leadId: string;
  text: string;
  leadTitle?: string | null;
  authorUserId?: string | null;
  authorName?: string | null;
  ownerUserId?: string | null;
  ownerName?: string | null;
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

/** Atomically assigns a unique pinned position within the note's existing lead scope. */
export async function setCrmLeadNotePriority(noteId: string, priority: CrmLeadNotePriority | null): Promise<void> {
  const { error } = await supabase.rpc('set_crm_lead_note_priority', {
    p_note_id: noteId,
    p_priority: priority,
  });
  if (error) throw error;
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
