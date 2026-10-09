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
const insertPolicyVisibilityMigration = readFileSync(
  'supabase/migrations/20260916094202_fix_messe_lead_insert_policy_visibility.sql',
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

  it('validates the same active internal seller and dealer assignment without exposing their rows to Messe', () => {
    expect(insertPolicyVisibilityMigration).toContain('create schema if not exists private;');
    expect(insertPolicyVisibilityMigration).toContain('security definer');
    expect(insertPolicyVisibilityMigration).toContain('private.can_messe_actor_assign_crm_lead(');
    expect(insertPolicyVisibilityMigration).toContain("seller.portal_role::text in ('timan_seller', 'timan_backend')");
    expect(insertPolicyVisibilityMigration).toContain('dealer.assigned_seller_id = p_owner_user_id');
    expect(insertPolicyVisibilityMigration).toContain('coalesce(dealer.is_active, true) = true');
    expect(insertPolicyVisibilityMigration).toContain('coalesce(dealer.is_deleted, false) = false');
    expect(insertPolicyVisibilityMigration).toContain('coalesce(dealer.is_blocked, false) = false');
    expect(insertPolicyVisibilityMigration).toContain('revoke all on function private.can_messe_actor_assign_crm_lead(uuid, text, uuid) from public, anon;');
    expect(insertPolicyVisibilityMigration).toContain('grant execute on function private.can_messe_actor_assign_crm_lead(uuid, text, uuid) to authenticated;');
    expect(insertPolicyVisibilityMigration).toContain('drop policy if exists crm_leads_insert_messe_scoped on public.crm_leads;');
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
