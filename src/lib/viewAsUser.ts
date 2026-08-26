/**
 * View-as / effective portal user resolution.
 *
 * Background:
 *   - A Timan Backend user can switch into "view as <User>" or
 *     "view as <External role>" mode via active-mode (localStorage).
 *   - Until now `derivePortalRole` returned the previewed role, but the
 *     CACHED `module_access` / `permissions` still belonged to the backend
 *     user (full access). That meant area/module/quick-action visibility
 *     did NOT reflect the previewed user's real Supabase permissions.
 *
 * This hook returns an "effective" SessionUser-shape object that:
 *   - keeps the logged-in user's identity (email, display_name) for UI,
 *   - but overrides `portal_role`, `module_access`, `permissions`, `role`,
 *     `partner_type` from the previewed user's live `app_users` row when
 *     a concrete user view-as mode is active.
 *   - For `role:<external>` previews we just override `portal_role` and
 *     clear `module_access` so the role's defaults apply.
 *
 * No DB writes. No auth changes. Pure presentation.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SessionUser } from '@/context/AppUserContext';
import {
  getActiveMode,
  getActiveUserView,
  getActiveRolePreview,
  canSwitchMode,
} from '@/lib/activeMode';
import { defaultCanViewPrices, defaultCanSubmitOrder } from '@/lib/sessionPermissionDefaults';

const cache = new Map<string, SessionUser>();

async function fetchUserByEmail(email: string): Promise<SessionUser | null> {
  const norm = email.toLowerCase();
  if (cache.has(norm)) return cache.get(norm)!;
  const { data: row } = await supabase
    .from('app_users')
    .select('*')
    .eq('email', norm)
    .maybeSingle();
  if (!row) return null;
  const u: SessionUser = {
    email: row.email as string,
    role: row.role as SessionUser['role'],
    partner_type: (row.partner_type as SessionUser['partner_type']) ?? null,
    approved: row.approved as boolean,
    is_active: row.is_active as boolean,
    start_step: (row.start_step as number) ?? 1,
    max_step: (row.max_step as number) ?? 4,
    can_view_prices: defaultCanViewPrices(row.can_view_prices, row.portal_role, row.role, row.partner_type),
    can_submit_order: defaultCanSubmitOrder(row.can_submit_order, row.portal_role, row.role, row.partner_type),
    can_edit_discount: (row.can_edit_discount as boolean) ?? false,
    can_switch_customer_mode: (row.can_switch_customer_mode as boolean) ?? false,
    working_for: (row.working_for as SessionUser['working_for']) ?? null,
    display_name: (row.display_name as string) || (row.full_name as string),
    portal_role: (row.portal_role as string | null) ?? null,
    preferred_language: (row.preferred_language as string | null) ?? null,
    preferred_currency: (row.preferred_currency as string | null) ?? null,
    company_dealer: (row.company_dealer as string | null) ?? null,
    portal_variant: (row.portal_variant as string | null) ?? 'standard',
    module_access: ((row.allowed_modules as string[] | null) ?? (row.module_access as string[] | null)) ?? null,
    allowed_areas: (row.allowed_areas as string[] | null) ?? null,
    allowed_modules: (row.allowed_modules as string[] | null) ?? null,
    status: (row.status as string | null) ?? null,
    dealer_number: (row.dealer_number as string | null) ?? null,
    permissions: (row.permissions as Record<string, boolean> | null) ?? null,
    quick_actions: (row.quick_actions as string[] | null) ?? null,
  };
  cache.set(norm, u);
  return u;
}

export function clearViewAsCache(email?: string | null) {
  if (email) cache.delete(email.toLowerCase());
  else cache.clear();
}

/**
 * Returns the effective user to be used for area/module/quick-action
 * visibility. When no view-as mode is active this is the original
 * `appUser` reference unchanged.
 */
export function useEffectivePortalUser(appUser: SessionUser | null): SessionUser | null {
  const [target, setTarget] = useState<SessionUser | null>(null);
  const [rev, setRev] = useState(0);

  // Listen for view-as switches and user-edit-driven cache busts.
  useEffect(() => {
    const bump = () => setRev((n) => n + 1);
    window.addEventListener('timan:active-mode-changed', bump);
    return () => window.removeEventListener('timan:active-mode-changed', bump);
  }, []);

  useEffect(() => {
    if (!appUser || !canSwitchMode(appUser)) { setTarget(null); return; }
    const viewUser = getActiveUserView(appUser.email);
    if (!viewUser) { setTarget(null); return; }
    let cancelled = false;
    fetchUserByEmail(viewUser.email).then((u) => { if (!cancelled) setTarget(u); });
    return () => { cancelled = true; };
  }, [appUser, rev]);

  if (!appUser) return null;
  if (!canSwitchMode(appUser)) return appUser;

  // Role preview (no actual user row to fetch — clear module_access so
  // role defaults apply).
  const mode = getActiveMode(appUser.email);
  if (typeof mode === 'string' && mode.startsWith('role:')) {
    const preview = getActiveRolePreview(appUser.email);
    if (!preview) return appUser;
    return {
      ...appUser,
      portal_role: preview.key,
      module_access: null,
      allowed_areas: null,
      allowed_modules: null,
      permissions: null,
      quick_actions: null,
    };
  }

  if (target) {
    return {
      ...appUser,
      role: target.role,
      partner_type: target.partner_type,
      can_view_prices: target.can_view_prices,
      can_submit_order: target.can_submit_order,
      portal_role: target.portal_role ?? appUser.portal_role,
      module_access: target.module_access ?? null,
      allowed_areas: target.allowed_areas ?? null,
      allowed_modules: target.allowed_modules ?? null,
      permissions: target.permissions ?? null,
      quick_actions: target.quick_actions ?? null,
      portal_variant: target.portal_variant ?? appUser.portal_variant,
      dealer_number: target.dealer_number ?? null,
      company_dealer: target.company_dealer ?? null,
    };
  }
  return appUser;
}
