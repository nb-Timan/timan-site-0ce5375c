import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPublishedConfiguratorPricesForTest,
  getPriceForCurrency,
  replacePublishedConfiguratorPrices,
} from '@/data/machines';
import { getCurrentProductPrice } from '@/lib/publishedProductMaster';
import { buildPriceImportPayload, buildPreview, type PriceListItem } from '@/lib/priceListService';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261001153031_canonical_price_list_releases.sql'),
  'utf8',
);
const backendPage = readFileSync(resolve(process.cwd(), 'src/pages/backend/BackendPriceListsPage.tsx'), 'utf8');

const stagedItem: PriceListItem = {
  id: 'qa-411000', item_number: '411000', renamed_from_item_number: null,
  item_text_da: 'RC-1000s Basismaskine', item_text_de: null, item_text_en: null,
  price_dkk: 235000, price_eur: 31590, price_sek: 355900,
  cost_price_dkk: 100000, cost_price_source: 'qa.xlsx', cost_price_updated_at: null,
  updated_at: '2026-10-01T00:00:00.000Z', updated_by_email: 'qa@timan.dk',
  is_dirty: true, last_published_at: null,
};

afterEach(() => clearPublishedConfiguratorPricesForTest());

describe('canonical released price-list lifecycle', () => {
  it('uses an explicit released SEK value instead of converting DKK', () => {
    replacePublishedConfiguratorPrices([{
      item_number: '411000', price_dkk: 235000, price_eur: 31590, price_sek: 355900,
    }]);
    expect(getPriceForCurrency({ varenr: '411000', priceDKK: 235000, priceEUR: 31590 }, 'SEK')).toBe(355900);
  });

  it('falls back to legacy prices only when no released value exists', () => {
    expect(getCurrentProductPrice({
      itemNumber: 'QA', currency: 'EUR', legacy: { DKK: 100, EUR: 13.4 },
    })).toBe(13.4);
    replacePublishedConfiguratorPrices([{ item_number: 'QA', price_dkk: 120, price_eur: 16, price_sek: 180 }]);
    expect(getCurrentProductPrice({
      itemNumber: 'QA', currency: 'EUR', legacy: { DKK: 100, EUR: 13.4 },
    })).toBe(16);
  });

  it('keeps a full-price import staged until the release RPC is called', () => {
    const preview = buildPreview([{
      item_number: '411000', price_dkk: '236000', price_eur: '31700', price_sek: '356000',
    }], [stagedItem], 'FULL_PRICE_LIST');
    const payload = buildPriceImportPayload(preview, 'qa.xlsx', 'FULL_PRICE_LIST', 'RC-1000s');
    expect(payload).toMatchObject({ import_mode: 'FULL_PRICE_LIST', machine_scope: 'RC-1000s' });
    expect(migration).toContain('create or replace function public.release_price_list_items(payload jsonb)');
    expect(migration).toContain("where item_number = any(requested_items) and is_dirty = true");
    expect(migration.indexOf("insert into public.price_list_releases")).toBeLessThan(
      migration.indexOf("insert into public.price_list_published", migration.indexOf('create or replace function public.release_price_list_items')),
    );
  });

  it('creates a complete release snapshot and supersedes only after carry-forward', () => {
    expect(migration).toContain("status in ('STAGED', 'RELEASED', 'SUPERSEDED')");
    expect(migration).toContain('where not (p.item_number = any(selected_items))');
    expect(migration).toContain("set status = 'SUPERSEDED', superseded_at = release_time");
    expect(migration).toContain("set status = 'RELEASED', released_by = auth.uid()");
    expect(migration).toContain('previous_release_id');
    expect(migration).toContain('changed_currencies');
  });

  it('keeps costs and localized text out of selling-price replacement semantics', () => {
    const releaseFunction = migration.slice(migration.indexOf('create or replace function public.release_price_list_items'));
    expect(releaseFunction).not.toContain('cost_price_dkk =');
    expect(releaseFunction).toContain('item_text_de = coalesce(excluded.item_text_de, public.price_list_published.item_text_de)');
    expect(releaseFunction).toContain('item_text_en = coalesce(excluded.item_text_en, public.price_list_published.item_text_en)');
  });

  it('keeps release writes backend-only and release history read-only to clients', () => {
    expect(migration).toContain('if not public.is_timan_backend() then');
    expect(migration).toContain('revoke all on function public.release_price_list_items(jsonb) from public, anon;');
    expect(migration).toContain('grant execute on function public.release_price_list_items(jsonb) to authenticated;');
    expect(migration).toContain('alter table public.price_list_releases enable row level security;');
    expect(migration).not.toContain('grant insert on public.price_list_releases');
  });

  it('labels active prices and requires an explicit release in Backend', () => {
    expect(backendPage).toContain('Den aktive prisliste bruges af Configuratoren');
    expect(backendPage).toContain('Se aktiv prisliste og kladder');
    expect(backendPage).toContain('Frigiv prisliste');
    expect(backendPage).toContain('Aktiv pris SEK');
    expect(backendPage).not.toContain('Konfiguratoren bruger ikke disse priser endnu');
  });
});
