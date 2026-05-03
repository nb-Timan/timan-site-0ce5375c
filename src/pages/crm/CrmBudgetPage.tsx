import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Lock, Unlock, Plus, Trash2, X, ShieldAlert, Calendar,
  Wallet, Sparkles, Minus, ChevronDown, ChevronRight, Wrench, Pencil,
  Clock, XCircle, Download,
} from "lucide-react";
import { toast } from "sonner";
import CrmLayout from "@/components/crm/CrmLayout";
import BudgetUnlockModal from "@/components/crm/BudgetUnlockModal";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, isScopedSeller } from "@/lib/crmScope";
import { resolveSellerId } from "@/lib/resolveSellerId";
import { getEffectiveSellerEmail, getActiveSellerView } from "@/lib/activeMode";
import { cn } from "@/lib/utils";
import { Language } from "@/types/configurator";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BUDGET_SELLERS, BUDGET_BACKEND_USERS, availableYears, fmtDKK,
  listBudgetLines, listForecasts, listSalesActuals,
  createBudgetLine, deleteBudgetLine, setLineLock, upsertForecast, upsertBudgetLine,
  EQUIPMENT_BY_MACHINE, localizedName,
  getSellerYearLock, setSellerYearLock, getEffectiveLock, setGlobalYearLock,
  appendBudgetAuditEntry,
  customMachineProducts, customEquipmentByMachine, createCustomProduct,
  type BudgetLine, type BudgetForecast, type SalesActual, type SellerYearLock,
  type EquipmentCategory,
  findProduct,
} from "@/lib/crmBudgetService";
import {
  listBudgetAccessWindows, closeBudgetAccessWindow, findActiveWindow, formatRemaining,
  type BudgetAccessWindow,
} from "@/lib/budgetAccessWindows";


// ────────────────────────────────────────────────────────────
// i18n — all visible UI strings for the Budget module
// ────────────────────────────────────────────────────────────
const T: Record<string, Record<Language, string>> = {
  page_title:    { da: 'Budget',                en: 'Budget',                  de: 'Budget',                  it: 'Budget',                  hu: 'Költségvetés' },
  annual_budget: { da: 'Årligt budget',         en: 'Annual budget',           de: 'Jahresbudget',            it: 'Budget annuale',          hu: 'Éves költségvetés' },
  subtitle_admin:{ da: 'Administrer officielle budgetter, lås og se forecast på tværs af sælgere.',
                   en: 'Manage official budgets, lock entries and view forecasts across sellers.',
                   de: 'Offizielle Budgets verwalten, sperren und Prognosen über Verkäufer hinweg sehen.',
                   it: 'Gestisci i budget ufficiali, blocca le voci e visualizza le previsioni per venditore.',
                   hu: 'Hivatalos költségvetések kezelése, zárolása és előrejelzések megtekintése értékesítőnként.' },
  subtitle_seller:{da: 'Se dit eget budget og opdater dit working forecast.',
                   en: 'View your own budget and update your working forecast.',
                   de: 'Eigenes Budget einsehen und Arbeitsprognose aktualisieren.',
                   it: 'Visualizza il tuo budget e aggiorna la previsione di lavoro.',
                   hu: 'Tekintse meg saját költségvetését és frissítse a munka-előrejelzést.' },
  seller_label:  { da: 'Sælger',                en: 'Seller',                  de: 'Verkäufer',               it: 'Venditore',               hu: 'Értékesítő' },
  all_sellers:   { da: 'Alle sælgere',          en: 'All sellers',             de: 'Alle Verkäufer',          it: 'Tutti i venditori',       hu: 'Összes értékesítő' },
  my_view:       { da: 'Min egen visning',      en: 'My own view',             de: 'Eigene Ansicht',          it: 'La mia vista',            hu: 'Saját nézet' },
  backend_group: { da: 'Backend',               en: 'Backend',                 de: 'Backend',                 it: 'Backend',                 hu: 'Backend' },
  edit_working:  { da: 'Rediger arbejdsbudget', en: 'Edit working forecast',   de: 'Arbeitsprognose bearbeiten', it: 'Modifica previsione',  hu: 'Munka-előrejelzés szerkesztése' },
  cancel:        { da: 'Annuller',              en: 'Cancel',                  de: 'Abbrechen',               it: 'Annulla',                 hu: 'Mégse' },
  save_working:  { da: 'Gem arbejdsbudget',     en: 'Save working forecast',   de: 'Arbeitsprognose speichern', it: 'Salva previsione',      hu: 'Munka-előrejelzés mentése' },
  new_line:      { da: 'Ny budgetlinje',        en: 'New budget line',         de: 'Neue Budgetzeile',        it: 'Nuova riga budget',       hu: 'Új költségvetés-sor' },
  kpi_budget:    { da: 'Budget (stk.)',         en: 'Budget (qty)',            de: 'Budget (Stk.)',           it: 'Budget (pz)',             hu: 'Költségvetés (db)' },
  kpi_orders:    { da: 'Ordrer (stk.)',         en: 'Orders (qty)',            de: 'Aufträge (Stk.)',         it: 'Ordini (pz)',             hu: 'Rendelések (db)' },
  kpi_working:   { da: 'Arbejdsbudget',         en: 'Working forecast',        de: 'Arbeitsprognose',         it: 'Previsione lavoro',       hu: 'Munka-előrejelzés' },
  kpi_score:     { da: 'Score',                 en: 'Score',                   de: 'Score',                   it: 'Punteggio',               hu: 'Pontszám' },
  pcs:           { da: 'stk.',                  en: 'pcs',                     de: 'Stk.',                    it: 'pz',                      hu: 'db' },
  legend_budget: { da: 'Budget',                en: 'Budget',                  de: 'Budget',                  it: 'Budget',                  hu: 'Költségvetés' },
  legend_orders: { da: 'Ordrer',                en: 'Orders',                  de: 'Aufträge',                it: 'Ordini',                  hu: 'Rendelések' },
  legend_pipe:   { da: 'Pipeline / tilbud',     en: 'Pipeline / quotes',       de: 'Pipeline / Angebote',     it: 'Pipeline / preventivi',   hu: 'Pipeline / ajánlatok' },
  legend_work:   { da: 'Arbejdsbudget',         en: 'Working forecast',        de: 'Arbeitsprognose',         it: 'Previsione lavoro',       hu: 'Munka-előrejelzés' },
  legend_perf_n: { da: 'Performance −',         en: 'Performance −',           de: 'Performance −',           it: 'Performance −',           hu: 'Teljesítmény −' },
  legend_perf_p: { da: 'Performance +',         en: 'Performance +',           de: 'Performance +',           it: 'Performance +',           hu: 'Teljesítmény +' },
  col_model:     { da: 'Model & Kategori',      en: 'Model & Category',        de: 'Modell & Kategorie',      it: 'Modello e categoria',     hu: 'Modell és kategória' },
  col_total:     { da: 'Total',                 en: 'Total',                   de: 'Gesamt',                  it: 'Totale',                  hu: 'Összesen' },
  col_score:     { da: 'Score',                 en: 'Score',                   de: 'Score',                   it: 'Punteggio',               hu: 'Pontszám' },
  loading:       { da: 'Indlæser budget…',      en: 'Loading budget…',         de: 'Budget wird geladen…',    it: 'Caricamento budget…',     hu: 'Költségvetés betöltése…' },
  empty_year:    { da: 'Ingen budgetlinjer for dette år.', en: 'No budget lines for this year.', de: 'Keine Budgetzeilen für dieses Jahr.', it: 'Nessuna riga budget per questo anno.', hu: 'Nincsenek költségvetés-sorok ebben az évben.' },
  coming_soon:   { da: 'Kommer snart',          en: 'Coming soon',             de: 'Demnächst',               it: 'In arrivo',               hu: 'Hamarosan' },
  locked:        { da: 'Låst',                  en: 'Locked',                  de: 'Gesperrt',                it: 'Bloccato',                hu: 'Zárolt' },
  unlock:        { da: 'Lås op',                en: 'Unlock',                  de: 'Entsperren',              it: 'Sblocca',                 hu: 'Feloldás' },
  lock:          { da: 'Lås',                   en: 'Lock',                    de: 'Sperren',                 it: 'Blocca',                  hu: 'Zárolás' },
  delete_line:   { da: 'Slet linje',            en: 'Delete line',             de: 'Zeile löschen',           it: 'Elimina riga',            hu: 'Sor törlése' },
  delete_confirm:{ da: 'Slet denne budgetlinje?', en: 'Delete this budget line?', de: 'Diese Budgetzeile löschen?', it: 'Eliminare questa riga di budget?', hu: 'Törli ezt a költségvetés-sort?' },
  row_budget_orders:{ da: 'BUDGET / ORDRER',    en: 'BUDGET / ORDERS',         de: 'BUDGET / AUFTRÄGE',       it: 'BUDGET / ORDINI',         hu: 'KÖLTSÉGVETÉS / RENDELÉSEK' },
  row_pipeline:  { da: 'PIPELINE (TILBUD)',     en: 'PIPELINE (QUOTES)',       de: 'PIPELINE (ANGEBOTE)',     it: 'PIPELINE (PREVENTIVI)',   hu: 'PIPELINE (AJÁNLATOK)' },
  row_working:   { da: 'ARBEJDSBUDGET',         en: 'WORKING FORECAST',        de: 'ARBEITSPROGNOSE',         it: 'PREVISIONE DI LAVORO',    hu: 'MUNKA-ELŐREJELZÉS' },
  row_perf:      { da: 'PERFORMANCE',           en: 'PERFORMANCE',             de: 'PERFORMANCE',             it: 'PERFORMANCE',             hu: 'TELJESÍTMÉNY' },
  tip_quotes:    { da: 'tilbud',                en: 'quotes',                  de: 'Angebote',                it: 'preventivi',              hu: 'ajánlat' },
  tip_customer:  { da: 'Kunde',                 en: 'Customer',                de: 'Kunde',                   it: 'Cliente',                 hu: 'Ügyfél' },
  tip_machine:   { da: 'Maskine',               en: 'Machine',                 de: 'Maschine',                it: 'Macchina',                hu: 'Gép' },
  tip_attach:    { da: 'Redskab',               en: 'Attachment',              de: 'Anbaugerät',              it: 'Attrezzatura',            hu: 'Tartozék' },
  tip_sent:      { da: 'Sendt',                 en: 'Sent',                    de: 'Gesendet',                it: 'Inviato',                 hu: 'Elküldve' },
  modal_title:   { da: 'Ny budgetlinje',        en: 'New budget line',         de: 'Neue Budgetzeile',        it: 'Nuova riga budget',       hu: 'Új költségvetés-sor' },
  field_product: { da: 'Produkt',               en: 'Product',                 de: 'Produkt',                 it: 'Prodotto',                hu: 'Termék' },
  field_seller:  { da: 'Sælger',                en: 'Seller',                  de: 'Verkäufer',               it: 'Venditore',               hu: 'Értékesítő' },
  field_country: { da: 'Land',                  en: 'Country',                 de: 'Land',                    it: 'Paese',                   hu: 'Ország' },
  field_qty:     { da: 'Antal (qty budget)',    en: 'Quantity (budget qty)',   de: 'Menge (Budget-Menge)',    it: 'Quantità (budget)',       hu: 'Mennyiség (költségvetés)' },
  field_notes:   { da: 'Noter',                 en: 'Notes',                   de: 'Notizen',                 it: 'Note',                    hu: 'Megjegyzések' },
  placeholder_name:{ da: 'Navn',                en: 'Name',                    de: 'Name',                    it: 'Nome',                    hu: 'Név' },
  create:        { da: 'Opret',                 en: 'Create',                  de: 'Erstellen',               it: 'Crea',                    hu: 'Létrehozás' },
  cs_confirm:    { da: 'er markeret som "Kommer snart". Tilføj alligevel?',
                   en: 'is marked as "Coming soon". Add anyway?',
                   de: 'ist als "Demnächst" markiert. Trotzdem hinzufügen?',
                   it: 'è contrassegnato come "In arrivo". Aggiungere comunque?',
                   hu: '"Hamarosan" jelölésű. Mégis hozzáadja?' },
  no_access:     { da: 'Ingen adgang',          en: 'No access',               de: 'Kein Zugriff',            it: 'Nessun accesso',          hu: 'Nincs hozzáférés' },
  no_access_msg: { da: 'Budgetmodulet er kun tilgængeligt for Timan Backend og Timan Sælger.',
                   en: 'The budget module is only available to Timan Backend and Timan Sellers.',
                   de: 'Das Budgetmodul ist nur für Timan Backend und Timan Verkäufer verfügbar.',
                   it: 'Il modulo budget è disponibile solo per Timan Backend e Timan Seller.',
                   hu: 'A költségvetés modul csak Timan Backend és Timan értékesítők számára érhető el.' },
  loading_short: { da: 'Indlæser…',             en: 'Loading…',                de: 'Wird geladen…',           it: 'Caricamento…',            hu: 'Betöltés…' },
  equipment_for: { da: 'Redskaber til',         en: 'Equipment for',           de: 'Werkzeuge für',           it: 'Attrezzature per',        hu: 'Eszközök:' },
  preview_row:   { da: 'Planlægning',           en: 'Preview',                 de: 'Planung',                 it: 'Pianificazione',          hu: 'Tervezés' },
  show_equipment:{ da: 'Vis redskaber',         en: 'Show equipment',          de: 'Werkzeuge anzeigen',      it: 'Mostra attrezzature',     hu: 'Eszközök megjelenítése' },
  hide_equipment:{ da: 'Skjul redskaber',       en: 'Hide equipment',          de: 'Werkzeuge ausblenden',    it: 'Nascondi attrezzature',   hu: 'Eszközök elrejtése' },
  budget_status: { da: 'Budgetstatus',          en: 'Budget status',           de: 'Budgetstatus',            it: 'Stato budget',            hu: 'Költségvetés állapota' },
  status_locked: { da: 'Budget låst',           en: 'Budget locked',           de: 'Budget locked',           it: 'Budget bloccato',         hu: 'Költségvetés zárolva' },
  status_open:   { da: 'Budget åbent',          en: 'Budget open',             de: 'Budget offen',            it: 'Budget aperto',           hu: 'Költségvetés nyitva' },
  unlock_budget: { da: 'Lås op',                en: 'Unlock',                  de: 'Entsperren',              it: 'Sblocca',                 hu: 'Feloldás' },
  lock_budget:   { da: 'Lås igen',              en: 'Lock again',              de: 'Erneut sperren',          it: 'Blocca di nuovo',         hu: 'Újra zárolás' },
  pick_seller:   { da: 'Vælg en sælger for at låse op',  en: 'Select a seller to unlock', de: 'Wählen Sie einen Verkäufer zum Entsperren', it: 'Seleziona un venditore per sbloccare', hu: 'Válasszon értékesítőt a feloldáshoz' },
  budget_locked_hint: { da: 'Budget er låst — kontakt backend for at åbne.',
                        en: 'Budget is locked — ask backend to open it.',
                        de: 'Budget ist gesperrt — bitten Sie das Backend, es zu öffnen.',
                        it: 'Budget bloccato — chiedi al backend di aprirlo.',
                        hu: 'A költségvetés zárolva — kérje a backendet a megnyitásra.' },
  row_budget:    { da: 'BUDGET',                en: 'BUDGET',                  de: 'BUDGET',                  it: 'BUDGET',                  hu: 'KÖLTSÉGVETÉS' },
  // ----- Seller "edit working budget" mode + auto-lock -----
  edit_working_btn: { da: 'Rediger arbejdsbudget', en: 'Edit working forecast', de: 'Arbeitsprognose bearbeiten', it: 'Modifica previsione', hu: 'Munka-előrejelzés szerkesztése' },
  exit_edit:        { da: 'Afslut redigering',     en: 'Exit edit mode',        de: 'Bearbeitung beenden',     it: 'Esci dalla modifica',     hu: 'Szerkesztés befejezése' },
  edit_active_hint: { da: 'Arbejdsbudget låses automatisk om {min} min.', en: 'Working forecast auto-locks in {min} min.', de: 'Arbeitsprognose sperrt automatisch in {min} Min.', it: 'Previsione si blocca automaticamente tra {min} min.', hu: 'Munka-előrejelzés automatikus zárolás {min} perc múlva.' },
  edit_autolocked:  { da: 'Arbejdsbudget blev låst automatisk efter inaktivitet.',
                      en: 'Working forecast was auto-locked after inactivity.',
                      de: 'Arbeitsprognose wurde nach Inaktivität automatisch gesperrt.',
                      it: 'Previsione bloccata automaticamente dopo inattività.',
                      hu: 'Munka-előrejelzés inaktivitás után automatikusan zárolva.' },
  // ----- Backend global (all-sellers) lock controls -----
  unlock_all:    { da: 'Lås {year} op for alle', en: 'Unlock {year} for all',  de: '{year} für alle entsperren', it: 'Sblocca {year} per tutti', hu: '{year} feloldása mindenkinek' },
  lock_all:      { da: 'Lås {year} for alle',    en: 'Lock {year} for all',    de: '{year} für alle sperren',    it: 'Blocca {year} per tutti', hu: '{year} zárolása mindenkinek' },
  unlock_seller: { da: 'Lås {year} op for {who}', en: 'Unlock {year} for {who}', de: '{year} für {who} entsperren', it: 'Sblocca {year} per {who}', hu: '{year} feloldása {who} számára' },
  lock_seller:   { da: 'Lås {year} for {who}',    en: 'Lock {year} for {who}',  de: '{year} für {who} sperren',    it: 'Blocca {year} per {who}', hu: '{year} zárolása {who} számára' },
  // "Nyt varenr." product creation flow
  new_item:      { da: 'Nyt varenr.',           en: 'New item no.',            de: 'Neue Artikelnr.',         it: 'Nuovo cod. art.',         hu: 'Új cikkszám' },
  new_item_title:{ da: 'Opret nyt varenummer til budget', en: 'Create new item number for budget', de: 'Neue Artikelnummer für Budget anlegen', it: 'Crea nuovo codice articolo per il budget', hu: 'Új cikkszám létrehozása a költségvetéshez' },
  field_type:    { da: 'Type',                  en: 'Type',                    de: 'Typ',                     it: 'Tipo',                    hu: 'Típus' },
  type_machine:  { da: 'Maskine',               en: 'Machine',                 de: 'Maschine',                it: 'Macchina',                hu: 'Gép' },
  type_attach:   { da: 'Redskab',               en: 'Attachment',              de: 'Anbaugerät',              it: 'Attrezzatura',            hu: 'Tartozék' },
  field_pname:   { da: 'Produktnavn',           en: 'Product name',            de: 'Produktname',             it: 'Nome prodotto',           hu: 'Terméknév' },
  field_varenr:  { da: 'Varenummer',            en: 'Item number',             de: 'Artikelnummer',           it: 'Codice articolo',         hu: 'Cikkszám' },
  field_owner:   { da: 'Sælger / ejer',         en: 'Seller / owner',          de: 'Verkäufer / Eigentümer',  it: 'Venditore / proprietario', hu: 'Értékesítő / tulajdonos' },
  owner_all:     { da: 'Alle sælgere',          en: 'All sellers',             de: 'Alle Verkäufer',          it: 'Tutti i venditori',       hu: 'Összes értékesítő' },
  field_parent:  { da: 'Tilhører maskine',      en: 'Belongs to machine',      de: 'Gehört zu Maschine',      it: 'Appartiene alla macchina', hu: 'Géphez tartozik' },
  pick_parent:   { da: 'Vælg en hovedmaskine',  en: 'Select a main machine',   de: 'Hauptmaschine wählen',    it: 'Seleziona macchina principale', hu: 'Válasszon főgépet' },
  validation_required: { da: 'Udfyld navn og varenummer.', en: 'Please fill in name and item number.', de: 'Bitte Name und Artikelnummer ausfüllen.', it: 'Inserisci nome e codice articolo.', hu: 'Kérjük, adja meg a nevet és a cikkszámot.' },
  validation_parent: { da: 'Vælg en hovedmaskine for redskabet.', en: 'Select a parent machine for the attachment.', de: 'Hauptmaschine für das Anbaugerät auswählen.', it: 'Seleziona una macchina per l\'attrezzatura.', hu: 'Válasszon főgépet a tartozékhoz.' },
};

// Localized month labels.
const MONTHS_BY_LANG: Record<Language, string[]> = {
  da: ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  de: ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'],
  it: ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'],
  hu: ['Jan','Feb','Már','Ápr','Máj','Jún','Júl','Aug','Szep','Okt','Nov','Dec'],
};

// Locale tag for date formatting.
const LOCALE_BY_LANG: Record<Language, string> = { da: 'da-DK', en: 'en-GB', de: 'de-DE', it: 'it-IT', hu: 'hu-HU' };


const EVEN: number[] = Array.from({ length: 12 }, () => 1 / 12);

// Budget-only short display labels keyed by item number (varenr).
// Keeps full product records intact; only affects how labels render in the matrix.
const BUDGET_SHORT_LABELS: Record<string, string> = {
  "720125":   "T2 u. højtryk",
  "720130":   "T2 m. højtryk",
  "720132":   "T3 u. højtryk",
  "720133":   "T3 m. højtryk",
  "730030":   "Forkoste med 2 koste",
  "730020":   "Centerdrevet fejemaskine, 120 cm",
  "730017":   "Rotorklipper 3 knive 135 cm",
  "HGM-2007": "Rotorklipper 150 cm",
  "730130":   "Rotorklipper 120 cm for T3",
  "730114":   "V-plov 130-150 cm",
  "730105":   "Dozerblad 130 cm",
  "725131":   "CS-200 Valsespreder, manuel reg.",
  "725132":   "CS-200 Combi, manuel reg.",
  "725138":   "CS-200 Combi, el reg.",
};
function shortLabelFor(varenr: string | null | undefined, fallback: string): string {
  if (!varenr) return fallback;
  return BUDGET_SHORT_LABELS[varenr] ?? fallback;
}

// ---------- Pipeline (sent offers) mock ----------
interface PipelineOffer {
  offer_no: string;
  dealer: string;
  machine_key: string;
  attachment: string;
  customer: string;
  value: number;
  sent_date: string; // ISO
  status: string;
}

// Deterministic pseudo-random per machine/month so values are stable across renders.
function seedRand(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_DEALERS = [
  "Nordsjællands Maskinforretning", "Sydjysk Have & Park", "Kirschner Maschinen GmbH",
  "Fyn Park Service", "Aarhus Grøn Pleje", "Odense Kommunale Værksted",
];
const SAMPLE_CUSTOMERS = [
  "Køge Kommune", "Roskilde Park", "Vejle Vejvæsen", "Stadt München",
  "Hamburg Grünflächen", "Hillerød Drift", "Aalborg Park & Natur",
];
const SAMPLE_ATTACHMENTS = ["Slagleklipper 1500", "Krat-skærer", "Buskrydder XL", "Kost", "Sneskraber", "Saltspreder"];
const SAMPLE_STATUSES = ["sent", "sent", "sent", "dialog", "negotiation"] as const;
const STATUS_LABELS: Record<typeof SAMPLE_STATUSES[number], Record<Language, string>> = {
  sent:        { da: 'Sendt',       en: 'Sent',         de: 'Gesendet',     it: 'Inviato',       hu: 'Elküldve' },
  dialog:      { da: 'I dialog',    en: 'In dialog',    de: 'Im Dialog',    it: 'In dialogo',    hu: 'Egyeztetés' },
  negotiation: { da: 'Forhandling', en: 'Negotiation',  de: 'Verhandlung',  it: 'Negoziazione',  hu: 'Tárgyalás' },
};

function generatePipeline(line: BudgetLine, year: number): PipelineOffer[][] {
  const months: PipelineOffer[][] = Array.from({ length: 12 }, () => []);
  const rnd = seedRand(`${line.id}|${year}|pipe`);
  // Roughly 0..2 sent offers per machine per month, weighted by season.
  const split = (line.monthly_split && line.monthly_split.length === 12) ? line.monthly_split : EVEN;
  const unit = line.qty_budget > 0 ? line.value_budget / line.qty_budget : 0;
  let counter = 1;
  for (let m = 0; m < 12; m++) {
    const intensity = split[m] * 12; // ~1 on average
    const draw = rnd();
    let count = 0;
    if (draw < 0.15 * intensity) count = 0;
    else if (draw < 0.55 * intensity) count = 1;
    else if (draw < 0.85 * intensity) count = 2;
    else count = rnd() < 0.4 ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const dealer = SAMPLE_DEALERS[Math.floor(rnd() * SAMPLE_DEALERS.length)];
      const customer = SAMPLE_CUSTOMERS[Math.floor(rnd() * SAMPLE_CUSTOMERS.length)];
      const attachment = SAMPLE_ATTACHMENTS[Math.floor(rnd() * SAMPLE_ATTACHMENTS.length)];
      const status = SAMPLE_STATUSES[Math.floor(rnd() * SAMPLE_STATUSES.length)];
      const variance = 0.85 + rnd() * 0.3;
      months[m].push({
        offer_no: `T-${year}-${String(line.id.slice(-3)).toUpperCase()}-${String(counter).padStart(3, "0")}`,
        dealer,
        machine_key: line.product_key,
        attachment,
        customer,
        value: Math.round(unit * variance),
        sent_date: new Date(year, m, 5 + Math.floor(rnd() * 22)).toISOString(),
        status,
      });
      counter++;
    }
  }
  return months;
}

// ---------- Helpers ----------
function splitToMonthly(qty: number, split: number[]): number[] {
  const safe = split.length === 12 ? split : EVEN;
  // Distribute qty across months by share, then round so totals stay close to qty.
  const raw = safe.map(s => qty * s);
  const floors = raw.map(v => Math.floor(v));
  let remainder = qty - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    result[order[k].i]++; remainder--;
  }
  return result;
}

function fmtDate(iso: string, lang: Language): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(LOCALE_BY_LANG[lang], { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------- KPI ----------
function KpiCard({ label, value, sub, icon: Icon, tone = "neutral" }: { label: string; value: string; sub?: string; icon: typeof Wallet; tone?: "neutral" | "primary" | "ok" | "warn" }) {
  const toneMap = {
    neutral: "from-slate-50 to-white text-slate-900",
    primary: "from-emerald-50 to-white text-emerald-900",
    ok:      "from-emerald-50 to-white text-emerald-900",
    warn:    "from-amber-50 to-white text-amber-900",
  } as const;
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-gradient-to-b shadow-sm p-5", toneMap[tone])}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-slate-500 mt-1">{sub}</div> : null}
    </div>
  );
}

interface NewProductState {
  type: "machine" | "attachment";
  name: string;
  varenr: string;
  parent_machine_key: string; // required when type === "attachment"
  seller_email: string;       // "" = all sellers
  country: string;
}

// Per-machine working forecast monthly draft.
type WorkingDraft = Record<string, number[]>; // budget_line_id -> 12 numbers

export default function CrmBudgetPage() {
  const { appUser, loading } = useAppUser();
  const { language: lang } = useLanguage();
  const portalRole = derivePortalRole(appUser);
  const isAdmin = isCrmAdmin(portalRole);
  const isSeller = isScopedSeller(portalRole);
  const allowed = isAdmin || isSeller;

  const [year, setYear] = useState<number>(availableYears()[0]);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [forecasts, setForecasts] = useState<BudgetForecast[]>([]);
  const [actuals, setActuals] = useState<SalesActual[]>([]);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Working-forecast monthly drafts per line (used as live override; auto-saved).
  const [workingDraft, setWorkingDraft] = useState<WorkingDraft>({});
  const [showAdd, setShowAdd] = useState(false);
  // Backend-only filter: "all" | seller email (e.g. "em@timan.dk").
  const [backendFilter, setBackendFilter] = useState<string>("all");
  const [newRow, setNewRow] = useState<NewProductState>({
    type: "machine", name: "", varenr: "", parent_machine_key: "RC-1000s", seller_email: "", country: "DK",
  });
  // Bumps to force re-read of custom products after creation.
  const [customRev, setCustomRev] = useState(0);
  // Per-machine expand/collapse state for equipment/accessory sections.
  // Default: collapsed for a clearer overview. Persisted in sessionStorage.
  const EQUIP_EXPAND_KEY = "crm_budget_expanded_equip_v1";
  const [expandedEquip, setExpandedEquip] = useState<Record<string, boolean>>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(EQUIP_EXPAND_KEY) : null;
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch { /* ignore */ }
    return {};
  });
  useEffect(() => {
    try { window.sessionStorage.setItem(EQUIP_EXPAND_KEY, JSON.stringify(expandedEquip)); } catch { /* ignore */ }
  }, [expandedEquip]);
  // Seller/year lock map (key = sellerEmail.toLowerCase()) for the active year.
  const [sellerLocks, setSellerLocks] = useState<Record<string, SellerYearLock>>({});

  // Time-limited budget access windows for this year (Phase 17).
  const [accessWindows, setAccessWindows] = useState<BudgetAccessWindow[]>([]);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockDefaultEmail, setUnlockDefaultEmail] = useState<string | null>(null);
  // Re-render every 30s so the countdown ticks.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  // Listen to active-mode changes so backend-in-seller-mode reflects the
  // correct seller context for window resolution + countdown.
  const [activeModeRev, setActiveModeRev] = useState(0);
  useEffect(() => {
    const onChange = () => setActiveModeRev((n) => n + 1);
    window.addEventListener("timan:active-mode-changed", onChange);
    return () => window.removeEventListener("timan:active-mode-changed", onChange);
  }, []);


  // ─── Seller "Edit Arbejdsbudget" mode + 10-min inactivity auto-lock ───
  // Only relevant for non-admin sellers; does NOT affect official Fastlagt
  // Budget locks. Backend users always have edit access (not gated by this).
  const EDIT_MODE_MS = 10 * 60 * 1000;
  const [editModeUntil, setEditModeUntil] = useState<number | null>(null);
  const [editCountdownMin, setEditCountdownMin] = useState<number>(0);
  const editTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (editModeUntil == null) {
      if (editTickRef.current) { window.clearInterval(editTickRef.current); editTickRef.current = null; }
      setEditCountdownMin(0);
      return;
    }
    const tick = () => {
      const remaining = editModeUntil - Date.now();
      if (remaining <= 0) {
        setEditModeUntil(null);
        toast(T.edit_autolocked[lang]);
      } else {
        setEditCountdownMin(Math.max(1, Math.ceil(remaining / 60000)));
      }
    };
    tick();
    editTickRef.current = window.setInterval(tick, 30_000);
    return () => { if (editTickRef.current) window.clearInterval(editTickRef.current); };
  }, [editModeUntil, lang]);

  function bumpEditActivity() {
    if (editModeUntil == null) return;
    setEditModeUntil(Date.now() + EDIT_MODE_MS);
  }
  function startEditMode() { setEditModeUntil(Date.now() + EDIT_MODE_MS); }
  function endEditMode() { setEditModeUntil(null); }

  useEffect(() => {
    if (appUser?.email) resolveSellerId(appUser.email).then(setSellerId);
  }, [appUser?.email]);

  useEffect(() => {
    if (!allowed) return;
    setBusy(true);
    Promise.all([listBudgetLines({ year }), listForecasts(year), listSalesActuals(year)])
      .then(([l, f, a]) => { setLines(l); setForecasts(f); setActuals(a); })
      .finally(() => setBusy(false));
    // Re-hydrate effective lock map for this year (per-seller resolved against
    // global ALL record so most-specific wins).
    const map: Record<string, SellerYearLock> = {};
    BUDGET_SELLERS.forEach(s => {
      map[s.email.toLowerCase()] = getEffectiveLock(year, s.email);
    });
    setSellerLocks(map);
    // Load active access windows for this year.
    listBudgetAccessWindows(year).then(setAccessWindows).catch(() => setAccessWindows([]));
    // Always exit edit mode when year changes.
    setEditModeUntil(null);
  }, [year, allowed]);

  // Resolve the current user's identity for scoping. We support multiple
  // matching strategies because seed rows may have been created before the
  // user's auth_user_id was linked, and because the preview-role switcher
  // produces synthetic display_names like "[Preview] Timan Sælger".
  const myEmail = (appUser?.email || "").toLowerCase().trim();
  const myInitialsFromName = (appUser?.display_name || "").replace(/^\[Preview\]\s*/i, "").trim();

  const visibleLines = useMemo(() => {
    function belongsToMe(l: BudgetLine): boolean {
      if (sellerId && l.seller_id === sellerId) return true;
      if (myEmail && l.seller_email && l.seller_email.toLowerCase() === myEmail) return true;
      if (myInitialsFromName && l.seller_initials && l.seller_initials.toLowerCase() === myInitialsFromName.toLowerCase()) return true;
      if (myInitialsFromName && l.seller_name && l.seller_name.toLowerCase() === myInitialsFromName.toLowerCase()) return true;
      return false;
    }
    if (isAdmin) {
      if (backendFilter === "all") return lines;
      if (backendFilter === "mine") return lines.filter(belongsToMe);
      return lines.filter(l => (l.seller_email || "").toLowerCase() === backendFilter.toLowerCase());
    }
    return lines.filter(belongsToMe);
  }, [lines, isAdmin, sellerId, myEmail, myInitialsFromName, backendFilter]);

  // Pipeline per line.
  const pipelineByLine = useMemo(() => {
    const map: Record<string, PipelineOffer[][]> = {};
    visibleLines.forEach(l => { map[l.id] = generatePipeline(l, year); });
    return map;
  }, [visibleLines, year]);

  // Group lines by product (machine model). Enforce required machine order.
  const MACHINE_ORDER = ["RC-751", "RC-1000s", "Timan 3330", "Timan 2620"];
  // Visual color accent per main machine group (Tailwind tokens).
  const MACHINE_COLORS: Record<string, { bar: string; gradient: string; row: string; text: string }> = {
    "RC-751":     { bar: "bg-yellow-500", gradient: "from-yellow-50 to-white",  row: "bg-yellow-50/30",  text: "text-yellow-900" },
    "RC-1000s":   { bar: "bg-red-500",    gradient: "from-red-50 to-white",     row: "bg-red-50/30",     text: "text-red-900" },
    "Timan 3330": { bar: "bg-green-600",  gradient: "from-green-50 to-white",   row: "bg-green-50/30",   text: "text-green-900" },
    "Timan 2620": { bar: "bg-blue-500",   gradient: "from-blue-50 to-white",    row: "bg-blue-50/30",    text: "text-blue-900" },
  };
  const defaultColor = { bar: "bg-emerald-500", gradient: "from-slate-100 to-slate-50", row: "", text: "text-slate-900" };

  // Custom (Budget-only) machines + equipment, re-read on creation.
  const customMachines = useMemo(() => customMachineProducts(), [customRev]);
  const customEquip = useMemo(() => customEquipmentByMachine(), [customRev]);

  // Set of all known equipment keys across machines (used to detect persisted
  // equipment-typed budget rows that must NOT render as standalone machine groups).
  const equipmentKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const arr of Object.values(EQUIPMENT_BY_MACHINE)) {
      for (const e of arr) s.add(e.key);
    }
    return s;
  }, []);

  const customMachineKeySet = useMemo(
    () => new Set(customMachines.map(m => m.key)),
    [customMachines],
  );

  const grouped = useMemo(() => {
    const knownMachineKeys = new Set<string>([...MACHINE_ORDER, ...customMachineKeySet]);
    const m = new Map<string, { product_key: string; product_name: string; item_number: string | null; lines: BudgetLine[] }>();
    visibleLines.forEach(l => {
      // Skip equipment-typed lines so they never appear as orphan machine groups
      // at the bottom. Equipment is rendered exclusively inside its parent
      // machine's equipment section via the synthetic-line path.
      const isEquipmentLine =
        l.category === "attachment" ||
        (l.product_key || "").includes("::") ||
        equipmentKeySet.has(l.product_key) ||
        (!knownMachineKeys.has(l.product_key) && !!l.parent_machine_key);
      if (isEquipmentLine) return;
      const prev = m.get(l.product_key) || { product_key: l.product_key, product_name: l.product_name, item_number: l.item_number, lines: [] };
      prev.lines.push(l);
      m.set(l.product_key, prev);
    });
    const out: Array<{ product_key: string; product_name: string; item_number: string | null; lines: BudgetLine[] }> = [];
    for (const key of MACHINE_ORDER) {
      if (m.has(key)) { out.push(m.get(key)!); m.delete(key); }
      else {
        const p = findProduct(key);
        if (p) out.push({ product_key: key, product_name: p.name, item_number: p.varenr, lines: [] });
      }
    }
    // Append custom machines (Budget-only) — always show even with no lines.
    for (const cm of customMachines) {
      if (m.has(cm.key)) { out.push(m.get(cm.key)!); m.delete(cm.key); }
      else out.push({ product_key: cm.key, product_name: cm.name, item_number: cm.varenr, lines: [] });
    }
    // Any remaining unknown product_key is treated as an orphan and dropped.
    // Equipment-style rows are already filtered above; everything left here would
    // be a machine that no longer exists in the catalog.
    return out;
  }, [visibleLines, customMachines, customMachineKeySet, equipmentKeySet]);

  // Merged equipment map (stock + custom Budget-only equipment).
  const equipmentMap: Record<string, EquipmentCategory[]> = useMemo(() => {
    const out: Record<string, EquipmentCategory[]> = {};
    // Hide the visual sub-category headings (Feje/Sug, Ukrudtsbørste, Græs, Vinter, Øvrige).
    // Equipment items themselves remain — they now sit directly under the equipment folder.
    for (const k of Object.keys(EQUIPMENT_BY_MACHINE)) {
      out[k] = EQUIPMENT_BY_MACHINE[k].filter(e => !e.isHeader);
    }
    for (const k of Object.keys(customEquip)) out[k] = [...(out[k] || []), ...customEquip[k]];
    return out;
  }, [customEquip]);

  // KPI totals
  const totals = useMemo(() => {
    const annualBudget = visibleLines.reduce((s, l) => s + l.value_budget, 0);
    const annualQty = visibleLines.reduce((s, l) => s + l.qty_budget, 0);
    const sold = actuals
      .filter(a => visibleLines.some(l => l.id === a.budget_line_id))
      .reduce((acc, a) => ({ qty: acc.qty + a.qty_sold, value: acc.value + a.value_sold }), { qty: 0, value: 0 });
    const fc = forecasts
      .filter(f => visibleLines.some(l => l.id === f.budget_line_id))
      .reduce((acc, f) => ({ qty: acc.qty + f.qty_forecast, value: acc.value + f.value_forecast }), { qty: 0, value: 0 });
    const score = annualQty > 0 ? Math.round((sold.qty / annualQty) * 100) : 0;
    return { annualBudget, annualQty, sold, fc, score };
  }, [visibleLines, actuals, forecasts]);

  if (loading) return <CrmLayout pageTitle={T.page_title[lang]}><div className="text-sm text-slate-500">{T.loading_short[lang]}</div></CrmLayout>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!allowed) {
    return (
      <CrmLayout pageTitle={T.page_title[lang]}>
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <ShieldAlert className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900">{T.no_access[lang]}</h2>
          <p className="text-sm text-slate-500 mt-1">{T.no_access_msg[lang]}</p>
        </div>
      </CrmLayout>
    );
  }

  // ---- Lock helpers (per seller / per year) ----
  // Active "view as <seller>" mode for backend users (so a backend in seller
  // mode behaves as that seller for window/lock resolution and countdown).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _activeModeRev = activeModeRev; // re-evaluated when mode changes
  const activeSellerView = isAdmin ? getActiveSellerView(appUser?.email) : null;
  const effectiveSellerEmail = (getEffectiveSellerEmail(appUser ?? null) || "").toLowerCase();

  // The "selected seller" for backend admin == backendFilter (only when it's
  // an actual seller email). For sellers it's their own email. When a backend
  // user is in seller-view mode we use the active seller's email.
  const selectedSellerEmail: string | null = isAdmin
    ? (activeSellerView
        ? activeSellerView.email.toLowerCase()
        : (BUDGET_SELLERS.some(s => s.email.toLowerCase() === backendFilter.toLowerCase()) ? backendFilter.toLowerCase() : null))
    : (myEmail || null);

  /** Active access window for the given seller (or "all"-scope) right now. */
  function activeWindowFor(email: string | null | undefined): BudgetAccessWindow | null {
    return findActiveWindow(accessWindows, year, email || null);
  }

  function lockFor(email: string | null | undefined): SellerYearLock | null {
    if (!email) return null;
    // A live access window OVERRIDES any per-seller "official" lock record.
    if (activeWindowFor(email)) {
      return { year, seller_email: email.toLowerCase(), locked: false };
    }
    return sellerLocks[email.toLowerCase()] ?? getEffectiveLock(year, email);
  }

  /** True when the official Fastlagt Budget for this line's seller/year is
   *  locked. Used to gate Backend's gray BUDGET row editing.
   *  NOTE: Sellers' Arbejdsbudget editing is NOT gated by this — it is gated
   *  by `editModeUntil` (per-session edit mode with auto-lock). */
  function isLineLocked(line: BudgetLine): boolean {
    if (line.locked) return true;
    const email = (line.seller_email || "").toLowerCase();
    if (!email) {
      if (activeWindowFor(null) || activeWindowFor(selectedSellerEmail)) return false;
      return getEffectiveLock(year, "").locked;
    }
    const sl = lockFor(email);
    return sl ? sl.locked : true;
  }


  /** Per-seller official budget lock toggle (Backend only). */
  function toggleSellerLock(email: string) {
    if (!isAdmin || !email) return;
    const cur = lockFor(email);
    const next = setSellerYearLock(
      year, email, !(cur?.locked ?? true),
      appUser?.display_name || appUser?.email || "Backend",
    );
    setSellerLocks(prev => ({ ...prev, [email.toLowerCase()]: next }));
  }

  /** Lock/unlock the entire year for ALL sellers (Backend only).
   *  Per-seller explicit records still win over this. After applying, refresh
   *  every seller's effective lock so the UI reflects the change immediately. */
  function toggleGlobalYearLock(nextLocked: boolean) {
    if (!isAdmin) return;
    setGlobalYearLock(year, nextLocked, appUser?.display_name || appUser?.email || "Backend");
    const map: Record<string, SellerYearLock> = {};
    BUDGET_SELLERS.forEach(s => {
      map[s.email.toLowerCase()] = getEffectiveLock(year, s.email);
    });
    setSellerLocks(map);
  }

  // ---- Per-line monthly derivations ----
  function lineMonthly(line: BudgetLine) {
    const split = (line.monthly_split && line.monthly_split.length === 12) ? line.monthly_split : EVEN;
    const ac = actuals.find(a => a.budget_line_id === line.id);
    const fc = forecasts.find(f => f.budget_line_id === line.id);
    const budgetMonthly = splitToMonthly(line.qty_budget, split);
    const ordersMonthly = splitToMonthly(ac?.qty_sold ?? 0, split);
    const draft = workingDraft[line.id];
    const workingMonthly = draft ?? splitToMonthly(fc?.qty_forecast ?? line.qty_budget, split);
    return { budgetMonthly, ordersMonthly, workingMonthly, ac, fc, split };
  }

  // Ensure a real budget line exists for the current seller / product. Used by
  // the working-forecast steppers so that RC-751 (or any machine without a
  // pre-existing seed row for the seller) becomes editable on first click.
  // Synthetic equipment ids (eq_YEAR_MACHINE_EQUIPKEY) are also persisted.
  async function ensurePersistedLine(line: BudgetLine, productKeyOverride?: string): Promise<BudgetLine> {
    // Already in lines store → nothing to do.
    if (lines.some(l => l.id === line.id)) return line;

    // For seller users we always own the line. For backend, attribute to the
    // currently selected seller (backendFilter) if any, else leave seller_email null.
    const targetEmail: string | null = isAdmin
      ? (selectedSellerEmail || line.seller_email || null)
      : (myEmail || null);
    const known = BUDGET_SELLERS.find(s => s.email.toLowerCase() === (targetEmail || "").toLowerCase());

    const product = productKeyOverride ? findProduct(productKeyOverride) : findProduct(line.product_key);
    const persisted = await createBudgetLine({
      year,
      product_key: line.product_key,
      product_name: line.product_name || product?.name || line.product_key,
      item_number: line.item_number ?? product?.varenr ?? null,
      category: line.category,
      parent_machine_key: line.parent_machine_key ?? null,
      seller_id: !isAdmin && sellerId ? sellerId : null,
      seller_name: known?.full_name ?? (isAdmin ? null : (appUser?.display_name ?? null)),
      seller_email: known?.email ?? targetEmail,
      seller_initials: known?.initials ?? (isAdmin ? null : (myInitialsFromName || null)),
      country: known?.country ?? line.country ?? null,
      qty_budget: 0,
      value_budget: 0,
      monthly_split: EVEN,
      notes: null,
    });
    setLines(prev => [...prev, persisted]);
    return persisted;
  }

  // ---- Working forecast handlers (auto-save) ----
  async function adjustWorking(line: BudgetLine, monthIdx: number, delta: number) {
    // Sellers must be in active "Rediger arbejdsbudget" edit mode to change
    // their own working forecast. Backend can always edit.
    if (!isAdmin && editModeUntil == null) return;
    const persisted = await ensurePersistedLine(line);
    const lineId = persisted.id;
    const split = (persisted.monthly_split && persisted.monthly_split.length === 12) ? persisted.monthly_split : EVEN;
    const fcExisting = forecasts.find(f => f.budget_line_id === lineId);
    const prevDraft = workingDraft[lineId] ?? splitToMonthly(fcExisting?.qty_forecast ?? persisted.qty_budget, split);
    const oldVal = prevDraft[monthIdx] ?? 0;
    const newVal = Math.max(0, oldVal + delta);
    if (newVal === oldVal) return;

    setWorkingDraft(prev => {
      const cur = prev[lineId] ?? prevDraft;
      const next = [...cur];
      next[monthIdx] = newVal;
      const qty = next.reduce((a, b) => a + b, 0);
      const unit = persisted.qty_budget > 0 ? persisted.value_budget / persisted.qty_budget : (findProduct(persisted.product_key)?.priceDKK || 0);
      const fcNext: BudgetForecast = {
        id: fcExisting?.id || ("f_" + lineId),
        budget_line_id: lineId,
        qty_forecast: qty,
        value_forecast: Math.round(qty * unit),
        comments: fcExisting?.comments ?? null,
        expected_timing: fcExisting?.expected_timing ?? null,
        risk_level: fcExisting?.risk_level ?? null,
        probability: fcExisting?.probability ?? null,
        updated_at: new Date().toISOString(),
      };
      void upsertForecast(fcNext).then(saved => {
        setForecasts(prevF => {
          const map = new Map(prevF.map(f => [f.budget_line_id, f]));
          map.set(saved.budget_line_id, saved);
          return Array.from(map.values());
        });
      });
      return { ...prev, [lineId]: next };
    });

    // Audit: who changed what, when. Visible to Timan Backend in audit log.
    appendBudgetAuditEntry({
      year,
      seller_initials: persisted.seller_initials || (isAdmin ? null : (myInitialsFromName || null)),
      seller_name: persisted.seller_name || appUser?.display_name || null,
      product_name: persisted.product_name,
      item_number: persisted.item_number,
      month: MONTHS_BY_LANG[lang][monthIdx] || `M${monthIdx + 1}`,
      old_value: oldVal,
      new_value: newVal,
    });

    // Reset the 10-min inactivity timer on each successful change.
    bumpEditActivity();
  }

  // ---- Gray BUDGET row editing ----
  // Editable for: backend (admin) when not locked, OR a seller whose
  // effective email is covered by an active access window for this year.
  async function adjustBudget(line: BudgetLine, monthIdx: number, delta: number) {
    const sellerHasWindow =
      isSeller && !!activeWindowFor(effectiveSellerEmail || myEmail || null);
    if (!isAdmin && !sellerHasWindow) return;
    if (isLineLocked(line)) return;
    const persisted = await ensurePersistedLine(line);
    const split = (persisted.monthly_split && persisted.monthly_split.length === 12) ? persisted.monthly_split : EVEN;
    const monthlyQty = splitToMonthly(persisted.qty_budget, split);
    monthlyQty[monthIdx] = Math.max(0, (monthlyQty[monthIdx] ?? 0) + delta);
    const newQty = monthlyQty.reduce((a, b) => a + b, 0);
    const newSplit: number[] = newQty > 0 ? monthlyQty.map(v => v / newQty) : EVEN;
    const product = findProduct(persisted.product_key);
    const unit = product?.priceDKK || (persisted.qty_budget > 0 ? persisted.value_budget / persisted.qty_budget : 0);
    const updated: BudgetLine = {
      ...persisted,
      qty_budget: newQty,
      value_budget: Math.round(newQty * unit),
      monthly_split: newSplit,
    };
    await upsertBudgetLine(updated);
    setLines(prev => prev.map(l => l.id === updated.id ? updated : l));
  }

  // (Working forecast is auto-saved on each stepper press in adjustWorking.)

  async function toggleLock(line: BudgetLine) {
    if (!isAdmin) return;
    const updated = await setLineLock(line.id, !line.locked, appUser?.display_name || appUser?.email || "Backend");
    if (updated) setLines(prev => prev.map(l => l.id === line.id ? updated : l));
  }

  async function removeLine(id: string) {
    if (!isAdmin) return;
    if (!confirm(T.delete_confirm[lang])) return;
    await deleteBudgetLine(id);
    setLines(prev => prev.filter(l => l.id !== id));
  }

  // Create a new Budget-only product (machine or attachment). Does NOT touch
  // the configurator catalog, pricing, or order flow.
  async function addProduct() {
    const name = newRow.name.trim();
    const varenr = newRow.varenr.trim();
    if (!name || !varenr) {
      alert(T.validation_required[lang]);
      return;
    }
    if (newRow.type === "attachment" && !newRow.parent_machine_key) {
      alert(T.validation_parent[lang]);
      return;
    }
    createCustomProduct({
      type: newRow.type,
      name,
      varenr,
      parent_machine_key: newRow.type === "attachment" ? newRow.parent_machine_key : null,
      seller_email: newRow.seller_email || null,
      country: newRow.country || null,
    });
    setCustomRev(v => v + 1);
    setShowAdd(false);
    setNewRow({ type: "machine", name: "", varenr: "", parent_machine_key: "RC-1000s", seller_email: "", country: "DK" });
  }

  // void to silence unused warning for upsertBudgetLine import (kept for future inline edits)
  void upsertBudgetLine;

  // ---- Render ----
  const monthCols = MONTHS_BY_LANG[lang];

  // Highlight current month column when viewing the current calendar year.
  // Column 1 is the sticky model name, so nth-child for month M (0-based) is M+2.
  const now = new Date();
  const currentMonthIdx = now.getFullYear() === year ? now.getMonth() : -1;
  const currentMonthCol = currentMonthIdx >= 0 ? currentMonthIdx + 2 : -1;

  // Resolve countdown context: the seller email whose window matters most.
  const countdownEmail = isAdmin
    ? (selectedSellerEmail || effectiveSellerEmail || null)
    : (effectiveSellerEmail || myEmail || null);
  const activeWin = countdownEmail ? activeWindowFor(countdownEmail) : null;
  // Distinct list of currently-open windows for this year (for the admin overview).
  const openWindows = accessWindows.filter((w) => {
    if (w.budget_year !== year || w.status !== "open") return false;
    const t = Date.now();
    return new Date(w.open_from).getTime() <= t && new Date(w.open_until).getTime() >= t;
  });

  async function handleCloseWindow(id: string) {
    if (!isAdmin) return;
    if (!confirm("Luk dette åbningsvindue nu?")) return;
    await closeBudgetAccessWindow(id, appUser?.display_name || appUser?.email || "Backend");
    const fresh = await listBudgetAccessWindows(year);
    setAccessWindows(fresh);
  }

  // ─── CSV export (semicolon-separated, UTF-8 BOM) ───
  function handleExportCsv() {
    const rows: string[][] = [];
    rows.push(["Year", "Seller", "Model", "Category", "Month", "Budget", "Pipeline", "Orders", "Performance"]);

    // Group visibleLines by (sellerEmail, productKey) so categories aggregate
    // budget/orders/pipeline in the same way the table renders them.
    type GroupKey = string;
    const groups = new Map<GroupKey, {
      sellerLabel: string;
      model: string;
      category: "machine" | "accessory";
      lines: BudgetLine[];
    }>();
    visibleLines.forEach(l => {
      const sellerLabel = l.seller_initials || l.seller_name || l.seller_email || "—";
      const model = l.product_name || l.product_key;
      const cat: "machine" | "accessory" = l.category === "machine" ? "machine" : "accessory";
      const key = `${(l.seller_email || sellerLabel).toLowerCase()}||${l.product_key}||${cat}`;
      const g = groups.get(key);
      if (g) g.lines.push(l);
      else groups.set(key, { sellerLabel, model, category: cat, lines: [l] });
    });

    const monthLabels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    groups.forEach(g => {
      const budgetMonthly = Array.from({ length: 12 }, () => 0);
      const ordersMonthly = Array.from({ length: 12 }, () => 0);
      const pipelineMonthly = Array.from({ length: 12 }, () => 0);
      g.lines.forEach(l => {
        const lm = lineMonthly(l);
        lm.budgetMonthly.forEach((v, i) => { budgetMonthly[i] += v; });
        lm.ordersMonthly.forEach((v, i) => { ordersMonthly[i] += v; });
        const p = pipelineByLine[l.id] || [];
        p.forEach((arr, i) => { pipelineMonthly[i] += arr.length; });
      });
      for (let i = 0; i < 12; i++) {
        rows.push([
          String(year),
          g.sellerLabel,
          g.model,
          g.category,
          monthLabels[i],
          String(budgetMonthly[i]),
          String(pipelineMonthly[i]),
          String(ordersMonthly[i]),
          String(ordersMonthly[i] - budgetMonthly[i]),
        ]);
      }
    });

    const escape = (v: string) => {
      const s = String(v ?? "");
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = rows.map(r => r.map(escape).join(";")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });

    let suffix = "all-sellers";
    if (selectedSellerEmail) {
      const known = BUDGET_SELLERS.find(s => s.email.toLowerCase() === selectedSellerEmail);
      suffix = (known?.initials || selectedSellerEmail.split("@")[0]).toUpperCase();
    } else if (isAdmin && backendFilter !== "all" && backendFilter !== "mine") {
      suffix = backendFilter.split("@")[0].toUpperCase();
    } else if (!isAdmin) {
      const me = BUDGET_SELLERS.find(s => s.email.toLowerCase() === myEmail);
      suffix = (me?.initials || (myEmail ? myEmail.split("@")[0] : "me")).toUpperCase();
    }
    const filename = `timan-budget-${year}-${suffix}.csv`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filename}`);
  }

  return (
    <CrmLayout pageTitle={T.page_title[lang]}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" /> {T.annual_budget[lang]} {year}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {isAdmin ? T.subtitle_admin[lang] : T.subtitle_seller[lang]}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <Calendar className="h-4 w-4 text-slate-500" />
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="text-sm bg-transparent outline-none"
            >
              {availableYears().map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {isAdmin && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{T.seller_label[lang]}</span>
              <select
                value={backendFilter}
                onChange={(e) => setBackendFilter(e.target.value)}
                className="text-sm bg-transparent outline-none"
              >
                <option value="all">{T.all_sellers[lang]}</option>
                {BUDGET_SELLERS.map(s => (
                  <option key={s.email} value={s.email}>{s.initials} — {s.country}</option>
                ))}
                <optgroup label={T.backend_group[lang]}>
                  {BUDGET_BACKEND_USERS
                    .filter(s => !BUDGET_SELLERS.some(x => x.email.toLowerCase() === s.email.toLowerCase()))
                    .map(s => (
                      <option key={s.email} value={s.email}>{s.initials}</option>
                    ))}
                  <option value="mine">{T.my_view[lang]}</option>
                </optgroup>
              </select>
            </div>
          )}
          {/* Lock status + lock/unlock controls.
              Backend: requires a single seller selected in the filter to act.
              Sellers: status only, read-only. */}
          {(() => {
            const email = selectedSellerEmail;
            const sl = lockFor(email);
            const locked = sl ? sl.locked : true;
            const badgeLabel = locked ? T.status_locked[lang] : T.status_open[lang];
            const badgeCls = locked
              ? "bg-sky-100 text-sky-800 border-sky-200"
              : "bg-emerald-100 text-emerald-800 border-emerald-200";
            return (
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{T.budget_status[lang]}</span>
                <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold", badgeCls)}>
                  {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  {email ? badgeLabel : T.pick_seller[lang]}
                </span>
                {isAdmin && email && (
                  <button
                    onClick={() => {
                      if (locked) {
                        // Open the confirmation modal pre-filled with this seller.
                        setUnlockDefaultEmail(email);
                        setUnlockOpen(true);
                      } else {
                        // Currently open via legacy lock — fall back to legacy toggle.
                        toggleSellerLock(email);
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border transition",
                      locked
                        ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        : "border-sky-200 text-sky-700 hover:bg-sky-50",
                    )}
                  >
                    {locked ? <><Unlock className="h-3 w-3" /> {T.unlock_budget[lang]}</> : <><Lock className="h-3 w-3" /> {T.lock_budget[lang]}</>}
                  </button>
                )}
              </div>
            );
          })()}
          {/* Backend: time-limited "Åbn budget…" launcher + active windows list. */}
          {isAdmin && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Åbningsvindue</span>
              <button
                type="button"
                onClick={() => { setUnlockDefaultEmail(null); setUnlockOpen(true); }}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                <Unlock className="h-3 w-3" /> Åbn budget {year}…
              </button>
            </div>
          )}

          {/* Seller: Edit Arbejdsbudget mode toggle (10-min auto-lock). */}
          {!isAdmin && isSeller && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              {editModeUntil == null ? (
                <button
                  type="button"
                  onClick={startEditMode}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  <Pencil className="h-3 w-3" /> {T.edit_working_btn[lang]}
                </button>
              ) : (
                <>
                  <span className="text-xs text-slate-600">
                    {T.edit_active_hint[lang].replace("{min}", String(editCountdownMin))}
                  </span>
                  <button
                    type="button"
                    onClick={endEditMode}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    <Lock className="h-3 w-3" /> {T.exit_edit[lang]}
                  </button>
                </>
              )}
            </div>
          )}
          {isAdmin && (
            <button
              onClick={() => {
                const known = selectedSellerEmail
                  ? BUDGET_SELLERS.find(s => s.email.toLowerCase() === selectedSellerEmail)
                  : null;
                setNewRow(r => ({
                  ...r,
                  seller_email: known?.email ?? r.seller_email,
                  country: known?.country ?? r.country,
                }));
                setShowAdd(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 shadow-sm"
            >
              <Plus className="h-4 w-4" /> {T.new_item[lang]}
            </button>
          )}
        </div>
      </div>

      {/* Time-limited access window: countdown / locked banner */}
      {(() => {
        if (activeWin) {
          const remaining = new Date(activeWin.open_until).getTime() - Date.now();
          const scopeLabel = activeWin.scope === "all"
            ? "alle sælgere"
            : (activeWin.seller_initials || activeWin.seller_email || "sælger");
          return (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-emerald-900">
                <Clock className="h-4 w-4" />
                <span className="font-semibold">Budget åbent</span>
                <span>· {scopeLabel}</span>
                <span>· lukker om <strong>{formatRemaining(remaining)}</strong></span>
                <span className="text-emerald-700">({new Date(activeWin.open_until).toLocaleString("da-DK")})</span>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleCloseWindow(activeWin.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                >
                  <XCircle className="h-3 w-3" /> Luk nu
                </button>
              )}
            </div>
          );
        }
        // No active window for the current seller → show "locked" cue.
        if (!isAdmin) {
          return (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <Lock className="h-4 w-4 text-slate-500" />
              <span>Budget låst — kontakt backend for at åbne et tidsvindue.</span>
            </div>
          );
        }
        return null;
      })()}

      {/* Backend: list of currently-open windows for this year */}
      {isAdmin && openWindows.length > 0 && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
            Aktive åbningsvinduer {year}
          </div>
          <ul className="space-y-1.5">
            {openWindows.map((w) => {
              const remaining = new Date(w.open_until).getTime() - Date.now();
              return (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-slate-800">
                    <strong>{w.scope === "all" ? "Alle sælgere" : (w.seller_initials || w.seller_email)}</strong>
                    <span className="text-slate-500"> · indtil {new Date(w.open_until).toLocaleString("da-DK")} ({formatRemaining(remaining)})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCloseWindow(w.id)}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                  >
                    <XCircle className="h-3 w-3" /> Luk
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <KpiCard label={T.kpi_budget[lang]} value={`${totals.annualQty}`} sub={fmtDKK(totals.annualBudget)} icon={Wallet} tone="primary" />
        <KpiCard label={T.kpi_orders[lang]} value={`${totals.sold.qty}`} sub={fmtDKK(totals.sold.value)} icon={Wallet} tone="ok" />
        <KpiCard label={T.kpi_working[lang]} value={`${totals.fc.qty}`} sub={fmtDKK(totals.fc.value)} icon={Wallet} tone="warn" />
        <KpiCard label={T.kpi_score[lang]} value={`${totals.score}%`} sub={`${totals.sold.qty} / ${totals.annualQty} ${T.pcs[lang]}`} icon={Wallet} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-300" /> {T.legend_budget[lang]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> {T.legend_orders[lang]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400" /> {T.legend_pipe[lang]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-900" /> {T.legend_work[lang]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-500" /> {T.legend_perf_n[lang]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> {T.legend_perf_p[lang]}</span>
      </div>

      {/* Matrix */}
      <TooltipProvider delayDuration={150}>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
          <div className="overflow-x-auto">
            {currentMonthCol > 0 && (
              <style>{`
                .crm-budget-matrix tbody tr > td:nth-child(${currentMonthCol}),
                .crm-budget-matrix thead tr > th:nth-child(${currentMonthCol}) {
                  background-image: linear-gradient(hsl(217 91% 60% / 0.08), hsl(217 91% 60% / 0.08));
                  box-shadow: inset 1px 0 0 hsl(217 91% 60% / 0.35), inset -1px 0 0 hsl(217 91% 60% / 0.35);
                }
                .crm-budget-matrix thead tr > th:nth-child(${currentMonthCol}) {
                  background-image: linear-gradient(hsl(217 91% 60% / 0.25), hsl(217 91% 60% / 0.25));
                }
              `}</style>
            )}
            <table className="crm-budget-matrix w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-900 text-slate-100">
                  <th className="sticky left-0 z-10 bg-slate-900 text-left px-3 py-2.5 font-semibold w-56 min-w-[14rem]">{T.col_model[lang]}</th>
                  {monthCols.map((m, i) => (
                    <th key={m} className={`px-2 py-2.5 font-medium text-center w-16 ${i === currentMonthIdx ? 'relative' : ''}`}>
                      {m}
                      {i === currentMonthIdx && <span className="ml-1 text-[9px] uppercase tracking-wide opacity-70">•</span>}
                    </th>
                  ))}
                  <th className="px-2 py-2.5 font-semibold text-center w-20">{T.col_total[lang]}</th>
                  <th className="px-2 py-2.5 font-semibold text-center w-16">{T.col_score[lang]}</th>
                </tr>
              </thead>
              <tbody>


                {(() => {
                  // Reusable 4-row block (BUDGET/ORDERS, PIPELINE, WORKING, PERFORMANCE)
                  // — used both for machine groups and individual equipment items so
                  // equipment has the exact same budget functionality as machines.
                  function renderRowBlock(opts: {
                    keyPrefix: string;
                    productName: string;
                    rowLines: BudgetLine[]; // lines used for budget/orders/working aggregation
                    indent?: boolean;       // visually nest under a machine
                    /** Fallback product key used when rowLines is empty so we can
                     *  still synthesize a primary line for editing (RC-751 fix). */
                    fallbackProductKey?: string;
                  }) {
                    const { keyPrefix, productName, rowLines, indent, fallbackProductKey } = opts;
                    // The "primary" line that the steppers act on. If the seller
                    // has no real line yet (e.g. RC-751 with no seed), build a
                    // synthetic seed line — `ensurePersistedLine` will persist it
                    // on the first stepper press.
                    // Pick the primary line that the steppers act on.
                    // Priority:
                    //   1. The line owned by the currently selected seller (if any).
                    //   2. The first existing line in the group.
                    //   3. A synthetic seed line owned by selectedSellerEmail / myEmail.
                    // This guarantees IDENTICAL behavior across all machine rows
                    // (RC-751, RC-1000s, Timan 3330/2620 + custom machines).
                    const matchSelected = selectedSellerEmail
                      ? rowLines.find(l => (l.seller_email || "").toLowerCase() === selectedSellerEmail)
                      : null;
                    const primaryLine: BudgetLine = matchSelected ?? rowLines[0] ?? (() => {
                      const pkey = fallbackProductKey || keyPrefix;
                      const product = findProduct(pkey);
                      return {
                        id: `seed_${year}_${pkey}_${(selectedSellerEmail || myEmail || "anon").replace(/[^a-z0-9]/gi, "")}`,
                        year,
                        product_key: pkey,
                        product_name: product?.name || pkey,
                        item_number: product?.varenr ?? null,
                        category: product?.category || "machine",
                        seller_id: null,
                        seller_name: null,
                        seller_email: selectedSellerEmail || myEmail || null,
                        seller_initials: null,
                        country: null,
                        qty_budget: 0,
                        value_budget: 0,
                        monthly_split: EVEN,
                        notes: null,
                        locked: false,
                        created_at: new Date().toISOString(),
                      } as BudgetLine;
                    })();
                    const linesForAgg: BudgetLine[] = rowLines.length > 0 ? rowLines : [primaryLine];
                    // Lock-check policy:
                    //   - Backend admin viewing "All sellers": editing requires a
                    //     specific seller selection, so the gray Budget row is
                    //     read-only here (steppers hidden).
                    //   - Otherwise, use the per-seller / per-year lock.
                    const adminAllSellers = isAdmin && !selectedSellerEmail;
                    const blockLocked = isLineLocked(primaryLine);
                    // Backend (admin) can edit the gray Official Budget whenever
                    // the relevant lock (per-seller, or global "ALL" in Alle view)
                    // is OPEN. Sellers never edit it.
                    // Sellers can edit the gray Budget row when an active
                    // access window covers their effective seller email.
                    const sellerWindowEdit =
                      isSeller && !!activeWindowFor(effectiveSellerEmail || myEmail || null);
                    const canEditBudget  = (isAdmin || sellerWindowEdit) && !blockLocked;
                    // Arbejdsbudget editing:
                    //  • Admin: always allowed (also in "Alle" view).
                    //  • Seller: allowed when their personal edit-mode is active
                    //    (10-min inactivity auto-lock). NOT gated by Fastlagt lock.
                    const canEditWorking = isAdmin || (isSeller && editModeUntil != null);
                    void adminAllSellers;

                    const agg = (k: "budgetMonthly" | "ordersMonthly" | "workingMonthly") => {
                      const arr = Array.from({ length: 12 }, () => 0);
                      linesForAgg.forEach(l => { lineMonthly(l)[k].forEach((v, i) => { arr[i] += v; }); });
                      return arr;
                    };
                    const budgetMonthly = agg("budgetMonthly");
                    const ordersMonthly = agg("ordersMonthly");
                    const workingMonthly = agg("workingMonthly");
                    const pipelineMonthly: PipelineOffer[][] = Array.from({ length: 12 }, () => []);
                    linesForAgg.forEach(l => {
                      const p = pipelineByLine[l.id] || [];
                      p.forEach((arr, i) => { pipelineMonthly[i].push(...arr); });
                    });
                    const totalBudget = budgetMonthly.reduce((a, b) => a + b, 0);
                    const totalOrders = ordersMonthly.reduce((a, b) => a + b, 0);
                    const totalWorking = workingMonthly.reduce((a, b) => a + b, 0);
                    const totalPipeline = pipelineMonthly.reduce((s, x) => s + x.length, 0);
                    const totalPerf = totalOrders - totalBudget;
                    const scorePct = totalBudget > 0 ? Math.round((totalOrders / totalBudget) * 100) : 0;
                    const scoreTone =
                      scorePct >= 100 ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                      scorePct >= 70  ? "bg-amber-100 text-amber-800 border-amber-200" :
                      totalBudget === 0 ? "bg-slate-100 text-slate-500 border-slate-200" :
                                        "bg-rose-100 text-rose-800 border-rose-200";
                    const stickyPad = indent ? "pl-8" : "px-3";
                    return (
                      <Fragment key={`block-${keyPrefix}`}>
                        {/* BUDGET / ORDERS — gray Budget cell becomes editable for backend when unlocked */}
                        <tr key={`bo-${keyPrefix}`} className="bg-slate-50/60">
                          <td className={cn("sticky left-0 z-10 bg-slate-50/60 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600", stickyPad)}>{T.row_budget_orders[lang]}</td>
                          {budgetMonthly.map((b, i) => {
                            const o = ordersMonthly[i];
                            return (
                              <td key={i} className="px-1 py-1.5 text-center tabular-nums text-xs">
                                {canEditBudget ? (
                                  <div className="inline-flex items-center gap-0.5 bg-white border border-slate-200 rounded px-0.5 hover:border-slate-400 transition">
                                    <button
                                      onClick={() => adjustBudget(primaryLine, i, -1)}
                                      className="p-0.5 hover:bg-slate-100 rounded text-slate-600"
                                      title="−1"
                                    ><Minus className="h-3 w-3" /></button>
                                    <span className="min-w-[14px] text-center font-semibold text-slate-700">{b}</span>
                                    <button
                                      onClick={() => adjustBudget(primaryLine, i, +1)}
                                      className="p-0.5 hover:bg-slate-100 rounded text-slate-600"
                                      title="+1"
                                    ><Plus className="h-3 w-3" /></button>
                                    <span className="text-slate-400 mx-0.5">/</span>
                                    <span className={cn("font-semibold pr-1", o > 0 ? "text-emerald-600" : "text-emerald-600/40")}>{o}</span>
                                  </div>
                                ) : (
                                  <>
                                    <span className="text-slate-500">{b}</span>
                                    <span className="text-slate-400 mx-0.5">/</span>
                                    <span className={cn("font-semibold", o > 0 ? "text-emerald-600" : "text-emerald-600/40")}>{o}</span>
                                  </>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-center tabular-nums text-xs font-semibold">
                            <span className="text-slate-600">{totalBudget}</span>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <span className="text-emerald-700">{totalOrders}</span>
                          </td>
                          <td className="px-2 py-2"></td>
                        </tr>

                        {/* PIPELINE */}
                        <tr key={`pipe-${keyPrefix}`} className="bg-amber-50/40">
                          <td className={cn("sticky left-0 z-10 bg-amber-50/40 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800", stickyPad)}>{T.row_pipeline[lang]}</td>
                          {pipelineMonthly.map((offers, i) => {
                            const count = offers.length;
                            const sum = offers.reduce((a, b) => a + b.value, 0);
                            if (count === 0) {
                              return <td key={i} className="px-2 py-2 text-center text-amber-700/40 text-xs">−</td>;
                            }
                            return (
                              <td key={i} className="px-1 py-2 text-center">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded bg-amber-100 text-amber-900 text-xs font-semibold border border-amber-200 hover:bg-amber-200 transition">
                                      {count}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-sm">
                                    <div className="text-xs space-y-2">
                                      <div className="font-semibold border-b border-slate-200 pb-1">
                                        {count} {T.tip_quotes[lang]} · {fmtDKK(sum)}
                                      </div>
                                      {offers.map((o, idx) => (
                                        <div key={idx} className="space-y-0.5 pb-1.5 border-b border-slate-100 last:border-0">
                                          <div className="font-medium">{o.offer_no} · {(STATUS_LABELS as Record<string, Record<Language,string>>)[o.status]?.[lang] || o.status}</div>
                                          <div className="text-slate-600">{o.dealer}</div>
                                          <div className="text-slate-600">{T.tip_customer[lang]}: {o.customer}</div>
                                          <div className="text-slate-600">{T.tip_machine[lang]}: {productName}</div>
                                          <div className="text-slate-600">{T.tip_attach[lang]}: {o.attachment}</div>
                                          <div className="flex justify-between">
                                            <span className="text-slate-500">{T.tip_sent[lang]}: {fmtDate(o.sent_date, lang)}</span>
                                            <span className="font-semibold tabular-nums">{fmtDKK(o.value)}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-center text-xs font-semibold text-amber-800 tabular-nums">{totalPipeline}</td>
                          <td className="px-2 py-2"></td>
                        </tr>

                        {/* WORKING — editable when this seller/year is unlocked */}
                        <tr key={`work-${keyPrefix}`} className="bg-slate-900 text-slate-100">
                          <td className={cn("sticky left-0 z-10 bg-slate-900 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200", stickyPad)}>{T.row_working[lang]}</td>
                          {workingMonthly.map((w, i) => (
                            <td key={i} className="px-1 py-1.5 text-center tabular-nums text-xs">
                              {canEditWorking ? (
                                <div className="inline-flex items-center gap-0.5 bg-slate-800 rounded px-0.5">
                                  <button
                                    onClick={() => adjustWorking(primaryLine, i, -1)}
                                    className="p-0.5 hover:bg-slate-700 rounded"
                                    title="−1"
                                  ><Minus className="h-3 w-3" /></button>
                                  <span className="min-w-[16px] text-center font-semibold">{w}</span>
                                  <button
                                    onClick={() => adjustWorking(primaryLine, i, +1)}
                                    className="p-0.5 hover:bg-slate-700 rounded"
                                    title="+1"
                                  ><Plus className="h-3 w-3" /></button>
                                </div>
                              ) : (
                                <span className="font-semibold">{w}</span>
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center tabular-nums text-xs font-semibold">{totalWorking}</td>
                          <td className="px-2 py-2"></td>
                        </tr>

                        {/* PERFORMANCE — Orders − Official Budget. Tooltip shows
                            secondary Orders+Pipeline vs Budget context. */}
                        <tr key={`perf-${keyPrefix}`} className="border-b-2 border-slate-200">
                          <td className={cn("sticky left-0 z-10 bg-white py-2 text-xs font-semibold uppercase tracking-wide text-slate-500", stickyPad)}>{T.row_perf[lang]}</td>
                          {ordersMonthly.map((o, i) => {
                            const b = budgetMonthly[i];
                            const diff = o - b;
                            const pipeCount = pipelineMonthly[i].length;
                            const combined = o + pipeCount;
                            let cls = "text-slate-400";
                            let label: string = "•";
                            if (diff > 0) { cls = "text-emerald-600 font-semibold"; label = `+${diff}`; }
                            else if (diff < 0) { cls = "text-rose-600 font-semibold"; label = `${diff}`; }
                            return (
                              <td key={i} className={cn("px-2 py-2 text-center tabular-nums text-xs", cls)}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-default">{label}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <div className="text-xs space-y-0.5">
                                      <div className="font-semibold">{MONTHS_BY_LANG[lang][i]} · {productName}</div>
                                      <div>Orders − Budget: <span className="font-semibold tabular-nums">{o} − {b} = {diff > 0 ? `+${diff}` : diff}</span></div>
                                      <div className="text-slate-300">Orders + Pipeline vs Budget: <span className="tabular-nums">{combined} / {b}</span></div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                            );
                          })}
                          <td className={cn("px-2 py-2 text-center tabular-nums text-xs font-bold",
                            totalPerf > 0 ? "text-emerald-700" : totalPerf < 0 ? "text-rose-700" : "text-slate-500")}>
                            {totalPerf > 0 ? `+${totalPerf}` : totalPerf}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={cn("inline-flex items-center justify-center min-w-[44px] px-2 py-0.5 rounded-full border text-xs font-semibold tabular-nums", scoreTone)}>
                              {totalBudget === 0 ? "−" : `${scorePct}%`}
                            </span>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  }

                  // Synthesize an in-memory BudgetLine for an equipment item so the
                  // working-forecast stepper has a stable id to write to. We build a
                  // stable id per (year, machine, equipment.key) and seed an empty
                  // line if none exists yet; this keeps storage logic untouched.
                  function syntheticEquipLine(machineKey: string, equipKey: string, equipName: string, varenr: string | null): BudgetLine {
                    const id = `eq_${year}_${machineKey}_${equipKey}`;
                    const existing = lines.find(l => l.id === id);
                    if (existing) return existing;
                    return {
                      id,
                      year,
                      product_key: `${machineKey}::${equipKey}`,
                      product_name: equipName,
                      item_number: varenr,
                      category: "attachment",
                      parent_machine_key: machineKey,
                      seller_id: null,
                      seller_name: null,
                      seller_email: null,
                      seller_initials: null,
                      country: null,
                      qty_budget: 0,
                      value_budget: 0,
                      monthly_split: EVEN,
                      notes: null,
                      locked: false,
                      created_at: new Date().toISOString(),
                    };
                  }

                  return (
                    <>
                      {busy && (
                        <tr><td colSpan={15} className="px-3 py-10 text-center text-slate-500">{T.loading[lang]}</td></tr>
                      )}
                      {!busy && grouped.length === 0 && (
                        <tr><td colSpan={15} className="px-3 py-10 text-center text-slate-500">{T.empty_year[lang]}</td></tr>
                      )}

                      {grouped.map((group, gIdx) => {
                        const product = findProduct(group.product_key);
                        const comingSoon = product?.status === "coming_soon";
                        const anyLocked = group.lines.some(l => l.locked);
                        const equipList = equipmentMap[group.product_key] || [];
                        const expanded = expandedEquip[group.product_key] === true;
                        const colors = MACHINE_COLORS[group.product_key] || defaultColor;

                        return (
                          <Fragment key={group.product_key}>
                            {/* Section spacer between machine groups */}
                            {gIdx > 0 && (
                              <tr key={`spacer-${group.product_key}`} aria-hidden="true">
                                <td colSpan={15} className="p-0">
                                  <div className="h-5 bg-slate-100 border-y border-slate-200" />
                                </td>
                              </tr>
                            )}
                            {/* Machine title row */}
                            <tr key={`title-${group.product_key}`}>
                              <td colSpan={15} className={cn("bg-gradient-to-r border-t-2 border-b border-slate-200 px-3 py-3 shadow-sm", colors.gradient, "border-t-slate-300")}>
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <span className={cn("inline-block h-5 w-1.5 rounded", colors.bar)} aria-hidden="true" />
                                    <span className={cn("font-semibold text-base", colors.text)}>{group.product_name}</span>
                                    {group.item_number ? <span className="text-xs text-slate-500 tabular-nums">· {group.item_number}</span> : <span className="text-xs text-slate-400 italic">· varenr. mangler</span>}
                                    {comingSoon && <span className="inline-flex items-center text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">{T.coming_soon[lang]}</span>}
                                    {anyLocked && <span className="inline-flex items-center gap-1 text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200"><Lock className="h-3 w-3" /> {T.locked[lang]}</span>}
                                  </div>
                                  {isAdmin && group.lines.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      {group.lines.map(l => (
                                        <span key={l.id} className="inline-flex items-center gap-1 text-xs text-slate-600">
                                          <span className="text-slate-500">{l.seller_name || "—"}</span>
                                          <button onClick={() => toggleLock(l)} className="p-1 rounded hover:bg-slate-200" title={l.locked ? T.unlock[lang] : T.lock[lang]}>
                                            {l.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                          </button>
                                          <button onClick={() => removeLine(l.id)} className="p-1 rounded hover:bg-rose-100 text-rose-600" title={T.delete_line[lang]}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {renderRowBlock({
                              keyPrefix: group.product_key,
                              productName: group.product_name,
                              rowLines: group.lines,
                              fallbackProductKey: group.product_key,
                            })}

                            {/* Equipment section */}
                            {equipList.length > 0 && (
                              <>
                                <tr key={`equip-h-${group.product_key}`}>
                                  <td colSpan={15} className={cn("border-t border-slate-100 px-3 py-1.5", colors.row || "bg-slate-50")}>
                                    <div className="flex items-center gap-2">
                                      <span className={cn("inline-block h-3.5 w-1 rounded", colors.bar)} aria-hidden="true" />
                                      <button
                                        type="button"
                                        onClick={() => setExpandedEquip(prev => ({ ...prev, [group.product_key]: !expanded }))}
                                        className={cn("inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide hover:opacity-80", colors.text)}
                                        aria-expanded={expanded}
                                        title={expanded ? T.hide_equipment[lang] : T.show_equipment[lang]}
                                      >
                                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                        <Wrench className="h-3.5 w-3.5" />
                                        {T.equipment_for[lang]} {group.product_name}
                                      </button>
                                    </div>
                                  </td>
                                </tr>

                                {expanded && equipList.map(eq => {
                                  const fullLabel = localizedName(eq.name, lang);
                                  const isPreview = eq.status === "preview";

                                  // Visual sub-folder heading only — no budget row.
                                  if (eq.isHeader) {
                                    return (
                                      <tr key={`equip-subhead-${eq.key}`}>
                                        <td colSpan={15} className={cn("border-t border-slate-100 px-3 py-1 pl-8", colors.row || "bg-slate-50")}>
                                          <div className="flex items-center gap-2">
                                            <span className={cn("inline-block h-3 w-0.5 rounded", colors.bar)} aria-hidden="true" />
                                            <span className={cn("text-[11px] font-semibold uppercase tracking-wide", colors.text)}>{fullLabel}</span>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  }

                                  const eqLabel = shortLabelFor(eq.varenr, fullLabel);
                                  const hasShort = eqLabel !== fullLabel;
                                  const synthetic = syntheticEquipLine(group.product_key, eq.key, eqLabel, eq.varenr);
                                  return (
                                    <Fragment key={`equip-frag-${eq.key}`}>
                                      {/* Equipment title sub-row */}
                                      <tr key={`equip-title-${eq.key}`}>
                                        <td colSpan={15} className={cn("border-t border-slate-100 px-3 py-1.5 pl-12", colors.row || "bg-white")}>
                                          <div className="flex items-center gap-2">
                                            <span className={cn("inline-block h-3 w-0.5 rounded", colors.bar)} aria-hidden="true" />
                                            <Wrench className="h-3 w-3 text-slate-400" />
                                            {hasShort ? (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <span className="font-medium text-slate-800 text-sm cursor-help">{eqLabel}</span>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="max-w-xs">
                                                  <span className="text-xs">{fullLabel}</span>
                                                </TooltipContent>
                                              </Tooltip>
                                            ) : (
                                              <span className="font-medium text-slate-800 text-sm">{eqLabel}</span>
                                            )}
                                            {eq.varenr ? <span className="text-[10px] text-slate-500 tabular-nums">· {eq.varenr}</span> : <span className="text-[10px] text-slate-400 italic">· varenr. mangler</span>}
                                            {isPreview && (
                                              <span className="inline-flex items-center text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                                {T.preview_row[lang]}
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                      {renderRowBlock({
                                        keyPrefix: `eq-${eq.key}`,
                                        productName: `${group.product_name} · ${eqLabel}`,
                                        rowLines: [synthetic],
                                        indent: true,
                                      })}
                                    </Fragment>
                                  );
                                })}
                              </>
                            )}
                          </Fragment>
                        );
                      })}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </TooltipProvider>

      {/* Add modal — Create Budget-only product (machine or attachment). */}
      {showAdd && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">{T.new_item_title[lang]} · {year}</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-slate-600">{T.field_type[lang]}</span>
                <select
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                  value={newRow.type}
                  onChange={(e) => setNewRow(r => ({ ...r, type: e.target.value as "machine" | "attachment" }))}
                >
                  <option value="machine">{T.type_machine[lang]}</option>
                  <option value="attachment">{T.type_attach[lang]}</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-slate-600">{T.field_pname[lang]}</span>
                  <input
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    placeholder={newRow.type === "machine" ? "RC-1500" : "Frontklipper"}
                    value={newRow.name}
                    onChange={(e) => setNewRow(r => ({ ...r, name: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-600">{T.field_varenr[lang]}</span>
                  <input
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm tabular-nums"
                    placeholder={newRow.type === "machine" ? "999999" : "888111"}
                    value={newRow.varenr}
                    onChange={(e) => setNewRow(r => ({ ...r, varenr: e.target.value }))}
                  />
                </label>
              </div>
              {newRow.type === "attachment" && (
                <label className="block">
                  <span className="text-xs text-slate-600">{T.field_parent[lang]}</span>
                  <select
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                    value={newRow.parent_machine_key}
                    onChange={(e) => setNewRow(r => ({ ...r, parent_machine_key: e.target.value }))}
                  >
                    <option value="">{T.pick_parent[lang]}</option>
                    {["RC-1000s", "Timan 3330", "Timan 2620"].map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                    {customMachines.map(m => (
                      <option key={m.key} value={m.key}>{m.name}{m.varenr ? ` · ${m.varenr}` : ""}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-slate-600">{T.field_owner[lang]}</span>
                  <select
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                    value={newRow.seller_email}
                    onChange={(e) => {
                      const val = e.target.value;
                      const known = BUDGET_SELLERS.find(s => s.email === val);
                      setNewRow(r => ({ ...r, seller_email: val, country: known?.country ?? r.country }));
                    }}
                  >
                    <option value="">{T.owner_all[lang]}</option>
                    {BUDGET_SELLERS.map(s => (
                      <option key={s.email} value={s.email}>{s.initials} — {s.country}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-slate-600">{T.field_country[lang]}</span>
                  <input className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={newRow.country} onChange={(e) => setNewRow(r => ({ ...r, country: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{T.cancel[lang]}</button>
              <button onClick={addProduct} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-2"><Plus className="h-4 w-4" /> {T.create[lang]}</button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <BudgetUnlockModal
          open={unlockOpen}
          onOpenChange={setUnlockOpen}
          year={year}
          defaultSellerEmail={unlockDefaultEmail}
          createdBy={appUser?.display_name || appUser?.email || "Backend"}
          onCreated={async () => {
            const fresh = await listBudgetAccessWindows(year);
            setAccessWindows(fresh);
            toast.success(`Budget ${year} åbnet`);
          }}
        />
      )}
    </CrmLayout>
  );
}
