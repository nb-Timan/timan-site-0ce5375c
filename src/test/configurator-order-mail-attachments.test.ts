import { describe, expect, it } from 'vitest';
import { buildCustomerOrderMailPayload, buildInternalOrderMailPayload, INTERNAL_TIMAN_ORDER_EMAIL } from '@/lib/configuratorOrderMail';
import type { SubmittedOrderCsvFile } from '@/lib/submittedOrderCsv';

const base = {
  case_id: 'qa-case-1',
  order_number: 'O-7019',
  quote_number: 'T-4010',
  firma: 'QA Dealer ApS',
  email_udfylder: 'qa-submitter@timan.dk',
  email_modtager: 'qa-recipient@example.invalid',
  revision_id: null,
  pdf_filename: 'Ordre_O-7019.pdf',
  pdf_mime_type: 'application/pdf',
  pdf_base64: 'cGRm',
};

const csv: SubmittedOrderCsvFile = {
  filename: 'Timan_Order_O-7019_2026-10-05.csv',
  mimeType: 'text/csv; charset=utf-8',
  delimiter: ';',
  encoding: 'UTF-8-BOM',
  content: '\uFEFFOrderNumber\r\nO-7019\r\n',
  base64: 'Y3N2',
  lineCount: 1,
  matchesOrderTotal: true,
};

describe('Configurator order mail attachment isolation', () => {
  it('keeps the customer/dealer mail PDF-only and adds the internal BCC', () => {
    const payload = buildCustomerOrderMailPayload(base, ['qa-recipient@example.invalid']);
    expect(payload.recipients).toEqual(['qa-recipient@example.invalid']);
    expect(payload.bcc).toEqual([INTERNAL_TIMAN_ORDER_EMAIL]);
    expect(payload.bcc_recipients).toEqual([INTERNAL_TIMAN_ORDER_EMAIL]);
    expect(payload.bccRecipients).toEqual([INTERNAL_TIMAN_ORDER_EMAIL]);
    expect(payload.subject).toBe('Ny ordre fra Timan configurator - QA Dealer ApS');
    expect(payload.email_udfylder).toBe('qa-submitter@timan.dk');
    expect(payload.email_modtager).toBe('qa-recipient@example.invalid');
    expect(payload).not.toHaveProperty('attachments');
    expect(payload.pdf_filename).toBe('Ordre_O-7019.pdf');
    expect(payload.pdf_base64).toBe('cGRm');
    expect(JSON.stringify(payload)).not.toContain('csv_');
  });

  it('sends only the CSV to the internal Timan recipient with a distinct subject', () => {
    const payload = buildInternalOrderMailPayload(base, csv);
    expect(payload.recipients).toEqual([INTERNAL_TIMAN_ORDER_EMAIL]);
    expect(payload.bcc).toEqual([]);
    expect(payload.mail_variant).toBe('internal_c5_nav');
    expect(payload.subject).toBe('C5/NAV CSV - Ordre O-7019 - QA Dealer ApS');
    expect(payload.attachments.map(item => item.kind)).toEqual(['c5_nav_order_csv']);
    expect(payload.csv_filename).toBe(csv.filename);
    expect(payload.csv_mime_type).toBe('text/csv; charset=utf-8');
    expect(payload.csv_base64).toBe(csv.base64);
    expect(payload.attachment_filename).toBe(csv.filename);
    expect(payload.attachment_mime_type).toBe(csv.mimeType);
    expect(payload.attachment_base64).toBe(csv.base64);
    expect(payload.csv_matches_order_total).toBe(true);
    expect(payload).not.toHaveProperty('pdf_filename');
    expect(payload).not.toHaveProperty('pdf_mime_type');
    expect(payload).not.toHaveProperty('pdf_base64');
    expect(Object.keys(payload).some(key => key.startsWith('pdf_'))).toBe(false);
    expect(payload.email_udfylder).toBe('qa-submitter@timan.dk');
    expect(payload.email_modtager).toBe(INTERNAL_TIMAN_ORDER_EMAIL);
    expect(payload.original_submitter_email).toBe('qa-submitter@timan.dk');
    expect(payload.external_recipient).toBe('qa-recipient@example.invalid');
    expect(payload.body).toContain('Oprettet af: qa-submitter@timan.dk');
    expect(payload.body).toContain('Ekstern modtager: qa-recipient@example.invalid');
  });

  it('uses stable audience-specific idempotency keys on retries', () => {
    const firstCustomer = buildCustomerOrderMailPayload(base, ['qa-recipient@example.invalid']);
    const retryCustomer = buildCustomerOrderMailPayload(base, ['qa-recipient@example.invalid']);
    const firstInternal = buildInternalOrderMailPayload(base, csv);
    const retryInternal = buildInternalOrderMailPayload(base, csv);

    expect(firstCustomer.idempotency_key).toBe(retryCustomer.idempotency_key);
    expect(firstInternal.idempotency_key).toBe(retryInternal.idempotency_key);
    expect(firstCustomer.idempotency_key).not.toBe(firstInternal.idempotency_key);
  });
});
