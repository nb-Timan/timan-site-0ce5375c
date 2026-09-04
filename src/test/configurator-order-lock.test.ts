import { describe, expect, it } from 'vitest';
import { isOrderRowSubmitted, isSavedConfigurationOrderLocked } from '@/lib/configurationsService';

describe('submitted configurator order lock', () => {
  it('keeps an active order draft with an O-number editable', () => {
    expect(isOrderRowSubmitted({
      document_type: 'order',
      case_type: 'order',
      case_status: 'aktiv',
      status: 'aktiv',
      order_number: 'O-7001',
      submitted_at: null,
      order_sent_at: null,
    })).toBe(false);
  });

  it('does not treat an order flow draft without an O-number as submitted', () => {
    expect(isOrderRowSubmitted({
      document_type: 'order',
      case_type: 'order',
      case_status: 'aktiv',
      status: 'aktiv',
      order_number: null,
      submitted_at: null,
      order_sent_at: null,
    })).toBe(false);
  });

  it('does not lock an order from a workflow status without submission evidence', () => {
    expect(isOrderRowSubmitted({
      document_type: 'order',
      case_status: 'ordre_afgivet',
      status: 'ordre_afgivet',
      submitted_at: null,
      order_sent_at: null,
    })).toBe(false);
  });

  it('locks a submitted order using canonical timestamps', () => {
    expect(isOrderRowSubmitted({
      document_type: 'order',
      order_number: 'O-7002',
      submitted_at: '2026-09-04T08:00:00.000Z',
      order_sent_at: '2026-09-04T08:00:00.000Z',
    })).toBe(true);
  });

  it('keeps quotes editable even when they have a sent timestamp', () => {
    expect(isSavedConfigurationOrderLocked({
      document_type: 'quote',
      case_type: 'quote',
      quote_number: 'T-4001',
      submitted_at: '2026-09-04T08:00:00.000Z',
      quote_sent_at: '2026-09-04T08:00:00.000Z',
      order_sent_at: null,
      order_number: null,
    })).toBe(false);
  });
});
