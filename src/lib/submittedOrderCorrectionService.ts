import { supabase } from '@/lib/supabase';

export interface SubmittedOrderRevision {
  id: string;
  revision_number: number;
  reason: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  started_at: string;
  completed_at: string | null;
  status: 'active' | 'completed' | 'expired';
  before_snapshot: Record<string, unknown>;
  after_snapshot: Record<string, unknown> | null;
}

/**
 * A submitted order remains submitted throughout a correction. These RPCs only
 * open and close a short, audited write window for a Timan Backend user.
 */
export async function beginSubmittedOrderCorrection(
  configurationId: string,
  reason: string,
): Promise<{ sessionId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('begin_submitted_configurator_order_correction', {
    p_configuration_id: configurationId,
    p_reason: reason.trim(),
  });

  return {
    sessionId: typeof data === 'string' ? data : null,
    error: error?.message ?? (typeof data === 'string' ? null : 'Could not start correction'),
  };
}

export async function completeSubmittedOrderCorrection(
  sessionId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('complete_submitted_configurator_order_correction', {
    p_session_id: sessionId,
  });
  return { error: error?.message ?? null };
}

export async function listSubmittedOrderRevisions(
  configurationId: string,
): Promise<{ revisions: SubmittedOrderRevision[]; error: string | null }> {
  const { data, error } = await supabase.rpc('list_submitted_configurator_order_corrections', {
    p_configuration_id: configurationId,
  });

  if (error) return { revisions: [], error: error.message };
  return {
    revisions: Array.isArray(data) ? data as SubmittedOrderRevision[] : [],
    error: null,
  };
}
