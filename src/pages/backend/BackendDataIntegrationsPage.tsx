/**
 * Backend → Data & Integrationer.
 *
 * Route: /portal/backend/data
 * Access: kun timan_backend (samme guard som de øvrige Backend-sider).
 *
 * Samler alle import/eksport/sync-værktøjer under faner med samme
 * "Verificér / Dry-run / Kør sync / Historik"-mønster. Genbruger
 * eksisterende paneler — ingen logik flyttes, ingen routes fjernes.
 */
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Database, Building2, FileText, Tag, BarChart3, Users as UsersIcon, History, ExternalLink, FileDown, RotateCcw, AlertTriangle, MapPin, ArchiveRestore, ShieldAlert } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import SharePointSyncPanel from "@/components/backend/SharePointSyncPanel";
import SharePointWarrantyProbeButton from "@/components/backend/SharePointWarrantyProbeButton";
import WarrantySharePointSyncPanel from "@/components/warranty/WarrantySharePointSyncPanel";
import { WarrantyDealerLinkBackfillPanel } from "@/components/warranty/WarrantyDealerLinkBackfillPanel";
import SyncSection from "@/components/backend/SyncSection";
import { useLatestDealerSyncLog, badgeFromLatest } from "@/lib/syncStatusBadge";
import { isBackendActor } from "@/lib/portalAccess";
import {
  DATA_TRACE_LOOKUP_TYPES,
  displayTraceTableName,
  executeDataTraceDeletion,
  executeDataTraceRestore,
  expectedDeleteConfirmation,
  expectedRestoreConfirmation,
  normalizeDeletionNumber,
  previewDataTraceDeletion,
  previewDataTraceRestore,
  type DataTraceDeletePreview,
  type DataTraceDeleteResult,
  type DataTraceLookupType,
  type DataTraceRestorePreview,
  type DataTraceRestoreResult,
} from "@/lib/dataTraceArchiveService";

type TabKey = "forhandlere" | "garanti" | "prislister" | "budget" | "brugere" | "historik" | "data-trace" | "crm-reset";
const VALID_TABS: TabKey[] = ["forhandlere", "garanti", "prislister", "budget", "brugere", "historik", "data-trace", "crm-reset"];

export default function BackendDataIntegrationsPage() {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isBackend = useMemo(() => isBackendActor(appUser), [appUser]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!isBackend) return <Navigate to="/portal/backend" replace />;

  const tabParam = (params.get("tab") ?? "forhandlere") as TabKey;
  const activeTab: TabKey = VALID_TABS.includes(tabParam) ? tabParam : "forhandlere";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }}
      />

      <main className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-10 flex-grow w-full">
        <header className="mb-8 flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
            <Database className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Data & Integrationer</h1>
            <p className="text-sm text-slate-600 mt-1">Samlet kontrolcenter for import, eksport og synkronisering. Alle sync-værktøjer følger samme mønster: Verificér → Dry-run → Kør sync → Historik.</p>
          </div>
        </header>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            const next = new URLSearchParams(params);
            next.set("tab", v);
            setParams(next, { replace: true });
          }}
        >
          <TabsList className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl mb-6">
            <TabsTrigger value="forhandlere" className="data-[state=active]:bg-white"><Building2 className="h-4 w-4 mr-2" />Forhandlere</TabsTrigger>
            <TabsTrigger value="garanti" className="data-[state=active]:bg-white"><FileText className="h-4 w-4 mr-2" />Garantiregistreringer</TabsTrigger>
            <TabsTrigger value="prislister" className="data-[state=active]:bg-white"><Tag className="h-4 w-4 mr-2" />Prislister</TabsTrigger>
            <TabsTrigger value="budget" className="data-[state=active]:bg-white"><BarChart3 className="h-4 w-4 mr-2" />Budget</TabsTrigger>
            <TabsTrigger value="brugere" className="data-[state=active]:bg-white"><UsersIcon className="h-4 w-4 mr-2" />Brugere</TabsTrigger>
            <TabsTrigger value="historik" className="data-[state=active]:bg-white"><History className="h-4 w-4 mr-2" />Sync Historik</TabsTrigger>
            <TabsTrigger value="data-trace" className="data-[state=active]:bg-white"><ShieldAlert className="h-4 w-4 mr-2" />Slet / gendan</TabsTrigger>
            <TabsTrigger value="crm-reset" className="data-[state=active]:bg-white"><RotateCcw className="h-4 w-4 mr-2" />CRM nulstilling</TabsTrigger>
          </TabsList>

          <TabsContent value="forhandlere"><DealerTab /></TabsContent>
          <TabsContent value="garanti"><WarrantyTab /></TabsContent>
          <TabsContent value="prislister"><PriceListsTab /></TabsContent>
          <TabsContent value="budget"><BudgetTab /></TabsContent>
          <TabsContent value="brugere"><UsersTab /></TabsContent>
          <TabsContent value="historik"><HistoryTab /></TabsContent>
          <TabsContent value="data-trace"><DataTraceArchiveTab /></TabsContent>
          <TabsContent value="crm-reset"><CrmResetTab /></TabsContent>
        </Tabs>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab content
// ──────────────────────────────────────────────────────────────────────────────

const CRM_RESET_CONFIRMATION = "NULSTIL CRM";

function DataTraceArchiveTab() {
  const [lookupType, setLookupType] = useState<DataTraceLookupType>("quote");
  const [identifier, setIdentifier] = useState("");
  const [reason, setReason] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePreview, setDeletePreview] = useState<DataTraceDeletePreview | null>(null);
  const [deleteResult, setDeleteResult] = useState<DataTraceDeleteResult | null>(null);
  const [restoreNumber, setRestoreNumber] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [restorePreview, setRestorePreview] = useState<DataTraceRestorePreview | null>(null);
  const [restoreResult, setRestoreResult] = useState<DataTraceRestoreResult | null>(null);
  const [busy, setBusy] = useState<"delete-preview" | "delete" | "restore-preview" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expectedDelete = expectedDeleteConfirmation(identifier);
  const expectedRestore = restorePreview?.confirmationText || expectedRestoreConfirmation(restoreNumber);
  const canDelete = !!deletePreview?.supported && (deletePreview.recordCount || 0) > 0 && reason.trim().length > 0 && deleteConfirmation.trim() === expectedDelete && !busy;
  const canRestore = !!restorePreview && restorePreview.status === "deleted" && restoreConfirmation.trim() === expectedRestore && !busy;

  async function loadDeletePreview() {
    setBusy("delete-preview");
    setError(null);
    setDeleteResult(null);
    setDeleteConfirmation("");
    try {
      setDeletePreview(await previewDataTraceDeletion(lookupType, identifier));
    } catch (err) {
      setDeletePreview(null);
      setError(err instanceof Error ? err.message : "Preview fejlede.");
    } finally {
      setBusy(null);
    }
  }

  async function runDelete() {
    if (!canDelete) return;
    setBusy("delete");
    setError(null);
    try {
      const result = await executeDataTraceDeletion(lookupType, identifier, reason, deleteConfirmation);
      setDeleteResult(result);
      setDeletePreview(null);
      setReason("");
      setDeleteConfirmation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sletning fejlede.");
    } finally {
      setBusy(null);
    }
  }

  async function loadRestorePreview() {
    setBusy("restore-preview");
    setError(null);
    setRestoreResult(null);
    setRestoreConfirmation("");
    try {
      setRestorePreview(await previewDataTraceRestore(restoreNumber));
    } catch (err) {
      setRestorePreview(null);
      setError(err instanceof Error ? err.message : "Gendannelses-preview fejlede.");
    } finally {
      setBusy(null);
    }
  }

  async function runRestore() {
    if (!canRestore) return;
    setBusy("restore");
    setError(null);
    try {
      const result = await executeDataTraceRestore(restoreNumber, restoreConfirmation);
      setRestoreResult(result);
      setRestorePreview(null);
      setRestoreConfirmation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gendannelse fejlede.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SyncSection
      title="Slet / gendan dataspor"
      description="Fjern et komplet dataspor fra det aktive system eller gendan en tidligere sletning via slettenummer."
    >
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 shadow-sm">
        <div className="flex gap-3">
          <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
            <ShieldAlert className="h-5 w-5 text-red-700" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">High-risk backendfunktion</h3>
            <p className="mt-1 text-sm text-slate-700">
              Preview ændrer intet. Sletning kræver begrundelse og præcis manuel bekræftelse. Arkivet ligger i et privat Supabase-schema uden almindelig portaladgang.
            </p>
          </div>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <Database className="mt-1 h-5 w-5 text-red-700" />
            <div>
              <h3 className="text-lg font-bold text-slate-900">Find data via eksisterende ID</h3>
              <p className="mt-1 text-sm text-slate-600">Søg først, gennemgå preview, og skriv derefter bekræftelsen.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <label className="block text-sm font-bold text-slate-700">
              Type
              <select value={lookupType} onChange={(event) => setLookupType(event.target.value as DataTraceLookupType)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                {DATA_TRACE_LOOKUP_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Identifier
              <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Fx O-1234" />
            </label>
          </div>

          <button type="button" onClick={loadDeletePreview} disabled={!identifier.trim() || !!busy} className="mt-4 inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            Hent preview
          </button>

          {deletePreview && (
            <div className="mt-5 space-y-4">
              {!deletePreview.supported ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{deletePreview.reason}</div>
              ) : (
                <>
                  <TracePreviewList title="Vil blive fjernet fra det aktive system" rows={deletePreview.willRemove || []} />
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <h4 className="text-sm font-bold text-emerald-900">Beholdes</h4>
                    <ul className="mt-2 space-y-1 text-sm text-emerald-900">
                      {(deletePreview.willKeep || []).map((item, index) => <li key={index}>{item.label}</li>)}
                    </ul>
                  </div>
                  <label className="block text-sm font-bold text-slate-700">
                    Begrundelse *
                    <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Fx testdata efter test af ordreflow" />
                  </label>
                  <label className="block text-sm font-bold text-red-900">
                    Skriv {expectedDelete}
                    <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold" />
                  </label>
                  <button type="button" onClick={runDelete} disabled={!canDelete} className="inline-flex items-center rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:bg-slate-300">
                    Slet dataspor
                  </button>
                </>
              )}
            </div>
          )}

          {deleteResult && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-black">Sletning gennemført</p>
              <p>Datasporret er fjernet fra det aktive system.</p>
              <p className="mt-2 text-lg font-black">Slettenummer: {deleteResult.deletionNumber}</p>
              <p className="mt-1">Gem dette nummer, hvis sletningen senere skal fortrydes.</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <ArchiveRestore className="mt-1 h-5 w-5 text-[#2d5a27]" />
            <div>
              <h3 className="text-lg font-bold text-slate-900">Fortryd sletning</h3>
              <p className="mt-1 text-sm text-slate-600">Indtast slettenummer, gennemgå preview og bekræft restore.</p>
            </div>
          </div>

          <label className="block text-sm font-bold text-slate-700">
            Slettenummer
            <input value={restoreNumber} onChange={(event) => setRestoreNumber(normalizeDeletionNumber(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="SLET-0147" />
          </label>
          <button type="button" onClick={loadRestorePreview} disabled={!restoreNumber.trim() || !!busy} className="mt-4 inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            Hent gendannelses-preview
          </button>

          {restorePreview && (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p><strong>Slettenummer:</strong> {restorePreview.deletionNumber}</p>
                <p><strong>Status:</strong> {restorePreview.status}</p>
                <p><strong>Root:</strong> {restorePreview.rootLookupType} · {restorePreview.rootIdentifier}</p>
                <p><strong>Records:</strong> {restorePreview.recordCount}</p>
              </div>
              <TracePreviewList title="Denne sletning indeholder" rows={restorePreview.tables || []} />
              <label className="block text-sm font-bold text-emerald-900">
                Skriv {expectedRestore}
                <input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-bold" />
              </label>
              <button type="button" onClick={runRestore} disabled={!canRestore} className="inline-flex items-center rounded-lg bg-[#2d5a27] px-4 py-2 text-sm font-bold text-white hover:bg-[#21451d] disabled:bg-slate-300">
                Gendan dataspor
              </button>
            </div>
          )}

          {restoreResult && (
            <div className={`mt-5 rounded-xl border p-4 text-sm ${restoreResult.status === "restore_blocked" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
              <p className="font-black">{restoreResult.status === "restore_blocked" ? "Gendannelse blokeret" : "Gendannelse gennemført"}</p>
              <p>{restoreResult.status === "restore_blocked" ? `${restoreResult.deletionNumber} blev ikke gendannet.` : `${restoreResult.deletionNumber} er gendannet med ${restoreResult.recordCount} records.`}</p>
              <p className="mt-1">{restoreResult.message}</p>
            </div>
          )}
        </section>
      </div>
    </SyncSection>
  );
}

function TracePreviewList({ title, rows }: { title: string; rows: Array<{ table?: string; table_name?: string; count: number }> }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-bold text-slate-900">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Ingen records fundet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-200 text-sm">
          {rows.map((row) => (
            <li key={displayTraceTableName(row as DataTraceTableCount)} className="flex items-center justify-between py-2">
              <span className="font-semibold text-slate-700">{displayTraceTableName(row as DataTraceTableCount)}</span>
              <span className="font-black tabular-nums text-slate-950">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CrmSalesResetPreview = {
  counts?: Record<string, number>;
  next_after_reset?: Partial<Record<"lead" | "quote" | "order", string>>;
  protected_data?: string[];
  confirmation_required?: string;
};

type CrmSalesResetResult = {
  deleted?: Record<string, number>;
  next_after_reset?: Partial<Record<"lead" | "quote" | "order", string>>;
  audit_log_id?: string;
};

function CrmResetTab() {
  const [preview, setPreview] = useState<CrmSalesResetPreview | null>(null);
  const [result, setResult] = useState<CrmSalesResetResult | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = preview?.counts ?? {};
  const totalRecords = Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const requiredConfirmation = preview?.confirmation_required || CRM_RESET_CONFIRMATION;
  const canReset = confirmation.trim() === requiredConfirmation && !resetting;

  const loadPreview = async () => {
    setLoadingPreview(true);
    setError(null);
    setResult(null);

    const { data, error } = await (supabase as any).rpc("preview_crm_sales_reset");
    setLoadingPreview(false);

    if (error) {
      setError(error.message || "Kunne ikke hente reset-preview.");
      return;
    }

    setPreview((data ?? {}) as CrmSalesResetPreview);
    setConfirmation("");
  };

  const executeReset = async () => {
    if (!preview || !canReset) return;

    const confirmed = window.confirm("Er du sikker? Dette sletter CRM-transaktionsdata og nulstiller L/T/O-numre.");
    if (!confirmed) return;

    setResetting(true);
    setError(null);
    setResult(null);

    const { data, error } = await (supabase as any).rpc("execute_crm_sales_reset", {
      p_confirmation: requiredConfirmation,
    });
    setResetting(false);

    if (error) {
      setError(error.message || "CRM-nulstilling fejlede.");
      return;
    }

    setResult((data ?? {}) as CrmSalesResetResult);
    setPreview(null);
    setConfirmation("");
  };

  return (
    <SyncSection
      title="Kontrolleret CRM-nulstilling"
      description="Backend/admin-only preview og bekræftet nulstilling af CRM-transaktionsdata. Produktionsreset køres ikke uden eksplicit bekræftelse."
    >
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-3">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Meget vigtig nulstilling</h3>
              <p className="mt-1 text-sm text-slate-700">
                Sletter kun leads, demo leads, tilbud, ordrer, budget-/pipeline-transaktioner og direkte afhængige CRM-records.
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Stamdata som brugere, forhandlere, produkter, priser, marketing og indstillinger bevares.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadPreview}
            disabled={loadingPreview || resetting}
            className="inline-flex items-center justify-center rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-900 shadow-sm hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingPreview ? "Henter preview..." : "Hent reset-preview"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {preview && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div>
            <h3 className="text-base font-bold text-slate-900">Preview</h3>
            <p className="mt-1 text-sm text-slate-600">
              Der slettes {totalRecords} CRM-transaktionsrecords, hvis reset bekræftes.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(counts).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{key}</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">{Number(value) || 0}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h4 className="text-sm font-bold text-emerald-900">Næste numre efter reset</h4>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><span className="block text-emerald-700">Lead</span><strong>{preview.next_after_reset?.lead ?? "L-1001"}</strong></div>
                <div><span className="block text-emerald-700">Tilbud</span><strong>{preview.next_after_reset?.quote ?? "T-4001"}</strong></div>
                <div><span className="block text-emerald-700">Ordre</span><strong>{preview.next_after_reset?.order ?? "O-7001"}</strong></div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-sm font-bold text-slate-900">Beskyttede stamdata</h4>
              <p className="mt-2 text-sm text-slate-700">
                {(preview.protected_data ?? ["brugere", "forhandlere", "produkter", "priser", "marketing", "sprog", "indstillinger"]).join(", ")}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <label className="block text-sm font-bold text-red-900" htmlFor="crm-reset-confirmation">
              Skriv {requiredConfirmation} for at aktivere nulstilling
            </label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                id="crm-reset-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="min-h-[44px] flex-1 rounded-full border border-red-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-red-400"
                placeholder={requiredConfirmation}
              />
              <button
                type="button"
                onClick={executeReset}
                disabled={!canReset}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-red-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {resetting ? "Nulstiller..." : "Nulstil CRM-transaktionsdata"}
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
          <strong>Reset gennemført.</strong> Næste numre er {result.next_after_reset?.lead ?? "L-1001"}, {result.next_after_reset?.quote ?? "T-4001"} og {result.next_after_reset?.order ?? "O-7001"}.
        </div>
      )}
    </SyncSection>
  );
}

function DealerTab() {
  const { badge } = useLatestDealerSyncLog();
  return (
    <>
      <SyncSection
        title="SharePoint forhandler-sync"
        description="Synkronisér forhandlerstamdata fra SharePoint. Bruger Verificér → Dry-run → Kør sync."
        badge={badge}
      >
        <SharePointSyncPanel />
      </SyncSection>

      <ComingSoonCard
        title="Geocoding"
        description="Geocoding håndteres samlet for partnerkonti, garantikunder og andre adressekilder."
        to="/portal/backend/geocoding"
        toLabel="Administrér geocoding"
        icon={MapPin}
      />

      <ComingSoonCard
        title="Import firma- og kontaktinformation"
        description="Importér firma- og kontaktinformation fra Excel. Tilgængelig på siden Forhandlere — åbn for at uploade."
        to="/portal/backend/dealer-accounts"
        toLabel="Åbn Forhandlere"
      />

      <ComingSoonCard
        title="Eksport forhandlerdata"
        description="CSV-eksport af forhandlerlisten med stamdata og tildelt sælger."
        icon={FileDown}
      />
    </>
  );
}

function WarrantyTab() {
  return (
    <>
      <SyncSection
        title="Warranty SharePoint sync"
        description="Importér garantiregistreringer fra SharePoint og match til forhandler. Manuelle portalrettelser og manuelle dealer-matches bevares."
      >
        <WarrantySharePointSyncPanel />
      </SyncSection>

      <SyncSection
        title="Test SharePoint Warranty"
        description="Read-only test af listen Warranty registration. Viser kolonner, de første rækker og foreslået mapping. Skriver intet."
      >
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900">Read-only SharePoint test</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-700">
              Bruges til fejlfinding af Warranty registration-listen. Den tester kun adgang og felter.
            </p>
          </div>
          <SharePointWarrantyProbeButton />
        </div>
      </SyncSection>

      <SyncSection
        title="Dealer matching backfill"
        description="Find garantiregistreringer hvor forhandlerkoblingen mangler eller er ufuldstændig og fyld den ud via alias-tabellen."
      >
        <WarrantyDealerLinkBackfillPanel />
      </SyncSection>

      <ComingSoonCard
        title="Geocoding af garantikunder"
        description="Kundeadresser på garantiregistreringer geokodes på den samlede Geocoding-side."
        to="/portal/backend/geocoding"
        toLabel="Administrér geocoding"
        icon={MapPin}
      />


      <ComingSoonCard
        title="Eksport garantiregistreringer"
        description="CSV-eksport af garantiregistreringer med forhandler, maskine og kunde."
        icon={FileDown}
      />
    </>
  );
}

function PriceListsTab() {
  return (
    <>
      <ComingSoonCard
        title="Prislister"
        description="Importér, eksportér og validér prislister. Åbn prisliste-administrationen for at fortsætte."
        to="/portal/backend/price-lists"
        toLabel="Åbn Prislister"
        icon={Tag}
      />
      <ComingSoonCard title="Prisvalidering" description="Sammenlign prislister på tværs af kunder og opdag afvigelser." />
    </>
  );
}

function BudgetTab() {
  return (
    <>
      <ComingSoonCard
        title="Budget Import"
        description="Importér sælgerbudgetter fra Excel til CRM Budget."
        to="/portal/backend/budget-import"
        toLabel="Åbn Budget Import"
        icon={BarChart3}
      />
      <ComingSoonCard title="Eksport budget" description="CSV-eksport af budget pr. sælger eller forhandler." icon={FileDown} />
    </>
  );
}

function UsersTab() {
  return (
    <>
      <ComingSoonCard
        title="Brugere"
        description="Administrér brugere, roller og modul-adgang."
        to="/portal/backend/users"
        toLabel="Åbn Brugere"
        icon={UsersIcon}
      />
      <ComingSoonCard title="Eksport brugere" description="CSV-eksport af alle portalbrugere." icon={FileDown} />
      <ComingSoonCard title="Eksport rettigheder" description="CSV-eksport af tildelte roller, områder og modul-adgang." icon={FileDown} />
    </>
  );
}

function HistoryTab() {
  return (
    <>
      <ComingSoonCard
        title="Dealer sync historik"
        description="Se kørselsoversigt for SharePoint forhandler-sync med antal opdateringer og advarsler."
        to="/portal/backend/dealer-accounts"
        toLabel="Se på Forhandlere"
      />
      <ComingSoonCard
        title="Warranty sync historik"
        description="Kørselshistorik for warranty SharePoint-sync."
        to="/portal/service/warranty"
        toLabel="Se på Warranty"
      />
      <ComingSoonCard title="Geocoding" description="Samlet status, kørsel og fejl for adresse-geocoding." to="/portal/backend/geocoding" toLabel="Åbn Geocoding" icon={MapPin} />
      <ComingSoonCard title="Import logs" description="Samlet historik for Excel-imports (forhandlere, budget, prislister)." />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Hjælpekort til endnu ikke implementerede entries
// ──────────────────────────────────────────────────────────────────────────────

function ComingSoonCard({
  title, description, to, toLabel = "Åbn", icon: Icon = Database,
}: {
  title: string;
  description: string;
  to?: string;
  toLabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          <Icon className="h-5 w-5 text-slate-700" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>
      {to ? (
        <Link
          to={to}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50 flex-shrink-0"
        >
          <ExternalLink className="h-4 w-4" /> {toLabel}
        </Link>
      ) : (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 flex-shrink-0">
          Kommer snart
        </span>
      )}
    </section>
  );
}
