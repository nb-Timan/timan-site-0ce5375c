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
import type { SessionUser } from "@/context/AppUserContext";

const VISITOR_KEY = "timan.visitor.uid";
const SESSION_ID_KEY = "timan.visitor.sid";
const SESSION_START_KEY = "timan.visitor.sstart";
const GUEST_META_KEY = "timan.visitor.meta"; // {country, postal_code, email?}

const MODULE_HEARTBEAT_MS = 45_000;
const MODULE_ACTIVE_WINDOW_MS = 120_000;
const MODULE_ACTIVE_SECONDS_CAP = 90;
const ACTIVITY_EVENTS = ["pointerdown", "mousemove", "keydown", "scroll", "touchstart"] as const;

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

export function getPortalSessionId(): string {
  return getOrStartSessionId();
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
  // Heartbeat: refresh last_seen so duration can be reconstructed even if the
  // unload beacon never reaches Supabase.
  void touchSessionLastSeen();
}

/**
 * Update last_seen on the current session row. Best-effort, debounced to once
 * every 20s to avoid hammering Supabase on rapid route changes.
 */
let lastTouchAt = 0;
async function touchSessionLastSeen(force = false): Promise<void> {
  try {
    const sid = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sid) return;
    const now = Date.now();
    if (!force && now - lastTouchAt < 20_000) return;
    lastTouchAt = now;
    await supabase.from("guest_sessions").update({ last_seen: new Date().toISOString() }).eq("id", sid);
  } catch { /* ignore */ }
}

function deriveModule(path: string): string | null {
  if (!path.startsWith("/portal")) return path.split("/")[1] || null;
  const seg = path.split("/").filter(Boolean); // ['portal', 'crm', ...]
  if (seg.length < 2) return "portal";
  return seg[1] || "portal";
}

export function derivePortalModuleKey(path: string): string | null {
  const clean = path.split("?")[0]?.split("#")[0] || "/";
  const seg = clean.split("/").filter(Boolean);
  if (seg[0] === "messe") {
    if (seg[1] === "konfigurator") return "messe_configurator";
    if (seg[1] === "partner-map") return "messe_partner_map";
    if (seg[1] === "video") return "messe_video";
    if (seg[1] === "nyt") return "messe_news";
    if (seg[1] === "follow-up") return "messe_follow_up";
    if (seg[1]) return `messe_${seg[1].replace(/-/g, "_")}`;
    return "messe";
  }
  if (seg[0] === "configurator") return "configurator";
  if (seg[0] !== "portal") return null;
  if (!seg[1]) return "portal_home";

  if (seg[1] === "crm") {
    const crmArea = seg[2] || "dashboard";
    if (crmArea === "my-dealers" || crmArea === "accounts" || crmArea === "konti") return "crm_dealers";
    if (crmArea === "demo-leads") return "crm_demo_leads";
    if (crmArea === "budget-dashboard") return "crm_budget_dashboard";
    return `crm_${crmArea.replace(/-/g, "_")}`;
  }

  if (seg[1] === "backend") {
    return seg[2] ? `backend_${seg[2].replace(/-/g, "_")}` : "backend";
  }

  if (seg[1] === "marketing") {
    return seg[2] ? `marketing_${seg[2].replace(/-/g, "_")}` : "marketing";
  }

  if (seg[1] === "service") {
    return seg[2] ? `service_${seg[2].replace(/-/g, "_")}` : "service";
  }

  if (seg[1] === "misc") {
    if (seg[2] === "partner-map") return "partner_map";
    if (seg[2] === "forms") return "forms";
    return "misc";
  }

  if (seg[1] === "resources") {
    return seg[2] ? `resource_${seg[2].replace(/-/g, "_")}` : "resources";
  }

  if (seg[1] === "dealer-data") return "dealer_data";
  if (seg[1] === "videos") return "videos";
  if (seg[1] === "contracts") return "contracts";
  if (seg[1] === "timan-2620-afproevning") return "timan_2620_trial";
  if (seg[1] === "timan-2620") return "timan_2620";
  return seg[1].replace(/-/g, "_");
}

export function shouldCountModuleHeartbeat(input: {
  visible: boolean;
  nowMs: number;
  lastInteractionMs: number;
  activeWindowMs?: number;
}): boolean {
  return input.visible && input.nowMs - input.lastInteractionMs <= (input.activeWindowMs ?? MODULE_ACTIVE_WINDOW_MS);
}

export function calculateModuleActiveSeconds(input: {
  nowMs: number;
  lastHeartbeatMs: number;
  maxSeconds?: number;
}): number {
  const elapsedSeconds = Math.max(0, Math.round((input.nowMs - input.lastHeartbeatMs) / 1000));
  return Math.min(elapsedSeconds, input.maxSeconds ?? MODULE_ACTIVE_SECONDS_CAP);
}

export async function recordPortalModuleUsage(input: {
  user: SessionUser | null;
  path: string;
  activeSeconds?: number;
  visitIncrement?: number;
}): Promise<void> {
  if (!input.user?.email) return;
  const moduleKey = derivePortalModuleKey(input.path);
  if (!moduleKey) return;

  try {
    const activeSeconds = Math.max(0, Math.min(input.activeSeconds ?? 0, MODULE_ACTIVE_SECONDS_CAP));
    const visitIncrement = input.visitIncrement ? 1 : 0;
    const { error } = await supabase.rpc("record_portal_module_usage", {
      p_session_id: getPortalSessionId(),
      p_module_key: moduleKey,
      p_active_seconds: activeSeconds,
      p_visit_increment: visitIncrement,
    });
    if (error) throw error;
  } catch (err) {
    console.error("[visitorTracking] recordPortalModuleUsage failed:", err);
  }
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
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let activityListenerAttached = false;
let lastModuleInteractionAt = Date.now();

function markModuleInteraction(): void {
  lastModuleInteractionAt = Date.now();
}

export function getLastModuleInteractionAt(): number {
  return lastModuleInteractionAt;
}

export function attachSessionEndListener(): void {
  if (unloadAttached || typeof window === "undefined") return;
  unloadAttached = true;
  window.addEventListener("pagehide", endSessionBeacon);
  window.addEventListener("beforeunload", endSessionBeacon);
  // Periodic heartbeat while the tab is visible — keeps last_seen fresh.
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (document.visibilityState === "visible") void touchSessionLastSeen();
  }, 30_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void touchSessionLastSeen(true);
  });
}

export function attachModuleActivityListener(): void {
  if (activityListenerAttached || typeof window === "undefined") return;
  activityListenerAttached = true;
  ACTIVITY_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, markModuleInteraction, { passive: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") markModuleInteraction();
  });
}

export function getModuleHeartbeatIntervalMs(): number {
  return MODULE_HEARTBEAT_MS;
}
