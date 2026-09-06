import { supabase } from '@/lib/supabase';
import { ConfiguratorState, MachineConfig } from '@/types/configurator';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';
import { OWNERSHIP_REQUIRED_MESSAGE } from '@/lib/configuratorOwnership';
import { listHiddenConfigurationIdsForScope, type HideScope } from '@/lib/userHiddenConfigurationsService';
import { getActiveSellerView, getSellerViewByEmail } from '@/lib/activeMode';
import { normalizeSellerInitials } from '@/lib/sellerInitials';
import { generateLocalCrmDocumentNumber, getNextCrmDocumentNumber } from '@/lib/crmNumberSequencesService';
import { deriveLegacyPipelineStage, NEXT_ACTIVITY_WON } from '@/lib/leadStatus';

async function recordConfiguratorUsage(activeSeconds = 0): Promise<void> {
  try {
    const { recordPortalModuleUsageByKey } = await import('@/lib/visitorTracking');
    await recordPortalModuleUsageByKey({
      moduleKey: 'configurator',
      activeSeconds,
      visitIncrement: 0,
    });
  } catch (e) {
    console.warn('[configurationsService] configurator analytics failed (ignored):', e);
  }
}

export function buildSubmittedOrderLeadWonPatch() {
  return {
    incomplete_from_configurator: false,
    pipeline_stage: deriveLegacyPipelineStage(NEXT_ACTIVITY_WON),
    next_activity: NEXT_ACTIVITY_WON,
    probability: 100,
    status: 'closed',
  } as const;
}


/**
 * Account-panel ("Min konto") scope.
 *
 *  - 'seller'  → restrict to rows owned by a specific seller (email/initials).
 *                Used for real Timan Sælger users AND for backend users who
 *                are currently "viewing as <seller>". Backend cannot leak
 *                other sellers' cases into a seller view.
 *  - 'self'    → restrict to rows the auth user personally created. Used
 *                for backend in pure backend mode and for external roles
 *                (dealer / importer / service partner / dealer user).
 */
type AccountScope =
  | {
      kind: 'seller';
      sellerEmail: string;
      sellerInitialsAliases: string[];
      /** app_users.id of the seller (matches configurations.assigned_seller_id). */
      sellerAppUserId: string | null;
      /** auth.uid of the seller (matches configurations.created_by_user_id). */
      sellerAuthUserId: string | null;
    }
  | { kind: 'self'; userId: string };


/** Aliases so AK and AKR collapse to the same seller match list. */
function sellerInitialsAliases(initials: string): string[] {
  const norm = normalizeSellerInitials(initials);
  if (norm === 'AK') return ['AK', 'AKR'];
  return [norm];
}

/**
 * Look up the seller's app_users.id + auth_user_id so the seller scope can
 * also match rows where seller_email / seller_initials were not populated
 * (legacy / direct configurator save paths) but assigned_seller_id or
 * created_by_user_id correctly point at the seller. Without this, orders
 * created by BP on behalf of a dealer can be visible on the CRM dealer
 * detail page and in Budget yet missing from "Min konto".
 */
async function lookupSellerIds(email: string): Promise<{ appUserId: string | null; authUserId: string | null }> {
  try {
    const { data } = await supabase
      .from('app_users')
      .select('id, auth_user_id')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    return {
      appUserId: (data?.id as string | null) ?? null,
      authUserId: (data?.auth_user_id as string | null) ?? null,
    };
  } catch {
    return { appUserId: null, authUserId: null };
  }
}




async function resolveAccountScope(
  ownerEmail: string,
  authUserId: string,
): Promise<AccountScope> {
  // 1) "View as seller" override (backend users) — strictly scope to that seller.
  const view = getActiveSellerView(ownerEmail);
  if (view) {
    const ids = await lookupSellerIds(view.email);
    const aliases = sellerInitialsAliases(view.initials);
    return {
      kind: 'seller',
      sellerEmail: view.email,
      sellerInitialsAliases: aliases,
      sellerAppUserId: ids.appUserId,
      sellerAuthUserId: ids.authUserId,
    };
  }
  // 2) If the logged-in email matches a known Timan seller mailbox, scope by that seller.
  const own = getSellerViewByEmail(ownerEmail);
  if (own) {
    const ids = await lookupSellerIds(own.email);
    const aliases = sellerInitialsAliases(own.initials);
    return {
      kind: 'seller',
      sellerEmail: own.email,
      sellerInitialsAliases: aliases,
      // When the seller is the actually logged-in user, prefer the auth.uid
      // from the live session over the app_users.auth_user_id mapping.
      sellerAppUserId: ids.appUserId,
      sellerAuthUserId: ids.authUserId ?? authUserId,
    };
  }
  // 3) Look up portal_role to decide between backend (self) and seller (scoped).
  try {
    const { data } = await supabase
      .from('app_users')
      .select('id, auth_user_id, portal_role, email')
      .eq('email', ownerEmail.toLowerCase())
      .maybeSingle();
    const role = (data?.portal_role || '').toLowerCase();
    if (role === 'timan_seller') {
      const email = ownerEmail.toLowerCase();
      return {
        kind: 'seller',
        sellerEmail: email,
        sellerInitialsAliases: [],
        sellerAppUserId: (data?.id as string | null) ?? null,
        sellerAuthUserId: (data?.auth_user_id as string | null) ?? authUserId,
      };
    }
  } catch { /* fall through */ }
  // 4) Backend in backend mode, external roles, or unknown → personal scope.
  return { kind: 'self', userId: authUserId };
}

function applyAccountScope<T extends { eq: (...a: any[]) => any; or: (...a: any[]) => any }>(
  query: T,
  scope: AccountScope,
): T {
  if (scope.kind === 'self') {
    return query.eq('created_by_user_id', scope.userId) as T;
  }
  // Seller scope: match the seller-ownership columns. Mirrors the visibility
  // rules used by CRM → Ordrer / Budget (crmConfigurationsService.rowVisibleToScope)
  // so Min konto shows the SAME set of cases as CRM for the active seller.
  //
  // Intentionally does NOT match by dealer_account_id — including the
  // seller's assigned dealers would pull in rows other sellers created for
  // those dealers, leaking unrelated orders into Min konto.
  const parts: string[] = [`seller_email.eq.${scope.sellerEmail}`];
  if (scope.sellerInitialsAliases.length > 0) {
    parts.push(`seller_initials.in.(${scope.sellerInitialsAliases.join(',')})`);
  }
  if (scope.sellerAppUserId) {
    parts.push(`assigned_seller_id.eq.${scope.sellerAppUserId}`);
    // Legacy rows can carry the seller's app_users.id in created_by_user_id
    // (mirrors CRM → Ordrer rowVisibleToScope fallback).
    parts.push(`created_by_user_id.eq.${scope.sellerAppUserId}`);
  }
  if (scope.sellerAuthUserId) {
    parts.push(`created_by_user_id.eq.${scope.sellerAuthUserId}`);
  }
  return query.or(parts.join(',')) as T;
}


/**
 * Resolve the Min-konto hide scope for the current logged-in user.
 *
 * Mirrors resolveAccountScope() so a hide written by NB-viewing-as-BP and
 * a hide written by BP-direct both target the same `effective_seller_email`
 * — keeping the case hidden in BP's Min konto across both sessions.
 */
export async function resolveHideScopeForCurrentUser(
  ownerEmail: string,
): Promise<HideScope> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { kind: 'self' };
    const scope = await resolveAccountScope(ownerEmail, user.id);
    if (scope.kind === 'seller') {
      return { kind: 'seller', sellerEmail: scope.sellerEmail };
    }
    return { kind: 'self' };
  } catch {
    return { kind: 'self' };
  }
}


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
  created_case_at: string | null;
  quote_sent_at: string | null;
  order_sent_at: string | null;
  sent_pdf_path: string | null;
  sent_pdf_filename: string | null;
  /** Phase 33 — optional link to a CRM lead. Null when not linked. */
  lead_id: string | null;
  // Ownership snapshot — used to restore the dealer/seller picker when reopening.
  seller_initials: string | null;
  seller_email: string | null;
  seller_name: string | null;
  assigned_seller_id: string | null;
  dealer_number: string | null;
  dealer_name: string | null;
  dealer_account_id: string | null;
}

export const SENT_PDF_BUCKET = 'sent-pdfs';

/** Generate a local fallback document number for quotes or orders. */
export function generateReferenceNumber(prefix: 'Q' | 'T' | 'O'): string {
  return generateLocalCrmDocumentNumber(prefix === 'O' ? 'order' : 'quote');
}

/**
 * Ensure a saved quote has its reference number. Order numbers are deliberately
 * excluded: an O-number is the canonical evidence of an actually submitted
 * order and is assigned atomically by markAsOrderSubmitted().
 */
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

  if (!needsQuote) {
    return { quote_number: row.quote_number, order_number: row.order_number };
  }

  const patch: Record<string, unknown> = {};
  const result = { quote_number: row.quote_number as string | null, order_number: row.order_number as string | null };

  if (needsQuote) {
    const qn = await getNextCrmDocumentNumber('quote');
    patch.quote_number = qn;
    result.quote_number = qn;
  }
  await updateConfigurationRow(configId, patch);
  return result;
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
  const flowType = deriveEditableFlowType(row);
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

function deriveEditableFlowType(row: Record<string, any>): 'quote' | 'order' {
  if (row.order_sent_at || row.submitted_at) return 'order';
  if (row.quote_number && row.quote_sent_at && !row.order_number) return 'quote';
  return row.case_type === 'order' || row.document_type === 'order' ? 'order' : 'quote';
}

function buildRestoredState(
  row: Record<string, any>,
  items: SavedConfigurationItem[],
  storedPayload: StoredConfigurationPayload | null,
): { state: ConfiguratorState; hasFullState: boolean } {
  const parsedState = parseStateJson(row.state_json);
  const payloadState = storedPayload?.state ?? null;
  const baseState = parsedState ?? payloadState ?? buildFallbackState(row);
  const storedStateHasMachineSelections = Boolean(
    (parsedState ?? payloadState)?.machineConfigs?.length,
  );
  const rebuiltFromItems = !storedStateHasMachineSelections && items.length > 0
    ? rebuildMachineConfigsFromItems(items)
    : null;
  const flowType = deriveEditableFlowType(row);
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
    // Phase 27 — prefer the dedicated column when present, falling back to
    // whatever the embedded state had (or the default inside normalize).
    paymentTerms: typeof row.payment_terms === 'string' && row.payment_terms.trim()
      ? row.payment_terms
      : baseState.paymentTerms,
  });

  return {
    state: restoredState,
    hasFullState: Boolean(parsedState || payloadState || restoredState.machineConfigs.length > 0),
  };
}

function mapConfigurationRow(row: Record<string, any>, ownerEmail: string): SavedConfiguration {
  const storedPayload = parseStoredConfigurationPayload(row.note);
  const { state, hasFullState } = buildRestoredState(row, [], storedPayload);
  const caseType = deriveEditableFlowType(row);

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
    created_case_at: row.created_case_at ?? row.created_at ?? null,
    quote_sent_at: row.quote_sent_at ?? null,
    order_sent_at: row.order_sent_at ?? null,
    sent_pdf_path: row.sent_pdf_path ?? null,
    sent_pdf_filename: row.sent_pdf_filename ?? null,
    lead_id: row.lead_id ?? null,
    seller_initials: row.seller_initials ?? null,
    seller_email: row.seller_email ?? null,
    seller_name: row.seller_name ?? null,
    assigned_seller_id: row.assigned_seller_id ?? null,
    dealer_number: row.dealer_number ?? null,
    dealer_name: row.dealer_name ?? null,
    dealer_account_id: row.dealer_account_id ?? null,
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

/**
 * Load all saved configurations visible to the current "Min konto" scope.
 *
 * Scope is resolved by resolveAccountScope():
 *   • Real Timan Sælger OR backend user "viewing as <seller>" → strictly
 *     filter by that seller's email (and AK/AKR alias initials).
 *   • Backend user in pure backend mode, external roles, unknown users →
 *     personal scope (rows the auth user themselves created).
 *
 * This guarantees a seller (or backend impersonating one) never sees
 * another seller's saved cases in the configurator's "Min konto" modal.
 */
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

  const scope = await resolveAccountScope(ownerEmail, user.id);

  // Unified query path: filter by seller-ownership columns (seller scope) or
  // created_by_user_id (self scope). Importantly this does NOT restrict to
  // document_type='order' — Min konto must show both saved quotes and orders
  // for the active seller (incl. backend "viewing as <seller>" mode).
  const baseQuery = supabase
    .from('configurations')
    .select('*')
    .neq('case_status', 'deleted')
    .order('created_at', { ascending: false });

  const { data, error } = await applyAccountScope(baseQuery, scope);

  if (error) {
    console.error('Failed to load configurations:', error);
    return [];
  }

  const hiddenIds = await listHiddenConfigurationIdsForScope(
    scope.kind === 'seller'
      ? { kind: 'seller', sellerEmail: scope.sellerEmail }
      : { kind: 'self' },
  );
  const filtered = hiddenIds.size > 0
    ? (data || []).filter((row) => !hiddenIds.has(String((row as { id: string }).id)))
    : (data || []);

  return filtered.map((row) => mapConfigurationRow(row, ownerEmail));
}

export async function loadConfigurationById(id: string, ownerEmail: string): Promise<SavedConfiguration | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) {
    console.error('Failed to read auth user for configuration by id:', authError);
    return null;
  }

  if (!user) return null;

  const scope = await resolveAccountScope(ownerEmail, user.id);

  // Apply Min konto scope when opening a row from the modal so a seller
  // (or backend viewing-as-seller) cannot open another seller's case by id.
  const baseQuery = supabase
    .from('configurations')
    .select('*')
    .eq('id', id);
  const { data, error } = await applyAccountScope(baseQuery, scope).maybeSingle();

  if (error) {
    console.error('Failed to load configuration by id:', error);
    return null;
  }

  if (!data) return null;

  const items = await loadConfigurationItems(id);

  return mapConfigurationRowWithItems(data, ownerEmail, items);
}

/**
 * Load a configuration by id WITHOUT per-user account scope.
 *
 * Used by CRM → Tilbud/Ordrer "Åbn i konfigurator". The caller is
 * responsible for verifying the user is allowed to see the row through
 * the CRM visibility rules (rowVisibleToScope in crmConfigurationsService).
 * RLS on the underlying tables still applies.
 */
export async function loadConfigurationByIdUnscoped(id: string, ownerEmail: string): Promise<SavedConfiguration | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.error('[loadConfigurationByIdUnscoped] auth error:', authError);
    return null;
  }
  if (!user) return null;

  const { data, error } = await supabase
    .from('configurations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[loadConfigurationByIdUnscoped] failed:', error);
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
  const caseType = deriveEditableFlowType(row);

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
    created_case_at: row.created_case_at ?? row.created_at ?? null,
    quote_sent_at: row.quote_sent_at ?? null,
    order_sent_at: row.order_sent_at ?? null,
    sent_pdf_path: row.sent_pdf_path ?? null,
    sent_pdf_filename: row.sent_pdf_filename ?? null,
    lead_id: row.lead_id ?? null,
    seller_initials: row.seller_initials ?? null,
    seller_email: row.seller_email ?? null,
    seller_name: row.seller_name ?? null,
    assigned_seller_id: row.assigned_seller_id ?? null,
    dealer_number: row.dealer_number ?? null,
    dealer_name: row.dealer_name ?? null,
    dealer_account_id: row.dealer_account_id ?? null,
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

/**
 * Ownership payload persisted alongside every saved configuration.
 * See src/lib/configuratorOwnership.ts for how this is computed.
 * All fields are optional — unknown columns are dropped automatically by
 * insertConfigurationRow's missing-column retry, so older databases keep
 * working even before phase23_configurator_ownership.sql is applied.
 */
export interface SaveOwnership {
  seller_initials?: string | null;
  seller_email?: string | null;
  seller_name?: string | null;
  assigned_seller_id?: string | null;
  dealer_number?: string | null;
  dealer_name?: string | null;
  dealer_account_id?: string | null;
  created_by_email?: string | null;
  created_by_role?: string | null;
  active_mode?: string | null;
  owner_status?: string | null;
}

type ConfigurationPricingMode = 'default' | 'messe';

/** Save a new configuration */
export async function saveConfiguration(
  state: ConfiguratorState,
  label: string,
  ownerEmail: string,
  options?: {
    sourceQuoteId?: string;
    sourceQuoteNumber?: string;
    ownership?: SaveOwnership;
    /** Phase 33 — optional CRM lead to link this case to. */
    leadId?: string | null;
    pricingMode?: ConfigurationPricingMode;
  },
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

  const ownership = options?.ownership;
  const allowMissingDealer = options?.pricingMode === 'messe';
  const missingSellerOwnership = !ownership?.seller_initials || !ownership.seller_email || !ownership.assigned_seller_id;
  const missingDealerOwnership = !ownership?.dealer_number || !ownership.dealer_account_id;

  if (missingSellerOwnership || (!allowMissingDealer && missingDealerOwnership)) {
    return {
      data: null, id: null, error: OWNERSHIP_REQUIRED_MESSAGE, itemsError: null,
      quote_number: null, order_number: null, source_quote_id: null, source_quote_number: null,
    };
  }

  const now = new Date().toISOString();
  const storedNote = serializeStoredConfigurationPayload(state, state.internalNote ?? '', false, null);

  // Pre-compute subtotal/total_price so even drafts and the initial save carry
  // monetary values (matters for legacy DBs that have these columns but no
  // state_json column for downstream calc).
  let initialSubtotal = 0;
  let initialTotal = 0;
  try {
    const { calcConfigurationTotals } = await import('@/lib/calcConfiguration');
    const totals = calcConfigurationTotals(state, { grossManualDiscountOnly: options?.pricingMode === 'messe' });
    initialSubtotal = Math.round(totals.subtotal || 0);
    initialTotal = Math.round(totals.finalPrice || 0);
  } catch { /* ignore */ }

  const row: Record<string, unknown> = {
    created_by_email: options.ownership.created_by_email ?? user.email?.toLowerCase() ?? ownerEmail.toLowerCase(),
    created_by_user_id: user.id,
    title: label,
    document_type: documentType,
    case_type: documentType,
    case_status: 'aktiv' as SavedStatus,
    status: isOrder ? 'aktiv' : 'aktiv',
    subtotal: initialSubtotal,
    total_price: initialTotal,
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
    created_case_at: now,
    quote_sent_at: null,
    order_sent_at: null,
    quote_number: isOrder ? null : await getNextCrmDocumentNumber('quote'),
    // O-numbers are assigned only by markAsOrderSubmitted after the order
    // has been successfully sent. An editable order draft has no O-number.
    order_number: null,
    source_quote_id: sourceQuoteId ?? null,
    source_quote_number: sourceQuoteNumber ?? null,
    // Ownership snapshot (Phase 23). Unknown columns are stripped by
    // insertConfigurationRow's missing-column retry, so this stays
    // backwards-compatible with databases where the migration hasn't run.
    seller_initials:    options?.ownership?.seller_initials    ?? null,
    seller_email:       options?.ownership?.seller_email       ?? null,
    seller_name:        options?.ownership?.seller_name        ?? null,
    assigned_seller_id: options?.ownership?.assigned_seller_id ?? null,
    dealer_number:      options?.ownership?.dealer_number      ?? null,
    dealer_name:        options?.ownership?.dealer_name        ?? null,
    dealer_account_id:  options?.ownership?.dealer_account_id  ?? null,
    created_by_role:    options?.ownership?.created_by_role    ?? null,
    active_mode:        options?.ownership?.active_mode        ?? null,
    owner_status:       options?.ownership?.owner_status       ?? 'aktiv',
    // Phase 27 — payment terms (information only, never used in calc).
    // Stripped automatically on older DBs by insertConfigurationRow's
    // missing-column retry.
    payment_terms: state.paymentTerms ?? null,
    // Phase 33 — link to a CRM lead (column auto-stripped on legacy DBs).
    lead_id: options?.leadId ?? null,
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
  void recordConfiguratorUsage();

  const savedQuoteNumber = (row.quote_number as string) ?? data.quote_number ?? null;
  const savedOrderNumber = (row.order_number as string) ?? data.order_number ?? null;

  // CRM: log quote_created / order_created on first save (best-effort).
  try {
    const { logActivity } = await import('@/lib/crmActivitiesService');
    await logActivity({
      activity_type: isOrder ? 'order_created' : 'quote_created',
      configuration_id: data.id,
      quote_id: isOrder ? null : data.id,
      order_id: isOrder ? data.id : null,
      title: (isOrder ? savedOrderNumber : savedQuoteNumber) || label,
      description: isOrder ? 'Ordre oprettet' : 'Tilbud oprettet',
      status: 'aktiv',
      created_by_user_id: user.id,
      created_by_name: user.email ?? null,
      assigned_owner_user_id: options?.ownership?.assigned_seller_id ?? null,
      assigned_owner_name: options?.ownership?.seller_name ?? options?.ownership?.seller_initials ?? null,
      meta: {
        seller_initials: options?.ownership?.seller_initials ?? null,
        seller_email: options?.ownership?.seller_email ?? null,
        dealer_number: options?.ownership?.dealer_number ?? null,
        dealer_name: options?.ownership?.dealer_name ?? null,
        dealer_account_id: options?.ownership?.dealer_account_id ?? null,
        document_type: documentType,
      },
    });
  } catch (e) {
    console.warn('[saveConfiguration] crm log failed (ignored):', e);
  }

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

/**
 * Update an existing saved configuration in place (no new row, no new reference numbers).
 * Used by the "Gem ændringer / Save changes" button when a previously saved case has been
 * reopened from Min konto or CRM. Preserves quote/order numbers and ownership unless an
 * explicit ownership payload is passed in.
 */
export async function updateConfiguration(
  id: string,
  state: ConfiguratorState,
  options?: { ownership?: SaveOwnership; leadId?: string | null; pricingMode?: ConfigurationPricingMode },
): Promise<{ error: string | null; itemsError: string | null }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: authError ? formatSupabaseError(authError) : 'No authenticated user', itemsError: null };
  }

  let subtotal = 0;
  let totalPrice = 0;
  try {
    const { calcConfigurationTotals } = await import('@/lib/calcConfiguration');
    const totals = calcConfigurationTotals(state, { grossManualDiscountOnly: options?.pricingMode === 'messe' });
    subtotal = Math.round(totals.subtotal || 0);
    totalPrice = Math.round(totals.finalPrice || 0);
  } catch { /* ignore */ }

  // Preserve existing internal_note / pdf flags and an already established
  // CRM lead relation. Editing a saved quote/order must never create or
  // replace a linked lead through ordinary configuration save.
  let internalNote = state.internalNote ?? '';
  let pdfDownloaded = false;
  let pdfDownloadedAt: string | null = null;
  let persistedLeadId: string | null = null;
  try {
    const { data: row } = await supabase
      .from('configurations')
      .select('internal_note, note, pdf_downloaded, pdf_downloaded_at, lead_id')
      .eq('id', id)
      .maybeSingle();
    if (row) {
      const storedPayload = parseStoredConfigurationPayload((row as Record<string, unknown>).note);
      internalNote = state.internalNote
        ?? ((row as Record<string, unknown>).internal_note as string | null)
        ?? storedPayload?.internalNote
        ?? '';
      pdfDownloaded = Boolean((row as Record<string, unknown>).pdf_downloaded ?? storedPayload?.pdf_downloaded);
      pdfDownloadedAt = ((row as Record<string, unknown>).pdf_downloaded_at as string | null)
        ?? storedPayload?.pdf_downloaded_at
        ?? null;
      persistedLeadId = ((row as Record<string, unknown>).lead_id as string | null) ?? null;
    }
  } catch { /* ignore */ }

  const now = new Date().toISOString();
  const storedNote = serializeStoredConfigurationPayload(state, internalNote, pdfDownloaded, pdfDownloadedAt);

  const patch: Record<string, unknown> = {
    document_type: state.flowType,
    case_type: state.flowType,
    state_json: state,
    note: storedNote,
    internal_note: internalNote,
    language: state.language,
    delivery_date: state.date || null,
    delivery_method: state.deliveryMethod || null,
    delivery_startup_option: state.deliveryDeliverStartup,
    payment_terms: state.paymentTerms ?? null,
    subtotal,
    total_price: totalPrice,
    last_saved_at: now,
    ...(persistedLeadId
      ? { lead_id: persistedLeadId }
      : options && Object.prototype.hasOwnProperty.call(options, 'leadId')
        ? { lead_id: options.leadId ?? null }
        : {}),
    ...(options?.ownership ? {
      seller_initials: options.ownership.seller_initials ?? null,
      seller_email: options.ownership.seller_email ?? null,
      seller_name: options.ownership.seller_name ?? null,
      assigned_seller_id: options.ownership.assigned_seller_id ?? null,
      dealer_number: options.ownership.dealer_number ?? null,
      dealer_name: options.ownership.dealer_name ?? null,
      dealer_account_id: options.ownership.dealer_account_id ?? null,
    } : {}),
  };

  const { error } = await updateConfigurationRow(id, patch);
  if (error) {
    console.error('[updateConfiguration] update error:', error);
    return { error: formatSupabaseError(error), itemsError: null };
  }

  // Replace configuration_items so machine/accessory rows reflect the edits.
  const { error: delErr } = await supabase
    .from('configuration_items')
    .delete()
    .eq('configuration_id', id);
  if (delErr) {
    console.warn('[updateConfiguration] delete items failed:', delErr);
    return { error: null, itemsError: formatSupabaseError(delErr) };
  }
  const itemsError = await saveConfigurationItems(id, state);
  void recordConfiguratorUsage();
  return { error: null, itemsError };
}

/** Update the flow/document type (quote ↔ order) on a saved configuration.
 * Persists case_type, document_type and state_json.flowType. Switching to an
 * order never allocates an O-number; submission owns that atomic transition.
 */
export async function updateConfigurationFlowType(
  id: string,
  flowType: 'quote' | 'order',
  ownership?: SaveOwnership,
  options?: { pricingMode?: ConfigurationPricingMode },
): Promise<{ quote_number: string | null; order_number: string | null; error: string | null }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    const message = authError ? formatSupabaseError(authError) : 'No authenticated Supabase user found.';
    console.error('[updateConfigurationFlowType] auth error:', message);
    return { quote_number: null, order_number: null, error: message };
  }

  // Unscoped read — converting a quote opened from CRM (e.g. backend user
  // reopens Birger's quote) must work even when the current user is NOT
  // the original creator. RLS still guards the UPDATE below.
  const { data: row, error: loadError } = await supabase
    .from('configurations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadError || !row) {
    const message = loadError ? formatSupabaseError(loadError) : 'Configuration not found';
    console.error('[updateConfigurationFlowType] load error:', message);
    return { quote_number: null, order_number: null, error: message };
  }

  const isOrder = flowType === 'order';
  const allowMissingDealer = options?.pricingMode === 'messe';
  const missingSellerOwnership = !ownership?.seller_initials || !ownership.seller_email || !ownership.assigned_seller_id;
  const missingDealerOwnership = !ownership?.dealer_number || !ownership.dealer_account_id;

  if (isOrder && (missingSellerOwnership || (!allowMissingDealer && missingDealerOwnership))) {
    return { quote_number: null, order_number: null, error: OWNERSHIP_REQUIRED_MESSAGE };
  }
  const storedPayload = parseStoredConfigurationPayload(row.note);
  const baseState = parseStateJson(row.state_json) ?? storedPayload?.state ?? buildFallbackState(row);
  const nextState = normalizeConfiguratorState({ ...baseState, flowType });

  let quoteNumber: string | null = row.quote_number ?? null;
  let orderNumber: string | null = row.order_number ?? null;

  if (!isOrder && !quoteNumber) quoteNumber = await getNextCrmDocumentNumber('quote');
  // Do not allocate an O-number for a draft or merely switching the flow.
  // markAsOrderSubmitted() assigns it with submitted_at/order_sent_at.

  const patch: Record<string, unknown> = {
    case_type: flowType,
    document_type: flowType,
    state_json: nextState,
    note: serializeStoredConfigurationPayload(
      nextState,
      row.internal_note ?? storedPayload?.internalNote ?? '',
      Boolean(row.pdf_downloaded ?? storedPayload?.pdf_downloaded),
      row.pdf_downloaded_at ?? storedPayload?.pdf_downloaded_at ?? null,
    ),
    quote_number: quoteNumber,
    order_number: orderNumber,
    last_saved_at: new Date().toISOString(),
    ...(ownership ? {
      seller_initials: ownership.seller_initials ?? null,
      seller_email: ownership.seller_email ?? null,
      seller_name: ownership.seller_name ?? null,
      assigned_seller_id: ownership.assigned_seller_id ?? null,
      dealer_number: ownership.dealer_number ?? null,
      dealer_name: ownership.dealer_name ?? null,
      dealer_account_id: ownership.dealer_account_id ?? null,
      created_by_role: ownership.created_by_role ?? null,
      active_mode: ownership.active_mode ?? null,
      owner_status: ownership.owner_status ?? 'aktiv',
    } : {}),
  };

  const { error } = await updateConfigurationRow(id, patch);

  if (error) {
    console.error('[updateConfigurationFlowType] update error:', error);
    return { quote_number: null, order_number: null, error: formatSupabaseError(error) };
  }

  console.info('[updateConfigurationFlowType] saved', { id, flowType, quoteNumber, orderNumber });
  return { quote_number: quoteNumber, order_number: orderNumber, error: null };
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
/**
 * Admin-only: update only seller/dealer ownership fields on an order/quote.
 * Does NOT touch pricing, products, customer data, totals, PDF, or webhook fields.
 */
export interface OwnershipPatch {
  seller_initials: string | null;
  seller_email: string | null;
  seller_name: string | null;
  assigned_seller_id: string | null;
  dealer_number: string | null;
  dealer_name: string | null;
  dealer_account_id: string | null;
}

export async function updateConfigurationOwnership(
  id: string,
  patch: OwnershipPatch,
): Promise<{ ok: boolean; error: string | null }> {
  const payload: Record<string, unknown> = {
    seller_initials: patch.seller_initials,
    seller_email: patch.seller_email,
    seller_name: patch.seller_name,
    assigned_seller_id: patch.assigned_seller_id,
    dealer_number: patch.dealer_number,
    dealer_name: patch.dealer_name,
    dealer_account_id: patch.dealer_account_id,
    last_saved_at: new Date().toISOString(),
  };
  const { error } = await updateConfigurationRow(id, payload);
  if (error) {
    console.error('[updateConfigurationOwnership] error:', error);
    return { ok: false, error: formatSupabaseError(error) };
  }
  return { ok: true, error: null };
}

export async function deleteConfiguration(id: string) {
  const { error } = await supabase
    .from('configurations')
    .update({ case_status: 'deleted' as SavedStatus, last_saved_at: new Date().toISOString() })
    .eq('id', id);

  if (error) console.error('Failed to soft-delete configuration:', error);
}

/** Mark configuration as order submitted */
export async function markAsOrderSubmitted(id: string, options?: { pricingMode?: ConfigurationPricingMode }) {
  const nowIso = new Date().toISOString();
  // Unscoped row read so backend/CRM users can convert a quote they did
  // NOT originally create (e.g. backend reopens Birger's quote). RLS still
  // guards the actual UPDATE below.
  let orderSentAt: string | null = nowIso;
  let rowSnapshot: Record<string, unknown> | null = null;
  try {
    const { data: row } = await supabase
      .from('configurations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    rowSnapshot = (row as Record<string, unknown> | null) ?? null;
    const existingOrderSentAt = rowSnapshot?.order_sent_at;
    if (typeof existingOrderSentAt === 'string' && existingOrderSentAt) {
      orderSentAt = existingOrderSentAt;
    }
  } catch (e) {
    console.warn('[markAsOrderSubmitted] row snapshot read failed (ignored):', e);
  }

  // Compute totals from the persisted state so subtotal/total_price stay in
  // sync with what the user actually saw. Falls back gracefully if the
  // state can't be parsed.
  let subtotal = 0;
  let totalPrice = 0;
  try {
    const { calcConfigurationTotals } = await import('@/lib/calcConfiguration');
    const storedPayload = parseStoredConfigurationPayload(rowSnapshot?.note);
    const state = parseStateJson(rowSnapshot?.state_json) ?? storedPayload?.state ?? null;
    if (state) {
      const totals = calcConfigurationTotals(state, { grossManualDiscountOnly: options?.pricingMode === 'messe' });
      subtotal = Math.round(totals.subtotal || 0);
      totalPrice = Math.round(totals.finalPrice || 0);
    }
  } catch (e) {
    console.warn('[markAsOrderSubmitted] totals calc failed (ignored):', e);
  }

  // Ensure the row has an order_number. Converted quotes may not have one
  // yet — without it CRM → Ordrer would show a blank reference.
  const existingOrderNumber = (rowSnapshot?.order_number as string | null) ?? null;
  const orderNumber = existingOrderNumber || await getNextCrmDocumentNumber('order');

  const { error } = await updateConfigurationRow(id, {
    // CRITICAL: crm_configurations_view returns
    //   coalesce(document_type, case_type) AS document_type
    // so BOTH must flip to 'order' for the row to leave CRM → Tilbud and
    // appear in CRM → Ordrer. Without document_type='order' a converted
    // quote stays in Tilbud and never counts as a real order.
    case_type: 'order',
    document_type: 'order',
    case_status: 'ordre_afgivet' as SavedStatus,
    status: 'ordre_afgivet',
    order_number: orderNumber,
    subtotal,
    total_price: totalPrice,
    submitted_at: nowIso,
    order_sent_at: orderSentAt,
    last_saved_at: nowIso,
  });

  if (error) console.error('Failed to mark as order submitted:', error);
  else void recordConfiguratorUsage(1);

  const linkedLeadId = (rowSnapshot?.lead_id as string | null) ?? null;
  if (!error && linkedLeadId) {
    try {
      const { updateLead } = await import('@/lib/crmLeadsService');
      await updateLead(linkedLeadId, buildSubmittedOrderLeadWonPatch() as any);
    } catch (e) {
      console.warn('[markAsOrderSubmitted] linked lead close failed (ignored):', e);
    }
  }

  // CRM: log order_sent activity. Strict mode = no misleading "Gemt lokalt"
  // toast on this send flow; failures are surfaced to the console for
  // debugging, and the order email/n8n flow is unaffected.
  try {
    const { logActivity } = await import('@/lib/crmActivitiesService');
    await logActivity({
      activity_type: 'order_sent',
      configuration_id: id,
      order_id: id,
      title: (rowSnapshot?.order_number as string | null) || (rowSnapshot?.title as string | null) || 'Ordre afgivet',
      description: 'Ordre afgivet via konfigurator',
      status: 'ordre_afgivet',
      account_id: (rowSnapshot?.assigned_seller_id as string | null) ?? null,
      account_name: (rowSnapshot?.created_by_email as string | null) ?? null,
      created_by_user_id: (rowSnapshot?.created_by_user_id as string | null) ?? null,
      created_by_name: (rowSnapshot?.created_by_email as string | null) ?? null,
      assigned_owner_user_id: (rowSnapshot?.assigned_seller_id as string | null) ?? null,
    }, { strict: true });
  } catch (e) {
    console.warn('[markAsOrderSubmitted] crm activity log failed (Supabase write rejected; not persisted to server):', e);
  }
}

/** Mark PDF as downloaded. If flowType === 'quote', also stamps quote_sent_at (only first time). */
export async function markPdfDownloaded(id: string, flowType?: 'quote' | 'order', options?: { pricingMode?: ConfigurationPricingMode }) {
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

  const patch: Record<string, unknown> = {
    pdf_downloaded: true,
    pdf_downloaded_at: downloadedAt,
    note: serializeStoredConfigurationPayload(state, row.internal_note ?? storedPayload?.internalNote ?? '', true, downloadedAt),
    last_saved_at: downloadedAt,
  };

  // Keep subtotal/total_price up-to-date on every PDF save (orders + quotes).
  // Unknown columns are stripped by updateConfigurationRow's retry.
  try {
    const { calcConfigurationTotals } = await import('@/lib/calcConfiguration');
    const totals = calcConfigurationTotals(state, { grossManualDiscountOnly: options?.pricingMode === 'messe' });
    patch.subtotal = Math.round(totals.subtotal || 0);
    patch.total_price = Math.round(totals.finalPrice || 0);
  } catch (e) {
    console.warn('[markPdfDownloaded] totals calc failed (ignored):', e);
  }

  // Stamp quote_sent_at only for quotes, and only the first time
  const effectiveFlow = flowType ?? (row.case_type === 'order' || row.document_type === 'order' ? 'order' : 'quote');
  const isFirstQuoteSend = effectiveFlow === 'quote' && !row.quote_sent_at;
  if (isFirstQuoteSend) {
    patch.quote_sent_at = downloadedAt;
  }

  const { error } = await updateConfigurationRow(id, patch);

  if (error) {
    console.error('Failed to mark PDF downloaded:', error);
    throw new Error(formatSupabaseError(error));
  }
  void recordConfiguratorUsage(1);

  // CRM: log quote_sent on the first quote PDF download.
  if (isFirstQuoteSend) {
    try {
      const { logActivity } = await import('@/lib/crmActivitiesService');
      await logActivity({
        activity_type: 'quote_sent',
        configuration_id: id,
        quote_id: id,
        title: (row.quote_number as string | null) || (row.title as string | null) || 'Tilbud sendt',
        description: 'Tilbud sendt (PDF downloadet)',
        status: 'aktiv',
        account_id: (row.assigned_seller_id as string | null) ?? null,
        account_name: (row.created_by_email as string | null) ?? null,
        created_by_user_id: (row.created_by_user_id as string | null) ?? user.id,
        created_by_name: (row.created_by_email as string | null) ?? user.email ?? null,
        assigned_owner_user_id: (row.assigned_seller_id as string | null) ?? null,
      }, { strict: true });
    } catch (e) {
      console.warn('[markPdfDownloaded] crm activity log failed (Supabase write rejected; not persisted to server):', e);
    }

    // Phase 33 — if this quote is linked to a CRM lead, advance the lead to
    // "Offer sent" and log a Danish activity line. Best-effort, never throws.
    const linkedLeadId = (row.lead_id as string | null) ?? null;
    if (linkedLeadId) {
      try {
        const { updateLead } = await import('@/lib/crmLeadsService');
        await updateLead(linkedLeadId, {
          incomplete_from_configurator: false,
          pipeline_stage: 'Offer sent',
          next_activity: 'Offer sent to the customer',
          probability: 70,
          notes: [
            (row.title as string | null) || '',
            `Tilbud afgivet via konfiguratoren${row.quote_number ? ` — ${row.quote_number}` : ''}`,
          ].filter(Boolean).join('\n').trim() || null,
        } as any);
      } catch (e) {
        console.warn('[markPdfDownloaded] lead update failed (ignored):', e);
      }
      try {
        const { logActivity } = await import('@/lib/crmActivitiesService');
        await logActivity({
          activity_type: 'quote_sent',
          configuration_id: id,
          quote_id: id,
          // crm_activities has no lead_id column — keep linkage in meta.
          meta: { lead_id: linkedLeadId },
          title: (row.quote_number as string | null) || 'Tilbud afgivet via konfiguratoren',
          description: 'Tilbud afgivet via konfiguratoren',
          status: 'aktiv',
          created_by_user_id: (row.created_by_user_id as string | null) ?? user.id,
          assigned_owner_user_id: (row.assigned_seller_id as string | null) ?? null,
        });
      } catch (e) {
        console.warn('[markPdfDownloaded] linked-lead activity log failed (ignored):', e);
      }
    }
  }
}

/**
 * Upload the generated PDF for a sent order/quote to private Storage and
 * persist the path on the configuration row. Returns the storage path on
 * success, or null on failure (caller should not treat upload failure as
 * a send failure — the webhook itself already succeeded).
 */
export async function uploadSentPdf(
  configurationId: string,
  pdfBlob: Blob,
  filename: string,
): Promise<{ path: string | null; error: string | null }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    const message = authError ? formatSupabaseError(authError) : 'No authenticated user';
    console.error('[uploadSentPdf] auth error:', message);
    return { path: null, error: message };
  }

  // Path layout: <user_id>/<configuration_id>/<timestamp>-<filename>
  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const path = `${user.id}/${configurationId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(SENT_PDF_BUCKET)
    .upload(path, pdfBlob, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadError) {
    console.error('[uploadSentPdf] upload failed:', uploadError);
    return { path: null, error: uploadError.message };
  }

  const { error: updateError } = await updateConfigurationRow(configurationId, {
    sent_pdf_path: path,
    sent_pdf_filename: filename,
    sent_pdf_bucket: SENT_PDF_BUCKET,
  });


  if (updateError) {
    console.error('[uploadSentPdf] failed to persist path:', updateError);
    return { path, error: formatSupabaseError(updateError) };
  }

  return { path, error: null };
}

/**
 * Generate a short-lived signed URL to view a previously sent PDF.
 * Bucket is private; users only see their own files via RLS on
 * `storage.objects` (path must start with their auth user id).
 */
export async function getSentPdfSignedUrl(
  path: string,
  expiresInSeconds = 60,
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage
    .from(SENT_PDF_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.error('[getSentPdfSignedUrl] failed:', error);
    return { url: null, error: error?.message ?? 'Unknown error' };
  }

  return { url: data.signedUrl, error: null };
}


// ────────────────────────────────────────────────────────────
// Submitted-order lock helpers (duplicate-send protection)
// ────────────────────────────────────────────────────────────

/**
 * Returns true when the given configuration row represents an order that
 * has actually been submitted. An order number or workflow status alone is
 * not submission evidence: active order drafts keep their O- reference while
 * their cart remains editable. A submitted order has an order submission or
 * send timestamp.
 */
export function isOrderRowSubmitted(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  const documentType = (row.document_type as string | null) ?? null;
  const caseType = (row.case_type as string | null) ?? null;
  const submittedAt = (row.submitted_at as string | null) ?? null;
  const orderSentAt = (row.order_sent_at as string | null) ?? null;
  const orderNumber = (row.order_number as string | null) ?? null;

  if (orderSentAt || submittedAt) return true;

  const isOrder = documentType === 'order' || caseType === 'order' || Boolean(orderNumber);
  return isOrder && Boolean(orderSentAt || submittedAt);
}

/** Same logic but for the SavedConfiguration shape. */
export function isSavedConfigurationOrderLocked(
  saved: Partial<SavedConfiguration> | null | undefined,
): boolean {
  if (!saved) return false;
  return isOrderRowSubmitted({
    document_type: (saved as Record<string, unknown>).document_type ?? null,
    case_type: saved.case_type ?? null,
    case_status: saved.case_status ?? null,
    status: (saved as Record<string, unknown>).status ?? null,
    submitted_at: saved.submitted_at ?? null,
    order_sent_at: saved.order_sent_at ?? null,
    order_number: saved.order_number ?? null,
  });
}

/**
 * SERVER-SIDE pre-send guard: re-reads the row from Supabase and reports
 * whether it is already a submitted/locked order. Used immediately before
 * the order webhook is fired so stale local state cannot trigger a
 * duplicate order email.
 */
export async function fetchIsOrderSubmitted(id: string): Promise<{
  locked: boolean;
  orderNumber: string | null;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('configurations')
      .select('document_type, case_type, case_status, status, submitted_at, order_sent_at, order_number')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { locked: false, orderNumber: null };
    return {
      locked: isOrderRowSubmitted(data as Record<string, unknown>),
      orderNumber: (data as { order_number?: string | null }).order_number ?? null,
    };
  } catch (e) {
    return {
      locked: false,
      orderNumber: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
