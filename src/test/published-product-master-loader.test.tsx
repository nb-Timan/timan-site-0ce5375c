import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PublishedProductMasterBoundary from '@/components/PublishedProductMasterBoundary';
import {
  classifyProductMasterFailure,
  loadPublishedConfiguratorPrices,
  loadPublishedConfiguratorPricesWithRetry,
} from '@/lib/configuratorPublishedPrices';
import { publishedProduct } from '@/lib/publishedProductMaster';
import { clearPublishedConfiguratorPricesForTest } from '@/data/machines';
import { publishItems } from '@/lib/pricePublishService';

const { rpc, getSession, refreshSession } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, auth: { getSession, refreshSession } } }));
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
beforeEach(() => {
  rpc.mockReset();
  getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  refreshSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(() => { cleanup(); clearPublishedConfiguratorPricesForTest(); vi.restoreAllMocks(); });

describe('Product Master loading and publishing', () => {
  it('deduplicates in-flight reads, accepts explicit zero and never converts null to zero', async () => {
    rpc.mockResolvedValue({ data: [row], error: null });
    await Promise.all([loadPublishedConfiguratorPrices(), loadPublishedConfiguratorPrices()]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('list_published_product_master', undefined, { get: true });
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

  it('waits for auth session hydration before the Product Master read', async () => {
    let finishSession!: (value: unknown) => void;
    getSession.mockReturnValue(new Promise(resolve => { finishSession = resolve; }));
    rpc.mockResolvedValue({ data: [row], error: null });
    render(<MemoryRouter initialEntries={['/portal']}><PublishedProductMasterBoundary><div>Current catalog</div></PublishedProductMasterBoundary></MemoryRouter>);
    expect(rpc).not.toHaveBeenCalled();
    await act(async () => finishSession({ data: { session: null }, error: null }));
    await screen.findByText('Current catalog');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('still reads the public catalog when session hydration fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getSession.mockRejectedValue(new TypeError('offline'));
    rpc.mockResolvedValue({ data: [row], error: null });
    await expect(loadPublishedConfiguratorPricesWithRetry({ retryDelayMs: 0 })).resolves.toBe(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(classifyProductMasterFailure(new Error('Browser is offline')).category).toBe('network');
  });

  it('retries a transient network failure and recovers without reload', async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ data: [row], error: null });
    await expect(loadPublishedConfiguratorPricesWithRetry({ retryDelayMs: 0 })).resolves.toBe(1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('refreshes an expired session once before retrying a 401', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { status: 401, message: 'JWT expired' } })
      .mockResolvedValueOnce({ data: [row], error: null });
    await expect(loadPublishedConfiguratorPricesWithRetry({ retryDelayMs: 0 })).resolves.toBe(1);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('does not retry a permanent 403 and preserves its diagnostic category', async () => {
    rpc.mockResolvedValue({ data: null, error: { status: 403, code: '42501', message: 'permission denied' } });
    await expect(loadPublishedConfiguratorPricesWithRetry({ retryDelayMs: 0 })).rejects.toMatchObject({
      attempts: 1,
      diagnostic: { category: 'forbidden', transient: false, status: 403 },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(classifyProductMasterFailure(new TypeError('Failed to fetch')).category).toBe('network');
  });

  it('rejects an invalid Product Master payload without retrying', async () => {
    rpc.mockResolvedValue({ data: { unexpected: true }, error: null });
    await expect(loadPublishedConfiguratorPricesWithRetry({ retryDelayMs: 0 })).rejects.toMatchObject({
      attempts: 1,
      diagnostic: { category: 'invalid_response', transient: false },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('shows controlled failure instead of selling at stale fallback prices', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    render(<MemoryRouter initialEntries={['/configurator']}><PublishedProductMasterBoundary><div>Current catalog</div></PublishedProductMasterBoundary></MemoryRouter>);
    await screen.findByRole('button', { name: /Produktdata kunne ikke hentes/ });
    expect(screen.queryByText('Current catalog')).not.toBeInTheDocument();
  });

  it('retries from the error action without reloading the browser', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rpc.mockResolvedValueOnce({ data: null, error: { status: 403, message: 'permission denied' } })
      .mockResolvedValueOnce({ data: [row], error: null });
    render(<MemoryRouter initialEntries={['/portal']}><PublishedProductMasterBoundary><div>Current catalog</div></PublishedProductMasterBoundary></MemoryRouter>);
    const retry = await screen.findByRole('button', { name: /Produktdata kunne ikke hentes/ });
    fireEvent.click(retry);
    await screen.findByText('Current catalog');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('does not block authentication when product data is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    render(<MemoryRouter initialEntries={['/reset-password']}><PublishedProductMasterBoundary><div>Reset form</div></PublishedProductMasterBoundary></MemoryRouter>);
    expect(screen.getByText('Reset form')).toBeInTheDocument();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
  });

  it('successful publish refreshes current master; partial row errors are not hidden', async () => {
    rpc.mockImplementation(async (name: string) => name === 'release_price_list_items'
      ? { data: { created: 0, updated: 1, skipped: 0, errors: [{ item_number: 'invalid', error: 'Rejected' }], version_number: 2 }, error: null }
      : { data: [row], error: null });
    const result = await publishItems(['725132', 'invalid']);
    expect(result.summary?.updated).toBe(1);
    expect(result.summary?.errors).toHaveLength(1);
    expect(publishedProduct('725132')?.item_text_da).toBe(row.item_text_da);
  });
});
