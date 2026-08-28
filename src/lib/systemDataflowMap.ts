import {
  BarChart3,
  Cable,
  ClipboardList,
  Database,
  FileText,
  Mail,
  Megaphone,
  Server,
  Settings,
  ShoppingBag,
  Sparkles,
  Upload,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type SystemMapNodeKind = "portal" | "module" | "integration";

export type SystemMapNodeId =
  | "portal"
  | "crm"
  | "sales"
  | "marketing"
  | "dealer_data"
  | "service"
  | "messe"
  | "import"
  | "system_admin"
  | "sharepoint"
  | "erp"
  | "supabase"
  | "email"
  | "documents";

export interface SystemMapNode {
  id: SystemMapNodeId;
  title: string;
  subtitle: string;
  kind: SystemMapNodeKind;
  color: string;
  position: { x: number; y: number };
  icon: LucideIcon;
  tables: string[];
  services: string[];
  receivesFrom: string[];
  sendsTo: string[];
  integrations: string[];
  explanation: string;
}

export interface SystemMapEdge {
  from: SystemMapNodeId;
  to: SystemMapNodeId;
  label: string;
}

export const systemMapNodes: SystemMapNode[] = [
  {
    id: "portal",
    title: "Timan Partner Portal",
    subtitle: "Samlet portal",
    kind: "portal",
    color: "emerald",
    position: { x: 50, y: 50 },
    icon: Sparkles,
    tables: ["app_users", "portal_module_usage", "audit_log"],
    services: ["AppUserContext", "portalAccess", "visitorTracking"],
    receivesFrom: ["Supabase Auth", "Portal routes", "Aktiv rolle/vis-som"],
    sendsTo: ["Omraader", "moduler", "tracking", "audit"],
    integrations: ["Supabase"],
    explanation: "Portalen samler adgang, sprog, brugerrolle og navigation. Modulerne nedenfor deler samme bruger- og adgangsgrundlag.",
  },
  {
    id: "crm",
    title: "CRM / Leads",
    subtitle: "Leads, demoer og pipeline",
    kind: "module",
    color: "emerald",
    position: { x: 26, y: 20 },
    icon: BarChart3,
    tables: ["crm_leads", "crm_demo_leads", "crm_activities", "crm_calendar_activities"],
    services: ["crmLeadsService", "crmDashboardKpisService", "crmCalendarService", "crmScope"],
    receivesFrom: ["Messe lead capture", "Konfigurator gem som lead", "Sælger-scope"],
    sendsTo: ["Dashboard KPI'er", "Kalender", "Tilbud/ordre-flow"],
    integrations: ["Supabase", "n8n calendar webhook"],
    explanation: "CRM bruger Supabase-data til leads, demoer, aktiviteter og dashboard-KPI'er. Dashboardet bruger flere server-side RPC'er.",
  },
  {
    id: "sales",
    title: "Salg",
    subtitle: "Konfigurator, tilbud og ordrer",
    kind: "module",
    color: "blue",
    position: { x: 50, y: 13 },
    icon: ShoppingBag,
    tables: ["configurations", "configuration_user_hidden", "crm_number_sequences"],
    services: ["configurationsService", "crmConfigurationsService", "quoteContentSummary", "webhookUrls"],
    receivesFrom: ["CRM leads", "Forhandlerdata", "Prislister"],
    sendsTo: ["PDF", "E-mail/n8n", "CRM tilbud/ordrer", "Budget"],
    integrations: ["Supabase", "PDF/document generation", "E-mail/n8n"],
    explanation: "Salg gemmer konfigurator-sager i configurations og bruger samme data til tilbud, ordrer, PDF og webhooks.",
  },
  {
    id: "marketing",
    title: "Marketing",
    subtitle: "Nyheder og site features",
    kind: "module",
    color: "lime",
    position: { x: 74, y: 20 },
    icon: Megaphone,
    tables: ["news_posts", "site_change_entries"],
    services: ["newsService", "portalChangelogService", "newsCmsTranslations"],
    receivesFrom: ["Backend changelog", "Marketing editor"],
    sendsTo: ["Portal forside", "Messe nyheder", "Hvad er nyt?"],
    integrations: ["Supabase"],
    explanation: "Marketing administrerer nyheder og publicerede ændringer. Publiceret indhold vises i portalens 'Hvad er nyt?'.",
  },
  {
    id: "dealer_data",
    title: "Forhandlerdata",
    subtitle: "Konti, relationer og noter",
    kind: "module",
    color: "indigo",
    position: { x: 20, y: 50 },
    icon: Users,
    tables: ["dealer_accounts", "dealer_account_aliases", "crm_dealer_notes", "dealer_contacts"],
    services: ["dealerAccountsService", "crmAccountsService", "dealerScope", "partnerRelationsService"],
    receivesFrom: ["SharePoint forhandler-sync", "Brugeradministration", "Partner relationer"],
    sendsTo: ["CRM scope", "Partnerkort", "Warranty matching", "Forhandlerprofil"],
    integrations: ["Supabase", "SharePoint"],
    explanation: "Forhandlerdata er stamdata for forhandlere, importører, servicepartnere og relationer. Det bruges af CRM, service og kort.",
  },
  {
    id: "service",
    title: "Service",
    subtitle: "Warranty, TSB og maskiner",
    kind: "module",
    color: "orange",
    position: { x: 80, y: 50 },
    icon: Wrench,
    tables: ["warranty_registrations", "warranty_registration_history", "service_machines", "service_registrations"],
    services: ["warrantyRegistrationsService", "warrantyMachinePinsService", "machineJournalService", "serviceMaintenanceService"],
    receivesFrom: ["SharePoint warranty-sync", "Forhandlerdata", "Maskinregistreringer"],
    sendsTo: ["Partnerkort", "Maskinjournal", "TSB visninger"],
    integrations: ["Supabase", "SharePoint"],
    explanation: "Service samler garanti, maskiner, servicehistorik og TSB-relaterede visninger. Warranty-data kan komme fra SharePoint-sync.",
  },
  {
    id: "messe",
    title: "Messe",
    subtitle: "QR-flow og messeleads",
    kind: "module",
    color: "purple",
    position: { x: 26, y: 80 },
    icon: ClipboardList,
    tables: ["crm_leads", "portal_form_submissions", "guest_sessions"],
    services: ["messeLeadCapture", "portalFormsService", "MesseRouteGuard", "visitorTracking"],
    receivesFrom: ["Offentlige messeformularer", "Partnerkort", "Konfigurator"],
    sendsTo: ["CRM leads", "Portal analytics", "E-mail/n8n messe lead"],
    integrations: ["Supabase", "E-mail/n8n"],
    explanation: "Messe-flowet er en afgrænset portalvariant, hvor formularer og QR-flow kan oprette leads og aktivitetssporing.",
  },
  {
    id: "import",
    title: "Import",
    subtitle: "Sync, geocoding og dataload",
    kind: "module",
    color: "cyan",
    position: { x: 50, y: 87 },
    icon: Upload,
    tables: ["sharepoint_sync_logs", "dealer_accounts", "warranty_registrations", "price_list_items", "crm_budget_rows"],
    services: ["SharePointSyncPanel", "WarrantySharePointSyncPanel", "dealerImportService", "priceListService", "syncStatusBadge"],
    receivesFrom: ["SharePoint", "Excel-filer", "Prislister"],
    sendsTo: ["Forhandlerdata", "Service", "Budget", "Salg"],
    integrations: ["SharePoint", "Supabase", "ERP/prisliste-import"],
    explanation: "Import-området samler sync-paneler, dry-run, historik, geocoding, budgetimport og prislister.",
  },
  {
    id: "system_admin",
    title: "System & Admin",
    subtitle: "Brugere, roller og audit",
    kind: "module",
    color: "slate",
    position: { x: 74, y: 80 },
    icon: Settings,
    tables: ["app_users", "audit_log", "portal_module_usage", "guest_sessions"],
    services: ["backendUsersService", "module-access-store", "audit-log-store", "portalModuleUsageAnalyticsService"],
    receivesFrom: ["Supabase Auth", "Brugereditor", "Portal tracking"],
    sendsTo: ["Access-resolver", "Audit Log", "Portal Analytics"],
    integrations: ["Supabase"],
    explanation: "System & Admin styrer brugere, roller, moduladgang, audit log og brugeraktivitet.",
  },
  {
    id: "sharepoint",
    title: "SharePoint",
    subtitle: "Forhandler- og warranty-kilde",
    kind: "integration",
    color: "sky",
    position: { x: 8, y: 24 },
    icon: Cable,
    tables: ["sharepoint_sync_logs"],
    services: ["sharepoint-dealers-*", "sharepoint-warranty-*"],
    receivesFrom: ["Eksterne SharePoint-lister"],
    sendsTo: ["Import", "Forhandlerdata", "Service"],
    integrations: ["SharePoint"],
    explanation: "SharePoint bruges som ekstern kilde til forhandler- og warranty-sync via backend/edge-funktioner.",
  },
  {
    id: "erp",
    title: "ERP / Priser",
    subtitle: "Priser og økonomidata",
    kind: "integration",
    color: "amber",
    position: { x: 92, y: 24 },
    icon: Server,
    tables: ["price_list_items", "price_list_import_runs"],
    services: ["priceListService", "pricePublishService"],
    receivesFrom: ["Excel/importfiler", "Prislister"],
    sendsTo: ["Salg", "Budget", "Konfigurator"],
    integrations: ["ERP/prisliste-import"],
    explanation: "Prisliste- og økonomidata importeres til Supabase og bruges af salg, budget og konfiguratorflow.",
  },
  {
    id: "supabase",
    title: "Supabase",
    subtitle: "Database, Auth og Edge Functions",
    kind: "integration",
    color: "emerald",
    position: { x: 8, y: 76 },
    icon: Database,
    tables: ["public schema", "auth users", "storage"],
    services: ["supabase client", "Supabase RPC", "Edge Functions"],
    receivesFrom: ["Portal writes", "Import jobs", "Auth"],
    sendsTo: ["Alle portalfunktioner"],
    integrations: ["Supabase"],
    explanation: "Supabase er portalens database- og auth-lag samt hjem for RPC'er og Edge Functions.",
  },
  {
    id: "email",
    title: "E-mail / n8n",
    subtitle: "Tilbud, ordrer og kalender",
    kind: "integration",
    color: "rose",
    position: { x: 92, y: 76 },
    icon: Mail,
    tables: ["configuration_email_log", "crm_calendar_activities"],
    services: ["webhookUrls", "configurationEmailLogService", "crmCalendarService"],
    receivesFrom: ["Salg", "Messe", "CRM kalender"],
    sendsTo: ["Modtagere", "n8n workflows", "Mail-log"],
    integrations: ["E-mail", "n8n"],
    explanation: "E-mail og n8n bruges til udsendelse af tilbud/ordrer, messe-leads og kalenderintegrationer.",
  },
  {
    id: "documents",
    title: "PDF / dokumenter",
    subtitle: "Tilbud, ordrer og brochurer",
    kind: "integration",
    color: "violet",
    position: { x: 63, y: 62 },
    icon: FileText,
    tables: ["configurations", "storage"],
    services: ["html2canvas", "jsPDF", "brochure pages"],
    receivesFrom: ["Salg", "Brochurevisninger"],
    sendsTo: ["Download", "Storage", "E-mail payload"],
    integrations: ["PDF/document generation"],
    explanation: "Dokumentlaget genererer og viser PDF'er, tilbud, ordrer og brochuremateriale, når brugeren åbner de tunge flows.",
  },
];

export const systemMapEdges: SystemMapEdge[] = [
  { from: "sharepoint", to: "import", label: "sync" },
  { from: "import", to: "dealer_data", label: "stamdata" },
  { from: "import", to: "service", label: "warranty" },
  { from: "import", to: "sales", label: "priser" },
  { from: "erp", to: "import", label: "priser" },
  { from: "dealer_data", to: "crm", label: "scope" },
  { from: "dealer_data", to: "service", label: "matching" },
  { from: "messe", to: "crm", label: "leads" },
  { from: "crm", to: "sales", label: "tilbud" },
  { from: "sales", to: "documents", label: "PDF" },
  { from: "sales", to: "email", label: "webhook" },
  { from: "crm", to: "email", label: "kalender" },
  { from: "system_admin", to: "portal", label: "adgang" },
  { from: "portal", to: "supabase", label: "data" },
  { from: "supabase", to: "crm", label: "RPC" },
  { from: "supabase", to: "marketing", label: "CMS" },
  { from: "supabase", to: "dealer_data", label: "konti" },
  { from: "supabase", to: "service", label: "service" },
];

export function findSystemMapNode(id: SystemMapNodeId): SystemMapNode {
  return systemMapNodes.find((node) => node.id === id) ?? systemMapNodes[0];
}
