import { supabase } from '@/lib/supabase';
import { ConfiguratorState } from '@/types/configurator';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';

export type SavedStatus = 'aktiv' | 'pause' | 'ordre_afgivet' | 'deleted';

export interface SavedConfiguration {
  id: string;
  created_by_user_id: string | null;
  created_by_email: string;
  title: string;
  case_type: 'quote' | 'order';
  case_status: SavedStatus;
  state_json: ConfiguratorState;
  has_full_state: boolean;
  internal_note: string;
  pdf_downloaded: boolean;
  pdf_downloaded_at: string | null;
  submitted_at: string | null;
  last_saved_at: string;
  created_at: string;
}

type StoredConfigurationPayload = {
  __kind: 'configurator_state';
  state: ConfiguratorState;
  internalNote: string;
  pdf_downloaded: boolean;
  pdf_downloaded_at: string | null;
};

export interface SaveConfigurationResult {
  data: SavedConfiguration | null;
  id: string | null;
  error: string | null;
  itemsError: string | null;
}

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
} | null;

function formatSupabaseError(error: SupabaseErrorLike): string {
  if (!error) return 'Unknown Supabase error';
  return [error.code, error.message, error.details, error.hint].filter(Boolean).join(' | ');
}

function getMissingColumn(error: SupabaseErrorLike): string | null {
  const message = error?.message || '';
  const match = message.match(/Could not find the '([^']+)' column/);
  return match?.[1] || null;
}

function parseStateJson(value: unknown): ConfiguratorState | null {
  if (!value) return null;

  try {
    if (typeof value === 'string') {
      return normalizeConfiguratorState(JSON.parse(value) as Partial<ConfiguratorState>);
    }

    return normalizeConfiguratorState(value as Partial<ConfiguratorState>);
  } catch (error) {
    console.error('Failed to parse state_json:', error);
    return null;
  }
}

function serializeStoredConfigurationPayload(
  state: ConfiguratorState,
  internalNote: string,
  pdfDownloaded: boolean,
  pdfDownloadedAt: string | null,
): string {
  const payload: StoredConfigurationPayload = {
    __kind: 'configurator_state',
    state: normalizeConfiguratorState(state),
    internalNote,
    pdf_downloaded: pdfDownloaded,
    pdf_downloaded_at: pdfDownloadedAt,
  };

  return JSON.stringify(payload);
}

function parseStoredConfigurationPayload(value: unknown): StoredConfigurationPayload | null {
  if (typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredConfigurationPayload>;
    if (parsed?.__kind !== 'configurator_state' || !parsed.state) return null;

    return {
      __kind: 'configurator_state',
      state: normalizeConfiguratorState(parsed.state),
      internalNote: parsed.internalNote ?? '',
      pdf_downloaded: Boolean(parsed.pdf_downloaded),
      pdf_downloaded_at: parsed.pdf_downloaded_at ?? null,
    };
  } catch {
    return null;
  }
}

function buildFallbackState(row: Record<string, any>): ConfiguratorState {
  const language = ['da', 'en', 'de', 'it', 'hu'].includes(row.language) ? row.language : 'da';
  const flowType = row.case_type === 'order' || row.document_type === 'order' ? 'order' : 'quote';
  const deliveryMethod = ['pickup', 'send', 'deliver'].includes(row.delivery_method) ? row.delivery_method : '';

  return normalizeConfiguratorState({
    ...createEmptyConfiguratorState(language, flowType),
    language,
    flowType,
    date: typeof row.delivery_date === 'string' ? row.delivery_date.slice(0, 10) : '',
    deliveryMethod,
    deliveryDeliverStartup: typeof row.delivery_startup_option === 'string' ? row.delivery_startup_option : null,
    internalNote: typeof row.internal_note === 'string'
      ? row.internal_note
      : typeof row.note === 'string'
        ? row.note
        : '',
  });
}

function mapConfigurationRow(row: Record<string, any>, ownerEmail: string): SavedConfiguration {
  const storedPayload = parseStoredConfigurationPayload(row.note);
  const parsedState = parseStateJson(row.state_json) ?? storedPayload?.state ?? null;
  const caseType = row.case_type === 'order' || row.document_type === 'order' ? 'order' : 'quote';

  return {
    id: row.id,
    created_by_user_id: row.created_by_user_id ?? null,
    created_by_email: row.created_by_email ?? ownerEmail.toLowerCase(),
    title: row.title ?? '',
    case_type: caseType,
    case_status: row.case_status ?? 'aktiv',
    state_json: parsedState ?? buildFallbackState(row),
    has_full_state: Boolean(parsedState),
    internal_note: row.internal_note ?? storedPayload?.internalNote ?? '',
    pdf_downloaded: typeof row.pdf_downloaded === 'boolean' ? row.pdf_downloaded : Boolean(storedPayload?.pdf_downloaded),
    pdf_downloaded_at: row.pdf_downloaded_at ?? storedPayload?.pdf_downloaded_at ?? null,
    submitted_at: row.submitted_at ?? null,
    last_saved_at: row.last_saved_at ?? row.created_at ?? new Date().toISOString(),
    created_at: row.created_at ?? row.last_saved_at ?? new Date().toISOString(),
  };
}

async function loadConfigurationRowById(id: string, userId: string) {
  const { data, error } = await supabase
    .from('configurations')
    .select('*')
    .eq('id', id)
    .eq('created_by_user_id', userId)
    .maybeSingle();

  return { data, error };
}

async function updateConfigurationRow(id: string, patch: Record<string, unknown>) {
  let payload: Record<string, unknown> = { ...patch };

  while (true) {
    const { data, error } = await supabase
      .from('configurations')
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (!error) {
      return { data, error: null as SupabaseErrorLike };
    }

    const missingColumn = getMissingColumn(error);
    if (missingColumn && missingColumn in payload) {
      const nextPayload = { ...payload };
      delete nextPayload[missingColumn];
      payload = nextPayload;
      continue;
    }

    return { data: null, error };
  }
}

/** Load all saved configurations for the current auth user */
export async function loadConfigurations(ownerEmail: string): Promise<SavedConfiguration[]> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) {
    console.error('Failed to read auth user for configurations:', authError);
    return [];
  }

  if (!user) {
    console.warn('No authenticated user found while loading configurations');
    return [];
  }

  const { data, error } = await supabase
    .from('configurations')
    .select('*')
    .eq('created_by_user_id', user.id)
    .neq('case_status', 'deleted')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load configurations:', error);
    return [];
  }

  return (data || []).map((row) => mapConfigurationRow(row, ownerEmail));
}

export async function loadConfigurationById(id: string, ownerEmail: string): Promise<SavedConfiguration | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) {
    console.error('Failed to read auth user for configuration by id:', authError);
    return null;
  }

  if (!user) return null;

  const { data, error } = await loadConfigurationRowById(id, user.id);

  if (error) {
    console.error('Failed to load configuration by id:', error);
    return null;
  }

  if (!data) return null;

  return mapConfigurationRow(data, ownerEmail);
}

async function insertConfigurationRow(row: Record<string, unknown>) {
  let payload: Record<string, unknown> = { ...row };

  while (true) {
    console.info('[saveConfiguration] inserting into configurations', payload);

    const { data, error } = await supabase
      .from('configurations')
      .insert(payload)
      .select()
      .maybeSingle();

    if (!error) {
      return { data, error: null as SupabaseErrorLike };
    }

    const missingColumn = getMissingColumn(error);
    if (missingColumn && missingColumn in payload) {
      console.warn(`[saveConfiguration] Column missing in configurations, retrying without: ${missingColumn}`);
      const nextPayload = { ...payload };
      delete nextPayload[missingColumn];
      payload = nextPayload;
      continue;
    }

    return { data: null, error };
  }
}

/** Save machine/accessory line items for a configuration */
async function saveConfigurationItems(configurationId: string, state: ConfiguratorState): Promise<string | null> {
  let items: Array<Record<string, unknown>> = [];

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

    const title = mc.type
      ? `${mc.type} x${mc.qty}`
      : `Machine x${mc.qty}`;

    items.push({
      configuration_id: configurationId,
      item_type: 'machine',
      title,
      machine_type: mc.type,
      machine_qty: mc.qty,
      config_mode: mc.configMode,
      accessories: mc.acc,
      unit_configs: unitConfigs,
    });
  }

  if (items.length === 0) return null;

  while (true) {
    console.info('[saveConfigurationItems] inserting into configuration_items', items);

    const { error } = await supabase
      .from('configuration_items')
      .insert(items);

    if (!error) return null;

    const missingColumn = getMissingColumn(error);
    if (missingColumn) {
      console.warn(`[saveConfigurationItems] Column missing in configuration_items, retrying without: ${missingColumn}`);
      items = items.map((item) => {
        const nextItem = { ...item };
        delete nextItem[missingColumn];
        return nextItem;
      });
      continue;
    }

    console.error('Failed to save configuration items:', error);
    return formatSupabaseError(error);
  }
}

/** Save a new configuration */
export async function saveConfiguration(
  state: ConfiguratorState,
  label: string,
  ownerEmail: string,
): Promise<SaveConfigurationResult> {
  console.info('[saveConfiguration] called', {
    label,
    ownerEmail,
    machineCount: state.machineConfigs.length,
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) {
    console.error('Failed to read auth user before save:', authError);
    return {
      data: null,
      id: null,
      error: formatSupabaseError(authError),
      itemsError: null,
    };
  }

  if (!user) {
    const message = 'No authenticated Supabase user found. Please log in again.';
    console.error(message);
    return {
      data: null,
      id: null,
      error: message,
      itemsError: null,
    };
  }

  const documentType = state.flowType === 'order' ? 'order' : 'quote';

  const now = new Date().toISOString();
  const storedNote = serializeStoredConfigurationPayload(state, state.internalNote ?? '', false, null);
  const row: Record<string, unknown> = {
    created_by_email: user.email?.toLowerCase() || ownerEmail.toLowerCase(),
    created_by_user_id: user.id,
    title: label,
    document_type: documentType,
    case_type: documentType,
    case_status: 'aktiv' as SavedStatus,
    language: state.language,
    delivery_date: state.date || null,
    delivery_method: state.deliveryMethod || null,
    delivery_startup_option: state.deliveryDeliverStartup,
    note: storedNote,
    internal_note: state.internalNote || '',
    state_json: state,
    pdf_downloaded: false,
    pdf_downloaded_at: null,
    submitted_at: null,
    last_saved_at: now,
  };

  const { data, error } = await insertConfigurationRow(row);

  if (error || !data) {
    console.error('Failed to save configuration:', error);
    return {
      data: null,
      id: null,
      error: formatSupabaseError(error),
      itemsError: null,
    };
  }

  const itemsError = await saveConfigurationItems(data.id, state);

  return {
    data: mapConfigurationRow({
      ...data,
      created_by_user_id: data.created_by_user_id ?? user.id,
      created_by_email: data.created_by_email ?? user.email?.toLowerCase() ?? ownerEmail.toLowerCase(),
      title: data.title ?? label,
      case_type: data.case_type ?? (state.flowType || 'quote'),
      state_json: data.state_json ?? state,
      note: data.note ?? storedNote,
      internal_note: data.internal_note ?? state.internalNote,
      pdf_downloaded: data.pdf_downloaded ?? false,
      pdf_downloaded_at: data.pdf_downloaded_at ?? null,
      created_at: data.created_at ?? now,
      last_saved_at: data.last_saved_at ?? now,
    }, ownerEmail),
    id: data.id,
    error: null,
    itemsError,
  };
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
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    if (authError) console.error('Failed to read auth user before updating note:', authError);
    return;
  }

  const { data: row, error: loadError } = await loadConfigurationRowById(id, user.id);

  if (loadError || !row) {
    if (loadError) console.error('Failed to load configuration before updating note:', loadError);
    return;
  }

  const storedPayload = parseStoredConfigurationPayload(row.note);
  const state = parseStateJson(row.state_json) ?? storedPayload?.state ?? buildFallbackState(row);
  const { error } = await updateConfigurationRow(id, {
    internal_note: note,
    note: serializeStoredConfigurationPayload(state, note, Boolean(row.pdf_downloaded ?? storedPayload?.pdf_downloaded), row.pdf_downloaded_at ?? storedPayload?.pdf_downloaded_at ?? null),
    last_saved_at: new Date().toISOString(),
  });

  if (error) console.error('Failed to update note:', error);
}

/** Soft-delete a configuration (mark as deleted, keep data) */
export async function deleteConfiguration(id: string) {
  const { error } = await supabase
    .from('configurations')
    .update({ case_status: 'deleted' as SavedStatus, last_saved_at: new Date().toISOString() })
    .eq('id', id);

  if (error) console.error('Failed to soft-delete configuration:', error);
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
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(formatSupabaseError(authError));
  }

  if (!user) {
    throw new Error('No authenticated Supabase user found. Please log in again.');
  }

  const { data: row, error: loadError } = await loadConfigurationRowById(id, user.id);

  if (loadError || !row) {
    throw new Error(formatSupabaseError(loadError));
  }

  const downloadedAt = new Date().toISOString();
  const storedPayload = parseStoredConfigurationPayload(row.note);
  const state = parseStateJson(row.state_json) ?? storedPayload?.state ?? buildFallbackState(row);
  const { error } = await updateConfigurationRow(id, {
    pdf_downloaded: true,
    pdf_downloaded_at: downloadedAt,
    note: serializeStoredConfigurationPayload(state, row.internal_note ?? storedPayload?.internalNote ?? '', true, downloadedAt),
    last_saved_at: downloadedAt,
  });

  if (error) {
    console.error('Failed to mark PDF downloaded:', error);
    throw new Error(formatSupabaseError(error));
  }
}
