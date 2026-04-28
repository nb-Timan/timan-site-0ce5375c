import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Search, Upload, Wrench } from "lucide-react";
import { toast } from "sonner";
import { TsbSidebarLayout } from "@/components/tsb/TsbSidebarLayout";
import { MockDataBanner } from "@/components/tsb/MockDataBanner";
import { StatusBadge } from "@/components/tsb/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format-date";
import { getDuplicateSerials, MACHINE_DATA_SOURCE, SOURCE_SYSTEM_LABEL, useMachines } from "@/lib/machines-store";

type Filter = "alle" | "aktive" | "inaktive" | "dubletter" | "manuelle";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "alle", label: "Alle" },
  { id: "aktive", label: "Aktive" },
  { id: "inaktive", label: "Ikke længere i kilde" },
  { id: "dubletter", label: "Dubletter" },
  { id: "manuelle", label: "Manuelt oprettet" },
];

export default function TsbMachinesPage() {
  const machines = useMachines();
  const [filter, setFilter] = useState<Filter>("alle");
  const [query, setQuery] = useState("");
  const duplicates = useMemo(() => getDuplicateSerials(machines), [machines]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = machines.filter((m) => !q || `${m.serialNumber} ${m.model} ${m.dealerName} ${m.customerName} ${m.dealerAccount ?? ""} ${m.warrantyRegistrationId ?? ""}`.toLowerCase().includes(q));
    if (filter === "aktive") list = list.filter((m) => m.sourceActive && !m.inactiveFromSource);
    if (filter === "inaktive") list = list.filter((m) => m.inactiveFromSource);
    if (filter === "dubletter") list = list.filter((m) => duplicates.has(m.serialNumber.toLowerCase()));
    if (filter === "manuelle") list = list.filter((m) => m.sourceSystem === "manual");
    return [...list].sort((a, b) => a.serialNumber.localeCompare(b.serialNumber));
  }, [machines, filter, query, duplicates]);

  const counts = useMemo(() => ({
    total: machines.length,
    active: machines.filter((m) => m.sourceActive && !m.inactiveFromSource).length,
    inactive: machines.filter((m) => m.inactiveFromSource).length,
    duplicates: duplicates.size,
  }), [machines, duplicates]);

  return (
    <TsbSidebarLayout>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--timan-red)" }}>Maskiner</h1>
          <p className="mt-1 text-sm text-muted-foreground"><strong className="text-status-warning-fg">Preview-data</strong> — reel sync mod <span className="font-mono">Garantiregistrering</span> er endnu ikke aktiv. Datamodellen er klar.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2 flex items-center gap-2 text-xs text-muted-foreground"><span>Aktive: <strong className="text-foreground">{counts.active}</strong></span><span>·</span><span>I alt: <strong className="text-foreground">{counts.total}</strong></span>{counts.duplicates > 0 && <><span>·</span><span className="text-status-warning-fg">Dubletter: <strong>{counts.duplicates}</strong></span></>}</div>
          <Button type="button" variant="outline" size="sm" onClick={() => toast.info("Import fra SharePoint / Excel kommer senere")}><Upload className="mr-2 h-4 w-4" />Importér</Button>
          <Button type="button" size="sm" onClick={() => toast.info("Manuel oprettelse kommer senere")} style={{ backgroundColor: "var(--timan-green)", color: "white" }}><Plus className="mr-2 h-4 w-4" />Tilføj maskine</Button>
        </div>
      </div>

      {MACHINE_DATA_SOURCE === "mock" && <MockDataBanner title="Maskinlisten er mock/preview-data" description={<>Maskinerne herunder er statiske eksempler. Når den rigtige sync mod SharePoint-listen <span className="font-mono">Garantiregistrering</span> aktiveres, bruges leveringsdato fra registreringen som kundens leveringsdato.</>} />}

      <div className="mt-5 rounded-[10px] border border-border-soft bg-white p-3 shadow-sm"><div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søg på serienummer, model, forhandler, kunde…" className="pl-9" /></div><div className="flex flex-wrap gap-1">{FILTERS.map((f) => <Button key={f.id} type="button" size="sm" variant={filter === f.id ? "default" : "outline"} onClick={() => setFilter(f.id)} style={filter === f.id ? { backgroundColor: "var(--timan-green)", color: "white" } : undefined}>{f.label}</Button>)}</div></div></div>

      <div className="mt-4 overflow-hidden rounded-[10px] border border-border-soft bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border-soft bg-page-bg text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3 font-medium">Serienummer</th><th className="px-4 py-3 font-medium">Model</th><th className="px-4 py-3 font-medium">Forhandler</th><th className="px-4 py-3 font-medium">Kunde</th><th className="px-4 py-3 font-medium">Leveret</th><th className="px-4 py-3 font-medium">Land</th><th className="px-4 py-3 font-medium">Kilde</th><th className="px-4 py-3 font-medium">Status</th></tr></thead><tbody>{filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">Ingen maskiner matcher dine filtre.</td></tr>}{filtered.map((m) => { const dup = duplicates.has(m.serialNumber.toLowerCase()); const warn = dup || m.inactiveFromSource; return <tr key={m.id} className={cn("border-b border-border-soft last:border-b-0 hover:bg-page-bg", warn && "bg-status-warning-bg/30")}><td className="px-4 py-3"><div className="flex items-start gap-2"><Wrench className="mt-0.5 h-4 w-4 text-muted-foreground" /><div><div className="font-mono text-xs font-medium">{m.serialNumber}</div>{dup && <div className="mt-1"><StatusBadge variant="warning"><AlertTriangle className="mr-1 h-3 w-3" />Dublet</StatusBadge></div>}</div></div></td><td className="px-4 py-3">{m.model}</td><td className="px-4 py-3"><div>{m.dealerName}</div>{m.dealerAccount && <div className="font-mono text-xs text-muted-foreground">{m.dealerAccount}</div>}</td><td className="px-4 py-3">{m.customerName}</td><td className="px-4 py-3 text-xs">{formatDate(m.deliveryDate)}</td><td className="px-4 py-3 font-mono text-xs">{m.country}</td><td className="px-4 py-3 text-xs text-muted-foreground">{SOURCE_SYSTEM_LABEL[m.sourceSystem]}</td><td className="px-4 py-3">{m.inactiveFromSource ? <StatusBadge variant="warning"><AlertTriangle className="mr-1 h-3 w-3" />Ikke i kilde</StatusBadge> : <StatusBadge variant="success">Aktiv</StatusBadge>}</td></tr>; })}</tbody></table></div></div>
      <p className="mt-3 text-xs text-muted-foreground">Maskiner slettes aldrig hårdt — historik bevares for sporbarhed på tværs af TSB-sager.</p>
    </TsbSidebarLayout>
  );
}