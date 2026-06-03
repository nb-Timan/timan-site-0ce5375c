/**
 * Admin-only: read-only SharePoint → dealer_accounts mapping verification.
 * Calls Edge Function `sharepoint-sync-dealers` with { mode: "verify" }.
 * NEVER writes to dealer_accounts. Visible only to portal_role === 'timan_backend'.
 *
 * SharePoint = masterdata. Afvigelser betyder at dealer_accounts vil blive
 * opdateret til SharePoint-værdien ved rigtig sync.
 */

import { useMemo, useState } from "react";
import {
  Loader2, AlertTriangle, CheckCircle2, ScanSearch, Check, ArrowRight, Search,
} from "lucide-react";
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
  exists_in_dealer_accounts?: boolean;
  exists_in_db?: boolean;
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

const DEALER_TYPE_LABELS: Record<string, string> = {
  dealer: "Forhandler",
  service_partner: "Service partner",
  importer: "Importør",
};

type FilterMode = "diff_and_missing" | "diff_only" | "missing_only" | "matches_only" | "all";

const FILTER_OPTIONS: { id: FilterMode; label: string }[] = [
  { id: "diff_and_missing", label: "Afvigelser og mangler" },
  { id: "diff_only", label: "Kun afvigelser" },
  { id: "missing_only", label: "Kun nye" },
  { id: "matches_only", label: "Kun matcher" },
  { id: "all", label: "Vis alle" },
];

export default function SharePointVerifyButton() {
  const { appUser } = useAppUser();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("diff_and_missing");
  const [search, setSearch] = useState("");

  if (!appUser || appUser.portal_role !== "timan_backend") return null;

  async function runVerify() {
    setBusy(true); setError(null); setResult(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) { setError("Du er ikke logget ind. Log ind igen som Timan Backend."); return; }
      const { data, error: fnErr } = await supabase.functions.invoke(
        "sharepoint-sync-dealers",
        { body: { mode: "verify", limit: 500 } },
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

  const visibleFields = ["account_number", "company_name", "dealer_type", "country"];

  function rowExistsInPortal(cmp: Comparison): boolean {
    if (typeof cmp.exists_in_dealer_accounts === "boolean") return cmp.exists_in_dealer_accounts;
    if (typeof cmp.exists_in_db === "boolean") return cmp.exists_in_db;
    return cmp.fields.some((f) => visibleFields.includes(f.field) && f.dealer_accounts != null && f.dealer_accounts !== "");
  }

  type RowKind = "missing" | "mismatch" | "match";
  function rowState(cmp: Comparison): {
    kind: RowKind; label: string; tone: string; diffFields: FieldResult[];
  } {
    if (!rowExistsInPortal(cmp)) {
      return { kind: "missing", label: "Findes ikke i portal", tone: "bg-sky-50 text-sky-900 border-sky-200", diffFields: [] };
    }
    const diffFields = cmp.fields.filter((f) => visibleFields.includes(f.field) && f.match === false);
    if (diffFields.length === 0) {
      return { kind: "match", label: "Matcher SharePoint", tone: "bg-emerald-50 text-emerald-900 border-emerald-200", diffFields: [] };
    }
    return { kind: "mismatch", label: "Afviger fra SharePoint", tone: "bg-amber-50 text-amber-900 border-amber-200", diffFields };
  }

  function getSpValue(cmp: Comparison, field: string): unknown {
    return cmp.fields.find((f) => f.field === field)?.sharepoint ?? null;
  }
  function getDaValue(cmp: Comparison, field: string): unknown {
    return cmp.fields.find((f) => f.field === field)?.dealer_accounts ?? null;
  }
  /** Header always shows SharePoint values (masterdata). */
  function getHeaderValues(cmp: Comparison) {
    return {
      company_name: getSpValue(cmp, "company_name") as string | null,
      account_number: cmp.account_number,
      country: getSpValue(cmp, "country") as string | null,
      dealer_type: getSpValue(cmp, "dealer_type") as string | null,
    };
  }

  const filteredAndCounts = useMemo(() => {
    if (!result) return { rows: [] as Comparison[], counts: { mismatch: 0, missing: 0, match: 0 } };
    const counts = { mismatch: 0, missing: 0, match: 0 };
    const withState = result.comparisons.map((c) => ({ c, st: rowState(c) }));
    for (const { st } of withState) counts[st.kind]++;

    const q = search.trim().toLowerCase();
    const matchesSearch = (c: Comparison) => {
      if (!q) return true;
      const h = getHeaderValues(c);
      return [h.company_name, h.account_number, h.country]
        .some((v) => v != null && String(v).toLowerCase().includes(q));
    };

    let kept = withState.filter(({ st }) => {
      switch (filter) {
        case "diff_and_missing": return st.kind === "mismatch" || st.kind === "missing";
        case "diff_only": return st.kind === "mismatch";
        case "missing_only": return st.kind === "missing";
        case "matches_only": return st.kind === "match";
        case "all": return true;
      }
    });
    kept = kept.filter(({ c }) => matchesSearch(c));
    return { rows: kept.map((x) => x.c), counts };
  }, [result, filter, search]);

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
              SharePoint er <strong>masterdata</strong>. Visningen viser, hvad rigtig sync vil ændre i{" "}
              <code>dealer_accounts</code>. <strong>Skriver intet</strong>.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Match = ingen ændringer · Afviger = opdateres fra SharePoint · Findes ikke i portal = oprettes.
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
        const summaryParts: string[] = [];
        if (result.mismatches > 0) {
          summaryParts.push(`${result.mismatches} rækker afviger fra SharePoint og vil blive opdateret ved rigtig sync.`);
        }
        if (result.missing_in_dealer_accounts > 0) {
          summaryParts.push(`${result.missing_in_dealer_accounts} rækker findes ikke i portal og vil blive oprettet ved rigtig sync.`);
        }
        const summaryLine = summaryParts.length > 0
          ? summaryParts.join(" ")
          : "Alle kontrollerede rækker matcher SharePoint.";

        const { rows, counts } = filteredAndCounts;

        return (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900">
              <strong>SharePoint er masterdata.</strong> Ved rigtig sync bliver portalens værdier opdateret til SharePoint-værdier.
            </div>
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

            {/* Filters + search */}
            <div className="flex flex-wrap items-center gap-2">
              {FILTER_OPTIONS.map((opt) => {
                const active = filter === opt.id;
                const count =
                  opt.id === "diff_and_missing" ? counts.mismatch + counts.missing
                  : opt.id === "diff_only" ? counts.mismatch
                  : opt.id === "missing_only" ? counts.missing
                  : opt.id === "matches_only" ? counts.match
                  : counts.mismatch + counts.missing + counts.match;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFilter(opt.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border transition ${
                      active
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {opt.label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20" : "bg-slate-100 text-slate-700"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
              <div className="ml-auto relative">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Søg firmanavn, kontonr., land…"
                  className="rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs w-64 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-700 mb-2">
                Viser {rows.length} af {result.comparisons.length} kontrollerede rækker
              </p>

              {rows.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-600">
                  Ingen rækker matcher det aktuelle filter / søgning.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {rows.map((cmp) => {
                    const st = rowState(cmp);
                    const h = getHeaderValues(cmp);
                    const dealerTypeLabel = h.dealer_type
                      ? (DEALER_TYPE_LABELS[String(h.dealer_type)] ?? String(h.dealer_type))
                      : "—";
                    return (
                      <div
                        key={cmp.account_number}
                        className={`rounded-xl border ${st.tone} px-5 py-4 min-h-[140px] flex flex-col`}
                      >
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="text-[17px] font-semibold text-slate-900 leading-tight">
                              {h.company_name || "—"}
                            </div>
                            <div className="mt-1.5 text-sm text-slate-700 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
                              <span className="font-mono">Account {h.account_number}</span>
                              <span className="text-slate-400">·</span>
                              <span>{h.country || "—"}</span>
                              <span className="text-slate-400">·</span>
                              <span>{dealerTypeLabel}</span>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-bold whitespace-nowrap shadow-sm">
                            {st.kind === "match" && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                            {st.kind === "mismatch" && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                            {st.kind === "missing" && <ArrowRight className="h-3.5 w-3.5 text-sky-600" />}
                            {st.label}
                          </span>
                        </div>

                        {st.kind === "mismatch" && (
                          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {st.diffFields.map((fr) => (
                              <div
                                key={fr.field}
                                className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2.5"
                              >
                                <div className="text-xs font-bold uppercase tracking-wide text-amber-900/80">
                                  {FIELD_LABELS[fr.field] ?? fr.field}
                                </div>
                                <div className="mt-2 grid grid-cols-[80px_1fr] gap-x-2 gap-y-1 text-sm">
                                  <span className="text-slate-500 font-medium">Portal:</span>
                                  <span className="font-mono text-slate-900 break-words">{display(fr.dealer_accounts)}</span>
                                  <span className="text-slate-500 font-medium">SharePoint:</span>
                                  <span className="font-mono text-slate-900 font-semibold break-words">{display(fr.sharepoint)}</span>
                                </div>
                                <div className="mt-2">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                                    <ArrowRight className="h-3 w-3" /> Opdateres ved sync
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {st.kind === "missing" && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-sky-900">
                            <span>Handling ved sync:</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-200/70 px-2.5 py-0.5 text-[11px] font-bold text-sky-900">
                              <ArrowRight className="h-3 w-3" /> Oprettes ved sync
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

              )}
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
