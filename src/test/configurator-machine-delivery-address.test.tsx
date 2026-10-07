import { useState } from 'react';
import { readFileSync, writeFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { LOOSE_TOOL_KEY } from '@/data/machines';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReadOnlySalesDocumentModal from '@/components/crm/ReadOnlySalesDocumentModal';
import { ConfiguratorDeliveryAddress } from '@/components/configurator/ConfiguratorDeliveryAddress';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';
import { setConfiguratorMachineQuantity, setConfiguratorMode } from '@/lib/configuratorDomain';
import { dealerDeliveryAddress, deliveryMachineUnits, deliveryDestinationSections, resolveDeliveryDestination, updateMachineDeliveryAddress, machineDeliveryDate } from '@/lib/configuratorDelivery';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';
import { configuratorPricingSignature } from '@/lib/configuratorPricing';
import { buildSubmittedOrderDocument, buildSubmittedOrderMailSummary } from '@/lib/submittedOrderConfirmation';
import { buildConfiguratorPdf } from '@/lib/configuratorPdf';
import type { SavedConfiguration } from '@/lib/configurationsService';
import { t } from '@/data/translations';

function fixture(qty = 2) {
  const state = setConfiguratorMachineQuantity(createEmptyConfiguratorState(), 'Timan 3330', qty);
  state.address = 'Invoice Street 1';
  state.dealerCustomerData = { firmanavn: 'QA Dealer', kontaktperson: 'Dealer Contact', telefon: '123', emailRecipient: '',
    address: 'Dealer Street 2', postalCode: '6000', city: 'Kolding', country: 'DK' };
  return normalizeConfiguratorState(state);
}

function withAddresses() {
  const state = fixture();
  state.machineDeliveryAddresses = updateMachineDeliveryAddress(state, 'm0_1', dealerDeliveryAddress(state));
  state.machineDeliveryAddresses = updateMachineDeliveryAddress(state, 'm0_2', {
    mode: 'manual', address: 'QA Warehouse 9', postalCode: '7000', city: 'Fredericia', country: 'DK',
    contactPerson: 'QA Contact', phone: '456', note: 'QA Gate 3',
  });
  return state;
}

function frozenAddresses() {
  const state = withAddresses();
  state.firmanavn = 'QA Invoice Company';
  state.flowType = 'order';
  state.pricingSnapshot = {
    version: 1, capturedAt: '2026-10-07T12:00:00Z', prices: {},
    lines: [1, 2].map(unitNumber => ({ unitNumber, itemNo: '712000', description: 'Timan 3330',
      quantity: 1, unitPrice: 100000, total: 100000, note: '' })),
    totals: { subtotal: 200000, totalDiscount: 0, finalPrice: 200000 },
  };
  state.pricingSnapshot.signature = configuratorPricingSignature(state);
  return state;
}

function Editor({ qty = 2 }: { qty?: number }) {
  const [state, setState] = useState(() => fixture(qty));
  const [variant, setVariant] = useState<'step2' | 'step4'>('step2');
  return <>
    <button onClick={() => setVariant('step4')}>Step 4</button>
    <ConfiguratorDeliveryAddress state={state} variant={variant} T={key => t(key, 'da')}
      onChange={update => setState(current => normalizeConfiguratorState({ ...current, ...update }))} />
  </>;
}

describe('per-machine delivery destination snapshots', () => {
  it('uses manual mode for new machine instances and one section for one machine', () => {
    expect(fixture(1).machineDeliveryAddresses?.m0_1.mode).toBe('manual');
    render(<Editor qty={1} />);
    expect(screen.getAllByTestId(/^machine-delivery-/)).toHaveLength(1);
    expect(screen.getByTestId('machine-delivery-m0_1')).toHaveAttribute('open');
  });

  it('has two compact sections for two identical machines and no old helper', () => {
    render(<Editor />);
    expect(screen.getAllByTestId(/^machine-delivery-/)).toHaveLength(2);
    expect(screen.getByTestId('machine-delivery-m0_1')).not.toHaveAttribute('open');
    expect(screen.queryByText('Adressen hentes fra kunde-/forhandleroplysningerne i Trin 4.')).toBeNull();
  });

  it('copies canonical dealer data for machine 1, edits machine 2 and reuses both in step 4', () => {
    render(<Editor />);
    const first = within(screen.getByTestId('machine-delivery-m0_1'));
    const second = within(screen.getByTestId('machine-delivery-m0_2'));
    fireEvent.click(first.getByLabelText('Brug forhandlerens adresse'));
    fireEvent.change(second.getByLabelText('Adresse'), { target: { value: 'QA Warehouse 9' } });
    expect(first.getByText(/Dealer Street 2/)).toBeTruthy();
    expect(second.getByLabelText('Indtast anden adresse')).toBeChecked();
    fireEvent.click(screen.getByText('Step 4'));
    expect(first.getByLabelText('Brug forhandlerens adresse')).toBeChecked();
    expect(second.getByLabelText('Adresse')).toHaveValue('QA Warehouse 9');
  });

  it('does not overwrite customer data or dealer master snapshot', () => {
    const state = withAddresses();
    const original = structuredClone(state);
    state.machineDeliveryAddresses = updateMachineDeliveryAddress(state, 'm0_2', { address: 'New Street' });
    expect(state.address).toBe('Invoice Street 1');
    expect(state.dealerCustomerData).toEqual(original.dealerCustomerData);
    expect(state.machineDeliveryAddresses.m0_1).toEqual(original.machineDeliveryAddresses?.m0_1);
  });

  it('preserves selected dealer snapshot across later dealer/customer changes', () => {
    const state = withAddresses();
    state.dealerCustomerData.address = 'Different Dealer Street';
    state.address = 'Different Customer Street';
    expect(resolveDeliveryDestination(state, 1).address).toBe('Dealer Street 2');
    expect(resolveDeliveryDestination(state, 2).address).toBe('QA Warehouse 9');
  });

  it('keeps stable keys on reorder, shared/individual mode and separate same-model instances', () => {
    const state = withAddresses();
    state.machineConfigs.push({ ...state.machineConfigs[0], id: 'separate-3330', qty: 1 });
    state.machineDeliveryAddresses = updateMachineDeliveryAddress(state, 'separate-3330_1', { address: 'Third Street' });
    state.machineConfigs.reverse();
    const reopened = normalizeConfiguratorState(setConfiguratorMode(state, 'Timan 3330', 'shared'));
    expect(resolveDeliveryDestination(reopened, 1).address).toBe('Third Street');
    expect(resolveDeliveryDestination(reopened, 2).address).toBe('Dealer Street 2');
    expect(resolveDeliveryDestination(reopened, 3).address).toBe('QA Warehouse 9');
  });

  it('adds only default state and removes only the removed unit, without resurrecting it', () => {
    const state = withAddresses();
    const removed = setConfiguratorMachineQuantity(state, 'Timan 3330', -1);
    expect(Object.keys(removed.machineDeliveryAddresses!)).toEqual(['m0_1']);
    const added = setConfiguratorMachineQuantity(removed, 'Timan 3330', 1);
    expect(added.machineDeliveryAddresses?.m0_1).toEqual(state.machineDeliveryAddresses?.m0_1);
    expect(added.machineDeliveryAddresses?.m0_2.address).toBe('');
    const none = setConfiguratorMachineQuantity(added, 'Timan 3330', -2);
    expect(none.machineDeliveryAddresses).toEqual({});
  });

  it('persists every field and mode through the canonical storage payload', () => {
    const state = withAddresses();
    const stored = JSON.stringify({ __kind: 'configurator_state', state: normalizeConfiguratorState(state) });
    const parsed = JSON.parse(stored);
    expect(parsed.state?.machineDeliveryAddresses).toEqual(state.machineDeliveryAddresses);
    expect(normalizeConfiguratorState(parsed.state).machineDeliveryAddresses).toEqual(state.machineDeliveryAddresses);
    const service = readFileSync('src/lib/configurationsService.ts', 'utf8');
    expect(service).toContain('state: normalizeConfiguratorState(state)');
    expect(service).toContain('state_json: stateForPersistence');
  });

  it('attaches correct per-unit destinations to both quote and order payloads', () => {
    for (const flowType of ['quote', 'order'] as const) {
      const state = withAddresses();
      state.flowType = flowType;
      const summary = buildQuoteContentSummary(state);
      expect(summary.customer.address).toBe('Invoice Street 1');
      expect(summary.machines[0].units[0].delivery_address).toMatchObject({ source: 'dealer', address: 'Dealer Street 2' });
      expect(summary.machines[0].units[1].delivery_address).toMatchObject({ source: 'alternative', address: 'QA Warehouse 9', phone: '456', note: 'QA Gate 3' });
    }
  });

  it('preserves per-machine delivery in the frozen order email payload without changing customer or pricing', () => {
    const state = frozenAddresses();
    const before = JSON.stringify(state);
    const mail = buildSubmittedOrderMailSummary(state);
    expect(mail.customer.address).toBe('Invoice Street 1');
    expect(mail.machines[0].units.map(unit => unit.delivery_address.address)).toEqual(['Dealer Street 2', 'QA Warehouse 9']);
    expect(mail.machines[0].units.map(unit => unit.delivery_address.source)).toEqual(['dealer', 'alternative']);
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each(['quote', 'order'] as const)('shows both destinations separately on the read-only %s confirmation', documentType => {
    const state = frozenAddresses();
    render(<ReadOnlySalesDocumentModal document={{ id: 'qa-delivery', state_json: state } as SavedConfiguration}
      documentType={documentType} onClose={vi.fn()} language="da" />);
    expect(screen.getByText(/Maskine 1.*Timan 3330/, { selector: 'dt' }).parentElement).toHaveTextContent('Dealer Street 2');
    expect(screen.getByText(/Maskine 2.*Timan 3330/, { selector: 'dt' }).parentElement).toHaveTextContent('QA Warehouse 9');
    expect(screen.getByText('Invoice Street 1')).toBeTruthy();
  });

  it.each(['quote', 'order'] as const)('prints each machine destination in the %s PDF', flowType => {
    const state = frozenAddresses();
    const before = JSON.stringify(state);
    const pdf = buildConfiguratorPdf({ jsPDF, state, calcResult: buildSubmittedOrderDocument(state).calcResult,
      flowType, showPrices: true, uiLanguage: 'da', contentLanguage: 'da', T: key => t(key, 'da'), TC: key => t(key, 'da') });
    const content = pdf.output();
    for (const text of ['Invoice Street 1', 'Dealer Street 2', 'QA Warehouse 9', 'QA Gate 3', 'Maskine 1', 'Maskine 2']) {
      expect(content).toContain(text);
    }
    expect(JSON.stringify(state)).toBe(before);
    if (process.env.CONFIGURATOR_QA_PDF_DIR) {
      writeFileSync(`${process.env.CONFIGURATOR_QA_PDF_DIR}/machine-delivery-${flowType}.pdf`, Buffer.from(pdf.output('arraybuffer')));
    }
  });

  it('keeps wrapped delivery notes in full rather than only the first PDF line', () => {
    const state = frozenAddresses();
    state.machineDeliveryAddresses!.m0_2.note = `${'Delivery instructions at the gate. '.repeat(6)}END-OF-DELIVERY-NOTE`;
    const pdf = buildConfiguratorPdf({ jsPDF, state, calcResult: buildSubmittedOrderDocument(state).calcResult,
      flowType: 'order', showPrices: true, uiLanguage: 'da', contentLanguage: 'da', T: key => t(key, 'da'), TC: key => t(key, 'da') });
    expect(pdf.output()).toContain('END-OF-DELIVERY-NOTE');
  });

  it('leaves legacy snapshots unchanged until an explicit delivery edit', () => {
    const legacy = fixture();
    legacy.machineDeliveryAddresses = undefined;
    legacy.useAlternativeDeliveryAddress = true;
    legacy.alternativeDeliveryAddress = 'Historical Warehouse';
    expect(normalizeConfiguratorState(legacy).machineDeliveryAddresses).toBeUndefined();
    expect(deliveryDestinationSections(legacy)).toHaveLength(1);
    expect(resolveDeliveryDestination(legacy, 2).address).toBe('Historical Warehouse');
    const updated = updateMachineDeliveryAddress(legacy, 'm0_2', { address: 'New Warehouse' });
    expect(updated.m0_1.address).toBe('Historical Warehouse');
    expect(updated.m0_2.address).toBe('New Warehouse');
  });

  it('delivery addresses are independent from single/multi-machine date rules', () => {
    const state = withAddresses();
    state.date = '2027-01-04';
    state.machineDeliveryDates = { m0_1: '2027-02-01', m0_2: '2027-03-01' };
    expect(machineDeliveryDate(state, 2)).toBe('2027-03-01');
    const removed = setConfiguratorMachineQuantity(state, 'Timan 3330', -1);
    expect(machineDeliveryDate(removed, 1)).toBe('2027-01-04');
    expect(resolveDeliveryDestination(removed, 1).address).toBe('Dealer Street 2');
  });

  it('does not create base-machine delivery forms for loose equipment', () => {
    const state = fixture(1);
    state.machineConfigs.unshift({ id: 'loose', type: LOOSE_TOOL_KEY, qty: 1, configMode: 'shared', acc: [] });
    expect(deliveryMachineUnits(state)).toEqual([{ key: 'm0_1', unitNumber: 2, machineType: 'Timan 3330' }]);
  });

  it('has localized address mode labels on all nine portal languages', () => {
    for (const language of ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs']) {
      expect(t('useDealerDeliveryAddress', language)).not.toBe('useDealerDeliveryAddress');
      expect(t('enterDeliveryAddress', language)).not.toBe('enterDeliveryAddress');
    }
  });
});
