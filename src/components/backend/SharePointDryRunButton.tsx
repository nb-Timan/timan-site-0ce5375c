/**
 * Admin-only button to trigger a SharePoint sync DRY-RUN.
 * Calls Edge Function `sharepoint-sync-dealers` with { dryRun: true }.
 *
 * Dry-run is a temporary test. The result is shown in a modal and is
 * NOT persisted as page history — when the modal closes, the result is
 * discarded. Only real sync writes to `sharepoint_sync_logs`.
 *
 * Visible only to portal_role === 'timan_backend'.
 */

import { useState } from "react";
import { CloudDownload, Loader2, AlertTriangle, CheckCircle2, X, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";

interface DryRunSummary {
  fetched: number;
  valid: number;
  created: number;
  updated: number;
  skipped: number;
  warnings: number;
  dryRun: boolean;
  durationMs: number;
  warningDetails?: string[];
}

interface Props {
  /** Compact button (used inside SharePointSyncPanel toolbar). */
  compact?: boolean;
  /** Called when user clicks "Synkroniser nu" from inside the dry-run modal. */
  onRequestRealSync?: () => void;
  /** Called after a real sync finishes (so panel can refresh latest sync log). */
  onSyncedFromModal?: () => void;
}

export default function SharePointDryRunButton({ compact, onRequestRealSync }: Props) {
  const { appUser } = useAppUser();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DryRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  if (!appUser || appUser.portal_role !== "timan_backend") return null;

  async function runDryRun() {
    setBusy(true);
    setError(null);
    setResult(null);
    setModalOpen(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        setError("Du er ikke logget ind med Supabase Auth. Log ind igen som Timan Backend.");
        return;
      }
      const { data, error: fnErr } = await supabase.functions.invoke(
        "sharepoint-sync-dealers",
        { body: { dryRun: true } },
      );
      if (fnErr) {
        let serverMsg: string | null = null;
        try {
          const ctx = (fnErr as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            serverMsg = body?.error ?? null;
          }
        } catch { /* ignore */ }
        const raw = serverMsg ?? fnErr.message ?? "Ukendt fejl";
        let friendly = raw;
        if (/Missing Microsoft secrets/i.test(raw)) {
          friendly = "Manglende secrets i Supabase (MICROSOFT_TENANT_ID/CLIENT_ID/CLIENT_SECRET).";
        } else if (/Forbidden/i.test(raw)) {
          friendly = "Adgang nægtet — kun Timan Backend.";
        } else if (/Unauthorized/i.test(raw)) {
          friendly = "Ugyldig session. Log ud og ind igen.";
        } else if (/Failed to send a request to the Edge Function|not found|404/i.test(raw)) {
          friendly = "Edge Function 'sharepoint-sync-dealers' blev ikke fundet.";
        }
        setError(friendly);
        return;
      }
      if ((data as { error?: string })?.error) {
        setError(String((data as { error?: string }).error));
        return;
      }
      setResult(data as DryRunSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    // Discard dry-run result so it does not persist on the page.
    setResult(null);
    setError(null);
  }

  const triggerBtnCls = compact
    ? "inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-60"
    : "inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-60";

  return (
    <>
      <button
        type="button"
        onClick={() => void runDryRun()}
        disabled={busy}
        className={triggerBtnCls}
        title="Henter SharePoint-data og viser hvad sync vil ændre. Skriver intet."
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
        {busy ? "Kører dry-run…" : "Dry-run"}
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CloudDownload className="h-4 w-4 text-sky-600" /> Dry-run resultat
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Luk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 text-sm text-slate-800 min-h-[120px]">
              {busy && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" /> Henter SharePoint-data…
                </div>
              )}

              {error && !busy && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-600 flex-shrink-0" />
                  <div>
                    <p className="font-bold">Dry-run fejlede</p>
                    <p className="mt-1 whitespace-pre-line">{error}</p>
                  </div>
                </div>
              )}

              {result && !busy && !error && (
                <>
                  <div className="flex items-center gap-2 text-emerald-900">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <p className="text-sm font-bold">
                      Dry-run færdig (ingen skrivning) · {result.durationMs} ms
                    </p>
                  </div>
                  <ul className="text-sm space-y-1.5">
                    <li><strong>{result.updated}</strong> opdateres</li>
                    <li><strong>{result.created}</strong> oprettes</li>
                    <li><strong>0</strong> slettes</li>
                    {result.warnings > 0 && (
                      <li className="text-amber-900"><strong>{result.warnings}</strong> advarsler</li>
                    )}
                  </ul>
                  {result.warningDetails && result.warningDetails.length > 0 && (
                    <details className="text-xs text-slate-700">
                      <summary className="cursor-pointer font-bold">
                        Vis advarsler ({result.warningDetails.length})
                      </summary>
                      <ul className="mt-2 list-disc pl-5 space-y-1">
                        {result.warningDetails.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </details>
                  )}
                  <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                    Dry-run-resultatet gemmes ikke. Det forsvinder når du lukker dette vindue.
                  </p>
                </>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Luk
              </button>
              {result && !busy && !error && onRequestRealSync && (
                <button
                  type="button"
                  onClick={() => { closeModal(); onRequestRealSync(); }}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Zap className="h-3.5 w-3.5" /> Synkroniser nu
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
