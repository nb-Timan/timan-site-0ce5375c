/**
 * Sales argument generator for Timan machine quotes.
 * Writes like a human sales consultant evaluating the customer's chosen solution.
 * Solution-first, not product-by-product.
 * Fully localized: da, en, de, it, hu.
 */

import { ConfiguratorState, MachineConfig, Accessory, Language } from '@/types/configurator';
import { ACCESSORIES, getLooseToolAccessories, LOOSE_TOOL_KEY, ACC_ID_OIL_BIO, ACC_ID_WORK_LIGHT, ACC_ID_FLASH_LIGHT, ACC_ID_VPLOW, ACC_ID_WEEDBRUSH, ACC_ID_WARRANTY_1000, ACC_ID_WARRANTY_751, PRODUCTS } from '@/data/machines';

export interface SalesArgsStructured {
  heading: string;
  paragraph: string;
  defaultBullets: string[];
  extraBullets: string[];
}

export interface RecommendationStructured {
  heading: string;
  paragraph: string;
  defaultBullets: string[];
  extraBullets: string[];
}

// ─── Localized text maps ────────────────────────────────────────────────────

type L = Language;

const T = {
  selectMachines: {
    da: 'Vælg maskiner og redskaber for at generere fordele ved den valgte løsning.',
    en: 'Select machines and accessories to generate benefits of the chosen solution.',
    de: 'Wählen Sie Maschinen und Zubehör, um Vorteile der gewählten Lösung zu erstellen.',
    it: 'Seleziona macchine e accessori per generare vantaggi della soluzione scelta.',
    hu: 'Válasszon gépeket és tartozékokat a választott megoldás előnyeinek létrehozásához.',
  },
  // Headings
  headingAllYearLoose: {
    da: 'Helårsdrift med de rette redskaber',
    en: 'Year-round operation with the right tools',
    de: 'Ganzjahresbetrieb mit den richtigen Werkzeugen',
    it: 'Operatività tutto l\'anno con gli strumenti giusti',
    hu: 'Egész éves üzemelés a megfelelő eszközökkel',
  },
  headingLooseOnly: {
    da: 'De rette redskaber til jeres drift',
    en: 'The right tools for your operation',
    de: 'Die richtigen Werkzeuge für Ihren Betrieb',
    it: 'Gli strumenti giusti per la vostra attività',
    hu: 'A megfelelő eszközök az Ön üzemeltetéséhez',
  },
  headingAllYearMulti: {
    da: 'En komplet helårsløsning',
    en: 'A complete year-round solution',
    de: 'Eine komplette Ganzjahreslösung',
    it: 'Una soluzione completa per tutto l\'anno',
    hu: 'Teljes körű egész éves megoldás',
  },
  headingAllYear: {
    da: 'Klar til drift året rundt',
    en: 'Ready for year-round operation',
    de: 'Bereit für den Ganzjahresbetrieb',
    it: 'Pronti per l\'operatività tutto l\'anno',
    hu: 'Készen áll az egész éves üzemelésre',
  },
  headingMulti: {
    da: 'Maskinerne arbejder sammen',
    en: 'The machines work together',
    de: 'Die Maschinen arbeiten zusammen',
    it: 'Le macchine lavorano insieme',
    hu: 'A gépek együtt dolgoznak',
  },
  headingWinter: {
    da: 'Klar til vinteren',
    en: 'Ready for winter',
    de: 'Bereit für den Winter',
    it: 'Pronti per l\'inverno',
    hu: 'Készen áll a télre',
  },
  headingDefault: {
    da: 'Den rigtige løsning til opgaven',
    en: 'The right solution for the job',
    de: 'Die richtige Lösung für die Aufgabe',
    it: 'La soluzione giusta per il lavoro',
    hu: 'A megfelelő megoldás a feladathoz',
  },
  // Loose tool labels
  looseToolsLabel: {
    da: 'de valgte løse redskaber',
    en: 'the selected loose tools',
    de: 'die ausgewählten losen Werkzeuge',
    it: 'gli utensili sfusi selezionati',
    hu: 'a kiválasztott különálló szerszámok',
  },
  supplementaryLooseTools: {
    da: 'supplerende løse redskaber',
    en: 'supplementary loose tools',
    de: 'ergänzende lose Werkzeuge',
    it: 'utensili sfusi supplementari',
    hu: 'kiegészítő különálló szerszámok',
  },
  and: { da: ' og ', en: ' and ', de: ' und ', it: ' e ', hu: ' és ' },
  // ── Paragraph templates ──────────────────────────────────────────────
  paraLooseAllYear: {
    da: (count: number) => `I har sammensat ${count} redskaber, der tilsammen giver jeres eksisterende maskinpark et markant løft – fra sommerdrift til vinterberedskab. Det er et velovervejet valg, fordi I undgår at investere i nye maskiner og i stedet udnytter det, I allerede har, langt bedre.`,
    en: (count: number) => `You have assembled ${count} tools that together give your existing fleet a significant boost – from summer operation to winter readiness. It's a well-considered choice, because you avoid investing in new machines and instead make much better use of what you already have.`,
    de: (count: number) => `Sie haben ${count} Werkzeuge zusammengestellt, die Ihrem bestehenden Maschinenpark gemeinsam einen deutlichen Schub verleihen – vom Sommerbetrieb bis zur Winterbereitschaft. Eine durchdachte Wahl, da Sie keine neuen Maschinen anschaffen müssen und stattdessen das, was Sie bereits haben, viel besser nutzen.`,
    it: (count: number) => `Avete selezionato ${count} strumenti che insieme danno un impulso significativo al vostro parco macchine esistente – dall'operatività estiva alla preparazione invernale. È una scelta ponderata, perché evitate di investire in nuove macchine e sfruttate molto meglio ciò che già avete.`,
    hu: (count: number) => `Összesen ${count} szerszámot állított össze, amelyek együttesen jelentős lökést adnak meglévő gépállományának – a nyári üzemeltetéstől a téli felkészültségig. Ez egy átgondolt döntés, mert elkerüli az új gépekbe való befektetést, és sokkal jobban kihasználja a meglévőket.`,
  },
  paraLooseGreen: {
    da: 'De redskaber, I har valgt, passer præcist til den daglige drift og gør jeres nuværende maskiner mere alsidige. Det er et klogt valg, fordi I får mere kapacitet uden at binde kapital i nyt materiel.',
    en: 'The tools you have selected fit precisely into your daily operations and make your current machines more versatile. A smart choice, because you gain more capacity without tying up capital in new equipment.',
    de: 'Die von Ihnen gewählten Werkzeuge passen genau in den täglichen Betrieb und machen Ihre aktuellen Maschinen vielseitiger. Eine kluge Wahl, da Sie mehr Kapazität gewinnen, ohne Kapital in neue Ausrüstung zu binden.',
    it: 'Gli strumenti selezionati si adattano perfettamente alle operazioni quotidiane e rendono le vostre macchine attuali più versatili. Una scelta intelligente, perché ottenete più capacità senza immobilizzare capitale in nuove attrezzature.',
    hu: 'A kiválasztott szerszámok pontosan illeszkednek a napi üzemeltetésbe, és sokoldalúbbá teszik jelenlegi gépeit. Okos választás, mert több kapacitást nyer anélkül, hogy tőkét kötne le új felszerelésben.',
  },
  paraLooseDefault: {
    da: 'I har udvalgt redskaber, der rammer lige præcis de opgaver, I skal have løst. Det er en fokuseret tilgang, der sikrer, at hver investering gør en konkret forskel i hverdagen.',
    en: 'You have selected tools that hit exactly the tasks you need to solve. It is a focused approach that ensures every investment makes a real difference in daily operations.',
    de: 'Sie haben Werkzeuge ausgewählt, die genau die Aufgaben treffen, die Sie lösen müssen. Ein fokussierter Ansatz, der sicherstellt, dass jede Investition im Alltag einen konkreten Unterschied macht.',
    it: 'Avete selezionato strumenti che colpiscono esattamente i compiti che dovete risolvere. Un approccio mirato che garantisce che ogni investimento faccia una differenza concreta nelle operazioni quotidiane.',
    hu: 'Olyan szerszámokat választott, amelyek pontosan azokat a feladatokat célozzák meg, amelyeket meg kell oldania. Ez egy célzott megközelítés, amely biztosítja, hogy minden befektetés valós különbséget tegyen a napi működésben.',
  },
  paraAllYearMulti: {
    da: (ml: string) => `Det her er en gennemtænkt pakke. Med ${ml} har I sat en løsning sammen, der fungerer på tværs af alle sæsoner – og det gør en stor forskel for den samlede driftsøkonomi, fordi maskinerne er i arbejde hele året.`,
    en: (ml: string) => `This is a well-thought-out package. With ${ml} you have put together a solution that works across all seasons – and that makes a big difference to the overall operating economy, because the machines are working all year.`,
    de: (ml: string) => `Dies ist ein durchdachtes Paket. Mit ${ml} haben Sie eine Lösung zusammengestellt, die über alle Jahreszeiten funktioniert – und das macht einen großen Unterschied für die gesamte Betriebswirtschaft, weil die Maschinen das ganze Jahr arbeiten.`,
    it: (ml: string) => `Questo è un pacchetto ben studiato. Con ${ml} avete messo insieme una soluzione che funziona in tutte le stagioni – e questo fa una grande differenza per l'economia operativa complessiva, perché le macchine lavorano tutto l'anno.`,
    hu: (ml: string) => `Ez egy átgondolt csomag. A(z) ${ml} segítségével egy olyan megoldást állított össze, amely minden évszakban működik – és ez nagy különbséget jelent az összesített üzemi gazdaságosságban, mert a gépek egész évben dolgoznak.`,
  },
  paraMulti: {
    da: (ml: string) => `I har valgt en pakke med ${ml}, hvor maskinerne supplerer hinanden godt. I stedet for overlap får I bred dækning med færre enheder – og det mærkes både på fleksibiliteten og på bundlinjen.`,
    en: (ml: string) => `You have chosen a package with ${ml}, where the machines complement each other well. Instead of overlap you get broad coverage with fewer units – and that shows in both flexibility and the bottom line.`,
    de: (ml: string) => `Sie haben ein Paket mit ${ml} gewählt, bei dem sich die Maschinen gut ergänzen. Statt Überlappung erhalten Sie breite Abdeckung mit weniger Einheiten – und das zeigt sich sowohl bei der Flexibilität als auch beim Ergebnis.`,
    it: (ml: string) => `Avete scelto un pacchetto con ${ml}, dove le macchine si completano a vicenda. Invece di sovrapposizioni ottenete un'ampia copertura con meno unità – e questo si riflette sia nella flessibilità che nel risultato finale.`,
    hu: (ml: string) => `Választott egy csomagot a(z) ${ml} gépekkel, ahol a gépek jól kiegészítik egymást. Átfedés helyett széles lefedettséget kap kevesebb egységgel – és ez megmutatkozik mind a rugalmasságban, mind az eredményben.`,
  },
  paraAllYearSingle: {
    da: (ml: string) => `Med den her konfiguration af ${ml} har I en maskine, der ikke kun løser én opgave – den arbejder for jer hele året rundt. Det er en af de mest fornuftige tilgange, fordi den årlige udnyttelsesgrad bliver markant højere.`,
    en: (ml: string) => `With this configuration of ${ml} you have a machine that doesn't just solve one task – it works for you all year round. It is one of the most sensible approaches, because the annual utilization rate becomes significantly higher.`,
    de: (ml: string) => `Mit dieser Konfiguration von ${ml} haben Sie eine Maschine, die nicht nur eine Aufgabe löst – sie arbeitet das ganze Jahr für Sie. Es ist einer der sinnvollsten Ansätze, da die jährliche Auslastung deutlich höher wird.`,
    it: (ml: string) => `Con questa configurazione di ${ml} avete una macchina che non risolve solo un compito – lavora per voi tutto l'anno. È uno degli approcci più sensati, perché il tasso di utilizzo annuale diventa significativamente più alto.`,
    hu: (ml: string) => `Ezzel a(z) ${ml} konfigurációval egy olyan gépe van, amely nemcsak egy feladatot old meg – egész évben dolgozik Önnek. Ez az egyik legésszerűbb megközelítés, mert az éves kihasználtsági ráta jelentősen magasabb lesz.`,
  },
  paraDefault: {
    da: (ml: string) => `${ml} er sat sammen med redskaber, der er valgt med omtanke. Det er tydeligt, at der er tænkt over, hvilke opgaver der skal løses – og det giver en løsning, der føles rigtig fra dag ét.`,
    en: (ml: string) => `${ml} is put together with tools chosen with care. It is clear that thought has gone into which tasks need to be solved – and that gives a solution that feels right from day one.`,
    de: (ml: string) => `${ml} ist mit sorgfältig ausgewählten Werkzeugen zusammengestellt. Es ist klar, dass über die zu lösenden Aufgaben nachgedacht wurde – und das ergibt eine Lösung, die sich vom ersten Tag an richtig anfühlt.`,
    it: (ml: string) => `${ml} è stato assemblato con strumenti scelti con cura. È chiaro che si è pensato a quali compiti devono essere risolti – e questo dà una soluzione che sembra giusta fin dal primo giorno.`,
    hu: (ml: string) => `A(z) ${ml} gondosan kiválasztott szerszámokkal van összeállítva. Nyilvánvaló, hogy átgondolták, mely feladatokat kell megoldani – és ez egy olyan megoldást ad, amely az első naptól jól működik.`,
  },
  // Machine roles
  machineRoles: {
    'RC-1000S': {
      da: 'den fjernbetjente RC-1000s tager sig af de krævende opgaver i terræn og på skråninger, hvor traditionelle maskiner ikke kan komme til',
      en: 'the remote-controlled RC-1000s handles demanding tasks on terrain and slopes where traditional machines cannot reach',
      de: 'die ferngesteuerte RC-1000s übernimmt die anspruchsvollen Aufgaben im Gelände und an Hängen, wo herkömmliche Maschinen nicht hinkommen',
      it: 'l\'RC-1000s telecomandato gestisce compiti impegnativi su terreni e pendii dove le macchine tradizionali non possono arrivare',
      hu: 'a távirányítású RC-1000s kezeli az igényes feladatokat terepen és lejtőkön, ahová a hagyományos gépek nem jutnak el',
    },
    'RC-751': {
      da: 'RC-751 arbejder sikkert og præcist på skråninger og svært tilgængelige arealer',
      en: 'RC-751 works safely and precisely on slopes and hard-to-reach areas',
      de: 'RC-751 arbeitet sicher und präzise an Hängen und schwer zugänglichen Bereichen',
      it: 'RC-751 lavora in modo sicuro e preciso su pendii e aree difficili da raggiungere',
      hu: 'az RC-751 biztonságosan és precízen dolgozik lejtőkön és nehezen megközelíthető területeken',
    },
    'Timan 3330': {
      da: 'Timan 3330 håndterer de daglige driftsopgaver fra førerkabinen med hurtige redskabsskift',
      en: 'Timan 3330 handles daily operational tasks from the cab with quick tool changes',
      de: 'Timan 3330 erledigt die täglichen Betriebsaufgaben aus der Kabine mit schnellem Werkzeugwechsel',
      it: 'Timan 3330 gestisce le attività operative quotidiane dalla cabina con rapidi cambi utensile',
      hu: 'a Timan 3330 a fülkéből kezeli a napi üzemeltetési feladatokat gyors szerszámcserével',
    },
    [LOOSE_TOOL_KEY]: {
      da: 'de valgte løse redskaber udvider kapaciteten på den eksisterende maskinpark med præcist de funktioner, der mangler',
      en: 'the selected loose tools expand the capacity of the existing fleet with precisely the functions that are missing',
      de: 'die ausgewählten losen Werkzeuge erweitern die Kapazität des bestehenden Maschinenparks mit genau den fehlenden Funktionen',
      it: 'gli utensili sfusi selezionati ampliano la capacità del parco macchine esistente con esattamente le funzioni mancanti',
      hu: 'a kiválasztott különálló szerszámok pontosan azokkal a funkciókkal bővítik a meglévő gépállomány kapacitását, amelyek hiányoznak',
    },
  } as Record<string, Record<L, string>>,
  // Role connector
  roleConnector: {
    da: ', mens ',
    en: ', while ',
    de: ', während ',
    it: ', mentre ',
    hu: ', miközben ',
  },
  roleOutro: {
    da: ' – og tilsammen dækker de et bredere opgavespektrum, end hver maskine ville kunne alene.',
    en: ' – and together they cover a broader range of tasks than each machine could alone.',
    de: ' – und zusammen decken sie ein breiteres Aufgabenspektrum ab, als jede Maschine allein könnte.',
    it: ' – e insieme coprono una gamma di compiti più ampia di quanto ogni macchina potrebbe da sola.',
    hu: ' – és együtt szélesebb feladatkört fednek le, mint amennyit minden gép önmagában tudna.',
  },
  roleIntro: {
    da: 'I praksis betyder det, at ',
    en: 'In practice, this means that ',
    de: 'In der Praxis bedeutet das, dass ',
    it: 'In pratica, questo significa che ',
    hu: 'A gyakorlatban ez azt jelenti, hogy ',
  },
  // Task mentions
  taskBothVeg: {
    da: 'både grov vegetation og præcis græspleje',
    en: 'both rough vegetation and precise lawn care',
    de: 'sowohl grobe Vegetation als auch präzise Rasenpflege',
    it: 'sia vegetazione grossa che cura precisa del prato',
    hu: 'mind a durva növényzet, mind a precíz gyepápolás',
  },
  taskRoughVeg: {
    da: 'grov vegetation og tilgroede arealer',
    en: 'rough vegetation and overgrown areas',
    de: 'grobe Vegetation und zugewachsene Flächen',
    it: 'vegetazione grossa e aree incolte',
    hu: 'durva növényzet és elvadult területek',
  },
  taskFineVeg: {
    da: 'ensartet og præcis græspleje',
    en: 'uniform and precise lawn care',
    de: 'gleichmäßige und präzise Rasenpflege',
    it: 'cura del prato uniforme e precisa',
    hu: 'egységes és precíz gyepápolás',
  },
  taskTrimming: {
    da: 'hæk- og kantbeskæring',
    en: 'hedge and edge trimming',
    de: 'Hecken- und Kantenschnitt',
    it: 'taglio siepi e bordi',
    hu: 'sövény- és szegélynyírás',
  },
  taskWeed: {
    da: 'renholdelse og mekanisk ukrudtsbekæmpelse uden sprøjtemidler',
    en: 'cleaning and mechanical weed control without herbicides',
    de: 'Reinigung und mechanische Unkrautbekämpfung ohne Herbizide',
    it: 'pulizia e controllo meccanico delle erbacce senza erbicidi',
    hu: 'takarítás és mechanikus gyomirtás vegyszerek nélkül',
  },
  taskSweeping: {
    da: 'fejning og renholdelse af stier og pladser',
    en: 'sweeping and cleaning of paths and squares',
    de: 'Kehren und Reinigung von Wegen und Plätzen',
    it: 'spazzamento e pulizia di sentieri e piazze',
    hu: 'utak és terek seprése és takarítása',
  },
  taskSnowClearing: {
    da: 'snerydning',
    en: 'snow clearing',
    de: 'Schneeräumung',
    it: 'sgombero neve',
    hu: 'hóeltakarítás',
  },
  taskDeIcing: {
    da: 'glatførebekæmpelse',
    en: 'de-icing',
    de: 'Glättebekämpfung',
    it: 'spargimento sale',
    hu: 'síkosságmentesítés',
  },
  taskStump: {
    da: 'fjernelse af stubbe',
    en: 'stump removal',
    de: 'Stubbenfräsen',
    it: 'rimozione ceppi',
    hu: 'tuskóeltávolítás',
  },
  taskDailyUse: {
    da: (joined: string, allYear: boolean) => `I hverdagen betyder det, at I kan håndtere ${joined} uden at skulle ud og leje eller hente ekstra materiel${allYear ? ' – uanset sæson' : ''}.`,
    en: (joined: string, allYear: boolean) => `In practice, this means you can handle ${joined} without having to rent or fetch additional equipment${allYear ? ' – regardless of season' : ''}.`,
    de: (joined: string, allYear: boolean) => `Im Alltag bedeutet das, dass Sie ${joined} bewältigen können, ohne zusätzliche Ausrüstung mieten oder holen zu müssen${allYear ? ' – unabhängig von der Jahreszeit' : ''}.`,
    it: (joined: string, allYear: boolean) => `Nella pratica, ciò significa che potete gestire ${joined} senza dover noleggiare o procurare attrezzature aggiuntive${allYear ? ' – indipendentemente dalla stagione' : ''}.`,
    hu: (joined: string, allYear: boolean) => `A gyakorlatban ez azt jelenti, hogy kezelni tudja ${joined} anélkül, hogy további felszerelést kellene bérelnie vagy beszereznie${allYear ? ' – évszaktól függetlenül' : ''}.`,
  },
  // Comfort
  comfortMulti: {
    da: (parts: string) => `Det er også værd at bemærke, at I har tænkt på operatøren – ${parts} gør en reel forskel på lange arbejdsdage og bidrager til, at folk faktisk trives med at køre maskinen.`,
    en: (parts: string) => `It is also worth noting that you have thought about the operator – ${parts} makes a real difference on long working days and helps people actually enjoy operating the machine.`,
    de: (parts: string) => `Es ist auch erwähnenswert, dass Sie an den Bediener gedacht haben – ${parts} macht einen echten Unterschied an langen Arbeitstagen und trägt dazu bei, dass die Leute die Maschine gerne bedienen.`,
    it: (parts: string) => `Vale anche la pena notare che avete pensato all'operatore – ${parts} fa una differenza reale nelle lunghe giornate lavorative e aiuta le persone a godersi effettivamente l'uso della macchina.`,
    hu: (parts: string) => `Érdemes megjegyezni, hogy gondolt a kezelőre is – ${parts} valódi különbséget jelent a hosszú munkanapokon, és segít abban, hogy az emberek valóban élvezzék a gép üzemeltetését.`,
  },
  comfortSingle: {
    da: (part: string) => `Valget af ${part} er en detalje, der gør hverdagen bedre for den, der sidder i maskinen – og det smitter af på effektiviteten.`,
    en: (part: string) => `The choice of ${part} is a detail that makes everyday life better for the operator – and that has a positive effect on efficiency.`,
    de: (part: string) => `Die Wahl von ${part} ist ein Detail, das den Alltag für den Bediener verbessert – und das wirkt sich positiv auf die Effizienz aus.`,
    it: (part: string) => `La scelta di ${part} è un dettaglio che migliora la vita quotidiana dell'operatore – e questo ha un effetto positivo sull'efficienza.`,
    hu: (part: string) => `A(z) ${part} választása olyan részlet, amely jobbá teszi a kezelő mindennapi életét – és ez pozitívan hat a hatékonyságra.`,
  },
  bioOil: {
    da: 'At I har valgt bio-hydraulikolie viser, at miljø og bæredygtighed er en del af jeres tilgang – det er noget, der også vejer positivt over for kommuner og borgere.',
    en: 'Choosing bio-hydraulic oil shows that the environment and sustainability are part of your approach – something that also weighs positively with municipalities and citizens.',
    de: 'Die Wahl von Bio-Hydrauliköl zeigt, dass Umwelt und Nachhaltigkeit Teil Ihres Ansatzes sind – etwas, das auch bei Kommunen und Bürgern positiv ins Gewicht fällt.',
    it: 'La scelta dell\'olio idraulico bio dimostra che l\'ambiente e la sostenibilità fanno parte del vostro approccio – qualcosa che pesa positivamente anche presso comuni e cittadini.',
    hu: 'A bio-hidraulikaolaj választása azt mutatja, hogy a környezet és a fenntarthatóság része az Ön megközelítésének – ami pozitívan hat az önkormányzatokra és a polgárokra is.',
  },
  // Bullets
  bulletAllYear: {
    da: 'Løsningen er aktiv hele året – og det giver en markant bedre driftsøkonomi end maskiner, der kun bruges i én sæson',
    en: 'The solution is active all year – resulting in significantly better operating economy than machines used only one season',
    de: 'Die Lösung ist das ganze Jahr aktiv – das ergibt eine deutlich bessere Betriebswirtschaft als Maschinen, die nur eine Saison genutzt werden',
    it: 'La soluzione è attiva tutto l\'anno – con un\'economia operativa notevolmente migliore rispetto alle macchine utilizzate solo una stagione',
    hu: 'A megoldás egész évben aktív – ez jelentősen jobb üzemi gazdaságosságot eredményez, mint a csak egy évszakban használt gépek',
  },
  bulletBreadth: {
    da: 'Bredden i redskabsvalget giver fleksibilitet til at skifte mellem opgavetyper uden ekstra materiel',
    en: 'The breadth of tool selection provides flexibility to switch between task types without additional equipment',
    de: 'Die Breite der Werkzeugauswahl bietet Flexibilität, um ohne zusätzliche Ausrüstung zwischen Aufgabentypen zu wechseln',
    it: 'L\'ampiezza della selezione di strumenti offre flessibilità per passare tra tipi di attività senza attrezzature aggiuntive',
    hu: 'A szerszámválaszték szélessége rugalmasságot biztosít a feladattípusok közötti váltáshoz kiegészítő felszerelés nélkül',
  },
  bulletPrecise: {
    da: 'Maskine og redskaber er afstemt præcist til opgaven – ingen overkapacitet, ingen mangler',
    en: 'Machine and tools are precisely matched to the task – no overcapacity, no shortcomings',
    de: 'Maschine und Werkzeuge sind genau auf die Aufgabe abgestimmt – keine Überkapazität, keine Mängel',
    it: 'Macchina e strumenti sono calibrati con precisione per il compito – nessuna sovracapacità, nessuna carenza',
    hu: 'A gép és a szerszámok pontosan illeszkednek a feladathoz – nincs túlkapacitás, nincs hiányosság',
  },
  bulletSeasonSwitch: {
    da: 'Skiftet mellem sommer- og vinterdrift sker hurtigt, så I er klar, når vejret skifter',
    en: 'Switching between summer and winter operation is fast, so you are ready when the weather changes',
    de: 'Der Wechsel zwischen Sommer- und Winterbetrieb geht schnell, sodass Sie bereit sind, wenn das Wetter umschlägt',
    it: 'Il passaggio tra operatività estiva e invernale è rapido, così siete pronti quando il tempo cambia',
    hu: 'A nyári és téli üzemelés közötti váltás gyors, így készen áll, amikor az időjárás változik',
  },
  bulletWinterReady: {
    da: 'Vinterberedskabet er på plads, og I kan rykke med kort varsel, når frosten melder sig',
    en: 'Winter preparedness is in place, and you can respond at short notice when frost arrives',
    de: 'Die Winterbereitschaft steht, und Sie können kurzfristig reagieren, wenn der Frost kommt',
    it: 'La preparazione invernale è pronta, e potete intervenire con breve preavviso quando arriva il gelo',
    hu: 'A téli felkészültség biztosított, és rövid időn belül reagálhat, amikor beköszönt a fagy',
  },
  bulletGreenSweep: {
    da: 'Grøn pleje og renholdelse håndteres med samme maskine – det sparer tid, transport og mandskab',
    en: 'Green care and cleaning are handled by the same machine – saving time, transport and manpower',
    de: 'Grünpflege und Reinigung werden mit derselben Maschine erledigt – das spart Zeit, Transport und Personal',
    it: 'Cura del verde e pulizia vengono gestite dalla stessa macchina – risparmiando tempo, trasporto e personale',
    hu: 'A zöldterület-ápolás és a takarítás ugyanazzal a géppel történik – időt, szállítást és munkaerőt takarít meg',
  },
  bulletComfort: {
    da: 'Komfortudstyret sikrer bedre arbejdsmiljø og gør det lettere at fastholde dygtige operatører',
    en: 'Comfort equipment ensures a better working environment and makes it easier to retain skilled operators',
    de: 'Komfortausstattung sorgt für ein besseres Arbeitsumfeld und erleichtert es, qualifizierte Bediener zu halten',
    it: 'L\'equipaggiamento comfort assicura un ambiente di lavoro migliore e facilita il mantenimento di operatori qualificati',
    hu: 'A komfortfelszerelés jobb munkakörnyezetet biztosít, és megkönnyíti a képzett kezelők megtartását',
  },
  bulletCamera: {
    da: 'Kameraet giver overblik og tryghed ved bakning – en sikkerhedsdetalje, der hurtigt bliver uundværlig',
    en: 'The camera provides overview and safety when reversing – a safety detail that quickly becomes indispensable',
    de: 'Die Kamera bietet Überblick und Sicherheit beim Rückwärtsfahren – ein Sicherheitsdetail, das schnell unverzichtbar wird',
    it: 'La telecamera offre visibilità e sicurezza in retromarcia – un dettaglio di sicurezza che diventa rapidamente indispensabile',
    hu: 'A kamera áttekinthetőséget és biztonságot nyújt tolatáskor – egy biztonsági részlet, amely gyorsan nélkülözhetetlenné válik',
  },
  bulletBioOil: {
    da: 'Bio-hydraulikolie understøtter en grønnere driftsprofil og er et godt signal over for kunder og borgere',
    en: 'Bio-hydraulic oil supports a greener operational profile and sends a positive signal to customers and citizens',
    de: 'Bio-Hydrauliköl unterstützt ein grüneres Betriebsprofil und ist ein gutes Signal gegenüber Kunden und Bürgern',
    it: 'L\'olio idraulico bio supporta un profilo operativo più verde ed è un buon segnale per clienti e cittadini',
    hu: 'A bio-hidraulikaolaj zöldebb üzemeltetési profilt támogat, és pozitív jelzést küld az ügyfeleknek és a polgároknak',
  },
  bulletChassis: {
    da: 'Konservering af chassis beskytter mod rust og korrosion – en lille investering, der forlænger maskinens levetid markant',
    en: 'Chassis preservation protects against rust and corrosion – a small investment that significantly extends machine life',
    de: 'Fahrgestellkonservierung schützt vor Rost und Korrosion – eine kleine Investition, die die Maschinenlebensdauer deutlich verlängert',
    it: 'La conservazione del telaio protegge da ruggine e corrosione – un piccolo investimento che prolunga significativamente la vita della macchina',
    hu: 'Az alvázvédelem véd a rozsda és a korrózió ellen – kis befektetés, amely jelentősen meghosszabbítja a gép élettartamát',
  },
  bulletTow: {
    da: 'Muligheden for at trække tilhænger giver ekstra fleksibilitet i hverdagen',
    en: 'The ability to tow a trailer provides extra flexibility in daily operations',
    de: 'Die Möglichkeit, einen Anhänger zu ziehen, bietet zusätzliche Flexibilität im Alltag',
    it: 'La possibilità di trainare un rimorchio offre flessibilità extra nelle operazioni quotidiane',
    hu: 'A pótkocsi vontatásának lehetősége extra rugalmasságot biztosít a napi üzemeltetésben',
  },
  // Filler bullets (functions taking isLooseOnly, isMulti, isAllYear)
  fillerTools: {
    da: (loose: boolean, multi: boolean) => loose ? 'Redskaberne passer direkte til den eksisterende maskinpark – ingen yderligere investeringer nødvendige' : (multi ? 'Maskinerne supplerer hinanden – og det giver en sammenhængende løsning med høj udnyttelse' : 'En enkel og fokuseret løsning, der er hurtig at sætte i drift og let at vedligeholde'),
    en: (loose: boolean, multi: boolean) => loose ? 'The tools fit directly into the existing fleet – no further investments needed' : (multi ? 'The machines complement each other – creating a coherent solution with high utilization' : 'A simple, focused solution that is quick to deploy and easy to maintain'),
    de: (loose: boolean, multi: boolean) => loose ? 'Die Werkzeuge passen direkt zum bestehenden Maschinenpark – keine weiteren Investitionen nötig' : (multi ? 'Die Maschinen ergänzen sich – und ergeben eine zusammenhängende Lösung mit hoher Auslastung' : 'Eine einfache, fokussierte Lösung, die schnell einsatzbereit und leicht zu warten ist'),
    it: (loose: boolean, multi: boolean) => loose ? 'Gli strumenti si adattano direttamente al parco macchine esistente – nessun ulteriore investimento necessario' : (multi ? 'Le macchine si completano a vicenda – creando una soluzione coerente con alta utilizzazione' : 'Una soluzione semplice e mirata, rapida da implementare e facile da mantenere'),
    hu: (loose: boolean, multi: boolean) => loose ? 'A szerszámok közvetlenül illeszkednek a meglévő gépállományba – nincs szükség további befektetésre' : (multi ? 'A gépek kiegészítik egymást – összefüggő, magas kihasználtságú megoldást alkotva' : 'Egyszerű, célzott megoldás, amely gyorsan üzembe helyezhető és könnyen karbantartható'),
  },
  fillerQuickStart: {
    da: 'Hurtig ibrugtagning – løsningen kan sættes i drift uden lang indkøring eller specialtræning',
    en: 'Quick deployment – the solution can be put into operation without lengthy training or specialization',
    de: 'Schnelle Inbetriebnahme – die Lösung kann ohne lange Einarbeitung oder Spezialschulung in Betrieb genommen werden',
    it: 'Avvio rapido – la soluzione può essere messa in funzione senza lunghi addestramenti o specializzazioni',
    hu: 'Gyors üzembe helyezés – a megoldás hosszú betanulás vagy speciális képzés nélkül üzembe helyezhető',
  },
  fillerQuickChange: {
    da: 'Redskaberne skiftes hurtigt, og det reducerer spildtid mellem opgaver',
    en: 'Tools are changed quickly, reducing wasted time between tasks',
    de: 'Werkzeuge werden schnell gewechselt, was die Leerlaufzeit zwischen Aufgaben reduziert',
    it: 'Gli strumenti vengono cambiati rapidamente, riducendo i tempi morti tra le attività',
    hu: 'A szerszámcserék gyorsak, csökkentve a feladatok közötti holtidőt',
  },
  fillerReliable: {
    da: 'Driftssikker teknik med lav vedligeholdelse og lang levetid',
    en: 'Reliable technology with low maintenance and long service life',
    de: 'Zuverlässige Technik mit geringem Wartungsaufwand und langer Lebensdauer',
    it: 'Tecnologia affidabile con bassa manutenzione e lunga durata',
    hu: 'Megbízható technológia alacsony karbantartással és hosszú élettartammal',
  },
  fillerFuel: {
    da: 'Lavt brændstofforbrug sammenlignet med traditionelle løsninger af samme kapacitet',
    en: 'Low fuel consumption compared to traditional solutions of the same capacity',
    de: 'Geringer Kraftstoffverbrauch im Vergleich zu herkömmlichen Lösungen gleicher Kapazität',
    it: 'Basso consumo di carburante rispetto alle soluzioni tradizionali della stessa capacità',
    hu: 'Alacsony üzemanyag-fogyasztás az azonos kapacitású hagyományos megoldásokhoz képest',
  },
  fillerSafety: {
    da: 'Fjernbetjening eller kabinekomfort giver sikkerhed og effektivitet i krævende terræn',
    en: 'Remote control or cabin comfort provides safety and efficiency in demanding terrain',
    de: 'Fernsteuerung oder Kabinenkomfort bieten Sicherheit und Effizienz in anspruchsvollem Gelände',
    it: 'Telecomando o comfort della cabina offrono sicurezza ed efficienza in terreni impegnativi',
    hu: 'A távirányítás vagy a fülkekomfort biztonságot és hatékonyságot biztosít igényes terepen',
  },
  fillerCompact: {
    da: 'Kompakt maskinstørrelse giver adgang til smalle stier og tætte beplantninger',
    en: 'Compact machine size provides access to narrow paths and dense plantings',
    de: 'Kompakte Maschinengröße ermöglicht Zugang zu schmalen Wegen und dichten Bepflanzungen',
    it: 'Le dimensioni compatte della macchina consentono l\'accesso a sentieri stretti e piantagioni dense',
    hu: 'A kompakt gépméret hozzáférést biztosít keskeny utakhoz és sűrű ültetvényekhez',
  },
  fillerService: {
    da: 'Stærk service- og reservedelsforsyning fra Timan sikrer minimal nedetid',
    en: 'Strong service and spare parts supply from Timan ensures minimal downtime',
    de: 'Starke Service- und Ersatzteilversorgung von Timan sorgt für minimale Ausfallzeiten',
    it: 'Un forte servizio e approvvigionamento di ricambi da Timan garantisce tempi di fermo minimi',
    hu: 'A Timan erős szerviz- és alkatrészellátása minimális állásidőt biztosít',
  },
  fillerExpandable: {
    da: 'Mulighed for at udvide med yderligere redskaber efterhånden som behovet vokser',
    en: 'Option to expand with additional tools as needs grow',
    de: 'Möglichkeit zur Erweiterung mit zusätzlichen Werkzeugen, wenn der Bedarf wächst',
    it: 'Possibilità di espandere con strumenti aggiuntivi man mano che le esigenze crescono',
    hu: 'Lehetőség a bővítésre további szerszámokkal, ahogy az igények növekednek',
  },
  fillerUtilization: {
    da: (allYear: boolean) => allYear ? 'Helårsdrift giver højere udnyttelsesgrad og bedre totaløkonomi' : 'Fokuseret løsning med høj udnyttelsesgrad inden for det valgte arbejdsområde',
    en: (allYear: boolean) => allYear ? 'Year-round operation gives higher utilization and better total economy' : 'Focused solution with high utilization within the chosen work area',
    de: (allYear: boolean) => allYear ? 'Ganzjahresbetrieb ergibt höhere Auslastung und bessere Gesamtwirtschaftlichkeit' : 'Fokussierte Lösung mit hoher Auslastung im gewählten Arbeitsbereich',
    it: (allYear: boolean) => allYear ? 'L\'operatività tutto l\'anno offre maggiore utilizzo e migliore economia complessiva' : 'Soluzione mirata con alto utilizzo nell\'area di lavoro scelta',
    hu: (allYear: boolean) => allYear ? 'Az egész éves üzemelés magasabb kihasználtságot és jobb összgazdaságosságot eredményez' : 'Célzott megoldás magas kihasználtsággal a választott munkaterületen belül',
  },
  // Recommendation section
  recHeading: {
    da: 'Det ville vi anbefale herfra',
    en: 'What we would recommend from here',
    de: 'Das würden wir von hier aus empfehlen',
    it: 'Ecco cosa raccomanderemmo da qui',
    hu: 'Ezt ajánlanánk innen',
  },
  recCountOne: { da: 'én ting', en: 'one thing', de: 'eine Sache', it: 'una cosa', hu: 'egy dolog' },
  recCountTwo: { da: 'et par ting', en: 'a couple of things', de: 'ein paar Dinge', it: 'un paio di cose', hu: 'néhány dolog' },
  recCountFew: { da: 'nogle få ting', en: 'a few things', de: 'einige Dinge', it: 'alcune cose', hu: 'néhány dolog' },
  recPara: {
    da: (subj: string, countWord: string) => `I har allerede sat en stærk løsning sammen med ${subj}, og der er tydeligvis tænkt over, hvad der skal til. Når vi kigger på den samlede konfiguration, er der dog ${countWord}, vi typisk vil anbefale ud fra vores erfaring med lignende opsætninger – ikke fordi der mangler noget afgørende, men fordi det kan gøre en mærkbar forskel i den daglige drift.`,
    en: (subj: string, countWord: string) => `You have already put together a strong solution with ${subj}, and it's clear that thought has gone into what is needed. Looking at the overall configuration, there are ${countWord} we would typically recommend based on our experience with similar setups – not because anything essential is missing, but because it can make a noticeable difference in daily operations.`,
    de: (subj: string, countWord: string) => `Sie haben bereits eine starke Lösung mit ${subj} zusammengestellt, und es ist klar, dass überlegt wurde, was nötig ist. Bei Betrachtung der Gesamtkonfiguration gibt es ${countWord}, die wir typischerweise aufgrund unserer Erfahrung mit ähnlichen Konfigurationen empfehlen würden – nicht weil etwas Wesentliches fehlt, sondern weil es im täglichen Betrieb einen spürbaren Unterschied machen kann.`,
    it: (subj: string, countWord: string) => `Avete già messo insieme una soluzione solida con ${subj}, ed è chiaro che si è pensato a ciò che serve. Guardando la configurazione complessiva, ci sono ${countWord} che raccomanderemmo tipicamente in base alla nostra esperienza con configurazioni simili – non perché manchi qualcosa di essenziale, ma perché può fare una differenza notevole nelle operazioni quotidiane.`,
    hu: (subj: string, countWord: string) => `Már összeállított egy erős megoldást a(z) ${subj} segítségével, és nyilvánvaló, hogy átgondolták, mire van szükség. Az összesített konfigurációt tekintve van ${countWord}, amelyet hasonló összeállításokkal szerzett tapasztalataink alapján jellemzően ajánlanánk – nem azért, mert valami lényeges hiányzik, hanem mert észrevehető különbséget tehet a napi működésben.`,
  },
  // Recommendation rule labels & reasons (keyed by original Danish label)
  recLabels: {} as Record<string, Record<L, string>>,
  recReasons: {} as Record<string, Record<L, string>>,
};

// ─── Recommendation rule translations ────────────────────────────────────
// We build localized labels/reasons for recommendation rules

const REC_RULE_TRANSLATIONS: Array<{
  labelDa: string;
  label: Record<L, string>;
  reason: Record<L, string>;
}> = [
  {
    labelDa: 'Arbejdslamper til RC-1000s',
    label: { da: 'Arbejdslamper til RC-1000s', en: 'Work lights for RC-1000s', de: 'Arbeitsleuchten für RC-1000s', it: 'Luci di lavoro per RC-1000s', hu: 'Munkalámpák RC-1000s-hez' },
    reason: {
      da: 'gør det muligt at arbejde sikkert i dårlig belysning og forlænger den effektive arbejdsdag markant, især i de mørke vintermåneder',
      en: 'enables safe work in poor lighting and significantly extends the effective working day, especially during dark winter months',
      de: 'ermöglicht sicheres Arbeiten bei schlechter Beleuchtung und verlängert den effektiven Arbeitstag deutlich, besonders in den dunklen Wintermonaten',
      it: 'permette di lavorare in sicurezza con scarsa illuminazione e prolunga significativamente la giornata lavorativa effettiva, specialmente nei mesi invernali bui',
      hu: 'lehetővé teszi a biztonságos munkát gyenge megvilágítás mellett, és jelentősen meghosszabbítja az effektív munkanapot, különösen a sötét téli hónapokban',
    },
  },
  {
    labelDa: 'Blitzlys til RC-1000s',
    label: { da: 'Blitzlys til RC-1000s', en: 'Flash light for RC-1000s', de: 'Blitzlicht für RC-1000s', it: 'Luce lampeggiante per RC-1000s', hu: 'Villogó fény RC-1000s-hez' },
    reason: {
      da: 'øger sikkerheden markant ved arbejde nær veje og trafik – og er ofte et krav fra kommuner og vejdirektorat',
      en: 'significantly increases safety when working near roads and traffic – and is often required by municipalities and road authorities',
      de: 'erhöht die Sicherheit bei Arbeiten in der Nähe von Straßen und Verkehr deutlich – und ist oft eine Anforderung von Kommunen und Straßenbehörden',
      it: 'aumenta significativamente la sicurezza quando si lavora vicino a strade e traffico – ed è spesso richiesto da comuni e autorità stradali',
      hu: 'jelentősen növeli a biztonságot utak és forgalom közelében végzett munkánál – és gyakran az önkormányzatok és közútkezelők elvárása',
    },
  },
  {
    labelDa: 'Udvidet komponentgaranti (RC-1000s)',
    label: { da: 'Udvidet komponentgaranti (RC-1000s)', en: 'Extended component warranty (RC-1000s)', de: 'Erweiterte Komponentengarantie (RC-1000s)', it: 'Garanzia componenti estesa (RC-1000s)', hu: 'Bővített alkatrészgarancia (RC-1000s)' },
    reason: {
      da: 'giver ekstra tryghed og beskytter mod uforudsete reparationsomkostninger i de første vigtige driftsår',
      en: 'provides extra peace of mind and protects against unforeseen repair costs in the crucial first years of operation',
      de: 'bietet zusätzliche Sicherheit und schützt vor unvorhergesehenen Reparaturkosten in den entscheidenden ersten Betriebsjahren',
      it: 'offre maggiore tranquillità e protegge da costi di riparazione imprevisti nei cruciali primi anni di funzionamento',
      hu: 'extra nyugalmat biztosít és véd a váratlan javítási költségek ellen a működés első fontos éveiben',
    },
  },
  {
    labelDa: 'Udvidet komponentgaranti (RC-751)',
    label: { da: 'Udvidet komponentgaranti (RC-751)', en: 'Extended component warranty (RC-751)', de: 'Erweiterte Komponentengarantie (RC-751)', it: 'Garanzia componenti estesa (RC-751)', hu: 'Bővített alkatrészgarancia (RC-751)' },
    reason: {
      da: 'sikrer at maskinen er dækket mod uventede komponentfejl og reducerer risikoen for dyre driftsstop',
      en: 'ensures the machine is covered against unexpected component failures and reduces the risk of costly downtime',
      de: 'stellt sicher, dass die Maschine gegen unerwartete Komponentenausfälle abgesichert ist und reduziert das Risiko kostspieliger Ausfallzeiten',
      it: 'assicura che la macchina sia coperta contro guasti imprevisti dei componenti e riduce il rischio di costosi fermi macchina',
      hu: 'biztosítja, hogy a gép védett legyen a váratlan alkatrészmeghibásodások ellen, és csökkenti a költséges leállások kockázatát',
    },
  },
  {
    labelDa: 'Spikes-sæt til RC-751',
    label: { da: 'Spikes-sæt til RC-751', en: 'Spike set for RC-751', de: 'Spikes-Set für RC-751', it: 'Set di punte per RC-751', hu: 'Tüskekészlet RC-751-hez' },
    reason: {
      da: 'giver markant bedre greb på blødt underlag og skråninger med mos, hvilket reducerer risikoen for at maskinen glider',
      en: 'provides significantly better grip on soft ground and mossy slopes, reducing the risk of the machine slipping',
      de: 'bietet deutlich besseren Halt auf weichem Untergrund und moosigen Hängen, was das Risiko des Abrutschens reduziert',
      it: 'offre una presa notevolmente migliore su terreni morbidi e pendii muschiosi, riducendo il rischio di scivolamento della macchina',
      hu: 'jelentősen jobb tapadást biztosít puha talajon és mohás lejtőkön, csökkentve a gép megcsúszásának kockázatát',
    },
  },
  {
    labelDa: 'Konservering af chassis og hydraulik',
    label: { da: 'Konservering af chassis og hydraulik', en: 'Chassis and hydraulics preservation', de: 'Fahrgestell- und Hydraulikkonservierung', it: 'Conservazione telaio e idraulica', hu: 'Alváz- és hidraulikavédelem' },
    reason: {
      da: 'beskytter maskinen mod rust og korrosion – særligt vigtigt hvis den bruges til saltspredning eller i våde miljøer, hvor det kan forlænge levetiden betydeligt',
      en: 'protects the machine against rust and corrosion – especially important when used for salt spreading or in wet environments, where it can significantly extend service life',
      de: 'schützt die Maschine vor Rost und Korrosion – besonders wichtig beim Einsatz für Salzstreuung oder in feuchten Umgebungen, wo es die Lebensdauer erheblich verlängern kann',
      it: 'protegge la macchina da ruggine e corrosione – particolarmente importante quando utilizzata per lo spargimento di sale o in ambienti umidi, dove può prolungare significativamente la vita utile',
      hu: 'védi a gépet a rozsdától és a korróziótól – különösen fontos sószóráshoz vagy nedves környezetben történő használat esetén, ahol jelentősen meghosszabbíthatja az élettartamot',
    },
  },
  {
    labelDa: 'Aircondition',
    label: { da: 'Aircondition', en: 'Air conditioning', de: 'Klimaanlage', it: 'Aria condizionata', hu: 'Klímaberendezés' },
    reason: {
      da: 'gør en markant forskel på lange driftsdage i sommervarmen og sikrer, at operatøren kan holde koncentrationen hele dagen',
      en: 'makes a significant difference on long operating days in summer heat and ensures the operator can maintain concentration all day',
      de: 'macht an langen Betriebstagen in der Sommerhitze einen deutlichen Unterschied und stellt sicher, dass der Bediener den ganzen Tag konzentriert bleiben kann',
      it: 'fa una differenza significativa nelle lunghe giornate operative con il caldo estivo e assicura che l\'operatore possa mantenere la concentrazione tutto il giorno',
      hu: 'jelentős különbséget tesz a hosszú nyári meleg munkanapjain, és biztosítja, hogy a kezelő egész nap meg tudja tartani a koncentrációját',
    },
  },
  {
    labelDa: 'Skyderuder',
    label: { da: 'Skyderuder', en: 'Sliding windows', de: 'Schiebefenster', it: 'Finestre scorrevoli', hu: 'Tolóablakok' },
    reason: {
      da: 'giver mulighed for bedre ventilation og direkte kontakt med omgivelserne – en lille detalje, der gør hverdagen væsentligt mere behagelig',
      en: 'provides better ventilation and direct contact with the surroundings – a small detail that makes daily work significantly more pleasant',
      de: 'bietet bessere Belüftung und direkten Kontakt zur Umgebung – ein kleines Detail, das den Arbeitsalltag wesentlich angenehmer macht',
      it: 'offre una migliore ventilazione e contatto diretto con l\'ambiente circostante – un piccolo dettaglio che rende il lavoro quotidiano notevolmente più piacevole',
      hu: 'jobb szellőzést és közvetlen kapcsolatot biztosít a környezettel – egy apró részlet, amely jelentősen kellemesebbé teszi a napi munkát',
    },
  },
  {
    labelDa: 'Luftaffjedret sæde',
    label: { da: 'Luftaffjedret sæde', en: 'Air-suspended seat', de: 'Luftgefederter Sitz', it: 'Sedile con sospensione pneumatica', hu: 'Légrugós ülés' },
    reason: {
      da: 'reducerer vibrationer og belastning på kroppen og er en god investering i operatørens helbred ved daglig brug',
      en: 'reduces vibrations and strain on the body and is a good investment in operator health with daily use',
      de: 'reduziert Vibrationen und Belastungen für den Körper und ist eine gute Investition in die Gesundheit des Bedieners bei täglichem Einsatz',
      it: 'riduce vibrazioni e sollecitazioni sul corpo ed è un buon investimento nella salute dell\'operatore con l\'uso quotidiano',
      hu: 'csökkenti a vibrációkat és a test terhelését, és jó befektetés a kezelő egészségébe napi használat mellett',
    },
  },
  {
    labelDa: 'Bakkamera',
    label: { da: 'Bakkamera', en: 'Reversing camera', de: 'Rückfahrkamera', it: 'Telecamera di retromarcia', hu: 'Tolatókamera' },
    reason: {
      da: 'giver overblik bagud og øger sikkerheden markant, både for operatøren og for omgivelserne',
      en: 'provides rearward visibility and significantly increases safety for both the operator and the surroundings',
      de: 'bietet Sicht nach hinten und erhöht die Sicherheit sowohl für den Bediener als auch für die Umgebung deutlich',
      it: 'offre visibilità posteriore e aumenta significativamente la sicurezza sia per l\'operatore che per l\'ambiente circostante',
      hu: 'hátsó rálátást biztosít és jelentősen növeli a biztonságot mind a kezelő, mind a környezet számára',
    },
  },
  {
    labelDa: 'Udvidet komponentgaranti (Timan 3330)',
    label: { da: 'Udvidet komponentgaranti (Timan 3330)', en: 'Extended component warranty (Timan 3330)', de: 'Erweiterte Komponentengarantie (Timan 3330)', it: 'Garanzia componenti estesa (Timan 3330)', hu: 'Bővített alkatrészgarancia (Timan 3330)' },
    reason: {
      da: 'sikrer ro i maven og beskytter investeringen mod uforudsete reparationsomkostninger',
      en: 'ensures peace of mind and protects the investment against unforeseen repair costs',
      de: 'sorgt für Ruhe und schützt die Investition vor unvorhergesehenen Reparaturkosten',
      it: 'assicura tranquillità e protegge l\'investimento da costi di riparazione imprevisti',
      hu: 'nyugalmat biztosít és védi a befektetést a váratlan javítási költségek ellen',
    },
  },
  {
    labelDa: 'Rustbeskyttelse til CS-200 spreder',
    label: { da: 'Rustbeskyttelse til CS-200 spreder', en: 'Rust protection for CS-200 spreader', de: 'Rostschutz für CS-200 Streuer', it: 'Protezione antiruggine per spargitore CS-200', hu: 'Rozsdavédelem CS-200 szóróhoz' },
    reason: {
      da: 'er næsten et must, når sprederen bruges til salt – uden rustbeskyttelse kan levetiden reduceres markant',
      en: 'is almost a must when the spreader is used for salt – without rust protection, the service life can be significantly reduced',
      de: 'ist fast ein Muss, wenn der Streuer für Salz verwendet wird – ohne Rostschutz kann die Lebensdauer deutlich verkürzt werden',
      it: 'è quasi un must quando lo spargitore viene utilizzato per il sale – senza protezione antiruggine, la vita utile può ridursi significativamente',
      hu: 'szinte kötelező, ha a szórót sóhoz használják – rozsdavédelem nélkül az élettartam jelentősen csökkenhet',
    },
  },
  {
    labelDa: 'LED arbejdslys bag på spreder',
    label: { da: 'LED arbejdslys bag på spreder', en: 'LED work light on rear of spreader', de: 'LED-Arbeitsleuchte hinten am Streuer', it: 'Luce di lavoro LED sul retro dello spargitore', hu: 'LED munkalámpa a szóró hátulján' },
    reason: {
      da: 'gør saltspredning i mørke langt mere overskuelig og sikker – en lille investering med stor daglig nytte',
      en: 'makes salt spreading in the dark much more manageable and safe – a small investment with great daily benefit',
      de: 'macht das Salzstreuen im Dunkeln viel übersichtlicher und sicherer – eine kleine Investition mit großem täglichen Nutzen',
      it: 'rende lo spargimento di sale al buio molto più gestibile e sicuro – un piccolo investimento con grande beneficio quotidiano',
      hu: 'a sötétben végzett sószórást sokkal áttekinthetőbbé és biztonságosabbá teszi – kis befektetés nagy napi haszonnal',
    },
  },
  {
    labelDa: 'Vogn til afmontering af spreder',
    label: { da: 'Vogn til afmontering af spreder', en: 'Cart for spreader removal', de: 'Wagen zur Streuerdemontage', it: 'Carrello per rimozione spargitore', hu: 'Kocsi a szóró leszereléséhez' },
    reason: {
      da: 'gør det væsentligt nemmere at skifte mellem spreder og andre redskaber – en stor tidsbesparelse i hverdagen',
      en: 'makes switching between spreader and other tools significantly easier – a major time saver in daily operations',
      de: 'erleichtert den Wechsel zwischen Streuer und anderen Werkzeugen erheblich – eine große Zeitersparnis im Alltag',
      it: 'rende notevolmente più facile passare tra spargitore e altri strumenti – un grande risparmio di tempo nelle operazioni quotidiane',
      hu: 'jelentősen megkönnyíti a váltást a szóró és más szerszámok között – nagy időmegtakarítás a napi működésben',
    },
  },
  {
    labelDa: 'Lad med hydraulisk tip',
    label: { da: 'Lad med hydraulisk tip', en: 'Bed with hydraulic tipping', de: 'Ladefläche mit hydraulischer Kippung', it: 'Cassone con ribaltamento idraulico', hu: 'Rakfelület hidraulikus billenéssel' },
    reason: {
      da: 'giver mulighed for at transportere og tippe salt eller materialer direkte – og gør maskinen mere alsidig i den daglige drift',
      en: 'allows transporting and tipping salt or materials directly – making the machine more versatile in daily operations',
      de: 'ermöglicht den Transport und das Kippen von Salz oder Materialien direkt – und macht die Maschine im täglichen Betrieb vielseitiger',
      it: 'permette di trasportare e ribaltare sale o materiali direttamente – rendendo la macchina più versatile nelle operazioni quotidiane',
      hu: 'lehetővé teszi a só vagy anyagok közvetlen szállítását és billentését – sokoldalúbbá téve a gépet a napi működésben',
    },
  },
  {
    labelDa: 'Fabriksmontering af centerslange',
    label: { da: 'Fabriksmontering af centerslange', en: 'Factory-mounted center hose', de: 'Werkseitig montierter Mittelschlauch', it: 'Tubo centrale montato in fabbrica', hu: 'Gyári központi tömlő beszerelés' },
    reason: {
      da: 'sikrer optimal sugeevne fra dag ét og sparer tid på eftermontering',
      en: 'ensures optimal suction performance from day one and saves time on retrofitting',
      de: 'sorgt für optimale Saugleistung ab dem ersten Tag und spart Zeit bei der Nachrüstung',
      it: 'assicura prestazioni di aspirazione ottimali dal primo giorno e risparmia tempo sul retrofitting',
      hu: 'biztosítja az optimális szívóteljesítményt az első naptól, és időt takarít meg az utólagos felszerelésen',
    },
  },
  {
    labelDa: 'Vogn til afmontering af fejesug',
    label: { da: 'Vogn til afmontering af fejesug', en: 'Cart for sweeper removal', de: 'Wagen zur Kehrmaschinendemontage', it: 'Carrello per rimozione spazzatrice', hu: 'Kocsi a seprőgép leszereléséhez' },
    reason: {
      da: 'gør det nemt og hurtigt at af- og påmontere fejesugtanken – og giver fleksibilitet i hverdagen',
      en: 'makes it easy and quick to remove and mount the sweeper tank – providing flexibility in daily operations',
      de: 'macht das Ab- und Aufmontieren des Kehrsaugtanks einfach und schnell – und bietet Flexibilität im Alltag',
      it: 'rende facile e veloce smontare e montare il serbatoio della spazzatrice – offrendo flessibilità nelle operazioni quotidiane',
      hu: 'könnyűvé és gyorssá teszi a seprőtartály le- és felszerelését – rugalmasságot biztosítva a napi működésben',
    },
  },
  {
    labelDa: 'Rustbeskyttelse til fejemaskine',
    label: { da: 'Rustbeskyttelse til fejemaskine', en: 'Rust protection for sweeper', de: 'Rostschutz für Kehrmaschine', it: 'Protezione antiruggine per spazzatrice', hu: 'Rozsdavédelem seprőgéphez' },
    reason: {
      da: 'forlænger levetiden på fejemaskinen og er en lille investering, der beskytter mod dyr korrosion over tid',
      en: 'extends the sweeper\'s service life and is a small investment that protects against expensive corrosion over time',
      de: 'verlängert die Lebensdauer der Kehrmaschine und ist eine kleine Investition, die vor teurer Korrosion im Laufe der Zeit schützt',
      it: 'prolunga la vita utile della spazzatrice ed è un piccolo investimento che protegge dalla costosa corrosione nel tempo',
      hu: 'meghosszabbítja a seprőgép élettartamát, és kis befektetés, amely véd a költséges korróziótól az idő múlásával',
    },
  },
  {
    labelDa: 'Rustbeskyttelse til V-plov',
    label: { da: 'Rustbeskyttelse til V-plov', en: 'Rust protection for V-plow', de: 'Rostschutz für V-Pflug', it: 'Protezione antiruggine per lama a V', hu: 'Rozsdavédelem V-ekéhez' },
    reason: {
      da: 'er en god investering – især ved brug sammen med salt, hvor ploven ellers slides hurtigt',
      en: 'is a good investment – especially when used with salt, where the plow otherwise wears quickly',
      de: 'ist eine gute Investition – besonders beim Einsatz mit Salz, wo der Pflug sonst schnell verschleißt',
      it: 'è un buon investimento – specialmente quando usato con il sale, dove l\'aratro altrimenti si usura rapidamente',
      hu: 'jó befektetés – különösen sóval használva, ahol az eke egyébként gyorsan kopik',
    },
  },
];

// Build lookup maps
const recLabelMap = new Map<string, Record<L, string>>();
const recReasonMap = new Map<string, Record<L, string>>();
for (const r of REC_RULE_TRANSLATIONS) {
  recLabelMap.set(r.labelDa, r.label);
  recReasonMap.set(r.labelDa, r.reason);
}

// ─── Capability tags ───────────────────────────────────────────────────────

type Capability =
  | 'green_rough' | 'green_fine' | 'trimming' | 'sweeping' | 'weed'
  | 'stump' | 'snow_plow' | 'snow_blower' | 'salt_spread'
  | 'bio_oil' | 'comfort' | 'camera' | 'chassis_care' | 'tow';

const ACC_DETECTORS: Array<{ cap: Capability; match: (id: string, name: string) => boolean }> = [
  { cap: 'green_rough', match: (id, n) => id === '410910' || n.includes('Slagleklipper') || n.includes('Skivehøster') || id === '412040' },
  { cap: 'green_fine', match: (id, n) => id === '411666' || id === '730017' || id === '730130' || n.includes('Rotorklipper') || id === '411800' || n.includes('Fingerklipper') },
  { cap: 'trimming', match: (id, n) => id.includes('HGM-20083') || id.includes('HGM-20082') || n.includes('Multitrimmer') || n.includes('Termit') },
  { cap: 'sweeping', match: (id, n) => id === '411845' || id === '730020' || n.includes('fejemaskine') || n.includes('Sweeper') || id.includes('720125') || id.includes('720130') || id.includes('720132') || id.includes('720133') || id.includes('730030') || n.includes('Opsamlingstank') || n.includes('Forkostesæt') },
  { cap: 'weed', match: (id, n) => id.includes('730600') || n.includes('krudtsbørste') },
  { cap: 'stump', match: (id, n) => id.startsWith('HFS') || n.includes('Stubfræser') },
  { cap: 'snow_plow', match: (id, n) => id.includes('411742') || id.includes('730114') || n.includes('V-plov') || id === '730105' || n.includes('Dozerblad') },
  { cap: 'snow_blower', match: (id, n) => id === '418000' || id === '730106' || n.includes('Sneslynge') },
  { cap: 'salt_spread', match: (id, n) => id.includes('725131') || id.includes('725132') || id.includes('725138') || n.includes('Spreder') || n.includes('CS-200') },
  { cap: 'bio_oil', match: (id) => id === ACC_ID_OIL_BIO || id === '712180' },
  { cap: 'camera', match: (id) => id === '712164' || id === '712168' || id === '712166' || id === '712167' },
  { cap: 'chassis_care', match: (id) => id === '712175' },
  { cap: 'tow', match: (id) => id === '712169' || id === '712527' || id === '712528' },
];

const COMFORT_IDS: Record<string, Record<L, string>> = {
  '712060': { da: 'aircondition', en: 'air conditioning', de: 'Klimaanlage', it: 'aria condizionata', hu: 'klíma' },
  '712147': { da: 'skyderuder', en: 'sliding windows', de: 'Schiebefenster', it: 'finestre scorrevoli', hu: 'tolóablakok' },
  '712140': { da: 'luftaffjedret sæde', en: 'air-suspended seat', de: 'luftgefederter Sitz', it: 'sedile con sospensione pneumatica', hu: 'légrugós ülés' },
  '712174': { da: 'solskærm', en: 'sun visor', de: 'Sonnenblende', it: 'parasole', hu: 'napellenző' },
  '712178': { da: 'bakalarm', en: 'reversing alarm', de: 'Rückfahralarm', it: 'allarme retromarcia', hu: 'tolatásjelző' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAccName(acc: Accessory): string {
  return typeof acc.name === 'string' ? acc.name : acc.name?.da ?? '';
}

function getAllAccessoriesForMachine(machineType: string): Accessory[] {
  if (machineType === LOOSE_TOOL_KEY) return getLooseToolAccessories();
  return ACCESSORIES[machineType] ?? [];
}

function getSelectedAccessoryObjects(mc: MachineConfig, state: ConfiguratorState): Accessory[] {
  const allAcc = getAllAccessoriesForMachine(mc.type);
  const accIds = new Set<string>();
  mc.acc.forEach(id => accIds.add(id));
  if (mc.configMode === 'individual') {
    for (let i = 1; i <= mc.qty; i++) {
      const key = `${mc.id}_${i}`;
      const unitCfg = state.individualUnitConfigs[key];
      if (unitCfg) unitCfg.acc.forEach(id => accIds.add(id));
    }
  }
  return allAcc.filter(a => accIds.has(a.id) && !a.isHeader && !a.hidden);
}

// ─── Demo-machine filtering ─────────────────────────────────────────────────
// Demo machines stay in the quote pricing, but must be excluded from any
// AI-generated customer-facing text (sales arguments + recommendations).
// Demo flag is keyed by `${varenr}_${globalUnitNumber}` in state.demoMachines.

function stripDemoMachines(state: ConfiguratorState): ConfiguratorState {
  const demoMap = state.demoMachines || {};
  if (!Object.keys(demoMap).some(k => demoMap[k])) return state;

  const newConfigs: MachineConfig[] = [];
  const newIndividual: Record<string, { acc: string[] }> = {};
  let globalUnit = 0;

  for (const mc of state.machineConfigs) {
    if (mc.qty < 1) continue;
    const mach = PRODUCTS[mc.type];
    const varenr = mach?.varenr ?? '';

    // Determine which units (1..qty) are demo, advancing the global counter
    const unitFlags: boolean[] = [];
    for (let i = 1; i <= mc.qty; i++) {
      globalUnit++;
      const isDemo = !!demoMap[`${varenr}_${globalUnit}`];
      unitFlags.push(isDemo);
    }

    const keptIndices = unitFlags
      .map((isDemo, idx) => (isDemo ? -1 : idx + 1))
      .filter(i => i > 0);

    if (keptIndices.length === 0) continue; // entire machine config is demo

    if (keptIndices.length === mc.qty) {
      newConfigs.push({ ...mc, acc: [...mc.acc] });
      if (mc.configMode === 'individual') {
        for (let i = 1; i <= mc.qty; i++) {
          const key = `${mc.id}_${i}`;
          if (state.individualUnitConfigs[key]) {
            newIndividual[key] = { acc: [...state.individualUnitConfigs[key].acc] };
          }
        }
      }
      continue;
    }

    // Mixed: keep only non-demo units. Re-index to 1..N for individual configs.
    const newQty = keptIndices.length;
    if (mc.configMode === 'shared') {
      newConfigs.push({ ...mc, qty: newQty, acc: [...mc.acc] });
    } else {
      newConfigs.push({ ...mc, qty: newQty, configMode: 'individual', acc: [...mc.acc] });
      keptIndices.forEach((origIdx, newIdx) => {
        const origKey = `${mc.id}_${origIdx}`;
        const newKey = `${mc.id}_${newIdx + 1}`;
        const cfg = state.individualUnitConfigs[origKey];
        if (cfg) newIndividual[newKey] = { acc: [...cfg.acc] };
      });
    }
  }

  return { ...state, machineConfigs: newConfigs, individualUnitConfigs: newIndividual };
}

// ─── Main generator ─────────────────────────────────────────────────────────

export function generateSalesArguments(rawState: ConfiguratorState, lang: L = 'da'): SalesArgsStructured {
  const state = stripDemoMachines(rawState);
  const caps = new Set<Capability>();
  const comfortParts: string[] = [];
  const machineTypes: string[] = [];
  let hasLooseTools = false;
  const looseToolNames: string[] = [];

  for (const mc of state.machineConfigs) {
    if (mc.qty < 1) continue;

    if (mc.type === LOOSE_TOOL_KEY) {
      hasLooseTools = true;
      machineTypes.push(mc.type);
      const selectedAcc = getSelectedAccessoryObjects(mc, state);
      for (const acc of selectedAcc) {
        const name = getAccName(acc);
        if (name && !acc.hidden) looseToolNames.push(name);
        for (const det of ACC_DETECTORS) {
          if (det.match(acc.id, name)) caps.add(det.cap);
        }
      }
      continue;
    }

    if (T.machineRoles[mc.type]) machineTypes.push(mc.type);

    const selectedAcc = getSelectedAccessoryObjects(mc, state);
    for (const acc of selectedAcc) {
      const name = getAccName(acc);
      for (const det of ACC_DETECTORS) {
        if (det.match(acc.id, name)) caps.add(det.cap);
      }
      const comfortLabel = COMFORT_IDS[acc.id];
      if (comfortLabel && !comfortParts.includes(comfortLabel[lang])) {
        comfortParts.push(comfortLabel[lang]);
      }
    }
  }

  if (comfortParts.length > 0) caps.add('comfort');

  if (machineTypes.length === 0) {
    return { heading: '', paragraph: T.selectMachines[lang], defaultBullets: [], extraBullets: [] };
  }

  const isLooseOnly = hasLooseTools && machineTypes.length === 1 && machineTypes[0] === LOOSE_TOOL_KEY;
  const hasGreen = caps.has('green_rough') || caps.has('green_fine') || caps.has('trimming');
  const hasSweep = caps.has('sweeping') || caps.has('weed');
  const hasWinter = caps.has('snow_plow') || caps.has('snow_blower') || caps.has('salt_spread');
  const realMachines = machineTypes.filter(t => t !== LOOSE_TOOL_KEY);
  const isMulti = realMachines.length > 1 || (realMachines.length >= 1 && hasLooseTools);
  const isAllYear = (hasGreen || hasSweep) && hasWinter;

  const and = T.and[lang];
  const machineLabel = isLooseOnly
    ? T.looseToolsLabel[lang]
    : realMachines.length === 1 && !hasLooseTools
      ? (realMachines[0] === 'Timan 3330' ? 'Timan 3330' : realMachines[0])
      : [...realMachines.map(t => t === 'Timan 3330' ? 'Timan 3330' : t), ...(hasLooseTools ? [T.supplementaryLooseTools[lang]] : [])].join(and);

  // ── HEADING
  let heading: string;
  if (isLooseOnly && isAllYear) heading = T.headingAllYearLoose[lang];
  else if (isLooseOnly) heading = T.headingLooseOnly[lang];
  else if (isAllYear && isMulti) heading = T.headingAllYearMulti[lang];
  else if (isAllYear) heading = T.headingAllYear[lang];
  else if (isMulti) heading = T.headingMulti[lang];
  else if (hasWinter) heading = T.headingWinter[lang];
  else heading = T.headingDefault[lang];

  // ── PARAGRAPH
  const parts: string[] = [];

  if (isLooseOnly) {
    const toolCount = looseToolNames.length;
    if (isAllYear) {
      parts.push(T.paraLooseAllYear[lang](toolCount));
    } else if (hasGreen || hasSweep) {
      parts.push(T.paraLooseGreen[lang]);
    } else {
      parts.push(T.paraLooseDefault[lang]);
    }
  } else if (isAllYear && isMulti) {
    parts.push(T.paraAllYearMulti[lang](machineLabel));
  } else if (isMulti) {
    parts.push(T.paraMulti[lang](machineLabel));
  } else if (isAllYear) {
    parts.push(T.paraAllYearSingle[lang](machineLabel));
  } else {
    parts.push(T.paraDefault[lang](machineLabel));
  }

  // Machine roles
  if (isMulti && !isLooseOnly) {
    const roleParts: string[] = [];
    for (const mt of machineTypes) {
      const roleMap = T.machineRoles[mt];
      if (roleMap) roleParts.push(roleMap[lang]);
    }
    if (roleParts.length > 0) {
      parts.push(T.roleIntro[lang] + roleParts.join(T.roleConnector[lang]) + T.roleOutro[lang]);
    }
  }

  // Task mentions
  const taskMentions: string[] = [];
  if (hasGreen) {
    if (caps.has('green_rough') && caps.has('green_fine')) taskMentions.push(T.taskBothVeg[lang]);
    else if (caps.has('green_rough')) taskMentions.push(T.taskRoughVeg[lang]);
    else if (caps.has('green_fine')) taskMentions.push(T.taskFineVeg[lang]);
    if (caps.has('trimming')) taskMentions.push(T.taskTrimming[lang]);
  }
  if (hasSweep) {
    if (caps.has('weed')) taskMentions.push(T.taskWeed[lang]);
    else taskMentions.push(T.taskSweeping[lang]);
  }
  if (hasWinter) {
    const winterParts: string[] = [];
    if (caps.has('snow_plow') || caps.has('snow_blower')) winterParts.push(T.taskSnowClearing[lang]);
    if (caps.has('salt_spread')) winterParts.push(T.taskDeIcing[lang]);
    taskMentions.push(winterParts.join(and));
  }
  if (caps.has('stump')) taskMentions.push(T.taskStump[lang]);

  if (taskMentions.length > 0) {
    const joined = taskMentions.length <= 2
      ? taskMentions.join(and)
      : taskMentions.slice(0, -1).join(', ') + and + taskMentions[taskMentions.length - 1];
    parts.push(T.taskDailyUse[lang](joined, isAllYear));
  }

  // Comfort
  if (comfortParts.length >= 2) {
    parts.push(T.comfortMulti[lang](comfortParts.join(', ')));
  } else if (comfortParts.length === 1) {
    parts.push(T.comfortSingle[lang](comfortParts[0]));
  }

  if (caps.has('bio_oil')) parts.push(T.bioOil[lang]);

  const paragraph = parts.join(' ');

  // ── BULLETS
  const allBullets: string[] = [];

  if (isAllYear) allBullets.push(T.bulletAllYear[lang]);
  else if (taskMentions.length >= 2) allBullets.push(T.bulletBreadth[lang]);
  else allBullets.push(T.bulletPrecise[lang]);

  if (hasWinter && hasGreen) allBullets.push(T.bulletSeasonSwitch[lang]);
  else if (hasWinter) allBullets.push(T.bulletWinterReady[lang]);
  else if (hasGreen && hasSweep) allBullets.push(T.bulletGreenSweep[lang]);

  if (caps.has('comfort') && comfortParts.length >= 2) allBullets.push(T.bulletComfort[lang]);
  else if (caps.has('camera')) allBullets.push(T.bulletCamera[lang]);

  if (caps.has('bio_oil')) allBullets.push(T.bulletBioOil[lang]);
  if (caps.has('chassis_care')) allBullets.push(T.bulletChassis[lang]);
  if (caps.has('tow')) allBullets.push(T.bulletTow[lang]);

  const fillers = [
    T.fillerTools[lang](isLooseOnly, isMulti),
    T.fillerQuickStart[lang],
    T.fillerQuickChange[lang],
    T.fillerReliable[lang],
    T.fillerFuel[lang],
    T.fillerSafety[lang],
    T.fillerCompact[lang],
    T.fillerService[lang],
    T.fillerExpandable[lang],
    T.fillerUtilization[lang](isAllYear),
  ];

  for (const f of fillers) {
    if (!allBullets.includes(f)) allBullets.push(f);
    if (allBullets.length >= 10) break;
  }

  const defaultBullets = allBullets.slice(0, 5);
  const extraBullets = allBullets.slice(5, 10);

  return { heading, paragraph, defaultBullets, extraBullets };
}

// ─── Recommendation engine ──────────────────────────────────────────────────

interface RecommendationRule {
  matchIds: string[];
  parentIds: string[];
  label: string;
  reason: string;
  priority: number;
}

const RECOMMENDATION_RULES: RecommendationRule[] = [
  { matchIds: [ACC_ID_WORK_LIGHT, '412594'], parentIds: ['410910', '411666', '411800', '412040', 'HFS-1012', ACC_ID_VPLOW, '411845', '418000', ACC_ID_WEEDBRUSH], label: 'Arbejdslamper til RC-1000s', reason: '', priority: 1 },
  { matchIds: [ACC_ID_FLASH_LIGHT, '411630'], parentIds: ['410910', '411666', '411800', '412040', 'HFS-1012', ACC_ID_VPLOW, '411845', '418000', ACC_ID_WEEDBRUSH], label: 'Blitzlys til RC-1000s', reason: '', priority: 1 },
  { matchIds: [ACC_ID_WARRANTY_1000, '795016'], parentIds: ['410910', '411666', '411800', '412040'], label: 'Udvidet komponentgaranti (RC-1000s)', reason: '', priority: 3 },
  { matchIds: [ACC_ID_WARRANTY_751, '795015'], parentIds: ['411687', '411571', '411866', '411867'], label: 'Udvidet komponentgaranti (RC-751)', reason: '', priority: 3 },
  { matchIds: ['411571'], parentIds: ['411687', '411866', '411867'], label: 'Spikes-sæt til RC-751', reason: '', priority: 1 },
  { matchIds: ['712175'], parentIds: ['720125', '720130', '720132', '720133', '730020', '730114', '725131', '725132', '725138', '730105', '730106', '730017', 'HGM-2007', '730130'], label: 'Konservering af chassis og hydraulik', reason: '', priority: 4 },
  { matchIds: ['712060'], parentIds: ['720125', '720130', '720132', '720133', '730020', '730114', '725131', '725132', '725138'], label: 'Aircondition', reason: '', priority: 3 },
  { matchIds: ['712147'], parentIds: ['720125', '720130', '720132', '720133', '730020', '730114', '725131', '725132', '725138'], label: 'Skyderuder', reason: '', priority: 3 },
  { matchIds: ['712140'], parentIds: ['720125', '720130', '720132', '720133', '730020', '730114', '725131', '725132', '725138'], label: 'Luftaffjedret sæde', reason: '', priority: 3 },
  { matchIds: ['712166', '712167'], parentIds: ['720125', '720130', '720132', '720133', '730020', '730114', '725131', '725132', '725138'], label: 'Bakkamera', reason: '', priority: 1 },
  { matchIds: ['795002'], parentIds: ['720125', '720130', '720132', '720133', '730020', '730114', '725131', '725132', '725138', '730017', 'HGM-2007'], label: 'Udvidet komponentgaranti (Timan 3330)', reason: '', priority: 4 },
  { matchIds: ['712902', '725131__712902', '725132__712902', '725138__712902'], parentIds: ['725131', '725132', '725138'], label: 'Rustbeskyttelse til CS-200 spreder', reason: '', priority: 4 },
  { matchIds: ['725120', '725131__725120', '725132__725120', '725138__725120'], parentIds: ['725131', '725132', '725138'], label: 'LED arbejdslys bag på spreder', reason: '', priority: 1 },
  { matchIds: ['V34-029', '725131__V34-029', '725132__V34-029', '725138__V34-029'], parentIds: ['725131', '725132', '725138'], label: 'Vogn til afmontering af spreder', reason: '', priority: 1 },
  { matchIds: ['V34-055', '725131__V34-055', '725132__V34-055', '725138__V34-055'], parentIds: ['725131', '725132', '725138'], label: 'Lad med hydraulisk tip', reason: '', priority: 2 },
  { matchIds: ['721122', '721122_720125', '721122_720130', '721122_720132', '721122_720133'], parentIds: ['720125', '720130', '720132', '720133'], label: 'Fabriksmontering af centerslange', reason: '', priority: 2 },
  { matchIds: ['V34-029_720125', 'V34-029_720130', 'V34-029_720132', 'V34-029_720133'], parentIds: ['720125', '720130', '720132', '720133'], label: 'Vogn til afmontering af fejesug', reason: '', priority: 1 },
  { matchIds: ['LT_712900', '712900'], parentIds: ['730020', '411845'], label: 'Rustbeskyttelse til fejemaskine', reason: '', priority: 4 },
  { matchIds: ['LT_712901', '712901'], parentIds: ['730114', ACC_ID_VPLOW], label: 'Rustbeskyttelse til V-plov', reason: '', priority: 4 },
];


export function generateRecommendations(rawState: ConfiguratorState, lang: L = 'da'): RecommendationStructured | null {
  const state = stripDemoMachines(rawState);
  const selectedIds = new Set<string>();
  const activeMachineTypes: string[] = [];

  for (const mc of state.machineConfigs) {
    if (mc.qty < 1) continue;
    activeMachineTypes.push(mc.type);
    mc.acc.forEach(id => selectedIds.add(id));
    if (mc.configMode === 'individual') {
      for (let i = 1; i <= mc.qty; i++) {
        const key = `${mc.id}_${i}`;
        const unitCfg = state.individualUnitConfigs[key];
        if (unitCfg) unitCfg.acc.forEach(id => selectedIds.add(id));
      }
    }
  }

  if (activeMachineTypes.length === 0) return null;

  const hasParent = (parentIds: string[]) => parentIds.some(id => selectedIds.has(id));
  const isAlreadySelected = (matchIds: string[]) => matchIds.some(id => selectedIds.has(id));

  const candidates: { rule: RecommendationRule }[] = [];
  for (const rule of RECOMMENDATION_RULES) {
    if (isAlreadySelected(rule.matchIds)) continue;
    if (!hasParent(rule.parentIds)) continue;
    candidates.push({ rule });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.rule.priority - b.rule.priority);

  const heading = T.recHeading[lang];

  const and = T.and[lang];
  const machineLabel = activeMachineTypes
    .filter(t => t !== LOOSE_TOOL_KEY)
    .map(t => t === 'Timan 3330' ? 'Timan 3330' : t)
    .join(and);
  const hasLT = activeMachineTypes.includes(LOOSE_TOOL_KEY);
  const subjectLabel = machineLabel
    ? (hasLT ? `${machineLabel}${and}${T.looseToolsLabel[lang]}` : machineLabel)
    : T.looseToolsLabel[lang];

  const pickCount = Math.min(candidates.length, 5);
  const countWord = pickCount === 1 ? T.recCountOne[lang] : pickCount === 2 ? T.recCountTwo[lang] : T.recCountFew[lang];

  const para = T.recPara[lang](subjectLabel, countWord);

  const allBullets = candidates.map(p => {
    const localLabel = recLabelMap.get(p.rule.label)?.[lang] ?? p.rule.label;
    const localReason = recReasonMap.get(p.rule.label)?.[lang] ?? p.rule.reason;
    return `${localLabel} – ${localReason}`;
  });
  const defaultBullets = allBullets.slice(0, Math.min(5, allBullets.length));
  const extraBullets = allBullets.slice(defaultBullets.length, defaultBullets.length + 5);

  return { heading, paragraph: para, defaultBullets, extraBullets };
}
