import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx-js-style";
import { ClipboardList, Download, MessageSquareText, RefreshCcw, Search, Trash2 } from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { derivePortalRole, getPortalPermissions } from "@/lib/portalAccess";
import { deleteCrm2620Trial, listCrm2620Trials, type Crm2620Trial } from "@/lib/crm2620TrialsService";

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function exportTrials(rows: Crm2620Trial[]): void {
  const exportRows = rows.map((row) => ({
    Dato: fmtDate(row.created_at),
    Firma: row.company_cvr,
    Kontaktperson: row.contact_person,
    Adresse: row.address || "",
    "Postnummer/by": row.zip_city,
    Land: row.country || "",
    Telefon: row.phone,
    "E-mail": row.email,
    Kommentar: row.comment || "",
    "Timan saelger": row.responsible_seller_name || "",
    "Timan saelger e-mail": row.responsible_seller_email || "",
    "Oprettet af": row.created_by_email || "",
  }));
  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Afproevning 2620");
  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `afproevning-2620-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Backend2620TrialsPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Crm2620Trial[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [query, setQuery] = useState("");
  const [commentRow, setCommentRow] = useState<Crm2620Trial | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const portalRole = derivePortalRole(appUser);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;

  async function refresh() {
    setLoadingRows(true);
    try {
      setRows(await listCrm2620Trials(1000));
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleDelete(row: Crm2620Trial) {
    const ok = window.confirm(`Vil du slette afprøvningen for ${row.company_cvr}?`);
    if (!ok) return;

    setDeletingId(row.id);
    try {
      await deleteCrm2620Trial(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      if (commentRow?.id === row.id) setCommentRow(null);
    } catch (error) {
      console.error("[Backend2620TrialsPage.delete]", error);
      window.alert("Kunne ikke slette afprøvningen. Prøv at genindlæse og forsøg igen.");
    } finally {
      setDeletingId(null);
    }
  }

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => [
      row.company_cvr,
      row.contact_person,
      row.address,
      row.zip_city,
      row.phone,
      row.email,
      row.comment,
      row.responsible_seller_name,
      row.responsible_seller_email,
      row.created_by_email,
    ].some((value) => (value || "").toLowerCase().includes(needle)));
  }, [query, rows]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">...</div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!perms?.isBackend) return <Navigate to="/portal/backend" replace />;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage} onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />
      <main className="mx-auto w-full max-w-[1700px] flex-grow px-4 py-10 sm:px-6 lg:px-8 xl:px-12">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Afprøvning af 2620</h1>
              <p className="mt-1 text-sm text-slate-500">Separat register. Tæller ikke som leads, demo-leads eller pipeline.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportTrials(visibleRows)}
              disabled={visibleRows.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Eksportér Excel
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCcw className="h-4 w-4" />
              Genindlæs
            </button>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Indsendelser</h2>
              <p className="text-sm text-slate-500">{visibleRows.length} vist · {rows.length} i alt</p>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Søg firma, kontakt, telefon..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          {loadingRows ? (
            <p className="p-8 text-sm text-slate-500">Indlæser...</p>
          ) : visibleRows.length === 0 ? (
            <p className="p-8 text-sm text-slate-500">Ingen 2620-afprøvninger fundet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.06em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Dato</th>
                    <th className="px-4 py-3 text-left">Firma</th>
                    <th className="px-4 py-3 text-left">Kontaktperson</th>
                    <th className="px-4 py-3 text-left">Adresse</th>
                    <th className="px-4 py-3 text-left">Postnr./by</th>
                    <th className="px-4 py-3 text-left">Land</th>
                    <th className="px-4 py-3 text-left">Telefon</th>
                    <th className="px-4 py-3 text-left">E-mail</th>
                    <th className="px-4 py-3 text-left">Timan sælger</th>
                    <th className="px-3 py-3 text-left">Kommentar</th>
                    <th className="px-4 py-3 text-right">Handling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(row.created_at)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.company_cvr}</td>
                      <td className="px-4 py-3 text-slate-700">{row.contact_person}</td>
                      <td className="min-w-40 px-4 py-3 text-slate-600">{row.address || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.zip_city}</td>
                      <td className="px-4 py-3 text-slate-600">{row.country || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.phone}</td>
                      <td className="px-4 py-3 text-slate-600">{row.email}</td>
                      <td className="px-4 py-3 text-slate-600">{row.responsible_seller_name || row.responsible_seller_email || "-"}</td>
                      <td className="max-w-52 px-3 py-3 text-slate-600">
                        {row.comment ? (
                          <button
                            type="button"
                            onClick={() => setCommentRow(row)}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-left text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                          >
                            <MessageSquareText className="h-3.5 w-3.5 shrink-0" />
                            <span className="line-clamp-1">{row.comment}</span>
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void handleDelete(row)}
                            disabled={deletingId === row.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Slet
                          </button>
                        </div>
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

      <Dialog open={!!commentRow} onOpenChange={(open) => { if (!open) setCommentRow(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Kommentar</DialogTitle>
          </DialogHeader>
          {commentRow && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-bold text-slate-900">{commentRow.company_cvr}</p>
                <p className="text-xs text-slate-500">{commentRow.contact_person} · {fmtDate(commentRow.created_at)}</p>
              </div>
              <p className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
                {commentRow.comment}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
