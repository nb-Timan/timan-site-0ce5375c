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
