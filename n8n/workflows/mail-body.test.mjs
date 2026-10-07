import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const directory = fileURLToPath(new URL('.', import.meta.url));
const pdf = Buffer.from(`%PDF-1.4\n${'x'.repeat(1500)}\n%%EOF\n`).toString('base64');

function build(kind, overrides = {}) {
  const workflow = JSON.parse(readFileSync(join(directory, `TIMAN-Portal-${kind}-email.json`), 'utf8'));
  const code = workflow.nodes.find((node) => node.name === `Build ${kind === 'quote' ? 'Quote' : 'Order'} Email`).parameters.jsCode;
  const payload = {
    document_type: kind === 'quote' ? 'Tilbud' : 'Ordre',
    mail_variant: kind === 'order' ? 'customer_order_confirmation' : undefined,
    quote_number: kind === 'quote' ? 'T-QA-TEST' : '',
    source_quote_number: '',
    order_number: kind === 'order' ? 'O-QA-TEST' : '',
    firma: 'Timan QA',
    kontaktperson: 'Intern test',
    email_udfylder: 'nb@timan.dk',
    email_modtager: 'nb@timan.dk',
    recipients: ['nb@timan.dk'],
    kommentar: '',
    case_id: 'internal-qa-case',
    pdf_url: 'https://example.invalid/secret.pdf',
    pdf_filename: `Timan_${kind === 'quote' ? 'Tilbud_T-QA-TEST' : 'Ordre_O-QA-TEST'}_2026-10-07.pdf`,
    pdf_mime_type: 'application/pdf',
    pdf_base64: pdf,
    ...overrides,
  };
  const run = new Function('$input', '$getWorkflowStaticData', code);
  return run({ first: () => ({ json: { body: payload } }) }, () => ({ sent: {} }))[0];
}

function assertShared(mail) {
  assert.equal(mail.json.to, 'nb@timan.dk');
  assert.equal(mail.json.bcc, 'sales@timan.dk');
  assert.equal(mail.binary.pdf.fileName, mail.json.filename);
  assert.equal(mail.binary.pdf.mimeType, 'application/pdf');
  assert.equal(mail.binary.pdf.data, pdf);
  for (const forbidden of ['Sag ID', 'PDF URL', 'example.invalid', 'n8n', 'internal-qa-case']) {
    assert.equal(mail.json.html.includes(forbidden), false, forbidden);
  }
  assert.match(mail.json.html, /Venlig hilsen<br>Timan/);
}

test('quote keeps old heading, intro and quote number', () => {
  const mail = build('quote');
  assertShared(mail);
  assert.match(mail.json.html, /<h2>Tilbud fra Timan<\/h2>/);
  assert.match(mail.json.html, /Hermed fremsendes tilbuddet fra Timan konfiguratoren/);
  assert.match(mail.json.html, /Tilbudsnr\.:<\/b> T-QA-TEST/);
  assert.equal(mail.json.subject, 'Nyt tilbud fra Timan konfigurator - Timan QA');
});

test('order from a quote shows valid source quote before order number', () => {
  const mail = build('order', { source_quote_number: 'T-4011', quote_number: 'T-4000' });
  assertShared(mail);
  assert.match(mail.json.html, /<h2>Tak for ordren<\/h2>/);
  assert.match(mail.json.html, /Vi behandler den hurtigst muligt/);
  assert.ok(mail.json.html.indexOf('Tilbudsnr.') < mail.json.html.indexOf('Ordrenr.'));
  assert.match(mail.json.html, /Tilbudsnr\.:<\/b> T-4011/);
  assert.match(mail.json.html, /Ordrenr\.:<\/b> O-QA-TEST/);
  assert.equal(mail.json.subject, 'Ny ordre fra Timan konfigurator - Timan QA');
});

test('direct order hides the entire quote-number line', () => {
  const mail = build('order', { quote_number: '', source_quote_number: '' });
  assertShared(mail);
  assert.equal(mail.json.html.includes('Tilbudsnr.'), false);
  assert.match(mail.json.html, /Ordrenr\.:<\/b> O-QA-TEST/);
  assert.match(mail.json.html, /Kommentar:<\/b> <\/p>/);
});

test('malformed T-number does not appear on an order', () => {
  const mail = build('order', { quote_number: 'wrong', source_quote_number: 'T-OLD' });
  assert.equal(mail.json.html.includes('Tilbudsnr.'), false);
});

test('production workflow rejects the former QA placeholder PDF', () => {
  const placeholder = Buffer.from(`%PDF-1.4\n${'x'.repeat(1200)}Timan internal QA only\n%%EOF`).toString('base64');
  assert.throws(() => build('quote', { pdf_base64: placeholder }), /Placeholder PDF rejected/);
});
