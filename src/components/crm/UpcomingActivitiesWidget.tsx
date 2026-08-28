/**
 * UpcomingActivitiesWidget — Dashboard widget for planned dealer activities.
 *
 *  - Backend: "Kommende sælgeraktiviteter" — all sellers + quick stats
 *  - Seller : "Mine kommende aktiviteter" — only own
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ArrowRight, Activity, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listActivities, activityTypeMeta, activityAllSellerInitials, type CalendarActivity } from "@/lib/crmCalendarService";
import { fetchCrmDashboardCalendarActivityKpis, type CrmDashboardCalendarActivityKpis } from "@/lib/crmDashboardKpisService";
import { BUDGET_SELLERS } from "@/lib/crmBudgetService";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin } from "@/lib/crmScope";
import { cn } from "@/lib/utils";
import type { Language } from "@/types/configurator";

const T: Record<string, Record<Language, string>> = {
  title_admin:  { da: "Kommende sælgeraktiviteter",  en: "Upcoming seller activities", de: "Bevorstehende Verkäufer-Aktivitäten", it: "Attività venditori in arrivo", hu: "Közelgő értékesítői tevékenységek" },
  title_self:   { da: "Mine kommende aktiviteter",   en: "My upcoming activities",     de: "Meine bevorstehenden Aktivitäten",     it: "Le mie prossime attività",      hu: "Saját közelgő tevékenységek" },
  this_week:    { da: "Aktiviteter denne uge",       en: "Activities this week",       de: "Aktivitäten diese Woche",              it: "Attività questa settimana",     hu: "Tevékenységek ezen a héten" },
  demos_month:  { da: "Demoer denne måned",          en: "Demos this month",           de: "Demos diesen Monat",                   it: "Demo questo mese",              hu: "Demók ebben a hónapban" },
  overdue:      { da: "Forsinket",                   en: "Overdue",                    de: "Überfällig",                           it: "In ritardo",                    hu: "Késett" },
  no_upcoming:  { da: "Sælgere uden plan",           en: "Sellers without plan",       de: "Verkäufer ohne Plan",                  it: "Venditori senza piano",         hu: "Értékesítők terv nélkül" },
  open_cal:     { da: "Åbn kalender",                en: "Open calendar",              de: "Kalender öffnen",                      it: "Apri calendario",               hu: "Naptár megnyitása" },
  none:         { da: "Ingen kommende aktiviteter.", en: "No upcoming activities.",    de: "Keine kommenden Aktivitäten.",         it: "Nessuna attività in arrivo.",   hu: "Nincs közelgő tevékenység." },
  today:        { da: "I dag",                       en: "Today",                      de: "Heute",                                it: "Oggi",                          hu: "Ma" },
};

export default function UpcomingActivitiesWidget({
  statsLayout = "row",
  sellerInitialsOverride,
}: {
  statsLayout?: "row" | "grid2x2";
  /** When provided (admin dashboard top filter), scope to this seller. null = all. */
  sellerInitialsOverride?: string | null;
} = {}) {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const isAdmin = isCrmAdmin(derivePortalRole(appUser));
  const [rows, setRows] = useState<CalendarActivity[]>([]);
  const [serverKpis, setServerKpis] = useState<CrmDashboardCalendarActivityKpis | null>(null);

  const myInitials = useMemo(() => {
    const email = (appUser?.email || "").toLowerCase();
    return BUDGET_SELLERS.find(s => s.email.toLowerCase() === email)?.initials || null;
  }, [appUser?.email]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const effectiveInitials = isAdmin
        ? (sellerInitialsOverride ?? null)
        : (myInitials || "all");
      const rpcKpis = await fetchCrmDashboardCalendarActivityKpis({
        sellerInitials: effectiveInitials === "all" ? null : effectiveInitials,
      });
      if (rpcKpis) {
        if (!cancelled) {
          setServerKpis(rpcKpis);
          setRows(rpcKpis.upcomingRows as unknown as CalendarActivity[]);
        }
        return;
      }
      const list = await listActivities(
        isAdmin && !sellerInitialsOverride ? {} : { sellerInitials: effectiveInitials || "all" }
      );
      if (!cancelled) {
        setServerKpis(null);
        setRows(list);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, myInitials, sellerInitialsOverride]);

  const now = new Date();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7)); startOfWeek.setHours(0,0,0,0);
  const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const upcoming = rows
    .filter(r => r.status !== "canceled" && new Date(r.start_datetime).getTime() >= now.getTime())
    .slice(0, 8);

  const stats = useMemo(() => {
    if (serverKpis) {
      return {
        inWeek: serverKpis.activitiesThisWeek,
        demosMonth: serverKpis.demosThisMonth,
        overdue: serverKpis.overdueCount,
        noPlan: serverKpis.noPlanInitials,
      };
    }
    const inWeek = rows.filter(r => {
      const t = new Date(r.start_datetime).getTime();
      return r.status !== "canceled" && t >= startOfWeek.getTime() && t < endOfWeek.getTime();
    }).length;
    const demosMonth = rows.filter(r => {
      const t = new Date(r.start_datetime).getTime();
      return r.activity_type === "demo" && r.status !== "canceled" && t >= startOfMonth.getTime() && t < endOfMonth.getTime();
    }).length;
    const overdue = rows.filter(r => r.status === "planned" && new Date(r.start_datetime).getTime() < now.getTime()).length;
    const sellersWithPlan = new Set(rows.filter(r => r.status !== "canceled" && new Date(r.start_datetime).getTime() >= now.getTime()).map(r => r.seller_initials || ""));
    const noPlan = ["BP","EM","JTN","AKR"].filter(i => !sellersWithPlan.has(i));
    return { inWeek, demosMonth, overdue, noPlan };
  }, [rows, serverKpis]);

  return (
    <Card className="rounded-2xl border-gray-100 h-full flex flex-col">
      <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between shrink-0">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#2d5a27]" />
          {isAdmin ? T.title_admin[lang] : T.title_self[lang]}
        </CardTitle>
        <Link to="/portal/crm/calendar" className="text-xs text-[#2d5a27] inline-flex items-center gap-1 hover:underline">
          {T.open_cal[lang]} <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-3 flex-1 min-h-0 overflow-hidden">
        {/* Quick stats */}
        <div className={cn("grid gap-2", isAdmin ? (statsLayout === "grid2x2" ? "grid-cols-2" : "grid-cols-4") : "grid-cols-3")}>
          <Stat icon={Activity} label={T.this_week[lang]} value={stats.inWeek} tone="emerald" />
          <Stat icon={CalendarDays} label={T.demos_month[lang]} value={stats.demosMonth} tone="blue" />
          <Stat icon={AlertTriangle} label={T.overdue[lang]} value={stats.overdue} tone="red" />
          {isAdmin && (
            <Stat icon={AlertTriangle} label={T.no_upcoming[lang]} value={stats.noPlan.length} tone="amber" extra={stats.noPlan.join(" ")} />
          )}
        </div>

        {/* List */}
        {upcoming.length === 0 ? (
          <p className="text-xs text-gray-400">{T.none[lang]}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {upcoming.map(a => {
              const meta = activityTypeMeta(a.activity_type);
              const d = new Date(a.start_datetime);
              const isToday = d.toDateString() === now.toDateString();
              return (
                <li key={a.id} className="py-2 flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", meta.dotClass)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-800 truncate">{a.title || meta.label[lang]}</div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {a.dealer_name || "—"}
                      {(() => { const all = activityAllSellerInitials(a); return all.length ? ` · ${all.join(", ")}` : ""; })()}
                    </div>
                  </div>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", meta.badgeClass)}>{meta.label[lang]}</span>
                  <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums">
                    {isToday ? T.today[lang] : d.toLocaleDateString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ icon: Icon, label, value, tone, extra }: { icon: typeof Activity; label: string; value: number; tone: "emerald" | "blue" | "red" | "amber"; extra?: string }) {
  // Aligned with the dashboard hero cards: dark Timan green + dark navy for
  // the two primary tiles, deeper rose/amber for warnings (less pastel).
  const tones: Record<typeof tone, string> = {
    emerald: "bg-gradient-to-br from-[#0f2e1f] via-[#143a26] to-[#1f5535] text-white border-transparent",
    blue:    "bg-gradient-to-br from-[#0b1e3a] via-[#11284a] to-[#1c3a66] text-white border-transparent",
    red:     "bg-rose-600 text-white border-transparent",
    amber:   "bg-amber-500 text-white border-transparent",
  };
  const labelTone: Record<typeof tone, string> = {
    emerald: "text-emerald-100/80",
    blue:    "text-sky-100/80",
    red:     "text-rose-100/90",
    amber:   "text-amber-50/90",
  };
  return (
    <div className={cn("rounded-lg border px-2.5 py-2 shadow-sm", tones[tone])}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        <span className={cn("text-[10px] uppercase tracking-wide font-semibold", labelTone[tone])}>{label}</span>
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {extra && <div className={cn("text-[10px] truncate", labelTone[tone])}>{extra}</div>}
    </div>
  );
}
