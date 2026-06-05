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
  ScanSearch, CloudDownload, CheckCircle2, Check, Zap,
} from "lucide-react";
import { toast } from "sonner";
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

function DryRunView({ data, onRerun }: { data: DryRunResult; onRerun: () => void | Promise<void> }) {
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
          <details className="rounded-lg border border-emerald-200 mb-2">
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

        <ManualApprovalSection
          needsReview={needsReview}
          unmatched={unmatched}
          onApproved={onRerun}
        />

      </Section>

      <Section title="Warnings"><WarningList warnings={warnings} /></Section>

      <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
        Read-only dry-run. Resultat gemmes ikke. Varighed: {data.durationMs} ms.
      </p>
    </>
  );
}

// ----------------------------------------------------------------------------
// Manuel godkendelse — group needs_review + unmatched by SP dealer name,
// pick a dealer_account, approve. Writes one alias per SP name.
// After approval, the parent re-runs dry-run so the group disappears.
// ----------------------------------------------------------------------------

interface PendingGroup {
  sp_dealer_name: string;
  row_count: number;
  item_ids: string[];
  bucket: "needs_review" | "unmatched";
  candidates: Array<{
    dealer_account_id: string;
    company_name: string;
    account_number: string | null;
    score: number;
  }>;
}

function buildPendingGroups(needsReview: NeedsReview[], unmatched: Unmatched[]): PendingGroup[] {
  const byName = new Map<string, PendingGroup>();

  for (const r of needsReview ?? []) {
    const name = (r.dealer_name_snapshot || "").trim();
    const key = `nr::${name.toLowerCase()}`;
    const existing = byName.get(key);
    if (existing) {
      existing.row_count += 1;
      existing.item_ids.push(r.sharepoint_item_id);
    } else {
      byName.set(key, {
        sp_dealer_name: name,
        row_count: 1,
        item_ids: [r.sharepoint_item_id],
        bucket: "needs_review",
        candidates: (r.candidates ?? []).map((c) => ({ ...c })),
      });
    }
  }
  for (const u of unmatched ?? []) {
    const name = (u.dealer_name_snapshot || "").trim();
    const key = `um::${name.toLowerCase()}`;
    const existing = byName.get(key);
    if (existing) {
      existing.row_count += 1;
      existing.item_ids.push(u.sharepoint_item_id);
    } else {
      byName.set(key, {
        sp_dealer_name: name,
        row_count: 1,
        item_ids: [u.sharepoint_item_id],
        bucket: "unmatched",
        candidates: [],
      });
    }
  }

  return Array.from(byName.values()).sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket === "needs_review" ? -1 : 1;
    return b.row_count - a.row_count;
  });
}

function ManualApprovalSection({
  needsReview,
  unmatched,
  onApproved,
}: {
  needsReview: NeedsReview[];
  unmatched: Unmatched[];
  onApproved: () => void | Promise<void>;
}) {
  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [dealersLoading, setDealersLoading] = useState(true);
  const [dealersError, setDealersError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDealersLoading(true);
      const res = await fetchDealerAccounts();
      if (cancelled) return;
      if (res.source === "fallback") {
        setDealersError(res.error ?? "Kunne ikke hente dealer_accounts.");
        setDealers([]);
      } else {
        setDealersError(null);
        setDealers(res.rows);
      }
      setDealersLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(
    () => buildPendingGroups(needsReview, unmatched),
    [needsReview, unmatched],
  );

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900 flex items-center gap-2 mt-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        Alle SharePoint-forhandlere har et sikkert match. Ingen manuel godkendelse nødvendig.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 mt-2">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
        <h4 className="text-xs font-bold text-slate-900">
          Manuel godkendelse ({groups.length} unikke SharePoint-forhandlere)
        </h4>
        <p className="mt-1 text-[11px] text-slate-600">
          Godkend ét match per SharePoint-forhandlernavn. Aliaset gemmes i <code className="font-mono">dealer_account_aliases</code> og bruges automatisk ved fremtidige dry-runs. Ingen forhandler kobles automatisk og ingen dealer_account oprettes.
        </p>
      </div>

      {dealersError && (
        <div className="px-3 py-2 text-xs text-rose-800 bg-rose-50 border-b border-rose-200">
          {dealersError}
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {groups.map((g) => (
          <ApprovalRow
            key={`${g.bucket}::${g.sp_dealer_name.toLowerCase()}`}
            group={g}
            dealers={dealers}
            dealersLoading={dealersLoading}
            onApproved={onApproved}
          />
        ))}
      </ul>
    </div>
  );
}

function ApprovalRow({
  group,
  dealers,
  dealersLoading,
  onApproved,
}: {
  group: PendingGroup;
  dealers: DealerAccount[];
  dealersLoading: boolean;
  onApproved: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<string>(
    group.candidates[0]?.dealer_account_id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function approve() {
    setErr(null);
    if (!group.sp_dealer_name) {
      setErr("Tomt SharePoint-navn kan ikke godkendes.");
      toast.error("Godkendelse fejlede", { description: "Tomt SharePoint-navn kan ikke godkendes." });
      return;
    }
    if (!selected) {
      setErr("Vælg en forhandler først.");
      toast.error("Godkendelse fejlede", { description: "Vælg en forhandler først." });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "sharepoint-warranty-approve-alias",
        { body: { sp_dealer_name: group.sp_dealer_name, dealer_account_id: selected } },
      );
      if (error) {
        let msg: string | null = null;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            msg = body?.error ?? null;
          }
        } catch { /* ignore */ }
        const displayMsg = msg ?? error.message ?? "Ukendt fejl";
        setErr(displayMsg);
        toast.error("Godkendelse fejlede", { description: displayMsg });
        return;
      }
      if ((data as { error?: string })?.error) {
        const displayMsg = String((data as { error?: string }).error);
        setErr(displayMsg);
        toast.error("Godkendelse fejlede", { description: displayMsg });
        return;
      }
      const company = (data as { dealer_company_name?: string })?.dealer_company_name ?? "(ukendt)";
      setDone(company);
      toast.success("Match godkendt", {
        description: `${group.sp_dealer_name} → ${company}`,
      });
      void onApproved();
    } catch (e) {
      const displayMsg = e instanceof Error ? e.message : String(e);
      setErr(displayMsg);
      toast.error("Godkendelse fejlede", { description: displayMsg });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <li className="px-3 py-3 bg-emerald-50/60 flex items-start gap-2">
        <Check className="h-4 w-4 text-emerald-700 mt-0.5" />
        <div className="text-xs text-emerald-900">
          <p className="font-bold">
            Godkendt: <span className="font-mono">{group.sp_dealer_name || "(tomt)"}</span> → {done}
          </p>
          <p className="mt-0.5 text-emerald-800">
            Dry-run opdateres — rækkerne flyttes til sikre matches.
          </p>
        </div>
      </li>
    );
  }

  return (
    <li className="px-3 py-3">
      <div className="flex flex-wrap items-start gap-2 justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide " +
              (group.bucket === "needs_review"
                ? "bg-amber-100 text-amber-900 border border-amber-200"
                : "bg-rose-100 text-rose-900 border border-rose-200")
            }>
              {group.bucket === "needs_review" ? "Kræver gennemgang" : "Unmatched"}
            </span>
            <span className="text-sm font-bold text-slate-900">
              {group.sp_dealer_name || <em className="text-slate-400">(tomt SharePoint-navn)</em>}
            </span>
            <span className="text-[11px] text-slate-500">
              {group.row_count} warranty-{group.row_count === 1 ? "række" : "rækker"}
            </span>
          </div>

          {group.candidates.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {group.candidates.map((c) => (
                <li key={c.dealer_account_id} className="text-[11px] text-slate-700">
                  <span className="font-bold text-amber-800">{c.company_name}</span>
                  <span className="ml-2 font-mono text-slate-600">{c.account_number ?? "—"}</span>
                  <span className="ml-2 text-slate-500">score {c.score.toFixed(3)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={dealersLoading || busy || !group.sp_dealer_name}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 min-w-[260px] max-w-[360px]"
          >
            <option value="">
              {dealersLoading ? "Henter forhandlere…" : "Vælg forhandler…"}
            </option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.company_name}{d.account_number ? ` · ${d.account_number}` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={approve}
            disabled={busy || !selected || !group.sp_dealer_name}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Godkend match
          </button>
        </div>
      </div>

      {err && (
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-900">
          {err}
        </div>
      )}

      <p className="mt-1 text-[10px] text-slate-500">
        Godkendelse opretter <strong>ingen</strong> dealer_account. Kun et alias mellem SharePoint-navnet og den valgte eksisterende forhandler.
      </p>
    </li>
  );
}

