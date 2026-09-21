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

  it('allows only Backend and Seller to open the scoped, persisted submitted-order snapshot', () => {
    const page = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');

    expect(page).toContain("const canOpenSubmittedOrder = mode === 'order' && (portalRole === 'timan_backend' || portalRole === 'timan_seller');");
    expect(page.indexOf('fetchCrmConfigurationVisible(row.id, scope)')).toBeLessThan(page.indexOf('loadConfigurationByIdUnscoped(row.id, ownerEmail)'));
    expect(page).toContain('ReadOnlyOrderConfirmationModal');
    expect(page).toContain("const canEditOrderContacts = portalRole === 'timan_backend' && mode === 'order';");
  });

  it('renders the confirmation from the saved state and never exposes editable order fields', () => {
    const modal = readFileSync('src/components/crm/ReadOnlyOrderConfirmationModal.tsx', 'utf8');

    expect(modal).toContain('calcConfigurationTotals(state)');
    expect(modal).toContain("buildAccountCaseLines(state, 'da', state.language)");
    expect(modal).toContain('orderPurchaseReferenceSummary(state)');
    expect(modal).toContain('line.purchaseReferences');
    expect(modal).not.toMatch(/<input|<textarea|onChange=/);
  });
});
