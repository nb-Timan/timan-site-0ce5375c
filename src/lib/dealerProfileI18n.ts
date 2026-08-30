/**
 * Translations for the self-service dealer profile editor (DealerDataPage).
 * Languages: da, en, de, it, hu. Keep strings UI-only — no business logic.
 */
import type { Language } from "@/types/configurator";

export type ProfileI18nKey =
  | "profileTitle" | "profileSubtitle"
  | "progressComplete" | "progressMissing" | "progressFilled" | "progressOf"
  | "statusComplete" | "statusPartial" | "statusEmpty"
  | "save" | "saving" | "saved" | "saveError" | "required"
  | "sec1" | "sec2" | "sec3" | "sec4" | "sec5" | "sec6"
  | "companyName" | "address" | "addressLine1" | "addressLine2" | "postalCode" | "city" | "country"
  | "vatNumber" | "directorName" | "directorMultiple" | "phone" | "email"
  | "financeContactName" | "financePhone" | "financeEmail" | "invoiceEmail" | "paymentTerms" | "currencyCode"
  | "website" | "facebook" | "linkedin" | "tiktok" | "youtube" | "instagram"
  | "salesContactName" | "salesPhone" | "salesEmail" | "salesMultiple"
  | "workshopContactName" | "workshopPhone" | "workshopEmail" | "workshopMultiple"
  | "marketingContactName" | "marketingPhone" | "marketingEmail"
  | "yes" | "no" | "addPerson" | "removePerson"
  | "role" | "name" | "contact"
  | "roleDirector" | "roleOwner" | "roleManagingDirector"
  | "roleSalesDirector" | "roleSalesRep" | "roleSalesCoordinator" | "roleKeyAccount"
  | "roleWorkshopManager" | "roleMechanic" | "rolePartsManager" | "rolePartsPurchasing" | "roleStockManager" | "roleServiceCoord"
  | "roleOther" | "area_primary";

const dict: Record<Language, Record<ProfileI18nKey, string>> = {
  da: {
    profileTitle: "Forhandlerprofil",
    profileSubtitle: "Udfyld jeres stamdata. En Gem-knap gemmer hele profilen.",
    progressComplete: "Profil komplet",
    progressMissing: "Mangler",
    progressFilled: "Profil",
    progressOf: "af",
    statusComplete: "Komplet",
    statusPartial: "Delvist udfyldt",
    statusEmpty: "Ikke udfyldt",
    save: "Gem", saving: "Gemmer…", saved: "Gemt", saveError: "Kunne ikke gemme",
    required: "påkrævet",
    sec1: "Firma information", sec2: "Økonomi afdeling", sec3: "Medier",
    sec4: "Salgsafdeling", sec5: "Værksted og reservedele", sec6: "Marketing",
    companyName: "Firmanavn", address: "Firma adresse", addressLine1: "Adresse 1", addressLine2: "Adresse 2", postalCode: "Postnummer", city: "By", country: "Land",
    vatNumber: "CVR/VAT nr.", directorName: "Direktør navn", directorMultiple: "Flere direktører?", phone: "Telefon", email: "E-mail",
    financeContactName: "Økonomi kontaktperson", financePhone: "Telefon", financeEmail: "E-mail", invoiceEmail: "E-mail til faktura",
    paymentTerms: "Betalingsbetingelser", currencyCode: "Valuta",
    website: "Hjemmeside", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram",
    salesContactName: "Salg kontaktperson", salesPhone: "Telefon", salesEmail: "E-mail", salesMultiple: "Flere salgspersoner?",
    workshopContactName: "Værksted/reservedel kontaktperson", workshopPhone: "Telefon", workshopEmail: "E-mail", workshopMultiple: "Flere personer?",
    marketingContactName: "Marketing kontaktperson", marketingPhone: "Telefon", marketingEmail: "E-mail",
    yes: "Ja", no: "Nej", addPerson: "Tilføj person", removePerson: "Fjern",
    role: "Rolle", name: "Navn", contact: "Kontakt",
    roleDirector: "Direktør", roleOwner: "Ejer", roleManagingDirector: "Daglig leder",
    roleSalesDirector: "Salgsdirektør", roleSalesRep: "Sælger", roleSalesCoordinator: "Salgskoordinator", roleKeyAccount: "Key Account",
    roleWorkshopManager: "Værkstedschef", roleMechanic: "Mekaniker", rolePartsManager: "Reservedelsansvarlig",
    rolePartsPurchasing: "Indkøb / reservedele", roleStockManager: "Lageransvarlig", roleServiceCoord: "Servicekoordinator", roleOther: "Andet", area_primary: "Primær",
  },
  en: {
    profileTitle: "Dealer profile",
    profileSubtitle: "Fill in your company details. Any Save button saves the full profile.",
    progressComplete: "Profile complete",
    progressMissing: "Missing",
    progressFilled: "Profile",
    progressOf: "of",
    statusComplete: "Complete", statusPartial: "Partially filled", statusEmpty: "Not filled",
    save: "Save", saving: "Saving…", saved: "Saved", saveError: "Could not save",
    required: "required",
    sec1: "Company information", sec2: "Finance department", sec3: "Media",
    sec4: "Sales department", sec5: "Workshop & spare parts", sec6: "Marketing",
    companyName: "Company name", address: "Address", addressLine1: "Address line 1", addressLine2: "Address line 2", postalCode: "Postal code", city: "City", country: "Country",
    vatNumber: "VAT no.", directorName: "Director name", directorMultiple: "More directors?", phone: "Phone", email: "E-mail",
    financeContactName: "Finance contact", financePhone: "Phone", financeEmail: "E-mail", invoiceEmail: "Invoice e-mail",
    paymentTerms: "Payment terms", currencyCode: "Currency",
    website: "Website", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram",
    salesContactName: "Sales contact", salesPhone: "Phone", salesEmail: "E-mail", salesMultiple: "More sales people?",
    workshopContactName: "Workshop/parts contact", workshopPhone: "Phone", workshopEmail: "E-mail", workshopMultiple: "More people?",
    marketingContactName: "Marketing contact", marketingPhone: "Phone", marketingEmail: "E-mail",
    yes: "Yes", no: "No", addPerson: "Add person", removePerson: "Remove",
    role: "Role", name: "Name", contact: "Contact",
    roleDirector: "Director", roleOwner: "Owner", roleManagingDirector: "Managing director",
    roleSalesDirector: "Sales Director", roleSalesRep: "Sales Rep", roleSalesCoordinator: "Sales Coordinator", roleKeyAccount: "Key Account",
    roleWorkshopManager: "Workshop Manager", roleMechanic: "Mechanic", rolePartsManager: "Parts Manager",
    rolePartsPurchasing: "Purchasing / spare parts", roleStockManager: "Stock Manager", roleServiceCoord: "Service Coordinator", roleOther: "Other", area_primary: "Primary",
  },
  de: {
    profileTitle: "Händlerprofil",
    profileSubtitle: "Stammdaten ausfüllen. Jede Speichern-Schaltfläche speichert das gesamte Profil.",
    progressComplete: "Profil vollständig", progressMissing: "Fehlt", progressFilled: "Profil", progressOf: "von",
    statusComplete: "Vollständig", statusPartial: "Teilweise ausgefüllt", statusEmpty: "Nicht ausgefüllt",
    save: "Speichern", saving: "Speichern…", saved: "Gespeichert", saveError: "Speichern fehlgeschlagen",
    required: "erforderlich",
    sec1: "Firmenangaben", sec2: "Buchhaltung", sec3: "Medien",
    sec4: "Vertrieb", sec5: "Werkstatt & Ersatzteile", sec6: "Marketing",
    companyName: "Firmenname", address: "Adresse", addressLine1: "Adresse 1", addressLine2: "Adresse 2", postalCode: "PLZ", city: "Stadt", country: "Land",
    vatNumber: "USt-IdNr.", directorName: "Geschäftsführer", directorMultiple: "Weitere Geschäftsführer?", phone: "Telefon", email: "E-Mail",
    financeContactName: "Buchhaltungskontakt", financePhone: "Telefon", financeEmail: "E-Mail", invoiceEmail: "Rechnungs-E-Mail",
    paymentTerms: "Zahlungsbedingungen", currencyCode: "Währung",
    website: "Website", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram",
    salesContactName: "Vertriebskontakt", salesPhone: "Telefon", salesEmail: "E-Mail", salesMultiple: "Mehrere Vertriebsmitarbeiter?",
    workshopContactName: "Werkstatt/Ersatzteil-Kontakt", workshopPhone: "Telefon", workshopEmail: "E-Mail", workshopMultiple: "Weitere Personen?",
    marketingContactName: "Marketingkontakt", marketingPhone: "Telefon", marketingEmail: "E-Mail",
    yes: "Ja", no: "Nein", addPerson: "Person hinzufügen", removePerson: "Entfernen",
    role: "Rolle", name: "Name", contact: "Kontakt",
    roleDirector: "Geschäftsführer", roleOwner: "Inhaber", roleManagingDirector: "Betriebsleiter",
    roleSalesDirector: "Vertriebsleiter", roleSalesRep: "Verkäufer", roleSalesCoordinator: "Vertriebskoordinator", roleKeyAccount: "Key Account",
    roleWorkshopManager: "Werkstattleiter", roleMechanic: "Mechaniker", rolePartsManager: "Ersatzteilverantwortlicher",
    rolePartsPurchasing: "Einkauf / Ersatzteile", roleStockManager: "Lagerverantwortlicher", roleServiceCoord: "Servicekoordinator", roleOther: "Sonstiges", area_primary: "Primär",
  },
  it: {
    profileTitle: "Profilo concessionario",
    profileSubtitle: "Compila i dati aziendali. Qualsiasi pulsante Salva salva tutto il profilo.",
    progressComplete: "Profilo completo", progressMissing: "Mancano", progressFilled: "Profilo", progressOf: "di",
    statusComplete: "Completo", statusPartial: "Parzialmente compilato", statusEmpty: "Non compilato",
    save: "Salva", saving: "Salvataggio…", saved: "Salvato", saveError: "Impossibile salvare",
    required: "obbligatorio",
    sec1: "Informazioni azienda", sec2: "Amministrazione", sec3: "Media",
    sec4: "Vendite", sec5: "Officina e ricambi", sec6: "Marketing",
    companyName: "Ragione sociale", address: "Indirizzo", addressLine1: "Indirizzo 1", addressLine2: "Indirizzo 2", postalCode: "CAP", city: "Città", country: "Paese",
    vatNumber: "Partita IVA", directorName: "Amministratore", directorMultiple: "Più amministratori?", phone: "Telefono", email: "E-mail",
    financeContactName: "Contatto amministrazione", financePhone: "Telefono", financeEmail: "E-mail", invoiceEmail: "E-mail fatture",
    paymentTerms: "Termini di pagamento", currencyCode: "Valuta",
    website: "Sito web", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram",
    salesContactName: "Contatto vendite", salesPhone: "Telefono", salesEmail: "E-mail", salesMultiple: "Altri venditori?",
    workshopContactName: "Contatto officina/ricambi", workshopPhone: "Telefono", workshopEmail: "E-mail", workshopMultiple: "Altre persone?",
    marketingContactName: "Contatto marketing", marketingPhone: "Telefono", marketingEmail: "E-mail",
    yes: "Sì", no: "No", addPerson: "Aggiungi persona", removePerson: "Rimuovi",
    role: "Ruolo", name: "Nome", contact: "Contatto",
    roleDirector: "Amministratore", roleOwner: "Titolare", roleManagingDirector: "Direttore generale",
    roleSalesDirector: "Direttore vendite", roleSalesRep: "Venditore", roleSalesCoordinator: "Coordinatore vendite", roleKeyAccount: "Key Account",
    roleWorkshopManager: "Capo officina", roleMechanic: "Meccanico", rolePartsManager: "Resp. ricambi",
    rolePartsPurchasing: "Acquisti / ricambi", roleStockManager: "Resp. magazzino", roleServiceCoord: "Coordinatore service", roleOther: "Altro", area_primary: "Primario",
  },
  hu: {
    profileTitle: "Kereskedői profil",
    profileSubtitle: "Töltsd ki a cég adatait. Bármely mentés gomb a teljes profilt menti.",
    progressComplete: "Profil teljes", progressMissing: "Hiányzik", progressFilled: "Profil", progressOf: "/",
    statusComplete: "Teljes", statusPartial: "Részben kitöltve", statusEmpty: "Nincs kitöltve",
    save: "Mentés", saving: "Mentés…", saved: "Mentve", saveError: "Mentés sikertelen",
    required: "kötelező",
    sec1: "Cégadatok", sec2: "Pénzügy", sec3: "Média",
    sec4: "Értékesítés", sec5: "Szerviz és alkatrész", sec6: "Marketing",
    companyName: "Cégnév", address: "Cím", addressLine1: "Cím 1", addressLine2: "Cím 2", postalCode: "Irányítószám", city: "Város", country: "Ország",
    vatNumber: "Adószám", directorName: "Ügyvezető", directorMultiple: "Több ügyvezető?", phone: "Telefon", email: "E-mail",
    financeContactName: "Pénzügyi kapcsolattartó", financePhone: "Telefon", financeEmail: "E-mail", invoiceEmail: "Számla e-mail",
    paymentTerms: "Fizetési feltételek", currencyCode: "Pénznem",
    website: "Weboldal", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram",
    salesContactName: "Értékesítési kapcsolattartó", salesPhone: "Telefon", salesEmail: "E-mail", salesMultiple: "Több értékesítő?",
    workshopContactName: "Szerviz/alkatrész kapcsolattartó", workshopPhone: "Telefon", workshopEmail: "E-mail", workshopMultiple: "Több személy?",
    marketingContactName: "Marketing kapcsolattartó", marketingPhone: "Telefon", marketingEmail: "E-mail",
    yes: "Igen", no: "Nem", addPerson: "Személy hozzáadása", removePerson: "Eltávolítás",
    role: "Szerep", name: "Név", contact: "Kapcsolat",
    roleDirector: "Ügyvezető", roleOwner: "Tulajdonos", roleManagingDirector: "Cégvezető",
    roleSalesDirector: "Értékesítési igazgató", roleSalesRep: "Értékesítő", roleSalesCoordinator: "Értékesítési koordinátor", roleKeyAccount: "Key Account",
    roleWorkshopManager: "Szervizvezető", roleMechanic: "Szerelő", rolePartsManager: "Alkatrész felelős",
    rolePartsPurchasing: "Beszerzés / alkatrészek", roleStockManager: "Raktárfelelős", roleServiceCoord: "Szervizkoordinátor", roleOther: "Egyéb", area_primary: "Elsődleges",
  },
};

export function tProfile(lang: Language, key: ProfileI18nKey): string {
  return dict[lang]?.[key] ?? dict.da[key] ?? key;
}
