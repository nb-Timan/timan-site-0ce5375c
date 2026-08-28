import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import PortalFooter from "@/components/portal/PortalFooter";
import PortalHeader from "@/components/portal/PortalHeader";
import GeocodeDealersPanel from "@/components/backend/GeocodeDealersPanel";
import GeocodeWarrantyCustomersPanel from "@/components/backend/GeocodeWarrantyCustomersPanel";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { appendAuditEntry } from "@/lib/audit-log-store";
import { isBackendActor } from "@/lib/portalAccess";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type GeocodeScope = "dealer_accounts" | "warranty_customers";
type GeocodeListKind = "missing" | "failed";

type GeocodeSummary = {
  id: GeocodeScope;
  title: string;
  description: string;
  icon: LucideIcon;
  total: number | null;
  withCoords: number | null;
  missingCoords: number | null;
  failed: number | null;
  lastGeocodedAt: string | null;
};

type WorkItem = {
  id: string;
  scope: GeocodeScope;
  labelId: string;
  name: string;
  typeLabel: string | null;
  dealerLabel: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  status: string | null;
  attemptedAt: string | null;
  error: string | null;
};

type EditableAddress = {
  address: string;
  postalCode: string;
  city: string;
  country: string;
};

type GeocodeSummaryResult = {
  found?: number;
  geocoded?: number;
  skipped?: number;
  failed?: number;
  error?: string;
};

const EMPTY_SUMMARIES: GeocodeSummary[] = [
  {
    id: "dealer_accounts",
    title: "Partnerkonti",
    description: "Forhandlere, importører, servicepartnere og forhandlerkunder i dealer_accounts.",
    icon: Building2,
    total: null,
    withCoords: null,
    missingCoords: null,
    failed: null,
    lastGeocodedAt: null,
  },
  {
    id: "warranty_customers",
    title: "Garantikunder",
    description: "Kundeadresser på garantiregistreringer, som bruges til maskinlaget på kortet.",
    icon: Wrench,
    total: null,
    withCoords: null,
    missingCoords: null,
    failed: null,
    lastGeocodedAt: null,
  },
];

const LIST_LABEL: Record<GeocodeListKind, string> = {
  missing: "Mangler koordinater",
  failed: "Tidligere fejlet",
};

async function getCount(table: string, build?: (query: any) => any) {
  let query = (supabase as any).from(table).select("id", { count: "exact", head: true });
  if (build) query = build(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function getLatestDate(table: string, column: string) {
  const { data, error } = await (supabase as any)
    .from(table)
    .select(column)
    .not(column, "is", null)
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.[column] as string | null | undefined) ?? null;
}

function formatDate(value: string | null) {
  if (!value) return "Ikke kørt";
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function friendlyGeocodeError(status: string | null, error: string | null, item?: Pick<WorkItem, "address" | "postalCode" | "city" | "country">) {
  if (!item?.country?.trim()) return "Mangler land";
  if (!item?.postalCode?.trim() && !item?.city?.trim()) return "Mangler postnummer/by";
  if (!item?.address?.trim()) return "Mangler adresse";
  if (status === "pending" || !status) return "Afventer geocoding";
  if (status === "skipped") return "Adresse mangler data";
  if (status === "not_found") return "Adresse ikke fundet";
  if (status === "error") return "Tidligere geocoding fejlede";
  if (/multiple|ambiguous|flere/i.test(error ?? "")) return "Flere mulige adresser";
  return error || "Ukendt geocoding-fejl";
}

function buildAddress(item: WorkItem): EditableAddress {
  return {
    address: item.address ?? "",
    postalCode: item.postalCode ?? "",
    city: item.city ?? "",
    country: item.country ?? "",
  };
}

function addressChanged(item: WorkItem, form: EditableAddress) {
  return (
    (item.address ?? "") !== form.address ||
    (item.postalCode ?? "") !== form.postalCode ||
    (item.city ?? "") !== form.city ||
    (item.country ?? "") !== form.country
  );
}

async function fetchWorkItems(scope: GeocodeScope, kind: GeocodeListKind): Promise<WorkItem[]> {
  if (scope === "dealer_accounts") {
    let query = supabase
      .from("dealer_accounts")
      .select("id,account_number,company_name,customer_type_label,dealer_type,address,address_line_1,postal_code,city,country,geocoding_status,geocoding_error,geocoded_at")
      .or("is_deleted.is.null,is_deleted.eq.false")
      .order("company_name", { ascending: true })
      .limit(250);
    query = kind === "missing"
      ? query.or("latitude.is.null,longitude.is.null")
      : query.in("geocoding_status", ["error", "not_found"]);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: String(row.id),
      scope,
      labelId: row.account_number ? `#${row.account_number}` : String(row.id).slice(0, 8),
      name: row.company_name || "Ukendt partnerkonto",
      typeLabel: row.customer_type_label || row.dealer_type || null,
      dealerLabel: null,
      address: row.address_line_1 || row.address || null,
      postalCode: row.postal_code ?? null,
      city: row.city ?? null,
      country: row.country ?? null,
      status: row.geocoding_status ?? null,
      attemptedAt: row.geocoded_at ?? null,
      error: row.geocoding_error ?? null,
    }));
  }

  let query = supabase
    .from("warranty_registrations")
    .select("id,certificate_number,sharepoint_form_id,customer_name,dealer_name_snapshot,dealer_account_number,customer_address,customer_postal_code,customer_city,customer_country,customer_geocoding_status,customer_geocoding_error,customer_geocoded_at")
    .eq("is_active_in_source", true)
    .order("customer_geocoded_at", { ascending: true, nullsFirst: true })
    .limit(250);
  query = kind === "missing"
    ? query.or("customer_latitude.is.null,customer_longitude.is.null")
    : query.in("customer_geocoding_status", ["error", "not_found"]);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    scope,
    labelId: row.certificate_number || (row.sharepoint_form_id ? `SP-${row.sharepoint_form_id}` : String(row.id).slice(0, 8)),
    name: row.customer_name || "Ukendt garantikunde",
    typeLabel: "Garantikunde",
    dealerLabel: [row.dealer_name_snapshot, row.dealer_account_number ? `#${row.dealer_account_number}` : null].filter(Boolean).join(" · ") || null,
    address: row.customer_address ?? null,
    postalCode: row.customer_postal_code ?? null,
    city: row.customer_city ?? null,
    country: row.customer_country ?? null,
    status: row.customer_geocoding_status ?? null,
    attemptedAt: row.customer_geocoded_at ?? null,
    error: row.customer_geocoding_error ?? null,
  }));
}

export default function BackendGeocodingPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const isBackend = useMemo(() => isBackendActor(appUser), [appUser]);
  const [summaries, setSummaries] = useState<GeocodeSummary[]>(EMPTY_SUMMARIES);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [workScope, setWorkScope] = useState<GeocodeScope | null>(null);
  const [workKind, setWorkKind] = useState<GeocodeListKind>("missing");
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [workLoading, setWorkLoading] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditableAddress>({ address: "", postalCode: "", city: "", country: "" });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  const loadSummaries = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const [
        dealerTotal,
        dealerWithCoords,
        dealerMissingCoords,
        dealerFailed,
        dealerLastGeocodedAt,
        warrantyTotal,
        warrantyWithCoords,
        warrantyMissingCoords,
        warrantyFailed,
        warrantyLastGeocodedAt,
      ] = await Promise.all([
        getCount("dealer_accounts"),
        getCount("dealer_accounts", (query) => query.not("latitude", "is", null).not("longitude", "is", null)),
        getCount("dealer_accounts", (query) => query.or("latitude.is.null,longitude.is.null")),
        getCount("dealer_accounts", (query) => query.in("geocoding_status", ["error", "not_found"])),
        getLatestDate("dealer_accounts", "geocoded_at"),
        getCount("warranty_registrations"),
        getCount("warranty_registrations", (query) => query.not("customer_latitude", "is", null).not("customer_longitude", "is", null)),
        getCount("warranty_registrations", (query) => query.or("customer_latitude.is.null,customer_longitude.is.null")),
        getCount("warranty_registrations", (query) => query.in("customer_geocoding_status", ["error", "not_found"])),
        getLatestDate("warranty_registrations", "customer_geocoded_at"),
      ]);

      setSummaries([
        { ...EMPTY_SUMMARIES[0], total: dealerTotal, withCoords: dealerWithCoords, missingCoords: dealerMissingCoords, failed: dealerFailed, lastGeocodedAt: dealerLastGeocodedAt },
        { ...EMPTY_SUMMARIES[1], total: warrantyTotal, withCoords: warrantyWithCoords, missingCoords: warrantyMissingCoords, failed: warrantyFailed, lastGeocodedAt: warrantyLastGeocodedAt },
      ]);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "Kunne ikke hente geocoding-status.");
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const loadWorkItems = useCallback(async (scope = workScope, kind = workKind) => {
    if (!scope) return;
    setWorkLoading(true);
    setWorkError(null);
    setSelected({});
    try {
      setWorkItems(await fetchWorkItems(scope, kind));
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Kunne ikke hente adresser.");
      setWorkItems([]);
    } finally {
      setWorkLoading(false);
    }
  }, [workKind, workScope]);

  useEffect(() => {
    if (appUser && isBackend) void loadSummaries();
  }, [appUser, isBackend, loadSummaries]);

  async function openWorkView(scope: GeocodeScope, kind: GeocodeListKind) {
    setWorkScope(scope);
    setWorkKind(kind);
    setEditingId(null);
    setWorkLoading(true);
    setWorkError(null);
    setSelected({});
    try {
      setWorkItems(await fetchWorkItems(scope, kind));
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Kunne ikke hente adresser.");
      setWorkItems([]);
    } finally {
      setWorkLoading(false);
    }
  }

  function startEdit(item: WorkItem) {
    setEditingId(item.id);
    setEditForm(buildAddress(item));
  }

  async function geocodeOne(item: WorkItem): Promise<GeocodeSummaryResult> {
    const functionName = item.scope === "dealer_accounts" ? "geocode-dealers" : "geocode-warranty-customers";
    const body = item.scope === "dealer_accounts"
      ? { dealerId: item.id, limit: 1, retryFailed: true }
      : { warrantyId: item.id, limit: 1, retryFailed: true };
    const { data, error } = await supabase.functions.invoke(functionName, { body });
    if (error) throw new Error(error.message);
    const result = (data ?? {}) as GeocodeSummaryResult;
    if (result.error) throw new Error(result.error);
    return result;
  }

  async function saveAddressAndGeocode(item: WorkItem) {
    setSavingId(item.id);
    setWorkError(null);
    try {
      const before = buildAddress(item);
      const changed = addressChanged(item, editForm);
      if (changed) {
        if (item.scope === "dealer_accounts") {
          const { error } = await supabase
            .from("dealer_accounts")
            .update({
              address_line_1: editForm.address || null,
              address: editForm.address || null,
              postal_code: editForm.postalCode || null,
              city: editForm.city || null,
              country: editForm.country || null,
              latitude: null,
              longitude: null,
              geocoded_at: null,
              geocoding_status: "pending",
              geocoding_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.rpc("warranty_update_registration", {
            p_id: item.id,
            p_changes: {
              customer_address: editForm.address || null,
              customer_postal_code: editForm.postalCode || null,
              customer_city: editForm.city || null,
              customer_country: editForm.country || null,
            },
          });
          if (error) throw error;
        }
        appendAuditEntry({
          action: "update",
          module: "Geocoding",
          record_type: item.scope,
          record_id: item.id,
          record_label: `${item.labelId} · ${item.name}`,
          old_value: before,
          new_value: editForm,
          actor_email: appUser?.email ?? null,
          actor_name: appUser?.name ?? appUser?.email ?? null,
          actor_role: appUser?.portal_role ?? null,
          status: "success",
        });
      }

      const result = await geocodeOne({ ...item, ...editForm });
      if ((result.geocoded ?? 0) === 0) {
        throw new Error("Adressen blev gemt, men der blev ikke fundet koordinater.");
      }
      setEditingId(null);
      await Promise.all([loadSummaries(), loadWorkItems()]);
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Kunne ikke gemme og geocode igen.");
    } finally {
      setSavingId(null);
    }
  }

  async function geocodeSelected() {
    const rows = workItems.filter((item) => selected[item.id]);
    if (rows.length === 0) return;
    setBatchBusy(true);
    setWorkError(null);
    try {
      for (const row of rows) {
        await geocodeOne(row);
      }
      await Promise.all([loadSummaries(), loadWorkItems()]);
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Kunne ikke geocode valgte igen.");
    } finally {
      setBatchBusy(false);
    }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const activeSummary = summaries.find((summary) => summary.id === workScope);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">...</span></div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!isBackend) return <Navigate to="/portal/backend" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }}
      />

      <main className="mx-auto flex w-full max-w-[1700px] flex-grow flex-col px-4 py-10 sm:px-6 lg:px-8 xl:px-12">
        <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
              <MapPin className="h-6 w-6 text-emerald-700" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Geocoding</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Geokod adresser til brug på Partnerkort, garantikort og andre geografiske visninger.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadSummaries()}
              disabled={loadingSummary}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Genindlæs status
            </button>
            <Link
              to="/portal/backend/data"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 text-sm font-bold text-emerald-800 shadow-sm hover:bg-emerald-50"
            >
              <ExternalLink className="h-4 w-4" />
              Data & Integrationer
            </Link>
          </div>
        </header>

        {summaryError && (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-900">
            Kunne ikke hente samlet status: {summaryError}
          </div>
        )}

        <section className="mb-8 grid gap-4 lg:grid-cols-2">
          {summaries.map((summary) => (
            <GeocodeSummaryCard
              key={summary.id}
              summary={summary}
              loading={loadingSummary}
              onOpen={openWorkView}
            />
          ))}
        </section>

        {workScope && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {activeSummary?.title ?? "Adresser"} · {LIST_LABEL[workKind]}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Ret kun adressefelter her. Match, relationer, serienumre og maskindata ændres ikke.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadWorkItems()}
                  disabled={workLoading}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {workLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Genindlæs liste
                </button>
                <button
                  type="button"
                  onClick={() => void geocodeSelected()}
                  disabled={batchBusy || selectedCount === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {batchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                  Geocode valgte igen ({selectedCount})
                </button>
              </div>
            </div>

            {workError && (
              <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
                {workError}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-[1250px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={workItems.length > 0 && selectedCount === workItems.length}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelected(Object.fromEntries(workItems.map((item) => [item.id, checked])));
                        }}
                      />
                    </th>
                    <th className="px-3 py-3">ID</th>
                    <th className="px-3 py-3">Navn</th>
                    <th className="px-3 py-3">Type / forhandler</th>
                    <th className="px-3 py-3">Adresse</th>
                    <th className="px-3 py-3">Postnr.</th>
                    <th className="px-3 py-3">By</th>
                    <th className="px-3 py-3">Land</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Seneste forsøg</th>
                    <th className="px-3 py-3">Fejlårsag</th>
                    <th className="px-4 py-3 text-right">Handling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workLoading ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                        Henter adresser...
                      </td>
                    </tr>
                  ) : workItems.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                        Ingen adresser i denne liste.
                      </td>
                    </tr>
                  ) : workItems.map((item) => {
                    const isEditing = editingId === item.id;
                    const saving = savingId === item.id;
                    const friendly = friendlyGeocodeError(item.status, item.error, item);
                    return (
                      <tr key={item.id} className={isEditing ? "bg-emerald-50/40" : "bg-white"}>
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={!!selected[item.id]}
                            onChange={(event) => setSelected((prev) => ({ ...prev, [item.id]: event.target.checked }))}
                          />
                        </td>
                        <td className="px-3 py-3 align-top font-mono text-xs text-slate-600">{item.labelId}</td>
                        <td className="max-w-[230px] px-3 py-3 align-top font-bold text-slate-900">{item.name}</td>
                        <td className="max-w-[220px] px-3 py-3 align-top text-slate-700">
                          <div>{item.typeLabel ?? "-"}</div>
                          {item.dealerLabel && <div className="mt-1 text-xs text-slate-500">{item.dealerLabel}</div>}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {isEditing ? (
                            <input className="h-9 w-64 rounded-lg border border-slate-200 px-3 text-sm" value={editForm.address} onChange={(e) => setEditForm((v) => ({ ...v, address: e.target.value }))} />
                          ) : item.address || "-"}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {isEditing ? (
                            <input className="h-9 w-28 rounded-lg border border-slate-200 px-3 text-sm" value={editForm.postalCode} onChange={(e) => setEditForm((v) => ({ ...v, postalCode: e.target.value }))} />
                          ) : item.postalCode || "-"}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {isEditing ? (
                            <input className="h-9 w-36 rounded-lg border border-slate-200 px-3 text-sm" value={editForm.city} onChange={(e) => setEditForm((v) => ({ ...v, city: e.target.value }))} />
                          ) : item.city || "-"}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {isEditing ? (
                            <input className="h-9 w-32 rounded-lg border border-slate-200 px-3 text-sm" value={editForm.country} onChange={(e) => setEditForm((v) => ({ ...v, country: e.target.value }))} />
                          ) : item.country || "-"}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-bold",
                            item.status === "error" || item.status === "not_found"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-800",
                          )}>
                            {item.status ?? "pending"}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-top text-xs text-slate-600">{formatDate(item.attemptedAt)}</td>
                        <td className="max-w-[240px] px-3 py-3 align-top">
                          <div className="font-semibold text-slate-800">{friendly}</div>
                          {item.error && <div className="mt-1 line-clamp-2 text-xs text-slate-500">{item.error}</div>}
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          {isEditing ? (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                disabled={saving}
                                className="h-9 rounded-full border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                              >
                                Annuller
                              </button>
                              <button
                                type="button"
                                onClick={() => void saveAddressAndGeocode(item)}
                                disabled={saving}
                                className="inline-flex h-9 items-center gap-2 rounded-full bg-slate-950 px-3 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                              >
                                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                Gem og geocode igen
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Redigér adresse
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <ShieldCheck className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Samlet geocoding-arbejdsområde</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Denne side kører ikke geocoding automatisk ved load. Vælg selv batch-handlingen nedenfor, så eksisterende koordinater genbruges, og kun manglende eller fejlede adresser behandles.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">Forhandlere</span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">Importører</span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">Servicepartnere</span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">Forhandlerkunder</span>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">Garantiregistreringer</span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <GeocodeDealersPanel onCompleted={() => { void loadSummaries(); if (workScope) void loadWorkItems(); }} />
          <GeocodeWarrantyCustomersPanel onCompleted={() => { void loadSummaries(); if (workScope) void loadWorkItems(); }} />
        </section>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

function GeocodeSummaryCard({
  summary,
  loading,
  onOpen,
}: {
  summary: GeocodeSummary;
  loading: boolean;
  onOpen: (scope: GeocodeScope, kind: GeocodeListKind) => void;
}) {
  const Icon = summary.icon;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
          <Icon className="h-5 w-5 text-emerald-700" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{summary.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{summary.description}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Total" value={summary.total} loading={loading} />
        <Metric label="Med koordinater" value={summary.withCoords} loading={loading} />
        <Metric label="Mangler koordinater" value={summary.missingCoords} loading={loading} onClick={() => onOpen(summary.id, "missing")} />
        <Metric label="Tidligere fejlet" value={summary.failed} loading={loading} tone="warning" onClick={() => onOpen(summary.id, "failed")} />
      </dl>
      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Senest geokodet: <span className="font-bold text-slate-800">{formatDate(summary.lastGeocodedAt)}</span>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  loading,
  tone = "default",
  onClick,
}: {
  label: string;
  value: number | null;
  loading: boolean;
  tone?: "default" | "warning";
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  const className = cn(
    "rounded-xl border px-3 py-3 text-left",
    tone === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50",
    clickable && "cursor-pointer transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-200",
  );
  const content = (
    <>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={cn("mt-1 text-2xl font-black", tone === "warning" ? "text-amber-800" : "text-slate-900")}>
        {loading && value === null ? "..." : value ?? "-"}
      </dd>
    </>
  );
  if (!clickable) return <div className={className}>{content}</div>;
  return (
    <button type="button" className={className} onClick={onClick} disabled={loading}>
      {content}
      <span className="mt-1 block text-[11px] font-bold text-emerald-700">Åbn liste</span>
    </button>
  );
}
