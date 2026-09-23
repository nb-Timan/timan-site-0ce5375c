import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { jsPDF } from 'jspdf';
import { clearPublishedConfiguratorPricesForTest, getAccessoriesFlat, getLocalizedName, replacePublishedConfiguratorPrices } from '@/data/machines';
import { t } from '@/data/translations';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { currentProductDescription, refreshConfiguratorProductDescriptions } from '@/lib/configuratorPricing';
import { finalizeConfiguratorPricingSnapshot, type SavedConfiguration } from '@/lib/configurationsService';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';
import { buildSubmittedOrderDocument, buildSubmittedOrderMailSummary } from '@/lib/submittedOrderConfirmation';
import { buildConfiguratorPdf } from '@/lib/configuratorPdf';
import ReadOnlyOrderConfirmationModal from '@/components/crm/ReadOnlyOrderConfirmationModal';
import type { Language, FlowType, ConfiguratorState } from '@/types/configurator';

const titles = {
  da: 'CS-200 Kombispreder med elektrisk regulering',
  de: 'CS-200 Kombi-Streuer mit elektrischer regelung.',
  en: 'CS-200 Combi Spreader with electrical regulation',
};
function publish(price = 58350) {
  replacePublishedConfiguratorPrices([{
    item_number: '725138', item_text_da: titles.da, item_text_de: titles.de, item_text_en: titles.en,
    identity_aliases: ['CS-200 Combi, for lad, el reg.'], price_dkk: price, price_eur: price / 7.46,
  }]);
}
function draft(language: Language = 'de', flowType: FlowType = 'quote'): ConfiguratorState {
  return {
    ...createEmptyConfiguratorState(language, flowType),
    machineConfigs: [{ id: 'qa', type: 'Timan 3330', qty: 1, configMode: 'shared', acc: ['725138'] }],
    paymentTerms: 'NET21', reqNumbers: { machine_1: 'QA-PO' }, date: '2026-10-20',
    deliveryMethod: 'send', manualDealerDiscountPct: 1,
  };
}
function pdfText(state: ConfiguratorState): string {
  const text: string[] = [];
  class CapturedPdf extends jsPDF {
    constructor(...options: ConstructorParameters<typeof jsPDF>) {
      super(...options);
      const renderText = this.text.bind(this);
      this.text = (...args: Parameters<jsPDF['text']>) => {
        text.push(Array.isArray(args[0]) ? args[0].join(' ') : args[0]);
        return renderText(...args);
      };
    }
  }
  const { calcResult } = buildSubmittedOrderDocument(state);
  buildConfiguratorPdf({
    jsPDF: CapturedPdf, state, calcResult, flowType: state.flowType,
    quoteNumber: 'T-QA', orderNumber: state.flowType === 'order' ? 'O-QA' : null,
    showPrices: true, uiLanguage: state.language, contentLanguage: state.language,
    T: key => t(key, state.language), TC: key => t(key, state.language),
  });
  return text.join(' ');
}

afterEach(() => { cleanup(); clearPublishedConfiguratorPricesForTest(); });

describe('Product Master commercial description propagation', () => {
  it.each(['da', 'de', 'en'] as const)('uses exactly the canonical %s title in new quote snapshots, PDF and mail', async language => {
    publish();
    const state = draft(language);
    expect(calculateConfiguration(state).lineItems.find(line => line.varenr === '725138')?.txt).toBe(`- ${titles[language]}`);
    const saved = await finalizeConfiguratorPricingSnapshot(state);
    expect(saved.pricingSnapshot?.names?.['725138']).toBe(titles[language]);
    expect(saved.pricingSnapshot?.lines?.find(line => line.itemNo === '725138')?.description).toBe(titles[language]);
    expect(buildQuoteContentSummary(saved).machines[0].units[0].accessories[0].name).toBe(titles[language]);
    expect(pdfText(saved)).toContain(titles[language]);
    expect(pdfText(saved)).not.toContain('Husk lad og vogn');
  });

  it('separates commercial identity from the existing enriched presentation catalog', async () => {
    publish();
    const accessory = getAccessoriesFlat('Timan 3330').find(item => item.varenr === '725138')!;
    expect(getLocalizedName(accessory.name, 'de')).toContain('Husk lad og vogn');
    expect(currentProductDescription('725138', 'de', `${titles.de} Marketing short description`)).toBe(titles.de);
    const saved = await finalizeConfiguratorPricingSnapshot(draft('de', 'order'));
    const document = buildSubmittedOrderDocument(saved);
    expect(document.lines.find(line => line.itemNo === '725138')?.description).toBe(titles.de);
    expect(buildSubmittedOrderMailSummary(saved).machines[0].units[0].accessories[0].name).toBe(titles.de);
    expect(pdfText(saved)).toContain(titles.de);
    render(<ReadOnlyOrderConfirmationModal order={{ id: 'qa', state_json: saved, order_number: 'O-QA' } as SavedConfiguration} onClose={vi.fn()} />);
    expect(screen.getByText(titles.de)).toBeTruthy();
    expect(screen.queryByText(/Husk lad og vogn/)).toBeNull();
  });

  it.each(['quote', 'order'] as const)('refreshes an explicit %s revision without repricing or changing Revision 1', async flowType => {
    publish();
    const revision1 = await finalizeConfiguratorPricingSnapshot(draft('de', flowType));
    const oldTitle = `${titles.de} Husk lad og vogn`;
    revision1.pricingSnapshot!.names!['725138'] = oldTitle;
    revision1.pricingSnapshot!.lines!.find(line => line.itemNo === '725138')!.description = oldTitle;
    const before = JSON.stringify(revision1);
    const oldPdf = pdfText(revision1);
    publish(999999);
    expect(await finalizeConfiguratorPricingSnapshot(revision1)).toEqual(revision1);
    const revision2 = await finalizeConfiguratorPricingSnapshot(refreshConfiguratorProductDescriptions(revision1));
    expect(revision2.pricingSnapshot?.names?.['725138']).toBe(titles.de);
    expect(pdfText(revision2)).not.toContain('Husk lad og vogn');
    expect(buildQuoteContentSummary(revision2).machines[0].units[0].accessories[0].name).toBe(titles.de);
    const { names: _oldNames, lines: oldLines, ...oldPricing } = revision1.pricingSnapshot!;
    const { names: _newNames, lines: newLines, ...newPricing } = revision2.pricingSnapshot!;
    expect(newPricing).toEqual(oldPricing);
    expect(newLines?.map(({ description: _description, ...line }) => line)).toEqual(oldLines?.map(({ description: _description, ...line }) => line));
    const { pricingSnapshot: _oldSnapshot, ...oldState } = revision1;
    const { pricingSnapshot: _newSnapshot, ...newState } = revision2;
    expect(newState).toEqual(oldState);
    expect(JSON.stringify(revision1)).toBe(before);
    expect(pdfText(revision1)).toBe(oldPdf);
    expect(buildSubmittedOrderDocument(revision1).lines.find(line => line.itemNo === '725138')?.description).toBe(oldTitle);
  });

  it('uses the existing DA fallback for missing published translations and retains unknown historical items', () => {
    replacePublishedConfiguratorPrices([{ item_number: '725138', item_text_da: titles.da, price_dkk: null, price_eur: null }]);
    expect(currentProductDescription('725138', 'de', 'Stale German suffix')).toBe(titles.da);
    expect(currentProductDescription('725138', 'en', 'Stale English suffix')).toBe(titles.da);
    expect(currentProductDescription('725138', 'it', 'Static Italian')).toBe(titles.da);
    expect(currentProductDescription('unknown', 'de', 'Historical custom item')).toBe('Historical custom item');
  });
});
