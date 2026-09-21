import {
  replacePublishedConfiguratorPrices,
  type PublishedConfiguratorPrice,
} from '@/data/machines';
import { supabase } from '@/lib/supabase';

/** Fetches approved Backend prices whenever a Configurator catalog is opened. */
export async function loadPublishedConfiguratorPrices(): Promise<number> {
  const { data, error } = await supabase.rpc('list_published_configurator_prices');
  if (error) throw error;

  const rows = (Array.isArray(data) ? data : [])
    .map((row): PublishedConfiguratorPrice | null => {
      if (!row || typeof row !== 'object') return null;
      const value = row as Record<string, unknown>;
      const itemNumber = typeof value.item_number === 'string' ? value.item_number.trim() : '';
      if (!itemNumber) return null;
      const dkk = Number(value.price_dkk);
      const eur = Number(value.price_eur);
      return {
        item_number: itemNumber,
        price_dkk: Number.isFinite(dkk) ? dkk : null,
        price_eur: Number.isFinite(eur) ? eur : null,
      };
    })
    .filter((row): row is PublishedConfiguratorPrice => row !== null);

  replacePublishedConfiguratorPrices(rows);
  return rows.length;
}
