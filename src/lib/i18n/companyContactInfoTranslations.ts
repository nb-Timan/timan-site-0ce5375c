import type { PortalUiLanguage } from "@/lib/portalLanguages";
import type { ProfileI18nKey } from "@/lib/dealerProfileI18n";

export type CompanyContactInfoKey =
  | "title" | "subtitle" | "intro" | "newPartner" | "existingPartner" | "partnerTypeHelp"
  | "companyName" | "vatNumber" | "address" | "postalCode" | "city" | "country"
  | "invoiceEmail" | "paymentTerms" | "currencyCode" | "website" | "linkedin" | "facebook"
  | "instagram" | "tiktok" | "youtube" | "role" | "name" | "email" | "phone" | "firstContact"
  | "addPerson" | "removePerson" | "contact" | "finalComment" | "reviewIntro" | "submit"
  | "sending" | "next" | "back" | "stepOf" | "newSubmission" | "backToForms" | "receiptTitle"
  | "receiptReference" | "lockedPartnerHelp" | "requiredField" | "selectPlaceholder"
  | "companySection" | "financeSection" | "purchasingSection" | "salesSection"
  | "workshopSection" | "marketingSection" | "finalSection";

type Copy = Record<CompanyContactInfoKey, string>;

export type CompanyContactInfoCopy = Copy & {
  sections: string[];
  errors: Record<
    | "dealerKind" | "companyName" | "address" | "postalCode" | "city" | "country" | "vatNumber"
    | "contactName" | "contactEmail" | "contactEmailInvalid" | "invoiceEmail" | "website" | "firstContact",
    string
  >;
  roleLabels: Partial<Record<ProfileI18nKey, string>>;
};

const da: CompanyContactInfoCopy = {
  title: "Ny samarbejdspartner",
  subtitle: "Virksomheds- og kontaktoplysninger",
  intro:
    "Udfyld virksomhedens oplysninger for at komme videre i processen som potentiel samarbejdspartner med Timan.\n\n" +
    "Oplysningerne bruges til at oprette virksomheden i vores system og sikre, at vi har de korrekte kontaktpersoner inden for blandt andet ledelse, økonomi, indkøb, salg, service og marketing.\n\n" +
    "Når oplysningerne er indsendt, gennemgår Timan dem. Når virksomheden er godkendt og aktiveret, kan den få adgang til partnerportalen. Herefter kan Timan ved behov åbne kontraktforløbet, så aftalen kan gennemgås og efterfølgende underskrives.\n\n" +
    "Har virksomheden allerede oplysninger registreret hos Timan, kan formularen også bruges til at kontrollere og opdatere dem.\n\n" +
    "* Påkrævet felt",
  newPartner: "Ny samarbejdspartner",
  existingPartner: "Eksisterende partner",
  partnerTypeHelp: "Vælg om virksomheden er ny hos Timan eller allerede har oplysninger registreret.",
  companyName: "Firmanavn",
  vatNumber: "CVR/VAT nr.",
  address: "Adresse",
  postalCode: "Postnummer",
  city: "By",
  country: "Land",
  invoiceEmail: "E-mail til faktura",
  paymentTerms: "Betalingsbetingelser",
  currencyCode: "Valuta",
  website: "Hjemmeside",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  role: "Rolle",
  name: "Navn",
  email: "E-mail",
  phone: "Telefon",
  firstContact: "Første kontakt",
  addPerson: "Tilføj person",
  removePerson: "Fjern",
  contact: "Kontakt",
  finalComment: "Kommentar",
  reviewIntro: "Gennemgå oplysningerne, før du indsender dem til Timan.",
  submit: "Send",
  sending: "Sender...",
  next: "Næste",
  back: "Tilbage",
  stepOf: "Trin {current} af {total}",
  newSubmission: "Send en ny",
  backToForms: "Tilbage til formularer",
  receiptTitle: "Tak - din indsendelse er modtaget.",
  receiptReference: "Reference",
  lockedPartnerHelp: "Din bruger er låst til din egen partnerkonto og kan ikke ændres her.",
  requiredField: "* Påkrævet felt",
  selectPlaceholder: "Vælg rolle",
  companySection: "Firma & ledelse",
  financeSection: "Økonomi",
  purchasingSection: "Indkøb & logistik",
  salesSection: "Salg",
  workshopSection: "Værksted & service",
  marketingSection: "Marketing",
  finalSection: "Til sidst / gennemgang",
  sections: ["1. Firma & ledelse", "2. Økonomi", "3. Indkøb & logistik", "4. Salg", "5. Værksted & service", "6. Marketing", "7. Til sidst / gennemgang"],
  errors: {
    dealerKind: "Vælg ny eller eksisterende partner.",
    companyName: "Firmanavn er påkrævet.",
    address: "Adresse er påkrævet.",
    postalCode: "Postnummer er påkrævet.",
    city: "By er påkrævet.",
    country: "Land er påkrævet.",
    vatNumber: "CVR/VAT nr. er påkrævet.",
    contactName: "Navn er påkrævet.",
    contactEmail: "E-mail er påkrævet.",
    contactEmailInvalid: "E-mail er ikke gyldig.",
    invoiceEmail: "Gyldig e-mail til faktura er påkrævet.",
    website: "Hjemmeside er påkrævet.",
    firstContact: "Vælg én første kontakt.",
  },
  roleLabels: {
    roleDirector: "Direktør",
    roleOwner: "Ejer",
    roleManagingDirector: "Daglig leder",
    roleAdministration: "Administration",
    roleFinanceManager: "Økonomiansvarlig",
    roleBookkeeper: "Bogholder",
    roleInvoicing: "Fakturering",
    roleAccountsPayableReceivable: "Debitor/kreditor",
    rolePurchasingManager: "Indkøbsansvarlig",
    rolePurchaser: "Indkøber",
    rolePartsPurchasing: "Indkøb / reservedele",
    roleLogisticsManager: "Logistikansvarlig",
    roleLogisticsCoordinator: "Logistikkoordinator",
    roleSalesDirector: "Salgsdirektør",
    roleSalesManager: "Salgschef",
    roleSalesRep: "Sælger",
    roleSalesCoordinator: "Salgskoordinator",
    roleKeyAccount: "Key Account",
    roleWorkshopManager: "Værkstedschef",
    roleServiceManager: "Servicechef",
    roleServiceTechnician: "Servicetekniker",
    roleMechanic: "Mekaniker",
    rolePartsManager: "Reservedelsansvarlig",
    roleServiceCoord: "Servicekoordinator",
    roleMarketingManager: "Marketingansvarlig",
    roleMarketingCoordinator: "Marketingkoordinator",
    roleSocialMedia: "SoMe",
    roleWebsiteManager: "Website/webansvarlig",
    roleCommunications: "Kommunikation",
    roleOther: "Andet",
  },
};

const en: CompanyContactInfoCopy = {
  ...da,
  title: "New collaboration partner",
  subtitle: "Company and contact information",
  intro:
    "Fill in the company's information to continue the process as a potential collaboration partner with Timan.\n\n" +
    "The information is used to create the company in our system and ensure that we have the correct contact people across management, finance, purchasing, sales, service and marketing.\n\n" +
    "After the information is submitted, Timan reviews it. When the company is approved and activated, it can get access to the partner portal. Timan can then open the contract flow when needed, so the agreement can be reviewed and later signed.\n\n" +
    "If the company already has information registered with Timan, the form can also be used to check and update it.\n\n" +
    "* Required field",
  newPartner: "New collaboration partner",
  existingPartner: "Existing partner",
  partnerTypeHelp: "Choose whether the company is new to Timan or already has information registered.",
  companyName: "Company name",
  vatNumber: "VAT no.",
  address: "Address",
  postalCode: "Postal code",
  city: "City",
  country: "Country",
  invoiceEmail: "Invoice e-mail",
  paymentTerms: "Payment terms",
  currencyCode: "Currency",
  role: "Role",
  phone: "Phone",
  firstContact: "First contact",
  addPerson: "Add person",
  removePerson: "Remove",
  finalComment: "Comment",
  reviewIntro: "Review the information before submitting it to Timan.",
  submit: "Submit",
  sending: "Submitting...",
  next: "Next",
  back: "Back",
  stepOf: "Step {current} of {total}",
  newSubmission: "Submit another",
  backToForms: "Back to forms",
  receiptTitle: "Thank you - your submission has been received.",
  receiptReference: "Reference",
  lockedPartnerHelp: "Your user is locked to your own partner account and cannot be changed here.",
  requiredField: "* Required field",
  selectPlaceholder: "Select role",
  companySection: "Company & management",
  financeSection: "Finance",
  purchasingSection: "Purchasing & logistics",
  workshopSection: "Workshop & service",
  finalSection: "Finally / review",
  sections: ["1. Company & management", "2. Finance", "3. Purchasing & logistics", "4. Sales", "5. Workshop & service", "6. Marketing", "7. Finally / review"],
  errors: {
    dealerKind: "Choose new or existing partner.",
    companyName: "Company name is required.",
    address: "Address is required.",
    postalCode: "Postal code is required.",
    city: "City is required.",
    country: "Country is required.",
    vatNumber: "VAT no. is required.",
    contactName: "Name is required.",
    contactEmail: "E-mail is required.",
    contactEmailInvalid: "E-mail is invalid.",
    invoiceEmail: "A valid invoice e-mail is required.",
    website: "Website is required.",
    firstContact: "Choose one first contact.",
  },
  roleLabels: {
    roleDirector: "Director",
    roleOwner: "Owner",
    roleManagingDirector: "Managing director",
    roleAdministration: "Administration",
    roleFinanceManager: "Finance manager",
    roleBookkeeper: "Bookkeeper",
    roleInvoicing: "Invoicing",
    roleAccountsPayableReceivable: "Accounts payable/receivable",
    rolePurchasingManager: "Purchasing manager",
    rolePurchaser: "Purchaser",
    rolePartsPurchasing: "Purchasing / spare parts",
    roleLogisticsManager: "Logistics manager",
    roleLogisticsCoordinator: "Logistics coordinator",
    roleSalesDirector: "Sales Director",
    roleSalesManager: "Sales Manager",
    roleSalesRep: "Sales Rep",
    roleSalesCoordinator: "Sales Coordinator",
    roleKeyAccount: "Key Account",
    roleWorkshopManager: "Workshop Manager",
    roleServiceManager: "Service Manager",
    roleServiceTechnician: "Service Technician",
    roleMechanic: "Mechanic",
    rolePartsManager: "Parts Manager",
    roleServiceCoord: "Service Coordinator",
    roleMarketingManager: "Marketing Manager",
    roleMarketingCoordinator: "Marketing Coordinator",
    roleSocialMedia: "Social media",
    roleWebsiteManager: "Website manager",
    roleCommunications: "Communications",
    roleOther: "Other",
  },
};

const de: CompanyContactInfoCopy = {
  ...en,
  title: "Neuer Kooperationspartner",
  subtitle: "Unternehmens- und Kontaktdaten",
  intro:
    "Füllen Sie die Unternehmensdaten aus, um den Prozess als potenzieller Kooperationspartner von Timan fortzusetzen.\n\n" +
    "Die Angaben werden verwendet, um das Unternehmen in unserem System anzulegen und sicherzustellen, dass wir die richtigen Kontaktpersonen für Geschäftsführung, Finanzen, Einkauf, Vertrieb, Service und Marketing haben.\n\n" +
    "Nach dem Absenden prüft Timan die Angaben. Wenn das Unternehmen genehmigt und aktiviert ist, kann es Zugriff auf das Partnerportal erhalten. Danach kann Timan bei Bedarf den Vertragsprozess öffnen, damit die Vereinbarung geprüft und anschließend unterzeichnet werden kann.\n\n" +
    "Wenn für das Unternehmen bereits Angaben bei Timan registriert sind, kann das Formular auch zur Kontrolle und Aktualisierung verwendet werden.\n\n" +
    "* Pflichtfeld",
  newPartner: "Neuer Kooperationspartner",
  existingPartner: "Bestehender Partner",
  partnerTypeHelp: "Wählen Sie, ob das Unternehmen neu bei Timan ist oder bereits registrierte Angaben hat.",
  companyName: "Firmenname",
  vatNumber: "USt-IdNr.",
  postalCode: "PLZ",
  city: "Stadt",
  invoiceEmail: "Rechnungs-E-Mail",
  paymentTerms: "Zahlungsbedingungen",
  currencyCode: "Währung",
  role: "Rolle",
  phone: "Telefon",
  firstContact: "Erster Kontakt",
  addPerson: "Person hinzufügen",
  removePerson: "Entfernen",
  reviewIntro: "Prüfen Sie die Angaben, bevor Sie sie an Timan senden.",
  submit: "Senden",
  sending: "Senden...",
  next: "Weiter",
  back: "Zurück",
  stepOf: "Schritt {current} von {total}",
  receiptTitle: "Danke - Ihre Einsendung ist eingegangen.",
  requiredField: "* Pflichtfeld",
  selectPlaceholder: "Rolle wählen",
  companySection: "Firma & Leitung",
  financeSection: "Finanzen",
  purchasingSection: "Einkauf & Logistik",
  workshopSection: "Werkstatt & Service",
  finalSection: "Zum Schluss / Prüfung",
  sections: ["1. Firma & Leitung", "2. Finanzen", "3. Einkauf & Logistik", "4. Vertrieb", "5. Werkstatt & Service", "6. Marketing", "7. Zum Schluss / Prüfung"],
  errors: {
    ...en.errors,
    dealerKind: "Wählen Sie neuer oder bestehender Partner.",
    companyName: "Firmenname ist erforderlich.",
    address: "Adresse ist erforderlich.",
    postalCode: "PLZ ist erforderlich.",
    city: "Stadt ist erforderlich.",
    country: "Land ist erforderlich.",
    vatNumber: "USt-IdNr. ist erforderlich.",
    contactName: "Name ist erforderlich.",
    contactEmail: "E-Mail ist erforderlich.",
    contactEmailInvalid: "E-Mail ist ungültig.",
    invoiceEmail: "Eine gültige Rechnungs-E-Mail ist erforderlich.",
    website: "Website ist erforderlich.",
    firstContact: "Wählen Sie einen ersten Kontakt.",
  },
  roleLabels: {
    roleDirector: "Geschäftsführer",
    roleOwner: "Inhaber",
    roleManagingDirector: "Leitender Geschäftsführer",
    roleAdministration: "Administration",
    roleFinanceManager: "Finanzverantwortlicher",
    roleBookkeeper: "Buchhaltung",
    roleInvoicing: "Rechnungsstellung",
    roleAccountsPayableReceivable: "Debitoren/Kreditoren",
    rolePurchasingManager: "Einkaufsleiter",
    rolePurchaser: "Einkäufer",
    rolePartsPurchasing: "Einkauf / Ersatzteile",
    roleLogisticsManager: "Logistikleiter",
    roleLogisticsCoordinator: "Logistikkoordinator",
    roleSalesDirector: "Vertriebsdirektor",
    roleSalesManager: "Vertriebsleiter",
    roleSalesRep: "Vertriebsmitarbeiter",
    roleSalesCoordinator: "Vertriebskoordinator",
    roleKeyAccount: "Key Account",
    roleWorkshopManager: "Werkstattleiter",
    roleServiceManager: "Serviceleiter",
    roleServiceTechnician: "Servicetechniker",
    roleMechanic: "Mechaniker",
    rolePartsManager: "Ersatzteilverantwortlicher",
    roleServiceCoord: "Servicekoordinator",
    roleMarketingManager: "Marketingleiter",
    roleMarketingCoordinator: "Marketingkoordinator",
    roleSocialMedia: "Social Media",
    roleWebsiteManager: "Website-Verantwortlicher",
    roleCommunications: "Kommunikation",
    roleOther: "Sonstiges",
  },
};

const it: CompanyContactInfoCopy = { ...en, title: "Nuovo partner di collaborazione", subtitle: "Informazioni aziendali e di contatto", newPartner: "Nuovo partner", existingPartner: "Partner esistente", companyName: "Ragione sociale", vatNumber: "Partita IVA", address: "Indirizzo", postalCode: "CAP", city: "Città", country: "Paese", invoiceEmail: "E-mail fatture", paymentTerms: "Termini di pagamento", currencyCode: "Valuta", role: "Ruolo", name: "Nome", phone: "Telefono", firstContact: "Primo contatto", addPerson: "Aggiungi persona", removePerson: "Rimuovi", submit: "Invia", sending: "Invio...", next: "Avanti", back: "Indietro", stepOf: "Passo {current} di {total}", requiredField: "* Campo obbligatorio", selectPlaceholder: "Seleziona ruolo", sections: ["1. Azienda e direzione", "2. Finanza", "3. Acquisti e logistica", "4. Vendite", "5. Officina e assistenza", "6. Marketing", "7. Infine / revisione"] };
const hu: CompanyContactInfoCopy = { ...en, title: "Új együttműködő partner", subtitle: "Cég- és kapcsolati adatok", newPartner: "Új partner", existingPartner: "Meglévő partner", companyName: "Cégnév", vatNumber: "Adószám", address: "Cím", postalCode: "Irányítószám", city: "Város", country: "Ország", invoiceEmail: "Számla e-mail", paymentTerms: "Fizetési feltételek", currencyCode: "Pénznem", role: "Szerep", name: "Név", phone: "Telefon", firstContact: "Első kapcsolat", addPerson: "Személy hozzáadása", removePerson: "Eltávolítás", submit: "Küldés", sending: "Küldés...", next: "Tovább", back: "Vissza", stepOf: "{current}. lépés / {total}", requiredField: "* Kötelező mező", selectPlaceholder: "Szerep kiválasztása", sections: ["1. Cég és vezetés", "2. Pénzügy", "3. Beszerzés és logisztika", "4. Értékesítés", "5. Műhely és szerviz", "6. Marketing", "7. Végül / ellenőrzés"] };
const sv: CompanyContactInfoCopy = { ...en, title: "Ny samarbetspartner", subtitle: "Företags- och kontaktuppgifter", newPartner: "Ny samarbetspartner", existingPartner: "Befintlig partner", companyName: "Företagsnamn", vatNumber: "Moms/VAT-nr", address: "Adress", postalCode: "Postnummer", city: "Stad", country: "Land", invoiceEmail: "Faktura-e-post", paymentTerms: "Betalningsvillkor", currencyCode: "Valuta", role: "Roll", name: "Namn", phone: "Telefon", firstContact: "Första kontakt", addPerson: "Lägg till person", removePerson: "Ta bort", submit: "Skicka", sending: "Skickar...", next: "Nästa", back: "Tillbaka", stepOf: "Steg {current} av {total}", requiredField: "* Obligatoriskt fält", selectPlaceholder: "Välj roll", sections: ["1. Företag & ledning", "2. Ekonomi", "3. Inköp & logistik", "4. Försäljning", "5. Verkstad & service", "6. Marknadsföring", "7. Till sist / granskning"] };
const fr: CompanyContactInfoCopy = { ...en, title: "Nouveau partenaire de collaboration", subtitle: "Informations entreprise et contact", newPartner: "Nouveau partenaire", existingPartner: "Partenaire existant", companyName: "Nom de l'entreprise", vatNumber: "N° TVA", address: "Adresse", postalCode: "Code postal", city: "Ville", country: "Pays", invoiceEmail: "E-mail de facturation", paymentTerms: "Conditions de paiement", currencyCode: "Devise", role: "Rôle", name: "Nom", phone: "Téléphone", firstContact: "Premier contact", addPerson: "Ajouter une personne", removePerson: "Supprimer", submit: "Envoyer", sending: "Envoi...", next: "Suivant", back: "Retour", stepOf: "Étape {current} sur {total}", requiredField: "* Champ obligatoire", selectPlaceholder: "Choisir un rôle", sections: ["1. Entreprise & direction", "2. Finance", "3. Achats & logistique", "4. Ventes", "5. Atelier & service", "6. Marketing", "7. Final / vérification"] };
const pl: CompanyContactInfoCopy = { ...en, title: "Nowy partner współpracy", subtitle: "Dane firmy i kontaktu", newPartner: "Nowy partner", existingPartner: "Istniejący partner", companyName: "Nazwa firmy", vatNumber: "NIP/VAT", address: "Adres", postalCode: "Kod pocztowy", city: "Miasto", country: "Kraj", invoiceEmail: "E-mail do faktur", paymentTerms: "Warunki płatności", currencyCode: "Waluta", role: "Rola", name: "Imię i nazwisko", phone: "Telefon", firstContact: "Pierwszy kontakt", addPerson: "Dodaj osobę", removePerson: "Usuń", submit: "Wyślij", sending: "Wysyłanie...", next: "Dalej", back: "Wstecz", stepOf: "Krok {current} z {total}", requiredField: "* Pole wymagane", selectPlaceholder: "Wybierz rolę", sections: ["1. Firma i zarząd", "2. Finanse", "3. Zakupy i logistyka", "4. Sprzedaż", "5. Warsztat i serwis", "6. Marketing", "7. Na koniec / przegląd"] };
const cs: CompanyContactInfoCopy = { ...en, title: "Nový spolupracující partner", subtitle: "Firemní a kontaktní údaje", newPartner: "Nový partner", existingPartner: "Stávající partner", companyName: "Název společnosti", vatNumber: "DIČ/VAT", address: "Adresa", postalCode: "PSČ", city: "Město", country: "Země", invoiceEmail: "E-mail pro faktury", paymentTerms: "Platební podmínky", currencyCode: "Měna", role: "Role", name: "Jméno", phone: "Telefon", firstContact: "První kontakt", addPerson: "Přidat osobu", removePerson: "Odebrat", submit: "Odeslat", sending: "Odesílání...", next: "Další", back: "Zpět", stepOf: "Krok {current} z {total}", requiredField: "* Povinné pole", selectPlaceholder: "Vyberte roli", sections: ["1. Společnost a vedení", "2. Finance", "3. Nákup a logistika", "4. Prodej", "5. Dílna a servis", "6. Marketing", "7. Nakonec / kontrola"] };

const COPY: Record<PortalUiLanguage, CompanyContactInfoCopy> = { da, en, de, it, hu, sv, fr, pl, cs };

export function getCompanyContactInfoCopy(language: PortalUiLanguage): CompanyContactInfoCopy {
  return COPY[language] ?? COPY.en;
}

export function formatCompanyContactInfoStep(copy: CompanyContactInfoCopy, current: number, total: number): string {
  return copy.stepOf.replace("{current}", String(current)).replace("{total}", String(total));
}

export function getCompanyContactInfoRoleLabel(copy: CompanyContactInfoCopy, key: ProfileI18nKey): string {
  return copy.roleLabels[key] ?? en.roleLabels[key] ?? key;
}
