import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const newLeadPage = readFileSync('src/pages/crm/CrmNewLeadPage.tsx', 'utf8');
const configuratorSync = readFileSync('src/lib/crmLeadConfigurationSync.ts', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260915073005_crm_lead_owner_seller_parity.sql',
  'utf8',
);

describe('CRM lead owner and responsible seller parity', () => {
  it('uses the same internal seller roles as the responsible-seller selector', () => {
    expect(newLeadPage).toContain("u.role === 'timan_seller' || u.role === 'timan_backend'");
    expect(migration).toContain("owner_directory.portal_role::text in (''timan_seller'', ''timan_backend'')");
  });

  it('keeps the Configurator assignment as the canonical lead owner', () => {
    expect(configuratorSync).toContain('owner_user_id: preferNonEmpty(sellerId, null) ?? preferNonEmpty(row.assigned_seller_id, null) ?? lead.owner_user_id');
    expect(configuratorSync).toContain('owner_email: preferNonEmpty(row.seller_email, lead.owner_email)');
  });

  it('preserves genuinely unassigned leads by classifying only known internal roles', () => {
    expect(migration).toContain("v_old_owner_classification constant text");
    expect(migration).toContain("raise exception 'crm_leads_page_query does not match the verified owner classification'");
  });
});
