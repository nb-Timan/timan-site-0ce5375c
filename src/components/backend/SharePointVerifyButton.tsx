/**
 * Admin-only: read-only SharePoint → dealer_accounts mapping verification.
 * Calls Edge Function `sharepoint-sync-dealers` with { mode: "verify", limit: 20 }.
 * NEVER writes to dealer_accounts. Visible only to portal_role === 'timan_backend'.
 *
 * SharePoint = masterdata. Afvigelser betyder at dealer_accounts vil blive
 * opdateret til SharePoint-værdien ved rigtig sync.
 */

import { useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, ScanSearch, Check, X, ArrowRight } from "lucide-react";
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

const FIELD_LABELS: Record<string, string> = {
  account_number: "Kontonummer",
  company_name: "Firmanavn",
  dealer_type: "Forhandlertype",
  country: "Land",
};

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

  // Visible fields used for "row mismatch" determination
  const visibleFields = ["account_number", "company_name", "dealer_type", "country"];

  // Compute display state per comparison row
  function rowState(cmp: Comparison): {
    kind: "missing" | "mismatch" | "match";
    label: string;
    tone: string;
    diffFields: FieldResult[];
  } {
    if (!cmp.exists_in_dealer_accounts) {
      return {
        kind: "missing",
        label: "Findes ikke i portal (oprettes ved sync)",
        tone: "bg-sky-50 text-sky-900 border-sky-200",
        diffFields: [],
      };
    }
    const diffFields = cmp.fields.filter(
      (f) => visibleFields.includes(f.field) && f.match === false,
    );
    if (diffFields.length === 0) {
      return {
        kind: "match",
        label: "Matcher SharePoint",
        tone: "bg-emerald-50 text-emerald-900 border-emerald-200",
        diffFields: [],
      };
    }
    return {
      kind: "mismatch",
      label: "Afviger fra SharePoint",
      tone: "bg-amber-50 text-amber-900 border-amber-200",
      diffFields,
    };
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
              SharePoint er <strong>masterdata</strong>. Afvigelser viser, hvilke felter i{" "}
              <code>dealer_accounts</code> der bliver opdateret ved rigtig sync. <strong>Skriver intet</strong>.
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

      {result && !error && (() => {
        // Recompute mismatch totals based on visible-field logic in the sample
        const sampleMismatches = result.comparisons.filter((c) => rowState(c).kind === "mismatch").length;
        const sampleMissing = result.comparisons.filter((c) => rowState(c).kind === "missing").length;
        const summaryLine = result.mismatches > 0
          ? `${result.mismatches} rækker afviger fra SharePoint og vil blive opdateret ved rigtig sync.`
          : "Alle kontrollerede rækker matcher SharePoint.";

        return (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-bold">
                  Analyse færdig (read-only) · {result.durationMs} ms
                </p>
              </div>
              <p className="text-xs text-emerald-900 mt-1">{summaryLine}</p>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                <Metric label="kontrolleret" value={result.total_checked} />
                <Metric label="matcher" value={result.matches} tone="green" />
                <Metric label="afviger" value={result.mismatches} tone={result.mismatches ? "amber" : undefined} />
                <Metric label="mangler i portal" value={result.missing_in_dealer_accounts} tone={result.missing_in_dealer_accounts ? "blue" : undefined} />
                <Metric label="mangler i SP" value={result.missing_in_sharepoint} tone={result.missing_in_sharepoint ? "amber" : undefined} />
                <Metric label="portal total" value={result.total_dealer_accounts} />
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-700 mb-2">
                Side-om-side prøve ({result.sample_size} af {result.total_sharepoint} SharePoint-rækker) ·{" "}
                <span className="text-amber-700">{sampleMismatches} afviger</span>
                {sampleMissing > 0 && <> · <span className="text-sky-700">{sampleMissing} oprettes</span></>}
              </p>

              <div className="space-y-3">
                {result.comparisons.map((cmp) => {
                  const st = rowState(cmp);
                  return (
                    <div
                      key={cmp.account_number}
                      className={`rounded-lg border ${st.tone} px-4 py-3`}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="font-mono font-bold text-slate-900">
                          {cmp.account_number}
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/60 px-2.5 py-0.5 text-[11px] font-bold">
                          {st.kind === "match" && <Check className="h-3 w-3 text-emerald-600" />}
                          {st.kind === "mismatch" && <AlertTriangle className="h-3 w-3 text-amber-600" />}
                          {st.kind === "missing" && <ArrowRight className="h-3 w-3 text-sky-600" />}
                          {st.label}
                        </span>
                      </div>

                      {st.kind === "mismatch" && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="text-slate-700">
                              <tr>
                                <th className="px-2 py-1 text-left font-bold">Felt</th>
                                <th className="px-2 py-1 text-left font-bold">Nuværende portalværdi</th>
                                <th className="px-2 py-1 text-left font-bold">SharePoint-værdi</th>
                                <th className="px-2 py-1 text-left font-bold">Handling ved sync</th>
                              </tr>
                            </thead>
                            <tbody>
                              {st.diffFields.map((fr) => (
                                <tr key={fr.field} className="border-t border-amber-200/60">
                                  <td className="px-2 py-1.5 font-mono text-slate-700">
                                    {FIELD_LABELS[fr.field] ?? fr.field}
                                  </td>
                                  <td className="px-2 py-1.5 font-mono text-slate-900">{display(fr.dealer_accounts)}</td>
                                  <td className="px-2 py-1.5 font-mono text-slate-900">{display(fr.sharepoint)}</td>
                                  <td className="px-2 py-1.5">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-200/60 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                                      <ArrowRight className="h-3 w-3" /> Opdateres
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {st.kind === "missing" && (
                        <p className="mt-2 text-xs text-sky-900">
                          SharePoint-rækken findes ikke i <code>dealer_accounts</code> og vil blive{" "}
                          <strong>oprettet</strong> ved rigtig sync.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
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
