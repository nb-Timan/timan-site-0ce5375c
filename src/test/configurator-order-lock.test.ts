import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildSubmittedOrderLeadWonPatch,
  buildQuoteSentLeadPatch,
  isOrderRowSubmitted,
  isSavedConfigurationOrderLocked,
} from '@/lib/configurationsService';

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

  it('locks legacy quote rows when canonical order submission timestamps exist', () => {
    expect(isSavedConfigurationOrderLocked({
      document_type: 'quote',
      case_type: 'quote',
      quote_number: 'T-4001',
      submitted_at: '2026-09-04T08:00:00.000Z',
      quote_sent_at: '2026-09-04T08:00:00.000Z',
      order_sent_at: null,
      order_number: null,
    } as Parameters<typeof isSavedConfigurationOrderLocked>[0])).toBe(true);
  });

  it('uses the canonical won patch when a linked lead is closed by order submission', () => {
    expect(buildSubmittedOrderLeadWonPatch()).toEqual({
      incomplete_from_configurator: false,
      pipeline_stage: 'Won',
      next_activity: 'Closed with order',
      probability: 100,
      status: 'closed',
    });
  });

  it('uses an idempotent open-lead patch when a linked quote is sent or re-sent', () => {
    expect(buildQuoteSentLeadPatch({ title: 'Hummelmühle 3330', quote_number: 'T-4002' })).toEqual({
      incomplete_from_configurator: false,
      pipeline_stage: 'Offer sent',
      next_activity: 'Offer sent to the customer',
      probability: 70,
      notes: 'Hummelmühle 3330\nTilbud afgivet via konfiguratoren — T-4002',
    });
  });

  it('keeps the submitted-order correction trigger callable without exposing the correction checker', () => {
    const migration = readFileSync(
      'supabase/migrations/20260904141735_fix_active_quote_line_save_correction_guard.sql',
      'utf8',
    );

    expect(migration).toContain('create or replace function public.prevent_submitted_configurator_order_changes()');
    expect(migration).toContain('security definer');
    expect(migration).toContain('if found and public.is_submitted_configurator_order(target) then');
    expect(migration).toContain('not public.has_active_submitted_configurator_order_correction(target.id)');
    expect(migration).toContain('revoke all on function public.prevent_submitted_configurator_order_changes() from public, anon, authenticated');
    expect(migration).not.toContain('grant execute on function public.has_active_submitted_configurator_order_correction');
  });
});
