import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  Database,
  FileSearch,
  KeyRound,
  Link2,
  ListChecks,
  Mail,
  Map,
  MapPin,
  Network,
  QrCode,
  ScrollText,
  ShieldCheck,
  Tag,
  Upload,
  UserCog,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { portalCapabilityRoute } from '../../supabase/functions/_shared/portalCapabilityContract';

export type BackendSectionId =
  | "dashboard"
  | "user-management"
  | "partner-management"
  | "data-integrations"
  | "analytics"
  | "ai-support"
  | "system";

export interface BackendNavItem {
  title: string;
  description: string;
  icon: LucideIcon;
  to?: string;
}

export interface BackendSection {
  id: BackendSectionId;
  title: string;
  navLabel: string;
  description: string;
  to: string;
  icon: LucideIcon;
  items: BackendNavItem[];
}

export const backendSections: BackendSection[] = [
  {
    id: "user-management",
    title: "Brugerstyring",
    navLabel: "Brugerstyring",
    description: "Brugere, roller, modul-adgang og audit log.",
    to: portalCapabilityRoute('backend.user_management'),
    icon: Users,
    items: [
      { title: "Brugere", icon: Users, to: portalCapabilityRoute('backend.users'), description: "Administrér alle portal-brugere, godkend nye signups og tildel roller." },
      { title: "Roller", icon: ShieldCheck, to: portalCapabilityRoute('backend.roles'), description: "Definér portal-roller og standard-rettigheder." },
      { title: "Modul-adgang", icon: KeyRound, to: portalCapabilityRoute('backend.module_access'), description: "Styr hvilke moduler hver rolle har adgang til." },
      { title: "Audit Log", icon: ScrollText, to: portalCapabilityRoute('backend.audit_log'), description: "Se ændringer på brugere, roller og adgang." },
      { title: "Timan sælgere", icon: UserCog, to: portalCapabilityRoute('backend.sellers'), description: "Se sælgernes tildelte forhandlere og aggregeret aktivitet." },
    ],
  },
  {
    id: "partner-management",
    title: "Partnerstyring",
    navLabel: "Partnerstyring",
    description: "Forhandlere, importører, servicepartnere, relationer og geografisk dækning.",
    to: portalCapabilityRoute('backend.partner_management'),
    icon: Building2,
    items: [
      { title: "Forhandlere", icon: Building2, to: portalCapabilityRoute('backend.dealer_accounts'), description: "Master-overblik over alle forhandlere, servicepartnere og importører." },
      { title: "Kontraktgodkendelse", icon: ScrollText, to: portalCapabilityRoute('backend.contract_approval'), description: "Gennemgå underskrevne forhandlerkontrakter og godkend arkivering." },
      { title: "Dealer Matching", icon: Link2, to: `${portalCapabilityRoute('backend.data')}?tab=garanti`, description: "Manuel matching af garantiregistreringer mod forhandlere." },
      { title: "Partner relationer", icon: Link2, to: portalCapabilityRoute('backend.partner_relations'), description: "Importør→forhandler-hierarki og servicepartner→forhandler-relationer." },
      { title: "Geografisk dækning", icon: MapPin, to: `${portalCapabilityRoute('backend.data')}?tab=forhandlere`, description: "Geocoding af forhandleradresser og dækningsoverblik." },
      { title: "Partnerkort administration", icon: Map, description: "Administrér det offentlige partnerkort, når funktionen bliver klar." },
    ],
  },
  {
    id: "data-integrations",
    title: "Data & Integrationer",
    navLabel: "Data & Integrationer",
    description: "Import, eksport, SharePoint-sync, warranty-sync, prislister, ERP og budgetimport.",
    to: portalCapabilityRoute('backend.data_integrations'),
    icon: Database,
    items: [
      { title: "Data & Integrationer", icon: Database, to: portalCapabilityRoute('backend.data'), description: "Samlet kontrolcenter for imports, eksports og syncs med status og historik." },
      { title: "Geocoding", icon: MapPin, to: portalCapabilityRoute('backend.geocoding'), description: "Geokod adresser til Partnerkort, garantikort og geografiske visninger." },
      { title: "Dealer Import", icon: Upload, to: portalCapabilityRoute('backend.dealer_import'), description: "Importér og opdatér forhandlerdata fra SharePoint/CSV-kilder." },
      { title: "Budget Import", icon: Upload, to: portalCapabilityRoute('backend.budget_import'), description: "Importér sælgerbudgetter fra Excel-oversigt til CRM Budget." },
      { title: "Prislister", icon: Tag, to: portalCapabilityRoute('backend.price_lists'), description: "Importér, ret og publicér prislistedata." },
    ],
  },
  {
    id: "analytics",
    title: "Analyse",
    navLabel: "Analyse",
    description: "Administrative analyser, brugeraktivitet og portalstatistik.",
    to: portalCapabilityRoute('backend.analytics'),
    icon: BarChart3,
    items: [
      { title: "Portal Analytics", icon: BarChart3, to: portalCapabilityRoute('backend.portal_analytics'), description: "Brug af portalen — besøg, sessioner og moduler." },
    ],
  },
  {
    id: "ai-support",
    title: "AI Support",
    navLabel: "AI Support",
    description: "Spørgsmål, videnshuller, feedback, vidensbase og teknisk overvågning.",
    to: portalCapabilityRoute('backend.ai_support'),
    icon: Bot,
    items: [],
  },
  {
    id: "system",
    title: "System",
    navLabel: "System",
    description: "Tekniske overblik, systemkort, logs og vedligeholdelse.",
    to: portalCapabilityRoute('backend.system'),
    icon: Activity,
    items: [
      { title: "Systemkort", icon: Network, to: portalCapabilityRoute('backend.system_map'), description: "Visuelt overblik over portalen, moduler, integrationer og dataflows." },
      { title: "Persistence Audit", icon: FileSearch, to: portalCapabilityRoute('backend.persistence_audit'), description: "Tjek dataintegritet og overvåg gemte ressourcer." },
      { title: "Messe", icon: QrCode, to: portalCapabilityRoute('backend.messe'), description: "Aktivér offentlig QR-adgang til /messe og download QR-kode til messer." },
      { title: "Mailoversigt", icon: Mail, to: portalCapabilityRoute('backend.mail_overview'), description: "Central audit over portalens mailforsøg og sendestatus." },
      { title: "Job Queue", icon: ListChecks, description: "Baggrundsjobs og kørselshistorik." },
      { title: "Systemstatus", icon: Activity, description: "Edge functions, database og integrationer." },
    ],
  },
];

export const backendDashboardNav = {
  id: "dashboard" as const,
  title: "Dashboard",
  navLabel: "Dashboard",
  description: "Kort overblik og genveje til de faste Backend-hovedområder.",
  to: portalCapabilityRoute('area.backend'),
  icon: BarChart3,
};

export function findBackendSection(id: BackendSectionId): BackendSection | null {
  if (id === "dashboard") return null;
  return backendSections.find((section) => section.id === id) ?? null;
}

export function getBackendSectionForPath(pathname: string, search = ""): BackendSectionId {
  if (pathname === "/portal/backend") return "dashboard";
  if (pathname.startsWith("/portal/backend/brugerstyring")) return "user-management";
  if (pathname.startsWith("/portal/backend/partnerstyring")) return "partner-management";
  if (pathname.startsWith("/portal/backend/data-integrationer")) return "data-integrations";
  if (pathname.startsWith("/portal/backend/analyse")) return "analytics";
  if (pathname.startsWith("/portal/backend/ai-support")) return "ai-support";
  if (pathname.startsWith("/portal/backend/system")) return "system";
  if (pathname === "/portal/backend/data") {
    if (search.includes("tab=garanti") || search.includes("tab=forhandlere")) return "partner-management";
    return "data-integrations";
  }

  const hit = backendSections.find((section) =>
    section.items.some((item) => item.to && pathname === item.to.split("?")[0])
  );
  return hit?.id ?? "dashboard";
}
