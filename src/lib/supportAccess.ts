import type { AppUser } from '@/data/appUsers';
import { isBackendActor } from '@/lib/portalAccess';
import { supabase } from '@/lib/supabase';

export const SUPPORT_ACCESS_PERMISSION = 'support_access' as const;

export type SupportAccessUser = Pick<AppUser, 'role' | 'partner_type' | 'approved' | 'is_active'> & {
  portal_role?: string | null;
  module_access?: string[] | null;
  permissions?: Record<string, boolean> | null;
};

/**
 * Client-side access mirror for navigation and rendering only.
 * The database RPC public.can_access_support() is the authorization boundary.
 */
export function canAccessSupport(user: SupportAccessUser | null | undefined): boolean {
  return !!user
    && user.approved === true
    && user.is_active === true
    && isBackendActor(user)
    && user.permissions?.[SUPPORT_ACCESS_PERMISSION] === true;
}

export function canAssignSupportAccess(role: string | null | undefined): boolean {
  return role === 'timan_backend';
}

/** Server-authoritative check for future Support routes and screens. */
export async function verifySupportAccess(user: SupportAccessUser | null | undefined): Promise<boolean> {
  if (!canAccessSupport(user)) return false;
  const { data, error } = await supabase.rpc('can_access_support');
  return !error && data === true;
}
