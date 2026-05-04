/**
 * WeekOverviewPanel — "Denne uge" side panel for CRM Calendar.
 * Pure UI; reuses activities passed from parent.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, CalendarDays } from "lucide-react";
import { activityTypeMeta, type CalendarActivity } from "@/lib/crmCalendarService";
import { cn } from "@/lib/utils";
import type { Language } from "@/types/configurator";

const L: Record<string, Record<Language, string>> = {
  this_week: { da: "Denne uge", en: "This week", de: "Diese Woche", it: "Questa settimana", hu: "Ez a hét" },
  week:      { da: "Uge",       en: "Week",      de: "KW",          it: "Settimana",        hu: "Hét" },
  none:      { da: "Ingen aktiviteter", en: "No activities", de: "Keine Aktivitäten", it: "Nessuna attività", hu: "Nincs tevékenység" },
};

const MONTHS_SHORT: Record<Language, string[]> = {
  da: ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"],
  en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
  de: ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"],
  it: ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"],
  hu: ["jan","feb","már","ápr","máj","jún","júl","aug","szept","okt","nov","dec"],
};

function fmtDayMonth(d: Date, lang: Language) {
  return `${d.getDate()}. ${MONTHS_SHORT[lang][d.getMonth()]}`;
}

const DAY_NAMES: Record<Language, string[]> = {
  da: ["Mandag","Tirsdag","Onsdag","Torsdag","Fredag","Lørdag","Søndag"],
  en: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
  de: ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"],
  it: ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"],
  hu: ["Hétfő","Kedd","Szerda","Csütörtök","Péntek","Szombat","Vasárnap"],
};

function startOfWeek(d: Date) {
  const r = new Date(d);
  const offset = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - offset);
  r.setHours(0, 0, 0, 0);
  return r;
}
function dayKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  lang: Language;
  weekAnchor: Date;
  activities: CalendarActivity[];
  onSelectDay?: (d: Date) => void;
  onSelectActivity: (a: CalendarActivity) => void;
  className?: string;
  collapsible?: boolean;
}

export default function WeekOverviewPanel({
  lang, weekAnchor, activities, onSelectDay, onSelectActivity, className, collapsible = false,
}: Props) {
  const [open, setOpen] = useState(true);
  const start = startOfWeek(weekAnchor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const end = days[6];
  const wk = isoWeek(start);

  const byKey = new Map<string, CalendarActivity[]>();
  for (const a of activities) {
    const k = dayKey(new Date(a.start_datetime));
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(a);
  }
  // sort each day by time
  for (const arr of byKey.values()) {
    arr.sort((x, y) => new Date(x.start_datetime).getTime() - new Date(y.start_datetime).getTime());
  }

  const todayKey = dayKey(new Date());
  const range = `${fmtDayMonth(start, lang)} – ${fmtDayMonth(end, lang)}`;

  return (
    <aside className={cn("bg-white rounded-2xl border border-gray-100 shadow-sm", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#2d5a27]" />
            {L.this_week[lang]}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {L.week[lang]} {wk} · {range}
          </div>
        </div>
        {collapsible && (
          <button type="button" onClick={() => setOpen(o => !o)} className="text-gray-500 hover:text-gray-700">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>
      {open && (
        <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          {days.map((d, i) => {
            const k = dayKey(d);
            const evts = byKey.get(k) || [];
            const isToday = k === todayKey;
            return (
              <div key={k} className={cn("rounded-lg border bg-gray-50/60 border-gray-100 overflow-hidden", isToday && "border-[#2d5a27]/40 bg-[#2d5a27]/5")}>
                <button
                  type="button"
                  onClick={() => onSelectDay?.(d)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-gray-100/60"
                >
                  <span className="text-xs font-semibold text-gray-700">
                    {DAY_NAMES[lang][i]} <span className="text-gray-400 font-normal">{d.getDate()}.{d.getMonth() + 1}</span>
                  </span>
                  <span className="text-[10px] text-gray-500 tabular-nums">{evts.length}</span>
                </button>
                <div className="px-2 pb-2 pt-1 space-y-1">
                  {evts.length === 0 ? (
                    <div className="text-[11px] text-gray-400 px-1 py-0.5">{L.none[lang]}</div>
                  ) : evts.map(ev => {
                    const meta = activityTypeMeta(ev.activity_type);
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onSelectActivity(ev)}
                        className={cn(
                          "w-full text-left flex items-start gap-1.5 rounded px-1.5 py-1 text-[11px] border bg-white hover:bg-gray-50",
                          ev.status === "canceled" && "opacity-50 line-through"
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0 mt-1", meta.dotClass)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-gray-800 font-medium">{ev.title || meta.label[lang]}</span>
                          <span className="block truncate text-gray-500">
                            {ev.dealer_name || "—"}
                            {ev.start_datetime ? ` · ${fmtTime(ev.start_datetime)}` : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
