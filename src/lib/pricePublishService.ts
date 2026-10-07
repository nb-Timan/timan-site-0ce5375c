/**
 * Controlled price-list release flow.
 *
 * Reads staged rows from price_list_items, builds a preview comparing the
 * Backend Prisliste values to the current configurator seed values
 * (machines.ts via buildConfiguratorSeed), and publishes selected rows
 * into an immutable release snapshot and the price_list_published active read
 * model via a backend-guarded SECURITY DEFINER RPC.
 *
 * SAFETY:
 *  - No DELETE.
 *  - Empty/null source values never overwrite published values (server COALESCE).
 *  - Configurator reads only the active released overlay.
 *  - Quotes/orders/PDFs/email/n8n/CRM untouched.
 */

import { supabase } from "@/lib/supabase";
import { buildConfiguratorSeed, type SeedRow } from "@/lib/configuratorPriceSeed";
import type { PriceListItem } from "@/lib/priceListService";
import { publishedProduct } from '@/lib/publishedProductMaster';
import { loadPublishedConfiguratorPrices } from '@/lib/configuratorPublishedPrices';

export interface PublishPreviewRow {
  item_number: string;
  item_text_da: string | null;          // new (Backend Prisliste)
  old_item_text_da: string | null;      // current configurator/seed value
  item_text_de: string | null;
  old_item_text_de: string | null;
  item_text_en: string | null;
  old_item_text_en: string | null;
  item_text_it: string | null;
  old_item_text_it: string | null;
  item_text_hu: string | null;
  old_item_text_hu: string | null;
  item_text_sv: string | null;
  old_item_text_sv: string | null;
  item_text_fr: string | null;
  old_item_text_fr: string | null;
  item_text_pl: string | null;
  old_item_text_pl: string | null;
  item_text_cs: string | null;
  old_item_text_cs: string | null;
  price_dkk: number | null;             // new
  old_price_dkk: number | null;         // current configurator/seed value
  price_eur: number | null;
  old_price_eur: number | null;
  price_sek: number | null;
  old_price_sek: number | null;         // SEK has no configurator source -> null
  inConfigurator: boolean;
  status: "ready" | "missing_in_configurator";
}

export interface PublishSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { item_number: string | null; error: string }[];
  releaseId: string | null;
  versionNumber: number | null;
  effectiveAt: string | null;
  affectedItemCount: number;
  changedCurrencies: string[];
}

export interface PriceListRelease {
  id: string;
  version_number: number;
  status: 'STAGED' | 'RELEASED' | 'SUPERSEDED';
  source_file_name: string | null;
  machine_scope: string;
  created_by_email: string | null;
  created_at: string;
  released_by_email: string | null;
  released_at: string | null;
  effective_at: string | null;
  affected_item_count: number;
  changed_currencies: string[];
}

export interface PublishLog {
  id: string;
  published_by_email: string | null;
  published_at: string;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  item_numbers: string[] | null;
}

export interface PriceListPriceChange {
  id: string;
  release_id: string;
  release_version_number: number;
  import_log_id: string | null;
  item_number: string;
  product_name: string | null;
  product_group: string | null;
  old_price_dkk: number | null;
  new_price_dkk: number | null;
  change_dkk: number | null;
  change_pct: number | null;
  old_price_sek: number | null;
  new_price_sek: number | null;
  old_price_eur: number | null;
  new_price_eur: number | null;
  change_source: string;
  changed_by_app_user_id: string;
  changed_by_name: string | null;
  changed_at: string;
  effective_at: string;
}

export interface PriceChangeFilters {
  itemNumber?: string;
  from?: string;
  to?: string;
  productGroup?: string;
  direction?: "increase" | "decrease";
  changedByAppUserId?: string;
  versionNumber?: number;
  limit?: number;
}

function describeError(e: unknown): string {
  if (!e) return "ukendt fejl";
  if (typeof e === "string") return e;
  const x = e as { message?: string; code?: string };
  if (x.code === "42501") return "Kun backend kan frigive prislister.";
  return x.message || JSON.stringify(e);
}

export function buildPublishPreview(
  dirtyItems: PriceListItem[],
  seed: SeedRow[] = buildConfiguratorSeed(),
): PublishPreviewRow[] {
  const seedMap = new Map<string, SeedRow>();
  for (const s of seed) seedMap.set(s.item_number, s);

  return dirtyItems
    .slice()
    .sort((a, b) =>
      a.item_number.localeCompare(b.item_number, "da", { numeric: true }),
    )
    .map((it): PublishPreviewRow => {
      const s = seedMap.get(it.item_number);
      const published = publishedProduct(it.item_number);
      return {
        item_number: it.item_number,
        item_text_da: it.item_text_da,
        old_item_text_da: published?.item_text_da ?? s?.item_text_da ?? null,
        item_text_de: it.item_text_de,
        old_item_text_de: published?.item_text_de ?? null,
        item_text_en: it.item_text_en,
        old_item_text_en: published?.item_text_en ?? null,
        item_text_it: it.item_text_it,
        old_item_text_it: published?.item_text_it ?? null,
        item_text_hu: it.item_text_hu,
        old_item_text_hu: published?.item_text_hu ?? null,
        item_text_sv: it.item_text_sv,
        old_item_text_sv: published?.item_text_sv ?? null,
        item_text_fr: it.item_text_fr,
        old_item_text_fr: published?.item_text_fr ?? null,
        item_text_pl: it.item_text_pl,
        old_item_text_pl: published?.item_text_pl ?? null,
        item_text_cs: it.item_text_cs,
        old_item_text_cs: published?.item_text_cs ?? null,
        price_dkk: it.price_dkk,
        old_price_dkk: published?.price_dkk ?? s?.price_dkk ?? null,
        price_eur: it.price_eur,
        old_price_eur: published?.price_eur ?? s?.price_eur ?? null,
        price_sek: it.price_sek,
        old_price_sek: published?.price_sek ?? null,
        inConfigurator: !!s,
        status: s ? "ready" : "missing_in_configurator",
      };
    });
}

export async function publishItems(
  itemNumbers: string[],
  itemGroups: Record<string, string> = {},
  itemSources: Record<string, string> = {},
): Promise<{ ok: boolean; summary?: PublishSummary; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("release_price_list_items", {
      payload: { item_numbers: itemNumbers, item_groups: itemGroups, item_sources: itemSources },
    });
    if (error) throw error;
    const d = (data ?? {}) as Record<string, unknown>;
    if (Number(d.created ?? 0) + Number(d.updated ?? 0) > 0) {
      try { await loadPublishedConfiguratorPrices(); }
      catch (error) { console.error('[product-master] Published, but catalog refresh failed', error); }
      window.dispatchEvent(new Event('timan:product-master-published'));
    }
    return {
      ok: true,
      summary: {
        created: Number(d.created ?? 0),
        updated: Number(d.updated ?? 0),
        skipped: Number(d.skipped ?? 0),
        errors: Array.isArray(d.errors) ? (d.errors as PublishSummary["errors"]) : [],
        releaseId: typeof d.release_id === 'string' ? d.release_id : null,
        versionNumber: d.version_number == null ? null : Number(d.version_number),
        effectiveAt: typeof d.effective_at === 'string' ? d.effective_at : null,
        affectedItemCount: Number(d.affected_item_count ?? 0),
        changedCurrencies: Array.isArray(d.changed_currencies)
          ? d.changed_currencies.filter((value): value is string => typeof value === 'string')
          : [],
      },
    };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function listPriceListReleases(): Promise<PriceListRelease[]> {
  const { data, error } = await supabase
    .from('price_list_releases')
    .select('id, version_number, status, source_file_name, machine_scope, created_by_email, created_at, released_by_email, released_at, effective_at, affected_item_count, changed_currencies')
    .order('version_number', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []).map((row) => ({
    ...row,
    version_number: Number(row.version_number),
    affected_item_count: Number(row.affected_item_count),
    changed_currencies: Array.isArray(row.changed_currencies) ? row.changed_currencies : [],
  })) as PriceListRelease[];
}

export async function listPublishLogs(): Promise<PublishLog[]> {
  const { data, error } = await supabase
    .from("price_list_publish_logs")
    .select("id, published_by_email, published_at, created_count, updated_count, skipped_count, error_count, item_numbers")
    .order("published_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as PublishLog[];
}

export async function listPriceChanges(filters: PriceChangeFilters = {}): Promise<PriceListPriceChange[]> {
  let query = supabase
    .from("price_list_price_changes")
    .select("id, release_id, release_version_number, import_log_id, item_number, product_name, product_group, old_price_dkk, new_price_dkk, change_dkk, change_pct, old_price_sek, new_price_sek, old_price_eur, new_price_eur, change_source, changed_by_app_user_id, changed_by_name, changed_at, effective_at");

  if (filters.itemNumber) query = query.eq("item_number", filters.itemNumber);
  if (filters.from) query = query.gte("changed_at", filters.from);
  if (filters.to) query = query.lte("changed_at", filters.to);
  if (filters.productGroup) query = query.eq("product_group", filters.productGroup);
  if (filters.direction === "increase") query = query.gt("change_dkk", 0);
  if (filters.direction === "decrease") query = query.lt("change_dkk", 0);
  if (filters.changedByAppUserId) query = query.eq("changed_by_app_user_id", filters.changedByAppUserId);
  if (filters.versionNumber != null) query = query.eq("release_version_number", filters.versionNumber);

  const { data, error } = await query
    .order("changed_at", { ascending: false })
    .limit(Math.min(Math.max(filters.limit ?? 100, 1), 500));
  if (error) return [];
  return (data ?? []).map((row) => ({
    ...row,
    release_version_number: Number(row.release_version_number),
    old_price_dkk: row.old_price_dkk == null ? null : Number(row.old_price_dkk),
    new_price_dkk: row.new_price_dkk == null ? null : Number(row.new_price_dkk),
    change_dkk: row.change_dkk == null ? null : Number(row.change_dkk),
    change_pct: row.change_pct == null ? null : Number(row.change_pct),
    old_price_sek: row.old_price_sek == null ? null : Number(row.old_price_sek),
    new_price_sek: row.new_price_sek == null ? null : Number(row.new_price_sek),
    old_price_eur: row.old_price_eur == null ? null : Number(row.old_price_eur),
    new_price_eur: row.new_price_eur == null ? null : Number(row.new_price_eur),
  })) as PriceListPriceChange[];
}
