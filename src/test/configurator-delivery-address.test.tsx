import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfiguratorDeliveryAddress } from '@/components/configurator/ConfiguratorDeliveryAddress';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';
import {
  baseMachineQuantity,
  hasMachineDeliveryOverride,
  machineDeliveryDate,
  resolveDeliveryDestination,
} from '@/lib/configuratorDelivery';
import {
  replaceConfiguratorDealerCustomerData,
  selectConfiguratorCustomerMode,
} from '@/lib/configuratorCustomerMode';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';
import { t } from '@/data/translations';

function stateWithCustomer() {
  const state = createEmptyConfiguratorState('da', 'quote');
  state.firmanavn = 'AB Lauridsen';
  state.kontaktperson = 'Anna Kunde';
  state.telefon = '12345678';
  state.address = 'Kundevej 1';
  state.postalCode = '6000';
  state.city = 'Kolding';
  state.country = 'Danmark';
  state.manualCustomerDraft = {
    firmanavn: state.firmanavn, kontaktperson: state.kontaktperson, telefon: state.telefon,
    emailRecipient: '', address: state.address, postalCode: state.postalCode, city: state.city, country: state.country,
  };
  return state;
}

describe('Configurator delivery address and date rules', () => {
  it('uses only the global date for one base machine and enables overrides for two', () => {
    const state = stateWithCustomer();
    state.date = '2027-01-21';
    state.machineConfigs = [{ id: 'm0', type: 'RC-1000S', qty: 1, configMode: 'shared', acc: [] }];
    state.machineDeliveryDates = { m0_1: '2027-02-10' };

    expect(baseMachineQuantity(state)).toBe(1);
    expect(machineDeliveryDate(state, 1)).toBe('2027-01-21');
    expect(hasMachineDeliveryOverride(state, 1)).toBe(false);

    state.machineConfigs.push({ id: 'm1', type: 'Timan 3330', qty: 1, configMode: 'shared', acc: [] });
    expect(baseMachineQuantity(state)).toBe(2);
    expect(machineDeliveryDate(state, 1)).toBe('2027-02-10');
    expect(hasMachineDeliveryOverride(state, 1)).toBe(true);
  });

  it('derives delivery from customer data without duplicating it', () => {
    const state = stateWithCustomer();
    expect(resolveDeliveryDestination(state)).toMatchObject({
      source: 'customer', company: 'AB Lauridsen', address: 'Kundevej 1', postalCode: '6000', city: 'Kolding', country: 'Danmark',
    });
  });

  it('keeps a transaction delivery override separate through dealer/manual changes', () => {
    const state = stateWithCustomer();
    Object.assign(state, {
      useAlternativeDeliveryAddress: true,
      alternativeDeliveryAddress: 'Lagervej 9',
      alternativeDeliveryPostalCode: '24837',
      alternativeDeliveryCity: 'Schleswig',
      alternativeDeliveryCountry: 'Tyskland',
      alternativeDeliveryContactPerson: 'Lagerchef',
      alternativeDeliveryPhone: '99887766',
      alternativeDeliveryNote: 'Port 2',
    });

    const dealer = replaceConfiguratorDealerCustomerData(state, {
      firmanavn: 'Forhandler GmbH', kontaktperson: 'Dealer Contact', telefon: '111', emailRecipient: 'dealer@example.com',
      address: 'Dealerstrasse 1', postalCode: '20000', city: 'Hamburg', country: 'Tyskland',
    }, 'contact-1');
    const selectedDealer = selectConfiguratorCustomerMode(dealer, 'dealer');
    const selectedManual = selectConfiguratorCustomerMode(selectedDealer, 'manual');

    for (const current of [selectedDealer, selectedManual]) {
      expect(resolveDeliveryDestination(current)).toMatchObject({
        source: 'alternative', address: 'Lagervej 9', postalCode: '24837', city: 'Schleswig', country: 'Tyskland',
      });
    }
    expect(selectedDealer.address).toBe('Dealerstrasse 1');
    expect(selectedManual.address).toBe('Kundevej 1');
  });

  it('persists the structured override and keeps customer and delivery separate in the payload', () => {
    const state = stateWithCustomer();
    Object.assign(state, {
      useAlternativeDeliveryAddress: true,
      alternativeDeliveryAddress: 'Leveringsvej 2',
      alternativeDeliveryPostalCode: '7100',
      alternativeDeliveryCity: 'Vejle',
      alternativeDeliveryCountry: 'Danmark',
    });
    const reopened = normalizeConfiguratorState(JSON.parse(JSON.stringify(state)));
    const summary = buildQuoteContentSummary(reopened);

    expect(reopened.alternativeDeliveryAddress).toBe('Leveringsvej 2');
    expect(summary.customer).toMatchObject({ company: 'AB Lauridsen', address: 'Kundevej 1', city: 'Kolding' });
    expect(summary.delivery).toMatchObject({ address_source: 'alternative', address: 'Leveringsvej 2', city: 'Vejle' });
  });

  it('renders the same editable override in step 2 and step 4', () => {
    const state = stateWithCustomer();
    state.useAlternativeDeliveryAddress = true;
    state.alternativeDeliveryAddress = 'QA leveringsadresse';
    const onChange = vi.fn();
    const { rerender } = render(<ConfiguratorDeliveryAddress state={state} variant="step2" T={(key) => t(key, 'da')} onChange={onChange} />);
    expect(screen.getByDisplayValue('QA leveringsadresse')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('QA leveringsadresse'), { target: { value: 'Ny leveringsadresse' } });
    expect(onChange).toHaveBeenCalledWith({ alternativeDeliveryAddress: 'Ny leveringsadresse' });

    rerender(<ConfiguratorDeliveryAddress state={state} variant="step4" T={(key) => t(key, 'da')} onChange={onChange} />);
    expect(screen.getByText('Leveringsadresse')).toBeTruthy();
    expect(screen.getByDisplayValue('QA leveringsadresse')).toBeTruthy();
  });

  it('keeps all nine locale labels available and removes delivery-address advice from comments', () => {
    for (const language of ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const) {
      expect(t('deliveryAddressSection', language)).not.toBe('deliveryAddressSection');
      expect(t('sameAsCustomerAddress', language)).not.toBe('sameAsCustomerAddress');
      expect(t('useAlternativeDeliveryAddress', language)).not.toBe('useAlternativeDeliveryAddress');
    }
    expect(t('altDeliveryInfo', 'da').toLowerCase()).not.toContain('leveringsadresse');
    expect(t('altDeliveryInfo', 'en').toLowerCase()).not.toContain('delivery address');
  });
});
