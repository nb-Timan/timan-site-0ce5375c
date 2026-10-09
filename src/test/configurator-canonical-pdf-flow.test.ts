import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
const assistant = readFileSync('src/lib/assistantCanonicalActions.ts', 'utf8');

describe('Configurator canonical PDF send flow', () => {
  it.each(['quote', 'order'] as const)('%s uses the one materialized document for both destinations', () => {
    expect(source).toContain('const canonicalPdf = cachedPdf.documentFile;');
    expect(source).toContain('downloadCanonicalPdfDocument(canonicalPdf);');
    expect(source).toContain('const pdfBase64 = canonicalPdf.base64;');
    expect(source).toContain('const pdfBlob = canonicalPdf.blob;');
    expect(source).toContain('pdf_base64: pdfBase64');
    expect(source).not.toContain("pdf.output('datauristring')");
    expect(source).not.toContain("pdf.output('blob')");
    expect(source).not.toContain('pdf.save(pdfFilename)');
  });

  it('keeps retry protection tied to the complete canonical document snapshot', () => {
    expect(source).toContain('const pdfCacheKey = JSON.stringify({');
    expect(source).toContain('state: documentState');
    expect(source).toContain('calcResult: documentCalc');
    expect(source).toContain('resolveCanonicalPdfDocument(canonicalPdfCacheRef.current, pdfCacheKey');
    expect(source).toContain('canonicalPdfCacheRef.current = cachedPdf');
  });

  it('reserves a new quote number before building the canonical PDF and filename', () => {
    const ensureQuote = source.indexOf("if (activeCaseId && effectiveFlowType === 'quote' && !activeQuoteNumber)");
    const buildFilename = source.indexOf('const pdfFilename = buildConfiguratorPdfFilename({');
    const buildPdf = source.indexOf('const pdf = buildConfiguratorPdf({');
    expect(ensureQuote).toBeGreaterThan(-1);
    expect(ensureQuote).toBeLessThan(buildFilename);
    expect(ensureQuote).toBeLessThan(buildPdf);
    expect(source.slice(ensureQuote, buildFilename)).toContain('if (!refs.quote_number)');
  });

  it('uses the same one-pass materialization in Assistant quote actions', () => {
    expect(assistant).toContain('materializeCanonicalPdfDocument(pdf, filename)');
    expect(assistant).not.toContain("pdf.output('datauristring')");
    expect(assistant).not.toContain("pdf.output('blob')");
  });

  it('keeps customer PDF and internal C5 CSV as separate payloads', () => {
    const customerPayload = source.indexOf('buildCustomerOrderMailPayload(baseOrderWebhookPayload, recipients)');
    const csvPayload = source.indexOf('buildInternalOrderMailPayload(baseOrderWebhookPayload, csv)');
    expect(customerPayload).toBeGreaterThan(-1);
    expect(csvPayload).toBeGreaterThan(customerPayload);
  });
});
