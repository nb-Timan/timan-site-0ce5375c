/**
 * DealerActivitiesSection — "Forhandler aktiviteter" on the account detail page.
 * Shows upcoming + past calendar activities for one account, plus quick "+ Ny aktivitet".
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, CalendarDays, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CalendarActivityModal from "@/components/crm/CalendarActivityModal";
import { listActivities, activityTypeMeta, type CalendarActivity } from "@/lib/crmCalendarService";
import { BUDGET_SELLERS } from "@/lib/crmBudgetService";
import type { CrmAccount } from "@/lib/crmAccountsService";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin } from "@/lib/crmScope";
import { cn } from "@/lib/utils";
import type { Language } from "@/types/configurator";

const T: Record<string, Record<Language, string>> = {
  title:    { da: "Forhandler aktiviteter",   en: "Dealer activities",      de: "Händler-Aktivitäten", it: "Attività rivenditore",  hu: "Kereskedői tevékenységek" },
  upcoming: { da: "Kommende",                 en: "Upcoming",               de: "Bevorstehend",        it: "Prossime",              hu: "Közelgő" },
  past:     { da: "Tidligere",                en: "Past",                   de: "Vergangen",           it: "Passate",               hu: "Korábbi" },
  none:     { da: "Ingen aktiviteter endnu.", en: "No activities yet.",     de: "Noch keine Aktivitäten.", it: "Nessuna attività.", hu: "Még nincs tevékenység." },
  add:      { da: "+ Ny aktivitet",           en: "+ New activity",         de: "+ Neue Aktivität",    it: "+ Nuova attività",      hu: "+ Új tevékenység" },
  last_visit: { da: "Sidste besøg",           en: "Last visit",             de: "Letzter Besuch",      it: "Ultima visita",         hu: "Utolsó látogatás" },
};

interface Props { account: CrmAccount; accounts: CrmAccount[] }

export default function DealerActivitiesSection({ account, accounts }: Props) {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const isAdmin = isCrmAdmin(derivePortalRole(appUser));
  const [rows, setRows] = useState<CalendarActivity[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarActivity | null>(null);
  const [reload, setReload] = useState(0);

  const currentSeller = useMemo(() => {
    const email = (appUser?.email || "").toLowerCase();
    return BUDGET_SELLERS.find(s => s.email.toLowerCase() === email) || null;
  }, [appUser?.email]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listActivities({ accountId: account.id });
      if (!cancelled) setRows(list);
    })();
    return () => { cancelled = true; };
  }, [account.id, reload]);

  const now = Date.now();
  const upcoming = rows.filter(r => new Date(r.start_datetime).getTime() >= now && r.status !== "canceled").slice(0, 8);
  const past = rows.filter(r => new Date(r.start_datetime).getTime() < now).slice(-8).reverse();
  const lastVisit = past[0] || null;

  return (
    <Card className="rounded-2xl border-gray-100">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#2d5a27]" />
          {T.title[lang]}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => { setEditing(null); setOpen(true); }}>
          {T.add[lang]}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastVisit && (
          <div className="text-xs text-gray-500">
            {T.last_visit[lang]}: <span className="text-gray-700 font-medium">{new Date(lastVisit.start_datetime).toLocaleDateString()}</span>
            {(() => { const all = activityAllSellerInitials(lastVisit); return all.length ? ` · ${all.join(", ")}` : ""; })()}
          </div>
        )}

        <ActivityList lang={lang} title={T.upcoming[lang]} rows={upcoming} onClickRow={(a) => { setEditing(a); setOpen(true); }} emptyText={T.none[lang]} />
        <ActivityList lang={lang} title={T.past[lang]} rows={past} onClickRow={(a) => { setEditing(a); setOpen(true); }} emptyText={T.none[lang]} muted />
      </CardContent>

      <CalendarActivityModal
        open={open}
        onOpenChange={setOpen}
        lang={lang}
        isAdmin={isAdmin}
        currentSeller={currentSeller}
        accounts={accounts}
        initial={editing}
        defaultDateIso={null}
        defaultAccountId={account.id}
        onSaved={() => setReload(k => k + 1)}
      />
    </Card>
  );
}

function ActivityList({ lang, title, rows, onClickRow, emptyText, muted }: {
  lang: Language; title: string; rows: CalendarActivity[]; onClickRow: (a: CalendarActivity) => void; emptyText: string; muted?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">{title}</div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(a => {
            const meta = activityTypeMeta(a.activity_type);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onClickRow(a)}
                  className={cn(
                    "w-full text-left flex items-center gap-2 rounded-lg px-2.5 py-2 border hover:bg-gray-50 transition",
                    muted ? "border-gray-100 bg-gray-50/40" : "border-gray-100 bg-white"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full shrink-0", meta.dotClass)} />
                  <span className="text-sm text-gray-800 truncate flex-1">{a.title || meta.label[lang]}</span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", meta.badgeClass)}>{meta.label[lang]}</span>
                  <span className="text-xs text-gray-500 inline-flex items-center gap-1 whitespace-nowrap">
                    <Clock className="h-3 w-3" />
                    {new Date(a.start_datetime).toLocaleDateString()}
                  </span>
                  {(() => { const all = activityAllSellerInitials(a); return all.length ? <span className="text-[10px] font-semibold text-gray-500">{all.join(", ")}</span> : null; })()}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
