import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReadOnlySalesDocumentModal from '@/components/crm/ReadOnlySalesDocumentModal';
import { normalizeConfiguratorState } from '@/lib/configuratorState';
import { configuratorPricingSignature } from '@/lib/configuratorPricing';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';
import type { SavedConfiguration } from '@/lib/configurationsService';
import type { DiscountDetail } from '@/types/configurator';

afterEach(cleanup);

function savedDocument(type: 'quote' | 'order', details?: DiscountDetail[]): SavedConfiguration {
  const totalDiscount = details?.reduce((sum, detail) => sum + detail.amount, 0) ?? 200;
  const state = normalizeConfiguratorState({
    flowType: type,
    language: 'da',
    currency: 'EUR',
    date: '2026-11-20',
    deliveryMethod: 'send',
    firmanavn: 'Historical customer',
    machineConfigs: [{ id: 'm0', type: 'RC-751', qty: 1, configMode: 'shared', acc: [] }],
    pricingSnapshot: {
      version: 1,
      discountEngineVersion: 2,
      capturedAt: '2026-10-01T10:00:00.000Z',
      currency: 'EUR',
      prices: {},
      lines: [{ unitNumber: 1, itemNo: '410040', description: 'RC-751', note: '', unitPrice: 1000, quantity: 1, total: 1000 }],
      discountDetails: details,
      totals: { subtotal: 1000, totalDiscount, finalPrice: 1000 - totalDiscount },
    },
  });
  state.pricingSnapshot!.signature = configuratorPricingSignature(state);
  return {
    id: `${type}-id`, state_json: state, case_type: type,
    quote_number: type === 'quote' ? 'T-4022' : 'T-4000',
    order_number: type === 'order' ? 'O-7026' : null,
    confirmation_revision_number: type === 'order' ? 2 : undefined,
    created_at: '2026-10-01T10:00:00.000Z', last_saved_at: '2026-10-01T10:00:00.000Z',
  } as SavedConfiguration;
}

const detail = (kind: DiscountDetail['kind'], amount: number, percent: number, txt = ''): DiscountDetail => ({
  kind, amount, percent, txt: txt || String(kind),
});

describe('CRM read-only quote/order confirmations', () => {
  it('renders a quote directly from its frozen snapshot with canonical discount components', () => {
    const quote = savedDocument('quote', [
      detail('base', 200, 20), detail('quantity', 30, 3), detail('delivery', 20, 2),
      detail('campaign', 25, 2.5, 'Campaign K-0001-26'), detail('dealer', 5, 0.5),
    ]);
    render(<ReadOnlySalesDocumentModal document={quote} documentType="quote" language="en" onClose={vi.fn()} />);

    expect(screen.getByRole('region', { name: 'Quote confirmation T-4022' })).toBeTruthy();
    expect(screen.getByText('Base discount (20 %)')).toBeTruthy();
    expect(screen.getByText('Quantity discount (3 %)')).toBeTruthy();
    expect(screen.getByText('Delivery discount over 3 months (2 %)')).toBeTruthy();
    expect(screen.getByText('Campaign discount: K-0001-26 (2.5 %)')).toBeTruthy();
    expect(screen.getByText('Extra dealer discount (0.5 %)')).toBeTruthy();
    expect(screen.getByText('Total discount')).toBeTruthy();
    expect(screen.getByText('Total excl. VAT')).toBeTruthy();
    expect(screen.queryByText(/cost|margin|contribution/i)).toBeNull();
  });

  it('opens the latest frozen order revision in the same shared component', () => {
    const order = savedDocument('order', [detail('base', 200, 20)]);
    render(<ReadOnlySalesDocumentModal document={order} documentType="order" language="da" onClose={vi.fn()} />);
    expect(screen.getByText('Ordrebekræftelse · Revision 2')).toBeTruthy();
    expect(screen.getByText('O-7026')).toBeTruthy();
    expect(screen.getByText('Grundrabat (20 %)')).toBeTruthy();
  });

  it('never fabricates components when a legacy snapshot stores only the aggregate total', () => {
    const quote = savedDocument('quote');
    render(<ReadOnlySalesDocumentModal document={quote} documentType="quote" language="da" onClose={vi.fn()} />);
    expect(screen.getByText('Samlet rabat')).toBeTruthy();
    expect(screen.getByText('Detaljeret rabatfordeling er ikke gemt på denne historiske revision.')).toBeTruthy();
    expect(screen.queryByText(/Grundrabat/)).toBeNull();
  });

  it('has complete quote/order and pricing labels in every portal language', () => {
    for (const language of PORTAL_LANGUAGE_CODES) {
      for (const key of ['salesQuoteConfirmation', 'salesOrderConfirmation', 'salesGrossTotal', 'salesTotalExVat', 'salesHistoricalBreakdownMissing', 'accountOrderTotalDiscount']) {
        expect(t(key, language)).not.toBe(key);
      }
    }
  });
});
