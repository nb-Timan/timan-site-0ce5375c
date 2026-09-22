import { supabase } from '@/lib/supabase';
import { getActiveMode } from '@/lib/activeMode';

export async function deleteCrmRecordPermanently(kind: 'lead' | 'document', id: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Log ind igen for at slette permanent.');
  const effectiveMode = getActiveMode(session.user.email);
  if (effectiveMode !== 'backend') throw new Error('Skift til Backend før permanent sletning.');
  const { data, error } = await supabase.functions.invoke('admin-crm-delete', {
    body: { kind, id, effectiveMode },
  });
  if (error) {
    const response = (error as { context?: Response }).context;
    const details = await response?.json().catch(() => null);
    throw new Error(details?.error || error.message);
  }
  if (data?.ok !== true) throw new Error(data?.error || 'Permanent sletning blev ikke bekræftet.');
}
