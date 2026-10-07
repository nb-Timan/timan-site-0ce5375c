# Timan Portal mail workflows

These are reproducible drafts for **TIMAN Portal — Quote Email** and
**TIMAN Portal — Order Email** in `https://timan.app.n8n.cloud`. They are
currently **unpublished**. Do not cut over Portal webhooks until the sender
identity is resolved and both flows pass final QA.

## Current Portal contract

- Quote: `src/pages/ConfiguratorPage.tsx` and
  `src/lib/assistantCanonicalActions.ts` build the PDF and POST quote data to
  `getQuoteWebhookUrl()`. Portal supplies `recipients`, `email_udfylder`,
  `email_modtager`, `quote_number`, and `pdf_base64`.
- Order: `src/pages/ConfiguratorPage.tsx` and
  `src/lib/configuratorOrderMail.ts` POST the customer/dealer order email with
  a PDF. After successful order submission, a **separate** internal CSV payload
  is sent for C5/NAV. The existing C5 workflow must remain separate and
  unchanged. On a future cutover, route that internal call to
  `/webhook/timan-c5-nav-order-export`.
- Both Portal URL helpers still point to the old personal n8n. No Portal,
  Supabase, or production webhook configuration was changed here.

`src/lib/configuratorPdf.ts` remains the only canonical Configurator document
layout. `src/lib/canonicalPdfDocument.ts` materializes that jsPDF result once.
The browser download, private storage upload and n8n `pdf_base64` attachment
all use those exact bytes. An unchanged retry reuses the in-memory canonical
document snapshot. The production path rejects the former QA-placeholder text,
and n8n also rejects short/non-canonical or placeholder PDFs.

The new paths are `/webhook/timan-portal-quote-email` and
`/webhook/timan-portal-order-email`. Test URLs use `/webhook-test/`.
Each workflow validates the document type, recipient list, number, and PDF;
keeps the Portal recipient as To; sets `sales@timan.dk` as BCC; attaches the
Portal PDF with its original filename; omits Sag ID, PDF URL, and n8n footer;
and responds only after the Outlook send step. Sequential duplicate requests
are checked using the Portal idempotency key (or a quote-derived key) and n8n
workflow static data. Concurrent exactly-once delivery has not been proven.
The email body follows the former Timan heading, intro, field order and
sign-off. Orders show a `Tilbudsnr.` line only when `source_quote_number` or
`quote_number` is a valid numeric T-number; direct orders omit the line.
The existing Portal order subject wins over the fallback old n8n subject.

## QA and blocker (2026-10-07)

Both drafts were tested with synthetic `T-QA-*` / `O-QA-*` references and
`nb@timan.dk` as the sole To recipient. Both full n8n test executions
succeeded and the received messages had one PDF attachment, the expected
body, and a `sales@timan.dk` BCC. The order message's downloaded EML
confirmed the actual `From: Order <order@timan.dk>` despite the Outlook node
being configured with `From: noreply@timan.dk`. The same visible sender
appears on the quote message. **This fails the required From-address gate.**
After the body update, three additional internal deliveries confirmed the
quote, order-from-quote and direct-order layouts. None displayed Sag ID,
PDF URL or an n8n footer; the direct order had no `Tilbudsnr.` line. Each
QA reference had one received message and one PDF attachment. The local
`node --test n8n/workflows/mail-body.test.mjs` suite covers all three cases,
rejection of malformed T-numbers and rejection of the former placeholder PDF.
Microsoft 365 inspection confirmed that `noreply@timan.dk` is an SMTP alias on
the shared mailbox `order@timan.dk`, not a separate mailbox. `nb@timan.dk`
already has **Send As** on `order@timan.dk`, but the tenant setting for sending
from aliases is disabled. Enable that exact Exchange Online setting, then
reconnect/test the existing n8n Outlook credential and inspect the received
`From` header. Do not add Full Access or create another mailbox for this gate.
Until the visible sender is `noreply@timan.dk`, leave both drafts unpublished
and keep Portal URLs unchanged.

## Rebuild and retest

1. Run `node n8n/workflows/build-mail-workflows.mjs` to regenerate the two
   JSON files. Import them in the new Timan n8n and bind
   **Microsoft Outlook account 2**. Do not copy credentials into the JSON.
2. Create a real QA-safe document in Configurator and keep the downloaded PDF.
   Open each n8n draft, click **Execute workflow**, then run with that file:
   `$env:TIMAN_QA_PDF_PATH='C:\path\Timan_Tilbud_T-xxxx_date.pdf'; $env:TIMAN_QA_DOCUMENT_NUMBER='T-xxxx'; node n8n/workflows/qa-mail-webhook.mjs quote`
   or the matching Order filename and `order` argument.
   For an order linked to a quote, also set
   `TIMAN_QA_SOURCE_QUOTE_NUMBER` to its valid T-number, then run
   `node n8n/workflows/qa-mail-webhook.mjs order A1B2C3D4 with-quote`.
   The script no longer creates a synthetic PDF. It sends only to
   `nb@timan.dk`, with sales BCC.
3. Inspect the n8n execution and received message: actual From, To, BCC,
   exactly one PDF, subject, body, and absence of forbidden fields. Retest
   duplicate handling and the independent C5 workflow before publishing.
4. Only after all gates pass, publish both workflows, update Portal URL helpers
   and the separate C5 target, run Portal QA and tests, then cut over.
