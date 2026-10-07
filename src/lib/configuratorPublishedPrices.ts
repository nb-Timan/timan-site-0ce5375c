import {
  replacePublishedConfiguratorCatalog,
  type PublishedConfiguratorPrice,
} from '@/data/machines';
import type { ConfiguratorProductRelation } from '@/lib/configuratorProductHierarchy';
import { supabase } from '@/lib/supabase';

const nullableNumber = (value: unknown) => value == null || value === '' ? null
  : Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
let pending: Promise<number> | null = null;

export type ProductMasterFailureCategory =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'postgrest'
  | 'invalid_response'
  | 'aborted'
  | 'runtime';

export type ProductMasterFailureDiagnostic = {
  category: ProductMasterFailureCategory;
  message: string;
  status: number | null;
  code: string | null;
  transient: boolean;
};

type ErrorRecord = Record<string, unknown>;

function errorRecord(error: unknown): ErrorRecord {
  return error && typeof error === 'object' ? error as ErrorRecord : {};
}

export function classifyProductMasterFailure(error: unknown): ProductMasterFailureDiagnostic {
  const value = errorRecord(error);
  const message = error instanceof Error ? error.message : String(value.message || error || 'Unknown Product Master error');
  const statusValue = value.status ?? value.statusCode;
  const status = typeof statusValue === 'number' ? statusValue : Number.isFinite(Number(statusValue)) ? Number(statusValue) : null;
  const code = typeof value.code === 'string' ? value.code : null;
  const name = error instanceof Error ? error.name : String(value.name || '');
  const normalized = message.toLowerCase();

  if (value.productMasterCategory === 'invalid_response') {
    return { category: 'invalid_response', message, status, code, transient: false };
  }
  if (name === 'AbortError' || normalized.includes('aborted')) {
    return { category: 'aborted', message, status, code, transient: true };
  }
  if (status === 401) return { category: 'unauthorized', message, status, code, transient: true };
  if (status === 403 || code === '42501') return { category: 'forbidden', message, status, code, transient: false };
  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return { category: 'timeout', message, status, code, transient: true };
  }
  if (error instanceof TypeError || normalized.includes('failed to fetch') || normalized.includes('network') || normalized.includes('offline')) {
    return { category: 'network', message, status, code, transient: true };
  }
  if (code?.startsWith('PGRST') || status !== null) {
    return { category: 'postgrest', message, status, code, transient: status === 429 || status >= 500 };
  }
  return { category: 'runtime', message, status, code, transient: false };
}

export class ProductMasterLoadError extends Error {
  readonly diagnostic: ProductMasterFailureDiagnostic;
  readonly attempts: number;

  constructor(error: unknown, attempts: number) {
    const diagnostic = classifyProductMasterFailure(error);
    super(diagnostic.message);
    this.name = 'ProductMasterLoadError';
    this.diagnostic = diagnostic;
    this.attempts = attempts;
  }
}

const wait = (delayMs: number) => delayMs > 0
  ? new Promise<void>(resolve => window.setTimeout(resolve, delayMs))
  : Promise.resolve();

/** No localStorage cache. Parallel consumers share only the current network request. */
export function loadPublishedConfiguratorPrices(): Promise<number> {
  if (!pending) pending = fetchMaster().finally(() => { pending = null; });
  return pending;
}

export async function loadPublishedConfiguratorPricesWithRetry(options: {
  maxAttempts?: number;
  retryDelayMs?: number;
} = {}): Promise<number> {
  const maxAttempts = Math.max(1, Math.min(3, options.maxAttempts ?? 3));
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 250);

  // getSession waits for the browser auth client to initialize and refreshes an
  // expired access token when possible. The catalog RPC itself remains readable
  // by both anon and authenticated users and never depends on app_user/View-as.
  try {
    const { error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.warn('[product-master] Session hydration failed before catalog read', classifyProductMasterFailure(sessionError));
    }
  } catch (sessionError) {
    // The catalog is also readable by anon. A local auth hydration problem must
    // therefore not prevent the canonical Product Master request itself.
    console.warn('[product-master] Session hydration failed before catalog read', classifyProductMasterFailure(sessionError));
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await loadPublishedConfiguratorPrices();
    } catch (error) {
      lastError = error;
      const diagnostic = classifyProductMasterFailure(error);
      if (!diagnostic.transient || attempt === maxAttempts) {
        throw new ProductMasterLoadError(error, attempt);
      }
      if (diagnostic.category === 'unauthorized') {
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.warn('[product-master] Session refresh failed before retry', classifyProductMasterFailure(refreshError));
        }
      }
      await wait(retryDelayMs * attempt);
    }
  }
  throw new ProductMasterLoadError(lastError, maxAttempts);
}

async function fetchMaster(): Promise<number> {
  // This STABLE catalog RPC is a read, including during a persisted Academy session.
  const { data, error } = await supabase.rpc('list_published_product_master', undefined, { get: true });
  if (error) throw error;

  if (!Array.isArray(data)) {
    throw Object.assign(new Error('Product Master returned an invalid response.'), {
      productMasterCategory: 'invalid_response',
    });
  }

  const rows = data
    .map((row): PublishedConfiguratorPrice | null => {
      if (!row || typeof row !== 'object') return null;
      const value = row as Record<string, unknown>;
      const itemNumber = typeof value.item_number === 'string' ? value.item_number.trim() : '';
      if (!itemNumber) return null;
      return {
        item_number: itemNumber,
        is_active: value.is_active !== false,
        item_text_da: typeof value.item_text_da === 'string' ? value.item_text_da : null,
        item_text_de: typeof value.item_text_de === 'string' ? value.item_text_de : null,
        item_text_en: typeof value.item_text_en === 'string' ? value.item_text_en : null,
        item_text_it: typeof value.item_text_it === 'string' ? value.item_text_it : null,
        item_text_hu: typeof value.item_text_hu === 'string' ? value.item_text_hu : null,
        item_text_sv: typeof value.item_text_sv === 'string' ? value.item_text_sv : null,
        item_text_fr: typeof value.item_text_fr === 'string' ? value.item_text_fr : null,
        item_text_pl: typeof value.item_text_pl === 'string' ? value.item_text_pl : null,
        item_text_cs: typeof value.item_text_cs === 'string' ? value.item_text_cs : null,
        identity_aliases: Array.isArray(value.identity_aliases) ? value.identity_aliases.filter((alias): alias is string => typeof alias === 'string') : [],
        price_dkk: nullableNumber(value.price_dkk),
        price_eur: nullableNumber(value.price_eur),
        price_sek: nullableNumber(value.price_sek),
        published_at: typeof value.published_at === 'string' ? value.published_at : null,
      };
    })
    .filter((row): row is PublishedConfiguratorPrice => row !== null);

  const relationResult = await supabase.rpc('list_published_configurator_product_relations', undefined, { get: true })
    ?? { data: null, error: { code: 'PGRST202' } };
  const relationError = relationResult.error as { code?: string } | null;
  if (relationError && relationError.code !== 'PGRST202') throw relationError;

  const relations = Array.isArray(relationResult.data)
    ? relationResult.data.map((row): ConfiguratorProductRelation | null => {
      if (!row || typeof row !== 'object') return null;
      const value = row as Record<string, unknown>;
      const relationType = value.relation_type === 'variant' || value.relation_type === 'option'
        ? value.relation_type
        : null;
      const machineType = typeof value.machine_type === 'string' ? value.machine_type.trim() : '';
      const parentItemNumber = typeof value.parent_item_number === 'string' ? value.parent_item_number.trim() : '';
      const childItemNumber = typeof value.child_item_number === 'string' ? value.child_item_number.trim() : '';
      if (!relationType || !machineType || !parentItemNumber || !childItemNumber) return null;
      return {
        machine_type: machineType,
        parent_item_number: parentItemNumber,
        child_item_number: childItemNumber,
        relation_type: relationType,
        selection_group: typeof value.selection_group === 'string' ? value.selection_group : null,
        variant_label_key: typeof value.variant_label_key === 'string' ? value.variant_label_key : null,
        sort_order: Number.isFinite(Number(value.sort_order)) ? Number(value.sort_order) : 0,
      };
    }).filter((row): row is ConfiguratorProductRelation => row !== null)
    : [];

  replacePublishedConfiguratorCatalog(rows, relations);
  return rows.length;
}
