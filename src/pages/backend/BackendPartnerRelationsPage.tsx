/**
 * Timan Backend -> Partnernetværk.
 * Route: /portal/backend/partner-relations
 *
 * This page manages the new many-to-many partner relation model. The old
 * Machine Journal scope fields are still kept and shown for compatibility:
 * dealer_accounts.parent_account_number and service_partner_dealer_links.
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, GitBranch, Search, Trash2 } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { isBackendActor } from "@/lib/portalAccess";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useLanguage } from "@/context/LanguageContext";
import {
  DealerAccount,
  fetchDealerAccounts,
  isDealerCustomerAccount,
} from "@/lib/dealerAccountsService";
import {
  PartnerAccountRelation,
  PartnerAccountRelationType,
  listPartnerAccountRelations,
  upsertPartnerAccountRelation,
  setPartnerAccountRelationActive,
  deletePartnerAccountRelation,
  ServicePartnerLink,
  listServicePartnerLinks,
} from "@/lib/partnerRelationsService";

type AccountKind = "importer" | "dealer" | "service_partner" | "dealer_customer" | "other";

interface RelationConfig {
  value: PartnerAccountRelationType;
  sourceKind: AccountKind;
  targetKind: AccountKind;
  sourceLabel: string;
  actionLabel: string;
  targetLabel: string;
  color: string;
}

const RELATION_TYPES: RelationConfig[] = [
  {
    value: "importer_has_dealer",
    sourceKind: "importer",
    targetKind: "dealer",
    sourceLabel: "Importør",
    actionLabel: "har forhandler",
    targetLabel: "Forhandler",
    color: "border-blue-200 bg-blue-50 text-blue-800",
  },
  {
    value: "importer_has_service_partner",
    sourceKind: "importer",
    targetKind: "service_partner",
    sourceLabel: "Importør",
    actionLabel: "har servicepartner",
    targetLabel: "Servicepartner",
    color: "border-cyan-200 bg-cyan-50 text-cyan-800",
  },
  {
    value: "importer_has_dealer_customer",
    sourceKind: "importer",
    targetKind: "dealer_customer",
    sourceLabel: "Importør",
    actionLabel: "har forhandlerkunde",
    targetLabel: "Forhandlerkunde",
    color: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    value: "dealer_has_service_partner",
    sourceKind: "dealer",
    targetKind: "service_partner",
    sourceLabel: "Forhandler",
    actionLabel: "har servicepartner",
    targetLabel: "Servicepartner",
    color: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  {
    value: "dealer_has_dealer_customer",
    sourceKind: "dealer",
    targetKind: "dealer_customer",
    sourceLabel: "Forhandler",
    actionLabel: "har forhandlerkunde",
    targetLabel: "Forhandlerkunde",
    color: "border-lime-200 bg-lime-50 text-lime-800",
  },
  {
    value: "service_partner_has_dealer_customer",
    sourceKind: "service_partner",
    targetKind: "dealer_customer",
    sourceLabel: "Servicepartner",
    actionLabel: "har forhandlerkunde",
    targetLabel: "Forhandlerkunde",
    color: "border-purple-200 bg-purple-50 text-purple-800",
  },
  {
    value: "service_partner_has_dealer",
    sourceKind: "service_partner",
    targetKind: "dealer",
    sourceLabel: "Servicepartner",
    actionLabel: "har forhandler",
    targetLabel: "Forhandler",
    color: "border-slate-200 bg-slate-50 text-slate-700",
  },
];

const PRIMARY_RELATION_TYPES = RELATION_TYPES.filter((r) => r.value !== "service_partner_has_dealer");

const normalize = (value: string | null | undefined) =>
  (value ?? "").toLowerCase().replace(/[\s_-]+/g, "");

function accountKind(account: DealerAccount): AccountKind {
  const combined = normalize([account.customer_type, account.customer_type_label, account.dealer_type].filter(Boolean).join("|"));
  if (isDealerCustomerAccount(account) || combined.includes("forhandlerkunde") || combined.includes("dealercustomer")) return "dealer_customer";
  if (combined.includes("servicepartner") || combined.includes("service_partner")) return "service_partner";
  if (combined.includes("import")) return "importer";
  if (combined.includes("forhandler") || combined.includes("dealer")) return "dealer";
  return "other";
}

function accountLabel(account?: DealerAccount) {
  if (!account) return "Ukendt konto";
  return `${account.account_number} · ${account.company_name}`;
}

function kindLabel(kind: AccountKind) {
  switch (kind) {
    case "importer": return "Importør";
    case "dealer": return "Forhandler";
    case "service_partner": return "Servicepartner";
    case "dealer_customer": return "Forhandlerkunde";
    default: return "Andet";
  }
}

function relationLabel(type: PartnerAccountRelationType) {
  return RELATION_TYPES.find((r) => r.value === type)?.actionLabel ?? type;
}

export default function BackendPartnerRelationsPage() {
  const { appUser, logout } = useAppUser();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const isBackend = isBackendActor(appUser);

  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [relations, setRelations] = useState<PartnerAccountRelation[]>([]);
  const [legacySpLinks, setLegacySpLinks] = useState<ServicePartnerLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [relationType, setRelationType] = useState<PartnerAccountRelationType>("importer_has_dealer");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [active, setActive] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  async function refresh() {
    setLoading(true);
    const [dealerResult, networkRelations, serviceLinks] = await Promise.all([
      fetchDealerAccounts({ includeDeleted: false }),
      listPartnerAccountRelations(),
      listServicePartnerLinks(),
    ]);
    setDealers(dealerResult.rows);
    setRelations(networkRelations);
    setLegacySpLinks(serviceLinks);
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  const dealersById = useMemo(() => {
    const map = new Map<string, DealerAccount>();
    for (const dealer of dealers) map.set(dealer.id, dealer);
    return map;
  }, [dealers]);

  const selectedRelation = RELATION_TYPES.find((r) => r.value === relationType) ?? RELATION_TYPES[0];
  const sourceOptions = useMemo(
    () => dealers.filter((dealer) => accountKind(dealer) === selectedRelation.sourceKind),
    [dealers, selectedRelation.sourceKind],
  );
  const targetOptions = useMemo(
    () => dealers.filter((dealer) => accountKind(dealer) === selectedRelation.targetKind && dealer.id !== sourceId),
    [dealers, selectedRelation.targetKind, sourceId],
  );

  const filteredRelations = useMemo(() => {
    const q = normalize(search);
    if (!q) return relations;
    return relations.filter((relation) => {
      const source = dealersById.get(relation.source_account_id);
      const target = dealersById.get(relation.target_account_id);
      const haystack = normalize([
        accountLabel(source),
        kindLabel(source ? accountKind(source) : "other"),
        relationLabel(relation.relation_type),
        accountLabel(target),
        kindLabel(target ? accountKind(target) : "other"),
      ].join("|"));
      return haystack.includes(q);
    });
  }, [dealersById, relations, search]);

  const groupedRelations = useMemo(() => {
    const map = new Map<string, PartnerAccountRelation[]>();
    for (const relation of filteredRelations) {
      const rows = map.get(relation.source_account_id) ?? [];
      rows.push(relation);
      map.set(relation.source_account_id, rows);
    }
    return [...map.entries()]
      .map(([sourceAccountId, rows]) => ({ sourceAccountId, rows }))
      .sort((a, b) => accountLabel(dealersById.get(a.sourceAccountId)).localeCompare(accountLabel(dealersById.get(b.sourceAccountId)), "da"));
  }, [dealersById, filteredRelations]);

  const legacyImporterRelations = useMemo(() => {
    return dealers
      .filter((dealer) => dealer.parent_account_number)
      .map((child) => ({
        child,
        parent: dealers.find((dealer) => dealer.account_number === child.parent_account_number),
      }))
      .filter((row) => row.parent && accountKind(row.parent) === "importer");
  }, [dealers]);

  if (!appUser) return <Navigate to="/" replace />;
  if (!isBackend) return <Navigate to="/portal" replace />;

  async function onSaveRelation() {
    setMessage(null);
    if (!sourceId || !targetId) {
      setMessage("Vælg både Fra og Til.");
      return;
    }
    if (sourceId === targetId) {
      setMessage("En virksomhed kan ikke kobles til sig selv.");
      return;
    }
    setBusy(true);
    const result = await upsertPartnerAccountRelation(sourceId, targetId, relationType, active);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error ?? "Kunne ikke gemme relationen.");
      return;
    }
    setMessage("Relation gemt.");
    setTargetId("");
    await refresh();
  }

  async function onToggleRelation(id: string, nextActive: boolean) {
    const result = await setPartnerAccountRelationActive(id, nextActive);
    if (!result.ok) {
      alert(result.error ?? "Kunne ikke opdatere relationen.");
      return;
    }
    await refresh();
  }

  async function onDeleteRelation(id: string) {
    if (!confirm("Slet denne partnerrelation?")) return;
    const result = await deletePartnerAccountRelation(id);
    if (!result.ok) {
      alert(result.error ?? "Kunne ikke slette relationen.");
      return;
    }
    await refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHeader
        user={appUser}
        language={language}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }}
      />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Partnernetværk</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Definer relationer mellem importører, forhandlere, servicepartnere og forhandlerkunder.
              Eksisterende scope-data bevares, så adgang ikke ændres af denne side alene.
            </p>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            {relations.length} netværksrelationer
          </div>
        </div>

        {loading && <div className="mt-6 text-sm text-slate-500">Indlæser...</div>}

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Ny relation</h2>
              <p className="mt-1 text-sm text-slate-600">
                Vælg relationstype, derefter virksomheden der ejer relationen og virksomheden der kobles på.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr_1.1fr_auto_auto] lg:items-end">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Relation</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={relationType}
                onChange={(event) => {
                  setRelationType(event.target.value as PartnerAccountRelationType);
                  setSourceId("");
                  setTargetId("");
                }}
              >
                {PRIMARY_RELATION_TYPES.map((relation) => (
                  <option key={relation.value} value={relation.value}>
                    {relation.sourceLabel} - {relation.actionLabel} - {relation.targetLabel}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">Fra: {selectedRelation.sourceLabel}</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
              >
                <option value="">- vælg -</option>
                {sourceOptions.map((dealer) => (
                  <option key={dealer.id} value={dealer.id}>{accountLabel(dealer)}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">Til: {selectedRelation.targetLabel}</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
              >
                <option value="">- vælg -</option>
                {targetOptions.map((dealer) => (
                  <option key={dealer.id} value={dealer.id}>{accountLabel(dealer)}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
              <span>Aktiv</span>
            </label>

            <button
              type="button"
              onClick={onSaveRelation}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Gemmer..." : "Gem relation"}
            </button>
          </div>

          {message && <div className="mt-3 text-sm text-slate-700">{message}</div>}
        </section>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Eksisterende partnernetværk</h2>
              <p className="text-sm text-slate-600">Fold en virksomhed ud for at se dens relationer.</p>
            </div>
            <label className="relative block md:w-96">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Søg på virksomhed, konto eller relation..."
              />
            </label>
          </div>

          <div className="mt-4 space-y-3">
            {groupedRelations.map(({ sourceAccountId, rows }) => {
              const source = dealersById.get(sourceAccountId);
              const open = expandedSources[sourceAccountId] ?? true;
              const counts = rows.reduce<Record<string, number>>((acc, relation) => {
                const label = relationLabel(relation.relation_type);
                acc[label] = (acc[label] ?? 0) + 1;
                return acc;
              }, {});
              return (
                <div key={sourceAccountId} className="rounded-lg border border-slate-200">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    onClick={() => setExpandedSources((current) => ({ ...current, [sourceAccountId]: !open }))}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {open ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                      <span className="truncate font-semibold text-slate-900">{accountLabel(source)}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {kindLabel(source ? accountKind(source) : "other")}
                      </span>
                    </span>
                    <span className="flex flex-wrap justify-end gap-2 text-xs">
                      {Object.entries(counts).map(([label, count]) => (
                        <span key={label} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                          {label}: {count}
                        </span>
                      ))}
                    </span>
                  </button>

                  {open && (
                    <div className="divide-y divide-slate-100 border-t border-slate-100">
                      {rows.map((relation) => {
                        const target = dealersById.get(relation.target_account_id);
                        const config = RELATION_TYPES.find((item) => item.value === relation.relation_type);
                        return (
                          <div key={relation.id} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_1.2fr_auto_auto] md:items-center">
                            <div>
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${config?.color ?? "border-slate-200 bg-slate-50 text-slate-700"}`}>
                                {relationLabel(relation.relation_type)}
                              </span>
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">{accountLabel(target)}</div>
                              <div className="text-xs text-slate-500">{kindLabel(target ? accountKind(target) : "other")}</div>
                            </div>
                            <label className="flex items-center gap-2 text-slate-700">
                              <input
                                type="checkbox"
                                checked={relation.active}
                                onChange={(event) => onToggleRelation(relation.id, event.target.checked)}
                              />
                              Aktiv
                            </label>
                            <button
                              type="button"
                              onClick={() => onDeleteRelation(relation.id)}
                              className="inline-flex items-center justify-start gap-1 text-rose-600 hover:underline md:justify-end"
                            >
                              <Trash2 className="h-4 w-4" />
                              Slet
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && groupedRelations.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                Ingen relationer matcher soegningen.
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h2 className="font-semibold">Bagudkompatibilitet</h2>
          <p className="mt-1">
            Eksisterende scope-felter er ikke fjernet: <code>parent_account_number</code> bruges stadig til importør/barn,
            og <code>service_partner_dealer_links</code> bruges stadig til eksisterende servicepartner-scope.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-white/70 p-3">
              <div className="font-semibold">Importør-relationer fra parent_account_number</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{legacyImporterRelations.length}</div>
            </div>
            <div className="rounded-lg bg-white/70 p-3">
              <div className="font-semibold">Servicepartner til forhandler fra gammel tabel</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{legacySpLinks.length}</div>
            </div>
          </div>
        </section>
      </main>

      <PortalFooter language={language} />
    </div>
  );
}
