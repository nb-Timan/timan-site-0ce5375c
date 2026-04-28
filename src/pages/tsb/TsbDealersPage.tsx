import { useMemo, useState } from "react";
import { AlertTriangle, Building2, Search } from "lucide-react";
import { TsbSidebarLayout } from "@/components/tsb/TsbSidebarLayout";
import { MockDataBanner } from "@/components/tsb/MockDataBanner";
import { StatusBadge } from "@/components/tsb/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDateTime as formatSync } from "@/lib/format-date";
import { DEALER_DATA_SOURCE, getDealers, PARTNER_TYPE_LABEL, type Dealer, type PartnerType } from "@/lib/tsb-store";

type Filter = "alle" | "forhandler" | "servicepartner" | "importor" | "aktiv" | "inaktiv";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "alle", label: "Alle" },
  { id: "forhandler", label: "Forhandler" },
  { id: "servicepartner", label: "Servicepartner" },
  { id: "importor", label: "Importør" },
  { id: "aktiv", label: "Aktiv" },
  { id: "inaktiv", label: "Ikke længere i SharePoint" },
];

function partnerBadge(type: PartnerType) {
  const variant = type === "forhandler" ? "info" : type === "importor" ? "neutral" : "success";
  return <StatusBadge variant={variant}>{PARTNER_TYPE_LABEL[type]}</StatusBadge>;
}

function applyFilter(d: Dealer, f: Filter, q: string): boolean {
  if (q) {
    const hay = `${d.name} ${d.city} ${d.contact} ${d.sharepointAccount ?? ""}`.toLowerCase();
    if (!hay.includes(q.toLowerCase())) return false;
  }
  switch (f) {
    case "alle": return true;
    case "aktiv": return d.sourceActive && !d.inactiveFromSource;
    case "inaktiv": return d.inactiveFromSource;
    default: return d.partnerType === f;
  }
}

export default function TsbDealersPage() {
  const dealers = getDealers();
  const [filter, setFilter] = useState<Filter>("alle");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => dealers.filter((d) => applyFilter(d, filter, query)), [dealers, filter, query]);
  const counts = useMemo(() => ({
    total: dealers.length,
    active: dealers.filter((d) => d.sourceActive && !d.inactiveFromSource).length,
    inactive: dealers.filter((d) => d.inactiveFromSource).length,
  }), [dealers]);
  const lastSync = useMemo(() => formatSync(dealers.map((d) => d.lastSyncedAt).filter(Boolean).sort().reverse()[0]), [dealers]);

  return (
    <TsbSidebarLayout>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--timan-red)" }}>Forhandlere</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {DEALER_DATA_SOURCE === "sharepoint" ? <>Synkroniseret fra SharePoint-listen <span className="font-mono">DebitorFiltered</span> · Sidst synkroniseret: {lastSync}</> : <><strong className="text-status-warning-fg">Preview-data</strong> — reel SharePoint-sync er endnu ikke aktiv. Datamodellen er klar til listen <span className="font-mono">DebitorFiltered</span>.</>}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Aktive: <strong className="text-foreground">{counts.active}</strong></span><span>·</span><span>I alt: <strong className="text-foreground">{counts.total}</strong></span>
          {counts.inactive > 0 && <><span>·</span><span className="text-status-warning-fg">Ikke i SharePoint: <strong>{counts.inactive}</strong></span></>}
        </div>
      </div>

      {DEALER_DATA_SOURCE === "mock" && <MockDataBanner title="Forhandlerlisten er mock/preview-data" description={<>De viste forhandlere er <strong>ikke</strong> hentet fra SharePoint endnu. De er statiske eksempler, der bruges til at designe og teste UI'et.</>} />}

      <div className="mt-5 rounded-[10px] border border-border-soft bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søg på navn, by, kontakt eller account…" className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => <Button key={f.id} type="button" size="sm" variant={filter === f.id ? "default" : "outline"} onClick={() => setFilter(f.id)} style={filter === f.id ? { backgroundColor: "var(--timan-green)", color: "white" } : undefined}>{f.label}</Button>)}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[10px] border border-border-soft bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border-soft bg-page-bg text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3 font-medium">Forhandler</th><th className="px-4 py-3 font-medium">Account</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Land</th><th className="px-4 py-3 font-medium">Maskiner</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Synkroniseret</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">Ingen forhandlere matcher dine filtre.</td></tr>}
              {filtered.map((d) => <tr key={d.id} className={cn("border-b border-border-soft last:border-b-0 hover:bg-page-bg", d.inactiveFromSource && "bg-status-warning-bg/30")}><td className="px-4 py-3"><div className="flex items-start gap-2"><Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" /><div><div className="font-medium">{d.name}</div><div className="text-xs text-muted-foreground">{d.city} · {d.contact}</div></div></div></td><td className="px-4 py-3 font-mono text-xs">{d.sharepointAccount ?? "—"}</td><td className="px-4 py-3">{partnerBadge(d.partnerType)}</td><td className="px-4 py-3 font-mono text-xs">{d.country}</td><td className="px-4 py-3">{d.machineCount}</td><td className="px-4 py-3">{d.inactiveFromSource ? <StatusBadge variant="warning"><AlertTriangle className="mr-1 h-3 w-3" />Ikke længere i SharePoint</StatusBadge> : d.sourceActive ? <StatusBadge variant="success">Aktiv</StatusBadge> : <StatusBadge variant="neutral">Inaktiv</StatusBadge>}</td><td className="px-4 py-3 text-xs text-muted-foreground">{formatSync(d.lastSyncedAt)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Forhandlere slettes aldrig — hvis en forhandler forsvinder fra SharePoint markeres den med en gul advarsel og bevares for historiske TSB-sager.</p>
    </TsbSidebarLayout>
  );
}