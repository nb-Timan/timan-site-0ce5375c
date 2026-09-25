import AcademyCrmGuidance from '@/components/academy/AcademyCrmGuidance';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin, isScopedSeller } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import {
  createCrmDemoLifecycle, getCrmDemo, listDemoLeadsForSource, formatLeadNo,
  DEMO_MACHINE_CATEGORY, DEMO_RESULT_STATUS, type CrmLeadAttachment,
} from '@/lib/crmLeadsService';
import { fetchDealerAccounts, fetchDealerAccountsForSeller, type DealerAccount } from '@/lib/dealerAccountsService';
import { fetchBackendUsers } from '@/lib/backendUsersService';
import type { BackendUser } from '@/lib/backend-users-store';
import { toast } from 'sonner';
import { Save, X, Upload, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { sellerInitialsMatch } from '@/lib/sellerInitials';
import { useSellerDirectory, resolveDealerSellerInitials } from '@/lib/sellerDirectory';
import AddressAutocomplete from '@/components/crm/AddressAutocomplete';
import MachineInterestPicker from '@/components/crm/MachineInterestPicker';
import { calculateMachineInterestEstimate } from '@/lib/leadToConfiguratorDraft';
import { getCrmLeadRepository } from '@/lib/crmLeadRepository';
import { listSelectableDemoLeads, type DemoLeadChoice } from '@/lib/crmDemoLeadSelector';
import { demoLinkingText } from '@/lib/crmDemoLinkingI18n';
import { crmDemoStageLabel, crmDemoMissingLabel, crmDemoDateRequiredLabel, crmDemoRegistrationText } from '@/lib/crmDemoStageI18n';
import { demoFlowText } from '@/lib/crmDemoFlowI18n';
import { EMPTY_DEMO_RESULT } from '@/lib/crmDemoFlow';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';
import { getDemoSelectionErrors, splitDemoMachineInterest } from '@/lib/crmDemoSelection';
import {
  formatDemoDealerPerson,
  listAcademyDemoDealerPeople,
  listDemoDealerPeople,
  resolveDemoDealerRepresentative,
  type DemoDealerPerson,
} from '@/lib/crmDemoDealerPeople';
import { academyCrmSandbox } from '@/lib/academyCrmSandbox';
import { getLocalAcademyBackendUser, getLocalAcademyUser } from '@/lib/academyCurriculum';
import { parseStructuredContactInformation } from '@/lib/crmLeadValidation';

// ---------- i18n. English is the fallback. ----------
type TKey =
  | 'page_title' | 'page_sub' | 'back' | 'cancel' | 'saving' | 'save'
  | 'sec_basic' | 'sec_demo_type' | 'sec_demo_type_sub' | 'sec_demo_machine'
  | 'sec_demo_equipment' | 'sec_demo_equipment_sub' | 'sec_demo_result'
  | 'sec_status' | 'sec_files' | 'sec_files_sub'
  | 'lbl_title' | 'ph_title' | 'lbl_seller' | 'ph_seller' | 'lbl_dealer'
  | 'ph_dealer' | 'lbl_dealer_rep' | 'lbl_customer' | 'lbl_customer_addr'
  | 'lbl_notes' | 'lbl_demo_date' | 'lbl_interest' | 'lbl_wants_offer'
  | 'lbl_followup' | 'lbl_value' | 'lbl_probability' | 'lbl_competitors'
  | 'lbl_competitor_name' | 'lbl_notes_after' | 'yes' | 'no'
  | 'pick_files' | 'mine_dealers' | 'other_dealers' | 'loading_dealers'
  | 'no_match' | 'val_title' | 'val_seller' | 'val_dealer'
  | 'created_ok' | 'created_err' | 'search_dealer'
  | 'val_demo_type' | 'val_demo_machine' | 'val_demo_equipment' | 'ph_addr'
  | 'from_lead_banner' | 'from_lead_link'
  | 'pick_dealer_rep' | 'search_dealer_rep' | 'manual_dealer_rep'
  | 'known_dealer_rep' | 'no_dealer_people' | 'loading_dealer_people';

const T: Record<TKey, Record<Language, string>> = {
  page_title:    { da: 'Nyt demo lead', en: 'New demo lead', de: 'Neuer Demo-Lead', it: 'Nuovo demo lead', hu: 'Új demo lead' },
  page_sub:      { da: 'Opfølgning efter en gennemført maskindemonstration.', en: 'Follow-up after a completed machine demo.', de: 'Nachbereitung einer durchgeführten Maschinendemo.', it: 'Follow-up dopo una demo macchina completata.', hu: 'Utánkövetés egy elvégzett gép-bemutató után.' },
  back:          { da: 'Tilbage', en: 'Back', de: 'Zurück', it: 'Indietro', hu: 'Vissza' },
  cancel:        { da: 'Annuller', en: 'Cancel', de: 'Abbrechen', it: 'Annulla', hu: 'Mégse' },
  saving:        { da: 'Gemmer…', en: 'Saving…', de: 'Speichert…', it: 'Salvataggio…', hu: 'Mentés…' },
  save:          { da: 'Gem demo lead', en: 'Save demo lead', de: 'Demo-Lead speichern', it: 'Salva demo lead', hu: 'Demo lead mentése' },
  sec_basic:     { da: 'Grundinformation', en: 'Basic information', de: 'Grundinformationen', it: 'Informazioni di base', hu: 'Alapadatok' },
  sec_demo_type: { da: 'Demo-type', en: 'Demo type', de: 'Demo-Typ', it: 'Tipo di demo', hu: 'Demo típus' },
  sec_demo_type_sub: { da: 'Hvad blev demonstreret', en: 'What was demonstrated', de: 'Was wurde vorgeführt', it: 'Cosa è stato dimostrato', hu: 'Mit mutattak be' },
  sec_demo_machine: { da: 'Demonstreret maskine', en: 'Demonstrated machine', de: 'Vorgeführte Maschine', it: 'Macchina dimostrata', hu: 'Bemutatott gép' },
  sec_demo_equipment: { da: 'Demonstreret udstyr', en: 'Demonstrated equipment', de: 'Vorgeführtes Zubehör', it: 'Attrezzatura dimostrata', hu: 'Bemutatott felszerelés' },
  sec_demo_equipment_sub: { da: 'Vælg et eller flere', en: 'Select one or more', de: 'Eines oder mehrere wählen', it: 'Selezionare uno o più', hu: 'Válasszon egyet vagy többet' },
  sec_demo_result: { da: 'Demo-resultat', en: 'Demo result', de: 'Demo-Ergebnis', it: 'Risultato demo', hu: 'Demo eredmény' },
  sec_status:    { da: 'Resultat (status)', en: 'Result (status)', de: 'Ergebnis (Status)', it: 'Risultato (stato)', hu: 'Eredmény (státusz)' },
  sec_files:     { da: 'Vedhæftninger', en: 'Attachments', de: 'Anhänge', it: 'Allegati', hu: 'Mellékletek' },
  sec_files_sub: { da: 'Billeder, signerede papirer, noter, demo-dokumenter', en: 'Photos, signed papers, notes, demo documents', de: 'Fotos, unterschriebene Papiere, Notizen, Demo-Dokumente', it: 'Foto, documenti firmati, note, documenti demo', hu: 'Fényképek, aláírt papírok, jegyzetek, demo dokumentumok' },
  lbl_title:     { da: 'Titel', en: 'Title', de: 'Titel', it: 'Titolo', hu: 'Cím' },
  ph_title:      { da: "Fx 'Demo Aalborg Kommune – RC-1000s'", en: "e.g. 'Demo Aalborg – RC-1000s'", de: "z. B. 'Demo Aalborg – RC-1000s'", it: "es. 'Demo Aalborg – RC-1000s'", hu: "Pl. 'Demo Aalborg – RC-1000s'" },
  lbl_seller:    { da: 'Ansvarlig sælger', en: 'Responsible seller', de: 'Verantwortlicher Verkäufer', it: 'Venditore responsabile', hu: 'Felelős értékesítő' },
  ph_seller:     { da: 'Vælg sælger…', en: 'Select seller…', de: 'Verkäufer wählen…', it: 'Seleziona venditore…', hu: 'Válasszon értékesítőt…' },
  lbl_dealer:    { da: 'Forhandler-firma', en: 'Dealer company', de: 'Händler-Firma', it: 'Azienda rivenditore', hu: 'Kereskedő cég' },
  ph_dealer:     { da: 'Vælg forhandler…', en: 'Select dealer…', de: 'Händler wählen…', it: 'Seleziona rivenditore…', hu: 'Válasszon kereskedőt…' },
  lbl_dealer_rep:{ da: 'Sælger / demonstrator hos forhandler', en: 'Seller / demonstrator at dealer', de: 'Verkäufer / Vorführer beim Händler', it: 'Venditore / dimostratore presso rivenditore', hu: 'Értékesítő / bemutató a kereskedőnél' },
  pick_dealer_rep: { da: 'Vælg kendt person…', en: 'Select known person…', de: 'Bekannte Person auswählen…', it: 'Seleziona persona conosciuta…', hu: 'Ismert személy kiválasztása…' },
  search_dealer_rep: { da: 'Søg navn, initialer eller rolle…', en: 'Search name, initials or role…', de: 'Name, Initialen oder Rolle suchen…', it: 'Cerca nome, iniziali o ruolo…', hu: 'Keresés név, monogram vagy szerepkör alapján…' },
  manual_dealer_rep: { da: 'Indtast manuelt', en: 'Enter manually', de: 'Manuell eingeben', it: 'Inserisci manualmente', hu: 'Kézi bevitel' },
  known_dealer_rep: { da: 'Vælg kendt person', en: 'Select known person', de: 'Bekannte Person auswählen', it: 'Seleziona persona conosciuta', hu: 'Ismert személy kiválasztása' },
  no_dealer_people: { da: 'Ingen kendte personer fundet', en: 'No known people found', de: 'Keine bekannten Personen gefunden', it: 'Nessuna persona conosciuta trovata', hu: 'Nem található ismert személy' },
  loading_dealer_people: { da: 'Henter personer…', en: 'Loading people…', de: 'Personen werden geladen…', it: 'Caricamento persone…', hu: 'Személyek betöltése…' },
  lbl_customer:  { da: 'Kunde-firma / CVR', en: 'Customer company / VAT', de: 'Kundenfirma / USt-IdNr.', it: 'Azienda cliente / P.IVA', hu: 'Ügyfél cég / adószám' },
  lbl_customer_addr: { da: 'Kunde-adresse', en: 'Customer address', de: 'Kundenadresse', it: 'Indirizzo cliente', hu: 'Ügyfél cím' },
  lbl_notes:     { da: 'Noter / øvrig info', en: 'Notes / other info', de: 'Notizen / weitere Infos', it: 'Note / altre info', hu: 'Megjegyzések / egyéb' },
  lbl_demo_date: { da: 'Demo-dato', en: 'Demo date', de: 'Demo-Datum', it: 'Data demo', hu: 'Demo dátuma' },
  lbl_interest:  { da: 'Kundens interesse (1-5)', en: "Customer interest (1-5)", de: 'Kundeninteresse (1-5)', it: 'Interesse cliente (1-5)', hu: 'Vevői érdeklődés (1-5)' },
  lbl_wants_offer:{ da: 'Ønsker tilbud?', en: 'Wants quote?', de: 'Möchte Angebot?', it: 'Vuole preventivo?', hu: 'Kér árajánlatot?' },
  lbl_followup:  { da: 'Opfølgningsdato', en: 'Follow-up date', de: 'Nachfass-Datum', it: 'Data follow-up', hu: 'Utánkövetés dátuma' },
  lbl_value:     { da: 'Forventet handelsstørrelse (DKK)', en: 'Expected deal size (DKK)', de: 'Erwartete Auftragsgröße (DKK)', it: 'Dimensione affare attesa (DKK)', hu: 'Várható üzletméret (DKK)' },
  lbl_probability:{ da: 'Sandsynlighed (%)', en: 'Probability (%)', de: 'Wahrscheinlichkeit (%)', it: 'Probabilità (%)', hu: 'Valószínűség (%)' },
  lbl_competitors:{ da: 'Konkurrenter til stede?', en: 'Competitors present?', de: 'Wettbewerber anwesend?', it: 'Concorrenti presenti?', hu: 'Versenytársak jelen?' },
  lbl_competitor_name:{ da: 'Hvilken konkurrent', en: 'Which competitor', de: 'Welcher Wettbewerber', it: 'Quale concorrente', hu: 'Melyik versenytárs' },
  lbl_notes_after:{ da: 'Noter efter demo', en: 'Notes after demo', de: 'Notizen nach Demo', it: 'Note dopo demo', hu: 'Jegyzetek a demo után' },
  yes:           { da: 'Ja', en: 'Yes', de: 'Ja', it: 'Sì', hu: 'Igen' },
  no:            { da: 'Nej', en: 'No', de: 'Nein', it: 'No', hu: 'Nem' },
  pick_files:    { da: 'Klik for at vælge filer', en: 'Click to choose files', de: 'Dateien auswählen', it: 'Clicca per scegliere file', hu: 'Kattintson fájlt választani' },
  mine_dealers:  { da: 'Mine forhandlere', en: 'My dealers', de: 'Meine Händler', it: 'I miei rivenditori', hu: 'Kereskedőim' },
  other_dealers: { da: 'Andre forhandlere', en: 'Other dealers', de: 'Andere Händler', it: 'Altri rivenditori', hu: 'Más kereskedők' },
  loading_dealers:{ da: 'Henter forhandlere…', en: 'Loading dealers…', de: 'Händler laden…', it: 'Caricamento rivenditori…', hu: 'Kereskedők betöltése…' },
  no_match:      { da: 'Ingen match', en: 'No match', de: 'Kein Treffer', it: 'Nessuna corrispondenza', hu: 'Nincs találat' },
  search_dealer: { da: 'Søg forhandler, nr., by, land…', en: 'Search dealer, no., city, country…', de: 'Händler, Nr., Stadt, Land suchen…', it: 'Cerca rivenditore, n., città, paese…', hu: 'Keresés: kereskedő, szám, város, ország…' },
  val_title:     { da: 'Titel er påkrævet', en: 'Title is required', de: 'Titel ist erforderlich', it: 'Il titolo è obbligatorio', hu: 'A cím kötelező' },
  val_seller:    { da: 'Vælg en ansvarlig sælger.', en: 'Select a responsible seller.', de: 'Wählen Sie einen Verkäufer.', it: 'Selezionare un venditore.', hu: 'Válasszon felelős értékesítőt.' },
  val_dealer:    { da: 'Vælg en forhandler.', en: 'Select a dealer.', de: 'Wählen Sie einen Händler.', it: 'Selezionare un rivenditore.', hu: 'Válasszon kereskedőt.' },
  created_ok:    { da: 'Demo lead oprettet', en: 'Demo lead created', de: 'Demo-Lead erstellt', it: 'Demo lead creato', hu: 'Demo lead létrehozva' },
  created_err:   { da: 'Kunne ikke oprette demo lead', en: 'Could not create demo lead', de: 'Demo-Lead konnte nicht erstellt werden', it: 'Impossibile creare il demo lead', hu: 'Nem sikerült létrehozni a demo leadet' },
  val_demo_type: { da: 'Vælg demo-type.', en: 'Select demo type.', de: 'Demo-Typ auswählen.', it: 'Seleziona il tipo di demo.', hu: 'Válasszon demó típust.' },
  val_demo_machine: { da: 'Vælg mindst én demonstreret maskine.', en: 'Select at least one demonstrated machine.', de: 'Wählen Sie mindestens eine vorgeführte Maschine.', it: 'Seleziona almeno una macchina dimostrata.', hu: 'Válasszon legalább egy bemutatott gépet.' },
  val_demo_equipment: { da: 'Vælg mindst ét demonstreret udstyr.', en: 'Select at least one demonstrated equipment item.', de: 'Wählen Sie mindestens ein vorgeführtes Zubehör.', it: 'Seleziona almeno un accessorio dimostrato.', hu: 'Válasszon legalább egy bemutatott eszközt.' },
  ph_addr:       { da: 'Begynd at skrive adresse…', en: 'Start typing address…', de: 'Adresse eingeben…', it: 'Inizia a digitare l\'indirizzo…', hu: 'Kezdjen címet írni…' },
  from_lead_banner: { da: 'Oprettet fra lead', en: 'Created from lead', de: 'Erstellt aus Lead', it: 'Creato dal lead', hu: 'Leadből létrehozva' },
  from_lead_link:   { da: 'Åbn oprindeligt lead', en: 'Open original lead', de: 'Ursprünglichen Lead öffnen', it: 'Apri lead originale', hu: 'Eredeti lead megnyitása' },
};

const additionalCopy: Partial<Record<TKey, readonly string[]>> = {
  "sec_basic": [
    "Grundinformation",
    "Informations générales",
    "Informacje podstawowe",
    "Základní informace"
  ],
  "sec_demo_type": [
    "Demotyp",
    "Type de démo",
    "Typ demonstracji",
    "Typ ukázky"
  ],
  "sec_demo_type_sub": [
    "Vad ska demonstreras?",
    "Que faut-il présenter ?",
    "Co będzie prezentowane?",
    "Co bude předvedeno?"
  ],
  "sec_files": [
    "Bilagor",
    "Pièces jointes",
    "Załączniki",
    "Přílohy"
  ],
  "sec_files_sub": [
    "Bilder, dokument och anteckningar",
    "Photos, documents et notes",
    "Zdjęcia, dokumenty i notatki",
    "Fotografie, dokumenty a poznámky"
  ],
  "lbl_title": [
    "Titel",
    "Titre",
    "Tytuł",
    "Název"
  ],
  "ph_title": [
    "T.ex. Demo RC-1000s",
    "Ex. Démo RC-1000s",
    "Np. demonstracja RC-1000s",
    "Např. ukázka RC-1000s"
  ],
  "ph_seller": [
    "Välj säljare…",
    "Sélectionner un commercial…",
    "Wybierz sprzedawcę…",
    "Vyberte prodejce…"
  ],
  "ph_dealer": [
    "Välj återförsäljare…",
    "Sélectionner un revendeur…",
    "Wybierz dealera…",
    "Vyberte prodejce…"
  ],
  "lbl_dealer": [
    "Återförsäljare",
    "Revendeur",
    "Dealer",
    "Prodejce"
  ],
  "lbl_customer": [
    "Kund / kontaktuppgifter",
    "Client / coordonnées",
    "Klient / dane kontaktowe",
    "Zákazník / kontaktní údaje"
  ],
  "lbl_customer_addr": [
    "Kundadress",
    "Adresse du client",
    "Adres klienta",
    "Adresa zákazníka"
  ],
  "pick_dealer_rep": [
    "Välj kontakt…",
    "Sélectionner un contact…",
    "Wybierz osobę kontaktową…",
    "Vyberte kontakt…"
  ],
  "search_dealer_rep": [
    "Sök namn, initialer eller roll…",
    "Rechercher un nom, des initiales ou un rôle…",
    "Szukaj nazwiska, inicjałów lub roli…",
    "Hledat jméno, iniciály nebo roli…"
  ],
  "manual_dealer_rep": [
    "Ange manuellt",
    "Saisir manuellement",
    "Wpisz ręcznie",
    "Zadat ručně"
  ],
  "known_dealer_rep": [
    "Välj kontakt",
    "Sélectionner un contact",
    "Wybierz osobę kontaktową",
    "Vybrat kontakt"
  ],
  "no_dealer_people": [
    "Inga kontakter hittades",
    "Aucun contact trouvé",
    "Nie znaleziono kontaktów",
    "Nenalezeny žádné kontakty"
  ],
  "loading_dealer_people": [
    "Laddar kontakter…",
    "Chargement des contacts…",
    "Ładowanie kontaktów…",
    "Načítání kontaktů…"
  ],
  "pick_files": [
    "Välj filer",
    "Choisir des fichiers",
    "Wybierz pliki",
    "Vybrat soubory"
  ],
  "mine_dealers": [
    "Mina återförsäljare",
    "Mes revendeurs",
    "Moi dealerzy",
    "Moji prodejci"
  ],
  "other_dealers": [
    "Övriga återförsäljare",
    "Autres revendeurs",
    "Inni dealerzy",
    "Ostatní prodejci"
  ],
  "loading_dealers": [
    "Laddar återförsäljare…",
    "Chargement des revendeurs…",
    "Ładowanie dealerów…",
    "Načítání prodejců…"
  ],
  "no_match": [
    "Inga träffar",
    "Aucun résultat",
    "Brak wyników",
    "Žádné výsledky"
  ],
  "search_dealer": [
    "Sök återförsäljare, nummer, ort, land…",
    "Rechercher revendeur, numéro, ville, pays…",
    "Szukaj dealera, numeru, miasta, kraju…",
    "Hledat prodejce, číslo, město, zemi…"
  ],
  "val_title": [
    "Titel krävs",
    "Le titre est obligatoire",
    "Tytuł jest wymagany",
    "Název je povinný"
  ],
  "val_seller": [
    "Välj ansvarig säljare.",
    "Sélectionnez un commercial responsable.",
    "Wybierz odpowiedzialnego sprzedawcę.",
    "Vyberte odpovědného prodejce."
  ],
  "val_dealer": [
    "Välj återförsäljare.",
    "Sélectionnez un revendeur.",
    "Wybierz dealera.",
    "Vyberte prodejce."
  ],
  "val_demo_type": [
    "Välj demotyp.",
    "Sélectionnez le type de démo.",
    "Wybierz typ demonstracji.",
    "Vyberte typ ukázky."
  ],
  "val_demo_machine": [
    "Välj minst en maskin.",
    "Sélectionnez au moins une machine.",
    "Wybierz przynajmniej jedną maszynę.",
    "Vyberte alespoň jeden stroj."
  ],
  "val_demo_equipment": [
    "Välj minst ett redskap.",
    "Sélectionnez au moins un équipement.",
    "Wybierz przynajmniej jeden osprzęt.",
    "Vyberte alespoň jedno příslušenství."
  ],
  "ph_addr": [
    "Börja skriva adress…",
    "Saisissez une adresse…",
    "Wpisz adres…",
    "Začněte psát adresu…"
  ],
  "from_lead_banner": [
    "Kopplad till lead",
    "Liée au prospect",
    "Powiązana z leadem",
    "Propojeno s leadem"
  ],
  "from_lead_link": [
    "Öppna lead",
    "Ouvrir le prospect",
    "Otwórz lead",
    "Otevřít lead"
  ],
  "created_err": [
    "Det gick inte att spara demon",
    "Impossible d’enregistrer la démo",
    "Nie udało się zapisać demonstracji",
    "Ukázku nelze uložit"
  ],
  "saving": [
    "Sparar…",
    "Enregistrement…",
    "Zapisywanie…",
    "Ukládání…"
  ],
  "cancel": [
    "Avbryt",
    "Annuler",
    "Anuluj",
    "Zrušit"
  ]
};

function tt(k: TKey, lang: PortalUiLanguage): string {
  const index = ['sv', 'fr', 'pl', 'cs'].indexOf(lang);
  return (index >= 0 ? additionalCopy[k]?.[index] : T[k][lang as Language]) || T[k].en;
}

// ---------- Tiny shared form primitives ----------
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
      <header className="mb-5">
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">{children}</div>
    </section>
  );
}
function Field({ label, required, children, full }: { label: string; required?: boolean; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn('flex flex-col gap-1.5', full && 'md:col-span-2')}>
      <span className="text-[12px] font-medium text-gray-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 outline-none transition';
const taCls = inputCls + ' min-h-[90px] resize-y';

function formatDkkEstimate(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return `${Math.round(amount).toLocaleString('da-DK')},-`;
}

function parseDkkEstimate(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits ? String(Number(digits)) : '';
}

function Chips({ options, value, onChange, single, labels }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void; single?: boolean; labels?: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const active = value.includes(o);
        return (
          <button type="button" key={o} onClick={() => {
            if (single) onChange([o]);
            else onChange(active ? value.filter(v => v !== o) : [...value, o]);
          }}
            className={cn('text-[12px] px-2.5 py-1.5 rounded-lg border transition',
              active ? 'bg-[#2d5a27] border-[#2d5a27] text-white shadow-sm'
                     : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50')}>
            {labels?.[o] || o}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Dealer picker option ----------
interface DealerOption {
  value: string;
  label: string;
  searchKey: string;
  isMine: boolean;
}
function dealerToOption(d: DealerAccount, mine: boolean, liveInitials: string): DealerOption {
  const initials = liveInitials || d.assigned_seller_initials || '';
  const label = `${d.company_name} · ${d.account_number}${initials ? ` · ${initials}` : ''}`;
  return {
    value: d.account_number,
    label,
    searchKey: [d.company_name, d.account_number, d.city, d.country, initials].filter(Boolean).join(' ').toLowerCase(),
    isMine: mine,
  };
}

export default function CrmNewDemoLeadPage() {
  const { appUser: sessionUser, loading: authLoading } = useAppUser();
  const appUser = academyCrmSandbox.isActive() ? getLocalAcademyUser() : sessionUser;
  const { effectiveUser: resolvedEffectiveUser, resolving: resolvingEffectiveUser } = useEffectivePortalUserState(appUser);
  const effectiveUser = resolvedEffectiveUser ?? appUser;
  const effectiveUserRef = useRef(effectiveUser);
  effectiveUserRef.current = effectiveUser;
  const { language: lang, uiLanguage } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromLeadId = searchParams.get('fromLead') || '';
  const editingDemoId = searchParams.get('demoId') || '';
  const [editLoading, setEditLoading] = useState(Boolean(editingDemoId));
  const [editUnavailable, setEditUnavailable] = useState(false);
  const prefilledLead = useRef<string | null>(null);
  const repository = getCrmLeadRepository();
  const academyPart = searchParams.get('academy_part') === '2' ? 2 : 1;
  const portalRole = derivePortalRole(effectiveUser);
  // A demo creates or updates the canonical CRM opportunity. Keep it to the
  // same internal CRM roles that may create that opportunity; external CRM
  // visibility never implied write access to a new lead.
  const canCreate = isCrmAdmin(portalRole) || isScopedSeller(portalRole);

  const [title, setTitle] = useState('');
  const [responsibleSellerId, setResponsibleSellerId] = useState<string>('');
  const [responsibleName, setResponsibleName] = useState(appUser?.display_name || appUser?.email || '');
  const [dealerCompany, setDealerCompany] = useState<string>(''); // account_number
  const [dealerCompanyLabel, setDealerCompanyLabel] = useState<string>(''); // display label persisted to DB
  const [dealerRep, setDealerRep] = useState('');
  const [dealerRepMode, setDealerRepMode] = useState<'known' | 'manual'>('known');
  const [dealerRepPerson, setDealerRepPerson] = useState<DemoDealerPerson | null>(null);
  const [dealerPeople, setDealerPeople] = useState<DemoDealerPerson[]>([]);
  const [dealerPeopleLoading, setDealerPeopleLoading] = useState(false);
  const [dealerPeopleForAccountId, setDealerPeopleForAccountId] = useState('');
  const [dealerRepPickerOpen, setDealerRepPickerOpen] = useState(false);
  const [representativePrefill, setRepresentativePrefill] = useState<{
    snapshot: string;
    contactId: string | null;
    userId: string | null;
  } | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [machineCategory, setMachineCategory] = useState<string[]>([]);
  const [machineInterest, setMachineInterest] = useState<string[]>([]);

  // Scheduling starts blank and requires an explicit date. Lead follow-up is independent.
  const [demoDate, setDemoDate] = useState('');
  const [missingDemoDate, setMissingDemoDate] = useState(false);
  const [followupEdited, setFollowupEdited] = useState(false);
  const [interest, setInterest] = useState<number | null>(repository.academy ? 3 : null);
  const [wantsOffer, setWantsOffer] = useState<'yes' | 'no' | null>(repository.academy ? 'yes' : null);
  const [followup, setFollowup] = useState('');
  const [estValue, setEstValue] = useState('');
  const [probability, setProbability] = useState(repository.academy ? '40' : '');
  const [competitorsPresent, setCompetitorsPresent] = useState<'yes' | 'no' | null>(repository.academy ? 'no' : null);
  const [competitorName, setCompetitorName] = useState('');
  const [notesAfter, setNotesAfter] = useState('');
  const [status, setStatus] = useState<string>(repository.academy ? 'Warm lead' : '');

  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [showErrors, setShowErrors] = useState(false);

  // Phase 38 — prefill from a CRM lead when ?fromLead=<id> is in the URL.
  const [sourceLeadId, setSourceLeadId] = useState<string | null>(null);
  const [sourceLeadNo, setSourceLeadNo] = useState<number | null>(null);
  const [linkMode, setLinkMode] = useState<'existing' | 'new'>(fromLeadId ? 'existing' : 'new');
  useEffect(() => {
    if (!sourceLeadId || repository.academy || editingDemoId) return;
    let cancelled = false;
    void listDemoLeadsForSource(sourceLeadId).then((rows) => {
      if (!cancelled && rows[0]) navigate(`/portal/crm/demo-leads/${rows[0].id}`, { replace: true });
    }).catch(() => toast.error(demoFlowText('error', uiLanguage)));
    return () => { cancelled = true; };
  }, [sourceLeadId, repository.academy, editingDemoId, navigate, uiLanguage]);
  const [leadChoices, setLeadChoices] = useState<DemoLeadChoice[]>([]);
  const [leadChoicesLoading, setLeadChoicesLoading] = useState(false);
  const [leadChoicesLoaded, setLeadChoicesLoaded] = useState(false);
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);


  // Dealers + sellers
  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [dealersLoading, setDealersLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sellers, setSellers] = useState<BackendUser[]>([]);

  useEffect(() => {
    if (repository.academy) {
      setDealers(academyCrmSandbox.listDealers());
      setDealersLoading(false);
      setSellers([getLocalAcademyBackendUser()]);
      return;
    }
    if (resolvingEffectiveUser) return;
    let cancelled = false;
    setDealersLoading(true);
    const dealerRequest = isScopedSeller(portalRole)
      ? resolveSellerId(appUser?.email).then(async (id) => {
          const { users } = await fetchBackendUsers();
          const seller = users.find(user => user.id === id);
          if (!seller) return { rows: [] as DealerAccount[] };
          const result = await fetchDealerAccountsForSeller({ email: seller.email, initials: seller.initials });
          return { rows: result.dealers.filter(dealer => !dealer.deleted_at) };
        })
      : fetchDealerAccounts({ includeDeleted: false });
    dealerRequest.then(res => { if (!cancelled) setDealers(res.rows); })
      .catch(() => { /* keep empty */ })
      .finally(() => { if (!cancelled) setDealersLoading(false); });
    fetchBackendUsers()
      .then(res => {
        if (cancelled) return;
        const list = res.users
          .filter(u => (u.role === 'timan_seller' || u.role === 'timan_backend') && u.status === 'active')
          .sort((a, b) => (a.initials || '').localeCompare(b.initials || ''));
        setSellers(list);
      })
      .catch(() => { /* keep empty */ });
    return () => { cancelled = true; };
  }, [repository, portalRole, resolvingEffectiveUser, effectiveUser?.id, appUser?.email]);

  // Default responsible seller = active seller context (logged-in user, or "view as" seller).
  useEffect(() => {
    if (repository.academy && !responsibleSellerId) {
      setResponsibleSellerId('academy-local-sales-user');
      setResponsibleName('Academy Sales');
      return;
    }
    if (responsibleSellerId || fromLeadId || editingDemoId) return;
    if (!sellers.length || !appUser?.email) return;
    // resolveSellerId honours backend "view as <seller>" override.
    let cancelled = false;
    (async () => {
      const sid = await resolveSellerId(appUser.email);
      if (cancelled) return;
      const me = sid
        ? sellers.find(s => s.id === sid)
        : sellers.find(s => (s.email || '').toLowerCase() === appUser.email.toLowerCase());
      if (me) {
        setResponsibleSellerId(me.id);
        setResponsibleName(me.name || me.email);
      }
    })();
    return () => { cancelled = true; };
  }, [sellers, appUser?.email, responsibleSellerId, repository, fromLeadId, editingDemoId]);

  // Hydrate once; async dealer loading must not overwrite edits.
  useEffect(() => {
    if (!fromLeadId || editingDemoId || !leadChoicesLoaded || dealersLoading || prefilledLead.current === fromLeadId) return;
    if (!leadChoices.some((lead) => lead.id === fromLeadId)) return;
    prefilledLead.current = fromLeadId;
    void selectExistingLead(fromLeadId);
  }, [fromLeadId, editingDemoId, leadChoicesLoaded, dealersLoading, leadChoices]);

  useEffect(() => {
    if (!editingDemoId || resolvingEffectiveUser || repository.academy) return;
    let cancelled = false;
    void resolveSellerId(appUser?.email).then(ownerId => isScopedSeller(portalRole) && !ownerId ? null : getCrmDemo(editingDemoId, isScopedSeller(portalRole) ? ownerId : null))
      .then(demo => {
        if (cancelled) return;
        if (!demo || !demo.source_lead_id || demo.completed_at) { setEditUnavailable(true); return; }
        setSourceLeadId(demo.source_lead_id);
        void repository.getLead(demo.source_lead_id).then(lead => {
          if (!cancelled) setSourceLeadNo(lead?.lead_no ?? null);
        });
        setTitle(demo.title);
        setResponsibleSellerId(demo.owner_user_id || '');
        setResponsibleName(demo.owner_name || '');
        setDealerCompanyLabel(demo.dealer_company || '');
        setEditingDealerId(demo.dealer_account_id || '');
        setDealerRep(demo.dealer_rep || '');
        setDealerRepMode('manual');
        setEditingRepresentative({ contactId: demo.dealer_rep_contact_id || null, userId: demo.dealer_rep_user_id || null });
        setRepresentativePrefill({
          snapshot: demo.dealer_rep || '',
          contactId: demo.dealer_rep_contact_id || null,
          userId: demo.dealer_rep_user_id || null,
        });
        setCustomerName(demo.customer_name || '');
        setCustomerAddress(demo.customer_address || '');
        setNotes(demo.notes || '');
        setMachineCategory(demo.machine_category || []);
        setMachineInterest([...(demo.demo_machine || '').split(',').map(v => v.trim()).filter(Boolean), ...(demo.demo_equipment || []).map(v => `Equipment: ${v}`)]);
        setDemoDate(demo.demo_date || '');
        setFiles(demo.attachments || []);
      }).catch(() => { if (!cancelled) setEditUnavailable(true); })
      .finally(() => { if (!cancelled) setEditLoading(false); });
    return () => { cancelled = true; };
  }, [editingDemoId, resolvingEffectiveUser, portalRole, effectiveUser?.id, appUser?.email, repository.academy]);

  const [editingDealerId, setEditingDealerId] = useState('');
  const [editingRepresentative, setEditingRepresentative] = useState<{contactId: string | null; userId: string | null}>({contactId: null, userId: null});
  useEffect(() => {
    const dealer = dealers.find(row => row.id === editingDealerId);
    if (dealer) { setDealerCompany(dealer.account_number); setDealerCompanyLabel(dealer.company_name); }
  }, [editingDealerId, dealers]);

  useEffect(() => {
    if (repository.academy) setProbability(demoDate ? '50' : '40');
  }, [demoDate, repository.academy]);

  useEffect(() => {
    const scopeUser = effectiveUserRef.current;
    if (repository.academy || linkMode !== 'existing' || resolvingEffectiveUser || !scopeUser) return;
    let cancelled = false;
    setLeadChoicesLoading(true);
    setLeadChoicesLoaded(false);
    void listSelectableDemoLeads({
      repository,
      sessionUser: appUser?.email ? { email: appUser.email } : null,
      effectiveUser: scopeUser,
      portalRole,
      dealerAccounts: dealers,
    }).then((choices) => {
      if (!cancelled) setLeadChoices(choices);
    }).catch(() => {
      if (!cancelled) setLeadChoices([]);
    }).finally(() => {
      if (!cancelled) {
        setLeadChoicesLoading(false);
        setLeadChoicesLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [
    appUser?.email,
    dealers,
    effectiveUser?.company_dealer,
    effectiveUser?.dealer_number,
    effectiveUser?.email,
    effectiveUser?.id,
    linkMode,
    portalRole,
    repository,
    resolvingEffectiveUser,
  ]);

  async function selectExistingLead(leadId: string) {
    if (!leadChoices.some((lead) => lead.id === leadId)) {
      toast.error(demoLinkingText('leadUnavailable', uiLanguage));
      return;
    }
    const lead = await repository.getLead(leadId);
    if (!lead) { toast.error(demoLinkingText('leadUnavailable', uiLanguage)); return; }
    setLeadPickerOpen(false);
    setSourceLeadId(lead.id);
    setSourceLeadNo(typeof lead.lead_no === 'number' ? lead.lead_no : null);
    setFollowup(lead.next_followup_date || '');
    setFollowupEdited(false);
    setTitle(lead.title || '');
    setResponsibleSellerId(lead.owner_user_id || '');
    setResponsibleName(lead.owner_name || '');
    const dealer = dealers.find((row) => row.id === lead.linked_dealer_id);
    setDealerCompany(dealer?.account_number || '');
    setDealerCompanyLabel(dealer ? `${dealer.company_name} · ${dealer.account_number}` : '');
    const contact = parseStructuredContactInformation(lead.contact_information, lead.country);
    setCustomerAddress((lead.contact_information || '').split(/\r?\n/).filter(line => /^(Adresse|Postnr\.|Land)/i.test(line)).map(line => line.replace(/^[^:]+:\s*/, '')).join(', '));
    setCustomerName(lead.contact_information || '');
    setDealerRep(contact.contactPerson);
    setDealerRepPerson(null);
    setDealerRepMode(contact.contactPerson ? 'manual' : 'known');
    setEditingRepresentative({ contactId: null, userId: null });
    setRepresentativePrefill({ snapshot: contact.contactPerson, contactId: null, userId: null });
    setNotes(lead.notes || '');
    const types = lead.machine_types || [];
    setMachineInterest(types);
    setMachineCategory([...(types.some(t => !t.startsWith('Equipment:')) ? ['Timan machine'] : []), ...(types.some(t => t.startsWith('Equipment:')) ? ['Timan equipment'] : [])]);
    if (repository.academy) setEstValue(lead.estimated_value != null ? String(lead.estimated_value) : '');
  }


  const sellerDir = useSellerDirectory();
  const { mineOptions, otherOptions, allOptions } = useMemo(() => {
    const selected = sellers.find(s => s.id === responsibleSellerId);
    const mineEmail = (selected?.email || appUser?.email || '').toLowerCase();
    const mineInitials = (selected?.initials || '').toUpperCase();
    const opts = dealers.map(d => {
      const de = (d.assigned_seller_email || '').toLowerCase();
      const mine = (mineEmail !== '' && de === mineEmail)
        || (mineInitials !== '' && sellerInitialsMatch(d.assigned_seller_initials, mineInitials));
      const liveInitials = resolveDealerSellerInitials(d, sellerDir);
      return dealerToOption(d, mine, liveInitials);
    });
    const mine = opts.filter(o => o.isMine).sort((a, b) => a.label.localeCompare(b.label));
    const others = opts.filter(o => !o.isMine).sort((a, b) => a.label.localeCompare(b.label));
    return { mineOptions: mine, otherOptions: others, allOptions: opts };
  }, [dealers, sellers, responsibleSellerId, appUser?.email, sellerDir]);

  const selectedDealer = allOptions.find(o => o.value === dealerCompany) || null;
  const dealerTriggerLabel = selectedDealer ? selectedDealer.label : (dealerCompanyLabel || tt('ph_dealer', uiLanguage));
  const selectedDealerAccount = dealers.find(dealer => dealer.account_number === dealerCompany) || null;

  useEffect(() => {
    if (!selectedDealerAccount) {
      setDealerPeople([]);
      setDealerPeopleLoading(false);
      setDealerPeopleForAccountId('');
      return;
    }
    if (repository.academy) {
      setDealerPeople(listAcademyDemoDealerPeople(selectedDealerAccount.account_number, selectedDealerAccount.id));
      setDealerPeopleLoading(false);
      setDealerPeopleForAccountId(selectedDealerAccount.id);
      return;
    }
    let cancelled = false;
    setDealerPeopleForAccountId('');
    setDealerPeopleLoading(true);
    void listDemoDealerPeople(selectedDealerAccount.account_number, selectedDealerAccount.id)
      .then((people) => {
        if (cancelled) return;
        setDealerPeople(people);
        setDealerPeopleForAccountId(selectedDealerAccount.id);
        if (people.length === 0) setDealerRepMode('manual');
      })
      .finally(() => { if (!cancelled) setDealerPeopleLoading(false); });
    return () => { cancelled = true; };
  }, [repository.academy, selectedDealerAccount?.account_number, selectedDealerAccount?.id]);

  useEffect(() => {
    if (!representativePrefill || dealerPeopleLoading || !selectedDealerAccount
      || dealerPeopleForAccountId !== selectedDealerAccount.id) return;
    const resolved = resolveDemoDealerRepresentative(dealerPeople, representativePrefill);
    setDealerRepMode(resolved.mode);
    setDealerRepPerson(resolved.person);
    setDealerRep(resolved.value);
    setEditingRepresentative({
      contactId: resolved.person?.source === 'dealer_contact' ? resolved.person.id : null,
      userId: resolved.person?.source === 'app_user' ? resolved.person.id : null,
    });
    setRepresentativePrefill(null);
  }, [dealerPeople, dealerPeopleForAccountId, dealerPeopleLoading, representativePrefill, selectedDealerAccount]);

  function selectDealer(option: DealerOption) {
    const changed = Boolean(dealerCompany && dealerCompany !== option.value);
    if (changed) {
      setDealerRepPerson(null);
      if (dealerRepMode === 'known') setDealerRep('');
      setEditingRepresentative({ contactId: null, userId: null });
      setRepresentativePrefill(null);
    }
    setDealerCompany(option.value);
    setDealerCompanyLabel(option.label);
    setPickerOpen(false);
  }

  const selectedMachineInterest = useMemo(() => splitDemoMachineInterest(machineInterest), [machineInterest]);
  const machineEstimate = useMemo(() => {
    const estimate = calculateMachineInterestEstimate(machineInterest, 'da');
    return {
      value: estimate.total > 0 ? String(estimate.total) : '',
      unmappedItems: estimate.unmappedItems,
      pricedItems: estimate.pricedItems,
    };
  }, [machineInterest]);
  const machineEstimateNote = machineEstimate.unmappedItems.length > 0
    ? `Prisestimat baseret på ${machineEstimate.pricedItems.length} af ${machineInterest.length} valgte produkter. ${machineEstimate.unmappedItems.length} valgte produkter har ingen kendt pris og er ikke medregnet.`
    : '';

  useEffect(() => {
    if (repository.academy) setEstValue(machineEstimate.value);
  }, [machineEstimate.value, repository.academy]);

  if (!authLoading && !resolvingEffectiveUser && !canCreate) return <Navigate to="/portal/crm" replace />;

  const demoSelectionErrors = getDemoSelectionErrors(machineCategory, machineInterest);
  const errDemoType = demoSelectionErrors.demoType ? tt('val_demo_type', uiLanguage) : '';
  const errDemoMachine = demoSelectionErrors.machine ? tt('val_demo_machine', uiLanguage) : '';
  const errDemoEquipment = demoSelectionErrors.equipment ? tt('val_demo_equipment', uiLanguage) : '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!repository.academy && linkMode === 'existing' && !sourceLeadId) {
      toast.error(demoLinkingText('leadUnavailable', uiLanguage));
      return;
    }
    if (!repository.academy && !demoDate) {
      setMissingDemoDate(true);
      toast.error(crmDemoDateRequiredLabel(uiLanguage));
      return;
    }
    if (!title.trim())        { toast.error(tt('val_title', uiLanguage)); return; }
    if (!responsibleSellerId) { toast.error(tt('val_seller', uiLanguage)); return; }
    if (!dealerCompany)       { toast.error(tt('val_dealer', uiLanguage)); return; }
    if (errDemoType || errDemoMachine || errDemoEquipment) {
      setShowErrors(true);
      toast.error(errDemoType || errDemoMachine || errDemoEquipment);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const chosen = sellers.find(s => s.id === responsibleSellerId);
      const sellerId = repository.academy
        ? 'academy-local-sales-user'
        : chosen?.id || (await resolveSellerId(appUser?.email));
      const dealerLabel = selectedDealer?.label || dealerCompanyLabel || dealerCompany;
      const payload = {
        demo_id: editingDemoId || null,
        effective_user_id: effectiveUser?.id || null,
        title: title.trim(),
        owner_user_id: sellerId,
        owner_name: chosen?.name || responsibleName || null,
        owner_email: chosen?.email || null,
        dealer_company: dealerLabel || null,
        dealer_country: dealers.find((dealer) => dealer.account_number === dealerCompany)?.country || null,
        dealer_account_id: dealers.find((dealer) => dealer.account_number === dealerCompany)?.id || null,
        dealer_rep: dealerRep || null,
        dealer_rep_contact_id: dealerRepPerson?.source === 'dealer_contact' ? dealerRepPerson.id : editingRepresentative.contactId,
        dealer_rep_user_id: dealerRepPerson?.source === 'app_user' ? dealerRepPerson.id : editingRepresentative.userId,
        customer_name: customerName || null,
        customer_address: customerAddress || null,
        notes: notes || null,
        machine_category: machineCategory,
        demo_machine: selectedMachineInterest.machines.join(', ') || null,
        demo_equipment: selectedMachineInterest.equipment,
        demo_date: demoDate || null,
        interest_level: interest,
        wants_offer: wantsOffer,
        followup_date: followup || null,
        update_followup: followupEdited,
        estimated_value: estValue ? Number(estValue) : null,
        probability: probability ? Number(probability) : null,
        competitors_present: competitorsPresent,
        competitor_name: competitorsPresent === 'yes' ? (competitorName || null) : null,
        notes_after_demo: notesAfter || null,
        result_status: status,
        attachments: files as unknown as CrmLeadAttachment[],
        source_lead_id: sourceLeadId,
        machine_interest: machineInterest,
      };
      if (repository.academy) {
        await repository.createDemoLead(payload);
        toast.success(tt('created_ok', uiLanguage));
        navigate(`/academy/crm/leads?academy_mode=true&academy_part=${academyPart}`);
        return;
      }
      const result = await createCrmDemoLifecycle({ ...payload, ...EMPTY_DEMO_RESULT });
      toast.success(demoFlowText('saved', uiLanguage));
      navigate(`/portal/crm/leads/${result.lead_id}`);
    } catch (err) {
      console.error(err);
      toast.error(tt('created_err', uiLanguage));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (editLoading) return <CrmLayout pageTitle={demoFlowText('demo', uiLanguage)}><p>{demoFlowText('loading', uiLanguage)}</p></CrmLayout>;
  if (editUnavailable) return <CrmLayout pageTitle={demoFlowText('demo', uiLanguage)}><p role="alert">{demoFlowText('unavailable', uiLanguage)}</p></CrmLayout>;

  return (
    <CrmLayout pageTitle={demoFlowText(editingDemoId ? 'edit' : 'plan', uiLanguage)}>
      <div className="max-w-5xl mx-auto">
        {repository.academy && <AcademyCrmGuidance part={academyPart} />}
        <div className="mb-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{demoFlowText(editingDemoId ? 'edit' : 'plan', uiLanguage)}</h2>

          </div>
        </div>

        {missingDemoDate && !demoDate && (
          <div role="alert" className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            <span className="uppercase">{crmDemoMissingLabel(uiLanguage)}</span>
            <p className="mt-1 font-normal">{crmDemoDateRequiredLabel(uiLanguage)}</p>
          </div>
        )}
        {sourceLeadId && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-900">
            <span>
              {tt('from_lead_banner', uiLanguage)}{' '}
              <span className="font-mono">{formatLeadNo(sourceLeadNo)}</span>
            </span>
            <Link to={repository.academy ? `/academy/crm/leads/${sourceLeadId}?academy_mode=true&academy_part=${academyPart}` : `/portal/crm/leads/${sourceLeadId}`} className="text-xs text-violet-800 hover:underline">
              {tt('from_lead_link', uiLanguage)} →
            </Link>
          </div>
        )}

        {!repository.academy && !fromLeadId && !editingDemoId && (
          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-[15px] font-semibold text-slate-900">{demoLinkingText('title', uiLanguage)}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setLinkMode('existing')}
                className={cn('rounded-lg border px-3 py-2 text-sm font-medium', linkMode === 'existing' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 text-slate-700')}>
                {demoLinkingText('linkExisting', uiLanguage)}
              </button>
              <button type="button" onClick={() => { setLinkMode('new'); setSourceLeadId(null); setSourceLeadNo(null); setLeadPickerOpen(false); }}
                className={cn('rounded-lg border px-3 py-2 text-sm font-medium', linkMode === 'new' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 text-slate-700')}>
                {demoLinkingText('createNew', uiLanguage)}
              </button>
            </div>
            {linkMode === 'existing' && !sourceLeadId && (
              <div className="mt-4">
                <div className="mb-1.5 text-sm font-medium text-slate-700">
                  {demoLinkingText('selectExisting', uiLanguage)}
                </div>
                <Popover open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={leadPickerOpen}
                      className="h-auto min-h-11 w-full justify-between whitespace-normal rounded-xl border-gray-200 px-3 py-2.5 text-left text-sm font-normal"
                    >
                      <span className="text-slate-500">
                        {leadChoicesLoading
                          ? demoLinkingText('loadingLeads', uiLanguage)
                          : demoLinkingText('selectPlaceholder', uiLanguage)}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder={demoLinkingText('searchLead', uiLanguage)} />
                      <CommandList>
                        <CommandEmpty>{demoLinkingText('noLeads', uiLanguage)}</CommandEmpty>
                        <CommandGroup>
                          {leadChoices.map((lead) => {
                            const details = [lead.customer, lead.status, lead.machine].filter(Boolean).join(' · ');
                            return (
                              <CommandItem
                                key={lead.id}
                                value={lead.searchValue}
                                onSelect={() => { void selectExistingLead(lead.id); }}
                                className="items-start"
                              >
                                <div className="min-w-0 py-0.5">
                                  <div className="truncate text-sm font-medium text-slate-900">
                                    {lead.displayNo} · {lead.title}
                                  </div>
                                  {details && <div className="mt-0.5 truncate text-xs text-slate-500">{details}</div>}
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </section>
        )}

        <form onSubmit={handleSubmit}>
          <Section title={tt('sec_basic', uiLanguage)}>
            <Field label={tt('lbl_title', uiLanguage)} required full>
              <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder={tt('ph_title', uiLanguage)} />
            </Field>

            <Field label={demoFlowText('seller', uiLanguage)} required>
              <select
                className={inputCls}
                value={responsibleSellerId}
                disabled={isScopedSeller(portalRole)}
                onChange={e => {
                  const id = e.target.value;
                  setResponsibleSellerId(id);
                  const s = sellers.find(x => x.id === id);
                  setResponsibleName(s ? (s.name || s.email) : '');
                }}
              >
                <option value="">{tt('ph_seller', uiLanguage)}</option>
                {sellers.filter(s => !isScopedSeller(portalRole) || s.id === effectiveUser?.id || s.id === responsibleSellerId).map(s => (
                  <option key={s.id} value={s.id}>
                    {s.initials ? `${s.initials} - ${s.name || s.email}` : (s.name || s.email)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={tt('lbl_dealer', uiLanguage)} required>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    disabled={dealersLoading}
                    className={cn(
                      'w-full justify-between font-normal h-10 rounded-xl border-gray-200',
                      !dealerCompany && 'text-gray-400'
                    )}
                  >
                    <span className="truncate text-left">{dealerTriggerLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]" align="start">
                  <Command
                    filter={(value, search) => {
                      const opt = allOptions.find(o => o.value === value);
                      const hay = opt ? opt.searchKey : value.toLowerCase();
                      return hay.includes(search.toLowerCase()) ? 1 : 0;
                    }}
                  >
                    <CommandInput placeholder={tt('search_dealer', uiLanguage)} />
                    <CommandList>
                      <CommandEmpty>{dealersLoading ? tt('loading_dealers', uiLanguage) : tt('no_match', uiLanguage)}</CommandEmpty>

                      {mineOptions.length > 0 && (
                        <CommandGroup heading={tt('mine_dealers', uiLanguage)}>
                          {mineOptions.map(o => (
                            <CommandItem
                              key={o.value}
                              value={o.value}
                              onSelect={() => selectDealer(o)}
                            >
                              <Check className={cn('mr-2 h-4 w-4', dealerCompany === o.value ? 'opacity-100' : 'opacity-0')} />
                              <span className="truncate">{o.label}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}

                      {otherOptions.length > 0 && (
                        <CommandGroup heading={tt('other_dealers', uiLanguage)}>
                          {otherOptions.map(o => (
                            <CommandItem
                              key={o.value}
                              value={o.value}
                              onSelect={() => selectDealer(o)}
                            >
                              <Check className={cn('mr-2 h-4 w-4', dealerCompany === o.value ? 'opacity-100' : 'opacity-0')} />
                              <span className="truncate">{o.label}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </Field>

            <Field label={demoFlowText('demonstrator', uiLanguage)}>
              {dealerRepMode === 'manual' ? (
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <input className={inputCls} value={dealerRep} onChange={e=>{ setDealerRep(e.target.value); setEditingRepresentative({contactId:null,userId:null}); setRepresentativePrefill(null); }} />
                  {dealerPeople.length > 0 && (
                    <Button type="button" variant="outline" className="h-10 w-full shrink-0 rounded-xl px-3 sm:w-auto" onClick={() => { setDealerRepMode('known'); setDealerRep(''); }}>
                      {tt('known_dealer_rep', uiLanguage)}
                    </Button>
                  )}
                </div>
              ) : (
                <Popover open={dealerRepPickerOpen} onOpenChange={setDealerRepPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" role="combobox" disabled={!selectedDealerAccount || dealerPeopleLoading} className="h-10 w-full justify-between rounded-xl border-gray-200 font-normal">
                      <span className={cn('truncate text-left', !dealerRepPerson && 'text-gray-400')}>
                        {dealerPeopleLoading ? tt('loading_dealer_people', uiLanguage) : (dealerRepPerson ? formatDemoDealerPerson(dealerRepPerson) : tt('pick_dealer_rep', uiLanguage))}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[300px] p-0" align="start">
                    <Command filter={(value, search) => {
                      const person = dealerPeople.find(option => option.key === value);
                      return (person?.searchText || value.toLowerCase()).includes(search.toLowerCase()) ? 1 : 0;
                    }}>
                      <CommandInput placeholder={tt('search_dealer_rep', uiLanguage)} />
                      <CommandList>
                        <CommandEmpty>{tt('no_dealer_people', uiLanguage)}</CommandEmpty>
                        <CommandGroup>
                          {dealerPeople.map(person => (
                            <CommandItem key={person.key} value={person.key} onSelect={() => {
                              setEditingRepresentative({contactId: null, userId: null});
                              setRepresentativePrefill(null);
                              setDealerRepPerson(person);
                              setDealerRep(person.name);
                              setDealerRepPickerOpen(false);
                            }}>
                              <Check className={cn('mr-2 h-4 w-4', dealerRepPerson?.key === person.key ? 'opacity-100' : 'opacity-0')} />
                              <div className="min-w-0">
                                <div className="truncate">{formatDemoDealerPerson(person)}</div>
                                {(person.initials || person.email) && <div className="truncate text-xs text-slate-500">{[person.initials, person.email].filter(Boolean).join(' · ')}</div>}
                              </div>
                            </CommandItem>
                          ))}
                          <CommandItem value="manual-entry" onSelect={() => {
                            setEditingRepresentative({contactId: null, userId: null});
                            setRepresentativePrefill(null);
                            setDealerRepMode('manual');
                            setDealerRepPerson(null);
                            setDealerRep('');
                            setDealerRepPickerOpen(false);
                          }}>
                            {tt('manual_dealer_rep', uiLanguage)}
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </Field>
            <Field label={tt('lbl_customer', uiLanguage)}>
              <textarea className={taCls} value={customerName} onChange={e=>setCustomerName(e.target.value)} />
            </Field>
            <Field label={tt('lbl_customer_addr', uiLanguage)} full>
              <AddressAutocomplete className={inputCls} value={customerAddress} onChange={setCustomerAddress} placeholder={tt('ph_addr', uiLanguage)} showValidationState addressParts={{ address_line_1: customerAddress }} />
            </Field>
            <Field label={demoFlowText('notes', uiLanguage)} full>
              <textarea className={taCls} value={notes} onChange={e=>setNotes(e.target.value)} />
            </Field>
          </Section>

          <Section title={tt('sec_demo_type', uiLanguage)} >
            <div className="md:col-span-2">
              <div className="text-[12px] font-medium text-gray-700 mb-1.5">{tt('sec_demo_type', uiLanguage)} <span className="text-rose-500">*</span></div>
              <Chips options={DEMO_MACHINE_CATEGORY} value={machineCategory} onChange={setMachineCategory} labels={Object.fromEntries(DEMO_MACHINE_CATEGORY.map(category => [category, demoFlowText(category, uiLanguage)]))} />
              {showErrors && errDemoType && <p className="mt-1.5 text-xs text-rose-600">{errDemoType}</p>}
            </div>
          </Section>

          <Section title={demoFlowText('machine', uiLanguage)}>
            <div className="md:col-span-2">
              <div className="text-[12px] font-medium text-gray-700 mb-1.5">{demoFlowText('machine', uiLanguage)} <span className="text-rose-500">*</span></div>
              <MachineInterestPicker value={machineInterest} onChange={setMachineInterest} />
              {showErrors && errDemoMachine && <p className="mt-1.5 text-xs text-rose-600">{errDemoMachine}</p>}
              {showErrors && errDemoEquipment && <p className="mt-1.5 text-xs text-rose-600">{errDemoEquipment}</p>}
              {repository.academy && machineEstimate.unmappedItems.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  {machineEstimateNote}
                </p>
              )}
            </div>
          </Section>

          {!repository.academy && <Section title={demoFlowText('planning', uiLanguage)}>
            <Field label={demoFlowText('date', uiLanguage)} required>
              <input type="date" className={inputCls} value={demoDate} onChange={e => setDemoDate(e.target.value)} />
            </Field>
          </Section>}
          {repository.academy && <><Section title={tt('sec_demo_result', uiLanguage)}>
            <Field label={tt('lbl_demo_date', uiLanguage)}>
              <input type="date" className={inputCls} value={demoDate} onChange={e=>setDemoDate(e.target.value)} />
            </Field>
            <Field label={tt('lbl_interest', uiLanguage)}>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n => (
                  <button type="button" key={n} onClick={()=>setInterest(n)}
                    className={cn('w-10 h-10 rounded-xl border text-sm font-medium transition',
                      interest===n ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                    {n}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={tt('lbl_wants_offer', uiLanguage)}>
              <div className="flex gap-2">
                {(['yes','no'] as const).map(v => (
                  <button type="button" key={v} onClick={()=>setWantsOffer(v)}
                    className={cn('px-4 py-2 rounded-xl text-sm border transition',
                      wantsOffer===v ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                    {v==='yes' ? tt('yes', uiLanguage) : tt('no', uiLanguage)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={tt('lbl_followup', uiLanguage)}>
              <input type="date" className={inputCls} value={followup} onChange={e=>{ setFollowup(e.target.value); setFollowupEdited(true); }} />
            </Field>
            <Field label={tt('lbl_value', uiLanguage)}>
              <input
                type="text"
                inputMode="numeric"
                className={inputCls}
                value={formatDkkEstimate(estValue)}
                onChange={e=>setEstValue(parseDkkEstimate(e.target.value))}
                placeholder="0,-"
              />
            </Field>
            <Field label={tt('lbl_probability', uiLanguage)}>
              <input type="number" readOnly className={cn(inputCls, 'bg-gray-50 text-gray-600')} value={probability} aria-describedby="demo-probability-help" />
              <span id="demo-probability-help" className="text-xs text-gray-500">
                {crmDemoStageLabel(demoDate ? 'agreed' : 'requested', uiLanguage)}
              </span>
            </Field>
            <Field label={tt('lbl_competitors', uiLanguage)}>
              <div className="flex gap-2">
                {(['yes','no'] as const).map(v => (
                  <button type="button" key={v} onClick={()=>setCompetitorsPresent(v)}
                    className={cn('px-4 py-2 rounded-xl text-sm border transition',
                      competitorsPresent===v ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                    {v==='yes' ? tt('yes', uiLanguage) : tt('no', uiLanguage)}
                  </button>
                ))}
              </div>
            </Field>
            {competitorsPresent === 'yes' && (
              <Field label={tt('lbl_competitor_name', uiLanguage)}>
                <input className={inputCls} value={competitorName} onChange={e=>setCompetitorName(e.target.value)} />
              </Field>
            )}
            <Field label={tt('lbl_notes_after', uiLanguage)} full>
              <textarea className={taCls} value={notesAfter} onChange={e=>setNotesAfter(e.target.value)} />
            </Field>
          </Section>

          <Section title={tt('sec_status', uiLanguage)}>
            <div className="md:col-span-2 flex flex-wrap gap-2">
              {DEMO_RESULT_STATUS.map(s => (
                <button type="button" key={s} onClick={()=>setStatus(s)}
                  className={cn('px-3.5 py-2 rounded-xl text-sm border transition',
                    status===s ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                  {s}
                </button>
              ))}
            </div>
          </Section>

          </>}
          <Section title={tt('sec_files', uiLanguage)} subtitle={tt('sec_files_sub', uiLanguage)}>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm border border-dashed border-gray-300 rounded-xl px-4 py-6 justify-center hover:bg-gray-50 transition">
                <Upload className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600">{tt('pick_files', uiLanguage)}</span>
                <input type="file" multiple className="hidden" onChange={e => {
                  const list = Array.from(e.target.files || []).map(f => ({ name: f.name, size: f.size }));
                  setFiles(prev => [...prev, ...list]);
                }} />
              </label>
              {files.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                      <span className="truncate text-gray-700">{f.name}</span>
                      <button type="button" onClick={()=>setFiles(files.filter((_,j)=>j!==i))} className="text-gray-400 hover:text-rose-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          <div className="sticky bottom-4 flex items-center justify-end gap-3 bg-white/90 backdrop-blur rounded-2xl border border-gray-100 shadow-sm p-3 mt-6">
            <Link to="/portal/crm/demo-leads" className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900">{tt('cancel', uiLanguage)}</Link>
            <button type="submit" disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2d5a27] hover:bg-[#234820] disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 shadow-sm transition">
              <Save className="h-4 w-4" />
              {submitting ? tt('saving', uiLanguage) : demoFlowText('save', uiLanguage)}
            </button>
          </div>
        </form>
      </div>
    </CrmLayout>
  );
}
