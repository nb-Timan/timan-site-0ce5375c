import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { academyProtectedFetch } from '@/lib/academyProductionWriteGuard';
import { academySandbox } from '@/lib/academySandbox';
import { loadPublishedConfiguratorPrices } from '@/lib/configuratorPublishedPrices';
import { clearPublishedConfiguratorPricesForTest, getAccessoriesFlat, getLocalizedName } from '@/data/machines';

const rows = [{ item_number: '412594', item_text_da: 'Arbejdslys 2 stk.', item_text_de: 'Arbeitsleuchten 2 Stk.', price_dkk: 1234 }];
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear(); sessionStorage.clear();
  clearPublishedConfiguratorPricesForTest();
});

describe('Product Master transport through the production write guard', () => {
  it('loads outside training and surfaces a genuine server failure without static fallback', async () => {
    window.history.replaceState({}, '', '/configurator');
    const network = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: '42501', message: 'permission denied' }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(rows), { status: 200 }));
    vi.stubGlobal('fetch', network);
    await expect(loadPublishedConfiguratorPrices()).rejects.toMatchObject({ code: '42501', message: 'permission denied' });
    await expect(loadPublishedConfiguratorPrices()).resolves.toBe(1);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it.each(['/configurator', '/academy', '/configurator?academy_mode=true'])('loads canonical data on %s with a persisted training session', async route => {
    academySandbox.enterSession();
    window.history.replaceState({}, '', route);
    const network = vi.fn().mockResolvedValue(new Response(JSON.stringify(rows), { status: 200 }));
    vi.stubGlobal('fetch', network);
    await expect(loadPublishedConfiguratorPrices()).resolves.toBe(1);
    expect(network).toHaveBeenCalledTimes(1);
    expect(String(network.mock.calls[0][0])).toContain('/rpc/list_published_product_master');
    expect(network.mock.calls[0][1].method).toBe('GET');
    const light = getAccessoriesFlat('RC-1000S').find(item => item.varenr === '412594')!;
    expect(getLocalizedName(light.name, 'da')).toBe(rows[0].item_text_da);
    expect(getLocalizedName(light.name, 'de')).toBe(rows[0].item_text_de);
  });

  it('does not relax protection for POST RPCs or production table writes', async () => {
    academySandbox.enterSession();
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const client = createClient('https://example.supabase.co', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: academyProtectedFetch },
    });
    const result = await client.rpc('list_published_product_master');
    expect(result.status).toBe(0);
    expect(result.error?.message).toContain('production writes and RPC calls are blocked');
    await expect(academyProtectedFetch('https://example.supabase.co/rest/v1/crm_leads', { method: 'POST' })).rejects.toThrow('production writes');
    expect(network).not.toHaveBeenCalled();
  });
});
