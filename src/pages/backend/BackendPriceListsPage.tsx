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
import { Navigate, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx-js-style";
import {
  Upload, FileText, AlertTriangle, CheckCircle2, RotateCcw,
  Search, Pencil, Download, Tag, X, Database, UploadCloud,
  TrendingDown, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { isBackendActor } from "@/lib/portalAccess";
import {
  listPriceItems,
  listImportLogs,
  parsePriceCsv,
  parsePriceWorkbook,
  buildPreview,
  runImport,
  updatePriceItem,
  type PriceListItem,
  type PriceListImportLog,
  type PreviewRow,
  type ImportSummary,
  type CsvPriceRow,
} from "@/lib/priceListService";
import {
  buildConfiguratorSeed,
  buildVarenrGroupMap,
  PRODUCT_GROUP_ORDER,
  groupOrderIndex,
  type ProductGroupKey,
} from "@/lib/configuratorPriceSeed";
import {
  buildPublishPreview,
  publishItems,
  type PublishPreviewRow,
  type PublishSummary,
} from "@/lib/pricePublishService";

const FIELD_LABEL: Record<string, string> = {
  item_text_da: "Varetekst",
  cost_price_dkk: "Kostpris DKK",
  price_dkk: "Pris DKK",
  price_sek: "Pris SEK",
  price_eur: "Pris EUR",
};

type Tab = "list" | "import" | "export";
type ProductScope = "all" | ProductGroupKey;

const PRODUCT_SCOPE_GROUPS = PRODUCT_GROUP_ORDER.filter(
  (g) => g !== "Options/accessories/other",
);

export default function BackendPriceListsPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const isBackend = useMemo(() => isBackendActor(appUser), [appUser]);

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
  const [productScope, setProductScope] = useState<ProductScope>("all");

  async function reload() {
    setLoadingItems(true);
    setItems(await listPriceItems());
    setLoadingItems(false);
  }
  async function reloadLogs() { setLogs(await listImportLogs()); }

  useEffect(() => {
    if (!appUser || !isBackend) return;
    void reload();
    void reloadLogs();
  }, [appUser, isBackend]);

  // ---- ALL hooks must run before any early return ----
  const groupMap = useMemo(() => buildVarenrGroupMap(), []);

  const configuratorSeedItems = useMemo(
    () => buildConfiguratorSeed().map(seedToPriceListItem),
    [],
  );

  const configuratorSeedByItemNumber = useMemo(
    () => new Map(configuratorSeedItems.map((i) => [i.item_number, i])),
    [configuratorSeedItems],
  );

  const exportItems = useMemo(
    () => mergeSeedAndStoredItems(configuratorSeedItems, items),
    [configuratorSeedItems, items],
  );

  const scopedExportItems = useMemo(
    () => filterItemsByScope(exportItems, productScope, groupMap),
    [exportItems, productScope, groupMap],
  );

  const filteredItems = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = !term
      ? exportItems
      : exportItems.filter((i) =>
          i.item_number.toLowerCase().includes(term) ||
          (i.renamed_from_item_number ?? "").toLowerCase().includes(term) ||
          (i.item_text_da ?? "").toLowerCase().includes(term),
        );
    return [...base].sort((a, b) => {
      const ga = groupMap.get(a.item_number) ?? "Options/accessories/other";
      const gb = groupMap.get(b.item_number) ?? "Options/accessories/other";
      const oi = groupOrderIndex(ga as ProductGroupKey) - groupOrderIndex(gb as ProductGroupKey);
      if (oi !== 0) return oi;
      return a.item_number.localeCompare(b.item_number, "da", { numeric: true });
    });
  }, [exportItems, q, groupMap]);

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

  // Publish-to-configurator state
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishSummary, setPublishSummary] = useState<PublishSummary | null>(null);

  const dirtyItems = useMemo(() => items.filter((i) => i.is_dirty), [items]);
  const publishPreview: PublishPreviewRow[] = useMemo(
    () => buildPublishPreview(dirtyItems),
    [dirtyItems],
  );

  // Early returns now happen AFTER all hooks have been called.
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!isBackend) return <Navigate to="/portal/backend" replace />;

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setSummary(null); setPreview(null); setParseErrors([]);
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = /\.(xlsx|xls)$/i.test(f.name)
          ? parsePriceWorkbook(reader.result as ArrayBuffer)
          : parsePriceCsv(String(reader.result ?? ""));
        const { rows, parseErrors: pe } = parsed;
        const scopedRows = filterCsvRowsByScope(rows, productScope, groupMap);
        setParseErrors(pe);
        setPreview(buildPreview(scopedRows, items));
        if (scopedRows.length !== rows.length) {
          toast.info(`${rows.length - scopedRows.length} rækker blev sprunget over pga. valgt maskine.`);
        }
      } catch (err) {
        toast.error("Kunne ikke læse CSV: " + (err instanceof Error ? err.message : String(err)));
      }
    };
    if (/\.(xlsx|xls)$/i.test(f.name)) {
      reader.readAsArrayBuffer(f);
    } else {
      reader.readAsText(f, "utf-8");
    }
  }

  function loadFromConfigurator(scope: ProductScope = "all") {
    setSummary(null); setParseErrors([]);
    try {
      const seed = buildConfiguratorSeed().filter((s) => scope === "all" || s.group === scope);
      const rows: CsvPriceRow[] = seed.map((s) => ({
        item_number: s.item_number,
        item_text_da: s.item_text_da,
        cost_price_dkk: "",
        price_dkk: s.price_dkk == null ? "" : String(s.price_dkk),
        price_sek: "", // never overwrite existing SEK
        price_eur: s.price_eur == null ? "" : String(s.price_eur),
      }));
      setFileName("konfigurator-seed");
      setPreview(buildPreview(rows, items));
      setTab("import");
      toast.success(`${rows.length} varer hentet fra konfiguratoren – tjek forhåndsvisning.`);
    } catch (err) {
      toast.error("Kunne ikke læse fra konfiguratoren: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function onConfirm() {
    if (!preview) return;
    setBusy(true);
    const res = await runImport(preview, fileName);
    setBusy(false);
    if (!res.ok || !res.summary) { toast.error(res.error ?? "Import fejlede."); return; }
    setSummary(res.summary);
    if (fileName === "konfigurator-seed") {
      const total = res.summary.created + res.summary.updated;
      toast.success(`${total} varer indlæst fra konfiguratoren.`);
    } else {
      toast.success(`${res.summary.created} oprettet, ${res.summary.updated} opdateret, ${res.summary.skipped} sprunget over`);
    }
    await reload();
    await reloadLogs();
  }


  function downloadExport() {
    const rows = scopedExportItems.map((i) => ({
      group: groupMap.get(i.item_number) ?? "Options/accessories/other",
      item_number: i.item_number,
      item_text_da: i.item_text_da ?? "",
      cost_price_dkk: i.cost_price_dkk ?? "",
      price_dkk: i.price_dkk ?? 0,
      price_sek: i.price_sek ?? "",
      price_eur: i.price_eur ?? "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = buildPriceWorkbookSheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Prisliste");
    const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const scopeSlug = productScope === "all" ? "alle-maskiner" : slugify(productScope);
    a.download = `prisliste-${scopeSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function onPublishConfirm() {
    const nums = publishPreview.map((r) => r.item_number);
    if (nums.length === 0) return;
    setPublishBusy(true);
    const res = await publishItems(nums);
    setPublishBusy(false);
    if (!res.ok || !res.summary) {
      toast.error(res.error ?? "Publicering fejlede.");
      return;
    }
    setPublishSummary(res.summary);
    const total = res.summary.created + res.summary.updated;
    toast.success(`${total} vare(r) publiceret til konfigurator-overlay.`);
    await reload();
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full">
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

        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Arbejdsgang</h2>
              <p className="text-xs text-slate-500">Upload kostpriser, eksportér Excel, ret arket og indlæs det igen.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <FlowStepButton active={tab === "list"} onClick={() => setTab("list")}>
              Se nuværende prisliste
            </FlowStepButton>
            <FlowStepButton active={tab === "import"} onClick={() => setTab("import")}>
              1. Upload kostpriser
            </FlowStepButton>
            <FlowStepButton active={tab === "export"} onClick={() => setTab("export")}>
              2. Eksportér prisliste
            </FlowStepButton>
            <FlowStepButton active={tab === "import"} onClick={() => setTab("import")}>
              3. Indlæs redigeret prisliste
            </FlowStepButton>
            <button
              type="button"
              onClick={() => loadFromConfigurator("all")}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
              title="Bygger en forhåndsvisning fra konfiguratorens nuværende produkt- og tilbehørsdata. Konfiguratorens prislogik ændres ikke."
            >
              <Database className="h-3.5 w-3.5" />
              Indlæs fra eksisterende konfigurator-data
            </button>
          </div>
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
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => { setPublishSummary(null); setPublishOpen(true); }}
                  disabled={dirtyItems.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Publicér ændrede prislistevarer til konfigurator-overlay (price_list_published). Konfiguratorens kode ændres ikke i denne fase."
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  Upload ændringer til konfigurator{dirtyItems.length > 0 ? ` (${dirtyItems.length})` : ""}
                </button>
                <span className="text-xs text-slate-500">
                  {loadingItems ? "Indlæser…" : `${filteredItems.length} af ${exportItems.length} varer`}
                </span>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <strong>DB/DG beregnes med 25% standardrabat.</strong>{" "}
              Pilen ved DB vises på ændrede varer og sammenligner mod konfiguratorens nuværende pris.
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[640px] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Produktgruppe</th>
                    <th className="px-3 py-2 text-left">Varenr.</th>
                    <th className="px-3 py-2 text-left">Varetekst</th>
                    <th className="px-3 py-2 text-right">Kostpris DKK</th>
                    <th className="px-3 py-2 text-right">Pris DKK</th>
                    <th className="px-3 py-2 text-right">DB DKK<br /><span className="font-normal">(25%)</span></th>
                    <th className="px-3 py-2 text-right">DG %<br /><span className="font-normal">(25%)</span></th>
                    <th className="px-3 py-2 text-right">Pris SEK</th>
                    <th className="px-3 py-2 text-right">Pris EUR</th>
                    <th className="px-3 py-2 text-left">Opdateret</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.slice(0, 1000).map((i) => {
                    const grp = groupMap.get(i.item_number) ?? "Options/accessories/other";
                    const marginDb = calcMarginDb(i.price_dkk, i.cost_price_dkk);
                    const marginPct = calcMarginPct(i.price_dkk, marginDb);
                    const seedItem = configuratorSeedByItemNumber.get(i.renamed_from_item_number ?? i.item_number);
                    const baseMarginDb = calcMarginDb(seedItem?.price_dkk ?? null, i.cost_price_dkk);
                    const marginDelta = i.is_dirty && marginDb != null && baseMarginDb != null
                      ? Math.round((marginDb - baseMarginDb) * 100) / 100
                      : null;
                    return (
                      <tr key={i.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            {grp}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {i.item_number}
                          {i.is_dirty && (
                            <span className="ml-2 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
                              Ændret – ikke publiceret
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">{i.item_text_da ?? <span className="text-slate-400">—</span>}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">{fmtPrice(i.cost_price_dkk)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtPrice(i.price_dkk)}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">
                          <div className="flex items-center justify-end gap-2">
                            <span>{fmtPrice(marginDb)}</span>
                            <MarginTrend delta={marginDelta} />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">{fmtPercent(marginPct)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtPrice(i.price_sek)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtPrice(i.price_eur)}</td>
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
                    );
                  })}
                  {filteredItems.length === 0 && !loadingItems && (
                    <tr><td colSpan={11} className="px-3 py-6 text-center text-sm text-slate-500">Ingen varer.</td></tr>
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
              <h2 className="font-bold text-slate-900 mb-2">Upload kostpriser</h2>
              <p className="text-xs text-slate-600 mb-3">
                Upload et Excel- eller CSV-ark med varenr. og kostpris. Hvis arket også indeholder varetekst eller salgspriser,
                kan de felter også opdateres i samme forhåndsvisning.
              </p>
              <p className="text-xs text-slate-600 mb-3">
                Understøttede kolonner (case-insensitive): varenr / item_number, varetekst_da / item_text_da,
                kostpris_dkk / cost_price_dkk, pris_dkk / price_dkk, pris_sek / price_sek, pris_eur / price_eur. Tomme felter overskriver
                aldrig eksisterende værdier, og ingen varer slettes.
              </p>
              <ProductScopeSelect value={productScope} onChange={setProductScope} />
              <div className="flex items-center gap-3 flex-wrap">
                <input type="file" accept=".csv,text/csv,.xlsx,.xls" onChange={onFile} disabled={loadingItems} className="block text-sm" />
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
                        <th className="px-2 py-1.5">Produktgruppe</th>
                        <th className="px-2 py-1.5">Varenr.</th>
                        <th className="px-2 py-1.5">Varetekst</th>
                        <th className="px-2 py-1.5 text-right">Kostpris DKK</th>
                        <th className="px-2 py-1.5 text-right">Pris DKK</th>
                        <th className="px-2 py-1.5 text-right">Pris SEK</th>
                        <th className="px-2 py-1.5 text-right">Pris EUR</th>
                        <th className="px-2 py-1.5">Ændringer / fejl</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPreview.slice(0, 500).map((p) => {
                        const grp = p.item_number ? (groupMap.get(p.item_number) ?? "—") : "—";
                        const nonPriceChanges = p.changes.filter((c) => c.field === "item_text_da");
                        return (
                        <tr key={p.rowIndex} className="border-t border-slate-100 align-top">
                          <td className="px-2 py-1.5 font-mono text-slate-400">{p.rowIndex}</td>
                          <td className="px-2 py-1.5"><StatusPill bucket={p.bucket} /></td>
                          <td className="px-2 py-1.5">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{grp}</span>
                          </td>
                          <td className="px-2 py-1.5 font-mono">{p.item_number ?? "—"}</td>
                          <td className="px-2 py-1.5">{p.raw.item_text_da || p.existing?.item_text_da || "—"}</td>
                          <PriceCell p={p} field="cost_price_dkk" />
                          <PriceCell p={p} field="price_dkk" />
                          <PriceCell p={p} field="price_sek" />
                          <PriceCell p={p} field="price_eur" />
                          <td className="px-2 py-1.5">
                            {p.bucket === "error" && <span className="text-rose-700">{p.errorMessage}</span>}
                            {p.bucket === "create" && <span className="text-emerald-700">Opretter ny vare.</span>}
                            {p.bucket === "skip" && <span className="text-slate-500">Ingen ændringer.</span>}
                            {p.bucket === "update" && (
                              nonPriceChanges.length === 0
                                ? <span className="text-slate-500">Kun prisændringer.</span>
                                : <ul className="space-y-0.5">
                                    {nonPriceChanges.map((c) => (
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
                        );
                      })}
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
              Download den nuværende prisliste som Excel (kolonner: maskintype, varenr, varetekst, kostpris DKK, pris DKK, pris SEK, pris EUR).
            </p>
            <ProductScopeSelect value={productScope} onChange={setProductScope} />
            <button
              onClick={downloadExport}
              disabled={loadingItems || scopedExportItems.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Eksportér prisliste ({scopedExportItems.length})
            </button>
            {items.length === 0 && scopedExportItems.length > 0 && (
              <p className="mt-3 text-xs text-amber-700">
                Backend-prislisten er tom lige nu. Eksporten viser derfor konfiguratorens nuværende standardpriser.
              </p>
            )}
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

      {publishOpen && (
        <PublishModal
          rows={publishPreview}
          busy={publishBusy}
          summary={publishSummary}
          onClose={() => { setPublishOpen(false); setPublishSummary(null); }}
          onConfirm={onPublishConfirm}
        />
      )}

      <PortalFooter language={lang} />
    </div>
  );
}

function seedToPriceListItem(seed: ReturnType<typeof buildConfiguratorSeed>[number]): PriceListItem {
  return {
    id: `configurator-${seed.item_number}`,
    item_number: seed.item_number,
    renamed_from_item_number: null,
    item_text_da: seed.item_text_da,
    cost_price_dkk: null,
    cost_price_source: null,
    cost_price_updated_at: null,
    price_dkk: seed.price_dkk,
    price_eur: seed.price_eur,
    price_sek: seed.price_sek,
    updated_at: new Date(0).toISOString(),
    updated_by_email: null,
    is_dirty: false,
    last_published_at: null,
  };
}

export type PriceWorkbookRow = {
  group: string;
  item_number: string;
  item_text_da: string;
  cost_price_dkk: number | string;
  price_dkk: number;
  price_sek: number | string;
  price_eur: number | string;
};

export function buildPriceWorkbookSheet(rows: PriceWorkbookRow[]) {
  const headers = [
    "Maskintype",
    "Varenr.",
    "Varetekst (DA)",
    "Kostpris DKK",
    "Nuværende pris DKK",
    "Nuværende pris SEK",
    "Nuværende pris EUR",
    "Nuværende DB DKK",
    "Nuværende DG %",
    "Ny pris DKK",
    "Prisændring %",
    "Masseændring – skriv X",
    "Ny pris DKK",
    "Ny pris SEK",
    "Ny pris EUR",
    "Ny DB DKK",
    "Ny DG %",
    "Note",
  ];

  const aoa: Array<Array<string | number>> = [
    ["PRISLISTEVÆRKTØJ"],
    ["1. INDSTILLINGER", "", "", "HURTIG INFO", "", "", "", "SÅDAN BRUGER DU ARKET"],
    ["SEK kurs (DKK pr. 100 SEK)", 66.5, "", "Skriv i de orange felter til venstre.", "", "", "", "1. Ret eventuelt SEK/EUR-kurs, standardrabat eller masseændring øverst."],
    ["EUR kurs (DKK pr. 1 EUR)", 7.45, "", "Ret én vare via Ny pris DKK eller Prisændring %.", "", "", "", "2. Ret én vare: skriv ønsket pris i Ny pris DKK eller skriv fx 1,00% i Prisændring %."],
    ["Standard rabat (%)", 0.25, "", "Masseændring: skriv X i kolonnen Masseændring – skriv X.", "", "", "", "3. Masseændring: skriv procent i feltet Masseændring % og skriv X ud for de varer, der skal ændres."],
    ["Masseændring (%)", 0, "", "Både X og x accepteres. Tom celle betyder ingen masseændring.", "", "", "", "4. Eksempel: Masseændring % = 3,00%."],
    ["", "", "", "Systemet beregner automatisk nye priser og avance.", "", "", "", "5. Vare A = X, B = tom, C = X, D = x. Resultat: A, C og D får +3,00%. B ændres ikke."],
    ["", "", "", "Upload samme Excel-fil igen. Systemet indlæser de nye pris-kolonner.", "", "", "", "6. Slet ikke kolonner eller rækker."],
    ["2. PRISLISTE"],
    ["VAREDATA / IDENTIFIKATION", "", "", "", "NUVÆRENDE VÆRDIER", "", "", "", "", "DINE ÆNDRINGER - udfyld kun her", "", "", "NYE BEREGNEDE VÆRDIER - automatisk", "", "", "", "", "NOTE"],
    headers,
    ...rows.map((row) => [
      row.group,
      row.item_number,
      row.item_text_da,
      row.cost_price_dkk,
      row.price_dkk,
      row.price_sek,
      row.price_eur,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const sectionRow = 9;
  const groupRow = 10;
  const headerRow = 11;
  const firstDataRow = headerRow + 1;
  const lastRow = rows.length + headerRow;
  const legendRow = lastRow + 3;

  for (let r = firstDataRow; r <= lastRow; r++) {
    const row = rows[r - firstDataRow];
    const price = toWorkbookNumber(row.price_dkk);
    const cost = toWorkbookNumber(row.cost_price_dkk);
    const currentDb = price != null && cost != null ? roundMoney(price * 0.75 - cost) : "";
    const currentDg = typeof currentDb === "number" && price != null && price > 0 ? currentDb / price : "";
    ws[`H${r}`] = { t: typeof currentDb === "number" ? "n" : "s", v: currentDb, f: `IF(OR(E${r}="",D${r}=""),"",ROUND(E${r}*(1-$B$5)-D${r},2))` };
    ws[`I${r}`] = { t: typeof currentDg === "number" ? "n" : "s", v: currentDg, f: `IF(OR(E${r}="",E${r}=0,H${r}=""),"",H${r}/E${r})` };
    ws[`K${r}`] = { t: "n", v: 0 };
    ws[`M${r}`] = { t: price == null ? "s" : "n", v: price ?? "", f: `IF(ISNUMBER(J${r}),J${r},IF(LOWER(TRIM(L${r}))="x",ROUND(E${r}*(1+$B$6),2),IF(ISNUMBER(K${r}),ROUND(E${r}*(1+K${r}),2),E${r})))` };
    ws[`N${r}`] = { t: price == null ? "s" : "n", v: price == null ? "" : roundMoney((price / 66.5) * 100), f: `IF(M${r}="","",ROUND(M${r}/$B$3*100,2))` };
    ws[`O${r}`] = { t: price == null ? "s" : "n", v: price == null ? "" : roundMoney(price / 7.45), f: `IF(M${r}="","",ROUND(M${r}/$B$4,2))` };
    ws[`P${r}`] = { t: typeof currentDb === "number" ? "n" : "s", v: currentDb, f: `IF(OR(M${r}="",D${r}=""),"",ROUND(M${r}*(1-$B$5)-D${r},2))` };
    ws[`Q${r}`] = { t: typeof currentDg === "number" ? "n" : "s", v: currentDg, f: `IF(OR(M${r}="",M${r}=0,P${r}=""),"",P${r}/M${r})` };
  }

  const border = {
    top: { style: "thin", color: { rgb: "B7C3B5" } },
    right: { style: "thin", color: { rgb: "B7C3B5" } },
    bottom: { style: "thin", color: { rgb: "B7C3B5" } },
    left: { style: "thin", color: { rgb: "B7C3B5" } },
  };
  const darkBorder = {
    top: { style: "medium", color: { rgb: "0F4D2F" } },
    right: { style: "medium", color: { rgb: "0F4D2F" } },
    bottom: { style: "medium", color: { rgb: "0F4D2F" } },
    left: { style: "medium", color: { rgb: "0F4D2F" } },
  };
  const titleStyle = {
    font: { bold: true, sz: 20, color: { rgb: "0B3B24" } },
    alignment: { vertical: "center" },
  };
  const boxHeaderStyle = {
    font: { bold: true, sz: 12, color: { rgb: "0F172A" } },
    fill: { fgColor: { rgb: "EAF4E5" } },
    border: darkBorder,
    alignment: { vertical: "top", wrapText: true },
  };
  const inputStyle = {
    fill: { fgColor: { rgb: "FCE4C4" } },
    border: {
      top: { style: "thin", color: { rgb: "D9822B" } },
      right: { style: "thin", color: { rgb: "D9822B" } },
      bottom: { style: "thin", color: { rgb: "D9822B" } },
      left: { style: "thin", color: { rgb: "D9822B" } },
    },
    alignment: { horizontal: "right", vertical: "center" },
  };
  const dataStyle = {
    fill: { fgColor: { rgb: "F3F0E8" } },
    border,
    alignment: { vertical: "top", wrapText: true },
  };
  const dataHeaderStyle = {
    font: { bold: true, color: { rgb: "0F172A" } },
    fill: { fgColor: { rgb: "E7E2D7" } },
    border,
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };
  const currentStyle = {
    fill: { fgColor: { rgb: "EAF4E5" } },
    border,
    alignment: { vertical: "top" },
  };
  const currentHeaderStyle = {
    font: { bold: true, color: { rgb: "0F172A" } },
    fill: { fgColor: { rgb: "D9EAD3" } },
    border,
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };
  const changeStyle = {
    fill: { fgColor: { rgb: "FCE4E4" } },
    border,
    alignment: { vertical: "top" },
  };
  const changeHeaderStyle = {
    font: { bold: true, color: { rgb: "0F172A" } },
    fill: { fgColor: { rgb: "F4CCCC" } },
    border,
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };
  const outputStyle = {
    fill: { fgColor: { rgb: "FFF2CC" } },
    border,
    alignment: { vertical: "top" },
  };
  const outputHeaderStyle = {
    font: { bold: true, color: { rgb: "0F172A" } },
    fill: { fgColor: { rgb: "FFE599" } },
    border,
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };
  const noteStyle = {
    fill: { fgColor: { rgb: "FFFFFF" } },
    border,
    alignment: { vertical: "top", wrapText: true },
  };
  const sectionStyle = {
    font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "0F4D2F" } },
    border: darkBorder,
  };
  const infoStyle = {
    fill: { fgColor: { rgb: "FFFFFF" } },
    border: darkBorder,
    alignment: { vertical: "top", wrapText: true },
  };
  const numberFormat = "#,##0.00";
  const percentFormat = "0.00%";

  styleCell(ws, "A1", titleStyle);
  for (let r = 2; r <= 7; r++) {
    for (let c = 1; c <= 6; c++) {
      const cell = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
      styleCell(ws, cell, r === 2 && (c === 1 || c === 4) ? boxHeaderStyle : infoStyle);
    }
    for (let c = 8; c <= 13; c++) {
      const cell = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
      styleCell(ws, cell, r === 2 ? boxHeaderStyle : infoStyle);
    }
  }
  for (const cell of ["B3", "B4", "B5", "B6"]) styleCell(ws, cell, inputStyle);
  ws["B3"].z = "0.00";
  ws["B4"].z = "0.00";
  ws["B5"].z = percentFormat;
  ws["B6"].z = percentFormat;
  for (let c = 1; c <= headers.length; c++) {
    styleCell(ws, XLSX.utils.encode_cell({ r: sectionRow - 1, c: c - 1 }), sectionStyle);
    const groupCell = XLSX.utils.encode_cell({ r: groupRow - 1, c: c - 1 });
    if (c <= 4) styleCell(ws, groupCell, dataHeaderStyle);
    else if (c <= 9) styleCell(ws, groupCell, currentHeaderStyle);
    else if (c <= 12) styleCell(ws, groupCell, changeHeaderStyle);
    else if (c <= 17) styleCell(ws, groupCell, outputHeaderStyle);
    else styleCell(ws, groupCell, dataHeaderStyle);
  }
  for (let c = 0; c < headers.length; c++) {
    const cell = XLSX.utils.encode_cell({ r: headerRow - 1, c });
    if (c <= 3) styleCell(ws, cell, dataHeaderStyle);
    else if (c <= 8) styleCell(ws, cell, currentHeaderStyle);
    else if (c <= 11) styleCell(ws, cell, changeHeaderStyle);
    else if (c <= 16) styleCell(ws, cell, outputHeaderStyle);
    else styleCell(ws, cell, dataHeaderStyle);
  }
  for (let r = firstDataRow; r <= lastRow; r++) {
    for (const col of ["E", "F", "G", "H", "I"]) {
      const cell = `${col}${r}`;
      styleCell(ws, cell, currentStyle);
    }
    for (const col of ["J", "K", "L"]) {
      const cell = `${col}${r}`;
      styleCell(ws, cell, changeStyle);
    }
    for (const col of ["M", "N", "O", "P", "Q"]) {
      const cell = `${col}${r}`;
      styleCell(ws, cell, outputStyle);
    }
    for (const col of ["A", "B", "C", "D"]) {
      const cell = `${col}${r}`;
      styleCell(ws, cell, dataStyle);
    }
    styleCell(ws, `R${r}`, noteStyle);
    for (const col of ["D", "E", "F", "G", "H", "J", "M", "N", "O", "P"]) {
      const cell = ws[`${col}${r}`];
      if (cell) cell.z = numberFormat;
    }
    for (const col of ["I", "K", "Q"]) {
      const cell = ws[`${col}${r}`];
      if (cell) cell.z = percentFormat;
    }
  }

  ws[`A${legendRow}`] = { t: "s", v: "FARVEFORKLARING" };
  ws[`A${legendRow + 1}`] = { t: "s", v: "Orange = indstillinger/input" };
  ws[`C${legendRow + 1}`] = { t: "s", v: "Grøn = nuværende værdier" };
  ws[`E${legendRow + 1}`] = { t: "s", v: "Pink = dine ændringer" };
  ws[`G${legendRow + 1}`] = { t: "s", v: "Gul = nye beregnede værdier" };
  styleCell(ws, `A${legendRow}`, boxHeaderStyle);
  styleCell(ws, `A${legendRow + 1}`, inputStyle);
  styleCell(ws, `C${legendRow + 1}`, currentStyle);
  styleCell(ws, `E${legendRow + 1}`, changeStyle);
  styleCell(ws, `G${legendRow + 1}`, outputStyle);

  ws["!cols"] = [
    { wch: 22 }, { wch: 14 }, { wch: 46 }, { wch: 14 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 15 },
    { wch: 16 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    { wch: 14 }, { wch: 12 }, { wch: 26 },
  ];
  ws["!rows"] = [
    { hpt: 24 }, { hpt: 24 }, { hpt: 22 }, { hpt: 22 }, { hpt: 22 }, { hpt: 22 },
    { hpt: 22 }, { hpt: 4 }, { hpt: 24 }, { hpt: 28 }, { hpt: 42 },
  ];
  ws["!merges"] = [
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    { s: { r: 1, c: 3 }, e: { r: 1, c: 5 } },
    { s: { r: 2, c: 3 }, e: { r: 2, c: 5 } },
    { s: { r: 3, c: 3 }, e: { r: 3, c: 5 } },
    { s: { r: 4, c: 3 }, e: { r: 4, c: 5 } },
    { s: { r: 5, c: 3 }, e: { r: 5, c: 5 } },
    { s: { r: 6, c: 3 }, e: { r: 6, c: 5 } },
    { s: { r: 1, c: 7 }, e: { r: 1, c: 12 } },
    { s: { r: 2, c: 7 }, e: { r: 2, c: 12 } },
    { s: { r: 3, c: 7 }, e: { r: 3, c: 12 } },
    { s: { r: 4, c: 7 }, e: { r: 4, c: 12 } },
    { s: { r: 5, c: 7 }, e: { r: 5, c: 12 } },
    { s: { r: 6, c: 7 }, e: { r: 6, c: 12 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 17 } },
    { s: { r: 9, c: 0 }, e: { r: 9, c: 3 } },
    { s: { r: 9, c: 4 }, e: { r: 9, c: 8 } },
    { s: { r: 9, c: 9 }, e: { r: 9, c: 11 } },
    { s: { r: 9, c: 12 }, e: { r: 9, c: 16 } },
    { s: { r: legendRow - 1, c: 0 }, e: { r: legendRow - 1, c: 7 } },
    { s: { r: legendRow, c: 0 }, e: { r: legendRow, c: 1 } },
    { s: { r: legendRow, c: 2 }, e: { r: legendRow, c: 3 } },
    { s: { r: legendRow, c: 4 }, e: { r: legendRow, c: 5 } },
    { s: { r: legendRow, c: 6 }, e: { r: legendRow, c: 7 } },
  ];
  ws["!autofilter"] = { ref: `A${headerRow}:R${lastRow}` };
  ws["!freeze"] = { xSplit: 0, ySplit: headerRow };

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:R1");
  range.e.c = Math.max(range.e.c, 17);
  range.e.r = Math.max(range.e.r, legendRow);
  ws["!ref"] = XLSX.utils.encode_range(range);

  return ws;
}

function styleCell(ws: XLSX.WorkSheet, address: string, style: Record<string, unknown>) {
  const cell = (ws[address] ?? { t: "s", v: "" }) as XLSX.CellObject & { s?: Record<string, unknown> };
  cell.s = style;
  ws[address] = cell;
}

function toWorkbookNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null || value === "") return null;
  const trimmed = String(value).trim().replace(/\s/g, "");
  if (!trimmed) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function mergeSeedAndStoredItems(seedItems: PriceListItem[], storedItems: PriceListItem[]): PriceListItem[] {
  const byItemNumber = new Map<string, PriceListItem>();
  for (const item of seedItems) byItemNumber.set(item.item_number, item);
  for (const item of storedItems) {
    if (item.renamed_from_item_number) byItemNumber.delete(item.renamed_from_item_number);
  }
  for (const item of storedItems) byItemNumber.set(item.item_number, item);
  return [...byItemNumber.values()];
}

function filterItemsByScope(
  items: PriceListItem[],
  scope: ProductScope,
  groupMap: Map<string, ProductGroupKey>,
): PriceListItem[] {
  const filtered = scope === "all"
    ? items.filter((item) => groupMap.get(item.item_number) !== "Options/accessories/other")
    : items.filter((item) => groupMap.get(item.item_number) === scope);

  return [...filtered].sort((a, b) => {
    const ga = groupMap.get(a.item_number) ?? "Options/accessories/other";
    const gb = groupMap.get(b.item_number) ?? "Options/accessories/other";
    const groupDiff = groupOrderIndex(ga) - groupOrderIndex(gb);
    if (groupDiff !== 0) return groupDiff;
    return a.item_number.localeCompare(b.item_number, "da", { numeric: true });
  });
}

function filterCsvRowsByScope(
  rows: CsvPriceRow[],
  scope: ProductScope,
  groupMap: Map<string, ProductGroupKey>,
): CsvPriceRow[] {
  if (scope === "all") {
    return rows.filter((row) => groupMap.get((row.item_number || "").trim()) !== "Options/accessories/other");
  }
  return rows.filter((row) => groupMap.get((row.item_number || "").trim()) === scope);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function fmtPrice(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPercent(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("da-DK", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function calcMarginDb(priceDkk: number | null, costDkk: number | null): number | null {
  if (priceDkk == null || costDkk == null) return null;
  return Math.round((priceDkk * 0.75 - costDkk) * 100) / 100;
}

function calcMarginPct(priceDkk: number | null, marginDb: number | null): number | null {
  if (priceDkk == null || priceDkk === 0 || marginDb == null) return null;
  return marginDb / priceDkk;
}

function MarginTrend({ delta }: { delta: number | null }) {
  if (delta == null || Math.abs(delta) < 0.01) return null;
  const positive = delta > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      title={`DB ${positive ? "stiger" : "falder"} med ${fmtPrice(Math.abs(delta))} ift. konfiguratorens nuværende pris`}
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
        positive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
      }`}
    >
      <Icon className="h-3 w-3" />
      {fmtPrice(Math.abs(delta))}
    </span>
  );
}

function fmtPriceStr(s: string | null | undefined): string {
  if (s == null || s === "") return "—";
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return fmtPrice(n);
}

function PriceCell({ p, field }: { p: PreviewRow; field: "cost_price_dkk" | "price_dkk" | "price_sek" | "price_eur" }) {
  const change = p.changes.find((c) => c.field === field);
  const oldVal = p.existing ? (p.existing[field] == null ? null : String(p.existing[field])) : null;
  const rawNew = (p.raw[field] ?? "").trim();

  if (p.bucket === "error") {
    return <td className="px-2 py-1.5 text-right font-mono text-slate-400">{rawNew ? fmtPriceStr(rawNew) : (oldVal ? fmtPriceStr(oldVal) : "—")}</td>;
  }
  if (p.bucket === "create") {
    return <td className="px-2 py-1.5 text-right font-mono text-emerald-700">{rawNew ? fmtPriceStr(rawNew) : "—"}</td>;
  }
  if (change) {
    return (
      <td className="px-2 py-1.5 text-right font-mono">
        <span className="text-slate-500 line-through">{fmtPriceStr(change.oldValue)}</span>{" "}
        <span className="text-slate-400">→</span>{" "}
        <span className="text-amber-800 font-semibold">{fmtPriceStr(change.newValue)}</span>
      </td>
    );
  }
  // skip / update without change for this field — show existing (or new if no existing)
  return <td className="px-2 py-1.5 text-right font-mono text-slate-600">{fmtPriceStr(oldVal ?? rawNew)}</td>;
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

function FlowStepButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm font-bold ${
        active
          ? "border-emerald-600 bg-emerald-50 text-emerald-900"
          : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function ProductScopeSelect({
  value,
  onChange,
}: {
  value: ProductScope;
  onChange: (value: ProductScope) => void;
}) {
  return (
    <label className="mb-4 block max-w-sm">
      <span className="mb-1 block text-xs font-semibold text-slate-700">Maskine</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value === "all" ? "all" : e.target.value as ProductGroupKey)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
      >
        <option value="all">Alle maskiner (6)</option>
        {PRODUCT_SCOPE_GROUPS.map((group) => (
          <option key={group} value={group}>{group}</option>
        ))}
      </select>
    </label>
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
  const [itemNumber, setItemNumber] = useState(item.item_number);
  const [text, setText] = useState(item.item_text_da ?? "");
  const [costDkk, setCostDkk] = useState(formatEditablePrice(item.cost_price_dkk));
  const [dkk, setDkk] = useState(formatEditablePrice(item.price_dkk));
  const [eur, setEur] = useState(formatEditablePrice(item.price_eur));
  const [sek, setSek] = useState(formatEditablePrice(item.price_sek));
  const [busy, setBusy] = useState(false);

  function num(v: string): number | null {
    const n = parseEditablePrice(v);
    if (n == null) return null;
    return Number.isFinite(n) ? n : NaN;
  }

  async function save() {
    const nextItemNumber = itemNumber.trim();
    if (!nextItemNumber) {
      toast.error("Varenr. skal udfyldes.");
      return;
    }
    const c = num(costDkk), d = num(dkk), e = num(eur), s = num(sek);
    if (Number.isNaN(c) || Number.isNaN(d) || Number.isNaN(e) || Number.isNaN(s)) {
      toast.error("Ugyldig pris-værdi.");
      return;
    }
    setBusy(true);
    const res = await updatePriceItem({
      item_number: item.item_number,
      new_item_number: nextItemNumber,
      item_text_da: text.trim() || null,
      cost_price_dkk: c,
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
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Rediger varenr.</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{item.item_number}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <Field label="Varenr.">
            <input value={itemNumber} onChange={(e) => setItemNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
          </Field>
          <Field label="Varetekst">
            <input value={text} onChange={(e) => setText(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Kostpris DKK"><PriceInput value={costDkk} onChange={setCostDkk} /></Field>
            <Field label="Pris DKK"><PriceInput value={dkk} onChange={setDkk} /></Field>
            <Field label="Pris SEK"><PriceInput value={sek} onChange={setSek} /></Field>
            <Field label="Pris EUR"><PriceInput value={eur} onChange={setEur} /></Field>
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
  function formatOnBlur() {
    const n = parseEditablePrice(value);
    if (n == null || Number.isNaN(n)) return;
    onChange(formatEditablePrice(n));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={formatOnBlur}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-right"
      placeholder="0,00"
    />
  );
}

function parseEditablePrice(value: string): number | null {
  const t = value.trim().replace(/\s/g, "");
  if (!t) return null;
  const normalized = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : t.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function formatEditablePrice(value: number | null | undefined): string {
  if (value == null) return "";
  return value.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PublishModal({
  rows, busy, summary, onClose, onConfirm,
}: {
  rows: PublishPreviewRow[];
  busy: boolean;
  summary: PublishSummary | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const ready = rows.filter((r) => r.status === "ready");
  const missing = rows.filter((r) => r.status === "missing_in_configurator");

  function diffNum(oldV: number | null, newV: number | null) {
    const same = (oldV ?? null) === (newV ?? null);
    if (same) return <span className="text-slate-500 font-mono">{fmtPrice(newV)}</span>;
    return (
      <span className="font-mono">
        <span className="text-slate-500 line-through">{fmtPrice(oldV)}</span>{" "}
        <span className="text-slate-400">→</span>{" "}
        <span className="text-amber-800 font-semibold">{fmtPrice(newV)}</span>
      </span>
    );
  }

  function diffText(oldV: string | null, newV: string | null) {
    const same = (oldV ?? "") === (newV ?? "");
    if (same) return <span className="text-slate-500">{newV ?? "—"}</span>;
    return (
      <span>
        <span className="text-slate-500 line-through">{oldV ?? "—"}</span>{" "}
        <span className="text-slate-400">→</span>{" "}
        <span className="text-amber-800 font-semibold">{newV ?? "—"}</span>
      </span>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-5xl w-full max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Upload ændringer til konfigurator</h3>
            <p className="text-xs text-slate-500 mt-1">
              Sammenligner ændrede prislistevarer (Backend) mod konfiguratorens nuværende værdier
              (machines.ts). Ved bekræftelse skrives kun de ændrede varer til <span className="font-mono">price_list_published</span>.
              Konfiguratoren læser ikke fra denne tabel endnu — eksisterende tilbud, ordrer, PDF og e-mail er uændrede.
            </p>
            <p className="text-xs text-slate-600 mt-2">
              <strong>{ready.length}</strong> klar til upload
              {missing.length > 0 && <> · <strong>{missing.length}</strong> mangler i konfigurator</>}
              {" "}({rows.length} ændringer i alt)
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {summary ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-700 mt-0.5" />
                <div>
                  <p className="font-bold text-emerald-900">Publicering gennemført</p>
                  <p className="text-sm text-emerald-900 mt-1">
                    <strong>{summary.created}</strong> oprettet, <strong>{summary.updated}</strong> opdateret,{" "}
                    <strong>{summary.skipped}</strong> sprunget over.
                  </p>
                  {summary.errors.length > 0 && (
                    <ul className="mt-2 text-[11px] font-mono bg-white rounded p-2 border border-rose-200 max-h-40 overflow-y-auto">
                      {summary.errors.map((e, i) => (<li key={i}>{e.item_number ?? "—"}: {e.error}</li>))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">Ingen ændrede varer at publicere.</p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr className="text-left">
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Varenr.</th>
                    <th className="px-2 py-1.5">Varetekst (gammel → ny)</th>
                    <th className="px-2 py-1.5 text-right">Pris DKK</th>
                    <th className="px-2 py-1.5 text-right">Pris EUR</th>
                    <th className="px-2 py-1.5 text-right">Pris SEK</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.item_number} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-1.5">
                        {r.status === "ready" ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Klar</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Mangler i konfigurator</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{r.item_number}</td>
                      <td className="px-2 py-1.5">{diffText(r.old_item_text_da, r.item_text_da)}</td>
                      <td className="px-2 py-1.5 text-right">{diffNum(r.old_price_dkk, r.price_dkk)}</td>
                      <td className="px-2 py-1.5 text-right">{diffNum(r.old_price_eur, r.price_eur)}</td>
                      <td className="px-2 py-1.5 text-right">{diffNum(r.old_price_sek, r.price_sek)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {summary ? "Luk" : "Annuller"}
          </button>
          {!summary && (
            <button
              onClick={() => void onConfirm()}
              disabled={busy || rows.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <UploadCloud className="h-4 w-4" />
              {busy ? "Publicerer…" : `Bekræft upload til konfigurator (${rows.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
