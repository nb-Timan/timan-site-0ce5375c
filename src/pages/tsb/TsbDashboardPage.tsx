import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Building2, CalendarClock, CheckCircle2,
  ClipboardList, Clock, FileText, Gauge, Wrench, type LucideIcon,
} from "lucide-react";
import { TsbSidebarLayout } from "@/components/tsb/TsbSidebarLayout";
import {
  daysUntil, formatDate, getDealers, getMachines, getProcessStatus,
  totalMachineCount, useTsbs, type Tsb,
} from "@/lib/tsb-store";

interface Kpi { label: string; value: number | string; icon: LucideIcon; }

export default function TsbDashboardPage() {
  const tsbs = useTsbs();
  const dealers = getDealers();
  const machines = getMachines();

  const stats = useMemo(() => {
    let active = 0, drafts = 0, waitingAccept = 0, nearDeadline = 0, overdue = 0, closed = 0;
    const affectedDealerIds = new Set<string>();
    const affectedMachineSerials = new Set<string>();
    for (const t of tsbs) {
      const ps = getProcessStatus(t);
      if (ps === "aktiv") active++;
      if (ps === "ikke_paabegyndt") drafts++;
      if (ps === "afsluttet") closed++;
      if (ps === "dato_overskredet") overdue++;
      if (ps === "aktiv") {
        const d = daysUntil(t.deadline);
        if (d >= 0 && d <= 14) nearDeadline++;
        if (t.dealers.some((dl) => dl.status === "afventer")) waitingAccept++;
      }
      if (ps === "aktiv" || ps === "dato_overskredet") {
        for (const dl of t.dealers) {
          affectedDealerIds.add(dl.dealerId);
          for (const s of dl.machineSerials) affectedMachineSerials.add(s);
        }
      }
    }
    return { active, drafts, waitingAccept, nearDeadline, overdue, closed,
      affectedDealers: affectedDealerIds.size, affectedMachines: affectedMachineSerials.size };
  }, [tsbs]);

  const kpis: Kpi[] = [
    { label: "Aktive TSB'er", value: stats.active, icon: FileText },
    { label: "Kladder", value: stats.drafts, icon: ClipboardList },
    { label: "Afventer accept", value: stats.waitingAccept, icon: Clock },
    { label: "Nær deadline", value: stats.nearDeadline, icon: CalendarClock },
    { label: "Overskredet", value: stats.overdue, icon: AlertTriangle },
    { label: "Lukkede", value: stats.closed, icon: CheckCircle2 },
    { label: "Berørte forhandlere", value: stats.affectedDealers, icon: Building2 },
    { label: "Berørte maskiner", value: stats.affectedMachines, icon: Wrench },
  ];

  const requiresAction = useMemo(() => {
    return tsbs.filter((t) => {
      const ps = getProcessStatus(t);
      if (ps === "dato_overskredet") return true;
      if (ps !== "aktiv") return false;
      const waiting = t.dealers.filter((d) => d.status === "afventer").length;
      const d = daysUntil(t.deadline);
      return waiting > 0 || (d >= 0 && d <= 7);
    }).slice(0, 6);
  }, [tsbs]);

  const upcoming = useMemo(() => {
    return tsbs.filter((t) => {
      const ps = getProcessStatus(t);
      return ps === "aktiv" && daysUntil(t.deadline) >= 0;
    }).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5);
  }, [tsbs]);

  const latest = useMemo(
    () => [...tsbs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [tsbs],
  );

  return (
    <TsbSidebarLayout
      intro={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-950">TSB Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">
              Overblik over alle Technical Service Bulletins — {dealers.length} forhandlere, {machines.length} maskiner.
            </p>
          </div>
          <Link to="/portal/service/tsb">
            <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
              Se alle TSB'er <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">{k.label}</span>
                <Icon className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-3 text-center text-3xl font-black text-slate-950">{k.value}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-100 p-5">
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Kræver handling
            </h2>
            <span className="text-xs font-bold text-slate-400">{requiresAction.length}</span>
          </header>
          {requiresAction.length === 0 ? (
            <EmptyState message="Ingen TSB'er kræver handling lige nu." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {requiresAction.map((t) => <ActionRow key={t.id} tsb={t} />)}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-100 p-5">
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
              <CalendarClock className="h-5 w-5 text-indigo-500" /> Kommende deadlines
            </h2>
            <span className="text-xs font-bold text-slate-400">{upcoming.length}</span>
          </header>
          {upcoming.length === 0 ? (
            <EmptyState message="Ingen kommende deadlines." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((t) => {
                const d = daysUntil(t.deadline);
                return (
                  <li key={t.id}>
                    <Link to={`/portal/service/tsb/${t.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{t.title}</p>
                        <p className="font-mono text-xs text-slate-500">{t.id}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900">{formatDate(t.deadline)}</p>
                        <p className="text-xs text-slate-500">om {d} {d === 1 ? "dag" : "dage"}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 p-5">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <Gauge className="h-5 w-5 text-slate-500" /> Seneste TSB-aktivitet
          </h2>
        </header>
        {latest.length === 0 ? (
          <EmptyState message="Ingen aktivitet endnu." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {latest.map((t) => (
              <li key={t.id}>
                <Link to={`/portal/service/tsb/${t.id}`} className="grid grid-cols-1 gap-2 p-4 hover:bg-slate-50 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{t.title}</p>
                    <p className="font-mono text-xs text-slate-500">{t.id}</p>
                  </div>
                  <span className="text-xs text-slate-500">Oprettet {formatDate(t.createdAt)}</span>
                  <span className="text-xs text-slate-500">{totalMachineCount(t)} maskiner</span>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-700">{getProcessStatus(t)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </TsbSidebarLayout>
  );
}

function ActionRow({ tsb }: { tsb: Tsb }) {
  const ps = getProcessStatus(tsb);
  const waiting = tsb.dealers.filter((d) => d.status === "afventer").length;
  const d = daysUntil(tsb.deadline);
  const reason =
    ps === "dato_overskredet" ? `Overskredet med ${Math.abs(d)} dage`
      : waiting > 0 ? `${waiting} forhandler${waiting === 1 ? "" : "e"} mangler accept`
      : `Deadline om ${d} dag${d === 1 ? "" : "e"}`;

  return (
    <li>
      <Link to={`/portal/service/tsb/${tsb.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{tsb.title}</p>
          <p className="font-mono text-xs text-slate-500">{tsb.id}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-slate-900">{reason}</p>
          <p className="text-xs text-slate-500">Deadline {formatDate(tsb.deadline)}</p>
        </div>
      </Link>
    </li>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="p-8 text-center text-sm text-slate-500">{message}</div>;
}
