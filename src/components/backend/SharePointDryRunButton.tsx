/**
 * Admin-only button to trigger a SharePoint sync DRY-RUN.
 * Calls Edge Function `sharepoint-sync-dealers` with { dryRun: true }.
 * Never writes to dealer_accounts. Visible only to portal_role === 'timan_backend'.
 */

import { useState } from "react";
import { CloudDownload, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
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

export default function SharePointDryRunButton() {
  const { appUser } = useAppUser();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DryRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!appUser || appUser.portal_role !== "timan_backend") return null;

  async function runDryRun() {
    setBusy(true);
    setError(null);
    setResult(null);
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
          friendly =
            "Manglende secrets i Supabase: MICROSOFT_TENANT_ID / MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET. " +
            "Tilføj dem i Supabase → Edge Functions → Secrets.";
        } else if (/Forbidden/i.test(raw)) {
          friendly = "Adgang nægtet — kun brugere med portal_role = 'timan_backend' kan køre denne sync.";
        } else if (/Unauthorized/i.test(raw)) {
          friendly = "Ugyldig session. Log ud og ind igen.";
        } else if (/Failed to send a request to the Edge Function|not found|404/i.test(raw)) {
          friendly = "Edge Function 'sharepoint-sync-dealers' blev ikke fundet. Er den deployed?";
        }
        setError(friendly);
        return;
      }
      if (data?.error) {
        setError(String(data.error));
        return;
      }
      setResult(data as DryRunSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center flex-shrink-0">
            <CloudDownload className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">SharePoint dealer sync — Dry-run</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Henter rækker fra SharePoint-listen <code>DebitorFiltered</code> og viser hvad der ville blive
              oprettet/opdateret. Skriver <strong>ikke</strong> til <code>dealer_accounts</code>.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void runDryRun()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
          {busy ? "Kører dry-run…" : "Kør SharePoint dry-run"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-bold">Dry-run fejlede</p>
            <p className="mt-1 whitespace-pre-line">{error}</p>
          </div>
        </div>
      )}

      {result && !error && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2 text-emerald-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-bold">
              Dry-run færdig {result.dryRun ? "(ingen skrivning)" : "(LIVE)"} · {result.durationMs} ms
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
            <Metric label="fetched" value={result.fetched} />
            <Metric label="valid" value={result.valid} />
            <Metric label="created" value={result.created} tone="green" />
            <Metric label="updated" value={result.updated} tone="blue" />
            <Metric label="skipped" value={result.skipped} tone={result.skipped ? "amber" : undefined} />
            <Metric label="warnings" value={result.warnings} tone={result.warnings ? "amber" : undefined} />
            <Metric label="dryRun" value={String(result.dryRun)} />
          </div>
          {result.warningDetails && result.warningDetails.length > 0 && (
            <details className="mt-3 text-xs text-slate-700">
              <summary className="cursor-pointer font-bold">Warnings ({result.warningDetails.length})</summary>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                {result.warningDetails.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: "green" | "blue" | "amber" }) {
  const toneCls =
    tone === "green" ? "bg-emerald-100 text-emerald-900"
    : tone === "blue" ? "bg-sky-100 text-sky-900"
    : tone === "amber" ? "bg-amber-100 text-amber-900"
    : "bg-white text-slate-900";
  return (
    <div className={`rounded-md border border-slate-200 px-3 py-2 ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="font-mono font-bold text-sm">{value}</div>
    </div>
  );
}
