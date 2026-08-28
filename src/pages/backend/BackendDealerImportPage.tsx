/**
 * Backend → Importér forhandlere (CSV from ERP).
 * Route: /portal/backend/dealer-import
 * Access: Timan Backend only.
 *
 * Flow: Upload CSV → Preview field-by-field → Confirm → Summary + log.
 * Never deletes data. Empty CSV cells never overwrite existing values.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Upload, FileText, AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { isBackendActor } from "@/lib/portalAccess";
import { fetchDealerAccounts, type DealerAccount } from "@/lib/dealerAccountsService";
import {
  parseDealerCsv,
  buildPreview,
  runImport,
  listImportLogs,
  IMPORT_FIELDS,
  type PreviewRow,
  type ImportSummary,
  type DealerImportLog,
} from "@/lib/dealerImportService";

const FIELD_LABEL: Record<string, string> = {
  company_name: "Firmanavn",
  address: "Adresse",
  postal_code: "Postnr",
  city: "By",
  country: "Land",
  email: "Email",
  phone: "Telefon",
  assigned_seller_initials: "Sælger",
  dealer_type: "Forhandlertype",
};

export default function BackendDealerImportPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const [existing, setExisting] = useState<DealerAccount[]>([]);
  const [loadingDealers, setLoadingDealers] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [logs, setLogs] = useState<DealerImportLog[]>([]);
  const [filter, setFilter] = useState<"all" | "create" | "update" | "skip" | "error">("all");

  const isBackend = useMemo(() => isBackendActor(appUser), [appUser]);

  async function reloadDealers() {
    setLoadingDealers(true);
    const res = await fetchDealerAccounts({ includeDeleted: false });
    setExisting(res.rows);
    setLoadingDealers(false);
  }

  async function reloadLogs() {
    setLogs(await listImportLogs());
  }

  useEffect(() => {
    if (!appUser || !isBackend) return;
    void reloadDealers();
    void reloadLogs();
  }, [appUser, isBackend]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!isBackend) return <Navigate to="/portal/backend" replace />;

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setSummary(null);
    setPreview(null);
    setParseErrors([]);
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const { rows, parseErrors: pe } = parseDealerCsv(text);
        setParseErrors(pe);
        const built = buildPreview(rows, existing);
        setPreview(built);
      } catch (err) {
        toast.error("Kunne ikke læse CSV: " + (err instanceof Error ? err.message : String(err)));
      }
    };
    reader.readAsText(f, "utf-8");
  }

  async function onConfirm() {
    if (!preview) return;
    setBusy(true);
    const res = await runImport(preview, fileName);
    setBusy(false);
    if (!res.ok || !res.summary) {
      toast.error(res.error ?? "Import fejlede.");
      return;
    }
    setSummary(res.summary);
    toast.success(
      `${res.summary.created} oprettet, ${res.summary.updated} opdateret, ${res.summary.skipped} sprunget over`,
    );
    await reloadDealers();
    await reloadLogs();
  }

  const counts = useMemo(() => {
    const c = { create: 0, update: 0, skip: 0, error: 0 };
    if (preview) for (const p of preview) c[p.bucket]++;
    return c;
  }, [preview]);

  const filteredPreview = useMemo(() => {
    if (!preview) return [];
    if (filter === "all") return preview;
    return preview.filter((p) => p.bucket === filter);
  }, [preview, filter]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full">
        <div className="mb-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
            <Upload className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Importér forhandlere</h1>
            <p className="text-slate-500 mt-1 text-sm">
              CSV-import fra ERP. Matcher på <code>account_number</code>. Tomme felter overskriver aldrig
              eksisterende data, og ingen forhandlere slettes.
            </p>
          </div>
        </div>

        {/* Step 1 — Upload */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
          <h2 className="font-bold text-slate-900 mb-2">1. Upload CSV-fil</h2>
          <p className="text-xs text-slate-600 mb-3">
            Understøttede kolonner (case-insensitive): account_number, dealer_number, company_name,
            address, postal_code, city, country, email, phone, assigned_seller_initials, dealer_type.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={loadingDealers}
              className="block text-sm" />
            {fileName && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <FileText className="h-3.5 w-3.5" /> {fileName}
              </span>
            )}
            {loadingDealers && <span className="text-xs text-slate-500">Indlæser eksisterende forhandlere…</span>}
          </div>
          {parseErrors.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-semibold mb-1">CSV-parse advarsler:</p>
              <ul className="list-disc pl-5 max-h-32 overflow-y-auto space-y-0.5">
                {parseErrors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </section>

        {/* Step 2 — Preview */}
        {preview && !summary && (
          <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
            <h2 className="font-bold text-slate-900 mb-3">2. Forhåndsvisning</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <Bucket label="Alle" value={preview.length} active={filter === "all"} onClick={() => setFilter("all")} color="slate" />
              <Bucket label="Nye" value={counts.create} active={filter === "create"} onClick={() => setFilter("create")} color="emerald" />
              <Bucket label="Opdateres" value={counts.update} active={filter === "update"} onClick={() => setFilter("update")} color="amber" />
              <Bucket label="Sprunget over" value={counts.skip} active={filter === "skip"} onClick={() => setFilter("skip")} color="slate" />
              <Bucket label="Fejl" value={counts.error} active={filter === "error"} onClick={() => setFilter("error")} color="rose" />
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[480px] overflow-y-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left text-slate-600">
                    <th className="px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Kontonr</th>
                    <th className="px-2 py-1.5">Firma</th>
                    <th className="px-2 py-1.5">Ændringer / fejl</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreview.slice(0, 500).map((p) => (
                    <tr key={p.rowIndex} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-1.5 font-mono text-slate-400">{p.rowIndex}</td>
                      <td className="px-2 py-1.5"><StatusPill bucket={p.bucket} /></td>
                      <td className="px-2 py-1.5 font-mono">{p.account_number ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        {p.raw.company_name || p.existing?.company_name || "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {p.bucket === "error" && (
                          <span className="text-rose-700">{p.errorMessage}</span>
                        )}
                        {p.bucket === "create" && (
                          <span className="text-emerald-700">Opretter ny forhandler.</span>
                        )}
                        {p.bucket === "skip" && (
                          <span className="text-slate-500">Ingen ændringer (tomme felter ignoreret).</span>
                        )}
                        {p.bucket === "update" && (
                          <ul className="space-y-0.5">
                            {p.changes.map((c) => (
                              <li key={c.field}>
                                <span className="font-semibold">{FIELD_LABEL[c.field] ?? c.field}:</span>{" "}
                                <span className="text-slate-500 line-through">{c.oldValue || "—"}</span>{" "}
                                <span className="text-slate-400">→</span>{" "}
                                <span className="text-amber-800">{c.newValue}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPreview.length > 500 && (
                <p className="px-2 py-1.5 text-[11px] text-slate-500">
                  Viser de første 500 af {filteredPreview.length} rækker.
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => { setPreview(null); setFileName(null); setParseErrors([]); }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Annuller
              </button>
              <button
                onClick={() => void onConfirm()}
                disabled={busy || (counts.create + counts.update === 0)}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {busy ? "Importerer…" : `Importér forhandlere (${counts.create + counts.update})`}
              </button>
            </div>
          </section>
        )}

        {/* Step 3 — Summary */}
        {summary && (
          <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-700 mt-0.5" />
              <div className="flex-1">
                <h2 className="font-bold text-emerald-900">Import gennemført</h2>
                <p className="mt-1 text-sm text-emerald-900">
                  <strong>{summary.created}</strong> oprettet,{" "}
                  <strong>{summary.updated}</strong> opdateret,{" "}
                  <strong>{summary.skipped}</strong> sprunget over.
                </p>
                {summary.errors.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-rose-800">
                      <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
                      {summary.errors.length} fejl
                    </summary>
                    <ul className="mt-2 text-[11px] font-mono max-h-40 overflow-y-auto bg-white rounded p-2 border border-rose-200">
                      {summary.errors.map((e, i) => (
                        <li key={i}>{e.account_number ?? "—"}: {e.error}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <button
                  onClick={() => { setSummary(null); setPreview(null); setFileName(null); }}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Importér en ny fil
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Import history */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="font-bold text-slate-900 mb-3">Import-historik</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-slate-500">Ingen tidligere importer.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Tidspunkt</th>
                    <th className="px-3 py-2 text-left">Bruger</th>
                    <th className="px-3 py-2 text-left">Fil</th>
                    <th className="px-3 py-2 text-right">Oprettet</th>
                    <th className="px-3 py-2 text-right">Opdateret</th>
                    <th className="px-3 py-2 text-right">Sprunget over</th>
                    <th className="px-3 py-2 text-right">Fejl</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-xs">
                        {new Date(l.imported_at).toLocaleString("da-DK")}
                      </td>
                      <td className="px-3 py-2 text-xs">{l.imported_by_email ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{l.file_name ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{l.created_count}</td>
                      <td className="px-3 py-2 text-right font-mono">{l.updated_count}</td>
                      <td className="px-3 py-2 text-right font-mono">{l.skipped_count}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {l.error_count > 0
                          ? <span className="text-rose-700">{l.error_count}</span>
                          : <span className="text-slate-400">0</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

function Bucket({
  label, value, active, onClick, color,
}: {
  label: string; value: number; active: boolean; onClick: () => void;
  color: "slate" | "emerald" | "amber" | "rose";
}) {
  const colorMap: Record<string, string> = {
    slate: "border-slate-300 text-slate-700",
    emerald: "border-emerald-300 text-emerald-800",
    amber: "border-amber-300 text-amber-800",
    rose: "border-rose-300 text-rose-800",
  };
  const activeMap: Record<string, string> = {
    slate: "bg-slate-100",
    emerald: "bg-emerald-100",
    amber: "bg-amber-100",
    rose: "bg-rose-100",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${colorMap[color]} ${active ? activeMap[color] : "bg-white"}`}
    >
      {label}: <span className="font-bold">{value}</span>
    </button>
  );
}

function StatusPill({ bucket }: { bucket: PreviewRow["bucket"] }) {
  switch (bucket) {
    case "create": return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Ny</span>;
    case "update": return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Opdater</span>;
    case "skip": return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">Sprunget</span>;
    case "error": return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">Fejl</span>;
  }
}

// IMPORT_FIELDS is exported for tests; reference it to avoid unused-import warning
void IMPORT_FIELDS;
