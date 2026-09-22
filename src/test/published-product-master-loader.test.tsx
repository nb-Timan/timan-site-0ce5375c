import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PublishedProductMasterBoundary from '@/components/PublishedProductMasterBoundary';
import { loadPublishedConfiguratorPrices } from '@/lib/configuratorPublishedPrices';
import { publishedProduct } from '@/lib/publishedProductMaster';
import { clearPublishedConfiguratorPricesForTest } from '@/data/machines';
import { publishItems } from '@/lib/pricePublishService';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
const row = {
  item_number: '725132',
  item_text_da: 'New canonical title',
  item_text_de: 'Neuer kanonischer Titel',
  item_text_en: 'New canonical English title',
  price_dkk: '0',
  price_eur: null,
  price_sek: '123',
  identity_aliases: ['Old title'],
};
beforeEach(() => rpc.mockReset());
afterEach(() => { cleanup(); clearPublishedConfiguratorPricesForTest(); vi.restoreAllMocks(); });

describe('Product Master loading and publishing', () => {
  it('deduplicates in-flight reads, accepts explicit zero and never converts null to zero', async () => {
    rpc.mockResolvedValue({ data: [row], error: null });
    await Promise.all([loadPublishedConfiguratorPrices(), loadPublishedConfiguratorPrices()]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('list_published_product_master');
    expect(publishedProduct('725132')).toMatchObject({ price_dkk: 0, price_eur: null, price_sek: 123 });
    await loadPublishedConfiguratorPrices();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(publishedProduct('725132')).toMatchObject({
      item_text_de: row.item_text_de,
      item_text_en: row.item_text_en,
    });
  });

  it('does not mount catalog consumers with stale static prices before the read completes', async () => {
    let finish!: (value: unknown) => void;
    rpc.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<MemoryRouter initialEntries={['/configurator']}><PublishedProductMasterBoundary><div>Current catalog</div></PublishedProductMasterBoundary></MemoryRouter>);
    expect(screen.queryByText('Current catalog')).not.toBeInTheDocument();
    await act(async () => finish({ data: [row], error: null }));
    expect(screen.getByText('Current catalog')).toBeInTheDocument();
  });

  it('shows controlled failure instead of selling at stale fallback prices', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    render(<MemoryRouter initialEntries={['/configurator']}><PublishedProductMasterBoundary><div>Current catalog</div></PublishedProductMasterBoundary></MemoryRouter>);
    await screen.findByRole('button', { name: /Produktdata kunne ikke hentes/ });
    expect(screen.queryByText('Current catalog')).not.toBeInTheDocument();
  });

  it('does not block authentication when product data is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    render(<MemoryRouter initialEntries={['/reset-password']}><PublishedProductMasterBoundary><div>Reset form</div></PublishedProductMasterBoundary></MemoryRouter>);
    expect(screen.getByText('Reset form')).toBeInTheDocument();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
  });

  it('successful publish refreshes current master; partial row errors are not hidden', async () => {
    rpc.mockImplementation(async (name: string) => name === 'publish_price_list_items'
      ? { data: { created: 0, updated: 1, skipped: 0, errors: [{ item_number: 'invalid', error: 'Rejected' }] }, error: null }
      : { data: [row], error: null });
    const result = await publishItems(['725132', 'invalid']);
    expect(result.summary?.updated).toBe(1);
    expect(result.summary?.errors).toHaveLength(1);
    expect(publishedProduct('725132')?.item_text_da).toBe(row.item_text_da);
  });
});
