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
  reason: "exact" | "alias" | "portal_approved";
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
interface RejectedWarrantyRow {
  sharepoint_item_id: string;
  dealer_name_snapshot: string;
  reason: "missing_sharepoint_item_id" | "missing_machine_serial";
  machine_model: string;
  customer_name: string;
}
interface DryRunResult {
  warranty_table_exists: boolean;
  warranty_table_empty?: boolean;
  resolved_field_names?: Record<string, string | null>;
  fetched: number;
  processed?: number;
  rejected_count?: number;
  rejected_sample?: RejectedWarrantyRow[];
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
  manual_matches_preserved_count?: number;
  warnings: string[];
  durationMs: number;
}


interface SyncConflict {
  registration_id: string;
  sharepoint_item_id: string;
  dealer_name_snapshot: string;
  field: string;
  portal_value: unknown;
  sharepoint_value: unknown;
}

interface SyncResult {
  mode: string;
  completed?: boolean;
  writes_performed: boolean;
  fatal_error?: string;
  fetched: number;
  processed: number;
  rejected_count?: number;
  rejected_sample?: RejectedWarrantyRow[];
  created: number;
  updated: number;
  unchanged: number;
  matched: number;
  needs_review: number;
  unmatched: number;
  deactivated: number;
  conflicts_count?: number;
  conflicts?: SyncConflict[];
  manual_matches_preserved_count?: number;
  fields_preserved_from_portal_count?: number;
  warnings: string[];
  durationMs: number;
}

type ModalState =
  | { kind: "none" }
  | { kind: "verify"; busy: boolean; error: string | null; data: VerifyResult | null }
  | { kind: "dryrun"; busy: boolean; error: string | null; data: DryRunResult | null }
  | { kind: "sync-confirm"; busy: boolean; error: string | null; dryRun: DryRunResult | null }
  | { kind: "sync-result"; busy: boolean; error: string | null; data: SyncResult | null };

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
  async function startSync() {
    setModal({ kind: "sync-confirm", busy: true, error: null, dryRun: null });
    const { data, error } = await invokeFn<DryRunResult>("sharepoint-warranty-dryrun");
    setModal({ kind: "sync-confirm", busy: false, error, dryRun: data });
  }
  async function confirmSync() {
    setModal({ kind: "sync-result", busy: true, error: null, data: null });
    const { data, error } = await invokeFn<SyncResult>("sharepoint-warranty-sync");
    if (!error && data) {
      const conf = data.conflicts_count ?? 0;
      const rejected = data.rejected_count ?? 0;
      const description = `${data.created} oprettet · ${data.updated} opdateret · ${data.unchanged} uændret · ${rejected} afvist${conf > 0 ? ` · ${conf} konflikt${conf === 1 ? "" : "er"}` : ""}`;
      if (data.completed === false || data.fatal_error) {
        toast.error("Warranty sync kunne ikke gemme data", { description: data.fatal_error ?? description });
      } else if (rejected > 0) {
        toast.warning("Warranty sync gennemført med afviste rækker", { description });
      } else {
        toast.success("Warranty sync gennemført", { description });
      }
    } else if (error) {
      toast.error("Warranty sync fejlede", { description: error });
    }
    setModal({ kind: "sync-result", busy: false, error, data });
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
          </div>
        </div>

        {/* Tool rows */}
        <div className="divide-y divide-slate-100">
          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-slate-900">Verificér SharePoint</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-slate-700">
                Tjekker at listen kan læses, viser præcise interne feltnavne, antal rækker og manglende felter.
              </p>
            </div>
            <button
              type="button"
              onClick={runVerify}
              disabled={modal.kind === "verify" && modal.busy}
              className="inline-flex min-h-10 flex-shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {modal.kind === "verify" && modal.busy
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ScanSearch className="h-4 w-4" />}
              Verificér - skriver intet
            </button>
          </div>

          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-slate-900">Dry-run</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-slate-700">
                Henter alle rækker og viser hvad en fremtidig sync ville gøre. Skriver intet.
              </p>
            </div>
            <button
              type="button"
              onClick={runDryRun}
              disabled={modal.kind === "dryrun" && modal.busy}
              className="inline-flex min-h-10 flex-shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {modal.kind === "dryrun" && modal.busy
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CloudDownload className="h-4 w-4" />}
              Dry-run - forhåndsvisning før sync
            </button>
          </div>

          <div className="flex items-start justify-between gap-4 bg-emerald-50/50 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-slate-900">Synkronisér Warranty fra SharePoint</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-slate-700">
                Importerer alle rækker. Sikre matches kobles til forhandler. Rækker uden sikkert match importeres uden forhandlerkobling og er kun synlige for Timan Backend / Service indtil de matches. Ingen hard delete — rækker der mangler i SharePoint markeres som inaktive.
              </p>
            </div>
            <button
              type="button"
              onClick={startSync}
              disabled={modal.kind === "sync-confirm" && modal.busy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 h-10 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 flex-shrink-0"
            >
              {(modal.kind === "sync-confirm" || modal.kind === "sync-result") && modal.busy
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Zap className="h-4 w-4" />}
              Synkronisér Warranty fra SharePoint
            </button>
          </div>
        </div>
      </div>

      {(modal.kind === "verify" || modal.kind === "dryrun") && (
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

      {modal.kind === "sync-confirm" && (
        <Modal title="Bekræft Warranty sync" onClose={() => modal.busy ? null : setModal({ kind: "none" })}>
          {modal.busy && (
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Kører dry-run før bekræftelse…
            </div>
          )}
          {modal.error && !modal.busy && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900 text-sm">
              <p className="font-bold">Dry-run fejlede</p>
              <p className="mt-1 whitespace-pre-line">{modal.error}</p>
            </div>
          )}
          {!modal.busy && !modal.error && modal.dryRun && (
            <SyncConfirmView dryRun={modal.dryRun} onConfirm={confirmSync} onCancel={() => setModal({ kind: "none" })} />
          )}
        </Modal>
      )}

      {modal.kind === "sync-result" && (
        <Modal title="Warranty sync — resultat" onClose={() => modal.busy ? null : setModal({ kind: "none" })}>
          {modal.busy && (
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Synkroniserer warranty registrations…
            </div>
          )}
          {modal.error && !modal.busy && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900 text-sm">
              <p className="font-bold">Sync fejlede</p>
              <p className="mt-1 whitespace-pre-line">{modal.error}</p>
            </div>
          )}
          {!modal.busy && !modal.error && modal.data && (
            <SyncResultView data={modal.data} />
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

function SyncConfirmView({ dryRun, onConfirm, onCancel }: { dryRun: DryRunResult; onConfirm: () => void; onCancel: () => void }) {
  const dm = dryRun.dealer_matching ?? { safe_matches_count: 0, needs_review_count: 0, unmatched_count: 0, safe_matches: [], needs_review: [], unmatched: [] };
  const willImportUnmatched = (dm.needs_review_count ?? 0) + (dm.unmatched_count ?? 0);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900 text-sm flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600 mt-0.5" />
        <div>
          <p className="font-bold">Klar til import</p>
          <p className="mt-0.5 text-emerald-800">Ingen hard delete. Ingen ændring af dealer_accounts. Ingen automatisk forkert forhandlerkobling.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Stat label="Hentes" value={dryRun.fetched} tone="sky" />
        <Stat label="Kan gemmes" value={dryRun.processed ?? Math.max(0, dryRun.fetched - (dryRun.rejected_count ?? 0))} tone="emerald" />
        <Stat label="Afvises" value={dryRun.rejected_count ?? 0} tone={(dryRun.rejected_count ?? 0) > 0 ? "rose" : "emerald"} />
        <Stat label="Nye" value={dryRun.new} tone="emerald" />
        <Stat label="Opdateres" value={dryRun.updates} tone="amber" />
        <Stat label="Uændrede" value={dryRun.unchanged} />
      </div>

      <ul className="space-y-1 text-sm text-slate-800 list-disc pl-5">
        <li><strong>{dryRun.processed ?? Math.max(0, dryRun.fetched - (dryRun.rejected_count ?? 0))}</strong> rækker kan gemmes i databasen.</li>
        <li><strong>{dryRun.rejected_count ?? 0}</strong> rækker afvises før database-write, typisk fordi et DB-krav mangler.</li>
        <li><strong>{dm.safe_matches_count ?? 0}</strong> rækker importeres som <strong>matched</strong> og kobles til forhandler.</li>
        <li><strong>{willImportUnmatched}</strong> rækker importeres <em>uden</em> forhandlerkobling (<code className="font-mono">dealer_account_id = null</code>, <code className="font-mono">dealer_account_number = null</code>). De er kun synlige for Timan Backend og Timan Service indtil de matches.</li>
        <li><strong>0</strong> rækker slettes. Manglende SharePoint-rækker markeres som <code className="font-mono">is_active_in_source = false</code>.</li>
        <li><code className="font-mono">dealer_name_snapshot</code> gemmes altid.</li>
      </ul>

      <RejectedRowsSection rows={dryRun.rejected_sample ?? []} total={dryRun.rejected_count ?? 0} />

      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
          Annullér
        </button>
        <button type="button" onClick={onConfirm} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">
          <Zap className="h-3.5 w-3.5" /> Ja, kør sync nu
        </button>
      </div>
    </div>
  );
}

function SyncResultView({ data }: { data: SyncResult }) {
  const rejectedCount = data.rejected_count ?? 0;
  const completed = data.completed !== false && !data.fatal_error;
  return (
    <div className="space-y-4">
      <div className={`rounded-lg border px-3 py-2 text-sm flex items-start gap-2 ${completed ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
        {completed ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-600" />}
        <div>
          <strong>{completed ? "Sync gennemført." : "Sync kunne ikke gemme data."}</strong>
          {data.fatal_error && <p className="mt-1">{data.fatal_error}</p>}
        </div>
      </div>

      <Section title="Importeret">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Stat label="Hentet" value={data.fetched} tone="sky" />
          <Stat label="Behandlet" value={data.processed} tone="emerald" />
          <Stat label="Afvist" value={rejectedCount} tone={rejectedCount > 0 ? "rose" : "emerald"} />
          <Stat label="Oprettet" value={data.created} tone="emerald" />
          <Stat label="Opdateret" value={data.updated} tone="amber" />
          <Stat label="Uændret" value={data.unchanged} />
          <Stat label="Konflikter" value={data.conflicts_count ?? 0} tone={(data.conflicts_count ?? 0) > 0 ? "rose" : "emerald"} />
        </div>
      </Section>

      <RejectedRowsSection rows={data.rejected_sample ?? []} total={rejectedCount} />

      <Section title="Dealer matching">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Matched" value={data.matched} tone="emerald" />
          <Stat label="Kræver gennemgang" value={data.needs_review} tone="amber" />
          <Stat label="Unmatched" value={data.unmatched} tone="rose" />
          <Stat label="Deaktiveret (forsvundet i SP)" value={data.deactivated} />
        </div>
      </Section>

      <Section title="Beskyttelse mod overskrivning">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Stat
            label="Manuelle dealer-matches bevaret"
            value={data.manual_matches_preserved_count ?? 0}
            tone={(data.manual_matches_preserved_count ?? 0) > 0 ? "emerald" : "slate"}
          />
          <Stat
            label="Portalrettelser på felter bevaret"
            value={data.fields_preserved_from_portal_count ?? 0}
            tone={(data.fields_preserved_from_portal_count ?? 0) > 0 ? "emerald" : "slate"}
          />
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Manuelle/godkendte forhandlerkoblinger og felter rettet i portalen
          (<code className="font-mono">change_source = portal_edit</code>) overskrives aldrig af SharePoint-sync.
        </p>
      </Section>

      {(data.conflicts && data.conflicts.length > 0) && (
        <Section title="Konflikter — portalrettelser beskyttet">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm mb-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
            <span>
              SharePoint foreslog at ændre disse felter, men de er rettet manuelt i portalen og blev <strong>ikke</strong> overskrevet.
              Portalværdien er bevaret.
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-2 py-1.5 text-left font-bold">Forhandler</th>
                  <th className="px-2 py-1.5 text-left font-bold">SP-item</th>
                  <th className="px-2 py-1.5 text-left font-bold">Felt</th>
                  <th className="px-2 py-1.5 text-left font-bold">Portalværdi</th>
                  <th className="px-2 py-1.5 text-left font-bold">SharePoint-værdi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.conflicts.map((c, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5 text-slate-800">{c.dealer_name_snapshot || "—"}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-600">{c.sharepoint_item_id}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-800">{c.field}</td>
                    <td className="px-2 py-1.5 text-emerald-800">{c.portal_value == null || c.portal_value === "" ? "—" : String(c.portal_value)}</td>
                    <td className="px-2 py-1.5 text-rose-800">{c.sharepoint_value == null || c.sharepoint_value === "" ? "—" : String(c.sharepoint_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="Warnings"><WarningList warnings={data.warnings ?? []} /></Section>

      <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
        Varighed: {data.durationMs} ms.
      </p>
    </div>
  );
}

function RejectedRowsSection({ rows, total }: { rows: RejectedWarrantyRow[]; total: number }) {
  if (total <= 0) return null;
  const labelForReason = (reason: RejectedWarrantyRow["reason"]) => {
    if (reason === "missing_machine_serial") return "Mangler serienummer";
    if (reason === "missing_sharepoint_item_id") return "Mangler SharePoint item id";
    return reason;
  };
  return (
    <Section title={`Afviste rækker (${total})`}>
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900 text-sm mb-2 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-600 flex-shrink-0" />
        <span>
          Disse rækker blev ikke skrevet til databasen. De skal enten have det manglende SharePoint-felt rettet, eller også skal DB-kravet ændres med en migration.
        </span>
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-2 py-1.5 text-left font-bold">SP item</th>
                <th className="px-2 py-1.5 text-left font-bold">Forhandler</th>
                <th className="px-2 py-1.5 text-left font-bold">Maskine</th>
                <th className="px-2 py-1.5 text-left font-bold">Kunde</th>
                <th className="px-2 py-1.5 text-left font-bold">Årsag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={`${r.sharepoint_item_id || "missing"}-${i}`}>
                  <td className="px-2 py-1.5 font-mono text-slate-600">{r.sharepoint_item_id || "—"}</td>
                  <td className="px-2 py-1.5 text-slate-800">{r.dealer_name_snapshot || "—"}</td>
                  <td className="px-2 py-1.5 text-slate-800">{r.machine_model || "—"}</td>
                  <td className="px-2 py-1.5 text-slate-800">{r.customer_name || "—"}</td>
                  <td className="px-2 py-1.5 font-bold text-rose-800">{labelForReason(r.reason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > rows.length && (
        <p className="mt-2 text-xs text-slate-500">Viser de første {rows.length} af {total} afviste rækker.</p>
      )}
    </Section>
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
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Stat label="Hentet" value={data.fetched} tone="sky" />
          <Stat label="Kan gemmes" value={data.processed ?? Math.max(0, data.fetched - (data.rejected_count ?? 0))} tone="emerald" />
          <Stat label="Afvises" value={data.rejected_count ?? 0} tone={(data.rejected_count ?? 0) > 0 ? "rose" : "emerald"} />
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

      <RejectedRowsSection rows={data.rejected_sample ?? []} total={data.rejected_count ?? 0} />

      <Section title="Dealer matching">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <Stat label="Sikre matches" value={dm.safe_matches_count ?? 0} tone="emerald" />
          <Stat label="Kræver gennemgang" value={dm.needs_review_count ?? 0} tone="amber" />
          <Stat label="Unmatched" value={dm.unmatched_count ?? 0} tone="rose" />
          <Stat
            label="Manuelle/godkendte bevaret"
            value={data.manual_matches_preserved_count ?? 0}
            tone={(data.manual_matches_preserved_count ?? 0) > 0 ? "emerald" : "slate"}
          />
        </div>
        <p className="mb-3 text-xs text-slate-600">
          Portal-godkendte eller manuelt valgte forhandlerkoblinger bevares. SharePoint kan stadig opdatere rå garanti-data,
          men må ikke nulstille den godkendte kobling.
        </p>

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
                      <td className="px-2 py-1.5 text-slate-600">
                        {m.reason === "portal_approved" ? "portal-godkendt" : m.reason}
                      </td>
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
  // Indeks for hurtige opslag.
  const byId = useMemo(() => {
    const m = new Map<string, DealerAccount>();
    for (const d of dealers) m.set(d.id, d);
    return m;
  }, [dealers]);
  const byAcct = useMemo(() => {
    const m = new Map<string, DealerAccount>();
    for (const d of dealers) m.set(d.account_number, d);
    return m;
  }, [dealers]);

  // Hvis første kandidat er lukket/spærret og har en aktiv successor, så
  // foreslå successoren i stedet (kræver stadig manuel godkendelse).
  const initialSelection = useMemo(() => {
    const firstId = group.candidates[0]?.dealer_account_id ?? "";
    if (!firstId) return "";
    const cand = byId.get(firstId);
    if (cand && (cand.is_blocked || cand.is_deleted) && cand.successor_dealer_account_number) {
      const succ = byAcct.get(cand.successor_dealer_account_number);
      if (succ && !succ.is_blocked && !succ.is_deleted) return succ.id;
    }
    return firstId;
  }, [group.candidates, byId, byAcct]);

  const [selected, setSelected] = useState<string>(initialSelection);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Hold selected i sync når dealers indlæses.
  useEffect(() => { if (!selected && initialSelection) setSelected(initialSelection); }, [initialSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedDealer = selected ? byId.get(selected) : undefined;
  const selectedIsInactive = !!(selectedDealer && (selectedDealer.is_blocked || selectedDealer.is_deleted));

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
            <ul className="mt-1.5 space-y-1">
              {group.candidates.map((c) => {
                const dealer = byId.get(c.dealer_account_id);
                const inactive = !!(dealer && (dealer.is_blocked || dealer.is_deleted));
                const succ = dealer?.successor_dealer_account_number
                  ? byAcct.get(dealer.successor_dealer_account_number)
                  : undefined;
                return (
                  <li key={c.dealer_account_id} className="text-[11px] text-slate-700">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`font-bold ${inactive ? "text-rose-700 line-through" : "text-amber-800"}`}>
                        {c.company_name}
                      </span>
                      <span className="font-mono text-slate-600">{c.account_number ?? "—"}</span>
                      <span className="text-slate-500">score {c.score.toFixed(3)}</span>
                      {dealer?.is_deleted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                          Lukket
                        </span>
                      )}
                      {dealer?.is_blocked && !dealer?.is_deleted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                          Spærret
                        </span>
                      )}
                    </div>
                    {inactive && (
                      <div className="ml-1 mt-0.5 text-[11px] text-slate-700">
                        Historik bevares på {c.company_name}.{" "}
                        {succ && !succ.is_blocked && !succ.is_deleted ? (
                          <>
                            Foreslået aktiv ansvarlig:{" "}
                            <button
                              type="button"
                              onClick={() => setSelected(succ.id)}
                              className="font-bold text-indigo-700 underline"
                            >
                              {succ.company_name} ({succ.account_number})
                            </button>
                          </>
                        ) : (
                          <span className="text-rose-700">
                            Ingen aktiv efterfølger registreret — vælg manuelt eller registrér efterfølger i Backend → Forhandlere.
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
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
            {dealers.map((d) => {
              const tag = d.is_deleted ? " [Lukket]" : d.is_blocked ? " [Spærret]" : "";
              return (
                <option key={d.id} value={d.id}>
                  {d.company_name}{d.account_number ? ` · ${d.account_number}` : ""}{tag}
                </option>
              );
            })}
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

      {selectedIsInactive && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Den valgte forhandler er <strong>{selectedDealer?.is_deleted ? "lukket" : "spærret"}</strong>.
            Aliaset kobles til denne forhandler — historik bevares, men fremtidigt ansvar vil ikke automatisk flyttes til en efterfølger.
          </span>
        </div>
      )}

      {err && (
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-900">
          {err}
        </div>
      )}

      <p className="mt-1 text-[10px] text-slate-500">
        Godkendelse opretter <strong>ingen</strong> dealer_account. Kun et alias mellem SharePoint-navnet og den valgte eksisterende forhandler. <strong>Dealer_name_snapshot</strong> fra SharePoint bevares uændret.
      </p>
    </li>
  );
}


