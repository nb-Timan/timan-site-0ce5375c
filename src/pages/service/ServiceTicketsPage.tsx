/**
 * Phase 4b — Service tickets list + create.
 * Read-only list of tickets visible via RLS, plus an "Opret service ticket"
 * dialog that inserts into public.service_tickets.
 *
 * No claims/TSB/warranty changes. No file upload. No internal notes here.
 * Standard supabase-js client only — RLS controls visibility.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Ticket, Plus, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useEffectivePortalUser } from "@/lib/viewAsUser";
import { derivePortalRole } from "@/lib/portalAccess";
import { useDealerScope } from "@/lib/dealerScope";
import { Language } from "@/types/configurator";
import { t as tt, pickT } from "@/lib/i18n/translations";
import type { PortalUiLanguage } from "@/lib/portalLanguages";

import {
  ServiceTicket,
  fetchVisibleServiceTickets,
  createServiceTicket,
  NewServiceTicketInput,
} from "@/lib/machineLifecycleService";
import { fetchDealerAccounts, type DealerAccount } from "@/lib/dealerAccountsService";
import { useTeknikScope, applyScopeFilter } from "@/lib/useTeknikScope";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const T = {
  back:   { da: "Tilbage til Teknik & Service", en: "Back to Technical & Service", de: "Zurück zu Technik & Service", it: "Torna a Tecnico & Assistenza", hu: "Vissza a Műszaki & Szerviz oldalra", sv: "Tillbaka till Teknik & Service", fr: "Retour à Technique & Service", pl: "Powrót do Technika & Serwis", cs: "Zpět na Technika & Servis" },
  title:  { da: "Service tickets", en: "Service tickets", de: "Service-Tickets", it: "Ticket di assistenza", hu: "Szervizjegyek", sv: "Serviceärenden", fr: "Tickets de service", pl: "Zgłoszenia serwisowe", cs: "Servisní tikety" },
  lead:   { da: "Opret, følg og håndter servicehenvendelser pr. maskine.", en: "Create, track and handle service requests per machine.", de: "Service-Anfragen pro Maschine erstellen, verfolgen und bearbeiten.", it: "Crea, monitora e gestisci le richieste di assistenza per macchina.", hu: "Szerviz kérések létrehozása, követése és kezelése gépenként.", sv: "Skapa, följ och hantera serviceärenden per maskin.", fr: "Créez, suivez et gérez les demandes de service par machine.", pl: "Twórz, śledź i obsługuj zgłoszenia serwisowe dla każdej maszyny.", cs: "Vytvářejte, sledujte a řešte servisní požadavky pro každý stroj." },
  createBtn: { da: "Opret service ticket", en: "Create service ticket", de: "Service-Ticket erstellen", it: "Crea ticket di assistenza", hu: "Szervizjegy létrehozása", sv: "Skapa serviceärende", fr: "Créer un ticket de service", pl: "Utwórz zgłoszenie serwisowe", cs: "Vytvořit servisní tiket" },
  loading: { da: "Indlæser…", en: "Loading…", de: "Lädt…", it: "Caricamento…", hu: "Betöltés…", sv: "Laddar…", fr: "Chargement…", pl: "Ładowanie…", cs: "Načítání…" },
  loadErr: { da: "Kunne ikke hente service tickets.", en: "Could not load service tickets.", de: "Service-Tickets konnten nicht geladen werden.", it: "Impossibile caricare i ticket di assistenza.", hu: "Nem sikerült betölteni a szervizjegyeket.", sv: "Kunde inte läsa in serviceärenden.", fr: "Impossible de charger les tickets de service.", pl: "Nie udało się załadować zgłoszeń serwisowych.", cs: "Nepodařilo se načíst servisní tikety." },
  empty:   { da: "Ingen service tickets endnu.", en: "No service tickets yet.", de: "Noch keine Service-Tickets.", it: "Nessun ticket di assistenza.", hu: "Még nincs szervizjegy.", sv: "Inga serviceärenden ännu.", fr: "Aucun ticket de service.", pl: "Brak zgłoszeń serwisowych.", cs: "Zatím žádné servisní tikety." },

  // Columns
  colNumber: { da: "Ticketnr.", en: "Ticket no.", de: "Ticket-Nr.", it: "N. ticket", hu: "Jegy szám", sv: "Ärendenr", fr: "N° ticket", pl: "Nr zgłoszenia", cs: "Č. tiketu" },
  colTitle:  { da: "Titel", en: "Title", de: "Titel", it: "Titolo", hu: "Cím", sv: "Titel", fr: "Titre", pl: "Tytuł", cs: "Název" },
  colSerial: { da: "Serienummer", en: "Serial number", de: "Seriennummer", it: "Numero di serie", hu: "Gyári szám", sv: "Serienummer", fr: "Numéro de série", pl: "Numer seryjny", cs: "Sériové číslo" },
  colStatus: { da: "Status", en: "Status", de: "Status", it: "Stato", hu: "Státusz", sv: "Status", fr: "Statut", pl: "Status", cs: "Stav" },
  colPrio:   { da: "Prioritet", en: "Priority", de: "Priorität", it: "Priorità", hu: "Prioritás", sv: "Prioritet", fr: "Priorité", pl: "Priorytet", cs: "Priorita" },
  colDealer: { da: "Forhandler", en: "Dealer", de: "Händler", it: "Rivenditore", hu: "Forgalmazó", sv: "Återförsäljare", fr: "Concessionnaire", pl: "Dealer", cs: "Prodejce" },
  colCreated:{ da: "Oprettet", en: "Created", de: "Erstellt", it: "Creato", hu: "Létrehozva", sv: "Skapad", fr: "Créé", pl: "Utworzone", cs: "Vytvořeno" },

  // Form
  fTitle:   { da: "Titel *", en: "Title *", de: "Titel *", it: "Titolo *", hu: "Cím *", sv: "Titel *", fr: "Titre *", pl: "Tytuł *", cs: "Název *" },
  fDesc:    { da: "Beskrivelse *", en: "Description *", de: "Beschreibung *", it: "Descrizione *", hu: "Leírás *", sv: "Beskrivning *", fr: "Description *", pl: "Opis *", cs: "Popis *" },
  fSerial:  { da: "Serienummer / maskinnummer *", en: "Serial / machine number *", de: "Serien- / Maschinennummer *", it: "Numero di serie / macchina *", hu: "Gyári / gép szám *", sv: "Serie- / maskinnummer *", fr: "N° de série / machine *", pl: "Nr seryjny / maszyny *", cs: "Sériové / strojní číslo *" },
  fMtype:   { da: "Maskintype", en: "Machine type", de: "Maschinentyp", it: "Tipo macchina", hu: "Gép típusa", sv: "Maskintyp", fr: "Type de machine", pl: "Typ maszyny", cs: "Typ stroje" },
  fDealer:  { da: "Forhandler *", en: "Dealer *", de: "Händler *", it: "Rivenditore *", hu: "Forgalmazó *", sv: "Återförsäljare *", fr: "Concessionnaire *", pl: "Dealer *", cs: "Prodejce *" },
  fCust:    { da: "Kunde / bruger", en: "Customer / user", de: "Kunde / Anwender", it: "Cliente / utente", hu: "Ügyfél / felhasználó", sv: "Kund / användare", fr: "Client / utilisateur", pl: "Klient / użytkownik", cs: "Zákazník / uživatel" },
  fContact: { da: "Kontaktperson", en: "Contact person", de: "Ansprechpartner", it: "Persona di contatto", hu: "Kapcsolattartó", sv: "Kontaktperson", fr: "Personne à contacter", pl: "Osoba kontaktowa", cs: "Kontaktní osoba" },
  fEmail:   { da: "Kontaktmail", en: "Contact email", de: "Kontakt-E-Mail", it: "Email di contatto", hu: "Kapcsolat e-mail", sv: "Kontakt-e-post", fr: "E-mail de contact", pl: "E-mail kontaktowy", cs: "Kontaktní e-mail" },
  fPhone:   { da: "Telefonnummer", en: "Phone number", de: "Telefonnummer", it: "Numero di telefono", hu: "Telefonszám", sv: "Telefonnummer", fr: "Numéro de téléphone", pl: "Numer telefonu", cs: "Telefonní číslo" },
  fHours:   { da: "Driftstimer", en: "Operating hours", de: "Betriebsstunden", it: "Ore di funzionamento", hu: "Üzemórák", sv: "Drifttimmar", fr: "Heures de fonctionnement", pl: "Godziny pracy", cs: "Provozní hodiny" },
  fPrio:    { da: "Prioritet *", en: "Priority *", de: "Priorität *", it: "Priorità *", hu: "Prioritás *", sv: "Prioritet *", fr: "Priorité *", pl: "Priorytet *", cs: "Priorita *" },
  fStatus:  { da: "Status *", en: "Status *", de: "Status *", it: "Stato *", hu: "Státusz *", sv: "Status *", fr: "Statut *", pl: "Status *", cs: "Stav *" },
  fCat:     { da: "Kategori", en: "Category", de: "Kategorie", it: "Categoria", hu: "Kategória", sv: "Kategori", fr: "Catégorie", pl: "Kategoria", cs: "Kategorie" },
  fAssign:  { da: "Ansvarlig Timan-medarbejder", en: "Assigned Timan staff", de: "Zuständige/r Timan-Mitarbeiter/in", it: "Responsabile Timan", hu: "Felelős Timan munkatárs", sv: "Ansvarig Timan-medarbetare", fr: "Collaborateur Timan responsable", pl: "Odpowiedzialny pracownik Timan", cs: "Odpovědný pracovník Timan" },
  cancel:   { da: "Annullér", en: "Cancel", de: "Abbrechen", it: "Annulla", hu: "Mégse", sv: "Avbryt", fr: "Annuler", pl: "Anuluj", cs: "Zrušit" },
  save:     { da: "Opret", en: "Create", de: "Erstellen", it: "Crea", hu: "Létrehozás", sv: "Skapa", fr: "Créer", pl: "Utwórz", cs: "Vytvořit" },
  saving:   { da: "Gemmer…", en: "Saving…", de: "Speichert…", it: "Salvataggio…", hu: "Mentés…", sv: "Sparar…", fr: "Enregistrement…", pl: "Zapisywanie…", cs: "Ukládání…" },
  saved:    { da: "Service ticket oprettet", en: "Service ticket created", de: "Service-Ticket erstellt", it: "Ticket di assistenza creato", hu: "Szervizjegy létrehozva", sv: "Serviceärende skapat", fr: "Ticket de service créé", pl: "Utworzono zgłoszenie serwisowe", cs: "Servisní tiket byl vytvořen" },
  saveErr:  { da: "Kunne ikke oprette ticket. Tjek dine rettigheder og prøv igen.", en: "Could not create ticket. Check your permissions and try again.", de: "Ticket konnte nicht erstellt werden. Berechtigungen prüfen.", it: "Impossibile creare il ticket. Verifica i permessi.", hu: "A jegy létrehozása sikertelen. Ellenőrizze a jogosultságot.", sv: "Kunde inte skapa ärendet. Kontrollera dina behörigheter.", fr: "Impossible de créer le ticket. Vérifiez vos autorisations.", pl: "Nie udało się utworzyć zgłoszenia. Sprawdź uprawnienia.", cs: "Tiket se nepodařilo vytvořit. Zkontrolujte oprávnění." },
  dealerLocked: { da: "Forhandler er låst til din egen organisation.", en: "Dealer is locked to your own organisation.", de: "Händler ist auf Ihre Organisation festgelegt.", it: "Rivenditore bloccato sulla tua organizzazione.", hu: "A forgalmazó a saját szervezetére van rögzítve.", sv: "Återförsäljaren är låst till din egen organisation.", fr: "Le concessionnaire est verrouillé sur votre organisation.", pl: "Dealer jest przypisany do Twojej organizacji.", cs: "Prodejce je uzamčen na vaši organizaci." },
  selectDealer: { da: "Vælg forhandler…", en: "Select dealer…", de: "Händler wählen…", it: "Seleziona rivenditore…", hu: "Válasszon forgalmazót…", sv: "Välj återförsäljare…", fr: "Sélectionner un concessionnaire…", pl: "Wybierz dealera…", cs: "Vyberte prodejce…" },
  required: { da: "Udfyld de obligatoriske felter.", en: "Fill in the required fields.", de: "Bitte Pflichtfelder ausfüllen.", it: "Compila i campi obbligatori.", hu: "Töltse ki a kötelező mezőket.", sv: "Fyll i obligatoriska fält.", fr: "Veuillez remplir les champs obligatoires.", pl: "Wypełnij wymagane pola.", cs: "Vyplňte povinná pole." },
  noDealerLink: { da: "Din bruger er ikke koblet til en forhandlerkonto.", en: "Your user is not linked to a dealer account.", de: "Ihr Benutzer ist keinem Händlerkonto zugeordnet.", it: "Il tuo utente non è collegato a un account rivenditore.", hu: "Felhasználója nincs forgalmazói fiókhoz kapcsolva.", sv: "Din användare är inte kopplad till ett återförsäljarkonto.", fr: "Votre utilisateur n'est pas lié à un compte concessionnaire.", pl: "Twoje konto nie jest powiązane z kontem dealera.", cs: "Váš uživatel není propojen s účtem prodejce." },
  mtypeSelect: { da: "Vælg maskintype…", en: "Select machine type…", de: "Maschinentyp wählen…", it: "Seleziona tipo macchina…", hu: "Válasszon gép típust…", sv: "Välj maskintyp…", fr: "Sélectionner le type de machine…", pl: "Wybierz typ maszyny…", cs: "Vyberte typ stroje…" },
  mtypeOther: { da: "Andet", en: "Other", de: "Andere", it: "Altro", hu: "Egyéb", sv: "Annat", fr: "Autre", pl: "Inne", cs: "Jiné" },
  mtypeOtherLabel: { da: "Anden maskintype", en: "Other machine type", de: "Anderer Maschinentyp", it: "Altro tipo macchina", hu: "Egyéb gép típus", sv: "Annan maskintyp", fr: "Autre type de machine", pl: "Inny typ maszyny", cs: "Jiný typ stroje" },
  mtypeAutoFilled: { da: "Foreslået ud fra serienummer", en: "Suggested from serial number", de: "Vorgeschlagen anhand der Seriennummer", it: "Suggerito dal numero di serie", hu: "Javaslat a gyári szám alapján", sv: "Föreslagen utifrån serienummer", fr: "Suggéré à partir du numéro de série", pl: "Sugerowane na podstawie numeru seryjnego", cs: "Navrženo podle sériového čísla" },
  fEquip: { da: "Redskab / udstyr", en: "Equipment / attachment", de: "Anbaugerät / Ausstattung", it: "Attrezzatura / accessorio", hu: "Eszköz / felszerelés", sv: "Redskap / utrustning", fr: "Équipement / accessoire", pl: "Osprzęt / wyposażenie", cs: "Nástroj / vybavení" },
  equipOtherLabel: { da: "Andet redskab / udstyr", en: "Other equipment", de: "Anderes Anbaugerät", it: "Altra attrezzatura", hu: "Egyéb eszköz", sv: "Annan utrustning", fr: "Autre équipement", pl: "Inne wyposażenie", cs: "Jiné vybavení" },

  // Status labels
  st_created: { da: "Oprettet", en: "Created", de: "Erstellt", it: "Creato", hu: "Létrehozva", sv: "Skapad", fr: "Créé", pl: "Utworzone", cs: "Vytvořeno" },
  st_in_progress: { da: "I gang", en: "In progress", de: "In Bearbeitung", it: "In corso", hu: "Folyamatban", sv: "Pågår", fr: "En cours", pl: "W toku", cs: "Probíhá" },
  st_waiting_timan: { da: "Afventer Timan", en: "Waiting for Timan", de: "Wartet auf Timan", it: "In attesa di Timan", hu: "Timan-ra vár", sv: "Väntar på Timan", fr: "En attente de Timan", pl: "Oczekuje na Timan", cs: "Čeká na Timan" },
  st_waiting_dealer: { da: "Afventer forhandler", en: "Waiting for dealer", de: "Wartet auf Händler", it: "In attesa del rivenditore", hu: "Forgalmazóra vár", sv: "Väntar på återförsäljare", fr: "En attente du concessionnaire", pl: "Oczekuje na dealera", cs: "Čeká na prodejce" },
  st_waiting_customer: { da: "Afventer kunde", en: "Waiting for customer", de: "Wartet auf Kunden", it: "In attesa del cliente", hu: "Ügyfélre vár", sv: "Väntar på kund", fr: "En attente du client", pl: "Oczekuje na klienta", cs: "Čeká na zákazníka" },
  st_waiting_parts: { da: "Afventer reservedele", en: "Waiting for parts", de: "Wartet auf Ersatzteile", it: "In attesa di ricambi", hu: "Alkatrészre vár", sv: "Väntar på reservdelar", fr: "En attente de pièces", pl: "Oczekuje na części", cs: "Čeká na díly" },
  st_resolved: { da: "Løst", en: "Resolved", de: "Gelöst", it: "Risolto", hu: "Megoldva", sv: "Löst", fr: "Résolu", pl: "Rozwiązane", cs: "Vyřešeno" },
  st_closed: { da: "Lukket", en: "Closed", de: "Geschlossen", it: "Chiuso", hu: "Lezárva", sv: "Stängd", fr: "Fermé", pl: "Zamknięte", cs: "Uzavřeno" },

  // Priority labels
  pr_low: { da: "Lav", en: "Low", de: "Niedrig", it: "Bassa", hu: "Alacsony", sv: "Låg", fr: "Faible", pl: "Niski", cs: "Nízká" },
  pr_normal: { da: "Normal", en: "Normal", de: "Normal", it: "Normale", hu: "Normál", sv: "Normal", fr: "Normale", pl: "Normalny", cs: "Normální" },
  pr_high: { da: "Høj", en: "High", de: "Hoch", it: "Alta", hu: "Magas", sv: "Hög", fr: "Élevée", pl: "Wysoki", cs: "Vysoká" },
  pr_critical_machine_stopped: { da: "Kritisk maskinstop", en: "Critical machine stopped", de: "Kritisch / Maschine steht", it: "Critica / macchina ferma", hu: "Kritikus / gép leállt", sv: "Kritisk / maskinen står", fr: "Critique / machine arrêtée", pl: "Krytyczny / maszyna stoi", cs: "Kritická / stroj stojí" },

  // Category labels
  cat_engine: { da: "Motor", en: "Engine", de: "Motor", it: "Motore", hu: "Motor", sv: "Motor", fr: "Moteur", pl: "Silnik", cs: "Motor" },
  cat_hydraulics: { da: "Hydraulik", en: "Hydraulics", de: "Hydraulik", it: "Idraulica", hu: "Hidraulika", sv: "Hydraulik", fr: "Hydraulique", pl: "Hydraulika", cs: "Hydraulika" },
  cat_electronics: { da: "Elektronik", en: "Electronics", de: "Elektronik", it: "Elettronica", hu: "Elektronika", sv: "Elektronik", fr: "Électronique", pl: "Elektronika", cs: "Elektronika" },
  cat_remote_control: { da: "Fjernbetjening", en: "Remote control", de: "Fernbedienung", it: "Telecomando", hu: "Távirányító", sv: "Fjärrkontroll", fr: "Télécommande", pl: "Pilot", cs: "Dálkové ovládání" },
  cat_transmission: { da: "Transmission", en: "Transmission", de: "Getriebe", it: "Trasmissione", hu: "Hajtómű", sv: "Transmission", fr: "Transmission", pl: "Skrzynia biegów", cs: "Převodovka" },
  cat_service: { da: "Service", en: "Service", de: "Service", it: "Assistenza", hu: "Szerviz", sv: "Service", fr: "Service", pl: "Serwis", cs: "Servis" },
  cat_spare_part: { da: "Reservedel", en: "Spare part", de: "Ersatzteil", it: "Ricambio", hu: "Alkatrész", sv: "Reservdel", fr: "Pièce de rechange", pl: "Część zamienna", cs: "Náhradní díl" },
  cat_software: { da: "Software", en: "Software", de: "Software", it: "Software", hu: "Szoftver", sv: "Programvara", fr: "Logiciel", pl: "Oprogramowanie", cs: "Software" },
  cat_safety: { da: "Sikkerhed", en: "Safety", de: "Sicherheit", it: "Sicurezza", hu: "Biztonság", sv: "Säkerhet", fr: "Sécurité", pl: "Bezpieczeństwo", cs: "Bezpečnost" },
  cat_other: { da: "Andet", en: "Other", de: "Sonstiges", it: "Altro", hu: "Egyéb", sv: "Annat", fr: "Autre", pl: "Inne", cs: "Jiné" },

  // Filter bar
  filterSerial: { da: "Maskinnr. / Serienr.", en: "Machine no. / Serial", de: "Masch.-Nr. / Seriennr.", it: "N. macchina / Serie", hu: "Gép sz. / Gyári sz.", sv: "Maskinnr. / Serienr.", fr: "N° machine / Série", pl: "Nr masz. / Seryjny", cs: "Strojní č. / Sériové č." },
  filterDealer: { da: "Forhandler / Konto nr.", en: "Dealer / Account no.", de: "Händler / Kontonr.", it: "Rivenditore / N. conto", hu: "Forgalmazó / Számlasz.", sv: "Återförsäljare / Kontonr.", fr: "Concessionnaire / N° compte", pl: "Dealer / Nr konta", cs: "Prodejce / Č. účtu" },
  filterFromDate: { da: "Fra dato", en: "From date", de: "Von Datum", it: "Da data", hu: "Kezdő dátum", sv: "Från datum", fr: "Date de début", pl: "Od daty", cs: "Od data" },
  filterToDate: { da: "Til dato", en: "To date", de: "Bis Datum", it: "A data", hu: "Záró dátum", sv: "Till datum", fr: "Date de fin", pl: "Do daty", cs: "Do data" },
  filterModel: { da: "Model", en: "Model", de: "Modell", it: "Modello", hu: "Modell", sv: "Modell", fr: "Modèle", pl: "Model", cs: "Model" },
  filterStatus: { da: "Status", en: "Status", de: "Status", it: "Stato", hu: "Státusz", sv: "Status", fr: "Statut", pl: "Status", cs: "Stav" },
  filterAllModels: { da: "Alle modeller", en: "All models", de: "Alle Modelle", it: "Tutti i modelli", hu: "Minden modell", sv: "Alla modeller", fr: "Tous les modèles", pl: "Wszystkie modele", cs: "Všechny modely" },
  filterAllStatuses: { da: "Alle statuser", en: "All statuses", de: "Alle Stati", it: "Tutti gli stati", hu: "Minden státusz", sv: "Alla statusar", fr: "Tous les statuts", pl: "Wszystkie statusy", cs: "Všechny stavy" },
  resetFilters: { da: "Nulstil filtre", en: "Reset filters", de: "Filter zurücksetzen", it: "Reimposta filtri", hu: "Szűrők törlése", sv: "Återställ filter", fr: "Réinitialiser les filtres", pl: "Resetuj filtry", cs: "Obnovit filtry" },
  noFilterMatch: { da: "Ingen service tickets matcher de valgte filtre.", en: "No service tickets match the selected filters.", de: "Keine Service-Tickets entsprechen den Filtern.", it: "Nessun ticket corrisponde ai filtri selezionati.", hu: "Egyetlen szervizjegy sem felel meg a szűrőknek.", sv: "Inga serviceärenden matchar de valda filtren.", fr: "Aucun ticket ne correspond aux filtres sélectionnés.", pl: "Żadne zgłoszenie nie pasuje do filtrów.", cs: "Žádný tiket neodpovídá vybraným filtrům." },
  dateError: { da: "Fra dato skal være før Til dato.", en: "From date must be before To date.", de: "Von-Datum muss vor Bis-Datum liegen.", it: "La data iniziale deve essere precedente a quella finale.", hu: "A kezdő dátumnak a záró dátum előtt kell lennie.", sv: "Från-datum måste vara före Till-datum.", fr: "La date de début doit être antérieure à la date de fin.", pl: "Data początkowa musi być przed datą końcową.", cs: "Počáteční datum musí být před koncovým datem." },
} as const;

const MACHINE_TYPE_OPTIONS = ["RC-751", "RC-1000s", "Timan 3330", "Timan 2620"];
const SERIAL_PREFIX_MAP: Array<{ prefix: string; type: string }> = [
  { prefix: "411000", type: "RC-1000s" },
  { prefix: "410040", type: "RC-751" },
  { prefix: "712000", type: "Timan 3330" },
  { prefix: "999-888", type: "Timan 2620" },
];
const EQUIPMENT_OPTIONS = [
  "Slagleklipper","Y-slagle sæt","Rotorclipper","Fingerripper","Skivehøster",
  "Hammerklipper","Stativ","Fjernbetjening",
];

function suggestMachineType(serial: string): string | null {
  const s = serial.trim();
  if (!s) return null;
  for (const m of SERIAL_PREFIX_MAP) {
    if (s.startsWith(m.prefix)) return m.type;
  }
  return null;
}

const STATUS_OPTIONS = [
  "created","in_progress","waiting_timan","waiting_dealer","waiting_customer",
  "waiting_parts","resolved","closed",
];
const PRIORITY_OPTIONS = ["low","normal","high","critical_machine_stopped"];
const CATEGORY_OPTIONS = [
  "engine","hydraulics","electronics","remote_control","transmission",
  "service","spare_part","software","safety","other",
];

function statusClass(s: string): string {
  const x = (s || "").toLowerCase();
  if (x === "created") return "bg-slate-100 text-slate-700";
  if (x === "in_progress") return "bg-blue-100 text-blue-700";
  if (x.startsWith("waiting_")) return "bg-amber-100 text-amber-700";
  if (x === "resolved") return "bg-green-100 text-green-700";
  if (x === "closed") return "bg-slate-100 text-slate-600";
  if (x.startsWith("converted_")) return "bg-purple-100 text-purple-700";
  return "bg-slate-100 text-slate-700";
}
function prioClass(p: string): string {
  const x = (p || "").toLowerCase();
  if (x === "low") return "bg-sky-100 text-sky-700";
  if (x === "normal") return "bg-slate-100 text-slate-700";
  if (x === "high") return "bg-orange-100 text-orange-700";
  if (x === "critical_machine_stopped") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}
function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    return d.toLocaleString();
  } catch { return v as string; }
}

function statusLabel(v: string, uiLang: PortalUiLanguage | string): string {
  const key = `st_${v}` as keyof typeof T;
  return pickT(T[key] as Record<string, string> | undefined, uiLang) || v;
}
function priorityLabel(v: string, uiLang: PortalUiLanguage | string): string {
  const key = `pr_${v}` as keyof typeof T;
  return pickT(T[key] as Record<string, string> | undefined, uiLang) || v;
}
function categoryLabel(v: string, uiLang: PortalUiLanguage | string): string {
  if (!v) return "—";
  const key = `cat_${v}` as keyof typeof T;
  return pickT(T[key] as Record<string, string> | undefined, uiLang) || v;
}
function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function ticketLocalDate(createdAt: string | null | undefined): string {
  if (!createdAt) return "";
  return toLocalIsoDate(new Date(createdAt));
}

export default function ServiceTicketsPage() {
  const { appUser, logout } = useAppUser();
  const { language: lang, uiLanguage, setLanguage } = useLanguage();
  const uiLang = uiLanguage;
  const navigate = useNavigate();
  const effectiveUser = useEffectivePortalUser(appUser);

  const portalRole = derivePortalRole(effectiveUser);
  const isInternal =
    portalRole === "timan_backend" ||
    portalRole === "timan_seller" ||
    portalRole === "timan_service";

  // Phase 51 — fælles dealer-scope helper. Eksterne roller låses automatisk
  // til egen forhandler. Interne Timan-roller kan fortsat vælge i dropdown.
  const dealerScope = useDealerScope();
  const { scope: teknikScope } = useTeknikScope();

  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);

  // Filter state
  const [serialQuery, setSerialQuery] = useState("");
  const [dealerQuery, setDealerQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modelFilter, setModelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateError, setDateError] = useState<string | null>(null);

  const serialDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dealerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!appUser) {
    navigate("/portal", { replace: true });
    return null;
  }

  const reload = async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const list = await fetchVisibleServiceTickets();
      const scoped = applyScopeFilter(teknikScope, list, (r) => ({
        dealer_number: (r as { dealer_number?: string | null }).dealer_number ?? null,
        dealer_name: (r as { dealer_name?: string | null }).dealer_name ?? null,
      }));
      setTickets(scoped);
    } catch (e) {
      console.error("[ServiceTickets] load error", e);
      setLoadErr(pickT(T.loadErr, uiLang));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [teknikScope]);

  // Auto-open create dialog when navigating from maintenance page
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('create') === '1') {
      setCreateOpen(true);
      params.delete('create');
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);

  const filteredTickets = useMemo(() => {
    const sq = serialQuery.trim().toLowerCase();
    const dq = dealerQuery.trim().toLowerCase();
    const mq = modelFilter !== "all" ? modelFilter.trim().toLowerCase() : "";
    const st = statusFilter !== "all" ? statusFilter.trim().toLowerCase() : "";
    const fromIso = dateFrom || "";
    const toIso = dateTo || "";

    return tickets.filter(t => {
      if (sq) {
        const serial = (t.serial_number || "").toLowerCase();
        const machineNo = (t.ticket_number || "").toLowerCase();
        if (!(serial.includes(sq) || machineNo.includes(sq))) return false;
      }
      if (dq) {
        const dName = (t.dealer_name || "").toLowerCase();
        const dNum = (t.dealer_number || "").toLowerCase();
        if (!(dName.includes(dq) || dNum.includes(dq))) return false;
      }
      if (mq) {
        const mType = (t.machine_type || "").trim().toLowerCase();
        if (mType !== mq) return false;
      }
      if (st) {
        const s = (t.status || "").trim().toLowerCase();
        if (s !== st) return false;
      }
      if (fromIso || toIso) {
        const d = ticketLocalDate(t.created_at);
        if (!d || (fromIso && d < fromIso) || (toIso && d > toIso)) return false;
      }
      return true;
    });
  }, [tickets, serialQuery, dealerQuery, dateFrom, dateTo, modelFilter, statusFilter]);

  const modelOptions = useMemo(() => {
    const set = new Set(
      tickets
        .map(t => (t.machine_type || "").trim())
        .filter(m => m.length > 0)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'da'));
  }, [tickets]);

  const hasActiveFilters = !!(serialQuery.trim() || dealerQuery.trim() || dateFrom || dateTo || (modelFilter && modelFilter !== "all") || (statusFilter && statusFilter !== "all"));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 flex flex-col">
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }}
      />

      <main className="mx-auto max-w-[1700px] px-4 sm:px-6 lg:px-8 py-10 flex-1 w-full">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2d5a27]/10 text-[#2d5a27]">
              <Ticket className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">{tt('mod_service_tickets', uiLanguage)}</h1>
              <p className="mt-1 text-sm text-slate-500">{pickT(T.lead, uiLang)}</p>
            </div>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-[#2d5a27] hover:bg-[#234a1f] text-white"
          >
            <Plus className="h-4 w-4" />
            {pickT(T.createBtn, uiLang)}
          </Button>
        </div>

        {/* Filter bar */}
        {!loading && !loadErr && tickets.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">{pickT(T.filterSerial, uiLang)}</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={serialQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSerialQuery(val);
                      if (serialDebounceRef.current) clearTimeout(serialDebounceRef.current);
                      serialDebounceRef.current = setTimeout(() => {}, 350);
                    }}
                    placeholder={pickT(T.filterSerial, uiLang)}
                    className="w-full h-10 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/30 focus:border-[#2d5a27]"
                  />
                </div>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">{pickT(T.filterDealer, uiLang)}</label>
                <input
                  type="text"
                  value={dealerQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDealerQuery(val);
                    if (dealerDebounceRef.current) clearTimeout(dealerDebounceRef.current);
                    dealerDebounceRef.current = setTimeout(() => {}, 350);
                  }}
                  placeholder="Navn eller konto nr."
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/30 focus:border-[#2d5a27]"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">{pickT(T.filterFromDate, uiLang)}</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDateFrom(val);
                    setDateError(null);
                    if (val && dateTo && val > dateTo) {
                      setDateError(pickT(T.dateError, uiLang));
                    }
                  }}
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/30 focus:border-[#2d5a27]"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">{pickT(T.filterToDate, uiLang)}</label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDateTo(val);
                    setDateError(null);
                    if (dateFrom && val && dateFrom > val) {
                      setDateError(pickT(T.dateError, uiLang));
                    }
                  }}
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/30 focus:border-[#2d5a27]"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">{pickT(T.filterModel, uiLang)}</label>
                <select
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/30 focus:border-[#2d5a27]"
                >
                  <option value="all">{pickT(T.filterAllModels, uiLang)}</option>
                  {modelOptions.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">{pickT(T.filterStatus, uiLang)}</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/30 focus:border-[#2d5a27]"
                >
                  <option value="all">{pickT(T.filterAllStatuses, uiLang)}</option>
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{statusLabel(s, uiLang)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 min-h-[20px]">
              <div className="text-xs text-red-600">{dateError || ""}</div>
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setSerialQuery("");
                    setDealerQuery("");
                    setDateFrom("");
                    setDateTo("");
                    setModelFilter("all");
                    setStatusFilter("all");
                    setDateError(null);
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline"
                >
                  {pickT(T.resetFilters, uiLang)}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> {pickT(T.loading, uiLang)}
            </div>
          ) : loadErr ? (
            <div className="p-10 text-center text-sm text-red-600">{loadErr}</div>
          ) : tickets.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">{pickT(T.empty, uiLang)}</div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">{pickT(T.noFilterMatch, uiLang)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{pickT(T.colNumber, uiLang)}</TableHead>
                  <TableHead>{pickT(T.colTitle, uiLang)}</TableHead>
                  <TableHead>{pickT(T.colSerial, uiLang)}</TableHead>
                  <TableHead>{pickT(T.colStatus, uiLang)}</TableHead>
                  <TableHead>{pickT(T.colPrio, uiLang)}</TableHead>
                  <TableHead>{pickT(T.colDealer, uiLang)}</TableHead>
                  <TableHead>{pickT(T.colCreated, uiLang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => navigate(`/portal/service/tickets/${t.id}`)}
                  >
                    <TableCell className="font-mono text-xs">{t.ticket_number || "—"}</TableCell>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {t.serial_number ? (
                        <Link
                          to={`/portal/service/machines/${encodeURIComponent(t.serial_number)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                          title="Min Maskine"
                        >
                          {t.serial_number}
                        </Link>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={"inline-block rounded-full px-2 py-0.5 text-xs font-semibold " + statusClass(t.status)}>
                        {statusLabel(t.status, uiLang)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={"inline-block rounded-full px-2 py-0.5 text-xs font-semibold " + prioClass(t.priority)}>
                        {priorityLabel(t.priority, uiLang)}
                      </span>
                    </TableCell>
                    <TableCell>{t.dealer_name || "—"}</TableCell>
                    <TableCell className="text-xs text-slate-500">{fmtDate(t.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </main>

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        lang={lang}
        uiLang={uiLang}
        isInternal={isInternal}
        lockedDealerNumber={isInternal ? null : dealerScope.lockedDealerNumber}
        lockedDealerName={isInternal ? null : dealerScope.lockedDealerName}
        onCreated={() => { setCreateOpen(false); reload(); }}
      />

      <PortalFooter language={lang} />
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Create dialog                                                         */
/* -------------------------------------------------------------------- */

function CreateTicketDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Language;
  uiLang: PortalUiLanguage;
  isInternal: boolean;
  lockedDealerNumber: string | null;
  lockedDealerName: string | null;
  onCreated: () => void;
}) {
  const { open, onOpenChange, lang, uiLang, isInternal, lockedDealerNumber, lockedDealerName, onCreated } = props;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [serial, setSerial] = useState("");
  // Machine type: one of MACHINE_TYPE_OPTIONS, "" (none), or "__other__"
  const [mtypeChoice, setMtypeChoice] = useState<string>("");
  const [mtypeOther, setMtypeOther] = useState<string>("");
  const [mtypeAutoFilled, setMtypeAutoFilled] = useState<boolean>(false);
  // Equipment multi-select
  const [equipment, setEquipment] = useState<string[]>([]);
  const [equipmentOther, setEquipmentOther] = useState<string>("");
  const [equipOtherChecked, setEquipOtherChecked] = useState<boolean>(false);

  const [customer, setCustomer] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState<string>("");
  const [priority, setPriority] = useState<string>("normal");
  const [status, setStatus] = useState<string>("created");
  const [category, setCategory] = useState<string>("");
  const [assigned, setAssigned] = useState<string>("");

  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [dealerId, setDealerId] = useState<string>(""); // dealer_account_id for internal users

  const [saving, setSaving] = useState(false);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setTitle(""); setDescription(""); setSerial("");
    setMtypeChoice(""); setMtypeOther(""); setMtypeAutoFilled(false);
    setEquipment([]); setEquipmentOther(""); setEquipOtherChecked(false);
    setCustomer(""); setContact(""); setEmail(""); setPhone(""); setHours("");
    setPriority("normal"); setStatus("created"); setCategory(""); setAssigned("");
    setDealerId("");
  }, [open]);

  // Auto-suggest machine type from serial number.
  // Only overwrite when field is empty OR previously auto-filled.
  const handleSerialChange = (next: string) => {
    setSerial(next);
    const suggested = suggestMachineType(next);
    if (suggested && MACHINE_TYPE_OPTIONS.includes(suggested)) {
      if (mtypeChoice === "" || mtypeAutoFilled) {
        setMtypeChoice(suggested);
        setMtypeAutoFilled(true);
      }
    }
  };

  const handleMtypeChange = (next: string) => {
    setMtypeChoice(next);
    setMtypeAutoFilled(false);
  };

  const toggleEquipment = (item: string, checked: boolean) => {
    setEquipment((prev) =>
      checked ? Array.from(new Set([...prev, item])) : prev.filter((x) => x !== item),
    );
  };

  // Load dealers for internal users
  useEffect(() => {
    if (!open || !isInternal) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchDealerAccounts({ includeDeleted: false });
        if (!cancelled) setDealers(res.rows);
      } catch (e) {
        console.error("[ServiceTickets] dealer fetch failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, isInternal]);

  const selectedDealer = useMemo(
    () => dealers.find((d) => d.id === dealerId) || null,
    [dealers, dealerId],
  );

  const resolvedMtype = (): string | null => {
    if (mtypeChoice === "__other__") return mtypeOther.trim() || null;
    return mtypeChoice.trim() || null;
  };

  const resolvedEquipment = (): string[] => {
    const list = [...equipment];
    if (equipOtherChecked && equipmentOther.trim()) list.push(equipmentOther.trim());
    return list;
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim() || !serial.trim() || !priority || !status) {
      toast.error(pickT(T.required, uiLang));
      return;
    }
    // Resolve dealer info
    let dealer_account_id: string | null = null;
    let dealer_number: string | null = null;
    let dealer_name: string | null = null;
    if (isInternal) {
      if (!selectedDealer) {
        toast.error(pickT(T.required, uiLang));
        return;
      }
      dealer_account_id = selectedDealer.id;
      dealer_number = selectedDealer.account_number;
      dealer_name = selectedDealer.company_name;
    } else {
      dealer_number = lockedDealerNumber;
      dealer_name = lockedDealerName;
      if (!dealer_number) {
        toast.error(pickT(T.noDealerLink, uiLang));
        return;
      }
    }

    // Equipment is stored as an extra line in description for now
    // (no dedicated column yet — temporary).
    const equipList = resolvedEquipment();
    const finalDescription = equipList.length > 0
      ? `${description.trim()}\n\n${pickT(T.fEquip, uiLang)}: ${equipList.join(", ")}`
      : description.trim();

    const input: NewServiceTicketInput = {
      title,
      description: finalDescription,
      serial_number: serial,
      machine_type: resolvedMtype(),
      dealer_account_id, dealer_number, dealer_name,
      customer_name: customer || null,
      contact_person: contact || null,
      contact_email: email || null,
      contact_phone: phone || null,
      operating_hours: hours.trim() === "" ? null : Number(hours),
      priority, status,
      category: category || null,
      assigned_name: assigned || null,
    };

    setSaving(true);
    try {
      await createServiceTicket(input);
      toast.success(pickT(T.saved, uiLang));
      onCreated();
    } catch (e) {
      console.error("[ServiceTickets] create error", e);
      toast.error(pickT(T.saveErr, uiLang));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pickT(T.createBtn, uiLang)}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <div className="md:col-span-2">
            <Label>{pickT(T.fTitle, uiLang)}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label>{pickT(T.fDesc, uiLang)}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </div>

          <div>
            <Label>{pickT(T.fSerial, uiLang)}</Label>
            <Input value={serial} onChange={(e) => handleSerialChange(e.target.value)} />
          </div>
          <div>
            <Label>{pickT(T.fMtype, uiLang)}</Label>
            <select
              value={mtypeChoice}
              onChange={(e) => handleMtypeChange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{pickT(T.mtypeSelect, uiLang)}</option>
              {MACHINE_TYPE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="__other__">{pickT(T.mtypeOther, uiLang)}</option>
            </select>
            {mtypeAutoFilled && mtypeChoice && mtypeChoice !== "__other__" ? (
              <p className="mt-1 text-xs text-slate-500">{pickT(T.mtypeAutoFilled, uiLang)}</p>
            ) : null}
            {mtypeChoice === "__other__" ? (
              <Input
                className="mt-2"
                placeholder={pickT(T.mtypeOtherLabel, uiLang)}
                value={mtypeOther}
                onChange={(e) => setMtypeOther(e.target.value)}
              />
            ) : null}
          </div>

          {/* Equipment / attachment (multi-select). Stored temporarily in description. */}
          <div className="md:col-span-2">
            <Label>{pickT(T.fEquip, uiLang)}</Label>
            <div className="mt-1 grid grid-cols-2 md:grid-cols-3 gap-2 rounded-md border border-input bg-background p-3 text-sm">
              {EQUIPMENT_OPTIONS.map((item) => (
                <label key={item} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={equipment.includes(item)}
                    onChange={(e) => toggleEquipment(item, e.target.checked)}
                  />
                  <span>{item}</span>
                </label>
              ))}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={equipOtherChecked}
                  onChange={(e) => setEquipOtherChecked(e.target.checked)}
                />
                <span>{pickT(T.mtypeOther, uiLang)}</span>
              </label>
            </div>
            {equipOtherChecked ? (
              <Input
                className="mt-2"
                placeholder={pickT(T.equipOtherLabel, uiLang)}
                value={equipmentOther}
                onChange={(e) => setEquipmentOther(e.target.value)}
              />
            ) : null}
          </div>

          {/* Dealer */}
          <div className="md:col-span-2">
            <Label>{pickT(T.fDealer, uiLang)}</Label>
            {isInternal ? (
              <select
                value={dealerId}
                onChange={(e) => setDealerId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{pickT(T.selectDealer, uiLang)}</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.company_name} {d.account_number ? `(${d.account_number})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <Input
                  value={
                    lockedDealerName && lockedDealerNumber
                      ? `${lockedDealerName} (${lockedDealerNumber})`
                      : (lockedDealerName || lockedDealerNumber || "")
                  }
                  readOnly
                  className="bg-slate-50 cursor-default"
                />
                {lockedDealerNumber ? (
                  <p className="mt-1 text-xs text-slate-500">{pickT(T.dealerLocked, uiLang)}</p>
                ) : (
                  <p className="mt-1 text-xs text-red-600">{pickT(T.noDealerLink, uiLang)}</p>
                )}
              </>
            )}
          </div>

          <div>
            <Label>{pickT(T.fCust, uiLang)}</Label>
            <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </div>
          <div>
            <Label>{pickT(T.fContact, uiLang)}</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>

          <div>
            <Label>{pickT(T.fEmail, uiLang)}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>{pickT(T.fPhone, uiLang)}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div>
            <Label>{pickT(T.fHours, uiLang)}</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>

          <div>
            <Label>{pickT(T.fPrio, uiLang)}</Label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{priorityLabel(p, uiLang)}</option>)}
            </select>
          </div>

          <div>
            <Label>{pickT(T.fStatus, uiLang)}</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusLabel(s, uiLang)}</option>)}
            </select>
          </div>

          <div>
            <Label>{pickT(T.fCat, uiLang)}</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{categoryLabel(c, uiLang)}</option>)}
            </select>
          </div>

          <div className="md:col-span-2">
            <Label>{pickT(T.fAssign, uiLang)}</Label>
            <Input value={assigned} onChange={(e) => setAssigned(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {pickT(T.cancel, uiLang)}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-[#2d5a27] hover:bg-[#234a1f] text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? pickT(T.saving, uiLang) : pickT(T.save, uiLang)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
