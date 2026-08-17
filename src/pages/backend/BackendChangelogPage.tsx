/**
 * Timan Backend → Change log editor.
 * Route: /portal/backend/changelog
 *
 * Lets backend/admin users list, create, edit and delete entries in
 * `public.portal_change_log`. The portal UI (badges, "Hvad er nyt?" panel,
 * module-page "Senest ændret" line) reads from the same table via
 * portalChangelogService — see Phase 3 plan.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Plus, RotateCcw, ScrollText, Star, Trash2 } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { derivePortalRole, getPortalPermissions } from "@/lib/portalAccess";
import {
  adminCreateChangelog,
  adminDeleteChangelog,
  adminListChangelog,
  adminUpdateChangelog,
  type ChangelogDraft,
  type PortalChangeLogRow,
} from "@/lib/portalChangelogService";

const MODULE_KEYS = [
  "partner_map", "dealer_data", "crm", "warranty",
  "claims", "service", "configurator", "backend",
] as const;
const ROLES = ["all", "sales", "service", "backend", "admin", "dealer"] as const;
const LANGS = ["da", "en", "de", "it", "hu"] as const;

const SUBMODULE_SUGGESTIONS: Record<string, string[]> = {
  service: [
    "service_tickets",
    "service_maintenance",   // alias: service_registration
    "claims",
    "warranty_reg",          // alias: warranty
    "machine_search",
    "tsb_portal",            // alias: tsb
  ],
  warranty: ["warranty_reg"],
  claims: ["claims"],
  backend: [
    "users", "roles", "module_access", "audit",
    "portal_analytics", "dealer_accounts", "sellers",
    "price_lists", "budget_import",
  ],
};

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

const emptyDraft = (): ChangelogDraft => ({
  module_key: "partner_map",
  module_name: "Partnerkort",
  submodule_key: null,
  title: "",
  description: "",
  changed_at: new Date().toISOString(),
  language: "da",
  is_major: false,
  is_new_until: null,
  role_visibility: ["all"],
});

export default function BackendChangelogPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const [rows, setRows] = useState<PortalChangeLogRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChangelogDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoadingData(true);
    const { rows, error } = await adminListChangelog();
    setRows(rows);
    setError(error);
    setLoadingData(false);
  };
  useEffect(() => { void reload(); }, []);

  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!perms?.isBackend) return <Navigate to="/portal/backend" replace />;

  const startNew = () => { setEditingId(null); setDraft(emptyDraft()); };
  const startEdit = (r: PortalChangeLogRow) => {
    setEditingId(r.id);
    setDraft({
      id: r.id,
      module_key: r.module_key,
      module_name: r.module_name,
      submodule_key: r.submodule_key || null,
      title: r.title,
      description: r.description || "",
      changed_at: r.changed_at,
      language: r.language,
      is_major: !!r.is_major,
      is_new_until: r.is_new_until,
      role_visibility: r.role_visibility?.length ? r.role_visibility : ["all"],
    });
  };

  const save = async () => {
    if (!draft.title.trim() || !draft.module_key || !draft.module_name.trim()) {
      setError("Modul, navn og titel skal udfyldes.");
      return;
    }
    setSaving(true); setError(null);
    const res = editingId
      ? await adminUpdateChangelog(editingId, draft)
      : await adminCreateChangelog(draft);
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    startNew();
    await reload();
  };

  const remove = async (id: string) => {
    if (!confirm("Slet denne ændring?")) return;
    const res = await adminDeleteChangelog(id);
    if (res.error) { setError(res.error); return; }
    if (editingId === id) startNew();
    await reload();
  };

  const toggleRole = (r: string) => {
    setDraft(d => {
      const has = d.role_visibility.includes(r);
      let next = has ? d.role_visibility.filter(x => x !== r) : [...d.role_visibility, r];
      if (next.length === 0) next = ["all"];
      // If 'all' is added, drop the others.
      if (r === "all" && !has) next = ["all"];
      else if (next.includes("all") && next.length > 1) next = next.filter(x => x !== "all");
      return { ...d, role_visibility: next };
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full">
        <Link to="/portal/backend" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage til Timan Backend
        </Link>

        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
              <ScrollText className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Seneste ændringer</h1>
              <p className="text-slate-500 mt-1 text-sm">
                Administrér de ændringer som vises på portalens forside og modulkort.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void reload()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <RotateCcw className="h-3.5 w-3.5" /> Genindlæs
            </button>
            <button type="button" onClick={startNew}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-semibold hover:bg-emerald-700">
              <Plus className="h-3.5 w-3.5" /> Ny ændring
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor */}
          <section className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm h-fit">
            <h2 className="text-base font-bold text-slate-900 mb-4">
              {editingId ? "Redigér ændring" : "Ny ændring"}
            </h2>

            <div className="space-y-3 text-sm">
              <Field label="Modul (key)">
                <select value={draft.module_key} onChange={e => setDraft({ ...draft, module_key: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2">
                  {MODULE_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </Field>

              <Field label="Modul-navn (vises)">
                <input type="text" value={draft.module_name}
                  onChange={e => setDraft({ ...draft, module_name: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </Field>

              <Field label="Submodul-key (valgfri)">
                <input
                  type="text"
                  list="submodule-suggestions"
                  value={draft.submodule_key || ""}
                  onChange={e => setDraft({ ...draft, submodule_key: e.target.value || null })}
                  placeholder="fx service_tickets, claims, warranty_reg"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
                <datalist id="submodule-suggestions">
                  {(SUBMODULE_SUGGESTIONS[draft.module_key] || []).map(s => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <p className="mt-1 text-[11px] text-slate-400">Sætter badge på et bestemt undermodul-kort i området.</p>
              </Field>

              <Field label="Titel">
                <input type="text" value={draft.title}
                  onChange={e => setDraft({ ...draft, title: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </Field>

              <Field label="Beskrivelse (valgfri)">
                <textarea rows={3} value={draft.description || ""}
                  onChange={e => setDraft({ ...draft, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Sprog">
                  <select value={draft.language}
                    onChange={e => setDraft({ ...draft, language: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2">
                    {LANGS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Ændret">
                  <input type="datetime-local" value={toLocalInput(draft.changed_at)}
                    onChange={e => setDraft({ ...draft, changed_at: fromLocalInput(e.target.value) || draft.changed_at })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                </Field>
              </div>

              <Field label='Vis "Ny" indtil (valgfri)'>
                <input type="datetime-local" value={toLocalInput(draft.is_new_until)}
                  onChange={e => setDraft({ ...draft, is_new_until: fromLocalInput(e.target.value) || null })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </Field>

              <Field label="Synlighed (roller)">
                <div className="flex flex-wrap gap-1.5">
                  {ROLES.map(r => {
                    const on = draft.role_visibility.includes(r);
                    return (
                      <button key={r} type="button" onClick={() => toggleRole(r)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          on ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}>
                        {r}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.is_major}
                  onChange={e => setDraft({ ...draft, is_major: e.target.checked })} />
                <Star className="h-4 w-4 text-rose-600" />
                <span>Markér som vigtig</span>
              </label>

              <div className="flex items-center gap-2 pt-2">
                <button type="button" disabled={saving} onClick={() => void save()}
                  className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                  {saving ? "Gemmer…" : (editingId ? "Gem ændringer" : "Opret")}
                </button>
                {editingId && (
                  <button type="button" onClick={startNew}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Annullér
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* List */}
          <section className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold">Ændret</th>
                    <th className="px-3 py-3 text-left font-semibold">Modul</th>
                    <th className="px-3 py-3 text-left font-semibold">Titel</th>
                    <th className="px-3 py-3 text-left font-semibold">Sprog</th>
                    <th className="px-3 py-3 text-left font-semibold">Roller</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className={`border-t border-slate-100 hover:bg-slate-50/60 ${editingId === r.id ? "bg-emerald-50/40" : ""}`}>
                      <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap tabular-nums">
                        {new Date(r.changed_at).toLocaleString("da-DK")}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{r.module_name}</div>
                        <div className="text-[11px] text-slate-400">{r.module_key}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        <div className="flex items-center gap-2">
                          {r.is_major && <Star className="h-3.5 w-3.5 text-rose-500 shrink-0" />}
                          <span className="truncate max-w-[320px]">{r.title}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 uppercase text-xs text-slate-500">{r.language}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{(r.role_visibility || []).join(", ")}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <button type="button" onClick={() => startEdit(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 mr-1">
                          <Pencil className="h-3 w-3" /> Rediger
                        </button>
                        <button type="button" onClick={() => void remove(r.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                          <Trash2 className="h-3 w-3" /> Slet
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loadingData && rows.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">
                      Ingen ændringer endnu. Portalen viser de indbyggede demo-ændringer indtil du opretter den første.
                    </td></tr>
                  )}
                  {loadingData && (
                    <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">Henter…</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
