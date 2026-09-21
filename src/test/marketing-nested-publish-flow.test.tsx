import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketingConfiguratorContentEditor from '@/components/configurator/MarketingConfiguratorContentEditor';
import {
  listMarketingConfiguratorCatalog,
  saveMarketingConfiguratorContent,
  type MarketingConfiguratorContentRecord,
} from '@/lib/marketingConfiguratorContentService';
import { emptyMarketingCampaign, listMarketingCampaigns, saveMarketingCampaign } from '@/lib/marketingCampaignService';
import type { ProductCampaign } from '@/lib/configuratorCampaigns';
import { toast } from 'sonner';

vi.mock('@/lib/usePortalCurrency', () => ({ usePortalCurrency: () => 'DKK' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('@/lib/marketingCampaignService', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/marketingCampaignService')>(),
  listMarketingCampaigns: vi.fn(),
  saveMarketingCampaign: vi.fn(),
  loadPublishedMarketingCampaigns: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/marketingConfiguratorContentService', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/marketingConfiguratorContentService')>(),
  saveMarketingConfiguratorContent: vi.fn(),
}));

const catalog = listMarketingConfiguratorCatalog('da');
const item = catalog.find(product => product.productKey === 'Timan 3330::725138')!;
let currentCampaign: ProductCampaign;
const record = (): MarketingConfiguratorContentRecord => ({
  id: 'content-draft',
  product_key: item.productKey,
  machine_key: item.machineKey,
  item_number: item.itemNumber,
  content: { ...item.defaults, title: 'Original titel', badge: 'Kampagne' },
  status: 'draft',
  published_at: null,
  updated_at: '2026-09-21T12:00:00.000Z',
});

beforeEach(() => {
  currentCampaign = {
    ...emptyMarketingCampaign(),
    id: 'campaign-id',
    code: 'QA-NESTED',
    name: 'Nested campaign',
    products: [{ campaignId: 'campaign-id', productKey: item.productKey, machineKey: item.machineKey, itemNumber: item.itemNumber, role: 'linked', quantity: 1 }],
  };
  vi.mocked(listMarketingCampaigns).mockImplementation(async () => ({ rows: [currentCampaign], error: null }));
  vi.mocked(saveMarketingCampaign).mockImplementation(async (campaign, status) => {
    currentCampaign = { ...campaign, id: 'campaign-id', status };
    return { id: 'campaign-id', error: null };
  });
  vi.mocked(saveMarketingConfiguratorContent).mockImplementation(async (_item, content, status) => ({
    row: { ...record(), content, status, published_at: status === 'published' ? '2026-09-21T12:01:00.000Z' : null },
    error: null,
  }));
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('nested Marketing publish flow', () => {
  it('returns from campaign publish with the product draft intact, then closes after product publish', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<MarketingConfiguratorContentEditor item={item} catalog={catalog} records={[record()]} uiLanguage="da" priceSourceLanguage="da" onClose={onClose} onSaved={onSaved} onDraftDeleted={vi.fn()} />);

    const title = await screen.findByLabelText('Visningstitel');
    fireEvent.change(title, { target: { value: 'Bevaret produkttitel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kampagneopsætning' }));
    const campaignName = await screen.findByLabelText('Kampagnenavn');
    fireEvent.change(campaignName, { target: { value: 'Opdateret kampagne' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Publicér' }).at(-1)!);

    await waitFor(() => expect(screen.queryByDisplayValue('Opdateret kampagne')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Redigér præsentationsindhold' })).toBeVisible();
    expect(screen.getByLabelText('Visningstitel')).toHaveValue('Bevaret produkttitel');
    expect(screen.getByTestId('linked-campaign-summary')).toHaveTextContent('Opdateret kampagne');
    expect(toast.success).toHaveBeenCalledWith('Kampagnen er publiceret');
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Publicér' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(saveMarketingConfiguratorContent).toHaveBeenCalledWith(item, expect.objectContaining({ title: 'Bevaret produkttitel' }), 'published');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Produktet er publiceret');
  });

  it('cancels each editor at its own level without publishing', async () => {
    const onClose = vi.fn();
    render(<MarketingConfiguratorContentEditor item={item} catalog={catalog} records={[record()]} uiLanguage="da" priceSourceLanguage="da" onClose={onClose} onSaved={vi.fn()} onDraftDeleted={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Visningstitel'), { target: { value: 'Draft bevares' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kampagneopsætning' }));
    await screen.findByLabelText('Kampagnenavn');
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    fireEvent.click(closeButtons.at(-1)!);
    await waitFor(() => expect(screen.queryByLabelText('Kampagnenavn')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Visningstitel')).toHaveValue('Draft bevares');
    expect(onClose).not.toHaveBeenCalled();
    expect(saveMarketingCampaign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Annuller' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(saveMarketingConfiguratorContent).not.toHaveBeenCalled();
  });
});
