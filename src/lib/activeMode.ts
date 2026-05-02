/**
 * Active mode switching for selected backend users (BP, NB).
 *
 * - Real portal_role in Supabase remains `timan_backend` for these users.
 * - `active_mode` is a UI-only override stored in localStorage, keyed by email.
 * - When mode = 'seller', the UI presents the user as `timan_seller`, hiding
 *   backend cards/routes from normal navigation and scoping CRM/dashboards
 *   to that seller's assigned accounts. Backend pages remain reachable by
 *   switching back to Backend mode.
 * - Database permissions are NOT affected by active_mode — RLS still relies
 *   on real portal_role.
 *
 * No SQL/RLS migration is required for this feature.
 */

export type ActiveMode = 'backend' | 'seller';

/** Emails allowed to switch modes. Lowercase, trimmed. */
const SWITCH_ENABLED_EMAILS = new Set<string>([
  'bp@timan.dk',
  'nb@timan.dk',
]);

const STORAGE_PREFIX = 'timan.activeMode.';

function normEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

export function canSwitchMode(email: string | null | undefined): boolean {
  return SWITCH_ENABLED_EMAILS.has(normEmail(email));
}

/** Returns the seller initials displayed in the switch label (e.g. "BP", "NB"). */
export function getSellerInitials(email: string | null | undefined): string {
  const e = normEmail(email);
  if (!e) return '';
  const local = e.split('@')[0] || '';
  return local.toUpperCase();
}

export function getActiveMode(email: string | null | undefined): ActiveMode {
  const e = normEmail(email);
  if (!e || !canSwitchMode(e)) return 'backend';
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + e);
    return v === 'seller' ? 'seller' : 'backend';
  } catch {
    return 'backend';
  }
}

export function setActiveMode(email: string | null | undefined, mode: ActiveMode): void {
  const e = normEmail(email);
  if (!e || !canSwitchMode(e)) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + e, mode);
    // Notify listeners in this tab (storage event only fires across tabs).
    window.dispatchEvent(new CustomEvent('timan:active-mode-changed', { detail: { email: e, mode } }));
  } catch {
    /* ignore */
  }
}
