import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, SlidersHorizontal, ExternalLink } from "lucide-react";
import { TsbSidebarLayout } from "@/components/tsb/TsbSidebarLayout";
import { TsbStatusSelect } from "@/components/tsb/TsbStatusSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  daysUntil, deadlineLabel, formatDate, getProcessStatus, PROCESS_STATUS_LABEL,
  PROCESS_STATUS_OPTIONS, setTsbProcessStatus, totalMachineCount, useTsbs,
  type ProcessStatus, type Tsb,
} from "@/lib/tsb-store";

type AdminTab = "all" | "aktive" | "kladder" | "afventer" | "near" | "overdue" | "lukkede";

const ADMIN_TABS: { value: AdminTab; label: string }[] = [
  { value: "all", label: "Alle TSB'er" },
  { value: "aktive", label: "Aktive" },
  { value: "kladder", label: "Kladder" },
  { value: "afventer", label: "Afventer accept" },
  { value: "near", label: "Nær deadline" },
  { value: "overdue", label: "Overskredet" },
  { value: "lukkede", label: "Lukkede" },
];

function matchesAdminTab(t: Tsb, tab: AdminTab): boolean {
  if (tab === "all") return true;
  const ps = getProcessStatus(t);
  if (tab === "aktive") return ps === "aktiv";
  if (tab === "overdue") return ps === "dato_overskredet";
  if (tab === "kladder") return ps === "ikke_paabegyndt";
  if (tab === "lukkede") return ps === "afsluttet";
  if (tab === "afventer") {
    if (ps !== "aktiv") return false;
    return t.dealers.some((d) => d.status === "afventer");
  }
  if (tab === "near") {
    if (ps !== "aktiv") return false;
    const d = daysUntil(t.deadline);
    return d >= 0 && d <= 14;
  }
  return true;
}

const STATUS_FILTERS: { value: "all" | ProcessStatus; label: string }[] = [
  { value: "all", label: "Alle statusser" },
  ...PROCESS_STATUS_OPTIONS.map((s) => ({ value: s, label: PROCESS_STATUS_LABEL[s] })),
];

export default function TsbListPage() {
  const navigate = useNavigate();
  const tsbs = useTsbs();
  const [tab, setTab] = useState<AdminTab>("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProcessStatus>("all");

  const tabCounts = useMemo(() => {
    const counts: Record<AdminTab, number> = { all: tsbs.length, aktive: 0, kladder: 0, afventer: 0, near: 0, overdue: 0, lukkede: 0 };
    for (const t of tsbs) {
      if (matchesAdminTab(t, "aktive")) counts.aktive++;
      if (matchesAdminTab(t, "kladder")) counts.kladder++;
      if (matchesAdminTab(t, "afventer")) counts.afventer++;
      if (matchesAdminTab(t, "near")) counts.near++;
      if (matchesAdminTab(t, "overdue")) counts.overdue++;
      if (matchesAdminTab(t, "lukkede")) counts.lukkede++;
    }
    return counts;
  }, [tsbs]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tsbs.filter((t) => {
      if (!matchesAdminTab(t, tab)) return false;
      if (statusFilter !== "all" && getProcessStatus(t) !== statusFilter) return false;
      if (!q) return true;
      return t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q);
    });
  }, [tsbs, tab, query, statusFilter]);

  return (
    <TsbSidebarLayout
      intro={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Alle Technical Service Bulletins — kladder, aktive og lukkede.
          </p>
          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{rows.length}</span> af {tsbs.length}
            </div>
            <Link to="/portal/service/tsb/new">
              <Button style={{ backgroundColor: "var(--timan-green)", color: "white" }}>
                <Plus className="h-4 w-4" /> Ny TSB
              </Button>
            </Link>
          </div>
        </div>
      }
    >
      <div className="mt-1 flex flex-wrap gap-1 rounded-[10px] border border-border-soft bg-white p-1 shadow-sm">
        {ADMIN_TABS.map((t) => {
          const active = tab === t.value;
          const count = tabCounts[t.value];
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-slate-900 text-white" : "text-muted-foreground hover:bg-slate-100 hover:text-foreground"
              }`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                active ? "bg-white/20 text-white" : "bg-slate-100 text-muted-foreground"
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[10px] border border-border-soft bg-white p-3 shadow-sm">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Søg på TSB-nummer eller titel..."
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 rounded-[10px] border border-border-soft bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-soft text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Nummer</th>
                <th className="px-5 py-3 font-medium">Titel</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Aktiv fra</th>
                <th className="px-5 py-3 font-medium">Forhandlere</th>
                <th className="px-5 py-3 font-medium">Maskiner</th>
                <th className="px-5 py-3 font-medium">Deadline</th>
                <th className="px-5 py-3 font-medium text-right">Handling</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Ingen TSB'er matcher din søgning.
                  </td>
                </tr>
              )}
              {rows.map((t) => {
                const dl = deadlineLabel(t.deadline);
                return (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/portal/service/tsb/${t.id}`)}
                    className="cursor-pointer border-b border-border-soft last:border-0 hover:bg-page-bg"
                  >
                    <td className="px-5 py-4">
                      <Link
                        to={`/portal/service/tsb/${t.id}`}
                        className="font-mono text-sm font-medium hover:underline"
                        style={{ color: "var(--timan-green)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t.id}
                      </Link>
                    </td>
                    <td className="px-5 py-4">{t.title}</td>
                    <td className="px-5 py-4">
                      <TsbStatusSelect
                        value={getProcessStatus(t)}
                        onChange={(next) => setTsbProcessStatus(t.id, next)}
                        stopPropagation
                      />
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{formatDate(t.activeFrom)}</td>
                    <td className="px-5 py-4 text-muted-foreground">{t.dealers.length}</td>
                    <td className="px-5 py-4 text-muted-foreground">{totalMachineCount(t)}</td>
                    <td className="px-5 py-4">
                      <span
                        className={dl.tone ? "font-medium" : ""}
                        style={
                          dl.tone === "danger" ? { color: "var(--status-danger-fg)" }
                          : dl.tone === "warning" ? { color: "var(--status-warning-fg)" }
                          : undefined
                        }
                      >
                        {dl.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        to={`/portal/service/tsb/${t.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                        style={{ color: "var(--timan-green)" }}
                      >
                        Åbn <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </TsbSidebarLayout>
  );
}
