import { supabase } from '@/lib/supabase';
import { ConfiguratorState } from '@/types/configurator';

export type SavedStatus = 'aktiv' | 'pause' | 'ordre_afgivet';

export interface SavedConfiguration {
  id: string;
  created_by_user_id: string | null;
  created_by_email: string;
  title: string;
  case_type: 'quote' | 'order';
  case_status: SavedStatus;
  state_json: ConfiguratorState;
  internal_note: string;
  pdf_downloaded: boolean;
  pdf_downloaded_at: string | null;
  submitted_at: string | null;
  last_saved_at: string;
  created_at: string;
}

/** Load all saved configurations for a specific user email */
export async function loadConfigurations(ownerEmail: string): Promise<SavedConfiguration[]> {
  const { data, error } = await supabase
    .from('configurations')
    .select('*')
    .eq('created_by_email', ownerEmail.toLowerCase())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load configurations:', error);
    return [];
  }
  return (data || []).map(row => ({
    ...row,
    case_status: row.case_status || 'aktiv',
    state_json: typeof row.state_json === 'string' ? JSON.parse(row.state_json) : row.state_json,
  }));
}

/** Save a new configuration */
export async function saveConfiguration(
  state: ConfiguratorState,
  label: string,
  ownerEmail: string,
  userId?: string | null,
): Promise<SavedConfiguration | null> {
  const now = new Date().toISOString();
  const row = {
    created_by_email: ownerEmail.toLowerCase(),
    created_by_user_id: userId || null,
    title: label,
    case_type: state.flowType || 'quote',
    case_status: 'aktiv' as SavedStatus,
    state_json: state,
    internal_note: state.internalNote || '',
    pdf_downloaded: false,
    pdf_downloaded_at: null,
    submitted_at: null,
    last_saved_at: now,
  };

  const { data, error } = await supabase
    .from('configurations')
    .insert(row)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Failed to save configuration:', error);
    return null;
  }

  if (data) {
    await saveConfigurationItems(data.id, state);
  }

  return data ? {
    ...data,
    state_json: typeof data.state_json === 'string' ? JSON.parse(data.state_json) : data.state_json,
  } : null;
}

/** Save machine/accessory line items for a configuration */
async function saveConfigurationItems(configurationId: string, state: ConfiguratorState) {
  const items: Array<{
    configuration_id: string;
    machine_type: string;
    machine_qty: number;
    config_mode: string;
    accessories: string[];
    unit_configs: Record<string, { acc: string[] }>;
  }> = [];

  for (const mc of state.machineConfigs) {
    const unitConfigs: Record<string, { acc: string[] }> = {};
    if (mc.configMode === 'individual') {
      for (let i = 1; i <= mc.qty; i++) {
        const key = `${mc.id}_${i}`;
        if (state.individualUnitConfigs[key]) {
          unitConfigs[key] = state.individualUnitConfigs[key];
        }
      }
    }

    items.push({
      configuration_id: configurationId,
      machine_type: mc.type,
      machine_qty: mc.qty,
      config_mode: mc.configMode,
      accessories: mc.acc,
      unit_configs: unitConfigs,
    });
  }

  if (items.length > 0) {
    const { error } = await supabase
      .from('configuration_items')
      .insert(items);

    if (error) {
      console.error('Failed to save configuration items:', error);
    }
  }
}

/** Update configuration status */
export async function updateConfigurationStatus(id: string, status: SavedStatus) {
  const { error } = await supabase
    .from('configurations')
    .update({ case_status: status, last_saved_at: new Date().toISOString() })
    .eq('id', id);

  if (error) console.error('Failed to update status:', error);
}

/** Update internal note */
export async function updateConfigurationNote(id: string, note: string) {
  const { error } = await supabase
    .from('configurations')
    .update({ internal_note: note, last_saved_at: new Date().toISOString() })
    .eq('id', id);

  if (error) console.error('Failed to update note:', error);
}

/** Delete a configuration and its items */
export async function deleteConfiguration(id: string) {
  const { error } = await supabase
    .from('configurations')
    .delete()
    .eq('id', id);

  if (error) console.error('Failed to delete configuration:', error);
}

/** Mark configuration as order submitted */
export async function markAsOrderSubmitted(id: string) {
  const { error } = await supabase
    .from('configurations')
    .update({
      case_type: 'order',
      case_status: 'ordre_afgivet' as SavedStatus,
      submitted_at: new Date().toISOString(),
      last_saved_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) console.error('Failed to mark as order submitted:', error);
}

/** Mark PDF as downloaded */
export async function markPdfDownloaded(id: string) {
  const { error } = await supabase
    .from('configurations')
    .update({
      pdf_downloaded: true,
      pdf_downloaded_at: new Date().toISOString(),
      last_saved_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) console.error('Failed to mark PDF downloaded:', error);
}
