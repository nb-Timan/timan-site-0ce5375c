# Timan Portal mail workflows

These are the reproducible sources for the published **TIMAN Portal — Quote
Email** and **TIMAN Portal — Order Email** workflows in
`https://timan.app.n8n.cloud`.

## Current Portal contract

- Quote: `src/pages/ConfiguratorPage.tsx` and
  `src/lib/assistantCanonicalActions.ts` build the PDF and POST quote data to
  `getQuoteWebhookUrl()`. Portal supplies `recipients`, `email_udfylder`,
  `email_modtager`, `quote_number`, and `pdf_base64`.
- Order: `src/pages/ConfiguratorPage.tsx` and
  `src/lib/configuratorOrderMail.ts` POST the customer/dealer order email with
  a PDF. After successful order submission, a **separate** internal CSV payload
  is sent to the separately published C5/NAV workflow at
  `/webhook/timan-c5-nav-order-export`.
- Portal uses the Timan-owned production endpoints. The old personal Quote and
  Order webhooks are no longer called.

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

## QA and cutover (2026-10-07)

Initial QA used synthetic `T-QA-*` / `O-QA-*` references and
`nb@timan.dk` as the sole To recipient. Both full n8n test executions
succeeded and the received messages had one PDF attachment, the expected
body, and a `sales@timan.dk` BCC. The order message's downloaded EML
confirmed the actual `From: Order <order@timan.dk>` despite the Outlook node
being configured with `From: noreply@timan.dk`. The same visible sender
appeared on the quote message. **That initial test failed the required
From-address gate.**
After the body update, three additional internal deliveries confirmed the
quote, order-from-quote and direct-order layouts. None displayed Sag ID,
PDF URL or an n8n footer; the direct order had no `Tilbudsnr.` line. Each
QA reference had one received message and one PDF attachment. The local
`node --test n8n/workflows/mail-body.test.mjs` suite covers all three cases,
rejection of malformed T-numbers and rejection of the former placeholder PDF.
After Exchange sender identity was corrected, the final Quote and Order QA
confirmed the visible sender as
`Timan <noreply@timan.dk>`, the selected recipient, `sales@timan.dk` BCC, and
the canonical PDF attachment. Both workflows and the separate C5/NAV workflow
are published. Portal now calls the Timan-owned production endpoints.

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
4. After any future workflow update passes all gates, publish it and verify the
   three production endpoints before updating Portal.
