import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  Cable,
  CalendarDays,
  ClipboardList,
  Contact,
  Database,
  FileText,
  FormInput,
  Gauge,
  GitBranch,
  KeyRound,
  Mail,
  Map,
  Megaphone,
  MessageSquareText,
  MonitorCog,
  Newspaper,
  Package,
  Route,
  Server,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tags,
  Upload,
  Users,
  Video,
  WalletCards,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { PORTAL_HOME_AREA_ORDER, type PortalHomeAreaOrderId } from "@/lib/portalHomeOrder";
import { SYSTEM_DNA_INITIAL_ZOOM, SYSTEM_DNA_MAX_ZOOM } from "@/lib/systemDnaViewport";

export type SystemMapNodeKind = "portal" | "module" | "feature" | "data" | "technical" | "integration" | "process" | "tool";
export type SystemMapArea = "crm" | "sales" | "marketing" | "dealer_data" | "service" | "calendar" | "projects" | "messe" | "import" | "system";
export type SystemMapNodeId = string;

export interface SystemMapNode {
  id: SystemMapNodeId;
  title: string;
  subtitle: string;
  kind: SystemMapNodeKind;
  area?: SystemMapArea;
  parentId?: SystemMapNodeId;
  color: string;
  position: { x: number; y: number };
  dnaPosition: { x: number; y: number };
  minZoom: number;
  icon: LucideIcon;
  tables: string[];
  services: string[];
  routes: string[];
  receivesFrom: string[];
  sendsTo: string[];
  integrations: string[];
  explanation: string;
}

const AREA_COLORS: Record<SystemMapArea, string> = {
  crm: "emerald",
  sales: "blue",
  marketing: "purple",
  dealer_data: "amber",
  service: "cyan",
  calendar: "teal",
  projects: "indigo",
  messe: "rose",
  import: "orange",
  system: "slate",
};

export interface SystemMapEdge {
  from: SystemMapNodeId;
  to: SystemMapNodeId;
  label: string;
  kind?: "data" | "navigation" | "sync" | "permission" | "conversion" | "dependency" | "development";
  direction?: "forward" | "bidirectional";
  minZoom?: number;
}

export interface SystemOverviewLine {
  from: SystemMapNodeId;
  to: SystemMapNodeId;
  colorFrom?: SystemMapNodeId;
  dashed?: boolean;
}

export type SystemDnaZoomLevelId = "world" | "area" | "feature" | "technical";

export interface SystemDnaZoomLevel {
  id: SystemDnaZoomLevelId;
  title: string;
  zoom: number;
  description: string;
}

export interface SystemDnaPoint {
  x: number;
  y: number;
}

export const SYSTEM_DNA_ZOOM_LEVELS: SystemDnaZoomLevel[] = [
  { id: "world", title: "Hele systemet", zoom: SYSTEM_DNA_INITIAL_ZOOM, description: "Hovedområder og centrale eksterne systemer." },
  { id: "area", title: "Områder", zoom: 0.74, description: "Moduler, større features og brugerrejser." },
  { id: "feature", title: "Features", zoom: 1.24, description: "Underfunktioner, dataobjekter og konkrete flows." },
  { id: "technical", title: "Teknisk DNA", zoom: 1.48, description: "Tabeller, services, routes, RPC'er og Edge Functions." },
];

const baseNodes: SystemMapNode[] = [
  {
    id: "portal",
    title: "Timan Partner Portal",
    subtitle: "Samlet portal",
    kind: "portal",
    color: "emerald",
    position: { x: 50, y: 50 },
    dnaPosition: { x: 1400, y: 900 },
    minZoom: 0.35,
    icon: Sparkles,
    tables: ["app_users", "portal_module_usage", "audit_log"],
    services: ["AppUserContext", "portalAccess", "visitorTracking"],
    routes: ["/portal"],
    receivesFrom: ["Supabase Auth", "Portal routes", "Aktiv rolle/vis-som"],
    sendsTo: ["Omraader", "moduler", "tracking", "audit"],
    integrations: ["Supabase"],
    explanation: "Portalen samler adgang, sprog, brugerrolle og navigation. Modulerne deler samme bruger- og adgangsgrundlag.",
  },
  {
    id: "crm",
    title: "Timan CRM",
    subtitle: "Leads, demoer og pipeline",
    kind: "module",
    area: "crm",
    color: "emerald",
    position: { x: 34, y: 27 },
    dnaPosition: { x: 920, y: 520 },
    minZoom: 0.35,
    icon: BarChart3,
    tables: ["crm_leads", "crm_demo_leads", "crm_activities"],
    services: ["crmLeadsService", "crmDashboardKpisService", "crmScope"],
    routes: ["/portal/crm/dashboard", "/portal/crm/leads", "/portal/crm/activities"],
    receivesFrom: ["Messe lead capture", "Konfigurator gem som lead", "Sælger-scope"],
    sendsTo: ["Dashboard KPI'er", "Kalender", "Tilbud/ordre-flow"],
    integrations: ["Supabase"],
    explanation: "CRM bruger Supabase-data til leads, demoer, aktiviteter og dashboard-KPI'er. Dashboardet bruger server-side RPC'er.",
  },
  {
    id: "sales",
    title: "Salg",
    subtitle: "Konfigurator, tilbud og ordrer",
    kind: "module",
    area: "sales",
    color: "blue",
    position: { x: 50, y: 20 },
    dnaPosition: { x: 1420, y: 470 },
    minZoom: 0.35,
    icon: ShoppingBag,
    tables: ["configurations", "configuration_user_hidden", "crm_number_sequences"],
    services: ["configurationsService", "crmConfigurationsService", "quoteContentSummary", "webhookUrls"],
    routes: ["/configurator", "/portal/crm/quotes", "/portal/crm/orders"],
    receivesFrom: ["CRM leads", "Partnerdata", "Prislister"],
    sendsTo: ["PDF", "E-mail/n8n", "CRM tilbud/ordrer", "Budget"],
    integrations: ["Supabase", "PDF/document generation", "E-mail/n8n"],
    explanation: "Salg gemmer konfigurator-sager i configurations og bruger samme data til tilbud, ordrer, PDF og webhooks.",
  },
  {
    id: "marketing",
    title: "Marketing",
    subtitle: "Nyheder og site features",
    kind: "module",
    area: "marketing",
    color: "purple",
    position: { x: 66, y: 27 },
    dnaPosition: { x: 1920, y: 520 },
    minZoom: 0.35,
    icon: Megaphone,
    tables: ["news_posts", "site_change_entries"],
    services: ["newsService", "portalChangelogService", "newsCmsTranslations"],
    routes: ["/portal/marketing/news", "/portal/marketing/site-features"],
    receivesFrom: ["Marketing editor", "Backend changelog"],
    sendsTo: ["Portal forside", "Messe nyheder", "Hvad er nyt?"],
    integrations: ["Supabase"],
    explanation: "Marketing administrerer nyheder og publicerede ændringer. Publiceret indhold vises i portalens 'Hvad er nyt?'.",
  },
  {
    id: "dealer_data",
    title: "Partnerdata",
    subtitle: "Konti, relationer og noter",
    kind: "module",
    area: "dealer_data",
    color: "amber",
    position: { x: 29, y: 56 },
    dnaPosition: { x: 850, y: 1040 },
    minZoom: 0.35,
    icon: Users,
    tables: ["dealer_accounts", "dealer_account_aliases", "crm_dealer_notes", "dealer_contacts"],
    services: ["dealerAccountsService", "crmAccountsService", "dealerScope", "partnerRelationsService"],
    routes: ["/portal/dealer-data", "/portal/crm/my-dealers"],
    receivesFrom: ["SharePoint forhandler-sync", "Brugeradministration", "Partner relationer"],
    sendsTo: ["CRM scope", "Partnerkort", "Warranty matching", "Forhandlerprofil"],
    integrations: ["Supabase", "SharePoint"],
    explanation: "Partnerdata er stamdata for forhandlere, importører, servicepartnere og relationer. Det bruges af CRM, service og kort.",
  },
  {
    id: "service",
    title: "Teknik & Service",
    subtitle: "Warranty, TSB og maskiner",
    kind: "module",
    area: "service",
    color: "cyan",
    position: { x: 71, y: 56 },
    dnaPosition: { x: 1990, y: 1040 },
    minZoom: 0.35,
    icon: Wrench,
    tables: ["warranty_registrations", "warranty_registration_history", "service_machines", "service_registrations"],
    services: ["warrantyRegistrationsService", "warrantyMachinePinsService", "machineJournalService", "serviceMaintenanceService"],
    routes: ["/portal/service/warranty", "/portal/service/tsb", "/portal/service/machines"],
    receivesFrom: ["SharePoint warranty-sync", "Partnerdata", "Maskinregistreringer"],
    sendsTo: ["Partnerkort", "Maskinjournal", "TSB visninger"],
    integrations: ["Supabase", "SharePoint"],
    explanation: "Service samler garanti, maskiner, servicehistorik og TSB-relaterede visninger. Warranty-data kan komme fra SharePoint-sync.",
  },
  {
    id: "calendar",
    title: "Kalender",
    subtitle: "Aftaler, aktiviteter og deadlines",
    kind: "module",
    area: "calendar",
    color: "teal",
    position: { x: 80, y: 43 },
    dnaPosition: { x: 2230, y: 760 },
    minZoom: 0.35,
    icon: CalendarDays,
    tables: ["crm_calendar_activities"],
    services: ["crmCalendarService"],
    routes: ["/portal/crm/calendar"],
    receivesFrom: ["CRM aktiviteter", "Sælger-opfølgninger"],
    sendsTo: ["E-mail/n8n kalenderflow", "CRM dashboard"],
    integrations: ["Supabase", "n8n calendar webhook"],
    explanation: "Kalender er et selvstændigt portalmodul for aftaler, aktiviteter og deadlines. Det bruger crm_calendar_activities og eksisterende n8n-kalenderintegration.",
  },
  {
    id: "projects",
    title: "Projekter",
    subtitle: "Projekter, opgaver og opfølgning",
    kind: "module",
    area: "projects",
    color: "indigo",
    position: { x: 50, y: 68 },
    dnaPosition: { x: 1450, y: 1390 },
    minZoom: 0.35,
    icon: ClipboardList,
    tables: [],
    services: [],
    routes: [],
    receivesFrom: ["Kommende Project & Task Management"],
    sendsTo: [],
    integrations: [],
    explanation: "Projekter er reserveret som selvstændigt hovedmodul for Project & Task Management. Relationer til CRM, kalender, service og andre områder tilføjes først, når de faktisk implementeres.",
  },
  {
    id: "messe",
    title: "Timan Messe",
    subtitle: "QR-flow og messeleads",
    kind: "module",
    area: "messe",
    color: "rose",
    position: { x: 41, y: 79 },
    dnaPosition: { x: 1120, y: 1490 },
    minZoom: 0.35,
    icon: ClipboardList,
    tables: ["crm_leads", "portal_form_submissions", "guest_sessions"],
    services: ["messeLeadCapture", "portalFormsService", "MesseRouteGuard", "visitorTracking"],
    routes: ["/messe", "/messe/follow-up", "/messe/partner-map"],
    receivesFrom: ["Offentlige messeformularer", "Partnerkort", "Konfigurator"],
    sendsTo: ["CRM leads", "Portal analytics", "E-mail/n8n messe lead"],
    integrations: ["Supabase", "E-mail/n8n"],
    explanation: "Messe-flowet er en afgrænset portalvariant, hvor formularer og QR-flow kan oprette leads og aktivitetssporing.",
  },
  {
    id: "import",
    title: "Data & Integrationer",
    subtitle: "Sync, geocoding og dataload",
    kind: "module",
    area: "import",
    color: "orange",
    position: { x: 50, y: 88 },
    dnaPosition: { x: 1420, y: 1700 },
    minZoom: 0.35,
    icon: Upload,
    tables: ["sharepoint_sync_logs", "dealer_accounts", "warranty_registrations", "price_list_items", "crm_budget_rows"],
    services: ["SharePointSyncPanel", "WarrantySharePointSyncPanel", "dealerImportService", "priceListService", "syncStatusBadge"],
    routes: ["/portal/backend/data", "/portal/backend/dealer-import", "/portal/backend/budget-import"],
    receivesFrom: ["SharePoint", "Excel-filer", "Prislister"],
    sendsTo: ["Partnerdata", "Service", "Budget", "Salg"],
    integrations: ["SharePoint", "Supabase", "ERP/prisliste-import"],
    explanation: "Import-området samler sync-paneler, dry-run, historik, geocoding, budgetimport og prislister.",
  },
  {
    id: "system_admin",
    title: "Timan Backend",
    subtitle: "Brugere, roller og audit",
    kind: "module",
    area: "system",
    color: "slate",
    position: { x: 59, y: 79 },
    dnaPosition: { x: 1740, y: 1490 },
    minZoom: 0.35,
    icon: Settings,
    tables: ["app_users", "audit_log", "portal_module_usage", "guest_sessions"],
    services: ["backendUsersService", "module-access-store", "audit-log-store", "portalModuleUsageAnalyticsService"],
    routes: ["/portal/backend/users", "/portal/backend/audit-log", "/portal/backend/portal-analytics"],
    receivesFrom: ["Supabase Auth", "Brugereditor", "Portal tracking"],
    sendsTo: ["Access-resolver", "Audit Log", "Portal Analytics"],
    integrations: ["Supabase"],
    explanation: "Timan Backend styrer brugere, roller, moduladgang, audit log og brugeraktivitet.",
  },
];

export const SYSTEM_OVERVIEW_PORTAL_MODULE_NODE_BY_AREA: Record<PortalHomeAreaOrderId, SystemMapNodeId> = {
  salg_marketing: "sales",
  dealer_data: "dealer_data",
  timan_crm: "crm",
  marketing: "marketing",
  teknik_service: "service",
  calendar: "calendar",
  projects: "projects",
  messe: "messe",
  timan_backend: "system_admin",
};

export const SYSTEM_OVERVIEW_PORTAL_MODULE_NODE_IDS: SystemMapNodeId[] = PORTAL_HOME_AREA_ORDER.map(
  (areaId) => SYSTEM_OVERVIEW_PORTAL_MODULE_NODE_BY_AREA[areaId],
);

const integrationNodes: SystemMapNode[] = [
  {
    id: "sharepoint",
    title: "SharePoint",
    subtitle: "Forhandler- og warranty-kilde",
    kind: "integration",
    area: "import",
    color: "sky",
    position: { x: 10, y: 30 },
    dnaPosition: { x: 260, y: 660 },
    minZoom: 0.35,
    icon: Cable,
    tables: ["sharepoint_sync_logs"],
    services: ["sharepoint-dealers-*", "sharepoint-warranty-*"],
    routes: ["/portal/backend/data"],
    receivesFrom: ["Eksterne SharePoint-lister"],
    sendsTo: ["Data & Integrationer", "Partnerdata", "Service"],
    integrations: ["SharePoint"],
    explanation: "SharePoint bruges som ekstern kilde til forhandler- og warranty-sync via backend/edge-funktioner.",
  },
  {
    id: "erp",
    title: "ERP / Priser",
    subtitle: "Priser og økonomidata",
    kind: "integration",
    area: "import",
    color: "amber",
    position: { x: 10, y: 50 },
    dnaPosition: { x: 2550, y: 650 },
    minZoom: 0.35,
    icon: Server,
    tables: ["price_list_items", "price_list_import_runs"],
    services: ["priceListService", "pricePublishService"],
    routes: ["/portal/backend/price-lists"],
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
    area: "system",
    color: "emerald",
    position: { x: 10, y: 70 },
    dnaPosition: { x: 260, y: 1290 },
    minZoom: 0.35,
    icon: Database,
    tables: ["public schema", "auth users", "storage"],
    services: ["supabase client", "Supabase RPC", "Edge Functions"],
    routes: [],
    receivesFrom: ["Portal writes", "Import jobs", "Auth"],
    sendsTo: ["Alle portalfunktioner"],
    integrations: ["Supabase"],
    explanation: "Supabase er portalens database- og auth-lag samt hjem for RPC'er og Edge Functions.",
  },
  {
    id: "microsoft_365",
    title: "Microsoft 365",
    subtitle: "SharePoint, Excel og mailmiljø",
    kind: "integration",
    area: "import",
    color: "sky",
    position: { x: 90, y: 30 },
    dnaPosition: { x: 2550, y: 970 },
    minZoom: 0.45,
    icon: MonitorCog,
    tables: ["sharepoint_sync_logs"],
    services: ["SharePoint import panels", "Excel import"],
    routes: ["/portal/backend/data"],
    receivesFrom: ["Timan datafiler"],
    sendsTo: ["SharePoint", "E-mail / n8n"],
    integrations: ["Microsoft 365"],
    explanation: "Microsoft 365 er miljøet omkring SharePoint, Excel-importer og nogle mailflows.",
  },
  {
    id: "email",
    title: "E-mail / n8n",
    subtitle: "Tilbud, ordrer og kalender",
    kind: "integration",
    area: "sales",
    color: "rose",
    position: { x: 90, y: 50 },
    dnaPosition: { x: 2550, y: 1290 },
    minZoom: 0.35,
    icon: Mail,
    tables: ["configuration_email_log", "crm_calendar_activities"],
    services: ["webhookUrls", "configurationEmailLogService", "crmCalendarService"],
    routes: ["/portal/backend/data"],
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
    area: "sales",
    color: "violet",
    position: { x: 90, y: 70 },
    dnaPosition: { x: 2550, y: 1605 },
    minZoom: 0.35,
    icon: FileText,
    tables: ["configurations", "storage"],
    services: ["html2canvas", "jsPDF", "brochure pages"],
    routes: ["/portal/resources", "/portal/crm/quotes"],
    receivesFrom: ["Salg", "Brochurevisninger"],
    sendsTo: ["Download", "Storage", "E-mail payload"],
    integrations: ["PDF/document generation"],
    explanation: "Dokumentlaget genererer og viser PDF'er, tilbud, ordrer og brochuremateriale, når brugeren åbner de tunge flows.",
  },
  {
    id: "external_apis",
    title: "Eksterne API'er",
    subtitle: "Kort, geocoding og runtime config",
    kind: "integration",
    area: "import",
    color: "orange",
    position: { x: 90, y: 86 },
    dnaPosition: { x: 2550, y: 1880 },
    minZoom: 0.65,
    icon: Route,
    tables: ["runtime-config.js"],
    services: ["PartnerMapPage", "dealerGeocodingService", "CARTO basemaps"],
    routes: ["/portal/misc/partner-map"],
    receivesFrom: ["Runtime config", "Dealer geocoding"],
    sendsTo: ["Partnerkort", "Kortvisninger"],
    integrations: ["CARTO", "OpenStreetMap"],
    explanation: "Eksterne API'er bruges blandt andet til kort, geocoding og basemap-visninger.",
  },
];

const featureNodes: SystemMapNode[] = [
  node("crm_dashboard", "Dashboard", "KPI'er og sælgerfilter", "feature", "crm", "crm", 700, 260, 0.75, Gauge, ["crm_dashboard_kpis"], ["crmDashboardKpisService"], ["/portal/crm/dashboard"], "Server-side KPI'er for lead, pipeline, ordre og aktivitet."),
  node("crm_leads", "Leads", "Åbne leads og demoer", "feature", "crm", "crm", 720, 430, 0.72, Sparkles, ["crm_leads"], ["crmLeadsService", "crmPipelineValue"], ["/portal/crm/leads"], "Leadlisten, filtre, pipelineværdi og konverteringer."),
  node("crm_demo_leads", "Demo-leads", "Demo-flow og afholdt demo", "feature", "crm", "crm", 590, 520, 0.95, ClipboardList, ["crm_demo_leads", "crm_leads"], ["crmLeadsService"], ["/portal/crm/demo-leads"], "Demoer er knyttet til leadstatus og konverteringsflow."),
  node("crm_activities", "Aktiviteter", "Opfølgninger og historik", "feature", "crm", "crm", 850, 590, 0.9, Activity, ["crm_activities", "crm_calendar_activities"], ["crmActivitiesService", "crmCalendarService"], ["/portal/crm/activities"], "Aktiviteter viser hændelser på leads og opfølgninger."),
  node("crm_calendar", "Kalenderaktiviteter", "Aftaler, aktiviteter og deadlines", "feature", "calendar", "calendar", 2230, 940, 0.95, CalendarDays, ["crm_calendar_activities"], ["crmCalendarService"], ["/portal/crm/calendar"], "Kalenderen viser planlagte CRM-aktiviteter og n8n kalenderflow."),
  node("crm_pipeline", "Pipeline", "Værdi, status og forecast", "feature", "crm", "crm", 900, 340, 1.05, BarChart3, ["crm_leads.pipeline_value_snapshot"], ["crmPipelineValue"], ["/portal/crm/dashboard"], "Pipelineværdi samles fra snapshotfeltet og bruges i dashboardet."),
  node("lead_status", "Lead-status", "Åben, vundet, tabt", "data", "crm", "crm_leads", 510, 360, 1.28, Tags, ["crm_leads.status"], ["leadStatus"], ["/portal/crm/leads"], "Status styrer filtrering og pipelinefordeling."),
  node("lead_owner", "Ejer", "Sælgerinitialer og scope", "data", "crm", "crm_leads", 510, 450, 1.28, Contact, ["crm_leads.seller_id"], ["crmScope", "resolveSellerId"], ["/portal/crm/leads"], "Ejer bruges til sælgerfilter og Backend Alle."),
  node("lead_notes", "Interne / delte noter", "Visibility og kommentarer", "data", "crm", "crm_leads", 510, 610, 1.3, MessageSquareText, ["crm_dealer_notes"], ["dealerNotesService"], ["/portal/crm/my-dealers"], "Noter kan være interne eller delt mellem Timan og partner."),
  node("lead_followups", "Opfølgninger", "Næste opfølgning", "data", "crm", "crm_leads", 1030, 420, 1.25, CalendarDays, ["next_follow_up_date"], ["leadFollowupUrgency"], ["/portal/crm/leads"], "Opfølgningsdato driver Lead Fokus og deadlines."),
  node("lead_conversions", "Konverteringer", "Lead til demo/tilbud", "feature", "crm", "crm_leads", 1100, 270, 1.18, GitBranch, ["crm_leads", "configurations"], ["crmLeadSharingService", "crmConfigurationsService"], ["/portal/crm/leads"], "Konverteringer forbinder CRM med demo, tilbud og konfigurator."),

  node("configurator", "Byg din Timan", "Konfigurator", "feature", "sales", "sales", 1420, 680, 0.72, Boxes, ["configurations"], ["ConfiguratorPage", "configurationsService"], ["/configurator"], "Konfiguratoren opbygger tilbud og ordrer ud fra maskiner, udstyr, priser og kundeinfo."),
  node("config_step_machine", "Trin 1: Maskinvalg", "Maskiner og kategorier", "feature", "sales", "configurator", 1240, 800, 1.0, Package, ["configurations.state_json"], ["machineCategories"], ["/configurator"], "Første trin vælger maskine eller redskabstype."),
  node("config_step_delivery", "Trin 2: Levering", "Leveringsdato og start", "feature", "sales", "configurator", 1410, 865, 1.05, CalendarDays, ["configurations.state_json"], ["useConfigurator"], ["/configurator"], "Leverings- og startvalg gemmes i konfigurationens state."),
  node("config_step_options", "Trin 3: Udstyr/priser", "Tilvalg, rabat og pris", "feature", "sales", "configurator", 1590, 800, 1.05, Tags, ["configurations.state_json", "price_list_items"], ["priceListService", "quoteContentSummary"], ["/configurator"], "Tilvalg og rabatter påvirker den endelige tilbuds- og ordreværdi."),
  node("config_step_customer", "Trin 4: Kunde", "Kunde, forhandler og afslutning", "feature", "sales", "configurator", 1590, 965, 1.05, Contact, ["configurations.state_json", "dealer_accounts"], ["crmAccountsService"], ["/configurator"], "Kunde- og forhandlerdata binder konfigurationen til CRM."),
  node("quotes", "Tilbud", "Tilbudsværdi og PDF", "feature", "sales", "sales", 1280, 1130, 0.9, FileText, ["configurations"], ["crmConfigurationsService", "quoteContentSummary"], ["/portal/crm/quotes"], "Tilbud kommer fra configurations og kan sendes som PDF/mail."),
  node("orders", "Ordrer", "Ordreværdi og lukning", "feature", "sales", "sales", 1540, 1130, 0.9, ShoppingBag, ["configurations"], ["crmConfigurationsService"], ["/portal/crm/orders"], "Ordrer bruger samme konfigurationsgrundlag som tilbud."),
  node("saved_cases", "Gemte/lukkede sager", "Min konto og skjulte sager", "feature", "sales", "configurator", 1740, 680, 1.1, WalletCards, ["configuration_user_hidden"], ["configurationsService"], ["/configurator"], "Brugere kan gemme, åbne og skjule egne konfigurationer."),
  node("machine_timan_2620", "Timan 2620", "Maskine", "data", "sales", "config_step_machine", 1130, 925, 1.35, Package, ["configurations.state_json"], ["ConfiguratorPage"], ["/portal/timan-2620"], "Timan 2620 findes i konfigurator og messevisninger."),
  node("machine_timan_3330", "Timan 3330", "Maskine", "data", "sales", "config_step_machine", 1130, 1025, 1.35, Package, ["configurations.state_json"], ["ConfiguratorPage"], ["/configurator"], "Timan 3330 bruges i leads, konfigurator og tilbud."),
  node("machine_rc_751", "RC-751", "Redskab", "data", "sales", "config_step_machine", 1130, 1125, 1.35, Package, ["configurations.state_json"], ["ConfiguratorPage"], ["/messe/rc-751"], "RC-751 bruges i konfigurator, messe og serviceflows."),
  node("machine_rc_1000s", "RC-1000s", "Redskab", "data", "sales", "config_step_machine", 1130, 1225, 1.35, Package, ["configurations.state_json"], ["ConfiguratorPage"], ["/messe/rc-1000s"], "RC-1000s bruges i konfigurator, messe og serviceflows."),
  node("machine_loader_line", "Loader Line", "Kategori", "data", "sales", "config_step_machine", 1130, 1325, 1.4, Package, ["configurations.state_json"], ["ConfiguratorPage"], ["/configurator"], "Loader Line og traktormonterede redskaber er produktvalg i konfiguratorflowet."),

  node("messe_form", "Messeformular", "Follow-up og QR", "feature", "messe", "messe", 910, 1650, 0.9, FormInput, ["portal_form_submissions", "crm_leads"], ["MesseFollowUpPage", "messeLeadCapture"], ["/messe/follow-up"], "Messeformularen opretter messeleads og mailflow."),
  node("messe_leads", "Messe Lead", "Lead fra messe", "feature", "messe", "messe_form", 1050, 1760, 0.95, Sparkles, ["crm_leads"], ["messeLeadCapture"], ["/portal/crm/leads"], "Messeleads sendes videre til CRM og sælgere."),
  node("messe_partner_map", "Partnerkort", "Kort og forhandlere", "feature", "messe", "messe", 1220, 1660, 0.95, Map, ["dealer_accounts"], ["PartnerMapPage"], ["/messe/partner-map", "/portal/misc/partner-map"], "Partnerkort viser forhandlere, servicepartnere og importører på kort."),
  node("messe_brochures", "Brochurer", "PDF og produktsider", "feature", "messe", "messe", 1310, 1810, 1.05, BookOpen, ["storage"], ["MesseMachineBrochurePage"], ["/messe/rc-751", "/messe/rc-1000s"], "Brochurer og maskinsider åbnes først ved behov."),
  node("messe_video", "Videoer", "Video galleri", "feature", "messe", "messe", 900, 1860, 1.1, Video, ["videoCategories"], ["MesseVideoPage", "VideoGalleryPage"], ["/messe/video", "/portal/videos"], "Videoer bruges i messe og portalens videogalleri."),
  node("messe_trials", "Afprøvninger", "Timan 2620 trial", "feature", "messe", "messe", 1180, 1960, 1.15, ClipboardList, ["trial submissions"], ["Timan2620TrialPage"], ["/messe/timan-2620-afproevning"], "Afprøvningsflowet indsamler test og feedback."),

  node("news", "Nyheder", "CMS og publicering", "feature", "marketing", "marketing", 1840, 700, 0.9, Newspaper, ["news_posts"], ["newsService", "newsCmsTranslations"], ["/portal/marketing/news/overview"], "Nyheder oprettes og publiceres fra Marketing."),
  node("site_features", "Nye features på sitet", "Intern changelog", "feature", "marketing", "marketing", 2050, 700, 0.9, Sparkles, ["site_change_entries", "site_change_public_entries"], ["portalChangelogService"], ["/portal/marketing/site-features"], "Marketing vælger hvilke ændringer der publiceres til 'Hvad er nyt?'."),
  node("marketing_targets", "Målgrupper", "Roller og segmenter", "data", "marketing", "site_features", 2140, 850, 1.2, Users, ["site_change_entries.target_audiences"], ["portalChangelogService"], ["/portal/marketing/site-features"], "Målgrupper styrer hvem en publiceret ændring er relevant for."),
  node("campaigns", "Kampagner/materialer", "Marketingmateriale", "feature", "marketing", "marketing", 1930, 900, 1.1, Megaphone, ["news_posts"], ["newsService"], ["/portal/marketing"], "Marketing-området samler kampagner, nyheder og materialer."),
  node("messe_news", "Messe-nyheder", "Nyheder i messeflow", "feature", "marketing", "news", 1740, 860, 1.15, Newspaper, ["news_posts"], ["MesseNewsPage"], ["/messe/nyt"], "Nyheder kan vises i messeportalen."),

  node("dealer_profile", "Forhandlerprofil", "Stamdata og overblik", "feature", "dealer_data", "dealer_data", 670, 1210, 0.9, Contact, ["dealer_accounts", "dealer_contacts"], ["crmAccountsService"], ["/portal/crm/my-dealers"], "Forhandlerprofilen viser stamdata, KPI'er, noter og relationer."),
  node("dealer_relations", "Samarbejdspartnere", "Parent/children", "feature", "dealer_data", "dealer_data", 870, 1330, 1.0, GitBranch, ["dealer_accounts.parent_account_number"], ["partnerRelationsService"], ["/portal/backend/partner-relations"], "Relationer binder importører, forhandlere, servicepartnere og forhandlerkunder sammen."),
  node("dealer_notes", "Noter", "Interne og delte noter", "data", "dealer_data", "dealer_profile", 620, 1390, 1.2, MessageSquareText, ["crm_dealer_notes"], ["dealerNotesService"], ["/portal/crm/my-dealers"], "Noter hører til forhandlerprofilen og kan deles efter visibility-regler."),
  node("dealer_users", "Brugere/kontakter", "Partnerbrugere", "data", "dealer_data", "dealer_profile", 520, 1270, 1.25, Users, ["app_users", "dealer_contacts"], ["backendUsersService"], ["/portal/backend/users"], "Partnerbrugere kobles til dealer_accounts."),
  node("dealer_geocoding", "Geocoding", "Adresser og koordinater", "feature", "import", "import", 1020, 1510, 1.0, Map, ["dealer_accounts.latitude", "dealer_accounts.longitude", "warranty_registrations.customer_latitude", "warranty_registrations.customer_longitude"], ["geocode-dealers", "geocode-warranty-customers", "dealerGeocodingService"], ["/portal/backend/geocoding"], "Geocoding samler adresseberigelse for partnerkonti og garantikunder, så kort og geografiske visninger kan bruge koordinater."),

  node("warranty", "Warranty", "Garantiregistreringer", "feature", "service", "service", 2150, 1210, 0.9, ShieldCheck, ["warranty_registrations"], ["warrantyRegistrationsService"], ["/portal/service/warranty"], "Warranty samler garantiregistreringer og matching."),
  node("tsb", "TSB", "Technical Service Bulletins", "feature", "service", "service", 2320, 1330, 0.95, ClipboardList, ["tsb records"], ["TsbAccessGuard"], ["/portal/service/tsb"], "TSB-området håndterer tekniske service bulletins."),
  node("machine_journal", "Maskinjournal", "Maskiner og historik", "feature", "service", "service", 2050, 1390, 1.0, Wrench, ["service_machines", "service_registrations"], ["machineJournalService"], ["/portal/service/machines"], "Maskinjournal samler servicehistorik pr. serienummer."),
  node("claims", "Claims", "Reklamationer", "feature", "service", "service", 2240, 1510, 1.05, ClipboardList, ["claims"], ["claimsService"], ["/portal/service/claims"], "Claims bruges til reklamationer og sagsbehandling."),

  node("dealer_import", "Dealer Import", "Forhandlerimport", "feature", "import", "import", 1210, 1880, 0.95, Upload, ["dealer_accounts", "sharepoint_sync_logs"], ["dealerImportService"], ["/portal/backend/dealer-import"], "Dealer Import opdaterer forhandlerdata fra eksterne kilder."),
  node("budget_import", "Budget Import", "Excel til CRM Budget", "feature", "import", "import", 1440, 1940, 1.0, Upload, ["crm_budget_rows"], ["budgetImportService"], ["/portal/backend/budget-import"], "Budget Import flytter Excel-budgetter ind i CRM Budget."),
  node("price_lists", "Prislister", "Prisimport og publicering", "feature", "import", "import", 1660, 1880, 0.95, Tags, ["price_list_items", "price_list_import_runs"], ["priceListService"], ["/portal/backend/price-lists"], "Prislister forsyner konfigurator og budget med priser."),
  node("sync_logs", "Sync logs", "Historik og fejl", "technical", "import", "import", 1440, 2110, 1.3, Activity, ["sharepoint_sync_logs"], ["syncStatusBadge"], ["/portal/backend/data"], "Sync logs viser importstatus, fejl og historik."),

  node("users_admin", "Brugere", "App users og roller", "feature", "system", "system_admin", 1600, 1660, 0.95, Users, ["app_users"], ["backendUsersService"], ["/portal/backend/users"], "Brugeradministration styrer portalbrugere og deres adgang."),
  node("roles_access", "Roller og modul-adgang", "Effective access", "feature", "system", "system_admin", 1780, 1730, 1.0, KeyRound, ["app_users.allowed_areas", "app_users.allowed_modules"], ["module-access-store", "sessionPermissionDefaults"], ["/portal/backend/roles", "/portal/backend/module-access"], "Roller og moduladgang er grundlaget for navigation og guards."),
  node("audit_log", "Audit Log", "Hvem ændrede hvad", "feature", "system", "system_admin", 1960, 1660, 1.0, ClipboardList, ["audit_log"], ["audit-log-store"], ["/portal/backend/audit-log"], "Audit Log viser kritiske ændringer med actor, record og old/new values."),
  node("portal_analytics", "Portal Analytics", "Modulbrug", "feature", "system", "system_admin", 1880, 1880, 1.05, BarChart3, ["portal_module_usage", "guest_sessions"], ["portalModuleUsageAnalyticsService"], ["/portal/backend/portal-analytics"], "Portal Analytics viser brug af moduler og aktiv tid."),
  node("route_guards", "Route guards", "Adgang og redirect", "technical", "system", "roles_access", 1660, 1990, 1.35, Route, ["app_users"], ["portalAccess", "MesseRouteGuard", "TsbAccessGuard"], ["/portal"], "Route guards sikrer adgang efter effektiv rolle og tilvalg."),
  node("edge_functions", "Edge Functions / RPC", "Server-side logik", "technical", "system", "supabase", 520, 1500, 1.4, Server, ["Supabase RPC", "Edge Functions"], ["admin-user-actions", "geocode-dealers"], [], "Server-side funktioner bruges til admin-handlinger, imports og KPI'er."),
  node("product_owner", "Product Owner / Idé", "Forbedringsønsker", "process", "system", "system_admin", 470, 2100, 1.05, Sparkles, ["AGENTS.md", "pasted task prompts"], ["Codex task flow"], [], "Idéer og konkrete ønsker starter som menneskelig prioritering, før de bliver til kodeændringer."),
  node("codex_agent", "Codex", "Udviklingsagent", "tool", "system", "product_owner", 720, 2100, 1.05, Sparkles, ["working tree"], ["Codex", "npm scripts", "Supabase CLI"], [], "Codex arbejder i kodebasen, tester ændringer og sender relevante commits gennem Git/GitHub."),
  node("codebase", "Kodebase", "React, Vite og Supabase", "technical", "system", "codex_agent", 970, 2100, 1.05, GitBranch, ["src", "supabase", ".github"], ["Vite", "Vitest", "Supabase migrations"], [], "Kodebasen indeholder portalens frontend, tests, workflows og databaseændringer."),
  node("github_repo", "GitHub", "Versioner og main branch", "technical", "system", "codebase", 1220, 2100, 1.05, GitBranch, [".git", "origin/main"], ["Git", "GitHub repository"], [], "GitHub er versionshistorik og forbindelsen videre til workflows og Lovable-sync."),
  node("github_actions", "GitHub Actions", "Workflows", "tool", "system", "github_repo", 1470, 2100, 1.12, Activity, [".github/workflows"], ["build/test workflows", "Import site changes"], [], "GitHub Actions kører de workflows, der faktisk findes i repoet, når de er aktiveret og konfigureret."),
  node("test_build", "Tests / build", "Kvalitetskontrol", "technical", "system", "github_actions", 1720, 2100, 1.12, Gauge, ["package.json", "vitest.config.ts"], ["npm run test", "npm run build", "git diff --check"], [], "Tests og build validerer ændringer før de bruges som grundlag for deployment."),
  node("lovable_deploy", "Lovable / Deployment", "Preview og produktion", "tool", "system", "test_build", 1970, 2100, 1.12, Upload, ["dist", "public/runtime-config.js"], ["Lovable sync", "Vite build"], [], "Lovable bygger/deployer frontend ud fra GitHub-flowet og bruger public runtime config ved behov."),
  node("supabase_migrations", "Supabase migrations", "Databaseændringer", "technical", "system", "codebase", 1220, 1930, 1.18, Database, ["supabase/migrations", "Supabase RPC", "Edge Functions"], ["Supabase CLI"], [], "Supabase migrations og RPC'er deployes særskilt, når en ændring kræver database- eller server-side logik."),
];

function node(
  id: SystemMapNodeId,
  title: string,
  subtitle: string,
  kind: SystemMapNodeKind,
  area: SystemMapArea,
  parentId: SystemMapNodeId,
  x: number,
  y: number,
  minZoom: number,
  icon: LucideIcon,
  tables: string[],
  services: string[],
  routes: string[],
  explanation: string,
): SystemMapNode {
  const knownParents = [...baseNodes, ...integrationNodes];
  const parent = knownParents.find((item) => item.id === parentId);
  const areaNode = baseNodes.find((item) => item.area === area);
  return {
    id,
    title,
    subtitle,
    kind,
    area,
    parentId,
    color: parent?.color ?? areaNode?.color ?? AREA_COLORS[area],
    position: parent?.position ?? areaNode?.position ?? { x: 50, y: 50 },
    dnaPosition: { x, y },
    minZoom,
    icon,
    tables,
    services,
    routes,
    receivesFrom: parent ? [parent.title] : areaNode ? [areaNode.title] : [],
    sendsTo: [],
    integrations: parent?.integrations ?? areaNode?.integrations ?? [],
    explanation,
  };
}

export const systemRegistryNodes: SystemMapNode[] = [...baseNodes, ...integrationNodes, ...featureNodes];

export const systemMapNodes: SystemMapNode[] = systemRegistryNodes.filter((nodeItem) =>
  nodeItem.kind === "portal" || (nodeItem.kind === "module" && !nodeItem.parentId) || nodeItem.kind === "integration"
);

export const systemDnaNodes: SystemMapNode[] = systemRegistryNodes;

const expandedDnaPositions: Partial<Record<SystemMapNodeId, { feature?: SystemDnaPoint; technical?: SystemDnaPoint }>> = {
  crm_dashboard: { feature: { x: 620, y: 230 } },
  crm_leads: { feature: { x: 620, y: 520 } },
  crm_demo_leads: { feature: { x: 360, y: 660 } },
  crm_activities: { feature: { x: 820, y: 800 } },
  crm_calendar: { feature: { x: 2230, y: 940 } },
  crm_pipeline: { feature: { x: 1080, y: 330 } },
  lead_conversions: { feature: { x: 1390, y: 220 } },
  lead_status: { technical: { x: 350, y: 360 } },
  lead_owner: { technical: { x: 350, y: 510 } },
  lead_notes: { technical: { x: 420, y: 820 } },
  lead_followups: { technical: { x: 1200, y: 510 } },

  configurator: { feature: { x: 1420, y: 660 } },
  config_step_machine: { feature: { x: 1120, y: 780 } },
  config_step_delivery: { feature: { x: 1370, y: 930 } },
  config_step_options: { feature: { x: 1680, y: 780 } },
  config_step_customer: { feature: { x: 1700, y: 1010 } },
  quotes: { feature: { x: 1210, y: 1220 } },
  orders: { feature: { x: 1590, y: 1220 } },
  saved_cases: { feature: { x: 1760, y: 620 } },
  machine_timan_2620: { technical: { x: 890, y: 910 } },
  machine_timan_3330: { technical: { x: 890, y: 1030 } },
  machine_rc_751: { technical: { x: 890, y: 1150 } },
  machine_rc_1000s: { technical: { x: 890, y: 1270 } },
  machine_loader_line: { technical: { x: 890, y: 1390 } },

  messe_form: { feature: { x: 880, y: 1660 } },
  messe_leads: { feature: { x: 1080, y: 1820 } },
  messe_partner_map: { feature: { x: 1260, y: 1640 } },
  messe_brochures: { feature: { x: 1330, y: 1880 } },
  messe_video: { feature: { x: 850, y: 1920 } },
  messe_trials: { feature: { x: 1160, y: 2020 } },

  news: { feature: { x: 1760, y: 720 } },
  site_features: { feature: { x: 2070, y: 720 } },
  marketing_targets: { feature: { x: 2240, y: 920 } },
  campaigns: { feature: { x: 1960, y: 940 } },
  messe_news: { feature: { x: 1650, y: 920 } },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mixPoint(from: SystemDnaPoint, to: SystemDnaPoint, progress: number): SystemDnaPoint {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

export function getSystemDnaNodePosition(node: SystemMapNode, zoom: number): SystemDnaPoint {
  const expanded = expandedDnaPositions[node.id];
  if (!expanded) return node.dnaPosition;

  const featureProgress = clamp((zoom - 1.02) / 0.24, 0, 1);
  const technicalProgress = clamp((zoom - 1.28) / 0.2, 0, 1);
  const featurePosition = expanded.feature ? mixPoint(node.dnaPosition, expanded.feature, featureProgress) : node.dnaPosition;

  if (!expanded.technical) return featurePosition;
  return mixPoint(featurePosition, expanded.technical, technicalProgress);
}

export const systemMapEdges: SystemMapEdge[] = [
  { from: "sharepoint", to: "import", label: "sync", kind: "sync" },
  { from: "microsoft_365", to: "sharepoint", label: "kilde", kind: "sync", minZoom: 0.65 },
  { from: "import", to: "dealer_data", label: "stamdata", kind: "data" },
  { from: "import", to: "service", label: "warranty", kind: "data" },
  { from: "import", to: "sales", label: "priser", kind: "data" },
  { from: "erp", to: "import", label: "priser", kind: "sync" },
  { from: "dealer_data", to: "crm", label: "scope", kind: "permission" },
  { from: "dealer_data", to: "service", label: "matching", kind: "data" },
  { from: "dealer_data", to: "messe", label: "partnerkort", kind: "data", minZoom: 0.8 },
  { from: "messe", to: "crm", label: "leads", kind: "data" },
  { from: "marketing", to: "messe", label: "nyheder", kind: "data", minZoom: 0.8 },
  { from: "crm", to: "sales", label: "tilbud/status", kind: "conversion", direction: "bidirectional" },
  { from: "crm", to: "calendar", label: "aktiviteter", kind: "data" },
  { from: "sales", to: "documents", label: "PDF", kind: "data" },
  { from: "sales", to: "email", label: "webhook", kind: "data" },
  { from: "calendar", to: "email", label: "kalender", kind: "data" },
  { from: "system_admin", to: "portal", label: "adgang", kind: "permission" },
  { from: "portal", to: "supabase", label: "data", kind: "data" },
  { from: "supabase", to: "crm", label: "RPC", kind: "data" },
  { from: "supabase", to: "calendar", label: "aktiviteter", kind: "data" },
  { from: "supabase", to: "marketing", label: "CMS", kind: "data" },
  { from: "supabase", to: "dealer_data", label: "konti", kind: "data" },
  { from: "supabase", to: "service", label: "service", kind: "data" },
  { from: "external_apis", to: "messe", label: "kort", kind: "data", minZoom: 0.8 },
];

export const systemOverviewLines: SystemOverviewLine[] = [
  { from: "sharepoint", to: "import", dashed: true },
  { from: "microsoft_365", to: "sharepoint", dashed: true },
  { from: "erp", to: "import", dashed: true },
  { from: "supabase", to: "portal", dashed: true },
  { from: "crm", to: "portal", colorFrom: "crm" },
  { from: "sales", to: "portal", colorFrom: "sales" },
  { from: "service", to: "portal", colorFrom: "service" },
  { from: "calendar", to: "portal", colorFrom: "calendar" },
  { from: "projects", to: "portal", colorFrom: "projects" },
  { from: "marketing", to: "portal", colorFrom: "marketing" },
  { from: "system_admin", to: "portal", colorFrom: "system_admin" },
  { from: "dealer_data", to: "portal", colorFrom: "dealer_data" },
  { from: "import", to: "portal", colorFrom: "import" },
  { from: "messe", to: "portal", colorFrom: "messe" },
  { from: "dealer_data", to: "crm", colorFrom: "dealer_data", dashed: true },
  { from: "dealer_data", to: "messe", colorFrom: "dealer_data", dashed: true },
  { from: "messe", to: "crm", colorFrom: "messe", dashed: true },
  { from: "crm", to: "calendar", colorFrom: "crm", dashed: true },
  { from: "crm", to: "sales", colorFrom: "crm", dashed: true },
  { from: "import", to: "sales", colorFrom: "import", dashed: true },
  { from: "sales", to: "documents", colorFrom: "sales" },
  { from: "sales", to: "email", colorFrom: "sales" },
  { from: "calendar", to: "email", colorFrom: "calendar", dashed: true },
  { from: "external_apis", to: "messe", colorFrom: "import", dashed: true },
  { from: "portal", to: "portal_analytics", colorFrom: "system_admin" },
];

export const systemDnaEdges: SystemMapEdge[] = [
  ...systemMapEdges,
  ...systemDnaNodes
    .filter((nodeItem) => nodeItem.parentId)
    .map((nodeItem) => ({
      from: nodeItem.parentId as SystemMapNodeId,
      to: nodeItem.id,
      label: "indeholder",
      kind: "navigation" as const,
      minZoom: Math.max(0.7, nodeItem.minZoom - 0.1),
    })),
  { from: "messe_form", to: "messe_leads", label: "opretter", kind: "data", minZoom: 0.9 },
  { from: "messe_leads", to: "crm_leads", label: "bliver til", kind: "data", minZoom: 0.95 },
  { from: "crm_leads", to: "crm_activities", label: "aktivitet", kind: "data", minZoom: 1.0 },
  { from: "crm_leads", to: "lead_conversions", label: "konverteres", kind: "conversion", minZoom: 1.1 },
  { from: "lead_conversions", to: "crm_demo_leads", label: "demo", kind: "conversion", minZoom: 1.0 },
  { from: "lead_conversions", to: "configurator", label: "starter tilbud", kind: "conversion", minZoom: 1.0 },
  { from: "configurator", to: "quotes", label: "gemmer tilbud", kind: "data", minZoom: 0.95 },
  { from: "quotes", to: "orders", label: "bliver ordre", kind: "conversion", minZoom: 1.0 },
  { from: "configurator", to: "orders", label: "ordre", kind: "data", minZoom: 0.95 },
  { from: "configurator", to: "documents", label: "PDF", kind: "data", minZoom: 1.0 },
  { from: "quotes", to: "documents", label: "tilbuds-PDF", kind: "data", minZoom: 1.05 },
  { from: "orders", to: "documents", label: "ordre-PDF", kind: "data", minZoom: 1.05 },
  { from: "documents", to: "email", label: "vedhæftes", kind: "data", minZoom: 1.05 },
  { from: "orders", to: "dealer_profile", label: "kunde/forhandler", kind: "data", minZoom: 1.0 },
  { from: "dealer_profile", to: "crm_dashboard", label: "KPI", kind: "data", minZoom: 1.0 },
  { from: "erp", to: "price_lists", label: "importgrundlag", kind: "sync", minZoom: 0.95 },
  { from: "price_lists", to: "configurator", label: "publicerede priser", kind: "data", minZoom: 0.95 },
  { from: "price_lists", to: "config_step_options", label: "priser", kind: "data", minZoom: 1.05 },
  { from: "dealer_import", to: "dealer_profile", label: "opdaterer", kind: "sync", minZoom: 1.0 },
  { from: "dealer_data", to: "messe_partner_map", label: "forhandlere", kind: "data", minZoom: 0.95 },
  { from: "external_apis", to: "messe_partner_map", label: "kortlag", kind: "data", minZoom: 0.95 },
  { from: "messe_form", to: "email", label: "messe-mail", kind: "data", minZoom: 1.0 },
  { from: "warranty", to: "machine_journal", label: "maskiner", kind: "data", minZoom: 1.05 },
  { from: "external_apis", to: "dealer_geocoding", label: "geocoding", kind: "sync", minZoom: 0.8 },
  { from: "dealer_geocoding", to: "dealer_data", label: "partner-koordinater", kind: "data", minZoom: 0.9 },
  { from: "dealer_geocoding", to: "service", label: "garantikunde-koordinater", kind: "data", minZoom: 0.9 },
  { from: "news", to: "messe_news", label: "publicerer", kind: "data", minZoom: 1.1 },
  { from: "news", to: "portal", label: "Seneste nyt", kind: "data", minZoom: 0.95 },
  { from: "site_features", to: "portal", label: "Hvad er nyt", kind: "data", minZoom: 0.95 },
  { from: "users_admin", to: "roles_access", label: "tildeler", kind: "permission", minZoom: 1.0 },
  { from: "roles_access", to: "route_guards", label: "styrer", kind: "permission", minZoom: 1.25 },
  { from: "route_guards", to: "portal", label: "adgang", kind: "permission", minZoom: 1.25 },
  { from: "audit_log", to: "users_admin", label: "logger", kind: "data", minZoom: 1.1 },
  { from: "portal_analytics", to: "portal", label: "brug", kind: "data", minZoom: 1.05 },
  { from: "edge_functions", to: "supabase", label: "server", kind: "data", minZoom: 1.35 },
  { from: "product_owner", to: "codex_agent", label: "opgave", kind: "development", minZoom: 1.0 },
  { from: "codex_agent", to: "codebase", label: "ændrer kode", kind: "development", minZoom: 1.0 },
  { from: "codebase", to: "github_repo", label: "commit/push", kind: "development", minZoom: 1.0 },
  { from: "github_repo", to: "github_actions", label: "workflow", kind: "development", minZoom: 1.08 },
  { from: "github_actions", to: "test_build", label: "validerer", kind: "development", minZoom: 1.08 },
  { from: "test_build", to: "lovable_deploy", label: "klar til deploy", kind: "development", minZoom: 1.08 },
  { from: "lovable_deploy", to: "portal", label: "frontend", kind: "development", minZoom: 1.08 },
  { from: "codebase", to: "supabase_migrations", label: "migration/RPC", kind: "development", minZoom: 1.12 },
  { from: "supabase_migrations", to: "supabase", label: "deploy", kind: "development", minZoom: 1.12 },
];

export const featuredDataFlow: SystemMapNodeId[] = [
  "messe_form",
  "messe_leads",
  "crm_leads",
  "crm_activities",
  "lead_conversions",
  "quotes",
  "configurator",
  "orders",
  "dealer_profile",
  "crm_dashboard",
];

export const featuredDataFlows: Record<string, SystemMapNodeId[]> = {
  messe_form: ["messe_form", "messe_leads", "crm_leads", "lead_conversions", "configurator", "quotes", "orders", "documents", "email"],
  messe_leads: ["messe_leads", "crm_leads", "lead_conversions", "configurator", "quotes", "orders"],
  crm_leads: ["crm_leads", "lead_conversions", "configurator", "quotes", "orders", "documents", "email"],
  lead_conversions: ["crm_leads", "lead_conversions", "configurator", "quotes", "orders", "documents", "email"],
  configurator: [
    "configurator",
    "config_step_machine",
    "config_step_delivery",
    "config_step_options",
    "config_step_customer",
    "quotes",
    "orders",
    "documents",
    "email",
  ],
  quotes: ["crm_leads", "lead_conversions", "configurator", "quotes", "documents", "email"],
  orders: ["quotes", "configurator", "orders", "dealer_profile", "crm_dashboard"],
  news: ["news", "site_features", "messe_news", "portal"],
  site_features: ["site_features", "portal", "marketing"],
  marketing: ["marketing", "news", "site_features", "messe_news", "portal"],
};

export function findSystemMapNode(id: SystemMapNodeId): SystemMapNode {
  return systemRegistryNodes.find((nodeItem) => nodeItem.id === id) ?? systemRegistryNodes[0];
}

export function getSystemMapChildren(id: SystemMapNodeId): SystemMapNode[] {
  return systemRegistryNodes.filter((nodeItem) => nodeItem.parentId === id);
}

export function getSystemDnaZoomStage(zoom: number): SystemDnaZoomLevel {
  return [...SYSTEM_DNA_ZOOM_LEVELS].reverse().find((level) => zoom >= level.zoom - 0.02) ?? SYSTEM_DNA_ZOOM_LEVELS[0];
}

export function getSystemDnaZoomForNode(node: SystemMapNode, currentZoom = SYSTEM_DNA_INITIAL_ZOOM): number {
  const targetZoom =
    node.kind === "portal"
      ? SYSTEM_DNA_ZOOM_LEVELS[0].zoom
      : node.kind === "module" || node.kind === "integration"
        ? SYSTEM_DNA_ZOOM_LEVELS[1].zoom
        : node.kind === "feature" || node.kind === "process" || node.kind === "tool"
          ? Math.max(SYSTEM_DNA_ZOOM_LEVELS[2].zoom, node.minZoom + 0.1)
          : Math.max(SYSTEM_DNA_ZOOM_LEVELS[3].zoom, node.minZoom + 0.08);

  return Math.min(SYSTEM_DNA_MAX_ZOOM, Math.max(currentZoom, targetZoom));
}

export function getSystemDnaAncestors(id: SystemMapNodeId): SystemMapNodeId[] {
  const ancestors: SystemMapNodeId[] = [];
  let current = findSystemMapNode(id);

  while (current.parentId) {
    ancestors.push(current.parentId);
    current = findSystemMapNode(current.parentId);
  }

  return ancestors;
}

export function getSystemDnaDescendantIds(id: SystemMapNodeId, maxDepth = 2): SystemMapNodeId[] {
  const descendants: SystemMapNodeId[] = [];

  function walk(parentId: SystemMapNodeId, depth: number) {
    if (depth > maxDepth) return;
    for (const child of getSystemMapChildren(parentId)) {
      descendants.push(child.id);
      walk(child.id, depth + 1);
    }
  }

  walk(id, 1);
  return descendants;
}

export function getFeaturedDataFlow(selectedId: SystemMapNodeId): SystemMapNodeId[] {
  if (featuredDataFlows[selectedId]) return featuredDataFlows[selectedId];

  const selectedAncestors = getSystemDnaAncestors(selectedId);
  const ancestorFlow = selectedAncestors.find((ancestorId) => featuredDataFlows[ancestorId]);
  if (ancestorFlow) return featuredDataFlows[ancestorFlow];

  return featuredDataFlow;
}

export function getSystemDnaFocusIds(selectedId: SystemMapNodeId, includeEdges = true): Set<SystemMapNodeId> {
  const ids = new Set<SystemMapNodeId>([
    selectedId,
    ...getSystemDnaAncestors(selectedId),
    ...getSystemDnaDescendantIds(selectedId, 1),
  ]);

  if (!includeEdges) return ids;

  for (const edge of systemDnaEdges) {
    if (ids.has(edge.from)) ids.add(edge.to);
    if (ids.has(edge.to)) ids.add(edge.from);
  }

  return ids;
}

export function getVisibleSystemDnaNodes(
  zoom: number,
  area: "all" | SystemMapArea = "all",
  query = "",
): SystemMapNode[] {
  const q = query.trim().toLowerCase();

  return systemDnaNodes.filter((nodeItem) => {
    if (nodeItem.minZoom > zoom) return false;
    if (area !== "all" && nodeItem.area !== area) return false;
    if (!q) return true;
    return [
      nodeItem.title,
      nodeItem.subtitle,
      nodeItem.explanation,
      ...nodeItem.tables,
      ...nodeItem.services,
      ...nodeItem.routes,
      ...nodeItem.integrations,
    ].some((value) => value.toLowerCase().includes(q));
  });
}
