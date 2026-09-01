import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { derivePortalRole } from '@/lib/portalAccess';
import { canUseImplicitExternalCrmDealerScope, isCrmAdmin, isExternalCrmRole } from '@/lib/crmScope';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { buildJournalScope } from '@/lib/machineJournalScope';
import { getActiveSellerView, getEffectiveSellerEmail } from '@/lib/activeMode';
import { resolveEffectiveCrmSellerScope } from '@/lib/resolveSellerId';
import { resolveSellerDisplay, useSellerDirectory, type SellerDirectory } from '@/lib/sellerDirectory';
import {
  listLeadsPage, updateLead, getLead, deleteLead, deleteDemoLead,
  CrmLead, type CrmLeadAttachment, type CrmLeadAttachmentPreview, type CrmLeadsPageQueryResult,
  formatLeadNo, formatDemoNo,
  LOST_COMPETITOR_OPTIONS, LOST_REASON_OPTIONS,
  getLeadAttachmentSignedUrls, getLeadImageAttachments,
} from '@/lib/crmLeadsService';
import {
  effectiveLeadStatus,
  effectiveLeadProbability,
  type LeadDisplayStatus,
  NEXT_ACTIVITY_WON,
  NEXT_ACTIVITY_LOST,
  deriveLegacyPipelineStage,
} from '@/lib/leadStatus';
import { classifyLeadFollowupUrgency } from '@/lib/leadFollowupUrgency';
import { ArrowDownAZ, Plus, Search, Sparkles, TrendingUp, XCircle, CheckCircle2, AlertTriangle, Trash2, FileText, Image as ImageIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchDealerAccounts } from '@/lib/dealerAccountsService';
import { listSharedLeadIdsForUser } from '@/lib/crmLeadSharingService';
import { matchesLeadSearch } from '@/lib/crmLeadSearch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

// ---- i18n. English fallback. ----
type TKey =
  | 'page_title' | 'sub_admin' | 'sub_seller' | 'pcs'
  | 'unassigned' | 'new_demo' | 'new_lead'
  | 'tab_all' | 'tab_open' | 'tab_demo' | 'tab_mine' | 'tab_mine_demo'
  | 'tab_won' | 'tab_lost'
  | 'search_ph' | 'all_status' | 'loading' | 'empty_title' | 'empty_sub'
  | 'all_types' | 'all_machines' | 'all_equipment'
  | 'filter_type' | 'filter_machine' | 'filter_equipment'
  | 'col_type' | 'col_title' | 'col_dealer' | 'col_owner' | 'col_machine'
  | 'col_date' | 'col_followup' | 'col_status' | 'col_action'
  | 'open_lbl' | 'demo_lbl' | 'unassigned_chip'
  | 'incomplete_chip' | 'shared_chip'
  | 'type_won' | 'type_lost'
  | 'close_btn' | 'close_title' | 'close_sub' | 'won_label' | 'lost_label'
  | 'lost_analysis_title' | 'lost_to' | 'lost_other' | 'lost_reason' | 'lost_comment'
  | 'save' | 'cancel' | 'pick' | 'closed_ok' | 'close_err' | 'verify_err'
  | 'convert_to_demo' | 'convert_to_quote' | 'convert_label' | 'to_demo_label' | 'to_quote_label' | 'go_to_quote'
  | 'urgency_overdue' | 'urgency_soon' | 'urgency_later'
  | 'sort_default' | 'sort_title_asc' | 'sort_title_desc'
  | 'sort_date_desc' | 'sort_date_asc' | 'sort_prob_desc' | 'sort_prob_asc'
  | 'page_prev' | 'page_next' | 'page_range'
  | 'st_Lead' | 'st_Demo' | 'st_Tilbud' | 'st_Followup' | 'st_Vundet' | 'st_Tabt';

type UiText = Record<Language, string> & Partial<Record<Exclude<PortalUiLanguage, Language>, string>>;

const T: Record<TKey, UiText> = {
  page_title:    { da: 'Leads', en: 'Leads', de: 'Leads', it: 'Lead', hu: 'Leadek', fr: 'Leads', pl: 'Leady', cs: 'Leady' },
  sub_admin:     { da: 'Alle leads og demoer i organisationen', en: 'All leads and demos in the organisation', de: 'Alle Leads und Demos in der Organisation', it: 'Tutti i lead e demo dell\'organizzazione', hu: 'Az összes lead és demo a szervezetben', fr: 'Tous les leads et démos de l’organisation', pl: 'Wszystkie leady i dema w organizacji', cs: 'Všechny leady a dema v organizaci' },
  sub_seller:    { da: 'Dine tildelte leads og demoer', en: 'Your assigned leads and demos', de: 'Deine zugewiesenen Leads und Demos', it: 'I tuoi lead e demo assegnati', hu: 'A neked rendelt leadek és demók', fr: 'Vos leads et démos assignés', pl: 'Twoje przypisane leady i dema', cs: 'Vaše přiřazené leady a dema' },
  pcs:           { da: 'stk', en: 'pcs', de: 'Stk', it: 'pz', hu: 'db', fr: 'pcs', pl: 'szt.', cs: 'ks' },
  unassigned:    { da: 'utildelt', en: 'unassigned', de: 'nicht zugewiesen', it: 'non assegnati', hu: 'kiosztatlan', fr: 'non assignés', pl: 'nieprzypisane', cs: 'nepřiřazeno' },
  new_demo:      { da: 'Ny demo-registrering', en: 'New demo registration', de: 'Neue Demo-Registrierung', it: 'Nuova registrazione demo', hu: 'Új demo regisztráció', fr: 'Nouvel enregistrement démo', pl: 'Nowa rejestracja demo', cs: 'Nová registrace dema' },
  new_lead:      { da: 'Nyt lead', en: 'New lead', de: 'Neuer Lead', it: 'Nuovo lead', hu: 'Új lead', fr: 'Nouveau lead', pl: 'Nowy lead', cs: 'Nový lead' },
  tab_all:       { da: 'Alle leads', en: 'All leads', de: 'Alle Leads', it: 'Tutti i lead', hu: 'Összes lead', fr: 'Tous les leads', pl: 'Wszystkie leady', cs: 'Všechny leady' },
  tab_open:      { da: 'Åbne leads', en: 'Open leads', de: 'Offene Leads', it: 'Lead aperti', hu: 'Nyitott leadek', fr: 'Leads ouverts', pl: 'Otwarte leady', cs: 'Otevřené leady' },
  tab_demo:      { da: 'Demo leads', en: 'Demo leads', de: 'Demo-Leads', it: 'Demo lead', hu: 'Demo leadek', fr: 'Leads démo', pl: 'Leady demo', cs: 'Demo leady' },
  tab_mine:      { da: 'Mine leads', en: 'My leads', de: 'Meine Leads', it: 'I miei lead', hu: 'Saját leadek', fr: 'Mes leads', pl: 'Moje leady', cs: 'Moje leady' },
  tab_mine_demo: { da: 'Mine demoer', en: 'My demos', de: 'Meine Demos', it: 'Le mie demo', hu: 'Saját demók', fr: 'Mes démos', pl: 'Moje dema', cs: 'Moje dema' },
  tab_won:       { da: 'Vundet leads', en: 'Won leads', de: 'Gewonnene Leads', it: 'Lead vinti', hu: 'Nyertes leadek', fr: 'Leads gagnés', pl: 'Wygrane leady', cs: 'Vyhrané leady' },
  tab_lost:      { da: 'Tabte leads', en: 'Lost leads', de: 'Verlorene Leads', it: 'Lead persi', hu: 'Elveszett leadek', fr: 'Leads perdus', pl: 'Utracone leady', cs: 'Ztracené leady' },
  search_ph:     { da: 'Søg titel, kunde, forhandler, sælger eller maskine…', en: 'Search title, customer, dealer, seller or machine…', de: 'Titel, Kunde, Händler, Verkäufer oder Maschine suchen…', it: 'Cerca titolo, cliente, rivenditore, venditore o macchina…', hu: 'Keresés: cím, ügyfél, kereskedő, értékesítő vagy gép…', fr: 'Rechercher titre, client, revendeur, vendeur ou machine…', pl: 'Szukaj tytułu, klienta, dealera, sprzedawcy lub maszyny…', cs: 'Hledat název, zákazníka, prodejce, obchodníka nebo stroj…' },
  all_status:    { da: 'Alle statusser', en: 'All statuses', de: 'Alle Status', it: 'Tutti gli stati', hu: 'Összes státusz', fr: 'Tous les statuts', pl: 'Wszystkie statusy', cs: 'Všechny stavy' },
  all_types:      { da: 'Alle typer', en: 'All types', de: 'Alle Typen', it: 'Tutti i tipi', hu: 'Összes típus', fr: 'Tous les types', pl: 'Wszystkie typy', cs: 'Všechny typy' },
  all_machines:   { da: 'Alle maskiner', en: 'All machines', de: 'Alle Maschinen', it: 'Tutte le macchine', hu: 'Összes gép', fr: 'Toutes les machines', pl: 'Wszystkie maszyny', cs: 'Všechny stroje' },
  all_equipment:  { da: 'Alle redskaber', en: 'All equipment', de: 'Alle Geräte', it: 'Tutte le attrezzature', hu: 'Összes eszköz', fr: 'Tous les équipements', pl: 'Cały osprzęt', cs: 'Všechno vybavení' },
  filter_type:    { da: 'Type', en: 'Type', de: 'Typ', it: 'Tipo', hu: 'Típus', fr: 'Type', pl: 'Typ', cs: 'Typ' },
  filter_machine: { da: 'Maskine', en: 'Machine', de: 'Maschine', it: 'Macchina', hu: 'Gép', fr: 'Machine', pl: 'Maszyna', cs: 'Stroj' },
  filter_equipment:{ da: 'Redskab', en: 'Equipment', de: 'Gerät', it: 'Attrezzatura', hu: 'Eszköz', fr: 'Équipement', pl: 'Osprzęt', cs: 'Vybavení' },
  loading:       { da: 'Indlæser…', en: 'Loading…', de: 'Lädt…', it: 'Caricamento…', hu: 'Betöltés…', fr: 'Chargement…', pl: 'Ładowanie…', cs: 'Načítání…' },
  empty_title:   { da: 'Ingen leads i dette filter', en: 'No leads in this filter', de: 'Keine Leads in diesem Filter', it: 'Nessun lead in questo filtro', hu: 'Nincs lead ebben a szűrőben', fr: 'Aucun lead dans ce filtre', pl: 'Brak leadów w tym filtrze', cs: 'V tomto filtru nejsou žádné leady' },
  empty_sub:     { da: 'Skift fane eller opret et nyt lead.', en: 'Switch tab or create a new lead.', de: 'Tab wechseln oder neuen Lead erstellen.', it: 'Cambia scheda o crea un nuovo lead.', hu: 'Váltson fület vagy hozzon létre új leadet.', fr: 'Changez d’onglet ou créez un nouveau lead.', pl: 'Zmień zakładkę albo utwórz nowy lead.', cs: 'Změňte záložku nebo vytvořte nový lead.' },
  col_type:      { da: 'Type', en: 'Type', de: 'Typ', it: 'Tipo', hu: 'Típus', fr: 'Type', pl: 'Typ', cs: 'Typ' },
  col_title:     { da: 'Titel / Kunde', en: 'Title / Customer', de: 'Titel / Kunde', it: 'Titolo / Cliente', hu: 'Cím / Ügyfél', fr: 'Titre / Client', pl: 'Tytuł / Klient', cs: 'Název / Zákazník' },
  col_dealer:    { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő', fr: 'Revendeur', pl: 'Dealer', cs: 'Prodejce' },
  col_owner:     { da: 'Ejer', en: 'Owner', de: 'Eigentümer', it: 'Proprietario', hu: 'Tulajdonos', fr: 'Responsable', pl: 'Właściciel', cs: 'Vlastník' },
  col_machine:   { da: 'Maskine', en: 'Machine', de: 'Maschine', it: 'Macchina', hu: 'Gép', fr: 'Machine', pl: 'Maszyna', cs: 'Stroj' },
  col_date:      { da: 'Dato', en: 'Date', de: 'Datum', it: 'Data', hu: 'Dátum', fr: 'Date', pl: 'Data', cs: 'Datum' },
  col_followup:  { da: 'Næste opf.', en: 'Next f/u', de: 'Nächste NV', it: 'Prossimo f/u', hu: 'Köv. utánk.', fr: 'Prochain suivi', pl: 'Nast. kontakt', cs: 'Další kontakt' },
  col_status:    { da: 'Status', en: 'Status', de: 'Status', it: 'Stato', hu: 'Státusz', fr: 'Statut', pl: 'Status', cs: 'Stav' },
  col_action:    { da: 'Handling', en: 'Action', de: 'Aktion', it: 'Azione', hu: 'Művelet', fr: 'Action', pl: 'Akcja', cs: 'Akce' },
  open_lbl:      { da: 'Åben', en: 'Open', de: 'Offen', it: 'Aperto', hu: 'Nyitott', fr: 'Ouvert', pl: 'Otwarte', cs: 'Otevřené' },
  demo_lbl:      { da: 'Demo', en: 'Demo', de: 'Demo', it: 'Demo', hu: 'Demo', fr: 'Démo', pl: 'Demo', cs: 'Demo' },
  type_won:      { da: 'Vundet', en: 'Won', de: 'Gewonnen', it: 'Vinto', hu: 'Nyertes', fr: 'Gagné', pl: 'Wygrane', cs: 'Vyhrané' },
  type_lost:     { da: 'Tabt', en: 'Lost', de: 'Verloren', it: 'Perso', hu: 'Elveszett', fr: 'Perdu', pl: 'Utracone', cs: 'Ztracené' },
  unassigned_chip:{ da: 'Utildelt', en: 'Unassigned', de: 'Nicht zugewiesen', it: 'Non assegnato', hu: 'Kiosztatlan', fr: 'Non assigné', pl: 'Nieprzypisane', cs: 'Nepřiřazeno' },
  incomplete_chip:{ da: 'Ikke færdig oprettet', en: 'Incomplete lead', de: 'Unvollständiger Lead', it: 'Lead incompleto', hu: 'Hiányos lead', fr: 'Lead incomplet', pl: 'Niekompletny lead', cs: 'Neúplný lead' },
  shared_chip:   { da: 'Delt med dig', en: 'Shared with you', de: 'Mit dir geteilt', it: 'Condiviso con te', hu: 'Megosztva veled', fr: 'Partagé avec vous', pl: 'Udostępnione Tobie', cs: 'Sdíleno s vámi' },
  close_btn:     { da: 'Luk', en: 'Close', de: 'Schließen', it: 'Chiudi', hu: 'Lezárás', fr: 'Fermer', pl: 'Zamknij', cs: 'Zavřít' },
  close_title:   { da: 'Luk lead', en: 'Close lead', de: 'Lead schließen', it: 'Chiudi lead', hu: 'Lead lezárása', fr: 'Fermer le lead', pl: 'Zamknij lead', cs: 'Zavřít lead' },
  close_sub:     { da: 'Markér leadet som vundet eller tabt.', en: 'Mark the lead as won or lost.', de: 'Lead als gewonnen oder verloren markieren.', it: 'Segna il lead come vinto o perso.', hu: 'Jelölje a leadet nyertesnek vagy elveszettnek.', fr: 'Marquer le lead comme gagné ou perdu.', pl: 'Oznacz lead jako wygrany lub utracony.', cs: 'Označit lead jako vyhraný nebo ztracený.' },
  won_label:     { da: 'Ordre vundet', en: 'Order won', de: 'Auftrag gewonnen', it: 'Ordine vinto', hu: 'Megrendelés nyertes', fr: 'Commande gagnée', pl: 'Zamówienie wygrane', cs: 'Objednávka vyhrána' },
  lost_label:    { da: 'Ordre tabt', en: 'Order lost', de: 'Auftrag verloren', it: 'Ordine perso', hu: 'Megrendelés elveszett', fr: 'Commande perdue', pl: 'Zamówienie utracone', cs: 'Objednávka ztracena' },
  lost_analysis_title: { da: 'Lost Deal Analysis', en: 'Lost Deal Analysis', de: 'Lost-Deal-Analyse', it: 'Analisi affare perso', hu: 'Elveszített üzlet elemzése', fr: 'Analyse de l’affaire perdue', pl: 'Analiza utraconej sprzedaży', cs: 'Analýza ztraceného obchodu' },
  lost_to:       { da: 'Tabt til konkurrent', en: 'Lost to competitor', de: 'An Wettbewerber verloren', it: 'Perso a concorrente', hu: 'Versenytársnak veszítve', fr: 'Perdu face à un concurrent', pl: 'Utracone na rzecz konkurenta', cs: 'Ztraceno ve prospěch konkurenta' },
  lost_other:    { da: 'Anden konkurrent', en: 'Other competitor', de: 'Anderer Wettbewerber', it: 'Altro concorrente', hu: 'Más versenytárs', fr: 'Autre concurrent', pl: 'Inny konkurent', cs: 'Jiný konkurent' },
  lost_reason:   { da: 'Hvorfor mistede vi ordren', en: 'Why we lost the order', de: 'Warum verloren', it: 'Perché abbiamo perso', hu: 'Miért vesztettük el', fr: 'Pourquoi nous avons perdu la commande', pl: 'Dlaczego utraciliśmy zamówienie', cs: 'Proč jsme objednávku ztratili' },
  lost_comment:  { da: 'Kommentar', en: 'Comment', de: 'Kommentar', it: 'Commento', hu: 'Megjegyzés', fr: 'Commentaire', pl: 'Komentarz', cs: 'Komentář' },
  save:          { da: 'Gem', en: 'Save', de: 'Speichern', it: 'Salva', hu: 'Mentés', fr: 'Enregistrer', pl: 'Zapisz', cs: 'Uložit' },
  cancel:        { da: 'Annuller', en: 'Cancel', de: 'Abbrechen', it: 'Annulla', hu: 'Mégse', fr: 'Annuler', pl: 'Anuluj', cs: 'Zrušit' },
  pick:          { da: 'Vælg…', en: 'Select…', de: 'Wählen…', it: 'Seleziona…', hu: 'Válasszon…', fr: 'Sélectionner…', pl: 'Wybierz…', cs: 'Vyberte…' },
  closed_ok:     { da: 'Leadet er lukket.', en: 'Lead closed.', de: 'Lead geschlossen.', it: 'Lead chiuso.', hu: 'Lead lezárva.', fr: 'Lead fermé.', pl: 'Lead zamknięty.', cs: 'Lead uzavřen.' },
  close_err:     { da: 'Kunne ikke lukke leadet.', en: 'Could not close lead.', de: 'Lead konnte nicht geschlossen werden.', it: 'Impossibile chiudere il lead.', hu: 'Nem sikerült lezárni a leadet.', fr: 'Impossible de fermer le lead.', pl: 'Nie można zamknąć leada.', cs: 'Lead se nepodařilo zavřít.' },
  verify_err:    { da: 'Lukning kunne ikke bekræftes.', en: 'Could not verify close.', de: 'Schließen konnte nicht bestätigt werden.', it: 'Impossibile verificare la chiusura.', hu: 'A lezárás nem erősíthető meg.', fr: 'Impossible de vérifier la fermeture.', pl: 'Nie można potwierdzić zamknięcia.', cs: 'Uzavření se nepodařilo ověřit.' },
  convert_to_demo:{ da: 'Konverter til demo', en: 'Convert to demo', de: 'In Demo umwandeln', it: 'Converti in demo', hu: 'Konvertálás demóvá', fr: 'Convertir en démo', pl: 'Konwertuj na demo', cs: 'Převést na demo' },
  convert_to_quote:{ da: 'Konverter til tilbud', en: 'Convert to quote', de: 'In Angebot umwandeln', it: 'Converti in offerta', hu: 'Konvertálás ajánlattá', fr: 'Convertir en devis', pl: 'Konwertuj na ofertę', cs: 'Převést na nabídku' },
  convert_label: { da: 'Konverter', en: 'Convert', de: 'Umwandeln', it: 'Converti', hu: 'Konvertálás', fr: 'Convertir', pl: 'Konwertuj', cs: 'Převést' },
  to_demo_label: { da: 'til demo', en: 'to demo', de: 'in Demo', it: 'in demo', hu: 'demóvá', fr: 'en démo', pl: 'na demo', cs: 'na demo' },
  to_quote_label:{ da: 'til tilbud', en: 'to quote', de: 'in Angebot', it: 'in offerta', hu: 'ajánlattá', fr: 'en devis', pl: 'na ofertę', cs: 'na nabídku' },
  go_to_quote:    { da: 'Gå til tilbud', en: 'Go to quote', de: 'Zum Angebot', it: 'Vai all\'offerta', hu: 'Ugrás az ajánlathoz', fr: 'Aller au devis', pl: 'Przejdź do oferty', cs: 'Přejít na nabídku' },
  urgency_overdue:{ da: 'Forfalden', en: 'Overdue', de: 'Überfällig', it: 'Scaduto', hu: 'Lejárt', fr: 'En retard', pl: 'Zaległe', cs: 'Po termínu' },
  urgency_soon:   { da: 'Inden 20 dage', en: 'Within 20 days', de: 'In 20 Tagen', it: 'Entro 20 giorni', hu: '20 napon belül', fr: 'Dans 20 jours', pl: 'W ciągu 20 dni', cs: 'Do 20 dnů' },
  urgency_later:  { da: 'Inden 2 mdr.', en: 'Within 2 mo.', de: 'In 2 Mon.', it: 'Entro 2 mesi', hu: '2 hónapon belül', fr: 'Dans 2 mois', pl: 'W ciągu 2 mies.', cs: 'Do 2 měs.' },
  sort_default:   { da: 'Sortér: standard', en: 'Sort: default', de: 'Sortieren: Standard', it: 'Ordina: standard', hu: 'Rendezés: alap', fr: 'Tri : standard', pl: 'Sortuj: standard', cs: 'Řadit: standard' },
  sort_title_asc: { da: 'Titel: A-Å', en: 'Title: A-Z', de: 'Titel: A-Z', it: 'Titolo: A-Z', hu: 'Cím: A-Z', fr: 'Titre : A-Z', pl: 'Tytuł: A-Z', cs: 'Název: A-Z' },
  sort_title_desc:{ da: 'Titel: Å-A', en: 'Title: Z-A', de: 'Titel: Z-A', it: 'Titolo: Z-A', hu: 'Cím: Z-A', fr: 'Titre : Z-A', pl: 'Tytuł: Z-A', cs: 'Název: Z-A' },
  sort_date_desc: { da: 'Dato: nyeste først', en: 'Date: newest first', de: 'Datum: neueste zuerst', it: 'Data: più recenti prima', hu: 'Dátum: legújabb elöl', fr: 'Date : plus récent', pl: 'Data: najnowsze', cs: 'Datum: nejnovější' },
  sort_date_asc:  { da: 'Dato: ældste først', en: 'Date: oldest first', de: 'Datum: älteste zuerst', it: 'Data: meno recenti prima', hu: 'Dátum: legrégebbi elöl', fr: 'Date : plus ancien', pl: 'Data: najstarsze', cs: 'Datum: nejstarší' },
  sort_prob_desc: { da: 'Status %: høj til lav', en: 'Status %: high to low', de: 'Status %: hoch zu niedrig', it: 'Status %: alto-basso', hu: 'Státusz %: magas-alacsony', fr: 'Statut % : décroissant', pl: 'Status %: malejąco', cs: 'Stav %: sestupně' },
  sort_prob_asc:  { da: 'Status %: lav til høj', en: 'Status %: low to high', de: 'Status %: niedrig zu hoch', it: 'Status %: basso-alto', hu: 'Státusz %: alacsony-magas', fr: 'Statut % : croissant', pl: 'Status %: rosnąco', cs: 'Stav %: vzestupně' },
  page_prev:      { da: 'Forrige', en: 'Previous', de: 'Zurück', it: 'Precedente', hu: 'Előző', fr: 'Précédent', pl: 'Poprzednia', cs: 'Předchozí' },
  page_next:      { da: 'Næste', en: 'Next', de: 'Weiter', it: 'Successiva', hu: 'Következő', fr: 'Suivant', pl: 'Następna', cs: 'Další' },
  page_range:     { da: 'Viser', en: 'Showing', de: 'Zeigt', it: 'Mostra', hu: 'Megjelenítve', fr: 'Affichage', pl: 'Pokazuje', cs: 'Zobrazuje' },
  st_Lead:       { da: 'Lead', en: 'Lead', de: 'Lead', it: 'Lead', hu: 'Lead', fr: 'Lead', pl: 'Lead', cs: 'Lead' },
  st_Demo:       { da: 'Demo planlagt', en: 'Demo planned', de: 'Demo geplant', it: 'Demo pianificata', hu: 'Demo tervezve', fr: 'Démo planifiée', pl: 'Demo zaplanowane', cs: 'Demo plánováno' },
  st_Tilbud:     { da: 'Tilbud sendt', en: 'Offer sent', de: 'Angebot gesendet', it: 'Offerta inviata', hu: 'Ajánlat elküldve', fr: 'Devis envoyé', pl: 'Oferta wysłana', cs: 'Nabídka odeslána' },
  st_Followup:   { da: 'Follow-up', en: 'Follow-up', de: 'Follow-up', it: 'Follow-up', hu: 'Utánkövetés', fr: 'Suivi', pl: 'Kontakt', cs: 'Kontakt' },
  st_Vundet:     { da: 'Vundet', en: 'Won', de: 'Gewonnen', it: 'Vinto', hu: 'Nyertes', fr: 'Gagné', pl: 'Wygrane', cs: 'Vyhrané' },
  st_Tabt:       { da: 'Tabt', en: 'Lost', de: 'Verloren', it: 'Perso', hu: 'Elveszett', fr: 'Perdu', pl: 'Utracone', cs: 'Ztracené' },
};
function tt(k: TKey, lang: PortalUiLanguage): string { return T[k][lang] || T[k].en; }

// ---------- Unified row ----------
type LeadType = 'open' | 'demo';
interface UnifiedLead {
  id: string;
  /** Human-readable number, e.g. "L-1000" or "D-8000". */
  display_no: string;
  type: LeadType;
  title: string;
  customer: string | null;
  dealer: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  responsible_name: string | null;
  machine: string | null;
  equipment: string | null;
  date: string | null;
  next_followup: string | null;
  status: string | null;
  probability: number | null;
  value: number | null;
  detail_href: string | null;
  attachments?: CrmLeadAttachment[];
  has_demo?: boolean;
  quote_id?: string | null;
  /** Phase 40 — true when the lead was created via the configurator's
   *  "Save as lead" shortcut and still needs completion in CRM. */
  incomplete?: boolean;
  shared?: boolean;
}

const ST_TKEY: Record<LeadDisplayStatus, TKey> = {
  Lead: 'st_Lead',
  'Demo planlagt': 'st_Demo',
  'Tilbud sendt': 'st_Tilbud',
  'Follow-up': 'st_Followup',
  Vundet: 'st_Vundet',
  Tabt: 'st_Tabt',
};
function localizeStatus(s: string | null | undefined, lang: PortalUiLanguage): string {
  if (!s) return '—';
  const k = ST_TKEY[s as LeadDisplayStatus];
  return k ? tt(k, lang) : s;
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null | undefined, lang: PortalUiLanguage): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const localeMap: Record<PortalUiLanguage, string> = {
    da: 'da-DK',
    en: 'en-GB',
    de: 'de-DE',
    it: 'it-IT',
    hu: 'hu-HU',
    sv: 'sv-SE',
    fr: 'fr-FR',
    pl: 'pl-PL',
    cs: 'cs-CZ',
  };
  return d.toLocaleDateString(localeMap[lang] || 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initialsFromName(name: string | null | undefined): string {
  return (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

function ownerInitials(row: UnifiedLead, sellerDirectory: SellerDirectory): string {
  const display = resolveSellerDisplay(
    {
      id: row.owner_user_id,
      email: row.owner_email,
      fallbackInitials: initialsFromName(row.owner_name),
      fallbackName: row.owner_name,
    },
    sellerDirectory,
  );
  return display.initials || initialsFromName(row.owner_name);
}

function statusFilterKey(row: UnifiedLead): string {
  return `${row.status || ''}::${row.probability ?? ''}`;
}

function statusFilterLabel(row: UnifiedLead, lang: PortalUiLanguage): string {
  const status = localizeStatus(row.status, lang);
  return row.probability == null ? status : `${status} · ${row.probability}%`;
}

function looksLikeUuid(value: string | null | undefined): boolean {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapOpen(l: CrmLead, dealerNameById: Map<string, string>): UnifiedLead {
  const linkedDealer = l.linked_dealer_id || null;
  const dealer = linkedDealer && looksLikeUuid(linkedDealer)
    ? dealerNameById.get(linkedDealer) || null
    : linkedDealer;
  return {
    id: l.id,
    display_no: formatLeadNo(l.lead_no),
    type: 'open',
    title: l.title,
    customer: l.contact_information || null,
    dealer,
    owner_user_id: l.owner_user_id,
    owner_name: l.owner_name,
    owner_email: l.owner_email || null,
    responsible_name: l.owner_name,
    machine: (l.machine_types || []).join(', ') || null,
    equipment: null,
    date: l.first_contact_date || l.created_at,
    next_followup: l.next_followup_date,
    status: effectiveLeadStatus(l),
    probability: effectiveLeadProbability(l),
    value: l.estimated_value,
    detail_href: `/portal/crm/leads/${l.id}`,
    attachments: l.attachments || [],
    has_demo: l.demo_has_run === 'yes',
    incomplete: l.incomplete_from_configurator === true,
  };
}

function mapDemo(d: CrmDemoLead): UnifiedLead {
  return {
    id: d.id,
    display_no: formatDemoNo(d.demo_no),
    type: 'demo',
    title: d.title,
    customer: d.customer_name,
    dealer: d.dealer_company,
    owner_user_id: d.owner_user_id,
    owner_name: d.owner_name,
    owner_email: d.owner_email || null,
    responsible_name: d.owner_name,
    machine: d.demo_machine,
    equipment: (d.demo_equipment || []).join(', ') || null,
    date: d.demo_date || d.created_at,
    next_followup: d.followup_date,
    status: d.result_status,
    probability: null,
    value: d.estimated_value,
    detail_href: `/portal/crm/demo-leads/${d.id}`,
    attachments: d.attachments || [],
  };
}

type TabKey = 'open' | 'won' | 'closed' | 'all';
type SortKey = 'default' | 'title_asc' | 'title_desc' | 'date_desc' | 'date_asc' | 'prob_desc' | 'prob_asc';
type UserLeadType = 'open' | 'demo' | 'won' | 'lost';
type FollowupTone = 'overdue' | 'soon' | 'later' | 'neutral';
type FollowupFilter = Exclude<FollowupTone, 'neutral'>;

const USER_LEAD_TYPES: UserLeadType[] = ['open', 'demo', 'won', 'lost'];

function isWonRow(row: UnifiedLead): boolean {
  return row.status === 'Vundet' || row.status === 'Won';
}

function isClosedRow(row: UnifiedLead): boolean {
  return row.status === 'Tabt' || row.status === 'Lost' || row.status === 'No fit';
}

function isOpenRow(row: UnifiedLead): boolean {
  return !isWonRow(row) && !isClosedRow(row);
}

function isDemoLikeRow(row: UnifiedLead): boolean {
  return row.type === 'demo' || row.has_demo === true;
}

function getUserLeadType(row: UnifiedLead): UserLeadType {
  if (isWonRow(row)) return 'won';
  if (isClosedRow(row)) return 'lost';
  if (isDemoLikeRow(row)) return 'demo';
  return 'open';
}

function getUserLeadTypeLabel(type: UserLeadType, lang: PortalUiLanguage): string {
  if (type === 'won') return tt('type_won', lang);
  if (type === 'lost') return tt('type_lost', lang);
  if (type === 'demo') return tt('demo_lbl', lang);
  return tt('open_lbl', lang);
}

const FOLLOWUP_BADGE: Record<FollowupTone, string> = {
  overdue: 'bg-rose-50 text-rose-700 border-rose-200',
  soon: 'bg-amber-50 text-amber-800 border-amber-200',
  later: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  neutral: 'text-gray-600 border-transparent',
};

const FOLLOWUP_FILTERS: Array<{ key: FollowupFilter; labelKey: TKey }> = [
  { key: 'overdue', labelKey: 'urgency_overdue' },
  { key: 'soon', labelKey: 'urgency_soon' },
  { key: 'later', labelKey: 'urgency_later' },
];

const PAGE_SIZE = 50;

function getFollowupTone(value: string | null | undefined, now = new Date()): FollowupTone {
  const urgency = classifyLeadFollowupUrgency(value, now);
  return urgency === 'none' ? 'neutral' : urgency;
}

function splitFilterValues(value: string | null | undefined): string[] {
  return (value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function CompactConvertLabel({
  primary,
  secondary,
}: {
  primary: string;
  secondary: string;
}) {
  return (
    <span className="flex flex-col items-center text-center leading-none">
      <span className="text-[12px] font-semibold leading-3 text-current">{primary}</span>
      <span className="text-[10px] leading-3 text-current opacity-80">{secondary}</span>
    </span>
  );
}

function compareRows(a: UnifiedLead, b: UnifiedLead, sort: SortKey): number {
  if (sort === 'title_asc') return (a.title || '').localeCompare(b.title || '', 'da');
  if (sort === 'title_desc') return (b.title || '').localeCompare(a.title || '', 'da');
  if (sort === 'date_desc') return (b.date || '').localeCompare(a.date || '');
  if (sort === 'date_asc') return (a.date || '').localeCompare(b.date || '');
  if (sort === 'prob_desc') return (b.probability ?? -1) - (a.probability ?? -1);
  if (sort === 'prob_asc') return (a.probability ?? 999) - (b.probability ?? 999);
  const aLegacy = /^G-/.test(a.display_no || '');
  const bLegacy = /^G-/.test(b.display_no || '');
  if (aLegacy !== bLegacy) return aLegacy ? 1 : -1;
  return (b.date || '').localeCompare(a.date || '');
}

export default function CrmLeadsPage() {
  const { appUser } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  const { uiLanguage: lang } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dealerParam = searchParams.get('dealer') || '';
  const portalRole = derivePortalRole(effectiveUser);
  const isAdmin = isCrmAdmin(portalRole);
  const externalCrm = isExternalCrmRole(portalRole);
  const canDelete = portalRole === 'timan_backend' && !getActiveSellerView(appUser?.email);
  const effectiveSellerEmail = getEffectiveSellerEmail(appUser);
  const sellerDirectory = useSellerDirectory();

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'open',      label: tt('tab_open', lang) },
    { key: 'won',       label: tt('tab_won', lang) },
    { key: 'closed',    label: tt('tab_lost', lang) },
    { key: 'all',       label: tt('tab_all', lang) },
  ];

  const [externalDealerScope, setExternalDealerScope] = useState<{ ids: Set<string>; names: Set<string> } | null>(null);
  const [externalScopeLoading, setExternalScopeLoading] = useState(false);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [pageResult, setPageResult] = useState<CrmLeadsPageQueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [tab, setTab] = useState<TabKey>(dealerParam ? 'all' : 'open');
  const [followupFilter, setFollowupFilter] = useState<FollowupFilter | null>(null);
  const [q, setQ] = useState(dealerParam);
  const [typeFilter, setTypeFilter] = useState<UserLeadType | ''>('');
  const [machineFilter, setMachineFilter] = useState('');
  const [equipmentFilter, setEquipmentFilter] = useState('');
  const [stage, setStage] = useState<string>('');
  const [sort, setSort] = useState<SortKey>('default');
  const [page, setPage] = useState(0);
  const [closeTarget, setCloseTarget] = useState<CrmLead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedLead | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [quoteConvertBusyId, setQuoteConvertBusyId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{ title: string; images: CrmLeadAttachmentPreview[] } | null>(null);
  const topFilterButtonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3.5 text-sm leading-none transition whitespace-nowrap';
  const topActionButtonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium leading-none shadow-sm transition whitespace-nowrap';

  useEffect(() => {
    if (dealerParam) {
      setQ(dealerParam);
      setTab('all');
      setFollowupFilter(null);
    }
  }, [dealerParam]);

  const refreshLeads = async () => {
    setReloadKey((value) => value + 1);
  };

  async function handleConvertToQuote(leadId: string) {
    const lead = await getLead(leadId);
    if (!lead || quoteConvertBusyId) return;
    setQuoteConvertBusyId(leadId);
    try {
      const nextActivity = 'Offer sent to the customer';
      await updateLead(leadId, {
        next_activity: nextActivity,
        probability: 70,
        pipeline_stage: deriveLegacyPipelineStage(nextActivity),
      });
      navigate(`/configurator?fromLeadQuote=${encodeURIComponent(leadId)}`);
    } catch (e) {
      console.error(e);
      toast.error(lang === 'da' ? 'Kunne ikke konvertere leadet til tilbud' : 'Could not convert lead to quote');
      setQuoteConvertBusyId(null);
    }
  }

  useEffect(() => {
    if (!dealerParam) {
      setTab('open');
    }
  }, [dealerParam]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setExternalScopeLoading(true);
      try {
        const res = await fetchDealerAccounts({ includeDeleted: true });
        if (cancelled) return;
        if (externalCrm) {
          const scope = await buildJournalScope(effectiveUser, portalRole);
          const nums = new Set(Array.from(scope.dealerNumbers));
          const visible = res.rows.filter((d) => (
            nums.has((d.account_number || '').trim().toLowerCase())
            && canUseImplicitExternalCrmDealerScope(d)
          ));
          setExternalDealerScope({
            ids: new Set(visible.map((d) => d.id)),
            names: new Set(visible.flatMap((d) => [d.company_name, d.branch_name, d.account_number]).filter(Boolean).map((v) => String(v).trim().toLowerCase())),
          });
        } else {
          setExternalDealerScope(null);
        }
      } catch (err) {
        console.warn('[CRM Leads] dealer scope failed:', err);
        setExternalDealerScope(null);
      } finally {
        if (!cancelled) setExternalScopeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [externalCrm, effectiveUser?.dealer_number, portalRole]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (externalScopeLoading) return;
      setLoading(true);
      const sellerScope = await resolveEffectiveCrmSellerScope({ email: appUser?.email });
      const sid = sellerScope.ownerUserId;
      const [nextSharedLeadIds] = await Promise.all([
        listSharedLeadIdsForUser(sid),
      ]);
      if (cancelled) return;
      try {
        const result = await listLeadsPage({
          isAdmin,
          ownerUserId: sid,
          ownerEmail: sellerScope.ownerEmail,
          sharedLeadIds: Array.from(nextSharedLeadIds),
          externalDealerIds: externalDealerScope ? Array.from(externalDealerScope.ids) : [],
          externalDealerNames: externalDealerScope ? Array.from(externalDealerScope.names) : [],
          tab,
          followupFilter,
          typeFilter,
          machineFilter,
          equipmentFilter,
          statusFilter: stage,
          search: q,
          sort,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        setSellerId(sid);
        setPageResult(result);
      } catch (err) {
        console.error('[CRM Leads] page query failed:', err);
        toast.error(lang === 'da' ? 'Kunne ikke hente leads' : 'Could not load leads');
        setPageResult(null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [appUser?.email, effectiveSellerEmail, externalDealerScope, externalScopeLoading, followupFilter, isAdmin, machineFilter, equipmentFilter, page, portalRole, q, reloadKey, sort, stage, tab, typeFilter]);

  useEffect(() => {
    setPage(0);
  }, [tab, followupFilter, q, typeFilter, machineFilter, equipmentFilter, stage, sort]);

  const visible = useMemo<UnifiedLead[]>(
    () => (pageResult?.rows ?? []).map((row) => ({ ...row, detail_href: row.detail_href || null })),
    [pageResult],
  );

  const counts = pageResult?.counts ?? { all: 0, open: 0, won: 0, closed: 0 };
  const followupCounts = pageResult?.followup_counts ?? { overdue: 0, soon: 0, later: 0 };

  const typeOptions = useMemo(() => {
    const allowed = new Set(pageResult?.options.types ?? []);
    return USER_LEAD_TYPES.filter((type) => allowed.has(type));
  }, [pageResult?.options.types]);

  const machineOptions = useMemo(() => {
    return pageResult?.options.machines ?? [];
  }, [pageResult?.options.machines]);

  const equipmentOptions = useMemo(() => {
    return pageResult?.options.equipment ?? [];
  }, [pageResult?.options.equipment]);

  const statusOptions = useMemo(() => {
    const values = new Map<string, string>();
    (pageResult?.options.statuses ?? []).forEach((row) => {
      if (!row.status) return;
      values.set(row.value, row.probability == null ? localizeStatus(row.status, lang) : `${localizeStatus(row.status, lang)} · ${row.probability}%`);
    });
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1], 'da'));
  }, [lang, pageResult?.options.statuses]);

  const totalValue = pageResult?.total_value ?? 0;
  const totalCount = pageResult?.total_count ?? 0;
  const unassignedCount = pageResult?.unassigned_count ?? 0;
  const pageStart = totalCount === 0 ? 0 : (pageResult?.page_offset ?? 0) + 1;
  const pageEnd = Math.min((pageResult?.page_offset ?? 0) + visible.length, totalCount);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const result = deleteTarget.type === 'demo'
        ? await deleteDemoLead(deleteTarget.id, {
            ...deleteTarget,
            deleted_by_name: appUser?.display_name || appUser?.email || null,
            deleted_by_email: appUser?.email || null,
            deleted_by_role: portalRole,
          })
        : await deleteLead(deleteTarget.id, {
            ...deleteTarget,
            deleted_by_name: appUser?.display_name || appUser?.email || null,
            deleted_by_email: appUser?.email || null,
            deleted_by_role: portalRole,
          });
      if (result.error) {
        toast.error('Kunne ikke slette leadet.');
        return;
      }
      await refreshLeads();
      toast.success(deleteTarget.type === 'demo' ? 'Demo-lead er slettet.' : 'Lead er slettet.');
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <CrmLayout pageTitle={tt('page_title', lang)}>
      {/* Header */}
      <div className="mb-5">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#2d5a27]" /> {tt('page_title', lang)}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin ? tt('sub_admin', lang) : tt('sub_seller', lang)}
            {' · '}{totalCount} {tt('pcs', lang)}{totalValue > 0 ? ` · ${formatKr(totalValue)}` : ''}
            {isAdmin && unassignedCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-amber-50 text-amber-800 border border-amber-200">
                {unassignedCount} {tt('unassigned', lang)}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {TABS.filter((t) => t.key === 'open').map(t => {
            const active = tab === t.key && followupFilter === null;
            const c = counts[t.key];
            return (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setFollowupFilter(null);
                }}
                className={cn(
                  topFilterButtonClass,
                  active
                    ? 'bg-[#2d5a27] border-[#2d5a27] text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                )}>
                {t.label}
                <span className={cn(
                  'inline-flex min-w-[20px] justify-center items-center text-[11px] px-1.5 py-0.5 rounded-md tabular-nums',
                  active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                )}>{c}</span>
              </button>
            );
          })}
          {FOLLOWUP_FILTERS.map((item) => {
            const active = followupFilter === item.key;
            const c = followupCounts[item.key];
            return (
              <button
                key={item.key}
                onClick={() => {
                  setTab('open');
                  setFollowupFilter(active ? null : item.key);
                }}
                className={cn(
                  topFilterButtonClass,
                  FOLLOWUP_BADGE[item.key],
                  active ? 'shadow-sm ring-2 ring-offset-1 ring-current/20' : 'hover:bg-white'
                )}
              >
                {tt(item.labelKey, lang)}
                <span className={cn(
                  'inline-flex min-w-[20px] justify-center items-center text-[11px] px-1.5 py-0.5 rounded-md tabular-nums',
                  active ? 'bg-white/60' : 'bg-white/70'
                )}>{c}</span>
              </button>
            );
          })}
          {TABS.filter((t) => t.key === 'all').map(t => {
            const active = tab === t.key && followupFilter === null;
            const c = counts[t.key];
            return (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setFollowupFilter(null);
                }}
                className={cn(
                  topFilterButtonClass,
                  active
                    ? 'bg-[#2d5a27] border-[#2d5a27] text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                )}>
                {t.label}
                <span className={cn(
                  'inline-flex min-w-[20px] justify-center items-center text-[11px] px-1.5 py-0.5 rounded-md tabular-nums',
                  active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                )}>{c}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
          {TABS.filter((t) => t.key === 'won' || t.key === 'closed').map(t => {
            const active = tab === t.key && followupFilter === null;
            const c = counts[t.key];
            return (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setFollowupFilter(null);
                }}
                className={cn(
                  topFilterButtonClass,
                  active
                    ? 'bg-[#2d5a27] border-[#2d5a27] text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                )}>
                {t.label}
                <span className={cn(
                  'inline-flex min-w-[20px] justify-center items-center text-[11px] px-1.5 py-0.5 rounded-md tabular-nums',
                  active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                )}>{c}</span>
              </button>
            );
          })}
          <Link to="/portal/crm/demo-leads/new"
            className={cn(topActionButtonClass, 'bg-white text-[#2d5a27] border border-[#2d5a27]/30 hover:border-[#2d5a27] hover:bg-gray-50')}>
            <Plus className="h-4 w-4" /> {tt('new_demo', lang)}
          </Link>
          <Link to="/portal/crm/leads/new"
            className={cn(topActionButtonClass, 'bg-[#2d5a27] text-white hover:bg-[#234820]')}>
            <Plus className="h-4 w-4" /> {tt('new_lead', lang)}
          </Link>
        </div>
      </div>

      {/* Filter strip */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 mb-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.05fr)_minmax(130px,0.5fr)_minmax(190px,0.95fr)_minmax(160px,0.75fr)_minmax(160px,0.75fr)_minmax(185px,0.8fr)] gap-3">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder={tt('search_ph', lang)}
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 outline-none" />
        </div>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value as UserLeadType | '')}
          aria-label={tt('filter_type', lang)}
          className="min-w-0 w-full rounded-xl border border-gray-200 text-sm px-3 py-2.5 bg-white">
          <option value="">{tt('all_types', lang)}</option>
          {typeOptions.map((type) => (
            <option key={type} value={type}>{tt('filter_type', lang)}: {getUserLeadTypeLabel(type, lang)}</option>
          ))}
        </select>
        <select value={machineFilter} onChange={e=>setMachineFilter(e.target.value)}
          aria-label={tt('filter_machine', lang)}
          className="min-w-0 w-full rounded-xl border border-gray-200 text-sm px-3 py-2.5 bg-white">
          <option value="">{tt('all_machines', lang)}</option>
          {machineOptions.map((machine) => <option key={machine} value={machine}>{machine}</option>)}
        </select>
        <select value={equipmentFilter} onChange={e=>setEquipmentFilter(e.target.value)}
          aria-label={tt('filter_equipment', lang)}
          className="min-w-0 w-full rounded-xl border border-gray-200 text-sm px-3 py-2.5 bg-white"
          disabled={equipmentOptions.length === 0}>
          <option value="">{tt('all_equipment', lang)}</option>
          {equipmentOptions.map((equipment) => <option key={equipment} value={equipment}>{equipment}</option>)}
        </select>
        <select value={stage} onChange={e=>setStage(e.target.value)}
          className="min-w-0 w-full rounded-xl border border-gray-200 text-sm px-3 py-2.5 bg-white">
          <option value="">{tt('all_status', lang)}</option>
          {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className="relative min-w-0">
          <ArrowDownAZ className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <select value={sort} onChange={e=>setSort(e.target.value as SortKey)}
            className="w-full rounded-xl border border-gray-200 text-sm pl-10 pr-3 py-2.5 bg-white">
            <option value="default">{tt('sort_default', lang)}</option>
            <option value="title_asc">{tt('sort_title_asc', lang)}</option>
            <option value="title_desc">{tt('sort_title_desc', lang)}</option>
            <option value="date_desc">{tt('sort_date_desc', lang)}</option>
            <option value="date_asc">{tt('sort_date_asc', lang)}</option>
            <option value="prob_desc">{tt('sort_prob_desc', lang)}</option>
            <option value="prob_asc">{tt('sort_prob_asc', lang)}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-8 text-sm text-gray-500">{tt('loading', lang)}</p>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
              <TrendingUp className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900">{tt('empty_title', lang)}</p>
            <p className="text-xs text-gray-500 mt-1">{tt('empty_sub', lang)}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/70 text-[11px] uppercase tracking-[0.06em] text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3">{tt('col_type', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_title', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_dealer', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_owner', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_machine', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_date', lang)}</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">{tt('col_followup', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_status', lang)}</th>
                  <th className="text-right px-4 py-3">{tt('col_action', lang)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map(r => {
                  const clickable = !!r.detail_href;
                  const imageAttachments = getLeadImageAttachments(r.attachments);
                  const userType = getUserLeadType(r);
                  const followupTone = getFollowupTone(r.next_followup);
                  const canActOnOpenLead = r.type === 'open' && isOpenRow(r);
                  return (
                    <tr key={`${r.type}-${r.id}`}
                      onClick={() => { if (r.detail_href) navigate(r.detail_href); }}
                      className={cn('transition-colors', clickable ? 'cursor-pointer hover:bg-gray-50/60' : 'hover:bg-gray-50/40')}>
                      <td className="px-4 py-3.5">
                        <span className={cn(
                          'inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border',
                          FOLLOWUP_BADGE[followupTone]
                        )}>
                          {getUserLeadTypeLabel(userType, lang)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-mono text-[11px] tabular-nums text-slate-500 shrink-0">{r.display_no}</span>
                          <span className="font-medium text-gray-900 truncate max-w-[260px]">{r.title}</span>
                          {r.incomplete && (
                            <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border bg-amber-50 text-amber-800 border-amber-200">
                              {tt('incomplete_chip', lang)}
                            </span>
                          )}
                          {r.shared && (
                            <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                              {tt('shared_chip', lang)}
                            </span>
                          )}
                          {imageAttachments.length > 0 && (
                            <button
                              type="button"
                              title="Se vedhæftede billeder"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const previews = await getLeadAttachmentSignedUrls(imageAttachments);
                                if (previews.length === 0) {
                                  toast.error('Kunne ikke åbne vedhæftede billeder');
                                  return;
                                }
                                setImagePreview({ title: r.title, images: previews });
                              }}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {r.customer && r.customer !== r.title && (
                          <div className="text-xs text-gray-500 truncate max-w-[260px]">{r.customer}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 max-w-[220px] truncate">{r.dealer || '—'}</td>
                      <td className="px-4 py-3.5">
                        {r.owner_name ? (
                          <span className="font-medium text-gray-700">{ownerInitials(r, sellerDirectory)}</span>
                        ) : (
                          <span className="inline-flex text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                            {tt('unassigned_chip', lang)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 max-w-[260px] truncate">{r.machine || '—'}</td>
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{fmtDate(r.date, lang)}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={cn(
                          'inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md border tabular-nums',
                          FOLLOWUP_BADGE[followupTone]
                        )}>
                          {fmtDate(r.next_followup, lang)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {r.status ? (
                          <div className="flex min-w-[140px] items-center justify-between gap-3 text-[12px] text-gray-700">
                            <span className="text-left">{localizeStatus(r.status, lang)}</span>
                            {r.probability != null && (
                              <span className="ml-auto text-right font-medium text-gray-600 tabular-nums">{r.probability}%</span>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canActOnOpenLead && (
                            <>
                              {!r.has_demo && (
                                <Link
                                  to={`/portal/crm/demo-leads/new?fromLead=${encodeURIComponent(r.id)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={tt('convert_to_demo', lang)}
                                  className="inline-flex h-8 min-w-[58px] items-center justify-center text-center text-violet-700 hover:underline"
                                >
                                  <CompactConvertLabel primary={tt('convert_label', lang)} secondary={tt('to_demo_label', lang)} />
                                </Link>
                              )}
                              {r.quote_id ? (
                                <Link
                                  to={`/configurator?configId=${encodeURIComponent(r.quote_id)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[12px] text-emerald-700 hover:underline"
                                >
                                  <FileText className="h-3.5 w-3.5" /> {tt('go_to_quote', lang)}
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  disabled={quoteConvertBusyId === r.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleConvertToQuote(r.id);
                                  }}
                                  aria-label={tt('convert_to_quote', lang)}
                                  className="inline-flex h-8 min-w-[58px] items-center justify-center text-center text-emerald-700 hover:underline disabled:opacity-50"
                                >
                                  <CompactConvertLabel primary={tt('convert_label', lang)} secondary={tt('to_quote_label', lang)} />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  getLead(r.id).then((lead) => {
                                    if (lead) setCloseTarget(lead);
                                  });
                                }}
                                className="inline-flex items-center gap-1 text-[12px] text-rose-700 hover:underline"
                              >
                                <XCircle className="h-3.5 w-3.5" /> {tt('close_btn', lang)}
                              </button>
                            </>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(r);
                              }}
                              className="inline-flex items-center gap-1 text-[12px] text-rose-700 hover:underline"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Slet
                            </button>
                          )}
                          {!canActOnOpenLead && !canDelete && (
                            <span className="text-[12px] text-gray-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && totalCount > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
            <span>
              {tt('page_range', lang)} {pageStart}-{pageEnd} / {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tt('page_prev', lang)}
              </button>
              <button
                type="button"
                disabled={pageEnd >= totalCount}
                onClick={() => setPage((value) => value + 1)}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tt('page_next', lang)}
              </button>
            </div>
          </div>
        )}
      </div>

      {imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => setImagePreview(null)}>
          <div
            className="w-full max-w-3xl max-h-[88vh] overflow-auto rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Vedhæftede billeder</h2>
                <p className="text-xs text-slate-500 truncate">{imagePreview.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setImagePreview(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={cn('grid gap-3', imagePreview.images.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1')}>
              {imagePreview.images.map((image, index) => {
                return (
                  <a key={`${image.name}-${index}`} href={image.signed_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <img src={image.signed_url} alt={image.name} className="max-h-[70vh] w-full object-contain" />
                    <div className="truncate px-3 py-2 text-xs font-medium text-slate-700">{image.name}</div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <WonLostDialog
        lead={closeTarget}
        lang={lang}
        onOpenChange={(open) => { if (!open) setCloseTarget(null); }}
        onSaved={async () => { setCloseTarget(null); await refreshLeads(); }}
      />
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open && !deleteBusy) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på, at du vil slette dette lead? Det fjernes fra CRM-listen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Annuller</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmDelete(); }}
              disabled={deleteBusy}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteBusy ? '…' : 'Ja, slet'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}

// ============================================================================
// Won/Lost close dialog
// ============================================================================
function WonLostDialog({
  lead, lang, onOpenChange, onSaved,
}: {
  lead: CrmLead | null;
  lang: Language;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<'won' | 'lost' | null>(null);
  const [competitor, setCompetitor] = useState('');
  const [competitorOther, setCompetitorOther] = useState('');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode(null);
    setCompetitor(''); setCompetitorOther(''); setReason(''); setComment('');
  }, [lead?.id]);

  if (!lead) return null;

  async function handleSave() {
    if (!lead) return;
    setSaving(true);
    try {
      const isWon = mode === 'won';
      const nextActivity = isWon ? NEXT_ACTIVITY_WON : NEXT_ACTIVITY_LOST;
      const closedAt = new Date().toISOString();
      await updateLead(lead.id, {
        next_activity: nextActivity,
        probability: isWon ? 100 : 0,
        pipeline_stage: deriveLegacyPipelineStage(nextActivity),
        status: 'closed',
        ...(isWon ? {} : {
          lost_competitor: competitor === 'Andre' ? (competitorOther || 'Andre') : (competitor || null),
          lost_reason: reason || null,
          lost_comment: comment || null,
        }),
        updated_at: closedAt,
      } as any);
      // Verify before showing success.
      const fresh = await getLead(lead.id);
      const ok = !!fresh && fresh.next_activity === nextActivity;
      if (!ok) { toast.error(tt('verify_err', lang)); return; }
      toast.success(tt('closed_ok', lang));
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error(tt('close_err', lang));
    } finally {
      setSaving(false);
    }
  }

  const isLost = mode === 'lost';
  return (
    <Dialog open={!!lead} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tt('close_title', lang)}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600 -mt-2">{tt('close_sub', lang)}</p>

        {mode === null && (
          <div className="grid grid-cols-1 gap-2 mt-1">
            <button
              type="button"
              onClick={() => setMode('won')}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-sm font-medium transition"
            >
              <CheckCircle2 className="h-4 w-4" /> {tt('won_label', lang)}
            </button>
            <button
              type="button"
              onClick={() => setMode('lost')}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 text-sm font-medium transition"
            >
              <XCircle className="h-4 w-4" /> {tt('lost_label', lang)}
            </button>
          </div>
        )}

        {isLost && (
          <div className="space-y-3 mt-1">
            <div className="flex items-center gap-2 text-rose-800 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" /> {tt('lost_analysis_title', lang)}
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-700">{tt('lost_to', lang)}</label>
              <select className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
                value={competitor} onChange={e => setCompetitor(e.target.value)}>
                <option value="">{tt('pick', lang)}</option>
                {LOST_COMPETITOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {competitor === 'Andre' && (
              <div>
                <label className="text-[12px] font-medium text-gray-700">{tt('lost_other', lang)}</label>
                <input className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
                  value={competitorOther} onChange={e => setCompetitorOther(e.target.value)} />
              </div>
            )}
            <div>
              <label className="text-[12px] font-medium text-gray-700">{tt('lost_reason', lang)}</label>
              <select className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
                value={reason} onChange={e => setReason(e.target.value)}>
                <option value="">{tt('pick', lang)}</option>
                {LOST_REASON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-700">{tt('lost_comment', lang)}</label>
              <textarea className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white min-h-[80px]"
                value={comment} onChange={e => setComment(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tt('cancel', lang)}
          </Button>
          {mode !== null && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '…' : tt('save', lang)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
