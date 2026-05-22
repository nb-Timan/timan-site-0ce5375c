/**
 * Phase 28/41/42 — Per-user "hide from Min konto" service.
 *
 * Lets a user remove a saved configuration from a Min konto list WITHOUT
 * soft-deleting the underlying configurations row. Backend CRM, Dashboard,
 * Budget and dealer detail are NOT affected.
 *
 * Effective-seller scoping (Phase 42):
 *   Hides can be scoped to a SELLER mailbox instead of the writer's own
 *   auth.uid. That makes "Vis som BP" hides apply to BP's effective Min
 *   konto AND keep them visible when BP logs in directly. The DB column
 *   `effective_seller_email` stores the targeted mailbox (NULL = self).
 *
 * Backed by public.configuration_user_hidden (see
 * docs/sql/phase28_user_hidden_configurations.sql,
 * docs/sql/phase41_configuration_user_hidden_rls.sql, and
 * docs/sql/phase42_configuration_user_hidden_effective_seller.sql).
 */
import { supabase } from '@/lib/supabase';

const TABLE = 'configuration_user_hidden';

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01') return true;
  const m = (error.message || '').toLowerCase();
  return m.includes('does not exist') || m.includes('not found');
}

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  const m = (error.message || '').toLowerCase();
  return m.includes("could not find the 'effective_seller_email' column")
    || m.includes('column "effective_seller_email"');
}

/**
 * Hide-scope describing whose Min konto the hide applies to.
 *   - { kind: 'self' }            → personal hide, scoped to auth.uid().
 *   - { kind: 'seller', email }   → hide targets that seller mailbox.
 *                                   Both the writer (e.g. NB-as-BP) and
 *                                   the seller (e.g. BP direct login)
 *                                   see the row as hidden.
 */
export type HideScope =
  | { kind: 'self' }
  | { kind: 'seller'; sellerEmail: string };

function normalizeEmail(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim().toLowerCase();
  return t || null;
}

/**
 * List configuration ids hidden for the given scope by the current auth
 * user. RLS additionally returns rows targeted at the auth user's own
 * email when scope is 'seller' and the auth user IS that seller.
 */
export async function listHiddenConfigurationIdsForScope(
  scope: HideScope,
): Promise<Set<string>> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Set();

    let query = supabase.from(TABLE).select('configuration_id, user_id, effective_seller_email');

    if (scope.kind === 'seller') {
      const email = normalizeEmail(scope.sellerEmail);
      if (!email) return new Set();
      // Anyone (writer or effective seller) who has a row targeting this
      // mailbox. RLS will further restrict to rows visible to me.
      query = query.eq('effective_seller_email', email);
    } else {
      // Self scope — only personal rows that are NOT seller-targeted.
      query = query.eq('user_id', user.id).is('effective_seller_email', null);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingTableError(error)) return new Set();
      if (isMissingColumnError(error)) {
        // Phase 42 SQL not yet applied — fall back to legacy per-user list.
        return listHiddenLegacy();
      }
      console.warn('[userHiddenConfigurations] list failed:', error);
      return new Set();
    }
    return new Set((data ?? []).map((r) => String((r as { configuration_id: string }).configuration_id)));
  } catch (e) {
    console.warn('[userHiddenConfigurations] list threw:', e);
    return new Set();
  }
}

async function listHiddenLegacy(): Promise<Set<string>> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Set();
    const { data, error } = await supabase
      .from(TABLE)
      .select('configuration_id')
      .eq('user_id', user.id);
    if (error) return new Set();
    return new Set((data ?? []).map((r) => String((r as { configuration_id: string }).configuration_id)));
  } catch {
    return new Set();
  }
}

/**
 * Hide a configuration for the given scope.
 *
 * Payload written to configuration_user_hidden:
 *   { user_id: auth.uid(),
 *     configuration_id,
 *     effective_seller_email: scope.kind === 'seller' ? scope.sellerEmail : NULL }
 *
 * Upserts with ignoreDuplicates so re-hiding is a no-op (no UPDATE path).
 */
export async function hideConfigurationForScope(
  configurationId: string,
  scope: HideScope,
): Promise<{ error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Ikke logget ind' };

    const payload: Record<string, unknown> = {
      user_id: user.id,
      configuration_id: configurationId,
      effective_seller_email:
        scope.kind === 'seller' ? normalizeEmail(scope.sellerEmail) : null,
    };

    const tryUpsert = (row: Record<string, unknown>) =>
      supabase
        .from(TABLE)
        .upsert(row, { onConflict: 'user_id,configuration_id', ignoreDuplicates: true });

    let { error } = await tryUpsert(payload);

    if (error && isMissingColumnError(error)) {
      // Phase 42 SQL not yet applied — degrade gracefully to legacy row.
      const legacy = { user_id: user.id, configuration_id: configurationId };
      ({ error } = await tryUpsert(legacy));
    }

    if (error) {
      if (isMissingTableError(error)) {
        return { error: 'Funktionen er endnu ikke aktiveret i databasen (kør phase28 SQL).' };
      }
      return { error: error.message };
    }
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Backwards-compatible helper — defaults to self scope. */
export async function listHiddenConfigurationIdsForCurrentUser(
  opts: { ignoreWhenViewingSellerScope?: boolean } = {},
): Promise<Set<string>> {
  if (opts.ignoreWhenViewingSellerScope) return new Set();
  return listHiddenConfigurationIdsForScope({ kind: 'self' });
}

/** Backwards-compatible helper — self scope. */
export async function hideConfigurationForCurrentUser(
  configurationId: string,
): Promise<{ error?: string }> {
  return hideConfigurationForScope(configurationId, { kind: 'self' });
}
