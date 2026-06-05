/**
 * Shared helper + hook for rendering "Senest kørt" + status-badge på sync-paneler
 * i Backend → Data & Integrationer. Læser udelukkende fra eksisterende
 * `sharepoint_sync_logs` (read-only). Ingen DB- eller funktionsændringer.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type SyncBadgeTone = "green" | "yellow" | "red" | "slate";

export interface SyncBadge {
  tone: SyncBadgeTone;
  label: string;
  lastRunAt: string | null;
}

export interface LatestSyncRow {
  ran_at: string;
  warnings: number;
  error: string | null;
}

export function fmtSyncDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("da-DK", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

export function badgeFromLatest(row: LatestSyncRow | null): SyncBadge {
  if (!row) return { tone: "slate", label: "Ingen kørsler endnu", lastRunAt: null };
  if (row.error) return { tone: "red", label: "Fejl", lastRunAt: row.ran_at };
  if ((row.warnings ?? 0) > 0) return { tone: "yellow", label: "Advarsel", lastRunAt: row.ran_at };
  return { tone: "green", label: "OK", lastRunAt: row.ran_at };
}

export const SYNC_BADGE_CLASSES: Record<SyncBadgeTone, string> = {
  green: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  yellow: "bg-amber-100 text-amber-800 border border-amber-200",
  red: "bg-rose-100 text-rose-800 border border-rose-200",
  slate: "bg-slate-100 text-slate-700 border border-slate-200",
};

/**
 * Henter seneste rigtige (ikke dry-run) dealer-sync log fra
 * `sharepoint_sync_logs`. Returnerer null indtil indlæst eller hvis tabellen
 * ikke kan læses (manglende rolle/RLS).
 */
export function useLatestDealerSyncLog(): { badge: SyncBadge; loading: boolean } {
  const [row, setRow] = useState<LatestSyncRow | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("sharepoint_sync_logs")
      .select("ran_at, warnings, error")
      .eq("dry_run", false)
      .order("ran_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        const first = (data ?? [])[0] as LatestSyncRow | undefined;
        setRow(first ?? null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);
  return { badge: badgeFromLatest(row), loading };
}
