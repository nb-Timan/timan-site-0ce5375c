import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, renderHook, act } from '@testing-library/react';
import { afterEach } from 'vitest';
import { jsPDF } from 'jspdf';
import { normalizeConfiguratorState } from '@/lib/configuratorState';
import { configuratorPricingSignature } from '@/lib/configuratorPricing';
import { buildAccountCaseLines } from '@/lib/configuratorAccountSummaries';
import { buildSubmittedOrderDocument, buildSubmittedOrderMailSummary } from '@/lib/submittedOrderConfirmation';
import { buildConfiguratorPdf, buildConfiguratorPdfFilename } from '@/lib/configuratorPdf';
import ReadOnlyOrderConfirmationModal from '@/components/crm/ReadOnlyOrderConfirmationModal';
import type { SavedConfiguration } from '@/lib/configurationsService';
import { t } from '@/data/translations';
import { PRODUCTS } from '@/data/machines';
import { useConfigurator } from '@/hooks/useConfigurator';

afterEach(cleanup);

// O-7010 Revision 3 shape, without customer/contact data.
function revisionState() {
  const state = normalizeConfiguratorState({
    flowType: 'order', language: 'da', date: '2026-10-15', deliveryMethod: 'send',
    paymentTerms: 'NET21', reqNumbers: { machine_1: 'PO-QA' },
    machineConfigs: [{ id: 'm0', type: 'Loader Line', qty: 1, configMode: 'individual', acc: [] }],
    individualUnitConfigs: {
      m0_1: { acc: ['725135', '725135__712902', '725135__725312', '725135__725120', '725135__725747'] },
      m0_2: { acc: ['725142', '725142__712902', '725142__725120', '725142__725747'] },
    },
    pricingSnapshot: { version: 1, capturedAt: '2026-09-21T07:39:24Z', prices: {
      'machine:Loader Line': 0,
      'accessory:Loader Line:725135': 60800, 'accessory:Loader Line:725142': 60800,
      'accessory:Loader Line:725135__712902': 1150, 'accessory:Loader Line:725135__725312': 3600,
      'accessory:Loader Line:725135__725120': 950, 'accessory:Loader Line:725135__725747': 3800,
      'accessory:Loader Line:725142__712902': 1150, 'accessory:Loader Line:725142__725120': 950,
      'accessory:Loader Line:725142__725747': 3800,
    }, totals: { subtotal: 70300, totalDiscount: 17575, finalPrice: 52725 } },
  });
  state.pricingSnapshot!.signature = configuratorPricingSignature(state);
  return state;
}

describe('canonical completed order confirmation', () => {
  it('keeps reopened Configurator preview on the same frozen document', () => {
    const state = revisionState();
    const { result } = renderHook(() => useConfigurator());
    act(() => result.current.setState(state));
    expect(result.current.calcResult).toEqual(buildSubmittedOrderDocument(state).calcResult);
    expect(result.current.calcResult?.currentPrice).toBe(52725);
    expect(result.current.calcResult?.lineItems.some(line => line.varenr === '725142')).toBe(false);
  });

  it('ignores the stale second unit and balances O-7010 Revision 3 exactly', () => {
    const { lines, totals } = buildSubmittedOrderDocument(revisionState());
    expect(lines.filter(line => line.total > 0).map(line => line.itemNo)).toEqual(['725135', '712902', '725312', '725120', '725747']);
    expect(lines.some(line => line.itemNo === '725142')).toBe(false);
    expect(lines.reduce((sum, line) => sum + line.total, 0)).toBe(70300);
    expect(totals).toEqual({ subtotal: 70300, totalDiscount: 17575, finalPrice: 52725 });
  });

  it('does not mutate original or revision snapshots', () => {
    const state = revisionState();
    const before = JSON.stringify(state);
    buildSubmittedOrderDocument(state);
    expect(JSON.stringify(state)).toBe(before);
    expect(state.individualUnitConfigs.m0_2.acc).toContain('725142');
  });

  it('preserves shared quantities and distinct unit purchase references', () => {
    const state = revisionState();
    state.machineConfigs[0].qty = 2;
    state.machineConfigs[0].configMode = 'shared';
    state.machineConfigs[0].acc = ['725135'];
    state.reqNumbers.machine_2 = 'PO-SECOND';
    const lines = buildAccountCaseLines(state, 'da').filter(line => line.itemNo === '725135');
    expect(lines).toHaveLength(2);
    expect(lines.map(line => line.total)).toEqual([60800, 60800]);
    expect(lines.map(line => line.purchaseReferences)).toEqual([['PO-QA'], ['PO-SECOND']]);
  });

  it('preserves independent per-unit accessory quantities', () => {
    const state = revisionState();
    state.accQty.m0_1_725135 = 2;
    expect(buildAccountCaseLines(state, 'da').find(line => line.itemNo === '725135')?.total).toBe(121600);
  });

  it('fails closed instead of showing mismatched totals', () => {
    const state = revisionState();
    state.pricingSnapshot!.totals!.subtotal = 666;
    expect(() => buildSubmittedOrderDocument(state)).toThrow('stemmer ikke overens');
  });

  it('does not replace a missing historical price with a current catalogue price', () => {
    const state = revisionState();
    delete state.pricingSnapshot!.prices['accessory:Loader Line:725135'];
    expect(() => buildSubmittedOrderDocument(state)).toThrow();
  });

  it('reuses frozen lines even if catalogue content changes', () => {
    const state = revisionState();
    state.pricingSnapshot!.lines = buildAccountCaseLines(state, 'da');
    const original = PRODUCTS['Loader Line'];
    try {
      delete PRODUCTS['Loader Line'];
      expect(buildSubmittedOrderDocument(state).totals.finalPrice).toBe(52725);
      const mail = buildSubmittedOrderMailSummary(state);
      expect(mail.totals.subtotal).toBe(70300);
      expect(mail.machines[0].units[0].accessories.map(line => line.varenr)).toEqual(['725135', '712902', '725312', '725120', '725747']);
      expect(mail.payment_terms).toBe('NET21');
      expect(mail.machines[0].units[0].req_number).toBe('PO-QA');
    } finally { PRODUCTS['Loader Line'] = original; }
  });

  it('renders a controlled legacy warning', () => {
    const state = revisionState();
    delete state.pricingSnapshot;
    render(<ReadOnlyOrderConfirmationModal order={{ state_json: state, id: 'qa', order_number: 'O-QA' } as SavedConfiguration} onClose={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('historisk pris-snapshot');
  });

  it('uses exactly the same commercial rows for UI and PDF, with revision and PO', () => {
    const state = revisionState();
    const document = buildSubmittedOrderDocument(state);
    render(<ReadOnlyOrderConfirmationModal order={{ state_json: state, id: 'qa', order_number: 'O-7010', confirmation_revision_number: 3 } as SavedConfiguration} onClose={vi.fn()} />);
    expect(screen.queryByText('725142')).toBeNull();
    expect(screen.getByText('Ordrebekræftelse · Revision 3')).toBeTruthy();
    const pdf = buildConfiguratorPdf({ jsPDF, state, calcResult: document.calcResult, flowType: 'order', orderNumber: 'O-7010', revisionNumber: 3, showPrices: true, uiLanguage: 'da', contentLanguage: 'da', T: key => t(key, 'da'), TC: key => t(key, 'da') });
    const output = pdf.output();
    expect(output).toContain('Revision 3');
    expect(output).toContain('PO-QA');
    expect(output).not.toContain('725142');
    for (const line of document.lines.filter(line => line.total > 0)) {
      expect(screen.getByText(line.itemNo)).toBeTruthy();
      expect(output).toContain(line.itemNo);
    }
    expect(buildConfiguratorPdfFilename({flowType: 'order', refNumber: 'O-7010', revisionNumber: 3, T: key => key})).toContain('O-7010_Revision_3');
  });
});
