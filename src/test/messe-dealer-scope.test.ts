import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync('src/pages/messe/MesseFollowUpPage.tsx', 'utf8');
const serviceSource = readFileSync('src/lib/dealerAccountsService.ts', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260916075418_messe_scoped_dealer_assignment_read.sql',
  'utf8',
);

describe('Messe seller to dealer scope', () => {
  it('loads countries separately and dealer options only for the selected seller', () => {
    expect(pageSource).toContain('fetchMesseDealerCountries(),');
    expect(pageSource).toContain('fetchMesseDealerAccountsForSeller(responsibleSeller.id)');
    expect(pageSource).not.toContain('fetchDealerAccounts({ includeDeleted: false })');
    expect(pageSource).toContain("if (!dealerStillValid) setDealerNumber('');");
  });

  it('uses a minimal read-only RPC projection instead of the broad dealer account model', () => {
    expect(serviceSource).toContain('export interface MesseDealerAccount');
    expect(serviceSource).toContain("supabase.rpc('list_messe_dealer_accounts_for_seller'");
    expect(migration).toContain('returns table(\n  id uuid,\n  account_number text,\n  company_name text,\n  country text,');
    expect(migration).not.toContain('primary_contact_email');
    expect(migration).not.toContain('payment_terms');
    expect(migration).not.toContain('standard_machine_discount_pct');
  });

  it('allows only active internal Timan sellers and safe-empty results for invalid seller ids', () => {
    expect(migration).toContain("seller.portal_role::text in ('timan_seller', 'timan_backend')");
    expect(migration).toContain('if p_seller_id is null then\n    return;');
    expect(migration).toContain('and coalesce(da.is_deleted, false) = false');
    expect(migration).toContain('and coalesce(da.is_blocked, false) = false');
    expect(migration).toContain('and coalesce(da.is_active, true) = true');
  });

  it('keeps the privileged read model authenticated-only with an actor check', () => {
    expect(migration).toContain('security definer');
    expect(migration).toContain('actor.auth_user_id = (select auth.uid())');
    expect(migration).toContain("lower(coalesce(actor.portal_variant, '')) = 'messe'");
    expect(migration).toContain('revoke all on function public.list_messe_dealer_accounts_for_seller(uuid) from public, anon;');
    expect(migration).toContain('grant execute on function public.list_messe_dealer_accounts_for_seller(uuid) to authenticated;');
  });
});
