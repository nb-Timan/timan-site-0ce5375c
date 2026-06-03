/**
 * Compact admin panel for SharePoint synkronisering on
 * /portal/backend/dealer-accounts. Visible only to portal_role
 * 'timan_backend'.
 *
 * Layout principle:
 *  - Header always shows the latest REAL sync (read from
 *    sharepoint_sync_logs where dry_run = false).
 *  - Toolbar exposes three actions: Verificér, Dry-run, Synkroniser nu.
 *  - Verify result may appear briefly below the toolbar and can be cleared.
 *  - Dry-run result is shown in a modal and is NOT persisted — closing the
 *    modal discards it.
 *  - Real sync result is reflected by refreshing the latest sync log.
 *
 * No sync logic, no writes here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudCog, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";
import SharePointVerifyButton from "./SharePointVerifyButton";
import SharePointDryRunButton from "./SharePointDryRunButton";
import SharePointRealSyncButton, { type SharePointRealSyncHandle } from "./SharePointRealSyncButton";

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
  const [latest, setLatest] = useState<SyncLogRow | null>(null);
  const [loadingLog, setLoadingLog] = useState(true);
  const realSyncRef = useRef<SharePointRealSyncHandle>(null);

  const loadLatest = useCallback(async () => {
    setLoadingLog(true);
    const { data } = await supabase
      .from("sharepoint_sync_logs")
      .select("ran_at,dry_run,created,updated,warnings,error")
      .eq("dry_run", false)
      .order("ran_at", { ascending: false })
      .limit(1);
    setLatest((data?.[0] as SyncLogRow | undefined) ?? null);
    setLoadingLog(false);
  }, []);

  useEffect(() => {
    if (!appUser || appUser.portal_role !== "timan_backend") return;
    void loadLatest();
  }, [appUser, loadLatest]);

  if (!appUser || appUser.portal_role !== "timan_backend") return null;

  const hasError = !!latest?.error;

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          <CloudCog className="h-4 w-4 text-slate-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-900">SharePoint synkronisering</div>
          <div className="mt-1 text-[12px] text-slate-600">
            {loadingLog ? (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Henter status…
              </span>
            ) : latest ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  Seneste sync: <strong className="text-slate-800">{fmtDateTime(latest.ran_at)}</strong>
                </span>
                <span className={`inline-flex items-center gap-1 ${hasError ? "text-rose-700" : "text-emerald-700"}`}>
                  {hasError
                    ? <><AlertTriangle className="h-3 w-3" /> Fejl</>
                    : <><CheckCircle2 className="h-3 w-3" /> Synkroniseret</>}
                </span>
                <span className="text-slate-500">
                  {latest.updated} opdateret · {latest.created} oprettet · {latest.warnings} {latest.warnings === 1 ? "fejl/advarsel" : "fejl/advarsler"}
                </span>
              </div>
            ) : (
              <span className="text-slate-500">Ingen sync kørt endnu.</span>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-slate-100">
        <SharePointVerifyButton compact />
        <SharePointDryRunButton
          compact
          onRequestRealSync={() => realSyncRef.current?.start()}
        />
        <SharePointRealSyncButton
          ref={realSyncRef}
          compact
          onSynced={() => void loadLatest()}
        />
        <span className="ml-auto text-[11px] text-slate-500">
          Kun rigtig sync gemmes som historik. Dry-run vises kun midlertidigt.
        </span>
      </div>

      {/* Temporary verify result mounts here via SharePointVerifyButton above
          (its result/error UI is rendered inline next to its trigger). */}
    </div>
  );
}
