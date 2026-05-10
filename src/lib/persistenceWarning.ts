/**
 * Shared helper for surfacing local-only persistence fallbacks.
 *
 * When a Supabase save fails and a service falls back to localStorage,
 * the user must see a clear warning so they know the data is NOT visible
 * to other users / other computers.
 *
 * Usage (in service catch / error branch):
 *   notifyLocalFallback({ table: "crm_leads", action: "insert", error });
 *
 * - Shows a sonner warning toast with a fixed Danish message.
 * - Logs a structured console.error with table, action, message.
 * - De-duplicates the same table+action within DEDUPE_MS to avoid spam
 *   when many writes fail in a row (e.g. RLS denial during a sync loop).
 */
import { toast } from "sonner";

const DEDUPE_MS = 4000;
const lastShown = new Map<string, number>();

export interface LocalFallbackInfo {
  table: string;
  action: string;
  error?: unknown;
}

function errorMessage(error: unknown): string {
  if (!error) return "ukendt fejl";
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  try { return JSON.stringify(error); } catch { return String(error); }
}

export function notifyLocalFallback({ table, action, error }: LocalFallbackInfo): void {
  const message = errorMessage(error);
  // Always log — even when we suppress the toast.
  console.error("[persistence.fallback]", { table, action, message });

  const key = `${table}:${action}`;
  const now = Date.now();
  const prev = lastShown.get(key) ?? 0;
  if (now - prev < DEDUPE_MS) return;
  lastShown.set(key, now);

  try {
    toast.warning("Gemt lokalt – ikke synkroniseret til serveren", {
      description: `${table} · ${action}`,
      duration: 6000,
    });
  } catch {
    /* toast unavailable (SSR / test) — console log already happened */
  }
}
