/**
 * Dealer detail dashboard for CRM → Mine forhandlere.
 * Route: /portal/crm/my-dealers/:accountNumber
 *
 * Shows:
 *  • Dealer master data + main/branch relation
 *  • Linked portal users (read-only for sellers)
 *  • KPI cards (open activities, this week, last/next, leads, quotes, orders)
 *  • Notehistorik (internal Timan-only)
 *  • Næste opfølgning at the top
 *
 * INTERNAL ONLY — external dealer/service-partner/importer roles cannot
 * reach this route (see access guard below). Notes never leak.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Building2, Mail, MapPin, Phone, GitBranch, Star,
  Calendar as CalendarIcon, FileText, ClipboardList, TrendingUp,
  CheckCircle2, AlertCircle, Plus,
} from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import CrmLayout from "@/components/crm/CrmLayout";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, isScopedSeller } from "@/lib/crmScope";
import {
  DealerAccount, DealerAccountStats,
  fetchDealerAccounts, fetchDealerAccountStats,
} from "@/lib/dealerAccountsService";
import { fetchBackendUsers } from "@/lib/backendUsersService";
import type { BackendUser } from "@/lib/backend-users-store";
import {
  listActivities as listCalendarActivities,
  createActivity as createCalendarActivity,
  ACTIVITY_TYPES, activityTypeMeta,
  type CalendarActivity, type CalendarActivityType,
} from "@/lib/crmCalendarService";
import {
  createDealerNote, listDealerNotesForNumbers,
  type DealerNote, type DealerNoteType,
} from "@/lib/dealerNotesService";
import {
  getEffectiveSellerInitials, getEffectiveSellerEmail,
  getActiveSellerView, getActiveMode,
} from "@/lib/activeMode";
import {
  listCrmConfigurations,
  listScopedOrdersWithValue,
  type CrmConfigurationRow,
  type CrmOrderWithValue,
} from "@/lib/crmConfigurationsService";

const T = {
  back:        { da: "Tilbage til Mine forhandlere" },
  next_followup: { da: "Næste opfølgning" },
  none_followup: { da: "Ingen planlagt opfølgning" },
  contact:     { da: "Kontaktinformation" },
  master:      { da: "Stamdata" },
  users:       { da: "Tilknyttede brugere" },
  no_users:    { da: "Ingen brugere tilknyttet endnu." },
  notes:       { da: "Notehistorik (intern)" },
  no_notes:    { da: "Ingen interne noter endnu." },
  add_note:    { da: "Tilføj note" },
  note_type:   { da: "Notetype" },
  note_text:   { da: "Notetekst" },
  followup:    { da: "Opfølgningsdato" },
  also_cal:    { da: "Opret også kalenderaktivitet" },
  cal_title:   { da: "Aktivitetstitel" },
  cal_type:    { da: "Aktivitetstype" },
  cal_when:    { da: "Dato/tid" },
  save:        { da: "Gem" },
  cancel:      { da: "Annullér" },
  branch_only: { da: "Kun denne filial" },
  group_total: { da: "Hele forhandlergruppen" },
  kpi_open:    { da: "Åbne aktiviteter" },
  kpi_week:    { da: "Aktiviteter denne uge" },
  kpi_last:    { da: "Sidste aktivitet" },
  kpi_next:    { da: "Næste opfølgning" },
  kpi_leads:   { da: "Åbne leads" },
  kpi_quotes:  { da: "Tilbud" },
  kpi_orders:  { da: "Ordrer" },
  kpi_pipeline:{ da: "Pipeline-værdi" },
  kpi_won:     { da: "Vundne ordrer" },
};
const t = (k: keyof typeof T) => T[k].da;

const NOTE_TYPE_LABEL: Record<DealerNoteType, string> = {
  general: "Generel note", call: "Opkald", visit: "Besøg",
  follow_up: "Opfølgning", demo: "Demo", offer: "Tilbud", service: "Service",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("da-DK"); } catch { return "—"; }
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" }); } catch { return "—"; }
}
function startOfIsoWeek(d: Date): Date {
  const x = new Date(d); x.setHours(0,0,0,0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

export default function CrmDealerDetailPage() {
  const { accountNumber = "" } = useParams<{ accountNumber: string }>();
  const { appUser, loading } = useAppUser();
  const { language: lang } = useLanguage();
  const navigate = useNavigate();
  void lang;

  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [stats, setStats] = useState<Record<string, DealerAccountStats>>({});
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [calendar, setCalendar] = useState<CalendarActivity[]>([]);
  const [notes, setNotes] = useState<DealerNote[]>([]);
  const [scope, setScope] = useState<"branch" | "group">("branch");
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [busy, setBusy] = useState(true);
  // Live CRM configurations (same source as CRM → Tilbud / Ordrer).
  // Used for accurate Tilbud / Ordrer / Vundne ordrer / Pipeline-værdi KPIs
  // — instead of dealer_account_stats which can lag for newly-created orders
  // and only counts via created_by_user_id (misses backend/seller-created ones).
  const [dealerQuotes, setDealerQuotes] = useState<CrmConfigurationRow[]>([]);
  const [dealerOrders, setDealerOrders] = useState<CrmOrderWithValue[]>([]);

  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const admin = isCrmAdmin(portalRole);
  const seller = isScopedSeller(portalRole);
  const canAccess = admin || seller;

  const [activeMode, setActiveMode] = useState<string>(() => getActiveMode(appUser?.email));
  useEffect(() => {
    const h = () => setActiveMode(getActiveMode(appUser?.email));
    window.addEventListener("timan:active-mode-changed", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("timan:active-mode-changed", h);
      window.removeEventListener("storage", h);
    };
  }, [appUser?.email]);
  void activeMode;

  useEffect(() => {
    if (!appUser || !accountNumber) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      const [dRes, sRes, uRes] = await Promise.all([
        fetchDealerAccounts({ includeDeleted: false }),
        fetchDealerAccountStats(),
        fetchBackendUsers(),
      ]);
      if (cancelled) return;
      setDealers(dRes.rows);
      const map: Record<string, DealerAccountStats> = {};
      for (const s of sRes.rows) map[s.id] = s;
      setStats(map);
      setUsers(uRes.users);
      const cal = await listCalendarActivities({});
      if (cancelled) return;
      setCalendar(cal);
      // Fetch live quotes + orders for ALL accessible scopes — backend admin
      // fetches everything (no scoping), seller fetches their own. We then
      // filter client-side by dealer_number so branch/group toggle works.
      try {
        const filterBase = {
          role: portalRole,
          sellerId: null,
          sellerInitials: null,
          sellerEmail: null,
          dealerNumber: appUser?.dealer_number ?? null,
        } as const;
        const [qRes, oRes] = await Promise.all([
          listCrmConfigurations({ ...filterBase, documentType: 'quote' }),
          listScopedOrdersWithValue(filterBase),
        ]);
        if (!cancelled) {
          setDealerQuotes(qRes.rows);
          setDealerOrders(oRes.rows);
        }
      } catch (e) {
        console.warn('[CrmDealerDetailPage] failed to fetch CRM configurations:', e);
      }
      setBusy(false);
    })();
    return () => { cancelled = true; };
  }, [appUser, accountNumber, portalRole]);

  const dealer = useMemo(
    () => dealers.find(d => d.account_number === accountNumber) ?? null,
    [dealers, accountNumber]
  );

  // Determine main + branches grouping
  const mainAccountNumber = dealer?.parent_account_number || dealer?.account_number || "";
  const branchNumbers = useMemo(() => {
    if (!dealer) return [] as string[];
    const main = dealers.find(d => d.account_number === mainAccountNumber);
    const children = dealers.filter(d => d.parent_account_number === mainAccountNumber).map(d => d.account_number);
    return [main?.account_number, ...children].filter((x): x is string => Boolean(x));
  }, [dealers, dealer, mainAccountNumber]);

  const scopeNumbers = scope === "branch" || branchNumbers.length <= 1
    ? [accountNumber]
    : branchNumbers;

  // Load notes (whenever scope changes)
  useEffect(() => {
    if (!dealer) return;
    let cancelled = false;
    (async () => {
      const n = await listDealerNotesForNumbers(scopeNumbers);
      if (!cancelled) setNotes(n);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealer?.id, scope, branchNumbers.join(",")]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!canAccess) return <Navigate to="/portal" replace />;

  if (!busy && !dealer) {
    return (
      <CrmLayout pageTitle="Forhandler ikke fundet">
        <div className="bg-white border rounded-xl p-6">
          <p className="text-slate-700 mb-4">Forhandler {accountNumber} blev ikke fundet eller er ikke tildelt dig.</p>
          <Link to="/portal/crm/my-dealers" className="text-emerald-700 underline text-sm">{t("back")}</Link>
        </div>
      </CrmLayout>
    );
  }

  if (!dealer) return <CrmLayout pageTitle="…"><div className="text-slate-500 text-sm">Henter…</div></CrmLayout>;

  const linkedUsers = users.filter(u =>
    scopeNumbers.includes(u.dealer_number || "")
  );

  const activitiesForScope = calendar.filter(a =>
    scopeNumbers.includes(a.dealer_account_number || "")
  );

  const now = new Date();
  const weekStart = startOfIsoWeek(now);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);

  const openActs = activitiesForScope.filter(a => a.status === "planned");
  const thisWeekActs = activitiesForScope.filter(a => {
    const d = new Date(a.start_datetime);
    return d >= weekStart && d < weekEnd;
  });
  const lastDoneAct = activitiesForScope
    .filter(a => a.status === "done")
    .sort((a, b) => b.start_datetime.localeCompare(a.start_datetime))[0];

  // Next follow-up = next planned activity OR earliest future note follow-up
  const upcomingPlanned = openActs
    .filter(a => new Date(a.start_datetime) >= now)
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))[0];
  const upcomingNote = notes
    .filter(n => n.follow_up_date && new Date(n.follow_up_date) >= now)
    .sort((a, b) => (a.follow_up_date || "").localeCompare(b.follow_up_date || ""))[0];

  const nextFollowup =
    upcomingPlanned && (!upcomingNote || upcomingPlanned.start_datetime <= (upcomingNote.follow_up_date || ""))
      ? { date: upcomingPlanned.start_datetime, title: upcomingPlanned.title, seller: upcomingPlanned.seller_initials, status: upcomingPlanned.status, kind: "activity" as const }
      : upcomingNote
        ? { date: upcomingNote.follow_up_date!, title: NOTE_TYPE_LABEL[upcomingNote.note_type], seller: upcomingNote.seller_initials, status: "planned", kind: "note" as const }
        : null;

  // Stats from dealer_account_stats view (legacy fallback only).
  const ownStats = stats[dealer.id];

  // Live counts from CRM → Tilbud / Ordrer source (crm_configurations_view).
  // Match by dealer_number across the in-scope numbers (branch or group).
  // This is the SAME source as CRM → Ordrer, so any visible row there is
  // counted here too — including new orders not yet picked up by the
  // dealer_account_stats aggregation view.
  const scopeNumberSet = new Set(scopeNumbers.map((n) => String(n)));
  const dealerQuotesInScope = dealerQuotes.filter(
    (r) => r.dealer_number && scopeNumberSet.has(String(r.dealer_number)),
  );
  const dealerOrdersInScope = dealerOrders.filter(
    (r) => r.dealer_number && scopeNumberSet.has(String(r.dealer_number)),
  );
  const wonOrdersInScope = dealerOrdersInScope.filter((r) => {
    const s = (r.case_status || '').toLowerCase();
    return s === 'ordre_afgivet' || !!r.order_sent_at || !!r.submitted_at;
  });
  const liveQuoteCount = dealerQuotesInScope.length;
  const liveOrderCount = dealerOrdersInScope.length;
  const liveWonCount = wonOrdersInScope.length;
  const livePipelineValue = dealerOrdersInScope.reduce((s, r) => s + (r.total_value || 0), 0);
  const fmtKr = (v: number) => `${Math.round(v).toLocaleString('da-DK')} kr.`;

  const mainDealer = dealers.find(d => d.account_number === mainAccountNumber);
  const isBranch = !!dealer.parent_account_number;
  const hasGroup = branchNumbers.length > 1;

  const sellerCtx = getActiveSellerView(appUser.email);
  const effInitials = getEffectiveSellerInitials(appUser);
  const effEmail = getEffectiveSellerEmail(appUser);

  async function handleAddNote(input: NewNoteForm) {
    if (!dealer) return;
    const note = await createDealerNote({
      dealer_number: dealer.account_number,
      dealer_name: dealer.branch_name || dealer.company_name,
      created_by_user_id: null,
      created_by_email: appUser?.email ?? null,
      seller_initials: effInitials || null,
      note_type: input.note_type,
      note_text: input.note_text,
      follow_up_date: input.follow_up_date || null,
    });
    let linkedActivityId: string | null = null;
    if (input.create_calendar) {
      const created = await createCalendarActivity({
        title: input.cal_title || `${NOTE_TYPE_LABEL[input.note_type]} — ${dealer.branch_name || dealer.company_name}`,
        start_datetime: input.cal_when || new Date().toISOString(),
        activity_type: input.cal_type,
        account_id: dealer.id,
        dealer_name: dealer.branch_name || dealer.company_name,
        dealer_account_number: dealer.account_number,
        dealer_assigned_seller_initials: dealer.assigned_seller_initials,
        dealer_assigned_seller_email: dealer.assigned_seller_email,
        seller_initials: effInitials || null,
        seller_name: sellerCtx?.label || appUser?.display_name || null,
        created_by_user_id: null,
        created_by_email: effEmail || appUser?.email || null,
        note: input.note_text,
        status: "planned",
      });
      linkedActivityId = created.id;
      // Also auto-create a mirroring note describing the calendar activity
      await createDealerNote({
        dealer_number: dealer.account_number,
        dealer_name: dealer.branch_name || dealer.company_name,
        created_by_user_id: null,
        created_by_email: appUser?.email ?? null,
        seller_initials: effInitials || null,
        note_type: "follow_up",
        note_text: `Kalenderaktivitet oprettet: ${created.title} (${activityTypeMeta(created.activity_type).label.da}) — ${fmtDateTime(created.start_datetime)} · sælger ${created.seller_initials || "—"}`,
        linked_activity_id: created.id,
        follow_up_date: created.start_datetime,
      });
      const cal = await listCalendarActivities({});
      setCalendar(cal);
    }
    setNotes(prev => [{ ...note, linked_activity_id: linkedActivityId ?? note.linked_activity_id }, ...prev]);
    setShowNoteModal(false);
  }

  return (
    <CrmLayout pageTitle={dealer.branch_name || dealer.company_name}>
      {/* Back nav */}
      <button onClick={() => navigate("/portal/crm/my-dealers")}
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> {t("back")}
      </button>

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-[#2d5a27]/10 rounded-xl flex items-center justify-center">
              <Building2 className="h-6 w-6 text-[#2d5a27]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{dealer.branch_name || dealer.company_name}</h2>
              <div className="text-sm text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                <span className="font-mono">#{dealer.account_number}</span>
                <span>·</span>
                <span>{dealer.customer_type_label || dealer.customer_type || "—"}</span>
                {dealer.country && <><span>·</span><span>{dealer.country}</span></>}
                {isBranch && mainDealer && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                    <GitBranch className="h-3 w-3" /> Filial under{" "}
                    <Link to={`/portal/crm/my-dealers/${mainDealer.account_number}`} className="underline">
                      {mainDealer.company_name}
                    </Link>
                  </span>
                )}
                {dealer.is_main_account && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200">
                    <Star className="h-3 w-3" /> Hovedkonto
                  </span>
                )}
              </div>
            </div>
          </div>
          {hasGroup && (
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 text-xs">
              <button onClick={() => setScope("branch")}
                className={`px-3 py-1.5 rounded-md font-semibold ${scope==="branch" ? "bg-white shadow text-slate-900" : "text-slate-600"}`}>
                {t("branch_only")}
              </button>
              <button onClick={() => setScope("group")}
                className={`px-3 py-1.5 rounded-md font-semibold ${scope==="group" ? "bg-white shadow text-slate-900" : "text-slate-600"}`}>
                {t("group_total")} ({branchNumbers.length})
              </button>
            </div>
          )}
        </div>

        {/* Next follow-up banner */}
        <div className="mt-4 rounded-xl border p-3"
          style={{ borderColor: nextFollowup ? "#bbf7d0" : "#e2e8f0", background: nextFollowup ? "#f0fdf4" : "#f8fafc" }}>
          <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wide text-slate-500 mb-1">
            <CalendarIcon className="h-3.5 w-3.5" /> {t("next_followup")}
          </div>
          {nextFollowup ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold text-slate-900">{nextFollowup.title}</div>
                <div className="text-xs text-slate-600">
                  {fmtDateTime(nextFollowup.date)} · sælger {nextFollowup.seller || "—"} · status {nextFollowup.status}
                </div>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wide text-emerald-700">
                {nextFollowup.kind === "activity" ? "Kalender" : "Note"}
              </span>
            </div>
          ) : (
            <div className="text-sm text-slate-500">{t("none_followup")}</div>
          )}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <Kpi icon={<ClipboardList className="h-4 w-4" />} label={t("kpi_open")} value={openActs.length} />
        <Kpi icon={<CalendarIcon className="h-4 w-4" />} label={t("kpi_week")} value={thisWeekActs.length} />
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label={t("kpi_last")} value={fmtDate(lastDoneAct?.start_datetime ?? ownStats?.last_activity_at ?? null)} />
        <Kpi icon={<AlertCircle className="h-4 w-4" />} label={t("kpi_next")} value={fmtDate(nextFollowup?.date ?? null)} />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label={t("kpi_leads")} value={"—"} hint="Kommer snart" />
        <Kpi icon={<FileText className="h-4 w-4" />} label={t("kpi_quotes")} value={scope === "group" ? totalQuotes : (ownStats?.quote_count ?? 0)} />
        <Kpi icon={<FileText className="h-4 w-4" />} label={t("kpi_orders")} value={scope === "group" ? totalOrders : (ownStats?.order_count ?? 0)} />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label={t("kpi_pipeline")} value={"—"} hint="Kommer snart" />
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label={t("kpi_won")} value={"—"} hint="Kommer snart" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Master + contact */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">{t("contact")}</h3>
          <ul className="text-sm space-y-2">
            <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Adresse" value={[dealer.address, [dealer.postal_code, dealer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"} />
            <Row icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={dealer.email || "—"} />
            <Row icon={<Phone className="h-3.5 w-3.5" />} label="Telefon" value={dealer.phone || "—"} />
          </ul>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mt-5 mb-3">{t("master")}</h3>
          <ul className="text-sm space-y-1.5">
            <li><span className="text-slate-500">Kontonr:</span> <span className="font-mono">{dealer.account_number}</span></li>
            <li><span className="text-slate-500">Type:</span> {dealer.customer_type_label || dealer.customer_type || "—"}</li>
            <li><span className="text-slate-500">Land:</span> {dealer.country || "—"}</li>
            <li><span className="text-slate-500">Tildelt sælger:</span> {dealer.assigned_seller_initials || "—"}{dealer.assigned_seller_name ? ` (${dealer.assigned_seller_name})` : ""}</li>
          </ul>
        </div>

        {/* Linked users */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("users")} ({linkedUsers.length})</h3>
            {!admin && <span className="text-[10px] text-slate-400">Skrivebeskyttet for sælger</span>}
          </div>
          {linkedUsers.length === 0 ? (
            <p className="text-sm text-slate-500">{t("no_users")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left py-2">Navn</th>
                    <th className="text-left py-2">Email</th>
                    <th className="text-left py-2">Rolle</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Sidste login</th>
                    <th className="text-left py-2">Sprog</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedUsers.map(u => (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="py-2 font-semibold">{u.name}</td>
                      <td className="py-2 text-slate-600">{u.email}</td>
                      <td className="py-2 text-slate-600">{u.role}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${u.approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                          {u.approved ? "Godkendt" : "Afventer"}
                        </span>
                      </td>
                      <td className="py-2 text-slate-500 text-xs">{fmtDate(u.last_login_at)}</td>
                      <td className="py-2 text-slate-500 uppercase text-xs">{u.language}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Notehistorik */}
      <div className="mt-4 bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            {t("notes")} ({notes.length})
          </h3>
          <button onClick={() => setShowNoteModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold">
            <Plus className="h-3.5 w-3.5" /> {t("add_note")}
          </button>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-slate-500">{t("no_notes")}</p>
        ) : (
          <ul className="space-y-2">
            {notes.map(n => (
              <li key={n.id} className="border border-slate-100 rounded-lg p-3 bg-slate-50/50">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700">{NOTE_TYPE_LABEL[n.note_type]}</span>
                    <span>·</span>
                    <span>{fmtDateTime(n.created_at)}</span>
                    <span>·</span>
                    <span>sælger {n.seller_initials || "—"}</span>
                    {n.created_by_email && <><span>·</span><span>{n.created_by_email}</span></>}
                  </div>
                  {n.follow_up_date && (
                    <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                      Opfølgning: {fmtDateTime(n.follow_up_date)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.note_text}</p>
                {n.linked_activity_id && (
                  <Link to="/portal/crm/calendar" className="text-[11px] text-emerald-700 underline mt-1 inline-block">
                    Se tilknyttet kalenderaktivitet →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showNoteModal && (
        <NoteModal
          dealerLabel={dealer.branch_name || dealer.company_name}
          onCancel={() => setShowNoteModal(false)}
          onSave={handleAddNote}
        />
      )}
    </CrmLayout>
  );
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
        {icon}{label}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-slate-400 mt-0.5">{icon}</span>
      <div>
        <div className="text-[10px] uppercase font-bold tracking-wide text-slate-400">{label}</div>
        <div className="text-slate-800">{value}</div>
      </div>
    </li>
  );
}

interface NewNoteForm {
  note_type: DealerNoteType;
  note_text: string;
  follow_up_date: string;
  create_calendar: boolean;
  cal_title: string;
  cal_type: CalendarActivityType;
  cal_when: string;
}

function NoteModal({ dealerLabel, onCancel, onSave }: {
  dealerLabel: string;
  onCancel: () => void;
  onSave: (input: NewNoteForm) => void | Promise<void>;
}) {
  const [form, setForm] = useState<NewNoteForm>({
    note_type: "general",
    note_text: "",
    follow_up_date: "",
    create_calendar: false,
    cal_title: "",
    cal_type: "demo",
    cal_when: "",
  });
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 mt-12">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Tilføj note</h2>
        <p className="text-xs text-slate-500 mb-4">Forhandler: {dealerLabel} · intern note (vises ikke for eksterne)</p>

        <label className="block text-xs font-bold text-slate-600 mb-1">Notetype</label>
        <select value={form.note_type}
          onChange={(e) => setForm(f => ({ ...f, note_type: e.target.value as DealerNoteType }))}
          className="w-full mb-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          {(Object.keys(NOTE_TYPE_LABEL) as DealerNoteType[]).map(k => (
            <option key={k} value={k}>{NOTE_TYPE_LABEL[k]}</option>
          ))}
        </select>

        <label className="block text-xs font-bold text-slate-600 mb-1">Notetekst</label>
        <textarea value={form.note_text}
          onChange={(e) => setForm(f => ({ ...f, note_text: e.target.value }))}
          rows={4}
          className="w-full mb-3 rounded-lg border border-slate-200 px-3 py-2 text-sm" />

        <label className="block text-xs font-bold text-slate-600 mb-1">Opfølgningsdato (valgfri)</label>
        <input type="datetime-local" value={form.follow_up_date}
          onChange={(e) => setForm(f => ({ ...f, follow_up_date: e.target.value }))}
          className="w-full mb-3 rounded-lg border border-slate-200 px-3 py-2 text-sm" />

        <label className="flex items-center gap-2 mb-3 text-sm">
          <input type="checkbox" checked={form.create_calendar}
            onChange={(e) => setForm(f => ({ ...f, create_calendar: e.target.checked }))} />
          Opret også kalenderaktivitet
        </label>

        {form.create_calendar && (
          <div className="border border-slate-200 rounded-lg p-3 mb-3 bg-slate-50">
            <label className="block text-xs font-bold text-slate-600 mb-1">Aktivitetstitel</label>
            <input value={form.cal_title}
              onChange={(e) => setForm(f => ({ ...f, cal_title: e.target.value }))}
              placeholder={`Aktivitet — ${dealerLabel}`}
              className="w-full mb-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <label className="block text-xs font-bold text-slate-600 mb-1">Aktivitetstype</label>
            <select value={form.cal_type}
              onChange={(e) => setForm(f => ({ ...f, cal_type: e.target.value as CalendarActivityType }))}
              className="w-full mb-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {ACTIVITY_TYPES.map(a => <option key={a.key} value={a.key}>{a.label.da}</option>)}
            </select>
            <label className="block text-xs font-bold text-slate-600 mb-1">Dato/tid</label>
            <input type="datetime-local" value={form.cal_when}
              onChange={(e) => setForm(f => ({ ...f, cal_when: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Annullér</button>
          <button
            disabled={saving || !form.note_text.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                // Convert datetime-local to ISO if present
                const iso = (s: string) => s ? new Date(s).toISOString() : "";
                await onSave({
                  ...form,
                  follow_up_date: iso(form.follow_up_date),
                  cal_when: iso(form.cal_when),
                });
              } finally { setSaving(false); }
            }}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
            {saving ? "Gemmer…" : "Gem note"}
          </button>
        </div>
      </div>
    </div>
  );
}
