import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  filterMesseAssignableTimanSellersForCountry,
  isMesseSellerEligibleForCountry,
  dealerIsAssignedToTimanSeller,
  type SellerDirectoryEntry,
} from '@/lib/sellerDirectory';

const source = readFileSync('src/pages/messe/MesseFollowUpPage.tsx', 'utf8');
const countryMigration = readFileSync(
  'supabase/migrations/20260916070005_harden_messe_country_seller_trigger_context.sql',
  'utf8',
);
const dealerMigration = readFileSync(
  'supabase/migrations/20260916070801_enforce_messe_dealer_seller_assignment.sql',
  'utf8',
);

const sellers: SellerDirectoryEntry[] = [
  { id: 'akr', email: 'akr@timan.dk', initials: 'AKR', full_name: 'Alexander Kirschner', portal_role: 'timan_seller', company: null, phone: null },
  { id: 'jtn', email: 'jtn@timan.dk', initials: 'JTN', full_name: 'Jakob Nielsen', portal_role: 'timan_seller', company: null, phone: null },
  { id: 'em', email: 'em@timan.dk', initials: 'EM', full_name: 'Esben Madsen', portal_role: 'timan_seller', company: null, phone: null },
  { id: 'bp', email: 'bp@timan.dk', initials: 'BP', full_name: 'Birger Pedersen', portal_role: 'timan_backend', company: null, phone: null },
  { id: 'nb', email: 'nb@timan.dk', initials: 'NB', full_name: 'Nicolai', portal_role: 'timan_backend', company: null, phone: null },
  { id: 'dealer', email: 'dealer@example.test', initials: 'DLR', full_name: 'Dealer', portal_role: 'timan_dealer', company: null, phone: null },
];

const initialsFor = (country: string) => filterMesseAssignableTimanSellersForCountry(sellers, country)
  .map((seller) => seller.initials);

describe('Messe seller country eligibility', () => {
  it('shows only AKR and JTN for Germany, only EM for Denmark, and all active assignable sellers elsewhere', () => {
    expect(initialsFor('Germany')).toEqual(['AKR', 'JTN']);
    expect(initialsFor('Danmark')).toEqual(['EM']);
    expect(initialsFor('France')).toEqual(['AKR', 'JTN', 'EM', 'BP', 'NB']);
    expect(isMesseSellerEligibleForCountry(sellers[5], 'France')).toBe(false);
  });

  it('uses the same filtered options for dropdown resolution, dealer defaults, and submit validation', () => {
    expect(source).toContain('filterMesseAssignableTimanSellersForCountry(sellers, selectedLeadCountry)');
    expect(source).toContain("if (!sellerEmail || sellerOptions.some((seller) => seller.email === sellerEmail)) return;");
    expect(source).toContain("setSellerEmail('');");
    expect(source).toContain('resolveDealerAssignableTimanSeller(selectedDealer, sellerOptions)');
    expect(source).toContain('if (!validate() || !responsibleSeller) return;');
    expect(source).toContain('disabled={!responsibleSeller}');
    expect(source).toContain("f('chooseSellerFirst')");
  });

  it('keeps the dealer picker inside the selected seller assignment without accepting snapshot-only matches', () => {
    expect(dealerIsAssignedToTimanSeller({ assigned_seller_id: 'akr' }, sellers[0])).toBe(true);
    expect(dealerIsAssignedToTimanSeller({ assigned_seller_id: 'jtn' }, sellers[0])).toBe(false);
    expect(dealerIsAssignedToTimanSeller({ assigned_seller_id: null }, sellers[0])).toBe(false);
    expect(source).toContain('dealerIsAssignedToTimanSeller(dealer, responsibleSeller)');
    expect(source).toContain("if (!dealerNumber) return;");
    expect(source).toContain("if (!dealerStillValid) setDealerNumber('');");
  });

  it('enforces the country policy for forged Messe CRM lead payloads without widening roles or RLS', () => {
    expect(countryMigration).toContain('security definer');
    expect(countryMigration).toContain("lower(coalesce(actor.portal_variant, '')) = 'messe'");
    expect(countryMigration).toContain("actor.portal_role::text = 'exhibition_user'");
    expect(countryMigration).toContain("seller_role not in ('timan_seller', 'timan_backend')");
    expect(countryMigration).toContain("seller_initials not in ('AKR', 'JTN')");
    expect(countryMigration).toContain("seller_initials <> 'EM'");
    expect(countryMigration).toContain('create or replace function public.enforce_messe_lead_country_seller_eligibility()');
    expect(countryMigration).toContain('revoke all on function public.enforce_messe_lead_country_seller_eligibility() from public, anon, authenticated;');
    expect(dealerMigration).toContain('dealer.assigned_seller_id = new.owner_user_id');
    expect(dealerMigration).toContain('coalesce(dealer.is_deleted, false) = false');
    expect(dealerMigration).toContain('coalesce(dealer.is_blocked, false) = false');
    expect(dealerMigration).toContain('Messe lead dealer must be an active account assigned to the selected Timan seller.');
  });
});
