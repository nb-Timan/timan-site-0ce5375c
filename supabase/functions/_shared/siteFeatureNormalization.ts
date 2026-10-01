export const SITE_FEATURE_LANGUAGES = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const;

export type SiteFeatureLanguage = typeof SITE_FEATURE_LANGUAGES[number];

export type SiteFeatureSource = {
  title_internal?: string | null;
  description_internal?: string | null;
  technical_description?: string | null;
};

type UserFacingCopy = Record<SiteFeatureLanguage, { title: string; description: string }>;

export type SiteFeatureClassification = {
  id: string;
  module: string;
  changeType: 'feature' | 'improvement' | 'campaign' | 'bugfix' | 'technical';
  affectedRoles: string[];
  recommendation: 'publish' | 'maybe' | 'internal';
  userImpact: number;
  technicalImpact: number;
  securitySensitive?: boolean;
};

type SiteFeatureRule = {
  id: string;
  pattern: RegExp;
  copy: UserFacingCopy;
  classification?: Omit<SiteFeatureClassification, 'id'>;
};

const RULES: SiteFeatureRule[] = [
  {
    id: 'configurator-campaign-opt-out',
    pattern: /canonical campaign opt[- ]out|deactivat(?:e|ing).*campaign|deaktiv(?:e|é)r.*kampagne|campaign.*opt[- ]out/i,
    classification: { module: 'sales', changeType: 'improvement', affectedRoles: ['timan_seller', 'timan_dealer', 'timan_importer'], recommendation: 'publish', userImpact: 8, technicalImpact: 6 },
    copy: {
      da: { title: 'Kampagner kan nu deaktiveres i Configurator', description: 'Få normal prisberegning uden at fjerne kampagnen.\n\nHvad er ændret?\n• Kampagnen kan slås fra direkte i Configurator.\n• Prisen genberegnes efter de normale rabatregler.' },
      en: { title: 'Campaigns can now be deactivated in Configurator', description: 'Use normal price calculation without removing the campaign.\n\nWhat changed?\n• Deactivate the campaign directly in Configurator.\n• Prices are recalculated using the normal discount rules.' },
      de: { title: 'Kampagnen können im Konfigurator deaktiviert werden', description: 'Nutzen Sie die normale Preisberechnung, ohne die Kampagne zu entfernen.\n\nWas ist neu?\n• Die Kampagne kann direkt deaktiviert werden.\n• Preise werden nach den normalen Rabattregeln neu berechnet.' },
      it: { title: 'Le campagne possono essere disattivate nel Configurator', description: 'Usa il calcolo normale del prezzo senza rimuovere la campagna.\n\nNovità:\n• Disattiva la campagna direttamente.\n• I prezzi vengono ricalcolati con le normali regole di sconto.' },
      hu: { title: 'A kampányok kikapcsolhatók a Konfigurátorban', description: 'Használja a normál árképzést a kampány törlése nélkül.\n\nVáltozások:\n• A kampány közvetlenül kikapcsolható.\n• Az ár újraszámítása a normál kedvezményszabályok szerint történik.' },
      sv: { title: 'Kampanjer kan nu inaktiveras i Konfiguratorn', description: 'Använd normal prisberäkning utan att ta bort kampanjen.\n\nVad har ändrats?\n• Kampanjen kan stängas av direkt.\n• Priset räknas om enligt de vanliga rabattreglerna.' },
      fr: { title: 'Les campagnes peuvent être désactivées dans le Configurateur', description: 'Utilisez le calcul de prix normal sans supprimer la campagne.\n\nNouveautés :\n• Désactivez la campagne directement.\n• Le prix est recalculé selon les règles de remise normales.' },
      pl: { title: 'Kampanie można teraz wyłączyć w Konfiguratorze', description: 'Użyj zwykłego obliczania ceny bez usuwania kampanii.\n\nCo się zmieniło?\n• Kampanię można wyłączyć bezpośrednio.\n• Cena jest przeliczana według zwykłych zasad rabatowych.' },
      cs: { title: 'Kampaně lze nyní vypnout v Konfigurátoru', description: 'Použijte běžný výpočet ceny bez odstranění kampaně.\n\nCo se změnilo?\n• Kampaň lze vypnout přímo.\n• Cena se přepočítá podle běžných pravidel slev.' },
    },
  },
  {
    id: 'configurator-direct-quote-only',
    pattern: /direct configurator pricing mode|configurator pricing precedence|direct quote[- ]only|direkte.*(?:kun|only).*(?:tilbud|quote)/i,
    classification: { module: 'sales', changeType: 'improvement', affectedRoles: ['timan_seller'], recommendation: 'publish', userImpact: 8, technicalImpact: 7 },
    copy: {
      da: { title: 'Direkte kan nu kun bruges til tilbud', description: 'Direkte-priser er afgrænset til tilbud, så ordreflowet følger de normale handelsregler.\n\nHvad er ændret?\n• Direkte kan vælges ved tilbud.\n• Ordreflowet bruger fortsat den normale prislogik.' },
      en: { title: 'Direct can now only be used for quotes', description: 'Direct pricing is limited to quotes, while orders keep the normal commercial rules.\n\nWhat changed?\n• Direct can be selected for quotes.\n• Orders continue to use normal pricing.' },
      de: { title: 'Direkt kann nur noch für Angebote verwendet werden', description: 'Direktpreise sind auf Angebote begrenzt; Aufträge folgen den normalen Handelsregeln.\n\nWas ist neu?\n• Direkt ist für Angebote verfügbar.\n• Aufträge verwenden weiterhin die normale Preislogik.' },
      it: { title: 'La modalità Diretta è ora solo per le offerte', description: 'I prezzi diretti sono limitati alle offerte; gli ordini seguono le regole normali.\n\nNovità:\n• Diretta è disponibile per le offerte.\n• Gli ordini mantengono i prezzi normali.' },
      hu: { title: 'A Közvetlen mód csak ajánlatokhoz használható', description: 'A közvetlen árképzés az ajánlatokra korlátozódik; a rendelések a normál szabályokat követik.\n\nVáltozások:\n• A Közvetlen mód ajánlatoknál választható.\n• A rendelések normál árképzést használnak.' },
      sv: { title: 'Direkt kan nu bara användas för offerter', description: 'Direktpriser är begränsade till offerter; order följer normala handelsregler.\n\nVad har ändrats?\n• Direkt kan väljas för offerter.\n• Order använder fortsatt normal prislogik.' },
      fr: { title: 'Le mode Direct est désormais réservé aux devis', description: 'La tarification directe est limitée aux devis; les commandes suivent les règles normales.\n\nNouveautés :\n• Direct est disponible pour les devis.\n• Les commandes conservent la tarification normale.' },
      pl: { title: 'Tryb Bezpośredni jest teraz tylko dla ofert', description: 'Ceny bezpośrednie dotyczą ofert; zamówienia zachowują zwykłe zasady.\n\nCo się zmieniło?\n• Tryb Bezpośredni można wybrać dla ofert.\n• Zamówienia nadal używają zwykłych cen.' },
      cs: { title: 'Režim Přímý lze nyní použít jen pro nabídky', description: 'Přímé ceny jsou omezeny na nabídky; objednávky používají běžná pravidla.\n\nCo se změnilo?\n• Režim Přímý je dostupný pro nabídky.\n• Objednávky nadále používají běžné ceny.' },
    },
  },
  {
    id: 'sales-document-discount-breakdown',
    pattern: /read[- ]only crm sales document breakdowns|discount breakdown|rabatfordeling|discount components?.*(?:quote|order)|(?:quote|order).*(?:discount|rabat).*(?:breakdown|details?)/i,
    classification: { module: 'crm', changeType: 'feature', affectedRoles: ['timan_backend', 'timan_seller', 'timan_dealer'], recommendation: 'publish', userImpact: 8, technicalImpact: 5 },
    copy: {
      da: { title: 'Tilbud og ordrer viser nu rabatfordelingen', description: 'Se hvordan den samlede rabat er bygget op på det gemte salgsdokument.\n\nHvad er ændret?\n• Rabattyper vises separat.\n• Beløb og dokumentdata forbliver uændrede.' },
      en: { title: 'Quotes and orders now show the discount breakdown', description: 'See how the total discount is composed on the saved sales document.\n\nWhat changed?\n• Discount types are shown separately.\n• Amounts and document data remain unchanged.' },
      de: { title: 'Angebote und Aufträge zeigen jetzt die Rabattaufteilung', description: 'Sehen Sie die Bestandteile des Gesamtrabatts im gespeicherten Verkaufsdokument.\n\nWas ist neu?\n• Rabattarten werden getrennt angezeigt.\n• Beträge und Dokumentdaten bleiben unverändert.' },
      it: { title: 'Offerte e ordini mostrano ora il dettaglio degli sconti', description: 'Vedi come è composto lo sconto totale nel documento salvato.\n\nNovità:\n• I tipi di sconto sono separati.\n• Importi e dati restano invariati.' },
      hu: { title: 'Az ajánlatok és rendelések megjelenítik a kedvezmények bontását', description: 'Tekintse meg az összes kedvezmény összetételét a mentett dokumentumban.\n\nVáltozások:\n• A kedvezménytípusok külön jelennek meg.\n• Az összegek és adatok változatlanok.' },
      sv: { title: 'Offerter och order visar nu rabattfördelningen', description: 'Se hur den totala rabatten är uppbyggd i det sparade dokumentet.\n\nVad har ändrats?\n• Rabattyper visas separat.\n• Belopp och dokumentdata är oförändrade.' },
      fr: { title: 'Les devis et commandes affichent le détail des remises', description: 'Consultez la composition de la remise totale dans le document enregistré.\n\nNouveautés :\n• Les types de remise sont séparés.\n• Les montants et données restent inchangés.' },
      pl: { title: 'Oferty i zamówienia pokazują teraz podział rabatu', description: 'Zobacz składniki łącznego rabatu w zapisanym dokumencie.\n\nCo się zmieniło?\n• Rodzaje rabatów są pokazane osobno.\n• Kwoty i dane dokumentu pozostają bez zmian.' },
      cs: { title: 'Nabídky a objednávky nyní zobrazují rozpis slev', description: 'Podívejte se na složení celkové slevy v uloženém dokumentu.\n\nCo se změnilo?\n• Typy slev jsou zobrazeny samostatně.\n• Částky a data dokumentu zůstávají stejné.' },
    },
  },
  {
    id: 'machine-extended-warranty-indicator',
    pattern: /extended[- ]warranty indicator|warranty indicator|forlænget garanti.*(?:indicator|vis)|add warranty indicator/i,
    classification: { module: 'service', changeType: 'feature', affectedRoles: ['timan_backend', 'timan_service', 'timan_dealer'], recommendation: 'publish', userImpact: 7, technicalImpact: 5 },
    copy: {
      da: { title: 'Forlænget garanti vises på maskiner', description: 'Maskinoversigten viser tydeligt, når en maskine har forlænget garanti.\n\nHvad er ændret?\n• Garantistatus kan ses direkte på maskinen.\n• Adgangen følger de eksisterende maskinrettigheder.' },
      en: { title: 'Extended warranty is shown on machines', description: 'The machine overview clearly shows when a machine has extended warranty.\n\nWhat changed?\n• Warranty status is visible on the machine.\n• Existing machine access rules still apply.' },
      de: { title: 'Die Garantieverlängerung wird an Maschinen angezeigt', description: 'Die Maschinenübersicht zeigt deutlich eine verlängerte Garantie.\n\nWas ist neu?\n• Der Garantiestatus ist direkt sichtbar.\n• Bestehende Zugriffsregeln gelten weiterhin.' },
      it: { title: 'La garanzia estesa è visibile sulle macchine', description: 'La panoramica indica chiaramente una garanzia estesa.\n\nNovità:\n• Lo stato della garanzia è visibile sulla macchina.\n• Restano valide le regole di accesso esistenti.' },
      hu: { title: 'A kiterjesztett garancia megjelenik a gépeken', description: 'A gépáttekintés egyértelműen jelzi a kiterjesztett garanciát.\n\nVáltozások:\n• A garanciaállapot közvetlenül látható.\n• A meglévő hozzáférési szabályok érvényesek.' },
      sv: { title: 'Förlängd garanti visas på maskiner', description: 'Maskinöversikten visar tydligt när en maskin har förlängd garanti.\n\nVad har ändrats?\n• Garantistatus syns direkt på maskinen.\n• Befintliga åtkomstregler gäller fortsatt.' },
      fr: { title: 'L’extension de garantie est affichée sur les machines', description: 'L’aperçu indique clairement les machines avec une garantie prolongée.\n\nNouveautés :\n• Le statut est visible directement.\n• Les règles d’accès existantes restent applicables.' },
      pl: { title: 'Rozszerzona gwarancja jest widoczna na maszynach', description: 'Przegląd maszyn wyraźnie pokazuje rozszerzoną gwarancję.\n\nCo się zmieniło?\n• Status gwarancji widać bezpośrednio.\n• Nadal obowiązują istniejące zasady dostępu.' },
      cs: { title: 'Prodloužená záruka je zobrazena u strojů', description: 'Přehled strojů jasně ukazuje prodlouženou záruku.\n\nCo se změnilo?\n• Stav záruky je přímo viditelný.\n• Stávající pravidla přístupu zůstávají.' },
    },
  },
  {
    id: 'support-product-price-lookup',
    pattern: /support product price lookup|assistant.*price lookup|support.*(?:product|produkt).*(?:price|pris)/i,
    classification: { module: 'ai_support', changeType: 'bugfix', affectedRoles: ['timan_backend'], recommendation: 'publish', userImpact: 7, technicalImpact: 6 },
    copy: {
      da: { title: 'AI Support kan slå aktuelle produktpriser op', description: 'Få svar baseret på de aktuelle frigivne produktpriser.\n\nHvad er ændret?\n• Prisforespørgsler bruger den aktuelle prisliste.\n• Svaret følger brugerens adgang og valuta.' },
      en: { title: 'AI Support can look up current product prices', description: 'Get answers based on current released product prices.\n\nWhat changed?\n• Price questions use the current price list.\n• Answers follow the user’s access and currency.' },
      de: { title: 'AI Support kann aktuelle Produktpreise abrufen', description: 'Antworten basieren auf den aktuell freigegebenen Produktpreisen.\n\nWas ist neu?\n• Preisfragen verwenden die aktuelle Preisliste.\n• Antworten beachten Zugriff und Währung.' },
      it: { title: 'AI Support può cercare i prezzi attuali dei prodotti', description: 'Le risposte si basano sui prezzi pubblicati correnti.\n\nNovità:\n• Le domande sui prezzi usano il listino attuale.\n• Le risposte rispettano accesso e valuta.' },
      hu: { title: 'Az AI Support lekérheti az aktuális termékárakat', description: 'A válaszok az aktuális kiadott termékárakon alapulnak.\n\nVáltozások:\n• Az árkérdések az aktuális árlistát használják.\n• A válaszok követik a hozzáférést és pénznemet.' },
      sv: { title: 'AI Support kan slå upp aktuella produktpriser', description: 'Få svar baserade på aktuella publicerade produktpriser.\n\nVad har ändrats?\n• Prisfrågor använder aktuell prislista.\n• Svar följer användarens åtkomst och valuta.' },
      fr: { title: 'AI Support peut consulter les prix actuels', description: 'Les réponses reposent sur les prix produits publiés actuels.\n\nNouveautés :\n• Les questions de prix utilisent la liste actuelle.\n• Les réponses respectent l’accès et la devise.' },
      pl: { title: 'AI Support może sprawdzać aktualne ceny produktów', description: 'Odpowiedzi opierają się na aktualnych opublikowanych cenach.\n\nCo się zmieniło?\n• Pytania o ceny używają aktualnego cennika.\n• Odpowiedzi uwzględniają dostęp i walutę.' },
      cs: { title: 'AI Support může vyhledat aktuální ceny produktů', description: 'Odpovědi vycházejí z aktuálních vydaných cen.\n\nCo se změnilo?\n• Dotazy na ceny používají aktuální ceník.\n• Odpovědi respektují přístup a měnu.' },
    },
  },
  {
    id: 'support-spare-parts',
    pattern: /spare[- ]parts identification routing|spare[- ]parts support|reservedels[- ]support|support.*(?:spare|reservedel)/i,
    classification: { module: 'ai_support', changeType: 'improvement', affectedRoles: ['timan_backend'], recommendation: 'publish', userImpact: 6, technicalImpact: 5 },
    copy: {
      da: { title: 'Reservedels-support er blevet udvidet', description: 'AI Support kan bedre genkende reservedelsspørgsmål og sende brugeren videre til det rigtige sted.\n\nHvad er ændret?\n• Reservedelsspørgsmål identificeres mere præcist.\n• Brugeren får relevant vejledning uden at gætte varenummer.' },
      en: { title: 'Spare-parts Support has been expanded', description: 'AI Support better recognises spare-parts questions and guides users to the right place.\n\nWhat changed?\n• Spare-parts questions are identified more precisely.\n• Users receive relevant guidance without guessed item numbers.' },
      de: { title: 'Der Ersatzteil-Support wurde erweitert', description: 'AI Support erkennt Ersatzteilfragen besser und führt zum richtigen Bereich.\n\nWas ist neu?\n• Ersatzteilfragen werden genauer erkannt.\n• Hinweise enthalten keine geratenen Artikelnummern.' },
      it: { title: 'Il supporto ricambi è stato ampliato', description: 'AI Support riconosce meglio le domande sui ricambi e guida al posto giusto.\n\nNovità:\n• Le domande sono identificate con precisione.\n• Nessun codice articolo viene inventato.' },
      hu: { title: 'Bővült az alkatrész-támogatás', description: 'Az AI Support jobban felismeri az alkatrészkérdéseket és a megfelelő helyre irányít.\n\nVáltozások:\n• Pontosabb felismerés.\n• Nincsenek kitalált cikkszámok.' },
      sv: { title: 'Reservdelssupporten har utökats', description: 'AI Support känner bättre igen reservdelsfrågor och vägleder rätt.\n\nVad har ändrats?\n• Frågorna identifieras mer exakt.\n• Inga artikelnummer gissas.' },
      fr: { title: 'Le support des pièces détachées a été étendu', description: 'AI Support reconnaît mieux les questions et oriente vers le bon endroit.\n\nNouveautés :\n• Les questions sont identifiées plus précisément.\n• Aucun numéro d’article n’est inventé.' },
      pl: { title: 'Rozszerzono wsparcie dotyczące części', description: 'AI Support lepiej rozpoznaje pytania o części i kieruje we właściwe miejsce.\n\nCo się zmieniło?\n• Pytania są dokładniej rozpoznawane.\n• Numery części nie są zgadywane.' },
      cs: { title: 'Podpora náhradních dílů byla rozšířena', description: 'AI Support lépe rozpozná dotazy na díly a navede na správné místo.\n\nCo se změnilo?\n• Dotazy jsou určeny přesněji.\n• Čísla dílů se neodhadují.' },
    },
  },
  {
    id: 'academy-progressive-access',
    pattern: /academy progressive portal access|progressive.*academy.*(?:access|unlock)|academy.*(?:unlock|oplås|adgang).*trin/i,
    classification: { module: 'academy', changeType: 'feature', affectedRoles: ['all'], recommendation: 'publish', userImpact: 8, technicalImpact: 6 },
    copy: {
      da: { title: 'Academy åbner Portal-funktioner trin for trin', description: 'Nye funktioner bliver tilgængelige i takt med Academy-forløbet.\n\nHvad er ændret?\n• Gennemførte cases åbner de relevante Portal-funktioner.\n• Fremdrift og eksisterende rettigheder bevares.' },
      en: { title: 'Academy unlocks Portal features step by step', description: 'New features become available as users progress through Academy.\n\nWhat changed?\n• Completed cases unlock relevant Portal features.\n• Progress and existing permissions are preserved.' },
      de: { title: 'Academy schaltet Portal-Funktionen schrittweise frei', description: 'Neue Funktionen werden mit dem Academy-Fortschritt verfügbar.\n\nWas ist neu?\n• Abgeschlossene Fälle schalten passende Funktionen frei.\n• Fortschritt und Rechte bleiben erhalten.' },
      it: { title: 'Academy sblocca le funzioni del Portale passo dopo passo', description: 'Le funzioni diventano disponibili con i progressi in Academy.\n\nNovità:\n• I casi completati sbloccano le funzioni pertinenti.\n• Progressi e permessi restano invariati.' },
      hu: { title: 'Az Academy lépésenként nyitja meg a Portál funkcióit', description: 'Az új funkciók az Academy előrehaladásával válnak elérhetővé.\n\nVáltozások:\n• A teljesített esetek feloldják a kapcsolódó funkciókat.\n• A haladás és jogosultságok megmaradnak.' },
      sv: { title: 'Academy öppnar Portalfunktioner steg för steg', description: 'Nya funktioner blir tillgängliga i takt med Academy-framstegen.\n\nVad har ändrats?\n• Genomförda case öppnar relevanta funktioner.\n• Framsteg och rättigheter bevaras.' },
      fr: { title: 'Academy débloque les fonctions du Portail progressivement', description: 'Les fonctions deviennent disponibles avec la progression Academy.\n\nNouveautés :\n• Les cas terminés débloquent les fonctions concernées.\n• La progression et les droits sont conservés.' },
      pl: { title: 'Academy odblokowuje funkcje Portalu krok po kroku', description: 'Funkcje stają się dostępne wraz z postępem w Academy.\n\nCo się zmieniło?\n• Ukończone przypadki odblokowują odpowiednie funkcje.\n• Postęp i uprawnienia pozostają.' },
      cs: { title: 'Academy odemyká funkce Portálu krok za krokem', description: 'Funkce se zpřístupňují s postupem v Academy.\n\nCo se změnilo?\n• Dokončené případy odemykají příslušné funkce.\n• Postup a oprávnění zůstávají.' },
    },
  },
  {
    id: 'price-list-release',
    pattern: /released price lists canonical|release.*price list|price list.*(?:release|frigiv)|prisliste.*frigiv/i,
    classification: { module: 'sales', changeType: 'feature', affectedRoles: ['timan_backend', 'timan_seller', 'timan_importer'], recommendation: 'publish', userImpact: 8, technicalImpact: 7 },
    copy: {
      da: { title: 'Prislister kan nu frigives til Configurator', description: 'En frigivet prisliste er den fælles kilde til aktuelle Configurator-priser.\n\nHvad er ændret?\n• Backend kan frigive en klar prisliste.\n• Configurator bruger kun den aktuelle frigivne version.' },
      en: { title: 'Price lists can now be released to Configurator', description: 'A released price list is the shared source for current Configurator prices.\n\nWhat changed?\n• Backend can release a ready price list.\n• Configurator uses only the current released version.' },
      de: { title: 'Preislisten können für den Konfigurator freigegeben werden', description: 'Eine freigegebene Preisliste ist die Quelle für aktuelle Preise.\n\nWas ist neu?\n• Backend kann eine fertige Preisliste freigeben.\n• Der Konfigurator nutzt die aktuelle Version.' },
      it: { title: 'I listini possono essere pubblicati nel Configurator', description: 'Un listino pubblicato è la fonte condivisa dei prezzi attuali.\n\nNovità:\n• Backend può pubblicare un listino pronto.\n• Il Configurator usa la versione corrente.' },
      hu: { title: 'Az árlisták kiadhatók a Konfigurátorhoz', description: 'A kiadott árlista az aktuális árak közös forrása.\n\nVáltozások:\n• A Backend kiadhat egy kész árlistát.\n• A Konfigurátor az aktuális kiadott verziót használja.' },
      sv: { title: 'Prislistor kan nu frisläppas till Konfiguratorn', description: 'En frisläppt prislista är gemensam källa för aktuella priser.\n\nVad har ändrats?\n• Backend kan frisläppa en färdig prislista.\n• Konfiguratorn använder aktuell version.' },
      fr: { title: 'Les listes de prix peuvent être publiées dans le Configurateur', description: 'Une liste publiée est la source commune des prix actuels.\n\nNouveautés :\n• Backend peut publier une liste prête.\n• Le Configurateur utilise la version actuelle.' },
      pl: { title: 'Cenniki można teraz publikować w Konfiguratorze', description: 'Opublikowany cennik jest wspólnym źródłem aktualnych cen.\n\nCo się zmieniło?\n• Backend może opublikować gotowy cennik.\n• Konfigurator używa aktualnej wersji.' },
      cs: { title: 'Ceníky lze nyní vydat do Konfigurátoru', description: 'Vydaný ceník je společným zdrojem aktuálních cen.\n\nCo se změnilo?\n• Backend může vydat připravený ceník.\n• Konfigurátor používá aktuální verzi.' },
    },
  },
  {
    id: 'configurator-seller-demo-access',
    pattern: /decouple configurator demo access|seller demo access|demo access.*configurator/i,
    classification: { module: 'sales', changeType: 'improvement', affectedRoles: ['timan_seller'], recommendation: 'publish', userImpact: 6, technicalImpact: 5 },
    copy: {
      da: { title: 'Sælgeres demo-adgang er gjort mere præcis', description: 'Demo-funktioner i Configurator følger nu den særskilte demo-adgang.\n\nHvad er ændret?\n• Demo-adgang styres uafhængigt af øvrige salgsrettigheder.\n• Eksisterende pris- og ordrelogik er uændret.' },
      en: { title: 'Seller demo access is more precise', description: 'Configurator demo features now follow the dedicated demo access.\n\nWhat changed?\n• Demo access is separate from other sales permissions.\n• Pricing and order logic are unchanged.' },
      de: { title: 'Der Demo-Zugang für Verkäufer ist präziser', description: 'Demo-Funktionen folgen jetzt dem eigenen Demo-Zugang.\n\nWas ist neu?\n• Demo-Zugang ist von anderen Verkaufsrechten getrennt.\n• Preis- und Auftragslogik bleiben gleich.' },
      it: { title: 'L’accesso demo dei venditori è più preciso', description: 'Le funzioni demo seguono ora l’accesso dedicato.\n\nNovità:\n• Accesso demo separato dagli altri permessi.\n• Prezzi e ordini invariati.' },
      hu: { title: 'Pontosabb lett az értékesítői demó-hozzáférés', description: 'A demófunkciók a külön demó-hozzáférést követik.\n\nVáltozások:\n• A demó-hozzáférés külön jogosultság.\n• Az ár- és rendelési logika változatlan.' },
      sv: { title: 'Säljares demoåtkomst är mer exakt', description: 'Demofunktioner följer nu den separata demoåtkomsten.\n\nVad har ändrats?\n• Demoåtkomst skiljs från andra säljrättigheter.\n• Pris- och orderlogik är oförändrad.' },
      fr: { title: 'L’accès démo des vendeurs est plus précis', description: 'Les fonctions démo suivent désormais l’accès dédié.\n\nNouveautés :\n• L’accès démo est séparé des autres droits.\n• Prix et commandes sont inchangés.' },
      pl: { title: 'Dostęp sprzedawców do demo jest dokładniejszy', description: 'Funkcje demo korzystają teraz z osobnego dostępu.\n\nCo się zmieniło?\n• Dostęp demo jest oddzielony od innych uprawnień.\n• Ceny i zamówienia bez zmian.' },
      cs: { title: 'Přístup prodejců k demu je přesnější', description: 'Demo funkce nyní používají samostatný přístup.\n\nCo se změnilo?\n• Demo přístup je oddělen od ostatních oprávnění.\n• Ceny a objednávky se nemění.' },
    },
  },
  {
    id: 'campaign-audience-targeting',
    pattern: /campaign audiences|campaign audience targeting|kampagne.*målgruppe|importer pricing and campaign audiences/i,
    classification: { module: 'marketing', changeType: 'campaign', affectedRoles: ['timan_backend', 'timan_importer'], recommendation: 'publish', userImpact: 7, technicalImpact: 6 },
    copy: {
      da: { title: 'Kampagner kan målrettes relevante målgrupper', description: 'Marketing kan vælge, hvem en kampagne er relevant for.\n\nHvad er ændret?\n• Kampagner kan målrettes efter portalrolle.\n• Målgruppen ændrer ikke brugerens sikkerhedsadgang.' },
      en: { title: 'Campaigns can target relevant audiences', description: 'Marketing can choose who a campaign is relevant for.\n\nWhat changed?\n• Campaigns can target Portal roles.\n• Audience does not change security access.' },
      de: { title: 'Kampagnen können relevante Zielgruppen ansprechen', description: 'Marketing kann die relevante Zielgruppe auswählen.\n\nWas ist neu?\n• Kampagnen können nach Portalrolle ausgerichtet werden.\n• Die Zielgruppe ändert keine Zugriffsrechte.' },
      it: { title: 'Le campagne possono rivolgersi ai destinatari pertinenti', description: 'Marketing può scegliere il pubblico della campagna.\n\nNovità:\n• Target per ruolo del Portale.\n• Il pubblico non modifica l’accesso.' },
      hu: { title: 'A kampányok releváns célcsoportokra irányíthatók', description: 'A Marketing kiválaszthatja a kampány célközönségét.\n\nVáltozások:\n• Célzás Portál-szerepkör alapján.\n• A célközönség nem módosít hozzáférést.' },
      sv: { title: 'Kampanjer kan riktas till relevanta målgrupper', description: 'Marketing kan välja vem kampanjen är relevant för.\n\nVad har ändrats?\n• Kampanjer kan riktas efter Portalroll.\n• Målgruppen ändrar inte åtkomsten.' },
      fr: { title: 'Les campagnes peuvent cibler les publics pertinents', description: 'Marketing peut choisir le public concerné.\n\nNouveautés :\n• Ciblage selon le rôle Portail.\n• Le public ne modifie pas les accès.' },
      pl: { title: 'Kampanie można kierować do właściwych odbiorców', description: 'Marketing może wybrać odbiorców kampanii.\n\nCo się zmieniło?\n• Kierowanie według roli w Portalu.\n• Odbiorcy nie zmieniają uprawnień.' },
      cs: { title: 'Kampaně lze cílit na relevantní publikum', description: 'Marketing může zvolit cílovou skupinu kampaně.\n\nCo se změnilo?\n• Cílení podle role v Portálu.\n• Publikum nemění přístupová práva.' },
    },
  },
  {
    id: 'crm-machine-filter',
    pattern: /(?:crm|lead).*(?:machine|maskine).*(?:filter)|(?:machine|maskine).*(?:filter).*(?:crm|lead)/i,
    copy: {
      da: { title: 'Leads er blevet nemmere at filtrere', description: 'Maskinefilteret viser nu kun relevante maskintyper og redskaber.' },
      en: { title: 'Leads are easier to filter', description: 'The machine filter now shows only relevant machine types and implements.' },
      de: { title: 'Leads lassen sich leichter filtern', description: 'Der Maschinenfilter zeigt nur noch relevante Maschinentypen und Anbaugeräte.' },
      it: { title: 'I lead sono più facili da filtrare', description: 'Il filtro mostra ora solo i tipi di macchina e le attrezzature pertinenti.' },
      hu: { title: 'A leadek könnyebben szűrhetők', description: 'A gépszűrő már csak a releváns géptípusokat és munkaeszközöket mutatja.' },
      sv: { title: 'Leads har blivit enklare att filtrera', description: 'Maskinfiltret visar nu bara relevanta maskintyper och redskap.' },
      fr: { title: 'Les leads sont plus faciles à filtrer', description: 'Le filtre affiche désormais uniquement les machines et outils pertinents.' },
      pl: { title: 'Leady można łatwiej filtrować', description: 'Filtr pokazuje teraz tylko odpowiednie typy maszyn i osprzęt.' },
      cs: { title: 'Leady lze snadněji filtrovat', description: 'Filtr nyní zobrazuje jen relevantní typy strojů a nářadí.' },
    },
  },
  {
    id: 'crm-demo-contact',
    pattern: /demo.*(?:dealer|forhandler).*(?:representative|contact|kontakt|person)|(?:representative|contact|kontaktperson).*(?:demo)/i,
    copy: {
      da: { title: 'Kontaktpersoner kan vælges ved demo', description: 'Vælg direkte mellem kontaktpersonerne hos den valgte forhandler.' },
      en: { title: 'Contacts can be selected for demos', description: 'Choose directly from the contacts at the selected dealer.' },
      de: { title: 'Kontaktpersonen können für Demos gewählt werden', description: 'Wählen Sie direkt aus den Kontakten des ausgewählten Händlers.' },
      it: { title: 'I contatti si possono scegliere per le demo', description: 'Scegli direttamente tra i contatti del rivenditore selezionato.' },
      hu: { title: 'A demóhoz kapcsolattartó választható', description: 'Válasszon közvetlenül a kiválasztott kereskedő kapcsolattartói közül.' },
      sv: { title: 'Kontaktpersoner kan väljas för demo', description: 'Välj direkt bland kontaktpersonerna hos den valda återförsäljaren.' },
      fr: { title: 'Les contacts peuvent être choisis pour une démo', description: 'Choisissez directement parmi les contacts du revendeur sélectionné.' },
      pl: { title: 'Do demo można wybrać osobę kontaktową', description: 'Wybierz bezpośrednio kontakt u wybranego dealera.' },
      cs: { title: 'Pro demo lze vybrat kontaktní osobu', description: 'Vyberte přímo z kontaktů u zvoleného prodejce.' },
    },
  },
  {
    id: 'crm-legacy-lead-persistence',
    pattern: /(?:legacy|g[- ]?lead).*(?:persistence|precedence|contact|read)|canonical crm lead read precedence/i,
    copy: {
      da: { title: 'Gamle leads gemmer nu oplysninger korrekt', description: 'Ændringer på ældre G-leads bliver bevaret, når leadet åbnes igen.' },
      en: { title: 'Older leads now save information correctly', description: 'Changes to older G-leads are preserved when the lead is reopened.' },
      de: { title: 'Ältere Leads speichern Angaben jetzt korrekt', description: 'Änderungen an älteren G-Leads bleiben beim erneuten Öffnen erhalten.' },
      it: { title: 'I lead precedenti salvano correttamente i dati', description: 'Le modifiche ai vecchi G-lead restano disponibili dopo la riapertura.' },
      hu: { title: 'A régebbi leadek helyesen mentik az adatokat', description: 'A régi G-leadek módosításai újbóli megnyitáskor is megmaradnak.' },
      sv: { title: 'Äldre leads sparar nu uppgifter korrekt', description: 'Ändringar i äldre G-leads bevaras när leadet öppnas igen.' },
      fr: { title: 'Les anciens leads enregistrent correctement les données', description: 'Les modifications des anciens G-leads sont conservées à la réouverture.' },
      pl: { title: 'Starsze leady poprawnie zapisują dane', description: 'Zmiany w starszych G-leadach pozostają po ponownym otwarciu.' },
      cs: { title: 'Starší leady nyní správně ukládají údaje', description: 'Změny ve starších G-leadech zůstanou po opětovném otevření.' },
    },
  },
  {
    id: 'crm-lead-notes',
    pattern: /(?:lead).*(?:note|follow[- ]?up|opfølgning)|(?:note|follow[- ]?up|opfølgning).*(?:lead)/i,
    copy: {
      da: { title: 'Noter og opfølgning er samlet på leadet', description: 'Tilføj noter og næste opfølgning uden gentagne felter på leadet.' },
      en: { title: 'Notes and follow-up are combined on the lead', description: 'Add notes and the next follow-up without duplicate fields on the lead.' },
      de: { title: 'Notizen und Nachverfolgung sind im Lead gebündelt', description: 'Notizen und nächste Schritte lassen sich ohne doppelte Felder erfassen.' },
      it: { title: 'Note e follow-up sono riuniti nel lead', description: 'Aggiungi note e il prossimo follow-up senza campi duplicati.' },
      hu: { title: 'A jegyzetek és utánkövetések egy helyen vannak', description: 'Jegyzetek és következő lépések ismétlődő mezők nélkül rögzíthetők.' },
      sv: { title: 'Anteckningar och uppföljning är samlade på leadet', description: 'Lägg till anteckningar och nästa uppföljning utan dubbla fält.' },
      fr: { title: 'Les notes et le suivi sont regroupés sur le lead', description: 'Ajoutez des notes et le prochain suivi sans champs en double.' },
      pl: { title: 'Notatki i działania są zebrane w leadzie', description: 'Dodawaj notatki i kolejne działania bez powielonych pól.' },
      cs: { title: 'Poznámky a následné kroky jsou u leadu pohromadě', description: 'Přidávejte poznámky a další krok bez duplicitních polí.' },
    },
  },
  {
    id: 'crm-budget-basis',
    pattern: /original dealer budget basis|oprindelig.*budget|budgetgrundlag/i,
    copy: {
      da: { title: 'Budgetgrundlag er nu synligt', description: 'Se hvordan det oprindelige budget var fordelt på forhandlere.' },
      en: { title: 'The original budget basis is now visible', description: 'See how the original budget was distributed across dealers.' },
      de: { title: 'Die ursprüngliche Budgetbasis ist jetzt sichtbar', description: 'Sehen Sie, wie das ursprüngliche Budget auf Händler verteilt war.' },
      it: { title: 'La base del budget è ora visibile', description: 'Vedi come il budget originale era distribuito tra i rivenditori.' },
      hu: { title: 'Az eredeti költségvetési alap most látható', description: 'Megtekintheti az eredeti költségvetés kereskedők közötti elosztását.' },
      sv: { title: 'Det ursprungliga budgetunderlaget visas nu', description: 'Se hur den ursprungliga budgeten fördelades mellan återförsäljare.' },
      fr: { title: 'La base budgétaire initiale est maintenant visible', description: 'Consultez la répartition initiale du budget entre les revendeurs.' },
      pl: { title: 'Pierwotna podstawa budżetu jest teraz widoczna', description: 'Zobacz pierwotny podział budżetu między dealerów.' },
      cs: { title: 'Původní základ rozpočtu je nyní viditelný', description: 'Podívejte se na původní rozdělení rozpočtu mezi prodejce.' },
    },
  },
  {
    id: 'academy-advanced-sales',
    pattern: /advanced sales campaign academy case|academy.*(?:advanced|campaign).*(?:sales|salg)/i,
    copy: {
      da: { title: 'Ny avanceret salgscase i Academy', description: 'Træn salg af Timan 3330 sammen med CS-200 og kampagner.' },
      en: { title: 'New advanced sales case in Academy', description: 'Practise selling Timan 3330 with CS-200 and campaigns.' },
      de: { title: 'Neue fortgeschrittene Verkaufsaufgabe in Academy', description: 'Trainieren Sie den Verkauf des Timan 3330 mit CS-200 und Kampagnen.' },
      it: { title: 'Nuovo caso di vendita avanzato in Academy', description: 'Esercitati a vendere Timan 3330 con CS-200 e campagne.' },
      hu: { title: 'Új haladó értékesítési eset az Academyben', description: 'Gyakorolja a Timan 3330 értékesítését CS-200-zal és kampányokkal.' },
      sv: { title: 'Nytt avancerat försäljningscase i Academy', description: 'Träna på att sälja Timan 3330 tillsammans med CS-200 och kampanjer.' },
      fr: { title: 'Nouveau cas de vente avancé dans Academy', description: 'Entraînez-vous à vendre le Timan 3330 avec le CS-200 et des campagnes.' },
      pl: { title: 'Nowy zaawansowany przypadek sprzedaży w Academy', description: 'Ćwicz sprzedaż Timan 3330 z CS-200 i kampaniami.' },
      cs: { title: 'Nový pokročilý prodejní případ v Academy', description: 'Procvičte si prodej Timan 3330 s CS-200 a kampaněmi.' },
    },
  },
  {
    id: 'configurator-scroll',
    pattern: /configurator.*scroll.*navigation|reset configurator scroll|scroll.*(?:step|machine|navigation)/i,
    copy: {
      da: { title: 'Konfiguratoren starter øverst ved hvert trin', description: 'Du lander automatisk det rigtige sted, når du skifter trin eller maskine.' },
      en: { title: 'The Configurator starts at the top of each step', description: 'You land in the right place when changing step or machine.' },
      de: { title: 'Der Konfigurator startet bei jedem Schritt oben', description: 'Beim Wechsel von Schritt oder Maschine landen Sie automatisch richtig.' },
      it: { title: 'Il Configurator parte dall’alto a ogni fase', description: 'Passando a una fase o macchina arrivi automaticamente al punto giusto.' },
      hu: { title: 'A Konfigurátor minden lépésnél felül indul', description: 'Lépés- vagy gépváltáskor automatikusan a megfelelő helyre jut.' },
      sv: { title: 'Konfiguratorn börjar högst upp i varje steg', description: 'Du hamnar automatiskt rätt när du byter steg eller maskin.' },
      fr: { title: 'Le Configurateur commence en haut à chaque étape', description: 'Vous arrivez automatiquement au bon endroit en changeant d’étape ou de machine.' },
      pl: { title: 'Konfigurator zaczyna od góry na każdym kroku', description: 'Po zmianie kroku lub maszyny trafiasz automatycznie we właściwe miejsce.' },
      cs: { title: 'Konfigurátor začíná nahoře v každém kroku', description: 'Při změně kroku nebo stroje se automaticky zobrazí správné místo.' },
    },
  },
  {
    id: 'crm-budget-currency',
    pattern: /(?:crm )?budget currency normalization|budget.*(?:currency|valuta)/i,
    copy: {
      da: { title: 'Budget viser nu beløb i korrekt valuta', description: 'Ordrebeløb og totaler omregnes korrekt mellem kroner og euro.' },
      en: { title: 'Budget now shows amounts in the correct currency', description: 'Order amounts and totals are converted correctly between kroner and euros.' },
      de: { title: 'Budget zeigt Beträge jetzt in der richtigen Währung', description: 'Auftragsbeträge und Summen werden korrekt zwischen Kronen und Euro umgerechnet.' },
      it: { title: 'Il budget mostra gli importi nella valuta corretta', description: 'Importi e totali vengono convertiti correttamente tra corone ed euro.' },
      hu: { title: 'A költségvetés a helyes pénznemben jelenik meg', description: 'A rendelési összegek és végösszegek helyesen váltódnak korona és euró között.' },
      sv: { title: 'Budget visar nu belopp i rätt valuta', description: 'Orderbelopp och totaler räknas om korrekt mellan kronor och euro.' },
      fr: { title: 'Le budget affiche les montants dans la bonne devise', description: 'Les montants et totaux sont correctement convertis entre couronnes et euros.' },
      pl: { title: 'Budżet pokazuje kwoty we właściwej walucie', description: 'Kwoty zamówień i sumy są poprawnie przeliczane między koronami i euro.' },
      cs: { title: 'Rozpočet nyní zobrazuje částky ve správné měně', description: 'Částky objednávek a součty se správně převádějí mezi korunami a eury.' },
    },
  },
];

function sourceText(source: SiteFeatureSource): string {
  return `${source.title_internal || ''}\n${source.description_internal || ''}\n${source.technical_description || ''}`;
}

function matchingRule(source: SiteFeatureSource): SiteFeatureRule | undefined {
  const evidence = [source.title_internal, source.description_internal, source.technical_description]
    .map((value) => value?.trim() || '')
    .filter(Boolean);
  for (const text of evidence) {
    const rule = RULES.find((candidate) => candidate.pattern.test(text));
    if (rule) return rule;
  }
  return undefined;
}

export function resolveUserFacingSiteFeature(source: SiteFeatureSource, language: SiteFeatureLanguage) {
  const rule = matchingRule(source);
  return rule ? { id: rule.id, ...rule.copy[language] } : null;
}

export function siteFeatureTopicKey(source: SiteFeatureSource): string | null {
  const rule = matchingRule(source);
  return rule?.id || null;
}

export function resolveSiteFeatureClassification(source: SiteFeatureSource): SiteFeatureClassification | null {
  const rule = matchingRule(source);
  return rule?.classification ? { id: rule.id, ...rule.classification } : null;
}

export function isPureTechnicalSiteChange(source: SiteFeatureSource): boolean {
  if (siteFeatureTopicKey(source)) return false;
  const title = source.title_internal?.trim() || '';
  const text = sourceText(source);
  return /^(?:chore|refactor|test|docs|build|ci)(?:\([^)]+\))?:/i.test(title)
    || /\b(?:test[- ]only|tests? only|migration cleanup|dependency update|code cleanup|internal resolver|generated types?|formatting|lint(?:ing)?|ci pipeline)\b/i.test(text);
}
