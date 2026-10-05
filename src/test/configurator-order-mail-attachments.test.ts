import { describe, expect, it } from 'vitest';
import { buildCustomerOrderMailPayload, buildInternalOrderMailPayload, INTERNAL_TIMAN_ORDER_EMAIL } from '@/lib/configuratorOrderMail';
import type { SubmittedOrderCsvFile } from '@/lib/submittedOrderCsv';

const base = {
  case_id: 'qa-case-1',
  order_number: 'O-7019',
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
  it('keeps the customer/dealer mail PDF-only with no internal BCC or CSV field', () => {
    const payload = buildCustomerOrderMailPayload(base, ['qa-recipient@example.invalid']);
    expect(payload.recipients).toEqual(['qa-recipient@example.invalid']);
    expect(payload.bcc).toEqual([]);
    expect(payload).not.toHaveProperty('attachments');
    expect(payload.pdf_filename).toBe('Ordre_O-7019.pdf');
    expect(payload.pdf_base64).toBe('cGRm');
    expect(JSON.stringify(payload)).not.toContain('csv_');
    expect(JSON.stringify(payload)).not.toContain(INTERNAL_TIMAN_ORDER_EMAIL);
  });

  it('sends PDF and CSV only to the internal Timan recipient', () => {
    const payload = buildInternalOrderMailPayload(base, csv);
    expect(payload.recipients).toEqual([INTERNAL_TIMAN_ORDER_EMAIL]);
    expect(payload.bcc).toEqual([]);
    expect(payload.attachments.map(item => item.kind)).toEqual(['order_confirmation', 'c5_nav_order_csv']);
    expect(payload.csv_filename).toBe(csv.filename);
    expect(payload.csv_matches_order_total).toBe(true);
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
