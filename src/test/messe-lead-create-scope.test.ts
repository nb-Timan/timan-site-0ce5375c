import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260916083853_messe_lead_insert_scope.sql',
  'utf8',
);
const createdLeadSelectMigration = readFileSync(
  'supabase/migrations/20260916090259_messe_lead_created_select_scope.sql',
  'utf8',
);
const countrySellerMigration = readFileSync(
  'supabase/migrations/20260916070801_enforce_messe_dealer_seller_assignment.sql',
  'utf8',
);

describe('Messe lead create scope', () => {
  it('lets an active Messe actor create only a canonical Messe lead', () => {
    expect(migration).toContain('create policy crm_leads_insert_messe_scoped');
    expect(migration).toContain("lower(coalesce(actor.portal_variant, '')) = 'messe'");
    expect(migration).toContain("actor.portal_role::text = 'exhibition_user'");
    expect(migration).toContain("lower(trim(coalesce(trade_fair, ''))) in ('messe / exhibition', 'messe / udstilling')");
  });

  it('requires the same active internal seller and dealer assignment as the Messe picker', () => {
    expect(migration).toContain("seller.portal_role::text in ('timan_seller', 'timan_backend')");
    expect(migration).toContain('dealer.assigned_seller_id = crm_leads.owner_user_id');
    expect(migration).toContain('coalesce(dealer.is_active, true) = true');
    expect(migration).toContain('coalesce(dealer.is_deleted, false) = false');
    expect(migration).toContain('coalesce(dealer.is_blocked, false) = false');
  });

  it('keeps country eligibility in the existing scoped trigger', () => {
    expect(countrySellerMigration).toContain("seller_initials not in ('AKR', 'JTN')");
    expect(countrySellerMigration).toContain("seller_initials <> 'EM'");
    expect(countrySellerMigration).toContain('Messe lead dealer must match the selected country.');
  });

  it('returns only the Messe actor\'s own created lead for INSERT ... RETURNING', () => {
    expect(createdLeadSelectMigration).toContain('create policy crm_leads_select_messe_created');
    expect(createdLeadSelectMigration).toContain('actor.id = crm_leads.created_by_user_id');
    expect(createdLeadSelectMigration).toContain('actor.auth_user_id = (select auth.uid())');
    expect(createdLeadSelectMigration).toContain("lower(coalesce(actor.portal_variant, '')) = 'messe'");
    expect(createdLeadSelectMigration).toContain("lower(trim(coalesce(crm_leads.trade_fair, ''))) in ('messe / exhibition', 'messe / udstilling')");
  });
});
