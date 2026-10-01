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
): Promise<{ ok: boolean; summary?: PublishSummary; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("release_price_list_items", {
      payload: { item_numbers: itemNumbers },
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
