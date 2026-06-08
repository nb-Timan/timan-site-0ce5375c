// Phase 43 — Service registrering og vedligehold
// Sidebar-based module mirroring TSB Portal / Garantiregistrering structure.

import { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { Wrench, Upload, Search, Filter, Plus, Trash2, Building2, Calendar, ClipboardList } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import { Language } from '@/types/configurator';
import { pickT } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { derivePortalRole } from '@/lib/portalAccess';
import LastChangedLine from '@/components/portal/LastChangedLine';
import {
  ServiceMachine,
  ServiceRegistration,
  ServiceInterval,
  listServiceMachines,
  listServiceRegistrations,
  createServiceRegistration,
} from '@/lib/serviceMaintenanceService';
import { fetchDealerAccounts, type DealerAccount } from '@/lib/dealerAccountsService';
import { SERVICE_MACHINE_TYPES, getBasisIntervals, findServiceMachineType, getBasisStep } from '@/lib/serviceMachineTypes';
import { ServiceMaintenanceSidebarLayout, type ServiceMaintView } from '@/components/service/ServiceMaintenanceSidebarLayout';

const ALL_DEALERS = '__all__';
const ALL_TYPES = '__all_types__';

type Dict = Partial<Record<PortalUiLanguage, string>>;

const T: Record<string, Dict> = {
  back: { da: 'Tilbage til Teknik & Service', en: 'Back to Technical & Service', de: 'Zurück zu Technik & Service', it: 'Torna a Tecnico & Assistenza', hu: 'Vissza a Műszaki & Szervizhez', sv: 'Tillbaka till Teknik & Service', fr: 'Retour à Technique & Service', pl: 'Wróć do Technika i Serwis', cs: 'Zpět na Technika a Servis' },
  title: { da: 'Service registrering og vedligehold', en: 'Service registration and maintenance', de: 'Serviceerfassung und Wartung', it: 'Registrazione servizio e manutenzione', hu: 'Szervizregisztráció és karbantartás', sv: 'Serviceregistrering och underhåll', fr: 'Enregistrement de service et entretien', pl: 'Rejestracja serwisu i konserwacja', cs: 'Registrace servisu a údržba' },
  subtitle: { da: 'Registrer udført service og se komplet servicehistorik pr. maskine.', en: 'Register completed service and view the full service history per machine.', de: 'Erfassen Sie durchgeführten Service und sehen Sie die vollständige Service-Historie pro Maschine.', it: 'Registra il servizio completato e visualizza la cronologia completa per macchina.', hu: 'Regisztrálja az elvégzett szervizt és tekintse meg a teljes szerviz előzményeket gépenként.', sv: 'Registrera utförd service och se fullständig servicehistorik per maskin.', fr: "Enregistrez le service effectué et consultez l'historique complet par machine.", pl: 'Zarejestruj wykonany serwis i zobacz pełną historię serwisową dla każdej maszyny.', cs: 'Zaregistrujte provedený servis a prohlédněte si kompletní historii servisu pro každý stroj.' },
  tabOverview: { da: 'Maskinoversigt', en: 'Machine overview', de: 'Maschinenübersicht', it: 'Panoramica macchine', hu: 'Gépáttekintés', sv: 'Maskinöversikt', fr: 'Aperçu des machines', pl: 'Przegląd maszyn', cs: 'Přehled strojů' },
  tabNew: { da: 'Opret service registrering', en: 'Create service registration', de: 'Serviceerfassung anlegen', it: 'Crea registrazione servizio', hu: 'Új szervizregisztráció', sv: 'Skapa serviceregistrering', fr: 'Créer un enregistrement de service', pl: 'Utwórz rejestrację serwisową', cs: 'Vytvořit servisní záznam' },
  tabMine: { da: 'Mine service registreringer', en: 'My service registrations', de: 'Meine Serviceerfassungen', it: 'Le mie registrazioni', hu: 'Saját regisztrációim', sv: 'Mina serviceregistreringar', fr: 'Mes enregistrements de service', pl: 'Moje rejestracje serwisowe', cs: 'Moje servisní záznamy' },
  filterDealer: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő', sv: 'Återförsäljare', fr: 'Revendeur', pl: 'Dealer', cs: 'Prodejce' },
  filterType: { da: 'Maskintype', en: 'Machine type', de: 'Maschinentyp', it: 'Tipo macchina', hu: 'Géptípus', sv: 'Maskintyp', fr: 'Type de machine', pl: 'Typ maszyny', cs: 'Typ stroje' },
  filterSerial: { da: 'Serienummer', en: 'Serial number', de: 'Seriennummer', it: 'Numero di serie', hu: 'Sorozatszám', sv: 'Serienummer', fr: 'Numéro de série', pl: 'Numer seryjny', cs: 'Sériové číslo' },
  search: { da: 'Søg', en: 'Search', de: 'Suchen', it: 'Cerca', hu: 'Keresés', sv: 'Sök', fr: 'Rechercher', pl: 'Szukaj', cs: 'Hledat' },
  none: { da: 'Ingen resultater.', en: 'No results.', de: 'Keine Ergebnisse.', it: 'Nessun risultato.', hu: 'Nincs találat.', sv: 'Inga resultat.', fr: 'Aucun résultat.', pl: 'Brak wyników.', cs: 'Žádné výsledky.' },
  colSerial: { da: 'Serienr.', en: 'Serial no.', de: 'Seriennr.', it: 'N. serie', hu: 'Sorozatszám', sv: 'Serienr.', fr: 'N° de série', pl: 'Nr seryjny', cs: 'Sér. č.' },
  colType: { da: 'Maskintype', en: 'Type', de: 'Typ', it: 'Tipo', hu: 'Típus', sv: 'Typ', fr: 'Type', pl: 'Typ', cs: 'Typ' },
  colDealer: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő', sv: 'Återförsäljare', fr: 'Revendeur', pl: 'Dealer', cs: 'Prodejce' },
  colCustomer: { da: 'Kunde', en: 'Customer', de: 'Kunde', it: 'Cliente', hu: 'Ügyfél', sv: 'Kund', fr: 'Client', pl: 'Klient', cs: 'Zákazník' },
  colLastService: { da: 'Seneste service', en: 'Last service', de: 'Letzter Service', it: 'Ultimo servizio', hu: 'Utolsó szerviz', sv: 'Senaste service', fr: 'Dernier service', pl: 'Ostatni serwis', cs: 'Poslední servis' },
  colNextService: { da: 'Næste interval', en: 'Next interval', de: 'Nächstes Intervall', it: 'Prossimo intervallo', hu: 'Köv. intervallum', sv: 'Nästa intervall', fr: 'Prochain intervalle', pl: 'Następny interwał', cs: 'Další interval' },
  colHours: { da: 'Driftstimer', en: 'Hours', de: 'Betriebsstunden', it: 'Ore', hu: 'Üzemóra', sv: 'Drifttimmar', fr: 'Heures', pl: 'Godziny', cs: 'Hodiny' },
  colNotes: { da: 'Åbne bemærkninger', en: 'Open notes', de: 'Offene Hinweise', it: 'Note aperte', hu: 'Nyitott megj.', sv: 'Öppna anteckningar', fr: 'Notes ouvertes', pl: 'Otwarte uwagi', cs: 'Otevřené poznámky' },
  history: { da: 'Servicehistorik', en: 'Service history', de: 'Service-Historie', it: 'Cronologia servizi', hu: 'Szerviz előzmények', sv: 'Servicehistorik', fr: 'Historique de service', pl: 'Historia serwisu', cs: 'Historie servisu' },
  closeHistory: { da: 'Luk', en: 'Close', de: 'Schließen', it: 'Chiudi', hu: 'Bezárás', sv: 'Stäng', fr: 'Fermer', pl: 'Zamknij', cs: 'Zavřít' },
  fSerial: { da: 'Maskinnr. / serienummer *', en: 'Machine no. / serial number *', de: 'Maschinennr. / Seriennummer *', it: 'N. macchina / serie *', hu: 'Gépszám / sorozatszám *', sv: 'Maskinnr. / serienummer *', fr: 'N° machine / numéro de série *', pl: 'Nr maszyny / numer seryjny *', cs: 'Č. stroje / sériové číslo *' },
  fType: { da: 'Maskintype *', en: 'Machine type *', de: 'Maschinentyp *', it: 'Tipo macchina *', hu: 'Géptípus *', sv: 'Maskintyp *', fr: 'Type de machine *', pl: 'Typ maszyny *', cs: 'Typ stroje *' },
  fDealer: { da: 'Forhandler der udfører service *', en: 'Dealer performing service *', de: 'Servicedurchführender Händler *', it: 'Rivenditore che esegue il servizio *', hu: 'Szervizt végző kereskedő *', sv: 'Återförsäljare som utför service *', fr: 'Revendeur effectuant le service *', pl: 'Dealer wykonujący serwis *', cs: 'Prodejce provádějící servis *' },
  fCustomer: { da: 'Kunde / bruger', en: 'Customer / user', de: 'Kunde / Benutzer', it: 'Cliente / utente', hu: 'Ügyfél / felhasználó', sv: 'Kund / användare', fr: 'Client / utilisateur', pl: 'Klient / użytkownik', cs: 'Zákazník / uživatel' },
  fDate: { da: 'Servicedato *', en: 'Service date *', de: 'Servicedatum *', it: 'Data servizio *', hu: 'Szervizdátum *', sv: 'Servicedatum *', fr: 'Date de service *', pl: 'Data serwisu *', cs: 'Datum servisu *' },
  fHours: { da: 'Driftstimer *', en: 'Operating hours *', de: 'Betriebsstunden *', it: 'Ore di esercizio *', hu: 'Üzemóra *', sv: 'Drifttimmar *', fr: "Heures d'exploitation *", pl: 'Godziny pracy *', cs: 'Provozní hodiny *' },
  fInterval: { da: 'Service interval *', en: 'Service interval *', de: 'Serviceintervall *', it: 'Intervallo servizio *', hu: 'Szerviz intervallum *', sv: 'Serviceintervall *', fr: 'Intervalle de service *', pl: 'Interwał serwisowy *', cs: 'Servisní interval *' },
  fTech: { da: 'Tekniker / signatur *', en: 'Technician / signature *', de: 'Techniker / Unterschrift *', it: 'Tecnico / firma *', hu: 'Technikus / aláírás *', sv: 'Tekniker / signatur *', fr: 'Technicien / signature *', pl: 'Technik / podpis *', cs: 'Technik / podpis *' },
  fPlan: { da: 'Udført iht. serviceplan', en: 'Completed per service plan', de: 'Gemäß Serviceplan ausgeführt', it: 'Eseguito secondo il piano', hu: 'Szervizterv szerint elvégezve', sv: 'Utförd enligt serviceplan', fr: 'Effectué selon le plan de service', pl: 'Wykonano zgodnie z planem serwisowym', cs: 'Provedeno dle servisního plánu' },
  fNotes: { da: 'Bemærkninger / indsigelser', en: 'Notes / objections', de: 'Bemerkungen / Einwände', it: 'Note / obiezioni', hu: 'Megjegyzések / kifogások', sv: 'Anteckningar / invändningar', fr: 'Notes / objections', pl: 'Uwagi / zastrzeżenia', cs: 'Poznámky / námitky' },
  fFaults: { da: 'Fejl fundet under service', en: 'Faults found during service', de: 'Bei Service gefundene Fehler', it: 'Guasti rilevati', hu: 'Szerviz közben talált hibák', sv: 'Fel som upptäckts under service', fr: 'Défauts détectés lors du service', pl: 'Usterki wykryte podczas serwisu', cs: 'Závady zjištěné při servisu' },
  fParts: { da: 'Anvendte reservedele', en: 'Spare parts used', de: 'Verwendete Ersatzteile', it: 'Ricambi utilizzati', hu: 'Felhasznált alkatrészek', sv: 'Använda reservdelar', fr: 'Pièces de rechange utilisées', pl: 'Użyte części zamienne', cs: 'Použité náhradní díly' },
  fUpload: { da: 'Vedhæft billeder/dokumenter (kommer snart)', en: 'Attach images/documents (coming soon)', de: 'Bilder/Dokumente anhängen (bald)', it: 'Allega immagini/documenti (in arrivo)', hu: 'Képek/dokumentumok csatolása (hamarosan)', sv: 'Bifoga bilder/dokument (kommer snart)', fr: 'Joindre images/documents (bientôt)', pl: 'Załącz zdjęcia/dokumenty (wkrótce)', cs: 'Přiložit obrázky/dokumenty (brzy)' },
  save: { da: 'Gem service', en: 'Save service', de: 'Service speichern', it: 'Salva servizio', hu: 'Szerviz mentése', sv: 'Spara service', fr: 'Enregistrer le service', pl: 'Zapisz serwis', cs: 'Uložit servis' },
  saving: { da: 'Gemmer…', en: 'Saving…', de: 'Speichern…', it: 'Salvataggio…', hu: 'Mentés…', sv: 'Sparar…', fr: 'Enregistrement…', pl: 'Zapisywanie…', cs: 'Ukládání…' },
  required: { da: 'Felt er påkrævet', en: 'Field is required', de: 'Pflichtfeld', it: 'Campo obbligatorio', hu: 'Kötelező mező', sv: 'Fältet är obligatoriskt', fr: 'Champ obligatoire', pl: 'Pole wymagane', cs: 'Pole je povinné' },
  saved: { da: 'Service registreret', en: 'Service registered', de: 'Service erfasst', it: 'Servizio registrato', hu: 'Szerviz regisztrálva', sv: 'Service registrerad', fr: 'Service enregistré', pl: 'Serwis zarejestrowany', cs: 'Servis zaregistrován' },
  savedDesc: { da: 'Registreringen er gemt og knyttet til maskinen.', en: 'Registration saved and linked to the machine.', de: 'Erfassung gespeichert und der Maschine zugeordnet.', it: 'Registrazione salvata e collegata alla macchina.', hu: 'A regisztráció elmentve és a géphez kapcsolva.', sv: 'Registreringen är sparad och kopplad till maskinen.', fr: 'Enregistrement sauvegardé et lié à la machine.', pl: 'Rejestracja zapisana i powiązana z maszyną.', cs: 'Záznam uložen a propojen se strojem.' },
  saveError: { da: 'Kunne ikke gemme', en: 'Could not save', de: 'Speichern fehlgeschlagen', it: 'Salvataggio non riuscito', hu: 'Mentés sikertelen', sv: 'Kunde inte spara', fr: "Échec de l'enregistrement", pl: 'Nie udało się zapisać', cs: 'Nelze uložit' },
  ownDealer: { da: 'Egen forhandler', en: 'Own dealer', de: 'Eigener Händler', it: 'Proprio rivenditore', hu: 'Saját kereskedő', sv: 'Egen återförsäljare', fr: 'Propre revendeur', pl: 'Własny dealer', cs: 'Vlastní prodejce' },
  dealerLocked: { da: 'Forhandler er låst til din konto', en: 'Dealer locked to your account', de: 'Händler ist mit Ihrem Konto verknüpft', it: 'Rivenditore bloccato sul tuo account', hu: 'A kereskedő a fiókodhoz van rögzítve', sv: 'Återförsäljare är låst till ditt konto', fr: 'Revendeur lié à votre compte', pl: 'Dealer przypisany do twojego konta', cs: 'Prodejce uzamčen k vašemu účtu' },
  dealerLockedHelp: { da: 'Du kan kun registrere service for din egen forhandlerkonto.', en: 'You can only register service for your own dealer account.', de: 'Sie können Service nur für Ihr eigenes Händlerkonto erfassen.', it: 'Puoi registrare servizi solo per il tuo account rivenditore.', hu: 'Csak a saját kereskedői fiókodhoz regisztrálhatsz szervizt.', sv: 'Du kan endast registrera service för ditt eget återförsäljarkonto.', fr: 'Vous ne pouvez enregistrer un service que pour votre propre compte revendeur.', pl: 'Możesz rejestrować serwis tylko dla własnego konta dealera.', cs: 'Servis můžete zaregistrovat pouze pro svůj vlastní účet prodejce.' },
  noDealerLink: { da: 'Din bruger er ikke knyttet til en forhandlerkonto. Kontakt Timan.', en: 'Your user is not linked to a dealer account. Contact Timan.', de: 'Ihr Benutzer ist keinem Händlerkonto zugeordnet. Kontaktieren Sie Timan.', it: 'Il tuo utente non è collegato a un account rivenditore. Contatta Timan.', hu: 'A felhasználód nincs kereskedői fiókhoz rendelve. Lépj kapcsolatba a Timannal.', sv: 'Din användare är inte kopplad till ett återförsäljarkonto. Kontakta Timan.', fr: "Votre utilisateur n'est pas lié à un compte revendeur. Contactez Timan.", pl: 'Twój użytkownik nie jest powiązany z kontem dealera. Skontaktuj się z Timan.', cs: 'Váš uživatel není propojen s účtem prodejce. Kontaktujte Timan.' },
  selectType: { da: 'Vælg maskintype', en: 'Select machine type', de: 'Maschinentyp wählen', it: 'Seleziona tipo macchina', hu: 'Válassz géptípust', sv: 'Välj maskintyp', fr: 'Sélectionner le type de machine', pl: 'Wybierz typ maszyny', cs: 'Vyberte typ stroje' },
  allTypes: { da: 'Alle maskintyper', en: 'All machine types', de: 'Alle Maschinentypen', it: 'Tutti i tipi', hu: 'Minden géptípus', sv: 'Alla maskintyper', fr: 'Tous les types', pl: 'Wszystkie typy maszyn', cs: 'Všechny typy strojů' },
  basisMissing: { da: 'Servicegrundlag ikke opsat endnu for denne maskintype.', en: 'Service basis not configured yet for this machine type.', de: 'Servicegrundlage für diesen Maschinentyp noch nicht eingerichtet.', it: 'Base di servizio non ancora configurata per questo tipo di macchina.', hu: 'Ehhez a géptípushoz még nincs szervizalap beállítva.', sv: 'Servicegrund inte konfigurerad för denna maskintyp.', fr: "Base de service non configurée pour ce type de machine.", pl: 'Podstawa serwisowa nie jest jeszcze skonfigurowana dla tego typu maszyny.', cs: 'Servisní základ pro tento typ stroje zatím není nastaven.' },
  intervalHoursPlaceholder: { da: 'Timer, fx 250', en: 'Hours, e.g. 250', de: 'Stunden, z. B. 250', it: 'Ore, es. 250', hu: 'Óra, pl. 250', sv: 'Timmar, t.ex. 250', fr: 'Heures, ex. 250', pl: 'Godziny, np. 250', cs: 'Hodiny, např. 250' },
  basisTitle: { da: 'Servicegrundlag', en: 'Service basis', de: 'Servicegrundlage', it: 'Base servizio', hu: 'Szervizalap', sv: 'Servicegrund', fr: 'Base de service', pl: 'Podstawa serwisowa', cs: 'Servisní základ' },
  colItemNo: { da: 'Varenr', en: 'Item no.', de: 'Art.-Nr.', it: 'Cod.', hu: 'Cikkszám', sv: 'Art.nr', fr: 'N° article', pl: 'Nr art.', cs: 'Č. položky' },
  colItemName: { da: 'Beskrivelse', en: 'Description', de: 'Beschreibung', it: 'Descrizione', hu: 'Leírás', sv: 'Beskrivning', fr: 'Description', pl: 'Opis', cs: 'Popis' },
  colUnitPrice: { da: 'Stk pris', en: 'Unit price', de: 'Stückpreis', it: 'Prezzo unit.', hu: 'Egységár', sv: 'Styckpris', fr: 'Prix unitaire', pl: 'Cena jedn.', cs: 'Jedn. cena' },
  colQty: { da: 'Antal', en: 'Qty', de: 'Anzahl', it: 'Qta', hu: 'Db', sv: 'Antal', fr: 'Qté', pl: 'Ilość', cs: 'Množ.' },
  colSum: { da: 'Sum', en: 'Sum', de: 'Summe', it: 'Somma', hu: 'Összeg', sv: 'Summa', fr: 'Somme', pl: 'Suma', cs: 'Součet' },
  colTotal: { da: 'Total', en: 'Total', de: 'Gesamt', it: 'Totale', hu: 'Összesen', sv: 'Totalt', fr: 'Total', pl: 'Razem', cs: 'Celkem' },
  extraTitle: { da: 'Ekstra reservedele uden for servicekit', en: 'Extra spare parts outside service kit', de: 'Zusätzliche Ersatzteile außerhalb des Servicekits', it: 'Ricambi extra fuori dal kit di servizio', hu: 'Extra alkatrészek a szervizkészleten kívül', sv: 'Extra reservdelar utanför servicekit', fr: 'Pièces supplémentaires hors kit de service', pl: 'Dodatkowe części zamienne poza zestawem serwisowym', cs: 'Další náhradní díly mimo servisní sadu' },
  extraAdd: { da: 'Tilføj ekstra reservedel', en: 'Add extra spare part', de: 'Zusätzliches Ersatzteil hinzufügen', it: 'Aggiungi ricambio extra', hu: 'Extra alkatrész hozzáadása', sv: 'Lägg till extra reservdel', fr: 'Ajouter une pièce supplémentaire', pl: 'Dodaj dodatkową część', cs: 'Přidat další náhradní díl' },
  extraEmpty: { da: 'Ingen ekstra reservedele tilføjet.', en: 'No extra spare parts added.', de: 'Keine zusätzlichen Ersatzteile.', it: 'Nessun ricambio extra.', hu: 'Nincs extra alkatrész.', sv: 'Inga extra reservdelar tillagda.', fr: 'Aucune pièce supplémentaire ajoutée.', pl: 'Nie dodano dodatkowych części.', cs: 'Nepřidány žádné další díly.' },
  totalKit: { da: 'Total servicekit', en: 'Total service kit', de: 'Servicekit gesamt', it: 'Totale kit servizio', hu: 'Szervizkészlet összesen', sv: 'Totalt servicekit', fr: 'Total kit de service', pl: 'Razem zestaw serwisowy', cs: 'Servisní sada celkem' },
  totalExtra: { da: 'Total ekstra reservedele', en: 'Total extra parts', de: 'Zusätzliche Teile gesamt', it: 'Totale ricambi extra', hu: 'Extra alkatrészek összesen', sv: 'Totalt extra delar', fr: 'Total pièces supplémentaires', pl: 'Razem dodatkowe części', cs: 'Další díly celkem' },
  totalGrand: { da: 'Total samlet', en: 'Grand total', de: 'Gesamtsumme', it: 'Totale generale', hu: 'Mindösszesen', sv: 'Totalsumma', fr: 'Total général', pl: 'Suma całkowita', cs: 'Celkový součet' },
  remove: { da: 'Slet', en: 'Remove', de: 'Entfernen', it: 'Rimuovi', hu: 'Törlés', sv: 'Ta bort', fr: 'Supprimer', pl: 'Usuń', cs: 'Odebrat' },
  dashTitle: { da: 'Service dashboard', en: 'Service dashboard', de: 'Service-Dashboard', it: 'Dashboard servizio', hu: 'Szerviz dashboard', sv: 'Service-dashboard', fr: 'Tableau de bord service', pl: 'Panel serwisowy', cs: 'Servisní přehled' },
  dashSubtitle: { da: 'Overblik over service registreringer og maskiner.', en: 'Overview of service registrations and machines.', de: 'Überblick über Serviceerfassungen und Maschinen.', it: 'Panoramica delle registrazioni e delle macchine.', hu: 'Áttekintés a szervizregisztrációkról és gépekről.', sv: 'Översikt över serviceregistreringar och maskiner.', fr: 'Aperçu des enregistrements de service et des machines.', pl: 'Przegląd rejestracji serwisowych i maszyn.', cs: 'Přehled servisních záznamů a strojů.' },
  statTotal: { da: 'Service registreringer i alt', en: 'Total service registrations', de: 'Serviceerfassungen gesamt', it: 'Registrazioni totali', hu: 'Összes regisztráció', sv: 'Totalt antal serviceregistreringar', fr: "Total des enregistrements de service", pl: 'Łącznie rejestracji serwisowych', cs: 'Celkem servisních záznamů' },
  statMonth: { da: 'Service denne måned', en: 'Service this month', de: 'Service diesen Monat', it: 'Servizi questo mese', hu: 'Szerviz e hónapban', sv: 'Service denna månad', fr: 'Service ce mois-ci', pl: 'Serwis w tym miesiącu', cs: 'Servis tento měsíc' },
  statTop: { da: 'Mest servicerede maskine', en: 'Most serviced machine', de: 'Meistgewartete Maschine', it: 'Macchina più servita', hu: 'Leggyakrabban szervizelt gép', sv: 'Mest servade maskin', fr: 'Machine la plus entretenue', pl: 'Najczęściej serwisowana maszyna', cs: 'Nejvíce servisovaný stroj' },
  statDealers: { da: 'Aktive forhandlere', en: 'Active dealers', de: 'Aktive Händler', it: 'Rivenditori attivi', hu: 'Aktív kereskedők', sv: 'Aktiva återförsäljare', fr: 'Revendeurs actifs', pl: 'Aktywni dealerzy', cs: 'Aktivní prodejci' },
  latest: { da: 'Seneste service registreringer', en: 'Latest service registrations', de: 'Neueste Serviceerfassungen', it: 'Ultime registrazioni', hu: 'Legutóbbi regisztrációk', sv: 'Senaste serviceregistreringar', fr: 'Derniers enregistrements de service', pl: 'Najnowsze rejestracje serwisowe', cs: 'Nejnovější servisní záznamy' },
  empty: { da: 'Ingen data endnu.', en: 'No data yet.', de: 'Noch keine Daten.', it: 'Nessun dato.', hu: 'Még nincs adat.', sv: 'Inga data ännu.', fr: 'Pas encore de données.', pl: 'Brak danych.', cs: 'Zatím žádná data.' },
  dealersTitle: { da: 'Forhandlere', en: 'Dealers', de: 'Händler', it: 'Rivenditori', hu: 'Kereskedők', sv: 'Återförsäljare', fr: 'Revendeurs', pl: 'Dealerzy', cs: 'Prodejci' },
  dealersSubtitle: { da: 'Forhandlere knyttet til service registreringer.', en: 'Dealers linked to service registrations.', de: 'Mit Serviceerfassungen verknüpfte Händler.', it: 'Rivenditori collegati alle registrazioni.', hu: 'A regisztrációkhoz kapcsolt kereskedők.', sv: 'Återförsäljare kopplade till serviceregistreringar.', fr: 'Revendeurs liés aux enregistrements de service.', pl: 'Dealerzy powiązani z rejestracjami serwisowymi.', cs: 'Prodejci propojení se servisními záznamy.' },
  machinesTitle: { da: 'Maskiner', en: 'Machines', de: 'Maschinen', it: 'Macchine', hu: 'Gépek', sv: 'Maskiner', fr: 'Machines', pl: 'Maszyny', cs: 'Stroje' },
  machinesSubtitle: { da: 'Alle maskiner med service historik.', en: 'All machines with service history.', de: 'Alle Maschinen mit Service-Historie.', it: 'Tutte le macchine con cronologia.', hu: 'Minden gép szervizelőzményekkel.', sv: 'Alla maskiner med servicehistorik.', fr: 'Toutes les machines avec historique de service.', pl: 'Wszystkie maszyny z historią serwisową.', cs: 'Všechny stroje se servisní historií.' },
  createTitle: { da: 'Opret service registrering', en: 'Create service registration', de: 'Serviceerfassung anlegen', it: 'Crea registrazione servizio', hu: 'Szervizregisztráció létrehozása', sv: 'Skapa serviceregistrering', fr: 'Créer un enregistrement de service', pl: 'Utwórz rejestrację serwisową', cs: 'Vytvořit servisní záznam' },
  registrationsTitle: { da: 'Service registreringer', en: 'Service registrations', de: 'Serviceerfassungen', it: 'Registrazioni servizio', hu: 'Szervizregisztrációk', sv: 'Serviceregistreringar', fr: 'Enregistrements de service', pl: 'Rejestracje serwisowe', cs: 'Servisní záznamy' },
  newServiceReg: { da: 'Ny service registrering', en: 'New service registration', de: 'Neue Serviceerfassung', it: 'Nuova registrazione servizio', hu: 'Új szervizregisztráció', sv: 'Ny serviceregistrering', fr: 'Nouvel enregistrement de service', pl: 'Nowa rejestracja serwisowa', cs: 'Nový servisní záznam' },
};

const VIEWS: ServiceMaintView[] = ['dashboard', 'registrations', 'create', 'dealers', 'machines'];
function parseView(v: string | null, fallback: ServiceMaintView): ServiceMaintView {
  return (VIEWS as string[]).includes(v ?? '') ? (v as ServiceMaintView) : fallback;
}

export default function ServiceMaintenancePage() {
  const { appUser, loading } = useAppUser();
  const { language: lang, uiLanguage } = useLanguage();
  const t = (k: keyof typeof T) => pickT(T[k], uiLanguage);
  void lang;
  const navigate = useNavigate();

  const portalRole = derivePortalRole(appUser);
  // Treat sellers like backend in UI (dealer selector, registration form),
  // but apply CRM-scope filter on returned rows so they only see their own
  // assigned dealers' data.
  const isBackend = portalRole === 'timan_backend' || portalRole === 'timan_seller' || portalRole === 'timan_service';

  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseView(searchParams.get('view'), 'dashboard');
  const setView = (v: ServiceMaintView) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', v);
    setSearchParams(next, { replace: false });
  };
  const [machines, setMachines] = useState<ServiceMachine[]>([]);
  const [registrations, setRegistrations] = useState<ServiceRegistration[]>([]);
  const [intervals, setIntervals] = useState<ServiceInterval[]>([]);
  const [historyFor, setHistoryFor] = useState<ServiceMachine | null>(null);
  const [historyRows, setHistoryRows] = useState<ServiceRegistration[]>([]);

  // Filters
  const [fDealer, setFDealer] = useState('');
  const [fType, setFType] = useState('');
  const [fSerial, setFSerial] = useState('');
  const [dealers, setDealers] = useState<DealerAccount[]>([]);

  useEffect(() => {
    if (!isBackend) return;
    fetchDealerAccounts().then(r => setDealers(r.rows.filter(d => !d.is_deleted))).catch(() => setDealers([]));
  }, [isBackend]);

  // Form
  const dealerNumber = appUser?.dealer_number ?? null;
  const dealerName = appUser?.company_dealer ?? null;
  const [form, setForm] = useState({
    serial_number: '',
    machine_type: SERVICE_MACHINE_TYPES[0].value,
    dealer_number: dealerNumber ?? '',
    dealer_name: dealerName ?? '',
    customer_name: '',
    service_date: new Date().toISOString().slice(0, 10),
    operating_hours: '',
    service_interval_hours: '',
    technician_name: '',
    service_plan_completed: true,
    notes: '',
    faults_found: '',
  });
  const [extraParts, setExtraParts] = useState<Array<{ id: string; name: string; price: string; qty: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  // Intervals come exclusively from the shared serviceBasisData
  // (same source as TCO/Driftberegner "Se grundlag"). No DB fallback.
  const basisIntervals = useMemo(() => getBasisIntervals(form.machine_type), [form.machine_type]);
  const hasBasis = !!findServiceMachineType(form.machine_type)?.basisKey;
  useEffect(() => {
    setIntervals(
      basisIntervals.map((h) => ({
        id: `basis-${h}`,
        machine_type: form.machine_type,
        interval_hours: h,
        label: `${h} timer`,
        active: true,
      })),
    );
  }, [form.machine_type, basisIntervals]);

  // Reset interval when machine type changes.
  useEffect(() => {
    setForm((f) => ({ ...f, service_interval_hours: '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.machine_type]);

  // Selected service step (rows + total) from serviceBasisData.
  const selectedStep = useMemo(
    () => getBasisStep(form.machine_type, Number(form.service_interval_hours) || null),
    [form.machine_type, form.service_interval_hours],
  );

  // Extra parts totals
  const extraRows = useMemo(() => extraParts.map((p) => {
    const price = Number(p.price) || 0;
    const qty = Number(p.qty) || 0;
    return { ...p, priceNum: price, qtyNum: qty, sum: price * qty };
  }), [extraParts]);
  const extraTotal = useMemo(() => extraRows.reduce((s, r) => s + r.sum, 0), [extraRows]);
  const kitTotal = selectedStep?.stepTotal ?? 0;
  const grandTotal = kitTotal + extraTotal;

  const reload = useMemo(() => async () => {
    try {
      const m = await listServiceMachines({
        dealerNumber: isBackend ? (fDealer || null) : dealerNumber,
        machineType: fType || null,
        search: fSerial || null,
      });
      setMachines(m);
      const r = await listServiceRegistrations({
        dealerNumber: isBackend ? (fDealer || undefined) : dealerNumber ?? undefined,
      });
      setRegistrations(r);
    } catch (e) {
      console.error('[service-maintenance] load failed', e);
    }
  }, [isBackend, dealerNumber, fDealer, fType, fSerial]);

  useEffect(() => { if (appUser) reload(); }, [appUser, reload]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  if (!appUser) return <Navigate to="/portal" replace />;

  const lastServiceFor = (serial: string) => registrations.find(r => r.serial_number.toLowerCase() === serial.toLowerCase());
  const historyOpen = async (m: ServiceMachine) => {
    setHistoryFor(m);
    const rows = await listServiceRegistrations({ serialNumber: m.serial_number });
    setHistoryRows(rows);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Record<string, boolean> = {};
    if (!form.serial_number.trim()) newErrors.serial_number = true;
    if (!form.machine_type.trim()) newErrors.machine_type = true;
    if (!form.dealer_number.trim() && !form.dealer_name.trim()) newErrors.dealer_name = true;
    if (!form.service_date) newErrors.service_date = true;
    if (!form.operating_hours.trim()) newErrors.operating_hours = true;
    if (!form.service_interval_hours.trim()) newErrors.service_interval_hours = true;
    if (!form.technician_name.trim()) newErrors.technician_name = true;
    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;

    setSubmitting(true);
    try {
      // Dealer-scoped users: ignore any dealer values from UI/state, always
      // force the logged-in user's own dealer account.
      const effectiveDealerNumber = isBackend ? (form.dealer_number.trim() || null) : (dealerNumber || null);
      const effectiveDealerName = isBackend ? (form.dealer_name.trim() || null) : (dealerName || null);
      if (!isBackend && !effectiveDealerNumber) {
        toast({ title: t('saveError'), description: t('noDealerLink'), variant: 'destructive' });
        setSubmitting(false);
        return;
      }
      const partsPayload = [
        ...((selectedStep?.rows ?? []).map((r) => ({
          source_type: 'servicekit' as const,
          item_number: r.id ?? null,
          description: r.name ?? null,
          unit_price: Number(r.price) || 0,
          quantity: Number(r.count) || 0,
          line_total: Number(r.sum) || 0,
        }))),
        ...extraRows
          .filter((r) => (r.id?.trim() || r.name?.trim()))
          .map((r) => ({
            source_type: 'extra' as const,
            item_number: r.id?.trim() || null,
            description: r.name?.trim() || null,
            unit_price: r.priceNum,
            quantity: r.qtyNum,
            line_total: r.sum,
          })),
      ];
      await createServiceRegistration({
        serial_number: form.serial_number.trim(),
        machine_type: form.machine_type.trim(),
        dealer_number: effectiveDealerNumber,
        dealer_name: effectiveDealerName,
        customer_name: form.customer_name.trim() || null,
        service_date: form.service_date,
        operating_hours: Number(form.operating_hours) || 0,
        service_interval_hours: Number(form.service_interval_hours) || 0,
        technician_name: form.technician_name.trim() || null,
        service_plan_completed: form.service_plan_completed,
        notes: form.notes.trim() || null,
        faults_found: form.faults_found.trim() || null,
        spare_parts_used: serializeParts(form.machine_type, form.service_interval_hours, selectedStep, extraRows, kitTotal, extraTotal, grandTotal),
        attachment_urls: [],
        total_servicekit_price: kitTotal,
        total_extra_parts_price: extraTotal,
        total_price: grandTotal,
        parts: partsPayload,
      }, appUser.email ?? null);
      toast({ title: t('saved'), description: t('savedDesc') });
      setForm(f => ({ ...f, operating_hours: '', service_interval_hours: '', notes: '', faults_found: '' }));
      setExtraParts([]);
      await reload();
      if (isBackend) setView('registrations');
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: t('saveError'), description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Dashboard stats ──────────────────────────────────────────────
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const regsThisMonth = registrations.filter(r => (r.service_date || '').startsWith(monthKey)).length;
  const topMachine = (() => {
    const counts = new Map<string, number>();
    registrations.forEach(r => counts.set(r.serial_number, (counts.get(r.serial_number) || 0) + 1));
    let best: { serial: string; count: number } | null = null;
    counts.forEach((count, serial) => { if (!best || count > best.count) best = { serial, count }; });
    return best;
  })();
  const activeDealerCount = new Set(registrations.map(r => r.dealer_number).filter(Boolean)).size;
  const latestRegs = [...registrations].sort((a, b) => (b.service_date || '').localeCompare(a.service_date || '')).slice(0, 5);

  const intro = (
    <div className="flex items-start gap-4">
      <div className="w-12 h-12 rounded-xl bg-[#2d5a27]/10 flex items-center justify-center">
        <Wrench className="h-6 w-6 text-[#2d5a27]" />
      </div>
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-900">{t('title')}</h1>
        <p className="text-slate-600 text-sm mt-1 max-w-3xl">{t('subtitle')}</p>
        <LastChangedLine moduleKey="service" className="mt-2" />
      </div>
    </div>
  );

  const filterBar = isBackend ? (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
      <div>
        <Label className="text-xs">{t('filterDealer')}</Label>
        <Select value={fDealer || ALL_DEALERS} onValueChange={(v) => setFDealer(v === ALL_DEALERS ? '' : v)}>
          <SelectTrigger><SelectValue placeholder={t('filterDealer')} /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ALL_DEALERS}>{t('filterDealer')}</SelectItem>
            {dealers.map(d => (
              <SelectItem key={d.id} value={d.account_number}>
                {d.account_number} — {d.company_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">{t('filterType')}</Label>
        <Select value={fType || ALL_TYPES} onValueChange={(v) => setFType(v === ALL_TYPES ? '' : v)}>
          <SelectTrigger><SelectValue placeholder={t('allTypes')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>{t('allTypes')}</SelectItem>
            {SERVICE_MACHINE_TYPES.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div><Label className="text-xs">{t('filterSerial')}</Label><Input value={fSerial} onChange={e => setFSerial(e.target.value)} placeholder="…" /></div>
      <div className="flex items-end"><Button type="button" variant="secondary" onClick={() => reload()}><Filter className="h-4 w-4 mr-2" />{t('search')}</Button></div>
    </div>
  ) : null;

  const renderView = () => {
    if (view === 'dashboard') {
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <DashCard icon={ClipboardList} label={t('statTotal')} value={registrations.length} />
            <DashCard icon={Calendar} label={t('statMonth')} value={regsThisMonth} />
            <DashCard icon={Wrench} label={t('statTop')} value={topMachine ? `${topMachine.serial} (${topMachine.count})` : '—'} />
            <DashCard icon={Building2} label={t('statDealers')} value={activeDealerCount} />
          </div>
          {!isBackend && (
            <div className="flex">
              <Button
                onClick={() => setView('create')}
                className="bg-[#2d5a27] hover:bg-[#234a1f] text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('newServiceReg')}
              </Button>
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">{t('latest')}</h2>
            {latestRegs.length === 0 ? (
              <div className="text-sm text-slate-500 py-6 text-center">{t('empty')}</div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t('colLastService')}</TableHead>
                  <TableHead>{t('colSerial')}</TableHead>
                  <TableHead>{t('colType')}</TableHead>
                  <TableHead>{t('colDealer')}</TableHead>
                  <TableHead>{t('fInterval')}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {latestRegs.map(r => {
                    const machine: ServiceMachine = machines.find(m => m.serial_number.toLowerCase() === r.serial_number.toLowerCase()) ?? {
                      id: r.machine_id ?? r.id,
                      serial_number: r.serial_number,
                      machine_type: r.machine_type,
                      dealer_account_id: r.dealer_account_id,
                      dealer_number: r.dealer_number,
                      dealer_name: r.dealer_name,
                      customer_name: r.customer_name,
                      customer_email: null,
                      customer_phone: null,
                      created_at: r.created_at,
                      updated_at: r.created_at,
                    };
                    return (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => historyOpen(machine)}>
                        <TableCell>{r.service_date}</TableCell>
                        <TableCell className="font-medium">{r.serial_number}</TableCell>
                        <TableCell>{r.machine_type}</TableCell>
                        <TableCell>{r.dealer_name ?? r.dealer_number ?? '—'}</TableCell>
                        <TableCell>{r.service_interval_hours} h</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      );
    }

    if (view === 'registrations' || view === 'machines') {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {filterBar}
          <MachineTable machines={machines} t={t} lastServiceFor={lastServiceFor} onOpen={historyOpen} />
        </div>
      );
    }

    if (view === 'dealers') {
      const dealerSummary = (() => {
        const m = new Map<string, { name: string; count: number }>();
        registrations.forEach(r => {
          const key = r.dealer_number || '—';
          const cur = m.get(key) || { name: r.dealer_name || key, count: 0 };
          cur.count += 1;
          m.set(key, cur);
        });
        return Array.from(m.entries()).map(([number, v]) => ({ number, ...v }));
      })();
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">{t('dealersTitle')}</h2>
          <p className="text-sm text-slate-500 mb-4">{t('dealersSubtitle')}</p>
          {dealerSummary.length === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center">{t('empty')}</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t('filterDealer')}</TableHead>
                <TableHead>{t('colItemName')}</TableHead>
                <TableHead className="text-right">{t('statTotal')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {dealerSummary.map(d => (
                  <TableRow key={d.number}>
                    <TableCell className="font-mono text-xs">{d.number}</TableCell>
                    <TableCell>{d.name}</TableCell>
                    <TableCell className="text-right">{d.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      );
    }



    // view === 'create'
    return (
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={t('fSerial')} error={errors.serial_number ? t('required') : null}>
          <Input value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} />
        </Field>
        <Field label={t('fType')} error={errors.machine_type ? t('required') : null}>
          <Select value={form.machine_type} onValueChange={(v) => setForm({ ...form, machine_type: v })}>
            <SelectTrigger><SelectValue placeholder={t('selectType')} /></SelectTrigger>
            <SelectContent>
              {SERVICE_MACHINE_TYPES.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={isBackend ? t('fDealer') : t('ownDealer')} error={isBackend && errors.dealer_name ? t('required') : null}>
          {isBackend ? (
            <Select
              value={form.dealer_number || ''}
              onValueChange={(v) => {
                const d = dealers.find(x => x.account_number === v);
                setForm({ ...form, dealer_number: v, dealer_name: d?.company_name ?? '' });
              }}
            >
              <SelectTrigger><SelectValue placeholder={t('fDealer')} /></SelectTrigger>
              <SelectContent className="max-h-72">
                {dealers.map(d => (
                  <SelectItem key={d.id} value={d.account_number}>
                    {d.account_number} — {d.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div>
              <Input
                value={dealerNumber ? `${dealerNumber}${dealerName ? ' — ' + dealerName : ''}` : ''}
                placeholder={t('noDealerLink')}
                disabled
                readOnly
                aria-label={t('dealerLocked')}
              />
              <p className="text-xs text-slate-500 mt-1">{t('dealerLockedHelp')}</p>
            </div>
          )}
        </Field>
        <Field label={t('fCustomer')}>
          <Input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} />
        </Field>
        <Field label={t('fDate')} error={errors.service_date ? t('required') : null}>
          <Input type="date" value={form.service_date} onChange={e => setForm({ ...form, service_date: e.target.value })} />
        </Field>
        <Field label={t('fHours')} error={errors.operating_hours ? t('required') : null}>
          <Input type="number" min={0} value={form.operating_hours} onChange={e => setForm({ ...form, operating_hours: e.target.value })} />
        </Field>
        <Field label={t('fInterval')} error={errors.service_interval_hours ? t('required') : null}>
          {hasBasis ? (
            <Select value={form.service_interval_hours} onValueChange={(v) => setForm({ ...form, service_interval_hours: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {intervals.map(i => <SelectItem key={i.id} value={String(i.interval_hours)}>{i.label || `${i.interval_hours} h`}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <div>
              <Input
                type="number"
                min={0}
                value={form.service_interval_hours}
                onChange={e => setForm({ ...form, service_interval_hours: e.target.value })}
                placeholder={t('intervalHoursPlaceholder')}
              />
              <p className="text-xs text-slate-500 mt-1">{t('basisMissing')}</p>
            </div>
          )}
        </Field>
        <Field label={t('fTech')} error={errors.technician_name ? t('required') : null}>
          <Input value={form.technician_name} onChange={e => setForm({ ...form, technician_name: e.target.value })} />
        </Field>
        {selectedStep && (
          <div className="md:col-span-2 border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
              {t('basisTitle')} — {form.machine_type} / {form.service_interval_hours} timer
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colItemNo')}</TableHead>
                  <TableHead>{t('colItemName')}</TableHead>
                  <TableHead className="text-right">{t('colUnitPrice')}</TableHead>
                  <TableHead className="text-right">{t('colQty')}</TableHead>
                  <TableHead className="text-right">{t('colSum')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedStep.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right">{r.price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right">{r.sum.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-semibold">{t('colTotal')}</TableCell>
                  <TableCell className="text-right font-semibold">{selectedStep.stepTotal.toFixed(2)} kr</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
        <div className="md:col-span-2 flex items-center gap-2">
          <Checkbox id="plan" checked={form.service_plan_completed} onCheckedChange={(v) => setForm({ ...form, service_plan_completed: v === true })} />
          <Label htmlFor="plan">{t('fPlan')}</Label>
        </div>
        <Field label={t('fNotes')} full><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        <Field label={t('fFaults')} full><Textarea rows={2} value={form.faults_found} onChange={e => setForm({ ...form, faults_found: e.target.value })} /></Field>
        <div className="md:col-span-2 border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 flex items-center justify-between">
            <span>{t('extraTitle')}</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setExtraParts((rows) => [...rows, { id: '', name: '', price: '', qty: '1' }])}
            >
              <Plus className="h-4 w-4 mr-1" />{t('extraAdd')}
            </Button>
          </div>
          {extraParts.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500 text-center">{t('extraEmpty')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colItemNo')}</TableHead>
                  <TableHead>{t('colItemName')}</TableHead>
                  <TableHead className="text-right w-32">{t('colUnitPrice')}</TableHead>
                  <TableHead className="text-right w-20">{t('colQty')}</TableHead>
                  <TableHead className="text-right w-28">{t('colSum')}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extraRows.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Input
                        value={r.id}
                        onChange={(e) => setExtraParts((rows) => rows.map((x, i) => i === idx ? { ...x, id: e.target.value } : x))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.name}
                        onChange={(e) => setExtraParts((rows) => rows.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="text-right"
                        value={r.price}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
                          const parts = v.split('.');
                          const cleaned = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : v;
                          setExtraParts((rows) => rows.map((x, i) => i === idx ? { ...x, price: cleaned } : x));
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        inputMode="numeric"
                        className="text-right"
                        value={r.qty}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, '');
                          setExtraParts((rows) => rows.map((x, i) => i === idx ? { ...x, qty: v } : x));
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">{r.sum.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t('remove')}
                        onClick={() => setExtraParts((rows) => rows.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        {(selectedStep || extraParts.length > 0) && (
          <div className="md:col-span-2 border border-slate-200 rounded-lg p-4 bg-slate-50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="flex justify-between sm:block">
                <span className="text-slate-600">{t('totalKit')}</span>
                <div className="font-semibold">{kitTotal.toFixed(2)} kr</div>
              </div>
              <div className="flex justify-between sm:block">
                <span className="text-slate-600">{t('totalExtra')}</span>
                <div className="font-semibold">{extraTotal.toFixed(2)} kr</div>
              </div>
              <div className="flex justify-between sm:block">
                <span className="text-slate-600">{t('totalGrand')}</span>
                <div className="font-bold text-base">{grandTotal.toFixed(2)} kr</div>
              </div>
            </div>
          </div>
        )}
        <div className="md:col-span-2">
          <Label className="text-xs text-slate-500 flex items-center gap-2"><Upload className="h-4 w-4" />{t('fUpload')}</Label>
          <Input type="file" disabled className="mt-1 opacity-60" />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button type="submit" disabled={submitting}>{submitting ? t('saving') : t('save')}</Button>
        </div>
      </form>
    );
  };

  return (
    <ServiceMaintenanceSidebarLayout
      currentView={view}
      onViewChange={setView}
      isInternal={isBackend}
      intro={intro}
    >
      {renderView()}

      {historyFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setHistoryFor(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[85vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{t('history')} — {historyFor.serial_number} ({historyFor.machine_type})</h2>
              <Button variant="secondary" onClick={() => setHistoryFor(null)}>{t('closeHistory')}</Button>
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t('colLastService')}</TableHead>
                <TableHead>{t('colHours')}</TableHead>
                <TableHead>{t('fInterval')}</TableHead>
                <TableHead>{t('fTech')}</TableHead>
                <TableHead>{t('fNotes')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {historyRows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-slate-500">{t('none')}</TableCell></TableRow>}
                {historyRows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.service_date}</TableCell>
                    <TableCell>{r.operating_hours ?? '—'}</TableCell>
                    <TableCell>{r.service_interval_hours} h</TableCell>
                    <TableCell>{r.technician_name ?? '—'}</TableCell>
                    <TableCell className="max-w-xs truncate" title={r.notes ?? ''}>{r.notes ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </ServiceMaintenanceSidebarLayout>
  );
}

function DashCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900 truncate">{value}</div>
    </div>
  );
}


type ExtraRow = { id: string; name: string; priceNum: number; qtyNum: number; sum: number };

function serializeParts(
  machineType: string,
  intervalHours: string,
  selectedStep: { rows: { id: string; name: string; price: number; count: number; sum: number }[]; stepTotal: number } | null,
  extras: ExtraRow[],
  kitTotal: number,
  extraTotal: number,
  grandTotal: number,
): string | null {
  const parts: string[] = [];
  if (selectedStep) {
    parts.push(`[Servicekit] ${machineType} — ${intervalHours} timer`);
    selectedStep.rows.forEach((r) => {
      parts.push(`${r.id}\t${r.name}\t${r.count} stk\t${r.price.toFixed(2)} kr\t${r.sum.toFixed(2)} kr`);
    });
    parts.push(`Total servicekit: ${kitTotal.toFixed(2)} kr`);
  }
  if (extras.length > 0) {
    parts.push('');
    parts.push('[Ekstra reservedele uden for servicekit]');
    extras.forEach((r) => {
      parts.push(`${r.id || '-'}\t${r.name || '-'}\t${r.qtyNum} stk\t${r.priceNum.toFixed(2)} kr\t${r.sum.toFixed(2)} kr`);
    });
    parts.push(`Total ekstra: ${extraTotal.toFixed(2)} kr`);
  }
  if (selectedStep || extras.length > 0) {
    parts.push('');
    parts.push(`Total samlet: ${grandTotal.toFixed(2)} kr`);
  }
  const out = parts.join('\n').trim();
  return out || null;
}

function Field({ label, error, full, children }: { label: string; error?: string | null; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>

      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function MachineTable({ machines, t, lastServiceFor, onOpen }: {
  machines: ServiceMachine[];
  t: (k: string) => string;
  lastServiceFor: (s: string) => ServiceRegistration | undefined;
  onOpen: (m: ServiceMachine) => void;
}) {
  if (machines.length === 0) return <div className="text-sm text-gray-500 py-8 text-center">{t('none')}</div>;
  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>{t('colSerial')}</TableHead>
        <TableHead>{t('colType')}</TableHead>
        <TableHead>{t('colDealer')}</TableHead>
        <TableHead>{t('colCustomer')}</TableHead>
        <TableHead>{t('colLastService')}</TableHead>
        <TableHead>{t('colNextService')}</TableHead>
        <TableHead>{t('colHours')}</TableHead>
        <TableHead>{t('history')}</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {machines.map(m => {
          const last = lastServiceFor(m.serial_number);
          const next = last ? last.service_interval_hours + (last.service_interval_hours >= 1000 ? 100 : 100) : 100;
          return (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{m.serial_number}</TableCell>
              <TableCell>{m.machine_type}</TableCell>
              <TableCell>{m.dealer_name ?? m.dealer_number ?? '—'}</TableCell>
              <TableCell>{m.customer_name ?? '—'}</TableCell>
              <TableCell>{last?.service_date ?? '—'}</TableCell>
              <TableCell>{next} h</TableCell>
              <TableCell>{last?.operating_hours ?? '—'}</TableCell>
              <TableCell><Button size="sm" variant="secondary" onClick={() => onOpen(m)}><Search className="h-3 w-3 mr-1" />{t('history')}</Button></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
