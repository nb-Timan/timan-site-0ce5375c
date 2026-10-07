import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));

const buildMail = `
const p = $input.first().json.body ?? $input.first().json;
const kind = KIND;
const text = (v) => String(v ?? '').trim();
const escape = (v) => text(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const address = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
if (kind === 'order' && (p.mail_variant !== 'customer_order_confirmation' || p.document_type !== 'Ordre')) throw new Error('Expected customer order payload');
if (kind === 'quote' && (p.document_type !== 'Tilbud' || p.mail_variant === 'internal_c5_nav')) throw new Error('Expected quote payload');
const recipients = [...new Set((Array.isArray(p.recipients) ? p.recipients : []).map(v => text(v).toLowerCase()).filter(Boolean))];
if (!recipients.length || recipients.some(v => !address.test(v))) throw new Error('Valid Portal recipients required');
const submitter = text(p.email_udfylder);
const selectedRecipient = text(p.email_modtager);
const selectedRecipients = [...new Set(selectedRecipient.split(/[,;\\s]+/).map(v => text(v).toLowerCase()).filter(Boolean))];
if (!selectedRecipients.length || selectedRecipients.some(v => !address.test(v))) throw new Error('Valid selected recipient required');
if (recipients.length !== selectedRecipients.length || recipients.some(v => !selectedRecipients.includes(v))) {
  throw new Error('Portal recipients must exactly match selected recipient(s)');
}
const ref = text(kind === 'quote' ? p.quote_number : p.order_number);
if (!ref) throw new Error('Document number required');
const filename = text(p.pdf_filename);
if (!/^Timan_.+\\.pdf$/i.test(filename) || !filename.includes(ref)) throw new Error('Expected canonical Portal PDF filename');
const pdf = text(p.pdf_base64).replace(/^data:application\\/pdf;base64,/i, '');
if (!pdf.startsWith('JVBERi0') || !/^[A-Za-z0-9+/]+={0,2}$/.test(pdf)) throw new Error('Valid PDF base64 required');
const pdfBytes = Buffer.from(pdf, 'base64');
if (pdfBytes.length < 1000 || !pdfBytes.subarray(0, 8).toString('latin1').startsWith('%PDF-')) throw new Error('Canonical Portal PDF required');
const searchablePdf = pdfBytes.toString('latin1');
if (searchablePdf.includes('Timan internal QA only') || searchablePdf.includes('QA placeholder')) throw new Error('Placeholder PDF rejected');
if (p.pdf_mime_type && p.pdf_mime_type !== 'application/pdf') throw new Error('PDF MIME type mismatch');
const idempotencyKey = text(p.idempotency_key) || [kind, ref, text(p.revision_number), recipients.join(',')].join('|');
const sent = $getWorkflowStaticData('global').sent ?? {};
const alreadySent = Boolean(sent[idempotencyKey]);
const previousQuote = kind === 'order'
  ? [p.source_quote_number, p.quote_number].map(text).find(v => /^T-\\d+$/.test(v)) || ''
  : '';
const rows = [
  ...(kind === 'quote' ? [['Tilbudsnr.', ref]] : previousQuote ? [['Tilbudsnr.', previousQuote]] : []),
  ...(kind === 'order' ? [['Ordrenr.', ref]] : []),
  ['Dokumenttype', kind === 'quote' ? 'Tilbud' : 'Ordre'],
  ['Firma', p.firma],
  ['Kontaktperson', p.kontaktperson],
  ['Telefon', p.telefon],
  ['E-mail udfylder', submitter],
  ['E-mail modtager', selectedRecipient],
  ...(text(p.purchase_order_number) ? [['Indkøbsordre / PO', p.purchase_order_number]] : []),
  ['Kommentar', p.kommentar],
];
const heading = kind === 'quote' ? 'Tilbud fra Timan' : 'Tak for ordren';
const intro = kind === 'quote'
  ? 'Hermed fremsendes tilbuddet fra Timan konfiguratoren.'
  : 'Vi behandler den hurtigst muligt og vender tilbage med en ordrebekræftelse.';
const html = '<h2>' + heading + '</h2>\\n\\n<p>' + intro + '</p>\\n\\n<hr>\\n\\n' +
  rows.map(([label,value]) => '<p><b>' + escape(label) + ':</b> ' + escape(value) + '</p>').join('\\n') +
  '\\n\\n<br>\\n\\n<p>Venlig hilsen<br>Timan</p>';
const fallbackSubject = (kind === 'quote' ? 'Nyt tilbud' : 'Ny ordre') +
  ' fra Timan konfigurator' + (text(p.firma) ? ' - ' + text(p.firma) : '');
const subject = text(p.subject) || fallbackSubject;
return [{json:{to:recipients.join(','),bcc:'sales@timan.dk',subject,html,filename,idempotencyKey,alreadySent,send_required:alreadySent?'no':'yes',document_number:ref},
  binary:{pdf:{data:pdf,mimeType:'application/pdf',fileName:filename}}}];
`;

function workflow(kind) {
  const isQuote = kind === 'quote';
  const title = isQuote ? 'Quote' : 'Order';
  const path = isQuote ? 'timan-portal-quote-email' : 'timan-portal-order-email';
  const buildName = `Build ${title} Email`;
  const node = (name, type, typeVersion, position, parameters) => ({
    id: randomUUID(), name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters,
  });
  const nodes = [
    node('Portal Webhook', 'webhook', 2, [-500, 200], {httpMethod:'POST',path,responseMode:'responseNode',options:{}}),
    node(buildName, 'code', 2, [-250, 200], {jsCode:buildMail.replace('KIND', JSON.stringify(kind))}),
    node('Only Unsent', 'if', 2.2, [0, 200], {conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:randomUUID(),leftValue:'={{ $json.send_required }}',rightValue:'yes',operator:{type:'string',operation:'equals'}}],combinator:'and'},options:{}}),
    node('Send PDF via Outlook', 'microsoftOutlook', 2, [250, 100], {
      resource:'message',operation:'send',toRecipients:'={{ $json.to }}',subject:'={{ $json.subject }}',
      bodyContent:'={{ $json.html }}',additionalFields:{bodyContentType:'html',bccRecipients:'={{ $json.bcc }}',
        from:'noreply@timan.dk',attachments:{attachments:[{binaryPropertyName:'pdf'}]}},
    }),
    node('Mark Sent', 'code', 2, [500, 100], {jsCode:`const mail = $('${buildName}').first().json; const state = $getWorkflowStaticData('global'); state.sent ??= {}; state.sent[mail.idempotencyKey] = new Date().toISOString(); return [{json:{ok:true,document_number:mail.document_number,filename:mail.filename,already_sent:false}}];`}),
    node('Success Response', 'respondToWebhook', 1.4, [750, 100], {respondWith:'json',responseBody:'={{ $json }}',options:{}}),
    node('Duplicate Response', 'respondToWebhook', 1.4, [250, 350], {respondWith:'json',responseBody:'={{ { ok:true, already_sent:true, document_number:$json.document_number } }}',options:{}}),
  ];
  const link = (target) => ({node:target,type:'main',index:0});
  const connections = {
    'Portal Webhook':{main:[[link(buildName)]]},
    [buildName]:{main:[[link('Only Unsent')]]},
    'Only Unsent':{main:[[link('Send PDF via Outlook')],[link('Duplicate Response')]]},
    'Send PDF via Outlook':{main:[[link('Mark Sent')]]},
    'Mark Sent':{main:[[link('Success Response')]]},
  };
  return {name:`TIMAN Portal — ${title} Email`,nodes,connections,pinData:{},active:false,settings:{executionOrder:'v1',binaryMode:'separate'},tags:[]};
}

for (const kind of ['quote','order']) {
  writeFileSync(join(directory,`TIMAN-Portal-${kind}-email.json`),JSON.stringify(workflow(kind),null,2)+'\n');
}
