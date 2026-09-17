/**
 * Backend-only SharePoint dealer dry-run and selective-sync picker.
 * The Edge Function remains the authority: selected account numbers are sent
 * as an allowlist and revalidated before any write.
 */

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, CloudDownload, Loader2, X, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";

export interface SharePointSyncFieldDiff {
  field: string;
  portal: unknown;
  sharepoint: unknown;
}

export interface SharePointSyncCandidate {
  account_number: string;
  company_name: string;
  country: string | null;
  change_type: "create" | "update";
  changed_field_count: number;
  changed_fields: SharePointSyncFieldDiff[];
}

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
  changes?: SharePointSyncCandidate[];
}

export interface SharePointDryRunHandle {
  start: () => void;
}

interface Props {
  compact?: boolean;
  onRequestRealSync?: (selectedAccountIds: string[]) => void;
  hideTrigger?: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  account_number: "Kontonummer",
  company_name: "Firmanavn",
  dealer_type: "Partnertype",
  customer_type: "Kundetype",
  customer_type_label: "Kundetype",
  source_customer_type_code: "SharePoint-kundekode",
  country: "Land",
  address_line_1: "Adresse",
  address_line_2: "Adresse linje 2",
  zip_city_raw: "Postnr. og by",
  postal_code: "Postnr.",
  city: "By",
};

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

const SharePointDryRunButton = forwardRef<SharePointDryRunHandle, Props>(function SharePointDryRunButton(
  { compact, onRequestRealSync, hideTrigger }: Props,
  ref,
) {
  const { appUser } = useAppUser();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DryRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());

  useImperativeHandle(ref, () => ({ start: () => void runDryRun() }), []);

  if (!appUser || appUser.portal_role !== "timan_backend") return null;

  async function runDryRun() {
    setBusy(true);
    setError(null);
    setResult(null);
    setSelectedAccountIds(new Set());
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
        } catch { /* Keep the provider error below. */ }
        throw new Error(serverMsg ?? fnErr.message ?? "Ukendt fejl");
      }
      if ((data as { error?: string })?.error) throw new Error(String((data as { error?: string }).error));
      setResult(data as DryRunSummary);
    } catch (runError) {
      const raw = runError instanceof Error ? runError.message : String(runError);
      if (/Missing Microsoft secrets/i.test(raw)) {
        setError("Manglende secrets i Supabase (MICROSOFT_TENANT_ID/CLIENT_ID/CLIENT_SECRET).");
      } else if (/Forbidden/i.test(raw)) {
        setError("Adgang nægtet - kun Timan Backend.");
      } else if (/Unauthorized/i.test(raw)) {
        setError("Ugyldig session. Log ud og ind igen.");
      } else if (/Failed to send a request to the Edge Function/i.test(raw)) {
        setError("Edge Function 'sharepoint-sync-dealers' blev ikke fundet.");
      } else {
        setError(raw);
      }
    } finally {
      setBusy(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setResult(null);
    setError(null);
    setSelectedAccountIds(new Set());
  }

  const candidates = result?.changes ?? [];
  const selectedCount = selectedAccountIds.size;
  const allSelected = candidates.length > 0 && selectedCount === candidates.length;

  function toggleCandidate(accountNumber: string) {
    setSelectedAccountIds((current) => {
      const next = new Set(current);
      if (next.has(accountNumber)) next.delete(accountNumber);
      else next.add(accountNumber);
      return next;
    });
  }

  function selectAll() {
    setSelectedAccountIds(new Set(candidates.map((candidate) => candidate.account_number)));
  }

  const selectedIds = useMemo(() => [...selectedAccountIds], [selectedAccountIds]);
  const triggerBtnCls = compact
    ? "inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-60"
    : "inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-60";

  return (
    <>
      {!hideTrigger && (
        <button type="button" onClick={() => void runDryRun()} disabled={busy} className={triggerBtnCls}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
          {busy ? "Kører dry-run..." : "Dry-run"}
        </button>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6">
          <div className="flex max-h-full w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <CloudDownload className="h-4 w-4 text-sky-600" /> Dry-run og vælg forhandlere
              </h2>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-700" aria-label="Luk">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-[120px] overflow-y-auto px-5 py-4 text-sm text-slate-800">
              {busy && <div className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Henter SharePoint-data...</div>}

              {error && !busy && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600" />
                  <div><p className="font-bold">Dry-run fejlede</p><p className="mt-1 whitespace-pre-line">{error}</p></div>
                </div>
              )}

              {result && !busy && !error && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-900">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <p className="font-bold">Dry-run færdig (ingen skrivning) · {result.durationMs} ms</p>
                  </div>
                  <p className="text-sm text-slate-700">
                    {result.updated} opdateres · {result.created} oprettes · 0 slettes. Vælg aktivt de rækker, der må synkroniseres.
                  </p>

                  {candidates.length > 0 ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="text-xs font-semibold text-slate-700">{selectedCount} valgt</span>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={selectAll} disabled={allSelected} className="text-xs font-bold text-sky-700 hover:text-sky-900 disabled:opacity-50">Vælg alle</button>
                          <button type="button" onClick={() => setSelectedAccountIds(new Set())} disabled={selectedCount === 0} className="text-xs font-bold text-slate-600 hover:text-slate-900 disabled:opacity-50">Fravælg alle</button>
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {candidates.map((candidate) => {
                          const selected = selectedAccountIds.has(candidate.account_number);
                          return (
                            <li key={candidate.account_number} className={`rounded-lg border ${selected ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
                              <label className="flex cursor-pointer items-start gap-3 px-3 py-3">
                                <input type="checkbox" checked={selected} onChange={() => toggleCandidate(candidate.account_number)} className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                                <span className="min-w-0 flex-1">
                                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <strong className="text-slate-900">{candidate.company_name}</strong>
                                    <span className="text-xs text-slate-500">#{candidate.account_number}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${candidate.change_type === "create" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-900"}`}>
                                      {candidate.change_type === "create" ? "OPRETTES" : "OPDATERES"}
                                    </span>
                                  </span>
                                  <span className="mt-1 block text-xs text-slate-600">{candidate.country || "Land mangler"} · {candidate.changed_field_count} {candidate.changed_field_count === 1 ? "felt ændres" : "felter ændres"}</span>
                                </span>
                              </label>
                              <details className="border-t border-slate-100 px-3 py-2 text-xs">
                                <summary className="flex cursor-pointer list-none items-center gap-1 font-bold text-slate-700"><ChevronDown className="h-3.5 w-3.5" /> Vis feltdiff</summary>
                                <div className="mt-2 overflow-x-auto">
                                  <table className="min-w-full text-left">
                                    <thead className="text-slate-500"><tr><th className="pr-3 pb-1">Felt</th><th className="pr-3 pb-1">Portal nu</th><th className="pb-1">SharePoint</th></tr></thead>
                                    <tbody>{candidate.changed_fields.map((field) => <tr key={field.field} className="border-t border-slate-100 align-top"><td className="py-1 pr-3 font-semibold">{FIELD_LABELS[field.field] ?? field.field}</td><td className="py-1 pr-3 text-slate-600">{displayValue(field.portal)}</td><td className="py-1 font-semibold text-slate-900">{displayValue(field.sharepoint)}</td></tr>)}</tbody>
                                  </table>
                                </div>
                              </details>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">Ingen SharePoint-masterdata afviger. Der er intet at synkronisere.</div>
                  )}

                  {result.warningDetails && result.warningDetails.length > 0 && (
                    <details className="text-xs text-slate-700"><summary className="cursor-pointer font-bold">Vis advarsler ({result.warningDetails.length})</summary><ul className="mt-2 list-disc space-y-1 pl-5">{result.warningDetails.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>
                  )}
                  <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">Portal-rækker uden SharePoint-match slettes aldrig af dette flow.</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={closeModal} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Luk</button>
              {result && !busy && !error && onRequestRealSync && (
                <button type="button" onClick={() => { closeModal(); onRequestRealSync(selectedIds); }} disabled={selectedCount === 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                  <Zap className="h-3.5 w-3.5" /> Synkronisér valgte ({selectedCount})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default SharePointDryRunButton;
