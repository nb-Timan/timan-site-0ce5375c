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
  it('sends Danish, German and English independently while preserving all prices', async () => {
    rpc.mockResolvedValue({ data: { item_number: '725135' }, error: null });

    await expect(updatePriceItem({
      item_number: '725135',
      new_item_number: '725135',
      item_text_da: 'Dansk tekst',
      item_text_de: 'Deutscher Text',
      item_text_en: 'English text',
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
    expect(resolved.name).toEqual({
      da: 'Dansk publiceret',
      de: 'Deutsch veröffentlicht',
      en: 'English published',
      it: 'Italiano',
    });
    expect(resolved.priceDKK).toBe(123);
    expect(resolved.priceEUR).toBe(45);
  });

  it('keeps existing localized fallbacks when a translation is still empty', () => {
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

    expect(resolvePublishedProduct(base).name).toEqual({
      da: 'Dansk publiceret',
      de: 'Deutsch alt',
      en: 'English old',
    });
  });

  it('keeps all three text inputs visible and labels history per language', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/backend/BackendPriceListsPage.tsx'), 'utf8');
    expect(page).toContain('<Field label="Varetekst dansk">');
    expect(page).toContain('<Field label="Varetekst tysk">');
    expect(page).toContain('<Field label="Varetekst engelsk">');
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
});
