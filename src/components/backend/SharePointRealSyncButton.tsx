/**
 * Timan Backend only: Run REAL SharePoint → dealer_accounts sync.
 *
 * Flow:
 *  1. Click "Synkroniser nu"
 *  2. Pre-flight: invoke edge function with { dryRun: true } to learn
 *     how many rows will be updated/created.
 *  3. Show confirmation dialog with exact counts.
 *  4. On confirm: invoke edge function with { dryRun: false }.
 *  5. Notify parent (panel) so latest sync log can be refreshed.
 *
 * SharePoint is masterdata ONLY for:
 *   company_name, dealer_type, country,
 *   source_customer_type_code, source_modified_at, last_synced_at
 *
 * NEVER overwrites assigned_seller / crm / users / offers / orders /
 * activities / budgets / notes / permissions / relationships.
 */

import { forwardRef, useImperativeHandle, useState } from "react";
import { Loader2, AlertTriangle, Zap, X } from "lucide-react";
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

export interface SharePointRealSyncHandle {
  /** Start the pre-flight → confirm → run flow programmatically. */
  start: () => void;
}

interface Props {
  compact?: boolean;
  onSynced?: () => void;
}

const SharePointRealSyncButton = forwardRef<SharePointRealSyncHandle, Props>(function SharePointRealSyncButton(
  { compact, onSynced }: Props,
  ref,
) {
  const { appUser } = useAppUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SyncSummary | null>(null);

  useImperativeHandle(ref, () => ({ start: () => void openConfirm() }), []);

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
    if ((data as { error?: string })?.error) throw new Error(String((data as { error?: string }).error));
    return data as SyncSummary;
  }

  async function openConfirm() {
    setBusy(true); setError(null); setPreview(null);
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
      await invokeSync(false);
      setPreview(null);
      onSynced?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const btnCls = compact
    ? "inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
    : "inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60";

  return (
    <>
      <button
        type="button"
        onClick={() => void openConfirm()}
        disabled={busy}
        className={btnCls}
        title="Opdaterer kun stamdata. CRM, brugere, tilbud, ordrer og aktiviteter bevares."
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
        {busy ? "Arbejder…" : "Synkroniser nu"}
      </button>

      {error && (
        <div className="mt-3 w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-bold">Sync fejlede</p>
            <p className="mt-1 whitespace-pre-line">{error}</p>
          </div>
        </div>
      )}

      {preview && (
        <ConfirmDialog
          preview={preview}
          busy={busy}
          onCancel={() => setPreview(null)}
          onConfirm={() => void runReal()}
        />
      )}
    </>
  );
});

export default SharePointRealSyncButton;

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
          <p><strong>{preview.updated}</strong> partner{preview.updated === 1 ? "" : "e"} vil blive opdateret.</p>
          <p><strong>{preview.created}</strong> {preview.created === 1 ? "ny partner" : "nye partnere"} vil blive oprettet.</p>
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
