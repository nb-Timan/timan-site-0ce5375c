/**
 * Timan Backend -> Systemkort
 * Route: /portal/backend/system-map
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Focus,
  Layers3,
  Maximize2,
  Network,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import PortalFooter from "@/components/portal/PortalFooter";
import PortalHeader from "@/components/portal/PortalHeader";
import { Button } from "@/components/ui/button";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { isBackendActor } from "@/lib/portalAccess";
import { clampSystemDnaZoom, screenToWorld, zoomToScreenPoint, zoomToWorldPoint } from "@/lib/systemDnaViewport";
import {
  findSystemMapNode,
  getFeaturedDataFlow,
  getSystemDnaFocusIds,
  getSystemDnaNodePosition,
  getSystemDnaZoomForNode,
  getSystemDnaZoomStage,
  getSystemMapChildren,
  getVisibleSystemDnaNodes,
  SYSTEM_DNA_ZOOM_LEVELS,
  systemOverviewLines,
  systemDnaEdges,
  systemDnaNodes,
  type SystemMapArea,
  type SystemMapEdge,
  type SystemMapNode,
  type SystemMapNodeId,
} from "@/lib/systemDataflowMap";

const COLOR_CLASSES: Record<
  string,
  { soft: string; icon: string; selected: string; line: string; dna: string; badge: string }
> = {
  amber: {
    soft: "border-amber-200 bg-amber-50 text-amber-950",
    icon: "bg-amber-100 text-amber-700",
    selected: "ring-2 ring-amber-400",
    line: "#d97706",
    dna: "border-amber-300/60 bg-amber-300/15 text-amber-50",
    badge: "bg-amber-50 text-amber-800 border-amber-200",
  },
  blue: {
    soft: "border-blue-200 bg-blue-50 text-blue-950",
    icon: "bg-blue-100 text-blue-700",
    selected: "ring-2 ring-blue-400",
    line: "#2563eb",
    dna: "border-blue-300/60 bg-blue-400/15 text-blue-50",
    badge: "bg-blue-50 text-blue-800 border-blue-200",
  },
  cyan: {
    soft: "border-cyan-200 bg-cyan-50 text-cyan-950",
    icon: "bg-cyan-100 text-cyan-700",
    selected: "ring-2 ring-cyan-400",
    line: "#0891b2",
    dna: "border-cyan-300/60 bg-cyan-300/15 text-cyan-50",
    badge: "bg-cyan-50 text-cyan-800 border-cyan-200",
  },
  emerald: {
    soft: "border-emerald-200 bg-emerald-50 text-emerald-950",
    icon: "bg-emerald-100 text-emerald-700",
    selected: "ring-2 ring-emerald-400",
    line: "#047857",
    dna: "border-emerald-300/60 bg-emerald-300/15 text-emerald-50",
    badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  orange: {
    soft: "border-orange-200 bg-orange-50 text-orange-950",
    icon: "bg-orange-100 text-orange-700",
    selected: "ring-2 ring-orange-400",
    line: "#ea580c",
    dna: "border-orange-300/60 bg-orange-300/15 text-orange-50",
    badge: "bg-orange-50 text-orange-800 border-orange-200",
  },
  purple: {
    soft: "border-purple-200 bg-purple-50 text-purple-950",
    icon: "bg-purple-100 text-purple-700",
    selected: "ring-2 ring-purple-400",
    line: "#9333ea",
    dna: "border-purple-300/60 bg-purple-300/15 text-purple-50",
    badge: "bg-purple-50 text-purple-800 border-purple-200",
  },
  rose: {
    soft: "border-rose-200 bg-rose-50 text-rose-950",
    icon: "bg-rose-100 text-rose-700",
    selected: "ring-2 ring-rose-400",
    line: "#e11d48",
    dna: "border-rose-300/60 bg-rose-300/15 text-rose-50",
    badge: "bg-rose-50 text-rose-800 border-rose-200",
  },
  sky: {
    soft: "border-sky-200 bg-sky-50 text-sky-950",
    icon: "bg-sky-100 text-sky-700",
    selected: "ring-2 ring-sky-400",
    line: "#0284c7",
    dna: "border-sky-300/60 bg-sky-300/15 text-sky-50",
    badge: "bg-sky-50 text-sky-800 border-sky-200",
  },
  slate: {
    soft: "border-slate-200 bg-white text-slate-950",
    icon: "bg-slate-100 text-slate-700",
    selected: "ring-2 ring-slate-400",
    line: "#475569",
    dna: "border-slate-300/55 bg-slate-300/10 text-slate-50",
    badge: "bg-slate-50 text-slate-800 border-slate-200",
  },
  violet: {
    soft: "border-violet-200 bg-violet-50 text-violet-950",
    icon: "bg-violet-100 text-violet-700",
    selected: "ring-2 ring-violet-400",
    line: "#7c3aed",
    dna: "border-violet-300/60 bg-violet-300/15 text-violet-50",
    badge: "bg-violet-50 text-violet-800 border-violet-200",
  },
};

const OVERVIEW_NODE_IDS = ["crm", "sales", "marketing", "dealer_data", "service", "messe", "import", "system_admin"];
const INPUT_NODE_IDS = ["sharepoint", "microsoft_365", "erp", "supabase"];
const OUTPUT_NODE_IDS = ["email", "documents", "external_apis", "portal_analytics"];
const DNA_WORLD = { width: 2820, height: 2240 };

const OVERVIEW_POSITIONS: Record<string, { x: number; y: number }> = {
  sharepoint: { x: 8.5, y: 19 },
  microsoft_365: { x: 8.5, y: 33 },
  erp: { x: 8.5, y: 47 },
  supabase: { x: 8.5, y: 61 },
  crm: { x: 29, y: 27 },
  sales: { x: 29, y: 48 },
  service: { x: 29, y: 69 },
  marketing: { x: 50, y: 18 },
  system_admin: { x: 50, y: 72 },
  dealer_data: { x: 71, y: 27 },
  import: { x: 71, y: 48 },
  messe: { x: 71, y: 69 },
  email: { x: 91.5, y: 19 },
  documents: { x: 91.5, y: 33 },
  external_apis: { x: 91.5, y: 47 },
  portal_analytics: { x: 91.5, y: 61 },
  portal: { x: 50, y: 46 },
};

const AREA_FOCUS_NODE_IDS: Record<SystemMapArea, SystemMapNodeId> = {
  crm: "crm",
  sales: "sales",
  marketing: "marketing",
  dealer_data: "dealer_data",
  service: "service",
  messe: "messe",
  import: "import",
  system: "system_admin",
};

const DNA_EDGE_STYLES: Record<
  NonNullable<SystemMapEdge["kind"]>,
  { label: string; strokeWidth: number; dash?: string; color?: string }
> = {
  data: { label: "Primært dataflow", strokeWidth: 2.4 },
  sync: { label: "Sync/import", strokeWidth: 2.4, dash: "10 7", color: "#38bdf8" },
  conversion: { label: "Konvertering", strokeWidth: 3, dash: "8 7", color: "#a855f7" },
  permission: { label: "Adgang/scope", strokeWidth: 2, dash: "4 8", color: "#f59e0b" },
  dependency: { label: "Afhængighed", strokeWidth: 1.6, dash: "5 8", color: "#94a3b8" },
  development: { label: "Udvikling/deploy", strokeWidth: 2.3, dash: "9 6", color: "#fb923c" },
  navigation: { label: "Indeholder/struktur", strokeWidth: 1.35, dash: "8 10", color: "#64748b" },
};

function edgeKey(edge: SystemMapEdge) {
  return `${edge.from}->${edge.to}::${edge.kind ?? "data"}::${edge.label}`;
}

function edgeKindLabel(edge: SystemMapEdge) {
  return DNA_EDGE_STYLES[edge.kind ?? "data"].label;
}

function DnaLegend() {
  const items: Array<{ kind: NonNullable<SystemMapEdge["kind"]>; text: string }> = [
    { kind: "data", text: "Fast linje = primært dataflow" },
    { kind: "sync", text: "Stiplet = sync/import" },
    { kind: "conversion", text: "Lilla stiplet = konvertering" },
    { kind: "permission", text: "Orange stiplet = adgang/scope" },
    { kind: "development", text: "Udvikling/deploy" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-300">
      <span className="text-white">Forklaring</span>
      {items.map((item) => {
        const style = DNA_EDGE_STYLES[item.kind];
        return (
          <span key={item.kind} className="inline-flex items-center gap-1.5">
            <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true">
              <line
                x1="1"
                y1="4"
                x2="23"
                y2="4"
                stroke={style.color ?? "#94a3b8"}
                strokeWidth="2"
                strokeDasharray={style.dash}
                strokeLinecap="round"
              />
            </svg>
            {item.text}
          </span>
        );
      })}
      <span>Hover viser retning</span>
      <span>Følg data viser hele kæden</span>
    </div>
  );
}

function colorFor(node: SystemMapNode) {
  return COLOR_CLASSES[node.color] ?? COLOR_CLASSES.slate;
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

function DetailModal({ node, onClose, onDna }: { node: SystemMapNode | null; onClose: () => void; onDna?: (id: SystemMapNodeId) => void }) {
  if (!node) return null;
  const Icon = node.icon;
  const colors = colorFor(node);
  const children = getSystemMapChildren(node.id);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <section className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className={["flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", colors.icon].join(" ")}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <span className={["inline-flex rounded-full border px-2.5 py-1 text-xs font-black uppercase", colors.badge].join(" ")}>
                {node.kind}
              </span>
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

        {onDna && (
          <Button type="button" onClick={() => onDna(node.id)} className="mt-4 w-full bg-slate-950 text-white hover:bg-slate-800">
            Udforsk i System DNA
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <DetailList title="Underfunktioner" items={children.map((child) => child.title)} />
          <DetailList title="Routes" items={node.routes} />
          <DetailList title="Tabeller / data" items={node.tables} />
          <DetailList title="Services" items={node.services} />
          <DetailList title="Modtager data fra" items={node.receivesFrom} />
          <DetailList title="Sender data til" items={node.sendsTo} />
          <DetailList title="Integrationer" items={node.integrations} />
        </div>
      </section>
    </div>
  );
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

function OverviewPill({
  node,
  selected,
  onSelect,
  compact = false,
}: {
  node: SystemMapNode;
  selected: boolean;
  onSelect: (id: SystemMapNodeId) => void;
  compact?: boolean;
}) {
  const Icon = node.icon;
  const colors = colorFor(node);
  const position = OVERVIEW_POSITIONS[node.id] ?? node.position;
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className={[
        "absolute flex -translate-x-1/2 -translate-y-1/2 items-start gap-3 rounded-2xl border text-left shadow-sm transition hover:-translate-y-[52%] hover:shadow-md",
        compact ? "w-[180px] px-3 py-3" : "w-[235px] px-4 py-4",
        colors.soft,
        selected ? colors.selected : "",
      ].join(" ")}
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
    >
      <span className={["flex shrink-0 items-center justify-center rounded-xl", compact ? "h-8 w-8" : "h-10 w-10", colors.icon].join(" ")}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className={["block truncate font-black", compact ? "text-xs" : "text-sm"].join(" ")}>{node.title}</span>
        <span className="block truncate text-xs font-semibold text-slate-500">{node.subtitle}</span>
        {compact && (
          <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
            Registreret
          </span>
        )}
        {!compact && (
          <ul className="mt-2 space-y-0.5 text-xs font-semibold text-slate-600">
            {getSystemMapChildren(node.id).slice(0, 4).map((child) => (
              <li key={child.id} className="truncate">- {child.title}</li>
            ))}
          </ul>
        )}
      </span>
    </button>
  );
}

function SystemOverview({ selectedId, onSelect }: { selectedId: SystemMapNodeId; onSelect: (id: SystemMapNodeId) => void }) {
  return (
    <section className="relative h-[720px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#eef2ff_0,_#ffffff_38%,_#f8fafc_100%)]" />

      <div className="absolute left-5 top-5 z-10 rounded-2xl border border-slate-200 bg-white/92 p-3 shadow-sm">
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">Datakilder</h2>
        <p className="mt-1 max-w-[150px] text-xs font-semibold text-slate-500">Kilder der fodrer portalen.</p>
      </div>
      <div className="absolute right-5 top-5 z-10 rounded-2xl border border-slate-200 bg-white/92 p-3 text-right shadow-sm">
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">Output & integrationer</h2>
        <p className="mt-1 max-w-[170px] text-xs font-semibold text-slate-500">Det portalen sender videre.</p>
      </div>

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id="overview-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
          </marker>
        </defs>
        {systemOverviewLines.map((edge) => {
          const fromNode = findSystemMapNode(edge.from);
          const toNode = findSystemMapNode(edge.to);
          const from = OVERVIEW_POSITIONS[edge.from] ?? fromNode.position;
          const to = OVERVIEW_POSITIONS[edge.to] ?? toNode.position;
          const colorNode = findSystemMapNode(edge.colorFrom ?? edge.from);
          const active = selectedId === edge.from || selectedId === edge.to || selectedId === "portal";
          return (
            <line
              key={`${edge.from}-${edge.to}-${edge.colorFrom ?? "base"}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={active ? colorFor(colorNode).line : "#cbd5e1"}
              strokeWidth={active ? 0.36 : 0.18}
              strokeDasharray={edge.dashed ? "1.1 1.1" : undefined}
              strokeLinecap="round"
              markerEnd="url(#overview-arrow)"
              opacity={active ? 0.72 : 0.16}
            />
          );
        })}
      </svg>

      <button
        type="button"
        onClick={() => onSelect("portal")}
        className={[
          "absolute left-1/2 top-[46%] flex h-[230px] w-[230px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-indigo-200 bg-white text-center shadow-[0_0_0_18px_rgba(99,102,241,0.08),0_20px_60px_rgba(15,23,42,0.16)] transition hover:shadow-[0_0_0_22px_rgba(99,102,241,0.12),0_24px_70px_rgba(15,23,42,0.2)]",
          selectedId === "portal" ? "ring-2 ring-emerald-400" : "",
        ].join(" ")}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <Network className="h-6 w-6" />
        </span>
        <span className="mt-4 text-lg font-black text-slate-950">Timan Partner Portal</span>
        <span className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">Central platform</span>
        <span className="mt-2 text-xs font-semibold text-emerald-700">Supabase</span>
      </button>

      {INPUT_NODE_IDS.map((id) => {
        const node = findSystemMapNode(id);
        return <OverviewPill key={node.id} node={node} selected={selectedId === node.id} onSelect={onSelect} compact />;
      })}
      {OVERVIEW_NODE_IDS.map((id) => {
        const node = findSystemMapNode(id);
        return <OverviewPill key={node.id} node={node} selected={selectedId === node.id} onSelect={onSelect} />;
      })}
      {OUTPUT_NODE_IDS.map((id) => {
        const node = findSystemMapNode(id);
        return <OverviewPill key={`${node.id}-output`} node={node} selected={selectedId === node.id} onSelect={onSelect} compact />;
      })}
    </section>
  );
}

function DnaNode({
  node,
  selected,
  active,
  dimmed,
  zoom,
  position,
  onSelect,
  onHover,
}: {
  node: SystemMapNode;
  selected: boolean;
  active: boolean;
  dimmed: boolean;
  zoom: number;
  position: { x: number; y: number };
  onSelect: (id: SystemMapNodeId) => void;
  onHover: (id: SystemMapNodeId | null) => void;
}) {
  const Icon = node.icon;
  const colors = colorFor(node);
  const children = getSystemMapChildren(node.id);
  const showSubtitle = zoom >= 0.68;
  const showChildren = zoom >= 0.92 && children.length > 0;
  const showFeatureDetails = zoom >= 1.18;
  const showTechnicalDetails = zoom >= 1.42;
  const isCompact = node.kind === "data" || node.kind === "technical";
  const isProcessNode = node.kind === "process" || node.kind === "tool";
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className={[
        "absolute -translate-x-1/2 -translate-y-1/2 select-none rounded-2xl border text-left shadow-2xl backdrop-blur transition",
        isCompact ? "w-[190px] p-2.5" : node.kind === "portal" ? "w-[270px] p-4" : "w-[230px] p-3",
        isProcessNode ? "border-dashed" : "",
        colors.dna,
        selected ? "ring-2 ring-white" : "",
        active ? "opacity-100" : dimmed ? "opacity-20" : "opacity-90",
      ].join(" ")}
      style={{ left: position.x, top: position.y }}
      draggable={false}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/12 text-white">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black">{node.title}</span>
          {showSubtitle && <span className="block truncate text-xs font-semibold text-slate-300">{node.subtitle}</span>}
        </span>
      </div>
      {showChildren && (
        <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
          {children.slice(0, 4).map((child) => (
            <span key={child.id} className="block truncate text-[10px] font-bold text-slate-200">
              {child.title}
            </span>
          ))}
          {children.length > 4 && <span className="block text-[10px] font-bold text-slate-400">+{children.length - 4} flere</span>}
        </div>
      )}
      {showFeatureDetails && node.routes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {node.routes.slice(0, 2).map((item) => (
            <span key={item} className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-200">
              {item}
            </span>
          ))}
        </div>
      )}
      {showTechnicalDetails && (
        <div className="mt-2 flex flex-wrap gap-1">
          {node.tables.slice(0, 2).map((item) => (
            <span key={item} className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-200">
              {item}
            </span>
          ))}
          {node.services.slice(0, 1).map((item) => (
            <span key={item} className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-0.5 text-[10px] font-bold text-slate-300">
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
  const [zoom, setZoom] = useState(0.52);
  const [pan, setPan] = useState({ x: -520, y: -360 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [touchStart, setTouchStart] = useState<{
    distance: number;
    zoom: number;
    worldPoint: { x: number; y: number };
  } | null>(null);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<"all" | SystemMapArea>("all");
  const [flowMode, setFlowMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<SystemMapNodeId | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const didInitialFitRef = useRef(false);
  const selectedFlow = useMemo(() => getFeaturedDataFlow(selectedId), [selectedId]);
  const selectedFlowEdges = useMemo(() => {
    const keys = new Set<string>();
    for (let index = 0; index < selectedFlow.length - 1; index += 1) {
      keys.add(`${selectedFlow[index]}->${selectedFlow[index + 1]}`);
    }
    return keys;
  }, [selectedFlow]);
  const zoomStage = useMemo(() => getSystemDnaZoomStage(zoom), [zoom]);
  const zoomLevelCounts = useMemo(
    () =>
      SYSTEM_DNA_ZOOM_LEVELS.map((level) => ({
        ...level,
        count: getVisibleSystemDnaNodes(level.zoom, "all", "").length,
      })),
    [],
  );

  const selectedConnections = useMemo(() => {
    const focusRoot = area === "all" ? selectedId : AREA_FOCUS_NODE_IDS[area];
    const ids = flowMode ? new Set<SystemMapNodeId>(selectedFlow) : getSystemDnaFocusIds(focusRoot);
    if (flowMode) return ids;

    for (const edge of systemDnaEdges) {
      if (ids.has(edge.from)) ids.add(edge.to);
      if (ids.has(edge.to)) ids.add(edge.from);
    }
    if (hoveredNodeId) {
      ids.add(hoveredNodeId);
      for (const edge of systemDnaEdges) {
        if (edge.from === hoveredNodeId) ids.add(edge.to);
        if (edge.to === hoveredNodeId) ids.add(edge.from);
      }
    }
    return ids;
  }, [area, flowMode, hoveredNodeId, selectedFlow, selectedId]);

  const visibleNodes = useMemo(() => {
    return getVisibleSystemDnaNodes(zoom, area, query);
  }, [area, query, zoom]);

  const visibleNodeIds = useMemo(() => new Set<SystemMapNodeId>(visibleNodes.map((node) => node.id)), [visibleNodes]);

  const centerNode = useCallback((id: SystemMapNodeId, nextZoom = zoom) => {
    const node = findSystemMapNode(id);
    const position = getSystemDnaNodePosition(node, nextZoom);
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return;
    setPan({ x: box.width / 2 - position.x * nextZoom, y: box.height / 2 - position.y * nextZoom });
  }, [zoom]);

  const fitToScreen = useCallback(() => {
    setZoom(0.52);
    setPan({ x: -520, y: -360 });
  }, []);

  const drillIntoNode = useCallback((id: SystemMapNodeId) => {
    const node = findSystemMapNode(id);
    const nextZoom = getSystemDnaZoomForNode(node, zoom);
    setZoom(nextZoom);
    onSelect(id);
    window.setTimeout(() => centerNode(id, nextZoom), 0);
  }, [centerNode, onSelect, zoom]);

  useEffect(() => {
    if (didInitialFitRef.current) return;
    didInitialFitRef.current = true;
    window.setTimeout(() => {
      if (selectedId === "portal") {
        fitToScreen();
        return;
      }
      const nextZoom = getSystemDnaZoomForNode(findSystemMapNode(selectedId), zoom);
      setZoom(nextZoom);
      centerNode(selectedId, nextZoom);
    }, 0);
  }, [centerNode, fitToScreen, selectedId, zoom]);

  const handleSearch = useCallback(() => {
    const q = query.trim().toLowerCase();
    const hit = systemDnaNodes.find((node) =>
      [
        node.title,
        node.subtitle,
        node.explanation,
        ...node.tables,
        ...node.services,
        ...node.routes,
        ...node.integrations,
      ].some((value) => value.toLowerCase().includes(q))
    );
    if (!hit) return;
    const nextZoom = getSystemDnaZoomForNode(hit, zoom);
    setZoom(nextZoom);
    onSelect(hit.id);
    window.setTimeout(() => centerNode(hit.id, nextZoom), 0);
  }, [centerNode, onSelect, query, zoom]);

  const handleAreaFilter = useCallback((filter: "all" | SystemMapArea) => {
    setArea(filter);
    if (filter === "all") return;
    const focusNodeId = AREA_FOCUS_NODE_IDS[filter];
    const nextZoom = Math.max(zoom, SYSTEM_DNA_ZOOM_LEVELS[1].zoom);
    setZoom(nextZoom);
    window.setTimeout(() => centerNode(focusNodeId, nextZoom), 0);
  }, [centerNode, zoom]);

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - box.left, y: event.clientY - box.top };
    const nextZoom = clampSystemDnaZoom(zoom * Math.exp(-event.deltaY * 0.0012));
    setPan(zoomToScreenPoint({ pan, oldZoom: zoom, newZoom: nextZoom, point }));
    setZoom(nextZoom);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    setPan({ x: dragStart.panX + event.clientX - dragStart.x, y: dragStart.panY + event.clientY - dragStart.y });
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const [first, second] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    const point = {
      x: (first.clientX + second.clientX) / 2 - box.left,
      y: (first.clientY + second.clientY) / 2 - box.top,
    };
    setTouchStart({ distance, zoom, worldPoint: screenToWorld(point, pan, zoom) });
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!touchStart || event.touches.length !== 2) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const [first, second] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    const nextZoom = clampSystemDnaZoom(touchStart.zoom * (distance / touchStart.distance));
    const point = {
      x: (first.clientX + second.clientX) / 2 - box.left,
      y: (first.clientY + second.clientY) / 2 - box.top,
    };
    setPan(zoomToWorldPoint({ worldPoint: touchStart.worldPoint, newZoom: nextZoom, screenPoint: point }));
    setZoom(nextZoom);
  };

  useEffect(() => {
    if (!dragStart) return;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragStart]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  const toggleFullscreen = () => {
    setFullscreen((value) => !value);
    window.setTimeout(() => centerNode(selectedId, zoom), 0);
  };

  return (
    <section
      className={[
        "overflow-hidden border border-slate-800 bg-slate-950 shadow-sm",
        fullscreen ? "fixed inset-0 z-50 rounded-none" : "rounded-3xl",
      ].join(" ")}
    >
      <div
        className={[
          "flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-3",
          fullscreen ? "absolute left-0 right-0 top-0 z-20 bg-slate-950/90 backdrop-blur" : "",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onBackToOverview}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tilbage
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSearch();
              }}
              placeholder="Søg fx Demo Lead, Konfigurator eller crm_leads"
              className="h-9 w-[380px] max-w-[70vw] rounded-full border border-white/10 bg-white/10 pl-9 pr-3 text-sm font-semibold text-white placeholder:text-slate-400"
            />
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={handleSearch}>Find</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {zoomLevelCounts.map((level) => (
            <button
              key={level.id}
              type="button"
              onClick={() => {
                setZoom(level.zoom);
                window.setTimeout(() => centerNode(selectedId, level.zoom), 0);
              }}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-black transition",
                zoomStage.id === level.id ? "border-emerald-300 bg-emerald-300 text-slate-950" : "border-white/15 text-slate-300 hover:bg-white/10",
              ].join(" ")}
              title={`${level.description} ${level.count} noder.`}
            >
              {level.title}
              <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{level.count}</span>
            </button>
          ))}
          {(["all", "crm", "sales", "marketing", "dealer_data", "service", "messe", "import", "system"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => handleAreaFilter(filter)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-black",
                area === filter ? "border-white bg-white text-slate-950" : "border-white/15 text-slate-300 hover:bg-white/10",
              ].join(" ")}
            >
              {filter === "all" ? "Alle" : filter === "dealer_data" ? "Partnerdata" : filter}
            </button>
          ))}
          <Button type="button" variant="secondary" size="icon" onClick={() => setZoom((value) => Math.max(0.38, value - 0.1))} aria-label="Zoom ud">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" size="icon" onClick={() => setZoom((value) => Math.min(1.85, value + 0.1))} aria-label="Zoom ind">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={fitToScreen}>
            <Focus className="mr-2 h-4 w-4" />
            Fit
          </Button>
          <Button type="button" variant={flowMode ? "default" : "secondary"} size="sm" onClick={() => setFlowMode((value) => !value)}>
            <Layers3 className="mr-2 h-4 w-4" />
            {flowMode ? `Vis alt (${selectedFlow.length})` : "Følg data"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={toggleFullscreen}>
            {fullscreen ? <X className="mr-2 h-4 w-4" /> : <Maximize2 className="mr-2 h-4 w-4" />}
            {fullscreen ? "Exit fullscreen" : "Fullscreen"}
          </Button>
        </div>
        <DnaLegend />
      </div>

      <div
        ref={canvasRef}
        className={[
          "relative select-none cursor-grab touch-none overflow-hidden bg-[radial-gradient(circle_at_center,_#1e293b_0,_#020617_72%)] active:cursor-grabbing",
          fullscreen ? "h-screen min-h-0" : "h-[calc(100vh-245px)] min-h-[720px]",
        ].join(" ")}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragStart(null)}
        onPointerCancel={() => setDragStart(null)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => setTouchStart(null)}
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
            {systemDnaEdges.map((edge) => {
              if ((edge.minZoom ?? 0.35) > zoom) return null;
              const from = findSystemMapNode(edge.from);
              const to = findSystemMapNode(edge.to);
              const fromPosition = getSystemDnaNodePosition(from, zoom);
              const toPosition = getSystemDnaNodePosition(to, zoom);
              const key = edgeKey(edge);
              const edgePairKey = `${edge.from}->${edge.to}`;
              const reverseEdgePairKey = `${edge.to}->${edge.from}`;
              const flowActive =
                flowMode &&
                (selectedFlowEdges.has(edgePairKey) || (edge.direction === "bidirectional" && selectedFlowEdges.has(reverseEdgePairKey)));
              const hoverActive = hoveredEdgeId === key || hoveredNodeId === edge.from || hoveredNodeId === edge.to;
              const focusActive = selectedConnections.has(edge.from) && selectedConnections.has(edge.to);
              const active = flowActive || hoverActive || (!flowMode && focusActive);
              const hiddenByFilter = !visibleNodeIds.has(edge.from) || !visibleNodeIds.has(edge.to);
              const style = DNA_EDGE_STYLES[edge.kind ?? "data"];
              const stroke = active ? style.color ?? colorFor(from).line : style.color ?? "#94a3b8";
              const midX = (fromPosition.x + toPosition.x) / 2;
              const midY = (fromPosition.y + toPosition.y) / 2;
              const labelFontSize = Math.max(9, Math.min(15, 14 / zoom));
              const labelStrokeWidth = Math.max(2.5, Math.min(5, 4 / zoom));
              const labelOffset = Math.max(8, 12 / zoom);
              return (
                <g
                  key={key}
                  opacity={active ? 0.98 : flowMode ? 0.06 : hiddenByFilter ? 0.08 : 0.22}
                  onMouseEnter={() => setHoveredEdgeId(key)}
                  onMouseLeave={() => setHoveredEdgeId(null)}
                >
                  <line
                    x1={fromPosition.x}
                    y1={fromPosition.y}
                    x2={toPosition.x}
                    y2={toPosition.y}
                    stroke="transparent"
                    strokeWidth="24"
                    strokeLinecap="round"
                  />
                  <line
                    x1={fromPosition.x}
                    y1={fromPosition.y}
                    x2={toPosition.x}
                    y2={toPosition.y}
                    stroke={stroke}
                    strokeWidth={active ? style.strokeWidth + 1.5 : style.strokeWidth}
                    strokeDasharray={style.dash}
                    strokeLinecap="round"
                  />
                  {active && zoom >= 1.12 && edge.kind !== "navigation" && (
                    <text
                      x={midX}
                      y={midY - labelOffset}
                      fill="#e2e8f0"
                      fontSize={labelFontSize}
                      textAnchor="middle"
                      paintOrder="stroke"
                      stroke="#020617"
                      strokeWidth={labelStrokeWidth}
                    >
                      {edge.label}
                    </text>
                  )}
                  {hoveredEdgeId === key && (
                    <g transform={`translate(${midX - 130} ${midY + 18})`} pointerEvents="none">
                      <rect width="260" height="66" rx="16" fill="#020617" stroke="#475569" strokeWidth="1.5" opacity="0.96" />
                      <text x="14" y="24" fill="#f8fafc" fontSize="15" fontWeight="800">
                        {from.title} {edge.direction === "bidirectional" ? "<->" : "->"} {to.title}
                      </text>
                      <text x="14" y="48" fill="#cbd5e1" fontSize="13" fontWeight="700">
                        Type: {edgeKindLabel(edge)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {systemDnaNodes.map((node) => {
            const hiddenByFilter = !visibleNodeIds.has(node.id);
            if (node.minZoom > zoom && node.id !== selectedId) return null;
            const position = getSystemDnaNodePosition(node, zoom);
            return (
              <DnaNode
                key={node.id}
                node={node}
                selected={selectedId === node.id}
                active={selectedConnections.has(node.id)}
                dimmed={(hiddenByFilter && !selectedConnections.has(node.id)) || (flowMode && !selectedConnections.has(node.id))}
                zoom={zoom}
                position={position}
                onSelect={drillIntoNode}
                onHover={setHoveredNodeId}
              />
            );
          })}
        </div>

        <div className="absolute bottom-4 left-4 rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs font-semibold text-slate-200 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2 text-white">
            <Compass className="h-4 w-4" />
            {zoomStage.title} · Zoom {Math.round(zoom * 100)}%
          </div>
          <div className="mt-1 text-slate-400">{visibleNodes.length} synlige noder. Træk med mus/touch. Scroll eller pinch for zoom.</div>
        </div>

        <div className="absolute bottom-4 right-4 h-36 w-56 rounded-2xl border border-white/10 bg-slate-950/80 p-2 shadow-2xl backdrop-blur">
          <div className="relative h-full w-full rounded-xl border border-white/10 bg-slate-900">
            {systemDnaNodes.filter((node) => node.minZoom <= 0.75).map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => drillIntoNode(node.id)}
                className={[
                  "absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                  selectedId === node.id ? "bg-white" : "bg-emerald-300",
                ].join(" ")}
                style={{ left: `${(node.dnaPosition.x / DNA_WORLD.width) * 100}%`, top: `${(node.dnaPosition.y / DNA_WORLD.height) * 100}%` }}
                aria-label={`Gå til ${node.title}`}
              />
            ))}
          </div>
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
    const node = searchParams.get("node");
    return node && systemDnaNodes.some((item) => item.id === node) ? node : "portal";
  });
  const [detailNodeId, setDetailNodeId] = useState<SystemMapNodeId | null>(null);
  const view = searchParams.get("view") === "dna" ? "dna" : "overview";
  const detailNode = detailNodeId ? findSystemMapNode(detailNodeId) : null;

  const setView = useCallback((nextView: "overview" | "dna", nodeId = selectedId) => {
    const next = new URLSearchParams(searchParams);
    if (nextView === "dna") next.set("view", "dna");
    else next.delete("view");
    next.set("node", nodeId);
    setSearchParams(next, { replace: false });
  }, [searchParams, selectedId, setSearchParams]);

  const selectNode = useCallback((nodeId: SystemMapNodeId) => {
    setSelectedId(nodeId);
    setDetailNodeId(nodeId);
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

      <main className="mx-auto w-full max-w-[1900px] flex-grow px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50">
                <Network className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-950">Systemkort</h1>
                <p className="mt-0.5 text-sm text-slate-600">
                  System-overblik er det rolige verdenskort. System DNA er det dybe interaktive kort.
                </p>
              </div>
            </div>
            <ViewTabs view={view} onChange={(nextView) => setView(nextView)} />
          </div>
        </header>

        {view === "overview" ? (
          <SystemOverview selectedId={selectedId} onSelect={selectNode} />
        ) : (
          <SystemDna selectedId={selectedId} onSelect={selectNode} onBackToOverview={() => setView("overview")} />
        )}
      </main>

      <DetailModal
        node={detailNode}
        onClose={() => setDetailNodeId(null)}
        onDna={view === "overview" ? (nodeId) => {
          setDetailNodeId(null);
          setSelectedId(nodeId);
          setView("dna", nodeId);
        } : undefined}
      />

      <PortalFooter language={lang} />
    </div>
  );
}
