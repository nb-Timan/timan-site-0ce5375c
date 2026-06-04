/**
 * Phase 1 panel — SharePoint synkronisering for the Warranty module.
 *
 * Placed in /portal/service/warranty Dashboard. Visible only to
 * portal_role 'timan_backend' or 'timan_service'. Hidden for all other
 * roles (sælger, dealer, importør, service partner, dealer_user).
 *
 * Buttons in Phase 1:
 *   1. Verificér SharePoint  → sharepoint-warranty-verify (read-only)
 *   2. Dry-run               → sharepoint-warranty-dryrun  (read-only)
 *
 * NO real-sync button in this phase. NO writes anywhere.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CloudCog, Loader2, AlertTriangle, ShieldCheck, X,
  ScanSearch, CloudDownload, CheckCircle2, Check,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";
import { fetchDealerAccounts, type DealerAccount } from "@/lib/dealerAccountsService";

// ---- Result shapes (must match edge function responses) ----

interface VerifyColumn {
  displayName: string | null;
  name: string | null;
  type: string;
  readOnly: boolean;
  hidden: boolean;
}
interface VerifyResult {
  list: { displayName: string; name: string; id: string; webUrl: string };
  row_count: number;
  column_count: number;
  columns: VerifyColumn[];
  required_fields: string[];
  missing_required: Array<{ item_id: string; missing: string[] }>;
  unknown_fields: Array<{ name: string; count: number }>;
  mapping_draft: Record<string, string>;
  warnings: string[];
  durationMs: number;
}

interface SafeMatch {
  sharepoint_item_id: string;
  dealer_name_snapshot: string;
  dealer_account_id: string;
  dealer_company_name: string;
  dealer_account_number: string | null;
  reason: "exact" | "alias";
}
interface NeedsReview {
  sharepoint_item_id: string;
  dealer_name_snapshot: string;
  candidates: Array<{
    dealer_account_id: string;
    company_name: string;
    account_number: string | null;
    score: number;
  }>;
}
interface Unmatched {
  sharepoint_item_id: string;
  dealer_name_snapshot: string;
}
interface DryRunResult {
  warranty_table_exists: boolean;
  warranty_table_empty?: boolean;
  resolved_field_names?: Record<string, string | null>;
  fetched: number;
  new: number;
  updates: number;
  unchanged: number;
  dealer_matching: {
    safe_matches_count: number;
    needs_review_count: number;
    unmatched_count: number;
    safe_matches: SafeMatch[];
    needs_review: NeedsReview[];
    unmatched: Unmatched[];
  };
  warnings: string[];
  durationMs: number;
}


type ModalState =
  | { kind: "none" }
  | { kind: "verify"; busy: boolean; error: string | null; data: VerifyResult | null }
  | { kind: "dryrun"; busy: boolean; error: string | null; data: DryRunResult | null };

async function invokeFn<T>(name: string): Promise<{ data: T | null; error: string | null }> {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return { data: null, error: "Ikke logget ind." };
  const { data, error } = await supabase.functions.invoke(name, { body: {} });
  if (error) {
    let msg: string | null = null;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        msg = body?.error ?? null;
      }
    } catch { /* ignore */ }
    return { data: null, error: msg ?? error.message ?? "Ukendt fejl" };
  }
  if ((data as { error?: string })?.error) {
    return { data: null, error: String((data as { error?: string }).error) };
  }
  return { data: data as T, error: null };
}

export default function WarrantySharePointSyncPanel() {
  const { appUser } = useAppUser();
  const [modal, setModal] = useState<ModalState>({ kind: "none" });

  const role = appUser?.portal_role;
  if (!appUser || (role !== "timan_backend" && role !== "timan_service")) return null;

  async function runVerify() {
    setModal({ kind: "verify", busy: true, error: null, data: null });
    const { data, error } = await invokeFn<VerifyResult>("sharepoint-warranty-verify");
    setModal({ kind: "verify", busy: false, error, data });
  }
  async function runDryRun() {
    setModal({ kind: "dryrun", busy: true, error: null, data: null });
    const { data, error } = await invokeFn<DryRunResult>("sharepoint-warranty-dryrun");
    setModal({ kind: "dryrun", busy: false, error, data });
  }

  return (
    <>
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <CloudCog className="h-5 w-5 text-slate-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900">SharePoint synkronisering</h2>
            <p className="mt-1 text-sm text-slate-600">
              Garantiregistreringer fra SharePoint-listen <em>Warranty registration</em>.
              Kun synlig for Timan Backend og Timan Service.
            </p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              Read-only fase. Der skrives intet til databasen.
            </div>
          </div>
        </div>

        {/* Tool rows */}
        <div className="divide-y divide-slate-100">
          <div className="px-5 py-4 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-slate-900">Verificér SharePoint</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-slate-700">
                Tjekker at listen kan læses, viser præcise interne feltnavne, antal rækker, manglende obligatoriske felter og ukendte felter.
              </p>
            </div>
            <button
              type="button"
              onClick={runVerify}
              disabled={modal.kind === "verify" && modal.busy}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-5 py-2.5 h-10 text-sm font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 flex-shrink-0"
            >
              {modal.kind === "verify" && modal.busy
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ScanSearch className="h-4 w-4" />}
              Verificér SharePoint
            </button>
          </div>

          <div className="px-5 py-4 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-slate-900">Dry-run</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-slate-700">
                Henter alle rækker, mapper dem in-memory og viser hvad en fremtidig sync ville gøre — inkl. sikre dealer-matches, kræver gennemgang og unmatched.
              </p>
            </div>
            <button
              type="button"
              onClick={runDryRun}
              disabled={modal.kind === "dryrun" && modal.busy}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-5 py-2.5 h-10 text-sm font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-60 flex-shrink-0"
            >
              {modal.kind === "dryrun" && modal.busy
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CloudDownload className="h-4 w-4" />}
              Dry-run
            </button>
          </div>

          <div className="px-5 py-3 bg-slate-50 text-xs text-slate-500">
            Rigtig sync (<em>Synkroniser med SharePoint</em>) aktiveres først i næste fase, når Backend og Service har bekræftet dry-run-resultatet.
          </div>
        </div>
      </div>

      {modal.kind !== "none" && (
        <Modal title={modal.kind === "verify" ? "Verificér SharePoint" : "Dry-run"} onClose={() => setModal({ kind: "none" })}>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900 flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <strong className="text-sm">Read-only. Der skrives intet til databasen.</strong>
          </div>

          {modal.busy && (
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {modal.kind === "verify" ? "Verificerer SharePoint…" : "Henter og analyserer SharePoint…"}
            </div>
          )}

          {modal.error && !modal.busy && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-600 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-bold">Fejl</p>
                <p className="mt-1 whitespace-pre-line">{modal.error}</p>
              </div>
            </div>
          )}

          {!modal.busy && !modal.error && modal.kind === "verify" && modal.data && (
            <VerifyView data={modal.data} />
          )}
          {!modal.busy && !modal.error && modal.kind === "dryrun" && modal.data && (
            <DryRunView data={modal.data} onRerun={runDryRun} />
          )}
        </Modal>
      )}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Luk">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 text-sm text-slate-800">{children}</div>
        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end flex-shrink-0">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            Luk
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="text-sm font-bold text-slate-900 mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, tone = "slate" }: { label: string; value: number | string; tone?: "slate" | "emerald" | "amber" | "rose" | "sky" }) {
  const colors: Record<string, string> = {
    slate: "bg-slate-50 border-slate-200 text-slate-900",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    rose: "bg-rose-50 border-rose-200 text-rose-900",
    sky: "bg-sky-50 border-sky-200 text-sky-900",
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[tone]}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-0.5 text-xl font-black">{value}</div>
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  if (!warnings || warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Ingen warnings.
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {warnings.map((w, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}

function VerifyView({ data }: { data: VerifyResult }) {
  const columns = data.columns ?? [];
  const missingRequired = data.missing_required ?? [];
  const unknownFields = data.unknown_fields ?? [];
  const warnings = data.warnings ?? [];
  return (
    <>
      <Section title="SharePoint-liste">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono break-all space-y-0.5">
          <div><span className="text-slate-500">displayName:</span> {data.list.displayName}</div>
          <div><span className="text-slate-500">name:</span> {data.list.name}</div>
          <div><span className="text-slate-500">id:</span> {data.list.id}</div>
        </div>
      </Section>

      <Section title="Nøgletal">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Rækker" value={data.row_count} tone="sky" />
          <Stat label="Kolonner" value={data.column_count} />
          <Stat label="Manglende obligatoriske" value={missingRequired.length} tone={missingRequired.length ? "rose" : "emerald"} />
          <Stat label="Ukendte felter" value={unknownFields.length} tone={unknownFields.length ? "amber" : "emerald"} />
        </div>
      </Section>

      <Section title="Interne feltnavne">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-2 py-1.5 text-left font-bold">displayName</th>
                <th className="px-2 py-1.5 text-left font-bold">internal name</th>
                <th className="px-2 py-1.5 text-left font-bold">type</th>
                <th className="px-2 py-1.5 text-left font-bold">readOnly</th>
                <th className="px-2 py-1.5 text-left font-bold">hidden</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {columns.map((c, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5">{c.displayName ?? "—"}</td>
                  <td className="px-2 py-1.5 font-mono text-violet-700">{c.name ?? "—"}</td>
                  <td className="px-2 py-1.5 text-slate-600">{c.type}</td>
                  <td className="px-2 py-1.5 text-slate-600">{c.readOnly ? "ja" : "nej"}</td>
                  <td className="px-2 py-1.5 text-slate-600">{c.hidden ? "ja" : "nej"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {missingRequired.length > 0 && (
        <Section title={`Manglende obligatoriske felter (${missingRequired.length})`}>
          <div className="overflow-x-auto rounded-lg border border-rose-200">
            <table className="min-w-full text-xs">
              <thead className="bg-rose-50 text-rose-900">
                <tr>
                  <th className="px-2 py-1.5 text-left font-bold">item_id</th>
                  <th className="px-2 py-1.5 text-left font-bold">manglende felter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-100">
                {missingRequired.slice(0, 50).map((m) => (
                  <tr key={m.item_id}>
                    <td className="px-2 py-1.5 font-mono">{m.item_id}</td>
                    <td className="px-2 py-1.5">{m.missing.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {unknownFields.length > 0 && (
        <Section title={`Ukendte SharePoint-felter (${unknownFields.length})`}>
          <div className="overflow-x-auto rounded-lg border border-amber-200">
            <table className="min-w-full text-xs">
              <thead className="bg-amber-50 text-amber-900">
                <tr>
                  <th className="px-2 py-1.5 text-left font-bold">felt</th>
                  <th className="px-2 py-1.5 text-left font-bold">antal rækker</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {unknownFields.map((u) => (
                  <tr key={u.name}>
                    <td className="px-2 py-1.5 font-mono">{u.name}</td>
                    <td className="px-2 py-1.5">{u.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="Warnings"><WarningList warnings={warnings} /></Section>

      <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
        Varighed: {data.durationMs} ms.
      </p>
    </>
  );
}

function DryRunView({ data }: { data: DryRunResult }) {
  const dm: DryRunResult["dealer_matching"] = data.dealer_matching ?? {
    safe_matches_count: 0,
    needs_review_count: 0,
    unmatched_count: 0,
    safe_matches: [],
    needs_review: [],
    unmatched: [],
  };
  const safeMatches = dm.safe_matches ?? [];
  const needsReview = dm.needs_review ?? [];
  const unmatched = dm.unmatched ?? [];
  const warnings = data.warnings ?? [];
  return (
    <>
      <Section title="Hentet fra SharePoint">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Hentet" value={data.fetched} tone="sky" />
          <Stat label="Nye" value={data.new} tone="emerald" />
          <Stat label="Opdateres" value={data.updates} tone="amber" />
          <Stat label="Uændrede" value={data.unchanged} />
        </div>
        {!data.warranty_table_exists && (
          <p className="mt-2 text-xs text-amber-800">
            Tabellen <code className="font-mono">warranty_registrations</code> findes ikke endnu — nye/opdateres/uændrede kan ikke beregnes før migrationen er kørt.
          </p>
        )}
        {data.warranty_table_exists && data.warranty_table_empty && (
          <p className="mt-2 text-xs text-emerald-800">
            Warranty-tabellen er tom. Alle gyldige SharePoint-rækker vil være nye ved første sync.
          </p>
        )}
      </Section>

      <Section title="Dealer matching">
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Stat label="Sikre matches" value={dm.safe_matches_count ?? 0} tone="emerald" />
          <Stat label="Kræver gennemgang" value={dm.needs_review_count ?? 0} tone="amber" />
          <Stat label="Unmatched" value={dm.unmatched_count ?? 0} tone="rose" />
        </div>

        {safeMatches.length > 0 && (
          <details className="rounded-lg border border-emerald-200 mb-2" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-emerald-900 bg-emerald-50">
              Sikre matches ({safeMatches.length})
            </summary>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-bold">SP item</th>
                    <th className="px-2 py-1.5 text-left font-bold">SharePoint forhandlernavn</th>
                    <th className="px-2 py-1.5 text-left font-bold">→ dealer_account</th>
                    <th className="px-2 py-1.5 text-left font-bold">kontonr.</th>
                    <th className="px-2 py-1.5 text-left font-bold">årsag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {safeMatches.map((m) => (
                    <tr key={m.sharepoint_item_id}>
                      <td className="px-2 py-1.5 font-mono">{m.sharepoint_item_id}</td>
                      <td className="px-2 py-1.5">{m.dealer_name_snapshot || <em className="text-slate-400">(tomt)</em>}</td>
                      <td className="px-2 py-1.5 font-bold text-emerald-700">{m.dealer_company_name}</td>
                      <td className="px-2 py-1.5 font-mono text-slate-700">{m.dealer_account_number ?? "—"}</td>
                      <td className="px-2 py-1.5 text-slate-600">{m.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {needsReview.length > 0 && (
          <details className="rounded-lg border border-amber-200 mb-2" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-amber-900 bg-amber-50">
              Kræver gennemgang ({needsReview.length})
            </summary>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-bold">SP item</th>
                    <th className="px-2 py-1.5 text-left font-bold">SharePoint forhandlernavn</th>
                    <th className="px-2 py-1.5 text-left font-bold">forslag (kontonr. · score)</th>
                    <th className="px-2 py-1.5 text-left font-bold">årsag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {needsReview.map((m) => (
                    <tr key={m.sharepoint_item_id}>
                      <td className="px-2 py-1.5 font-mono">{m.sharepoint_item_id}</td>
                      <td className="px-2 py-1.5">{m.dealer_name_snapshot || <em className="text-slate-400">(tomt)</em>}</td>
                      <td className="px-2 py-1.5">
                        <ul className="space-y-0.5">
                          {(m.candidates ?? []).map((c) => (
                            <li key={c.dealer_account_id}>
                              <span className="font-bold text-amber-800">{c.company_name}</span>
                              <span className="ml-2 font-mono text-slate-600">{c.account_number ?? "—"}</span>
                              <span className="ml-2 text-slate-500">({c.score.toFixed(3)})</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">fuzzy</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-3 py-2 text-[11px] text-amber-800 bg-amber-50/40 border-t border-amber-200">
              Ingen forhandler kobles automatisk. Disse skal godkendes manuelt i næste fase.
            </p>
          </details>
        )}

        {unmatched.length > 0 && (
          <details className="rounded-lg border border-rose-200">
            <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-rose-900 bg-rose-50">
              Unmatched dealers ({unmatched.length})
            </summary>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-bold">SP item</th>
                    <th className="px-2 py-1.5 text-left font-bold">SharePoint forhandlernavn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unmatched.map((m) => (
                    <tr key={m.sharepoint_item_id}>
                      <td className="px-2 py-1.5 font-mono">{m.sharepoint_item_id}</td>
                      <td className="px-2 py-1.5">{m.dealer_name_snapshot || <em className="text-slate-400">(tomt)</em>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

      </Section>

      <Section title="Warnings"><WarningList warnings={warnings} /></Section>

      <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
        Read-only dry-run. Resultat gemmes ikke. Varighed: {data.durationMs} ms.
      </p>
    </>
  );
}
