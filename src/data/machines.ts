import { Machine, Accessory, Language } from '@/types/configurator';

// ===== CONSTANTS =====
export const ACC_ID_WIRE_HARNESS = '412614';
export const ACC_ID_VPLOW = '411742';
export const ACC_ID_WEEDBRUSH = '730600';
export const ACC_ID_FLASH_LIGHT = '411630';
export const ACC_ID_WORK_LIGHT = '412594';
export const ACC_ID_WARRANTY_1000 = '795016';
export const ACC_ID_WARRANTY_751 = '795015';
export const ACC_ID_OIL_NORMAL = '13101003';
export const ACC_ID_OIL_BIO = '13101005';
export const ACC_ID_RAL_COLOR = '961050';
export const RAL_ALLOWED_IDS = new Set([ACC_ID_RAL_COLOR, 'V34-165']);
export const DEMO_ELIGIBLE_VARENR = new Set(['411000', '410040', '712000']);
export const DEMO_FEE_DKK = 75;
export const DEMO_FEE_EUR = 10;
export const LOOSE_TOOL_KEY = 'LOOSE_TOOL';
export const PACKAGING_COST_ID = '725789';
export const PACKAGING_TRIGGER_IDS = ['720125', '720130', '720132', '720133'];
export const ACC_ID_OIL_1000_PARENT = '445566778899';

// ===== SUB-ITEMS FACTORY =====
const SWEEPER_SUB_ITEMS_TEMPLATE = [
  { id: '721122', varenr: '721122',
    name: { da: 'Fabriksmontering af centerslange for fejesug T2 og T3', en: 'Factory installation of center hose for sweep/vac T2 and T3', de: 'Werksmontage Zentralschlauch für Kehr/Saug T2 und T3', it: 'Installazione in fabbrica del tubo centrale per spazzatura/aspirazione T2 e T3', hu: 'Központi tömlő gyári beszerelése T2/T3 seprés/szíváshoz' },
    priceDKK: 3100, priceEUR: 420
  },
  { id: 'V34-029', varenr: 'V34-029',
    name: { da: 'Vogn for afmontering af redskaber bag', en: 'Trolley for removing rear implements', de: 'Wagen zum Abmontieren von Heckgeräten', it: 'Carrello per smontaggio attrezzi posteriori', hu: 'Kocsi a hátsó eszközök leszereléséhez' },
    priceDKK: 6600, priceEUR: 890,
    videoUrl: 'https://www.youtube.com/watch?v=7_rCEdoygp8',
    imageUrl: 'https://img.youtube.com/vi/7_rCEdoygp8/maxresdefault.jpg'
  }
];

function createUniqueSweeperSubItems(parentId: string) {
  return SWEEPER_SUB_ITEMS_TEMPLATE.map(item => ({
    ...item,
    id: `${item.id}_${parentId}`,
    isSub: true,
    parentId
  }));
}

// ===== PRODUCTS =====
export const PRODUCTS: Record<string, Machine> = {
  'RC-1000S': {
    id: 'RC-1000S',
    name: 'RC-1000s Basismaskine',
    nameShort: 'RC-1000S_SHORT',
    priceDKK: 235000,
    priceEUR: 31590,
    varenr: '411000',
    isDiscountEligible: true,
    videoUrl: 'https://www.youtube.com/watch?v=D-hXvg_oW9s',
    imageUrl: 'https://img.youtube.com/vi/brq-kHp9gPI/hqdefault.jpg',
    images: [{ url: 'https://img.youtube.com/vi/brq-kHp9gPI/hqdefault.jpg' }],
    techSpecs: [
      { label: 'Motor', value: 'Vanguard, 23 HK' },
      { label: 'Max. hældning', value: '50 grader' },
      { label: 'Vægt (Basis)', value: '440 kg' },
      { label: 'Klippebredde', value: '1000 mm' },
    ],
    machineDetails: {
      main: {
        da: `RC 1000s – en ny generation af fjernstyret power, præcision og performance. Oplev fremtidens fuldhydrauliske redskabsbærer, udviklet til at være mere sikker, effektiv og brugervenlig. Dens alsidighed og driftssikkerhed gør den til det bedste valg i både almindeligt og krævende terræn året rundt. RC 1000s er skabt i tæt samarbejde med professionelle fagfolk, hvilket sikrer optimale arbejdsvilkår og topresultater hver gang. Med lav højde og lavt tyngdepunkt klarer den klipning, stubfræsning og snerydning på skråninger op til 50 grader.`,
        en: `RC 1000s – a new generation of remote-controlled power, precision, and performance. Experience the fully hydraulic tool carrier of the future, designed to be safer, more efficient, and user-friendly. Its versatility and reliability make it the best choice for both varied and demanding terrain all year round. RC 1000s handles mowing, stump grinding, and snow removal on slopes up to 50 degrees with ease.`,
        de: `RC 1000s – eine neue Generation von ferngesteuerter Kraft, Präzision und Leistung. Erleben Sie den vollhydraulischen Geräteträger der Zukunft, entwickelt für mehr Sicherheit, Effizienz und Benutzerfreundlichkeit. Seine Vielseitigkeit macht ihn zur besten Wahl für sowohl normales als auch anspruchsvolles Gelände das ganze Jahr über. Der RC 1000s bewältigt Mähen, Stubbenfräsen und Schneeräumen an Hängen bis zu 50 Grad.`,
        it: `RC 1000s – una nuova generazione di potenza, precisione e prestazioni a controllo remoto. Sperimenta il porta attrezzi completamente idraulico del futuro, progettato per essere più sicuro, efficiente e facile da usare. La sua versatilità e affidabilità lo rendono la scelta migliore per terreni vari e impegnativi tutto l'anno. L'RC 1000s gestisce falciatura, triturazione di ceppi e rimozione della neve su pendenze fino a 50 gradi con facilità.`,
        hu: `RC 1000s – a távirányítású erő, pontosság és teljesítmény új generációja. Tapasztalja meg a jövő teljesen hidraulikus szerszámhordozóját, amelyet biztonságosabbá, hatékonyabbá és felhasználóbarátabbá terveztek. Sokoldalúsága és megbízhatósága a legjobb választássá teszi mind a változatos, mind a kihívásokkal teli terepen egész évben. Az RC 1000s könnyedén megbirkózik a kaszálással, tuskómarással és hóeltakarítással akár 50 fokos lejtőn is.`
      },
      bullets: {
        da: [
          'Bælterne er monteret med uafhængige ophæng, fuld kontakt med underlaget og høj stabilitet på stejle skråninger.',
          'Den mest kompakte i sin klasse, hvilket gør den i stand til at arbejde ubesværet på snævre og ufremkommelige steder.',
          'Det brede udstyrsprogram dækker alle sæsoner.',
          'Fjernbetjening: 2,4 Ghz, 150 m maks. betjeningsafstand. Opladning er tilgængelig direkte på maskinen.',
          'Let adgang til motorrummet, ingen roterende dele der skal strammes/smøres (ingen kileremme). Selvfrensende oliekøler.'
        ],
        en: [
          'Tracks mounted with independent suspension, full ground contact, and high stability on steep slopes.',
          'The most compact in its class, enabling it to work effortlessly in narrow and inaccessible places.',
          'Wide range of equipment covers all seasons.',
          'Remote control: 2.4 GHz, 150 m max operating distance. Charging available directly on the machine.',
          'Easy access to engine compartment, no rotating parts to tighten/lubricate (no V-belts). Self-cleaning oil cooler.'
        ],
        de: [
          'Raupen mit unabhängiger Aufhängung, vollem Bodenkontakt und hoher Stabilität an steilen Hängen.',
          'Die kompakteste ihrer Klasse, was ein müheloses Arbeiten an engen und unzugänglichen Stellen ermöglicht.',
          'Breites Geräteprogramm deckt alle Jahreszeiten ab.',
          'Fjernbetjening: 2,4 Ghz, max. 150 m Reichweite. Aufladen direkt an der Maschine möglich.',
          'Leichter Zugang zum Motorraum, keine rotierenden Teile zum Spannen/Schmieren (keine Keilriemen). Selbstreinigender Ölkühler.'
        ],
        it: [
          'Cingoli montati con sospensioni indipendenti, contatto completo con il terreno e alta stabilità su pendii ripidi.',
          'Il più compatto della sua categoria, che gli consente di lavorare senza sforzo in luoghi stretti e inaccessibili.',
          "L'ampia gamma di attrezzature copre tutte le stagioni.",
          'Telecomando: 2,4 GHz, distanza operativa massima 150 m. Ricarica disponibile direttamente sulla macchina.',
          "Facile accesso al vano motore, nessuna parte rotante da stringere/lubrificare (niente cinghie trapezoidali). Radiatore dell'olio autopulente."
        ],
        hu: [
          'Független felfüggesztéssel szerelt lánctalpak, teljes talajkapcsolat és nagy stabilitás meredek lejtőkön.',
          'Kategóriájában a legkompaktabb, amely lehetővé teszi, hogy könnyedén dolgozzon szűk és megközelíthetetlen helyeken.',
          'Széles felszerelési program fedi le az összes szezont.',
          'Távirányító: 2,4 GHz, max. 150 m hatótávolság. Töltés közvetlenül a gépen is elérhető.',
          'Könnyű hozzáférés a motortérhez, nincs forgó alkatrész, amit meg kell húzni/kenni (nincsenek ékszíjak). Öntisztító olajhűtő.'
        ]
      },
      dimensions: [
        { label: 'Længde (Basis)', value: '1.310 mm' },
        { label: 'Bredde (Basis)', value: '1.000 mm' },
        { label: 'Højde (Basis)', value: '685 mm' },
        { label: 'Vægt (Basis)', value: '440 kg' },
        { label: 'Længde (m/ Slagleklipper)', value: '1.970 mm' },
        { label: 'Klippebredde', value: '1.000 mm' },
        { label: 'Teoretisk maks. output', value: '6.000 m2/t' },
        { label: 'Transmission til bælter/redskab', value: 'Hydraulisk' },
      ],
    },
  },
  'RC-751': {
    id: 'RC-751',
    name: 'RC-751 Basismaskine',
    nameShort: 'RC-751_SHORT',
    priceDKK: 167500,
    priceEUR: 22515,
    varenr: '410040',
    isDiscountEligible: true,
    videoUrl: 'https://www.youtube.com/watch?v=LqrPvmCXues',
    imageUrl: 'https://img.youtube.com/vi/LqrPvmCXues/hqdefault.jpg',
    images: [{ url: 'https://img.youtube.com/vi/LqrPvmCXues/hqdefault.jpg' }],
    techSpecs: [
      { label: 'Motor', value: 'B&S, 14 HK' },
      { label: 'Max. hældning', value: '50 grader' },
      { label: 'Vægt (Basis)', value: '345 kg' },
      { label: 'Klippebredde', value: '750 mm' },
    ],
    machineDetails: {
      main: {
        da: `RC-751 er en kompakt og stærk fjernstyret klippeløsning, udviklet til sikkert og effektivt arbejde i krævende terræn. Med sin lave egenhøjde på kun 60 cm og et lavt tyngdepunkt klarer den arbejde på skråninger og skrænter op til 50 grader. Den hydrauliske fremdrift på bælter og det mekaniske træk af slagleklipperen sikrer stabil drift i tæt bevoksning og højt græs. RC-751 er bygget til svært fremkommelige områder, hvor præcision og kontrol er afgørende.`,
        en: `RC-751 is a compact and powerful remote-controlled mowing solution, developed for safe and efficient operation in demanding terrain. With a low overall height of just 60 cm and a low center of gravity, it handles slopes and embankments up to 50 degrees. The hydraulic track drive and mechanical flail mower transmission ensure stable operation in dense vegetation and tall grass. RC-751 is built for hard-to-reach areas where precision and control are essential.`,
        de: `Der RC-751 ist eine kompakte und leistungsstarke ferngesteuerte Mählösung, entwickelt für sicheres und effizientes Arbeiten in anspruchsvollem Gelände. Mit einer niedrigen Bauhöhe von nur 60 cm und einem niedrigen Schwerpunkt bewältigt er Hänge und Böschungen bis zu 50 Grad. Der hydraulische Raupenantrieb und der mechanische Antrieb des Schlegelmähers sorgen für einen stabilen Betrieb in dichter Vegetation und hohem Gras. Der RC-751 ist für schwer zugängliche Bereiche konzipiert, in denen Präzision und Kontrolle entscheidend sind.`,
        it: `RC-751 è una soluzione di taglio compatta e potente a controllo remoto, sviluppata per lavorare in modo sicuro ed efficiente su terreni impegnativi. Con un'altezza complessiva di soli 60 cm e un baricentro basso, affronta pendenze e scarpate fino a 50 gradi. La trazione idraulica su cingoli e la trasmissione meccanica della trinciatrice garantiscono un funzionamento stabile in vegetazione fitta ed erba alta. RC-751 è progettata per aree difficili da raggiungere, dove precisione e controllo sono fondamentali.`,
        hu: `Az RC-751 egy kompakt és erős, távirányítású kaszálási megoldás, amelyet biztonságos és hatékony munkavégzésre fejlesztettek ki nehéz terepviszonyok között. Mindössze 60 cm-es magasságával és alacsony súlypontjával akár 50 fokos lejtőkön és rézsűkön is dolgozik. A hidraulikus lánctalpas meghajtás és a szárzúzó mechanikus hajtása stabil működést biztosít sűrű növényzetben és magas fűben. Az RC-751 nehezen megközelíthető területekre készült, ahol a pontosság és az irányíthatóság kulcsfontosságú.`
      },
      bullets: {
        da: [
          'Bælterne er monteret med uafhængige ophæng, fuld kontakt med underlaget og høj stabilitet på stejle skråninger.',
          'RC-751 klipper fri for bælterne, hvilket gør, at der kan klippes helt ind langs en mur.',
          'Arbejdsmiljø: Skån ryg, hofter og ankler, og minimer risikoen for arbejdsulykker.'
        ],
        en: [
          'Tracks are mounted with independent suspension, ensuring full ground contact and high stability on steep slopes.',
          'RC-751 cuts outside the track width, allowing mowing directly along walls and edges.',
          'Work environment: Reduce strain on back, hips and ankles, and minimize the risk of workplace injuries.'
        ],
        de: [
          'Die Raupen sind mit unabhängiger Aufhängung ausgestattet und gewährleisten vollen Bodenkontakt sowie hohe Stabilität an steilen Hängen.',
          'Der RC-751 mäht außerhalb der Raupenbreite und ermöglicht so das Schneiden direkt entlang von Mauern.',
          'Arbeitsumfeld: Schonung von Rücken, Hüften und Knöcheln sowie Minimierung des Unfallrisikos.'
        ],
        it: [
          'I cingoli sono montati con sospensioni indipendenti, garantendo pieno contatto con il terreno e alta stabilità su pendii ripidi.',
          'RC-751 taglia oltre la larghezza dei cingoli, permettendo di lavorare direttamente lungo muri e bordi.',
          'Ambiente di lavoro: Riduce lo stress su schiena, anche e caviglie e minimizza il rischio di infortuni.'
        ],
        hu: [
          'A lánctalpak független felfüggesztéssel rendelkeznek, teljes talajkapcsolatot és nagy stabilitást biztosítva meredek lejtőkön.',
          'Az RC-751 a lánctalpak szélességén túl kaszál, így közvetlenül falak mentén is dolgozhat.',
          'Munkakörnyezet: Kíméli a hátat, csípőt és bokát, valamint csökkenti a munkahelyi sérülések kockázatát.'
        ]
      },
      dimensions: [
        { label: 'Motor', value: 'B&S, 14 HK' },
        { label: 'Max. hældning', value: '50 grader' },
        { label: 'Vægt (Basis)', value: '345 kg' },
        { label: 'Klippebredde', value: '750 mm' },
        { label: 'Højde', value: '600 mm' },
      ],
    },
  },
  'Timan 3330': {
    id: 'Timan 3330',
    name: 'Timan 3330',
    nameShort: 'TIMAN 3330',
    priceDKK: 361700,
    priceEUR: 48684,
    varenr: '712000',
    isDiscountEligible: true,
    videoUrl: 'https://www.youtube.com/watch?v=Q1vii5cZvgw',
    imageUrl: 'https://img.youtube.com/vi/Q1vii5cZvgw/maxresdefault.jpg',
    techSpecs: [
      { label: 'Motor', value: 'Kubota benzinmotor' },
      { label: 'HK', value: '33 HK' },
      { label: 'Brændstof', value: 'Benzin' },
      { label: 'Tophastighed', value: '28 km/t' },
      { label: 'Lydniveau i kabine', value: '79 dB' },
      { label: 'Køreklar vægt', value: '1.185 kg' },
    ],
    machineDetails: {
      main: {
        da: `Timan 3330 er en alsidig redskabsbærer designet til komfort og effektivitet året rundt. Med et stærkt redskabsprogram og en komfortabel kabine er den det perfekte valg til både vinter- og sommeropgaver.`,
        en: `Timan 3330 is a versatile tool carrier designed for comfort and efficiency all year round.`,
        de: `Timan 3330 ist ein vielseitiger Geräteträger für Komfort und Effizienz das ganze Jahr über.`,
        it: `Timan 3330 è un porta-attrezzi versatile progettato per comfort ed efficienza tutto l'anno.`,
        hu: `A Timan 3330 sokoldalú eszközhordozó, egész éves használatra.`,
      },
      bullets: {
        da: ['Dansk produceret kvalitet.', 'Lavt støjniveau i kabinen.', 'Hurtigt skift af redskaber.', '4-hjulstræk for optimalt greb.'],
        en: ['Danish produced quality.', 'Low noise level in the cab.', 'Quick change of implements.', '4-wheel drive for optimal traction.'],
        de: ['Dänische Qualitätsproduktion.', 'Niedriger Geräuschpegel in der Kabine.', 'Schneller Gerätewechsel.', 'Allradantrieb für optimalen Grip.'],
        it: ['Qualità prodotta in Danimarca.', 'Basso livello di rumore in cabina.', 'Cambio rapido degli attrezzi.', 'Trazione integrale per presa ottimale.'],
        hu: ['Dániában gyártott minőség.', 'Alacsony zajszint a fülkében.', 'Gyors eszközcsere.', '4 kerék meghajtás az optimális tapadásért.'],
      },
      dimensions: [
        // --- Motor ---
        { label: 'Motor', isHeader: true },
        { label: 'Motortype', value: { da: 'Kubota benzin', en: 'Kubota petrol', de: 'Kubota Benzin', it: 'Kubota benzina', hu: 'Kubota benzinmotor' } },
        { label: 'HK', value: { da: '33 HK', en: '33 HP', de: '33 PS', it: '33 CV', hu: '33 LE' } },
        { label: 'EU-norm', value: 'Stage 5' },
        { label: 'Slagvolumen', value: '962 cm³' },
        { label: 'Effekt', value: '24 kW' },
        { label: 'Tophastighed', value: { da: '28 km/t', en: '28 km/h', de: '28 km/h', it: '28 km/h', hu: '28 km/h' } },
        { label: 'Benzintank', value: '37 L' },
        // --- Transmission ---
        { label: 'Transmission', isHeader: true },
        { label: 'Type', value: { da: 'Stempelpumpe', en: 'Piston pump', de: 'Kolbenpumpe', it: 'Pompa a pistoni', hu: 'Dugattyús szivattyú' } },
        { label: 'Hjulmotorer', value: { da: '4 stk. Orbitmotorer', en: '4 pcs. orbit motors', de: '4 Stk. Orbitmotoren', it: '4 motori orbit', hu: '4 db orbitmotor' } },
        { label: 'Kølesystem', value: { da: 'Vandkøling (45°C udetemperatur)', en: 'Water cooling (45°C ambient)', de: 'Wasserkühlung (45°C Außentemperatur)', it: 'Raffreddamento ad acqua (45°C esterni)', hu: 'Víz hűtés (45°C környezet)' } },
        // --- Arbejdshydraulik ---
        { label: 'Arbejdshydraulik', isHeader: true },
        { label: 'Type', value: { da: 'Tandhjulspumpe', en: 'Gear pump', de: 'Zahnradpumpe', it: 'Pompa a ingranaggi', hu: 'Fogaskerék-szivattyú' } },
        { label: 'Kapacitet udtag bag', value: '48 L/min (nominel), 180 Bar' },
        { label: 'Kapacitet udtag front', value: '48 L/min (nominel), 180 Bar' },
        { label: 'Olieudtag front', value: { da: '1 dobbeltvirkende m. flydestilling, 150 Bar', en: '1 double-acting w/ float, 150 Bar', de: '1 doppeltwirkend mit Schwimmstellung, 150 Bar', it: '1 doppio effetto con flottante, 150 Bar', hu: '1 kettős működésű úszóállással, 150 Bar' } },
        { label: 'Olieudtag bag', value: { da: '1 dobbeltvirkende, 150 Bar', en: '1 double-acting, 150 Bar', de: '1 doppeltwirkend, 150 Bar', it: '1 doppio effetto, 150 Bar', hu: '1 kettős működésű, 150 Bar' } },
        // --- Liftarm ---
        { label: 'Liftarm', isHeader: true },
        { label: 'Standard funktioner', value: { da: 'Flydestilling og parallelløft som standard', en: 'Float position and parallel lift as standard', de: 'Schwimmstellung und Parallelhub serienmäßig', it: 'Posizione flottante e sollevamento parallelo di serie', hu: 'Úszóállás és párhuzamos emelés alapfelszereltség' } },
        { label: 'Løftekapacitet', value: { da: '150 kg, 80 cm ud fra hurtigskift / 300 kg ved hurtigskiftet', en: '150 kg, 80 cm from quick hitch / 300 kg at quick hitch', de: '150 kg, 80 cm vom Schnellwechsel / 300 kg am Schnellwechsel', it: '150 kg a 80 cm dal cambio rapido / 300 kg al cambio rapido', hu: '150 kg 80 cm-re a gyorscsatlakozótól / 300 kg a gyorscsatlakozónál' } },
        // --- Elsystem ---
        { label: 'Elsystem', isHeader: true },
        { label: 'Spænding', value: { da: '12 volt', en: '12 V', de: '12 V', it: '12 V', hu: '12 V' } },
        { label: 'Generator', value: { da: '65 amp', en: '65 A', de: '65 A', it: '65 A', hu: '65 A' } },
        // --- Lydniveau ---
        { label: 'Lydniveau', isHeader: true },
        { label: 'Kabine, EU1322/2014 metode B', value: '79 dB' },
        { label: 'Støjniveau i kabine ved 2600 rpm', value: '68 dB' },
        { label: 'Forbikørsel (EU985/2018), kørende', value: '71 dB' },
        { label: 'Forbikørsel (EU985/2018), stående', value: '74 dB' },
        { label: 'Kildestyrke Lwa (ISO 6395:2008)', value: '105 dB' },
        // --- Mål og vægt ---
        { label: 'Mål og vægt', isHeader: true },
        { label: 'Indstigningshøjde', value: '500 mm' },
        { label: 'Længde', value: '2.700 mm' },
        { label: 'Bredde', value: '1.130 mm' },
        { label: 'Højde', value: '1.999 mm' },
        { label: 'Egenvægt', value: '1.060 kg' },
        { label: 'Køreklar vægt', value: '1.185 kg' },
        { label: 'Venderadius indvendig', value: '530 mm' },
        { label: 'Venderadius udvendig', value: '1.670 mm' },
        // --- Standard farve ---
        { label: 'Standard farve', isHeader: true },
        { label: 'Rød', value: 'Ral 3003' },
        { label: 'Hvid (tag)', value: 'Ral 9010' },
      ],
    },
  },
  'Timan 2620': {
    id: 'Timan 2620',
    name: 'Timan 2620',
    nameShort: 'TIMAN 2620',
    priceDKK: 201245,
    priceEUR: 27015,
    varenr: '999-888',
    isDiscountEligible: true,
    techSpecs: [
      { label: 'Motor', value: { da: 'Perkins 403J-11', en: 'Perkins 403J-11', de: 'Perkins 403J-11', it: 'Perkins 403J-11', hu: 'Perkins 403J-11' } },
      { label: 'HK', value: { da: '25 hk / 18,4 kW', en: '25 hp / 18.4 kW', de: '25 PS / 18,4 kW', it: '25 CV / 18,4 kW', hu: '25 LE / 18,4 kW' } },
      { label: 'Brændstof', value: { da: 'Diesel', en: 'Diesel', de: 'Diesel', it: 'Diesel', hu: 'Dizel' } },
      { label: 'Tophastighed', value: { da: '20 km/t', en: '20 km/h', de: '20 km/h', it: '20 km/h', hu: '20 km/h' } },
      { label: 'Træk', value: { da: '4WD', en: '4WD', de: '4WD', it: '4WD', hu: '4WD' } },
      { label: 'Bredde', value: { da: '1.020 mm uden kabine', en: '1,020 mm without cab', de: '1.020 mm ohne Kabine', it: '1.020 mm senza cabina', hu: '1.020 mm fulke nelkul' } },
    ],
    machineDetails: {
      main: {
        da: 'Timan 2620 er en kompakt diesel-redskabsbærer med 4WD, affjedring på forhjulene og fleksibelt udstyr til helårsopgaver.',
        en: 'Timan 2620 is a compact diesel tool carrier with 4WD, front-wheel suspension and flexible equipment for year-round tasks.',
        de: 'Timan 2620 ist ein kompakter Diesel-Geräteträger mit 4WD, Vorderradfederung und flexibler Ausstattung für Ganzjahresaufgaben.',
        it: 'Timan 2620 e un porta-attrezzi diesel compatto con 4WD, sospensione anteriore e attrezzature flessibili per tutto lanno.',
        hu: 'A Timan 2620 kompakt dizel eszkozhordozo 4WD hajtassal, elsokerek-felfuggesztessel es egesz eves feladatokra valo felszerelessel.',
      },
      bullets: {
        da: ['Perkins dieselmotor med 26 HK.', '4WD med affjedring på forhjulene.', 'Kan bygges med eller uden kabine.'],
        en: ['26 HP Perkins diesel engine.', '4WD with front-wheel suspension.', 'Can be configured with or without cab.'],
        de: ['26 PS Perkins Dieselmotor.', '4WD mit Vorderradfederung.', 'Kann mit oder ohne Kabine konfiguriert werden.'],
        it: ['Motore diesel Perkins da 26 CV.', '4WD con sospensione anteriore.', 'Configurabile con o senza cabina.'],
        hu: ['26 LE Perkins dieselmotor.', '4WD elsokerek-felfuggesztessel.', 'Fulkevel vagy fulke nelkul konfiguralhato.'],
      },
      dimensions: [],
    },
  },
  'Loader Line': {
    id: 'Loader Line',
    name: { da: 'Loader-Line & CS-200 Traktor', en: 'Loader-Line & CS-200 Tractor', de: 'Loader-Line & CS-200 Traktor', it: 'Loader-Line & CS-200 Trattore', hu: 'Loader-Line & CS-200 Traktor' },
    nameShort: 'LOADER LINE',
    priceDKK: 0,
    priceEUR: 0,
    varenr: '666-333',
    isDiscountEligible: false,
    techSpecs: [],
    machineDetails: {
      main: {
        da: 'Loader Line — redskaber til Weidemann og lignende læssere.',
        en: 'Loader Line — implements for Weidemann and similar loaders.',
        de: 'Loader Line — implements for Weidemann and similar loaders.',
        it: 'Loader Line — implements for Weidemann and similar loaders.',
        hu: 'Loader Line — implements for Weidemann and similar loaders.',
      },
      bullets: { da: [], en: [], de: [], it: [], hu: [] },
      dimensions: [],
    },
  },
  'LOOSE_TOOL': {
    id: 'LOOSE_TOOL',
    name: { da: 'Løs redskab', en: 'Loose attachment', de: 'Loses Anbaugerät', it: 'Attrezzo sciolto', hu: 'Külön tartozék' },
    nameShort: 'LOOSE_TOOL_SHORT',
    priceDKK: 0,
    priceEUR: 0,
    varenr: '55-66',
    isDiscountEligible: false,
    techSpecs: [],
    machineDetails: {
      main: {
        da: `Vælg denne hvis du kun skal bestille redskaber/udstyr uden maskine.`,
        en: `Select this if you only need implements/equipment without a machine.`,
        de: `Wählen Sie dies, wenn Sie nur Anbaugeräte/Zubehör ohne Maschine bestellen möchten.`,
        it: `Seleziona questo se ti servono solo attrezzi/accessori senza macchina.`,
        hu: `Válaszd ezt, ha csak eszközöket/kiegészítőket rendelsz gép nélkül.`
      },
      bullets: { da: [], en: [], de: [], it: [], hu: [] },
      dimensions: [],
    },
  },
};

// ===== ACCESSORIES =====
export const ACCESSORIES: Record<string, Accessory[]> = {
  'RC-1000S': [
    // Oil group (mandatory)
    { id: ACC_ID_OIL_NORMAL, varenr: '13101003', name: { da: 'Standard olie - Texaco HDZ46', en: 'Standard oil - Texaco HDZ46', de: 'Standardöl - Texaco HDZ46', it: 'Olio standard - Texaco HDZ46', hu: 'Standard olaj - Texaco HDZ46' }, priceDKK: 0, priceEUR: 0, group: 'oil_1000', sectionStart: 'oil_section',
      specs: [{ label: 'Beskrivelse', value: { da: `Texaco Rando HDZ 46 er en højtydende hydraulikolie udviklet til moderne hydrauliksystemer med store temperaturvariationer. Olien giver stabil drift, god slidbeskyttelse og effektiv vandseparation.\n\nVelegnet til bl.a. hydraulik i entreprenør-, landbrugs- og industrimaskiner samt mobile hydrauliksystemer.`, en: `Texaco Rando HDZ 46 is a high-performance hydraulic oil designed for modern hydraulic systems operating under wide temperature variations. It provides reliable protection, stable performance and excellent water separation.`, de: `Texaco Rando HDZ 46 ist ein Hochleistungs-Hydrauliköl für moderne Hydrauliksysteme mit großen Temperaturschwankungen.`, it: `Texaco Rando HDZ 46 è un olio idraulico ad alte prestazioni progettato per sistemi idraulici moderni con ampie variazioni di temperatura.`, hu: `A Texaco Rando HDZ 46 egy nagy teljesítményű hidraulikaolaj, amelyet modern hidraulikus rendszerekhez fejlesztettek ki.` } }]
    },
    { id: ACC_ID_OIL_BIO, varenr: '13101005', name: { da: 'Bio olie - Biohydran TMP 46', en: 'Bio oil - Biohydran TMP 46', de: 'Bio-Öl - Biohydran TMP 46', it: 'Olio bio - Biohydran TMP 46', hu: 'Bio olaj - Biohydran TMP 46' }, priceDKK: 238.80, priceEUR: 32.20, group: 'oil_1000',
      specs: [{ label: 'Beskrivelse', value: { da: `Pris incl. afgift og emb. afgift (20L)\n\nBiohydran TMP 46 er en bionedbrydelig hydraulikolie med en viskositet på 46 cSt ved 40 °C. Den anvendes typisk i hydrauliksystemer, hvor der er behov for en biologisk nedbrydelig olie, f.eks. i landbrug, skovbrug, marine og andre industrier.`, en: `Price incl. tax and packaging tax (20L)\n\nBiohydran TMP 46 is a biodegradable hydraulic oil with a viscosity of 46 cSt at 40 °C.`, de: `Preis inkl. Abgabe und Verpackungsabgabe (20L)\n\nBiohydran TMP 46 ist ein biologisch abbaubares Hydrauliköl.`, it: `Prezzo incl. imposta e tassa imballaggio (20L)\n\nBiohydran TMP 46 è un olio idraulico biodegradabile.`, hu: `Az ár tartalmazza az adót és a csomagolási díjat (20L)\n\nA Biohydran TMP 46 egy biológiailag lebomló hidraulikaolaj.` } }]
    },
    // Equipment
    { id: ACC_ID_WORK_LIGHT, varenr: '412594', name: { da: 'Arbejdslamper 2 stk.', en: 'Work Lights 2 pcs.', de: 'Arbeitsleuchten 2 Stk.', it: 'Luci da lavoro 2 pz.', hu: 'Munkalámpa 2 db' }, priceDKK: 1850, priceEUR: 250, sectionStart: 'Udstyr til RC-1000s',
      specs: [{ label: 'Beskrivelse', value: { da: 'LED-arbejdslamper foran – maksimal synlighed\n\nKraftige LED-arbejdslamper monteret foran på maskinen sikrer effektiv belysning af arbejdsområdet og optimale arbejdsforhold – selv i mørke eller dårlige lysforhold.', en: 'LED work lights at the front – maximum visibility\n\nPowerful LED work lights mounted at the front of the machine ensure effective illumination of the working area and optimal working conditions – even in darkness or poor lighting.', de: 'LED-Arbeitsscheinwerfer vorne – maximale Sichtbarkeit', it: 'Luci da lavoro LED anteriori – massima visibilità', hu: 'Első LED munkalámpák – maximális láthatóság' } }]
    },
    { id: ACC_ID_FLASH_LIGHT, varenr: '411630', name: { da: 'Blitzlys 2 stk.', en: 'Flashing Lights 2 pcs.', de: 'Blitzlichter 2 Stk.', it: 'Luci lampeggianti 2 pz.', hu: 'Villogó lámpa 2 db' }, priceDKK: 2360, priceEUR: 320, auto: true,
      specs: [{ label: 'Beskrivelse', value: { da: 'Blitzlys til øget sikkerhed ved arbejde nær trafik\n\nMaskinen bliver udstyret med 2 kraftige blitzlys:\n\n1 stk. monteret foran\n1 stk. monteret bagpå\n\nSikrer optimal synlighed og øget sikkerhed ved arbejde i områder med trafik eller andre risikozoner.', en: 'Flashing lights for increased safety when working near traffic\n\nThe machine is equipped with 2 powerful flashing lights:\n\n1 mounted at the front\n1 mounted at the rear', de: 'Blitzleuchten für erhöhte Sicherheit bei Arbeiten nahe Verkehr', it: 'Luci lampeggianti per una maggiore sicurezza vicino al traffico', hu: 'Villogók a fokozott biztonságért forgalom közelében' } }]
    },
    { id: ACC_ID_WARRANTY_1000, varenr: '795016', name: { da: 'RC-1000s udvidet komponentgaranti 12mdr.', en: 'RC-1000s Extended Component Warranty 12 months', de: 'RC-1000s Erweiterte Komponenten-Garantie 12 Monate', it: 'RC-1000s garanzia componenti estesa 12 mesi', hu: 'RC-1000s kiterjesztett alkatrész garancia 12 hónap' }, priceDKK: 4950, priceEUR: 660,
      specs: [{ label: 'Beskrivelse', value: { da: `Vedr. Udvidet komponentgaranti Timan RC-1000s\n\nVores RC-1000s leveres med 12 måneders udvidet komponentgaranti, som dækker maskinens vigtigste funktionsdele.\nGarantien er skabt for at give dig ekstra tryghed og sikre stabil drift.\n\nGarantien tegnes fra købsdatoen og kan maximalt tegnes for 5 år, hvorefter den automatisk ophører.\n\nGarantien dækker følgende komponenter samt omkostningerne ved udskiftningen heraf:\n\n• Motorens hovedkomponenter\n• Hydraulikpumper og hydraulikmotorer\n• Elektroniske styre- og kontrolmoduler (ikke forbrugsdele)\n• Transmission og drivlinje\n• Hydraulikventiler\n• Chassisrelaterede funktionskomponenter ved fabrikationsfejl\n\nAlle priser er ekskl. moms.\n\nGarantien tegnes direkte ved Timan A/S.`, en: `Extended Component Warranty Timan RC-1000s\n\nOur RC-1000s is delivered with a 12-month extended component warranty covering the machine's most important functional parts.\n\nThe warranty covers:\n• Main engine components\n• Hydraulic pumps and hydraulic motors\n• Electronic control modules (excluding wear parts)\n• Transmission and drivetrain\n• Hydraulic valves\n• Chassis related functional components in case of manufacturing defects\n\nAll prices exclude VAT.\nThe warranty is issued directly with Timan A/S.`, de: `Erweiterte Komponentengarantie Timan RC-1000s\n\nDie Garantie deckt folgende Komponenten:\n• Hauptkomponenten des Motors\n• Hydraulikpumpen und Hydraulikmotoren\n• Elektronische Steuer- und Kontrollmodule\n• Getriebe und Antriebsstrang\n• Hydraulikventile`, it: `Garanzia estesa sui componenti Timan RC-1000s`, hu: `Kiterjesztett alkatrészgarancia Timan RC-1000s` } }]
    },
    // --- REDSKABER START ---
    { id: 'REDSKABER_HEADER', varenr: 'HEADER', name: { da: 'Redskaber til RC-1000s', en: 'Tools for RC-1000s', de: 'Werkzeuge für RC-1000s', it: 'Attrezzi per RC-1000s', hu: 'RC-1000s eszközök' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '410910', varenr: '410910', name: { da: 'Slagleklipper inkl Y-slagle sæt', en: 'Flail Mower incl. Y-flail set', de: 'Schlegelmäher inkl. Y-Schlegel-Set', it: 'Trinciatrice incl. set di flagelli a Y', hu: 'Szárzúzó Y-alakú késekkel' }, priceDKK: 43900, priceEUR: 5905,
      videos: [{ url: 'https://www.youtube.com/watch?v=D-hXvg_oW9s', label: '🎥 Klik på linket for at se video' }],
      images: [{ url: 'https://img.youtube.com/vi/brq-kHp9gPI/hqdefault.jpg', label: '📸 Klik for billede' }],
      specs: [
        { label: 'Antal Y-slagler', value: '36 stk.' },
        { label: 'Længde monteret', value: '1.970 mm' },
        { label: 'Højde monteret', value: '685 mm' },
        { label: 'Bredde monteret', value: '1.112 mm' },
        { label: 'Vægt med slagleklipper', value: '563 kg' },
        { label: 'Beskrivelse', value: { da: `Kan nemt og sikkert nedkæmpe langt græs, mindre buske, bjørneklo på sværtfremkommelige områder. Arbejder ubesværet på skrænter op til 50 grader. Med en klippebredde på 1m rydder man hurtigt store arealer.\n\nHydraulisk løft: Forkanten på slagleklipperen kan hæves hydraulisk.\n\nSlagler: Er standardudstyret med Y-slagler, alternativt hammerslagler (18 stk.).`, en: `Can easily and safely cut tall grass, small bushes and giant hogweed in hard-to-reach areas. Works effortlessly on slopes up to 50 degrees. With a cutting width of 1 m, large areas can be cleared quickly.\n\nHydraulic lift: The front edge of the flail mower can be raised hydraulically.\n\nFlails: Equipped as standard with Y-flails, alternatively hammer flails (18 pcs).`, de: `Kann problemlos hohes Gras, kleinere Büsche und Riesenbärenklau in schwer zugänglichen Bereichen bekämpfen.`, it: `Può facilmente tagliare erba alta, piccoli cespugli e panace gigante in aree difficili da raggiungere.`, hu: `Könnyedén levágja a magas füvet, kisebb bokrokat és a kaukázusi medvetalpat nehezen hozzáférhető területeken.` } }
      ]
    },
    { id: '411701', varenr: '411701', name: { da: 'Stativ til afsætning af slagleklipper', en: 'Stand for setting down flail mower', de: 'Ständer zum Abstellen des Schlegelmäher', it: 'Supporto per trinciatrice', hu: 'Szárzúzó állvány' }, priceDKK: 1100, priceEUR: 150, requires: '410910' },
    { id: '412585', varenr: '412585', name: { da: 'Hammerslagsæt 18 stk.', en: 'Hammer Flail Set 18 pcs.', de: 'Hammerschlegel-Set 18 Stk.', it: 'Set martelli 18 pz.', hu: 'Kalapácskés készlet 18 db' }, priceDKK: 2060, priceEUR: 280, requires: '410910' },
    { id: '411594', varenr: '411594', name: { da: 'Y-slaglesæt 18 stk.', en: 'Y-flail Set 18 pcs.', de: 'Y-Schlegel-Set 18 Stk.', it: 'Set flagelli a Y 18 pz.', hu: 'Y-alakú kések készlet 18 db' }, priceDKK: 2490, priceEUR: 335, requires: '410910' },
    { id: '411666', varenr: '411666', name: { da: 'Rotorklipper 1350 mm', en: 'Rotary Mower 1350 mm', de: 'Rotationsmäher 1350 mm', it: 'Trincia rotante 1350 mm', hu: 'Rotációs kasza 1350 mm' }, priceDKK: 43800, priceEUR: 5890,
      videoUrl: 'https://www.youtube.com/watch?v=7BSGT1RJOgw', imageUrl: 'https://img.youtube.com/vi/7BSGT1RJOgw/maxresdefault.jpg',
      specs: [
        { label: 'Klippebredde', value: '1350 mm' },
        { label: 'Antal gatorknive', value: '3 stk gatorknive' },
        { label: 'Modvægt', value: 'Ja' },
        { label: 'Vægt', value: '160 kg' },
        { label: 'Beskrivelse', value: { da: 'Rotorklipper med 3 gatorknive.', en: 'Rotary mower with 3 gator blades.' } }
      ]
    },
    { id: '411800', varenr: '411800', name: { da: 'Fingerklipper 1700 mm', en: 'Finger Bar Mower 1700 mm', de: 'Fingerbalkenmäher 1700 mm', it: 'Falciatrice a barra falciante 1700 mm', hu: 'Ujjazó kasza 1700 mm' }, priceDKK: 62700, priceEUR: 8430,
      specs: [
        { label: 'Klippebredde', value: '1.700 mm' },
        { label: 'Antal tænder', value: '47 stk.' },
        { label: 'Vægt', value: '150 kg' },
        { label: 'Beskrivelse', value: { da: 'Fingerklipper til naturpleje og fåregræs.', en: 'Finger bar mower for nature management and sheep grazing areas.' } }
      ]
    },
    { id: '412040', varenr: '412040', name: { da: 'Skivehøster 1150mm', en: 'Disc Harvester 1150mm', de: 'Scheibenmäher 1150mm', it: 'Raccoglitore a dischi 1150mm', hu: 'Tárcsás betakarító 1150mm' }, priceDKK: 43000, priceEUR: 5780,
      videoUrl: 'https://www.youtube.com/watch?v=Y01JP-aoszQ', imageUrl: 'https://img.youtube.com/vi/Y01JP-aoszQ/maxresdefault.jpg',
      specs: [
        { label: 'Klippebredde', value: '1150 mm' },
        { label: 'Skiver / knive', value: '2 skiver (4 knive pr. skive)' },
        { label: 'Vægt', value: '150 kg' },
        { label: 'Total bredde', value: '1480 mm' },
        { label: 'Højde midte', value: '550 mm' },
        { label: 'Højde sider', value: '420 mm' }
      ]
    },
    { id: 'HFS-1012', varenr: 'HFS-1012', name: { da: 'Stubfræser m/hydraulisk sving', en: 'Stump Grinder w/hydraulic swing', de: 'Stubbenfräse m/hydraulischem Schwenk', it: 'Tritaceppi con oscillazione idraulica', hu: 'Tuskómaró hidraulikus elfordulással' }, priceDKK: 66950, priceEUR: 9000,
      videoUrl: 'https://www.youtube.com/watch?v=_bJoFxirKvg',
      specs: [
        { label: 'Stubdiameter', value: '620 mm' },
        { label: 'Stubhøjde', value: '230 mm' },
        { label: 'Fræseskive med tænder', value: 'Ø370 mm' },
        { label: 'Antal tænder', value: '12 stk.' },
        { label: 'Tænder diameter', value: '20 mm' },
        { label: 'Fræsedybde', value: '180 mm' },
        { label: 'Beskrivelse', value: { da: 'Stubfræser med hydraulisk sving. Undgå opslidende gravearbejde. Stubfræseren svinger hydraulisk, hvilket gør, at maskinen holder stille under arbejdet.', en: 'Stump grinder with hydraulic swing. Avoid exhausting digging work. The stump grinder swings hydraulically, meaning the machine stands still during work.' } }
      ]
    },
    // V-plov og afhængige tilvalg
    { id: ACC_ID_VPLOW, varenr: '411742', name: { da: 'V-plov m/gummiskær', en: 'V-plow w/rubber blade', de: 'V-Pflug m/Gummischürfleiste', it: 'Vomeri a V con lama in gomma', hu: 'V-eke gumi éllel' }, priceDKK: 31650, priceEUR: 4255,
      videoUrl: 'https://www.youtube.com/watch?v=KVRBOAxLSM0',
      specs: [
        { label: 'Arbejdsbredde', value: '1.280 - 1.490 mm' },
        { label: 'Egenvægt', value: '100 kg' },
        { label: 'Skær', value: { da: 'Gummi: standard Stål: option', en: 'Rubber: standard Steel: option' } },
        { label: 'Hydraulisk justerbar', value: { da: 'Højre-venstre, Y-form, V-form', en: 'Right-left, Y-shape, V-shape' } },
        { label: 'Beskrivelse', value: { da: 'Kan justeres i alle retninger (V-plov, Y-plov, skrabeblad). Leveres standard med gummiskær. Muligt med tilkøb af stålskær.', en: 'Can be adjusted in all directions (V-plow, Y-plow, scraper blade). Supplied standard with rubber blade. Steel blade available as option.' } }
      ]
    },
    { id: '730276', varenr: '730276', name: { da: 'Stålskær til v-plov, 2 stk.', en: 'Steel Blade for V-plow, 2 pcs.', de: 'Stahlklinge für V-Pflug, 2 Stk.', it: 'Lama in acciaio per vomeri a V, 2 pz.', hu: 'Acél él V-ekéhez, 2 db' }, priceDKK: 1940, priceEUR: 265, requires: ACC_ID_VPLOW },
    { id: '712901', varenr: '712901', name: { da: 'Rustbeskyttelse V-Plov', en: 'Rust Protection V-Plow', de: 'Rostschutz V-Pflug', it: 'Protezione antiruggine Vomeri a V', hu: 'V-eke rozsdavédelem' }, priceDKK: 750, priceEUR: 105, requires: ACC_ID_VPLOW },
    // Fejemaskine og afhængige tilvalg
    { id: '411845', varenr: '411845', name: { da: 'Centerdrevet fejemaskine', en: 'Center Driven Sweeper', de: 'Mittelgetriebene Kehrmaschine', it: 'Spazzatrice a trazione centrale', hu: 'Központi hajtású seprőgép' }, priceDKK: 38500, priceEUR: 5175,
      videoUrl: 'https://www.youtube.com/watch?v=NbmL0w17bRA',
      specs: [
        { label: 'Fejebredde', value: '1.200 mm' },
        { label: 'Børstediameter', value: '550 mm' },
        { label: 'Dæktryk', value: { da: 'Massivt', en: 'Solid' } },
        { label: 'Hydraulisk sving', value: { da: 'Højre og venstre', en: 'Right and left' } },
        { label: 'Beskrivelse', value: { da: 'Hydraulisk drevet kost med en fejebredde på 1200 mm. Hydraulisk sving, der reguleres via fjernbetjeningen. Rengør arealer nemt for græs og flis.', en: 'Hydraulically driven broom with a sweeping width of 1200 mm. Hydraulic swing regulated via remote control.' } }
      ]
    },
    { id: '712900', varenr: '712900', name: { da: 'Rustbeskyttelse Fejemaskine', en: 'Rust Protection Sweeper', de: 'Rostschutz Kehrmaschine', it: 'Protezione antiruggine Spazzatrice', hu: 'Seprőgép rozsdavédelem' }, priceDKK: 750, priceEUR: 105, requires: '411845' },
    { id: '418000', varenr: '418000', name: { da: 'Sneslynge 1100 mm', en: 'Snow Blower 1100 mm', de: 'Schneeschleuder 1100 mm', it: 'Turbina da neve 1100 mm', hu: 'Hómaró 1100 mm' }, priceDKK: 49900, priceEUR: 6710,
      videos: [{ url: 'https://www.youtube.com/watch?v=JAOUl9Z_2UM', label: '🎥 Klik på linket for at se video' }],
      specs: [
        { label: 'Arbejdsbredde', value: '1200 mm' },
        { label: 'Arbejdshøjde', value: '600 mm' },
        { label: 'Længde monteret', value: '2200 mm' },
        { label: 'Egenvægt', value: '159 kg' },
        { label: 'Beskrivelse', value: { da: 'Sneslyngen er til brugeren der har behov for at fjerne større snemængder hurtigt. Ideel på faste overflader. Kaster sneen op til 20 meter.', en: 'The snow blower is for the user who needs to remove large amounts of snow quickly. Throws snow up to 20 meters.' } }
      ]
    },
    // Ukrudtsbørste
    { id: ACC_ID_WEEDBRUSH, varenr: '730600', name: { da: 'WB-170 ukrudtsbørste basis enhed', en: 'WB-170 Weed Brush Base Unit', de: 'WB-170 Unkrautbürste Basiseinheit', it: 'WB-170 unità base spazzola per erbacce', hu: 'WB-170 gyomkefe alapegység' }, priceDKK: 42200, priceEUR: 5440,
      videos: [{ url: 'https://www.youtube.com/watch?v=cwAPl5tfBnI', label: '🎥 Klik for video' }],
      specs: [
        { label: 'Beskrivelse', value: { da: `Den roterende ukrudtsbørste fjerner effektivt ukrudt fra fortove, vejkanter, stier og lignende på steder, hvor det kan være svært at komme til med en større maskine – helt uden brug af pesticider.`, en: `The rotating weed brush effectively removes weeds from sidewalks, road edges, paths and similar areas – completely without the use of pesticides.` } },
        { label: 'Max effekt', value: '7 kW' },
        { label: 'Max olieflow', value: '50 l/min' },
        { label: 'Drejevinkel', value: '-39,4° / +52,6°' },
        { label: 'Vægt', value: '105 kg' },
        { label: 'Længde', value: '1.200 mm' },
        { label: 'Højde', value: '585 mm' },
        { label: 'Bredde', value: '825 mm' },
        { label: 'Fejebredde', value: '1.690 mm' }
      ]
    },
    { id: '412603', varenr: '412603', name: { da: 'RC-1000 ophæng til ukrudtsbørste', en: 'RC-1000 fittings for weed brush', de: 'RC-1000 Halterung für Unkrautbürste', it: 'RC-1000 supporto per spazzola diserbo', hu: 'RC-1000 tartó gyomkeféhez' }, priceDKK: 4900, priceEUR: 660, requires: ACC_ID_WEEDBRUSH },
    { id: '50101017', varenr: '50101017', name: { da: 'Børste Ø390/Ø600, 2 rækker søm i slange', en: 'Brush Ø390/Ø600, 2 rows of nails in hose', de: 'Bürste Ø390/Ø600, 2 Reihen Nägel im Schlauch', it: 'Spazzola Ø390/Ø600, 2 file di chiodi nel tubo', hu: 'Kefe Ø390/Ø600, 2 sor szög tömlőben' }, priceDKK: 6150, priceEUR: 830, videoUrl: 'https://www.youtube.com/watch?v=m4q_NlhLW74', imageUrl: 'https://img.youtube.com/vi/m4q_NlhLW74/maxresdefault.jpg', requires: ACC_ID_WEEDBRUSH, isQtyInput: true },
    { id: '50101018', varenr: '50101018', name: { da: 'Børste Ø390/Ø600, 1 række søm i slange, 2 rækker fladstål', en: 'Brush Ø390/Ø600, 1 row of nails in hose, 2 rows of flat steel' }, priceDKK: 6150, priceEUR: 830, videoUrl: 'https://www.youtube.com/watch?v=m4q_NlhLW74', imageUrl: 'https://img.youtube.com/vi/m4q_NlhLW74/maxresdefault.jpg', requires: ACC_ID_WEEDBRUSH, isQtyInput: true },
    { id: '50101019', varenr: '50101019', name: { da: 'Børste Ø390/Ø600, 1 række stålwire, 2 rækker fladstål', en: 'Brush Ø390/Ø600, 1 row of steel wire, 2 rows of flat steel' }, priceDKK: 4600, priceEUR: 620, videoUrl: 'https://www.youtube.com/watch?v=m4q_NlhLW74', imageUrl: 'https://img.youtube.com/vi/m4q_NlhLW74/maxresdefault.jpg', requires: ACC_ID_WEEDBRUSH, isQtyInput: true },
    { id: '50101020', varenr: '50101020', name: { da: 'Børste Ø390/Ø600, 2 rækker stålwire', en: 'Brush Ø390/Ø600, 2 rows of steel wire' }, priceDKK: 5300, priceEUR: 715, videoUrl: 'https://www.youtube.com/watch?v=m4q_NlhLW74', imageUrl: 'https://img.youtube.com/vi/m4q_NlhLW74/maxresdefault.jpg', requires: ACC_ID_WEEDBRUSH, isQtyInput: true },
    // --- ØVRIGT UDSTYR ---
    { id: ACC_ID_WIRE_HARNESS, varenr: '412614', name: { da: 'Ledningsnet til blitz/arbejdslys', en: 'Wiring Harness for Flashing/Work Lights' }, priceDKK: 890, priceEUR: 120, hidden: true, sectionStart: 'Udstyr til RC-1000s' },
    { id: '411891', varenr: '411891', name: { da: 'Krogplade til udstyr', en: 'Hook Plate for Equipment', de: 'Hakenplatte für Ausrüstung', it: 'Piastra di aggancio per attrezzatura', hu: 'Kampós lemez felszereléshez' }, priceDKK: 700, priceEUR: 95, sectionStart: 'Øvrigt Udstyr',
      specs: [{ label: 'Beskrivelse', value: { da: 'Krogplade – fleksibel montering af ekstraudstyr\n\nVed montering af ekstraudstyr på maskinen anbefales en krogplade. Den sikrer en stabil, fleksibel og effektiv montering af forskelligt udstyr.', en: 'Hook plate – flexible mounting of additional equipment\n\nWhen mounting additional equipment on the machine, a hook plate is recommended.' } }]
    },
    { id: '411906', varenr: '411906', name: { da: 'Bagvægt', en: 'Rear Weight', de: 'Heckgewicht', it: 'Contrappeso posteriore', hu: 'Hátsó súly' }, priceDKK: 2820, priceEUR: 379,
      specs: [
        { label: 'Vægt', value: '25 kg' },
        { label: 'Beskrivelse', value: { da: 'Bagvægt til montering på RC-1000s for bedre balance ved brug af tunge frontmonterede redskaber.', en: 'Rear weight for mounting on RC-1000s for better balance when using heavy front-mounted implements.' } }
      ]
    },
    { id: ACC_ID_RAL_COLOR, varenr: ACC_ID_RAL_COLOR, name: { da: 'Farve efter eget ønske (RAL)', en: 'Custom Color (RAL)', de: 'Wunschfarbe (RAL)', it: 'Colore personalizzato (RAL)', hu: 'Egyedi szín (RAL)' }, priceDKK: 15000, priceEUR: 2015, isRAL: true, sectionStart: 'Øvrigt Udstyr',
      specs: [{ label: 'Beskrivelse', value: { da: 'Maskinen leveres i den ønskede RAL-farve. Angiv venligst RAL-kode (f.eks. 3003) i feltet.', en: 'The machine is supplied in the desired RAL color. Please specify the RAL code (e.g., 3003) in the field.' } }]
    },
  ],
  'RC-751': [
    { id: '411687', varenr: '411687', name: { da: 'Blitzlys RC-751', en: 'Flashing Light RC-751', de: 'Blitzlicht RC-751', it: 'Luce lampeggiante RC-751', hu: 'Villogó lámpa RC-751' }, priceDKK: 2660, priceEUR: 360, sectionStart: 'Udstyr til RC-751',
      specs: [{ label: 'Beskrivelse', value: { da: 'Blitzlys til øget sikkerhed ved arbejde nær trafik\n\nMaskinen bliver udstyret med 2 kraftige blitzlys:\n\n1 stk. monteret foran\n1 stk. monteret bagpå', en: 'Beacon lights for increased safety when working near traffic' } }]
    },
    { id: '410106', varenr: '410106', name: { da: 'Lader 12V 7.5A', en: 'Charger 12V 7.5A', de: 'Ladegerät 12V 7.5A', it: 'Caricabatterie 12V 7,5A', hu: 'Töltő 12V 7,5A' }, priceDKK: 1500, priceEUR: 205,
      specs: [{ label: 'Beskrivelse', value: { da: 'Lader – beskytter og forlænger batteriets levetid\n\nLaderen anvendes ved vinteropbevaring og sikrer optimal vedligeholdelse af batteriet.', en: 'Battery charger – protects and extends battery life\n\nThe charger is used during winter storage and ensures optimal battery maintenance.' } }]
    },
    { id: '411571', varenr: '411571', name: { da: 'Spikes-sæt, komplet', en: 'Spike Set, complete', de: 'Spike-Set, komplett', it: 'Set di chiodi, completo', hu: 'Tüske készlet, komplett' }, priceDKK: 2640, priceEUR: 355,
      specs: [{ label: 'Beskrivelse', value: { da: 'Gummispikes til bælter – forbedret greb på blødt underlag\n\nVed arbejde på skråninger med mos eller andet blødt underlag anbefales montering af gummispikes på bælterne.', en: 'Rubber spikes for tracks – improved grip on soft surfaces' } }]
    },
    { id: '411866', varenr: '411866', name: { da: 'Y-slagle-sæt af 16 stk.', en: 'Y-flail Set of 16 pcs.', de: 'Y-Schlegel-Set von 16 Stk.', it: 'Set flagelli a Y di 16 pz.', hu: 'Y-alakú kések készlet 16 db' }, priceDKK: 1600, priceEUR: 220,
      videos: [{ url: 'https://www.youtube.com/watch?v=guiPDcWgADQ', label: '🎥 Klik for video' }],
      images: [{ url: null, label: '📸 Foto (kommer snart)' }],
      specs: [{ label: 'Beskrivelse', value: { da: 'Y-slagler – standardudstyr med maksimal kapacitet\n\nMaskinen leveres som standard med Y-slagler, som sikrer høj kapacitet og et effektivt, flot klipperesultat.', en: 'Y-flails – standard equipment with maximum capacity' } }]
    },
    { id: '411867', varenr: '411867', name: { da: 'L-slagle-sæt af 16 stk.', en: 'L-flail Set of 16 pcs.', de: 'L-Schlegel-Set von 16 Stk.', it: 'Set flagelli a L di 16 pz.', hu: 'L-alakú kések készlet 16 db' }, priceDKK: 4040, priceEUR: 545,
      specs: [{ label: 'Beskrivelse', value: { da: 'L-slagler – flot og ensartet klipperesultat\n\nL-slagler er ideelle til prydgræs, hvor der ønskes et pænt, jævnt og professionelt resultat.', en: 'L-flails – clean and uniform cutting result' } }]
    },
    { id: ACC_ID_WARRANTY_751, varenr: '795015', name: { da: 'RC-751 udvidet komponentgaranti 12mdr.', en: 'RC-751 Extended Component Warranty 12 months', de: 'RC-751 Erweiterte Komponenten-Garantie 12 Monate', it: 'RC-751 garanzia componenti estesa 12 mesi', hu: 'RC-751 kiterjesztett alkatrész garancia 12 hónap' }, priceDKK: 3500, priceEUR: 470,
      specs: [{ label: 'Beskrivelse', value: { da: `Vedr. Udvidet komponentgaranti Timan RC-751\n\nVores Timan RC-751 leveres med 12 måneders udvidet komponentgaranti, som dækker maskinens vigtigste funktionsdele.\n\nGarantien tegnes fra købsdatoen og kan maximalt tegnes for 5 år.\n\nGarantien dækker:\n• Motorens hovedkomponenter\n• Hydraulikpumper og hydraulikmotorer\n• Elektroniske styre- og kontrolmoduler\n• Transmission og drivlinje\n• Hydraulikventiler\n• Chassisrelaterede funktionskomponenter\n\nAlle priser er ekskl. moms.\nGarantien tegnes direkte ved Timan A/S.`, en: `Extended Component Warranty Timan RC-751\n\nOur Timan RC-751 is delivered with a 12-month extended component warranty.\n\nCovers:\n• Main engine components\n• Hydraulic pumps and motors\n• Electronic control modules\n• Transmission and drivetrain\n• Hydraulic valves\n\nAll prices exclude VAT.` } }]
    },
  ],
  'Timan 3330': [
    // Aircondition group (mandatory)
    { id: '712050', varenr: '712050', name: { da: 'Ønsker ikke Aircondition, inkl. alm. ventilationssystem', en: 'Without air conditioning, incl. standard ventilation system', de: 'Ohne Klimaanlage, inkl. Standard-Belüftungssystem', it: 'Senza aria condizionata, incl. sistema di ventilazione standard', hu: 'Légkondicionáló nélkül, alap szellőztető rendszerrel' }, priceDKK: 0, priceEUR: 0, videoUrl: 'https://www.youtube.com/watch?v=bTfKi4ZN8oY', imageUrl: 'https://img.youtube.com/vi/bTfKi4ZN8oY/maxresdefault.jpg', sectionStart: 'aircon_section', group: 'aircon' },
    { id: '712060', varenr: '712060', name: { da: 'Ønsker Aircondition, inkl. alm. ventilationssystem', en: 'With air conditioning, incl. standard ventilation system', de: 'Mit Klimaanlage, inkl. Standard-Belüftungssystem', it: 'Con aria condizionata, incl. sistema di ventilazione standard', hu: 'Légkondicionálóval, alap szellőztető rendszerrel' }, priceDKK: 11300, priceEUR: 1510, group: 'aircon' },
    // Doors group (mandatory)
    { id: '712146', varenr: '712146', name: { da: 'Dør højre og venstre med fast rude', en: 'Right and left door with fixed window', de: 'Rechte und linke Tür mit festem Fenster', it: 'Porta destra e sinistra con finestra fissa', hu: 'Jobb és bal ajtó fix ablakkal' }, priceDKK: 8500, priceEUR: 1138, sectionStart: 'doors_section', group: 'doors' },
    { id: '712147', varenr: '712147', name: { da: 'Dør højre og venstre med skyderude', en: 'Right and left door with sliding window', de: 'Rechte und linke Tür mit Schiebefenster', it: 'Porta destra e sinistra con finestra scorrevole', hu: 'Jobb és bal ajtó tolóablakkal' }, priceDKK: 14400, priceEUR: 1928, group: 'doors' },
    // Seats group (mandatory)
    { id: '712141', varenr: '712141', name: { da: 'Stofsæde med mekanisk affjedring', en: 'Fabric seat with mechanical suspension', de: 'Stoffsitz mit mechanischer Federung', it: 'Sedile in tessuto con sospensione meccanica', hu: 'Szövet ülés mechanikus rugózással' }, priceDKK: 3605, priceEUR: 483, sectionStart: 'seats_section', group: 'seats' },
    { id: '712140', varenr: '712140', name: { da: 'Stofsæde med luftaffjedring', en: 'Fabric seat with air suspension', de: 'Stoffsitz mit Luftfederung', it: 'Sedile in tessuto con sospensione pneumatica', hu: 'Szövet ülés légrugózással' }, priceDKK: 6105, priceEUR: 817, group: 'seats' },
    // Roof group (mandatory)
    { id: '712142', varenr: '712142', name: { da: 'Tag med rotorblink', en: 'Roof with beacon light', de: 'Dach mit Rundumleuchte', it: 'Tetto con lampeggiante', hu: 'Tető villogó jelzőlámpával' }, priceDKK: 2395, priceEUR: 320, sectionStart: 'roof_section', group: 'roof' },
    { id: '712143', varenr: '712143', name: { da: 'Tag med LED rotorblink', en: 'Roof with LED beacon light', de: 'Dach mit LED-Rundumleuchte', it: 'Tetto con lampeggiante LED', hu: 'Tető LED villogó jelzőlámpával' }, priceDKK: 2645, priceEUR: 355, group: 'roof' },
    { id: '712145', varenr: '712145', name: { da: 'Tag med blitzlys i kanten', en: 'Roof with edge-mounted strobe lights', de: 'Dach mit Blitzleuchten am Rand', it: 'Tetto con luci stroboscopiche sul bordo', hu: 'Tető peremre szerelt villogókkal' }, priceDKK: 5095, priceEUR: 682, group: 'roof',
      subItems: [{ id: '712145__712578', varenr: '712578', name: { da: 'LED Rotorblink til tag med blitz lys', en: 'LED Beacon for roof with Flashing Light', de: 'LED-Rundumleuchte für Dach mit Blitzlicht', it: 'Lampeggiante LED per tetto con luce stroboscopica', hu: 'LED villogó jelzőlámpa villanófényes tetőhöz' }, priceDKK: 705, priceEUR: 95 }]
    },
    // Monitor, Kamera og Alarm
    { id: '712164', varenr: '712164', name: { da: 'Monitor for kamera', en: 'Camera monitor', de: 'Kameramonitor', it: 'Monitor per telecamera', hu: 'Kamera monitor' }, priceDKK: 2805, priceEUR: 380, sectionStart: 'monitor_section' },
    { id: '712168', varenr: '712168', name: { da: 'Kamera for sugemundstykke', en: 'Camera for suction nozzle', de: 'Kamera für Saugmundstück', it: 'Telecamera per bocchetta di aspirazione', hu: 'Kamera a szívófejhez' }, priceDKK: 2310, priceEUR: 315 },
    { id: '712166', varenr: '712166', name: { da: 'Bakkamera monteret i kofanger', en: 'Rear-view camera mounted in bumper', de: 'Rückfahrkamera im Stoßfänger montiert', it: 'Telecamera posteriore montata nel paraurti', hu: 'Tolókamera a lökhárítóba szerelve' }, priceDKK: 2120, priceEUR: 290 },
    { id: '712167', varenr: '712167', name: { da: 'Bakkamera monteret i kabine top', en: 'Rear-view camera mounted in cab roof', de: 'Rückfahrkamera am Kabinendach montiert', it: 'Telecamera posteriore montata sul tetto della cabina', hu: 'Tolókamera a fülke tetejére szerelve' }, priceDKK: 2080, priceEUR: 280 },
    { id: '712178', varenr: '712178', name: { da: 'Bakalarm', en: 'Reverse alarm', de: 'Rückfahralarm', it: 'Allarme retromarcia', hu: 'Tolatás riasztó' }, priceDKK: 695, priceEUR: 95 },
    { id: '712179', varenr: '712179', name: { da: 'Baklygte LED', en: 'Taillight LED', de: 'Taillight LED', it: 'Taillight LED', hu: 'Taillight LED' }, priceDKK: 1125, priceEUR: 155 },
    // Safety
    { id: '712175', varenr: '712175', name: { da: 'Konservering af chassis og hydrauliske komponenter', en: 'Preservation of chassis and hydraulic components', de: 'Konservierung von Chassis und hydraulischen Komponenten', it: 'Protezione del telaio e dei componenti idraulici', hu: 'Alváz és hidraulikus alkatrészek konzerválása' }, priceDKK: 3650, priceEUR: 495, sectionStart: 'safety_section' },
    { id: 'V34-165', varenr: 'V34-165', name: { da: 'Special farvevalg RAL', en: 'Special colour choice (RAL)', de: 'Sonderfarbwahl (RAL)', it: 'Scelta colore speciale (RAL)', hu: 'Egyedi színválasztás (RAL)' }, priceDKK: 9955, priceEUR: 1340, isRAL: true },
    { id: '712180', varenr: '712180', name: { da: 'Bio hydraulikolie', en: 'Bio hydraulic oil', de: 'Bio-Hydrauliköl', it: 'Olio idraulico bio', hu: 'Bio hidraulikaolaj' }, priceDKK: 4500, priceEUR: 610 },
    { id: '712176', varenr: '712176', name: { da: 'Pulverslukker', en: 'Powder extinguisher', de: 'Pulverlöscher', it: 'Estintore a polvere', hu: 'Porral oltó' }, priceDKK: 1150, priceEUR: 155 },
    { id: '712187', varenr: '712187', name: { da: 'Sikkerhedskit førstehjælp og trekant.', en: 'Safety kit: first aid and warning triangle', de: 'Sicherheitskit: Erste Hilfe und Warndreieck', it: 'Kit sicurezza: primo soccorso e triangolo', hu: 'Biztonsági készlet: elsősegély és elakadásjelző háromszög' }, priceDKK: 1250, priceEUR: 160 },
    // Tow
    { id: '712169', varenr: '712169', name: { da: 'Kombitræk kugle/gaffel', en: 'Combo hitch (ball/pin)', de: 'Kombikupplung (Kugel/Gabel)', it: 'Gancio combinato (sfera/forcella)', hu: 'Kombinált vonófej (gömb/villa)' }, priceDKK: 1990, priceEUR: 270, sectionStart: 'tow_section' },
    { id: '712188', varenr: '712188', name: { da: 'Licence plate set EU, Timan Factory fitted', en: 'Licence plate set EU, Timan Factory fitted' }, priceDKK: 0, priceEUR: 130 },
    { id: '712527', varenr: '712527', name: { da: 'Kombitræk kugle/gaffel synsklar med nummerpladelys', en: 'Combo hitch (ball/pin) ready for inspection incl. number plate light', de: 'Kombikupplung (Kugel/Gabel) TÜV-fertig inkl. Kennzeichenleuchte', it: 'Gancio combinato (sfera/forcella) pronto per omologazione con luce targa', hu: 'Kombinált vonófej (gömb/villa) vizsgára előkészítve rendszámlámpával' }, priceDKK: 2700, priceEUR: 363 },
    { id: '712528', varenr: '712528', name: { da: 'Kombitræk, kugle/gaffel, dansk syn', en: 'Combo hitch (ball/pin), Danish inspection', de: 'Kombikupplung (Kugel/Gabel), dänische Zulassung', it: 'Gancio combinato (sfera/forcella), omologazione danese', hu: 'Kombinált vonófej (gömb/villa), dán vizsga' }, priceDKK: 5400, priceEUR: 726 },
    { id: 'S900025', varenr: 'S900025', name: { da: 'Nummerplader fra SKAT for/bag', en: 'Number plates from SKAT (front/rear)', de: 'Kennzeichen von SKAT vorne/hinten', it: 'Targhe da SKAT anteriore/posteriore', hu: 'Rendszámtáblák a SKAT-tól elöl/hátul' }, priceDKK: 2490, priceEUR: 335 },
    // Misc
    { id: '712174', varenr: '712174', name: { da: 'Solskærm justerbar', en: 'Adjustable sun visor', de: 'Verstellbare Sonnenblende', it: 'Aletta parasole regolabile', hu: 'Állítható napellenző' }, priceDKK: 775, priceEUR: 105, sectionStart: 'misc_section' },
    // Sweeper implements
    { id: 'SWEEP_HEADER', varenr: '', name: { da: 'Feje/Sug Redskaber', en: 'Sweep/Vac Implements', de: 'Kehr-/Sauggeräte', it: 'Attrezzature spazzatura/aspirazione', hu: 'Seprés/szívó eszközök' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '720125', varenr: '720125', name: { da: 'T2 Opsamlingstank uden højtryksslange', en: 'T2 collection tank without pressure washer hose', de: 'T2 Sammelbehälter ohne Hochdruckschlauch', it: 'Serbatoio di raccolta T2 senza tubo alta pressione', hu: 'T2 gyűjtőtartály magasnyomású tömlő nélkül' }, priceDKK: 94860, priceEUR: 12770, videoUrl: 'https://www.youtube.com/watch?v=3v-5j569Rik', imageUrl: 'https://img.youtube.com/vi/3v-5j569Rik/maxresdefault.jpg', subItems: createUniqueSweeperSubItems('720125') },
    { id: '720130', varenr: '720130', name: { da: 'T2 Opsamlingstank inkl. højtryksrenser', en: 'T2 collection tank incl. pressure washer', de: 'T2 Sammelbehälter inkl. Hochdruckreiniger', it: 'Serbatoio di raccolta T2 incl. idropulitrice', hu: 'T2 gyűjtőtartály magasnyomású mosóval' }, priceDKK: 107800, priceEUR: 14510, videoUrl: 'https://www.youtube.com/watch?v=SNy30jHCCvo', imageUrl: 'https://img.youtube.com/vi/SNy30jHCCvo/maxresdefault.jpg', subItems: createUniqueSweeperSubItems('720130') },
    { id: '720132', varenr: '720132', name: { da: 'T3 Opsamlingstank med tørsug', en: 'T3 collection tank with dry vacuum', de: 'T3 Sammelbehälter mit Trockensaugung', it: 'Serbatoio di raccolta T3 con aspirazione a secco', hu: 'T3 gyűjtőtartály száraz szívással' }, priceDKK: 84860, priceEUR: 10370, subItems: createUniqueSweeperSubItems('720132') },
    { id: '720133', varenr: '720133', name: { da: 'T3 Opsamlingstank med tørsug og højtryksrenser', en: 'T3 collection tank with dry vacuum and pressure washer', de: 'T3 Sammelbehälter mit Trockensaugung und Hochdruckreiniger', it: 'Serbatoio di raccolta T3 con aspirazione a secco e idropulitrice', hu: 'T3 gyűjtőtartály száraz szívással és magasnyomású mosóval' }, priceDKK: 97860, priceEUR: 11440, subItems: createUniqueSweeperSubItems('720133') },
    { id: '730030', varenr: '730030', name: { da: 'Forkostesæt med 2 koste til fejesug forberedt til venstre og højre sidekost', en: 'Front broom set with 2 brooms (prepared for left/right side broom)', de: 'Frontbesensatz mit 2 Besen', it: 'Kit spazzole anteriori con 2 spazzole', hu: 'Első seprőkészlet 2 seprővel' }, priceDKK: 53800, priceEUR: 7245, videoUrl: 'https://www.youtube.com/watch?v=N9S1NkYlDgg&t=21s', imageUrl: 'https://img.youtube.com/vi/N9S1NkYlDgg/maxresdefault.jpg' },
    { id: '720121', varenr: '720121', name: { da: 'Sidebørste arm højre/venstre med vanddyse', en: 'Side broom arm left/right with water nozzle', de: 'Seitenbesenarm rechts/links mit Wasserdüse', it: 'Braccio spazzola laterale destra/sinistra con ugello acqua', hu: 'Oldalseprő kar jobb/bal vízfúvókával' }, priceDKK: 9150, priceEUR: 1235, requires: '730030', isQtyInput: true },
    { id: '720599', varenr: '720599', name: { da: 'Børste for sidekost (Low noise)', en: 'Side broom brush (Low noise)', de: 'Bürste für Seitenbesen (Low noise)', it: 'Spazzola per spazzola laterale (Low noise)', hu: 'Oldalseprő kefe (Low noise)' }, priceDKK: 900, priceEUR: 125, requires: '730030', isQtyInput: true },
    { id: '720485', varenr: '720485', name: { da: 'Ekstra børste for sidekost poly/stål', en: 'Extra side broom brush poly/steel' }, priceDKK: 950, priceEUR: 195, requires: '730030', isQtyInput: true },
    { id: '720617', varenr: '720617', name: { da: 'Løs ukrudtsbørste til montering på sidekost – kun til kostearme med tilt', en: 'Loose weed brush for mounting on side broom – only for broom arms with tilt' }, priceDKK: 5400, priceEUR: 730, requires: '730030', isQtyInput: true },
    // Ukrudtsbørste
    { id: 'WB_HEADER', varenr: '', name: { da: 'Ukrudtsbørste', en: 'Weed Brush', de: 'Unkrautbürste', it: 'Spazzola diserbo', hu: 'Gyomkefe' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '730600_3330', varenr: '730600', name: { da: 'WB-170 Ukrudtsbørste basisenhed', en: 'WB-170 weed brush base unit', de: 'WB-170 Unkrautbürste Basiseinheit', it: 'WB-170 spazzola diserbo unità base', hu: 'WB-170 gyomkefe alapegység' }, priceDKK: 42200, priceEUR: 5672, videoUrl: 'https://www.youtube.com/watch?v=FPeRykzk5TM&t=59s', imageUrl: 'https://img.youtube.com/vi/FPeRykzk5TM/maxresdefault.jpg' },
    { id: '730601_3330', varenr: '730601', name: { da: 'Sugemundstykke for WB-170 ukrudtsbørste T2', en: 'Suction nozzle for WB-170 weed brush T2' }, priceDKK: 11000, priceEUR: 1485, videoUrl: 'https://www.youtube.com/watch?v=khvG18fw-HA', imageUrl: 'https://img.youtube.com/vi/khvG18fw-HA/maxresdefault.jpg', requires: '730600_3330' },
    { id: '50101017_3330', varenr: '50101017', name: { da: 'Børste Ø390/Ø600, 2 rækker søm i slange', en: 'Brush Ø390/Ø600, 2 rows of nails in hose' }, priceDKK: 6150, priceEUR: 830, videoUrl: 'https://www.youtube.com/watch?v=m4q_NlhLW74', imageUrl: 'https://img.youtube.com/vi/m4q_NlhLW74/maxresdefault.jpg', requires: '730600_3330', isQtyInput: true },
    { id: '50101018_3330', varenr: '50101018', name: { da: 'Børste Ø390/Ø600, 1 række søm, 2 rækker fladstål', en: 'Brush Ø390/Ø600, 1 row nails, 2 rows flat steel' }, priceDKK: 6150, priceEUR: 830, videoUrl: 'https://www.youtube.com/watch?v=m4q_NlhLW74', imageUrl: 'https://img.youtube.com/vi/m4q_NlhLW74/maxresdefault.jpg', requires: '730600_3330', isQtyInput: true },
    { id: '50101019_3330', varenr: '50101019', name: { da: 'Børste Ø390/Ø600, 1 række stålwire, 2 rækker fladstål', en: 'Brush 1 row steel wire, 2 rows flat steel' }, priceDKK: 4600, priceEUR: 620, videoUrl: 'https://www.youtube.com/watch?v=m4q_NlhLW74', imageUrl: 'https://img.youtube.com/vi/m4q_NlhLW74/maxresdefault.jpg', requires: '730600_3330', isQtyInput: true },
    { id: '50101020_3330', varenr: '50101020', name: { da: 'Børste Ø390/Ø600, 2 rækker stålwire', en: 'Brush 2 rows steel wire' }, priceDKK: 5300, priceEUR: 715, videoUrl: 'https://www.youtube.com/watch?v=m4q_NlhLW74', imageUrl: 'https://img.youtube.com/vi/m4q_NlhLW74/maxresdefault.jpg', requires: '730600_3330', isQtyInput: true },
    // Grass tasks
    { id: 'GRASS_HEADER', varenr: '', name: { da: 'Græs opgaver', en: 'Grass tasks', de: 'Grasarbeiten', it: 'Lavori erba', hu: 'Fű feladatok' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '730017', varenr: '730017', name: { da: 'Rotorklipper med 3 gatorknive og tilt-up, 135 cm klippebredde', en: 'Rotary mower with 3 gator blades and tilt-up, 135 cm cutting width' }, priceDKK: 41000, priceEUR: 5520, videoUrl: 'https://www.youtube.com/watch?v=CnO_bi670NU', imageUrl: 'https://img.youtube.com/vi/CnO_bi670NU/maxresdefault.jpg' },
    { id: 'HGM-2007', varenr: 'HGM-2007', name: { da: 'Rotorklipper 150 cm med hydraulisk højdejustering og tilt-up', en: 'Rotary mower 150 cm with hydraulic height adjustment and tilt-up' }, priceDKK: 87650, priceEUR: 11800, videoUrl: 'https://www.youtube.com/watch?v=sVSmd5dE_cY', imageUrl: 'https://img.youtube.com/vi/sVSmd5dE_cY/maxresdefault.jpg' },
    { id: '730130', varenr: '730130', name: { da: 'Rotorklipper 120 cm for opsamling til fejesugtank (Husk centersug)', en: 'Rotary mower 120 cm for collection tank (Remember center suction)' }, priceDKK: 65000, priceEUR: 8750 },
    // Winter implements
    { id: 'WINTER_HEADER', varenr: '', name: { da: 'Vinter redskaber', en: 'Winter implements', de: 'Wintergeräte', it: 'Attrezzature invernali', hu: 'Téli eszközök' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '730020', varenr: '730020', name: { da: 'Centerdrevet fejemaskine med reversering, 120 cm, Ø550 mm børster', en: 'Center driven sweeper with reversing, 120 cm, Ø550 mm brushes' }, priceDKK: 35200, priceEUR: 4740, videoUrl: 'https://www.youtube.com/watch?v=zMoElLUemF8', imageUrl: 'https://img.youtube.com/vi/zMoElLUemF8/maxresdefault.jpg' },
    { id: 'LT_712900', varenr: '712900', name: { da: 'Rustbeskyttelse Centerdrevet fejemaskine', en: 'Rust Protection Center Driven Sweeper' }, priceDKK: 750, priceEUR: 105, requires: '730020' },
    { id: '730114', varenr: '730114', name: { da: 'V-plov 130-150 cm med gummiskær', en: 'V-plow 130-150 cm with rubber blade' }, priceDKK: 30460, priceEUR: 4100, videoUrl: 'https://www.youtube.com/watch?v=tDP8eqg3kdg', imageUrl: 'https://img.youtube.com/vi/tDP8eqg3kdg/maxresdefault.jpg' },
    { id: 'LT_712901', varenr: '712901', name: { da: 'Rustbeskyttelse V-plov', en: 'Rust Protection V-plow' }, priceDKK: 750, priceEUR: 105, requires: '730114' },
    { id: 'LT_730276', varenr: '730276', name: { da: 'Stålskær til V-plov, 2 stk.', en: 'Steel scraper edge for V-plow (2 pcs.)' }, priceDKK: 1810, priceEUR: 245, requires: '730114' },
    { id: '730105', varenr: '730105', name: { da: 'Dozerblad 130 cm med gummiskær', en: 'Dozer blade 130 cm with rubber edge' }, priceDKK: 19000, priceEUR: 2560 },
    { id: '730106', varenr: '730106', name: { da: 'Sneslynge, 110 cm arbejdsbredde', en: 'Snow blower, 110 cm working width' }, priceDKK: 49500, priceEUR: 6665 },
    // Spreader
    { id: '725131', varenr: '725131', name: { da: 'CS-200 Valsespreder, for lad, manuel reg. Husk lad og vogn', en: 'CS-200 roller spreader for load bed, manual (Requires bed & trailer)' }, priceDKK: 38500, priceEUR: 5050,
      subItems: [
        { id: '725131__712902', varenr: '712902', name: { da: 'Rustbeskyttelse (Dinitrol 4010) CS-200', en: 'Rust protection (Dinitrol 4010) CS-200' }, priceDKK: 1150, priceEUR: 155 },
        { id: '725131__725120', varenr: '725120', name: { da: '2 stk. LED arbejdslys bag på spreder', en: '2 pc. LED working light on spreader' }, priceDKK: 950, priceEUR: 130 },
        { id: '725131__725121', varenr: '725121', name: { da: 'El mængdereg. (spjæld)', en: 'Electric flow control (damper)' }, priceDKK: 2900, priceEUR: 395 },
        { id: '725131__V34-029', varenr: 'V34-029', name: { da: 'Vogn for afmontering af redskaber bag', en: 'Trolley for attaching/detaching rear fitted attachments' }, priceDKK: 6600, priceEUR: 890, videoUrl: 'https://www.youtube.com/watch?v=csJFKxZvRuk', imageUrl: 'https://img.youtube.com/vi/csJFKxZvRuk/maxresdefault.jpg' },
        { id: '725131__V34-055', varenr: 'V34-055', name: { da: 'Lad med hydraulisk tip uden vogn', en: 'Tipping trough with hydraulic tip' }, priceDKK: 11900, priceEUR: 1605,
          subItems: [
            { id: '725131__V34-055__712903', varenr: '712903', name: { da: 'Rustbeskyttelse (Dinitrol 4010) af lad', en: 'Rust protection (Dinitrol 4010) of trolley' }, priceDKK: 750, priceEUR: 105 },
            { id: '725131__V34-055__725126', varenr: '725126', name: { da: 'Presenning for lad og spreder (forhandlermonteret)', en: 'Full cover for carrier and spreader (dealer installed)' }, priceDKK: 3800, priceEUR: 515 }
          ]
        }
      ]
    },
    { id: '725132', varenr: '725132', name: { da: 'CS-200 Combi, for lad, manuel reg. Husk lad og vogn', en: 'CS-200 Combi for load bed, manual (Requires bed & trailer)' }, priceDKK: 52350, priceEUR: 7050,
      subItems: [
        { id: '725132__712902', varenr: '712902', name: { da: 'Rustbeskyttelse (Dinitrol 4010) CS-200', en: 'Rust protection (Dinitrol 4010) CS-200' }, priceDKK: 1150, priceEUR: 155 },
        { id: '725132__725120', varenr: '725120', name: { da: '2 stk. LED arbejdslys bag på spreder', en: '2 pc. LED working light on spreader' }, priceDKK: 950, priceEUR: 130 },
        { id: '725132__V34-029', varenr: 'V34-029', name: { da: 'Vogn for afmontering af redskaber bag', en: 'Trolley for attachments' }, priceDKK: 6600, priceEUR: 890, videoUrl: 'https://www.youtube.com/watch?v=csJFKxZvRuk', imageUrl: 'https://img.youtube.com/vi/csJFKxZvRuk/maxresdefault.jpg' },
        { id: '725132__725121', varenr: '725121', name: { da: 'El mængdereg. (spjæld)', en: 'Electric flow control (damper)' }, priceDKK: 2900, priceEUR: 395 },
        { id: '725132__V34-055', varenr: 'V34-055', name: { da: 'Lad med hydraulisk tip uden vogn', en: 'Tipping trough with hydraulic tip' }, priceDKK: 11900, priceEUR: 1605,
          subItems: [
            { id: '725132__V34-055__712903', varenr: '712903', name: { da: 'Rustbeskyttelse (Dinitrol 4010) af lad', en: 'Rust protection (Dinitrol 4010)' }, priceDKK: 750, priceEUR: 105 },
            { id: '725132__V34-055__725126', varenr: '725126', name: { da: 'Presenning for lad og spreder', en: 'Full cover for carrier and spreader' }, priceDKK: 3800, priceEUR: 515 }
          ]
        }
      ]
    },
    { id: '725138', varenr: '725138', name: { da: 'CS-200 Combi, for lad, el reg. Husk lad og vogn', en: 'CS-200 Combi for load bed, electric (Requires bed & trailer)' }, priceDKK: 58350, priceEUR: 7855, videoUrl: 'https://www.youtube.com/watch?v=U7OpoDP2Pf4', imageUrl: 'https://img.youtube.com/vi/U7OpoDP2Pf4/maxresdefault.jpg',
      subItems: [
        { id: '725138__712902', varenr: '712902', name: { da: 'Rustbeskyttelse (Dinitrol 4010) CS-200', en: 'Rust protection (Dinitrol 4010) CS-200' }, priceDKK: 1150, priceEUR: 155 },
        { id: '725138__725120', varenr: '725120', name: { da: '2 stk. LED arbejdslys bag på spreder', en: '2 pc. LED working light on spreader' }, priceDKK: 950, priceEUR: 130 },
        { id: '725138__V34-029', varenr: 'V34-029', name: { da: 'Vogn for afmontering af redskaber bag', en: 'Trolley for attachments' }, priceDKK: 6600, priceEUR: 890, videoUrl: 'https://www.youtube.com/watch?v=csJFKxZvRuk', imageUrl: 'https://img.youtube.com/vi/csJFKxZvRuk/maxresdefault.jpg' },
        { id: '725138__V34-055', varenr: 'V34-055', name: { da: 'Lad med hydraulisk tip uden vogn', en: 'Tipping trough with hydraulic tip' }, priceDKK: 11900, priceEUR: 1605, videoUrl: 'https://www.youtube.com/watch?v=csJFKxZvRuk', imageUrl: 'https://img.youtube.com/vi/csJFKxZvRuk/maxresdefault.jpg',
          subItems: [
            { id: '725138__V34-055__712903', varenr: '712903', name: { da: 'Rustbeskyttelse (Dinitrol 4010) af lad', en: 'Rust protection' }, priceDKK: 750, priceEUR: 105 },
            { id: '725138__V34-055__725126', varenr: '725126', name: { da: 'Presenning for lad og spreder', en: 'Full cover' }, priceDKK: 3800, priceEUR: 515 }
          ]
        }
      ]
    },
    // Other implements
    { id: 'OTHER_HEADER', varenr: '', name: { da: 'Øvrige Redskaber', en: 'Other implements', de: 'Weitere Geräte', it: 'Altri attrezzi', hu: 'Egyéb eszközök' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: 'HGM-20083', varenr: 'HGM-20083', name: { da: 'Fingerklipper for Termit-arm', en: 'Finger mower for Termit arm' }, priceDKK: 19400, priceEUR: 2615, videoUrl: 'https://www.youtube.com/watch?v=o3XLURc8qiU', imageUrl: 'https://img.youtube.com/vi/o3XLURc8qiU/maxresdefault.jpg',
      specs: [
        { label: 'Klippebredde', value: { da: '1.300 mm', en: '1,300 mm' } },
        { label: 'Lodret klippebredde', value: { da: '0 - 3.200 mm', en: '0 - 3,200 mm' } },
        { label: 'Vandret klippehøjde', value: { da: '0 - 2.200 mm', en: '0 - 2,200 mm' } },
        { label: 'Vandret rækkevidde', value: { da: '2.500 mm', en: '2,500 mm' } },
        { label: 'Max. grentykkelse', value: '20 mm' },
        { label: 'Egenvægt', value: '130 kg' },
        { label: 'Beskrivelse', value: { da: `Et præcist og ensartet klipperesultat\n\nMed fingerklipperen til Timan 3330 er det slut med dårlige arbejdsstillinger, når der skal klippes hæk.\n\n• Et præcist og ensartet klipperesultat\n• Nem manøvrering\n• Kan klippe vandret og lodret\n• Klipper op til 2,2 m`, en: `A precise and uniform cutting result\n\nWith the finger mower for Timan 3330, poor working positions when trimming hedges are a thing of the past.\n\n• A precise and uniform cutting result\n• Easy manoeuvring\n• Cuts up to 2.2 m` } }
      ],
      subItems: [
        { id: 'HGM-20083__730034', varenr: '730034', name: { da: 'Termit-arm for 3330 ekskl. hydraulisk sving', en: 'Termit arm for 3330 excl. hydraulic swing' }, priceDKK: 59000, priceEUR: 7945 },
        { id: 'HGM-20083__730033', varenr: '730033', name: { da: 'Termit-arm for 3330 inkl. hydraulisk sving', en: 'Termit arm for 3330 incl. hydraulic swing' }, priceDKK: 72800, priceEUR: 9800 }
      ]
    },
    { id: 'HGM-20082', varenr: 'HGM-20082', name: { da: 'Multitrimmer for Termit-arm', en: 'Multi trimmer for Termit arm' }, priceDKK: 56835, priceEUR: 7650, videoUrl: 'https://www.youtube.com/watch?v=9Fvwy_rJ_oQ', imageUrl: 'https://img.youtube.com/vi/9Fvwy_rJ_oQ/maxresdefault.jpg',
      specs: [
        { label: 'Arbejdsbredde', value: { da: '1.300 mm', en: '1,300 mm' } },
        { label: 'Knivsystem', value: { da: '3 x Ø450 mm bioknive', en: '3 x Ø450 mm bio blades' } },
        { label: 'Vægt', value: '45 kg' },
        { label: 'Beskrivelse', value: { da: `Professionel hydraulisk hækkeklipper\n\n• Professionel hydraulisk klipper\n• Klipper og findeler på én gang\n• Minimalt oprydningsarbejde\n• Rent snit uden flos og riv i grenene`, en: `Professional hydraulic hedge trimmer\n\n• Professional hydraulic cutter\n• Cuts and shreds in one operation\n• Minimal cleanup work\n• Clean cut without tearing branches` } }
      ],
      subItems: [
        { id: 'HGM-20082__730033', varenr: '730033', name: { da: 'Termit-arm for 3330 inkl. hydraulisk sving', en: 'Termit arm for 3330 incl. hydraulic swing' }, priceDKK: 72800, priceEUR: 9800 }
      ]
    },
    { id: '730107', varenr: '730107', name: { da: 'Skovl med hydraulisk tip', en: 'Bucket with hydraulic tipping' }, priceDKK: 19500, priceEUR: 2625 },
    { id: 'V35-502', varenr: 'V35-502', name: { da: 'Ramme for montering af udstyr bag – andre end Timan produkter', en: 'Rear mounting frame – non-Timan equipment' }, priceDKK: 2850, priceEUR: 385 },
    { id: 'V35-300', varenr: 'V35-300', name: { da: 'Hurtigkobling for frontudstyr – andre end Timan produkter', en: 'Quick coupling for front equipment – non-Timan' }, priceDKK: 2760, priceEUR: 375 },
    { id: '721122_standalone', varenr: '721122', name: { da: 'Fabriksmontering af centerslange for fejesug T2 og T3', en: 'Factory installation of center hose for sweep/vac T2 and T3', de: 'Werksmontage Zentralschlauch für Kehr/Saug T2 und T3', it: 'Installazione in fabbrica del tubo centrale per spazzatura/aspirazione T2 e T3', hu: 'Központi tömlő gyári beszerelése T2/T3 seprés/szíváshoz' }, priceDKK: 3100, priceEUR: 420 },
    { id: 'V34-029_standalone', varenr: 'V34-029', name: { da: 'Ekstra vogn til afmontering af redskaber', en: 'Extra trolley for removing rear implements' }, priceDKK: 6600, priceEUR: 890 },
    { id: 'V34-055_standalone', varenr: 'V34-055', name: { da: 'Ekstra Lad med hydraulisk tip uden vogn', en: 'Extra tipping trough with hydraulic tip without trolley' }, priceDKK: 11900, priceEUR: 1605, videoUrl: 'https://www.youtube.com/watch?v=csJFKxZvRuk', imageUrl: 'https://img.youtube.com/vi/csJFKxZvRuk/maxresdefault.jpg',
      subItems: [
        { id: 'V34-055__712903', varenr: '712903', name: { da: 'Rustbeskyttelse (Dinitrol 4010) af lad', en: 'Rust protection for trough' }, priceDKK: 750, priceEUR: 105 },
        { id: 'V34-055__725126', varenr: '725126', name: { da: 'Presenning for lad og spreder (forhandlermonteret)', en: 'Full cover for carrier and spreader (dealer installed)' }, priceDKK: 3800, priceEUR: 515 }
      ]
    },
    // Warranty
    { id: '795002', varenr: '795002', name: { da: 'Timan 3330 udvidet komponentgaranti med 12 mdr.', en: 'Timan 3330 extended component warranty (12 months)', de: 'Timan 3330 erweiterte Garantie (12 Monate)', it: 'Timan 3330 garanzia estesa (12 mesi)', hu: 'Timan 3330 bővített garancia (12 hónap)' }, priceDKK: 4950, priceEUR: 665,
      specs: [{ label: 'Beskrivelse', value: { da: `Timan maskiner kan leveres med 12 måneders udvidet komponentgaranti, som giver ekstra sikkerhed for maskinens vigtigste komponenter.\n\nGarantien tegnes fra maskinens købsdato og kan maksimalt tegnes for op til 3 år.\n\nDen udvidede komponentgaranti omfatter:\n• Motorens hovedkomponenter\n• Hydrauliksystemets pumper, motorer og ventiler\n• Transmission og drivlinje\n• Styre- og kontrolmoduler\n• Chassisrelaterede funktionskomponenter\n\nGarantien dækker både komponenter samt arbejdsløn.\nBetalingsbetingelser: én gang årligt – første gang ved tegning. Netto 21 dage.`, en: `Timan machines can be supplied with a 12-month extended component warranty, providing additional security for the machine's key components.\n\nThe warranty covers:\n• Main engine components\n• Hydraulic system pumps, motors and valves\n• Transmission and drivetrain\n• Steering and control modules\n• Chassis-related functional components\n\nPayment terms: once annually – first payment upon signing. Net 21 days.` } }]
    },
  ],
  'Timan 2620': [
    { id: '2620_NO_CAB', varenr: '999-888-U', name: { da: 'Uden kabine', en: 'Without cab', de: 'Ohne Kabine', it: 'Senza cabina', hu: 'Fulke nelkul' }, priceDKK: 0, priceEUR: 0, group: 'cabin_2620', sectionStart: 'cabin_section' },
    { id: '8000-01', varenr: '8000-01', name: { da: 'Førerhus inkl. varme, lys og spejle (ROPS)', en: 'Cab incl. heating, lights and mirrors (ROPS)', de: 'Kabine inkl. Heizung, Licht und Spiegel (ROPS)', it: 'Cabina incl. riscaldamento, luci e specchi (ROPS)', hu: 'Fulke futessel, vilagitassal es tukrokkel (ROPS)' }, priceDKK: 66215, priceEUR: 8890, group: 'cabin_2620', sectionStart: 'cabin_section' },
    { id: '8000-02', varenr: '8000-02', name: { da: 'Aircondition', en: 'Air conditioning', de: 'Klimaanlage', it: 'Aria condizionata', hu: 'Legkondicionalo' }, priceDKK: 15300, priceEUR: 2055, requires: '8000-01' },
    { id: '8000-03', varenr: '8000-03', name: { da: 'Bluetooth radio med USB/MP3', en: 'Bluetooth radio with USB/MP3' }, priceDKK: 3075, priceEUR: 415, requires: '8000-01' },
    { id: '8000-04', varenr: '8000-04', name: { da: 'Solskærm justerbar', en: 'Adjustable sun visor' }, priceDKK: 4305, priceEUR: 580, requires: '8000-01' },
    { id: '8000-05', varenr: '8000-05', name: { da: 'Opvarmede spejle', en: 'Heated mirrors' }, priceDKK: 4025, priceEUR: 540, requires: '8000-01' },
    { id: '8000-06', varenr: '8000-06', name: { da: 'Arbejdslys foran (2 stk.)', en: 'Front work lights (2 pcs.)' }, priceDKK: 3150, priceEUR: 425, requires: '8000-01' },
    { id: '8000-07', varenr: '8000-07', name: { da: 'Arbejdslys bag (1 stk.)', en: 'Rear work light (1 pc.)' }, priceDKK: 1585, priceEUR: 215, requires: '8000-01' },
    { id: '8000-08', varenr: '8000-08', name: { da: 'Rotorblink', en: 'Beacon light' }, priceDKK: 1195, priceEUR: 160, requires: '8000-01' },
    { id: '8000-09', varenr: '8000-09', name: { da: 'Blitzlys for og bag på kabinen', en: 'Flashing lights front and rear on cab' }, priceDKK: 1975, priceEUR: 265, requires: '8000-01' },
    { id: '8000-10', varenr: '8000-10', name: { da: 'Skyderuder H/V side (pris mangler)', en: 'Sliding windows left/right (price missing)' }, priceDKK: 0, priceEUR: 0, requires: '8000-01' },
    { id: '8000-11', varenr: '8000-11', name: { da: '112 brandslukker i kabine', en: '112 fire extinguisher in cab' }, priceDKK: 1150, priceEUR: 155, requires: '8000-01' },
    { id: '8000-12', varenr: '8000-12', name: { da: 'Nummerpladeholder for og bag', en: 'License plate holder front and rear' }, priceDKK: 2125, priceEUR: 285, requires: '8000-01' },

    { id: '2620_MACHINE_HEADER', varenr: 'HEADER', name: { da: 'Ekstraudstyr - Maskine', en: 'Machine equipment', de: 'Maschinenausstattung', it: 'Equipaggiamento macchina', hu: 'Gep felszereles' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '9000-01', varenr: '9000-01', name: { da: 'Luftaffjedret Comfort sæde med kunstlæder og justerbar armlæn - merpris', en: 'Air-suspended Comfort seat with artificial leather and adjustable armrests - surcharge' }, priceDKK: 3570, priceEUR: 480 },
    { id: '9000-02', varenr: '9000-02', name: { da: 'Luftaffjedret Deluxe stofsæde med sædevarme og justerbar armlæn - merpris', en: 'Air-suspended Deluxe fabric seat with seat heating and adjustable armrests - surcharge' }, priceDKK: 9760, priceEUR: 1310 },
    { id: '9000-03', varenr: '9000-03', name: { da: 'Elektrisk fartholder', en: 'Electric cruise control' }, priceDKK: 850, priceEUR: 115 },
    { id: '9000-04', varenr: '9000-04', name: { da: 'Bio hydraulikolie', en: 'Bio hydraulic oil' }, priceDKK: 4500, priceEUR: 605 },
    { id: '9000-05', varenr: '9000-05', name: { da: 'Monitor for kamera', en: 'Camera monitor' }, priceDKK: 2805, priceEUR: 380 },
    { id: '9000-06', varenr: '9000-06', name: { da: 'Kamera for sugemundstykke', en: 'Camera for suction nozzle' }, priceDKK: 2310, priceEUR: 310 },
    { id: '9000-07', varenr: '9000-07', name: { da: 'Bakkamera på bagenden', en: 'Rear-view camera' }, priceDKK: 2120, priceEUR: 285 },
    { id: '9000-08', varenr: '9000-08', name: { da: 'Bakalarm', en: 'Reverse alarm' }, priceDKK: 695, priceEUR: 95 },
    { id: '9000-09', varenr: '9000-09', name: { da: 'Kombitræk kugle/gaffel', en: 'Combination hitch ball/fork' }, priceDKK: 1990, priceEUR: 270 },
    { id: '9000-10', varenr: '9000-10', name: { da: 'Hydraulisk baglift (pris mangler)', en: 'Hydraulic rear lift (price missing)' }, priceDKK: 0, priceEUR: 0 },
    { id: '9000-11', varenr: '9000-11', name: { da: 'Skovl- og kosteholder', en: 'Bucket and broom holder' }, priceDKK: 650, priceEUR: 90 },
    { id: '9000-12', varenr: '9000-12', name: { da: 'Stænkskærm sæt, 4 stk.', en: 'Mudguard set, 4 pcs.' }, priceDKK: 550, priceEUR: 75 },
    { id: '9000-13', varenr: '9000-13', name: { da: 'Undervognsbehandling (anbefales til vinterbrug)', en: 'Undercarriage treatment (recommended for winter use)' }, priceDKK: 4705, priceEUR: 630 },

    { id: '2620_SWEEP_HEADER', varenr: 'HEADER', name: { da: 'Feje-/sugeopgaver', en: 'Sweeping/suction tasks', de: 'Kehr-/Saugaufgaben', it: 'Spazzatura/aspirazione', hu: 'Sepro/szivo feladatok' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '1000-01', varenr: '1000-01', name: { da: 'Sugetank', en: 'Suction tank' }, priceDKK: 75495, priceEUR: 10135 },
    { id: '1000-02', varenr: '1000-02', name: { da: 'Forkoste', en: 'Front brushes' }, priceDKK: 27070, priceEUR: 3635 },
    { id: '1000-03', varenr: '1000-03', name: { da: 'Forkoste inkl. sidekost', en: 'Front brushes incl. side brush' }, priceDKK: 48425, priceEUR: 6500 },
    { id: '1000-04', varenr: '1000-04', name: { da: 'Ekstra børste (poly/stål)', en: 'Extra brush (poly/steel)' }, priceDKK: 450, priceEUR: 60 },
    { id: '1000-05', varenr: '1000-05', name: { da: 'Ekstra børste (blød)', en: 'Extra brush (soft)' }, priceDKK: 475, priceEUR: 65 },
    { id: '1000-06', varenr: '1000-06', name: { da: 'Ekstern sugeslange, 7 m', en: 'External suction hose, 7 m' }, priceDKK: 8580, priceEUR: 1155 },
    { id: '1000-07', varenr: '1000-07', name: { da: 'Ukrudtsbørste', en: 'Weed brush' }, priceDKK: 27990, priceEUR: 3760 },
    { id: '1000-08', varenr: '1000-08', name: { da: 'Ukrudtsbørste inkl. sugehus', en: 'Weed brush incl. suction housing' }, priceDKK: 31630, priceEUR: 4245 },

    { id: '2620_LAWN_HEADER', varenr: 'HEADER', name: { da: 'Plæneopgaver', en: 'Lawn tasks', de: 'Rasenaufgaben', it: 'Lavori prato', hu: 'Gyepfeladatok' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '2000-01', varenr: '2000-01', name: { da: 'Rotorklipper 1000 mm', en: 'Rotary mower 1000 mm' }, priceDKK: 33490, priceEUR: 4495 },
    { id: '2000-02', varenr: '2000-02', name: { da: 'Hydraulisk tilt og højdejustering (pris mangler)', en: 'Hydraulic tilt and height adjustment (price missing)' }, priceDKK: 0, priceEUR: 0 },
    { id: '2000-03', varenr: '2000-03', name: { da: 'Opsamlingskit til 1000 mm klipper', en: 'Collection kit for 1000 mm mower' }, priceDKK: 1160, priceEUR: 155 },
    { id: '2000-04', varenr: '2000-04', name: { da: 'Blænddækselkit', en: 'Blanking cover kit' }, priceDKK: 210, priceEUR: 30 },
    { id: '2000-05', varenr: '2000-05', name: { da: 'Græsopsamler 480 L', en: 'Grass collector 480 L' }, priceDKK: 57175, priceEUR: 7675 },
    { id: '2000-06', varenr: '2000-06', name: { da: 'Multiklipper 1000 mm', en: 'Multi mower 1000 mm' }, priceDKK: 31320, priceEUR: 4205 },
    { id: '2000-07', varenr: '2000-07', name: { da: 'Multiklipper 1300 mm inkl. blændekit og hydr. tilt', en: 'Multi mower 1300 mm incl. blanking kit and hydr. tilt' }, priceDKK: 34165, priceEUR: 4585 },
    { id: '2000-08', varenr: '2000-08', name: { da: 'Multiklipper 1500 mm inkl. blændekit og hydr. tilt', en: 'Multi mower 1500 mm incl. blanking kit and hydr. tilt' }, priceDKK: 49045, priceEUR: 6585 },
    { id: '2000-09', varenr: '2000-09', name: { da: 'Rotorklipper 1500 mm', en: 'Rotary mower 1500 mm' }, priceDKK: 47020, priceEUR: 6310 },
    { id: '2000-10', varenr: '2000-10', name: { da: 'Multikit inkl. knive (1500 mm)', en: 'Mulching kit incl. blades (1500 mm)' }, priceDKK: 3145, priceEUR: 425 },
    { id: '2000-11', varenr: '2000-11', name: { da: 'Kølerskærm', en: 'Radiator screen' }, priceDKK: 2415, priceEUR: 325 },
    { id: '2000-12', varenr: '2000-12', name: { da: 'Kantskærer inkl. adapter', en: 'Edge cutter incl. adapter' }, priceDKK: 25605, priceEUR: 3435 },
    { id: '2000-13', varenr: '2000-13', name: { da: 'Miljørive', en: 'Environmental rake' }, priceDKK: 16400, priceEUR: 2200 },
    { id: '2000-14', varenr: '2000-14', name: { da: 'Løvsuger', en: 'Leaf vacuum' }, priceDKK: 41315, priceEUR: 5545 },
    { id: '2000-15', varenr: '2000-15', name: { da: 'Slagleklipper', en: 'Flail mower' }, priceDKK: 44135, priceEUR: 5925 },
    { id: '2000-16', varenr: '2000-16', name: { da: 'Vertikalskærersæt', en: 'Scarifier set' }, priceDKK: 745, priceEUR: 100 },
    { id: '2000-17', varenr: '2000-17', name: { da: 'Kontravægte for baghjul', en: 'Counterweights for rear wheels' }, priceDKK: 10800, priceEUR: 1450 },
    { id: '2000-18', varenr: '2000-18', name: { da: 'Arm til hækkeklipper', en: 'Arm for hedge trimmer' }, priceDKK: 44265, priceEUR: 5940 },
    { id: '2000-19', varenr: '2000-19', name: { da: 'Hækkeklipper knivbjælke', en: 'Hedge trimmer cutter bar' }, priceDKK: 19540, priceEUR: 2625 },
    { id: '2000-20', varenr: '2000-20', name: { da: 'Skivehøster (pris mangler)', en: 'Disc mower (price missing)' }, priceDKK: 0, priceEUR: 0 },

    { id: '2620_WINTER_HEADER', varenr: 'HEADER', name: { da: 'Vinteropgaver', en: 'Winter tasks', de: 'Winteraufgaben', it: 'Lavori invernali', hu: 'Teli feladatok' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '3000-01', varenr: '3000-01', name: { da: 'Salt- og grusspreder', en: 'Salt and gravel spreader' }, priceDKK: 42700, priceEUR: 5730 },
    { id: '3000-02', varenr: '3000-02', name: { da: 'Kørselsafhængig spredning', en: 'Speed-dependent spreading' }, priceDKK: 7800, priceEUR: 1045, requires: '3000-01' },
    { id: '3000-03', varenr: '3000-03', name: { da: 'Arbejdslys bag på spreder', en: 'Rear work light on spreader' }, priceDKK: 950, priceEUR: 130, requires: '3000-01' },
    { id: '3000-04', varenr: '3000-04', name: { da: 'Bakkamera bag på spreder', en: 'Rear camera on spreader' }, priceDKK: 2080, priceEUR: 280, requires: '3000-01' },
    { id: '3000-05', varenr: '3000-05', name: { da: 'Sneplov 1300 mm', en: 'Snow plough 1300 mm' }, priceDKK: 21355, priceEUR: 2865 },
    { id: '3000-06', varenr: '3000-06', name: { da: 'V-plov (polyuretan)', en: 'V-plough (polyurethane)' }, priceDKK: 36185, priceEUR: 4855 },
    { id: '3000-07', varenr: '3000-07', name: { da: 'Stålskær for V-plov', en: 'Steel edge for V-plough' }, priceDKK: 1810, priceEUR: 245, requires: '3000-06' },
    { id: '3000-08', varenr: '3000-08', name: { da: 'Svingbar kost 1200 mm', en: 'Pivoting broom 1200 mm' }, priceDKK: 35585, priceEUR: 4775 },
    { id: '3000-09', varenr: '3000-09', name: { da: 'Sneslynge', en: 'Snow blower' }, priceDKK: 39150, priceEUR: 5255 },

    { id: '2620_TRANSPORT_HEADER', varenr: 'HEADER', name: { da: 'Transport', en: 'Transport', de: 'Transport', it: 'Trasporto', hu: 'Szallitas' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '4000-01', varenr: '4000-01', name: { da: 'Vipbar skovl', en: 'Tilting bucket' }, priceDKK: 11610, priceEUR: 1560 },
    { id: '4000-02', varenr: '4000-02', name: { da: 'Tiplad inkl. stativ', en: 'Tip body incl. stand' }, priceDKK: 34860, priceEUR: 4680 },
    { id: '4000-03', varenr: '4000-03', name: { da: 'Ekstra sider til tipvogn', en: 'Extra sides for tip trailer' }, priceDKK: 5915, priceEUR: 795, requires: '4000-02' },
    { id: '4000-04', varenr: '4000-04', name: { da: 'Lyssæt til tipvogn', en: 'Light kit for tip trailer' }, priceDKK: 2415, priceEUR: 325, requires: '4000-02' },
    { id: '4000-05', varenr: '4000-05', name: { da: 'Plastlad', en: 'Plastic body' }, priceDKK: 2790, priceEUR: 375 },

    { id: '2620_MISC_HEADER', varenr: 'HEADER', name: { da: 'Diverse', en: 'Miscellaneous', de: 'Sonstiges', it: 'Varie', hu: 'Egyeb' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '5000-01', varenr: '5000-01', name: { da: 'Undervognsbehandling pr. redskab', en: 'Undercarriage treatment per implement' }, priceDKK: 770, priceEUR: 105 },
  ],
  'Loader Line': [
    // CS-200
    { id: 'LL-CS200-HDR', varenr: 'HEADER', name: { da: 'CS-200', en: 'CS-200', de: 'CS-200', it: 'CS-200', hu: 'CS-200' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '725161', varenr: '725161', name: { da: 'CS-200 Valspreder, manuel reg. Inklusiv svingbar ophængs beslag', en: 'CS-200 Drop spreader, manual adjustment incl. swiveling mounting bracket for Weidemann', de: 'CS-200 Drop spreader, manual adjustment incl. swiveling mounting bracket for Weidemann', it: 'CS-200 Drop spreader, manual adjustment incl. swiveling mounting bracket for Weidemann', hu: 'CS-200 Drop spreader, manual adjustment incl. swiveling mounting bracket for Weidemann' }, priceDKK: 45600, priceEUR: 6140 },
    // Sub-accessories for 725161 (Valspreder)
    { id: '725161__712902', varenr: '712902', name: { da: 'Rustbeskyttelse (Dinitrol 4010) for CS-200', en: 'Rust protection (Dinitrol 4010) for CS-200.', de: 'Rust protection (Dinitrol 4010) for CS-200.', it: 'Rust protection (Dinitrol 4010) for CS-200.', hu: 'Rust protection (Dinitrol 4010) for CS-200.' }, priceDKK: 1150, priceEUR: 155, requires: '725161' },
    { id: '725161__725312', varenr: '725312', name: { da: 'Forhøjningssider / rumindhold 300 liter', en: 'Extension sides / capacity 300 liters.', de: 'Extension sides / capacity 300 liters.', it: 'Extension sides / capacity 300 liters.', hu: 'Extension sides / capacity 300 liters.' }, priceDKK: 3600, priceEUR: 485, requires: '725161' },
    { id: '725161__725121', varenr: '725121', name: { da: 'El mængdereg', en: 'Electric flow control (damper)', de: 'Electric flow control (damper)', it: 'Electric flow control (damper)', hu: 'Electric flow control (damper)' }, priceDKK: 2800, priceEUR: 395, requires: '725161' },
    { id: '725161__725120', varenr: '725120', name: { da: '2 stk. LED arbejdslys bag på spreder', en: '2 pc. LED working light on spreader', de: '2 pc. LED working light on spreader', it: '2 pc. LED working light on spreader', hu: '2 pc. LED working light on spreader' }, priceDKK: 950, priceEUR: 130, requires: '725161' },
    { id: '725161__725747', varenr: '725747', name: { da: 'Presenning for spreder (forhandlermonteret)', en: 'Cover for spreader', de: 'Cover for spreader', it: 'Cover for spreader', hu: 'Cover for spreader' }, priceDKK: 3800, priceEUR: 510, requires: '725161' },
    { id: '725162', varenr: '725162', name: { da: 'CS-200 Combi, manuel reg. Inklusiv svingbar ophængs beslag til Weidemann', en: 'CS-200 Combi spreader, manual adjustment incl. swiveling mounting bracket for Weidemann', de: 'CS-200 Combi spreader, manual adjustment incl. swiveling mounting bracket for Weidemann', it: 'CS-200 Combi spreader, manual adjustment incl. swiveling mounting bracket for Weidemann', hu: 'CS-200 Combi spreader, manual adjustment incl. swiveling mounting bracket for Weidemann' }, priceDKK: 55000, priceEUR: 7400 },
    // Sub-accessories for 725162 (Combi manuel)
    { id: '725162__712902', varenr: '712902', name: { da: 'Rustbeskyttelse (Dinitrol 4010) for CS-200', en: 'Rust protection (Dinitrol 4010) for CS-200.', de: 'Rust protection (Dinitrol 4010) for CS-200.', it: 'Rust protection (Dinitrol 4010) for CS-200.', hu: 'Rust protection (Dinitrol 4010) for CS-200.' }, priceDKK: 1150, priceEUR: 155, requires: '725162' },
    { id: '725162__725312', varenr: '725312', name: { da: 'Forhøjningssider / rumindhold 300 liter', en: 'Extension sides / capacity 300 liters.', de: 'Extension sides / capacity 300 liters.', it: 'Extension sides / capacity 300 liters.', hu: 'Extension sides / capacity 300 liters.' }, priceDKK: 3600, priceEUR: 485, requires: '725162' },
    { id: '725162__725121', varenr: '725121', name: { da: 'El mængdereg', en: 'Electric flow control (damper)', de: 'Electric flow control (damper)', it: 'Electric flow control (damper)', hu: 'Electric flow control (damper)' }, priceDKK: 2800, priceEUR: 395, requires: '725162' },
    { id: '725162__725120', varenr: '725120', name: { da: '2 stk. LED arbejdslys bag på spreder', en: '2 pc. LED working light on spreader', de: '2 pc. LED working light on spreader', it: '2 pc. LED working light on spreader', hu: '2 pc. LED working light on spreader' }, priceDKK: 950, priceEUR: 130, requires: '725162' },
    { id: '725162__725747', varenr: '725747', name: { da: 'Presenning for spreder (forhandlermonteret)', en: 'Cover for spreader', de: 'Cover for spreader', it: 'Cover for spreader', hu: 'Cover for spreader' }, priceDKK: 3800, priceEUR: 510, requires: '725162' },
    { id: '725163', varenr: '725163', name: { da: 'CS-200 Combi, El. reg. Inklusiv svingbar ophængs beslag til Weidemann', en: 'CS-200 Combi spreader, electric adjustment incl. swiveling mounting bracket for Weidemann', de: 'CS-200 Combi spreader, electric adjustment incl. swiveling mounting bracket for Weidemann', it: 'CS-200 Combi spreader, electric adjustment incl. swiveling mounting bracket for Weidemann', hu: 'CS-200 Combi spreader, electric adjustment incl. swiveling mounting bracket for Weidemann' }, priceDKK: 65700, priceEUR: 8840 },
    // Sub-accessories for 725163 (Combi EL) — no 725121 (already has electric adjustment)
    { id: '725163__712902', varenr: '712902', name: { da: 'Rustbeskyttelse (Dinitrol 4010) for CS-200', en: 'Rust protection (Dinitrol 4010) for CS-200.', de: 'Rust protection (Dinitrol 4010) for CS-200.', it: 'Rust protection (Dinitrol 4010) for CS-200.', hu: 'Rust protection (Dinitrol 4010) for CS-200.' }, priceDKK: 1150, priceEUR: 155, requires: '725163' },
    { id: '725163__725312', varenr: '725312', name: { da: 'Forhøjningssider / rumindhold 300 liter', en: 'Extension sides / capacity 300 liters.', de: 'Extension sides / capacity 300 liters.', it: 'Extension sides / capacity 300 liters.', hu: 'Extension sides / capacity 300 liters.' }, priceDKK: 3600, priceEUR: 485, requires: '725163' },
    { id: '725163__725120', varenr: '725120', name: { da: '2 stk. LED arbejdslys bag på spreder', en: '2 pc. LED working light on spreader', de: '2 pc. LED working light on spreader', it: '2 pc. LED working light on spreader', hu: '2 pc. LED working light on spreader' }, priceDKK: 950, priceEUR: 130, requires: '725163' },
    { id: '725163__725747', varenr: '725747', name: { da: 'Presenning for spreder (forhandlermonteret)', en: 'Cover for spreader', de: 'Cover for spreader', it: 'Cover for spreader', hu: 'Cover for spreader' }, priceDKK: 3800, priceEUR: 510, requires: '725163' },
    // Kost med blad
    { id: 'LL-KOST-HDR', varenr: 'HEADER', name: { da: 'Kost med blad', en: 'Sweeper with blade', de: 'Kehrmaschine mit Schild', it: 'Spazzatrice con lama', hu: 'Seprőgép pengével' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '312010', varenr: '312010', name: { da: 'Timan hydr. fejemaskine D1316 med skrabeblad Ø600 mm børster', en: 'Timan hydraulic sweeper S1316 with hydr. swing and hydr. snow blade 1600', de: 'Timan hydraulic sweeper S1316 with hydr. swing and hydr. snow blade 1600', it: 'Timan hydraulic sweeper S1316 with hydr. swing and hydr. snow blade 1600', hu: 'Timan hydraulic sweeper S1316 with hydr. swing and hydr. snow blade 1600' }, priceDKK: 62500, priceEUR: 8420 },
    { id: '312011', varenr: '312011', name: { da: 'Timan hydr. fejemaskine D1518 med skrabeblad Ø600 mm børster', en: 'Timan hydraulic sweeper S1518 with hydr. swing and hydr. snow blade 1800', de: 'Timan hydraulic sweeper S1518 with hydr. swing and hydr. snow blade 1800', it: 'Timan hydraulic sweeper S1518 with hydr. swing and hydr. snow blade 1800', hu: 'Timan hydraulic sweeper S1518 with hydr. swing and hydr. snow blade 1800' }, priceDKK: 65000, priceEUR: 8750 },
    { id: '312015', varenr: '312015', name: { da: 'Flydende ophæng inklusiv 6/2 ventil til Weidemann (passer til 312010 og 312011)', en: 'Floating mount including 6/2 valve for Weidemann (fits both 312010 and 312011)', de: 'Floating mount including 6/2 valve for Weidemann (fits both 312010 and 312011)', it: 'Floating mount including 6/2 valve for Weidemann (fits both 312010 and 312011)', hu: 'Floating mount including 6/2 valve for Weidemann (fits both 312010 and 312011)' }, priceDKK: 15000, priceEUR: 2020 },
    // Tornado 400
    { id: 'LL-TOR-HDR', varenr: 'HEADER', name: { da: 'Tornado 400', en: 'Tornado 400', de: 'Tornado 400', it: 'Tornado 400', hu: 'Tornado 400' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '310100', varenr: '310100', name: { da: 'Tornado 400 fejebredde 135 til 180 cm. 400 liter beholder, 50 liter vandtank', en: 'Tornado 400 sweep width of 135 to 180 cm 400 liter tank, 50 liter water tank', de: 'Tornado 400 sweep width of 135 to 180 cm 400 liter tank, 50 liter water tank', it: 'Tornado 400 sweep width of 135 to 180 cm 400 liter tank, 50 liter water tank', hu: 'Tornado 400 sweep width of 135 to 180 cm 400 liter tank, 50 liter water tank' }, priceDKK: 130000, priceEUR: 17500 },
    { id: '310100__876185', varenr: '876185', name: { da: 'Ophæng til Weidemann', en: 'Mount for Weidemann', de: 'Mount for Weidemann', it: 'Mount for Weidemann', hu: 'Mount for Weidemann' }, priceDKK: 5000, priceEUR: 680, requires: '310100' },
    { id: '310100__310461', varenr: '310461', name: { da: 'Håndsug inkl. 8 meter sugeslange', en: 'External suction hose - 8 meters.', de: 'External suction hose - 8 meters.', it: 'External suction hose - 8 meters.', hu: 'External suction hose - 8 meters.' }, priceDKK: 6500, priceEUR: 875, requires: '310100' },
    // CS-200 til traktor
    { id: 'LL-CS200T-HDR', varenr: 'HEADER', name: { da: 'CS-200 til traktor', en: 'CS-200 for tractor', de: 'CS-200 für Traktor', it: 'CS-200 per trattore', hu: 'CS-200 traktorhoz' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '725135', varenr: '725135', name: { da: 'CS-200 Valspræder, manuel reg.', en: 'CS-200 Drop spreader, manual adjustment (tractor)', de: 'CS-200 Drop spreader, manual adjustment (tractor)', it: 'CS-200 Drop spreader, manual adjustment (tractor)', hu: 'CS-200 Drop spreader, manual adjustment (tractor)' }, priceDKK: 40900, priceEUR: 0 },
    { id: '725135__712902', varenr: '712902', name: { da: 'Rustbeskyttelse (Dinitrol 4010) af CS-200.', en: 'Rust protection (Dinitrol 4010) for CS-200.', de: 'Rust protection (Dinitrol 4010) for CS-200.', it: 'Rust protection (Dinitrol 4010) for CS-200.', hu: 'Rust protection (Dinitrol 4010) for CS-200.' }, priceDKK: 1150, priceEUR: 0, requires: '725135' },
    { id: '725135__725312', varenr: '725312', name: { da: 'Forhøjningssider / rumindhold 300 liter', en: 'Extension sides / capacity 300 liters.', de: 'Extension sides / capacity 300 liters.', it: 'Extension sides / capacity 300 liters.', hu: 'Extension sides / capacity 300 liters.' }, priceDKK: 3600, priceEUR: 0, requires: '725135' },
    { id: '725135__725121', varenr: '725121', name: { da: 'El mængdereg (spjæld) til 725135 / 725136', en: 'Electric flow control (damper) for 725135 / 725136', de: 'Electric flow control (damper) for 725135 / 725136', it: 'Electric flow control (damper) for 725135 / 725136', hu: 'Electric flow control (damper) for 725135 / 725136' }, priceDKK: 2900, priceEUR: 0, requires: '725135' },
    { id: '725135__725120', varenr: '725120', name: { da: '2 stk. LED arbejdslys bag på spreder', en: '2 pc. LED working light on spreader', de: '2 pc. LED working light on spreader', it: '2 pc. LED working light on spreader', hu: '2 pc. LED working light on spreader' }, priceDKK: 950, priceEUR: 0, requires: '725135' },
    { id: '725135__725747', varenr: '725747', name: { da: 'Presenning for spreder (forhandlermonteret)', en: 'Cover for spreader', de: 'Cover for spreader', it: 'Cover for spreader', hu: 'Cover for spreader' }, priceDKK: 3800, priceEUR: 0, requires: '725135' },
    { id: '725136', varenr: '725136', name: { da: 'CS-200 Combi, manuel reg.', en: 'CS-200 Combi spreader, manual adjustment (tractor)', de: 'CS-200 Combi spreader, manual adjustment (tractor)', it: 'CS-200 Combi spreader, manual adjustment (tractor)', hu: 'CS-200 Combi spreader, manual adjustment (tractor)' }, priceDKK: 54900, priceEUR: 0 },
    { id: '725136__712902', varenr: '712902', name: { da: 'Rustbeskyttelse (Dinitrol 4010) af CS-200.', en: 'Rust protection (Dinitrol 4010) for CS-200.', de: 'Rust protection (Dinitrol 4010) for CS-200.', it: 'Rust protection (Dinitrol 4010) for CS-200.', hu: 'Rust protection (Dinitrol 4010) for CS-200.' }, priceDKK: 1150, priceEUR: 0, requires: '725136' },
    { id: '725136__725312', varenr: '725312', name: { da: 'Forhøjningssider / rumindhold 300 liter', en: 'Extension sides / capacity 300 liters.', de: 'Extension sides / capacity 300 liters.', it: 'Extension sides / capacity 300 liters.', hu: 'Extension sides / capacity 300 liters.' }, priceDKK: 3600, priceEUR: 0, requires: '725136' },
    { id: '725136__725121', varenr: '725121', name: { da: 'El mængdereg (spjæld) til 725135 / 725136', en: 'Electric flow control (damper) for 725135 / 725136', de: 'Electric flow control (damper) for 725135 / 725136', it: 'Electric flow control (damper) for 725135 / 725136', hu: 'Electric flow control (damper) for 725135 / 725136' }, priceDKK: 2900, priceEUR: 0, requires: '725136' },
    { id: '725136__725120', varenr: '725120', name: { da: '2 stk. LED arbejdslys bag på spreder', en: '2 pc. LED working light on spreader', de: '2 pc. LED working light on spreader', it: '2 pc. LED working light on spreader', hu: '2 pc. LED working light on spreader' }, priceDKK: 950, priceEUR: 0, requires: '725136' },
    { id: '725136__725747', varenr: '725747', name: { da: 'Presenning for spreder (forhandlermonteret)', en: 'Cover for spreader', de: 'Cover for spreader', it: 'Cover for spreader', hu: 'Cover for spreader' }, priceDKK: 3800, priceEUR: 0, requires: '725136' },
    { id: '725142', varenr: '725142', name: { da: 'CS-200 Combi, El. reg.', en: 'CS-200 Combi spreader, electric adjustment (tractor)', de: 'CS-200 Combi spreader, electric adjustment (tractor)', it: 'CS-200 Combi spreader, electric adjustment (tractor)', hu: 'CS-200 Combi spreader, electric adjustment (tractor)' }, priceDKK: 60800, priceEUR: 0 },
    { id: '725142__712902', varenr: '712902', name: { da: 'Rustbeskyttelse (Dinitrol 4010) af CS-200.', en: 'Rust protection (Dinitrol 4010) for CS-200.', de: 'Rust protection (Dinitrol 4010) for CS-200.', it: 'Rust protection (Dinitrol 4010) for CS-200.', hu: 'Rust protection (Dinitrol 4010) for CS-200.' }, priceDKK: 1150, priceEUR: 0, requires: '725142' },
    { id: '725142__725312', varenr: '725312', name: { da: 'Forhøjningssider / rumindhold 300 liter', en: 'Extension sides / capacity 300 liters.', de: 'Extension sides / capacity 300 liters.', it: 'Extension sides / capacity 300 liters.', hu: 'Extension sides / capacity 300 liters.' }, priceDKK: 3600, priceEUR: 0, requires: '725142' },
    { id: '725142__725120', varenr: '725120', name: { da: '2 stk. LED arbejdslys bag på spreder', en: '2 pc. LED working light on spreader', de: '2 pc. LED working light on spreader', it: '2 pc. LED working light on spreader', hu: '2 pc. LED working light on spreader' }, priceDKK: 950, priceEUR: 0, requires: '725142' },
    { id: '725142__725747', varenr: '725747', name: { da: 'Presenning for spreder (forhandlermonteret)', en: 'Cover for spreader', de: 'Cover for spreader', it: 'Cover for spreader', hu: 'Cover for spreader' }, priceDKK: 3800, priceEUR: 0, requires: '725142' },
  ],
};

// Helper to get localized text
export function getLocalizedName(name: string | { da: string; en: string; [key: string]: string | undefined }, lang: Language = 'da'): string {
  if (typeof name === 'string') return name;
  // English fallback before Danish so mixed-language modals don't leak DA text
  // when a non-DA language is selected but the value isn't translated.
  return name[lang] || name.en || name.da || '';
}

// Get price based on language/currency
export function getPrice(item: { priceDKK: number; priceEUR: number }, lang: Language = 'da'): number {
  const isEUR = ['en', 'de', 'it', 'hu'].includes(lang);
  return isEUR ? item.priceEUR : item.priceDKK;
}

// Format money
export function formatMoney(amount: number, lang: Language = 'da', negative = false): string {
  if (typeof amount !== 'number' || isNaN(amount)) amount = 0;
  const isEUR = ['en', 'de', 'it', 'hu'].includes(lang);
  const currencySuffix = isEUR ? ' €' : ' kr.';
  const locale = isEUR ? 'de-DE' : 'da-DK';
  const sign = negative && amount > 0 ? '-' : '';
  const displayAmount = isEUR ? amount : Math.ceil(amount);
  const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: isEUR ? 2 : 0 }).format(displayAmount);
  return sign + formatted + currencySuffix;
}

// ===== LOOSE TOOL ACCESSORY MERGE =====
const LOOSE_TERMIT_ITEMS: Accessory[] = [
  { id:'LOES-HGM-20083', varenr:'HGM-20083',
    name:{ da:'Løs - Fingerklipper for Termit-arm', en:'Loose - Finger mower for Termit arm', de:'Lose - Fingerbalkenmäher für Termit-Arm', it:'Sciolto - Barra falciante a dita per braccio Termit', hu:'Különálló - Ujjas kasza Termit karhoz' },
    priceDKK:19400, priceEUR:2615,
    videoUrl:'https://www.youtube.com/watch?v=o3XLURc8qiU',
    imageUrl:'https://img.youtube.com/vi/o3XLURc8qiU/maxresdefault.jpg'
  },
  { id:'LOES-HGM-20082', varenr:'HGM-20082',
    name:{ da:'Løs - Multitrimmer for Termit-arm', en:'Loose - Multi trimmer for Termit arm', de:'Lose - Multitrimmer für Termit-Arm', it:'Sciolto - Multitrimmer per braccio Termit', hu:'Különálló - Multitrimmer Termit karhoz' },
    priceDKK:56835, priceEUR:7650,
    videoUrl:'https://www.youtube.com/watch?v=9Fvwy_rJ_oQ',
    imageUrl:'https://img.youtube.com/vi/9Fvwy_rJ_oQ/maxresdefault.jpg'
  },
  { id:'LOES-730033', varenr:'730033',
    name:{ da:'Løs - Termit-arm for 3330 inkl. hydraulisk sving', en:'Loose - Termit arm for 3330 incl. hydraulic swing', de:'Lose - Termit-Arm für 3330 inkl. hydraulischem Schwenk', it:'Sciolto - Braccio Termit per 3330 incl. brandeggio idraulico', hu:'Különálló - Termit kar 3330-hoz hidraulikus forgással' },
    priceDKK:72800, priceEUR:9800
  },
  { id:'LOES-730034', varenr:'730034',
    name:{ da:'Løs - Termit-arm for 3330 ekskl. hydraulisk sving', en:'Loose - Termit arm for 3330 excl. hydraulic swing', de:'Lose - Termit-Arm für 3330 exkl. hydraulischem Schwenk', it:'Sciolto - Braccio Termit per 3330 escl. brandeggio idraulico', hu:'Különálló - Termit kar 3330-hoz hidraulikus forgás nélkül' },
    priceDKK:59000, priceEUR:7945
  }
];

const ALLOWED_EXTRA_VARENR = new Set(['411891', '411908']);
const LOOSE_3330_WEEDBRUSH_VARENR = new Set(['730600', '730601', '50101017', '50101018', '50101019', '50101020']);

export function getLooseToolAccessories(): Accessory[] {
  const rcAll = ACCESSORIES['RC-1000S'] || [];
  const timanAll = ACCESSORIES['Timan 3330'] || [];

  function findRedskabHeaderIndex(list: Accessory[]) {
    return list.findIndex(a => {
      if (!a?.isHeader) return false;
      const name = typeof a.name === 'string' ? a.name : (a.name as any)?.da || '';
      return name.toLowerCase().includes('redskab');
    });
  }

  const rcStartIdx = findRedskabHeaderIndex(rcAll);
  const rcRedskaberRaw = rcStartIdx === -1 ? [] : rcAll.slice(rcStartIdx);
  // Exclude RAL color (961050) from Loose attachment flow
  const rcRedskaber = rcRedskaberRaw.filter(item => String(item?.varenr || '') !== ACC_ID_RAL_COLOR);

  const timanStartIdx = findRedskabHeaderIndex(timanAll);
  const timanRedskaberRaw = timanStartIdx === -1 ? [] : timanAll.slice(timanStartIdx);
  // Exclude 721122 from Loose attachment flow
  const timanRedskaber = timanRedskaberRaw.filter(item => String(item?.varenr || '') !== '721122');

  // Inject "Redskaber til Timan 3330" heading before Feje/Sug Redskaber section
  const timan3330Header: Accessory = {
    id: 'LOOSE_TIMAN3330_HEADER',
    varenr: '',
    name: {
      da: 'Redskaber til Timan 3330',
      en: 'Attachments for Timan 3330',
      de: 'Attachments for Timan 3330',
      it: 'Attachments for Timan 3330',
      hu: 'Attachments for Timan 3330',
    },
    priceDKK: 0,
    priceEUR: 0,
    isHeader: true,
  };

  // Remap 3330 weed brush items for loose tool context
  const timanRedskaberForLoose = timanRedskaber.map(item => {
    if (!item || item.isHeader) return item;
    const varenr = String(item.varenr || '');
    let next: Accessory = item;
    // For loose-tool flow, swap factory-mount 721122 sub-item with
    // retrofit 721059 under the T2/T3 collection tank sweeper trigger items.
    if (PACKAGING_TRIGGER_IDS.includes(varenr) && Array.isArray(item.subItems)) {
      const remappedSubs = item.subItems.map(sub => {
        if (!sub) return sub;
        if (String(sub.varenr || '') !== '721122') return sub;
        return {
          ...sub,
          id: `721059_${varenr}`,
          varenr: '721059',
          name: {
            da: 'Centerslange til T2 Timan 3330 (eftermontering)',
            en: 'Center hose for T2 Timan 3330 (retrofit)',
            de: 'Zentralschlauch für T2 Timan 3330 (Nachrüstung)',
            it: 'Tubo centrale per T2 Timan 3330 (retrofit)',
            hu: 'Központi tömlő T2 Timan 3330 (utólagos)',
          },
          priceDKK: 2550,
          priceEUR: 345,
        };
      });
      next = { ...item, subItems: remappedSubs };
    }
    if (!LOOSE_3330_WEEDBRUSH_VARENR.has(varenr)) return next;
    const cloned = { ...next, id: `LT3330_${next.id || varenr}` };
    if (varenr !== '730600') cloned.requires = 'LT3330_730600';
    return cloned;
  });

  // Insert termit items before 730107
  const timanWithTermit: Accessory[] = [];
  let termitInserted = false;
  timanRedskaberForLoose.forEach(item => {
    if (!termitInserted && String(item?.varenr || '') === '730107') {
      timanWithTermit.push(...LOOSE_TERMIT_ITEMS);
      termitInserted = true;
    }
    timanWithTermit.push(item);
  });
  if (!termitInserted) timanWithTermit.push(...LOOSE_TERMIT_ITEMS);

  // Extra items from both lists
  const extras = [...rcAll, ...timanAll].filter(item =>
    item && !item.isHeader && ALLOWED_EXTRA_VARENR.has(String(item.varenr))
  );

  // Inject 721059 (Centerslange eftermontering) — only available under Løse redskaber
  const looseOnly721059: Accessory = {
    id: '721059',
    varenr: '721059',
    name: { da: 'Centerslange til T2 Timan 3330 (eftermontering)', en: 'Center hose for T2 Timan 3330 (retrofit)', de: 'Zentralschlauch für T2 Timan 3330 (Nachrüstung)', it: 'Tubo centrale per T2 Timan 3330 (retrofit)', hu: 'Központi tömlő T2 Timan 3330 (utólagos)' },
    priceDKK: 2550,
    priceEUR: 345,
  };

  const merged = [...rcRedskaber, timan3330Header, ...timanWithTermit, looseOnly721059, ...extras];

  // Add packaging cost item (hidden)
  merged.push({
    id: PACKAGING_COST_ID,
    varenr: PACKAGING_COST_ID,
    name: { da: 'Specialpalle for løse T2 eller T3 enheder', en: 'Special pallet for loose T2 or T3 units', de: 'Spezialpalette für lose T2- oder T3-Einheiten', it: 'Pallet speciale per unità T2 o T3 sciolte', hu: 'Speciális raklap laza T2 vagy T3 egységekhez' },
    priceDKK: 840,
    priceEUR: 112,
    hidden: true
  });

  // Deduplicate
  const seen = new Set<string>();
  return merged.filter(item => {
    if (!item) return false;
    const key = item.id ? `id:${item.id}` : item.varenr ? `v:${item.varenr}` : null;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Flatten accessories including sub-items
export function getAccessoriesFlat(machineType: string): Accessory[] {
  const base = machineType === LOOSE_TOOL_KEY ? getLooseToolAccessories() : (ACCESSORIES[machineType] || []);
  const out: Accessory[] = [];
  const seen = new Set<string>();

  function walk(item: Accessory) {
    if (!item) return;
    const key = item.id ? `id:${item.id}` : null;
    if (!key || !seen.has(key)) {
      out.push(item);
      if (key) seen.add(key);
    }
    if (item.subItems) {
      for (const sub of item.subItems) {
        walk(sub as unknown as Accessory);
      }
    }
  }

  base.forEach(walk);
  return out;
}

export function getMachineById(id: string): Machine | undefined {
  return PRODUCTS[id];
}

// Legacy compatibility
export const machines = Object.values(PRODUCTS);
