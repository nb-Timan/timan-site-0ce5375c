import { supabase } from '@/lib/supabase';
import { ConfiguratorState, MachineConfig } from '@/types/configurator';
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
  quote_number: string | null;
  order_number: string | null;
  source_quote_id: string | null;
  source_quote_number: string | null;
}

/** Generate a unique reference number with prefix Q- or O- */
export function generateReferenceNumber(prefix: 'Q' | 'O'): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${datePart}-${rand}`;
}

/** Ensure a saved configuration has its reference numbers, updating in Supabase if needed */
export async function ensureReferenceNumbers(
  configId: string,
  isOrder: boolean,
): Promise<{ quote_number: string | null; order_number: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { quote_number: null, order_number: null };

  const { data: row } = await supabase
    .from('configurations')
    .select('quote_number, order_number')
    .eq('id', configId)
    .maybeSingle();

  if (!row) return { quote_number: null, order_number: null };

  const needsQuote = !isOrder && !row.quote_number;
  const needsOrder = isOrder && !row.order_number;

  if (!needsQuote && !needsOrder) {
    return { quote_number: row.quote_number, order_number: row.order_number };
  }

  const patch: Record<string, unknown> = {};
  const result = { quote_number: row.quote_number as string | null, order_number: row.order_number as string | null };

  if (needsQuote) {
    const qn = generateReferenceNumber('Q');
    patch.quote_number = qn;
    result.quote_number = qn;
  }
  if (needsOrder) {
    const on = generateReferenceNumber('O');
    patch.order_number = on;
    result.order_number = on;
  }

  await updateConfigurationRow(configId, patch);
  return result;
}
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${datePart}-${rand}`;
}

type StoredConfigurationPayload = {
  __kind: 'configurator_state';
  state: ConfiguratorState;
  internalNote: string;
  pdf_downloaded: boolean;
  pdf_downloaded_at: string | null;
};

export interface SavedConfigurationItem {
  id: string;
  configuration_id: string;
  item_type: string;
  title: string;
  machine_type?: string | null;
  machine_qty?: number | null;
  config_mode?: string | null;
  accessories?: string[] | null;
  unit_configs?: Record<string, { acc: string[] }> | null;
}

export interface SaveConfigurationResult {
  data: SavedConfiguration | null;
  id: string | null;
  error: string | null;
  itemsError: string | null;
  quote_number: string | null;
  order_number: string | null;
  source_quote_id: string | null;
  source_quote_number: string | null;
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
  let parsed: Record<string, unknown> | null = null;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (value && typeof value === 'object') {
    parsed = value as Record<string, unknown>;
  }

  if (!parsed) return null;

  const parsedState = 'state' in parsed
    ? parseStateJson(parsed.state)
    : ('machineConfigs' in parsed || 'flowType' in parsed || 'comment' in parsed)
      ? parseStateJson(parsed)
      : null;

  if (!parsedState) return null;

  return {
    __kind: 'configurator_state',
    state: parsedState,
    internalNote: typeof parsed.internalNote === 'string'
      ? parsed.internalNote
      : typeof parsed.internal_note === 'string'
        ? parsed.internal_note
        : parsedState.internalNote ?? '',
    pdf_downloaded: typeof parsed.pdf_downloaded === 'boolean' ? parsed.pdf_downloaded : false,
    pdf_downloaded_at: typeof parsed.pdf_downloaded_at === 'string' ? parsed.pdf_downloaded_at : null,
  };
}

/** Load configuration_items rows for a configuration */
async function loadConfigurationItems(configurationId: string): Promise<SavedConfigurationItem[]> {
  const { data, error } = await supabase
    .from('configuration_items')
    .select('*')
    .eq('configuration_id', configurationId);

  if (error) {
    console.warn('[loadConfigurationItems] Failed to load items:', error);
    return [];
  }

  return (data || []).map((row: Record<string, any>) => ({
    id: row.id,
    configuration_id: row.configuration_id,
    item_type: row.item_type ?? 'machine',
    title: row.title ?? '',
    machine_type: row.machine_type ?? null,
    machine_qty: row.machine_qty ?? null,
    config_mode: row.config_mode ?? null,
    accessories: Array.isArray(row.accessories) ? row.accessories : null,
    unit_configs: row.unit_configs ?? null,
  }));
}

/** Parse machine type and qty from item title like "RC-1000S x2" */
function parseMachineFromTitle(title: string): { type: string; qty: number } | null {
  const match = title.match(/^(.+?)\s*x(\d+)$/);
  if (match) {
    return { type: match[1].trim(), qty: parseInt(match[2], 10) };
  }
  return null;
}

/** Rebuild machineConfigs from configuration_items rows */
function rebuildMachineConfigsFromItems(items: SavedConfigurationItem[]): {
  machineConfigs: MachineConfig[];
  individualUnitConfigs: Record<string, { acc: string[] }>;
} {
  const machineConfigs: MachineConfig[] = [];
  let individualUnitConfigs: Record<string, { acc: string[] }> = {};

  const machineItems = items.filter(i => i.item_type === 'machine');

  machineItems.forEach((item, idx) => {
    const fromTitle = parseMachineFromTitle(item.title);
    const type = item.machine_type ?? fromTitle?.type ?? item.title;
    const qty = item.machine_qty ?? fromTitle?.qty ?? 1;
    const configMode = item.config_mode === 'shared' || item.config_mode === 'individual'
      ? item.config_mode
      : 'individual';
    const acc = Array.isArray(item.accessories) ? item.accessories : [];
    const id = `m${idx}`;

    machineConfigs.push({ id, type, qty, configMode, acc });

    if (item.unit_configs && typeof item.unit_configs === 'object') {
      const remappedUnitConfigs: Record<string, { acc: string[] }> = {};
      Object.keys(item.unit_configs).forEach((oldKey, unitIndex) => {
        const unitConfig = item.unit_configs?.[oldKey];
        remappedUnitConfigs[`${id}_${unitIndex + 1}`] = {
          acc: Array.isArray(unitConfig?.acc) ? unitConfig.acc : [],
        };
      });
      individualUnitConfigs = { ...individualUnitConfigs, ...remappedUnitConfigs };
    }
  });

  return { machineConfigs, individualUnitConfigs };
}

function buildFallbackState(row: Record<string, any>): ConfiguratorState {
  return normalizeConfiguratorState(buildFallbackStatePartial(row));
}

function buildFallbackStatePartial(row: Record<string, any>): Partial<ConfiguratorState> {
  const language = ['da', 'en', 'de', 'it', 'hu'].includes(row.language) ? row.language : 'da';
  const flowType = row.case_type === 'order' || row.document_type === 'order' ? 'order' : 'quote';
  const deliveryMethod = ['pickup', 'send', 'deliver'].includes(row.delivery_method) ? row.delivery_method : '';

  return {
    ...createEmptyConfiguratorState(language, flowType),
    language,
    flowType,
    date: typeof row.delivery_date === 'string' ? row.delivery_date.slice(0, 10) : '',
    deliveryMethod,
    deliveryDeliverStartup: typeof row.delivery_startup_option === 'string' ? row.delivery_startup_option : null,
    internalNote: typeof row.internal_note === 'string'
      ? row.internal_note
      : '',
  };
}

function buildRestoredState(
  row: Record<string, any>,
  items: SavedConfigurationItem[],
  storedPayload: StoredConfigurationPayload | null,
): { state: ConfiguratorState; hasFullState: boolean } {
  const parsedState = parseStateJson(row.state_json);
  const payloadState = storedPayload?.state ?? null;
  const baseState = parsedState ?? payloadState ?? buildFallbackState(row);
  const rebuiltFromItems = items.length > 0 ? rebuildMachineConfigsFromItems(items) : null;
  const flowType = row.case_type === 'order' || row.document_type === 'order' ? 'order' : 'quote';
  const language = ['da', 'en', 'de', 'it', 'hu'].includes(row.language) ? row.language : baseState.language;
  const deliveryMethod = ['pickup', 'send', 'deliver'].includes(row.delivery_method) ? row.delivery_method : baseState.deliveryMethod;

  const restoredState = normalizeConfiguratorState({
    ...baseState,
    flowType,
    language,
    date: typeof row.delivery_date === 'string' ? row.delivery_date.slice(0, 10) : baseState.date,
    deliveryMethod,
    deliveryDeliverStartup: typeof row.delivery_startup_option === 'string'
      ? row.delivery_startup_option
      : baseState.deliveryDeliverStartup,
    internalNote: typeof row.internal_note === 'string'
      ? row.internal_note
      : storedPayload?.internalNote ?? baseState.internalNote,
    machineConfigs: rebuiltFromItems && rebuiltFromItems.machineConfigs.length > 0
      ? rebuiltFromItems.machineConfigs
      : baseState.machineConfigs,
    individualUnitConfigs: rebuiltFromItems && Object.keys(rebuiltFromItems.individualUnitConfigs).length > 0
      ? rebuiltFromItems.individualUnitConfigs
      : baseState.individualUnitConfigs,
  });

  return {
    state: restoredState,
    hasFullState: Boolean(parsedState || payloadState || restoredState.machineConfigs.length > 0),
  };
}

function mapConfigurationRow(row: Record<string, any>, ownerEmail: string): SavedConfiguration {
  const storedPayload = parseStoredConfigurationPayload(row.note);
  const { state, hasFullState } = buildRestoredState(row, [], storedPayload);
  const caseType = row.case_type === 'order' || row.document_type === 'order' ? 'order' : 'quote';

  return {
    id: row.id,
    created_by_user_id: row.created_by_user_id ?? null,
    created_by_email: row.created_by_email ?? ownerEmail.toLowerCase(),
    title: row.title ?? '',
    case_type: caseType,
    case_status: row.case_status ?? 'aktiv',
    state_json: state,
    has_full_state: hasFullState,
    internal_note: row.internal_note ?? storedPayload?.internalNote ?? '',
    pdf_downloaded: typeof row.pdf_downloaded === 'boolean' ? row.pdf_downloaded : Boolean(storedPayload?.pdf_downloaded),
    pdf_downloaded_at: row.pdf_downloaded_at ?? storedPayload?.pdf_downloaded_at ?? null,
    submitted_at: row.submitted_at ?? null,
    last_saved_at: row.last_saved_at ?? row.created_at ?? new Date().toISOString(),
    created_at: row.created_at ?? row.last_saved_at ?? new Date().toISOString(),
    quote_number: row.quote_number ?? null,
    order_number: row.order_number ?? null,
    source_quote_id: row.source_quote_id ?? null,
    source_quote_number: row.source_quote_number ?? null,
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

  const items = await loadConfigurationItems(id);

  return mapConfigurationRowWithItems(data, ownerEmail, items);
}

function mapConfigurationRowWithItems(
  row: Record<string, any>,
  ownerEmail: string,
  items: SavedConfigurationItem[],
): SavedConfiguration {
  const storedPayload = parseStoredConfigurationPayload(row.note);
  const { state, hasFullState } = buildRestoredState(row, items, storedPayload);
  const caseType = row.case_type === 'order' || row.document_type === 'order' ? 'order' : 'quote';

  return {
    id: row.id,
    created_by_user_id: row.created_by_user_id ?? null,
    created_by_email: row.created_by_email ?? ownerEmail.toLowerCase(),
    title: row.title ?? '',
    case_type: caseType,
    case_status: row.case_status ?? 'aktiv',
    state_json: state,
    has_full_state: hasFullState,
    internal_note: row.internal_note ?? storedPayload?.internalNote ?? '',
    pdf_downloaded: typeof row.pdf_downloaded === 'boolean' ? row.pdf_downloaded : Boolean(storedPayload?.pdf_downloaded),
    pdf_downloaded_at: row.pdf_downloaded_at ?? storedPayload?.pdf_downloaded_at ?? null,
    submitted_at: row.submitted_at ?? null,
    last_saved_at: row.last_saved_at ?? row.created_at ?? new Date().toISOString(),
    created_at: row.created_at ?? row.last_saved_at ?? new Date().toISOString(),
    quote_number: row.quote_number ?? null,
    order_number: row.order_number ?? null,
    source_quote_id: row.source_quote_id ?? null,
    source_quote_number: row.source_quote_number ?? null,
  };
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
  options?: { sourceQuoteId?: string; sourceQuoteNumber?: string },
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
      data: null, id: null, error: formatSupabaseError(authError), itemsError: null,
      quote_number: null, order_number: null, source_quote_id: null, source_quote_number: null,
    };
  }

  if (!user) {
    const message = 'No authenticated Supabase user found. Please log in again.';
    console.error(message);
    return {
      data: null, id: null, error: message, itemsError: null,
      quote_number: null, order_number: null, source_quote_id: null, source_quote_number: null,
    };
  }

  const documentType = state.flowType === 'order' ? 'order' : 'quote';
  const isOrder = documentType === 'order';
  const sourceQuoteId = options?.sourceQuoteId;
  const sourceQuoteNumber = options?.sourceQuoteNumber;

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
    quote_number: isOrder ? null : generateReferenceNumber('Q'),
    order_number: isOrder ? generateReferenceNumber('O') : null,
    source_quote_id: sourceQuoteId ?? null,
    source_quote_number: sourceQuoteNumber ?? null,
  };

  const { data, error } = await insertConfigurationRow(row);

  if (error || !data) {
    console.error('Failed to save configuration:', error);
    return {
      data: null, id: null, error: formatSupabaseError(error), itemsError: null,
      quote_number: null, order_number: null, source_quote_id: null, source_quote_number: null,
    };
  }

  const itemsError = await saveConfigurationItems(data.id, state);

  const savedQuoteNumber = (row.quote_number as string) ?? data.quote_number ?? null;
  const savedOrderNumber = (row.order_number as string) ?? data.order_number ?? null;

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
      quote_number: savedQuoteNumber,
      order_number: savedOrderNumber,
      source_quote_id: sourceQuoteId ?? null,
      source_quote_number: sourceQuoteNumber ?? null,
    }, ownerEmail),
    id: data.id,
    error: null,
    itemsError,
    quote_number: savedQuoteNumber,
    order_number: savedOrderNumber,
    source_quote_id: sourceQuoteId ?? null,
    source_quote_number: sourceQuoteNumber ?? null,
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
