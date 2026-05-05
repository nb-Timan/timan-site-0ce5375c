/**
 * Backend → Prislister.
 * Route: /portal/backend/price-lists
 * Access: Timan Backend / Admin only.
 *
 * Tabs:
 *  1. Prisliste — search + manual single-row edit
 *  2. Upload prisliste — CSV import with field-by-field preview
 *  3. Eksportér prisliste — download current prices as CSV
 *
 * SAFETY: Does NOT touch configurator, quotes, orders, calc, PDFs, email, n8n, CRM.
 * No DELETE anywhere. Empty CSV cells never overwrite existing values.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Upload, FileText, AlertTriangle, CheckCircle2, RotateCcw,
  Search, Pencil, Download, Tag, X,
} from "lucide-react";
import { toast } from "sonner";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { derivePortalRole, getPortalPermissions } from "@/lib/portalAccess";
import {
  listPriceItems,
  listImportLogs,
  parsePriceCsv,
  buildPreview,
  runImport,
  updatePriceItem,
  exportCsv,
  type PriceListItem,
  type PriceListImportLog,
  type PreviewRow,
  type ImportSummary,
} from "@/lib/priceListService";

const FIELD_LABEL: Record<string, string> = {
  item_text_da: "Varetekst",
  price_dkk: "Pris DKK",
  price_eur: "Pris EUR",
  price_sek: "Pris SEK",
};

type Tab = "list" | "import" | "export";

export default function BackendPriceListsPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;

  const [tab, setTab] = useState<Tab>("list");
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<PriceListItem | null>(null);

  // Import state
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [logs, setLogs] = useState<PriceListImportLog[]>([]);
  const [filter, setFilter] = useState<"all" | "create" | "update" | "skip" | "error">("all");

  async function reload() {
    setLoadingItems(true);
    setItems(await listPriceItems());
    setLoadingItems(false);
  }
  async function reloadLogs() { setLogs(await listImportLogs()); }

  useEffect(() => {
    if (!appUser || !perms?.isBackend) return;
    void reload();
    void reloadLogs();
  }, [appUser, perms?.isBackend]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!perms?.isBackend) return <Navigate to="/portal/backend" replace />;

  const filteredItems = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((i) =>
      i.item_number.toLowerCase().includes(term) ||
      (i.item_text_da ?? "").toLowerCase().includes(term),
    );
  }, [items, q]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setSummary(null); setPreview(null); setParseErrors([]);
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const { rows, parseErrors: pe } = parsePriceCsv(text);
        setParseErrors(pe);
        setPreview(buildPreview(rows, items));
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
    if (!res.ok || !res.summary) { toast.error(res.error ?? "Import fejlede."); return; }
    setSummary(res.summary);
    toast.success(`${res.summary.created} oprettet, ${res.summary.updated} opdateret, ${res.summary.skipped} sprunget over`);
    await reload();
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

  function downloadExport() {
    const csv = exportCsv(items);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prisliste-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full">
        <Link to="/portal/backend" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage til Timan Backend
        </Link>

        <div className="mb-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
            <Tag className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Prislister</h1>
            <p className="text-slate-500 mt-1 text-sm">
              Backend-administration af varepriser. Konfiguratoren bruger ikke disse priser endnu —
              eksisterende tilbud og ordrer er uændrede.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-5 flex flex-wrap gap-2">
          <TabBtn active={tab === "list"}   onClick={() => setTab("list")}>Prisliste</TabBtn>
          <TabBtn active={tab === "import"} onClick={() => setTab("import")}>Upload prisliste</TabBtn>
          <TabBtn active={tab === "export"} onClick={() => setTab("export")}>Eksportér prisliste</TabBtn>
        </div>

        {tab === "list" && (
          <section className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[260px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Søg varenr. eller varetekst…"
                  className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm"
                />
              </div>
              <span className="text-xs text-slate-500">
                {loadingItems ? "Indlæser…" : `${filteredItems.length} af ${items.length} varer`}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[640px] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Varenr.</th>
                    <th className="px-3 py-2 text-left">Varetekst</th>
                    <th className="px-3 py-2 text-right">Pris DKK</th>
                    <th className="px-3 py-2 text-right">Pris EUR</th>
                    <th className="px-3 py-2 text-right">Pris SEK</th>
                    <th className="px-3 py-2 text-left">Opdateret</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.slice(0, 1000).map((i) => (
                    <tr key={i.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs">{i.item_number}</td>
                      <td className="px-3 py-2">{i.item_text_da ?? <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtPrice(i.price_dkk)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtPrice(i.price_eur)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtPrice(i.price_sek)}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {new Date(i.updated_at).toLocaleDateString("da-DK")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => setEditing(i)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Rediger varenr.
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && !loadingItems && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">Ingen varer.</td></tr>
                  )}
                </tbody>
              </table>
              {filteredItems.length > 1000 && (
                <p className="px-2 py-1.5 text-[11px] text-slate-500">
                  Viser de første 1000 af {filteredItems.length} rækker. Brug søgefeltet for at indsnævre.
                </p>
              )}
            </div>
          </section>
        )}

        {tab === "import" && (
          <>
            <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
              <h2 className="font-bold text-slate-900 mb-2">1. Upload CSV-fil</h2>
              <p className="text-xs text-slate-600 mb-3">
                Understøttede kolonner (case-insensitive): varenr / item_number, varetekst_da / item_text_da,
                pris_dkk / price_dkk, pris_eur / price_eur, pris_sek / price_sek. Tomme felter overskriver
                aldrig eksisterende værdier, og ingen varer slettes.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={loadingItems} className="block text-sm" />
                {fileName && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                    <FileText className="h-3.5 w-3.5" /> {fileName}
                  </span>
                )}
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
                        <th className="px-2 py-1.5">Varenr.</th>
                        <th className="px-2 py-1.5">Varetekst</th>
                        <th className="px-2 py-1.5">Ændringer / fejl</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPreview.slice(0, 500).map((p) => (
                        <tr key={p.rowIndex} className="border-t border-slate-100 align-top">
                          <td className="px-2 py-1.5 font-mono text-slate-400">{p.rowIndex}</td>
                          <td className="px-2 py-1.5"><StatusPill bucket={p.bucket} /></td>
                          <td className="px-2 py-1.5 font-mono">{p.item_number ?? "—"}</td>
                          <td className="px-2 py-1.5">{p.raw.item_text_da || p.existing?.item_text_da || "—"}</td>
                          <td className="px-2 py-1.5">
                            {p.bucket === "error" && <span className="text-rose-700">{p.errorMessage}</span>}
                            {p.bucket === "create" && <span className="text-emerald-700">Opretter ny vare.</span>}
                            {p.bucket === "skip" && <span className="text-slate-500">Ingen ændringer.</span>}
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
                    {busy ? "Importerer…" : `Importér priser (${counts.create + counts.update})`}
                  </button>
                </div>
              </section>
            )}

            {summary && (
              <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 mb-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-700 mt-0.5" />
                  <div className="flex-1">
                    <h2 className="font-bold text-emerald-900">Import gennemført</h2>
                    <p className="mt-1 text-sm text-emerald-900">
                      <strong>{summary.created}</strong> oprettet, <strong>{summary.updated}</strong> opdateret,{" "}
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
                            <li key={i}>{e.item_number ?? "—"}: {e.error}</li>
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
                          <td className="px-3 py-2 text-xs">{new Date(l.imported_at).toLocaleString("da-DK")}</td>
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
          </>
        )}

        {tab === "export" && (
          <section className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-bold text-slate-900 mb-2">Eksportér prisliste</h2>
            <p className="text-sm text-slate-600 mb-4">
              Download den nuværende prisliste som CSV (kolonner: varenr, varetekst_da, pris_dkk, pris_eur, pris_sek).
            </p>
            <button
              onClick={downloadExport}
              disabled={loadingItems || items.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Eksportér prisliste ({items.length})
            </button>
          </section>
        )}
      </main>

      {editing && (
        <EditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
        />
      )}

      <PortalFooter language={lang} />
    </div>
  );
}

function fmtPrice(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-semibold border ${
        active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
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
    slate: "bg-slate-100", emerald: "bg-emerald-100", amber: "bg-amber-100", rose: "bg-rose-100",
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
    case "skip":   return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">Sprunget</span>;
    case "error":  return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">Fejl</span>;
  }
}

function EditModal({ item, onClose, onSaved }: {
  item: PriceListItem;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [text, setText] = useState(item.item_text_da ?? "");
  const [dkk, setDkk] = useState(item.price_dkk == null ? "" : String(item.price_dkk));
  const [eur, setEur] = useState(item.price_eur == null ? "" : String(item.price_eur));
  const [sek, setSek] = useState(item.price_sek == null ? "" : String(item.price_sek));
  const [busy, setBusy] = useState(false);

  function num(v: string): number | null {
    const t = v.trim().replace(/\s/g, "");
    if (!t) return null;
    const n = Number(t.includes(",") && !t.includes(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

  async function save() {
    const d = num(dkk), e = num(eur), s = num(sek);
    if (Number.isNaN(d) || Number.isNaN(e) || Number.isNaN(s)) {
      toast.error("Ugyldig pris-værdi.");
      return;
    }
    setBusy(true);
    const res = await updatePriceItem({
      item_number: item.item_number,
      item_text_da: text.trim() || null,
      price_dkk: d,
      price_eur: e,
      price_sek: s,
    });
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? "Kunne ikke gemme."); return; }
    toast.success("Varen er opdateret.");
    await onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Rediger varenr.</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{item.item_number}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <Field label="Varetekst">
            <input value={text} onChange={(e) => setText(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Pris DKK"><PriceInput value={dkk} onChange={setDkk} /></Field>
            <Field label="Pris EUR"><PriceInput value={eur} onChange={setEur} /></Field>
            <Field label="Pris SEK"><PriceInput value={sek} onChange={setSek} /></Field>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Annuller
          </button>
          <button onClick={() => void save()} disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">
            {busy ? "Gemmer…" : "Gem"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

function PriceInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-right"
      placeholder="0,00"
    />
  );
}
