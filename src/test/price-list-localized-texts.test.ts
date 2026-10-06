import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { updatePriceItem } from '@/lib/priceListService';
import { replaceProductMaster, resolvePublishedProduct } from '@/lib/publishedProductMaster';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

beforeEach(() => rpc.mockReset());
afterEach(() => replaceProductMaster([]));

describe('localized Product Master texts', () => {
  it('sends all nine portal languages independently while preserving all prices', async () => {
    rpc.mockResolvedValue({ data: { item_number: '725135' }, error: null });

    await expect(updatePriceItem({
      item_number: '725135',
      new_item_number: '725135',
      item_text_da: 'Dansk tekst',
      item_text_de: 'Deutscher Text',
      item_text_en: 'English text',
      item_text_it: 'Testo italiano',
      item_text_hu: 'Magyar szoveg',
      item_text_sv: 'Svensk text',
      item_text_fr: 'Texte francais',
      item_text_pl: 'Polski tekst',
      item_text_cs: 'Cesky text',
      cost_price_dkk: 100,
      price_dkk: 200,
      price_eur: 30,
      price_sek: 300,
    })).resolves.toMatchObject({ ok: true });

    expect(rpc).toHaveBeenCalledWith('update_price_list_item', {
      p_item_number: '725135',
      p_new_item_number: '725135',
      p_item_text_da: 'Dansk tekst',
      p_item_text_de: 'Deutscher Text',
      p_item_text_en: 'English text',
      p_item_text_it: 'Testo italiano',
      p_item_text_hu: 'Magyar szoveg',
      p_item_text_sv: 'Svensk text',
      p_item_text_fr: 'Texte francais',
      p_item_text_pl: 'Polski tekst',
      p_item_text_cs: 'Cesky text',
      p_cost_price_dkk: 100,
      p_price_dkk: 200,
      p_price_eur: 30,
      p_price_sek: 300,
    });
  });

  it('resolves each published language and leaves unrelated prices unchanged', () => {
    replaceProductMaster([{
      item_number: '725135',
      item_text_da: 'Dansk publiceret',
      item_text_de: 'Deutsch veröffentlicht',
      item_text_en: 'English published',
      price_dkk: null,
      price_eur: null,
    }]);
    const base = {
      varenr: '725135',
      name: { da: 'Dansk gammel', de: 'Deutsch alt', en: 'English old', it: 'Italiano' },
      priceDKK: 123,
      priceEUR: 45,
    };

    const resolved = resolvePublishedProduct(base);
    expect(resolved.name).toMatchObject({
      da: 'Dansk publiceret',
      de: 'Deutsch veröffentlicht',
      en: 'English published',
      it: 'Italiano',
    });
    expect(resolved.priceDKK).toBe(123);
    expect(resolved.priceEUR).toBe(45);
  });

  it('keeps a reviewed static German translation when Product Master DE is missing', () => {
    replaceProductMaster([{
      item_number: '725135',
      item_text_da: 'Dansk publiceret',
      item_text_de: null,
      item_text_en: null,
      price_dkk: null,
      price_eur: null,
    }]);
    const base = {
      varenr: '725135',
      name: { da: 'Dansk gammel', de: 'Deutsch alt', en: 'English old' },
      priceDKK: 123,
      priceEUR: 45,
    };

    expect(resolvePublishedProduct(base).name).toMatchObject({
      da: 'Dansk publiceret',
      de: 'Deutsch alt',
      en: 'English old',
    });
  });

  it('keeps unrelated portal languages on their existing static presentation', () => {
    replaceProductMaster([{
      item_number: '725135',
      item_text_da: 'Dansk publiceret',
      item_text_de: 'Deutsch veröffentlicht',
      item_text_en: 'English published',
      price_dkk: null,
      price_eur: null,
    }]);
    const base = {
      varenr: '725135',
      name: { da: 'Dansk gammel', de: 'Deutsch alt', en: 'English old', it: 'Italiano', hu: 'Magyar' },
      priceDKK: 123,
      priceEUR: 45,
    };

    expect(resolvePublishedProduct(base).name).toMatchObject({ it: 'Italiano', hu: 'Magyar' });
  });

  it('keeps all nine text inputs visible and labels history per language', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/backend/BackendPriceListsPage.tsx'), 'utf8');
    expect(page).toContain('PRODUCT_LANGUAGES.map');
    expect(page).toContain('Varetekst dansk');
    expect(page).toContain('Varetekst engelsk');
    expect(page).toContain('Varetekst tysk');
    expect(page).toContain('Varetekst italiensk');
    expect(page).toContain('Varetekst ungarsk');
    expect(page).toContain('Varetekst svensk');
    expect(page).toContain('Varetekst fransk');
    expect(page).toContain('Varetekst polsk');
    expect(page).toContain('Varetekst tjekkisk');
    expect(page).toContain('item_text_de: "Varetekst tysk"');
    expect(page).toContain('item_text_en: "Varetekst engelsk"');
  });

  it('extends the existing tables and backend-only RPC without a parallel translation model', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260922100804_localized_price_list_item_texts.sql'), 'utf8');
    expect(migration).toContain('alter table public.price_list_items');
    expect(migration).toContain('alter table public.price_list_published');
    expect(migration).toContain('add column if not exists item_text_de text');
    expect(migration).toContain('add column if not exists item_text_en text');
    expect(migration).toContain('if not public.is_timan_backend() then');
    expect(migration).toContain('revoke all on function public.update_price_list_item');
    expect(migration).not.toMatch(/create table[^;]+translation/is);
  });

  it('reads current text with published prices so text saves do not publish draft prices', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260922115308_current_product_text_read_model.sql'), 'utf8');
    expect(migration).toContain('coalesce(current_item.item_text_da, published.item_text_da)');
    expect(migration).toContain('then current_item.item_text_de else published.item_text_de end');
    expect(migration).toContain('then current_item.item_text_en else published.item_text_en end');
    expect(migration).toContain('published.price_dkk');
    expect(migration).toContain('published.price_eur');
    expect(migration).not.toContain('current_item.price_dkk');
    expect(migration).not.toContain('current_item.price_eur');
  });

  it('keeps German and English translations intact during Danish price-tool imports', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260813110443_backend_price_lists_and_costs.sql'), 'utf8');
    const upsert = migration.slice(
      migration.indexOf('create or replace function public.upsert_price_list_items'),
      migration.indexOf('revoke all on function public.upsert_price_list_items'),
    );
    expect(upsert).toContain('item_text_da = coalesce(new_item_text_da, item_text_da)');
    expect(upsert).not.toContain('item_text_de =');
    expect(upsert).not.toContain('item_text_en =');
  });
});
