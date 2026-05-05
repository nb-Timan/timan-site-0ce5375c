/**
 * Phase 28 — Per-user "hide from Min konto" service.
 *
 * Lets a user remove a saved configuration from their own Min konto list
 * WITHOUT soft-deleting the underlying configurations row. Backend CRM,
 * Dashboard, Budget and dealer detail are NOT affected — they continue to
 * see the row as long as case_status != 'deleted'.
 *
 * Backed by public.configuration_user_hidden (see
 * docs/sql/phase28_user_hidden_configurations.sql). When the table is
 * missing (migration not yet applied), all calls degrade gracefully so the
 * SPA keeps working.
 */
import { supabase } from '@/lib/supabase';

const TABLE = 'configuration_user_hidden';

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01') return true;
  const m = (error.message || '').toLowerCase();
  return m.includes('does not exist') || m.includes('not found');
}

export async function listHiddenConfigurationIdsForCurrentUser(): Promise<Set<string>> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Set();

    const { data, error } = await supabase
      .from(TABLE)
      .select('configuration_id')
      .eq('user_id', user.id);

    if (error) {
      if (isMissingTableError(error)) return new Set();
      console.warn('[userHiddenConfigurations] list failed:', error);
      return new Set();
    }
    return new Set((data ?? []).map((r) => String((r as { configuration_id: string }).configuration_id)));
  } catch (e) {
    console.warn('[userHiddenConfigurations] list threw:', e);
    return new Set();
  }
}

export async function hideConfigurationForCurrentUser(
  configurationId: string,
): Promise<{ error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Ikke logget ind' };

    const { error } = await supabase
      .from(TABLE)
      .upsert(
        { user_id: user.id, configuration_id: configurationId },
        { onConflict: 'user_id,configuration_id' },
      );

    if (error) {
      if (isMissingTableError(error)) {
        return { error: 'Funktionen er endnu ikke aktiveret i databasen (kør phase28 SQL).' };
      }
      return { error: error.message };
    }
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
