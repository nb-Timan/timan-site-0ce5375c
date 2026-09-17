import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const partnerMap = readFileSync('src/pages/misc/PartnerMapPage.tsx', 'utf8');
const dealerAccounts = readFileSync('src/lib/dealerAccountsService.ts', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260915080500_public_messe_partner_map_accounts.sql',
  'utf8',
);

describe('Messe public partner map data', () => {
  it('uses the canonical public map RPC for the Messe variant', () => {
    expect(partnerMap).toContain('isPublicMesseMapView ? fetchPublicPartnerMapAccounts() : fetchDealerAccounts({})');
    expect(dealerAccounts).toContain('supabase.rpc("list_public_partner_map_accounts")');
  });

  it('keeps the limited public map context on /messe even for Backend and Seller identities', () => {
    expect(partnerMap).toContain('const onMesseRoute = isMesseRouteContext(location.pathname);');
    expect(partnerMap).toContain('onMesseRoute ||');
    expect(partnerMap).toContain('const canSeeMachineLayer = !isPublicMesseMapView');
  });

  it('exposes only active canonical public partner types', () => {
    expect(migration).toContain("public.partner_account_kind(da.id) in ('dealer', 'service_partner', 'importer')");
    expect(migration).toContain('not coalesce(da.is_blocked, false)');
    expect(migration).toContain('not coalesce(da.is_deleted, false)');
  });

  it('does not grant direct dealer_accounts access to anonymous users', () => {
    expect(migration).toContain('grant execute on function public.list_public_partner_map_accounts() to anon, authenticated');
    expect(migration).not.toContain('grant select on public.dealer_accounts to anon');
  });
});
