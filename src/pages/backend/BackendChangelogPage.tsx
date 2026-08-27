/**
 * Marketing -> Nye features på sitet.
 *
 * Internal product changelog editor. This is separate from News CMS.
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Archive, CheckCircle2, FilePenLine, RotateCcw, Send, Sparkles, Undo2 } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { canManageNewsContent } from "@/lib/portalAccess";
import { useEffectivePortalUser } from "@/lib/viewAsUser";
import {
  adminListChangelog,
  adminUpdateChangelog,
  adminUpdateChangelogStatus,
  recommendPublication,
  syncSiteChangesFromGitHub,
  type ChangelogDraft,
  type SiteChangeEntryRow,
  type SiteChangeRecommendation,
  type SiteChangeStatus,
} from "@/lib/portalChangelogService";

const MODULES = [
  "all", "crm", "leads", "dealer_portal", "dealer_data", "service",
  "messe", "marketing", "map", "warranty", "claims", "tsb",
  "users", "budget", "quotes", "orders", "backend",
] as const;
const TYPES = ["all", "feature", "improvement", "bugfix", "security", "performance", "backend", "data", "ui_ux", "integration"] as const;
const ROLES = [
  "all",
  "timan_backend",
  "timan_seller",
  "timan_service",
  "timan_importer",
  "timan_dealer",
  "timan_service_partner",
  "dealer_customer",
  "private_end_user",
  "exhibition_user",
] as const;
const STATUSES: Array<SiteChangeStatus | "all"> = ["all", "new", "draft", "published", "archived"];
const RECOMMENDATIONS: Array<SiteChangeRecommendation | "all"> = ["all", "publish", "maybe", "internal"];

const ROLE_LABEL: Record<string, string> = {
  all: "Alle",
  timan_backend: "Timan Backend",
  timan_seller: "Timan Sælger",
  timan_service: "Timan Service",
  timan_importer: "Importør",
  timan_dealer: "Forhandler",
  timan_service_partner: "Servicepartner",
  dealer_customer: "Forhandlerkunde",
  private_end_user: "Privat / slutbruger",
  exhibition_user: "Timan Messe",
  timan_messe: "Timan Messe",
  dealer_user: "Forhandlerbruger",
  sales: "Timan Sælger",
  service: "Timan Service",
  dealer: "Forhandler",
  admin: "Timan Backend",
};

const STATUS_LABEL: Record<SiteChangeStatus | "all", string> = {
  all: "Alle",
  new: "Ny / ikke gennemgået",
  draft: "Kladde",
  published: "Publiceret",
  archived: "Arkiveret",
};

const REC_LABEL: Record<SiteChangeRecommendation | "all", string> = {
  all: "Alle anbefalinger",
  publish: "Publicér",
  maybe: "Måske",
  internal: "Internt",
};

function dateInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toIsoDate(value: string): string {
  if (!value) return new Date().toISOString();
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function roleLabel(role: string): string {
  return ROLE_LABEL[role] || role;
}

function statusClass(status: SiteChangeStatus) {
  if (status === "published") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "archived") return "bg-slate-100 text-slate-500 ring-slate-200";
  if (status === "new") return "bg-sky-50 text-sky-700 ring-sky-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function recommendationClass(rec: SiteChangeRecommendation) {
  if (rec === "publish") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (rec === "internal") return "bg-slate-100 text-slate-600 ring-slate-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function emptyDraft(): ChangelogDraft {
  return {
    source: "manual",
    source_ref: "",
    implemented_at: new Date().toISOString(),
    title_internal: "",
    description_internal: "",
    technical_description: "",
    title_public: "",
    description_public: "",
    module: "crm",
    change_type: "improvement",
    affected_roles: ["all"],
    user_impact_score: 3,
    technical_impact_score: 3,
    publish_recommendation: "maybe",
    is_important: false,
    status: "new",
    published_at: null,
    archived_at: null,
    reviewed_at: null,
  };
}

function rowToDraft(row: SiteChangeEntryRow): ChangelogDraft {
  return {
    source: row.source,
    source_ref: row.source_ref || "",
    implemented_at: row.implemented_at,
    title_internal: row.title_internal,
    description_internal: row.description_internal || "",
    technical_description: row.technical_description || "",
    title_public: row.title_public || "",
    description_public: row.description_public || "",
    module: row.module,
    change_type: row.change_type,
    affected_roles: row.affected_roles?.length ? row.affected_roles : ["all"],
    user_impact_score: row.user_impact_score,
    technical_impact_score: row.technical_impact_score,
    publish_recommendation: row.publish_recommendation,
    is_important: row.is_important,
    status: row.status,
    published_at: row.published_at,
    archived_at: row.archived_at,
    reviewed_at: row.reviewed_at,
  };
}

export default function BackendChangelogPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const effectiveUser = useEffectivePortalUser(appUser);
  const canManage = useMemo(() => canManageNewsContent(effectiveUser), [effectiveUser]);

  const [rows, setRows] = useState<SiteChangeEntryRow[]>([]);
  const [count, setCount] = useState(0);
  const [loadingRows, setLoadingRows] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingGitHub, setSyncingGitHub] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<SiteChangeStatus | "all">("all");
  const [recFilter, setRecFilter] = useState<SiteChangeRecommendation | "all">("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [minImpact, setMinImpact] = useState(0);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SiteChangeEntryRow | null>(null);
  const [draft, setDraft] = useState<ChangelogDraft>(emptyDraft());

  const reload = async (nextPage = page) => {
    setLoadingRows(true);
    setError(null);
    const result = await adminListChangelog({
      page: nextPage,
      pageSize: 50,
      status: statusFilter,
      recommendation: recFilter,
      module: moduleFilter,
      role: roleFilter,
      changeType: typeFilter,
      minUserImpact: minImpact || undefined,
      search,
    });
    setRows(result.rows);
    setCount(result.count);
    setError(result.error);
    setLoadingRows(false);
  };

  useEffect(() => {
    if (!loading && appUser && canManage) void reload(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, appUser?.email, canManage, statusFilter, recFilter, moduleFilter, roleFilter, typeFilter, minImpact]);

  const applySearch = () => {
    setPage(0);
    void reload(0);
  };

  const startEdit = (row: SiteChangeEntryRow) => {
    setEditing(row);
    setDraft(rowToDraft(row));
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft(emptyDraft());
  };

  const toggleRole = (role: string) => {
    setDraft((current) => {
      const has = current.affected_roles.includes(role);
      let next = has ? current.affected_roles.filter((item) => item !== role) : [...current.affected_roles, role];
      if (next.length === 0) next = ["all"];
      if (role === "all" && !has) next = ["all"];
      if (next.includes("all") && next.length > 1) next = next.filter((item) => item !== "all");
      return { ...current, affected_roles: next };
    });
  };

  const saveDraft = async (status?: SiteChangeStatus) => {
    if (!editing) return;
    if (!draft.title_internal.trim()) {
      setError("Intern titel skal udfyldes.");
      return;
    }
    if ((status || draft.status) === "published" && !((draft.title_public || draft.title_internal).trim())) {
      setError("Publiceret titel skal udfyldes før publicering.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const nextDraft = { ...draft, status: status || draft.status };
    const result = await adminUpdateChangelog(editing.id, nextDraft);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage(status === "published" ? "Ændringen er publiceret." : "Ændringen er gemt.");
    setEditing(null);
    setDraft(emptyDraft());
    await reload();
  };

  const quickStatus = async (row: SiteChangeEntryRow, status: SiteChangeStatus) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await adminUpdateChangelogStatus(row.id, status);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage(`Status ændret til ${STATUS_LABEL[status]}.`);
    await reload();
  };

  const autoRecommendation = () => {
    setDraft((current) => ({
      ...current,
      publish_recommendation: recommendPublication(current.user_impact_score, current.technical_impact_score),
      is_important: current.user_impact_score >= 9 ? true : current.is_important,
    }));
  };

  const syncGitHub = async () => {
    setSyncingGitHub(true);
    setError(null);
    setMessage(null);
    const result = await syncSiteChangesFromGitHub();
    setSyncingGitHub(false);
    if (!result.ok) {
      setError(result.error || "GitHub-synkronisering fejlede.");
      return;
    }
    setMessage(`GitHub synkroniseret: ${result.imported ?? 0} nye, ${result.skipped ?? 0} sprunget over.`);
    await reload(0);
  };

  if (loading) return <div className="min-h-screen bg-slate-50" />;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!canManage) return <Navigate to="/portal/marketing" replace />;

  const pageCount = Math.max(1, Math.ceil(count / 50));

  return (
    <div className="flex min-h-screen flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={language}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate("/portal", { replace: true });
        }}
      />

      <main className="mx-auto w-full max-w-[1700px] flex-grow px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
              <Sparkles className="h-6 w-6 text-emerald-700" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Nye features på sitet</h1>
              <p className="mt-1 text-sm text-slate-500">
                Intern produkt-changelog. Marketing vælger selv hvad der publiceres under Hvad er nyt?
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void syncGitHub()}
              disabled={syncingGitHub}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" /> {syncingGitHub ? "Synkroniserer..." : "Synkronisér GitHub"}
            </button>
            <button
              type="button"
              onClick={() => void reload()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Genindlæs
            </button>
          </div>
        </div>

        {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>}
        {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>}

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_180px_170px_170px_150px_110px]">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase text-slate-500">Søg</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") applySearch(); }}
                placeholder="Titel, beskrivelse eller commit..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <Select label="Status" value={statusFilter} onChange={(v) => { setPage(0); setStatusFilter(v as SiteChangeStatus | "all"); }}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
            <Select label="Anbefaling" value={recFilter} onChange={(v) => { setPage(0); setRecFilter(v as SiteChangeRecommendation | "all"); }}>
              {RECOMMENDATIONS.map((r) => <option key={r} value={r}>{REC_LABEL[r]}</option>)}
            </Select>
            <Select label="Modul" value={moduleFilter} onChange={(v) => { setPage(0); setModuleFilter(v); }}>
              {MODULES.map((m) => <option key={m} value={m}>{m === "all" ? "Alle moduler" : m}</option>)}
            </Select>
            <Select label="Rolle" value={roleFilter} onChange={(v) => { setPage(0); setRoleFilter(v); }}>
              {ROLES.map((r) => <option key={r} value={r}>{r === "all" ? "Alle målgrupper" : roleLabel(r)}</option>)}
            </Select>
            <Select label="Type" value={typeFilter} onChange={(v) => { setPage(0); setTypeFilter(v); }}>
              {TYPES.map((t) => <option key={t} value={t}>{t === "all" ? "Alle typer" : t}</option>)}
            </Select>
            <Select label="Impact" value={String(minImpact)} onChange={(v) => { setPage(0); setMinImpact(Number(v)); }}>
              {[0, 1, 3, 5, 7, 9].map((n) => <option key={n} value={n}>{n === 0 ? "Alle" : `${n}+`}</option>)}
            </Select>
          </div>
          <button
            type="button"
            onClick={applySearch}
            className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Anvend søgning
          </button>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Dato</th>
                    <th className="px-4 py-3 text-left font-semibold">Feature</th>
                    <th className="px-4 py-3 text-left font-semibold">Område</th>
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-left font-semibold">Målgruppe</th>
                    <th className="px-4 py-3 text-left font-semibold">Impact</th>
                    <th className="px-4 py-3 text-left font-semibold">Anbefaling</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Handling</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={`border-t border-slate-100 align-top hover:bg-slate-50/70 ${editing?.id === row.id ? "bg-emerald-50/40" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">{formatDate(row.implemented_at)}</td>
                      <td className="min-w-[260px] px-4 py-4">
                        <div className="font-semibold text-slate-900">{row.title_internal}</div>
                        {row.description_internal && <div className="mt-1 line-clamp-2 text-xs text-slate-500">{row.description_internal}</div>}
                        {row.source_ref && <div className="mt-1 font-mono text-[11px] text-slate-400">{row.source_ref}</div>}
                      </td>
                      <td className="px-4 py-4 text-slate-600">{row.module}</td>
                      <td className="px-4 py-4 text-slate-600">{row.change_type}</td>
                      <td className="min-w-[180px] px-4 py-4 text-xs text-slate-500">{row.affected_roles.map(roleLabel).join(", ")}</td>
                      <td className="px-4 py-4 text-xs text-slate-600">
                        <div>Bruger: <strong>{row.user_impact_score}/10</strong></div>
                        <div>Teknisk: <strong>{row.technical_impact_score}/10</strong></div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${recommendationClass(row.publish_recommendation)}`}>
                          {REC_LABEL[row.publish_recommendation]}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClass(row.status)}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td className="min-w-[230px] px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={() => startEdit(row)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            <FilePenLine className="h-3.5 w-3.5" /> Redigér
                          </button>
                          {row.status !== "published" && row.status !== "archived" && (
                            <button type="button" disabled={saving} onClick={() => void quickStatus(row, "published")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                              <Send className="h-3.5 w-3.5" /> Publicér
                            </button>
                          )}
                          {row.status === "published" && (
                            <button type="button" disabled={saving} onClick={() => void quickStatus(row, "draft")} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                              <Undo2 className="h-3.5 w-3.5" /> Afpublicér
                            </button>
                          )}
                          {row.status !== "archived" ? (
                            <button type="button" disabled={saving} onClick={() => void quickStatus(row, "archived")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                              <Archive className="h-3.5 w-3.5" /> Arkivér
                            </button>
                          ) : (
                            <button type="button" disabled={saving} onClick={() => void quickStatus(row, "draft")} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                              <Undo2 className="h-3.5 w-3.5" /> Gendan
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loadingRows && rows.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">Ingen ændringer matcher filtrene.</td></tr>
                  )}
                  {loadingRows && (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">Henter ændringer...</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>{count} ændringer i alt</span>
              <div className="flex items-center gap-2">
                <button type="button" disabled={page <= 0} onClick={() => { const p = page - 1; setPage(p); void reload(p); }} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">Forrige</button>
                <span>Side {page + 1} / {pageCount}</span>
                <button type="button" disabled={page >= pageCount - 1} onClick={() => { const p = page + 1; setPage(p); void reload(p); }} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">Næste</button>
              </div>
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">{editing ? "Redigér publicering" : "Vælg en ændring"}</h2>
            <p className="mt-1 text-xs text-slate-500">
              Marketing kan omskrive bruger-teksten. Den interne tekniske tekst bevares.
            </p>

            {editing ? (
              <div className="mt-4 space-y-3 text-sm">
                <Field label="Implementeret dato">
                  <input type="date" value={dateInput(draft.implemented_at)} onChange={(event) => setDraft({ ...draft, implemented_at: toIsoDate(event.target.value) })} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                </Field>
                <Field label="Intern titel">
                  <input value={draft.title_internal} onChange={(event) => setDraft({ ...draft, title_internal: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                </Field>
                <Field label="Intern beskrivelse">
                  <textarea rows={3} value={draft.description_internal || ""} onChange={(event) => setDraft({ ...draft, description_internal: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                </Field>
                <Field label="Teknisk beskrivelse">
                  <textarea rows={3} value={draft.technical_description || ""} onChange={(event) => setDraft({ ...draft, technical_description: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                </Field>
                <Field label="Publiceret titel">
                  <input value={draft.title_public || ""} placeholder={draft.title_internal} onChange={(event) => setDraft({ ...draft, title_public: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                </Field>
                <Field label="Publiceret tekst">
                  <textarea rows={3} value={draft.description_public || ""} onChange={(event) => setDraft({ ...draft, description_public: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Modul">
                    <select value={draft.module} onChange={(event) => setDraft({ ...draft, module: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2">
                      {MODULES.filter((m) => m !== "all").map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                  <Field label="Type">
                    <select value={draft.change_type} onChange={(event) => setDraft({ ...draft, change_type: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2">
                      {TYPES.filter((t) => t !== "all").map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Brugerimpact">
                    <input type="number" min={1} max={10} value={draft.user_impact_score} onChange={(event) => setDraft({ ...draft, user_impact_score: Number(event.target.value) })} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                  </Field>
                  <Field label="Teknisk impact">
                    <input type="number" min={1} max={10} value={draft.technical_impact_score} onChange={(event) => setDraft({ ...draft, technical_impact_score: Number(event.target.value) })} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                  </Field>
                </div>
                <button type="button" onClick={autoRecommendation} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Foreslå anbefaling
                </button>
                <Field label="Anbefaling">
                  <select value={draft.publish_recommendation} onChange={(event) => setDraft({ ...draft, publish_recommendation: event.target.value as SiteChangeRecommendation })} className="w-full rounded-lg border border-slate-200 px-3 py-2">
                    {RECOMMENDATIONS.filter((r) => r !== "all").map((r) => <option key={r} value={r}>{REC_LABEL[r]}</option>)}
                  </select>
                </Field>
                <Field label="Målgruppe">
                  <div className="flex flex-wrap gap-1.5">
                    {ROLES.map((role) => {
                      const active = draft.affected_roles.includes(role);
                      return (
                        <button key={role} type="button" onClick={() => toggleRole(role)} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${active ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                          {roleLabel(role)}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input type="checkbox" checked={draft.is_important} onChange={(event) => setDraft({ ...draft, is_important: event.target.checked })} />
                  <span className="font-semibold text-slate-700">Vigtigt</span>
                </label>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button type="button" disabled={saving} onClick={() => void saveDraft()} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">Gem</button>
                  <button type="button" disabled={saving} onClick={() => void saveDraft("published")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Gem og publicér</button>
                  <button type="button" onClick={cancelEdit} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Annullér</button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                Vælg en ændring i listen for at gennemgå, omskrive, markere vigtig og publicere.
              </div>
            )}
          </aside>
        </div>
      </main>

      <PortalFooter language={language} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        {children}
      </select>
    </label>
  );
}
