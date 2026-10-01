import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeConfiguratorState } from '@/lib/configuratorState';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';

describe('CRM submitted-order read-only confirmation', () => {
  it('keeps the customer purchase-order reference in the canonical Configurator snapshot payload', () => {
    const state = normalizeConfiguratorState({
      flowType: 'order',
      purchaseOrderNumber: 'REK-7011',
      reqNumbers: { machine_1: 'REK-7011' },
    });

    expect(buildQuoteContentSummary(state).purchase_order_number).toBe('REK-7011');

    const configurator = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    expect(configurator).toContain("setCustomerField('purchaseOrderNumber', e.target.value)");
    expect(configurator).toContain('if (state.purchaseOrderNumber.trim())');
    expect(configurator).toContain('purchase_order_number: contentSummary.purchase_order_number');
  });

  it('shows the persisted REK/PO field after expected delivery and before created/sent dates', () => {
    const page = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');

    expect(page).toContain('r.purchase_order_number');
    expect(page).toContain('REK./PO: {r.purchase_order_number}');
  });

  it('allows only Backend and Seller to open scoped, persisted sales snapshots', () => {
    const page = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');

    expect(page).toContain("const canOpenSalesDocument = portalRole === 'timan_backend' || portalRole === 'timan_seller';");
    expect(page.indexOf('fetchCrmConfigurationVisible(row.id, scope)')).toBeLessThan(page.indexOf('loadSubmittedOrderConfirmation(row.id, ownerEmail, effectiveUser?.id)'));
    expect(page.indexOf('fetchCrmConfigurationVisible(row.id, scope)')).toBeLessThan(page.indexOf('loadConfigurationByIdUnscoped(row.id, ownerEmail)'));
    expect(page).toContain('ReadOnlySalesDocumentModal');
    expect(page).toContain('void handleOpenSalesDocument(r)');
    expect(page).toContain("const canEditOrderContacts = portalRole === 'timan_backend' && mode === 'order';");
  });

  it('renders both confirmations from the saved state and never exposes editable commercial fields', () => {
    const modal = readFileSync('src/components/crm/ReadOnlySalesDocumentModal.tsx', 'utf8');

    expect(modal).toContain('buildReadOnlySalesDocument(state)');
    expect(modal).toContain('orderPurchaseReferenceSummary(state)');
    expect(modal).toContain('group.purchaseReference');
    expect(modal).toContain('buildAccountOrderDiscountRows(state.pricingSnapshot');
    expect(modal).not.toMatch(/<input|<textarea|onChange=/);
    expect(modal).not.toMatch(/cost|margin|contribution/i);
  });
});
