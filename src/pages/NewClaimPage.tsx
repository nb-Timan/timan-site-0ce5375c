import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  LifeBuoy, AlertCircle, Plus, Trash2, Save, Send, CheckCircle2,
  Building2, User, Wrench, Calendar, FileText, Hammer, Package, Calculator, Paperclip,
} from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Language } from '@/types/configurator';
import { pickT } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import {
  derivePortalRole,
  getPortalPermissions,
  hasModuleAccess,
  getClaimsViewVariant,
  ModuleAccessKey,
} from '@/lib/portalAccess';
import {
  saveClaim,
  ClaimPartLine,
  ClaimWorkLine,
  ClaimStatus,
} from '@/lib/claimsService';

const T = {
  back:        { da: 'Tilbage til sagsoversigt', en: 'Back to claims list', de: 'Zurück zur Fallübersicht', it: 'Torna ai reclami', hu: 'Vissza az ügylistához', sv: 'Tillbaka till ärendelistan', fr: 'Retour à la liste des dossiers', pl: 'Powrót do listy zgłoszeń', cs: 'Zpět na seznam případů' },
  title:       { da: 'Ny sag', en: 'New claim', de: 'Neuer Fall', it: 'Nuovo reclamo', hu: 'Új ügy', sv: 'Nytt ärende', fr: 'Nouveau dossier', pl: 'Nowe zgłoszenie', cs: 'Nový případ' },
  intro:       { da: 'Opret en ny service- eller garantisag.', en: 'Create a new service or warranty case.', de: 'Neuen Service- oder Garantiefall anlegen.', it: 'Crea un nuovo caso.', hu: 'Új szerviz- vagy garanciaeset létrehozása.', sv: 'Skapa ett nytt service- eller garantiärende.', fr: 'Créez un nouveau dossier de service ou de garantie.', pl: 'Utwórz nowe zgłoszenie serwisowe lub gwarancyjne.', cs: 'Vytvořte nový servisní nebo záruční případ.' },
  noAccess:    { da: 'Ingen adgang til oprettelse af sager.', en: 'No access to create claims.', de: 'Kein Zugriff zum Anlegen.', it: 'Nessun accesso alla creazione.', hu: 'Nincs jogosultság új ügy létrehozására.', sv: 'Ingen behörighet att skapa ärenden.', fr: 'Pas d\'accès pour créer des dossiers.', pl: 'Brak dostępu do tworzenia zgłoszeń.', cs: 'Bez přístupu k vytváření případů.' },
  readOnlyMsg: { da: 'Skrivebeskyttet adgang — du kan ikke oprette nye sager.', en: 'Read-only access — you cannot create new claims.', de: 'Nur-Lese-Zugriff — Sie können keine neuen Fälle anlegen.', it: 'Accesso in sola lettura — non puoi creare nuovi reclami.', hu: 'Csak olvasható hozzáférés — nem hozhat létre új ügyet.', sv: 'Skrivskyddad åtkomst — du kan inte skapa nya ärenden.', fr: 'Accès en lecture seule — vous ne pouvez pas créer de dossier.', pl: 'Dostęp tylko do odczytu — nie możesz tworzyć nowych zgłoszeń.', cs: 'Přístup pouze pro čtení — nemůžete vytvářet nové případy.' },
  required:    { da: 'Påkrævet', en: 'Required', de: 'Pflicht', it: 'Obbligatorio', hu: 'Kötelező', sv: 'Obligatoriskt', fr: 'Obligatoire', pl: 'Wymagane', cs: 'Povinné' },
  saveDraft:   { da: 'Gem til senere', en: 'Save for later', de: 'Später speichern', it: 'Salva per dopo', hu: 'Mentés későbbre', sv: 'Spara till senare', fr: 'Enregistrer pour plus tard', pl: 'Zapisz na później', cs: 'Uložit na později' },
  sendTiman:   { da: 'Send til Timan', en: 'Send to Timan', de: 'An Timan senden', it: 'Invia a Timan', hu: 'Küldés a Timan-nak', sv: 'Skicka till Timan', fr: 'Envoyer à Timan', pl: 'Wyślij do Timan', cs: 'Odeslat Timanu' },
  saving:      { da: 'Gemmer…', en: 'Saving…', de: 'Speichert…', it: 'Salvataggio…', hu: 'Mentés…', sv: 'Sparar…', fr: 'Enregistrement…', pl: 'Zapisywanie…', cs: 'Ukládání…' },
  savedDraft:  { da: 'Gemt som kladde', en: 'Saved as draft', de: 'Als Entwurf gespeichert', it: 'Salvato come bozza', hu: 'Vázlatként mentve', sv: 'Sparat som utkast', fr: 'Enregistré comme brouillon', pl: 'Zapisano jako wersję roboczą', cs: 'Uloženo jako koncept' },
  sentOk:      { da: 'Sendt til Timan', en: 'Sent to Timan', de: 'An Timan gesendet', it: 'Inviato a Timan', hu: 'Elküldve a Timan-nak', sv: 'Skickat till Timan', fr: 'Envoyé à Timan', pl: 'Wysłano do Timan', cs: 'Odesláno Timanu' },
  saveError:   { da: 'Kunne ikke gemme. Prøv igen.', en: 'Could not save. Try again.', de: 'Speichern fehlgeschlagen.', it: 'Salvataggio fallito.', hu: 'Mentés sikertelen.', sv: 'Kunde inte spara. Försök igen.', fr: 'Échec de l\'enregistrement. Réessayez.', pl: 'Nie udało się zapisać. Spróbuj ponownie.', cs: 'Nepodařilo se uložit. Zkuste znovu.' },
  validation:  { da: 'Ret venligst de markerede felter.', en: 'Please fix the highlighted fields.', de: 'Bitte markierte Felder korrigieren.', it: 'Correggi i campi evidenziati.', hu: 'Kérlek javítsd a megjelölt mezőket.', sv: 'Vänligen rätta de markerade fälten.', fr: 'Veuillez corriger les champs indiqués.', pl: 'Popraw zaznaczone pola.', cs: 'Opravte označená pole.' },
  progress:    { da: 'Fremdrift', en: 'Progress', de: 'Fortschritt', it: 'Avanzamento', hu: 'Előrehaladás', sv: 'Förlopp', fr: 'Progression', pl: 'Postęp', cs: 'Průběh' },

  step1:       { da: 'Kontakt Timan før start', en: 'Contact Timan before start', de: 'Timan vor Beginn kontaktieren', it: 'Contatta Timan prima di iniziare', hu: 'Lépjen kapcsolatba Timan-nal', sv: 'Kontakta Timan innan start', fr: 'Contactez Timan avant de commencer', pl: 'Skontaktuj się z Timan przed rozpoczęciem', cs: 'Kontaktujte Timan před zahájením' },
  step2:       { da: 'Reklamations nr.', en: 'Claim number', de: 'Reklamationsnummer', it: 'N. reclamo', hu: 'Reklamációs szám', sv: 'Reklamationsnr', fr: 'N° de réclamation', pl: 'Nr reklamacji', cs: 'Číslo reklamace' },
  step3:       { da: 'Forhandler & ejer', en: 'Dealer & owner', de: 'Händler & Eigentümer', it: 'Rivenditore & proprietario', hu: 'Kereskedő & tulajdonos', sv: 'Återförsäljare & ägare', fr: 'Concessionnaire & propriétaire', pl: 'Dealer i właściciel', cs: 'Prodejce a vlastník' },
  step4:       { da: 'Maskin info', en: 'Machine info', de: 'Maschineninfo', it: 'Info macchina', hu: 'Gép adatai', sv: 'Maskininfo', fr: 'Infos machine', pl: 'Informacje o maszynie', cs: 'Informace o stroji' },
  step5:       { da: 'Dato', en: 'Date', de: 'Datum', it: 'Data', hu: 'Dátum', sv: 'Datum', fr: 'Date', pl: 'Data', cs: 'Datum' },
  step6:       { da: 'Beskrivelse', en: 'Description', de: 'Beschreibung', it: 'Descrizione', hu: 'Leírás', sv: 'Beskrivning', fr: 'Description', pl: 'Opis', cs: 'Popis' },
  step7:       { da: 'Reservedele & arbejde', en: 'Parts & work', de: 'Ersatzteile & Arbeit', it: 'Ricambi & lavoro', hu: 'Alkatrészek & munka', sv: 'Reservdelar & arbete', fr: 'Pièces & main d\'œuvre', pl: 'Części i robocizna', cs: 'Díly a práce' },

  sDealer:     { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő', sv: 'Återförsäljare', fr: 'Concessionnaire', pl: 'Dealer', cs: 'Prodejce' },
  sOwner:      { da: 'Ejer / Kunde', en: 'Owner / Customer', de: 'Eigentümer / Kunde', it: 'Proprietario / Cliente', hu: 'Tulajdonos / Ügyfél', sv: 'Ägare / Kund', fr: 'Propriétaire / Client', pl: 'Właściciel / Klient', cs: 'Vlastník / Zákazník' },
  sMachine:    { da: 'Maskininformation', en: 'Machine information', de: 'Maschineninformation', it: 'Informazioni macchina', hu: 'Gép adatai', sv: 'Maskininformation', fr: 'Informations machine', pl: 'Informacje o maszynie', cs: 'Informace o stroji' },
  sDates:      { da: 'Datoer', en: 'Dates', de: 'Daten', it: 'Date', hu: 'Dátumok', sv: 'Datum', fr: 'Dates', pl: 'Daty', cs: 'Data' },
  sFault:      { da: 'Fejlbeskrivelse', en: 'Fault description', de: 'Fehlerbeschreibung', it: 'Descrizione del guasto', hu: 'Hibaleírás', sv: 'Felbeskrivning', fr: 'Description de la panne', pl: 'Opis usterki', cs: 'Popis závady' },
  sRepair:     { da: 'Reparationsbeskrivelse', en: 'Repair description', de: 'Reparaturbeschreibung', it: 'Descrizione riparazione', hu: 'Javítás leírása', sv: 'Reparationsbeskrivning', fr: 'Description de la réparation', pl: 'Opis naprawy', cs: 'Popis opravy' },
  sPartsWork:  { da: 'Reservedele & arbejde', en: 'Parts & work', de: 'Ersatzteile & Arbeit', it: 'Ricambi & lavoro', hu: 'Alkatrészek & munka', sv: 'Reservdelar & arbete', fr: 'Pièces & main d\'œuvre', pl: 'Części i robocizna', cs: 'Díly a práce' },
  sParts:      { da: 'Reservedele', en: 'Spare parts', de: 'Ersatzteile', it: 'Ricambi', hu: 'Pótalkatrészek', sv: 'Reservdelar', fr: 'Pièces de rechange', pl: 'Części zamienne', cs: 'Náhradní díly' },
  sWork:       { da: 'Arbejdslinjer', en: 'Work lines', de: 'Arbeitspositionen', it: 'Voci di lavoro', hu: 'Munkasorok', sv: 'Arbetsrader', fr: 'Lignes de main d\'œuvre', pl: 'Pozycje robocizny', cs: 'Pracovní položky' },
  sService:    { da: 'Service', en: 'Service', de: 'Service', it: 'Servizio', hu: 'Szerviz', sv: 'Service', fr: 'Service', pl: 'Serwis', cs: 'Servis' },
  sTotals:     { da: 'Totaloversigt', en: 'Total overview', de: 'Gesamtübersicht', it: 'Totale', hu: 'Összesítés', sv: 'Totalöversikt', fr: 'Récapitulatif', pl: 'Podsumowanie', cs: 'Souhrn' },
  sFiles:      { da: 'Vedhæftninger', en: 'Attachments', de: 'Anhänge', it: 'Allegati', hu: 'Csatolmányok', sv: 'Bilagor', fr: 'Pièces jointes', pl: 'Załączniki', cs: 'Přílohy' },
  filesSoon:   { da: 'Upload kommer snart.', en: 'Upload coming soon.', de: 'Upload folgt bald.', it: 'Caricamento in arrivo.', hu: 'A feltöltés hamarosan elérhető.', sv: 'Uppladdning kommer snart.', fr: 'Téléversement bientôt disponible.', pl: 'Wgrywanie wkrótce.', cs: 'Nahrávání brzy.' },

  fCompany:    { da: 'Firma', en: 'Company', de: 'Firma', it: 'Azienda', hu: 'Cégnév', sv: 'Företag', fr: 'Société', pl: 'Firma', cs: 'Společnost' },
  fContact:    { da: 'Kontaktperson', en: 'Contact person', de: 'Ansprechpartner', it: 'Contatto', hu: 'Kapcsolattartó', sv: 'Kontaktperson', fr: 'Personne à contacter', pl: 'Osoba kontaktowa', cs: 'Kontaktní osoba' },
  fEmail:      { da: 'E-mail', en: 'Email', de: 'E-Mail', it: 'Email', hu: 'E-mail', sv: 'E-post', fr: 'E-mail', pl: 'E-mail', cs: 'E-mail' },
  fPhone:      { da: 'Telefon', en: 'Phone', de: 'Telefon', it: 'Telefono', hu: 'Telefon', sv: 'Telefon', fr: 'Téléphone', pl: 'Telefon', cs: 'Telefon' },
  fName:       { da: 'Navn', en: 'Name', de: 'Name', it: 'Nome', hu: 'Név', sv: 'Namn', fr: 'Nom', pl: 'Imię i nazwisko', cs: 'Jméno' },
  fModel:      { da: 'Model', en: 'Model', de: 'Modell', it: 'Modello', hu: 'Modell', sv: 'Modell', fr: 'Modèle', pl: 'Model', cs: 'Model' },
  fSerial:     { da: 'Serienummer', en: 'Serial number', de: 'Seriennummer', it: 'N. di serie', hu: 'Sorozatszám', sv: 'Serienummer', fr: 'Numéro de série', pl: 'Numer seryjny', cs: 'Sériové číslo' },
  fYear:       { da: 'Årgang', en: 'Year', de: 'Baujahr', it: 'Anno', hu: 'Év', sv: 'Årsmodell', fr: 'Année', pl: 'Rok', cs: 'Rok' },
  fDelivery:   { da: 'Leveringsdato', en: 'Delivery date', de: 'Lieferdatum', it: 'Consegna', hu: 'Szállítás dátuma', sv: 'Leveransdatum', fr: 'Date de livraison', pl: 'Data dostawy', cs: 'Datum dodání' },
  fFault:      { da: 'Fejldato', en: 'Fault date', de: 'Fehlerdatum', it: 'Data guasto', hu: 'Hiba dátuma', sv: 'Feldatum', fr: 'Date de la panne', pl: 'Data usterki', cs: 'Datum závady' },
  fRepair:     { da: 'Reparationsdato', en: 'Repair date', de: 'Reparaturdatum', it: 'Data riparazione', hu: 'Javítás dátuma', sv: 'Reparationsdatum', fr: 'Date de réparation', pl: 'Data naprawy', cs: 'Datum opravy' },
  fHours:      { da: 'Arbejdstimer', en: 'Work hours', de: 'Arbeitsstunden', it: 'Ore di lavoro', hu: 'Munkaóra', sv: 'Arbetstimmar', fr: 'Heures de travail', pl: 'Godziny pracy', cs: 'Pracovní hodiny' },
  fKm:         { da: 'Kørte km', en: 'Driven km', de: 'Gefahrene km', it: 'Km percorsi', hu: 'Megtett km', sv: 'Körda km', fr: 'Km parcourus', pl: 'Przejechane km', cs: 'Ujeté km' },
  fPart:       { da: 'Reservedelsnr.', en: 'Part #', de: 'Ersatzteil-Nr.', it: 'N. ricambio', hu: 'Alkatrész szám', sv: 'Reservdelsnr', fr: 'N° de pièce', pl: 'Nr części', cs: 'Č. dílu' },
  fDesc:       { da: 'Beskrivelse', en: 'Description', de: 'Beschreibung', it: 'Descrizione', hu: 'Leírás', sv: 'Beskrivning', fr: 'Description', pl: 'Opis', cs: 'Popis' },
  fQty:        { da: 'Antal', en: 'Qty', de: 'Menge', it: 'Q.tà', hu: 'Db', sv: 'Antal', fr: 'Qté', pl: 'Ilość', cs: 'Množství' },
  fUnit:       { da: 'Stykpris (netto)', en: 'Unit price (net)', de: 'Stückpreis (netto)', it: 'Prezzo unitario (netto)', hu: 'Egységár (nettó)', sv: 'Styckpris (netto)', fr: 'Prix unitaire (net)', pl: 'Cena jedn. (netto)', cs: 'Jedn. cena (netto)' },
  fRate:       { da: 'Timepris (netto)', en: 'Hourly rate (net)', de: 'Stundensatz (netto)', it: 'Tariffa oraria (netta)', hu: 'Óradíj (nettó)', sv: 'Timpris (netto)', fr: 'Taux horaire (net)', pl: 'Stawka godz. (netto)', cs: 'Hodinová sazba (netto)' },
  fLineHours:  { da: 'Timer', en: 'Hours', de: 'Std.', it: 'Ore', hu: 'Óra', sv: 'Timmar', fr: 'Heures', pl: 'Godziny', cs: 'Hodiny' },
  addPart:     { da: 'Tilføj reservedel', en: 'Add part', de: 'Ersatzteil hinzufügen', it: 'Aggiungi ricambio', hu: 'Alkatrész hozzáadása', sv: 'Lägg till reservdel', fr: 'Ajouter une pièce', pl: 'Dodaj część', cs: 'Přidat díl' },
  addWork:     { da: 'Tilføj arbejdslinje', en: 'Add work line', de: 'Arbeitszeile hinzufügen', it: 'Aggiungi lavoro', hu: 'Munkasor hozzáadása', sv: 'Lägg till arbetsrad', fr: 'Ajouter une ligne de travail', pl: 'Dodaj pozycję robocizny', cs: 'Přidat pracovní položku' },
  partsTotal:  { da: 'Reservedele i alt', en: 'Parts total', de: 'Ersatzteile gesamt', it: 'Totale ricambi', hu: 'Alkatrészek összesen', sv: 'Reservdelar totalt', fr: 'Total pièces', pl: 'Suma części', cs: 'Díly celkem' },
  workTotal:   { da: 'Arbejde i alt', en: 'Work total', de: 'Arbeit gesamt', it: 'Totale lavoro', hu: 'Munka összesen', sv: 'Arbete totalt', fr: 'Total main d\'œuvre', pl: 'Suma robocizny', cs: 'Práce celkem' },
  total:       { da: 'I alt (netto)', en: 'Total (net)', de: 'Gesamt (netto)', it: 'Totale (netto)', hu: 'Összesen (nettó)', sv: 'Totalt (netto)', fr: 'Total (net)', pl: 'Razem (netto)', cs: 'Celkem (netto)' },

  viewInternal:{ da: 'Intern visning', en: 'Internal view', de: 'Interne Ansicht', it: 'Vista interna', hu: 'Belső nézet', sv: 'Intern vy', fr: 'Vue interne', pl: 'Widok wewnętrzny', cs: 'Interní zobrazení' },
  viewDealer:  { da: 'Forhandlervisning', en: 'Dealer view', de: 'Händleransicht', it: 'Vista rivenditore', hu: 'Kereskedői nézet', sv: 'Återförsäljarvy', fr: 'Vue concessionnaire', pl: 'Widok dealera', cs: 'Zobrazení prodejce' },
} as const;

// ---- Validation ----
const lineSchemaPart = z.object({
  description: z.string().trim().max(200),
  part_number: z.string().trim().max(100).optional(),
  quantity: z.number().min(0).max(100000),
  unit_price_net: z.number().min(0).max(10_000_000),
});
const lineSchemaWork = z.object({
  description: z.string().trim().max(200),
  hours: z.number().min(0).max(10000),
  hourly_rate_net: z.number().min(0).max(100000),
});

const formSchema = z.object({
  dealer_company: z.string().trim().min(1, 'required').max(150),
  dealer_contact: z.string().trim().max(100).optional(),
  dealer_email: z.string().trim().email('email').max(255).optional().or(z.literal('')),
  dealer_phone: z.string().trim().max(50).optional(),
  customer_name: z.string().trim().min(1, 'required').max(150),
  customer_contact: z.string().trim().max(100).optional(),
  customer_email: z.string().trim().email('email').max(255).optional().or(z.literal('')),
  customer_phone: z.string().trim().max(50).optional(),
  machine_model: z.string().trim().min(1, 'required').max(100),
  machine_serial: z.string().trim().min(1, 'required').max(100),
  machine_year: z.string().trim().max(10).optional(),
  delivery_date: z.string().optional(),
  fault_date: z.string().optional(),
  repair_date: z.string().optional(),
  description: z.string().trim().min(1, 'required').max(4000),
  repair_description: z.string().trim().max(4000).optional(),
  work_hours: z.number().min(0).max(100000),
  driven_km: z.number().min(0).max(10_000_000),
});

type FormState = {
  dealer_company: string;
  dealer_contact: string;
  dealer_email: string;
  dealer_phone: string;
  customer_name: string;
  customer_contact: string;
  customer_email: string;
  customer_phone: string;
  machine_model: string;
  machine_serial: string;
  machine_year: string;
  delivery_date: string;
  fault_date: string;
  repair_date: string;
  description: string;
  repair_description: string;
  work_hours: string;
  driven_km: string;
};

const initial: FormState = {
  dealer_company: '', dealer_contact: '', dealer_email: '', dealer_phone: '',
  customer_name: '', customer_contact: '', customer_email: '', customer_phone: '',
  machine_model: '', machine_serial: '', machine_year: '',
  delivery_date: '', fault_date: '', repair_date: '',
  description: '', repair_description: '',
  work_hours: '', driven_km: '',
};

function uid() {
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toNonNegNumber(s: string): number {
  const n = Number(String(s).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

const BRAND = '#2d5a27';

export default function NewClaimPage() {
  const { appUser, loading: authLoading, logout } = useAppUser();
  const { language: lang, uiLanguage, setLanguage } = useLanguage();
  const uiLang: PortalUiLanguage = uiLanguage;
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(initial);
  const [parts, setParts] = useState<ClaimPartLine[]>([
    { id: uid(), description: '', quantity: 0, unit_price_net: 0 },
  ]);
  const [workLines, setWorkLines] = useState<ClaimWorkLine[]>([
    { id: uid(), description: '', hours: 0, hourly_rate_net: 0 },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<null | ClaimStatus>(null);
  const [done, setDone] = useState<{ id: string; status: ClaimStatus } | null>(null);

  const partsTotal = useMemo(
    () => parts.reduce((s, p) => s + (p.quantity || 0) * (p.unit_price_net || 0), 0),
    [parts]
  );
  const workTotal = useMemo(
    () => workLines.reduce((s, w) => s + (w.hours || 0) * (w.hourly_rate_net || 0), 0),
    [workLines]
  );
  const total = partsTotal + workTotal;

  // Progress steps — match the actual claim form sections (7 total).
  // 1. Kontakt Timan før start  → informational, always considered done on entry
  // 2. Reklamations nr.         → auto-generated on save, always considered done
  // 3. Forhandler & ejer        → dealer_company + customer_name
  // 4. Maskin info              → machine_model + machine_serial
  // 5. Dato                     → at least one of delivery/fault/repair date
  // 6. Beskrivelse              → fault description
  // 7. Reservedele & arbejde    → at least one parts or work line with content
  const stepDone: boolean[] = [
    true,
    true,
    !!form.dealer_company.trim() && !!form.customer_name.trim(),
    !!form.machine_model.trim() && !!form.machine_serial.trim(),
    !!(form.fault_date || form.repair_date || form.delivery_date),
    !!form.description.trim(),
    parts.some(p => p.description || p.part_number || p.quantity || p.unit_price_net) ||
      workLines.some(w => w.description || w.hours || w.hourly_rate_net),
  ];
  const completedSteps = stepDone.filter(Boolean).length;
  const progressPct = Math.round((completedSteps / stepDone.length) * 100);

  // Toast for read-only / no-access roles when they hit the route
  useEffect(() => {
    if (authLoading || !appUser) return;
    const role = derivePortalRole(appUser);
    const perms = role ? getPortalPermissions(role) : null;
    const explicitCanCreateClaim = appUser.permissions?.can_create_claims === true;
    if (perms && !perms.canCreateClaim && !explicitCanCreateClaim) {
      toast.error(role === 'dealer_user' ? pickT(T.readOnlyMsg, uiLang) : pickT(T.noAccess, uiLang));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, appUser?.email]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === 'slutkunde') return <Navigate to="/configurator" replace />;

  const portalRole = derivePortalRole(appUser);
  const allowed = hasModuleAccess(portalRole, 'claims', (appUser.module_access as ModuleAccessKey[] | null | undefined) ?? null);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;
  const canCreate = !!perms?.canCreateClaim || appUser.permissions?.can_create_claims === true;
  const viewVariant = getClaimsViewVariant(portalRole);

  // Hard redirect for roles that cannot create claims
  if (!allowed || !canCreate) {
    return <Navigate to="/portal/service/claims" replace />;
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key as string]) {
      setErrors(prev => { const n = { ...prev }; delete n[key as string]; return n; });
    }
  }

  function validate(): { ok: boolean; values?: z.infer<typeof formSchema> } {
    const candidate = {
      ...form,
      work_hours: toNonNegNumber(form.work_hours || '0'),
      driven_km: toNonNegNumber(form.driven_km || '0'),
    };
    const res = formSchema.safeParse(candidate);
    if (!res.success) {
      const map: Record<string, string> = {};
      for (const issue of res.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !map[key]) map[key] = issue.message;
      }
      setErrors(map);
      return { ok: false };
    }
    for (const p of parts) {
      if (!p.description && !p.part_number && !p.quantity && !p.unit_price_net) continue;
      if (!lineSchemaPart.safeParse(p).success) {
        toast.error(pickT(T.validation, uiLang));
        return { ok: false };
      }
    }
    for (const w of workLines) {
      if (!w.description && !w.hours && !w.hourly_rate_net) continue;
      if (!lineSchemaWork.safeParse(w).success) {
        toast.error(pickT(T.validation, uiLang));
        return { ok: false };
      }
    }
    setErrors({});
    return { ok: true, values: res.data };
  }

  async function handleSubmit(status: ClaimStatus) {
    if (!canCreate) return;
    const { ok, values } = validate();
    if (!ok || !values) {
      toast.error(pickT(T.validation, uiLang));
      return;
    }
    setSubmitting(status);
    try {
      const cleanParts = parts.filter(p => p.description || p.part_number || p.quantity || p.unit_price_net);
      const cleanWork = workLines.filter(w => w.description || w.hours || w.hourly_rate_net);
      const res = await saveClaim({
        dealer_company: values.dealer_company,
        dealer_contact: values.dealer_contact || null,
        dealer_email: values.dealer_email || null,
        dealer_phone: values.dealer_phone || null,
        customer_name: values.customer_name,
        customer_contact: values.customer_contact || null,
        customer_email: values.customer_email || null,
        customer_phone: values.customer_phone || null,
        machine_model: values.machine_model,
        machine_serial: values.machine_serial,
        machine_year: values.machine_year || null,
        delivery_date: values.delivery_date || null,
        fault_date: values.fault_date || null,
        repair_date: values.repair_date || null,
        description: values.description,
        repair_description: values.repair_description || null,
        work_hours: values.work_hours,
        driven_km: values.driven_km,
        parts: cleanParts,
        work_lines: cleanWork,
        total_price_net: total,
        created_by_email: appUser.email,
      }, status);

      toast.success(status === 'draft' ? pickT(T.savedDraft, uiLang) : pickT(T.sentOk, uiLang));
      setDone({ id: res.claim.id, status });
    } catch {
      toast.error(pickT(T.saveError, uiLang));
    } finally {
      setSubmitting(null);
    }
  }

  const inputCls = (key: string, extra = '') =>
    `w-full rounded-md border px-3 py-2 text-sm bg-white transition-colors ${
      errors[key] ? 'border-rose-400 focus:outline-rose-500' : 'border-gray-300 focus:border-[#2d5a27] focus:outline-[#2d5a27]'
    } ${extra}`;

  const fmtMoney = (n: number) =>
    n.toLocaleString(lang === 'en' ? 'en-GB' : lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />

      {/* ===== Service-Portal style topbar ===== */}
      <div className="text-white" style={{ background: `linear-gradient(135deg, ${BRAND} 0%, #1f3f1c 100%)` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/15 backdrop-blur rounded-xl flex items-center justify-center ring-1 ring-white/20">
                <LifeBuoy className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{pickT(T.title, uiLang)}</h1>
                <p className="text-white/80 mt-1 text-sm">{pickT(T.intro, uiLang)}</p>
              </div>
            </div>
            {viewVariant !== 'none' && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/15 text-white ring-1 ring-white/20">
                {viewVariant === 'internal' ? pickT(T.viewInternal, uiLang) : pickT(T.viewDealer, uiLang)}
              </span>
            )}
          </div>

          {/* Progress / step bar */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-white/70 mb-2">
              <span>{pickT(T.progress, uiLang)}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-500 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-3 hidden md:flex items-center justify-between gap-2 text-[11px] text-white/80">
              {[pickT(T.step1, uiLang), pickT(T.step2, uiLang), pickT(T.step3, uiLang), pickT(T.step4, uiLang), pickT(T.step5, uiLang), pickT(T.step6, uiLang), pickT(T.step7, uiLang)].map((s, i) => {
                const done = stepDone[i];
                const active = !done && stepDone.slice(0, i).every(Boolean);
                return (
                  <div key={s} className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={[
                        'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-colors',
                        done
                          ? 'bg-white text-[#2d5a27] ring-1 ring-white'
                          : active
                            ? 'bg-white/30 text-white ring-1 ring-white/60'
                            : 'bg-white/10 text-white/70 ring-1 ring-white/20',
                      ].join(' ')}
                    >
                      {done ? '✓' : i + 1}
                    </span>
                    <span className={`font-medium truncate ${done ? 'text-white' : active ? 'text-white' : 'text-white/70'}`}>{s}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full">
        {done ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center max-w-2xl mx-auto">
            <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {done.status === 'draft' ? pickT(T.savedDraft, uiLang) : pickT(T.sentOk, uiLang)}
            </h2>
            <p className="text-sm text-gray-500 mb-6">#{done.id}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/portal/service/claims')}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50"
              >
                {pickT(T.back, uiLang)}
              </button>
              <button
                onClick={() => navigate(`/portal/service/claims/${done.id}`)}
                className="px-4 py-2 rounded-lg bg-[#2d5a27] text-white text-sm font-semibold hover:bg-[#244820]"
              >
                {pickT(T.title, uiLang)} →
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); handleSubmit('submitted'); }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* ===== Left column: form sections ===== */}
            <div className="lg:col-span-2 space-y-6">
              <Section title={pickT(T.sDealer, uiLang)} icon={<Building2 className="h-4 w-4" />}>
                <Grid>
                  <FieldText label={pickT(T.fCompany, uiLang)} required value={form.dealer_company} onChange={(v) => setField('dealer_company', v)} cls={inputCls('dealer_company')} error={errors.dealer_company} />
                  <FieldText label={pickT(T.fContact, uiLang)} value={form.dealer_contact} onChange={(v) => setField('dealer_contact', v)} cls={inputCls('dealer_contact')} />
                  <FieldText label={pickT(T.fEmail, uiLang)} type="email" value={form.dealer_email} onChange={(v) => setField('dealer_email', v)} cls={inputCls('dealer_email')} error={errors.dealer_email} />
                  <FieldText label={pickT(T.fPhone, uiLang)} value={form.dealer_phone} onChange={(v) => setField('dealer_phone', v)} cls={inputCls('dealer_phone')} />
                </Grid>
              </Section>

              <Section title={pickT(T.sOwner, uiLang)} icon={<User className="h-4 w-4" />}>
                <Grid>
                  <FieldText label={pickT(T.fName, uiLang)} required value={form.customer_name} onChange={(v) => setField('customer_name', v)} cls={inputCls('customer_name')} error={errors.customer_name} />
                  <FieldText label={pickT(T.fContact, uiLang)} value={form.customer_contact} onChange={(v) => setField('customer_contact', v)} cls={inputCls('customer_contact')} />
                  <FieldText label={pickT(T.fEmail, uiLang)} type="email" value={form.customer_email} onChange={(v) => setField('customer_email', v)} cls={inputCls('customer_email')} error={errors.customer_email} />
                  <FieldText label={pickT(T.fPhone, uiLang)} value={form.customer_phone} onChange={(v) => setField('customer_phone', v)} cls={inputCls('customer_phone')} />
                </Grid>
              </Section>

              <Section title={pickT(T.sMachine, uiLang)} icon={<Wrench className="h-4 w-4" />}>
                <Grid>
                  <FieldText label={pickT(T.fModel, uiLang)} required value={form.machine_model} onChange={(v) => setField('machine_model', v)} cls={inputCls('machine_model')} error={errors.machine_model} />
                  <FieldText label={pickT(T.fSerial, uiLang)} required value={form.machine_serial} onChange={(v) => setField('machine_serial', v)} cls={inputCls('machine_serial')} error={errors.machine_serial} />
                  <FieldText label={pickT(T.fYear, uiLang)} value={form.machine_year} onChange={(v) => setField('machine_year', v)} cls={inputCls('machine_year')} />
                </Grid>
              </Section>

              <Section title={pickT(T.sDates, uiLang)} icon={<Calendar className="h-4 w-4" />}>
                <Grid cols={3}>
                  <FieldText label={pickT(T.fDelivery, uiLang)} type="date" value={form.delivery_date} onChange={(v) => setField('delivery_date', v)} cls={inputCls('delivery_date')} />
                  <FieldText label={pickT(T.fFault, uiLang)} type="date" value={form.fault_date} onChange={(v) => setField('fault_date', v)} cls={inputCls('fault_date')} />
                  <FieldText label={pickT(T.fRepair, uiLang)} type="date" value={form.repair_date} onChange={(v) => setField('repair_date', v)} cls={inputCls('repair_date')} />
                </Grid>
              </Section>

              <Section title={pickT(T.sFault, uiLang)} icon={<FileText className="h-4 w-4" />}>
                <Label>
                  {pickT(T.fDesc, uiLang)} <span className="text-rose-500">*</span>
                </Label>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  className={inputCls('description')}
                  placeholder={pickT(T.sFault, uiLang)}
                />
                {errors.description && <p className="mt-1 text-xs text-rose-600">{pickT(T.required, uiLang)}</p>}
              </Section>

              <Section title={pickT(T.sRepair, uiLang)} icon={<Hammer className="h-4 w-4" />}>
                <textarea
                  rows={4}
                  value={form.repair_description}
                  onChange={(e) => setField('repair_description', e.target.value)}
                  className={inputCls('repair_description')}
                  placeholder={pickT(T.sRepair, uiLang)}
                />
                <div className="mt-4">
                  <Grid>
                    <FieldNumber label={pickT(T.fHours, uiLang)} value={form.work_hours} onChange={(v) => setField('work_hours', v)} cls={inputCls('work_hours')} />
                    <FieldNumber label={pickT(T.fKm, uiLang)} value={form.driven_km} onChange={(v) => setField('driven_km', v)} cls={inputCls('driven_km')} />
                  </Grid>
                </div>
              </Section>

              {/* ===== Combined Reservedele & arbejde ===== */}
              <Section title={pickT(T.sPartsWork, uiLang)} icon={<Package className="h-4 w-4" />}>
                {/* Parts subsection */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-[#2d5a27] uppercase tracking-wide">{pickT(T.sParts, uiLang)}</h3>
                    <span className="text-xs text-gray-500">{pickT(T.partsTotal, uiLang)}: <strong className="text-gray-900">{fmtMoney(partsTotal)}</strong></span>
                  </div>
                  <div className="space-y-2">
                    {parts.map((p, idx) => (
                      <div key={p.id} className="grid grid-cols-12 gap-2 items-end bg-gray-50/60 border border-gray-100 rounded-lg p-3">
                        <div className="col-span-12 md:col-span-3">
                          <Label>{pickT(T.fPart, uiLang)}</Label>
                          <input className={inputCls('')} value={p.part_number || ''} onChange={(e) => {
                            const v = e.target.value;
                            setParts(prev => prev.map((x, i) => i === idx ? { ...x, part_number: v } : x));
                          }} />
                        </div>
                        <div className="col-span-12 md:col-span-4">
                          <Label>{pickT(T.fDesc, uiLang)}</Label>
                          <input className={inputCls('')} value={p.description} onChange={(e) => {
                            const v = e.target.value;
                            setParts(prev => prev.map((x, i) => i === idx ? { ...x, description: v } : x));
                          }} />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <Label>{pickT(T.fQty, uiLang)}</Label>
                          <input type="number" min={0} step="1" className={inputCls('')} value={p.quantity || ''} onChange={(e) => {
                            const v = toNonNegNumber(e.target.value);
                            setParts(prev => prev.map((x, i) => i === idx ? { ...x, quantity: v } : x));
                          }} />
                        </div>
                        <div className="col-span-7 md:col-span-2">
                          <Label>{pickT(T.fUnit, uiLang)}</Label>
                          <input type="number" min={0} step="0.01" className={inputCls('')} value={p.unit_price_net || ''} onChange={(e) => {
                            const v = toNonNegNumber(e.target.value);
                            setParts(prev => prev.map((x, i) => i === idx ? { ...x, unit_price_net: v } : x));
                          }} />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <button type="button" onClick={() => setParts(prev => prev.filter((_, i) => i !== idx))} className="p-2 text-gray-400 hover:text-rose-600" aria-label="remove">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setParts(prev => [...prev, { id: uid(), description: '', quantity: 0, unit_price_net: 0 }])}
                      className="inline-flex items-center gap-1 text-[#2d5a27] text-sm font-semibold hover:underline"
                    >
                      <Plus className="h-4 w-4" /> {pickT(T.addPart, uiLang)}
                    </button>
                  </div>
                </div>

                <div className="border-t border-gray-100 my-4" />

                {/* Work subsection */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-[#2d5a27] uppercase tracking-wide">{pickT(T.sWork, uiLang)}</h3>
                    <span className="text-xs text-gray-500">{pickT(T.workTotal, uiLang)}: <strong className="text-gray-900">{fmtMoney(workTotal)}</strong></span>
                  </div>
                  <div className="space-y-2">
                    {workLines.map((w, idx) => (
                      <div key={w.id} className="grid grid-cols-12 gap-2 items-end bg-gray-50/60 border border-gray-100 rounded-lg p-3">
                        <div className="col-span-12 md:col-span-6">
                          <Label>{pickT(T.fDesc, uiLang)}</Label>
                          <input className={inputCls('')} value={w.description} onChange={(e) => {
                            const v = e.target.value;
                            setWorkLines(prev => prev.map((x, i) => i === idx ? { ...x, description: v } : x));
                          }} />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <Label>{pickT(T.fLineHours, uiLang)}</Label>
                          <input type="number" min={0} step="0.25" className={inputCls('')} value={w.hours || ''} onChange={(e) => {
                            const v = toNonNegNumber(e.target.value);
                            setWorkLines(prev => prev.map((x, i) => i === idx ? { ...x, hours: v } : x));
                          }} />
                        </div>
                        <div className="col-span-7 md:col-span-3">
                          <Label>{pickT(T.fRate, uiLang)}</Label>
                          <input type="number" min={0} step="0.01" className={inputCls('')} value={w.hourly_rate_net || ''} onChange={(e) => {
                            const v = toNonNegNumber(e.target.value);
                            setWorkLines(prev => prev.map((x, i) => i === idx ? { ...x, hourly_rate_net: v } : x));
                          }} />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <button type="button" onClick={() => setWorkLines(prev => prev.filter((_, i) => i !== idx))} className="p-2 text-gray-400 hover:text-rose-600" aria-label="remove">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setWorkLines(prev => [...prev, { id: uid(), description: '', hours: 0, hourly_rate_net: 0 }])}
                      className="inline-flex items-center gap-1 text-[#2d5a27] text-sm font-semibold hover:underline"
                    >
                      <Plus className="h-4 w-4" /> {pickT(T.addWork, uiLang)}
                    </button>
                  </div>
                </div>
              </Section>

              <Section title={pickT(T.sFiles, uiLang)} icon={<Paperclip className="h-4 w-4" />}>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
                  {pickT(T.filesSoon, uiLang)}
                </div>
              </Section>
            </div>

            {/* ===== Right column: sticky overview ===== */}
            <aside className="lg:col-span-1">
              <div className="sticky top-6 space-y-4">
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                  <div
                    className="px-5 py-3 text-white flex items-center gap-2"
                    style={{ background: `linear-gradient(135deg, ${BRAND}, #1f3f1c)` }}
                  >
                    <Calculator className="h-4 w-4" />
                    <h3 className="text-sm font-bold uppercase tracking-wide">{pickT(T.sTotals, uiLang)}</h3>
                  </div>
                  <div className="p-5 space-y-3">
                    <Row label={pickT(T.partsTotal, uiLang)} value={fmtMoney(partsTotal)} />
                    <Row label={pickT(T.workTotal, uiLang)} value={fmtMoney(workTotal)} />
                    <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700">{pickT(T.total, uiLang)}</span>
                      <span className="text-2xl font-bold text-[#2d5a27]">{fmtMoney(total)}</span>
                    </div>
                  </div>
                </div>

                {Object.keys(errors).length > 0 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{pickT(T.validation, uiLang)}</span>
                  </div>
                )}
              </div>
            </aside>
          </form>
        )}
      </main>

      {/* ===== Sticky bottom action area ===== */}
      {!done && (
        <div className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{pickT(T.total, uiLang)}:</span>{' '}
              <span className="text-[#2d5a27] font-bold">{fmtMoney(total)}</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button
                type="button"
                disabled={submitting !== null}
                onClick={() => handleSubmit('draft')}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {submitting === 'draft' ? pickT(T.saving, uiLang) : pickT(T.saveDraft, uiLang)}
              </button>
              <button
                type="button"
                disabled={submitting !== null}
                onClick={() => handleSubmit('submitted')}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#2d5a27] text-white text-sm font-semibold hover:bg-[#244820] disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {submitting === 'submitted' ? pickT(T.saving, uiLang) : pickT(T.sendTiman, uiLang)}
              </button>
            </div>
          </div>
        </div>
      )}

      <PortalFooter language={lang} />
    </div>
  );
}

// ---------- Small UI helpers ----------
function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100 bg-gradient-to-r from-[#2d5a27]/5 to-transparent flex items-center gap-2">
        {icon && <span className="text-[#2d5a27]">{icon}</span>}
        <h2 className="text-sm font-bold text-[#2d5a27] uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}
function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  const cls = cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2';
  return <div className={`grid grid-cols-1 ${cls} gap-4`}>{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">{children}</label>;
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold text-gray-900 tabular-nums">{value}</span>
    </div>
  );
}
function FieldText({
  label, value, onChange, cls, type = 'text', required, error,
}: {
  label: string; value: string; onChange: (v: string) => void; cls: string;
  type?: string; required?: boolean; error?: string;
}) {
  return (
    <div>
      <Label>
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={cls} maxLength={255} />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
function FieldNumber({
  label, value, onChange, cls,
}: { label: string; value: string; onChange: (v: string) => void; cls: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange('');
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0) return;
          onChange(raw);
        }}
        className={cls}
      />
    </div>
  );
}
