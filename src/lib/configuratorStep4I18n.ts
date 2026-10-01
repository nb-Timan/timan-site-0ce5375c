import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type ConfiguratorCustomerModeCopy = {
  title: string;
  useDealer: string;
  enterManual: string;
  dealer: string;
  dealerContact: string;
  chooseContact: string;
  noContacts: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
};

const COPY: Record<PortalUiLanguage, ConfiguratorCustomerModeCopy> = {
  da: { title: 'Kundeoplysninger', useDealer: 'Brug forhandlerens oplysninger', enterManual: 'Indtast anden kunde manuelt', dealer: 'Forhandler', dealerContact: 'Kontaktperson', chooseContact: 'Vælg kontaktperson', noContacts: 'Ingen kontaktpersoner er registreret. Udfyld kontaktoplysningerne manuelt.', address: 'Adresse', postalCode: 'Postnr.', city: 'By', country: 'Land' },
  en: { title: 'Customer details', useDealer: 'Use dealer details', enterManual: 'Enter another customer manually', dealer: 'Dealer', dealerContact: 'Contact person', chooseContact: 'Choose contact person', noContacts: 'No contacts are registered. Enter the contact details manually.', address: 'Address', postalCode: 'Postal code', city: 'City', country: 'Country' },
  de: { title: 'Kundendaten', useDealer: 'Händlerdaten verwenden', enterManual: 'Anderen Kunden manuell eingeben', dealer: 'Händler', dealerContact: 'Kontaktperson', chooseContact: 'Kontaktperson wählen', noContacts: 'Keine Kontaktpersonen hinterlegt. Kontaktinformationen manuell eingeben.', address: 'Adresse', postalCode: 'Postleitzahl', city: 'Stadt', country: 'Land' },
  it: { title: 'Dati cliente', useDealer: 'Usa i dati del rivenditore', enterManual: 'Inserisci manualmente un altro cliente', dealer: 'Rivenditore', dealerContact: 'Persona di contatto', chooseContact: 'Scegli la persona di contatto', noContacts: 'Nessun contatto registrato. Inserisci manualmente i dati.', address: 'Indirizzo', postalCode: 'CAP', city: 'Città', country: 'Paese' },
  hu: { title: 'Ügyféladatok', useDealer: 'Kereskedői adatok használata', enterManual: 'Másik ügyfél kézi megadása', dealer: 'Kereskedő', dealerContact: 'Kapcsolattartó', chooseContact: 'Kapcsolattartó kiválasztása', noContacts: 'Nincs regisztrált kapcsolattartó. Adja meg kézzel az adatokat.', address: 'Cím', postalCode: 'Irányítószám', city: 'Város', country: 'Ország' },
  sv: { title: 'Kunduppgifter', useDealer: 'Använd återförsäljarens uppgifter', enterManual: 'Ange en annan kund manuellt', dealer: 'Återförsäljare', dealerContact: 'Kontaktperson', chooseContact: 'Välj kontaktperson', noContacts: 'Inga kontaktpersoner är registrerade. Ange kontaktuppgifterna manuellt.', address: 'Adress', postalCode: 'Postnummer', city: 'Ort', country: 'Land' },
  fr: { title: 'Coordonnées client', useDealer: 'Utiliser les coordonnées du revendeur', enterManual: 'Saisir un autre client manuellement', dealer: 'Revendeur', dealerContact: 'Personne de contact', chooseContact: 'Choisir une personne de contact', noContacts: 'Aucun contact enregistré. Saisissez les coordonnées manuellement.', address: 'Adresse', postalCode: 'Code postal', city: 'Ville', country: 'Pays' },
  pl: { title: 'Dane klienta', useDealer: 'Użyj danych dealera', enterManual: 'Wprowadź innego klienta ręcznie', dealer: 'Dealer', dealerContact: 'Osoba kontaktowa', chooseContact: 'Wybierz osobę kontaktową', noContacts: 'Brak zarejestrowanych kontaktów. Wprowadź dane ręcznie.', address: 'Adres', postalCode: 'Kod pocztowy', city: 'Miasto', country: 'Kraj' },
  cs: { title: 'Údaje zákazníka', useDealer: 'Použít údaje prodejce', enterManual: 'Zadat jiného zákazníka ručně', dealer: 'Prodejce', dealerContact: 'Kontaktní osoba', chooseContact: 'Vyberte kontaktní osobu', noContacts: 'Nejsou evidovány žádné kontakty. Zadejte údaje ručně.', address: 'Adresa', postalCode: 'PSČ', city: 'Město', country: 'Země' },
};

export function configuratorCustomerModeCopy(language: PortalUiLanguage): ConfiguratorCustomerModeCopy {
  return COPY[language];
}
