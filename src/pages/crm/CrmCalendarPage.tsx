/**
 * CRM Calendar — month view of planned dealer activities.
 * Route: /portal/crm/calendar
 *
 * - Sellers see only their own activities.
 * - Backend (admin) sees all and can filter by seller initials (Alle / BP / EM / JTN / AKR).
 * - Click a day to create. Click an event chip to edit.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";
import CrmLayout from "@/components/crm/CrmLayout";
import CalendarActivityModal from "@/components/crm/CalendarActivityModal";
import WeekOverviewPanel from "@/components/crm/WeekOverviewPanel";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, isExternalCrmRole, isScopedSeller } from "@/lib/crmScope";
import { useEffectivePortalUser } from "@/lib/viewAsUser";
import { buildJournalScope } from "@/lib/machineJournalScope";
import { resolveSellerId } from "@/lib/resolveSellerId";
import { getActiveSellerView } from "@/lib/activeMode";
import { listCrmAccounts, type CrmAccount } from "@/lib/crmAccountsService";
import {
  listActivities,
  activityTypeMeta,
  ACTIVITY_TYPES,
  activityAllSellerInitials,
  type CalendarActivity,
} from "@/lib/crmCalendarService";
import { BUDGET_SELLERS } from "@/lib/crmBudgetService";
import { useSellerDirectory, resolveSellerDisplay } from "@/lib/sellerDirectory";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Language } from "@/types/configurator";

const T: Record<string, Record<Language, string>> = {
  page_title:    { da: "Kalender",                  en: "Calendar",            de: "Kalender",            it: "Calendario",         hu: "Naptár" },
  today:         { da: "I dag",                     en: "Today",               de: "Heute",               it: "Oggi",               hu: "Ma" },
  new:           { da: "Ny aktivitet",              en: "New activity",        de: "Neue Aktivität",      it: "Nuova attività",     hu: "Új tevékenység" },
  filter_all:    { da: "Alle",                      en: "All",                 de: "Alle",                it: "Tutti",              hu: "Összes" },
  legend:        { da: "Forklaring",                en: "Legend",              de: "Legende",             it: "Legenda",            hu: "Magyarázat" },
  no_events:     { da: "Ingen aktiviteter",         en: "No activities",       de: "Keine Aktivitäten",   it: "Nessuna attività",   hu: "Nincs tevékenység" },
  no_access:     { da: "Du har ikke adgang til CRM Kalender.", en: "You do not have access to the CRM calendar.", de: "Kein Zugriff auf den CRM-Kalender.", it: "Nessun accesso al calendario CRM.", hu: "Nincs hozzáférésed a CRM naptárhoz." },
};

const WEEK_DAYS: Record<Language, string[]> = {
  da: ["Man","Tir","Ons","Tor","Fre","Lør","Søn"],
  en: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
  de: ["Mo","Di","Mi","Do","Fr","Sa","So"],
  it: ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"],
  hu: ["H","K","Sze","Cs","P","Szo","V"],
};

const MONTHS: Record<Language, string[]> = {
  da: ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"],
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  de: ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"],
  it: ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],
  hu: ["Január","Február","Március","Április","Május","Június","Július","Augusztus","Szeptember","Október","November","December"],
};

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function dayKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface CalGridDay { date: Date; inMonth: boolean; key: string }

function buildGrid(month: Date): CalGridDay[] {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  // Monday-first week
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  const cells: CalGridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === month.getMonth(), key: dayKey(d) });
    if (i >= 34 && d > last && d.getDay() === 0) break;
  }
  return cells;
}

export default function CrmCalendarPage() {
  const { appUser } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  const { language: lang } = useLanguage();
  const portalRole = derivePortalRole(effectiveUser);
  const isAdmin = isCrmAdmin(portalRole);
  const isSeller = isScopedSeller(portalRole);
  const externalCrm = isExternalCrmRole(portalRole);

  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [activities, setActivities] = useState<CalendarActivity[]>([]);
  const [accounts, setAccounts] = useState<CrmAccount[]>([]);
  const [sellerFilter, setSellerFilter] = useState<string>("all"); // "all" | initials
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarActivity | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());

  const currentSellerInitials = useMemo(() => {
    const email = (appUser?.email || "").toLowerCase();
    // Active seller context: backend "view as seller" mode wins over real email mapping.
    const view = getActiveSellerView(appUser?.email);
    if (view) return view.initials;
    return BUDGET_SELLERS.find(s => s.email.toLowerCase() === email)?.initials || null;
  }, [appUser?.email]);

  const currentSeller = useMemo(() => BUDGET_SELLERS.find(s => s.initials === currentSellerInitials) || null, [currentSellerInitials]);
  const sellerDir = useSellerDirectory();

  useEffect(() => {
    if (!isAdmin && currentSellerInitials) setSellerFilter(currentSellerInitials);
  }, [isAdmin, currentSellerInitials]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sid = await resolveSellerId(appUser?.email);
      const dealerNumbers = externalCrm
        ? Array.from((await buildJournalScope(effectiveUser, portalRole)).dealerNumbers)
        : null;
      const acc = await listCrmAccounts({ role: portalRole, sellerId: sid, dealerNumbers });
      const filterInitials = isAdmin ? sellerFilter : (currentSellerInitials || "all");
      const list = await listActivities({ sellerInitials: externalCrm ? null : filterInitials });
      const accountIds = new Set(acc.accounts.map((a) => a.id));
      if (cancelled) return;
      setAccounts(acc.accounts);
      setActivities(externalCrm ? list.filter((a) => !a.account_id || accountIds.has(a.account_id)) : list);
    })();
    return () => { cancelled = true; };
  }, [appUser?.email, effectiveUser?.dealer_number, portalRole, isAdmin, externalCrm, sellerFilter, currentSellerInitials, reloadKey]);

  const grid = useMemo(() => buildGrid(month), [month]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarActivity[]>();
    for (const a of activities) {
      const k = dayKey(new Date(a.start_datetime));
      const arr = map.get(k) || [];
      arr.push(a);
      map.set(k, arr);
    }
    return map;
  }, [activities]);

  if (!isAdmin && !isSeller && !externalCrm) {
    return <CrmLayout pageTitle={T.page_title[lang]}><p className="text-sm text-gray-500">{T.no_access[lang]}</p></CrmLayout>;
  }

  function openCreate(dateIso?: string) {
    setEditing(null);
    setDefaultDate(dateIso || new Date().toISOString());
    setModalOpen(true);
  }
  function openEdit(a: CalendarActivity) {
    setEditing(a);
    setDefaultDate(null);
    setModalOpen(true);
  }

  return (
    <CrmLayout pageTitle={T.page_title[lang]}>
      <div className="lg:hidden mb-4">
        <WeekOverviewPanel
          lang={lang}
          weekAnchor={weekAnchor}
          activities={activities}
          onSelectDay={(d) => { setMonth(startOfMonth(d)); setWeekAnchor(d); }}
          onSelectActivity={openEdit}
          collapsible
        />
      </div>
      <div className="flex gap-4 items-start">
       <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
              {T.today[lang]}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h2 className="ml-2 text-lg font-semibold text-gray-900 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#2d5a27]" />
              {MONTHS[lang][month.getMonth()]} {month.getFullYear()}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-1">
                <SellerChip active={sellerFilter === "all"} onClick={() => setSellerFilter("all")}>{T.filter_all[lang]}</SellerChip>
                {["BP","EM","JTN","AKR"].map(i => {
                  // Resolve the live initials from app_users (e.g. AKR may have
                  // been renamed in backend) — keep the static filter key for
                  // matching server-side alias expansion, but show the
                  // current app_users.initials as the chip label + tooltip name.
                  const fallback = BUDGET_SELLERS.find(s => s.initials === i);
                  const d = resolveSellerDisplay(
                    { email: fallback?.email, initialsKey: i, fallbackInitials: i, fallbackName: fallback?.full_name || "" },
                    sellerDir,
                  );
                  return (
                    <SellerChip
                      key={i}
                      active={sellerFilter === i}
                      onClick={() => setSellerFilter(i)}
                    >
                      <span title={d.full_name || d.initials}>{d.initials}</span>
                    </SellerChip>
                  );
                })}
              </div>
            )}
            <Button size="sm" onClick={() => openCreate()} className="bg-[#2d5a27] hover:bg-[#23461f] text-white">
              <Plus className="h-4 w-4 mr-1" /> {T.new[lang]}
            </Button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/60 text-xs font-medium text-gray-500">
          {WEEK_DAYS[lang].map(w => (
            <div key={w} className="px-3 py-2 text-center">{w}</div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 auto-rows-[minmax(110px,1fr)]">
          {grid.map((cell) => {
            const events = eventsByDay.get(cell.key) || [];
            const isToday = dayKey(new Date()) === cell.key;
            return (
              <button
                type="button"
                key={cell.key}
                onClick={() => openCreate(new Date(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate(), 9, 0).toISOString())}
                className={cn(
                  "text-left border-b border-r border-gray-100 px-2 py-2 hover:bg-gray-50/80 focus:outline-none focus:bg-gray-50 transition relative",
                  !cell.inMonth && "bg-gray-50/40 text-gray-400",
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={cn(
                    "text-xs tabular-nums",
                    isToday ? "text-white bg-[#2d5a27] rounded-full h-5 w-5 inline-flex items-center justify-center font-semibold" : "text-gray-600"
                  )}>
                    {cell.date.getDate()}
                  </span>
                  {events.length > 0 && (
                    <span className="text-[10px] font-semibold text-gray-500">{events.length}</span>
                  )}
                </div>
                <div className="space-y-1">
                  {events.slice(0, 3).map(ev => {
                    const meta = activityTypeMeta(ev.activity_type);
                    return (
                      <div
                        key={ev.id}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); openEdit(ev); } }}
                        className={cn(
                          "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] truncate border",
                          meta.badgeClass,
                          ev.status === "canceled" && "opacity-50 line-through"
                        )}
                        title={`${ev.title}${ev.dealer_name ? " — " + ev.dealer_name : ""}`}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", meta.dotClass)} />
                        {isAdmin && (() => {
                          const all = activityAllSellerInitials(ev);
                          return all.length > 0 ? <span className="font-semibold mr-0.5">{all.join(",")}</span> : null;
                        })()}
                        <span className="truncate">{ev.title || meta.label[lang]}</span>
                      </div>
                    );
                  })}
                  {events.length > 3 && (
                    <div className="text-[10px] text-gray-500 px-1">+{events.length - 3}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-gray-100 text-xs text-gray-600">
          <span className="font-medium text-gray-700">{T.legend[lang]}:</span>
          {ACTIVITY_TYPES.map(t => (
            <span key={t.key} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", t.dotClass)} />
              {t.label[lang]}
            </span>
          ))}
        </div>
       </div>

       <WeekOverviewPanel
         lang={lang}
         weekAnchor={weekAnchor}
         activities={activities}
         onSelectDay={(d) => { setMonth(startOfMonth(d)); setWeekAnchor(d); }}
         onSelectActivity={openEdit}
         className="hidden lg:block w-[320px] shrink-0 sticky top-4"
       />
      </div>

      <CalendarActivityModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        lang={lang}
        isAdmin={isAdmin}
        currentSeller={currentSeller}
        accounts={accounts}
        initial={editing}
        defaultDateIso={defaultDate}
        defaultAccountId={null}
        onSaved={() => setReloadKey(k => k + 1)}
      />
    </CrmLayout>
  );
}

function SellerChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-xs rounded-full border transition",
        active ? "bg-[#2d5a27] border-[#2d5a27] text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      )}
    >
      {children}
    </button>
  );
}
