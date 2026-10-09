import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260917074739_messe_internal_cross_seller_assignment.sql',
  'utf8',
);
const creatorTriggerMigration = readFileSync(
  'supabase/migrations/20260910094914_20260910084500_crm_lead_creator_trigger_fallback.sql',
  'utf8',
);
const messeForm = readFileSync('src/pages/messe/MesseFollowUpPage.tsx', 'utf8');

describe('Messe cross-seller lead assignment', () => {
  it('allows every canonical Messe actor path without making the actor the selected owner', () => {
    expect(migration).toContain("create or replace function private.is_messe_lead_submission_actor()");
    expect(migration).toContain("actor.portal_role::text in ('timan_backend', 'timan_seller', 'timan_service')");
    expect(migration).toContain("'messe_portal' = any(actor.allowed_modules)");
    expect(migration).toContain('private.is_messe_lead_submission_actor()');
    expect(migration).not.toContain('seller.auth_user_id = (select auth.uid())');
    expect(migration).not.toContain('dealer.assigned_seller_id = actor.id');
  });

  it('keeps selected seller, selected dealer, country, and partner-type validation server-side', () => {
    expect(migration).toContain('dealer.assigned_seller_id = p_owner_user_id');
    expect(migration).toContain("seller.portal_role::text in ('timan_seller', 'timan_backend')");
    expect(migration).toContain("'dealer', 'service_partner', 'importer', 'supplier'");
    expect(migration).toContain('crm_leads.owner_user_id');
    expect(migration).toContain('crm_leads.linked_dealer_id');
  });

  it('keeps the authenticated actor as creator and the selected seller as CRM owner', () => {
    expect(migration).toContain('actor.id = crm_leads.created_by_user_id');
    expect(creatorTriggerMigration).toContain('new.created_by_user_id := session_creator_id');
    expect(messeForm).toContain('owner_user_id: ownerId,');
    expect(messeForm).toContain('buildMesseLeadInternalMailRouting(responsibleSeller.email)');
  });
});
