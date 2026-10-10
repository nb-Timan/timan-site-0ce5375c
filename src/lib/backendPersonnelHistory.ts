import { supabase } from '@/lib/supabase';

export interface PersonnelEvent {
  id: string; at: string | null; actor: string | null; record_id: string; record_type: string;
  label: string | null; action: string; server_recorded: boolean;
  old: Record<string, unknown>; new: Record<string, unknown>;
}
export interface PersonnelUser {
  id: string; name: string | null; company: string | null; role: string | null;
  is_active: boolean; approved: boolean; status: string | null; created_at: string | null; last_login_at: string | null;
}
export interface RemovedPersonnelContact {
  id: string; name: string | null; company: string; account: string; area: string;
  removed_at: string; removed_by: string | null;
}
export interface PersonnelHistory { users: PersonnelUser[]; contacts: RemovedPersonnelContact[]; events: PersonnelEvent[]; }
export async function fetchPersonnelHistory(): Promise<PersonnelHistory> {
  const { data, error } = await supabase.rpc('backend_personnel_history');
  if (error) throw error;
  return data as PersonnelHistory;
}
export function userLifecycleFacts(user: PersonnelUser, events: PersonnelEvent[]) {
  const history = events.filter((event) => event.record_type === 'app_users' && event.record_id === user.id)
    .sort((a,b) => (b.at ?? '').localeCompare(a.at ?? ''));
  const activated = history.find((e) => (e.new.is_active === true && e.old.is_active === false) || (e.new.approved === true && e.old.approved === false));
  const deactivated = history.find((e) => (e.new.is_active === false && e.old.is_active === true) ||
    (['blocked','suspended','inactive'].includes(String(e.new.status)) && e.new.status !== e.old.status));
  const archived = history.find((e) => e.new.archived_at || e.action === 'archive');
  return { history, activated, deactivated, archived,
    status: archived ? 'Konto arkiveret' : user.is_active === false ? 'Portal-login deaktiveret' : user.approved ? 'Aktiv' : 'Afventer godkendelse' };
}
export function personnelDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Ikke registreret';
  return new Date(value).toLocaleString('da-DK');
}
