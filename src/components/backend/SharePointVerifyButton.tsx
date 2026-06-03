/**
 * Admin-only: read-only SharePoint → dealer_accounts mapping verification.
 * Calls Edge Function `sharepoint-sync-dealers` with { mode: "verify", limit: 20 }.
 * NEVER writes to dealer_accounts. Visible only to portal_role === 'timan_backend'.
 */

import { useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, ScanSearch, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";

interface FieldResult {
  field: string;
  sharepoint: unknown;
  dealer_accounts: unknown;
  match: boolean;
}
interface Comparison {
  account_number: string;
  exists_in_dealer_accounts: boolean;
  all_match: boolean;
  fields: FieldResult[];
}
interface VerifyResult {
  mode: "verify";
  dryRun: boolean;
  total_sharepoint: number;
  total_dealer_accounts: number;
  total_checked: number;
  matches: number;
  mismatches: number;
  missing_in_dealer_accounts: number;
  missing_in_sharepoint: number;
  sample_size: number;
  comparisons: Comparison[];
  durationMs: number;
}

export default function SharePointVerifyButton() {
  const { appUser } = useAppUser();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!appUser || appUser.portal_role !== "timan_backend") return null;

  async function runVerify() {
    setBusy(true); setError(null); setResult(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) { setError("Du er ikke logget ind. Log ind igen som Timan Backend."); return; }
      const { data, error: fnErr } = await supabase.functions.invoke(
        "sharepoint-sync-dealers",
        { body: { mode: "verify", limit: 20 } },
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
        if (/Missing Microsoft secrets/i.test(raw)) friendly = "Manglende secrets i Supabase (MICROSOFT_TENANT_ID/CLIENT_ID/CLIENT_SECRET).";
        else if (/Forbidden/i.test(raw)) friendly = "Adgang nægtet — kun Timan Backend.";
        else if (/Unauthorized/i.test(raw)) friendly = "Ugyldig session. Log ud og ind igen.";
        else if (/not found|404/i.test(raw)) friendly = "Edge Function 'sharepoint-sync-dealers' blev ikke fundet.";
        setError(friendly); return;
      }
      if ((data as any)?.error) { setError(String((data as any).error)); return; }
      setResult(data as VerifyResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <ScanSearch className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">SharePoint mapping verify (read-only)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Sammenligner SharePoint-rækker side om side med <code>dealer_accounts</code> (match på{" "}
              <code>account_number</code>). <strong>Skriver intet</strong>.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void runVerify()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
          {busy ? "Analyserer…" : "Verificér mapping"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-bold">Verify fejlede</p>
            <p className="mt-1 whitespace-pre-line">{error}</p>
          </div>
        </div>
      )}

      {result && !error && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-2 text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-bold">
                Analyse færdig (read-only) · {result.durationMs} ms
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              <Metric label="total checked" value={result.total_checked} />
              <Metric label="matches" value={result.matches} tone="green" />
              <Metric label="mismatches" value={result.mismatches} tone={result.mismatches ? "amber" : undefined} />
              <Metric label="missing i DB" value={result.missing_in_dealer_accounts} tone={result.missing_in_dealer_accounts ? "amber" : undefined} />
              <Metric label="missing i SP" value={result.missing_in_sharepoint} tone={result.missing_in_sharepoint ? "amber" : undefined} />
              <Metric label="DB total" value={result.total_dealer_accounts} />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-700 mb-2">
              Side-om-side prøve ({result.sample_size} af {result.total_sharepoint} SharePoint-rækker)
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-2 py-2 text-left font-bold">account_number</th>
                    <th className="px-2 py-2 text-left font-bold">felt</th>
                    <th className="px-2 py-2 text-left font-bold">SharePoint</th>
                    <th className="px-2 py-2 text-left font-bold">dealer_accounts</th>
                    <th className="px-2 py-2 text-center font-bold">match</th>
                  </tr>
                </thead>
                <tbody>
                  {result.comparisons.map((cmp) => (
                    cmp.fields.map((fr, idx) => (
                      <tr
                        key={`${cmp.account_number}-${fr.field}`}
                        className={
                          (idx === 0 ? "border-t-2 border-slate-300 " : "border-t border-slate-100 ") +
                          (!cmp.exists_in_dealer_accounts ? "bg-amber-50/50" : !fr.match ? "bg-rose-50/40" : "")
                        }
                      >
                        {idx === 0 ? (
                          <td className="px-2 py-1.5 align-top font-mono font-bold text-slate-900" rowSpan={cmp.fields.length}>
                            {cmp.account_number}
                            {!cmp.exists_in_dealer_accounts && (
                              <div className="text-[10px] font-normal text-amber-700 mt-0.5">mangler i DB</div>
                            )}
                          </td>
                        ) : null}
                        <td className="px-2 py-1.5 font-mono text-slate-600">{fr.field}</td>
                        <td className="px-2 py-1.5 font-mono text-slate-900">{display(fr.sharepoint)}</td>
                        <td className="px-2 py-1.5 font-mono text-slate-900">{display(fr.dealer_accounts)}</td>
                        <td className="px-2 py-1.5 text-center">
                          {fr.match
                            ? <Check className="inline h-3.5 w-3.5 text-emerald-600" />
                            : <X className="inline h-3.5 w-3.5 text-rose-600" />}
                        </td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function display(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
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
