// Internal-only smoke test. Requires a real canonical Configurator PDF and an internal recipient.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const kind = process.argv[2];
if (!['quote', 'order'].includes(kind)) {
  throw new Error('Usage: TIMAN_QA_PDF_PATH=<canonical.pdf> node qa-mail-webhook.mjs quote|order [suffix] [with-quote]');
}
const withQuote = kind === 'order' && process.argv[4] === 'with-quote';
const pdfPath = process.env.TIMAN_QA_PDF_PATH;
if (!pdfPath) throw new Error('TIMAN_QA_PDF_PATH must point to a real Configurator download');
const pdfBytes = readFileSync(pdfPath);
if (!pdfBytes.subarray(0, 8).toString('latin1').startsWith('%PDF-')) throw new Error('TIMAN_QA_PDF_PATH is not a PDF');

const suffix = (process.argv[3] || randomUUID().slice(0, 8)).toUpperCase();
const ref = String(process.env.TIMAN_QA_DOCUMENT_NUMBER || '').trim();
if (!ref || !basename(pdfPath).includes(ref)) throw new Error('TIMAN_QA_DOCUMENT_NUMBER must match the canonical PDF filename');
const sourceQuoteNumber = withQuote ? String(process.env.TIMAN_QA_SOURCE_QUOTE_NUMBER || '').trim() : '';
if (withQuote && !/^T-\d+$/i.test(sourceQuoteNumber)) {
  throw new Error('TIMAN_QA_SOURCE_QUOTE_NUMBER must be a valid T-number for an order linked to a quote');
}
const payload = {
  case_id: `internal-qa-${suffix}`,
  document_type: kind === 'quote' ? 'Tilbud' : 'Ordre',
  mail_variant: kind === 'order' ? 'customer_order_confirmation' : undefined,
  quote_number: kind === 'quote' ? ref : '',
  source_quote_number: sourceQuoteNumber,
  order_number: kind === 'order' ? ref : '',
  idempotency_key: `internal-qa-${kind}-${suffix}`,
  firma: 'Timan intern QA',
  kontaktperson: 'Timan QA',
  telefon: '',
  email_udfylder: 'nb@timan.dk',
  email_modtager: 'nb@timan.dk',
  recipients: ['nb@timan.dk'],
  purchase_order_number: 'INTERN-QA',
  kommentar: withQuote || kind === 'quote' ? 'Kun intern test af mailflow' : '',
  pdf_url: 'https://example.invalid/secret-qa.pdf',
  subject: kind === 'order' ? 'Ny ordre fra Timan configurator - Timan intern QA' : undefined,
  pdf_filename: basename(pdfPath),
  pdf_mime_type: 'application/pdf',
  pdf_base64: pdfBytes.toString('base64'),
};
const response = await fetch(`https://timan.app.n8n.cloud/webhook-test/timan-portal-${kind}-email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});
console.log(JSON.stringify({ kind, variant: withQuote ? 'with-quote' : 'direct', ref, status: response.status, response: await response.text() }));
if (!response.ok) process.exitCode = 1;
