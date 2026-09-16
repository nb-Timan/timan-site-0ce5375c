import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getSubmittedOrderContactDetails,
  validateSubmittedOrderContactDetails,
} from '@/lib/configurationsService';
import { normalizeConfiguratorState } from '@/lib/configuratorState';

const migrationPath = 'supabase/migrations/20260916073831_fix_backend_submitted_order_contact_email_validation.sql';
const initialMigrationPath = 'supabase/migrations/20260916072911_backend_submitted_order_contact_edit.sql';

describe('Backend submitted-order contact edit', () => {
  it('uses the Configurator snapshot fields and keeps the new administrative fields on reload', () => {
    const state = normalizeConfiguratorState({
      firmanavn: 'Existing customer',
      kontaktperson: 'Existing contact',
      telefon: '+45 12345678',
      email: 'contact@example.test',
      address: 'Example Street 1',
      postalCode: '9000',
      city: 'Aalborg',
      country: 'Danmark',
      comment: 'Existing comment',
      alternativeDeliveryAddress: 'Warehouse 2',
      purchaseOrderNumber: 'PO-100',
      date: '2026-08-14',
    });

    expect(getSubmittedOrderContactDetails(state)).toEqual({
      firmanavn: 'Existing customer',
      kontaktperson: 'Existing contact',
      telefon: '+45 12345678',
      email: 'contact@example.test',
      address: 'Example Street 1',
      postalCode: '9000',
      city: 'Aalborg',
      country: 'Danmark',
      comment: 'Existing comment',
      alternativeDeliveryAddress: 'Warehouse 2',
      purchaseOrderNumber: 'PO-100',
      date: '2026-08-14',
    });
  });

  it('keeps the same required contact validation as the Configurator order flow', () => {
    const valid = getSubmittedOrderContactDetails(normalizeConfiguratorState({
      firmanavn: 'Customer', kontaktperson: 'Contact', email: 'contact@example.test',
    }));
    expect(validateSubmittedOrderContactDetails(valid)).toBeNull();
    expect(validateSubmittedOrderContactDetails({ ...valid, email: 'not-an-email' })).toContain('gyldig');
    expect(validateSubmittedOrderContactDetails({ ...valid, kontaktperson: '' })).toContain('kontaktperson');
  });

  it('prefills an older order contact address from the existing recipient fallback', () => {
    expect(getSubmittedOrderContactDetails(normalizeConfiguratorState({
      email: '', emailRecipient: 'historic-contact@example.test',
    })).email).toBe('historic-contact@example.test');
  });

  it('keeps the server path limited to contact details and requested delivery date', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const rpc = migration.slice(migration.indexOf('create or replace function public.update_submitted_order_contact_details'));

    expect(rpc).toContain('if not public.is_timan_backend() then');
    expect(rpc).toContain('security invoker');
    expect(rpc).toContain("'firmanavn', company_name");
    expect(rpc).toContain("'alternativeDeliveryAddress'");
    expect(rpc).toContain("'purchaseOrderNumber'");
    expect(rpc).toContain('set state_json = next_state');
    expect(rpc).toContain('delivery_date = requested_delivery_date');
    expect(rpc).toContain("set_config('app.submitted_order_contact_edit', target.id::text, true)");
    expect(rpc).not.toContain('assigned_seller_id =');
    expect(rpc).not.toContain('dealer_account_id =');
    expect(rpc).not.toContain('order_number =');
    expect(rpc).not.toContain('order_sent_at =');
    expect(rpc).not.toContain('submitted_at =');
    expect(rpc).not.toContain('total_price =');
    expect(rpc).not.toContain('payment_terms =');
  });

  it('keeps submitted-order protection and blocks anonymous callers', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const initialMigration = readFileSync(initialMigrationPath, 'utf8');

    expect(initialMigration).toContain("current_setting('app.submitted_order_contact_edit', true) = old.id::text");
    expect(initialMigration).toContain("raise exception 'Submitted configurator orders are read-only'");
    expect(migration).toContain('revoke all on function public.update_submitted_order_contact_details(uuid, jsonb) from public, anon');
    expect(migration).toContain('grant execute on function public.update_submitted_order_contact_details(uuid, jsonb) to authenticated');
    expect(migration).toContain("'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'");
  });

  it('uses the effective portal role and the dedicated contact editor, not ownership editing', () => {
    const page = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');
    const modal = readFileSync('src/components/crm/EditOrderContactModal.tsx', 'utf8');

    expect(page).toContain("const canEditOrderContacts = portalRole === 'timan_backend' && mode === 'order';");
    expect(page).toContain('EditOrderContactModal');
    expect(page).not.toContain('EditOrderOwnershipModal');
    expect(modal).toContain('loadSubmittedOrderContactDetails');
    expect(modal).toContain('updateSubmittedOrderContactDetails');
    expect(modal).toContain('Redigér ordre');
  });
});
