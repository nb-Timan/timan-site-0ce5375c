import {
  replacePublishedConfiguratorPrices,
  type PublishedConfiguratorPrice,
} from '@/data/machines';
import { supabase } from '@/lib/supabase';

const nullableNumber = (value: unknown) => value == null || value === '' ? null
  : Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
let pending: Promise<number> | null = null;

/** No localStorage cache. Parallel consumers share only the current network request. */
export function loadPublishedConfiguratorPrices(): Promise<number> {
  if (!pending) pending = fetchMaster().finally(() => { pending = null; });
  return pending;
}

async function fetchMaster(): Promise<number> {
  const { data, error } = await supabase.rpc('list_published_product_master');
  if (error) throw error;

  const rows = (Array.isArray(data) ? data : [])
    .map((row): PublishedConfiguratorPrice | null => {
      if (!row || typeof row !== 'object') return null;
      const value = row as Record<string, unknown>;
      const itemNumber = typeof value.item_number === 'string' ? value.item_number.trim() : '';
      if (!itemNumber) return null;
      return {
        item_number: itemNumber,
        item_text_da: typeof value.item_text_da === 'string' ? value.item_text_da : null,
        identity_aliases: Array.isArray(value.identity_aliases) ? value.identity_aliases.filter((alias): alias is string => typeof alias === 'string') : [],
        price_dkk: nullableNumber(value.price_dkk),
        price_eur: nullableNumber(value.price_eur),
        price_sek: nullableNumber(value.price_sek),
        published_at: typeof value.published_at === 'string' ? value.published_at : null,
      };
    })
    .filter((row): row is PublishedConfiguratorPrice => row !== null);

  replacePublishedConfiguratorPrices(rows);
  return rows.length;
}
