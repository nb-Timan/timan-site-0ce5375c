/**
 * Timan Backend -> Systemkort
 * Route: /portal/backend/system-map
 *
 * Overview stays light and simple. DNA is the deeper, zoomable view built from
 * the same registry data so the two levels share one system model.
 */
import { useCallback, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Compass,
  Layers3,
  Maximize2,
  Network,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { Button } from "@/components/ui/button";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { isBackendActor } from "@/lib/portalAccess";
import {
  findSystemMapNode,
  systemMapEdges,
  systemMapNodes,
  type SystemMapNode,
  type SystemMapNodeId,
} from "@/lib/systemDataflowMap";

const COLOR_CLASSES: Record<
  string,
  { badge: string; node: string; icon: string; selected: string; line: string; dna: string }
> = {
  amber: {
    badge: "bg-amber-50 text-amber-800 border-amber-200",
    node: "border-amber-200 bg-amber-50/85 hover:bg-amber-50",
    icon: "bg-amber-100 text-amber-700",
    selected: "ring-2 ring-amber-400",
    line: "#d97706",
    dna: "border-amber-400/55 bg-amber-300/15 text-amber-50",
  },
  blue: {
    badge: "bg-blue-50 text-blue-800 border-blue-200",
    node: "border-blue-200 bg-blue-50/85 hover:bg-blue-50",
    icon: "bg-blue-100 text-blue-700",
    selected: "ring-2 ring-blue-400",
    line: "#2563eb",
    dna: "border-blue-400/60 bg-blue-400/15 text-blue-50",
  },
  cyan: {
    badge: "bg-cyan-50 text-cyan-800 border-cyan-200",
    node: "border-cyan-200 bg-cyan-50/85 hover:bg-cyan-50",
    icon: "bg-cyan-100 text-cyan-700",
    selected: "ring-2 ring-cyan-400",
    line: "#0891b2",
    dna: "border-cyan-300/60 bg-cyan-300/15 text-cyan-50",
  },
  emerald: {
    badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
    node: "border-emerald-200 bg-emerald-50/85 hover:bg-emerald-50",
    icon: "bg-emerald-100 text-emerald-700",
    selected: "ring-2 ring-emerald-400",
    line: "#047857",
    dna: "border-emerald-300/60 bg-emerald-300/15 text-emerald-50",
  },
  indigo: {
    badge: "bg-indigo-50 text-indigo-800 border-indigo-200",
    node: "border-indigo-200 bg-indigo-50/85 hover:bg-indigo-50",
    icon: "bg-indigo-100 text-indigo-700",
    selected: "ring-2 ring-indigo-400",
    line: "#4f46e5",
    dna: "border-indigo-300/60 bg-indigo-300/15 text-indigo-50",
  },
  lime: {
    badge: "bg-lime-50 text-lime-800 border-lime-200",
    node: "border-lime-200 bg-lime-50/85 hover:bg-lime-50",
    icon: "bg-lime-100 text-lime-700",
    selected: "ring-2 ring-lime-400",
    line: "#65a30d",
    dna: "border-lime-300/55 bg-lime-300/15 text-lime-50",
  },
  orange: {
    badge: "bg-orange-50 text-orange-800 border-orange-200",
    node: "border-orange-200 bg-orange-50/85 hover:bg-orange-50",
    icon: "bg-orange-100 text-orange-700",
    selected: "ring-2 ring-orange-400",
    line: "#ea580c",
    dna: "border-orange-300/60 bg-orange-300/15 text-orange-50",
  },
  purple: {
    badge: "bg-purple-50 text-purple-800 border-purple-200",
    node: "border-purple-200 bg-purple-50/85 hover:bg-purple-50",
    icon: "bg-purple-100 text-purple-700",
    selected: "ring-2 ring-purple-400",
    line: "#9333ea",
    dna: "border-purple-300/60 bg-purple-300/15 text-purple-50",
  },
  rose: {
    badge: "bg-rose-50 text-rose-800 border-rose-200",
    node: "border-rose-200 bg-rose-50/85 hover:bg-rose-50",
    icon: "bg-rose-100 text-rose-700",
    selected: "ring-2 ring-rose-400",
    line: "#e11d48",
    dna: "border-rose-300/60 bg-rose-300/15 text-rose-50",
  },
  sky: {
    badge: "bg-sky-50 text-sky-800 border-sky-200",
    node: "border-sky-200 bg-sky-50/85 hover:bg-sky-50",
    icon: "bg-sky-100 text-sky-700",
    selected: "ring-2 ring-sky-400",
    line: "#0284c7",
    dna: "border-sky-300/60 bg-sky-300/15 text-sky-50",
  },
  slate: {
    badge: "bg-slate-50 text-slate-800 border-slate-200",
    node: "border-slate-200 bg-white hover:bg-slate-50",
    icon: "bg-slate-100 text-slate-700",
    selected: "ring-2 ring-slate-400",
    line: "#475569",
    dna: "border-slate-300/55 bg-slate-300/10 text-slate-50",
  },
  violet: {
    badge: "bg-violet-50 text-violet-800 border-violet-200",
    node: "border-violet-200 bg-violet-50/85 hover:bg-violet-50",
    icon: "bg-violet-100 text-violet-700",
    selected: "ring-2 ring-violet-400",
    line: "#7c3aed",
    dna: "border-violet-300/60 bg-violet-300/15 text-violet-50",
  },
};

const OVERVIEW_COLUMNS = [
  {
    title: "Datakilder / input",
    description: "Det der fodrer portalen",
    ids: ["sharepoint", "erp", "supabase"] as SystemMapNodeId[],
  },
  {
    title: "Timan Partner Portal",
    description: "Hovedområder og funktioner",
    ids: ["crm", "sales", "marketing", "dealer_data", "service", "messe", "import", "system_admin"] as SystemMapNodeId[],
  },
  {
    title: "Output / integrationer",
    description: "Det portalen sender videre",
    ids: ["email", "documents"] as SystemMapNodeId[],
  },
];

const DNA_WORLD = { width: 1800, height: 1180 };
const DNA_POSITIONS: Record<SystemMapNodeId, { x: number; y: number }> = {
  portal: { x: 900, y: 560 },
  crm: { x: 610, y: 280 },
  sales: { x: 900, y: 170 },
  marketing: { x: 1200, y: 280 },
  dealer_data: { x: 470, y: 560 },
  service: { x: 1330, y: 560 },
  messe: { x: 610, y: 840 },
  import: { x: 900, y: 960 },
  system_admin: { x: 1200, y: 840 },
  sharepoint: { x: 180, y: 300 },
  erp: { x: 1580, y: 300 },
  supabase: { x: 180, y: 840 },
  email: { x: 1580, y: 840 },
  documents: { x: 1320, y: 250 },
};

function colorFor(node: SystemMapNode) {
  return COLOR_CLASSES[node.color] ?? COLOR_CLASSES.slate;
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm text-slate-500">Ingen direkte relation registreret.</span>
        )}
      </div>
    </section>
  );
}

function ViewTabs({ view, onChange }: { view: "overview" | "dna"; onChange: (view: "overview" | "dna") => void }) {
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange("overview")}
        className={[
          "rounded-full px-4 py-2 text-sm font-black transition",
          view === "overview" ? "bg-emerald-700 text-white" : "text-slate-600 hover:bg-slate-50",
        ].join(" ")}
      >
        System-overblik
      </button>
      <button
        type="button"
        onClick={() => onChange("dna")}
        className={[
          "rounded-full px-4 py-2 text-sm font-black transition",
          view === "dna" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50",
        ].join(" ")}
      >
        System DNA
      </button>
    </div>
  );
}

function OverviewNode({
  node,
  selected,
  onSelect,
  onExploreDna,
}: {
  node: SystemMapNode;
  selected: boolean;
  onSelect: (id: SystemMapNodeId) => void;
  onExploreDna: (id: SystemMapNodeId) => void;
}) {
  const Icon = node.icon;
  const colors = colorFor(node);
  return (
    <div
      className={[
        "group rounded-xl border p-3 shadow-sm transition",
        colors.node,
        selected ? colors.selected : "",
      ].join(" ")}
    >
      <button type="button" onClick={() => onSelect(node.id)} className="flex w-full items-center gap-3 text-left">
        <span className={["flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", colors.icon].join(" ")}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black text-slate-950">{node.title}</span>
          <span className="block truncate text-xs font-semibold text-slate-500">{node.subtitle}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onExploreDna(node.id)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-black text-emerald-700 opacity-0 transition group-hover:opacity-100"
      >
        Udforsk i System DNA
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SystemOverview({
  selectedId,
  onSelect,
  onExploreDna,
}: {
  selectedId: SystemMapNodeId;
  onSelect: (id: SystemMapNodeId) => void;
  onExploreDna: (id: SystemMapNodeId) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid min-h-[640px] gap-4 xl:grid-cols-[260px_minmax(0,1fr)_260px]">
        {OVERVIEW_COLUMNS.map((column) => (
          <div
            key={column.title}
            className={column.title === "Timan Partner Portal" ? "rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4" : "rounded-2xl border border-slate-100 bg-slate-50 p-4"}
          >
            <div className="mb-4">
              <h2 className="text-sm font-black text-slate-950">{column.title}</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">{column.description}</p>
            </div>

            {column.title === "Timan Partner Portal" && (
              <button
                type="button"
                onClick={() => onSelect("portal")}
                className={[
                  "mb-4 flex w-full items-center justify-center gap-3 rounded-2xl border border-emerald-300 bg-white px-4 py-5 text-left shadow-sm transition hover:bg-emerald-50",
                  selectedId === "portal" ? "ring-2 ring-emerald-400" : "",
                ].join(" ")}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Network className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-base font-black text-slate-950">Timan Partner Portal</span>
                  <span className="block text-xs font-semibold text-slate-500">Samlet adgang, roller og navigation</span>
                </span>
              </button>
            )}

            <div className={column.title === "Timan Partner Portal" ? "grid gap-3 md:grid-cols-2" : "space-y-3"}>
              {column.ids.map((id) => {
                const node = findSystemMapNode(id);
                return (
                  <OverviewNode
                    key={node.id}
                    node={node}
                    selected={selectedId === node.id}
                    onSelect={onSelect}
                    onExploreDna={onExploreDna}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NodeDetails({
  node,
  onClose,
  onExploreDna,
  view,
}: {
  node: SystemMapNode;
  onClose: () => void;
  onExploreDna: (id: SystemMapNodeId) => void;
  view: "overview" | "dna";
}) {
  const Icon = node.icon;
  const colors = colorFor(node);
  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={["flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", colors.icon].join(" ")}>
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <div className={["inline-flex rounded-full border px-2.5 py-1 text-xs font-black uppercase", colors.badge].join(" ")}>
              {node.kind === "integration" ? "Integration" : node.kind === "portal" ? "Portal" : "Modul"}
            </div>
            <h2 className="mt-2 text-xl font-black text-slate-950">{node.title}</h2>
            <p className="text-sm font-semibold text-slate-500">{node.subtitle}</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Luk detaljer">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
        {node.explanation}
      </p>

      {view === "overview" && (
        <Button type="button" onClick={() => onExploreDna(node.id)} className="mt-4 w-full bg-slate-950 text-white hover:bg-slate-800">
          Udforsk i System DNA
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}

      <div className="mt-5 space-y-5">
        <DetailList title="Tabeller / datakilder" items={node.tables} />
        <DetailList title="Services / kodeområder" items={node.services} />
        <DetailList title="Modtager data fra" items={node.receivesFrom} />
        <DetailList title="Sender data til" items={node.sendsTo} />
        <DetailList title="Integrationer" items={node.integrations} />
      </div>
    </aside>
  );
}

function ConnectionsList({ onSelect }: { onSelect: (id: SystemMapNodeId) => void }) {
  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          <ArrowRightLeft className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-black text-slate-950">Forbindelser</h2>
          <p className="text-xs font-semibold text-slate-500">Relationer vises her i stedet for som store labels oven på kortet.</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {systemMapEdges.map((edge) => {
          const from = findSystemMapNode(edge.from);
          const to = findSystemMapNode(edge.to);
          return (
            <button
              key={`${edge.from}-${edge.to}`}
              type="button"
              onClick={() => onSelect(edge.from)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-white"
            >
              <span className="font-black text-slate-950">{from.title}</span>
              <span className="px-2 text-slate-400">→</span>
              <span className="font-black text-slate-950">{to.title}</span>
              <span className="ml-2 text-slate-500">({edge.label})</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DnaNode({
  node,
  selected,
  active,
  dimmed,
  zoom,
  onSelect,
}: {
  node: SystemMapNode;
  selected: boolean;
  active: boolean;
  dimmed: boolean;
  zoom: number;
  onSelect: (id: SystemMapNodeId) => void;
}) {
  const Icon = node.icon;
  const colors = colorFor(node);
  const pos = DNA_POSITIONS[node.id];
  const showDetails = zoom >= 1.05;
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className={[
        "absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-3 text-left shadow-2xl backdrop-blur transition",
        node.kind === "portal" ? "w-[260px]" : "w-[220px]",
        colors.dna,
        selected ? "ring-2 ring-white" : "",
        active ? "opacity-100" : dimmed ? "opacity-25" : "opacity-90",
      ].join(" ")}
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 text-white">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black">{node.title}</span>
          <span className="block truncate text-xs font-semibold text-slate-300">{node.subtitle}</span>
        </span>
      </div>
      {showDetails && (
        <div className="mt-3 flex flex-wrap gap-1">
          {node.tables.slice(0, 3).map((item) => (
            <span key={item} className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-200">
              {item}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function SystemDna({
  selectedId,
  onSelect,
  onBackToOverview,
}: {
  selectedId: SystemMapNodeId;
  onSelect: (id: SystemMapNodeId) => void;
  onBackToOverview: () => void;
}) {
  const [zoom, setZoom] = useState(0.82);
  const [pan, setPan] = useState({ x: -190, y: -110 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<"all" | SystemMapNodeKind>("all");
  const [flowMode, setFlowMode] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const selectedConnections = useMemo(() => {
    const ids = new Set<SystemMapNodeId>([selectedId]);
    for (const edge of systemMapEdges) {
      if (edge.from === selectedId) ids.add(edge.to);
      if (edge.to === selectedId) ids.add(edge.from);
    }
    return ids;
  }, [selectedId]);

  const visibleNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return systemMapNodes.filter((node) => {
      if (area !== "all" && node.kind !== area) return false;
      if (!q) return true;
      return [
        node.title,
        node.subtitle,
        node.explanation,
        ...node.tables,
        ...node.services,
        ...node.integrations,
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [area, query]);

  const visibleNodeIds = useMemo(() => new Set<SystemMapNodeId>(visibleNodes.map((node) => node.id)), [visibleNodes]);

  const fitToScreen = useCallback(() => {
    setZoom(0.82);
    setPan({ x: -190, y: -110 });
  }, []);

  const centerNode = useCallback((id: SystemMapNodeId) => {
    const pos = DNA_POSITIONS[id];
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return;
    setPan({ x: box.width / 2 - pos.x * zoom, y: box.height / 2 - pos.y * zoom });
  }, [zoom]);

  const handleSearch = useCallback(() => {
    const first = visibleNodes[0];
    if (!first) return;
    onSelect(first.id);
    centerNode(first.id);
  }, [centerNode, onSelect, visibleNodes]);

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const next = Math.min(1.8, Math.max(0.45, zoom + (event.deltaY > 0 ? -0.08 : 0.08)));
    setZoom(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    setPan({ x: dragStart.panX + event.clientX - dragStart.x, y: dragStart.panY + event.clientY - dragStart.y });
  };

  const onPointerUp = () => setDragStart(null);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onBackToOverview}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tilbage til System-overblik
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSearch();
              }}
              placeholder="Søg fx Demo lead, Konfigurator eller crm_leads"
              className="h-9 w-[360px] max-w-[70vw] rounded-full border border-white/10 bg-white/10 pl-9 pr-3 text-sm font-semibold text-white placeholder:text-slate-400"
            />
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={handleSearch}>Find</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "module", "integration"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setArea(filter)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-black",
                area === filter ? "border-white bg-white text-slate-950" : "border-white/15 text-slate-300 hover:bg-white/10",
              ].join(" ")}
            >
              {filter === "all" ? "Alle" : filter === "module" ? "Moduler" : "Integrationer"}
            </button>
          ))}
          <Button type="button" variant="secondary" size="icon" onClick={() => setZoom((value) => Math.max(0.45, value - 0.1))} aria-label="Zoom ud">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" size="icon" onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))} aria-label="Zoom ind">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={fitToScreen}>
            <Maximize2 className="mr-2 h-4 w-4" />
            Fit
          </Button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className="relative h-[720px] cursor-grab overflow-hidden bg-[radial-gradient(circle_at_center,_#1e293b_0,_#020617_72%)] active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: DNA_WORLD.width,
            height: DNA_WORLD.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${DNA_WORLD.width} ${DNA_WORLD.height}`} aria-hidden="true">
            <defs>
              <marker id="dna-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
              </marker>
            </defs>
            {systemMapEdges.map((edge) => {
              const from = findSystemMapNode(edge.from);
              const to = findSystemMapNode(edge.to);
              const fromPos = DNA_POSITIONS[edge.from];
              const toPos = DNA_POSITIONS[edge.to];
              const active = selectedId === edge.from || selectedId === edge.to;
              const hiddenByFilter = !visibleNodeIds.has(edge.from) || !visibleNodeIds.has(edge.to);
              const dimmed = flowMode && !active;
              return (
                <g key={`${edge.from}-${edge.to}`} opacity={hiddenByFilter ? 0.08 : dimmed ? 0.12 : active ? 0.95 : 0.38}>
                  <line
                    x1={fromPos.x}
                    y1={fromPos.y}
                    x2={toPos.x}
                    y2={toPos.y}
                    stroke={active ? colorFor(from).line : "#94a3b8"}
                    strokeWidth={active ? 4 : 2}
                    strokeLinecap="round"
                    markerEnd="url(#dna-arrowhead)"
                  />
                  {active && zoom >= 1.05 && (
                    <text
                      x={(fromPos.x + toPos.x) / 2}
                      y={(fromPos.y + toPos.y) / 2 - 10}
                      fill="#e2e8f0"
                      fontSize="18"
                      textAnchor="middle"
                      paintOrder="stroke"
                      stroke="#020617"
                      strokeWidth="5"
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {systemMapNodes.map((node) => {
            const hiddenByFilter = !visibleNodeIds.has(node.id);
            return (
              <DnaNode
                key={node.id}
                node={node}
                selected={selectedId === node.id}
                active={selectedConnections.has(node.id)}
                dimmed={hiddenByFilter || (flowMode && !selectedConnections.has(node.id))}
                zoom={zoom}
                onSelect={(id) => {
                  onSelect(id);
                  centerNode(id);
                }}
              />
            );
          })}
        </div>

        <div className="absolute bottom-4 left-4 rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs font-semibold text-slate-200 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2 text-white">
            <Compass className="h-4 w-4" />
            Zoom {Math.round(zoom * 100)}%
          </div>
          <div className="mt-1 text-slate-400">Træk kortet med mus/touch. Scroll for zoom.</div>
        </div>

        <div className="absolute bottom-4 right-4 h-32 w-48 rounded-2xl border border-white/10 bg-slate-950/80 p-2 shadow-2xl backdrop-blur">
          <div className="relative h-full w-full rounded-xl border border-white/10 bg-slate-900">
            {systemMapNodes.map((node) => {
              const pos = DNA_POSITIONS[node.id];
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    onSelect(node.id);
                    centerNode(node.id);
                  }}
                  className={[
                    "absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                    selectedId === node.id ? "bg-white" : "bg-emerald-300",
                  ].join(" ")}
                  style={{ left: `${(pos.x / DNA_WORLD.width) * 100}%`, top: `${(pos.y / DNA_WORLD.height) * 100}%` }}
                  aria-label={`Gå til ${node.title}`}
                />
              );
            })}
          </div>
        </div>

        <div className="absolute right-4 top-4 flex gap-2">
          <Button type="button" variant={flowMode ? "default" : "secondary"} size="sm" onClick={() => setFlowMode((value) => !value)}>
            <Layers3 className="mr-2 h-4 w-4" />
            {flowMode ? "Vis alt" : "Følg data"}
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function BackendSystemMapPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isBackend = useMemo(() => isBackendActor(appUser), [appUser]);
  const [selectedId, setSelectedId] = useState<SystemMapNodeId>(() => {
    const node = searchParams.get("node") as SystemMapNodeId | null;
    return node && systemMapNodes.some((item) => item.id === node) ? node : "portal";
  });
  const view = searchParams.get("view") === "dna" ? "dna" : "overview";
  const selectedNode = findSystemMapNode(selectedId);

  const setView = useCallback((nextView: "overview" | "dna", nodeId = selectedId) => {
    const next = new URLSearchParams(searchParams);
    if (nextView === "dna") next.set("view", "dna");
    else next.delete("view");
    next.set("node", nodeId);
    setSearchParams(next, { replace: false });
  }, [searchParams, selectedId, setSearchParams]);

  const selectNode = useCallback((nodeId: SystemMapNodeId) => {
    setSelectedId(nodeId);
    const next = new URLSearchParams(searchParams);
    next.set("node", nodeId);
    if (view === "dna") next.set("view", "dna");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, view]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Henter...</div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!isBackend) return <Navigate to="/portal/backend" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate("/portal", { replace: true });
        }}
      />

      <main className="mx-auto w-full max-w-[1800px] flex-grow px-4 py-5 sm:px-6 lg:px-8 xl:px-10">
        <header className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50">
                <Network className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-950">Systemkort</h1>
                <p className="mt-0.5 text-sm text-slate-600">
                  Visuelt overblik over Timan Partner Portal og hvordan områder, data og integrationer hænger sammen.
                </p>
              </div>
            </div>
            <ViewTabs view={view} onChange={(nextView) => setView(nextView)} />
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_410px]">
          <div>
            {view === "overview" ? (
              <>
                <SystemOverview selectedId={selectedId} onSelect={selectNode} onExploreDna={(nodeId) => {
                  setSelectedId(nodeId);
                  setView("dna", nodeId);
                }} />
                <ConnectionsList onSelect={selectNode} />
              </>
            ) : (
              <SystemDna selectedId={selectedId} onSelect={selectNode} onBackToOverview={() => setView("overview")} />
            )}
          </div>
          <NodeDetails
            node={selectedNode}
            onClose={() => selectNode("portal")}
            onExploreDna={(nodeId) => {
              setSelectedId(nodeId);
              setView("dna", nodeId);
            }}
            view={view}
          />
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
