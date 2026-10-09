import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = () => readFileSync('src/lib/configurationsService.ts', 'utf8');
const page = () => readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');

describe('Configurator case to quote lifecycle', () => {
  it('saves an editable case without a T-number or frozen quote snapshot', () => {
    const code = service();
    const save = code.slice(code.indexOf('export async function saveConfiguration'), code.indexOf('export async function updateConfiguration'));
    expect(save).toContain('pricingSnapshot: undefined');
    expect(save).toContain('quote_number: null');
    expect(save).not.toContain("getNextCrmDocumentNumber('quote')");
    expect(save).not.toContain("activity_type: 'quote_created'");
  });

  it('creates the T-number and frozen snapshot at the explicit quote boundary', () => {
    const code = service();
    const ensure = code.slice(code.indexOf('export async function ensureReferenceNumbers'), code.indexOf('type StoredConfigurationPayload'));
    expect(ensure).toContain("getNextCrmDocumentNumber('quote')");
    expect(ensure).toContain('finalizeConfiguratorPricingSnapshot');
    expect(ensure).toContain("activity_type: 'quote_created'");
  });

  it('does not allocate a T-number by opening preview or switching editable flow', () => {
    const pageCode = page();
    const preview = pageCode.slice(pageCode.indexOf('const openConfirmation'), pageCode.indexOf('const downloadPdf'));
    expect(preview).not.toContain('ensureReferenceNumbers');

    const serviceCode = service();
    const flow = serviceCode.slice(serviceCode.indexOf('export async function updateConfigurationFlowType'), serviceCode.indexOf('/** Update configuration status'));
    expect(flow).not.toContain("getNextCrmDocumentNumber('quote')");
  });

  it('keeps later ordinary saves on the same case and reference', () => {
    const code = service();
    const update = code.slice(code.indexOf('export async function updateConfiguration'), code.indexOf('export async function updateConfigurationFlowType'));
    expect(update).not.toContain("getNextCrmDocumentNumber('quote')");
    expect(update).not.toContain('quote_number:');
    expect(update).toContain(".eq('id', id)");
  });
});
