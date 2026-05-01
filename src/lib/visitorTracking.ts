/**
 * Visitor / session / page-view tracking for Timan Portal.
 *
 * Writes to Supabase tables: guest_visitors, guest_sessions, portal_activity_log.
 * All writes are best-effort — failures are logged and never block the UI.
 *
 * Visitor identity: a stable UUID stored in localStorage (`timan.visitor.uid`).
 * Session identity: a UUID stored in sessionStorage (`timan.visitor.sid`),
 *   created on first page-view of the tab.
 */

import { supabase } from "@/lib/supabase";

const VISITOR_KEY = "timan.visitor.uid";
const SESSION_ID_KEY = "timan.visitor.sid";
const SESSION_START_KEY = "timan.visitor.sstart";
const GUEST_META_KEY = "timan.visitor.meta"; // {country, postal_code, email?}

export interface GuestMeta {
  country?: string | null;
  postal_code?: string | null;
  email?: string | null;
  user_type?: "guest" | "authenticated";
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getVisitorUid(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export function getGuestMeta(): GuestMeta {
  try {
    const raw = sessionStorage.getItem(GUEST_META_KEY) || localStorage.getItem(GUEST_META_KEY);
    if (raw) return JSON.parse(raw) as GuestMeta;
  } catch { /* ignore */ }
  return {};
}

export function setGuestMeta(meta: GuestMeta): void {
  try {
    const merged = { ...getGuestMeta(), ...meta };
    localStorage.setItem(GUEST_META_KEY, JSON.stringify(merged));
    sessionStorage.setItem(GUEST_META_KEY, JSON.stringify(merged));
  } catch { /* ignore */ }
}

function getOrStartSessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sid) {
      sid = uuid();
      sessionStorage.setItem(SESSION_ID_KEY, sid);
      sessionStorage.setItem(SESSION_START_KEY, new Date().toISOString());
    }
    return sid;
  } catch {
    return uuid();
  }
}

function browserLanguage(): string | null {
  try {
    return localStorage.getItem("timan.language") || navigator.language || null;
  } catch {
    return null;
  }
}

function ua(): string | null {
  try { return navigator.userAgent; } catch { return null; }
}

/**
 * Register a guest visitor (called from the country/postal popup).
 * Creates a visitor row (or updates the existing one) and starts a session.
 */
export async function registerGuestVisitor(input: { country: string; postal_code: string; language?: string; email?: string | null; }): Promise<void> {
  const visitor_uid = getVisitorUid();
  const language = input.language || browserLanguage();
  const user_agent = ua();

  setGuestMeta({
    country: input.country,
    postal_code: input.postal_code,
    email: input.email ?? null,
    user_type: "guest",
  });

  try {
    // Upsert visitor by visitor_uid
    const { data: existing } = await supabase
      .from("guest_visitors")
      .select("id, visit_count")
      .eq("visitor_uid", visitor_uid)
      .maybeSingle();

    if (existing) {
      await supabase.from("guest_visitors").update({
        country: input.country,
        postal_code: input.postal_code,
        language,
        user_agent,
        last_visit_at: new Date().toISOString(),
        visit_count: (existing.visit_count || 0) + 1,
        email: input.email ?? null,
      }).eq("id", existing.id);
    } else {
      await supabase.from("guest_visitors").insert({
        visitor_uid,
        country: input.country,
        postal_code: input.postal_code,
        language,
        user_agent,
        email: input.email ?? null,
      });
    }

    // Start a fresh session
    sessionStorage.removeItem(SESSION_ID_KEY);
    const session_id = getOrStartSessionId();
    await supabase.from("guest_sessions").insert({
      id: session_id,
      visitor_uid,
      user_type: "guest",
      email: input.email ?? null,
      country: input.country,
      postal_code: input.postal_code,
      language,
      user_agent,
    });
  } catch (err) {
    console.error("[visitorTracking] registerGuestVisitor failed:", err);
  }
}

/**
 * Start (or continue) a session for an authenticated user.
 */
export async function startAuthenticatedSession(email: string, language?: string): Promise<void> {
  const visitor_uid = getVisitorUid();
  const meta = getGuestMeta();
  setGuestMeta({ email, user_type: "authenticated" });
  const user_agent = ua();
  try {
    // Mark visitor (if exists) as converted
    await supabase.from("guest_visitors").update({
      converted_to_user: true,
      converted_user_email: email,
      converted_at: new Date().toISOString(),
      email,
      last_visit_at: new Date().toISOString(),
    }).eq("visitor_uid", visitor_uid);

    sessionStorage.removeItem(SESSION_ID_KEY);
    const session_id = getOrStartSessionId();
    await supabase.from("guest_sessions").insert({
      id: session_id,
      visitor_uid,
      user_type: "authenticated",
      email,
      country: meta.country ?? null,
      postal_code: meta.postal_code ?? null,
      language: language || browserLanguage(),
      user_agent,
    });
  } catch (err) {
    console.error("[visitorTracking] startAuthenticatedSession failed:", err);
  }
}

/**
 * Log a page view. Safe to call on every route change.
 */
export async function logPageView(path: string, module?: string | null): Promise<void> {
  // Only log if the user has gone through the popup or logged in.
  const meta = getGuestMeta();
  if (!meta.user_type) return;

  const visitor_uid = getVisitorUid();
  const session_id = getOrStartSessionId();
  try {
    await supabase.from("portal_activity_log").insert({
      visitor_uid,
      session_id,
      user_type: meta.user_type,
      email: meta.email ?? null,
      country: meta.country ?? null,
      postal_code: meta.postal_code ?? null,
      language: browserLanguage(),
      path,
      module: module ?? deriveModule(path),
      user_agent: ua(),
    });
  } catch (err) {
    console.error("[visitorTracking] logPageView failed:", err);
  }
}

function deriveModule(path: string): string | null {
  if (!path.startsWith("/portal")) return path.split("/")[1] || null;
  const seg = path.split("/").filter(Boolean); // ['portal', 'crm', ...]
  if (seg.length < 2) return "portal";
  return seg[1] || "portal";
}

/**
 * Close current session (best-effort, called on unload).
 */
export function endSessionBeacon(): void {
  try {
    const sid = sessionStorage.getItem(SESSION_ID_KEY);
    const startStr = sessionStorage.getItem(SESSION_START_KEY);
    if (!sid) return;
    const ended_at = new Date().toISOString();
    const duration_seconds = startStr ? Math.max(0, Math.round((Date.now() - new Date(startStr).getTime()) / 1000)) : null;
    // Use sendBeacon-friendly fetch to Supabase REST
    supabase.from("guest_sessions").update({ ended_at, duration_seconds }).eq("id", sid);
  } catch { /* ignore */ }
}

/**
 * Hook into browser unload events once.
 */
let unloadAttached = false;
export function attachSessionEndListener(): void {
  if (unloadAttached || typeof window === "undefined") return;
  unloadAttached = true;
  window.addEventListener("pagehide", endSessionBeacon);
  window.addEventListener("beforeunload", endSessionBeacon);
}
