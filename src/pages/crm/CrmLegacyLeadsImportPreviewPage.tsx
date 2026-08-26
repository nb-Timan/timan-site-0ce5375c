import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, DatabaseZap, Eye, FileText, Filter, Search, ShieldAlert, Sparkles, UploadCloud, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import CrmLayout from "@/components/crm/CrmLayout";
import { cn } from "@/lib/utils";
import { loadLegacyLeadsPreview, type LegacyPreviewData, type LegacyPreviewReviewRow } from "@/lib/legacyLeadsPreview";
import { executeLegacyLeadImport, previewLegacyLeadImport, type LegacyLeadImportResult } from "@/lib/legacyLeadsImportService";

function badgeClass(status: string) {
  if (["matched", "Vundet"].includes(status)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["unmatched", "missing", "Tabt"].includes(status)) return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function statusLabel(status: string) {
  if (status === "needs_live_verification") return "Skal verificeres";
  if (status === "matched") return "Matchet";
  if (status === "missing") return "Mangler";
  if (status === "unmatched") return "Ikke matchet";
  return status || "-";
}

function StatCard({ label, value, tone = "default" }: { label: string; value: unknown; tone?: "default" | "ok" | "warn" }) {
  return (
    <div className={cn(
      "rounded-2xl border bg-white p-4 shadow-sm",
      tone === "ok" && "border-emerald-100 bg-emerald-50/40",
      tone === "warn" && "border-amber-100 bg-amber-50/50",
      tone === "default" && "border-slate-100",
    )}>
      <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500 font-semibold">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{String(value ?? "-")}</p>
    </div>
  );
}

export default function CrmLegacyLeadsImportPreviewPage() {
  const [data, setData] = useState<LegacyPreviewData | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "open" | "closed" | "demo" | "warnings">("all");
  const [seller, setSeller] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<LegacyLeadImportResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLegacyLeadsPreview()
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Kunne ikke læse preview-data.");
      });
    return () => { cancelled = true; };
  }, []);

  const sellers = useMemo(() => {
    const values = new Set((data?.leads || []).map((lead) => lead.owner_initials).filter(Boolean));
    return Array.from(values).sort();
  }, [data]);

  const visible = useMemo(() => {
    const rows = data?.leads || [];
    const query = q.trim().toLowerCase();
    return rows.filter((lead) => {
      if (tab === "open" && !lead.is_open) return false;
      if (tab === "closed" && lead.is_open) return false;
      if (tab === "demo" && lead.preview_type !== "demo") return false;
      if (tab === "warnings" && lead.owner_initials && lead.machine_types.length > 0 && lead.contact_complete) return false;
      if (seller && lead.owner_initials !== seller) return false;
      if (!query) return true;
      return [
        lead.display_no,
        lead.title,
        lead.dealer_name,
        lead.owner_name,
        lead.owner_initials,
        lead.machine_types.join(" "),
        lead.country,
        lead.contact_information,
      ].join(" ").toLowerCase().includes(query);
    });
  }, [data, q, seller, tab]);

  async function handleRunImport() {
    if (!data || importBusy) return;
    const confirmed = window.confirm(
      "Du er ved at importere 756 historiske leads til det rigtige CRM-system i Supabase.\n\nBekræft kun hvis previewet er godkendt.",
    );
    if (!confirmed) return;
    setImportBusy(true);
    setImportResult(null);
    try {
      const preview = await previewLegacyLeadImport(data.leads);
      if (preview.error) {
        setImportResult(preview);
        return;
      }
      const result = await executeLegacyLeadImport(data.leads);
      setImportResult(result);
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <CrmLayout pageTitle="Historisk lead-import preview">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
            <ShieldAlert className="h-3.5 w-3.5" />
            Lokal preview - ingen production-import
          </p>
          <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold text-slate-950">
            <DatabaseZap className="h-6 w-6 text-[#2d5a27]" />
            Historiske LeadsData som CRM-preview
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Viser Excel-rækkerne med G-5000+ numre, sælgermatch, status og review-advarsler før endelig godkendelse.
          </p>
        </div>
        {data && (
          <div className="flex flex-col items-start gap-2 md:items-end">
            <button
              onClick={handleRunImport}
              disabled={importBusy}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2d5a27] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#234820] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UploadCloud className="h-4 w-4" />
              {importBusy ? "Importerer..." : "Kør rigtig import"}
            </button>
            <div className="text-sm text-slate-500">
              Genereret: {new Date(data.summary.generated_at).toLocaleString("da-DK")}
            </div>
          </div>
        )}
      </div>

      {importResult && (
        <div className={cn(
          "mb-5 rounded-2xl border p-4 text-sm",
          importResult.error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800",
        )}>
          {importResult.error ? (
            <>
              <p className="font-semibold">Importen blev ikke gennemført.</p>
              <p className="mt-1">{importResult.error}</p>
              {typeof importResult.inserted_before_error === "number" && <p className="mt-1">Indsat før fejl: {importResult.inserted_before_error}</p>}
            </>
          ) : (
            <>
              <p className="font-semibold">Importen er kørt til Supabase.</p>
              <p className="mt-1">
                Modtaget: {importResult.received ?? "-"} · Indsat: {importResult.inserted ?? "-"} · Sprunget over som eksisterende: {importResult.skipped_existing ?? importResult.existing ?? 0}
              </p>
              <p className="mt-1">
                Numre: {importResult.first_no ?? "-"} til {importResult.last_no ?? "-"} · Forhandler matchet: {importResult.dealer_matched ?? "-"} · Ikke matchet: {importResult.dealer_unmatched ?? "-"}
              </p>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          <p className="font-semibold">Preview-data mangler.</p>
          <p className="mt-1">Kør `npm run import:legacy-leads:preview` og genindlæs siden.</p>
          <p className="mt-2 text-xs">{error}</p>
        </div>
      )}

      {!data && !error && <p className="rounded-2xl border bg-white p-6 text-sm text-slate-500 shadow-sm">Indlæser preview...</p>}

      {data && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <StatCard label="Excel-rækker" value={data.summary.source_rows} />
            <StatCard label="Preview-leads" value={data.summary.preview_rows} tone="ok" />
            <StatCard label="Numre" value={`${data.summary.first_preview_no}-${data.summary.last_preview_no?.replace("G-", "")}`} />
            <StatCard label="Åbne" value={data.summary.open_count} />
            <StatCard label="Lukkede" value={data.summary.closed_count} />
            <StatCard label="Demo" value={data.summary.demo_count} />
            <StatCard label="Sælger OK" value={data.summary.seller_matched} tone="ok" />
            <StatCard label="Advarsler" value={data.summary.warning_count} tone={data.summary.warning_count ? "warn" : "ok"} />
          </div>

          <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="flex flex-wrap gap-2">
                {[
                  ["all", "Alle"],
                  ["open", "Åbne"],
                  ["closed", "Lukkede"],
                  ["demo", "Demo"],
                  ["warnings", "Review"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key as typeof tab)}
                    className={cn(
                      "rounded-xl border px-3.5 py-2 text-sm font-medium transition",
                      tab === key ? "bg-[#2d5a27] text-white border-[#2d5a27]" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative min-w-[240px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Søg G-nr, kunde, forhandler, sælger, maskine..."
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10"
                />
              </div>
              <div className="relative min-w-[180px]">
                <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={seller}
                  onChange={(e) => setSeller(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm"
                >
                  <option value="">Alle sælgere</option>
                  {sellers.map((initials) => <option key={initials} value={initials}>{initials}</option>)}
                </select>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">{visible.length} rækker vises. Åbn/Rediger viser en forudfyldt preview-form uden at gemme i CRM.</p>
          </div>

          <div className="mb-5 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1450px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.07em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Titel / Kunde</th>
                    <th className="px-4 py-3 text-left">Forhandler</th>
                    <th className="px-4 py-3 text-left">Ejer</th>
                    <th className="px-4 py-3 text-left">Maskine</th>
                    <th className="px-4 py-3 text-left">Dato</th>
                    <th className="px-4 py-3 text-left">Næste opf.</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Handling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.slice(0, 500).map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                          lead.preview_type === "demo" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-sky-200 bg-sky-50 text-sky-700",
                        )}>
                          {lead.preview_type === "demo" ? "DEMO" : "ÅBEN"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-950">{lead.display_no} · {lead.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {lead.contact_fields.company || "Kunde mangler"}
                          {lead.contact_fields.address ? ` Adresse: ${lead.contact_fields.address}` : ""}
                          {lead.contact_fields.postalCode ? ` Postnr. ${lead.contact_fields.postalCode}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-800">{lead.dealer_name || "-"}</p>
                        <span className={cn("mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", badgeClass(lead.dealer_match_status))}>
                          {statusLabel(lead.dealer_match_status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{lead.owner_initials || "-"}</p>
                        <p className="text-xs text-slate-500">{lead.owner_name || "Mangler match"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-800">{lead.machine_types.join(", ") || "-"}</p>
                        {lead.machine_unmatched.length > 0 && <p className="mt-1 text-xs text-rose-600">Ikke matchet: {lead.machine_unmatched.join(", ")}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {lead.first_contact_date || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {lead.next_followup_date || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", badgeClass(lead.status))}>{lead.status}</span>
                        <span className="ml-2 text-xs text-slate-500">{lead.probability}%</span>
                        <p className="mt-1 text-xs text-slate-500">{lead.next_activity}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3 text-xs">
                          <Link to={`/portal/crm/leads/import-preview/${lead.id}`} className="inline-flex items-center gap-1 text-violet-700 hover:underline">
                            <Sparkles className="h-3.5 w-3.5" /> Konverter til demo
                          </Link>
                          <Link to={`/portal/crm/leads/import-preview/${lead.id}`} className="inline-flex items-center gap-1 text-emerald-700 hover:underline">
                            <FileText className="h-3.5 w-3.5" /> Konverter til tilbud
                          </Link>
                          <Link to={`/portal/crm/leads/import-preview/${lead.id}`} className="inline-flex items-center gap-1 text-rose-600 hover:underline">
                            <XCircle className="h-3.5 w-3.5" /> Luk
                          </Link>
                          <Link to={`/portal/crm/leads/import-preview/${lead.id}`} className="inline-flex items-center gap-1 text-slate-700 hover:underline">
                            <Eye className="h-3.5 w-3.5" /> Åbn
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visible.length > 500 && <p className="border-t border-slate-100 p-3 text-xs text-slate-500">Viser de første 500 rækker for performance. Brug søgning/filter for resten.</p>}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {[
              ["Sælger-match", data.review.sellers],
              ["Maskine-match", data.review.machines],
              ["Forhandler-match", data.review.dealers.slice(0, 40)],
            ].map(([title, rows]) => (
              <section key={title as string} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <Sparkles className="h-4 w-4 text-[#2d5a27]" />
                  {title as string}
                </h2>
                <div className="space-y-2">
                  {(rows as LegacyPreviewReviewRow[]).map((row) => (
                    <div key={`${row.original}-${row.mapped}-${row.status}`} className="rounded-xl border border-slate-100 p-3 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-slate-900">{row.original}</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{row.count}</span>
                      </div>
                      <p className="mt-1 text-slate-500">→ {row.mapped || "Ingen mapping"}</p>
                      <span className={cn("mt-2 inline-flex rounded-full border px-2 py-0.5 font-medium", badgeClass(row.status))}>{statusLabel(row.status)} · {row.confidence}%</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </CrmLayout>
  );
}
