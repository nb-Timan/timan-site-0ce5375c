/**
 * Confirmation and execution for a previously selected SharePoint dealer set.
 * This component deliberately has no bulk trigger: a real sync always carries
 * the explicit `selected_account_ids` allowlist returned from dry-run.
 */

import { forwardRef, useImperativeHandle, useState } from "react";
import { AlertTriangle, Loader2, X, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";

export interface SharePointRealSyncHandle {
  start: (selectedAccountIds: string[]) => void;
}

interface Props {
  onSynced?: () => void;
}

const SharePointRealSyncButton = forwardRef<SharePointRealSyncHandle, Props>(function SharePointRealSyncButton(
  { onSynced }: Props,
  ref,
) {
  const { appUser } = useAppUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[] | null>(null);

  useImperativeHandle(ref, () => ({ start: (accountIds) => openConfirm(accountIds) }), []);

  if (!appUser || appUser.portal_role !== "timan_backend") return null;

  function openConfirm(accountIds: string[]) {
    const uniqueAccountIds = [...new Set(accountIds.map((accountId) => accountId.trim()).filter(Boolean))];
    if (uniqueAccountIds.length === 0) {
      setError("Vælg mindst en forhandler i dry-run, før synkronisering.");
      return;
    }
    setError(null);
    setSelectedAccountIds(uniqueAccountIds);
  }

  async function runReal() {
    if (!selectedAccountIds?.length) return;
    setBusy(true);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Du er ikke logget ind. Log ind igen som Timan Backend.");
      const { data, error: functionError } = await supabase.functions.invoke(
        "sharepoint-sync-dealers",
        { body: { dryRun: false, selected_account_ids: selectedAccountIds } },
      );
      if (functionError) {
        let serverMessage: string | null = null;
        try {
          const context = (functionError as { context?: Response }).context;
          if (context && typeof context.json === "function") {
            const body = await context.json();
            serverMessage = body?.error ?? null;
          }
        } catch { /* Preserve the provider message below. */ }
        throw new Error(serverMessage ?? functionError.message ?? "Ukendt fejl");
      }
      if ((data as { error?: string })?.error) throw new Error(String((data as { error?: string }).error));
      setSelectedAccountIds(null);
      onSynced?.();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError));
    } finally {
      setBusy(false);
    }
  }

  const count = selectedAccountIds?.length ?? 0;
  const noun = count === 1 ? "forhandler" : "forhandlere";

  return (
    <>
      {error && (
        <div className="mt-3 flex w-full items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600" />
          <div><p className="font-bold">Sync fejlede</p><p className="mt-1 whitespace-pre-line">{error}</p></div>
        </div>
      )}

      {selectedAccountIds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Zap className="h-4 w-4 text-emerald-600" /> Bekræft SharePoint-sync</h2>
              <button type="button" onClick={() => setSelectedAccountIds(null)} disabled={busy} className="text-slate-400 hover:text-slate-700" aria-label="Luk"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm text-slate-800">
              <p>Du er ved at synkronisere <strong>{count} valgt{count === 1 ? "" : "e"} {noun}</strong> fra SharePoint.</p>
              <p>Kun de valgte records ændres. CRM, tilbud, ordrer og aktiviteter påvirkes ikke.</p>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                SharePoint ejer kun eksisterende stamdatafelter som navn, adresse, land og kundetype. Ingen partner slettes.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setSelectedAccountIds(null)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Annuller</button>
              <button type="button" onClick={() => void runReal()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                {busy ? "Synkroniserer..." : `Synkronisér ${count} ${noun}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default SharePointRealSyncButton;
