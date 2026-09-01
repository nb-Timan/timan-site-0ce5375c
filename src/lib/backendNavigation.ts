import {
  Activity,
  BarChart3,
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

export type BackendSectionId =
  | "dashboard"
  | "user-management"
  | "partner-management"
  | "data-integrations"
  | "analytics"
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
    to: "/portal/backend/brugerstyring",
    icon: Users,
    items: [
      { title: "Brugere", icon: Users, to: "/portal/backend/users", description: "Administrér alle portal-brugere, godkend nye signups og tildel roller." },
      { title: "Roller", icon: ShieldCheck, to: "/portal/backend/roles", description: "Definér portal-roller og standard-rettigheder." },
      { title: "Modul-adgang", icon: KeyRound, to: "/portal/backend/module-access", description: "Styr hvilke moduler hver rolle har adgang til." },
      { title: "Audit Log", icon: ScrollText, to: "/portal/backend/audit-log", description: "Se ændringer på brugere, roller og adgang." },
      { title: "Timan sælgere", icon: UserCog, to: "/portal/backend/sellers", description: "Se sælgernes tildelte forhandlere og aggregeret aktivitet." },
    ],
  },
  {
    id: "partner-management",
    title: "Partnerstyring",
    navLabel: "Partnerstyring",
    description: "Forhandlere, importører, servicepartnere, relationer og geografisk dækning.",
    to: "/portal/backend/partnerstyring",
    icon: Building2,
    items: [
      { title: "Forhandlere", icon: Building2, to: "/portal/backend/dealer-accounts", description: "Master-overblik over alle forhandlere, servicepartnere og importører." },
      { title: "Kontraktgodkendelse", icon: ScrollText, to: "/portal/backend/contracts", description: "Gennemgå underskrevne forhandlerkontrakter og godkend arkivering." },
      { title: "Dealer Matching", icon: Link2, to: "/portal/backend/data?tab=garanti", description: "Manuel matching af garantiregistreringer mod forhandlere." },
      { title: "Partner relationer", icon: Link2, to: "/portal/backend/partner-relations", description: "Importør→forhandler-hierarki og servicepartner→forhandler-relationer." },
      { title: "Geografisk dækning", icon: MapPin, to: "/portal/backend/data?tab=forhandlere", description: "Geocoding af forhandleradresser og dækningsoverblik." },
      { title: "Partnerkort administration", icon: Map, description: "Administrér det offentlige partnerkort, når funktionen bliver klar." },
    ],
  },
  {
    id: "data-integrations",
    title: "Data & Integrationer",
    navLabel: "Data & Integrationer",
    description: "Import, eksport, SharePoint-sync, warranty-sync, prislister, ERP og budgetimport.",
    to: "/portal/backend/data-integrationer",
    icon: Database,
    items: [
      { title: "Data & Integrationer", icon: Database, to: "/portal/backend/data", description: "Samlet kontrolcenter for imports, eksports og syncs med status og historik." },
      { title: "Geocoding", icon: MapPin, to: "/portal/backend/geocoding", description: "Geokod adresser til Partnerkort, garantikort og geografiske visninger." },
      { title: "Dealer Import", icon: Upload, to: "/portal/backend/dealer-import", description: "Importér og opdatér forhandlerdata fra SharePoint/CSV-kilder." },
      { title: "Budget Import", icon: Upload, to: "/portal/backend/budget-import", description: "Importér sælgerbudgetter fra Excel-oversigt til CRM Budget." },
      { title: "Prislister", icon: Tag, to: "/portal/backend/price-lists", description: "Importér, ret og publicér prislistedata." },
    ],
  },
  {
    id: "analytics",
    title: "Analyse",
    navLabel: "Analyse",
    description: "Administrative analyser, brugeraktivitet og portalstatistik.",
    to: "/portal/backend/analyse",
    icon: BarChart3,
    items: [
      { title: "Portal Analytics", icon: BarChart3, to: "/portal/backend/portal-analytics", description: "Brug af portalen — besøg, sessioner og moduler." },
    ],
  },
  {
    id: "system",
    title: "System",
    navLabel: "System",
    description: "Tekniske overblik, systemkort, logs og vedligeholdelse.",
    to: "/portal/backend/system",
    icon: Activity,
    items: [
      { title: "Systemkort", icon: Network, to: "/portal/backend/system-map", description: "Visuelt overblik over portalen, moduler, integrationer og dataflows." },
      { title: "Persistence Audit", icon: FileSearch, to: "/portal/backend/persistence-audit", description: "Tjek dataintegritet og overvåg gemte ressourcer." },
      { title: "Messe", icon: QrCode, to: "/portal/backend/messe", description: "Aktivér offentlig QR-adgang til /messe og download QR-kode til messer." },
      { title: "Mail Log", icon: Mail, description: "Log over udsendte mails fra portalen." },
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
  to: "/portal/backend",
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
