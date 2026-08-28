/**
 * Backend → Persistence audit
 *
 * Probes every Supabase table that backs CRM / dealer / portal business data
 * and reports: table reachable (yes/no), row count, last updated timestamp,
 * whether a localStorage fallback exists in the codebase, and whether the
 * fallback is currently in use (i.e. the table query failed).
 *
 * Read-only — does not mutate data.
 */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useNavigate } from "react-router-dom";
import { isBackendActor } from "@/lib/portalAccess";
import { supabase } from "@/lib/supabase";

interface AuditTarget {
  area: string;
  table: string;
  updatedColumn?: string; // column used to compute "last updated"
  fallbackKey?: string;   // localStorage key (if any fallback exists)
  notes?: string;
}

const TARGETS: AuditTarget[] = [
  { area: "App users",                   table: "app_users",                updatedColumn: "updated_at" },
  { area: "Dealer accounts",             table: "dealer_accounts",          updatedColumn: "updated_at" },
  { area: "Dealer parent/branch",        table: "dealer_accounts",          updatedColumn: "updated_at", notes: "parent_account_number column on dealer_accounts" },
  { area: "User ↔ dealer links",         table: "app_users",                updatedColumn: "updated_at", notes: "linked_dealer_number column on app_users" },
  { area: "Seller assignment on dealers",table: "dealer_accounts",          updatedColumn: "updated_at", notes: "owner_seller_email/owner_user_id on dealer_accounts" },
  { area: "Dealer stats (cache)",        table: "dealer_account_stats",     updatedColumn: "updated_at" },
  { area: "CRM leads",                   table: "crm_leads",                updatedColumn: "created_at", fallbackKey: "timan.crm.leads.v1" },
  { area: "CRM demo leads",              table: "crm_demo_leads",           updatedColumn: "created_at" },
  { area: "CRM activities",              table: "crm_activities",           updatedColumn: "created_at", fallbackKey: "timan.crm.activities.v1" },
  { area: "CRM calendar activities",     table: "crm_calendar_activities",  updatedColumn: "created_at", fallbackKey: "timan.crm.calendar.v1" },
  { area: "Dealer notes",                table: "dealer_notes",             updatedColumn: "created_at", fallbackKey: "timan.crm.dealer_notes.v1" },
  { area: "CRM logins",                  table: "crm_logins",               updatedColumn: "login_date", fallbackKey: "timan.crm.logins.v1" },
  { area: "Quotes / configurations",     table: "configurations",           updatedColumn: "created_at" },
  { area: "Budget lines",                table: "crm_budget_lines",         updatedColumn: "updated_at", fallbackKey: "timan.crm.budget.lines.v1" },
  { area: "Budget forecasts",            table: "crm_budget_forecasts",     updatedColumn: "updated_at", fallbackKey: "timan.crm.budget.forecasts.v1" },
  { area: "Budget sales actuals",        table: "crm_budget_sales_actuals", updatedColumn: "updated_at", fallbackKey: "timan.crm.budget.actuals.v1" },
  { area: "Budget access windows",       table: "budget_access_windows",    updatedColumn: "updated_at", fallbackKey: "timan.crm.budget.windows.v1" },
  { area: "Guest visitors",              table: "guest_visitors",           updatedColumn: "last_seen_at" },
  { area: "Guest sessions",              table: "guest_sessions",           updatedColumn: "started_at" },
  { area: "Portal activity log",         table: "portal_activity_log",      updatedColumn: "occurred_at" },
];

interface AuditResult extends AuditTarget {
  ok: boolean;
  rowCount: number | null;
  lastUpdated: string | null;
  error: string | null;
  localCount: number;
}

function countLocal(key?: string): number {
  if (!key || typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return 0;
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.length;
    if (p && typeof p === "object") return Object.keys(p).length;
    return 0;
  } catch { return 0; }
}

async function probe(t: AuditTarget): Promise<AuditResult> {
  const localCount = countLocal(t.fallbackKey);
  try {
    const { count, error } = await supabase
      .from(t.table as never)
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    let lastUpdated: string | null = null;
    if (t.updatedColumn) {
      try {
        const { data } = await supabase
          .from(t.table as never)
          .select(t.updatedColumn)
          .order(t.updatedColumn, { ascending: false })
          .limit(1);
        const row = (data?.[0] ?? null) as unknown as Record<string, unknown> | null;
        lastUpdated = (row?.[t.updatedColumn] as string | null | undefined) ?? null;
      } catch { /* missing column — ignore */ }
    }
    return { ...t, ok: true, rowCount: count ?? 0, lastUpdated, error: null, localCount };
  } catch (err) {
    return {
      ...t, ok: false, rowCount: null, lastUpdated: null,
      error: err instanceof Error ? err.message : String(err),
      localCount,
    };
  }
}

function StatusBadge({ r }: { r: AuditResult }) {
  if (!r.ok) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        <XCircle className="h-3 w-3" /> Tabel mangler
      </span>
    );
  }
  if (r.localCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="h-3 w-3" /> Supabase + lokal cache
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      <CheckCircle2 className="h-3 w-3" /> Supabase
    </span>
  );
}

export default function BackendPersistenceAuditPage() {
  const { appUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AuditResult[]>([]);
  const [loading, setLoading] = useState(true);

  const allowed = useMemo(() => isBackendActor(appUser), [appUser]);

  async function run() {
    setLoading(true);
    const out = await Promise.all(TARGETS.map(probe));
    setRows(out);
    // Console warnings for any fallback usage or missing tables.
    out.forEach(r => {
      if (!r.ok) console.warn(`[persistence-audit] Supabase table "${r.table}" unreachable: ${r.error}`);
      else if (r.localCount > 0) console.warn(`[persistence-audit] Local cache present for "${r.table}" (${r.localCount} rows in ${r.fallbackKey}).`);
    });
    setLoading(false);
  }

  useEffect(() => { if (allowed) void run(); }, [allowed]);

  if (!allowed) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage} onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />
        <main className="mx-auto max-w-3xl px-4 py-12">
          <p className="text-sm text-slate-600">Kun Timan Backend kan se persistens-revisionen.</p>
        </main>
        <PortalFooter language={lang} />
      </div>
    );
  }

  const missing = rows.filter(r => !r.ok);
  const fallbackInUse = rows.filter(r => r.ok && r.localCount > 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage} onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-4 flex items-center justify-end">
          <button
            onClick={run}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Genscan
          </button>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Persistens-revision</h1>
        <p className="mt-1 text-sm text-slate-600">
          Verificerer at alle CRM-, forhandler-, bruger-, budget-, aktivitets-, note-, claim- og analytics-data
          findes i Supabase og ikke kun i browserens localStorage.
        </p>

        {(missing.length > 0 || fallbackInUse.length > 0) && (
          <div className="mt-4 space-y-2">
            {missing.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <strong>{missing.length}</strong> tabel(ler) ikke fundet i Supabase: {missing.map(r => r.table).join(", ")}
              </div>
            )}
            {fallbackInUse.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <strong>{fallbackInUse.length}</strong> område(r) har data i lokal cache:{" "}
                {fallbackInUse.map(r => `${r.table} (${r.localCount})`).join(", ")}.
                Lokal cache bruges kun som faldback når Supabase-skrivning fejler — ryd browseren for at fjerne den.
              </div>
            )}
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Område</th>
                <th className="px-3 py-2">Tabel</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Rækker</th>
                <th className="px-3 py-2">Senest opdateret</th>
                <th className="px-3 py-2 text-right">Lokal cache</th>
                <th className="px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && rows.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Scanner …</td></tr>
              ) : rows.map(r => (
                <tr key={r.area + r.table} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{r.area}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.table}</td>
                  <td className="px-3 py-2"><StatusBadge r={r} /></td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{r.rowCount ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{r.lastUpdated ? new Date(r.lastUpdated).toLocaleString("da-DK") : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {r.fallbackKey ? r.localCount : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{r.error || r.notes || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <h2 className="mb-2 font-semibold text-slate-900">Filer der stadig har localStorage-faldback</h2>
          <ul className="list-inside list-disc space-y-1 text-slate-600">
            <li><code>src/lib/crmLeadsService.ts</code> → <code>timan.crm.leads.v1</code></li>
            <li><code>src/lib/crmActivitiesService.ts</code> → <code>timan.crm.activities.v1</code></li>
            <li><code>src/lib/crmCalendarService.ts</code> → <code>timan.crm.calendar.v1</code></li>
            <li><code>src/lib/dealerNotesService.ts</code> → <code>timan.crm.dealer_notes.v1</code></li>
            <li><code>src/lib/crmLoginsService.ts</code> → <code>timan.crm.logins.v1</code></li>
            <li><code>src/lib/crmBudgetService.ts</code> → budget-, forecast-, actuals-, sælgerlås-nøgler</li>
            <li><code>src/lib/budgetAccessWindows.ts</code> → <code>timan.crm.budget.windows.v1</code></li>
            <li><code>src/lib/claimsService.ts</code> → service-claims (legacy, før Supabase claims-tabel)</li>
            <li><code>src/lib/audit-log-store.ts</code>, <code>backend-users-store.ts</code>, <code>module-access-store.ts</code>, <code>countries-store.ts</code> → backend admin (preview-data)</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Disse moduler skriver <strong>først til Supabase</strong> og bruger kun localStorage som
            fejlsikret cache, så UI ikke crasher hvis en tabel mangler. Når kolonnen "Lokal cache" ovenfor
            er 0 og status er grøn, bevares ingen forretningsdata lokalt. Tilladte UI-anvendelser af
            localStorage: aktiv mode, sprog, gæste-ID/UID, seneste konfigurator-tilstand.
          </p>
        </div>
      </main>
      <PortalFooter language={lang} />
    </div>
  );
}
