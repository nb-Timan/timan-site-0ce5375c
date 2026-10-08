import type { PortalUiLanguage } from '@/lib/portalLanguages';

const keys = ['loansView', 'loansStockView', 'loansStockNew', 'loansStockUsed', 'loansStockRefresh',
  'loansStockUpdated', 'loansStockUpdating', 'loansStockFailed', 'loansStockNotReady', 'loansStockStale',
  'loansStockSearch', 'loansStockAccount', 'loansStockOrder', 'loansStockQuantity', 'loansStockDate',
  'loansStockReview', 'loansStockConflict', 'loansStockCandidate', 'loansStockExcluded', 'loansStockExternal',
  'loansStockAllocated', 'loansStockNoMatch', 'loansStockUnclassified', 'loansStockChoose', 'loansStockHeaderRequired'] as const;

const values: Record<PortalUiLanguage, string[]> = {
  da: ['Udlån','Salgslager','Nye ubrugte salgslagermaskiner','Brugte salgslagermaskiner','Opdater fra Fabric',
    'Sidst opdateret fra Fabric','Opdaterer...','Opdateringen mislykkedes. Seneste lagerdata er bevaret.','Fabric-synkronisering er ikke klar endnu.','Lagerdata er for gamle. Nye reservationer er blokeret.',
    'Søg i salgslager','Konto','Ordrenr.','Stk.','Seneste Fabric-dato','Kræver kontrol','Identitetskonflikt','Lånekandidat','Ikke lånekandidat','Ekstern placering',
    'Reserveret','Ingen matchende aktiver.','Produkttype kræver kontrol','Vælg aktiv','Vælg sælger, samarbejdspartner og kontaktperson før reservation.'],
  en: ['Loans','Sales stock','New unused sales-stock machines','Used sales-stock machines','Refresh from Fabric',
    'Last updated from Fabric','Updating...','Refresh failed. The last stock snapshot has been retained.','Fabric sync is not configured yet.','Stock data is stale. New reservations are blocked.',
    'Search sales stock','Account','Order no.','Qty.','Latest Fabric date','Review required','Identity conflict','Loan candidate','Not a loan candidate','External location',
    'Reserved','No matching assets.','Product type needs review','Select asset','Select a seller, partner and contact before reserving.'],
  de: ['Ausleihen','Verkaufsbestand','Neue unbenutzte Lagerverkaufsmaschinen','Gebrauchte Lagerverkaufsmaschinen','Aus Fabric aktualisieren',
    'Zuletzt aus Fabric aktualisiert','Wird aktualisiert...','Aktualisierung fehlgeschlagen. Der letzte Bestand bleibt erhalten.','Fabric-Synchronisierung ist noch nicht eingerichtet.','Bestandsdaten sind veraltet. Neue Reservierungen sind gesperrt.',
    'Verkaufsbestand durchsuchen','Konto','Auftragsnr.','Stück','Letztes Fabric-Datum','Prüfung erforderlich','Identitätskonflikt','Ausleihkandidat','Kein Ausleihkandidat','Externer Standort',
    'Reserviert','Keine passenden Einheiten.','Produkttyp muss geprüft werden','Einheit auswählen','Verkäufer, Partner und Kontakt vor der Reservierung auswählen.'],
  it: ['Prestiti','Stock di vendita','Macchine nuove e inutilizzate','Macchine usate','Aggiorna da Fabric',
    'Ultimo aggiornamento da Fabric','Aggiornamento...','Aggiornamento non riuscito. Ultimo stock conservato.','Sincronizzazione Fabric non ancora configurata.','Dati obsoleti. Nuove prenotazioni bloccate.',
    'Cerca nello stock','Conto','N. ordine','Qtà','Ultima data Fabric','Verifica necessaria','Conflitto di identità','Disponibile per prestito','Non disponibile per prestito','Ubicazione esterna',
    'Prenotato','Nessun bene corrispondente.','Verificare il tipo di prodotto','Seleziona bene','Selezionare venditore, partner e contatto prima di prenotare.'],
  hu: ['Kölcsönzések','Értékesítési készlet','Új, nem használt készletgépek','Használt készletgépek','Frissítés a Fabric rendszerből',
    'Utolsó frissítés a Fabric rendszerből','Frissítés...','A frissítés sikertelen. Az utolsó készlet megmaradt.','A Fabric-szinkronizálás még nincs beállítva.','A készletadatok elavultak. Új foglalás nem lehetséges.',
    'Keresés a készletben','Számla','Rendelésszám','Db','Legutóbbi Fabric-dátum','Ellenőrzés szükséges','Azonosítóütközés','Kölcsönözhető','Nem kölcsönözhető','Külső helyszín',
    'Foglalt','Nincs megfelelő eszköz.','A terméktípus ellenőrzendő','Eszköz kiválasztása','Foglalás előtt válasszon értékesítőt, partnert és kapcsolattartót.'],
  sv: ['Utlåning','Försäljningslager','Nya oanvända lagerförsäljningsmaskiner','Begagnade lagerförsäljningsmaskiner','Uppdatera från Fabric',
    'Senast uppdaterat från Fabric','Uppdaterar...','Uppdateringen misslyckades. Senaste lagerdata har behållits.','Fabric-synkronisering är inte konfigurerad ännu.','Lagerdata är för gamla. Nya reservationer är blockerade.',
    'Sök i försäljningslager','Konto','Ordernr','Antal','Senaste Fabric-datum','Kontroll krävs','Identitetskonflikt','Utlåningskandidat','Inte utlåningskandidat','Extern placering',
    'Reserverad','Inga matchande tillgångar.','Produkttyp måste kontrolleras','Välj tillgång','Välj säljare, partner och kontaktperson före reservation.'],
  fr: ['Prêts','Stock de vente','Machines neuves inutilisées','Machines d’occasion','Actualiser depuis Fabric',
    'Dernière actualisation depuis Fabric','Actualisation...','Échec de l’actualisation. Le dernier stock est conservé.','Synchronisation Fabric non configurée.','Stock obsolète. Nouvelles réservations bloquées.',
    'Rechercher dans le stock','Compte','N° commande','Qté','Dernière date Fabric','Contrôle requis','Conflit d’identité','Candidat au prêt','Non disponible au prêt','Emplacement externe',
    'Réservé','Aucun actif correspondant.','Type de produit à vérifier','Sélectionner un actif','Sélectionnez vendeur, partenaire et contact avant de réserver.'],
  pl: ['Wypożyczenia','Magazyn sprzedażowy','Nowe nieużywane maszyny','Maszyny używane','Odśwież z Fabric',
    'Ostatnia aktualizacja z Fabric','Aktualizowanie...','Aktualizacja nieudana. Zachowano ostatni stan magazynu.','Synchronizacja Fabric nie jest jeszcze skonfigurowana.','Dane są nieaktualne. Nowe rezerwacje są zablokowane.',
    'Szukaj w magazynie','Konto','Nr zamówienia','Szt.','Ostatnia data Fabric','Wymaga sprawdzenia','Konflikt tożsamości','Do wypożyczenia','Nie do wypożyczenia','Lokalizacja zewnętrzna',
    'Zarezerwowane','Brak pasujących zasobów.','Typ produktu wymaga sprawdzenia','Wybierz zasób','Przed rezerwacją wybierz sprzedawcę, partnera i kontakt.'],
  cs: ['Zápůjčky','Prodejní sklad','Nové nepoužité skladové stroje','Použité skladové stroje','Aktualizovat z Fabric',
    'Poslední aktualizace z Fabric','Aktualizace...','Aktualizace selhala. Poslední stav skladu byl zachován.','Synchronizace Fabric ještě není nastavena.','Data skladu jsou zastaralá. Nové rezervace jsou blokovány.',
    'Hledat ve skladu','Účet','Č. objednávky','Ks','Poslední datum Fabric','Vyžaduje kontrolu','Konflikt identity','Vhodné k zápůjčce','Nevhodné k zápůjčce','Externí umístění',
    'Rezervováno','Žádné odpovídající položky.','Typ produktu vyžaduje kontrolu','Vybrat položku','Před rezervací vyberte prodejce, partnera a kontakt.'],
};

const verification: Record<PortalUiLanguage, [string, string, string]> = {
  da: ['Kontrollér Fabric-adgang', 'Fabric-adgang verificeret', 'Fabric-adgang kunne ikke verificeres.'],
  en: ['Verify Fabric access', 'Fabric access verified', 'Fabric access could not be verified.'],
  de: ['Fabric-Zugriff prüfen', 'Fabric-Zugriff bestätigt', 'Fabric-Zugriff konnte nicht bestätigt werden.'],
  it: ['Verifica accesso Fabric', 'Accesso Fabric verificato', 'Impossibile verificare l’accesso Fabric.'],
  hu: ['Fabric-hozzáférés ellenőrzése', 'Fabric-hozzáférés ellenőrizve', 'A Fabric-hozzáférés nem ellenőrizhető.'],
  sv: ['Kontrollera Fabric-åtkomst', 'Fabric-åtkomst verifierad', 'Fabric-åtkomsten kunde inte verifieras.'],
  fr: ['Vérifier l’accès Fabric', 'Accès Fabric vérifié', 'Impossible de vérifier l’accès Fabric.'],
  pl: ['Sprawdź dostęp do Fabric', 'Dostęp do Fabric zweryfikowany', 'Nie udało się zweryfikować dostępu do Fabric.'],
  cs: ['Ověřit přístup k Fabric', 'Přístup k Fabric ověřen', 'Přístup k Fabric se nepodařilo ověřit.'],
};

export const LOAN_STOCK_TRANSLATIONS = Object.fromEntries(Object.entries(values).map(([language, words]) => {
  const translations: Record<string, string> = { ...Object.fromEntries(keys.map((key, index) => [key, words[index]])),
    loansStockVerify: verification[language as PortalUiLanguage][0],
    loansStockVerified: verification[language as PortalUiLanguage][1],
    loansStockVerifyFailed: verification[language as PortalUiLanguage][2],
  };
  return [language, translations];
})) as Record<PortalUiLanguage, Record<string, string>>;
