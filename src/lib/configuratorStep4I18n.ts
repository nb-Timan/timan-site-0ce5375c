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

export type ConfiguratorSubmittedOrderCopy = {
  correctionActive: string;
  editSubmittedOrder: string;
  correctionDescription: string;
  legacyRepriceWarning: string;
  reason: string;
  reasonPlaceholder: string;
  cancel: string;
  opening: string;
  startCorrection: string;
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

const SUBMITTED_ORDER_COPY: Record<PortalUiLanguage, ConfiguratorSubmittedOrderCopy> = {
  da: { correctionActive: 'Backend-rettelse er aktiv. Gem ændringer for at låse igen.', editSubmittedOrder: 'Ret afgivet ordre', correctionDescription: 'Rettelsen gælder kun denne ordre og bliver logget med begrundelse. Ordren forbliver afgivet og låses igen, når ændringerne gemmes.', legacyRepriceWarning: 'Denne ældre ordre har ingen gemte linjepriser. Jeg accepterer, at den ved denne rettelse opdateres til de nuværende katalogpriser og logges som en prisrevision.', reason: 'Begrundelse', reasonPlaceholder: 'Beskriv rettelsen...', cancel: 'Annuller', opening: 'Åbner...', startCorrection: 'Start rettelse' },
  en: { correctionActive: 'Backend correction is active. Save changes to lock the order again.', editSubmittedOrder: 'Correct submitted order', correctionDescription: 'The correction applies only to this order and is logged with its reason. The order remains submitted and is locked again when the changes are saved.', legacyRepriceWarning: 'This older order has no saved line prices. I accept that this correction updates it to the current catalogue prices and logs the change as a price revision.', reason: 'Reason', reasonPlaceholder: 'Describe the correction...', cancel: 'Cancel', opening: 'Opening...', startCorrection: 'Start correction' },
  de: { correctionActive: 'Die Backend-Korrektur ist aktiv. Speichern Sie die Änderungen, um den Auftrag wieder zu sperren.', editSubmittedOrder: 'Gesendeten Auftrag korrigieren', correctionDescription: 'Die Korrektur gilt nur für diesen Auftrag und wird mit Begründung protokolliert. Der Auftrag bleibt gesendet und wird nach dem Speichern wieder gesperrt.', legacyRepriceWarning: 'Für diesen älteren Auftrag sind keine Positionspreise gespeichert. Ich akzeptiere, dass er bei dieser Korrektur auf die aktuellen Katalogpreise aktualisiert und als Preisrevision protokolliert wird.', reason: 'Begründung', reasonPlaceholder: 'Korrektur beschreiben...', cancel: 'Abbrechen', opening: 'Wird geöffnet...', startCorrection: 'Korrektur starten' },
  it: { correctionActive: 'La correzione Backend è attiva. Salva le modifiche per bloccare nuovamente l’ordine.', editSubmittedOrder: 'Correggi ordine inviato', correctionDescription: 'La correzione si applica solo a questo ordine e viene registrata con la motivazione. L’ordine rimane inviato e viene nuovamente bloccato al salvataggio.', legacyRepriceWarning: 'Questo ordine precedente non contiene prezzi di riga salvati. Accetto che la correzione lo aggiorni ai prezzi di catalogo correnti e venga registrata come revisione dei prezzi.', reason: 'Motivazione', reasonPlaceholder: 'Descrivi la correzione...', cancel: 'Annulla', opening: 'Apertura...', startCorrection: 'Avvia correzione' },
  hu: { correctionActive: 'A Backend-helyesbítés aktív. Mentse a módosításokat a rendelés újbóli zárolásához.', editSubmittedOrder: 'Beküldött rendelés helyesbítése', correctionDescription: 'A helyesbítés csak erre a rendelésre vonatkozik, és az indoklással együtt naplózásra kerül. A rendelés beküldött marad, és mentés után ismét zárolódik.', legacyRepriceWarning: 'Ehhez a régebbi rendeléshez nincsenek mentett sorárak. Elfogadom, hogy a helyesbítés az aktuális katalógusárakra frissíti, és árfelülvizsgálatként naplózza.', reason: 'Indoklás', reasonPlaceholder: 'Írja le a helyesbítést...', cancel: 'Mégse', opening: 'Megnyitás...', startCorrection: 'Helyesbítés indítása' },
  sv: { correctionActive: 'Backend-korrigering är aktiv. Spara ändringarna för att låsa ordern igen.', editSubmittedOrder: 'Korrigera skickad order', correctionDescription: 'Korrigeringen gäller endast denna order och loggas med en motivering. Ordern förblir skickad och låses igen när ändringarna sparas.', legacyRepriceWarning: 'Denna äldre order saknar sparade radpriser. Jag godkänner att korrigeringen uppdaterar den till aktuella katalogpriser och loggas som en prisrevision.', reason: 'Motivering', reasonPlaceholder: 'Beskriv korrigeringen...', cancel: 'Avbryt', opening: 'Öppnar...', startCorrection: 'Starta korrigering' },
  fr: { correctionActive: 'La correction Backend est active. Enregistrez les modifications pour verrouiller à nouveau la commande.', editSubmittedOrder: 'Corriger la commande envoyée', correctionDescription: 'La correction s’applique uniquement à cette commande et est journalisée avec son motif. La commande reste envoyée et est de nouveau verrouillée après l’enregistrement.', legacyRepriceWarning: 'Cette ancienne commande ne contient aucun prix de ligne enregistré. J’accepte que cette correction applique les prix catalogue actuels et soit journalisée comme une révision de prix.', reason: 'Motif', reasonPlaceholder: 'Décrivez la correction...', cancel: 'Annuler', opening: 'Ouverture...', startCorrection: 'Démarrer la correction' },
  pl: { correctionActive: 'Korekta Backend jest aktywna. Zapisz zmiany, aby ponownie zablokować zamówienie.', editSubmittedOrder: 'Skoryguj wysłane zamówienie', correctionDescription: 'Korekta dotyczy wyłącznie tego zamówienia i jest rejestrowana wraz z uzasadnieniem. Zamówienie pozostaje wysłane i zostanie ponownie zablokowane po zapisaniu zmian.', legacyRepriceWarning: 'To starsze zamówienie nie ma zapisanych cen pozycji. Akceptuję aktualizację do bieżących cen katalogowych podczas tej korekty i zarejestrowanie jej jako rewizji cen.', reason: 'Uzasadnienie', reasonPlaceholder: 'Opisz korektę...', cancel: 'Anuluj', opening: 'Otwieranie...', startCorrection: 'Rozpocznij korektę' },
  cs: { correctionActive: 'Oprava Backend je aktivní. Uložte změny, aby se objednávka znovu uzamkla.', editSubmittedOrder: 'Opravit odeslanou objednávku', correctionDescription: 'Oprava se vztahuje pouze na tuto objednávku a zaznamená se včetně důvodu. Objednávka zůstane odeslaná a po uložení změn se znovu uzamkne.', legacyRepriceWarning: 'Tato starší objednávka nemá uložené ceny položek. Souhlasím, aby se při této opravě aktualizovala na aktuální katalogové ceny a změna se zaznamenala jako revize cen.', reason: 'Důvod', reasonPlaceholder: 'Popište opravu...', cancel: 'Zrušit', opening: 'Otevírání...', startCorrection: 'Zahájit opravu' },
};

export function configuratorCustomerModeCopy(language: PortalUiLanguage): ConfiguratorCustomerModeCopy {
  return COPY[language];
}

export function configuratorSubmittedOrderCopy(language: PortalUiLanguage): ConfiguratorSubmittedOrderCopy {
  return SUBMITTED_ORDER_COPY[language];
}
