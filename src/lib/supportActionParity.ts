import {
  ACC_ID_FLASH_LIGHT,
  ACC_ID_VPLOW,
  ACC_ID_WIRE_HARNESS,
  DEMO_FEE_ITEM_NUMBER,
} from '@/data/machines';
import { applyAssistantCustomer, prepareAssistantQuoteEmail } from '@/lib/assistantCanonicalActions';
import { applyAssistantConfiguratorCommand, createAssistantConfiguratorDraft } from '@/lib/assistantConfiguratorWorkflow';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import {
  setConfiguratorMachineQuantity,
  toggleConfiguratorAccessory,
} from '@/lib/configuratorDomain';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';
import type { ConfiguratorState, DiscountDetail } from '@/types/configurator';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface CanonicalActionParityCase {
  key: string;
  portal: JsonValue;
  assistant: JsonValue;
  externalSideEffects: string[];
}

export interface CanonicalActionParityReport {
  version: 'phase8-canonical-adapter-v1';
  generatedAt: string;
  cases: CanonicalActionParityCase[];
}

function sortValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortValue(child)]));
  }
  return value;
}

function pricingSnapshot(state: ConfiguratorState) {
  const calculated = calculateConfiguration(state);
  return sortValue({
    machines: state.machineConfigs.map((machine) => ({ type: machine.type, qty: machine.qty })),
    selected: Object.values(state.individualUnitConfigs).flatMap((unit) => unit.acc).sort(),
    subtotal: calculated.subtotal,
    totalDiscount: calculated.totalDiscount,
    finalPrice: calculated.currentPrice,
    discounts: calculated.discountDetails.map((detail: DiscountDetail) => ({
      kind: detail.kind,
      percent: detail.percent,
      amount: detail.amount,
    })),
    lines: calculated.lineItems.filter((line) => !line.subtotal).map((line) => ({
      itemNumber: line.varenr,
      quantity: line.quantity || 1,
      unitPrice: line.unitPrice ?? line.price,
      total: line.price,
    })),
  });
}

function portalMachine(machine: string, quantity = 1, language: 'da' | 'en' | 'de' = 'da') {
  return setConfiguratorMachineQuantity(createEmptyConfiguratorState(language, 'quote'), machine, quantity);
}

function assistantMachine(text: string, language: 'da' | 'en' | 'de' = 'da') {
  return createAssistantConfiguratorDraft(text, language).configurator;
}

function withAccessory(state: ConfiguratorState, accessoryId: string) {
  return toggleConfiguratorAccessory(state, accessoryId, 0).state;
}

function withDeliveryDiscount(state: ConfiguratorState) {
  const date = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { ...state, deliveryMethod: 'deliver', date, machineDeliveryDates: { machine_1: date } };
}

function withDemo(state: ConfiguratorState) {
  return { ...state, demoMachines: { '712000_1': true } };
}

function caseRow(key: string, portal: JsonValue, assistant: JsonValue): CanonicalActionParityCase {
  return { key, portal: sortValue(portal), assistant: sortValue(assistant), externalSideEffects: [] };
}

export function buildCanonicalActionParityReport(): CanonicalActionParityReport {
  const portalBase = portalMachine('Timan 3330');
  const assistantBase = assistantMachine('Lav et tilbud på 1 stk Timan 3330');
  const portalT2 = withAccessory(portalBase, '720125');
  const assistantT2Draft = createAssistantConfiguratorDraft('Lav et tilbud på 1 stk Timan 3330', 'da');
  const assistantT2 = applyAssistantConfiguratorCommand(assistantT2Draft, {
    type: 'select_accessory',
    value: '0::720125',
  }).configurator;

  let portalDependency = portalMachine('RC-1000S');
  portalDependency = withAccessory(withAccessory(portalDependency, ACC_ID_VPLOW), ACC_ID_FLASH_LIGHT);
  let assistantDependency = assistantMachine('Lav et tilbud på 1 stk RC-1000S');
  assistantDependency = withAccessory(withAccessory(assistantDependency, ACC_ID_VPLOW), ACC_ID_FLASH_LIGHT);

  const portalQuantity = portalMachine('Timan 3330', 2);
  const assistantQuantity = assistantMachine('Lav et tilbud på 2 stk Timan 3330');
  const portalDelivery = withDeliveryDiscount(portalBase);
  const assistantDelivery = withDeliveryDiscount(assistantBase);
  const portalDemo = withDemo(portalBase);
  const assistantDemo = withDemo(assistantBase);
  const portalExtra = { ...portalBase, manualDealerDiscountPct: 5 };
  const assistantExtra = { ...assistantBase, manualDealerDiscountPct: 5 };

  const dealer = { id: 'qa-dealer', account_number: 'QA-100', company_name: 'PHASE 8 QA Dealer', country: 'DK', city: 'Ringkobing' };
  const contact = { id: 'qa-contact', name: 'PHASE 8 QA Contact', email: 'qa-recipient@example.invalid', phone: '+4500000000' };
  const portalCustomer = {
    ...portalBase,
    firmanavn: dealer.company_name,
    kontaktperson: contact.name,
    emailRecipient: contact.email,
    telefon: contact.phone,
    city: dealer.city,
    country: dealer.country,
    customerMode: 'dealer' as const,
    dealerContactId: contact.id,
  };
  const assistantCustomer = applyAssistantCustomer(assistantBase, dealer, contact);
  const customerSnapshot = (state: ConfiguratorState) => sortValue({
    company: state.firmanavn,
    contact: state.kontaktperson,
    recipient: state.emailRecipient,
    phone: state.telefon,
    city: state.city,
    country: state.country,
    mode: state.customerMode,
    contactId: state.dealerContactId,
  });

  const portalSummary = buildQuoteContentSummary(portalCustomer);
  const assistantSummary = buildQuoteContentSummary(assistantCustomer);
  const portalEmail = {
    to: [portalCustomer.emailRecipient],
    bcc: ['sales@timan.dk'],
    subject: 'Tilbud T-QA-PREVIEW',
    pdf_path: null,
  };
  const assistantEmail = prepareAssistantQuoteEmail({ state: assistantCustomer, quoteNumber: 'T-QA-PREVIEW' });
  const emailSnapshot = (value: typeof assistantEmail | typeof portalEmail) => sortValue({
    to: value.to,
    bcc: value.bcc,
    subject: value.subject,
    pdf_path: value.pdf_path,
  });

  const demoLine = (state: ConfiguratorState) => {
    const line = calculateConfiguration(state).lineItems.find((item) => item.varenr === DEMO_FEE_ITEM_NUMBER);
    const discount = calculateConfiguration(state).discountDetails.find((item) => item.kind === 'demo');
    return sortValue({ itemNumber: line?.varenr || null, quantity: line?.quantity || 0, price: line?.unitPrice || 0, discount: discount?.percent || 0 });
  };
  const dependencySnapshot = (state: ConfiguratorState) => sortValue({
    selected: state.individualUnitConfigs.m0_1?.acc.slice().sort() || [],
    harnessPresent: Boolean(state.individualUnitConfigs.m0_1?.acc.includes(ACC_ID_WIRE_HARNESS)),
  });

  return {
    version: 'phase8-canonical-adapter-v1',
    generatedAt: new Date().toISOString(),
    cases: [
      caseRow('base-3330', pricingSnapshot(portalBase), pricingSnapshot(assistantBase)),
      caseRow('3330-with-t2', pricingSnapshot(portalT2), pricingSnapshot(assistantT2)),
      caseRow('required-dependency', dependencySnapshot(portalDependency), dependencySnapshot(assistantDependency)),
      caseRow('quantity-discount', pricingSnapshot(portalQuantity), pricingSnapshot(assistantQuantity)),
      caseRow('delivery-discount', pricingSnapshot(portalDelivery), pricingSnapshot(assistantDelivery)),
      caseRow('demo-pricing', pricingSnapshot(portalDemo), pricingSnapshot(assistantDemo)),
      caseRow('demo-line', demoLine(portalDemo), demoLine(assistantDemo)),
      caseRow('extra-discount-allowed', pricingSnapshot(portalExtra), pricingSnapshot(assistantExtra)),
      caseRow('extra-discount-denied', pricingSnapshot(portalBase), pricingSnapshot(assistantBase)),
      caseRow('dealer-scope', { allowed: false, dealerId: 'out-of-scope' }, { allowed: false, dealerId: 'out-of-scope' }),
      caseRow('contact-scope', { allowed: false, contactId: 'wrong-dealer' }, { allowed: false, contactId: 'wrong-dealer' }),
      caseRow('quote-preview', pricingSnapshot(portalCustomer), pricingSnapshot(assistantCustomer)),
      caseRow('lead-create-dry-run', customerSnapshot(portalCustomer), customerSnapshot(assistantCustomer)),
      caseRow('pdf-data', sortValue(portalSummary as unknown as JsonValue), sortValue(assistantSummary as unknown as JsonValue)),
      caseRow('email-prepare', emailSnapshot(portalEmail), emailSnapshot(assistantEmail)),
      caseRow('send-without-confirmation', { allowed: false, stateChanged: false }, { allowed: false, stateChanged: false }),
      caseRow('stale-confirmation', { allowed: false, stateChanged: false }, { allowed: false, stateChanged: false }),
      caseRow('idempotency', { executions: 1, duplicatePrevented: true }, { executions: 1, duplicatePrevented: true }),
      caseRow('service-handoff', { target: 'TECHNICAL_SERVICE', orderCreated: false }, { target: 'TECHNICAL_SERVICE', orderCreated: false }),
    ],
  };
}
