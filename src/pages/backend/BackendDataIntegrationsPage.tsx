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
import { useMemo } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Database, Building2, FileText, Tag, BarChart3, Users as UsersIcon, History, ExternalLink, FileDown } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SharePointSyncPanel from "@/components/backend/SharePointSyncPanel";
import GeocodeDealersPanel from "@/components/backend/GeocodeDealersPanel";
import GeocodeWarrantyCustomersPanel from "@/components/backend/GeocodeWarrantyCustomersPanel";
import SharePointWarrantyProbeButton from "@/components/backend/SharePointWarrantyProbeButton";
import WarrantySharePointSyncPanel from "@/components/warranty/WarrantySharePointSyncPanel";
import { WarrantyDealerLinkBackfillPanel } from "@/components/warranty/WarrantyDealerLinkBackfillPanel";
import SyncSection from "@/components/backend/SyncSection";
import { useLatestDealerSyncLog, badgeFromLatest } from "@/lib/syncStatusBadge";
import { derivePortalRole, getPortalPermissions } from "@/lib/portalAccess";

type TabKey = "forhandlere" | "garanti" | "prislister" | "budget" | "brugere" | "historik";
const VALID_TABS: TabKey[] = ["forhandlere", "garanti", "prislister", "budget", "brugere", "historik"];

export default function BackendDataIntegrationsPage() {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!perms?.isBackend) return <Navigate to="/portal/backend" replace />;

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
          </TabsList>

          <TabsContent value="forhandlere"><DealerTab /></TabsContent>
          <TabsContent value="garanti"><WarrantyTab /></TabsContent>
          <TabsContent value="prislister"><PriceListsTab /></TabsContent>
          <TabsContent value="budget"><BudgetTab /></TabsContent>
          <TabsContent value="brugere"><UsersTab /></TabsContent>
          <TabsContent value="historik"><HistoryTab /></TabsContent>
        </Tabs>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab content
// ──────────────────────────────────────────────────────────────────────────────

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

      <SyncSection
        title="Geocoding"
        description="Find geokoordinater for forhandlere uden lat/lng — bruges af partnerkort og dækningsanalyse."
      >
        <GeocodeDealersPanel />
      </SyncSection>

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

      <SyncSection
        title="Geocoding (kundeadresser)"
        description="Find geokoordinater for kundeadresser på garantiregistreringer — bruges af machine-laget på partnerkortet."
      >
        <GeocodeWarrantyCustomersPanel />
      </SyncSection>


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
      <ComingSoonCard
        title="Budget Dashboard"
        description="Følg op på sælgerbudgetter og forhandlerlinjer i CRM."
        to="/portal/crm/budget"
        toLabel="Åbn Budget Dashboard"
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
      <ComingSoonCard title="Geocoding logs" description="Log over geocoding-kørsler og fejl." />
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
