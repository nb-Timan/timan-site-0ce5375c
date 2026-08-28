import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Building2, ExternalLink, Loader2, MapPin, RotateCcw, ShieldCheck, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import PortalFooter from "@/components/portal/PortalFooter";
import PortalHeader from "@/components/portal/PortalHeader";
import GeocodeDealersPanel from "@/components/backend/GeocodeDealersPanel";
import GeocodeWarrantyCustomersPanel from "@/components/backend/GeocodeWarrantyCustomersPanel";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { isBackendActor } from "@/lib/portalAccess";
import { supabase } from "@/lib/supabase";

type GeocodeSummary = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  total: number | null;
  withCoords: number | null;
  missingCoords: number | null;
  failed: number | null;
  lastGeocodedAt: string | null;
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

export default function BackendGeocodingPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const isBackend = useMemo(() => isBackendActor(appUser), [appUser]);
  const [summaries, setSummaries] = useState<GeocodeSummary[]>(EMPTY_SUMMARIES);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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
        {
          ...EMPTY_SUMMARIES[0],
          total: dealerTotal,
          withCoords: dealerWithCoords,
          missingCoords: dealerMissingCoords,
          failed: dealerFailed,
          lastGeocodedAt: dealerLastGeocodedAt,
        },
        {
          ...EMPTY_SUMMARIES[1],
          total: warrantyTotal,
          withCoords: warrantyWithCoords,
          missingCoords: warrantyMissingCoords,
          failed: warrantyFailed,
          lastGeocodedAt: warrantyLastGeocodedAt,
        },
      ]);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "Kunne ikke hente geocoding-status.");
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    if (appUser && isBackend) void loadSummaries();
  }, [appUser, isBackend, loadSummaries]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
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
            <GeocodeSummaryCard key={summary.id} summary={summary} loading={loadingSummary} />
          ))}
        </section>

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
          <GeocodeDealersPanel onCompleted={loadSummaries} />
          <GeocodeWarrantyCustomersPanel onCompleted={loadSummaries} />
        </section>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

function GeocodeSummaryCard({ summary, loading }: { summary: GeocodeSummary; loading: boolean }) {
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
        <Metric label="Mangler koordinater" value={summary.missingCoords} loading={loading} />
        <Metric label="Tidligere fejlet" value={summary.failed} loading={loading} tone="warning" />
      </dl>
      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Senest geokodet: <span className="font-bold text-slate-800">{formatDate(summary.lastGeocodedAt)}</span>
      </div>
    </article>
  );
}

function Metric({ label, value, loading, tone = "default" }: { label: string; value: number | null; loading: boolean; tone?: "default" | "warning" }) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${tone === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-black ${tone === "warning" ? "text-amber-800" : "text-slate-900"}`}>
        {loading && value === null ? "…" : value ?? "—"}
      </dd>
    </div>
  );
}
