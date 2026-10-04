import { supabase } from '@/lib/supabase';
import { academySandbox } from '@/lib/academySandbox';
import { PRODUCT_GROUP_ORDER, type ProductGroupKey } from '@/lib/configuratorPriceSeed';

export interface CrmCompetitor {
  id: string;
  name: string;
  country_code: string | null;
  website_url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  machine_groups: ProductGroupKey[];
}

export const COMPETITOR_MACHINE_GROUPS = PRODUCT_GROUP_ORDER;

export function normalizeCompetitorName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+(?:gmbh|a\/s|as|ltd|inc)\.?$/, '').replace(/\s+/g, ' ').trim();
}

export function findPotentialCompetitorDuplicate(name: string, competitors: CrmCompetitor[], excludeId?: string): CrmCompetitor | undefined {
  const normalized = normalizeCompetitorName(name);
  return competitors.find(row => row.id !== excludeId && normalizeCompetitorName(row.name) === normalized);
}

export async function listCrmCompetitors(): Promise<CrmCompetitor[]> {
  if (academySandbox.isActive()) return [];
  const { data, error } = await supabase.from('crm_competitors' as never).select('id,name,country_code,website_url,active,created_at,updated_at').order('name');
  if (error) throw error;
  const rows = (data ?? []) as unknown as Omit<CrmCompetitor, 'machine_groups'>[];
  const { data: groups, error: groupError } = await supabase.from('crm_competitor_machine_groups' as never).select('competitor_id,machine_group');
  if (groupError) throw groupError;
  const byCompetitor = new Map<string, ProductGroupKey[]>();
  for (const group of (groups ?? []) as { competitor_id: string; machine_group: ProductGroupKey }[]) {
    byCompetitor.set(group.competitor_id, [...(byCompetitor.get(group.competitor_id) ?? []), group.machine_group]);
  }
  return rows.map(row => ({ ...row, machine_groups: byCompetitor.get(row.id) ?? [] }));
}

export async function saveCrmCompetitor(input: Pick<CrmCompetitor, 'name' | 'country_code' | 'website_url' | 'active' | 'machine_groups'> & { id?: string }): Promise<CrmCompetitor> {
  const name = input.name.trim();
  if (!name) throw new Error('NAME_REQUIRED');
  if (input.website_url && !/^https?:\/\/[^\s]+$/i.test(input.website_url)) throw new Error('INVALID_URL');
  if (input.machine_groups.some(group => !PRODUCT_GROUP_ORDER.includes(group))) throw new Error('INVALID_MACHINE_GROUP');
  const { data, error } = await supabase.rpc('save_crm_competitor' as never, {
    p_id: input.id ?? null, p_name: name, p_country_code: input.country_code || null,
    p_website_url: input.website_url || null, p_active: input.active, p_machine_groups: input.machine_groups,
  } as never);
  if (error) throw error;
  const saved = data as unknown as Omit<CrmCompetitor, 'machine_groups'>;
  return { ...saved, machine_groups: input.machine_groups };
}

export function competitorGroupsForMachine(machine: string | null | undefined): ProductGroupKey[] {
  if (!machine) return [];
  if (/RC-1000/i.test(machine)) return ['RC-1000s'];
  if (/RC-751/i.test(machine)) return ['RC-751'];
  if (/3330/i.test(machine)) return ['Timan 3330'];
  if (/2620/i.test(machine)) return ['Timan 2620'];
  if (/CS-200|Loader-Line/i.test(machine)) return ['Loader-Line and CS-200 Traktor'];
  return [];
}
