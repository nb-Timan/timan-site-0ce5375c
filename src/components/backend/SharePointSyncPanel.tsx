/**
 * Compact admin panel for SharePoint dealer synchronization.
 * This panel only handles dealer master data. Warranty tools live under
 * Data & Integrationer -> Garantiregistreringer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudCog, CloudDownload, Loader2, ScanSearch, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";
import SharePointVerifyButton, { type SharePointVerifyHandle } from "./SharePointVerifyButton";
import SharePointDryRunButton, { type SharePointDryRunHandle } from "./SharePointDryRunButton";
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
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("da-DK", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

export default function SharePointSyncPanel() {
  const { appUser } = useAppUser();
  const [latest, setLatest] = useState<SyncLogRow | null>(null);
  const [loadingLog, setLoadingLog] = useState(true);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [dryRunBusy, setDryRunBusy] = useState(false);
  const [realSyncBusy, setRealSyncBusy] = useState(false);
  const verifyRef = useRef<SharePointVerifyHandle>(null);
  const dryRunRef = useRef<SharePointDryRunHandle>(null);
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

  function startVerify() {
    setVerifyBusy(true);
    verifyRef.current?.start();
    setTimeout(() => setVerifyBusy(false), 600);
  }

  function startDryRun() {
    setDryRunBusy(true);
    dryRunRef.current?.start();
    setTimeout(() => setDryRunBusy(false), 600);
  }

  function startRealSync() {
    setRealSyncBusy(true);
    realSyncRef.current?.start();
    setTimeout(() => setRealSyncBusy(false), 600);
  }

  function handleRealSyncCompleted() {
    verifyRef.current?.clear();
    void loadLatest();
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
          <CloudCog className="h-5 w-5 text-slate-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">SharePoint synkronisering</h2>
          <div className="mt-2">
            {loadingLog ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Henter status...
              </span>
            ) : latest ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700">
                  Sidste synkronisering: <strong className="text-slate-900">{fmtDateTime(latest.ran_at)}</strong>
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${hasError ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {hasError
                    ? <><AlertTriangle className="h-4 w-4" /> Fejl</>
                    : <><CheckCircle2 className="h-4 w-4" /> Synkroniseret</>}
                </span>
                <span className="text-sm text-slate-600">
                  {latest.updated} opdateret - {latest.created} oprettet - {latest.warnings} {latest.warnings === 1 ? "fejl/advarsel" : "fejl/advarsler"}
                </span>
              </div>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
                Ingen synkronisering kørt endnu
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        <div className="flex items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900">Verificér mapping</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-700">
              Sammenligner SharePoint og portal-data. Viser afvigelser, nye rækker og mangler.
            </p>
          </div>
          <button
            type="button"
            onClick={startVerify}
            disabled={verifyBusy}
            className="inline-flex min-h-10 flex-shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {verifyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            Verificér - skriver intet
          </button>
        </div>

        <div className="flex items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900">Dry-run</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-700">
              Henter SharePoint-data og viser præcis hvad sync vil ændre. Skriver intet.
            </p>
          </div>
          <button
            type="button"
            onClick={startDryRun}
            disabled={dryRunBusy}
            className="inline-flex min-h-10 flex-shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {dryRunBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
            Dry-run - forhåndsvisning før sync
          </button>
        </div>

        <div className="flex items-start justify-between gap-4 bg-emerald-50/50 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900">Synkronisér forhandlere fra SharePoint</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-700">
              Opdaterer kun stamdata. CRM, brugere, tilbud, ordrer og aktiviteter bevares.
            </p>
          </div>
          <button
            type="button"
            onClick={startRealSync}
            disabled={realSyncBusy}
            className="inline-flex h-10 flex-shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {realSyncBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Synkronisér forhandlere fra SharePoint
          </button>
        </div>
      </div>

      <SharePointVerifyButton ref={verifyRef} resultOnly />
      <SharePointDryRunButton ref={dryRunRef} hideTrigger onRequestRealSync={() => realSyncRef.current?.start()} />
      <SharePointRealSyncButton ref={realSyncRef} hideTrigger onSynced={handleRealSyncCompleted} />
    </div>
  );
}
