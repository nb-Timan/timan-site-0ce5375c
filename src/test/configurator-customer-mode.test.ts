import { describe, expect, it } from 'vitest';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';
import {
  activeConfiguratorCustomerSnapshot,
  normalizeConfiguratorCustomerDraftState,
  replaceConfiguratorDealerCustomerData,
  selectConfiguratorCustomerMode,
  updateConfiguratorCustomerDraftField,
} from '@/lib/configuratorCustomerMode';

const manualCustomer = {
  firmanavn: 'Kunde A',
  kontaktperson: 'Peter Jensen',
  telefon: '12345678',
  emailRecipient: 'peter@example.test',
  address: 'Testvej 1',
  postalCode: '1234',
  city: 'Testby',
  country: 'Danmark',
};

const dealerCustomer = {
  firmanavn: 'Nabert Forst- und Gartentechnik',
  kontaktperson: 'Sascha Liebing',
  telefon: '+49 123',
  emailRecipient: 'sascha@example.test',
  address: 'Händlerweg 1',
  postalCode: '12345',
  city: 'Berlin',
  country: 'Tyskland',
};

describe('Configurator dealer and end-customer mode', () => {
  it('restores a manual customer draft after dealer mode is used', () => {
    let state = normalizeConfiguratorState({ ...createEmptyConfiguratorState(), ...manualCustomer });
    state = replaceConfiguratorDealerCustomerData(state, dealerCustomer, 'contact-nabert');
    state = selectConfiguratorCustomerMode(state, 'dealer');
    expect(state.firmanavn).toBe('Nabert Forst- und Gartentechnik');
    expect(state.dealerContactId).toBe('contact-nabert');

    state = selectConfiguratorCustomerMode(state, 'manual');
    expect(state).toMatchObject(manualCustomer);
    expect(state.dealerCustomerData).toEqual(dealerCustomer);
  });

  it('keeps the manual draft when the linked dealer and contact change', () => {
    let state = normalizeConfiguratorState({ ...createEmptyConfiguratorState(), ...manualCustomer });
    state = replaceConfiguratorDealerCustomerData(state, dealerCustomer, 'contact-a');
    state = replaceConfiguratorDealerCustomerData(state, {
      ...dealerCustomer,
      firmanavn: 'Dealer B',
      kontaktperson: 'Kontakt B',
      emailRecipient: 'b@example.test',
    }, 'contact-b');

    expect(activeConfiguratorCustomerSnapshot(normalizeConfiguratorCustomerDraftState(state))).toEqual(manualCustomer);
    state = selectConfiguratorCustomerMode(state, 'manual');
    expect(state).toMatchObject(manualCustomer);
    expect(state.dealerContactId).toBe('contact-b');
  });

  it('saves only the active manual snapshot after an edit', () => {
    let state = normalizeConfiguratorState({ ...createEmptyConfiguratorState(), ...manualCustomer });
    state = replaceConfiguratorDealerCustomerData(state, dealerCustomer, 'contact-nabert');
    state = selectConfiguratorCustomerMode(state, 'dealer');
    state = selectConfiguratorCustomerMode(state, 'manual');
    state = updateConfiguratorCustomerDraftField(state, 'telefon', '87654321');

    expect(state.telefon).toBe('87654321');
    expect(state.manualCustomerDraft.telefon).toBe('87654321');
    expect(state.dealerCustomerData.telefon).toBe('+49 123');
  });

  it('normalizes legacy saved configurations as manual customer snapshots', () => {
    const legacy = normalizeConfiguratorState({ ...createEmptyConfiguratorState(), ...manualCustomer });

    expect(legacy.customerMode).toBe('manual');
    expect(legacy.manualCustomerDraft).toEqual(manualCustomer);
    expect(legacy.dealerContactId).toBe('');
  });

  it('reopens a persisted dealer-mode configuration with its selected contact', () => {
    let state = normalizeConfiguratorState({ ...createEmptyConfiguratorState(), ...manualCustomer });
    state = replaceConfiguratorDealerCustomerData(state, dealerCustomer, 'contact-nabert');
    state = selectConfiguratorCustomerMode(state, 'dealer');

    const reopened = normalizeConfiguratorState(state);
    expect(reopened.customerMode).toBe('dealer');
    expect(reopened.dealerContactId).toBe('contact-nabert');
    expect(reopened).toMatchObject(dealerCustomer);
    expect(reopened.manualCustomerDraft).toEqual(manualCustomer);
  });

  it('keeps an edited dealer recipient email in the active configuration without mutating the contact snapshot', () => {
    const originalContact = {
      ...dealerCustomer,
      emailRecipient: 'm.schulte@wilmers-kommunaltechnik.de',
    };
    const manualDraft = {
      ...manualCustomer,
      emailRecipient: 'manual@example.com',
    };

    let state = normalizeConfiguratorState({ ...createEmptyConfiguratorState(), ...manualDraft });
    state = replaceConfiguratorDealerCustomerData(state, originalContact, 'michael-schulte');
    state = selectConfiguratorCustomerMode(state, 'dealer');
    state = updateConfiguratorCustomerDraftField(state, 'emailRecipient', 'purchase@wilmers-kommunaltechnik.de');

    expect(state.emailRecipient).toBe('purchase@wilmers-kommunaltechnik.de');
    expect(state.dealerCustomerData?.emailRecipient).toBe('purchase@wilmers-kommunaltechnik.de');
    expect(state.manualCustomerDraft?.emailRecipient).toBe('manual@example.com');
    expect(originalContact.emailRecipient).toBe('m.schulte@wilmers-kommunaltechnik.de');

    const reopened = normalizeConfiguratorState(state);
    expect(reopened.emailRecipient).toBe('purchase@wilmers-kommunaltechnik.de');
  });

  it('refreshes the recipient email from the newly selected dealer contact', () => {
    const firstContact = {
      ...dealerCustomer,
      emailRecipient: 'm.schulte@wilmers-kommunaltechnik.de',
    };
    const secondContact = {
      ...dealerCustomer,
      kontaktperson: 'Sascha Becker',
      emailRecipient: 's.becker@wilmers-kommunaltechnik.de',
    };

    let state = normalizeConfiguratorState({ ...createEmptyConfiguratorState(), ...manualCustomer });
    state = replaceConfiguratorDealerCustomerData(state, firstContact, 'michael-schulte');
    state = selectConfiguratorCustomerMode(state, 'dealer');
    state = updateConfiguratorCustomerDraftField(state, 'emailRecipient', 'purchase@wilmers-kommunaltechnik.de');
    state = replaceConfiguratorDealerCustomerData(state, secondContact, 'sascha-becker');

    expect(state.dealerContactId).toBe('sascha-becker');
    expect(state.emailRecipient).toBe('s.becker@wilmers-kommunaltechnik.de');
    expect(state.dealerCustomerData?.emailRecipient).toBe('s.becker@wilmers-kommunaltechnik.de');
    expect(state.manualCustomerDraft).toEqual(manualCustomer);
  });
});
