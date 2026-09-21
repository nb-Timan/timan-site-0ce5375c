import { fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketingCampaignManager from '@/components/configurator/MarketingCampaignManager';
import { listMarketingConfiguratorCatalog } from '@/lib/marketingConfiguratorContentService';
import { emptyMarketingCampaign, listMarketingCampaigns, saveMarketingCampaign } from '@/lib/marketingCampaignService';
import type { ProductCampaign } from '@/lib/configuratorCampaigns';

vi.mock('@/lib/marketingCampaignService', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/marketingCampaignService')>(),
  listMarketingCampaigns: vi.fn(), saveMarketingCampaign: vi.fn(),
  loadPublishedMarketingCampaigns: vi.fn().mockResolvedValue([]),
}));
const catalog = listMarketingConfiguratorCatalog('da');
const item = catalog.find(product => product.productKey === 'Timan 3330::725138')!;
const product = (key: string, role: 'trigger' | 'benefit') => {
  const entry = catalog.find(row => row.productKey === key)!;
  return { campaignId: 'qa', productKey: key, machineKey: entry.machineKey, itemNumber: entry.itemNumber, role, quantity: 1 };
};
const draft = (): ProductCampaign => ({ ...emptyMarketingCampaign(), id: 'qa', code: 'QA-EDITOR', name: 'TEST editor', type: 'conditional', benefitPricingType: 'fixed', targetPriceDkk: 0, targetPriceEur: 0,
  products: [product('Timan 3330::Timan 3330', 'trigger'), ...['725131', '725132', '725138'].map(id => product(`Timan 3330::${id}`, 'benefit'))],
});
beforeEach(() => {
  vi.mocked(listMarketingCampaigns).mockResolvedValue({ rows: [draft()], error: null });
  vi.mocked(saveMarketingCampaign).mockResolvedValue({ id: 'qa', error: null });
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('product-linked Campaign editor', () => {
  it('opens the existing shared campaign from a product and persists its three choices and shared quantity', async () => {
    render(<MarketingCampaignManager catalog={catalog} language="da" initialProduct={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kampagneopsætning' }));
    await screen.findByDisplayValue('TEST editor');
    expect(screen.getByDisplayValue('QA-EDITOR')).toBeVisible();
    expect(screen.getByLabelText('Fordelsantal')).toHaveValue(1);
    for (const id of ['725131', '725132', '725138']) expect(screen.getByLabelText(`Fordelsprodukter ${id}`)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Fordelsantal'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem kladde' }));
    await waitFor(() => expect(saveMarketingCampaign).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(saveMarketingCampaign).mock.calls[0][0];
    expect(saved).toMatchObject({ id: 'qa', benefitQuantity: 3, targetPriceDkk: 0 });
    expect(saved.products.filter(row => row.role === 'benefit')).toHaveLength(3);
  });
  it('changes an individual benefit to percentage without changing the other benefits', async () => {
    render(<MarketingCampaignManager catalog={catalog} language="da" initialProduct={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kampagneopsætning' }));
    await screen.findByDisplayValue('TEST editor');
    const benefit = screen.getByLabelText('Fordelsprodukter 725138');
    fireEvent.keyDown(within(benefit).getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Rabat i %' }));
    fireEvent.change(within(benefit).getByLabelText('Kampagnerabat %'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem kladde' }));
    await waitFor(() => expect(saveMarketingCampaign).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(saveMarketingCampaign).mock.calls[0][0];
    expect(saved.products.find(row => row.itemNumber === '725138')).toMatchObject({ discountPct: 10, targetPriceDkk: null, targetPriceEur: null });
    expect(saved.targetPriceDkk).toBe(0);
  });
  it('keeps an invalid cleared date editable rather than throwing', async () => {
    render(<MarketingCampaignManager catalog={catalog} language="da" initialProduct={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kampagneopsætning' }));
    await screen.findByDisplayValue('TEST editor');
    fireEvent.change(screen.getByLabelText('Slut'), { target: { value: '' } });
    expect(screen.getByLabelText('Slut')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Gem kladde' })).toBeVisible();
  });
});
