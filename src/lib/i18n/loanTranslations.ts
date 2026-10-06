import type { PortalUiLanguage } from '@/lib/portalLanguages';

type LoanTranslations = Record<PortalUiLanguage, Record<string, string>>;

export const LOAN_TRANSLATIONS: LoanTranslations = {
  da: {
    area_loans_title: 'Lån af maskiner fra Timan',
    area_loans_desc: 'Opret, accepter og afslut lån af Timan-maskiner.',
    loansNewCase: 'Nyt lån', loansCases: 'Lånesager', loansNoCases: 'Ingen lånesager endnu.',
    loansSeller: 'Ansvarlig Timan-sælger', loansPartner: 'Samarbejdspartner', loansContact: 'Kontaktperson',
    loansExpectedReturn: 'Forventet retur', loansStatus: 'Status', loansNotes: 'Noter', loansSaveDraft: 'Gem kladde',
    loansSelectSeller: 'Vælg sælger', loansSelectPartner: 'Vælg samarbejdspartner', loansSelectContact: 'Vælg kontaktperson',
    loansNoContacts: 'Ingen kontaktpersoner registreret på denne samarbejdspartner.',
    loansMachine: 'Maskine', loansAddMachine: 'Tilføj maskine', loansNoEligibleMachines: 'Ingen låneegnede maskiner er registreret.',
    loansWarehouseMissing: 'Lagerplacering er endnu ikke registreret på Planning-enhederne.',
    loansEquipmentUnavailable: 'Serialiserede redskaber er endnu ikke tilgængelige i Planning.',
    loansUsageReading: 'Km-/timetæller', loansUsageUnit: 'Enhed', loansUseLimit: 'Kørsels-/brugsbegrænsning',
    loansResponsiblePerson: 'Ansvarlig person', loansSerialVerified: 'Serienummer verificeret', loansPhotos: 'Billeder',
    loansSerialPlatePhoto: 'Typeskilt / serienummer', loansGeneralPhoto: 'Oversigtsbillede',
    loansAlternativeAddress: 'Alternativ leveringsadresse', loansAddress: 'Adresse', loansPostalCode: 'Postnr.',
    loansCity: 'By', loansCountry: 'Land', loansAddressContact: 'Kontakt', loansAddressNote: 'Leveringsnote',
    loansCreateVersion: 'Opret version til accept', loansVersionCreated: 'Versionen er oprettet.',
    loansTermsMissing: 'Der er endnu ingen godkendte lånebetingelser. Accept er derfor ikke mulig.',
    loansAcceptance: 'Accept', loansReturn: 'Returnering', loansLoading: 'Henter lånesager…', loansLoadError: 'Lånesager kunne ikke hentes.',
  },
  en: {
    area_loans_title: 'Loans from Timan', area_loans_desc: 'Create, accept and close loans of Timan machines.',
    loansNewCase: 'New loan', loansCases: 'Loan cases', loansNoCases: 'No loan cases yet.', loansSeller: 'Responsible Timan seller',
    loansPartner: 'Partner', loansContact: 'Contact', loansExpectedReturn: 'Expected return', loansStatus: 'Status', loansNotes: 'Notes',
    loansSaveDraft: 'Save draft', loansSelectSeller: 'Select seller', loansSelectPartner: 'Select partner', loansSelectContact: 'Select contact',
    loansNoContacts: 'No contacts are registered for this partner.', loansMachine: 'Machine', loansAddMachine: 'Add machine',
    loansNoEligibleMachines: 'No loan-eligible machines are registered.', loansWarehouseMissing: 'Warehouse location is not yet registered on the Planning units.',
    loansEquipmentUnavailable: 'Serialized equipment is not yet available in Planning.', loansUsageReading: 'Km/hour reading', loansUsageUnit: 'Unit',
    loansUseLimit: 'Driving/use limitation', loansResponsiblePerson: 'Responsible person', loansSerialVerified: 'Serial number verified',
    loansPhotos: 'Photos', loansSerialPlatePhoto: 'Serial plate / serial number', loansGeneralPhoto: 'Overview photo',
    loansAlternativeAddress: 'Alternative delivery address', loansAddress: 'Address', loansPostalCode: 'Postal code', loansCity: 'City',
    loansCountry: 'Country', loansAddressContact: 'Contact', loansAddressNote: 'Delivery note', loansCreateVersion: 'Create version for acceptance',
    loansVersionCreated: 'The version was created.', loansTermsMissing: 'No approved loan terms exist yet. Acceptance is therefore unavailable.',
    loansAcceptance: 'Acceptance', loansReturn: 'Return', loansLoading: 'Loading loan cases…', loansLoadError: 'Loan cases could not be loaded.',
  },
  de: {
    area_loans_title: 'Leihmaschinen von Timan', area_loans_desc: 'Leihvorgänge für Timan-Maschinen erstellen, annehmen und abschließen.',
    loansNewCase: 'Neue Leihe', loansCases: 'Leihvorgänge', loansNoCases: 'Noch keine Leihvorgänge.', loansSeller: 'Verantwortlicher Timan-Verkäufer',
    loansPartner: 'Partner', loansContact: 'Kontaktperson', loansExpectedReturn: 'Erwartete Rückgabe', loansStatus: 'Status', loansNotes: 'Notizen',
    loansSaveDraft: 'Entwurf speichern', loansSelectSeller: 'Verkäufer wählen', loansSelectPartner: 'Partner wählen', loansSelectContact: 'Kontakt wählen',
    loansNoContacts: 'Für diesen Partner sind keine Kontaktpersonen registriert.', loansMachine: 'Maschine', loansAddMachine: 'Maschine hinzufügen',
    loansNoEligibleMachines: 'Keine leihfähigen Maschinen registriert.', loansWarehouseMissing: 'Der Lagerort ist für die Planning-Einheiten noch nicht registriert.',
    loansEquipmentUnavailable: 'Serialisierte Anbaugeräte sind in Planning noch nicht verfügbar.', loansUsageReading: 'Km-/Betriebsstundenzähler', loansUsageUnit: 'Einheit',
    loansUseLimit: 'Fahr-/Nutzungsbegrenzung', loansResponsiblePerson: 'Verantwortliche Person', loansSerialVerified: 'Seriennummer geprüft', loansPhotos: 'Bilder',
    loansSerialPlatePhoto: 'Typenschild / Seriennummer', loansGeneralPhoto: 'Übersichtsbild', loansAlternativeAddress: 'Alternative Lieferadresse',
    loansAddress: 'Adresse', loansPostalCode: 'Postleitzahl', loansCity: 'Ort', loansCountry: 'Land', loansAddressContact: 'Kontakt',
    loansAddressNote: 'Lieferhinweis', loansCreateVersion: 'Version zur Annahme erstellen', loansVersionCreated: 'Die Version wurde erstellt.',
    loansTermsMissing: 'Es gibt noch keine genehmigten Leihbedingungen. Eine Annahme ist daher nicht möglich.', loansAcceptance: 'Annahme',
    loansReturn: 'Rückgabe', loansLoading: 'Leihvorgänge werden geladen…', loansLoadError: 'Leihvorgänge konnten nicht geladen werden.',
  },
  it: {}, hu: {}, sv: {}, fr: {}, pl: {}, cs: {},
};

for (const code of ['it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const) {
  LOAN_TRANSLATIONS[code] = { ...LOAN_TRANSLATIONS.en };
}

Object.assign(LOAN_TRANSLATIONS.it, {
  area_loans_title: 'Prestiti di macchine Timan', area_loans_desc: 'Crea, accetta e chiudi i prestiti di macchine Timan.',
  loansNewCase: 'Nuovo prestito', loansCases: 'Pratiche di prestito',
});
Object.assign(LOAN_TRANSLATIONS.hu, {
  area_loans_title: 'Timan gépkölcsönzés', area_loans_desc: 'Timan gépkölcsönzések létrehozása, elfogadása és lezárása.',
  loansNewCase: 'Új kölcsönzés', loansCases: 'Kölcsönzési ügyek',
});
Object.assign(LOAN_TRANSLATIONS.sv, {
  area_loans_title: 'Lån av maskiner från Timan', area_loans_desc: 'Skapa, godkänn och avsluta lån av Timan-maskiner.',
  loansNewCase: 'Nytt lån', loansCases: 'Låneärenden',
});
Object.assign(LOAN_TRANSLATIONS.fr, {
  area_loans_title: 'Prêt de machines Timan', area_loans_desc: 'Créez, acceptez et clôturez les prêts de machines Timan.',
  loansNewCase: 'Nouveau prêt', loansCases: 'Dossiers de prêt',
});
Object.assign(LOAN_TRANSLATIONS.pl, {
  area_loans_title: 'Wypożyczenia maszyn Timan', area_loans_desc: 'Twórz, akceptuj i zamykaj wypożyczenia maszyn Timan.',
  loansNewCase: 'Nowe wypożyczenie', loansCases: 'Sprawy wypożyczeń',
});
Object.assign(LOAN_TRANSLATIONS.cs, {
  area_loans_title: 'Zápůjčky strojů Timan', area_loans_desc: 'Vytvářejte, přijímejte a uzavírejte zápůjčky strojů Timan.',
  loansNewCase: 'Nová zápůjčka', loansCases: 'Případy zápůjček',
});
