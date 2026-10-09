import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { canAccessSupport, SUPPORT_ACCESS_PERMISSION } from '@/lib/supportAccess';
import { sanitizePermsForRole } from '@/lib/backendUsersService';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';
import type { BackendUser } from '@/lib/backend-users-store';

const base = {
  role: 'timan_saelger' as const,
  partner_type: null,
  approved: true,
  is_active: true,
  module_access: null,
};

const permissions = (supportAccess: boolean): BackendUser['perms'] => ({
  support_access: supportAccess,
  can_create_claims: false,
  can_approve_claims: false,
  can_create_tsb: false,
  can_manage_users: false,
  can_manage_payment_terms: false,
  can_apply_extra_dealer_discount: false,
  can_save_configurator_as_lead: false,
  marketing_videos_manage: false,
  marketing_configurator_manage: false,
  news_manage: false,
  can_view_prices: false,
  can_submit_order: false,
});

describe('Support permission', () => {
  it('allows only an active approved Backend user with the explicit permission', () => {
    expect(canAccessSupport({ ...base, portal_role: 'timan_backend', permissions: { support_access: true } })).toBe(true);
    expect(canAccessSupport({ ...base, portal_role: 'timan_backend', permissions: { support_access: false } })).toBe(false);
    expect(canAccessSupport({ ...base, portal_role: 'timan_seller', permissions: { support_access: true } })).toBe(false);
    expect(canAccessSupport({ ...base, portal_role: 'timan_backend', approved: false, permissions: { support_access: true } })).toBe(false);
    expect(canAccessSupport({ ...base, portal_role: 'timan_backend', is_active: false, permissions: { support_access: true } })).toBe(false);
  });

  it('strips stale Support permission from every non-Backend role at save time', () => {
    expect(sanitizePermsForRole('timan_seller', permissions(true)).support_access).toBe(false);
    expect(sanitizePermsForRole('timan_dealer', permissions(true)).support_access).toBe(false);
    expect(sanitizePermsForRole('timan_backend', permissions(true)).support_access).toBe(true);
  });

  it('uses the canonical key and provides all nine portal translations', () => {
    expect(SUPPORT_ACCESS_PERMISSION).toBe('support_access');
    for (const language of PORTAL_LANGUAGE_CODES) {
      expect(t('backendPermissionSupport', language)).not.toBe('backendPermissionSupport');
    }
  });

  it('keeps the future runtime path connected to the server authorization RPC', () => {
    const source = readFileSync('src/lib/supportAccess.ts', 'utf8');
    expect(source).toContain("supabase.rpc('can_access_support')");
    expect(source).toContain('if (!canAccessSupport(user)) return false');
  });
});

describe('Support server authorization foundation', () => {
  const migration = readFileSync('supabase/migrations/20260927115015_support_access_authorization.sql', 'utf8');
  const adminFunction = readFileSync('supabase/functions/admin-user-actions/index.ts', 'utf8');
  const editor = readFileSync('src/pages/backend/BackendUsersPage.tsx', 'utf8');

  it('derives identity from auth and requires role, active state and explicit permission', () => {
    expect(migration).toContain('public.can_access_support()');
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain("u.portal_role::text = 'timan_backend'");
    expect(migration).toContain("u.permissions ->> 'support_access'");
    expect(migration).toContain('coalesce(u.approved, false) = true');
    expect(migration).toContain('coalesce(u.is_active, false) = true');
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it('exposes the authorization check only to authenticated callers', () => {
    expect(migration).toContain('revoke all on function public.can_access_support() from public, anon, authenticated, service_role');
    expect(migration).toContain('grant execute on function public.can_access_support() to authenticated');
  });

  it('blocks non-Backend assignment in both editor and privileged save API', () => {
    expect(editor).toContain('!canAssignSupportAccess(draft.role)');
    expect(adminFunction).toContain('requestedPermissions.support_access === true');
    expect(adminFunction).toContain('Support-adgang kan kun tildeles Timan Backend-brugere.');
  });
});
