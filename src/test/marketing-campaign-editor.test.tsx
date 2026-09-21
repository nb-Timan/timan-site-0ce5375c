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
  it('separates Buy X from Get Y, explains quantities and shows a live example', async () => {
    render(<MarketingCampaignManager catalog={catalog} language="da" initialProduct={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kampagneopsætning' }));
    await screen.findByDisplayValue('TEST editor');

    expect(screen.getByRole('region', { name: 'KØB X / TRIGGER' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'FÅ Y / FORDEL' })).toBeVisible();
    expect(screen.getByText('Antal X der skal være i kurven før kampagnen aktiveres.')).toBeVisible();
    expect(screen.getByText('Antal Y der kan få kampagneprisen eller rabatten.')).toBeVisible();
    expect(screen.getByText(/Kun én gang giver fordelen én gang/)).toBeVisible();
    expect(screen.getByLabelText('Kampagnens prisregel')).toHaveTextContent('0 kr.');
    expect(screen.getByLabelText('Fordelstype 725138')).toHaveTextContent('Brug kampagnens prisregel');
    expect(screen.getByTestId('campaign-live-summary')).toHaveTextContent('Køb 1 ×');
    expect(screen.getByTestId('campaign-live-summary')).toHaveTextContent('få 1 ×');
    expect(screen.getByTestId('campaign-live-summary')).toHaveTextContent('0 kr.');
    expect(screen.getByRole('dialog')).toHaveClass('sm:max-w-[90rem]');
  });

  it('opens the existing shared campaign from a product and persists its three choices and shared quantity', async () => {
    render(<MarketingCampaignManager catalog={catalog} language="da" initialProduct={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kampagneopsætning' }));
    await screen.findByDisplayValue('TEST editor');
    expect(screen.getByDisplayValue('QA-EDITOR')).toBeVisible();
    expect(screen.getByLabelText('Fordelsantal')).toHaveValue(1);
    expect(screen.getByText('Mindst én trigger (ELLER)')).toBeVisible();
    expect(screen.getByText('Kun én gang')).toBeVisible();
    for (const id of ['725131', '725132', '725138']) expect(screen.getByLabelText(`Fordelsprodukter ${id}`)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Fordelsantal'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem kladde' }));
    await waitFor(() => expect(saveMarketingCampaign).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(saveMarketingCampaign).mock.calls[0][0];
    expect(saved).toMatchObject({ id: 'qa', benefitQuantity: 3, targetPriceDkk: 0 });
    expect(saved.products.filter(row => row.role === 'benefit')).toHaveLength(3);
  });
  it('persists trigger grouping, repeat scaling and QA-only visibility', async () => {
    render(<MarketingCampaignManager catalog={catalog} language="da" initialProduct={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kampagneopsætning' }));
    await screen.findByDisplayValue('TEST editor');
    fireEvent.click(screen.getByText('Mindst én trigger (ELLER)'));
    fireEvent.click(await screen.findByRole('option', { name: 'Alle triggere (OG)' }));
    fireEvent.click(screen.getByText('Kun én gang'));
    fireEvent.click(await screen.findByRole('option', { name: 'Gentag pr. opfyldt trigger' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Kun QA (kun synlig for mig)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gem kladde' }));
    await waitFor(() => expect(saveMarketingCampaign).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveMarketingCampaign).mock.calls[0][0]).toMatchObject({ triggerMatchMode: 'all', scaleBenefitWithTrigger: true, audience: 'qa' });
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
  it('maps the explicit zero-price choice to the existing fixed zero target model', async () => {
    const percentageDraft = { ...draft(), benefitPricingType: 'percentage' as const, discountPct: 15, targetPriceDkk: null, targetPriceEur: null };
    vi.mocked(listMarketingCampaigns).mockResolvedValue({ rows: [percentageDraft], error: null });
    render(<MarketingCampaignManager catalog={catalog} language="da" initialProduct={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kampagneopsætning' }));
    await screen.findByDisplayValue('TEST editor');
    fireEvent.click(screen.getByLabelText('Kampagnens prisregel'));
    fireEvent.click(await screen.findByRole('option', { name: '0 kr.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gem kladde' }));
    await waitFor(() => expect(saveMarketingCampaign).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveMarketingCampaign).mock.calls[0][0]).toMatchObject({ benefitPricingType: 'fixed', discountPct: null, targetPriceDkk: 0, targetPriceEur: 0 });
  });
  it('keeps an invalid cleared date editable rather than throwing', async () => {
    render(<MarketingCampaignManager catalog={catalog} language="da" initialProduct={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kampagneopsætning' }));
    await screen.findByDisplayValue('TEST editor');
    fireEvent.change(screen.getByLabelText('Slut'), { target: { value: '' } });
    expect(screen.getByLabelText('Slut')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Gem kladde' })).toBeVisible();
  });
  it('closes only the nested editor after a successful publish', async () => {
    const onSaved = vi.fn();
    const published = { ...draft(), status: 'published' as const };
    vi.mocked(listMarketingCampaigns)
      .mockResolvedValueOnce({ rows: [draft()], error: null })
      .mockResolvedValueOnce({ rows: [published], error: null });
    render(<MarketingCampaignManager catalog={catalog} language="da" initialProduct={item} closeOnPublish onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kampagneopsætning' }));
    await screen.findByDisplayValue('TEST editor');
    fireEvent.click(screen.getByRole('button', { name: 'Publicér' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(published));
    expect(screen.queryByDisplayValue('TEST editor')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kampagneopsætning' })).toBeVisible();
  });
});
