/**
 * Timan Backend -> System- og dataflowkort
 * Route: /portal/backend/system-map
 *
 * First version is an overview map based on existing routes, services, tables
 * and integrations in the codebase. No live monitoring or database writes.
 */
import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRightLeft, Info, Network, X } from "lucide-react";
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
  { badge: string; node: string; icon: string; selected: string; line: string }
> = {
  amber: {
    badge: "bg-amber-50 text-amber-800 border-amber-200",
    node: "border-amber-200 bg-amber-50/80 hover:bg-amber-50",
    icon: "bg-amber-100 text-amber-700",
    selected: "ring-2 ring-amber-400",
    line: "#d97706",
  },
  blue: {
    badge: "bg-blue-50 text-blue-800 border-blue-200",
    node: "border-blue-200 bg-blue-50/80 hover:bg-blue-50",
    icon: "bg-blue-100 text-blue-700",
    selected: "ring-2 ring-blue-400",
    line: "#2563eb",
  },
  cyan: {
    badge: "bg-cyan-50 text-cyan-800 border-cyan-200",
    node: "border-cyan-200 bg-cyan-50/80 hover:bg-cyan-50",
    icon: "bg-cyan-100 text-cyan-700",
    selected: "ring-2 ring-cyan-400",
    line: "#0891b2",
  },
  emerald: {
    badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
    node: "border-emerald-200 bg-emerald-50/80 hover:bg-emerald-50",
    icon: "bg-emerald-100 text-emerald-700",
    selected: "ring-2 ring-emerald-400",
    line: "#047857",
  },
  indigo: {
    badge: "bg-indigo-50 text-indigo-800 border-indigo-200",
    node: "border-indigo-200 bg-indigo-50/80 hover:bg-indigo-50",
    icon: "bg-indigo-100 text-indigo-700",
    selected: "ring-2 ring-indigo-400",
    line: "#4f46e5",
  },
  lime: {
    badge: "bg-lime-50 text-lime-800 border-lime-200",
    node: "border-lime-200 bg-lime-50/80 hover:bg-lime-50",
    icon: "bg-lime-100 text-lime-700",
    selected: "ring-2 ring-lime-400",
    line: "#65a30d",
  },
  orange: {
    badge: "bg-orange-50 text-orange-800 border-orange-200",
    node: "border-orange-200 bg-orange-50/80 hover:bg-orange-50",
    icon: "bg-orange-100 text-orange-700",
    selected: "ring-2 ring-orange-400",
    line: "#ea580c",
  },
  purple: {
    badge: "bg-purple-50 text-purple-800 border-purple-200",
    node: "border-purple-200 bg-purple-50/80 hover:bg-purple-50",
    icon: "bg-purple-100 text-purple-700",
    selected: "ring-2 ring-purple-400",
    line: "#9333ea",
  },
  rose: {
    badge: "bg-rose-50 text-rose-800 border-rose-200",
    node: "border-rose-200 bg-rose-50/80 hover:bg-rose-50",
    icon: "bg-rose-100 text-rose-700",
    selected: "ring-2 ring-rose-400",
    line: "#e11d48",
  },
  sky: {
    badge: "bg-sky-50 text-sky-800 border-sky-200",
    node: "border-sky-200 bg-sky-50/80 hover:bg-sky-50",
    icon: "bg-sky-100 text-sky-700",
    selected: "ring-2 ring-sky-400",
    line: "#0284c7",
  },
  slate: {
    badge: "bg-slate-50 text-slate-800 border-slate-200",
    node: "border-slate-200 bg-white hover:bg-slate-50",
    icon: "bg-slate-100 text-slate-700",
    selected: "ring-2 ring-slate-400",
    line: "#475569",
  },
  violet: {
    badge: "bg-violet-50 text-violet-800 border-violet-200",
    node: "border-violet-200 bg-violet-50/80 hover:bg-violet-50",
    icon: "bg-violet-100 text-violet-700",
    selected: "ring-2 ring-violet-400",
    line: "#7c3aed",
  },
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

function MapNode({
  node,
  selected,
  onSelect,
}: {
  node: SystemMapNode;
  selected: boolean;
  onSelect: (id: SystemMapNodeId) => void;
}) {
  const Icon = node.icon;
  const colors = colorFor(node);
  const isPortal = node.kind === "portal";
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className={[
        "absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-xl border p-3 text-left shadow-sm transition",
        "focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2",
        colors.node,
        selected ? colors.selected : "",
        isPortal ? "w-[240px] border-emerald-300 bg-white" : "w-[190px]",
      ].join(" ")}
      style={{ left: `${node.position.x}%`, top: `${node.position.y}%` }}
      aria-pressed={selected}
    >
      <span className={["flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", colors.icon].join(" ")}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-slate-950">{node.title}</span>
        <span className="block truncate text-xs font-semibold text-slate-500">{node.subtitle}</span>
      </span>
    </button>
  );
}

function SystemMapCanvas({
  selectedId,
  onSelect,
}: {
  selectedId: SystemMapNodeId;
  onSelect: (id: SystemMapNodeId) => void;
}) {
  const nodeById = useMemo(() => new Map(systemMapNodes.map((node) => [node.id, node])), []);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">System- og dataflow</h2>
          <p className="text-sm text-slate-600">Klik på et modul for at se tabeller, services, integrationer og dataretning.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">Moduler</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Integrationer</span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">Portal</span>
        </div>
      </div>

      <div className="relative h-[720px] min-w-[1120px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
            </marker>
          </defs>
          {systemMapEdges.map((edge) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return null;
            const active = selectedId === edge.from || selectedId === edge.to;
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <line
                  x1={from.position.x}
                  y1={from.position.y}
                  x2={to.position.x}
                  y2={to.position.y}
                  stroke={active ? colorFor(from).line : "#cbd5e1"}
                  strokeWidth={active ? 0.45 : 0.28}
                  strokeLinecap="round"
                  markerEnd="url(#arrowhead)"
                  opacity={active ? 0.95 : 0.65}
                />
                {active && (
                  <text
                    x={(from.position.x + to.position.x) / 2}
                    y={(from.position.y + to.position.y) / 2}
                    fill="#334155"
                    fontSize="2.2"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    paintOrder="stroke"
                    stroke="#f8fafc"
                    strokeWidth="0.8"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {systemMapNodes.map((node) => (
          <MapNode key={node.id} node={node} selected={selectedId === node.id} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function NodeDetails({
  node,
  onClose,
}: {
  node: SystemMapNode;
  onClose: () => void;
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

export default function BackendSystemMapPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const isBackend = useMemo(() => isBackendActor(appUser), [appUser]);
  const [selectedId, setSelectedId] = useState<SystemMapNodeId>("portal");
  const selectedNode = findSystemMapNode(selectedId);

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

      <main className="mx-auto w-full max-w-[1800px] flex-grow px-4 py-10 sm:px-6 lg:px-8 xl:px-12">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
              <Network className="h-6 w-6 text-emerald-700" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-950">Systemkort</h1>
              <p className="mt-1 text-sm text-slate-600">
                Overblik over moduler, datakilder og integrationer i Timan Partner Portal.
              </p>
            </div>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">
            Første version · statisk overblik
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <h2 className="text-sm font-black text-emerald-950">Bygget på eksisterende kode og data</h2>
              <p className="mt-1 text-sm leading-6 text-emerald-900">
                Kortet viser kendte relationer fra routes, services, Supabase-tabeller, RPC'er, importpaneler og dokument-/mailflows.
                Det viser ikke live-status endnu.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
          <SystemMapCanvas selectedId={selectedId} onSelect={setSelectedId} />
          <NodeDetails node={selectedNode} onClose={() => setSelectedId("portal")} />
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <ArrowRightLeft className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-black text-slate-950">Forbindelser</h2>
              <p className="text-sm text-slate-600">Samme dataflows som vises med linjer i kortet.</p>
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
                  onClick={() => setSelectedId(edge.from)}
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
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
