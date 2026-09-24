import { describe, expect, it } from 'vitest';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { readFileSync } from 'node:fs';
import { configuratorCartLineDescription, configuratorLineDescription, configuratorLineQuantity, configuratorLineUnitPrice } from '@/lib/configuratorLinePresentation';
import { normalizeConfiguratorState } from '@/lib/configuratorState';
import { t } from '@/data/translations';

describe('configurator line presentation', () => {
  it('keeps canonical quantity, unit price, and total separate from the description', () => {
    const state = normalizeConfiguratorState({
      language: 'de',
      flowType: 'quote',
      machineConfigs: [{ id: 'm0', type: 'Timan 3330', qty: 1, configMode: 'shared', acc: ['730030', '720121', '720599'] }],
      accQty: { m0_720121: 2, m0_720599: 2 },
    });

    const result = calculateConfiguration(state);
    const machine = result.lineItems.find(line => line.isMachine)!;
    const arm = result.lineItems.find(line => line.varenr === '720121')!;
    const brush = result.lineItems.find(line => line.varenr === '720599')!;

    expect(configuratorLineQuantity(machine)).toBe(1);
    expect(arm.description).toBe('Seitenbesenarm rechts/links mit Wasserdüse');
    expect(arm.txt).not.toContain('x2');
    expect(configuratorLineQuantity(arm)).toBe(2);
    expect(configuratorLineUnitPrice(arm)).toBe(1235);
    expect(arm.price).toBe(2470);
    expect(brush.description).toBe('Bürste für Seitenbesen (Low noise)');
    expect(configuratorLineQuantity(brush)).toBe(2);
    expect(configuratorLineUnitPrice(brush)).toBe(125);
    expect(brush.price).toBe(250);
  });

  it('preserves a legitimate x2 in canonical product text', () => {
    expect(configuratorLineDescription({ txt: '- Legacy x2 suffix', description: 'Hydraulic x2 connector', quantity: 2, unitPrice: 10, price: 20, varenr: 'QA' }))
      .toBe('Hydraulic x2 connector');
    expect(configuratorCartLineDescription({ txt: '- Hydraulic x2 connector', description: 'Hydraulic x2 connector', quantity: 2, unitPrice: 10, price: 20, varenr: 'QA' }))
      .toBe('- Hydraulic x2 connector x2');
  });

  it('keeps the live cart compact while the confirmation keeps document columns', () => {
    const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    const liveCartStart = source.indexOf("{T('summaryTitle')}");
    const liveCart = source.slice(liveCartStart, source.indexOf('displayCalc!.discountDetails', liveCartStart));
    const confirmation = source.slice(source.indexOf('const buildConfirmationHtml'), source.indexOf('// Totals', source.indexOf('const buildConfirmationHtml')));

    expect(liveCart).toContain('configuratorCartLineDescription(item)');
    expect(liveCart).not.toContain("T('pdfQuantity')");
    expect(liveCart).not.toContain("T('pdfUnitPrice')");
    expect(liveCart).not.toContain("T('pdfLineTotal')");
    expect(liveCart).not.toContain('overflow-x-auto');
    expect(confirmation).toContain("TC('pdfQuantity')");
    expect(confirmation).toContain("TC('pdfUnitPrice')");
    expect(confirmation).toContain("TC('pdfLineTotal')");
  });

  it('localizes the five line-table headers for DA, DE, and EN', () => {
    expect(['pdfItemNo', 'confirmDescription', 'pdfQuantity', 'pdfUnitPrice', 'pdfLineTotal'].map(key => t(key, 'da')))
      .toEqual(['Varenr.', 'BESKRIVELSE', 'Stk.', 'Stk. pris', 'I alt']);
    expect(['pdfItemNo', 'confirmDescription', 'pdfQuantity', 'pdfUnitPrice', 'pdfLineTotal'].map(key => t(key, 'de')))
      .toEqual(['Art.-Nr.', 'BESCHREIBUNG', 'Stk.', 'Stückpreis', 'Gesamt']);
    expect(['pdfItemNo', 'confirmDescription', 'pdfQuantity', 'pdfUnitPrice', 'pdfLineTotal'].map(key => t(key, 'en')))
      .toEqual(['Item no.', 'DESCRIPTION', 'Qty.', 'Unit price', 'Total']);
  });
});
