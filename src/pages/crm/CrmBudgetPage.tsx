import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Lock, Unlock, Plus, X, ShieldAlert, Calendar,
  Wallet, Sparkles, Minus, ChevronDown, ChevronRight, Wrench, Pencil,
  Clock, XCircle, Download, Link2, FileText,
} from "lucide-react";
import { toast } from "sonner";
import CrmLayout from "@/components/crm/CrmLayout";
import BudgetUnlockModal from "@/components/crm/BudgetUnlockModal";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, isDealerNumberAllowed, isExternalCrmRole, isScopedSeller } from "@/lib/crmScope";
import { useEffectivePortalUser } from "@/lib/viewAsUser";
import { buildJournalScope } from "@/lib/machineJournalScope";
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
  buildOrderActualsByKey, orderActualKey,
  EQUIPMENT_BY_MACHINE, localizedName,
  getSellerYearLock, setSellerYearLock, getEffectiveLock, setGlobalYearLock,
  appendBudgetAuditEntry, budgetCellKey,
  customMachineProducts, customEquipmentByMachine, createCustomProduct,
  listBudgetDealerLines,
  aggregateDealerBudgetMonthly, hasDealerBudgetByMonth, mergeMonthlyPreferDealer,
  collapseDealerLinesForCell,
  type BudgetLine, type BudgetForecast, type SalesActual, type SellerYearLock,
  type EquipmentCategory, type BudgetType, type BudgetDealerLine,
  findProduct,
} from "@/lib/crmBudgetService";
import {
  listLeads, buildLeadWorkingContributions, formatLeadNo,
  type LeadWorkingContribution,
} from "@/lib/crmLeadsService";
import {
  listScopedOpenQuotes, sellerKeyOf,
  type ScopedConfiguration,
} from "@/lib/crmRelationsService";
import {
  listBudgetAccessWindows, closeBudgetAccessWindow, findActiveWindow, formatRemaining,
  type BudgetAccessWindow,
} from "@/lib/budgetAccessWindows";
import BudgetAuditCellPopover from "@/components/crm/BudgetAuditCellPopover";
import BudgetLargeChangeDialog, { isLargeBudgetChange, type LargeChangeContext } from "@/components/crm/BudgetLargeChangeDialog";
import BudgetSaveConfirmDialog, { type BudgetChangedCell } from "@/components/crm/BudgetSaveConfirmDialog";
import LatestBudgetChangesPanel from "@/components/crm/LatestBudgetChangesPanel";
import BudgetCellInsight from "@/components/crm/BudgetCellInsight";
import BudgetReferenceModal, { type BudgetReferenceContext } from "@/components/crm/BudgetReferenceModal";
import { fetchBudgetAuditEntries, type AuditEntry } from "@/lib/audit-log-store";
import { listBudgetReferences, type BudgetReference } from "@/lib/budgetReferencesService";
import type { CellReference } from "@/components/crm/BudgetCellInsight";


// ────────────────────────────────────────────────────────────
// i18n — all visible UI strings for the Budget module
// ────────────────────────────────────────────────────────────
const T: Record<string, Record<Language, string>> = {
  page_title:    { da: 'Budget',                en: 'Budget',                  de: 'Budget',                  it: 'Budget',                  hu: 'Költségvetés' },
  annual_budget: { da: 'Årligt budget',         en: 'Annual budget',           de: 'Jahresbudget',            it: 'Budget annuale',          hu: 'Éves költségvetés' },
  subtitle_admin:{ da: 'Backend viser samlet budget på tværs af sælgere. Redigering sker i sælger-visning.',
                   en: 'Backend shows the combined budget across all sellers. Editing happens in seller view.',
                   de: 'Backend zeigt das Gesamtbudget aller Verkäufer. Bearbeitung erfolgt in der Verkäufer-Ansicht.',
                   it: 'Il backend mostra il budget totale di tutti i venditori. La modifica avviene nella vista venditore.',
                   hu: 'A backend az összes értékesítő összesített költségvetését mutatja. Szerkesztés az értékesítői nézetben.' },
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

function generatePipeline(_line: BudgetLine, _year: number): PipelineOffer[][] {
  // Pipeline must ONLY reflect actual quotes from the configurator.
  // It must NEVER depend on budget input. Until a real quote feed is wired
  // into the Budget view, return 12 empty months so Pipeline shows 0 and is
  // unaffected by Budget plus/minus actions.
  return Array.from({ length: 12 }, () => [] as PipelineOffer[]);
}
// Keep references to mock data referenced elsewhere happy.
void SAMPLE_DEALERS; void SAMPLE_CUSTOMERS; void SAMPLE_ATTACHMENTS; void SAMPLE_STATUSES; void seedRand;

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
  const effectiveUser = useEffectivePortalUser(appUser);
  const { language: lang } = useLanguage();
  const portalRole = derivePortalRole(effectiveUser);
  const isAdmin = isCrmAdmin(portalRole);
  const isSeller = isScopedSeller(portalRole);
  const externalCrm = isExternalCrmRole(portalRole);
  const allowed = isAdmin || isSeller || externalCrm;

  const [year, setYear] = useState<number>(availableYears()[0]);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [forecasts, setForecasts] = useState<BudgetForecast[]>([]);
  const [actuals, setActuals] = useState<SalesActual[]>([]);
  const [leadContribs, setLeadContribs] = useState<LeadWorkingContribution[]>([]);
  const [dealerLines, setDealerLines] = useState<BudgetDealerLine[]>([]);
  const [quotePipelineRows, setQuotePipelineRows] = useState<ScopedConfiguration[]>([]);
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
  // Large-change confirm dialog state.
  const [largeChange, setLargeChange] = useState<{ ctx: LargeChangeContext; run: () => void | Promise<void> } | null>(null);
  // Save-confirmation dialog state shown once at "Afslut redigering".
  const [saveConfirm, setSaveConfirm] = useState<BudgetChangedCell[] | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  // "Add reference" modal state — opened from the small Link2 icon next to a cell.
  const [refModal, setRefModal] = useState<BudgetReferenceContext | null>(null);
  // Bumped after each audit-write so the latest-changes panel + indicators refresh.
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  // Map of cell_key → latest AuditEntry for the current scope (used for the
  // changed indicator + tooltip). Backend sees all sellers; sellers see own.
  const [latestAuditByCell, setLatestAuditByCell] = useState<Record<string, AuditEntry>>({});
  // Map of cell_key → list of attached references (for the small hover overview).
  const [refsByCell, setRefsByCell] = useState<Record<string, CellReference[]>>({});
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
  function startEditMode() {
    // Fresh edit session — clear any drafts so the baseline is the persisted
    // monthly_qty / forecast snapshot.
    setWorkingDraft({});
    setEditModeUntil(Date.now() + EDIT_MODE_MS);
  }
  function exitEditModeSilently() {
    setWorkingDraft({});
    setEditModeUntil(null);
  }

  useEffect(() => {
    if (appUser?.email) resolveSellerId(appUser.email).then(setSellerId);
  }, [appUser?.email]);

  useEffect(() => {
    if (!allowed) return;
    setBusy(true);
    if (externalCrm) {
      (async () => {
        const scope = await buildJournalScope(effectiveUser, portalRole);
        const dealerNumbers = Array.from(scope.dealerNumbers);
        const dl = await listBudgetDealerLines(year);
        setLines([]);
        setForecasts([]);
        setActuals([]);
        setLeadContribs([]);
        setDealerLines(dl.filter((line) => isDealerNumberAllowed(line.dealer_account_number, dealerNumbers)));
      })().finally(() => setBusy(false));
      return;
    }
    Promise.all([listBudgetLines({ year }), listForecasts(year), listSalesActuals(year), listLeads({ limit: 1000, payload: "summary" }), listBudgetDealerLines(year)])
      .then(([l, f, a, leads, dl]) => {
        setLines(l); setForecasts(f); setActuals(a);
        setLeadContribs(buildLeadWorkingContributions(leads).filter(c => c.year === year));
        setDealerLines(dl);
      })
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
  }, [year, allowed, externalCrm, effectiveUser?.dealer_number, portalRole]);

  // Load open configurator quotes from the SAME source as CRM → Tilbud
  // (crm_configurations_view, via crmRelationsService) so the Pipeline/Tilbud
  // row reflects every quote that is visible in CRM → Tilbud.
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      const sellerView = getActiveSellerView(appUser?.email);
      const sellerInitials = sellerView?.initials
        ?? (portalRole === 'timan_seller' && appUser?.display_name
            ? appUser.display_name.match(/^([A-ZÆØÅ]{2,4})/)?.[1] ?? null
            : null);
      const sellerEmail = sellerView?.email
        ?? (portalRole === 'timan_seller' ? appUser?.email?.toLowerCase() ?? null : null);
      const sid = appUser?.email ? await resolveSellerId(appUser.email) : null;
      const dealerNumbers = externalCrm
        ? Array.from((await buildJournalScope(effectiveUser, portalRole)).dealerNumbers)
        : null;
      const { rows } = await listScopedOpenQuotes({
        role: portalRole,
        sellerId: sid,
        sellerInitials,
        sellerEmail,
        dealerNumber: effectiveUser?.dealer_number ?? null,
        dealerNumbers,
      });
      if (!cancelled) setQuotePipelineRows(rows);
    })();
    return () => { cancelled = true; };
  }, [year, allowed, appUser?.email, effectiveUser?.dealer_number, appUser?.display_name, portalRole, externalCrm]);

  // Resolve the current user's identity for scoping. We support multiple
  // matching strategies because seed rows may have been created before the
  // user's auth_user_id was linked, and because the preview-role switcher
  // produces synthetic display_names like "[Preview] Timan Sælger".
  const myEmail = (appUser?.email || "").toLowerCase().trim();
  const myInitialsFromName = (appUser?.display_name || "").replace(/^\[Preview\]\s*/i, "").trim();
  // Effective seller context for filtering in seller mode. For a backend user
  // who selected "VIS SOM SÆLGER" → JTN, derivePortalRole returns 'timan_seller'
  // and this resolves to JTN's email/initials (NOT the logged-in user's).
  // In pure backend mode (admin), this is unused — backend must NOT filter by
  // activeSellerContext per spec.
  const activeSellerForFilter = !isAdmin ? getActiveSellerView(appUser?.email) : null;
  const sellerCtxEmail = (activeSellerForFilter?.email || myEmail || "").toLowerCase();
  const sellerCtxInitials = (activeSellerForFilter?.initials || myInitialsFromName || "").toLowerCase();

  // Active "view as <seller>" mode for backend users (so a backend in seller
  // mode behaves as that seller for window/lock resolution and countdown).
  // NOTE: activeSellerContext is intentionally NOT used in backend mode for
  // filtering — backend mode aggregates across all sellers regardless.
  const effectiveSellerEmail = (getEffectiveSellerEmail(appUser ?? null) || "").toLowerCase();

  // The "selected seller" for backend admin == backendFilter (only when it's
  // an actual seller email). For sellers it's their own email. When a backend
  // user is in seller-view mode we use the active seller's email.
  // Backend mode: selected seller comes ONLY from the seller selector (never
  // from activeSellerContext). Seller mode: use the effective seller context.
  const selectedSellerEmail: string | null = isAdmin
    ? (BUDGET_SELLERS.some(s => s.email.toLowerCase() === backendFilter.toLowerCase()) ? backendFilter.toLowerCase() : null)
    : (sellerCtxEmail || null);

  // Compact audit context (used as seller_context for sellers; backend = null).
  const auditSellerContext = isAdmin ? null : (sellerCtxEmail || sellerCtxInitials || null);

  // Hydrate latest-changed map for the current year/scope. Cheap (one query).
  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    fetchBudgetAuditEntries({
      year,
      seller_context: auditSellerContext || undefined,
      limit: 200,
    }).then((rows) => {
      if (!alive) return;
      const map: Record<string, AuditEntry> = {};
      for (const r of rows) {
        const nv = r.new_value as Record<string, unknown> | null;
        const ck = nv && typeof nv === "object" ? (nv.cell_key as string) : null;
        if (ck && !map[ck]) map[ck] = r;
      }
      setLatestAuditByCell(map);
    }).catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, [year, allowed, auditSellerContext, auditRefreshKey]);

  // Hydrate cell → references map for the current year/scope.
  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    listBudgetReferences({
      year,
      seller_email: auditSellerContext || undefined,
      limit: 1000,
    }).then((rows: BudgetReference[]) => {
      if (!alive) return;
      const map: Record<string, CellReference[]> = {};
      // Oldest first so display order is creation order.
      const sorted = [...rows].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
      for (const r of sorted) {
        if (!r.cell_key) continue;
        const item: CellReference = {
          dealer_label: r.dealer_name,
          has_lead: !!(r.lead_id && r.lead_id.trim()),
          has_demo: !!(r.demo_id && r.demo_id.trim()),
          note: r.note,
          qty: r.delta_qty ?? null,
        };
        (map[r.cell_key] ||= []).push(item);
      }
      setRefsByCell(map);
    }).catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, [year, allowed, auditSellerContext, auditRefreshKey]);


  const visibleLines = useMemo(() => {
    function belongsToActiveSeller(l: BudgetLine): boolean {
      if (sellerId && l.seller_id === sellerId) return true;
      if (sellerCtxEmail && l.seller_email && l.seller_email.toLowerCase() === sellerCtxEmail) return true;
      if (sellerCtxInitials && l.seller_initials && l.seller_initials.toLowerCase() === sellerCtxInitials) return true;
      if (sellerCtxInitials && l.seller_name && l.seller_name.toLowerCase() === sellerCtxInitials) return true;
      return false;
    }
    if (isAdmin) {
      // Backend mode: never apply activeSellerContext as a filter.
      if (backendFilter === "all") return lines;
      if (backendFilter === "mine") {
        // "Min egen visning" matches the logged-in backend user's own rows.
        return lines.filter(l => {
          if (myEmail && l.seller_email && l.seller_email.toLowerCase() === myEmail) return true;
          if (myInitialsFromName && l.seller_initials && l.seller_initials.toLowerCase() === myInitialsFromName.toLowerCase()) return true;
          return false;
        });
      }
      return lines.filter(l => (l.seller_email || "").toLowerCase() === backendFilter.toLowerCase());
    }
    // Seller mode (incl. backend in "view as seller"): filter by active seller context.
    return lines.filter(belongsToActiveSeller);
  }, [lines, isAdmin, sellerId, sellerCtxEmail, sellerCtxInitials, myEmail, myInitialsFromName, backendFilter]);

  // Pipeline per line.
  const pipelineByLine = useMemo(() => {
    const map: Record<string, PipelineOffer[][]> = {};
    visibleLines.forEach(l => { map[l.id] = generatePipeline(l, year); });
    return map;
  }, [visibleLines, year]);

  // Open configurator quotes (scoped) → year×month×product map.
  // Source: listScopedOpenQuotes (crm_configurations_view, same as CRM → Tilbud).
  // Filtering rules:
  //   • Seller view: already scoped at fetch time.
  //   • Backend "Alle sælgere"  → use everything we got.
  //   • Backend "Min egen visning" → only my own quotes.
  //   • Backend with a seller chip → only that seller's quotes.
  const scopedQuotePipeline = useMemo(() => {
    const wantSellerEmail = isAdmin
      ? (backendFilter === 'all' ? null
        : backendFilter === 'mine' ? (myEmail || null)
        : backendFilter.toLowerCase())
      : null;
    const filtered = quotePipelineRows.filter(q => {
      if (!wantSellerEmail) return true;
      const k = sellerKeyOf(q);
      return k === `email:${wantSellerEmail}`;
    });
    // Build machineKey → 12-month buckets of { quotes, qty, value }.
    const out: Record<string, Array<{ quotes: ScopedConfiguration[]; qty: number; value: number }>> = {};
    const ensure = (k: string) => {
      if (!out[k]) out[k] = Array.from({ length: 12 }, () => ({ quotes: [] as ScopedConfiguration[], qty: 0, value: 0 }));
      return out[k];
    };
    for (const r of filtered) {
      const d = r.month_iso ? new Date(r.month_iso) : null;
      if (!d || isNaN(d.getTime()) || d.getFullYear() !== year) continue;
      const mIdx = d.getMonth();
      const totalQty = Object.values(r.machine_qty_by_key).reduce((s, q) => s + q, 0) || 1;
      const total = r.total_value || 0;
      const keys = r.machine_keys.length > 0 ? r.machine_keys : ['__unknown__'];
      for (const key of keys) {
        const qty = r.machine_qty_by_key[key] || 1;
        const cell = ensure(key)[mIdx];
        cell.quotes.push(r);
        cell.qty += qty;
        cell.value += total * (qty / totalQty);
      }
    }
    return out;
  }, [quotePipelineRows, isAdmin, backendFilter, myEmail, year]);

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

  const orderActualsByKey = useMemo(() => buildOrderActualsByKey(actuals), [actuals]);

  function orderSellerKeysForLine(line: BudgetLine): string[] {
    const keys = [line.seller_email, line.seller_initials, line.seller_name]
      .map(v => (v || "").trim().toLowerCase())
      .filter(Boolean);
    return Array.from(new Set(keys));
  }

  function ordersMonthlyForLine(line: BudgetLine): number[] {
    const sellerKeys = orderSellerKeysForLine(line);
    return Array.from({ length: 12 }, (_, monthIdx) => {
      for (const sellerKey of sellerKeys) {
        const v = orderActualsByKey[orderActualKey(sellerKey, year, monthIdx, line.product_key)];
        if (v != null) return v;
      }
      return 0;
    });
  }

  function actualsForLine(line: BudgetLine): SalesActual[] {
    const sellerKeys = new Set(orderSellerKeysForLine(line));
    return actuals.filter(a => {
      if ((a.year ?? year) !== year) return false;
      if ((a.product_key || "").toLowerCase().replace(/[^a-z0-9]/g, "") !== (line.product_key || "").toLowerCase().replace(/[^a-z0-9]/g, "")) return false;
      return [a.seller_key, a.seller_email, a.seller_initials]
        .map(v => (v || "").trim().toLowerCase())
        .some(k => sellerKeys.has(k));
    });
  }

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

  function renderedMonthlyForBlock(opts: { keyPrefix: string; rowLines: BudgetLine[]; fallbackProductKey?: string }) {
    const { keyPrefix, rowLines, fallbackProductKey } = opts;
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
    const agg = (k: "budgetMonthly" | "ordersMonthly" | "workingMonthly") => {
      const arr = Array.from({ length: 12 }, () => 0);
      linesForAgg.forEach(l => { lineMonthly(l)[k].forEach((v, i) => { arr[i] += v; }); });
      return arr;
    };
    const budgetMonthlyManual = agg("budgetMonthly");
    const ordersMonthly = agg("ordersMonthly");
    const baseWorking = agg("workingMonthly");
    const blockProductKey = primaryLine.product_key || fallbackProductKey || "";
    const scopeEmails: Set<string> | null = (() => {
      if (isAdmin) {
        if (backendFilter === "all") return null;
        if (backendFilter === "mine") return new Set([myEmail].filter(Boolean));
        return new Set([backendFilter.toLowerCase()]);
      }
      const e = (sellerCtxEmail || myEmail || "").toLowerCase();
      return new Set(e ? [e] : []);
    })();
    const dealerMonthly = aggregateDealerBudgetMonthly(dealerLines, blockProductKey, scopeEmails);
    const hasDealerMonth = hasDealerBudgetByMonth(dealerLines, blockProductKey, scopeEmails);
    const budgetMonthly = mergeMonthlyPreferDealer(budgetMonthlyManual, dealerMonthly, hasDealerMonth);
    const scopedLeadContribs = leadContribs.filter(c => {
      if (c.product_key !== blockProductKey) return false;
      if (!isAdmin && sellerCtxEmail) return (c.owner_email || "").toLowerCase() === sellerCtxEmail;
      if (isAdmin && backendFilter && backendFilter !== "ALL") {
        const e = backendFilter.toLowerCase();
        return (c.owner_email || "").toLowerCase() === e;
      }
      return true;
    });
    const leadWorkingByMonth: LeadWorkingContribution[][] = Array.from({ length: 12 }, () => []);
    for (const c of scopedLeadContribs) {
      if (c.month_idx >= 0 && c.month_idx < 12) leadWorkingByMonth[c.month_idx].push(c);
    }
    const workingMonthly = baseWorking.map((v, i) => v + leadWorkingByMonth[i].reduce((s, c) => s + c.qty, 0));
    return { primaryLine, linesForAgg, budgetMonthlyManual, ordersMonthly, baseWorking, blockProductKey, budgetMonthly, leadWorkingByMonth, workingMonthly };
  }

  // KPI totals — MUST mirror the rendered table row totals exactly. We sum the
  // same grouped machine blocks that render the visible Total column, including
  // dealer-budget overlays for Budget and uncapped order quantities for Orders.
  // Orders are NOT capped by budget; score may exceed 100%.
  const totals = useMemo(() => {
    let annualQty = 0;
    let soldQty = 0;
    for (const g of grouped) {
      const m = renderedMonthlyForBlock({ keyPrefix: g.product_key, rowLines: g.lines, fallbackProductKey: g.product_key });
      annualQty += m.budgetMonthly.reduce((a, b) => a + b, 0);
      soldQty += m.ordersMonthly.reduce((a, b) => a + b, 0);
    }
    const annualBudget = visibleLines.reduce((s, l) => s + l.value_budget, 0);
    const soldValue = visibleLines.reduce((sum, l) => sum + actualsForLine(l).reduce((s, a) => s + (a.value_sold || 0), 0), 0);
    const fc = forecasts
      .filter(f => visibleLines.some(l => l.id === f.budget_line_id))
      .reduce((acc, f) => ({ qty: acc.qty + f.qty_forecast, value: acc.value + f.value_forecast }), { qty: 0, value: 0 });
    const score = annualQty > 0 ? Math.round((soldQty / annualQty) * 100) : 0;
    return { annualBudget, annualQty, sold: { qty: soldQty, value: soldValue }, fc, score };
  }, [grouped, visibleLines, orderActualsByKey, actuals, forecasts, dealerLines, leadContribs, workingDraft, isAdmin, backendFilter, selectedSellerEmail, myEmail, sellerCtxEmail, year]);

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

  if (externalCrm) {
    const activeDealerLines = dealerLines.filter((line) => !line.excluded_from_total);
    const budgetQty = activeDealerLines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
    const pipelineValue = quotePipelineRows.reduce((sum, row) => sum + (row.total_value_dkk || 0), 0);
    const productTotals = new Map<string, { product: string; qty: number }>();
    for (const line of activeDealerLines) {
      const key = line.product_key || line.product_name || line.item_number || "—";
      const prev = productTotals.get(key) ?? { product: line.product_name || key, qty: 0 };
      prev.qty += Number(line.qty) || 0;
      productTotals.set(key, prev);
    }
    return (
      <CrmLayout pageTitle={T.page_title[lang]}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label={T.kpi_budget[lang]} value={`${budgetQty.toLocaleString("da-DK")} ${T.pcs[lang]}`} icon={Wallet} tone="primary" />
            <KpiCard label={T.legend_pipe[lang]} value={fmtDKK(pipelineValue)} icon={FileText} tone="ok" />
            <KpiCard label={T.col_total[lang]} value={`${activeDealerLines.length.toLocaleString("da-DK")} linjer`} icon={Calendar} tone="warn" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">{T.annual_budget[lang]}</h2>
            </div>
            {busy ? (
              <p className="p-5 text-sm text-slate-500">{T.loading[lang]}</p>
            ) : productTotals.size === 0 ? (
              <p className="p-5 text-sm text-slate-500">{T.empty_year[lang]}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left px-5 py-3">{T.col_model[lang]}</th>
                    <th className="text-right px-5 py-3">{T.col_total[lang]}</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(productTotals.values()).sort((a, b) => a.product.localeCompare(b.product, "da")).map((row) => (
                    <tr key={row.product} className="border-t border-slate-100">
                      <td className="px-5 py-3 font-medium text-slate-900">{row.product}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{row.qty.toLocaleString("da-DK")} {T.pcs[lang]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </CrmLayout>
    );
  }

  // ---- Lock helpers (per seller / per year) ----
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _activeModeRev = activeModeRev; // re-evaluated when mode changes

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
    const ac = actualsForLine(line)[0];
    const fc = forecasts.find(f => f.budget_line_id === line.id);
    const budgetMonthly = splitToMonthly(line.qty_budget, split);
    const ordersMonthly = ordersMonthlyForLine(line);
    const draft = workingDraft[line.id];
    // Source of truth for working forecast (Arbejdsbudget):
    //   1) live unsaved draft for this line, OR
    //   2) exact per-month values previously saved (fc.monthly_qty), OR
    //   3) legacy fallback — split annual qty_forecast by monthly_split.
    // We MUST NOT redistribute monthly_qty when present — that would mutate
    // the seller's manually entered values across months.
    const savedMonthly = (fc?.monthly_qty && fc.monthly_qty.length === 12)
      ? fc.monthly_qty.map(v => Number(v) || 0)
      : null;
    // Arbejdsbudget is fully independent from Budget. If no forecast has been
    // saved yet, default to zeros — never fall back to qty_budget (that would
    // make Budget edits visually mutate Arbejdsbudget).
    const legacyForecast = (fc && (fc.qty_forecast ?? 0) > 0)
      ? splitToMonthly(fc.qty_forecast, split)
      : Array(12).fill(0);
    const workingMonthly = draft ?? savedMonthly ?? legacyForecast;
    return { budgetMonthly, ordersMonthly, workingMonthly, ac, fc, split };
  }

  // Per-seller breakdown for a set of lines + month index, returning totals
  // grouped by seller_initials. Used for the hover tooltips on Budget /
  // Arbejdsbudget / Performance numbers in backend "Alle sælgere" mode.
  function sellerBreakdownFor(
    linesIn: BudgetLine[],
    monthIdx: number | null,
    kind: "budget" | "orders" | "working",
  ): { initials: string; value: number }[] {
    const map = new Map<string, number>();
    for (const l of linesIn) {
      const init = (l.seller_initials || "—").toUpperCase();
      const m = lineMonthly(l);
      const arr = kind === "budget" ? m.budgetMonthly
        : kind === "orders" ? m.ordersMonthly
        : m.workingMonthly;
      const v = monthIdx == null ? arr.reduce((a, b) => a + b, 0) : (arr[monthIdx] ?? 0);
      map.set(init, (map.get(init) || 0) + v);
    }
    // Order by canonical seller list, then any extras alphabetically.
    const order = BUDGET_SELLERS.map(s => s.initials.toUpperCase());
    const seen = new Set<string>();
    const out: { initials: string; value: number }[] = [];
    for (const ini of order) {
      if (map.has(ini)) { out.push({ initials: ini, value: map.get(ini) || 0 }); seen.add(ini); }
    }
    for (const [ini, v] of map.entries()) if (!seen.has(ini)) out.push({ initials: ini, value: v });
    return out;
  }

  /** Dealer names contributing to the orders count for a set of lines and
   *  month index. Used by the "Ordrer" cell hover tooltip. Returns one entry
   *  per order occurrence (duplicates) so the UI can group + count them. */
  function ordersDealersFor(linesIn: BudgetLine[], monthIdx: number | null): string[] {
    const out: string[] = [];
    for (const l of linesIn) {
      for (const ac of actualsForLine(l)) {
        const md = ac.monthly_dealers;
        if (!md) continue;
        if (monthIdx == null) {
          for (const arr of md) for (const d of arr) {
            for (let k = 0; k < (d.qty || 1); k++) out.push(d.name);
          }
        } else {
          const arr = md[monthIdx] || [];
          for (const d of arr) {
            for (let k = 0; k < (d.qty || 1); k++) out.push(d.name);
          }
        }
      }
    }
    return out;
  }


  // Ensure a real budget line exists for the current seller / product. Used by
  // the working-forecast steppers so that RC-751 (or any machine without a
  // pre-existing seed row for the seller) becomes editable on first click.
  // Synthetic equipment ids (eq_YEAR_MACHINE_EQUIPKEY) are also persisted.
  async function ensurePersistedLine(line: BudgetLine, productKeyOverride?: string): Promise<BudgetLine | null> {
    // Already in lines store → nothing to do.
    if (lines.some(l => l.id === line.id)) return line;

    // Resolve a real seller owner. Backend MUST have a selected seller (filter
    // or active "view as seller" mode). Sellers always own their own rows.
    // We never persist a budget row without a known seller — that would create
    // an orphan that the backend total includes but no seller view shows.
    // Backend/global mode is fully read-only. Persistence requires a seller
    // owner — backend must switch to "Vis som sælger" to make edits.
    if (isAdmin) {
      console.warn("[budget] refusing to persist row in backend/global mode");
      toast.error("Backend er læsevisning – skift til 'Vis som sælger' for at redigere");
      return null;
    }
    const targetEmail: string | null = effectiveSellerEmail || myEmail || null;
    const known = targetEmail
      ? BUDGET_SELLERS.find(s => s.email.toLowerCase() === targetEmail.toLowerCase())
      : null;
    if (!known) {
      console.warn("[budget] refusing to save row without seller owner", { isAdmin, targetEmail, selectedSellerEmail });
      toast.error("Vælg en sælger først – budgetdata skal tilhøre en sælger");
      return null;
    }

    const product = productKeyOverride ? findProduct(productKeyOverride) : findProduct(line.product_key);
    try {
      const persisted = await createBudgetLine({
        year,
        product_key: line.product_key,
        product_name: line.product_name || product?.name || line.product_key,
        item_number: line.item_number ?? product?.varenr ?? null,
        category: line.category,
        parent_machine_key: line.parent_machine_key ?? null,
        seller_id: !isAdmin && sellerId ? sellerId : null,
        seller_name: known.full_name,
        seller_email: known.email,
        seller_initials: known.initials,
        country: known.country ?? line.country ?? null,
        qty_budget: 0,
        value_budget: 0,
        monthly_split: EVEN,
        notes: null,
      });
      setLines(prev => prev.some(l => l.id === persisted.id) ? prev : [...prev, persisted]);
      return persisted;
    } catch (error) {
      console.error("[budget] create line failed", error);
      toast.error("Budget blev ikke gemt i Supabase", { description: "Genindlæs siden og prøv igen." });
      return null;
    }
  }

  // ---- Working forecast handlers (draft-only; no save until "Afslut redigering") ----
  //
  // Bug fix: previously each stepper press auto-saved (upsertForecast wrote
  // an annual qty_forecast which was then redistributed across months on next
  // read) AND triggered the "Stor budgetændring" popup per cell. Spec says:
  //   • collect changes in a local draft
  //   • show ONE confirmation modal at "Afslut redigering"
  //   • save the exact draft values per (seller, model, month, year)
  // adjustWorking therefore only mutates the in-memory draft now.
  async function adjustWorking(line: BudgetLine, monthIdx: number, delta: number) {
    // Backend/global is read-only — only sellers (incl. backend in "Vis som sælger") may edit.
    if (isAdmin) return;
    if (editModeUntil == null) return;
    const persisted = await ensurePersistedLine(line);
    if (!persisted) return;
    const lineId = persisted.id;
    const split = (persisted.monthly_split && persisted.monthly_split.length === 12) ? persisted.monthly_split : EVEN;
    const fcExisting = forecasts.find(f => f.budget_line_id === lineId);
    const baselineMonthly = (fcExisting?.monthly_qty && fcExisting.monthly_qty.length === 12)
      ? fcExisting.monthly_qty.map(v => Number(v) || 0)
      : ((fcExisting && (fcExisting.qty_forecast ?? 0) > 0)
          ? splitToMonthly(fcExisting.qty_forecast, split)
          : Array(12).fill(0));
    const prevDraft = workingDraft[lineId] ?? baselineMonthly;
    const oldVal = prevDraft[monthIdx] ?? 0;
    const newVal = Math.max(0, oldVal + delta);
    if (newVal === oldVal) return;

    setWorkingDraft(prev => {
      const cur = prev[lineId] ?? prevDraft;
      const next = [...cur];
      next[monthIdx] = newVal;
      return { ...prev, [lineId]: next };
    });
    bumpEditActivity();
  }
  // void to silence unused warnings while the per-cell large-change popup is disabled.
  void isLargeBudgetChange;

  /** Compute the diff between current draft cells and their persisted
   *  baseline (fc.monthly_qty preferred, else split of qty_forecast/qty_budget).
   *  Returns one entry per CHANGED cell. */
  function computeDraftChanges(): BudgetChangedCell[] {
    const out: BudgetChangedCell[] = [];
    for (const [lineId, draft] of Object.entries(workingDraft)) {
      const persisted = lines.find(l => l.id === lineId);
      if (!persisted) continue;
      const fc = forecasts.find(f => f.budget_line_id === lineId);
      const split = (persisted.monthly_split && persisted.monthly_split.length === 12) ? persisted.monthly_split : EVEN;
      const baseline = (fc?.monthly_qty && fc.monthly_qty.length === 12)
        ? fc.monthly_qty.map(v => Number(v) || 0)
        : ((fc && (fc.qty_forecast ?? 0) > 0)
            ? splitToMonthly(fc.qty_forecast, split)
            : Array(12).fill(0));
      for (let i = 0; i < 12; i++) {
        const oldV = baseline[i] ?? 0;
        const newV = draft[i] ?? 0;
        if (oldV === newV) continue;
        out.push({
          line_id: lineId,
          seller: persisted.seller_initials || persisted.seller_name || "—",
          model: persisted.item_number || persisted.product_name,
          month: MONTHS_BY_LANG[lang][i] || `M${i + 1}`,
          month_idx: i,
          budget_type: "arbejdsbudget",
          old_value: oldV,
          new_value: newV,
        });
      }
    }
    out.sort((a, b) => a.seller.localeCompare(b.seller)
      || a.model.localeCompare(b.model)
      || a.month_idx - b.month_idx);
    return out;
  }

  /** Click handler for "Afslut redigering". Opens the single confirmation
   *  modal listing every changed cell. No changes → exit silently. */
  function endEditMode() {
    const changes = computeDraftChanges();
    if (changes.length === 0) {
      exitEditModeSilently();
      return;
    }
    setSaveConfirm(changes);
  }

  /** Persist all draft lines exactly as the user sees them. Each changed line
   *  is upserted ONCE with its full 12-month monthly_qty array, so unchanged
   *  months are preserved verbatim and no redistribution happens. */
  async function confirmSaveDrafts() {
    if (!saveConfirm) return;
    setSavingDraft(true);
    try {
      const byLine = new Map<string, BudgetChangedCell[]>();
      for (const c of saveConfirm) {
        const arr = byLine.get(c.line_id) || [];
        arr.push(c);
        byLine.set(c.line_id, arr);
      }
      const savedForecasts: BudgetForecast[] = [];
      for (const [lineId, cells] of byLine.entries()) {
        const persisted = lines.find(l => l.id === lineId);
        if (!persisted) continue;
        const draft = workingDraft[lineId];
        if (!draft) continue;
        const monthly = draft.slice(0, 12).map(v => Math.max(0, Math.round(Number(v) || 0)));
        while (monthly.length < 12) monthly.push(0);
        const qty = monthly.reduce((a, b) => a + b, 0);
        const fcExisting = forecasts.find(f => f.budget_line_id === lineId);
        const unit = persisted.qty_budget > 0
          ? persisted.value_budget / persisted.qty_budget
          : (findProduct(persisted.product_key)?.priceDKK || 0);
        const fcNext: BudgetForecast = {
          id: fcExisting?.id || ("f_" + lineId),
          budget_line_id: lineId,
          qty_forecast: qty,
          value_forecast: Math.round(qty * unit),
          monthly_qty: monthly,
          comments: fcExisting?.comments ?? null,
          expected_timing: fcExisting?.expected_timing ?? null,
          risk_level: fcExisting?.risk_level ?? null,
          probability: fcExisting?.probability ?? null,
          updated_at: new Date().toISOString(),
        };
        const saved = await upsertForecast(fcNext);
        savedForecasts.push({ ...saved, monthly_qty: monthly });
        for (const c of cells) {
          logBudgetAudit(persisted, c.month_idx, c.old_value, c.new_value, "arbejdsbudget");
        }
      }
      setForecasts(prevF => {
        const map = new Map(prevF.map(f => [f.budget_line_id, f]));
        for (const f of savedForecasts) map.set(f.budget_line_id, f);
        return Array.from(map.values());
      });
      const fresh = await listForecasts(year);
      for (const expected of savedForecasts) {
        const got = fresh.find(f => f.budget_line_id === expected.budget_line_id);
        const expMonthly = expected.monthly_qty || [];
        const gotMonthly = got?.monthly_qty || [];
        const matches = !!got
          && got.qty_forecast === expected.qty_forecast
          && expMonthly.length === 12
          && gotMonthly.length === 12
          && expMonthly.every((v, i) => Number(gotMonthly[i] || 0) === Number(v || 0));
        if (!matches) throw new Error("Arbejdsbudget readback mismatch");
      }
      setForecasts(fresh);
      setSaveConfirm(null);
      exitEditModeSilently();
      toast.success("Arbejdsbudget gemt");
    } catch (e) {
      console.error("[budget] save drafts failed", e);
      toast.error("Arbejdsbudget blev ikke gemt i Supabase", { description: "Dine tal er ikke synkroniseret. Prøv igen." });
    } finally {
      setSavingDraft(false);
    }
  }

  // ---- Gray BUDGET row editing ----
  // Phase 35 / Step 7 — single source of truth for manual edits is
  // crm_budget_lines. When a cell is currently driven by imported
  // crm_budget_dealer_lines rows, we still WRITE the new value to the manual
  // line and then collapse the matching non-excluded dealer rows to qty=0 so
  // the dealer-prefer merge falls back to manual. This way the published
  // portal always shows the persisted edited value after refresh, seller
  // switch, logout/login, or another browser.
  async function adjustBudget(line: BudgetLine, monthIdx: number, delta: number) {
    const sellerHasWindow =
      isSeller && !!activeWindowFor(effectiveSellerEmail || myEmail || null);
    if (isAdmin) return;
    if (!sellerHasWindow) return;
    if (isLineLocked(line)) return;

    const productKey = line.product_key || "";
    const scopeEmail = (effectiveSellerEmail || myEmail || "").toLowerCase();
    const scopeEmails = scopeEmail ? new Set([scopeEmail]) : null;
    const dealerSumForCell = productKey
      ? aggregateDealerBudgetMonthly(dealerLines, productKey, scopeEmails)[monthIdx] || 0
      : 0;
    const hasDealerForCell = productKey
      ? hasDealerBudgetByMonth(dealerLines, productKey, scopeEmails)[monthIdx]
      : false;

    const persisted = await ensurePersistedLine(line);
    if (!persisted) return;
    const split = (persisted.monthly_split && persisted.monthly_split.length === 12) ? persisted.monthly_split : EVEN;
    const monthlyQty = splitToMonthly(persisted.qty_budget, split);
    const manualVal = monthlyQty[monthIdx] ?? 0;
    // Displayed value uses the same dealer-prefer merge as render.
    const displayedVal = hasDealerForCell ? dealerSumForCell : manualVal;
    const newDisplayed = Math.max(0, displayedVal + delta);
    if (newDisplayed === displayedVal) return;
    const monthLabel = MONTHS_BY_LANG[lang][monthIdx] || `M${monthIdx + 1}`;

    const run = () => commitBudget(persisted, monthIdx, displayedVal, newDisplayed, {
      manualVal,
      collapseDealer: hasDealerForCell,
      productKey,
      scopeEmails,
    });

    if (isLargeBudgetChange(displayedVal, newDisplayed)) {
      setLargeChange({
        ctx: {
          oldValue: displayedVal, newValue: newDisplayed,
          seller: persisted.seller_initials || persisted.seller_name || "—",
          model: persisted.item_number || persisted.product_name,
          month: monthLabel,
          budget_type: "budget",
        },
        run,
      });
      return;
    }
    await run();
  }


  async function commitBudget(
    persisted: BudgetLine, monthIdx: number, oldVal: number, newVal: number,
    opts?: {
      /** The actual manual_qty stored in crm_budget_lines for this month —
       *  used as the write target so manual takes over after dealer collapse. */
      manualVal?: number;
      /** When true, after a successful manual save zero out matching dealer
       *  rows so the merge falls back to manual. */
      collapseDealer?: boolean;
      productKey?: string;
      scopeEmails?: Set<string> | null;
    },
  ) {
    const split = (persisted.monthly_split && persisted.monthly_split.length === 12) ? persisted.monthly_split : EVEN;
    const monthlyQty = splitToMonthly(persisted.qty_budget, split);
    monthlyQty[monthIdx] = newVal;
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
    try {
      const saved = await upsertBudgetLine(updated);
      const fresh = await listBudgetLines({ year });
      const readback = fresh.find(l => l.id === saved.id);
      if (!readback || readback.qty_budget !== saved.qty_budget) throw new Error("Budget readback mismatch");
      setLines(fresh);

      // Phase 35 / Step 7 — collapse imported dealer-line rows for this cell
      // so that the dealer-prefer merge falls back to the manual value just
      // saved. Without this, the visible value would still be driven by the
      // sum of dealer rows and the user's edit would appear to "disappear"
      // after refresh.
      if (opts?.collapseDealer && opts.productKey) {
        try {
          const collapsed = await collapseDealerLinesForCell(
            dealerLines, year, monthIdx, opts.productKey, opts.scopeEmails ?? null,
            { email: appUser?.email || null },
          );
          if (collapsed.length > 0) {
            const freshDealer = await listBudgetDealerLines(year);
            const stillNonZero = freshDealer.some(r =>
              collapsed.includes(r.id) && r.qty !== 0,
            );
            if (stillNonZero) throw new Error("Dealer collapse readback mismatch");
            setDealerLines(freshDealer);
            console.log("[budget.dealer.collapse]", {
              seller: persisted.seller_initials || persisted.seller_email,
              year, month: monthIdx + 1,
              product_key: opts.productKey,
              collapsed_row_ids: collapsed,
              new_manual_value: newVal,
            });
          }
        } catch (collapseError) {
          console.error("[budget] dealer collapse failed", collapseError);
          toast.error("Budgetværdien blev gemt, men importerede forhandler-linjer kunne ikke nulstilles. Tallet kan virke forkert ved næste opdatering.", { duration: 8000 });
          // Manual value is saved; surface the partial-failure to the user.
          // Do NOT show a generic success toast.
          logBudgetAudit(saved, monthIdx, oldVal, newVal, "budget");
          return;
        }
      }

      logBudgetAudit(saved, monthIdx, oldVal, newVal, "budget");
      toast.success("Budget gemt");
    } catch (error) {
      console.error("[budget] save budget failed", error);
      toast.error("Budget blev ikke gemt i Supabase", { description: "Dine tal er ikke synkroniseret. Prøv igen." });
    }
  }

  function logBudgetAudit(
    persisted: BudgetLine, monthIdx: number, oldVal: number, newVal: number,
    budget_type: BudgetType,
  ) {
    appendBudgetAuditEntry({
      year,
      seller_initials: persisted.seller_initials || (isAdmin ? null : (myInitialsFromName || null)),
      seller_name: persisted.seller_name || appUser?.display_name || null,
      seller_email: persisted.seller_email || null,
      product_key: persisted.product_key,
      product_name: persisted.product_name,
      item_number: persisted.item_number,
      month_idx: monthIdx,
      month: MONTHS_BY_LANG[lang][monthIdx] || `M${monthIdx + 1}`,
      budget_type,
      old_value: oldVal,
      new_value: newVal,
      actor_email: appUser?.email || null,
      actor_name: appUser?.display_name || null,
      actor_role: portalRole || null,
      active_mode: isAdmin ? "backend" : (activeSellerForFilter ? `seller:${activeSellerForFilter.initials}` : "seller"),
    });
    setAuditRefreshKey(k => k + 1);
  }


  // (Working forecast is auto-saved on each stepper press in adjustWorking.)

  // Per-row lock/delete actions removed — central Budgetstatus / Åbningsvindue
  // controls are now the single source of truth. (deleteBudgetLine + setLineLock
  // service helpers remain available for future admin tooling.)
  void deleteBudgetLine; void setLineLock;

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
          {(() => {
            // Scope label: "Samlet budget – alle sælgere" vs "Budget for XX"
            const scopeInitials = selectedSellerEmail
              ? (BUDGET_SELLERS.find(s => s.email.toLowerCase() === selectedSellerEmail)?.initials
                  || selectedSellerEmail.split("@")[0].toUpperCase())
              : (!isAdmin
                  ? (BUDGET_SELLERS.find(s => s.email.toLowerCase() === sellerCtxEmail)?.initials
                      || (sellerCtxInitials ? sellerCtxInitials.toUpperCase() : null))
                  : null);
            const scopeLabel = scopeInitials
              ? `Budget for ${scopeInitials}`
              : "Samlet budget – alle sælgere";
            // Orphan rows = lines without a recognised seller_email matching a known seller.
            const knownEmails = new Set(BUDGET_SELLERS.map(s => s.email.toLowerCase()));
            const isBackendAll = isAdmin && !selectedSellerEmail;
            const orphanCount = isBackendAll
              ? lines.filter(l => {
                  const e = (l.seller_email || "").toLowerCase();
                  return !e || !knownEmails.has(e);
                }).length
              : 0;
            // Backend "Alle sælgere" total must equal sum of the 5 known sellers.
            let mismatch = false;
            if (isBackendAll) {
              const totalAll = lines.reduce((s, l) => s + (l.qty_budget || 0), 0);
              const totalKnown = lines
                .filter(l => knownEmails.has((l.seller_email || "").toLowerCase()))
                .reduce((s, l) => s + (l.qty_budget || 0), 0);
              mismatch = totalAll !== totalKnown;
            }
            return (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mt-1">{scopeLabel}</p>
                <p className="text-sm text-slate-500 mt-1">{isAdmin ? T.subtitle_admin[lang] : T.subtitle_seller[lang]}</p>
                {orphanCount > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Budgetdata uden sælger fundet ({orphanCount} {orphanCount === 1 ? "linje" : "linjer"})
                  </p>
                )}
                {mismatch && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Budget mismatch detected
                  </p>
                )}
              </>
            );
          })()}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            title="Export current view as CSV"
          >
            <Download className="h-4 w-4 text-slate-500" />
            Export CSV
          </button>
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
          {/* Backend/Admin only: keep the "Budgetstatus" pill. Sellers (incl.
              view-as seller) rely solely on the status banner above. */}
          {isAdmin && (() => {
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
          {/* "Nyt varenr." removed in backend/global view — would create
              seller-affecting budget rows. Edits live in seller-view only. */}
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
                    <th key={m} className={`px-2 py-2.5 font-medium text-center w-14 ${i === currentMonthIdx ? 'relative' : ''}`}>
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
                    const {
                      primaryLine,
                      linesForAgg,
                      ordersMonthly,
                      blockProductKey,
                      budgetMonthly,
                      leadWorkingByMonth,
                      workingMonthly,
                    } = renderedMonthlyForBlock({ keyPrefix, rowLines, fallbackProductKey });
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
                    // Backend/global view is fully read-only — sellers (incl.
                    // backend in "Vis som sælger") are the only ones who can edit.
                    const canEditBudget  = sellerWindowEdit && !blockLocked;
                    // Arbejdsbudget editing:
                    //  • Backend/global: read-only.
                    //  • Seller: allowed when their personal edit-mode is active
                    //    (10-min inactivity auto-lock). NOT gated by Fastlagt lock.
                    const canEditWorking = isSeller && editModeUntil != null;
                    void adminAllSellers;

                    const pipelineMonthly: PipelineOffer[][] = Array.from({ length: 12 }, () => []);
                    linesForAgg.forEach(l => {
                      const p = pipelineByLine[l.id] || [];
                      p.forEach((arr, i) => { pipelineMonthly[i].push(...arr); });
                    });
                    // Open configurator quotes (CRM → Tilbud source) per month for this product.
                    const quoteCellsByMonth = scopedQuotePipeline[blockProductKey]
                      ?? Array.from({ length: 12 }, () => ({ quotes: [] as ScopedConfiguration[], qty: 0, value: 0 }));
                    const totalBudget = budgetMonthly.reduce((a, b) => a + b, 0);
                    const totalOrders = ordersMonthly.reduce((a, b) => a + b, 0);
                    const totalWorking = workingMonthly.reduce((a, b) => a + b, 0);
                    const totalPipeline = quoteCellsByMonth.reduce((s, c) => s + c.qty, 0);
                    const totalPipelineValue = quoteCellsByMonth.reduce((s, c) => s + c.value, 0);

                    const totalPerf = totalOrders - totalBudget;
                    const scorePct = totalBudget > 0 ? Math.round((totalOrders / totalBudget) * 100) : 0;
                    const scoreTone =
                      scorePct >= 100 ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                      scorePct >= 70  ? "bg-amber-100 text-amber-800 border-amber-200" :
                      totalBudget === 0 ? "bg-slate-100 text-slate-500 border-slate-200" :
                                        "bg-rose-100 text-rose-800 border-rose-200";
                    const stickyPad = indent ? "pl-8" : "px-3";
                    const cellKeyFor = (i: number, type: BudgetType) => budgetCellKey({
                      year,
                      seller_initials: primaryLine.seller_initials || (auditSellerContext ? auditSellerContext.toUpperCase() : null),
                      product_code: primaryLine.item_number || primaryLine.product_key,
                      month_idx: i,
                      budget_type: type,
                    });
                    return (
                      <Fragment key={`block-${keyPrefix}`}>
                        {/* BUDGET / ORDERS — gray Budget cell becomes editable for backend when unlocked */}
                        <tr key={`bo-${keyPrefix}`} className="bg-slate-50/60">
                          <td className={cn("sticky left-0 z-10 bg-slate-50/60 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600", stickyPad)}>{T.row_budget_orders[lang]}</td>
                          {budgetMonthly.map((b, i) => {
                            const o = ordersMonthly[i];
                            const ck = cellKeyFor(i, "budget");
                            const latest = latestAuditByCell[ck];
                            const monthLabel = MONTHS_BY_LANG[lang][i] || `M${i + 1}`;
                            const budgetRows = sellerBreakdownFor(linesForAgg, i, "budget");
                            const ordersRows = sellerBreakdownFor(linesForAgg, i, "orders");
                            const tipTitle = `${monthLabel} · ${productName}`;
                            // Reference distribution context. `delta_total`
                            // is the CELL's current total (b), so modalens
                            // "Fordelt: X / N" matches det antal stk. cellen
                            // faktisk viser — ikke kun seneste budgetændring.
                            const latestNew = (latest?.new_value as Record<string, unknown> | null) || null;
                            const latestOld = (latest?.old_value as Record<string, unknown> | null) || null;
                            const refOld = latestOld && typeof latestOld.value === "number" ? (latestOld.value as number) : b;
                            const refNew = latestNew && typeof latestNew.value === "number" ? (latestNew.value as number) : b;
                            const refCtx: BudgetReferenceContext = {
                              cell_key: ck, budget_year: year,
                              seller_initials: primaryLine.seller_initials,
                              seller_email: primaryLine.seller_email,
                              product_code: primaryLine.item_number || primaryLine.product_key,
                              model_name: productName,
                              category: primaryLine.category,
                              month: monthLabel, month_idx: i,
                              budget_type: "budget",
                              old_value: refOld, new_value: refNew,
                              actor_email: appUser?.email || null,
                              actor_name: appUser?.display_name || null,
                              change_id: latest?.id || null,
                              delta_total: b,
                            };
                            return (
                              <td key={i} className="px-1 py-1.5 text-center tabular-nums text-xs">
                                 {canEditBudget ? (
                                    <div className="inline-flex items-center gap-x-0.5 bg-white border border-slate-200 rounded px-0.5 h-5 leading-none align-middle hover:border-slate-400 transition min-w-[88px] justify-center">
                                      <button
                                        onClick={() => adjustBudget(primaryLine, i, -1)}
                                        className="h-3.5 w-3.5 shrink-0 flex items-center justify-center hover:bg-slate-100 rounded text-slate-600"
                                        title="−1"
                                      ><Minus className="h-2.5 w-2.5" /></button>
                                     <BudgetCellInsight
                                       title={`Budget · ${tipTitle}`}
                                       total={b}
                                       rows={budgetRows}
                                       references={refsByCell[ck]}
                                     >
                                       <span className="min-w-[14px] text-center font-semibold text-slate-700 inline-block tabular-nums">{b}</span>
                                     </BudgetCellInsight>
                                      <button
                                        onClick={() => adjustBudget(primaryLine, i, +1)}
                                        className="h-3.5 w-3.5 shrink-0 flex items-center justify-center hover:bg-slate-100 rounded text-slate-600"
                                        title="+1"
                                      ><Plus className="h-2.5 w-2.5" /></button>
                                      <span className="text-slate-400 px-0.5">/</span>
                                      <BudgetCellInsight
                                        title={`Ordrer · ${tipTitle}`}
                                        total={o}
                                        rows={ordersRows}
                                        dealers={ordersDealersFor(linesForAgg, i)}
                                      >
                                        <span className={cn("min-w-[12px] text-center font-semibold inline-block tabular-nums", o > 0 ? "text-emerald-600" : "text-emerald-600/40")}>{o}</span>
                                      </BudgetCellInsight>
                                      <button
                                        type="button"
                                        onClick={() => setRefModal(refCtx)}
                                        className="h-3.5 w-3.5 shrink-0 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                                        title="Tilføj reference (forhandler / lead / demo)"
                                      ><Link2 className="h-2.5 w-2.5" /></button>
                                      {latest && <BudgetAuditCellPopover cellKey={ck} latest={latest} />}
                                   </div>
                                ) : (
                                  <>
                                    <BudgetCellInsight title={`Budget · ${tipTitle}`} total={b} rows={budgetRows} references={refsByCell[ck]}>
                                      <span className="text-slate-500">{b}</span>
                                    </BudgetCellInsight>
                                    <span className="text-slate-400 mx-0.5">/</span>
                                    <BudgetCellInsight title={`Ordrer · ${tipTitle}`} total={o} rows={ordersRows} dealers={ordersDealersFor(linesForAgg, i)}>
                                      <span className={cn("font-semibold", o > 0 ? "text-emerald-600" : "text-emerald-600/40")}>{o}</span>
                                    </BudgetCellInsight>
                                  </>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-center tabular-nums text-xs font-semibold">
                            <BudgetCellInsight
                              title={`Budget total · ${productName}`}
                              total={totalBudget}
                              rows={sellerBreakdownFor(linesForAgg, null, "budget")}
                            >
                              <span className="text-slate-600">{totalBudget}</span>
                            </BudgetCellInsight>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <BudgetCellInsight
                              title={`Ordrer total · ${productName}`}
                              total={totalOrders}
                              rows={sellerBreakdownFor(linesForAgg, null, "orders")}
                              dealers={ordersDealersFor(linesForAgg, null)}
                            >
                              <span className="text-emerald-700">{totalOrders}</span>
                            </BudgetCellInsight>
                          </td>
                          <td className="px-2 py-2"></td>
                        </tr>

                        {/* PIPELINE — open configurator quotes (CRM → Tilbud source) */}
                        <tr key={`pipe-${keyPrefix}`} className="bg-amber-50/40">
                          <td className={cn("sticky left-0 z-10 bg-amber-50/40 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800", stickyPad)}>{T.row_pipeline[lang]}</td>
                          {quoteCellsByMonth.map((cell, i) => {
                            const monthLabel = MONTHS_BY_LANG[lang][i] || `M${i + 1}`;
                            if (cell.qty === 0) {
                              return <td key={i} className="px-2 py-2 text-center text-amber-700/40 text-xs">−</td>;
                            }
                            return (
                              <td key={i} className="px-1 py-2 text-center">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded bg-amber-100 text-amber-900 text-xs font-semibold border border-amber-200 hover:bg-amber-200 transition">
                                      {cell.qty}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-sm">
                                    <div className="text-xs space-y-2">
                                      <div className="font-semibold border-b border-slate-200 pb-1">
                                        {cell.quotes.length} {T.tip_quotes[lang]} · {monthLabel} · {productName}
                                        <span className="ml-2 tabular-nums">{fmtDKK(cell.value)}</span>
                                      </div>
                                      {cell.quotes.map((q) => (
                                        <div key={q.id} className="space-y-0.5 pb-1.5 border-b border-slate-100 last:border-0">
                                          <div className="font-medium">
                                            <a href={`/portal/crm/quotes`} className="text-sky-700 hover:underline">
                                              {q.quote_number || q.title || q.id.slice(0, 8)}
                                            </a>
                                            {q.case_status ? <span className="ml-1 text-slate-500">· {q.case_status}</span> : null}
                                          </div>
                                          <div className="text-slate-600">{q.dealer_company_name || q.dealer_name || "—"}</div>
                                          <div className="text-slate-600">{T.tip_machine[lang]}: {productName} · {q.machine_qty_by_key[blockProductKey] || 1} stk.</div>
                                          <div className="flex justify-between">
                                            <span className="text-slate-500">{q.seller_initials || q.seller_email || "—"}</span>
                                            <span className="font-semibold tabular-nums">{fmtDKK(q.total_value)}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-center text-xs font-semibold text-amber-800 tabular-nums" title={fmtDKK(totalPipelineValue)}>{totalPipeline}</td>
                          <td className="px-2 py-2"></td>
                        </tr>


                        {/* WORKING — editable when this seller/year is unlocked */}
                        <tr key={`work-${keyPrefix}`} className="bg-slate-900 text-slate-100">
                          <td className={cn("sticky left-0 z-10 bg-slate-900 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200", stickyPad)}>{T.row_working[lang]}</td>
                          {workingMonthly.map((w, i) => {
                            const ck = cellKeyFor(i, "arbejdsbudget");
                            const latest = latestAuditByCell[ck];
                            const monthLabel = MONTHS_BY_LANG[lang][i] || `M${i + 1}`;
                            const workRows = sellerBreakdownFor(linesForAgg, i, "working");
                            const latestNewW = (latest?.new_value as Record<string, unknown> | null) || null;
                            const latestOldW = (latest?.old_value as Record<string, unknown> | null) || null;
                            const refOldW = latestOldW && typeof latestOldW.value === "number" ? (latestOldW.value as number) : w;
                            const refNewW = latestNewW && typeof latestNewW.value === "number" ? (latestNewW.value as number) : w;
                            const refCtx: BudgetReferenceContext = {
                              cell_key: ck, budget_year: year,
                              seller_initials: primaryLine.seller_initials,
                              seller_email: primaryLine.seller_email,
                              product_code: primaryLine.item_number || primaryLine.product_key,
                              model_name: productName,
                              category: primaryLine.category,
                              month: monthLabel, month_idx: i,
                              budget_type: "arbejdsbudget",
                              old_value: refOldW, new_value: refNewW,
                              actor_email: appUser?.email || null,
                              actor_name: appUser?.display_name || null,
                              change_id: latest?.id || null,
                              delta_total: w,
                            };
                            const cellLeads = leadWorkingByMonth[i];
                            return (
                              <td key={i} className="px-1 py-1.5 text-center tabular-nums text-xs">
                                {cellLeads.length > 0 && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-block ml-0.5 mr-1 align-middle text-[9px] font-bold px-1 rounded bg-amber-400/30 text-amber-200 border border-amber-300/40 cursor-help">
                                        +{cellLeads.reduce((s, c) => s + c.qty, 0)}L
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-sm">
                                      <div className="text-xs space-y-2">
                                        <div className="font-semibold border-b border-slate-200 pb-1">
                                          Leads i Arbejdsbudget · {monthLabel} · {productName}
                                        </div>
                                        {cellLeads.map(c => (
                                          <div key={c.lead_id} className="space-y-0.5 pb-1.5 border-b border-slate-100 last:border-0">
                                            <div className="font-medium">
                                              <a
                                                href={`/portal/crm/leads/${c.lead_id}`}
                                                className="font-mono text-[11px] text-sky-600 hover:underline mr-1.5"
                                              >{formatLeadNo(c.lead_no)}</a>
                                              {c.title}
                                            </div>
                                            <div className="text-slate-600">{c.machine_label} · {c.qty} stk.</div>
                                            {c.dealer && <div className="text-slate-600">Forhandler: {c.dealer}</div>}
                                            {c.customer && <div className="text-slate-600">Kunde: {c.customer}</div>}
                                            {c.owner_name && <div className="text-slate-500">Sælger: {c.owner_name}</div>}
                                            {c.expected_close_date && <div className="text-slate-500">Forventet luk: {c.expected_close_date}</div>}
                                          </div>
                                        ))}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {canEditWorking ? (
                                    <div className="inline-flex items-center gap-x-0.5 bg-slate-800 rounded px-0.5 h-5 leading-none align-middle min-w-[88px] justify-center">
                                      <button
                                        onClick={() => adjustWorking(primaryLine, i, -1)}
                                        className="h-3.5 w-3.5 shrink-0 flex items-center justify-center hover:bg-slate-700 rounded"
                                        title="−1"
                                      ><Minus className="h-2.5 w-2.5" /></button>
                                      <BudgetCellInsight
                                        title={`Arbejdsbudget · ${monthLabel} · ${productName}`}
                                        total={w}
                                        rows={workRows}
                                        references={refsByCell[ck]}
                                      >
                                        <span className="min-w-[14px] text-center font-semibold inline-block tabular-nums">{w}</span>
                                      </BudgetCellInsight>
                                      <button
                                        onClick={() => adjustWorking(primaryLine, i, +1)}
                                        className="h-3.5 w-3.5 shrink-0 flex items-center justify-center hover:bg-slate-700 rounded"
                                        title="+1"
                                      ><Plus className="h-2.5 w-2.5" /></button>
                                      <button
                                        type="button"
                                        onClick={() => setRefModal(refCtx)}
                                        className="h-3.5 w-3.5 shrink-0 flex items-center justify-center rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                                        title="Tilføj reference (forhandler / lead / demo)"
                                      ><Link2 className="h-2.5 w-2.5" /></button>
                                      {latest && <BudgetAuditCellPopover cellKey={ck} latest={latest} />}
                                    </div>
                                ) : (
                                  <BudgetCellInsight
                                    title={`Arbejdsbudget · ${monthLabel} · ${productName}`}
                                    total={w}
                                    rows={workRows}
                                    references={refsByCell[ck]}
                                  >
                                    <span className="font-semibold">{w}</span>
                                  </BudgetCellInsight>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-center tabular-nums text-xs font-semibold">
                            <BudgetCellInsight
                              title={`Arbejdsbudget total · ${productName}`}
                              total={totalWorking}
                              rows={sellerBreakdownFor(linesForAgg, null, "working")}
                            >
                              <span>{totalWorking}</span>
                            </BudgetCellInsight>
                          </td>
                          <td className="px-2 py-2"></td>
                        </tr>

                        {/* PERFORMANCE — Orders − Official Budget. Tooltip shows
                            secondary Orders+Pipeline vs Budget context. */}
                        <tr key={`perf-${keyPrefix}`} className="border-b-2 border-slate-200">
                          <td className={cn("sticky left-0 z-10 bg-white py-2 text-xs font-semibold uppercase tracking-wide text-slate-500", stickyPad)}>{T.row_perf[lang]}</td>
                          {ordersMonthly.map((o, i) => {
                            const b = budgetMonthly[i];
                            const diff = o - b;
                            const pipeCount = quoteCellsByMonth[i]?.qty ?? 0;
                            const combined = o + pipeCount;
                            let cls = "text-slate-400";
                            let label: string = "•";
                            if (diff > 0) { cls = "text-emerald-600 font-semibold"; label = `+${diff}`; }
                            else if (diff < 0) { cls = "text-rose-600 font-semibold"; label = `${diff}`; }
                            const bRows = sellerBreakdownFor(linesForAgg, i, "budget");
                            const oRows = sellerBreakdownFor(linesForAgg, i, "orders");
                            const bMap = new Map(bRows.map(r => [r.initials, r.value]));
                            const oMap = new Map(oRows.map(r => [r.initials, r.value]));
                            const allInits = Array.from(new Set([...bMap.keys(), ...oMap.keys()]));
                            const perfRows = allInits.map(init => ({ initials: init, value: (oMap.get(init) || 0) - (bMap.get(init) || 0) }));
                            const missing = bRows.filter(r => r.value === 0 && (oMap.get(r.initials) || 0) === 0).map(r => r.initials);
                            return (
                              <td key={i} className={cn("px-2 py-2 text-center tabular-nums text-xs", cls)}>
                                <BudgetCellInsight
                                  title={`Performance · ${MONTHS_BY_LANG[lang][i]} · ${productName}`}
                                  total={diff}
                                  rows={perfRows}
                                  variant="performance"
                                  missingBudget={missing}
                                  extra={<div className="text-[11px] text-slate-300">Orders + Pipeline vs Budget: <span className="tabular-nums">{combined} / {b}</span></div>}
                                >
                                  {label}
                                </BudgetCellInsight>
                              </td>
                            );
                          })}
                          <td className={cn("px-2 py-2 text-center tabular-nums text-xs font-bold",
                            totalPerf > 0 ? "text-emerald-700" : totalPerf < 0 ? "text-rose-700" : "text-slate-500")}>
                            {(() => {
                              const bRowsT = sellerBreakdownFor(linesForAgg, null, "budget");
                              const oRowsT = sellerBreakdownFor(linesForAgg, null, "orders");
                              const bMapT = new Map(bRowsT.map(r => [r.initials, r.value]));
                              const oMapT = new Map(oRowsT.map(r => [r.initials, r.value]));
                              const allI = Array.from(new Set([...bMapT.keys(), ...oMapT.keys()]));
                              const perfRowsT = allI.map(init => ({ initials: init, value: (oMapT.get(init) || 0) - (bMapT.get(init) || 0) }));
                              const missingT = bRowsT.filter(r => r.value === 0).map(r => r.initials);
                              return (
                                <BudgetCellInsight
                                  title={`Performance total · ${productName}`}
                                  total={totalPerf}
                                  rows={perfRowsT}
                                  variant="performance"
                                  missingBudget={missingT}
                                >
                                  <span>{totalPerf > 0 ? `+${totalPerf}` : totalPerf}</span>
                                </BudgetCellInsight>
                              );
                            })()}
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
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                      {group.lines.map(l => (
                                        <span key={l.id}>{l.seller_initials || l.seller_name || "—"}</span>
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

      {/* Latest budget changes (audit) */}
      {allowed && (
        <LatestBudgetChangesPanel
          year={year}
          sellerContext={auditSellerContext}
          refreshKey={auditRefreshKey}
        />
      )}

      {/* Large change confirmation */}
      <BudgetLargeChangeDialog
        open={largeChange != null}
        ctx={largeChange?.ctx ?? null}
        onCancel={() => setLargeChange(null)}
        onConfirm={async () => {
          const job = largeChange;
          setLargeChange(null);
          if (job) await job.run();
        }}
      />

      {/* "Afslut redigering" — single confirmation listing every changed cell. */}
      <BudgetSaveConfirmDialog
        open={saveConfirm != null}
        changes={saveConfirm ?? []}
        busy={savingDraft}
        onCancel={() => {
          // Stay in edit mode with unsaved drafts intact.
          setSaveConfirm(null);
          bumpEditActivity();
        }}
        onConfirm={confirmSaveDrafts}
      />

      <BudgetReferenceModal
        open={refModal != null}
        ctx={refModal}
        onClose={() => setRefModal(null)}
        onSaved={() => setAuditRefreshKey((k) => k + 1)}
        isAdmin={isAdmin}
        currentSellerInitials={sellerCtxInitials ? sellerCtxInitials.toUpperCase() : null}
        currentSellerEmail={sellerCtxEmail || null}
      />


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
