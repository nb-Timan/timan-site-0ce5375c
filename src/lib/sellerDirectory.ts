/**
 * Live seller directory — single source of truth for seller initials + names
 * across the UI.
 *
 * Why this exists:
 *  - Initials (`AKR`, `BP`, `EM`, `JTN`, `NB`, …) and full names must always
 *    come from the current `app_users` row, not from hardcoded labels.
 *  - Legacy CRM / dealer / lead / quote / order / budget / activity rows may
 *    still contain old initials text (e.g. "AK"). Those rows are NEVER
 *    bulk-updated — they just *render* with the current `app_users.initials`
 *    + `full_name` when we can match them (by email or `app_users_id`).
 *  - Other matching logic (AK ↔ AKR aliasing in `sellerInitials.ts`,
 *    `BUDGET_SELLERS` constant) is left alone; it is used for scope queries
 *    and joining, not for display.
 *
 * Usage:
 *   const dir = useSellerDirectory();
 *   const { initials, full_name } = resolveSellerDisplay(
 *     { email: row.seller_email, id: row.app_users_id,
 *       fallbackInitials: row.seller_initials,
 *       fallbackName: row.seller_name },
 *     dir,
 *   );
 *
 * The directory is fetched once per session and cached in `sessionStorage`.
 * Editing a backend user calls `invalidateSellerDirectory()` so the next read
 * re-queries Supabase.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface SellerDirectoryEntry {
  id: string;
  email: string;
  initials: string;
  full_name: string;
  portal_role: string | null;
  company: string | null;
  phone: string | null;
}

/** Internal roles allowed by CRM's responsible-seller selection. */
export const ASSIGNABLE_TIMAN_SELLER_ROLES = ['timan_seller', 'timan_backend'] as const;

type MesseSellerCountry = 'denmark' | 'germany' | 'other';

// This is a Messe follow-up assignment policy, not a replacement seller
// directory. Entries always originate in the active canonical directory.
const MESSE_COUNTRY_SELLER_INITIALS: Record<Exclude<MesseSellerCountry, 'other'>, readonly string[]> = {
  germany: ['AKR', 'JTN'],
  denmark: ['EM'],
};

export function isAssignableTimanSeller(entry: Pick<SellerDirectoryEntry, 'portal_role'>): boolean {
  return ASSIGNABLE_TIMAN_SELLER_ROLES.includes(entry.portal_role as typeof ASSIGNABLE_TIMAN_SELLER_ROLES[number]);
}

export function normalizeMesseSellerCountry(country: string | null | undefined): MesseSellerCountry {
  const normalized = country?.trim().toLowerCase() || '';
  if (['germany', 'deutschland', 'tyskland', 'de'].includes(normalized)) return 'germany';
  if (['denmark', 'danmark', 'dk'].includes(normalized)) return 'denmark';
  return 'other';
}

/** Country eligibility applied to the canonical active Messe seller directory. */
export function isMesseSellerEligibleForCountry(
  seller: Pick<SellerDirectoryEntry, 'initials' | 'portal_role'>,
  country: string | null | undefined,
): boolean {
  if (!isAssignableTimanSeller(seller)) return false;
  const normalizedCountry = normalizeMesseSellerCountry(country);
  const allowedInitials = normalizedCountry === 'other'
    ? undefined
    : MESSE_COUNTRY_SELLER_INITIALS[normalizedCountry];
  return !allowedInitials || allowedInitials.includes(seller.initials.trim().toUpperCase());
}

export function filterMesseAssignableTimanSellersForCountry(
  sellers: SellerDirectoryEntry[],
  country: string | null | undefined,
): SellerDirectoryEntry[] {
  return sellers.filter((seller) => isMesseSellerEligibleForCountry(seller, country));
}

export interface SellerDirectory {
  list: SellerDirectoryEntry[];
  byEmail: Map<string, SellerDirectoryEntry>;
  byId: Map<string, SellerDirectoryEntry>;
  byInitials: Map<string, SellerDirectoryEntry>;
}

const SS_KEY = "timan.sellerDirectory.v1";
const TTL_MS = 5 * 60 * 1000;

let memCache: { at: number; list: SellerDirectoryEntry[] } | null = null;
let inflight: Promise<SellerDirectoryEntry[]> | null = null;

function readSession(): SellerDirectoryEntry[] | null {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; list: SellerDirectoryEntry[] };
    if (!parsed?.list || Date.now() - parsed.at > TTL_MS) return null;
    return parsed.list;
  } catch {
    return null;
  }
}

function writeSession(list: SellerDirectoryEntry[]): void {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify({ at: Date.now(), list }));
  } catch {
    /* ignore */
  }
}

function buildIndex(list: SellerDirectoryEntry[]): SellerDirectory {
  const byEmail = new Map<string, SellerDirectoryEntry>();
  const byId = new Map<string, SellerDirectoryEntry>();
  const byInitials = new Map<string, SellerDirectoryEntry>();
  for (const e of list) {
    if (e.email) byEmail.set(e.email.toLowerCase(), e);
    if (e.id) byId.set(String(e.id), e);
    if (e.initials) byInitials.set(e.initials.toUpperCase(), e);
  }
  return { list, byEmail, byId, byInitials };
}

export async function loadSellerDirectory(): Promise<SellerDirectoryEntry[]> {
  if (memCache && Date.now() - memCache.at <= TTL_MS) return memCache.list;
  const cached = readSession();
  if (cached) {
    memCache = { at: Date.now(), list: cached };
    return cached;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      // SECURITY (phase63): broad SELECT on app_users is restricted to Timan
      // staff. The directory reads the minimal, purpose-built view
      // public.app_user_directory (display fields only — no permissions,
      // approval/active status or dealer links).
      let { data, error } = await supabase
        .from("app_user_directory")
        .select("id,email,initials,full_name,portal_role,company,phone");
      if (error) {
        // Older databases without the phase63 view: fall back to app_users
        // (staff-only under the new policies).
        const legacy = await supabase
          .from("app_users")
          .select("id,email,initials,full_name,portal_role,company,phone")
          .not("initials", "is", null);
        data = legacy.data;
        error = legacy.error;
      }
      if (error) throw error;
      const list: SellerDirectoryEntry[] = (data || [])
        .map((r) => ({
          id: String(r.id),
          email: String(r.email || "").toLowerCase(),
          initials: String(r.initials || "").toUpperCase(),
          full_name: String(r.full_name || ""),
          portal_role: (r.portal_role as string | null) || null,
          company: (r.company as string | null) || null,
          phone: (r.phone as string | null) || null,
        }))
        .filter((r) => r.email && r.initials);
      memCache = { at: Date.now(), list };
      writeSession(list);
      return list;
    } catch {
      // Fall back to previously cached value if any; otherwise empty.
      const fallback = readSession() || [];
      memCache = { at: Date.now(), list: fallback };
      return fallback;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Read the same active internal seller model used by CRM for an authenticated
 * Messe session. The dedicated RPC only exposes the display fields needed by
 * the form, because external Messe users cannot read the staff directory view.
 */
export async function loadMesseAssignableTimanSellers(): Promise<SellerDirectoryEntry[]> {
  const { data, error } = await supabase.rpc('list_messe_assignable_timan_sellers');
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[])
    .map((row) => ({
      id: String(row.id || ''),
      email: String(row.email || '').toLowerCase(),
      initials: String(row.initials || '').toUpperCase(),
      full_name: String(row.full_name || ''),
      portal_role: (row.portal_role as string | null) || null,
      company: null,
      phone: null,
    }))
    .filter((entry) => entry.id && entry.email && entry.initials && isAssignableTimanSeller(entry));
}

/** Resolve a dealer's canonical account owner against the live CRM seller list. */
export function resolveDealerAssignableTimanSeller(
  dealer: {
    assigned_seller_id?: string | null;
    assigned_seller_email?: string | null;
    assigned_seller_initials?: string | null;
    assigned_seller_name?: string | null;
  } | null | undefined,
  sellers: SellerDirectoryEntry[],
): SellerDirectoryEntry | null {
  if (!dealer) return null;
  const assignable = sellers.filter(isAssignableTimanSeller);
  const sellerId = dealer.assigned_seller_id?.trim();
  if (sellerId) {
    const match = assignable.find((seller) => seller.id === sellerId);
    if (match) return match;
  }
  const sellerEmail = dealer.assigned_seller_email?.trim().toLowerCase();
  if (sellerEmail) {
    const match = assignable.find((seller) => seller.email === sellerEmail);
    if (match) return match;
  }
  const sellerInitials = dealer.assigned_seller_initials?.trim().toUpperCase();
  if (sellerInitials) {
    const match = assignable.find((seller) => seller.initials === sellerInitials);
    if (match) return match;
  }
  const sellerName = dealer.assigned_seller_name?.trim().toLocaleLowerCase();
  return sellerName
    ? assignable.find((seller) => seller.full_name.trim().toLocaleLowerCase() === sellerName) || null
    : null;
}

/**
 * The canonical dealer-to-seller invariant used by CRM and Partnerdata is the
 * stable assigned_seller_id relation, not historical name or email snapshots.
 */
export function dealerIsAssignedToTimanSeller(
  dealer: Pick<{ assigned_seller_id: string | null }, 'assigned_seller_id'> | null | undefined,
  seller: Pick<SellerDirectoryEntry, 'id'> | null | undefined,
): boolean {
  return Boolean(dealer?.assigned_seller_id && seller?.id && dealer.assigned_seller_id === seller.id);
}

export function invalidateSellerDirectory(): void {
  memCache = null;
  try {
    sessionStorage.removeItem(SS_KEY);
  } catch {
    /* ignore */
  }
}

/** Synchronous accessor for callers that have already triggered a load. */
export function getCachedSellerDirectory(): SellerDirectory {
  const list = memCache?.list || readSession() || [];
  return buildIndex(list);
}

export function useSellerDirectory(): SellerDirectory & { ready: boolean } {
  const initial = getCachedSellerDirectory();
  const [dir, setDir] = useState<SellerDirectory>(initial);
  const [ready, setReady] = useState<boolean>(initial.list.length > 0);
  useEffect(() => {
    let alive = true;
    loadSellerDirectory().then((list) => {
      if (!alive) return;
      setDir(buildIndex(list));
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { ...dir, ready };
}

export interface SellerDisplayInput {
  email?: string | null;
  id?: string | null;
  initialsKey?: string | null;
  fallbackInitials?: string | null;
  fallbackName?: string | null;
}

export interface SellerDisplay {
  initials: string;
  full_name: string;
  matched: boolean;
}

/**
 * Resolve the live display values for a seller. When the row can be matched
 * to an `app_users` entry (by email, id, or initials key), return the
 * current `app_users.initials` + `full_name`. Otherwise return the fallback
 * text unchanged — never invents initials.
 */
export function resolveSellerDisplay(
  input: SellerDisplayInput,
  dir: SellerDirectory,
): SellerDisplay {
  const byId = input.id ? dir.byId.get(String(input.id)) : undefined;
  const byEmail = !byId && input.email ? dir.byEmail.get(input.email.toLowerCase()) : undefined;
  const byInitials = !byId && !byEmail && input.initialsKey
    ? dir.byInitials.get(input.initialsKey.toUpperCase())
    : undefined;
  const hit = byId || byEmail || byInitials;
  if (hit) {
    return {
      initials: hit.initials,
      full_name: hit.full_name || input.fallbackName || "",
      matched: true,
    };
  }
  return {
    initials: (input.fallbackInitials || "").toUpperCase(),
    full_name: input.fallbackName || "",
    matched: false,
  };
}

/**
 * Resolve the *live* seller initials for a dealer_accounts row.
 *
 * Dealer dropdowns historically render `dealer.assigned_seller_initials` as
 * frozen text (e.g. "AK"). When the dealer's `assigned_seller_email` matches
 * a current `app_users` row, we instead return that user's *current*
 * `app_users.initials` (e.g. "AKR"), so backend edits flow through
 * everywhere without bulk-updating dealer rows. Falls back to the stored
 * initials when no match is found — never invents a value.
 */
export function resolveDealerSellerInitials(
  dealer: {
    assigned_seller_email?: string | null;
    assigned_seller_initials?: string | null;
  },
  dir: SellerDirectory,
): string {
  const display = resolveSellerDisplay(
    {
      email: dealer.assigned_seller_email ?? null,
      initialsKey: dealer.assigned_seller_initials ?? null,
      fallbackInitials: dealer.assigned_seller_initials ?? null,
    },
    dir,
  );
  return display.initials;
}
