import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from, upsert, select, single } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, from } }));

import { EMPTY_CONTENT, saveMarketingConfiguratorContent } from '@/lib/marketingConfiguratorContentService';

const item = { productKey: 'Timan 3330::725132', machineKey: 'Timan 3330', itemNumber: '725132' };
const content = {
  ...EMPTY_CONTENT,
  title: 'Dansk canonical',
  localized_titles: { da: 'Dansk canonical', de: 'Deutsch canonical', en: 'English canonical' },
  description: '',
  localized_descriptions: { da: '', de: 'Deutsche Kurzbeschreibung', en: 'English short copy' },
};
const row = {
  id: 'content-id',
  product_key: item.productKey,
  machine_key: item.machineKey,
  item_number: item.itemNumber,
  content,
  status: 'published',
  published_at: '2026-09-22T12:00:00.000Z',
  updated_at: '2026-09-22T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  single.mockResolvedValue({ data: { ...row, status: 'draft', published_at: null }, error: null });
  select.mockReturnValue({ single });
  upsert.mockReturnValue({ select });
  from.mockReturnValue({ upsert });
  rpc.mockResolvedValue({ data: [row], error: null });
});

describe('Marketing localized title publication', () => {
  it('keeps localized draft titles in the existing draft row only', async () => {
    await expect(saveMarketingConfiguratorContent(item, content, 'draft')).resolves.toMatchObject({ error: null });
    expect(from).toHaveBeenCalledWith('marketing_configurator_product_content');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      content,
      status: 'draft',
      published_at: null,
    }), { onConflict: 'product_key,status' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('publishes through the atomic Product Master RPC and refreshes open consumers', async () => {
    const listener = vi.fn();
    window.addEventListener('timan:product-master-published', listener);
    await expect(saveMarketingConfiguratorContent(item, content, 'published')).resolves.toMatchObject({
      row: expect.objectContaining({ item_number: '725132', status: 'published' }),
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith('publish_marketing_configurator_product_content', {
      p_product_key: item.productKey,
      p_machine_key: item.machineKey,
      p_item_number: item.itemNumber,
      p_content: content,
    });
    expect(from).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('timan:product-master-published', listener);
  });

  it('uses the same stable product key for first save and repeated publish', async () => {
    const firstDraft = await saveMarketingConfiguratorContent(item, content, 'draft');
    const secondDraft = await saveMarketingConfiguratorContent(item, content, 'draft');
    const firstPublish = await saveMarketingConfiguratorContent(item, content, 'published');
    const secondPublish = await saveMarketingConfiguratorContent(item, content, 'published');

    expect(firstDraft.row?.id).toBe(secondDraft.row?.id);
    expect(firstPublish.row?.id).toBe(secondPublish.row?.id);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ product_key: item.productKey }), { onConflict: 'product_key,status' });
    expect(upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ product_key: item.productKey }), { onConflict: 'product_key,status' });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, 'publish_marketing_configurator_product_content', expect.objectContaining({ p_product_key: item.productKey }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'publish_marketing_configurator_product_content', expect.objectContaining({ p_product_key: item.productKey }));
  });
});
