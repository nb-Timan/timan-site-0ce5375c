/**
 * Central translation registry for portal labels.
 *
 * - Add a new language: create an entry in `translations` keyed by its
 *   `PortalUiLanguage` code. Missing keys fall back to English, then Danish.
 * - Add a new label: add the key under `da` and `en` at minimum. Other
 *   languages spread `...en` and override only what they translate.
 * - Never throws: `t(key, lang)` returns the key itself if nothing matches.
 *
 * This is the recommended home for ALL new shared labels. Existing page-level
 * `Record<Language, T>` objects continue to work via the legacy mapping
 * (sv/fr/pl/cs → 'en'), so adoption can be incremental.
 */
import type { PortalUiLanguage } from '@/lib/portalLanguages';

type Dict = Record<string, string>;

// ---------------------------------------------------------------------------
// Danish (source of truth)
// ---------------------------------------------------------------------------
const da: Dict = {
  // Generic
  save: 'Gem', cancel: 'Annullér', edit: 'Redigér', delete: 'Slet',
  loading: 'Indlæser…', search: 'Søg', back: 'Tilbage', next: 'Næste',
  previous: 'Forrige', close: 'Luk', yes: 'Ja', no: 'Nej', open: 'Åbn',
  updated: 'Opdateret', noResults: 'Ingen resultater', confirm: 'Bekræft',
  required: 'Påkrævet', optional: 'Valgfri',

  // Navigation / modules
  navDashboard: 'Dashboard', navCrm: 'CRM', navConfigurator: 'Konfigurator',
  navService: 'Service', navBackend: 'Backend', navResources: 'Ressourcer',
  navPartnerMap: 'Partnerkort', navProfile: 'Profil',

  // Status
  statusActive: 'Aktiv', statusInactive: 'Inaktiv', statusPending: 'Afventer',
  statusBlocked: 'Spærret', statusDeleted: 'Slettet',

  // System
  errorGeneric: 'Noget gik galt. Prøv igen.', saved: 'Gemt',
  unsavedChanges: 'Ugemte ændringer', requiredField: 'Dette felt er påkrævet',

  // Portal front page
  loginNeeded: 'Log ind for at fortsætte',
  heroTitle: 'Velkommen til Timan Portalen',
  heroBody: 'Vælg et område for at komme i gang.',
  heroAlt: 'Timan industri',
  openArea: 'Åbn område',
  backToPortal: 'Tilbage til portal',
  backToSalesMarketing: 'Tilbage til Salg & Marketing',
  backToTechnicalService: 'Tilbage til Teknik & Service',
  backToCrm: 'Tilbage til CRM',

  // Portal areas (titles + descriptions, used by AreaCard via key lookup)
  area_salg_marketing_title: 'Salg & Marketing',
  area_salg_marketing_desc: 'Konfigurator, tilbud, ordrer og salgsværktøjer.',
  area_teknik_service_title: 'Teknik & Service',
  area_teknik_service_desc: 'Service, garanti, TSB og teknisk information.',
  area_timan_crm_title: 'Timan CRM',
  area_timan_crm_desc: 'Forhandlere, kontakter, aktiviteter og pipeline.',
  area_timan_backend_title: 'Timan Backend',
  area_timan_backend_desc: 'Administration, brugere, roller og systemindstillinger.',
  area_dealer_data_title: 'Forhandlerdata',
  area_dealer_data_desc: 'Stamdata, kontaktinformation, brugere og dine tilbud/ordrer.',

  // Modules / placeholders
  mod_configurator: 'Byg din Timan', mod_configurator_desc: 'Åbn konfiguratoren',
  mod_videos: 'Videogalleri', mod_resources: 'Ressourcer', mod_misc: 'Diverse',
  mod_machine_search: 'Søg på maskine',
  mod_machine_search_desc: 'Find en maskine på serienummer og se samlet maskinprofil.',
  mod_service_tickets: 'Service tickets',
  mod_service_tickets_desc: 'Opret, følg og håndter servicehenvendelser pr. maskine.',
  mod_service_maintenance: 'Service registrering og vedligehold',
  mod_service_maintenance_desc: 'Registrer udført service og se servicehistorik pr. maskine.',
  mod_claims: 'Claims',
  mod_claims_desc: 'Opret og følg service- og garantisager direkte i portalen.',
  mod_warranty_reg: 'Garantiregistrering',
  mod_warranty_reg_desc: 'Registrér maskinen inden salg for nemmere og hurtigere service efterfølgende.',
  mod_tsb: 'TSB / Technical Service Bulletin',
  mod_tsb_desc: 'Technical Service Bulletin.',
  mod_users: 'Brugere',
  mod_users_desc: 'Administrer alle portal-brugere, godkend nye signups og tildel roller.',
  mod_roles: 'Roller',
  mod_roles_desc: 'Definér portal-roller og standard-rettigheder.',
  mod_module_access: 'Modul-adgang',
  mod_module_access_desc: 'Styr hvilke moduler hver rolle har adgang til.',
  mod_audit: 'Audit log',
  mod_audit_desc: 'Se ændringer på brugere, roller og adgang.',
  mod_portal_analytics: 'Portal analytics',
  mod_portal_analytics_desc: 'Brug af portalen — besøg, sessioner og moduler.',
  mod_dealer_accounts: 'Forhandlerkonti',
  mod_dealer_accounts_desc: 'Master-overblik over alle forhandlere, service partnere og importører — med tildelt sælger, brugere, tilbud og ordrer.',
  mod_sellers: 'Sælgere',
  mod_sellers_desc: 'Timan sælgere og deres tildelte forhandlere.',
  mod_price_lists: 'Prislister',
  mod_price_lists_desc: 'Administrér varepriser, importér prislister fra ERP og eksportér til CSV.',
  mod_budget_import: 'Budget import',
  mod_budget_import_desc: 'Importér sælgerbudgetter fra Excel-oversigt til CRM Budget.',

  // Support / company section on Teknik & Service area
  supportSectionTitle: 'Timan Teknik support og firmainformation',
  supportHeading: 'Support', companyHeading: 'Firmainformation',
  labelPhone: 'Telefon', labelEmail: 'E-mail', labelCompany: 'Virksomhed', labelAddress: 'Adresse',

  // CRM nav tabs
  crmDashboard: 'Dashboard', crmMyDealers: 'Mine forhandlere',
  crmAccounts: 'Konti', crmLeads: 'Leads', crmQuotes: 'Tilbud',
  crmOrders: 'Ordrer', crmActivities: 'Aktiviteter', crmCalendar: 'Kalender',
  crmBudget: 'Budget', crmBudgetDashboard: 'Budget Dashboard', crmReports: 'Rapporter',
  crmScopeAll: 'Ser alle CRM-data',
  crmScopeOwner: 'Ser kun egne tildelte konti',

  // Logout banner
  logout: 'Log ud',
  dealerInactive: 'Forhandlerkonto er ikke længere aktiv',
  dealerBlocked: 'Forhandlerkonto er spærret',
  dealerInactiveBody: 'Denne forhandlerkonto er ikke længere aktiv. Kontakt venligst Timan.',
  dealerBlockedBody: 'Denne forhandlerkonto er spærret. Kontakt venligst Timan.',

  // Claims dashboards
  dealerClaimsSubtitle: 'Overblik over dine reklamationssager.',
  adminClaimsSubtitle: 'Aktuelle claims på tværs af forhandlere — kun aktive sager.',
};

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------
const en: Dict = {
  save: 'Save', cancel: 'Cancel', edit: 'Edit', delete: 'Delete',
  loading: 'Loading…', search: 'Search', back: 'Back', next: 'Next',
  previous: 'Previous', close: 'Close', yes: 'Yes', no: 'No', open: 'Open',
  updated: 'Updated', noResults: 'No results', confirm: 'Confirm',
  required: 'Required', optional: 'Optional',

  navDashboard: 'Dashboard', navCrm: 'CRM', navConfigurator: 'Configurator',
  navService: 'Service', navBackend: 'Backend', navResources: 'Resources',
  navPartnerMap: 'Partner map', navProfile: 'Profile',

  statusActive: 'Active', statusInactive: 'Inactive', statusPending: 'Pending',
  statusBlocked: 'Blocked', statusDeleted: 'Deleted',

  errorGeneric: 'Something went wrong. Please try again.', saved: 'Saved',
  unsavedChanges: 'Unsaved changes', requiredField: 'This field is required',

  loginNeeded: 'Log in to continue',
  heroTitle: 'Welcome to the Timan Portal',
  heroBody: 'Select an area to get started.',
  heroAlt: 'Timan industry',
  openArea: 'Open area',
  backToPortal: 'Back to portal',
  backToSalesMarketing: 'Back to Sales & Marketing',
  backToTechnicalService: 'Back to Technical & Service',
  backToCrm: 'Back to CRM',

  area_salg_marketing_title: 'Sales & Marketing',
  area_salg_marketing_desc: 'Configurator, quotes, orders and sales tools.',
  area_teknik_service_title: 'Technical & Service',
  area_teknik_service_desc: 'Service, warranty, TSB and technical information.',
  area_timan_crm_title: 'Timan CRM',
  area_timan_crm_desc: 'Dealers, contacts, activities and pipeline.',
  area_timan_backend_title: 'Timan Backend',
  area_timan_backend_desc: 'Administration, users, roles and system settings.',
  area_dealer_data_title: 'Dealer Data',
  area_dealer_data_desc: 'Master data, contacts, users and your quotes/orders.',

  mod_configurator: 'Build your Timan', mod_configurator_desc: 'Open the configurator',
  mod_videos: 'Video gallery', mod_resources: 'Resources', mod_misc: 'Miscellaneous',
  mod_machine_search: 'Search machine',
  mod_machine_search_desc: 'Find a machine by serial number and see a full machine profile.',
  mod_service_tickets: 'Service tickets',
  mod_service_tickets_desc: 'Create, track and handle service requests per machine.',
  mod_service_maintenance: 'Service registration and maintenance',
  mod_service_maintenance_desc: 'Register completed service and view service history per machine.',
  mod_claims: 'Claims',
  mod_claims_desc: 'Create and track service and warranty claims directly in the portal.',
  mod_warranty_reg: 'Warranty registration',
  mod_warranty_reg_desc: 'Register the machine before sale for easier and faster service afterwards.',
  mod_tsb: 'TSB / Technical Service Bulletin',
  mod_tsb_desc: 'Technical Service Bulletin.',
  mod_users: 'Users',
  mod_users_desc: 'Manage all portal users, approve signups and assign roles.',
  mod_roles: 'Roles',
  mod_roles_desc: 'Define portal roles and default permissions.',
  mod_module_access: 'Module access',
  mod_module_access_desc: 'Control which modules each role can access.',
  mod_audit: 'Audit log',
  mod_audit_desc: 'See changes to users, roles and access.',
  mod_portal_analytics: 'Portal analytics',
  mod_portal_analytics_desc: 'Portal usage — visits, sessions and modules.',
  mod_dealer_accounts: 'Dealer accounts',
  mod_dealer_accounts_desc: 'Master overview of all dealers, service partners and importers — with assigned seller, users, quotes and orders.',
  mod_sellers: 'Sellers',
  mod_sellers_desc: 'Timan sellers and their assigned dealers.',
  mod_price_lists: 'Price lists',
  mod_price_lists_desc: 'Manage product prices, import from ERP and export to CSV.',
  mod_budget_import: 'Budget import',
  mod_budget_import_desc: 'Import seller budgets from Excel overview to CRM Budget.',

  supportSectionTitle: 'Timan Technical support and company information',
  supportHeading: 'Support', companyHeading: 'Company information',
  labelPhone: 'Phone', labelEmail: 'Email', labelCompany: 'Company', labelAddress: 'Address',

  crmDashboard: 'Dashboard', crmMyDealers: 'My dealers',
  crmAccounts: 'Accounts', crmLeads: 'Leads', crmQuotes: 'Quotes',
  crmOrders: 'Orders', crmActivities: 'Activities', crmCalendar: 'Calendar',
  crmBudget: 'Budget', crmBudgetDashboard: 'Budget Dashboard', crmReports: 'Reports',
  crmScopeAll: 'Viewing all CRM data',
  crmScopeOwner: 'Viewing only your assigned accounts',

  logout: 'Log out',
  dealerInactive: 'Dealer account is no longer active',
  dealerBlocked: 'Dealer account is blocked',
  dealerInactiveBody: 'This dealer account is no longer active. Please contact Timan.',
  dealerBlockedBody: 'This dealer account is blocked. Please contact Timan.',
  dealerClaimsSubtitle: 'Overview of your warranty claims.',
  adminClaimsSubtitle: 'Active claims across dealers — open cases only.',
};

// ---------------------------------------------------------------------------
// German
// ---------------------------------------------------------------------------
const de: Dict = {
  ...en,
  save: 'Speichern', cancel: 'Abbrechen', edit: 'Bearbeiten', delete: 'Löschen',
  loading: 'Wird geladen…', search: 'Suchen', back: 'Zurück', next: 'Weiter',
  previous: 'Vorherige', close: 'Schließen', yes: 'Ja', no: 'Nein', open: 'Öffnen',
  updated: 'Aktualisiert', noResults: 'Keine Ergebnisse', confirm: 'Bestätigen',
  required: 'Erforderlich', optional: 'Optional',

  navConfigurator: 'Konfigurator', navService: 'Service', navResources: 'Ressourcen',
  navPartnerMap: 'Partnerkarte', navProfile: 'Profil',

  statusActive: 'Aktiv', statusInactive: 'Inaktiv', statusPending: 'Ausstehend',
  statusBlocked: 'Gesperrt', statusDeleted: 'Gelöscht',

  errorGeneric: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.', saved: 'Gespeichert',
  unsavedChanges: 'Ungespeicherte Änderungen', requiredField: 'Dieses Feld ist erforderlich',

  loginNeeded: 'Bitte anmelden',
  heroTitle: 'Willkommen im Timan-Portal',
  heroBody: 'Wählen Sie einen Bereich, um zu beginnen.',
  heroAlt: 'Timan Industrie',
  openArea: 'Bereich öffnen',
  backToPortal: 'Zurück zum Portal',
  backToSalesMarketing: 'Zurück zu Vertrieb & Marketing',
  backToTechnicalService: 'Zurück zu Technik & Service',
  backToCrm: 'Zurück zum CRM',

  area_salg_marketing_title: 'Vertrieb & Marketing',
  area_salg_marketing_desc: 'Konfigurator, Angebote, Bestellungen und Vertriebstools.',
  area_teknik_service_title: 'Technik & Service',
  area_teknik_service_desc: 'Service, Garantie, TSB und technische Informationen.',
  area_timan_crm_title: 'Timan CRM',
  area_timan_crm_desc: 'Händler, Kontakte, Aktivitäten und Pipeline.',
  area_timan_backend_title: 'Timan Backend',
  area_timan_backend_desc: 'Verwaltung, Benutzer, Rollen und Systemeinstellungen.',
  area_dealer_data_title: 'Händlerdaten',
  area_dealer_data_desc: 'Stammdaten, Kontakte, Benutzer und Ihre Angebote/Bestellungen.',

  mod_configurator: 'Konfigurieren Sie Ihren Timan', mod_configurator_desc: 'Konfigurator öffnen',
  mod_videos: 'Videogalerie', mod_resources: 'Ressourcen', mod_misc: 'Sonstiges',
  mod_machine_search: 'Maschine suchen',
  mod_machine_search_desc: 'Finden Sie eine Maschine anhand der Seriennummer und zeigen Sie ein vollständiges Maschinenprofil an.',
  mod_service_tickets: 'Service-Tickets',
  mod_service_tickets_desc: 'Erstellen, verfolgen und bearbeiten Sie Serviceanfragen pro Maschine.',
  mod_service_maintenance: 'Serviceerfassung und Wartung',
  mod_service_maintenance_desc: 'Erfassen Sie durchgeführte Wartungen und zeigen Sie den Wartungsverlauf pro Maschine an.',
  mod_claims: 'Reklamationen',
  mod_claims_desc: 'Erstellen und verfolgen Sie Service- und Garantiefälle direkt im Portal.',
  mod_warranty_reg: 'Garantieregistrierung',
  mod_warranty_reg_desc: 'Registrieren Sie die Maschine vor dem Verkauf, damit der spätere Service einfacher und schneller wird.',
  mod_tsb: 'TSB / Technical Service Bulletin', mod_tsb_desc: 'Technical Service Bulletin.',
  mod_users: 'Benutzer',
  mod_users_desc: 'Alle Portal-Benutzer verwalten, Neuanmeldungen genehmigen und Rollen zuweisen.',
  mod_roles: 'Rollen', mod_roles_desc: 'Portal-Rollen und Standardberechtigungen definieren.',
  mod_module_access: 'Modulzugriff', mod_module_access_desc: 'Steuern, auf welche Module jede Rolle Zugriff hat.',
  mod_audit: 'Audit-Log', mod_audit_desc: 'Änderungen an Benutzern, Rollen und Zugriffen einsehen.',
  mod_portal_analytics: 'Portal-Analytik', mod_portal_analytics_desc: 'Portalnutzung — Besuche, Sitzungen und Module.',
  mod_dealer_accounts: 'Händlerkonten',
  mod_dealer_accounts_desc: 'Gesamtübersicht aller Händler, Servicepartner und Importeure — mit zugewiesenem Verkäufer, Benutzern, Angeboten und Bestellungen.',
  mod_sellers: 'Verkäufer', mod_sellers_desc: 'Timan-Verkäufer und ihre zugewiesenen Händler.',
  mod_price_lists: 'Preislisten', mod_price_lists_desc: 'Produktpreise verwalten, aus ERP importieren und als CSV exportieren.',
  mod_budget_import: 'Budget-Import', mod_budget_import_desc: 'Verkäuferbudgets aus Excel-Übersicht in CRM-Budget importieren.',

  supportSectionTitle: 'Timan Technik-Support und Firmeninformationen',
  supportHeading: 'Support', companyHeading: 'Firmeninformationen',
  labelPhone: 'Telefon', labelEmail: 'E-Mail', labelCompany: 'Unternehmen', labelAddress: 'Adresse',

  crmMyDealers: 'Meine Händler', crmAccounts: 'Konten', crmLeads: 'Leads',
  crmQuotes: 'Angebote', crmOrders: 'Aufträge', crmActivities: 'Aktivitäten',
  crmCalendar: 'Kalender', crmBudget: 'Budget',
  crmScopeAll: 'Alle CRM-Daten anzeigen', crmScopeOwner: 'Nur eigene zugewiesene Konten',
  crmReports: 'Berichte',

  logout: 'Abmelden',
  dealerInactive: 'Händlerkonto ist nicht mehr aktiv',
  dealerBlocked: 'Händlerkonto ist gesperrt',
  dealerInactiveBody: 'Dieses Händlerkonto ist nicht mehr aktiv. Bitte kontaktieren Sie Timan.',
  dealerBlockedBody: 'Dieses Händlerkonto ist gesperrt. Bitte kontaktieren Sie Timan.',
  dealerClaimsSubtitle: 'Übersicht über Ihre Reklamationen.',
  adminClaimsSubtitle: 'Aktuelle Reklamationen über Händler hinweg — nur offene Fälle.',
};

// ---------------------------------------------------------------------------
// Italian
// ---------------------------------------------------------------------------
const it: Dict = {
  ...en,
  save: 'Salva', cancel: 'Annulla', edit: 'Modifica', delete: 'Elimina',
  loading: 'Caricamento…', search: 'Cerca', back: 'Indietro', next: 'Avanti',
  previous: 'Precedente', close: 'Chiudi', yes: 'Sì', no: 'No', open: 'Apri',
  updated: 'Aggiornato', noResults: 'Nessun risultato', confirm: 'Conferma',
  required: 'Obbligatorio', optional: 'Facoltativo',

  navResources: 'Risorse', navPartnerMap: 'Mappa partner', navProfile: 'Profilo',
  statusActive: 'Attivo', statusInactive: 'Inattivo', statusPending: 'In attesa',
  statusBlocked: 'Bloccato', statusDeleted: 'Eliminato',
  errorGeneric: 'Qualcosa è andato storto. Riprova.', saved: 'Salvato',
  unsavedChanges: 'Modifiche non salvate', requiredField: 'Questo campo è obbligatorio',

  loginNeeded: 'Accedi per continuare',
  heroTitle: 'Benvenuto nel Portale Timan',
  heroBody: 'Seleziona un’area per iniziare.',
  heroAlt: 'Industria Timan',
  openArea: 'Apri area',
  backToPortal: 'Torna al portale',
  backToSalesMarketing: 'Torna a Vendite & Marketing',
  backToTechnicalService: 'Torna a Tecnico & Assistenza',
  backToCrm: 'Torna al CRM',

  area_salg_marketing_title: 'Vendite & Marketing',
  area_salg_marketing_desc: 'Configuratore, preventivi, ordini e strumenti di vendita.',
  area_teknik_service_title: 'Tecnico & Assistenza',
  area_teknik_service_desc: 'Assistenza, garanzia, TSB e informazioni tecniche.',
  area_timan_crm_title: 'Timan CRM',
  area_timan_crm_desc: 'Rivenditori, contatti, attività e pipeline.',
  area_timan_backend_title: 'Timan Backend',
  area_timan_backend_desc: 'Amministrazione, utenti, ruoli e impostazioni di sistema.',
  area_dealer_data_title: 'Dati rivenditore',
  area_dealer_data_desc: 'Anagrafica, contatti, utenti e preventivi/ordini.',

  mod_configurator: 'Configura il tuo Timan', mod_configurator_desc: 'Apri il configuratore',
  mod_videos: 'Videogallery', mod_resources: 'Risorse', mod_misc: 'Varie',
  mod_machine_search: 'Cerca macchina',
  mod_machine_search_desc: 'Trova una macchina tramite numero di serie e visualizza il profilo completo della macchina.',
  mod_service_tickets: 'Ticket di assistenza',
  mod_service_tickets_desc: 'Crea, monitora e gestisci le richieste di assistenza per macchina.',
  mod_service_maintenance: 'Registrazione servizio e manutenzione',
  mod_service_maintenance_desc: 'Registra gli interventi di assistenza completati e visualizza la cronologia di assistenza per macchina.',
  mod_claims: 'Reclami',
  mod_claims_desc: 'Crea e monitora reclami di assistenza e garanzia direttamente nel portale.',
  mod_warranty_reg: 'Registrazione garanzia',
  mod_warranty_reg_desc: 'Registra la macchina prima della vendita per rendere l’assistenza successiva più semplice e veloce.',
  mod_tsb: 'TSB / Technical Service Bulletin', mod_tsb_desc: 'Technical Service Bulletin.',
  mod_users: 'Utenti',
  mod_users_desc: 'Gestisci tutti gli utenti del portale, approva le registrazioni e assegna ruoli.',
  mod_roles: 'Ruoli', mod_roles_desc: 'Definisci i ruoli del portale e i permessi predefiniti.',
  mod_module_access: 'Accesso ai moduli', mod_module_access_desc: 'Controlla a quali moduli può accedere ciascun ruolo.',
  mod_audit: 'Log di audit', mod_audit_desc: 'Visualizza modifiche a utenti, ruoli e accessi.',
  mod_portal_analytics: 'Analytics del portale', mod_portal_analytics_desc: 'Utilizzo del portale — visite, sessioni e moduli.',
  mod_dealer_accounts: 'Account rivenditori',
  mod_dealer_accounts_desc: 'Panoramica completa di tutti i rivenditori, partner di assistenza e importatori — con venditore assegnato, utenti, preventivi e ordini.',
  mod_sellers: 'Venditori', mod_sellers_desc: 'Venditori Timan e rivenditori assegnati.',
  mod_price_lists: 'Listini prezzi', mod_price_lists_desc: 'Gestisci i prezzi dei prodotti, importa da ERP ed esporta in CSV.',
  mod_budget_import: 'Importa budget', mod_budget_import_desc: 'Importa i budget dei venditori dall’Excel al CRM Budget.',

  supportSectionTitle: 'Supporto tecnico Timan e informazioni aziendali',
  supportHeading: 'Supporto', companyHeading: 'Informazioni aziendali',
  labelPhone: 'Telefono', labelEmail: 'E-mail', labelCompany: 'Azienda', labelAddress: 'Indirizzo',

  crmMyDealers: 'I miei rivenditori', crmAccounts: 'Account', crmLeads: 'Lead',
  crmQuotes: 'Preventivi', crmOrders: 'Ordini', crmActivities: 'Attività',
  crmCalendar: 'Calendario', crmReports: 'Report',
  crmScopeAll: 'Visualizzazione di tutti i dati CRM',
  crmScopeOwner: 'Visualizzazione solo dei tuoi account assegnati',

  logout: 'Esci',
  dealerInactive: 'L’account rivenditore non è più attivo',
  dealerBlocked: 'L’account rivenditore è bloccato',
  dealerInactiveBody: 'Questo account rivenditore non è più attivo. Contatta Timan.',
  dealerBlockedBody: 'Questo account rivenditore è bloccato. Contatta Timan.',
  dealerClaimsSubtitle: 'Panoramica dei tuoi reclami.',
  adminClaimsSubtitle: 'Reclami attuali tra i rivenditori — solo casi attivi.',
};

// ---------------------------------------------------------------------------
// Hungarian
// ---------------------------------------------------------------------------
const hu: Dict = {
  ...en,
  save: 'Mentés', cancel: 'Mégse', edit: 'Szerkesztés', delete: 'Törlés',
  loading: 'Betöltés…', search: 'Keresés', back: 'Vissza', next: 'Tovább',
  previous: 'Előző', close: 'Bezárás', yes: 'Igen', no: 'Nem', open: 'Megnyitás',
  updated: 'Frissítve', noResults: 'Nincs találat', confirm: 'Megerősítés',
  required: 'Kötelező', optional: 'Választható',

  navResources: 'Erőforrások', navPartnerMap: 'Partnertérkép', navProfile: 'Profil',
  statusActive: 'Aktív', statusInactive: 'Inaktív', statusPending: 'Függőben',
  statusBlocked: 'Letiltva', statusDeleted: 'Törölve',
  errorGeneric: 'Hiba történt. Próbáld újra.', saved: 'Mentve',
  unsavedChanges: 'Mentetlen módosítások', requiredField: 'Ez a mező kötelező',

  loginNeeded: 'Jelentkezzen be a folytatáshoz',
  heroTitle: 'Üdvözöljük a Timan Portálon',
  heroBody: 'Válasszon egy területet a kezdéshez.',
  heroAlt: 'Timan ipar',
  openArea: 'Terület megnyitása',
  backToPortal: 'Vissza a portálra',
  backToSalesMarketing: 'Vissza az Értékesítés & Marketinghez',
  backToTechnicalService: 'Vissza a Műszaki & Szervizhez',
  backToCrm: 'Vissza a CRM-hez',

  area_salg_marketing_title: 'Értékesítés & Marketing',
  area_salg_marketing_desc: 'Konfigurátor, árajánlatok, rendelések és értékesítési eszközök.',
  area_teknik_service_title: 'Műszaki & Szerviz',
  area_teknik_service_desc: 'Szerviz, garancia, TSB és műszaki információk.',
  area_timan_crm_title: 'Timan CRM',
  area_timan_crm_desc: 'Kereskedők, kapcsolatok, tevékenységek és pipeline.',
  area_timan_backend_title: 'Timan Backend',
  area_timan_backend_desc: 'Adminisztráció, felhasználók, szerepkörök és rendszerbeállítások.',
  area_dealer_data_title: 'Kereskedői adatok',
  area_dealer_data_desc: 'Törzsadatok, kapcsolatok, felhasználók és árajánlatok/rendelések.',

  mod_configurator: 'Építse meg Timanját', mod_configurator_desc: 'Konfigurátor megnyitása',
  mod_videos: 'Videógaléria', mod_resources: 'Erőforrások', mod_misc: 'Egyéb',
  mod_machine_search: 'Gép keresése',
  mod_machine_search_desc: 'Keressen gépet gyári szám alapján és tekintse meg a teljes gépprofilt.',
  mod_service_tickets: 'Szervizjegyek',
  mod_service_tickets_desc: 'Hozzon létre, kövessen és kezeljen szerviz kéréseket gépenként.',
  mod_service_maintenance: 'Szervizregisztráció és karbantartás',
  mod_service_maintenance_desc: 'Rögzítse az elvégzett szervizeléseket és tekintse meg a szervizelési előzményeket gépenként.',
  mod_claims: 'Reklamációk',
  mod_claims_desc: 'Hozzon létre és kövessen szerviz- és garanciaügyeket közvetlenül a portálon.',
  mod_warranty_reg: 'Garanciaregisztráció',
  mod_warranty_reg_desc: 'Regisztrálja a gépet értékesítés előtt, hogy a későbbi szerviz gyorsabb és egyszerűbb legyen.',
  mod_tsb: 'TSB / Technical Service Bulletin', mod_tsb_desc: 'Technical Service Bulletin.',
  mod_users: 'Felhasználók',
  mod_users_desc: 'Az összes portálfelhasználó kezelése, új regisztrációk jóváhagyása és szerepkörök hozzárendelése.',
  mod_roles: 'Szerepkörök', mod_roles_desc: 'Portál szerepkörök és alapértelmezett jogosultságok definiálása.',
  mod_module_access: 'Modulhozzáférés', mod_module_access_desc: 'Szabályozza, mely modulokhoz férhet hozzá minden szerepkör.',
  mod_audit: 'Auditnapló', mod_audit_desc: 'Felhasználók, szerepkörök és hozzáférések változásainak megtekintése.',
  mod_portal_analytics: 'Portál analitika', mod_portal_analytics_desc: 'Portálhasználat — látogatások, munkamenetek és modulok.',
  mod_dealer_accounts: 'Kereskedői fiókok',
  mod_dealer_accounts_desc: 'Az összes kereskedő, szervizpartner és importőr áttekintése — hozzárendelt értékesítővel, felhasználókkal, ajánlatokkal és rendelésekkel.',
  mod_sellers: 'Értékesítők', mod_sellers_desc: 'Timan értékesítők és hozzájuk rendelt kereskedők.',
  mod_price_lists: 'Árlisták', mod_price_lists_desc: 'Termékárak kezelése, ERP-ből importálás és CSV-export.',
  mod_budget_import: 'Költségvetés import', mod_budget_import_desc: 'Értékesítői költségvetések importálása Excelből a CRM Költségvetésbe.',

  supportSectionTitle: 'Timan műszaki támogatás és cégadatok',
  supportHeading: 'Támogatás', companyHeading: 'Cégadatok',
  labelPhone: 'Telefon', labelEmail: 'E-mail', labelCompany: 'Vállalat', labelAddress: 'Cím',

  crmMyDealers: 'Kereskedőim', crmAccounts: 'Fiókok', crmLeads: 'Leadek',
  crmQuotes: 'Árajánlatok', crmOrders: 'Rendelések', crmActivities: 'Tevékenységek',
  crmCalendar: 'Naptár', crmBudget: 'Költségvetés', crmReports: 'Riportok',
  crmScopeAll: 'Összes CRM-adat megtekintése',
  crmScopeOwner: 'Csak saját hozzárendelt fiókok megtekintése',

  logout: 'Kijelentkezés',
  dealerInactive: 'A kereskedői fiók már nem aktív',
  dealerBlocked: 'A kereskedői fiók letiltva',
  dealerInactiveBody: 'Ez a kereskedői fiók már nem aktív. Vegye fel a kapcsolatot a Timannal.',
  dealerBlockedBody: 'Ez a kereskedői fiók letiltva. Vegye fel a kapcsolatot a Timannal.',
  dealerClaimsSubtitle: 'Áttekintés a reklamációidról.',
  adminClaimsSubtitle: 'Aktív reklamációk a kereskedőknél — csak nyitott ügyek.',
};

// ---------------------------------------------------------------------------
// Swedish
// ---------------------------------------------------------------------------
const sv: Dict = {
  ...en,
  save: 'Spara', cancel: 'Avbryt', edit: 'Redigera', delete: 'Ta bort',
  loading: 'Laddar…', search: 'Sök', back: 'Tillbaka', next: 'Nästa',
  previous: 'Föregående', close: 'Stäng', yes: 'Ja', no: 'Nej', open: 'Öppna',
  updated: 'Uppdaterad', noResults: 'Inga resultat', confirm: 'Bekräfta',
  required: 'Obligatorisk', optional: 'Valfri',

  navConfigurator: 'Konfigurator', navResources: 'Resurser',
  navPartnerMap: 'Partnerkarta', navProfile: 'Profil',
  statusActive: 'Aktiv', statusInactive: 'Inaktiv', statusPending: 'Väntar',
  statusBlocked: 'Blockerad', statusDeleted: 'Borttagen',
  errorGeneric: 'Något gick fel. Försök igen.', saved: 'Sparat',
  unsavedChanges: 'Osparade ändringar', requiredField: 'Detta fält är obligatoriskt',

  loginNeeded: 'Logga in för att fortsätta',
  heroTitle: 'Välkommen till Timan-portalen',
  heroBody: 'Välj ett område för att komma igång.',
  heroAlt: 'Timan industri',
  openArea: 'Öppna område',
  backToPortal: 'Tillbaka till portalen',
  backToSalesMarketing: 'Tillbaka till Försäljning & Marknad',
  backToTechnicalService: 'Tillbaka till Teknik & Service',
  backToCrm: 'Tillbaka till CRM',

  area_salg_marketing_title: 'Försäljning & Marknad',
  area_salg_marketing_desc: 'Konfigurator, offerter, ordrar och säljverktyg.',
  area_teknik_service_title: 'Teknik & Service',
  area_teknik_service_desc: 'Service, garanti, TSB och teknisk information.',
  area_timan_crm_title: 'Timan CRM',
  area_timan_crm_desc: 'Återförsäljare, kontakter, aktiviteter och pipeline.',
  area_timan_backend_title: 'Timan Backend',
  area_timan_backend_desc: 'Administration, användare, roller och systeminställningar.',
  area_dealer_data_title: 'Återförsäljardata',
  area_dealer_data_desc: 'Grunddata, kontakter, användare och dina offerter/ordrar.',

  mod_configurator: 'Bygg din Timan', mod_configurator_desc: 'Öppna konfiguratorn',
  mod_videos: 'Videogalleri', mod_resources: 'Resurser', mod_misc: 'Övrigt',
  mod_machine_search: 'Sök maskin',
  mod_machine_search_desc: 'Hitta en maskin via serienummer och se en fullständig maskinprofil.',
  mod_service_tickets: 'Serviceärenden',
  mod_service_tickets_desc: 'Skapa, följ och hantera serviceärenden per maskin.',
  mod_service_maintenance: 'Serviceregistrering och underhåll',
  mod_service_maintenance_desc: 'Registrera utförd service och se servicehistorik per maskin.',
  mod_claims: 'Reklamationer',
  mod_claims_desc: 'Skapa och följ service- och garantiärenden direkt i portalen.',
  mod_warranty_reg: 'Garantiregistrering',
  mod_warranty_reg_desc: 'Registrera maskinen före försäljning för enklare och snabbare service efteråt.',
  mod_tsb: 'TSB / Technical Service Bulletin', mod_tsb_desc: 'Technical Service Bulletin.',
  mod_users: 'Användare',
  mod_users_desc: 'Hantera alla portalanvändare, godkänn registreringar och tilldela roller.',
  mod_roles: 'Roller', mod_roles_desc: 'Definiera portalroller och standardbehörigheter.',
  mod_module_access: 'Moduleåtkomst', mod_module_access_desc: 'Styr vilka moduler varje roll har tillgång till.',
  mod_audit: 'Granskningslogg', mod_audit_desc: 'Se ändringar av användare, roller och åtkomst.',
  mod_portal_analytics: 'Portalanalys', mod_portal_analytics_desc: 'Portalanvändning — besök, sessioner och moduler.',
  mod_dealer_accounts: 'Återförsäljarkonton',
  mod_dealer_accounts_desc: 'Översikt över alla återförsäljare, servicepartners och importörer — med tilldelad säljare, användare, offerter och ordrar.',
  mod_sellers: 'Säljare', mod_sellers_desc: 'Timan-säljare och deras tilldelade återförsäljare.',
  mod_price_lists: 'Prislistor', mod_price_lists_desc: 'Hantera produktpriser, importera från ERP och exportera till CSV.',
  mod_budget_import: 'Budgetimport', mod_budget_import_desc: 'Importera säljarbudgetar från Excel till CRM Budget.',

  supportSectionTitle: 'Timan teknisk support och företagsinformation',
  supportHeading: 'Support', companyHeading: 'Företagsinformation',
  labelPhone: 'Telefon', labelEmail: 'E-post', labelCompany: 'Företag', labelAddress: 'Adress',

  crmMyDealers: 'Mina återförsäljare', crmAccounts: 'Konton', crmLeads: 'Leads',
  crmQuotes: 'Offerter', crmOrders: 'Ordrar', crmActivities: 'Aktiviteter',
  crmCalendar: 'Kalender', crmBudget: 'Budget', crmReports: 'Rapporter',
  crmScopeAll: 'Visar all CRM-data',
  crmScopeOwner: 'Visar endast dina tilldelade konton',

  logout: 'Logga ut',
  dealerInactive: 'Återförsäljarkontot är inte längre aktivt',
  dealerBlocked: 'Återförsäljarkontot är blockerat',
  dealerInactiveBody: 'Detta återförsäljarkonto är inte längre aktivt. Kontakta Timan.',
  dealerBlockedBody: 'Detta återförsäljarkonto är blockerat. Kontakta Timan.',
  dealerClaimsSubtitle: 'Översikt över dina reklamationer.',
  adminClaimsSubtitle: 'Aktuella reklamationer hos återförsäljare — endast aktiva ärenden.',
};

// ---------------------------------------------------------------------------
// French
// ---------------------------------------------------------------------------
const fr: Dict = {
  ...en,
  save: 'Enregistrer', cancel: 'Annuler', edit: 'Modifier', delete: 'Supprimer',
  loading: 'Chargement…', search: 'Rechercher', back: 'Retour', next: 'Suivant',
  previous: 'Précédent', close: 'Fermer', yes: 'Oui', no: 'Non', open: 'Ouvrir',
  updated: 'Mis à jour', noResults: 'Aucun résultat', confirm: 'Confirmer',
  required: 'Obligatoire', optional: 'Facultatif',

  navConfigurator: 'Configurateur', navResources: 'Ressources',
  navPartnerMap: 'Carte des partenaires', navProfile: 'Profil',
  statusActive: 'Actif', statusInactive: 'Inactif', statusPending: 'En attente',
  statusBlocked: 'Bloqué', statusDeleted: 'Supprimé',
  errorGeneric: 'Une erreur est survenue. Veuillez réessayer.', saved: 'Enregistré',
  unsavedChanges: 'Modifications non enregistrées', requiredField: 'Ce champ est obligatoire',

  loginNeeded: 'Connectez-vous pour continuer',
  heroTitle: 'Bienvenue sur le portail Timan',
  heroBody: 'Sélectionnez un espace pour commencer.',
  heroAlt: 'Industrie Timan',
  openArea: 'Ouvrir l’espace',
  backToPortal: 'Retour au portail',
  backToSalesMarketing: 'Retour à Ventes & Marketing',
  backToTechnicalService: 'Retour à Technique & Service',
  backToCrm: 'Retour au CRM',

  area_salg_marketing_title: 'Ventes & Marketing',
  area_salg_marketing_desc: 'Configurateur, devis, commandes et outils de vente.',
  area_teknik_service_title: 'Technique & Service',
  area_teknik_service_desc: 'Service, garantie, TSB et informations techniques.',
  area_timan_crm_title: 'Timan CRM',
  area_timan_crm_desc: 'Revendeurs, contacts, activités et pipeline.',
  area_timan_backend_title: 'Timan Backend',
  area_timan_backend_desc: 'Administration, utilisateurs, rôles et paramètres système.',
  area_dealer_data_title: 'Données revendeur',
  area_dealer_data_desc: 'Données de base, contacts, utilisateurs et vos devis/commandes.',

  mod_configurator: 'Configurez votre Timan', mod_configurator_desc: 'Ouvrir le configurateur',
  mod_videos: 'Galerie vidéo', mod_resources: 'Ressources', mod_misc: 'Divers',
  mod_machine_search: 'Rechercher une machine',
  mod_machine_search_desc: 'Trouvez une machine par numéro de série et consultez son profil complet.',
  mod_service_tickets: 'Tickets de service',
  mod_service_tickets_desc: 'Créez, suivez et gérez les demandes de service par machine.',
  mod_service_maintenance: 'Enregistrement et maintenance',
  mod_service_maintenance_desc: 'Enregistrez les interventions effectuées et consultez l’historique par machine.',
  mod_claims: 'Réclamations',
  mod_claims_desc: 'Créez et suivez les dossiers de service et de garantie directement dans le portail.',
  mod_warranty_reg: 'Enregistrement de garantie',
  mod_warranty_reg_desc: 'Enregistrez la machine avant la vente pour un service ultérieur plus simple et plus rapide.',
  mod_tsb: 'TSB / Technical Service Bulletin', mod_tsb_desc: 'Technical Service Bulletin.',
  mod_users: 'Utilisateurs',
  mod_users_desc: 'Gérez tous les utilisateurs du portail, approuvez les inscriptions et attribuez les rôles.',
  mod_roles: 'Rôles', mod_roles_desc: 'Définissez les rôles du portail et les autorisations par défaut.',
  mod_module_access: 'Accès aux modules', mod_module_access_desc: 'Contrôlez à quels modules chaque rôle peut accéder.',
  mod_audit: 'Journal d’audit', mod_audit_desc: 'Consultez les modifications des utilisateurs, rôles et accès.',
  mod_portal_analytics: 'Analytique du portail', mod_portal_analytics_desc: 'Utilisation du portail — visites, sessions et modules.',
  mod_dealer_accounts: 'Comptes revendeurs',
  mod_dealer_accounts_desc: 'Vue d’ensemble de tous les revendeurs, partenaires de service et importateurs — avec vendeur assigné, utilisateurs, devis et commandes.',
  mod_sellers: 'Vendeurs', mod_sellers_desc: 'Vendeurs Timan et leurs revendeurs assignés.',
  mod_price_lists: 'Listes de prix', mod_price_lists_desc: 'Gérez les prix produits, importez depuis l’ERP et exportez en CSV.',
  mod_budget_import: 'Import budget', mod_budget_import_desc: 'Importez les budgets vendeurs depuis Excel vers le CRM Budget.',

  supportSectionTitle: 'Support technique Timan et informations sur l’entreprise',
  supportHeading: 'Support', companyHeading: 'Informations sur l’entreprise',
  labelPhone: 'Téléphone', labelEmail: 'E-mail', labelCompany: 'Société', labelAddress: 'Adresse',

  crmMyDealers: 'Mes revendeurs', crmAccounts: 'Comptes', crmLeads: 'Leads',
  crmQuotes: 'Devis', crmOrders: 'Commandes', crmActivities: 'Activités',
  crmCalendar: 'Calendrier', crmBudget: 'Budget', crmReports: 'Rapports',
  crmScopeAll: 'Affichage de toutes les données CRM',
  crmScopeOwner: 'Affichage uniquement de vos comptes assignés',

  logout: 'Déconnexion',
  dealerInactive: 'Le compte revendeur n’est plus actif',
  dealerBlocked: 'Le compte revendeur est bloqué',
  dealerInactiveBody: 'Ce compte revendeur n’est plus actif. Veuillez contacter Timan.',
  dealerBlockedBody: 'Ce compte revendeur est bloqué. Veuillez contacter Timan.',
  dealerClaimsSubtitle: 'Aperçu de vos réclamations.',
  adminClaimsSubtitle: 'Réclamations actives chez les revendeurs — cas ouverts uniquement.',
};

// ---------------------------------------------------------------------------
// Polish
// ---------------------------------------------------------------------------
const pl: Dict = {
  ...en,
  save: 'Zapisz', cancel: 'Anuluj', edit: 'Edytuj', delete: 'Usuń',
  loading: 'Ładowanie…', search: 'Szukaj', back: 'Wstecz', next: 'Dalej',
  previous: 'Poprzedni', close: 'Zamknij', yes: 'Tak', no: 'Nie', open: 'Otwórz',
  updated: 'Zaktualizowano', noResults: 'Brak wyników', confirm: 'Potwierdź',
  required: 'Wymagane', optional: 'Opcjonalne',

  navConfigurator: 'Konfigurator', navResources: 'Zasoby',
  navPartnerMap: 'Mapa partnerów', navProfile: 'Profil',
  statusActive: 'Aktywny', statusInactive: 'Nieaktywny', statusPending: 'Oczekuje',
  statusBlocked: 'Zablokowany', statusDeleted: 'Usunięty',
  errorGeneric: 'Coś poszło nie tak. Spróbuj ponownie.', saved: 'Zapisano',
  unsavedChanges: 'Niezapisane zmiany', requiredField: 'To pole jest wymagane',

  loginNeeded: 'Zaloguj się, aby kontynuować',
  heroTitle: 'Witamy w portalu Timan',
  heroBody: 'Wybierz obszar, aby rozpocząć.',
  heroAlt: 'Przemysł Timan',
  openArea: 'Otwórz obszar',
  backToPortal: 'Powrót do portalu',
  backToSalesMarketing: 'Powrót do Sprzedaż & Marketing',
  backToTechnicalService: 'Powrót do Techniczne & Serwis',
  backToCrm: 'Powrót do CRM',

  area_salg_marketing_title: 'Sprzedaż & Marketing',
  area_salg_marketing_desc: 'Konfigurator, oferty, zamówienia i narzędzia sprzedażowe.',
  area_teknik_service_title: 'Techniczne & Serwis',
  area_teknik_service_desc: 'Serwis, gwarancja, TSB i informacje techniczne.',
  area_timan_crm_title: 'Timan CRM',
  area_timan_crm_desc: 'Dealerzy, kontakty, aktywności i pipeline.',
  area_timan_backend_title: 'Timan Backend',
  area_timan_backend_desc: 'Administracja, użytkownicy, role i ustawienia systemu.',
  area_dealer_data_title: 'Dane dealera',
  area_dealer_data_desc: 'Dane podstawowe, kontakty, użytkownicy oraz oferty/zamówienia.',

  mod_configurator: 'Zbuduj swojego Timana', mod_configurator_desc: 'Otwórz konfigurator',
  mod_videos: 'Galeria wideo', mod_resources: 'Zasoby', mod_misc: 'Różne',
  mod_machine_search: 'Wyszukaj maszynę',
  mod_machine_search_desc: 'Znajdź maszynę po numerze seryjnym i zobacz pełny profil maszyny.',
  mod_service_tickets: 'Zgłoszenia serwisowe',
  mod_service_tickets_desc: 'Twórz, śledź i obsługuj zgłoszenia serwisowe na maszynę.',
  mod_service_maintenance: 'Rejestracja serwisu i konserwacja',
  mod_service_maintenance_desc: 'Rejestruj wykonane serwisy i przeglądaj historię na maszynę.',
  mod_claims: 'Reklamacje',
  mod_claims_desc: 'Twórz i śledź zgłoszenia serwisowe oraz gwarancyjne bezpośrednio w portalu.',
  mod_warranty_reg: 'Rejestracja gwarancji',
  mod_warranty_reg_desc: 'Zarejestruj maszynę przed sprzedażą, aby przyszły serwis był łatwiejszy i szybszy.',
  mod_tsb: 'TSB / Technical Service Bulletin', mod_tsb_desc: 'Technical Service Bulletin.',
  mod_users: 'Użytkownicy',
  mod_users_desc: 'Zarządzaj wszystkimi użytkownikami portalu, zatwierdzaj rejestracje i przypisuj role.',
  mod_roles: 'Role', mod_roles_desc: 'Definiuj role portalu i domyślne uprawnienia.',
  mod_module_access: 'Dostęp do modułów', mod_module_access_desc: 'Kontroluj, do których modułów ma dostęp każda rola.',
  mod_audit: 'Dziennik audytu', mod_audit_desc: 'Zobacz zmiany użytkowników, ról i dostępów.',
  mod_portal_analytics: 'Analityka portalu', mod_portal_analytics_desc: 'Wykorzystanie portalu — wizyty, sesje i moduły.',
  mod_dealer_accounts: 'Konta dealerów',
  mod_dealer_accounts_desc: 'Pełny przegląd wszystkich dealerów, partnerów serwisowych i importerów — z przypisanym sprzedawcą, użytkownikami, ofertami i zamówieniami.',
  mod_sellers: 'Sprzedawcy', mod_sellers_desc: 'Sprzedawcy Timan i przypisani dealerzy.',
  mod_price_lists: 'Cenniki', mod_price_lists_desc: 'Zarządzaj cenami produktów, importuj z ERP i eksportuj do CSV.',
  mod_budget_import: 'Import budżetu', mod_budget_import_desc: 'Importuj budżety sprzedawców z Excela do CRM Budget.',

  supportSectionTitle: 'Wsparcie techniczne Timan i informacje o firmie',
  supportHeading: 'Wsparcie', companyHeading: 'Informacje o firmie',
  labelPhone: 'Telefon', labelEmail: 'E-mail', labelCompany: 'Firma', labelAddress: 'Adres',

  crmMyDealers: 'Moi dealerzy', crmAccounts: 'Konta', crmLeads: 'Leady',
  crmQuotes: 'Oferty', crmOrders: 'Zamówienia', crmActivities: 'Aktywności',
  crmCalendar: 'Kalendarz', crmBudget: 'Budżet', crmReports: 'Raporty',
  crmScopeAll: 'Wyświetlanie wszystkich danych CRM',
  crmScopeOwner: 'Wyświetlanie tylko przypisanych kont',

  logout: 'Wyloguj',
  dealerInactive: 'Konto dealera nie jest już aktywne',
  dealerBlocked: 'Konto dealera jest zablokowane',
  dealerInactiveBody: 'To konto dealera nie jest już aktywne. Skontaktuj się z Timan.',
  dealerBlockedBody: 'To konto dealera jest zablokowane. Skontaktuj się z Timan.',
  dealerClaimsSubtitle: 'Przegląd Twoich reklamacji.',
  adminClaimsSubtitle: 'Aktywne reklamacje u dealerów — tylko otwarte sprawy.',
};

// ---------------------------------------------------------------------------
// Czech
// ---------------------------------------------------------------------------
const cs: Dict = {
  ...en,
  save: 'Uložit', cancel: 'Zrušit', edit: 'Upravit', delete: 'Smazat',
  loading: 'Načítání…', search: 'Hledat', back: 'Zpět', next: 'Další',
  previous: 'Předchozí', close: 'Zavřít', yes: 'Ano', no: 'Ne', open: 'Otevřít',
  updated: 'Aktualizováno', noResults: 'Žádné výsledky', confirm: 'Potvrdit',
  required: 'Povinné', optional: 'Volitelné',

  navConfigurator: 'Konfigurátor', navResources: 'Zdroje',
  navPartnerMap: 'Mapa partnerů', navProfile: 'Profil',
  statusActive: 'Aktivní', statusInactive: 'Neaktivní', statusPending: 'Čeká',
  statusBlocked: 'Zablokováno', statusDeleted: 'Smazáno',
  errorGeneric: 'Něco se pokazilo. Zkuste to znovu.', saved: 'Uloženo',
  unsavedChanges: 'Neuložené změny', requiredField: 'Toto pole je povinné',

  loginNeeded: 'Pro pokračování se přihlaste',
  heroTitle: 'Vítejte v Timan Portálu',
  heroBody: 'Vyberte oblast pro zahájení.',
  heroAlt: 'Timan průmysl',
  openArea: 'Otevřít oblast',
  backToPortal: 'Zpět na portál',
  backToSalesMarketing: 'Zpět na Prodej & Marketing',
  backToTechnicalService: 'Zpět na Technika & Servis',
  backToCrm: 'Zpět na CRM',

  area_salg_marketing_title: 'Prodej & Marketing',
  area_salg_marketing_desc: 'Konfigurátor, nabídky, objednávky a prodejní nástroje.',
  area_teknik_service_title: 'Technika & Servis',
  area_teknik_service_desc: 'Servis, záruka, TSB a technické informace.',
  area_timan_crm_title: 'Timan CRM',
  area_timan_crm_desc: 'Prodejci, kontakty, aktivity a pipeline.',
  area_timan_backend_title: 'Timan Backend',
  area_timan_backend_desc: 'Administrace, uživatelé, role a systémová nastavení.',
  area_dealer_data_title: 'Data prodejce',
  area_dealer_data_desc: 'Základní data, kontakty, uživatelé a vaše nabídky/objednávky.',

  mod_configurator: 'Sestavte si svůj Timan', mod_configurator_desc: 'Otevřít konfigurátor',
  mod_videos: 'Videogalerie', mod_resources: 'Zdroje', mod_misc: 'Různé',
  mod_machine_search: 'Hledat stroj',
  mod_machine_search_desc: 'Najděte stroj podle sériového čísla a zobrazte úplný profil stroje.',
  mod_service_tickets: 'Servisní tikety',
  mod_service_tickets_desc: 'Vytvářejte, sledujte a řešte servisní požadavky na stroj.',
  mod_service_maintenance: 'Registrace servisu a údržba',
  mod_service_maintenance_desc: 'Zaznamenávejte provedené servisy a prohlížejte historii podle stroje.',
  mod_claims: 'Reklamace',
  mod_claims_desc: 'Vytvářejte a sledujte servisní a záruční případy přímo v portálu.',
  mod_warranty_reg: 'Registrace záruky',
  mod_warranty_reg_desc: 'Zaregistrujte stroj před prodejem pro snadnější a rychlejší pozdější servis.',
  mod_tsb: 'TSB / Technical Service Bulletin', mod_tsb_desc: 'Technical Service Bulletin.',
  mod_users: 'Uživatelé',
  mod_users_desc: 'Spravujte všechny uživatele portálu, schvalujte registrace a přiřazujte role.',
  mod_roles: 'Role', mod_roles_desc: 'Definujte role portálu a výchozí oprávnění.',
  mod_module_access: 'Přístup k modulům', mod_module_access_desc: 'Řiďte, ke kterým modulům má každá role přístup.',
  mod_audit: 'Audit log', mod_audit_desc: 'Zobrazte změny uživatelů, rolí a přístupů.',
  mod_portal_analytics: 'Analytika portálu', mod_portal_analytics_desc: 'Využití portálu — návštěvy, relace a moduly.',
  mod_dealer_accounts: 'Účty prodejců',
  mod_dealer_accounts_desc: 'Přehled všech prodejců, servisních partnerů a importérů — s přiřazeným prodejcem, uživateli, nabídkami a objednávkami.',
  mod_sellers: 'Prodejci', mod_sellers_desc: 'Timan prodejci a jim přiřazení prodejci.',
  mod_price_lists: 'Ceníky', mod_price_lists_desc: 'Spravujte ceny produktů, importujte z ERP a exportujte do CSV.',
  mod_budget_import: 'Import rozpočtu', mod_budget_import_desc: 'Importujte rozpočty prodejců z Excelu do CRM Budget.',

  supportSectionTitle: 'Technická podpora Timan a informace o společnosti',
  supportHeading: 'Podpora', companyHeading: 'Informace o společnosti',
  labelPhone: 'Telefon', labelEmail: 'E-mail', labelCompany: 'Společnost', labelAddress: 'Adresa',

  crmMyDealers: 'Moji prodejci', crmAccounts: 'Účty', crmLeads: 'Leady',
  crmQuotes: 'Nabídky', crmOrders: 'Objednávky', crmActivities: 'Aktivity',
  crmCalendar: 'Kalendář', crmBudget: 'Rozpočet', crmReports: 'Reporty',
  crmScopeAll: 'Zobrazení všech dat CRM',
  crmScopeOwner: 'Zobrazení pouze přiřazených účtů',

  logout: 'Odhlásit',
  dealerInactive: 'Účet prodejce již není aktivní',
  dealerBlocked: 'Účet prodejce je zablokován',
  dealerInactiveBody: 'Tento účet prodejce již není aktivní. Kontaktujte Timan.',
  dealerBlockedBody: 'Tento účet prodejce je zablokován. Kontaktujte Timan.',
  dealerClaimsSubtitle: 'Přehled vašich reklamací.',
  adminClaimsSubtitle: 'Aktivní reklamace napříč prodejci — pouze otevřené případy.',
};

// ---------------------------------------------------------------------------

export const translations: Record<PortalUiLanguage, Dict> = {
  da, en, de, it, hu, sv, fr, pl, cs,
};

/**
 * Translate a key with safe fallback: requested language → English → Danish → key.
 * Never throws. Pass `uiLanguage` from `useLanguage()` for full 9-language support.
 */
export function t(key: string, lang: PortalUiLanguage | string | null | undefined): string {
  const dicts: Dict[] = [];
  if (lang && (translations as Record<string, Dict>)[lang as string]) {
    dicts.push((translations as Record<string, Dict>)[lang as string]);
  }
  dicts.push(translations.en, translations.da);
  for (const d of dicts) {
    const v = d[key];
    if (typeof v === 'string') return v;
  }
  return key;
}
