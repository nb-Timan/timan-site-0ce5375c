import { supabase } from '@/lib/supabase';

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
