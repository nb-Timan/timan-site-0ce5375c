/**
 * Phase 26 — Controlled publish flow.
 *
 * Reads dirty rows from price_list_items, builds a preview comparing the
 * Backend Prisliste values to the current configurator seed values
 * (machines.ts via buildConfiguratorSeed), and publishes selected rows
 * into the price_list_published overlay via SECURITY DEFINER RPC.
 *
 * SAFETY:
 *  - No DELETE.
 *  - Empty/null source values never overwrite published values (server COALESCE).
 *  - Configurator code is NOT changed by this phase.
 *  - Quotes/orders/PDFs/email/n8n/CRM untouched.
 */

import { supabase } from "@/lib/supabase";
import { buildConfiguratorSeed, type SeedRow } from "@/lib/configuratorPriceSeed";
import type { PriceListItem } from "@/lib/priceListService";

export interface PublishPreviewRow {
  item_number: string;
  item_text_da: string | null;          // new (Backend Prisliste)
  old_item_text_da: string | null;      // current configurator/seed value
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
  if (x.code === "42501") return "Kun backend kan publicere prislister.";
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
      return {
        item_number: it.item_number,
        item_text_da: it.item_text_da,
        old_item_text_da: s?.item_text_da ?? null,
        price_dkk: it.price_dkk,
        old_price_dkk: s?.price_dkk ?? null,
        price_eur: it.price_eur,
        old_price_eur: s?.price_eur ?? null,
        price_sek: it.price_sek,
        old_price_sek: null, // configurator has no SEK source
        inConfigurator: !!s,
        status: s ? "ready" : "missing_in_configurator",
      };
    });
}

export async function publishItems(
  itemNumbers: string[],
): Promise<{ ok: boolean; summary?: PublishSummary; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("publish_price_list_items", {
      payload: { item_numbers: itemNumbers },
    });
    if (error) throw error;
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      summary: {
        created: Number(d.created ?? 0),
        updated: Number(d.updated ?? 0),
        skipped: Number(d.skipped ?? 0),
        errors: Array.isArray(d.errors) ? (d.errors as PublishSummary["errors"]) : [],
      },
    };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
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
