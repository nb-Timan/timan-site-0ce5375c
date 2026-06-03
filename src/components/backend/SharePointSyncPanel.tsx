/**
 * Foldable admin panel that bundles the three SharePoint tools:
 *   - Verify (read-only mapping check)
 *   - Dry-run (no writes)
 *   - Real sync (writes masterdata only)
 *
 * Collapsed by default so the dealer list stays the main focus on
 * /portal/backend/dealer-accounts. Only visible to portal_role
 * 'timan_backend'.
 *
 * The compact header shows the latest sync log from
 * `sharepoint_sync_logs` so the admin can tell at a glance when the
 * last sync ran and what it did. No sync logic / no writes here.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, CloudCog, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";
import SharePointVerifyButton from "./SharePointVerifyButton";
import SharePointDryRunButton from "./SharePointDryRunButton";
import SharePointRealSyncButton from "./SharePointRealSyncButton";

interface SyncLogRow {
  ran_at: string;
  dry_run: boolean;
  created: number;
  updated: number;
  warnings: number;
  error: string | null;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("da-DK", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

export default function SharePointSyncPanel() {
  const { appUser } = useAppUser();
  const [open, setOpen] = useState(false);
  const [latest, setLatest] = useState<SyncLogRow | null>(null);
  const [loadingLog, setLoadingLog] = useState(true);

  useEffect(() => {
    if (!appUser || appUser.portal_role !== "timan_backend") return;
    let cancelled = false;
    (async () => {
      setLoadingLog(true);
      const { data } = await supabase
        .from("sharepoint_sync_logs")
        .select("ran_at,dry_run,created,updated,warnings,error")
        .eq("dry_run", false)
        .order("ran_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      setLatest((data?.[0] as SyncLogRow | undefined) ?? null);
      setLoadingLog(false);
    })();
    return () => { cancelled = true; };
  }, [appUser]);

  if (!appUser || appUser.portal_role !== "timan_backend") return null;

  const hasError = !!latest?.error;
  const statusLabel = !latest
    ? "Ingen kørsel registreret"
    : hasError ? "Fejl" : "Synkroniseret";

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          <CloudCog className="h-4 w-4 text-slate-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-900">SharePoint synkronisering</div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {loadingLog ? (
              <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Henter status…</span>
            ) : latest ? (
              <>
                <span>Seneste sync: <strong className="text-slate-700">{fmtDateTime(latest.ran_at)}</strong></span>
                <span className={`inline-flex items-center gap-1 ${hasError ? "text-rose-700" : "text-emerald-700"}`}>
                  {hasError ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  {statusLabel}
                </span>
                <span>{latest.updated} opdateret</span>
                <span>{latest.created} oprettet</span>
                <span>{latest.warnings} advarsler</span>
              </>
            ) : (
              <span>Ingen sync kørt endnu</span>
            )}
          </div>
        </div>
        <span className="text-[11px] font-semibold text-slate-500 hidden sm:inline">
          {open ? "Skjul værktøjer" : "Vis værktøjer"}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-200 bg-slate-50/50 px-4 py-4 space-y-0">
          <SharePointVerifyButton />
          <SharePointDryRunButton />
          <SharePointRealSyncButton />
        </div>
      )}
    </div>
  );
}
