import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isMesseSelectablePartner } from '@/lib/partnerAccountTypes';

const pageSource = readFileSync('src/pages/messe/MesseFollowUpPage.tsx', 'utf8');
const serviceSource = readFileSync('src/lib/dealerAccountsService.ts', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260916113118_messe_partner_type_filter.sql',
  'utf8',
);

describe('Messe selectable partner accounts', () => {
  it.each([
    ['Forhandler', 'dealer'],
    ['Service Partner', 'service_partner'],
    ['Importør', 'importer'],
    ['Leverandør mv.', 'supplier'],
  ])('allows canonical %s accounts', (customerTypeLabel, partnerType) => {
    expect(isMesseSelectablePartner({ customer_type_label: customerTypeLabel })).toBe(true);
    expect(isMesseSelectablePartner({ partner_type: partnerType })).toBe(true);
  });

  it.each(['Forhandlerkunde', 'Slutkunde', 'Ansat person', 'Diverse'])('rejects non-partner account type %s', (customerTypeLabel) => {
    expect(isMesseSelectablePartner({ customer_type_label: customerTypeLabel, dealer_type: 'dealer' })).toBe(false);
  });

  it('uses the same allowlist in the UI, scoped RPC and forged-insert guards', () => {
    expect(pageSource).toContain('&& isMesseSelectablePartner(dealer)');
    expect(serviceSource).toContain('&& isMesseSelectablePartner(dealer)');
    expect(migration).toContain("private.messe_partner_type_for_account(da.id) in (\n      'dealer', 'service_partner', 'importer', 'supplier'\n    )");
    expect(migration).toContain("private.messe_partner_type_for_account(dealer.id) in (\n            'dealer', 'service_partner', 'importer', 'supplier'\n          )");
    expect(migration).toContain('Messe lead dealer must be an active selectable partner assigned to the selected Timan seller.');
  });

  it('keeps the read model narrow and exposes only the resolved partner type', () => {
    expect(migration).toContain('partner_type text,');
    expect(migration).not.toContain('primary_contact_email');
    expect(migration).not.toContain('payment_terms');
    expect(migration).not.toContain('standard_machine_discount_pct');
  });
});
