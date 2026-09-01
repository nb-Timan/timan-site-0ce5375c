/**
 * Dealer detail dashboard for CRM → Mine forhandlere.
 * Route: /portal/crm/my-dealers/:accountNumber
 *
 * Shows:
 *  • Dealer master data + main/branch relation
 *  • Linked portal users (read-only for sellers)
 *  • KPI cards (open activities, this week, last/next, leads, quotes, orders)
 *  • Notehistorik (internal Timan-only)
 *  • Næste opfølgning at the top
 *
 * External CRM users may reach this route only for dealers in their
 * downline partner scope. Internal notes stay hidden from external roles.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Building2, Mail, MapPin, Phone, GitBranch, Star,
  FileText, ClipboardList, TrendingUp,
  CheckCircle2, AlertCircle, Pencil,
  Globe, CalendarPlus, PlusCircle, Smartphone, UserCircle2,
  Save, Send, Trash2, X, Wrench, Clock, AlertTriangle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listDealerContacts, resolveCanonicalFirstContact, type DealerContact } from "@/lib/dealerContactsService";
import { toast } from "sonner";
import { useAppUser, type SessionUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useCountryFormatter, formatCountry as formatCountryFn } from "@/lib/formatCountry";
import { mapUiLanguageToLegacy, type PortalUiLanguage } from "@/lib/portalLanguages";
import CrmLayout from "@/components/crm/CrmLayout";
import AddressAutocomplete, { type ResolvedAddress } from "@/components/crm/AddressAutocomplete";
import {
  buildPendingGeocodingPatch,
  buildResolvedGeocodingPatch,
  hasUsableDealerAddress,
  requestDealerGeocoding,
} from "@/lib/dealerGeocodingService";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, isDealerNumberAllowed, isExternalCrmRole, isScopedSeller } from "@/lib/crmScope";
import { useEffectivePortalUser } from "@/lib/viewAsUser";
import { buildJournalScope } from "@/lib/machineJournalScope";
import {
  DealerAccount, DealerAccountStats,
  fetchDealerAccountFamilyByNumber, fetchDealerAccountStatsByNumbers, fetchDealerAccountsForSeller,
  updateDealerAccount, type UpdateDealerAccountPatch,
  isDealerInactive, dealerLifecycleStatus, resolveActiveDealer, isDealerCustomerAccount,
} from "@/lib/dealerAccountsService";
import { buildDealerDetailRowsFromVisibleDealers } from "@/lib/dealerDetailScope";
import type { BackendUser } from "@/lib/backend-users-store";
import { sellerInitialsMatch } from "@/lib/sellerInitials";
import {
  getPartnerAccountTypeLabel,
  PARTNER_ACCOUNT_MAP_TYPE_IDS,
  resolvePartnerAccountType,
  type PartnerAccountTypeId,
} from "@/lib/partnerAccountTypes";
import {
  buildPartnerAdminSellerOptions,
  buildPartnerAdminSellerState,
  buildPartnerAdminTypePatch,
  getInitialPartnerAdminType,
  type PartnerAdminSellerOption,
} from "@/lib/partnerAdminEdit";
import { supabase } from "@/lib/supabase";
import {
  listActivities as listCalendarActivities,
  createActivity as createCalendarActivity,
  ACTIVITY_TYPES, activityTypeMeta,
  type CalendarActivity, type CalendarActivityType,
} from "@/lib/crmCalendarService";
import {
  createDealerNote, createDealerNoteComment, deleteDealerNote,
  listDealerNoteComments, listDealerNotesForNumbers, shareDealerNote, updateDealerNote,
  type DealerNote, type DealerNoteAuthorParty, type DealerNoteComment, type DealerNoteType,
} from "@/lib/dealerNotesService";
import {
  getEffectiveSellerInitials, getEffectiveSellerEmail,
  getActiveSellerView, getActiveMode,
} from "@/lib/activeMode";
import { useSellerDirectory } from "@/lib/sellerDirectory";
import {
  listScopedOrdersWithValue,
  type CrmOrderWithValue,
} from "@/lib/crmConfigurationsService";
import {
  listScopedOpenQuotes,
  dealerKeyOf,
  quoteMonthIso,
  type ScopedConfiguration,
} from "@/lib/crmRelationsService";
import { resolveSellerId } from "@/lib/resolveSellerId";
import {
  listLeads, listDemoLeads, formatLeadNo, formatDemoNo,
  type CrmLead, type CrmDemoLead,
} from "@/lib/crmLeadsService";
import { fetchDealerContractsForDealerAccount, type DealerContractRecord } from "@/lib/dealerContractsService";
import { getContractWorkflowStatusLabel } from "@/lib/contractFlow";
import {
  getDemoOverviewMachines,
  listDealerMachineRegister,
  type DealerMachineRegisterRow,
} from "@/lib/dealerMachineRegisterService";
import { isOpenLead } from "@/lib/leadStatus";
import {
  buildDealerBudgetIndex,
  aggregateDealerBudget,
  classifyBudgetStatus,
  type DealerBudgetIndex,
} from "@/lib/crmDealerBudget";
import DealerBudgetHistory from "@/components/crm/DealerBudgetHistory";
import RegisteredUsersTable, { buildRegisteredUserRows } from "@/components/portal/RegisteredUsersTable";
import PartnerAgreementHistory from "@/components/portal/PartnerAgreementHistory";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** New multilang strings for redesigned dealer detail. */
type DealerDetailText = Partial<Record<PortalUiLanguage, string>> & { da: string; en?: string };
const L: Record<string, DealerDetailText> = {
  primary_contact:  { da: "Primær kontaktperson", en: "Primary contact", de: "Hauptansprechpartner", it: "Contatto principale", hu: "Elsődleges kapcsolat" },
  no_primary:       { da: "Primær kontaktperson mangler", en: "Primary contact missing", de: "Hauptansprechpartner fehlt", it: "Contatto principale mancante", hu: "Hiányzó elsődleges kapcsolat" },
  call:             { da: "Kontaktperson", en: "Contact person", de: "Ansprechpartner", it: "Referente", hu: "Kapcsolattartó" },
  send_mail:        { da: "Send mail", en: "Email", de: "E-Mail", it: "Email", hu: "Email" },
  directions:       { da: "Rutevejledning", en: "Directions", de: "Route", it: "Indicazioni", hu: "Útvonal" },
  website:          { da: "Hjemmeside", en: "Website", de: "Webseite", it: "Sito web", hu: "Weboldal" },
  new_activity:     { da: "Opret aktivitet", en: "New activity", de: "Aktivität anlegen", it: "Nuova attività", hu: "Új tevékenység" },
  open_dealer_data: { da: "Virksomheds- og persondata", en: "Company and personal data", de: "Unternehmens- und Personendaten", it: "Dati aziendali e personali", hu: "Cég- és személyes adatok", sv: "Företags- och personuppgifter", fr: "Données d’entreprise et personnelles", pl: "Dane firmy i osób", cs: "Firemní a osobní údaje" },
  schedule_meeting: { da: "Planlæg møde", en: "Schedule meeting", de: "Termin planen", it: "Pianifica riunione", hu: "Találkozó ütemezése" },
  tab_overview:     { da: "Overblik", en: "Overview", de: "Übersicht", it: "Panoramica", hu: "Áttekintés" },
  tab_contacts:     { da: "Kontakter", en: "Contacts", de: "Kontakte", it: "Contatti", hu: "Kapcsolatok" },
  tab_activities:   { da: "Aktiviteter", en: "Activities", de: "Aktivitäten", it: "Attività", hu: "Tevékenységek" },
  tab_notes:        { da: "Noter", en: "Notes", de: "Notizen", it: "Note", hu: "Jegyzetek" },
  tab_documents:    { da: "Dokumenter", en: "Documents", de: "Dokumente", it: "Documenti", hu: "Dokumentumok" },
  tab_machines:     { da: "Maskiner", en: "Machines", de: "Maschinen", it: "Macchine", hu: "Gépek" },
  tab_company:      { da: "Firmaoplysninger", en: "Company info", de: "Firmendaten", it: "Dati azienda", hu: "Cégadatok" },
  tab_users:        { da: "Brugere", en: "Users", de: "Benutzer", it: "Utenti", hu: "Felhasználók" },
  active_portal_users: { da: "Aktive portalbrugere", en: "Active portal users", de: "Aktive Portalbenutzer", it: "Utenti portale attivi", hu: "Aktív portálfelhasználók" },
  registered_contacts: { da: "Registrerede kontaktpersoner", en: "Registered contacts", de: "Registrierte Kontakte", it: "Contatti registrati", hu: "Regisztrált kapcsolatok" },
  open_in_dealer_data: { da: "Virksomheds- og persondata", en: "Company and personal data", de: "Unternehmens- und Personendaten", it: "Dati aziendali e personali", hu: "Cég- és személyes adatok", sv: "Företags- och personuppgifter", fr: "Données d’entreprise et personnelles", pl: "Dane firmy i osób", cs: "Firemní a osobní údaje" },
  users_and_contacts: { da: "Brugere og kontaktpersoner", en: "Users and contacts", de: "Benutzer und Kontakte", it: "Utenti e contatti", hu: "Felhasználók és kapcsolatok" },
  no_contacts:      { da: "Ingen kontaktpersoner registreret.", en: "No contacts registered.", de: "Keine Kontakte registriert.", it: "Nessun contatto registrato.", hu: "Nincs regisztrált kapcsolat." },
  status:           { da: "Status", en: "Status", de: "Status", it: "Stato", hu: "Állapot" },
  last_login:       { da: "Sidste login", en: "Last login", de: "Letzter Login", it: "Ultimo accesso", hu: "Utolsó belépés" },
  area:             { da: "Område", en: "Area", de: "Bereich", it: "Area", hu: "Terület" },
  comment:          { da: "Kommentar", en: "Comment", de: "Kommentar", it: "Commento", hu: "Megjegyzés" },
  no_documents:     { da: "Ingen dokumenter endnu.", en: "No documents yet.", de: "Noch keine Dokumente.", it: "Nessun documento.", hu: "Még nincsenek dokumentumok." },
  demo_machines:    { da: "Demo-maskiner", en: "Demo machines", de: "Demomaschinen", it: "Macchine demo", hu: "Demógépek" },
  no_active_demo_machines: { da: "Ingen aktive demo-maskiner", en: "No active demo machines", de: "Keine aktiven Demomaschinen", it: "Nessuna macchina demo attiva", hu: "Nincs aktív demógép" },
  no_machines:      { da: "Ingen maskiner", en: "No machines", de: "Keine Maschinen", it: "Nessuna macchina", hu: "Nincs gép" },
  view_machines:    { da: "Se maskiner", en: "View machines", de: "Maschinen anzeigen", it: "Vedi macchine", hu: "Gépek megtekintése" },
  all_machines:     { da: "Alle", en: "All", de: "Alle", it: "Tutte", hu: "Összes" },
  serial_number:    { da: "Serienummer", en: "Serial number", de: "Seriennummer", it: "Numero di serie", hu: "Sorozatszám" },
  machine_model:    { da: "Model/type", en: "Model/type", de: "Modell/Typ", it: "Modello/tipo", hu: "Modell/típus" },
  order_no:         { da: "Ordrenr.", en: "Order no.", de: "Auftragsnr.", it: "N. ordine", hu: "Rendelésszám" },
  delivery_date:    { da: "Levering", en: "Delivery", de: "Lieferung", it: "Consegna", hu: "Szállítás" },
  customer:         { da: "Kunde", en: "Customer", de: "Kunde", it: "Cliente", hu: "Ügyfél" },
  warranty_sp:      { da: "Garanti/SP", en: "Warranty/SP", de: "Garantie/SP", it: "Garanzia/SP", hu: "Garancia/SP" },
  lifecycle_status: { da: "Lifecycle-status", en: "Lifecycle status", de: "Lifecycle-Status", it: "Stato lifecycle", hu: "Életciklus állapot" },
  normal_machine:   { da: "Normal", en: "Normal", de: "Normal", it: "Normale", hu: "Normál" },
  active_demo:      { da: "Aktiv demo", en: "Active demo", de: "Aktive Demo", it: "Demo attiva", hu: "Aktív demó" },
  ready_for_sale:   { da: "Klar til salg", en: "Ready for sale", de: "Verkaufsbereit", it: "Pronta per la vendita", hu: "Eladásra kész" },
  sold_early:       { da: "Solgt før tilladt dato", en: "Sold before allowed date", de: "Vor erlaubtem Datum verkauft", it: "Venduta prima della data consentita", hu: "Engedélyezett dátum előtt eladva" },
  sold_registered:  { da: "Solgt/garantiregistreret", en: "Sold/warranty registered", de: "Verkauft/garantieregistriert", it: "Venduta/registrata in garanzia", hu: "Eladva/garanciára regisztrálva" },
  demo_missing_delivery: { da: "Demo - leveringsdato mangler", en: "Demo - delivery date missing", de: "Demo - Lieferdatum fehlt", it: "Demo - data consegna mancante", hu: "Demó - szállítási dátum hiányzik" },
  days_left:        { da: "dage tilbage", en: "days left", de: "Tage verbleiben", it: "giorni rimanenti", hu: "nap van hátra" },
  days_early:       { da: "dage før tid", en: "days early", de: "Tage zu früh", it: "giorni in anticipo", hu: "nappal korábban" },
  after_9_months:   { da: "efter 9 mdr.", en: "after 9 months", de: "nach 9 Monaten", it: "dopo 9 mesi", hu: "9 hónap után" },

  role:             { da: "Rolle", en: "Role", de: "Rolle", it: "Ruolo", hu: "Szerep" },
  phone:            { da: "Telefon", en: "Phone", de: "Telefon", it: "Telefono", hu: "Telefon" },
  mobile:           { da: "Mobil", en: "Mobile", de: "Mobil", it: "Cellulare", hu: "Mobil" },
  email:            { da: "E-mail", en: "Email", de: "E-Mail", it: "Email", hu: "Email" },
  language:         { da: "Sprog", en: "Language", de: "Sprache", it: "Lingua", hu: "Nyelv" },
  status_active:    { da: "Aktiv", en: "Active", de: "Aktiv", it: "Attivo", hu: "Aktív" },
  area_sales:       { da: "Salg", en: "Sales", de: "Vertrieb", it: "Vendite", hu: "Értékesítés" },
  area_director:    { da: "Direktør", en: "Director", de: "Geschäftsführer", it: "Amministratore", hu: "Ügyvezető" },
  area_workshop:    { da: "Værksted & service", en: "Workshop & service", de: "Werkstatt & Service", it: "Officina e assistenza", hu: "Műhely és szerviz" },
  area_parts:       { da: "Indkøb & logistik", en: "Purchasing & logistics", de: "Einkauf & Logistik", it: "Acquisti e logistica", hu: "Beszerzés és logisztika" },
  area_marketing:   { da: "Marketing", en: "Marketing", de: "Marketing", it: "Marketing", hu: "Marketing" },
  area_finance:     { da: "Økonomi", en: "Finance", de: "Finanzen", it: "Finanza", hu: "Pénzügy" },
  area_primary:     { da: "Primær", en: "Primary", de: "Hauptkontakt", it: "Principale", hu: "Elsődleges" },
  company_details:  { da: "Virksomhedsoplysninger", en: "Company details", de: "Firmendaten", it: "Dettagli azienda", hu: "Cégadatok" },
  recent_activities:{ da: "Seneste aktiviteter", en: "Recent activities", de: "Letzte Aktivitäten", it: "Attività recenti", hu: "Legutóbbi tevékenységek" },
  recent_quotes:    { da: "Seneste tilbud", en: "Recent quotes", de: "Letzte Angebote", it: "Ultimi preventivi", hu: "Legutóbbi árajánlatok" },
  none:             { da: "Ingen", en: "None", de: "Keine", it: "Nessuno", hu: "Nincs" },
  contact_info:     { da: "Firma information", en: "Company information", de: "Firmeninformationen", it: "Informazioni azienda", hu: "Cégadatok" },
  contact_call:     { da: "Kontaktperson", en: "Contact person", de: "Ansprechpartner", it: "Referente", hu: "Kapcsolattartó" },
  address_line_1:   { da: "Adresse 1", en: "Address line 1", de: "Adresse 1", it: "Indirizzo 1", hu: "Cím 1" },
  address_line_2:   { da: "Adresse 2", en: "Address line 2", de: "Adresse 2", it: "Indirizzo 2", hu: "Cím 2" },
  postal_code:      { da: "Postnummer", en: "Postal code", de: "PLZ", it: "CAP", hu: "Irányítószám" },
  city:             { da: "By", en: "City", de: "Stadt", it: "Città", hu: "Város" },
  master_data:      { da: "Stamdata", en: "Master data", de: "Stammdaten", it: "Dati anagrafici", hu: "Törzsadatok" },
  contact_person:   { da: "Kontaktperson", en: "Contact person", de: "Ansprechpartner", it: "Persona di contatto", hu: "Kapcsolattartó" },
  view_users:       { da: "Se brugere", en: "View users", de: "Benutzer anzeigen", it: "Vedi utenti", hu: "Felhasználók megtekintése" },
  address:          { da: "Adresse", en: "Address", de: "Adresse", it: "Indirizzo", hu: "Cím" },
  country:          { da: "Land", en: "Country", de: "Land", it: "Paese", hu: "Ország" },
  customer_type:    { da: "Partnertype", en: "Partner type", de: "Partnertyp", it: "Tipo partner", hu: "Partner típusa" },
  account_number:   { da: "Kontonummer", en: "Account number", de: "Kundennr.", it: "Numero conto", hu: "Számlaszám" },
  company_name_lbl: { da: "Firmanavn", en: "Company name", de: "Firmenname", it: "Ragione sociale", hu: "Cégnév" },
  assigned_seller:  { da: "Timan-sælger", en: "Timan seller", de: "Timan-Verkäufer", it: "Venditore Timan", hu: "Timan értékesítő" },
  created_at_lbl:   { da: "Oprettet", en: "Created", de: "Erstellt", it: "Creato il", hu: "Létrehozva" },
  vat:              { da: "CVR/VAT", en: "VAT", de: "USt-IdNr.", it: "P.IVA", hu: "Adószám" },
  status_lbl:       { da: "Status", en: "Status", de: "Status", it: "Stato", hu: "Állapot" },
  dealer:           { da: "Forhandler", en: "Dealer", de: "Händler", it: "Rivenditore", hu: "Kereskedő", sv: "Återförsäljare", fr: "Revendeur", pl: "Dealer", cs: "Prodejce" },
  importer:         { da: "Importør", en: "Importer", de: "Importeur", it: "Importatore", hu: "Importőr", sv: "Importör", fr: "Importateur", pl: "Importer", cs: "Importér" },
  service_partner:  { da: "Servicepartner", en: "Service partner", de: "Servicepartner", it: "Partner assistenza", hu: "Szervizpartner", sv: "Servicepartner", fr: "Partenaire service", pl: "Partner serwisowy", cs: "Servisní partner" },
  dealer_customer:  { da: "Forhandlerkunde", en: "Dealer customer", de: "Händlerkunde", it: "Cliente rivenditore", hu: "Kereskedő ügyfele", sv: "Återförsäljarkund", fr: "Client revendeur", pl: "Klient dealera", cs: "Zákazník prodejce" },
  collaboration_partner: { da: "Samarbejdspartner", en: "Collaboration partner", de: "Kooperationspartner", it: "Partner", hu: "Partner", sv: "Samarbetspartner", fr: "Partenaire", pl: "Partner", cs: "Partner" },
  collaboration_partners: { da: "Samarbejdspartnere", en: "Collaboration partners", de: "Kooperationspartner", it: "Partner", hu: "Partnerek", sv: "Samarbetspartner", fr: "Partenaires", pl: "Partnerzy", cs: "Partneři" },
  show_all:         { da: "Vis alle", en: "Show all", de: "Alle anzeigen", it: "Mostra tutti", hu: "Összes megjelenítése", sv: "Visa alla", fr: "Tout afficher", pl: "Pokaż wszystkie", cs: "Zobrazit vše" },
  branch:           { da: "Filial", en: "Branch", de: "Filiale", it: "Filiale", hu: "Telephely", sv: "Filial", fr: "Filiale", pl: "Oddział", cs: "Pobočka" },
  group:            { da: "Gruppe", en: "Group", de: "Gruppe", it: "Gruppo", hu: "Csoport", sv: "Grupp", fr: "Groupe", pl: "Grupa", cs: "Skupina" },
  main_account:     { da: "Hovedkonto", en: "Main account", de: "Hauptkonto", it: "Account principale", hu: "Fő fiók", sv: "Huvudkonto", fr: "Compte principal", pl: "Konto główne", cs: "Hlavní účet" },
  no_budget:        { da: "Intet budget", en: "No budget", de: "Kein Budget", it: "Nessun budget", hu: "Nincs költségvetés", sv: "Ingen budget", fr: "Aucun budget", pl: "Brak budżetu", cs: "Žádný rozpočet" },
  edit_dealer:      { da: "Rediger partner", en: "Edit partner", de: "Partner bearbeiten", it: "Modifica partner", hu: "Partner szerkesztése", sv: "Redigera partner", fr: "Modifier le partenaire", pl: "Edytuj partnera", cs: "Upravit partnera" },
  notes_heading:    { da: "Noter", en: "Notes", de: "Notizen", it: "Note", hu: "Jegyzetek", sv: "Anteckningar", fr: "Notes", pl: "Notatki", cs: "Poznámky" },
  internal_notes:   { da: "Interne noter", en: "Internal notes", de: "Interne Notizen", it: "Note interne", hu: "Belső jegyzetek", sv: "Interna anteckningar", fr: "Notes internes", pl: "Notatki wewnętrzne", cs: "Interní poznámky" },
  shared_notes:     { da: "Delte noter", en: "Shared notes", de: "Geteilte Notizen", it: "Note condivise", hu: "Megosztott jegyzetek", sv: "Delade anteckningar", fr: "Notes partagées", pl: "Notatki udostępnione", cs: "Sdílené poznámky" },
  no_shared_notes:  { da: "Ingen delte noter endnu.", en: "No shared notes yet.", de: "Noch keine geteilten Notizen.", it: "Ancora nessuna nota condivisa.", hu: "Még nincsenek megosztott jegyzetek.", sv: "Inga delade anteckningar ännu.", fr: "Aucune note partagée pour le moment.", pl: "Brak udostępnionych notatek.", cs: "Zatím žádné sdílené poznámky." },
  no_notes:         { da: "Ingen interne noter endnu.", en: "No internal notes yet.", de: "Noch keine internen Notizen.", it: "Ancora nessuna nota interna.", hu: "Még nincsenek belső jegyzetek.", sv: "Inga interna anteckningar ännu.", fr: "Aucune note interne pour le moment.", pl: "Brak notatek wewnętrznych.", cs: "Zatím žádné interní poznámky." },
  shared:           { da: "Delt", en: "Shared", de: "Geteilt", it: "Condivisa", hu: "Megosztva", sv: "Delad", fr: "Partagée", pl: "Udostępnione", cs: "Sdíleno" },
  add_activity_note:{ da: "Tilføj aktivitet / note", en: "Add activity / note", de: "Aktivität / Notiz hinzufügen", it: "Aggiungi attività / nota", hu: "Tevékenység / jegyzet hozzáadása", sv: "Lägg till aktivitet / anteckning", fr: "Ajouter une activité / note", pl: "Dodaj aktywność / notatkę", cs: "Přidat aktivitu / poznámku" },
  add_note_title:   { da: "Tilføj note", en: "Add note", de: "Notiz hinzufügen", it: "Aggiungi nota", hu: "Jegyzet hozzáadása", sv: "Lägg till anteckning", fr: "Ajouter une note", pl: "Dodaj notatkę", cs: "Přidat poznámku" },
  dealer_internal_default: { da: "Forhandler: {dealer} · intern som standard", en: "Dealer: {dealer} · internal by default", de: "Händler: {dealer} · standardmäßig intern", it: "Rivenditore: {dealer} · interna come standard", hu: "Kereskedő: {dealer} · alapértelmezetten belső", sv: "Återförsäljare: {dealer} · intern som standard", fr: "Revendeur : {dealer} · interne par défaut", pl: "Dealer: {dealer} · domyślnie wewnętrzna", cs: "Prodejce: {dealer} · výchozí interní" },
  note_text:        { da: "Notetekst", en: "Note text", de: "Notiztext", it: "Testo nota", hu: "Jegyzet szövege", sv: "Anteckningstext", fr: "Texte de la note", pl: "Treść notatki", cs: "Text poznámky" },
  followup_optional:{ da: "Opfølgningsdato (valgfri)", en: "Follow-up date (optional)", de: "Nachfassdatum (optional)", it: "Data follow-up (facoltativa)", hu: "Utánkövetési dátum (opcionális)", sv: "Uppföljningsdatum (valfritt)", fr: "Date de suivi (facultatif)", pl: "Data działania następczego (opcjonalnie)", cs: "Datum následné akce (volitelné)" },
  create_calendar:  { da: "Opret også kalenderaktivitet", en: "Also create calendar activity", de: "Auch Kalenderaktivität erstellen", it: "Crea anche attività calendario", hu: "Naptári aktivitás létrehozása is", sv: "Skapa även kalenderaktivitet", fr: "Créer aussi une activité calendrier", pl: "Utwórz także aktywność kalendarza", cs: "Vytvořit také aktivitu kalendáře" },
  activity_title:   { da: "Aktivitetstitel", en: "Activity title", de: "Aktivitätstitel", it: "Titolo attività", hu: "Aktivitás címe", sv: "Aktivitetstitel", fr: "Titre de l’activité", pl: "Tytuł aktywności", cs: "Název aktivity" },
  activity_type:    { da: "Aktivitetstype", en: "Activity type", de: "Aktivitätstyp", it: "Tipo attività", hu: "Aktivitás típusa", sv: "Aktivitetstyp", fr: "Type d’activité", pl: "Typ aktywności", cs: "Typ aktivity" },
  date_time:        { da: "Dato/tid", en: "Date/time", de: "Datum/Uhrzeit", it: "Data/ora", hu: "Dátum/idő", sv: "Datum/tid", fr: "Date/heure", pl: "Data/godzina", cs: "Datum/čas" },
  saving:           { da: "Gemmer…", en: "Saving…", de: "Speichern…", it: "Salvataggio…", hu: "Mentés…", sv: "Sparar…", fr: "Enregistrement…", pl: "Zapisywanie…", cs: "Ukládání…" },
  save_note:        { da: "Gem note", en: "Save note", de: "Notiz speichern", it: "Salva nota", hu: "Jegyzet mentése", sv: "Spara anteckning", fr: "Enregistrer la note", pl: "Zapisz notatkę", cs: "Uložit poznámku" },
  edit_note:        { da: "Ret note", en: "Edit note", de: "Notiz bearbeiten", it: "Modifica nota", hu: "Jegyzet szerkesztése", sv: "Redigera anteckning", fr: "Modifier la note", pl: "Edytuj notatkę", cs: "Upravit poznámku" },
  delete_note:      { da: "Slet note", en: "Delete note", de: "Notiz löschen", it: "Elimina nota", hu: "Jegyzet törlése", sv: "Ta bort anteckning", fr: "Supprimer la note", pl: "Usuń notatkę", cs: "Smazat poznámku" },
  share_with_dealer:{ da: "Del med forhandler", en: "Share with dealer", de: "Mit Händler teilen", it: "Condividi con rivenditore", hu: "Megosztás kereskedővel", sv: "Dela med återförsäljare", fr: "Partager avec le revendeur", pl: "Udostępnij dealerowi", cs: "Sdílet s prodejcem" },
  share_with_timan: { da: "Del med Timan", en: "Share with Timan", de: "Mit Timan teilen", it: "Condividi con Timan", hu: "Megosztás a Timannal", sv: "Dela med Timan", fr: "Partager avec Timan", pl: "Udostępnij Timan", cs: "Sdílet s Timan" },
  comment_add_placeholder: { da: "Tilføj kommentar...", en: "Add comment...", de: "Kommentar hinzufügen...", it: "Aggiungi commento...", hu: "Megjegyzés hozzáadása...", sv: "Lägg till kommentar...", fr: "Ajouter un commentaire...", pl: "Dodaj komentarz...", cs: "Přidat komentář..." },
  comment_submit:   { da: "Kommentér", en: "Comment", de: "Kommentieren", it: "Commenta", hu: "Hozzászólás", sv: "Kommentera", fr: "Commenter", pl: "Skomentuj", cs: "Komentovat" },
  note_save_error:  { da: "Kunne ikke gemme noten.", en: "Could not save the note.", de: "Notiz konnte nicht gespeichert werden.", it: "Impossibile salvare la nota.", hu: "A jegyzet mentése sikertelen.", sv: "Kunde inte spara anteckningen.", fr: "Impossible d’enregistrer la note.", pl: "Nie można zapisać notatki.", cs: "Poznámku se nepodařilo uložit." },
  note_update_success: { da: "Noten er opdateret.", en: "The note has been updated.", de: "Die Notiz wurde aktualisiert.", it: "La nota è stata aggiornata.", hu: "A jegyzet frissítve.", sv: "Anteckningen har uppdaterats.", fr: "La note a été mise à jour.", pl: "Notatka została zaktualizowana.", cs: "Poznámka byla aktualizována." },
  note_delete_error: { da: "Kunne ikke slette noten.", en: "Could not delete the note.", de: "Notiz konnte nicht gelöscht werden.", it: "Impossibile eliminare la nota.", hu: "A jegyzet törlése sikertelen.", sv: "Kunde inte ta bort anteckningen.", fr: "Impossible de supprimer la note.", pl: "Nie można usunąć notatki.", cs: "Poznámku se nepodařilo smazat." },
  note_share_error: { da: "Kunne ikke dele noten.", en: "Could not share the note.", de: "Notiz konnte nicht geteilt werden.", it: "Impossibile condividere la nota.", hu: "A jegyzet megosztása sikertelen.", sv: "Kunde inte dela anteckningen.", fr: "Impossible de partager la note.", pl: "Nie można udostępnić notatki.", cs: "Poznámku se nepodařilo sdílet." },
  linked_calendar_activity: { da: "Se tilknyttet kalenderaktivitet →", en: "View linked calendar activity →", de: "Verknüpfte Kalenderaktivität ansehen →", it: "Vedi attività calendario collegata →", hu: "Kapcsolt naptári aktivitás megtekintése →", sv: "Visa kopplad kalenderaktivitet →", fr: "Voir l’activité calendrier liée →", pl: "Zobacz powiązaną aktywność kalendarza →", cs: "Zobrazit propojenou aktivitu kalendáře →" },
  dealer_missing_error: { da: "Ingen forhandler valgt.", en: "No dealer selected.", de: "Kein Händler ausgewählt.", it: "Nessun rivenditore selezionato.", hu: "Nincs kiválasztott kereskedő.", sv: "Ingen återförsäljare vald.", fr: "Aucun revendeur sélectionné.", pl: "Nie wybrano dealera.", cs: "Není vybrán žádný prodejce." },
  partner_update_error: { da: "Kunne ikke opdatere partneren.", en: "Could not update the partner.", de: "Partner konnte nicht aktualisiert werden.", it: "Impossibile aggiornare il partner.", hu: "A partner frissítése sikertelen.", sv: "Kunde inte uppdatera partnern.", fr: "Impossible de mettre à jour le partenaire.", pl: "Nie można zaktualizować partnera.", cs: "Partnera se nepodařilo aktualizovat." },
  partner_update_success: { da: "Partneren er opdateret.", en: "The partner has been updated.", de: "Der Partner wurde aktualisiert.", it: "Il partner è stato aggiornato.", hu: "A partner frissítve.", sv: "Partnern har uppdaterats.", fr: "Le partenaire a été mis à jour.", pl: "Partner został zaktualizowany.", cs: "Partner byl aktualizován." },
  seller_phone_missing: { da: "Telefon ikke angivet", en: "Phone not provided", de: "Telefon nicht angegeben", it: "Telefono non indicato", hu: "Nincs telefonszám megadva", sv: "Telefon saknas", fr: "Téléphone non renseigné", pl: "Nie podano telefonu", cs: "Telefon není uveden" },
  cancel:           { da: "Annullér", en: "Cancel", de: "Abbrechen", it: "Annulla", hu: "Mégse", sv: "Avbryt", fr: "Annuler", pl: "Anuluj", cs: "Zrušit" },
  contracts:        { da: "Kontrakter", en: "Contracts", de: "Verträge", it: "Contratti", hu: "Szerződések", sv: "Avtal", fr: "Contrats", pl: "Umowy", cs: "Smlouvy" },
  contract:         { da: "Kontrakt", en: "Contract", de: "Vertrag", it: "Contratto", hu: "Szerződés", sv: "Avtal", fr: "Contrat", pl: "Umowa", cs: "Smlouva" },
  version:          { da: "Version", en: "Version", de: "Version", it: "Versione", hu: "Verzió", sv: "Version", fr: "Version", pl: "Wersja", cs: "Verze" },
  date:             { da: "Dato", en: "Date", de: "Datum", it: "Data", hu: "Dátum", sv: "Datum", fr: "Date", pl: "Data", cs: "Datum" },
  open:             { da: "Åbn", en: "Open", de: "Öffnen", it: "Apri", hu: "Megnyitás", sv: "Öppna", fr: "Ouvrir", pl: "Otwórz", cs: "Otevřít" },
  assigned_timan_seller: { da: "Tildelt Timan-sælger", en: "Assigned Timan seller", de: "Zugewiesener Timan-Verkäufer", it: "Venditore Timan assegnato", hu: "Hozzárendelt Timan értékesítő", sv: "Tilldelad Timan-säljare", fr: "Commercial Timan assigné", pl: "Przypisany sprzedawca Timan", cs: "Přiřazený prodejce Timan" },
  no_seller:        { da: "Ingen sælger", en: "No seller", de: "Kein Verkäufer", it: "Nessun venditore", hu: "Nincs értékesítő", sv: "Ingen säljare", fr: "Aucun commercial", pl: "Brak sprzedawcy", cs: "Žádný prodejce" },
  save_changes:     { da: "Gem ændringer", en: "Save changes", de: "Änderungen speichern", it: "Salva modifiche", hu: "Változások mentése", sv: "Spara ändringar", fr: "Enregistrer les modifications", pl: "Zapisz zmiany", cs: "Uložit změny" },
  dealer_inactive_closed: { da: "Denne forhandler er lukket.", en: "This dealer is closed.", de: "Dieser Händler ist geschlossen.", it: "Questo rivenditore è chiuso.", hu: "Ez a kereskedő lezárt.", sv: "Den här återförsäljaren är stängd.", fr: "Ce revendeur est fermé.", pl: "Ten dealer jest zamknięty.", cs: "Tento prodejce je uzavřen." },
  dealer_inactive_blocked: { da: "Denne forhandler er spærret.", en: "This dealer is blocked.", de: "Dieser Händler ist gesperrt.", it: "Questo rivenditore è bloccato.", hu: "Ez a kereskedő zárolt.", sv: "Den här återförsäljaren är spärrad.", fr: "Ce revendeur est bloqué.", pl: "Ten dealer jest zablokowany.", cs: "Tento prodejce je blokován." },
  status_closed:    { da: "Lukket", en: "Closed", de: "Geschlossen", it: "Chiuso", hu: "Lezárt", sv: "Stängd", fr: "Fermé", pl: "Zamknięty", cs: "Uzavřeno" },
  status_blocked:   { da: "Spærret", en: "Blocked", de: "Gesperrt", it: "Bloccato", hu: "Zárolt", sv: "Spärrad", fr: "Bloqué", pl: "Zablokowany", cs: "Blokováno" },
  successor:        { da: "Efterfølger:", en: "Successor:", de: "Nachfolger:", it: "Successore:", hu: "Utód:", sv: "Efterträdare:", fr: "Successeur :", pl: "Następca:", cs: "Nástupce:" },
  open_successor:   { da: "Åbn efterfølger", en: "Open successor", de: "Nachfolger öffnen", it: "Apri successore", hu: "Utód megnyitása", sv: "Öppna efterträdare", fr: "Ouvrir le successeur", pl: "Otwórz następcę", cs: "Otevřít nástupce" },
  reason:           { da: "Årsag:", en: "Reason:", de: "Grund:", it: "Motivo:", hu: "Ok:", sv: "Orsak:", fr: "Motif :", pl: "Powód:", cs: "Důvod:" },
  no_partners:      { da: "Ingen samarbejdspartnere tilknyttet endnu.", en: "No collaboration partners yet.", de: "Noch keine Kooperationspartner verknüpft.", it: "Nessun partner collegato.", hu: "Még nincs kapcsolt partner.", sv: "Inga samarbetspartner ännu.", fr: "Aucun partenaire lié pour le moment.", pl: "Brak powiązanych partnerów.", cs: "Zatím žádní propojení partneři." },
  open_page:        { da: "Åbn side", en: "Open page", de: "Seite öffnen", it: "Apri pagina", hu: "Oldal megnyitása", sv: "Öppna sida", fr: "Ouvrir la page", pl: "Otwórz stronę", cs: "Otevřít stránku" },
  quotes:           { da: "Tilbud", en: "Quotes", de: "Angebote", it: "Preventivi", hu: "Árajánlatok", sv: "Offerter", fr: "Devis", pl: "Oferty", cs: "Nabídky" },
  orders:           { da: "Ordrer", en: "Orders", de: "Aufträge", it: "Ordini", hu: "Rendelések", sv: "Order", fr: "Commandes", pl: "Zamówienia", cs: "Objednávky" },
  activities_short: { da: "Akt.", en: "Act.", de: "Akt.", it: "Att.", hu: "Akt.", sv: "Akt.", fr: "Act.", pl: "Akt.", cs: "Akt." },
  open_leads:       { da: "Åbne leads", en: "Open leads", de: "Offene Leads", it: "Lead aperti", hu: "Nyitott leadek", sv: "Öppna leads", fr: "Leads ouverts", pl: "Otwarte leady", cs: "Otevřené leady" },
  demo_leads:       { da: "Demo leads", en: "Demo leads", de: "Demo-Leads", it: "Lead demo", hu: "Demó leadek", sv: "Demo-leads", fr: "Leads démo", pl: "Leady demo", cs: "Demo leady" },
  activities_month: { da: "Aktiviteter denne måned", en: "Activities this month", de: "Aktivitäten diesen Monat", it: "Attività questo mese", hu: "Aktivitások ebben a hónapban", sv: "Aktiviteter denna månad", fr: "Activités ce mois-ci", pl: "Aktywności w tym miesiącu", cs: "Aktivity tento měsíc" },
  pipeline:         { da: "Pipeline", en: "Pipeline", de: "Pipeline", it: "Pipeline", hu: "Pipeline", sv: "Pipeline", fr: "Pipeline", pl: "Pipeline", cs: "Pipeline" },
  see_orders:       { da: "Se ordrer →", en: "View orders →", de: "Aufträge ansehen →", it: "Vedi ordini →", hu: "Rendelések megtekintése →", sv: "Visa order →", fr: "Voir les commandes →", pl: "Zobacz zamówienia →", cs: "Zobrazit objednávky →" },
  see_quotes:       { da: "Se tilbud →", en: "View quotes →", de: "Angebote ansehen →", it: "Vedi preventivi →", hu: "Árajánlatok megtekintése →", sv: "Visa offerter →", fr: "Voir les devis →", pl: "Zobacz oferty →", cs: "Zobrazit nabídky →" },
  see_leads:        { da: "Se leads →", en: "View leads →", de: "Leads ansehen →", it: "Vedi lead →", hu: "Leadek megtekintése →", sv: "Visa leads →", fr: "Voir les leads →", pl: "Zobacz leady →", cs: "Zobrazit leady →" },
  see_activities:   { da: "Se aktiviteter →", en: "View activities →", de: "Aktivitäten ansehen →", it: "Vedi attività →", hu: "Aktivitások megtekintése →", sv: "Visa aktiviteter →", fr: "Voir les activités →", pl: "Zobacz aktywności →", cs: "Zobrazit aktivity →" },
  service_cases:    { da: "Servicesager", en: "Service cases", de: "Servicefälle", it: "Casi assistenza", hu: "Szervizügyek", sv: "Serviceärenden", fr: "Cas service", pl: "Sprawy serwisowe", cs: "Servisní případy" },
  warranty_regs:    { da: "Garantiregistreringer", en: "Warranty registrations", de: "Garantieregistrierungen", it: "Registrazioni garanzia", hu: "Garanciaregisztrációk", sv: "Garantiregistreringar", fr: "Enregistrements garantie", pl: "Rejestracje gwarancji", cs: "Registrace záruk" },
  note_general:     { da: "Generel note", en: "General note", de: "Allgemeine Notiz", it: "Nota generale", hu: "Általános jegyzet", sv: "Allmän anteckning", fr: "Note générale", pl: "Notatka ogólna", cs: "Obecná poznámka" },
  note_call:        { da: "Opkald", en: "Call", de: "Anruf", it: "Chiamata", hu: "Hívás", sv: "Samtal", fr: "Appel", pl: "Rozmowa", cs: "Hovor" },
  note_visit:       { da: "Besøg", en: "Visit", de: "Besuch", it: "Visita", hu: "Látogatás", sv: "Besök", fr: "Visite", pl: "Wizyta", cs: "Návštěva" },
  note_follow_up:   { da: "Opfølgning", en: "Follow-up", de: "Nachverfolgung", it: "Follow-up", hu: "Utánkövetés", sv: "Uppföljning", fr: "Suivi", pl: "Działanie następcze", cs: "Následná akce" },
  note_demo:        { da: "Demo", en: "Demo", de: "Demo", it: "Demo", hu: "Demó", sv: "Demo", fr: "Démo", pl: "Demo", cs: "Demo" },
  note_offer:       { da: "Tilbud", en: "Offer", de: "Angebot", it: "Offerta", hu: "Ajánlat", sv: "Offert", fr: "Offre", pl: "Oferta", cs: "Nabídka" },
  note_service:     { da: "Service", en: "Service", de: "Service", it: "Assistenza", hu: "Szerviz", sv: "Service", fr: "Service", pl: "Serwis", cs: "Servis" },
};
const tl = (k: keyof typeof L, lang: PortalUiLanguage): string => L[k][lang] ?? L[k].en ?? L[k].da;

function isServicePartnerAccount(d: Pick<DealerAccount, "customer_type" | "customer_type_label" | "dealer_type">): boolean {
  return [d.customer_type, d.customer_type_label, d.dealer_type].some((value) => {
    const normalized = (value ?? "").toLowerCase().replace(/[\s_-]+/g, "");
    return normalized === "servicepartner";
  });
}

function dealerPresentationType(
  d: Pick<DealerAccount, "customer_type" | "customer_type_label" | "dealer_type" | "parent_account_number">,
  lang: PortalUiLanguage,
): string {
  const type = resolvePartnerAccountType(d);
  if (type !== "other_partner") return getPartnerAccountTypeLabel(type, lang);
  if (d.parent_account_number) return tl("dealer", lang);
  return tl("collaboration_partner", lang);
}

function collaborationPartnerLabel(
  d: Pick<DealerAccount, "customer_type" | "customer_type_label" | "dealer_type" | "parent_account_number">,
  lang: PortalUiLanguage,
): string {
  return dealerPresentationType(d, lang);
}

function fallbackDealerFromUser(user: SessionUser | null, accountNumber: string): DealerAccount | null {
  if (!user?.dealer_number || user.dealer_number !== accountNumber) return null;
  const now = new Date().toISOString();
  return {
    id: `app-user-${accountNumber}`,
    account_number: accountNumber,
    company_name: user.company_dealer || accountNumber,
    customer_type: user.portal_role === "timan_importer" ? "Importer" : user.portal_role === "timan_service_partner" ? "Service Partner" : "Forhandler",
    customer_type_label: user.portal_role === "timan_importer" ? "Importør" : user.portal_role === "timan_service_partner" ? "Servicepartner" : "Forhandler",
    dealer_type: null,
    country: null,
    postal_code: null,
    city: null,
    address: null,
    address_line_1: null,
    address_line_2: null,
    zip_city_raw: null,
    email: null,
    phone: null,
    vat_number: null,
    primary_contact_name: null,
    primary_contact_email: null,
    primary_contact_phone: null,
    assigned_seller_id: null,
    assigned_seller_initials: null,
    assigned_seller_name: null,
    assigned_seller_email: null,
    source_created_at: null,
    source_changed_at: null,
    is_blocked: false,
    blocked_at: null,
    blocked_by: null,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    parent_account_number: null,
    is_main_account: true,
    branch_name: null,
    director_name: null,
    invoice_email: null,
    payment_terms: null,
    currency_code: null,
    finance_contact_name: null,
    finance_contact_phone: null,
    finance_contact_email: null,
    website: null,
    social_facebook: null,
    social_linkedin: null,
    social_tiktok: null,
    social_youtube: null,
    social_instagram: null,
    sales_contact_name: null,
    sales_contact_phone: null,
    sales_contact_email: null,
    sales_has_multiple: false,
    workshop_contact_name: null,
    workshop_contact_phone: null,
    workshop_contact_email: null,
    workshop_has_multiple: false,
    marketing_contact_name: null,
    marketing_contact_phone: null,
    marketing_contact_email: null,
    latitude: null,
    longitude: null,
    geocoded_at: null,
    geocoding_status: null,
    geocoding_error: null,
    google_place_id: null,
    successor_dealer_id: null,
    successor_dealer_account_number: null,
    closed_reason: null,
    closed_at: null,
    created_at: now,
    updated_at: now,
  };
}

const NOTE_TYPE_KEY: Record<DealerNoteType, keyof typeof L> = {
  general: "note_general",
  call: "note_call",
  visit: "note_visit",
  follow_up: "note_follow_up",
  demo: "note_demo",
  offer: "note_offer",
  service: "note_service",
};

function noteTypeLabel(type: DealerNoteType, lang: PortalUiLanguage): string {
  return tl(NOTE_TYPE_KEY[type] ?? "note_general", lang);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("da-DK"); } catch { return "—"; }
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" }); } catch { return "—"; }
}
function groupNoteComments(rows: DealerNoteComment[]): Record<string, DealerNoteComment[]> {
  return rows.reduce<Record<string, DealerNoteComment[]>>((acc, row) => {
    acc[row.note_id] = [...(acc[row.note_id] || []), row];
    return acc;
  }, {});
}
function startOfIsoWeek(d: Date): Date {
  const x = new Date(d); x.setHours(0,0,0,0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

const DETAIL_USER_COLUMNS = [
  "id", "email", "phone", "full_name", "initials", "company", "country", "postal_code", "preferred_language",
  "dealer_number", "company_dealer", "seller_initials", "seller_email", "portal_role", "status",
  "approved", "is_active", "last_login",
  "account_owner_user_id", "account_owner_name", "account_owner_initials", "account_owner_email",
].join(", ");

function detailUserFromRow(row: Record<string, unknown>): BackendUser {
  const name = String(row.full_name || row.email || "");
  const explicitInitials = String(row.initials || "").trim();
  const initials = explicitInitials || name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 3)
    .join("")
    .toUpperCase();
  const language = String(row.preferred_language || "da").toLowerCase();
  return {
    id: String(row.id),
    initials: initials.toUpperCase().slice(0, 4) || "?",
    name,
    email: String(row.email || ""),
    phone: (row.phone as string | null) ?? null,
    company: String(row.company || ""),
    country: String(row.country || "DK"),
    postal_code: (row.postal_code as string | null) ?? null,
    language: (["da", "en", "de", "it", "hu"].includes(language) ? language : "da") as BackendUser["language"],
    dealer_number: (row.dealer_number as string | null) ?? null,
    company_dealer: (row.company_dealer as string | null) ?? null,
    seller_initials: (row.seller_initials as string | null) ?? null,
    seller_email: (row.seller_email as string | null) ?? null,
    notes: null,
    role: ((row.portal_role as BackendUser["role"] | null) ?? "dealer_user"),
    status: row.status === "blocked" ? "blocked" : row.status === "pending" ? "pending" : "active",
    approved: row.approved !== false,
    is_active: row.is_active !== false,
    allowed_areas: [],
    allowed_modules: [],
    backend_modules: [],
    perms: {
      can_create_claims: false,
      can_approve_claims: false,
      can_create_tsb: false,
      can_manage_users: false,
      can_manage_payment_terms: false,
      can_apply_extra_dealer_discount: false,
      can_save_configurator_as_lead: false,
      news_manage: false,
      can_view_prices: false,
      can_submit_order: false,
    },
    account_owner_user_id: (row.account_owner_user_id as string | null) ?? null,
    account_owner_name: (row.account_owner_name as string | null) ?? null,
    account_owner_initials: (row.account_owner_initials as string | null) ?? null,
    account_owner_email: (row.account_owner_email as string | null) ?? null,
    last_login_at: (row.last_login as string | null) ?? null,
  };
}

async function fetchDealerDetailUsers(
  dealers: DealerAccount[],
  opts: { includeAllTimanUsers?: boolean } = {},
): Promise<BackendUser[]> {
  const dealerNumbers = Array.from(new Set(dealers.map((d) => d.account_number).filter(Boolean)));
  const sellerEmails = Array.from(new Set(dealers
    .map((d) => d.assigned_seller_email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email))));
  const byId = new Map<string, BackendUser>();

  const addRows = (rows: unknown[] | null | undefined) => {
    for (const row of (rows ?? []) as Record<string, unknown>[]) {
      const user = detailUserFromRow(row);
      byId.set(user.id, user);
    }
  };

  if (dealerNumbers.length > 0) {
    const { data, error } = await supabase
      .from("app_users")
      .select(DETAIL_USER_COLUMNS)
      .in("dealer_number", dealerNumbers)
      .order("email", { ascending: true });
    if (error) {
      console.warn("[CrmDealerDetailPage] dealer users query failed:", error);
    } else {
      addRows(data);
    }
  }

  if (sellerEmails.length > 0) {
    const { data, error } = await supabase
      .from("app_users")
      .select(DETAIL_USER_COLUMNS)
      .in("email", sellerEmails)
      .order("email", { ascending: true });
    if (error) {
      console.warn("[CrmDealerDetailPage] assigned seller users query failed:", error);
    } else {
      addRows(data);
    }
  }

  if (opts.includeAllTimanUsers) {
    const { data: timanUsers, error: timanUsersError } = await supabase
      .from("app_users")
      .select(DETAIL_USER_COLUMNS)
      .in("portal_role", ["timan_seller", "timan_backend"])
      .order("email", { ascending: true });
    if (timanUsersError) {
      console.warn("[CrmDealerDetailPage] Timan users query failed:", timanUsersError);
    } else {
      addRows(timanUsers);
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.email.localeCompare(b.email));
}

export default function CrmDealerDetailPage() {
  const { accountNumber = "" } = useParams<{ accountNumber: string }>();
  const { appUser, loading } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  const { uiLanguage: lang } = useLanguage();
  const legacyLang = mapUiLanguageToLegacy(lang);
  const { formatCountry } = useCountryFormatter();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  

  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [stats, setStats] = useState<Record<string, DealerAccountStats>>({});
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [calendar, setCalendar] = useState<CalendarActivity[]>([]);
  const [notes, setNotes] = useState<DealerNote[]>([]);
  const [noteComments, setNoteComments] = useState<Record<string, DealerNoteComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [noteBusyId, setNoteBusyId] = useState<string | null>(null);
  const [dealerContacts, setDealerContacts] = useState<DealerContact[]>([]);
  const [scope, setScope] = useState<"branch" | "group">("branch");
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showEditDealer, setShowEditDealer] = useState(false);
  const [showCollaborationModal, setShowCollaborationModal] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [dealerMachines, setDealerMachines] = useState<DealerMachineRegisterRow[]>([]);
  const [machineStatusFilter, setMachineStatusFilter] = useState<"all" | "demo_attention">("all");
  const [busy, setBusy] = useState(true);
  // Live CRM configurations (same source as CRM → Tilbud / Ordrer).
  // Used for accurate Tilbud / Ordrer / Vundne ordrer / Pipeline-værdi KPIs
  // — instead of dealer_account_stats which can lag for newly-created orders
  // and only counts via created_by_user_id (misses backend/seller-created ones).
  const [dealerQuotes, setDealerQuotes] = useState<ScopedConfiguration[]>([]);
  const [dealerOrders, setDealerOrders] = useState<CrmOrderWithValue[]>([]);
  const [dealerContracts, setDealerContracts] = useState<DealerContractRecord[]>([]);
  const [allLeads, setAllLeads] = useState<CrmLead[]>([]);
  const [allDemos, setAllDemos] = useState<CrmDemoLead[]>([]);
  const [budgetIndex, setBudgetIndex] = useState<DealerBudgetIndex | null>(null);
  const budgetYear = new Date().getFullYear();

  const portalRole = useMemo(() => derivePortalRole(effectiveUser), [effectiveUser]);
  const sellerDirectory = useSellerDirectory();
  const admin = isCrmAdmin(portalRole);
  const seller = isScopedSeller(portalRole);
  const externalCrm = isExternalCrmRole(portalRole);
  const canAccess = admin || seller || externalCrm;
  const canUseNotes = admin || seller || externalCrm;
  const noteAuthorParty: DealerNoteAuthorParty = externalCrm ? "dealer" : "timan";

  const [activeMode, setActiveMode] = useState<string>(() => getActiveMode(appUser?.email));
  useEffect(() => {
    const h = () => setActiveMode(getActiveMode(appUser?.email));
    window.addEventListener("timan:active-mode-changed", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("timan:active-mode-changed", h);
      window.removeEventListener("storage", h);
    };
  }, [appUser?.email]);
  void activeMode;

  useEffect(() => {
    if (!appUser || !accountNumber) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        let dealerRows: DealerAccount[] = [];
        let scopedDealerNumbers: string[] | null = null;
        let sellerStats: Record<string, DealerAccountStats> | null = null;
        if (seller) {
          const sellerRes = await fetchDealerAccountsForSeller({
            initials: getEffectiveSellerInitials(appUser),
            email: getEffectiveSellerEmail(appUser),
          });
          dealerRows = buildDealerDetailRowsFromVisibleDealers(sellerRes.dealers, accountNumber);
          sellerStats = sellerRes.stats;
        } else {
          const [scopeRes, dRes] = await Promise.all([
            externalCrm ? buildJournalScope(effectiveUser, portalRole) : Promise.resolve(null),
            fetchDealerAccountFamilyByNumber(accountNumber, { includeDeleted: admin }),
          ]);
          scopedDealerNumbers = scopeRes ? Array.from(scopeRes.dealerNumbers) : null;
          const visibleDealers = scopedDealerNumbers
            ? dRes.rows.filter((d) => isDealerNumberAllowed(d.account_number, scopedDealerNumbers))
            : dRes.rows;
          const fallbackDealer = externalCrm ? fallbackDealerFromUser(effectiveUser, accountNumber) : null;
          dealerRows = fallbackDealer && !visibleDealers.some((d) => d.account_number === fallbackDealer.account_number)
            ? [...visibleDealers, fallbackDealer]
            : visibleDealers;
        }
        if (cancelled) return;
        if (dealerRows.length === 0) {
          setDealers([]);
          setStats({});
          setUsers([]);
          setCalendar([]);
          setDealerQuotes([]);
          setDealerOrders([]);
          setDealerMachines([]);
          setAllLeads([]);
          setAllDemos([]);
          setBudgetIndex(null);
          return;
        }
        const dealerNumbers = Array.from(new Set(dealerRows.map((d) => d.account_number).filter(Boolean)));
        const dealerIds = Array.from(new Set(dealerRows.map((d) => d.id).filter(Boolean)));
        const [sRes, detailUsers, cal] = await Promise.all([
          sellerStats ? Promise.resolve({ rows: [] as DealerAccountStats[] }) : fetchDealerAccountStatsByNumbers(dealerNumbers),
          fetchDealerDetailUsers(dealerRows, { includeAllTimanUsers: admin || seller }),
          listCalendarActivities({ accountIds: dealerIds }),
        ]);
        if (cancelled) return;
        setDealers(dealerRows);
        const map: Record<string, DealerAccountStats> = {};
        if (sellerStats) {
          for (const dealer of dealerRows) {
            const stat = sellerStats[dealer.id];
            if (stat) map[dealer.id] = stat;
          }
        } else {
          for (const s of sRes.rows) map[s.id] = s;
        }
        setStats(map);
        setUsers(detailUsers);
        setCalendar(scopedDealerNumbers
          ? cal.filter((a) => !a.account_id || dealerRows.some((d) => d.id === a.account_id))
          : cal);
        // Fetch live quotes + orders for ALL accessible scopes — backend admin
        // and sellers now fetch only this dealer family. We still keep the
        // existing client-side match below so branch/group toggle works.
        const sellerView = getActiveSellerView(appUser?.email);
        const sellerId = await resolveSellerId(sellerView?.email ?? appUser?.email);
        const sellerInitials = sellerView?.initials
          ?? (seller && appUser?.display_name ? appUser.display_name.match(/^([A-ZÆØÅ]{2,4})/)?.[1] ?? null : null);
        const sellerEmail = sellerView?.email ?? (seller ? appUser?.email?.toLowerCase() ?? null : null);
        const filterBase = {
          role: portalRole,
          sellerId,
          sellerInitials,
          sellerEmail,
          dealerNumber: externalCrm ? effectiveUser?.dealer_number ?? null : null,
          dealerNumbers,
        } as const;
        const [qRes, oRes, leadsRes, demosRes] = await Promise.all([
          listScopedOpenQuotes(filterBase),
          listScopedOrdersWithValue(filterBase),
          listLeads({ limit: 500, linkedDealerIds: dealerIds, payload: "summary" }),
          listDemoLeads({
            limit: 500,
            dealerCompanies: Array.from(new Set(dealerRows.flatMap((d) => [d.company_name, d.branch_name].filter(Boolean) as string[]))),
            payload: "summary",
          }),
        ]);
        if (!cancelled) {
          setDealerQuotes(qRes.rows);
          setDealerOrders(oRes.rows);
          setAllLeads(leadsRes);
          setAllDemos(demosRes);
        }
        try {
          const rootDealer = dealerRows.find((d) => d.account_number === accountNumber) ?? dealerRows[0] ?? null;
          const machineScope = await buildJournalScope(effectiveUser, portalRole);
          const machineRows = rootDealer ? await listDealerMachineRegister(rootDealer, machineScope) : [];
          if (!cancelled) setDealerMachines(machineRows);
        } catch (e) {
          console.warn("[CrmDealerDetailPage] dealer machines failed:", e);
          if (!cancelled) setDealerMachines([]);
        }
        // Dealer budget index (year-scoped) using same data as Budget Dashboard.
        try {
          const idx = await buildDealerBudgetIndex({
            year: budgetYear,
            dealers: dealerRows,
            filter: filterBase,
          });
          if (!cancelled) setBudgetIndex(idx);
        } catch (e) {
          console.warn('[CrmDealerDetailPage] budget index failed:', e);
        }
      } catch (e) {
        console.warn('[CrmDealerDetailPage] failed to fetch dealer detail:', e);
        if (!cancelled) {
          const fallbackDealer = externalCrm ? fallbackDealerFromUser(effectiveUser, accountNumber) : null;
          setDealers(fallbackDealer ? [fallbackDealer] : []);
          setStats({});
          setUsers([]);
          setCalendar([]);
          setDealerQuotes([]);
          setDealerOrders([]);
          setDealerMachines([]);
          setAllLeads([]);
          setAllDemos([]);
          setBudgetIndex(null);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [appUser, effectiveUser, accountNumber, portalRole, budgetYear, admin, seller, externalCrm, activeMode]);

  const dealer = useMemo(
    () => dealers.find(d => d.account_number === accountNumber) ?? null,
    [dealers, accountNumber]
  );
  const canEditPartnerAdmin = useMemo(() => {
    if (admin) return true;
    if (!seller || !dealer) return false;
    const effectiveSellerId = (effectiveUser as { id?: string | null } | null)?.id ?? appUser?.id ?? null;
    const effectiveSellerEmail = getEffectiveSellerEmail(appUser);
    const effectiveSellerInitials = getEffectiveSellerInitials(appUser);
    return Boolean(
      (effectiveSellerId && dealer.assigned_seller_id === effectiveSellerId) ||
      (effectiveSellerEmail && dealer.assigned_seller_email?.toLowerCase() === effectiveSellerEmail.toLowerCase()) ||
      (effectiveSellerInitials && sellerInitialsMatch(dealer.assigned_seller_initials, effectiveSellerInitials))
    );
  }, [admin, seller, dealer, effectiveUser, appUser]);

  const partnerAdminSellerOptions = useMemo<PartnerAdminSellerOption[]>(() => {
    const directoryOptions = sellerDirectory.list
      .filter((entry) => ["timan_backend", "timan_seller", "timan_service"].includes(entry.portal_role ?? ""))
      .map((entry) => ({
        id: entry.id,
        email: entry.email,
        initials: entry.initials,
        name: entry.full_name || entry.email,
        phone: entry.phone,
      }));
    if (directoryOptions.length > 0) return directoryOptions;
    return users
      .filter((u) =>
        u.is_active &&
        u.approved &&
        (u.role === "timan_seller" || u.role === "timan_backend" || u.role === "timan_service") &&
        Boolean(u.initials && u.email)
      )
      .map((u) => ({
        id: u.id,
        email: u.email,
        initials: u.initials,
        name: u.name,
        phone: u.phone,
      }));
  }, [sellerDirectory.list, users]);

  // Determine main + branches grouping
  const mainAccountNumber = dealer?.parent_account_number || dealer?.account_number || "";
  const branchNumbers = useMemo(() => {
    if (!dealer) return [] as string[];
    const main = dealers.find(d => d.account_number === mainAccountNumber);
    const children = dealers.filter(d => d.parent_account_number === mainAccountNumber).map(d => d.account_number);
    return [main?.account_number, ...children].filter((x): x is string => Boolean(x));
  }, [dealers, dealer, mainAccountNumber]);

  const scopeNumbers = scope === "branch" || branchNumbers.length <= 1
    ? [accountNumber]
    : branchNumbers;

  // Load notes (whenever scope changes)
  useEffect(() => {
    if (!dealer || !canUseNotes) {
      setNotes([]);
      setNoteComments({});
      return;
    }
    let cancelled = false;
    (async () => {
      const n = await listDealerNotesForNumbers(scopeNumbers);
      const comments = await listDealerNoteComments(n.map((note) => note.id));
      if (!cancelled) {
        setNotes(n);
        setNoteComments(groupNoteComments(comments));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealer?.id, scope, branchNumbers.join(","), canUseNotes]);

  // Load extra dealer_contacts (sales/workshop/parts/marketing/finance).
  useEffect(() => {
    if (!dealer?.id) { setDealerContacts([]); return; }
    let cancelled = false;
    listDealerContacts(dealer.id).then((rows) => { if (!cancelled) setDealerContacts(rows); });
    return () => { cancelled = true; };
  }, [dealer?.id]);

  useEffect(() => {
    if (!dealer?.account_number) { setDealerContracts([]); return; }
    let cancelled = false;
    fetchDealerContractsForDealerAccount(dealer.account_number).then(({ rows }) => {
      if (!cancelled) setDealerContracts(rows);
    });
    return () => { cancelled = true; };
  }, [dealer?.account_number]);

  useEffect(() => {
    if (!dealer || !canEditPartnerAdmin || searchParams.get("edit") !== "1") return;
    setShowEditDealer(true);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [dealer, canEditPartnerAdmin, searchParams, setSearchParams]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!canAccess) return <Navigate to="/portal" replace />;

  if (externalCrm && effectiveUser?.dealer_number && accountNumber !== effectiveUser.dealer_number) {
    return <Navigate to={`/portal/crm/my-dealers/${encodeURIComponent(effectiveUser.dealer_number)}`} replace />;
  }

  if (!busy && !dealer) {
    return (
      <CrmLayout pageTitle="Forhandler ikke fundet">
        <div className="bg-white border rounded-xl p-6">
          <p className="text-slate-700">Forhandler {accountNumber} blev ikke fundet eller er ikke tildelt dig.</p>
        </div>
      </CrmLayout>
    );
  }

  if (!dealer) return <CrmLayout pageTitle="…"><div className="text-slate-500 text-sm">Henter…</div></CrmLayout>;

  const linkedUsers = users.filter(u =>
    scopeNumbers.includes(u.dealer_number || "")
  );
  const registeredUserCount = buildRegisteredUserRows(linkedUsers, dealerContacts, lang).length;

  const activitiesForScope = calendar.filter(a =>
    scopeNumbers.includes(a.dealer_account_number || "")
  );

  const now = new Date();
  const weekStart = startOfIsoWeek(now);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);

  const openActs = activitiesForScope.filter(a => a.status === "planned");
  const thisWeekActs = activitiesForScope.filter(a => {
    const d = new Date(a.start_datetime);
    return d >= weekStart && d < weekEnd;
  });
  const lastDoneAct = activitiesForScope
    .filter(a => a.status === "done")
    .sort((a, b) => b.start_datetime.localeCompare(a.start_datetime))[0];

  // Next follow-up = next planned activity OR earliest future note follow-up
  const upcomingPlanned = openActs
    .filter(a => new Date(a.start_datetime) >= now)
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))[0];
  const upcomingNote = notes
    .filter(n => n.follow_up_date && new Date(n.follow_up_date) >= now)
    .sort((a, b) => (a.follow_up_date || "").localeCompare(b.follow_up_date || ""))[0];

  const nextFollowup =
    upcomingPlanned && (!upcomingNote || upcomingPlanned.start_datetime <= (upcomingNote.follow_up_date || ""))
      ? { date: upcomingPlanned.start_datetime, title: upcomingPlanned.title, seller: upcomingPlanned.seller_initials, status: upcomingPlanned.status, kind: "activity" as const }
      : upcomingNote
        ? { date: upcomingNote.follow_up_date!, title: noteTypeLabel(upcomingNote.note_type, lang), seller: upcomingNote.seller_initials, status: "planned", kind: "note" as const }
        : null;

  // Stats from dealer_account_stats view (legacy fallback only).
  const ownStats = stats[dealer.id];

  // Live counts from CRM → Tilbud / Ordrer source (crm_configurations_view).
  // Match by dealer_number across the in-scope numbers (branch or group).
  // This is the SAME source as CRM → Ordrer, so any visible row there is
  // counted here too — including new orders not yet picked up by the
  // dealer_account_stats aggregation view.
  const scopeNumberSet = new Set(scopeNumbers.map((n) => String(n)));
  // Canonical dealer keys for this dealer (id + numbers + normalized name).
  // Mirrors crmRelationsService.dealerKeyOf so any quote whose dealer resolves
  // to one of these keys is counted here.
  const normName = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const dealerKeySet = new Set<string>();
  if (dealer.id) dealerKeySet.add(`id:${dealer.id}`);
  for (const num of scopeNumbers) if (num) dealerKeySet.add(`num:${String(num).trim()}`);
  for (const d of dealers) {
    if (scopeNumberSet.has(String(d.account_number))) {
      const n = normName(d.company_name);
      if (n) dealerKeySet.add(`name:${n}`);
      const bn = normName(d.branch_name);
      if (bn) dealerKeySet.add(`name:${bn}`);
    }
  }
  const matchesDealer = (key: string | null) => !!key && dealerKeySet.has(key);

  const dealerQuotesInScope = dealerQuotes.filter((r) => matchesDealer(r.dealer_key ?? dealerKeyOf(r)));
  const demoOverviewMachines = getDemoOverviewMachines(dealerMachines);
  const displayedDealerMachines = machineStatusFilter === "demo_attention" ? demoOverviewMachines : dealerMachines;
  // Orders: match using the SAME canonical dealer-key resolution as quotes
  // (dealer_account_id → dealer_number/account_number → normalized name).
  // Previously this only checked dealer_number, which missed orders where
  // dealer_number was blank/stale after a quote→order conversion even though
  // dealer_account_id or dealer_company_name still pointed at the right dealer.
  const dealerOrdersInScope = dealerOrders.filter((r) => matchesDealer(dealerKeyOf(r)));
  const wonOrdersInScope = dealerOrdersInScope.filter((r) => {
    const s = (r.case_status || '').toLowerCase();
    return s === 'ordre_afgivet' || !!r.order_sent_at || !!r.submitted_at;
  });
  const liveQuoteCount = dealerQuotesInScope.length;
  const liveOrderCount = dealerOrdersInScope.length;
  const liveWonCount = wonOrdersInScope.length;
  // Pipeline value = open configurator quotes (computed from state_json via
  // crmRelationsService) + open orders.
  const openQuotesValue = dealerQuotesInScope.reduce((s, r) => s + (r.total_value || 0), 0);
  const livePipelineValue = dealerOrdersInScope.reduce((s, r) => s + (r.total_value || 0), 0) + openQuotesValue;
  // Latest activity from quotes (used to enrich "Sidste aktivitet" if no
  // calendar activity is more recent).
  const latestQuoteIso = dealerQuotesInScope
    .map((r) => quoteMonthIso(r))
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;
  const lastDoneIso = lastDoneAct?.start_datetime || null;
  const latestActivityIso = [latestQuoteIso, lastDoneIso].filter(Boolean).sort().reverse()[0] || null;
  const fmtKr = (v: number) => `${Math.round(v).toLocaleString('da-DK')} kr.`;
  const budgetTotals = budgetIndex ? aggregateDealerBudget(budgetIndex, scopeNumbers) : null;

  const mainDealer = dealers.find(d => d.account_number === mainAccountNumber);
  const isBranch = !!dealer.parent_account_number;
  const hasGroup = branchNumbers.length > 1;
  const collaborationPartners = dealers
    .filter((d) => {
      if (d.parent_account_number !== mainAccountNumber) return false;
      if (d.is_deleted || d.is_blocked) return false;
      return Boolean(d.parent_account_number) || isDealerCustomerAccount(d) || isServicePartnerAccount(d);
    })
    .sort((a, b) => (a.branch_name || a.company_name).localeCompare(b.branch_name || b.company_name, "da"));

  const sellerCtx = getActiveSellerView(appUser.email);
  const effInitials = getEffectiveSellerInitials(appUser);
  const effEmail = getEffectiveSellerEmail(appUser);
  const currentEmail = (effEmail || appUser?.email || "").toLowerCase();

  function isNoteOwner(note: DealerNote): boolean {
    const noteEmail = (note.created_by_email || "").toLowerCase();
    const noteInitials = (note.seller_initials || "").toUpperCase();
    return Boolean(noteEmail && currentEmail && noteEmail === currentEmail)
      || Boolean(noteInitials && effInitials && noteInitials === effInitials.toUpperCase());
  }

  function canManageNote(note: DealerNote): boolean {
    return admin || isNoteOwner(note);
  }

  function notePartyLabel(note: DealerNote): string {
    return note.author_party === "dealer" ? (dealer?.branch_name || dealer?.company_name || "Forhandler") : "Timan";
  }

  function canCommentNote(note: DealerNote): boolean {
    return canUseNotes && note.visibility === "shared";
  }

  const internalNotes = notes.filter((note) =>
    note.visibility !== "shared" && (admin || note.author_party === noteAuthorParty)
  );
  const sharedNotes = notes.filter((note) => note.visibility === "shared");

  async function handleUpdateNote(note: DealerNote) {
    const text = editingNoteText.trim();
    if (!text) {
      toast.error("Noten må ikke være tom.");
      return;
    }
    setNoteBusyId(note.id);
    const res = await updateDealerNote(note.id, {
      note_type: note.note_type,
      note_text: text,
      follow_up_date: note.follow_up_date,
    });
    setNoteBusyId(null);
    if (!res.ok) {
      toast.error(res.error || tl("note_save_error", lang));
      return;
    }
    setNotes((prev) => prev.map((row) => row.id === note.id ? { ...row, note_text: text } : row));
    setEditingNoteId(null);
    setEditingNoteText("");
    toast.success(tl("note_update_success", lang));
  }

  async function handleDeleteNote(note: DealerNote) {
    if (!window.confirm("Vil du slette noten?")) return;
    setNoteBusyId(note.id);
    const res = await deleteDealerNote(note.id);
    setNoteBusyId(null);
    if (!res.ok) {
      toast.error(res.error || tl("note_delete_error", lang));
      return;
    }
    setNotes((prev) => prev.filter((row) => row.id !== note.id));
    setNoteComments((prev) => {
      const next = { ...prev };
      delete next[note.id];
      return next;
    });
    toast.success("Noten er slettet.");
  }

  async function handleAddComment(note: DealerNote) {
    if (!canCommentNote(note)) return;
    const text = (commentDrafts[note.id] || "").trim();
    if (!text) return;
    setNoteBusyId(note.id);
    const comment = await createDealerNoteComment({
      note_id: note.id,
      comment_text: text,
      created_by_user_id: null,
      created_by_email: effEmail || appUser?.email || null,
      seller_initials: effInitials || null,
    });
    setNoteBusyId(null);
    setNoteComments((prev) => ({
      ...prev,
      [note.id]: [...(prev[note.id] || []), comment],
    }));
    setCommentDrafts((prev) => ({ ...prev, [note.id]: "" }));
  }

  async function handleShareNote(note: DealerNote) {
    setNoteBusyId(note.id);
    const sharedAt = new Date().toISOString();
    const res = await shareDealerNote(note.id);
    setNoteBusyId(null);
    if (!res.ok) {
      toast.error(res.error || tl("note_share_error", lang));
      return;
    }
    setNotes((prev) => prev.map((row) => row.id === note.id
      ? { ...row, visibility: "shared", shared_at: sharedAt }
      : row
    ));
    toast.success("Noten er delt.");
  }

  async function handleAddNote(input: NewNoteForm) {
    if (!dealer) return;
    const note = await createDealerNote({
      dealer_number: dealer.account_number,
      dealer_name: dealer.branch_name || dealer.company_name,
      created_by_user_id: null,
      created_by_email: effEmail || appUser?.email || null,
      seller_initials: effInitials || null,
      note_type: input.note_type,
      note_text: input.note_text,
      follow_up_date: input.follow_up_date || null,
      visibility: input.share_note ? "shared" : "internal",
      author_party: noteAuthorParty,
      shared_at: input.share_note ? new Date().toISOString() : null,
    });
    let linkedActivityId: string | null = null;
    if (input.create_calendar) {
      const created = await createCalendarActivity({
        title: input.cal_title || `${noteTypeLabel(input.note_type, lang)} — ${dealer.branch_name || dealer.company_name}`,
        start_datetime: input.cal_when || new Date().toISOString(),
        activity_type: input.cal_type,
        account_id: dealer.id,
        dealer_name: dealer.branch_name || dealer.company_name,
        dealer_account_number: dealer.account_number,
        dealer_assigned_seller_initials: dealer.assigned_seller_initials,
        dealer_assigned_seller_email: dealer.assigned_seller_email,
        seller_initials: effInitials || null,
        seller_name: sellerCtx?.label || appUser?.display_name || null,
        created_by_user_id: null,
        created_by_email: effEmail || appUser?.email || null,
        note: input.note_text,
        status: "planned",
      });
      linkedActivityId = created.id;
      // Also auto-create a mirroring note describing the calendar activity
      await createDealerNote({
        dealer_number: dealer.account_number,
        dealer_name: dealer.branch_name || dealer.company_name,
        created_by_user_id: null,
        created_by_email: effEmail || appUser?.email || null,
        seller_initials: effInitials || null,
        note_type: "follow_up",
        note_text: `Kalenderaktivitet oprettet: ${created.title} (${activityTypeMeta(created.activity_type).label[legacyLang] ?? activityTypeMeta(created.activity_type).label.da}) — ${fmtDateTime(created.start_datetime)} · sælger ${created.seller_initials || "—"}`,
        linked_activity_id: created.id,
        follow_up_date: created.start_datetime,
        visibility: "internal",
        author_party: noteAuthorParty,
      });
      const calendarDealerIds = Array.from(new Set(
        dealers
          .filter((d) => scopeNumbers.includes(d.account_number))
          .map((d) => d.id)
          .filter(Boolean),
      ));
      const cal = await listCalendarActivities({ accountIds: calendarDealerIds });
      setCalendar(cal);
    }
    setNotes(prev => [{ ...note, linked_activity_id: linkedActivityId ?? note.linked_activity_id }, ...prev]);
    setShowNoteModal(false);
  }

  function renderNoteCard(n: DealerNote) {
    const comments = noteComments[n.id] || [];
    const canShare = n.visibility !== "shared" && canManageNote(n);
    return (
      <li key={n.id} className={`rounded-lg border p-3 ${n.visibility === "shared" ? "border-emerald-200 bg-emerald-50/40" : "border-slate-100 bg-slate-50/50"}`}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-700">{noteTypeLabel(n.note_type, lang)}</span>
            <span>·</span>
            <span>{notePartyLabel(n)}</span>
            <span>·</span>
            <span>{fmtDateTime(n.created_at)}</span>
            <span>·</span>
            <span>{n.seller_initials || "—"}</span>
          </div>
          {n.visibility === "shared" && (
            <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              Delt
            </span>
          )}
        </div>
        {n.follow_up_date && (
          <div className="mb-2">
            <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
              Opfølgning: {fmtDateTime(n.follow_up_date)}
            </span>
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editingNoteId === n.id ? (
              <textarea
                value={editingNoteText}
                onChange={(e) => setEditingNoteText(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            ) : (
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.note_text}</p>
            )}
          </div>
          {canManageNote(n) && (
            <div className="flex shrink-0 items-center gap-1">
              {editingNoteId === n.id ? (
                <>
                  <button
                    type="button"
                    disabled={noteBusyId === n.id}
                    onClick={() => void handleUpdateNote(n)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    title={tl("save_note", lang)}
                  >
                    <Save className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={noteBusyId === n.id}
                    onClick={() => { setEditingNoteId(null); setEditingNoteText(""); }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                    title={tl("cancel", lang)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { setEditingNoteId(n.id); setEditingNoteText(n.note_text); }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                    title={tl("edit_note", lang)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={noteBusyId === n.id}
                    onClick={() => void handleDeleteNote(n)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    title={tl("delete_note", lang)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {canShare && (
          <button
            type="button"
            disabled={noteBusyId === n.id}
            onClick={() => void handleShareNote(n)}
            className="mt-2 inline-flex items-center rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {noteAuthorParty === "timan" ? tl("share_with_dealer", lang) : tl("share_with_timan", lang)}
          </button>
        )}
        {comments.length > 0 && (
          <div className="mt-3 space-y-1.5 border-l-2 border-emerald-200 pl-3">
            {comments.map((comment) => (
              <div key={comment.id} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                <div className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                  <span>{comment.seller_initials || comment.created_by_email || tl("comment", lang)}</span>
                  <span>·</span>
                  <span>{fmtDateTime(comment.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap">{comment.comment_text}</p>
              </div>
            ))}
          </div>
        )}
        {canCommentNote(n) && (
          <div className="mt-3 flex items-center gap-2">
            <input
              value={commentDrafts[n.id] || ""}
              onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [n.id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleAddComment(n);
                }
              }}
              placeholder={tl("comment_add_placeholder", lang)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            <button
              type="button"
              disabled={noteBusyId === n.id || !(commentDrafts[n.id] || "").trim()}
              onClick={() => void handleAddComment(n)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Send className="h-3.5 w-3.5" />
              {tl("comment_submit", lang)}
            </button>
          </div>
        )}
        {n.linked_activity_id && (
          <Link to="/portal/crm/calendar" className="text-[11px] text-emerald-700 underline mt-2 inline-block">
            {tl("linked_calendar_activity", lang)}
          </Link>
        )}
      </li>
    );
  }

  async function handleSaveDealer(patch: UpdateDealerAccountPatch): Promise<{ ok: boolean; error?: string }> {
    if (!dealer) return { ok: false, error: tl("dealer_missing_error", lang) };
    const res = await updateDealerAccount(dealer.id, patch);
    if (!res.ok) {
      toast.error(res.error || tl("partner_update_error", lang));
      return res;
    }
    // Refresh only this dealer family; the detail view derives from it.
    const dRes = await fetchDealerAccountFamilyByNumber(accountNumber, { includeDeleted: false });
    setDealers(dRes.rows);
    toast.success(tl("partner_update_success", lang));
    setShowEditDealer(false);
    return { ok: true };
  }

  return (
    <CrmLayout pageTitle={dealer.branch_name || dealer.company_name}>

      {isDealerInactive(dealer) && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className={
              "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold text-white " +
              (dealer.is_deleted ? "bg-slate-600" : "bg-rose-600")
            }>
              {dealer.is_deleted ? tl("status_closed", lang) : tl("status_blocked", lang)}
            </span>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-amber-900">
                {tl(dealerLifecycleStatus(dealer) === "closed" ? "dealer_inactive_closed" : "dealer_inactive_blocked", lang)}
              </p>
              {(() => {
                const byId = new Map(dealers.map((d) => [d.id, d]));
                const successor = dealer.successor_dealer_id
                  ? resolveActiveDealer(dealer.successor_dealer_id, byId)
                  : null;
                return (
                  <>
                    {successor && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="text-slate-700">
                          <span className="font-medium">{tl("successor", lang)}</span>{" "}
                          <span className="font-semibold text-slate-900">{successor.company_name}</span>
                        </span>
                        <span className="text-slate-700">
                          <span className="font-medium">{tl("account_number", lang)}:</span>{" "}
                          <span className="font-mono text-slate-900">{successor.account_number}</span>
                        </span>
                        <Link
                          to={`/portal/crm/my-dealers/${successor.account_number}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                        >
                          {tl("open_successor", lang)} <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    )}
                    {dealer.closed_reason && (
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">{tl("reason", lang)}</span>{" "}
                        <span className="italic">{dealer.closed_reason}</span>
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {(() => {
        const dealerIdSet = new Set(scopeNumbers
          .map((n) => dealers.find((d) => d.account_number === n)?.id)
          .filter((x): x is string => !!x));
        const scopeLeads = allLeads.filter((l) =>
          (l.linked_dealer_id && (dealerIdSet.has(l.linked_dealer_id) || scopeNumberSet.has(l.linked_dealer_id)))
        );
        const openLeads = scopeLeads.filter(isOpenLead);
        const scopeDealerNames = new Set(
          scopeNumbers
            .map((n) => dealers.find((d) => d.account_number === n))
            .flatMap((d) => d ? [normName(d.company_name), normName(d.branch_name)] : [])
            .filter(Boolean)
        );
        const scopeDemos = allDemos.filter((d) => {
          const nm = normName(d.dealer_company);
          return nm && scopeDealerNames.has(nm);
        });
        const openDemos = scopeDemos.filter((d) => {
          const s = (d.result_status || "").toLowerCase();
          return s !== "won" && s !== "lost" && s !== "closed" && s !== "vundet" && s !== "tabt" && s !== "lukket";
        });

        return (
          <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,1fr)] xl:items-start">
            <div className="min-w-0 space-y-4">
              <ContactHero
                dealer={dealer}
                contacts={dealerContacts}
                lang={lang}
                admin={canEditPartnerAdmin}
                isBranch={isBranch}
                mainDealer={mainDealer ?? null}
                hasGroup={hasGroup}
                scope={scope}
                setScope={setScope}
                branchCount={branchNumbers.length}
                budgetTotals={budgetTotals}
                budgetYear={budgetYear}
                sellers={partnerAdminSellerOptions}
                onEdit={() => setShowEditDealer(true)}
              />
              <KpiStrip
                orders={liveOrderCount}
                quotes={liveQuoteCount}
                pipelineValue={livePipelineValue}
                openLeads={openLeads.length}
                openDemos={openDemos.length}
                fmtKr={fmtKr}
                dealerName={dealer.branch_name || dealer.company_name || ""}
                lang={lang}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{tl("recent_quotes", lang)}</h3>
                {dealerQuotesInScope.slice(0, 4).length === 0 ? (
                  <p className="text-sm text-slate-500">{tl("none", lang)}</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {dealerQuotesInScope.slice(0, 4).map(q => (
                      <li key={q.id} className="truncate"><span className="text-slate-500">{fmtDate(quoteMonthIso(q))}:</span> {q.title || q.quote_number || q.id}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{tl("recent_activities", lang)}</h3>
                {activitiesForScope.slice(0, 4).length === 0 ? (
                  <p className="text-sm text-slate-500">{tl("none", lang)}</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {[...activitiesForScope].sort((a,b)=>b.start_datetime.localeCompare(a.start_datetime)).slice(0,4).map(a => (
                      <li key={a.id} className="truncate"><span className="text-slate-500">{fmtDate(a.start_datetime)}:</span> {a.title || (activityTypeMeta(a.activity_type).label[legacyLang] ?? activityTypeMeta(a.activity_type).label.da)}</li>
                    ))}
                  </ul>
                )}
              </div>

              <CollaborationPartnersPanel
                partners={collaborationPartners}
                stats={stats}
                lang={lang}
                onOpenList={() => setShowCollaborationModal(true)}
                compact
              />

              <CrmDemoMachinesPanel
                rows={demoOverviewMachines}
                lang={lang}
                onOpenMachines={() => {
                  setMachineStatusFilter("demo_attention");
                  setActiveTab("machines");
                }}
                compact
              />
            </div>
          </div>
        );
      })()}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto bg-transparent p-0 mb-4 border-b border-slate-200 rounded-none gap-1 w-full justify-start">
          {([
            ["overview", tl("tab_overview", lang)],
            ["users", `${tl("tab_users", lang)} (${registeredUserCount})`],
            ["documents", tl("tab_documents", lang)],
            ["machines", tl("tab_machines", lang)],
          ] as const).map(([val, label]) => (
            <TabsTrigger
              key={val}
              value={val}
              className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-sm font-semibold text-slate-500 shadow-none data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:text-emerald-700 data-[state=active]:shadow-none hover:text-slate-800"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>


        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-0">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] xl:items-start">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                  {tl("notes_heading", lang)}
                  <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal">{notes.length}</span>
                </h3>
                <button onClick={() => setShowNoteModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <PlusCircle className="h-4 w-4" />
                  </span>
                  {tl("add_activity_note", lang)}
                </button>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {tl("internal_notes", lang)}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">{internalNotes.length}</span>
                  </h4>
                  {internalNotes.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-500">{tl("no_notes", lang)}</p>
                  ) : (
                    <ul className="space-y-2">{internalNotes.slice(0, 10).map(renderNoteCard)}</ul>
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
                    {tl("shared_notes", lang)}
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">{sharedNotes.length}</span>
                  </h4>
                  {sharedNotes.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-emerald-100 bg-emerald-50/30 p-3 text-sm text-slate-500">{tl("no_shared_notes", lang)}</p>
                  ) : (
                    <ul className="space-y-2">{sharedNotes.slice(0, 10).map(renderNoteCard)}</ul>
                  )}
                </div>
              </div>
            </div>

            <PartnerAgreementHistory
              dealerAccountId={dealer.id}
              dealerAccountNumber={dealer.account_number}
              language={lang}
              canManage={canEditPartnerAdmin}
              compact
            />
          </div>
        </TabsContent>




        {/* USERS — portal users + registered contact persons */}
        <TabsContent value="users" className="mt-0">
          <UsersAndContactsPanel
            dealer={dealer}
            portalUsers={linkedUsers}
            contacts={dealerContacts}
            lang={lang}
          />
        </TabsContent>




        {/* DOCUMENTS — placeholder until document module exists */}
        <TabsContent value="documents" className="mt-0">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{tl("contracts", lang)}</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{dealerContracts.length}</span>
            </div>
            {dealerContracts.length === 0 ? (
              <div className="py-6 text-center">
                <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">{tl("no_documents", lang)}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">{tl("contract", lang)}</th>
                      <th className="py-2 pr-3">{tl("version", lang)}</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">{tl("date", lang)}</th>
                      <th className="py-2 pr-3">{tl("assigned_seller", lang)}</th>
                      <th className="py-2 pr-3">{tl("open", lang)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dealerContracts.map((contract) => (
                      <tr key={contract.id}>
                        <td className="py-3 pr-3 font-semibold text-slate-900">{contract.contract_number || contract.id.slice(0, 8)}</td>
                        <td className="py-3 pr-3 text-slate-700">{contract.contract_version}</td>
                        <td className="py-3 pr-3 text-slate-700">{getContractWorkflowStatusLabel(contract.contract_status)}</td>
                        <td className="py-3 pr-3 text-slate-700">{fmtDate(contract.approved_at || contract.updated_at)}</td>
                        <td className="py-3 pr-3 text-slate-700">{contract.form_data.timanSellerName || contract.guided_review_completed_by_name || "-"}</td>
                        <td className="py-3 pr-3">
                          <Link
                            to={`/portal/contracts?accountNumber=${encodeURIComponent(dealer.account_number)}`}
                            className="font-bold text-emerald-700 hover:underline"
                          >
                            {tl("open", lang)}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>


        {/* MACHINES — serial-based machine register + demo lifecycle */}
        <TabsContent value="machines" className="mt-0">
          <CrmMachineRegisterPanel
            rows={displayedDealerMachines}
            allCount={dealerMachines.length}
            filter={machineStatusFilter}
            onFilterChange={setMachineStatusFilter}
            lang={lang}
          />
        </TabsContent>


      </Tabs>


      {showNoteModal && (
        <NoteModal
          dealerLabel={dealer.branch_name || dealer.company_name}
          shareLabel={noteAuthorParty === "timan" ? tl("share_with_dealer", lang) : tl("share_with_timan", lang)}
          lang={lang}
          onCancel={() => setShowNoteModal(false)}
          onSave={handleAddNote}
        />
      )}

      {showEditDealer && canEditPartnerAdmin && (
        <EditDealerModal
          dealer={dealer}
          sellers={partnerAdminSellerOptions}
          lang={lang}
          onCancel={() => setShowEditDealer(false)}
          onSave={handleSaveDealer}
          onGeocoded={async () => {
            const dRes = await fetchDealerAccountFamilyByNumber(accountNumber, { includeDeleted: false });
            setDealers(dRes.rows);
          }}
        />
      )}

      <CollaborationPartnersModal
        open={showCollaborationModal}
        partners={collaborationPartners}
        stats={stats}
        lang={lang}
        formatCountry={formatCountry}
        onClose={() => setShowCollaborationModal(false)}
        onOpenDealer={(d) => {
          setShowCollaborationModal(false);
          navigate(`/portal/crm/my-dealers/${d.account_number}`);
        }}
      />
    </CrmLayout>
  );
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
        {icon}{label}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function CollaborationPartnersPanel({
  partners,
  stats,
  lang,
  onOpenList,
  compact = false,
}: {
  partners: DealerAccount[];
  stats: Record<string, DealerAccountStats>;
  lang: PortalUiLanguage;
  onOpenList: () => void;
  compact?: boolean;
}) {
  const preview = partners.slice(0, compact ? 2 : 3);

  return (
    <div className={`bg-white border border-slate-200 ${compact ? "rounded-lg p-4" : "rounded-2xl p-5"}`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <button
          type="button"
          onClick={onOpenList}
          className="text-left text-sm font-bold uppercase tracking-wide text-slate-500 hover:text-emerald-700"
        >
          {tl("collaboration_partners", lang)}
        </button>
        <button
          type="button"
          onClick={onOpenList}
          className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-bold hover:bg-emerald-50 hover:text-emerald-700"
          aria-label={`${tl("open_page", lang)} ${partners.length}`}
        >
          {partners.length}
        </button>
      </div>
      {partners.length === 0 ? (
        <p className="text-sm text-slate-500">{tl("no_partners", lang)}</p>
      ) : (
        <div>
          <ul className="space-y-2">
            {preview.map((partner) => {
              const label = collaborationPartnerLabel(partner, lang);
              const partnerStats = stats[partner.id];
              const location = [partner.postal_code, partner.city].filter(Boolean).join(" ");
              return (
                <li key={partner.id}>
                  <button
                    type="button"
                    onClick={onOpenList}
                    className={`w-full border border-slate-100 bg-slate-50/60 px-3 text-left transition-colors hover:border-emerald-200 hover:bg-emerald-50/60 ${compact ? "rounded-lg py-2" : "rounded-xl py-2.5"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {partner.branch_name || partner.company_name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                            {label}
                          </span>
                          {partner.account_number && (
                            <span className="font-mono text-[10px] text-slate-400">#{partner.account_number}</span>
                          )}
                        </div>
                        {location && <div className="mt-1 text-xs text-slate-500 truncate">{location}</div>}
                        <div className={`${compact ? "mt-1" : "mt-2"} flex gap-3 text-[10px] text-slate-500`}>
                          <span><strong className="text-slate-800">{partnerStats?.quote_count ?? 0}</strong> {tl("quotes", lang)}</span>
                          <span><strong className="text-slate-800">{partnerStats?.order_count ?? 0}</strong> {tl("orders", lang)}</span>
                          <span><strong className="text-slate-800">{partnerStats?.activity_count ?? 0}</strong> {tl("activities_short", lang)}</span>
                        </div>
                      </div>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {partners.length > preview.length && (
            <button
              type="button"
              onClick={onOpenList}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              {tl("show_all", lang)} {partners.length} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function crmLifecycleMeta(row: DealerMachineRegisterRow, lang: PortalUiLanguage) {
  switch (row.lifecycle) {
    case "active_demo":
      return {
        label: tl("active_demo", lang),
        detail: row.daysRemaining != null ? `${row.daysRemaining} ${tl("days_left", lang)}` : null,
        badge: "bg-amber-100 text-amber-800 hover:bg-amber-100",
        icon: <Clock className="h-3.5 w-3.5" />,
      };
    case "ready_for_sale":
      return {
        label: tl("ready_for_sale", lang),
        detail: row.demoSaleEligibleAt ? `${tl("after_9_months", lang)}: ${fmtDate(row.demoSaleEligibleAt)}` : null,
        badge: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      };
    case "sold_early":
      return {
        label: tl("sold_early", lang),
        detail: row.daysSoldEarly != null ? `${row.daysSoldEarly} ${tl("days_early", lang)}` : null,
        badge: "bg-rose-100 text-rose-800 hover:bg-rose-100",
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
      };
    case "sold_registered":
      return {
        label: tl("sold_registered", lang),
        detail: row.warrantyRegistrationDate ? fmtDate(row.warrantyRegistrationDate) : null,
        badge: "bg-slate-100 text-slate-700 hover:bg-slate-100",
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      };
    case "demo_missing_delivery":
      return {
        label: tl("demo_missing_delivery", lang),
        detail: null,
        badge: "bg-amber-100 text-amber-800 hover:bg-amber-100",
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
      };
    default:
      return {
        label: tl("normal_machine", lang),
        detail: null,
        badge: "bg-slate-100 text-slate-700 hover:bg-slate-100",
        icon: null,
      };
  }
}

function CrmDemoMachinesPanel({
  rows,
  lang,
  onOpenMachines,
  compact = false,
}: {
  rows: DealerMachineRegisterRow[];
  lang: PortalUiLanguage;
  onOpenMachines: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`bg-white border border-slate-200 ${compact ? "rounded-lg p-4" : "rounded-2xl p-5"}`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <button
          type="button"
          onClick={onOpenMachines}
          className="text-left text-sm font-bold uppercase tracking-wide text-slate-500 hover:text-emerald-700"
        >
          {tl("demo_machines", lang)}
        </button>
        <button
          type="button"
          onClick={onOpenMachines}
          className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-bold hover:bg-emerald-50 hover:text-emerald-700"
          aria-label={`${tl("view_machines", lang)} ${rows.length}`}
        >
          {rows.length}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{tl("no_active_demo_machines", lang)}</p>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, compact ? 2 : 4).map((row) => {
            const meta = crmLifecycleMeta(row, lang);
            return (
              <button
                key={row.normalizedSerial}
                type="button"
                onClick={onOpenMachines}
                className={`w-full border border-slate-100 bg-slate-50/60 px-3 text-left transition-colors hover:border-emerald-200 hover:bg-emerald-50/60 ${compact ? "rounded-lg py-2" : "rounded-xl py-2.5"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {row.machineModel || row.machineType || "—"}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-slate-500">{row.serial}</div>
                    {meta.detail && <div className="mt-1 text-xs text-slate-500">{meta.detail}</div>}
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.badge}`}>
                    {meta.icon}{meta.label}
                  </span>
                </div>
              </button>
            );
          })}
          {rows.length > 4 && (
            <button
              type="button"
              onClick={onOpenMachines}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              {tl("show_all", lang)} {rows.length} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CrmMachineRegisterPanel({
  rows,
  allCount,
  filter,
  onFilterChange,
  lang,
}: {
  rows: DealerMachineRegisterRow[];
  allCount: number;
  filter: "all" | "demo_attention";
  onFilterChange: (next: "all" | "demo_attention") => void;
  lang: PortalUiLanguage;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          {tl("tab_machines", lang)}
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{allCount}</span>
        </h3>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
          <button
            type="button"
            onClick={() => onFilterChange("all")}
            className={`rounded-md px-3 py-1.5 font-semibold ${filter === "all" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}
          >
            {tl("all_machines", lang)}
          </button>
          <button
            type="button"
            onClick={() => onFilterChange("demo_attention")}
            className={`rounded-md px-3 py-1.5 font-semibold ${filter === "demo_attention" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}
          >
            {tl("demo_machines", lang)}
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="py-8 text-center">
          <Wrench className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">{tl("no_machines", lang)}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">{tl("serial_number", lang)}</th>
                <th className="py-2 pr-3">{tl("machine_model", lang)}</th>
                <th className="py-2 pr-3">{tl("order_no", lang)}</th>
                <th className="py-2 pr-3">{tl("delivery_date", lang)}</th>
                <th className="py-2 pr-3">{tl("status", lang)}</th>
                <th className="py-2 pr-3">{tl("customer", lang)}</th>
                <th className="py-2 pr-3">{tl("warranty_sp", lang)}</th>
                <th className="py-2 pr-3">{tl("lifecycle_status", lang)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const meta = crmLifecycleMeta(row, lang);
                return (
                  <tr key={row.normalizedSerial}>
                    <td className="py-3 pr-3 font-mono font-semibold text-slate-900 whitespace-nowrap">{row.serial}</td>
                    <td className="py-3 pr-3 text-slate-700">{row.machineModel || row.machineType || "—"}</td>
                    <td className="py-3 pr-3 text-slate-700 whitespace-nowrap">{row.orderNumber || "—"}</td>
                    <td className="py-3 pr-3 text-slate-700 whitespace-nowrap">{fmtDate(row.deliveryDate)}</td>
                    <td className="py-3 pr-3 text-slate-700">{row.machineKind === "demo" ? "Demo" : tl("normal_machine", lang)}</td>
                    <td className="py-3 pr-3 text-slate-700">{row.customerName || "—"}</td>
                    <td className="py-3 pr-3 text-slate-700">
                      <div>{row.warrantyCertificate || "—"}</div>
                      {row.warrantyRegistrationDate && <div className="text-xs text-slate-500">{fmtDate(row.warrantyRegistrationDate)}</div>}
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${meta.badge}`}>
                        {meta.icon}{meta.label}
                      </span>
                      {meta.detail && <div className="mt-1 text-xs text-slate-500">{meta.detail}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CollaborationPartnersModal({
  open,
  partners,
  stats,
  lang,
  formatCountry,
  onClose,
  onOpenDealer,
}: {
  open: boolean;
  partners: DealerAccount[];
  stats: Record<string, DealerAccountStats>;
  lang: PortalUiLanguage;
  formatCountry: (country: string | null | undefined) => string;
  onClose: () => void;
  onOpenDealer: (dealer: DealerAccount) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tl("collaboration_partners", lang)}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{partners.length}</span>
          </DialogTitle>
        </DialogHeader>

        {partners.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
            <Building2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">{tl("no_partners", lang)}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {partners.map((partner) => {
              const partnerStats = stats[partner.id];
              const label = collaborationPartnerLabel(partner, lang);
              const location = [partner.postal_code, partner.city].filter(Boolean).join(" ");
              const query = `?dealer=${encodeURIComponent(partner.account_number)}`;

              return (
                <div key={partner.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-bold text-slate-900">
                        {partner.branch_name || partner.company_name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          {label}
                        </span>
                        {partner.account_number && (
                          <span className="font-mono text-xs text-slate-400">#{partner.account_number}</span>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {location || "-"}{partner.country ? ` · ${formatCountry(partner.country)}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenDealer(partner)}
                      className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                    >
                      {tl("open_page", lang)}
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <Link to={`/portal/crm/quotes${query}`} className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2 hover:border-emerald-200 hover:bg-emerald-50">
                      <div className="font-bold text-slate-900">{partnerStats?.quote_count ?? 0}</div>
                      <div className="text-slate-500">{tl("quotes", lang)}</div>
                    </Link>
                    <Link to={`/portal/crm/orders${query}`} className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2 hover:border-emerald-200 hover:bg-emerald-50">
                      <div className="font-bold text-slate-900">{partnerStats?.order_count ?? 0}</div>
                      <div className="text-slate-500">{tl("orders", lang)}</div>
                    </Link>
                    <Link to={`/portal/crm/calendar${query}`} className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2 hover:border-emerald-200 hover:bg-emerald-50">
                      <div className="font-bold text-slate-900">{partnerStats?.activity_count ?? 0}</div>
                      <div className="text-slate-500">{tl("activities_short", lang)}</div>
                    </Link>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold">
                    <Link to={`/portal/service/claims${query}`} className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700">
                      <ClipboardList className="h-3.5 w-3.5" /> {tl("service_cases", lang)}
                    </Link>
                    <Link to={`/portal/service/warranty/registrations${query}`} className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700">
                      <FileText className="h-3.5 w-3.5" /> {tl("warranty_regs", lang)}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface KpiItem { id: string; title: string; subtitle?: string; href?: string }
function KpiPopover({ icon, label, value, items, emptyLabel }: {
  icon: React.ReactNode; label: string; value: React.ReactNode;
  items: KpiItem[]; emptyLabel: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-left bg-white border border-slate-200 rounded-xl p-3 hover:bg-emerald-50/40 cursor-pointer">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
            {icon}{label}
          </div>
          <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="px-3 py-2 border-b text-[11px] uppercase font-bold tracking-wide text-slate-500">{label}</div>
        {items.length === 0 ? (
          <div className="px-3 py-4 text-sm text-slate-500">{emptyLabel}</div>
        ) : (
          <ul className="max-h-80 overflow-auto divide-y">
            {items.map((it) => {
              const content = (
                <div className="px-3 py-2 hover:bg-slate-50">
                  <div className="text-sm font-semibold text-slate-900 truncate">{it.title}</div>
                  {it.subtitle && <div className="text-xs text-slate-500">{it.subtitle}</div>}
                </div>
              );
              return (
                <li key={it.id}>
                  {it.href ? <Link to={it.href}>{content}</Link> : content}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DealerBudgetCard({ totals, year }: { totals: ReturnType<typeof aggregateDealerBudget>; year: number }) {
  const { pct } = classifyBudgetStatus(totals);
  const expected = totals.ytdRealisedQty + totals.pipelineQty;
  const missingYtd = Math.max(0, totals.ytdBudgetQty - totals.ytdRealisedQty);
  const missingExpected = Math.max(0, totals.yearBudgetQty - expected);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Budget {year}</h3>
        {!totals.noBudget && <span className="text-xs font-bold text-slate-700">{pct}%</span>}
      </div>
      {totals.noBudget ? (
        <p className="text-sm text-slate-500">Intet budget registreret for {year}.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-sm">
            <Metric label="Årsbudget" value={`${Math.round(totals.yearBudgetQty)} stk.`} />
            <Metric label="Budget YTD" value={`${Math.round(totals.ytdBudgetQty)} stk.`} />
            <Metric label="Realiseret YTD" value={`${Math.round(totals.ytdRealisedQty)} stk.`} />
            <Metric label="Pipeline" value={`${Math.round(totals.pipelineQty)} stk.`} />
            <Metric label="Forventet" value={`${Math.round(expected)} stk.`} />
            <Metric label="Mangler YTD" value={`${missingYtd} stk.`} />
            <Metric label="Mangler forventet" value={`${missingExpected} stk.`} />
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Pipeline tælles ikke som realiseret.</p>
        </>
      )}
    </div>
  );
}

function HeaderBudgetMini({ totals, year }: { totals: ReturnType<typeof aggregateDealerBudget>; year: number }) {
  const { status, pct } = classifyBudgetStatus(totals);
  const barColor = status === "green" ? "bg-emerald-500" : status === "yellow" ? "bg-amber-500" : status === "red" ? "bg-rose-500" : "bg-slate-300";
  const widthPct = Math.min(100, Math.max(0, pct));
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 min-w-[200px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase font-bold tracking-wide text-slate-500">Budget YTD {year}</span>
        {!totals.noBudget && <span className="text-[11px] font-bold text-slate-700">{pct}%</span>}
      </div>
      {totals.noBudget ? (
        <div className="text-xs text-slate-500 mt-0.5">Intet budget</div>
      ) : (
        <>
          <div className="text-sm font-bold text-slate-900 mt-0.5">
            {Math.round(totals.ytdRealisedQty)} / {Math.round(totals.ytdBudgetQty)} stk.
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div className={`h-full ${barColor}`} style={{ width: `${widthPct}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

function Divider() {
  return <span className="h-4 w-px bg-slate-200 hidden sm:inline-block" aria-hidden />;
}

function CompactKpi({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon && <span className="text-slate-400">{icon}</span>}
      <span className="text-slate-500">{label}:</span>
      <span className="font-bold text-slate-900">{value}</span>
    </span>
  );
}

function CompactKpiPopover({ icon, label, value, items, emptyLabel }: {
  icon?: React.ReactNode; label: string; value: React.ReactNode;
  items: KpiItem[]; emptyLabel: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-emerald-50/60 transition">
          {icon && <span className="text-slate-400">{icon}</span>}
          <span className="text-slate-500">{label}:</span>
          <span className="font-bold text-slate-900">{value}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="px-3 py-2 border-b text-[11px] uppercase font-bold tracking-wide text-slate-500">{label}</div>
        {items.length === 0 ? (
          <div className="px-3 py-4 text-sm text-slate-500">{emptyLabel}</div>
        ) : (
          <ul className="max-h-80 overflow-auto divide-y">
            {items.map((it) => {
              const content = (
                <div className="px-3 py-2 hover:bg-slate-50">
                  <div className="text-sm font-semibold text-slate-900 truncate">{it.title}</div>
                  {it.subtitle && <div className="text-xs text-slate-500">{it.subtitle}</div>}
                </div>
              );
              return (
                <li key={it.id}>
                  {it.href ? <Link to={it.href}>{content}</Link> : content}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase font-bold tracking-wide text-slate-400">{label}</div>
      <div className="text-slate-900 font-semibold">{value}</div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-slate-400 mt-0.5">{icon}</span>
      <div>
        <div className="text-[10px] uppercase font-bold tracking-wide text-slate-400">{label}</div>
        <div className="text-slate-800">{value}</div>
      </div>
    </li>
  );
}

interface NewNoteForm {
  note_type: DealerNoteType;
  note_text: string;
  follow_up_date: string;
  share_note: boolean;
  create_calendar: boolean;
  cal_title: string;
  cal_type: CalendarActivityType;
  cal_when: string;
}

function NoteModal({ dealerLabel, shareLabel, lang, onCancel, onSave }: {
  dealerLabel: string;
  shareLabel: string;
  lang: PortalUiLanguage;
  onCancel: () => void;
  onSave: (input: NewNoteForm) => void | Promise<void>;
}) {
  const [form, setForm] = useState<NewNoteForm>({
    note_type: "general",
    note_text: "",
    follow_up_date: "",
    share_note: false,
    create_calendar: false,
    cal_title: "",
    cal_type: "demo",
    cal_when: "",
  });
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 mt-12">
        <h2 className="text-lg font-bold text-slate-900 mb-1">{tl("add_note_title", lang)}</h2>
        <p className="text-xs text-slate-500 mb-4">{tl("dealer_internal_default", lang).replace("{dealer}", dealerLabel)}</p>

        <label className="block text-xs font-bold text-slate-600 mb-1">{tl("note_type", lang)}</label>
        <select value={form.note_type}
          onChange={(e) => setForm(f => ({ ...f, note_type: e.target.value as DealerNoteType }))}
          className="w-full mb-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          {(Object.keys(NOTE_TYPE_KEY) as DealerNoteType[]).map(k => (
            <option key={k} value={k}>{noteTypeLabel(k, lang)}</option>
          ))}
        </select>

        <label className="block text-xs font-bold text-slate-600 mb-1">{tl("note_text", lang)}</label>
        <textarea value={form.note_text}
          onChange={(e) => setForm(f => ({ ...f, note_text: e.target.value }))}
          rows={4}
          className="w-full mb-3 rounded-lg border border-slate-200 px-3 py-2 text-sm" />

        <label className="block text-xs font-bold text-slate-600 mb-1">{tl("followup_optional", lang)}</label>
        <input type="datetime-local" value={form.follow_up_date}
          onChange={(e) => setForm(f => ({ ...f, follow_up_date: e.target.value }))}
          className="w-full mb-3 rounded-lg border border-slate-200 px-3 py-2 text-sm" />

        <label className="flex items-center gap-2 mb-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm font-semibold text-emerald-900">
          <input type="checkbox" checked={form.share_note}
            onChange={(e) => setForm(f => ({ ...f, share_note: e.target.checked }))} />
          {shareLabel}
        </label>

        <label className="flex items-center gap-2 mb-3 text-sm">
          <input type="checkbox" checked={form.create_calendar}
            onChange={(e) => setForm(f => ({ ...f, create_calendar: e.target.checked }))} />
          {tl("create_calendar", lang)}
        </label>

        {form.create_calendar && (
          <div className="border border-slate-200 rounded-lg p-3 mb-3 bg-slate-50">
            <label className="block text-xs font-bold text-slate-600 mb-1">{tl("activity_title", lang)}</label>
            <input value={form.cal_title}
              onChange={(e) => setForm(f => ({ ...f, cal_title: e.target.value }))}
              placeholder={`Aktivitet — ${dealerLabel}`}
              className="w-full mb-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <label className="block text-xs font-bold text-slate-600 mb-1">{tl("activity_type", lang)}</label>
            <select value={form.cal_type}
              onChange={(e) => setForm(f => ({ ...f, cal_type: e.target.value as CalendarActivityType }))}
              className="w-full mb-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {ACTIVITY_TYPES.map(a => <option key={a.key} value={a.key}>{a.label[mapUiLanguageToLegacy(lang)] ?? a.label.da}</option>)}
            </select>
            <label className="block text-xs font-bold text-slate-600 mb-1">{tl("date_time", lang)}</label>
            <input type="datetime-local" value={form.cal_when}
              onChange={(e) => setForm(f => ({ ...f, cal_when: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">{tl("cancel", lang)}</button>
          <button
            disabled={saving || !form.note_text.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                // Convert datetime-local to ISO if present
                const iso = (s: string) => s ? new Date(s).toISOString() : "";
                await onSave({
                  ...form,
                  follow_up_date: iso(form.follow_up_date),
                  cal_when: iso(form.cal_when),
                });
              } finally { setSaving(false); }
            }}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
            {saving ? tl("saving", lang) : tl("save_note", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditDealerModal({
  dealer,
  sellers,
  lang,
  onCancel,
  onSave,
  onGeocoded,
}: {
  dealer: DealerAccount;
  sellers: PartnerAdminSellerOption[];
  lang: PortalUiLanguage;
  onCancel: () => void;
  onSave: (patch: UpdateDealerAccountPatch) => Promise<{ ok: boolean; error?: string }>;
  onGeocoded?: () => void | Promise<void>;
}) {
  const initialSellerState = buildPartnerAdminSellerState(dealer, sellers);
  const initialPartnerType = getInitialPartnerAdminType(dealer);
  const [form, setForm] = useState({
    company_name: dealer.company_name || "",
    account_number: dealer.account_number || "",
    country: dealer.country || "",
    address: dealer.address || dealer.address_line_1 || "",
    postal_code: dealer.postal_code || "",
    city: dealer.city || "",
    email: dealer.email || "",
    phone: dealer.phone || "",
    ...initialSellerState,
    partner_type: initialPartnerType,
  });
  // Geo captured from Google Places when the user selects a suggestion.
  // Manual typing leaves these null; backend manual geocode panel handles backfill.
  const [geo, setGeo] = useState<{ latitude: number | null; longitude: number | null; google_place_id: string | null }>({
    latitude: dealer.latitude ?? null,
    longitude: dealer.longitude ?? null,
    google_place_id: dealer.google_place_id ?? null,
  });
  const [saving, setSaving] = useState(false);

  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setText = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const sellerOptions = useMemo<PartnerAdminSellerOption[]>(() => {
    return buildPartnerAdminSellerOptions(form, sellers);
  }, [sellers, form.assigned_seller_email, form.assigned_seller_id, form.assigned_seller_initials, form.assigned_seller_name]);

  function applySeller(sellerId: string) {
    if (!sellerId) {
      setForm((f) => ({
        ...f,
        seller_id: "",
        assigned_seller_id: "",
        assigned_seller_initials: "",
        assigned_seller_name: "",
        assigned_seller_email: "",
      }));
      return;
    }
    const selected = sellers.find((s) => s.id === sellerId);
    if (!selected) return;
    setForm((f) => ({
      ...f,
      seller_id: selected.id,
      assigned_seller_id: selected.id,
      assigned_seller_initials: selected.initials,
      assigned_seller_name: selected.name,
      assigned_seller_email: selected.email,
    }));
  }

  function applyResolved(r: ResolvedAddress) {
    setForm((f) => ({
      ...f,
      address: r.address_line_1 || r.formatted || f.address,
      postal_code: r.postal_code ?? f.postal_code,
      city: r.city ?? f.city,
      country: r.country ?? f.country,
    }));
    setGeo({ latitude: r.latitude, longitude: r.longitude, google_place_id: r.google_place_id });
  }

  function clearGeo() {
    setGeo({ latitude: null, longitude: null, google_place_id: null });
  }

  const fields: Array<{ label: string; k: keyof typeof form; type?: string }> = [
    { label: "Firmanavn", k: "company_name" },
    { label: "Kontonummer", k: "account_number" },
    { label: "Land", k: "country" },
    { label: "Postnr.", k: "postal_code" },
    { label: "By", k: "city" },
    { label: "Email", k: "email", type: "email" },
    { label: "Telefon", k: "phone" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-5 mt-12">
        <h2 className="text-lg font-bold text-slate-900 mb-1">{tl("edit_dealer", lang)}</h2>
        <p className="text-xs text-slate-500 mb-4">
          Kun interne Timan-brugere kan rette administrative partneroplysninger. Ændringer påvirker kun denne partnerkonto.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Adresse with Google Places autocomplete — spans both columns */}
          <label className="block md:col-span-2">
            <span className="block text-xs font-bold text-slate-600 mb-1">Adresse</span>
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => {
                setForm((f) => ({ ...f, address: v }));
                clearGeo();
              }}
              onResolve={applyResolved}
              onGeocodeResolved={applyResolved}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Begynd at skrive adressen…"
              showValidationState
              addressParts={{ address_line_1: form.address, postal_code: form.postal_code, city: form.city, country: form.country }}
            />
            {geo.google_place_id && (
              <span className="mt-1 inline-block text-[10px] text-emerald-700">
                Google-koordinater: {geo.latitude?.toFixed(5)}, {geo.longitude?.toFixed(5)}
              </span>
            )}
          </label>
          {fields.map((f) => (
            <label key={f.k} className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1">{f.label}</span>
              <input
                type={f.type || "text"}
                value={form[f.k]}
                onChange={(e) => {
                  upd(f.k)(e);
                  if (f.k === "postal_code" || f.k === "city" || f.k === "country") clearGeo();
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          ))}
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">{tl("assigned_timan_seller", lang)}</span>
            <select
              value={form.seller_id}
              onChange={(e) => applySeller(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">{tl("no_seller", lang)}</option>
              {sellerOptions.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.initials} - {seller.name}
                </option>
              ))}
            </select>
            {form.assigned_seller_email && (
              <span className="mt-1 block text-[10px] text-slate-500">{form.assigned_seller_email}</span>
            )}
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">{tl("customer_type", lang)}</span>
            <select
              value={form.partner_type}
              onChange={setText("partner_type")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
            >
              {PARTNER_ACCOUNT_MAP_TYPE_IDS.map((type) => (
                <option key={type} value={type}>{getPartnerAccountTypeLabel(type, lang)}</option>
              ))}
              {form.partner_type && !PARTNER_ACCOUNT_MAP_TYPE_IDS.includes(form.partner_type as PartnerAccountTypeId) && (
                <option value={form.partner_type}>{form.partner_type}</option>
              )}
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
          >
            {tl("cancel", lang)}
          </button>
          <button
            disabled={saving || !form.company_name.trim() || !form.account_number.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                const trim = (s: string) => (s.trim() === "" ? null : s.trim());
                const addressChanged =
                  trim(form.address) !== (dealer.address ?? null) ||
                  trim(form.postal_code) !== (dealer.postal_code ?? null) ||
                  trim(form.city) !== (dealer.city ?? null) ||
                  trim(form.country) !== (dealer.country ?? null);
                const patch: UpdateDealerAccountPatch = {
                  company_name: form.company_name.trim(),
                  account_number: form.account_number.trim(),
                  country: trim(form.country),
                  address: trim(form.address),
                  address_line_1: trim(form.address),
                  postal_code: trim(form.postal_code),
                  city: trim(form.city),
                  email: trim(form.email),
                  phone: trim(form.phone),
                  assigned_seller_id: trim(form.assigned_seller_id),
                  assigned_seller_initials: trim(form.assigned_seller_initials),
                  assigned_seller_name: trim(form.assigned_seller_name),
                  assigned_seller_email: trim(form.assigned_seller_email),
                  ...buildPartnerAdminTypePatch(form.partner_type as PartnerAccountTypeId | ""),
                };
                const addressParts = {
                  address: form.address,
                  postal_code: form.postal_code,
                  city: form.city,
                  country: form.country,
                };
                const resolvedPatch = buildResolvedGeocodingPatch(geo);
                if (resolvedPatch) {
                  Object.assign(patch, resolvedPatch);
                } else if (addressChanged) {
                  Object.assign(patch, buildPendingGeocodingPatch(hasUsableDealerAddress(addressParts)));
                }
                const saved = await onSave(patch);
                if (saved.ok && addressChanged && !resolvedPatch && hasUsableDealerAddress(addressParts)) {
                  const geocoded = await requestDealerGeocoding(dealer.id);
                  if (!geocoded.ok) {
                    toast.error(`Forhandleren blev gemt, men geokodning fejlede: ${geocoded.error}`);
                  } else {
                    await onGeocoded?.();
                  }
                }
              } finally {
                setSaving(false);
              }
            }}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
          >
            {saving ? tl("saving", lang) : tl("save_changes", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ContactHero — top-of-page card for sellers on the go
// ============================================================================

interface HeroAction {
  key: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

function ContactHero({
  dealer,
  contacts,
  sellers,
  lang,
  admin,
  isBranch,
  mainDealer,
  hasGroup,
  scope,
  setScope,
  branchCount,
  budgetTotals,
  budgetYear,
  onEdit,
}: {
  dealer: DealerAccount;
  contacts: DealerContact[];
  sellers: PartnerAdminSellerOption[];
  lang: PortalUiLanguage;
  admin: boolean;
  isBranch: boolean;
  mainDealer: DealerAccount | null;
  hasGroup: boolean;
  scope: "branch" | "group";
  setScope: (s: "branch" | "group") => void;
  branchCount: number;
  budgetTotals: ReturnType<typeof aggregateDealerBudget> | null;
  budgetYear: number;
  onEdit: () => void;
}) {
  const firstContact = resolveCanonicalFirstContact(dealer, contacts);
  const primaryName = firstContact?.name ?? null;
  const primaryEmail = firstContact?.email ?? null;
  const primaryPhone = firstContact?.phone ?? null;

  // Fallbacks: action cards use company-level data if no primary contact.
  const callPhone = primaryPhone || (!firstContact ? dealer.phone : null);
  const mailAddr  = primaryEmail || (!firstContact ? dealer.email : null);
  const callLabel = tl(primaryName ? "contact_call" : "call", lang);
  const callSublabel = primaryName && callPhone ? `${primaryName}\n${callPhone}` : [primaryName, callPhone].filter(Boolean).join("\n");
  const mailSublabel = primaryEmail
    ? [primaryName, primaryEmail].filter(Boolean).join("\n")
    : mailAddr;

  const addressLine = [dealer.address_line_1 || dealer.address, dealer.postal_code, dealer.city, dealer.country]
    .filter(Boolean).join(", ");
  const addressPrimaryLine = [dealer.address_line_1 || dealer.address].filter(Boolean).join(", ");
  const addressSecondaryLine = [dealer.postal_code, dealer.city].filter(Boolean).join(" ");
  const addressSublabel = [addressPrimaryLine, addressSecondaryLine].filter(Boolean).join("\n") || undefined;
  const hasCoords = typeof dealer.latitude === "number" && typeof dealer.longitude === "number";
  const mapsHref = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${dealer.latitude},${dealer.longitude}`
    : addressLine
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressLine)}`
      : undefined;
  const websiteHref = dealer.website
    ? (dealer.website.startsWith("http") ? dealer.website : `https://${dealer.website}`)
    : undefined;
  const websiteDisplay = dealer.website
    ? dealer.website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/g, "")
    : undefined;
  const assignedSeller = sellers.find((u) => {
    const dealerSellerId = dealer.assigned_seller_id;
    const dealerSellerEmail = (dealer.assigned_seller_email || "").toLowerCase();
    return Boolean(
      (dealerSellerId && u.id === dealerSellerId) ||
      (dealerSellerEmail && u.email.toLowerCase() === dealerSellerEmail) ||
      (dealer.assigned_seller_initials && sellerInitialsMatch(u.initials, dealer.assigned_seller_initials))
    );
  });
  const assignedSellerName = assignedSeller?.name || dealer.assigned_seller_name || dealer.assigned_seller_initials || null;
  const assignedSellerEmail = assignedSeller?.email || dealer.assigned_seller_email || null;
  const assignedSellerPhone = assignedSeller?.phone || null;

  // Only include actions whose data exists.
  const dealerDataHref = dealer.account_number
    ? `/portal/dealer-data?accountNumber=${encodeURIComponent(dealer.account_number)}`
    : "/portal/dealer-data";
  const actionsAll: HeroAction[] = [
    (primaryName || callPhone) ? { key: "call",   label: callLabel, sublabel: callSublabel || undefined, icon: <Phone className="h-4 w-4" />, href: callPhone ? `tel:${callPhone}` : undefined } : null,
    mailAddr  ? { key: "mail",   label: tl("send_mail", lang), sublabel: mailSublabel || undefined, icon: <Mail className="h-4 w-4" />, href: `mailto:${mailAddr}` } : null,
    mapsHref  ? { key: "route",  label: tl("directions", lang), sublabel: addressSublabel, icon: <MapPin className="h-4 w-4" />, href: mapsHref } : null,
    websiteHref ? { key: "web",  label: tl("website", lang), sublabel: websiteDisplay, icon: <Globe className="h-4 w-4" />, href: websiteHref } : null,
    { key: "dealer-data", label: tl("open_dealer_data", lang), sublabel: dealer.company_name || undefined, icon: <Building2 className="h-4 w-4" />, href: dealerDataHref },
    assignedSellerName ? {
      key: "assigned-seller",
      label: tl("assigned_seller", lang),
      sublabel: [assignedSellerName, assignedSellerPhone || tl("seller_phone_missing", lang), assignedSellerEmail].filter(Boolean).join("\n"),
      icon: <UserCircle2 className="h-4 w-4" />,
      href: assignedSellerEmail ? `mailto:${assignedSellerEmail}` : undefined,
    } : null,
  ].filter(Boolean) as HeroAction[];
  const actions = actionsAll;

  const budgetPct = budgetTotals && !budgetTotals.noBudget ? classifyBudgetStatus(budgetTotals).pct : null;

  return (
    <div>
      {/* Title row */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-slate-900 truncate">
            {dealer.branch_name || dealer.company_name}
          </h2>
          <div className="text-sm text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className="font-mono">#{dealer.account_number}</span>
            <span>·</span>
            <span>{dealerPresentationType(dealer, lang)}</span>
            {dealer.country && <><span>·</span><span>{formatCountryFn(dealer.country, mapUiLanguageToLegacy(lang))}</span></>}
            <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
              {tl("status_active", lang)}
            </span>
            {isBranch && mainDealer && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                <GitBranch className="h-3 w-3" /> {tl("branch", lang)} · {mainDealer.company_name}
              </span>
            )}
            {dealer.is_main_account && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200">
                <Star className="h-3 w-3" /> {tl("main_account", lang)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {hasGroup && (
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 text-xs">
              <button onClick={() => setScope("branch")}
                className={`px-2.5 py-1 rounded-md font-semibold ${scope==="branch" ? "bg-white shadow text-slate-900" : "text-slate-600"}`}>
                {tl("branch", lang)}
              </button>
              <button onClick={() => setScope("group")}
                className={`px-2.5 py-1 rounded-md font-semibold ${scope==="group" ? "bg-white shadow text-slate-900" : "text-slate-600"}`}>
                {tl("group", lang)} ({branchCount})
              </button>
            </div>
          )}
          {admin && (
            <button onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-bold">
              <Pencil className="h-3.5 w-3.5" /> {tl("edit_dealer", lang)}
            </button>
          )}
          {budgetTotals && (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 min-w-[180px]">
              <div className="text-[10px] uppercase font-bold tracking-wide text-slate-500">Budget YTD {budgetYear}</div>
              {budgetTotals.noBudget ? (
                <div className="text-xs text-slate-500 mt-0.5">{tl("no_budget", lang)}</div>
              ) : (
                <div className="text-sm font-bold text-slate-900 mt-0.5 flex items-baseline gap-1.5">
                  <span>{Math.round(budgetTotals.ytdRealisedQty)}/{Math.round(budgetTotals.ytdBudgetQty)} stk.</span>
                  <span className="text-xs text-emerald-700">{budgetPct}%</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hero card — compact action header */}
      <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm">
        <div className="grid grid-cols-1 gap-2 items-stretch">
          {/* Action cards */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
            {actions.map((a) => {
              const cls = `flex min-h-[74px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border bg-white px-1.5 py-1.5 text-center transition ${
                a.disabled
                  ? "border-slate-200 text-slate-300 cursor-not-allowed"
                  : "border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-sm"
              }`;
              const inner = (
                <>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${a.disabled ? "bg-slate-50 text-slate-300" : "bg-emerald-50 text-emerald-700"}`}>
                    {a.icon}
                  </span>
                  <span className="max-w-full text-[10.5px] font-semibold leading-tight break-words">{a.label}</span>
                  {a.sublabel && <span className="line-clamp-2 max-w-full whitespace-pre-line break-words text-[9.5px] leading-tight text-slate-500">{a.sublabel}</span>}
                </>
              );
              if (a.disabled) return <button key={a.key} disabled className={cls}>{inner}</button>;
              if (a.href) return <a key={a.key} href={a.href} target={a.key === "route" || a.key === "web" ? "_blank" : undefined} rel="noreferrer" className={cls}>{inner}</a>;
              return <button key={a.key} onClick={a.onClick} className={cls}>{inner}</button>;
            })}
          </div>
        </div>



      </div>
    </div>
  );
}


// ============================================================================
// KpiStrip — compact centered KPI cards
// Order: Orders, Quotes, Open leads, Pipeline
// ============================================================================
function KpiStrip({
  orders, quotes, pipelineValue, openLeads, openDemos, fmtKr, dealerName, lang,
}: {
  orders: number; quotes: number; pipelineValue: number;
  openLeads: number; openDemos: number;
  fmtKr: (n: number) => string;
  dealerName?: string;
  lang: PortalUiLanguage;
}) {
  const dq = dealerName ? `?dealer=${encodeURIComponent(dealerName)}` : "";
  const cols: Array<{ key: string; label: string; value: React.ReactNode; icon: React.ReactNode; tint: string; link?: { href: string; label: string }; emphasis?: boolean }> = [
    { key: "orders",   label: tl("orders", lang), value: String(orders), icon: <FileText className="h-4 w-4" />, tint: "bg-emerald-100 text-emerald-700", link: { href: `/portal/crm/orders${dq}`, label: tl("see_orders", lang) } },
    { key: "quotes",   label: tl("quotes", lang), value: String(quotes), icon: <FileText className="h-4 w-4" />, tint: "bg-sky-100 text-sky-700", link: { href: `/portal/crm/quotes${dq}`, label: tl("see_quotes", lang) } },
    {
      key: "leads", label: tl("open_leads", lang), tint: "bg-amber-100 text-amber-700",
      icon: <TrendingUp className="h-4 w-4" />,
      value: (
        <div className="text-sm font-bold text-slate-900 leading-tight space-y-0.5">
          <div><span className="text-xl">{openLeads}</span> <span className="text-xs font-semibold text-slate-500">{tl("open_leads", lang).toLowerCase()}</span></div>
          <div><span className="text-xl">{openDemos}</span> <span className="text-xs font-semibold text-slate-500">{tl("demo_leads", lang).toLowerCase()}</span></div>
        </div>
      ),
      link: { href: `/portal/crm/leads${dq}`, label: tl("see_leads", lang) },
    },
    { key: "pipeline", label: tl("pipeline", lang), value: pipelineValue > 0 ? fmtKr(pipelineValue) : "—", icon: <TrendingUp className="h-4 w-4" />, tint: "bg-emerald-100 text-emerald-700", emphasis: true },
  ];


  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        {cols.map((c) => (
          <div key={c.key} className="flex min-w-0 flex-col items-center justify-center p-2 text-center">
            <div className="mb-1 flex items-center justify-center gap-1.5">
              <span className={`flex h-6 w-6 items-center justify-center rounded-md ${c.tint}`}>{c.icon}</span>
              <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 truncate">{c.label}</span>
            </div>
            {typeof c.value === "string"
              ? <div className={`text-lg font-bold leading-none ${c.emphasis ? "text-emerald-700" : "text-slate-900"}`}>{c.value}</div>
              : c.value}
            {c.link && (
              <Link to={c.link.href} className="mt-1 inline-block text-[11px] font-semibold text-emerald-700 hover:underline">{c.link.label}</Link>

            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// ContactsList — primary + dealer_accounts roles + extra dealer_contacts
// ============================================================================

interface ContactCardRow {
  area: string;
  name: string | null;
  role?: string | null;
  email: string | null;
  phone: string | null;
}

function ContactsList({
  dealer,
  extraContacts,
  lang,
}: {
  dealer: DealerAccount;
  extraContacts: DealerContact[];
  lang: PortalUiLanguage;
}) {
  const rows: ContactCardRow[] = [
    { area: tl("area_primary", lang),   name: dealer.primary_contact_name,   email: dealer.primary_contact_email,   phone: dealer.primary_contact_phone },
    { area: tl("area_sales", lang),     name: dealer.sales_contact_name,     email: dealer.sales_contact_email,     phone: dealer.sales_contact_phone },
    { area: tl("area_workshop", lang),  name: dealer.workshop_contact_name,  email: dealer.workshop_contact_email,  phone: dealer.workshop_contact_phone },
    { area: tl("area_marketing", lang), name: dealer.marketing_contact_name, email: dealer.marketing_contact_email, phone: dealer.marketing_contact_phone },
    { area: tl("area_finance", lang),   name: dealer.finance_contact_name,   email: dealer.finance_contact_email,   phone: dealer.finance_contact_phone },
  ].filter((r) => r.name || r.email || r.phone);

  for (const c of extraContacts) {
    rows.push({
      area: tl(("area_" + c.contact_area) as keyof typeof L, lang),
      name: c.name,
      role: c.role_title,
      email: c.email,
      phone: c.phone,
    });
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 text-sm text-slate-500">
        {tl("no_primary", lang)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {rows.map((r, i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">{r.area}</div>
          <div className="flex items-center gap-2 mb-1">
            <UserCircle2 className="h-5 w-5 text-slate-400" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">{r.name || "—"}</div>
              {r.role && <div className="text-xs text-slate-500 truncate">{r.role}</div>}
            </div>
          </div>
          <div className="text-xs space-y-0.5">
            {r.phone && <div className="text-slate-700"><Phone className="inline h-3 w-3 mr-1 text-slate-400" />{r.phone}</div>}
            {r.email && <div className="text-slate-700 truncate"><Mail className="inline h-3 w-3 mr-1 text-slate-400" />{r.email}</div>}
          </div>
          <div className="mt-2 flex gap-2">
            {r.phone && <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 px-2 py-1 text-[11px] font-bold hover:bg-emerald-100"><Phone className="h-3 w-3" />{tl("call", lang)}</a>}
            {r.email && <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 px-2 py-1 text-[11px] font-bold hover:bg-emerald-100"><Mail className="h-3 w-3" />{tl("send_mail", lang)}</a>}
          </div>
        </div>
      ))}
    </div>
  );
}

// Suppress unused-import warning for Smartphone — kept for future mobile-specific UI.
void Smartphone;

// ============================================================================
// UsersAndContactsPanel — unified "Registrerede brugere" list
// (portal users + dealer_contacts, aggregated to unique people)
// ============================================================================
function UsersAndContactsPanel({
  dealer, portalUsers, contacts, lang,
}: {
  dealer: DealerAccount;
  portalUsers: BackendUser[];
  contacts: DealerContact[];
  lang: PortalUiLanguage;
}) {
  const dealerDataHref = dealer.account_number
    ? `/portal/dealer-data?accountNumber=${encodeURIComponent(dealer.account_number)}#users`
    : "/portal/dealer-data#users";

  const total = buildRegisteredUserRows(portalUsers, contacts, lang).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Registrerede brugere ({total})
        </h3>
        <Link
          to={dealerDataHref}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold"
        >
          {tl("open_in_dealer_data", lang)} →
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <RegisteredUsersTable portalUsers={portalUsers} contacts={contacts} language={lang} />
      </div>
    </div>
  );
}
