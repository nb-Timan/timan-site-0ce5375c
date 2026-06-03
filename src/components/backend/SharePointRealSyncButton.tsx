/**
 * Timan Backend only: Run REAL SharePoint → dealer_accounts sync.
 *
 * Flow:
 *  1. Click "Kør rigtig SharePoint sync"
 *  2. Pre-flight: invoke edge function with { dryRun: true } to learn
 *     how many rows will be updated/created.
 *  3. Show confirmation dialog with exact counts.
 *  4. On confirm: invoke edge function with { dryRun: false }.
 *
 * SharePoint is masterdata ONLY for:
 *   company_name, dealer_type, country,
 *   source_customer_type_code, source_modified_at, last_synced_at
 *
 * NEVER overwrites assigned_seller / crm / users / offers / orders /
 * activities / budgets / notes / permissions / relationships.
 */

import { useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, ShieldCheck, Zap, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";

interface SyncSummary {
  fetched: number;
  valid: number;
  created: number;
  updated: number;
  skipped: number;
  warnings: number;
  dryRun: boolean;
  warningDetails: string[];
  durationMs: number;
}

export default function SharePointRealSyncButton() {
  const { appUser } = useAppUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SyncSummary | null>(null);
  const [result, setResult] = useState<SyncSummary | null>(null);

  if (!appUser || appUser.portal_role !== "timan_backend") return null;

  async function invokeSync(dryRun: boolean): Promise<SyncSummary> {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw new Error("Du er ikke logget ind. Log ind igen som Timan Backend.");
    const { data, error: fnErr } = await supabase.functions.invoke(
      "sharepoint-sync-dealers",
      { body: { dryRun } },
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
      throw new Error(serverMsg ?? fnErr.message ?? "Ukendt fejl");
    }
    if ((data as any)?.error) throw new Error(String((data as any).error));
    return data as SyncSummary;
  }

  async function openConfirm() {
    setBusy(true); setError(null); setResult(null); setPreview(null);
    try {
      const dry = await invokeSync(true);
      setPreview(dry);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runReal() {
    setBusy(true); setError(null);
    try {
      const real = await invokeSync(false);
      setResult(real);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Zap className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Rigtig SharePoint sync</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Opdaterer kun <strong>stamdata</strong> i <code>dealer_accounts</code> (firmanavn, land, kundetype).
              CRM-data, brugere, tilbud, ordrer, aktiviteter og budgetter bevares.
            </p>
            <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-600" />
              Ingen sletninger. Ingen nulstillinger. Manuel kørsel.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void openConfirm()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          {busy ? "Arbejder…" : "Kør rigtig SharePoint sync"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-bold">Sync fejlede</p>
            <p className="mt-1 whitespace-pre-line">{error}</p>
          </div>
        </div>
      )}

      {result && !error && (
        <div className="mt-4 rounded-lg border border-emerald-300 bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-emerald-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-bold">Sync færdig · {result.durationMs} ms</p>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <Metric label="Updated" value={result.updated} tone="green" />
            <Metric label="Created" value={result.created} tone="blue" />
            <Metric label="Skipped" value={result.skipped} />
            <Metric label="Warnings" value={result.warnings} tone={result.warnings ? "amber" : undefined} />
            <Metric label="Duration (ms)" value={result.durationMs} />
          </div>
          {result.warningDetails.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer font-bold text-amber-900">
                Vis advarsler ({result.warningDetails.length})
              </summary>
              <ul className="mt-2 list-disc pl-5 space-y-0.5 text-amber-900">
                {result.warningDetails.map((w, i) => <li key={i} className="font-mono">{w}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {preview && !result && (
        <ConfirmDialog
          preview={preview}
          busy={busy}
          onCancel={() => setPreview(null)}
          onConfirm={() => void runReal()}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  preview, busy, onCancel, onConfirm,
}: {
  preview: SyncSummary;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Zap className="h-4 w-4 text-emerald-600" /> Bekræft rigtig SharePoint sync
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Luk"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-slate-800">
          <p>
            <strong>{preview.updated}</strong> partner{preview.updated === 1 ? "" : "e"} vil blive opdateret.
          </p>
          <p>
            <strong>{preview.created}</strong> {preview.created === 1 ? "ny partner" : "nye partnere"} vil blive oprettet.
          </p>
          <p>Ingen partnere bliver slettet.</p>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
            SharePoint er masterdata for navn, land og kundetype. Portalens CRM-data, brugere, tilbud,
            ordrer og aktiviteter bevares.
          </div>
          <p className="text-sm font-semibold pt-1">Vil du fortsætte?</p>
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Annullér
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {busy ? "Synkroniserer…" : "Ja, kør sync"}
          </button>
        </div>
      </div>
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
