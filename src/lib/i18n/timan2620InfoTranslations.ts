/**
 * Timan 2620 — Redskabsinformation / Udstyrsinformation translations.
 *
 * These keys extend the central `translations.ts` registry (they are spread
 * into every language dictionary there), so they are resolved with the normal
 * `t(key, uiLanguage)` helper and follow the global portal language selector.
 *
 * Every key MUST be present in all 9 portal languages — no Danish fallback.
 * Model designations (DS-250, Perkins, ROPS, LED, USB/MP3, 112) stay unchanged.
 */
import type { PortalUiLanguage } from '@/lib/portalLanguages';

type Row = Record<PortalUiLanguage, string>;

const ENTRIES: Record<string, Row> = {
  // ------------------------------------------------------------- Sidebar / nav
  m2620i_information: {
    da: 'Information', en: 'Information', de: 'Information', it: 'Informazioni',
    hu: 'Információ', sv: 'Information', fr: 'Informations', pl: 'Informacje', cs: 'Informace',
  },
  m2620i_redskab_title: {
    da: 'Redskabsinformation', en: 'Attachment information', de: 'Anbaugeräte-Informationen',
    it: 'Informazioni attrezzature', hu: 'Munkaeszköz-információk', sv: 'Redskapsinformation',
    fr: 'Informations sur les accessoires', pl: 'Informacje o osprzęcie', cs: 'Informace o nářadí',
  },
  m2620i_udstyr_title: {
    da: 'Udstyrsinformation', en: 'Equipment information', de: 'Ausstattungsinformationen',
    it: 'Informazioni sull’equipaggiamento', hu: 'Felszereltségi információk',
    sv: 'Utrustningsinformation', fr: 'Informations sur l’équipement',
    pl: 'Informacje o wyposażeniu', cs: 'Informace o vybavení',
  },

  // ------------------------------------------------------------------- Skovl
  m2620i_bucket_name: {
    da: 'Skovl', en: 'Bucket', de: 'Schaufel', it: 'Benna', hu: 'Kanál',
    sv: 'Skopa', fr: 'Godet', pl: 'Łyżka', cs: 'Lopata',
  },
  m2620i_sub_front: {
    da: 'Frontredskab', en: 'Front attachment', de: 'Frontanbaugerät', it: 'Attrezzatura frontale',
    hu: 'Frontmunkaeszköz', sv: 'Frontredskap', fr: 'Outil frontal', pl: 'Osprzęt przedni',
    cs: 'Čelní nářadí',
  },
  m2620i_bucket_desc: {
    da: 'Frontskovl til let flytning af materialer og oprydning på små områder.',
    en: 'Front bucket for light material handling and tidying up small areas.',
    de: 'Frontschaufel zum leichten Umsetzen von Material und Aufräumen kleiner Flächen.',
    it: 'Benna frontale per la movimentazione leggera di materiali e la pulizia di piccole aree.',
    hu: 'Frontkanál anyagok könnyű mozgatásához és kisebb területek rendbetételéhez.',
    sv: 'Frontskopa för lätt materialhantering och uppstädning av mindre ytor.',
    fr: 'Godet frontal pour la manutention légère de matériaux et le nettoyage de petites surfaces.',
    pl: 'Łyżka czołowa do lekkiego przemieszczania materiałów i porządkowania małych powierzchni.',
    cs: 'Čelní lopata pro lehkou manipulaci s materiálem a úklid menších ploch.',
  },
  m2620i_bucket_b1: {
    da: 'Godt overblik', en: 'Good visibility', de: 'Gute Übersicht', it: 'Buona visibilità',
    hu: 'Jó áttekinthetőség', sv: 'God överblick', fr: 'Bonne visibilité',
    pl: 'Dobra widoczność', cs: 'Dobrý výhled',
  },
  m2620i_bucket_b2: {
    da: 'Nem montering', en: 'Easy mounting', de: 'Einfache Montage', it: 'Montaggio semplice',
    hu: 'Egyszerű felszerelés', sv: 'Enkel montering', fr: 'Montage facile',
    pl: 'Łatwy montaż', cs: 'Snadná montáž',
  },
  m2620i_bucket_b3: {
    da: 'Praktisk frontredskab', en: 'Practical front attachment', de: 'Praktisches Frontanbaugerät',
    it: 'Attrezzatura frontale pratica', hu: 'Praktikus frontmunkaeszköz',
    sv: 'Praktiskt frontredskap', fr: 'Outil frontal pratique', pl: 'Praktyczny osprzęt przedni',
    cs: 'Praktické čelní nářadí',
  },

  // ------------------------------------------------------------------ V-plov
  m2620i_vplow_name: {
    da: 'V-plov', en: 'V-plough', de: 'V-Pflug', it: 'Vomere a V', hu: 'V-eke',
    sv: 'V-plog', fr: 'Lame en V', pl: 'Pług V', cs: 'Radlice V',
  },
  m2620i_sub_winter_tool: {
    da: 'Vinterredskab', en: 'Winter attachment', de: 'Winteranbaugerät',
    it: 'Attrezzatura invernale', hu: 'Téli munkaeszköz', sv: 'Vinterredskap',
    fr: 'Outil d’hiver', pl: 'Osprzęt zimowy', cs: 'Zimní nářadí',
  },
  m2620i_vplow_desc: {
    da: 'V-ploven er et fleksibelt redskab til effektiv snerydning. Med tre hydrauliske indstillinger kan ploven tilpasses forskellige forhold og bruges til både at bryde gennem større snemængder og lede sneen effektivt væk.',
    en: 'The V-plough is a flexible attachment for efficient snow clearing. With three hydraulic settings it adapts to different conditions and can both break through larger volumes of snow and guide the snow efficiently away.',
    de: 'Der V-Pflug ist ein flexibles Anbaugerät für effiziente Schneeräumung. Mit drei hydraulischen Stellungen passt er sich unterschiedlichen Bedingungen an und kann sowohl größere Schneemengen durchbrechen als auch den Schnee wirksam zur Seite führen.',
    it: 'Il vomere a V è un’attrezzatura versatile per uno sgombero neve efficiente. Con tre regolazioni idrauliche si adatta a diverse condizioni e consente sia di aprire varchi in grandi quantità di neve sia di deviarla efficacemente.',
    hu: 'A V-eke rugalmas munkaeszköz a hatékony hóeltakarításhoz. Három hidraulikus állásával különböző körülményekhez igazítható, így nagyobb hótömegek áttörésére és a hó hatékony elvezetésére is alkalmas.',
    sv: 'V-plogen är ett flexibelt redskap för effektiv snöröjning. Med tre hydrauliska inställningar anpassas plogen till olika förhållanden och kan både bryta genom större snömängder och leda undan snön effektivt.',
    fr: 'La lame en V est un outil polyvalent pour un déneigement efficace. Ses trois réglages hydrauliques permettent de l’adapter à différentes conditions, aussi bien pour percer d’importantes accumulations de neige que pour l’évacuer efficacement.',
    pl: 'Pług V to uniwersalny osprzęt do skutecznego odśnieżania. Trzy ustawienia hydrauliczne pozwalają dopasować go do różnych warunków – zarówno do przebijania większych zasp, jak i do sprawnego odprowadzania śniegu.',
    cs: 'Radlice V je flexibilní nářadí pro účinné odklízení sněhu. Díky třem hydraulickým polohám ji lze přizpůsobit různým podmínkám a použít jak k proražení větších sněhových závějí, tak k účinnému odvádění sněhu.',
  },
  m2620i_vplow_b1: {
    da: '3 hydrauliske indstillinger', en: '3 hydraulic settings', de: '3 hydraulische Stellungen',
    it: '3 regolazioni idrauliche', hu: '3 hidraulikus állás', sv: '3 hydrauliska inställningar',
    fr: '3 réglages hydrauliques', pl: '3 ustawienia hydrauliczne', cs: '3 hydraulické polohy',
  },
  m2620i_vplow_b2: {
    da: 'V-, Y- og spidsplov', en: 'V, Y and straight blade positions',
    de: 'V-, Y- und Spitzpflug-Stellung', it: 'Posizioni a V, a Y e a punta',
    hu: 'V, Y és ék állás', sv: 'V-, Y- och spetsplog',
    fr: 'Positions en V, en Y et en pointe', pl: 'Ustawienie V, Y i klinowe',
    cs: 'Polohy V, Y a klín',
  },
  m2620i_vplow_b3: {
    da: 'Fleksibel og sikker snerydning', en: 'Flexible and safe snow clearing',
    de: 'Flexible und sichere Schneeräumung', it: 'Sgombero neve flessibile e sicuro',
    hu: 'Rugalmas és biztonságos hóeltakarítás', sv: 'Flexibel och säker snöröjning',
    fr: 'Déneigement flexible et sûr', pl: 'Elastyczne i bezpieczne odśnieżanie',
    cs: 'Flexibilní a bezpečné odklízení sněhu',
  },

  // --------------------------------------------------------------- Dozerblad
  m2620i_dozer_name: {
    da: 'Dozerblad', en: 'Dozer blade', de: 'Dozerschild', it: 'Lama dozer', hu: 'Tolólap',
    sv: 'Dozerblad', fr: 'Lame de nivellement', pl: 'Lemiesz', cs: 'Radlice',
  },
  m2620i_dozer_desc: {
    da: 'Dozerblad til snerydning og planering, hvor maskinen skal arbejde tæt på underlaget.',
    en: 'Dozer blade for snow clearing and levelling where the machine works close to the surface.',
    de: 'Dozerschild für Schneeräumung und Planierarbeiten, bei denen die Maschine dicht am Untergrund arbeitet.',
    it: 'Lama dozer per lo sgombero neve e il livellamento, quando la macchina lavora a filo del terreno.',
    hu: 'Tolólap hóeltakarításhoz és tereprendezéshez, amikor a gép a talajhoz közel dolgozik.',
    sv: 'Dozerblad för snöröjning och planering där maskinen arbetar nära underlaget.',
    fr: 'Lame de nivellement pour le déneigement et le nivellement lorsque la machine travaille au ras du sol.',
    pl: 'Lemiesz do odśnieżania i wyrównywania, gdy maszyna pracuje blisko podłoża.',
    cs: 'Radlice pro odklízení sněhu a urovnávání, kde stroj pracuje těsně u povrchu.',
  },
  m2620i_dozer_b1: {
    da: 'Stabilt blad', en: 'Stable blade', de: 'Stabiles Schild', it: 'Lama stabile',
    hu: 'Stabil lap', sv: 'Stabilt blad', fr: 'Lame stable', pl: 'Stabilny lemiesz',
    cs: 'Stabilní radlice',
  },
  m2620i_dozer_b2: {
    da: 'Let manøvrering', en: 'Easy manoeuvring', de: 'Leichtes Manövrieren',
    it: 'Manovrabilità facile', hu: 'Könnyű manőverezés', sv: 'Lätt manövrering',
    fr: 'Manœuvre aisée', pl: 'Łatwe manewrowanie', cs: 'Snadné manévrování',
  },
  m2620i_dozer_b3: {
    da: 'Velegnet til vinterbrug', en: 'Well suited for winter use',
    de: 'Gut geeignet für den Wintereinsatz', it: 'Ideale per l’impiego invernale',
    hu: 'Téli használatra is kiválóan alkalmas', sv: 'Väl lämpat för vinterbruk',
    fr: 'Parfaitement adaptée à l’usage hivernal', pl: 'Idealny do pracy zimą',
    cs: 'Vhodná pro zimní provoz',
  },

  // -------------------------------------------------------------- Saltspreder
  m2620i_salt_name: {
    da: 'Saltspreder', en: 'Salt spreader', de: 'Salzstreuer', it: 'Spargisale', hu: 'Sószóró',
    sv: 'Saltspridare', fr: 'Épandeur de sel', pl: 'Posypywarka', cs: 'Sypač soli',
  },
  m2620i_sub_winter_equip: {
    da: 'Vinterudstyr', en: 'Winter equipment', de: 'Winterausrüstung',
    it: 'Equipaggiamento invernale', hu: 'Téli felszerelés', sv: 'Vinterutrustning',
    fr: 'Équipement d’hiver', pl: 'Wyposażenie zimowe', cs: 'Zimní vybavení',
  },
  m2620i_salt_desc: {
    da: 'DS-250 er en salt- og grusspreder til effektiv glatførebekæmpelse. Sprederen monteres på maskinens lad og giver mulighed for at tilpasse spredningen til opgaven.',
    en: 'The DS-250 is a salt and grit spreader for effective ice control. It is mounted on the machine’s load bed and lets you adapt the spread pattern to the task.',
    de: 'Der DS-250 ist ein Salz- und Splittstreuer für wirksamen Winterdienst. Er wird auf der Ladefläche der Maschine montiert und lässt sich an die jeweilige Aufgabe anpassen.',
    it: 'Il DS-250 è uno spargisale e spargighiaia per un efficace trattamento antighiaccio. Viene montato sul cassone della macchina e consente di adattare lo spargimento al tipo di intervento.',
    hu: 'A DS-250 só- és zúzalékszóró a hatékony síkosságmentesítéshez. A gép rakfelületére szerelhető, és a szórás az adott feladathoz igazítható.',
    sv: 'DS-250 är en salt- och grusspridare för effektiv halkbekämpning. Spridaren monteras på maskinens flak och spridningen kan anpassas efter uppgiften.',
    fr: 'Le DS-250 est un épandeur de sel et de gravillons pour un traitement hivernal efficace. Il se monte sur le plateau de la machine et permet d’adapter l’épandage à la tâche.',
    pl: 'DS-250 to posypywarka do soli i grysu, zapewniająca skuteczne zwalczanie śliskości. Montowana jest na skrzyni ładunkowej maszyny i umożliwia dopasowanie posypywania do zadania.',
    cs: 'DS-250 je sypač soli a drti pro účinnou zimní údržbu. Montuje se na ložnou plochu stroje a umožňuje přizpůsobit sypání dané úloze.',
  },
  m2620i_salt_b1: {
    da: 'Salt- og grusspredning', en: 'Salt and grit spreading', de: 'Salz- und Splittstreuung',
    it: 'Spargimento di sale e ghiaia', hu: 'Só- és zúzalékszórás', sv: 'Salt- och grusspridning',
    fr: 'Épandage de sel et de gravillons', pl: 'Posypywanie solą i grysem',
    cs: 'Sypání soli a drti',
  },
  m2620i_salt_b2: {
    da: 'Justerbar spredning', en: 'Adjustable spread', de: 'Einstellbare Streubreite',
    it: 'Spargimento regolabile', hu: 'Állítható szórás', sv: 'Justerbar spridning',
    fr: 'Épandage réglable', pl: 'Regulowane posypywanie', cs: 'Nastavitelné sypání',
  },
  m2620i_salt_b3: {
    da: 'Nem påfyldning og betjening', en: 'Easy filling and operation',
    de: 'Einfaches Befüllen und Bedienen', it: 'Riempimento e utilizzo semplici',
    hu: 'Egyszerű feltöltés és kezelés', sv: 'Enkel påfyllning och manövrering',
    fr: 'Remplissage et utilisation faciles', pl: 'Łatwe napełnianie i obsługa',
    cs: 'Snadné plnění a ovládání',
  },
  m2620i_salt_x1_label: {
    da: 'Kørselsafhængig spredning', en: 'Speed-dependent spreading',
    de: 'Fahrgeschwindigkeitsabhängige Streuung', it: 'Spargimento proporzionale alla velocità',
    hu: 'Menetsebességtől függő szórás', sv: 'Hastighetsberoende spridning',
    fr: 'Épandage asservi à la vitesse', pl: 'Posypywanie zależne od prędkości',
    cs: 'Sypání závislé na rychlosti jízdy',
  },
  m2620i_salt_x1_value: {
    da: 'Tilpasser spredningen efter maskinens kørehastighed.',
    en: 'Adjusts the spread to the machine’s driving speed.',
    de: 'Passt die Streumenge an die Fahrgeschwindigkeit der Maschine an.',
    it: 'Adatta lo spargimento alla velocità di marcia della macchina.',
    hu: 'A szórást a gép menetsebességéhez igazítja.',
    sv: 'Anpassar spridningen efter maskinens körhastighet.',
    fr: 'Adapte l’épandage à la vitesse de déplacement de la machine.',
    pl: 'Dostosowuje posypywanie do prędkości jazdy maszyny.',
    cs: 'Přizpůsobuje sypání rychlosti jízdy stroje.',
  },
  m2620i_salt_x2_label: {
    da: 'Arbejdslys bag på spreder', en: 'Work light on rear of spreader',
    de: 'Arbeitsscheinwerfer hinten am Streuer', it: 'Faro da lavoro sul retro dello spargitore',
    hu: 'Munkalámpa a szóró hátulján', sv: 'Arbetsbelysning bak på spridaren',
    fr: 'Éclairage de travail à l’arrière de l’épandeur',
    pl: 'Światło robocze z tyłu posypywarki', cs: 'Pracovní světlo vzadu na sypači',
  },
  m2620i_salt_x2_value: {
    da: 'Giver bedre udsyn ved arbejde i mørke.',
    en: 'Provides better visibility when working in the dark.',
    de: 'Sorgt für bessere Sicht bei Arbeiten in der Dunkelheit.',
    it: 'Garantisce una migliore visibilità durante il lavoro al buio.',
    hu: 'Jobb látási viszonyokat biztosít sötétben végzett munkánál.',
    sv: 'Ger bättre sikt vid arbete i mörker.',
    fr: 'Offre une meilleure visibilité lors du travail de nuit.',
    pl: 'Zapewnia lepszą widoczność podczas pracy po zmroku.',
    cs: 'Zajišťuje lepší viditelnost při práci za tmy.',
  },
  m2620i_salt_x3_label: {
    da: 'Bakkamera bag på spreder', en: 'Reversing camera on rear of spreader',
    de: 'Rückfahrkamera hinten am Streuer', it: 'Telecamera di retromarcia sul retro dello spargitore',
    hu: 'Tolatókamera a szóró hátulján', sv: 'Backkamera bak på spridaren',
    fr: 'Caméra de recul à l’arrière de l’épandeur',
    pl: 'Kamera cofania z tyłu posypywarki', cs: 'Couvací kamera vzadu na sypači',
  },
  m2620i_salt_x3_value: {
    da: 'Giver bedre overblik bag maskinen ved bakning.',
    en: 'Gives a better view behind the machine when reversing.',
    de: 'Bietet beim Rückwärtsfahren einen besseren Überblick hinter der Maschine.',
    it: 'Offre una migliore visuale dietro la macchina durante la retromarcia.',
    hu: 'Jobb rálátást ad a gép mögötti területre tolatáskor.',
    sv: 'Ger bättre överblick bakom maskinen vid backning.',
    fr: 'Offre une meilleure vue à l’arrière de la machine en marche arrière.',
    pl: 'Zapewnia lepszy widok za maszyną podczas cofania.',
    cs: 'Poskytuje lepší přehled za strojem při couvání.',
  },

  // ---------------------------------------------------------------- Fodpedal
  m2620i_fodpedal_name: {
    da: 'Fodpedal', en: 'Foot pedal', de: 'Fußpedal', it: 'Pedale', hu: 'Lábpedál',
    sv: 'Fotpedal', fr: 'Pédale', pl: 'Pedał nożny', cs: 'Nožní pedál',
  },
  m2620i_sub_operation: {
    da: 'Betjening', en: 'Operation', de: 'Bedienung', it: 'Comandi', hu: 'Kezelés',
    sv: 'Manövrering', fr: 'Commande', pl: 'Obsługa', cs: 'Ovládání',
  },
  m2620i_fodpedal_desc: {
    da: 'Fodpedal i førerpladsens fodrum til præcis betjening af kørsel og hastighed.',
    en: 'Foot pedal in the operator footwell for precise control of travel and speed.',
    de: 'Fußpedal im Fußraum des Fahrerplatzes zur präzisen Steuerung von Fahrt und Geschwindigkeit.',
    it: 'Pedale nel vano piedi del posto di guida per un controllo preciso di marcia e velocità.',
    hu: 'Lábpedál a vezetőállás lábterében a haladás és a sebesség pontos vezérléséhez.',
    sv: 'Fotpedal i förarplatsens fotutrymme för exakt styrning av körning och hastighet.',
    fr: 'Pédale dans le plancher du poste de conduite pour un contrôle précis de l’avancement et de la vitesse.',
    pl: 'Pedał nożny w podłodze stanowiska operatora do precyzyjnego sterowania jazdą i prędkością.',
    cs: 'Nožní pedál v prostoru pro nohy na stanovišti obsluhy pro přesné řízení jízdy a rychlosti.',
  },
  m2620i_fodpedal_b1: {
    da: 'Trinløs regulering', en: 'Stepless control', de: 'Stufenlose Regulierung',
    it: 'Regolazione continua', hu: 'Fokozatmentes szabályozás', sv: 'Steglös reglering',
    fr: 'Réglage progressif', pl: 'Bezstopniowa regulacja', cs: 'Plynulá regulace',
  },
  m2620i_fodpedal_b2: {
    da: 'Ergonomisk placering', en: 'Ergonomic position', de: 'Ergonomische Anordnung',
    it: 'Posizione ergonomica', hu: 'Ergonomikus elhelyezés', sv: 'Ergonomisk placering',
    fr: 'Position ergonomique', pl: 'Ergonomiczne rozmieszczenie', cs: 'Ergonomické umístění',
  },
  m2620i_fodpedal_b3: {
    da: 'Fri sigt til redskabet', en: 'Clear view of the attachment',
    de: 'Freie Sicht auf das Anbaugerät', it: 'Visuale libera sull’attrezzatura',
    hu: 'Szabad kilátás a munkaeszközre', sv: 'Fri sikt mot redskapet',
    fr: 'Vue dégagée sur l’outil', pl: 'Swobodny widok na osprzęt',
    cs: 'Volný výhled na nářadí',
  },

  // ------------------------------------------- Redskaber — kommende (inaktive)
  m2620i_soon_rotorklipper: {
    da: 'Rotorklipper', en: 'Rotary mower', de: 'Sichelmäher', it: 'Trinciaerba rotativo',
    hu: 'Rotoros fűnyíró', sv: 'Rotorklippare', fr: 'Tondeuse rotative',
    pl: 'Kosiarka rotacyjna', cs: 'Rotační sekačka',
  },
  m2620i_soon_multiklipper: {
    da: 'Multiklipper', en: 'Multi mower', de: 'Multimäher', it: 'Trinciatrice multiuso',
    hu: 'Multifunkciós fűnyíró', sv: 'Multiklippare', fr: 'Tondeuse multifonction',
    pl: 'Kosiarka wielofunkcyjna', cs: 'Multifunkční sekačka',
  },
  m2620i_soon_skivehoester: {
    da: 'Skivehøster', en: 'Disc mower', de: 'Scheibenmähwerk', it: 'Falciatrice a dischi',
    hu: 'Tárcsás kasza', sv: 'Skivslåtter', fr: 'Faucheuse à disques',
    pl: 'Kosiarka dyskowa', cs: 'Diskový žací stroj',
  },
  m2620i_soon_graesopsamler: {
    da: 'Græsopsamler', en: 'Grass collector', de: 'Grasfangbehälter',
    it: 'Raccoglierba', hu: 'Fűgyűjtő', sv: 'Gräsuppsamlare', fr: 'Bac de ramassage',
    pl: 'Kosz na trawę', cs: 'Sběrný koš na trávu',
  },
  m2620i_soon_sugetank: {
    da: 'Sugetank', en: 'Suction tank', de: 'Saugtank', it: 'Serbatoio di aspirazione',
    hu: 'Szívótartály', sv: 'Sugtank', fr: 'Cuve d’aspiration', pl: 'Zbiornik ssący',
    cs: 'Sací nádrž',
  },
  m2620i_soon_ukrudtsboerste: {
    da: 'Ukrudtsbørste', en: 'Weed brush', de: 'Wildkrautbürste', it: 'Spazzola diserbante',
    hu: 'Gyomkefe', sv: 'Ogräsborste', fr: 'Brosse de désherbage',
    pl: 'Szczotka do chwastów', cs: 'Kartáč na plevel',
  },
  m2620i_soon_svingbarkost: {
    da: 'Svingbar kost', en: 'Swivelling brush', de: 'Schwenkbare Kehrbürste',
    it: 'Spazzola orientabile', hu: 'Elforgatható seprőkefe', sv: 'Svängbar kost',
    fr: 'Balai orientable', pl: 'Szczotka uchylna', cs: 'Výkyvný kartáč',
  },

  // -------------------------------------------- Udstyr — kommende (inaktive)
  m2620i_uso_comfortseat: {
    da: 'Luftaffjedret Comfort sæde med kunstlæder og justerbar armlæn',
    en: 'Air-suspended Comfort seat with synthetic leather and adjustable armrest',
    de: 'Luftgefederter Comfort-Sitz mit Kunstleder und verstellbarer Armlehne',
    it: 'Sedile Comfort ad ammortizzazione pneumatica in similpelle con bracciolo regolabile',
    hu: 'Légrugós Comfort ülés műbőr kárpittal és állítható karfával',
    sv: 'Luftfjädrad Comfort-stol med konstläder och justerbart armstöd',
    fr: 'Siège Comfort à suspension pneumatique en simili-cuir avec accoudoir réglable',
    pl: 'Fotel Comfort na zawieszeniu pneumatycznym ze skóry ekologicznej z regulowanym podłokietnikiem',
    cs: 'Vzduchem odpružená sedačka Comfort z umělé kůže s nastavitelnou loketní opěrkou',
  },
  m2620i_uso_deluxeseat: {
    da: 'Luftaffjedret Deluxe stofsæde med sædevarme og justerbar armlæn',
    en: 'Air-suspended Deluxe fabric seat with seat heating and adjustable armrest',
    de: 'Luftgefederter Deluxe-Stoffsitz mit Sitzheizung und verstellbarer Armlehne',
    it: 'Sedile Deluxe in tessuto ad ammortizzazione pneumatica con riscaldamento e bracciolo regolabile',
    hu: 'Légrugós Deluxe szövetülés ülésfűtéssel és állítható karfával',
    sv: 'Luftfjädrad Deluxe tygstol med stolvärme och justerbart armstöd',
    fr: 'Siège Deluxe en tissu à suspension pneumatique avec chauffage et accoudoir réglable',
    pl: 'Fotel Deluxe na zawieszeniu pneumatycznym z tapicerką materiałową, podgrzewaniem i regulowanym podłokietnikiem',
    cs: 'Vzduchem odpružená látková sedačka Deluxe s vyhříváním a nastavitelnou loketní opěrkou',
  },
  m2620i_uso_cruise: {
    da: 'Elektrisk fartpilot', en: 'Electric cruise control', de: 'Elektrischer Tempomat',
    it: 'Cruise control elettrico', hu: 'Elektromos sebességtartó', sv: 'Elektrisk farthållare',
    fr: 'Régulateur de vitesse électrique', pl: 'Elektryczny tempomat',
    cs: 'Elektrický tempomat',
  },
  m2620i_uso_biooil: {
    da: 'Bio hydraulikolie', en: 'Bio hydraulic oil', de: 'Bio-Hydrauliköl',
    it: 'Olio idraulico biodegradabile', hu: 'Bio hidraulikaolaj', sv: 'Biohydraulolja',
    fr: 'Huile hydraulique biodégradable', pl: 'Biodegradowalny olej hydrauliczny',
    cs: 'Bio hydraulický olej',
  },
  m2620i_uso_monitor: {
    da: 'Monitor for kamera', en: 'Monitor for camera', de: 'Monitor für Kamera',
    it: 'Monitor per telecamera', hu: 'Monitor a kamerához', sv: 'Monitor för kamera',
    fr: 'Moniteur pour caméra', pl: 'Monitor do kamery', cs: 'Monitor pro kameru',
  },
  m2620i_uso_camera_nozzle: {
    da: 'Kamera for sugemundstykke', en: 'Camera for suction nozzle',
    de: 'Kamera für Saugmund', it: 'Telecamera per bocchetta di aspirazione',
    hu: 'Kamera a szívófejhez', sv: 'Kamera för sugmunstycke',
    fr: 'Caméra pour buse d’aspiration', pl: 'Kamera dyszy ssącej',
    cs: 'Kamera pro sací hubici',
  },
  m2620i_uso_rearcam: {
    da: 'Bakkamera på bagenden', en: 'Reversing camera at the rear',
    de: 'Rückfahrkamera am Heck', it: 'Telecamera di retromarcia posteriore',
    hu: 'Tolatókamera a gép hátulján', sv: 'Backkamera bak',
    fr: 'Caméra de recul à l’arrière', pl: 'Kamera cofania z tyłu',
    cs: 'Couvací kamera vzadu',
  },
  m2620i_uso_reversealarm: {
    da: 'Bakalarm', en: 'Reversing alarm', de: 'Rückfahrwarner', it: 'Avvisatore di retromarcia',
    hu: 'Tolatásjelző', sv: 'Backvarnare', fr: 'Alarme de recul',
    pl: 'Sygnał cofania', cs: 'Couvací alarm',
  },
  m2620i_uso_towhitch: {
    da: 'Kombitræk kugle/gaffel', en: 'Combined towing hitch, ball/fork',
    de: 'Kombianhängerkupplung Kugel/Gabel', it: 'Gancio di traino combinato sfera/forcella',
    hu: 'Kombinált vonóhorog, gömb/villa', sv: 'Kombidrag kula/gaffel',
    fr: 'Attelage combiné boule/chape', pl: 'Zaczep kombinowany kula/widelec',
    cs: 'Kombinované tažné zařízení koule/vidlice',
  },
  m2620i_uso_rearlift: {
    da: 'Hydraulisk baglift', en: 'Hydraulic rear lift', de: 'Hydraulische Heckhydraulik',
    it: 'Sollevatore posteriore idraulico', hu: 'Hidraulikus hátsó emelő',
    sv: 'Hydraulisk baklyft', fr: 'Relevage arrière hydraulique',
    pl: 'Hydrauliczny podnośnik tylny', cs: 'Hydraulický zadní zvedák',
  },
  m2620i_uso_holder: {
    da: 'Skovl- og kosteholder', en: 'Shovel and broom holder',
    de: 'Schaufel- und Besenhalter', it: 'Supporto per pala e scopa',
    hu: 'Lapát- és seprűtartó', sv: 'Skyffel- och kvasthållare',
    fr: 'Support pour pelle et balai', pl: 'Uchwyt na łopatę i miotłę',
    cs: 'Držák lopaty a koštěte',
  },
  m2620i_uso_mudflaps: {
    da: 'Stænkskærm sæt, 4 stk.', en: 'Mudguard set, 4 pcs.', de: 'Schmutzfängersatz, 4 Stück',
    it: 'Set parafanghi, 4 pz.', hu: 'Sárvédő készlet, 4 db', sv: 'Stänkskärmssats, 4 st.',
    fr: 'Jeu de garde-boue, 4 pièces', pl: 'Zestaw błotników, 4 szt.',
    cs: 'Sada blatníků, 4 ks',
  },
  m2620i_uso_underseal: {
    da: 'Undervognsbehandling (anbefales til vinterbrug)',
    en: 'Underbody protection (recommended for winter use)',
    de: 'Unterbodenschutz (für den Wintereinsatz empfohlen)',
    it: 'Trattamento sottoscocca (consigliato per l’uso invernale)',
    hu: 'Alvázvédelem (téli használathoz ajánlott)',
    sv: 'Underredsbehandling (rekommenderas för vinterbruk)',
    fr: 'Traitement de soubassement (recommandé pour l’usage hivernal)',
    pl: 'Zabezpieczenie podwozia (zalecane do pracy zimą)',
    cs: 'Ochrana podvozku (doporučeno pro zimní provoz)',
  },
  m2620i_uso_cab: {
    da: 'Førerhus inkl. varme, lys og spejle (ROPS)',
    en: 'Cab incl. heating, lights and mirrors (ROPS)',
    de: 'Fahrerkabine inkl. Heizung, Beleuchtung und Spiegel (ROPS)',
    it: 'Cabina con riscaldamento, luci e specchi (ROPS)',
    hu: 'Vezetőfülke fűtéssel, világítással és tükrökkel (ROPS)',
    sv: 'Hytt inkl. värme, belysning och speglar (ROPS)',
    fr: 'Cabine avec chauffage, éclairage et rétroviseurs (ROPS)',
    pl: 'Kabina z ogrzewaniem, oświetleniem i lusterkami (ROPS)',
    cs: 'Kabina včetně topení, osvětlení a zrcátek (ROPS)',
  },
  m2620i_uso_ac: {
    da: 'Aircondition', en: 'Air conditioning', de: 'Klimaanlage', it: 'Aria condizionata',
    hu: 'Légkondicionáló', sv: 'Luftkonditionering', fr: 'Climatisation',
    pl: 'Klimatyzacja', cs: 'Klimatizace',
  },
  m2620i_uso_radio: {
    da: 'Bluetooth radio med USB/MP3', en: 'Bluetooth radio with USB/MP3',
    de: 'Bluetooth-Radio mit USB/MP3', it: 'Radio Bluetooth con USB/MP3',
    hu: 'Bluetooth rádió USB/MP3 lejátszással', sv: 'Bluetooth-radio med USB/MP3',
    fr: 'Radio Bluetooth avec USB/MP3', pl: 'Radio Bluetooth z USB/MP3',
    cs: 'Bluetooth rádio s USB/MP3',
  },
  m2620i_uso_sunshade: {
    da: 'Solskærm justerbar', en: 'Adjustable sun visor', de: 'Verstellbare Sonnenblende',
    it: 'Parasole regolabile', hu: 'Állítható napellenző', sv: 'Justerbart solskydd',
    fr: 'Pare-soleil réglable', pl: 'Regulowana osłona przeciwsłoneczna',
    cs: 'Nastavitelná sluneční clona',
  },
  m2620i_uso_heatedmirrors: {
    da: 'Opvarmede spejle', en: 'Heated mirrors', de: 'Beheizte Spiegel',
    it: 'Specchi riscaldati', hu: 'Fűthető tükrök', sv: 'Uppvärmda speglar',
    fr: 'Rétroviseurs chauffants', pl: 'Podgrzewane lusterka', cs: 'Vyhřívaná zrcátka',
  },
  m2620i_uso_worklights_front: {
    da: 'Arbejdslys foran (2 stk.)', en: 'Front work lights (2 pcs.)',
    de: 'Arbeitsscheinwerfer vorne (2 Stück)', it: 'Fari da lavoro anteriori (2 pz.)',
    hu: 'Első munkalámpák (2 db)', sv: 'Arbetsbelysning fram (2 st.)',
    fr: 'Éclairages de travail avant (2 pièces)', pl: 'Światła robocze z przodu (2 szt.)',
    cs: 'Přední pracovní světla (2 ks)',
  },
  m2620i_uso_worklights_rear: {
    da: 'Arbejdslys bag (1 stk.)', en: 'Rear work light (1 pc.)',
    de: 'Arbeitsscheinwerfer hinten (1 Stück)', it: 'Faro da lavoro posteriore (1 pz.)',
    hu: 'Hátsó munkalámpa (1 db)', sv: 'Arbetsbelysning bak (1 st.)',
    fr: 'Éclairage de travail arrière (1 pièce)', pl: 'Światło robocze z tyłu (1 szt.)',
    cs: 'Zadní pracovní světlo (1 ks)',
  },
  m2620i_uso_beacon: {
    da: 'Rotorblink', en: 'Rotating beacon', de: 'Rundumkennleuchte',
    it: 'Girofaro', hu: 'Forgó villogó', sv: 'Roterande varningsljus',
    fr: 'Gyrophare', pl: 'Lampa ostrzegawcza obrotowa', cs: 'Maják',
  },
  m2620i_uso_strobes: {
    da: 'Blitzlys for og bag på kabinen', en: 'Strobe lights front and rear on the cab',
    de: 'Blitzleuchten vorne und hinten an der Kabine',
    it: 'Luci stroboscopiche anteriori e posteriori sulla cabina',
    hu: 'Villanófények a fülke elején és hátulján',
    sv: 'Blixtljus fram och bak på hytten',
    fr: 'Feux à éclats avant et arrière sur la cabine',
    pl: 'Lampy błyskowe z przodu i z tyłu kabiny',
    cs: 'Blikající světla vpředu a vzadu na kabině',
  },
  m2620i_uso_slidingwindows: {
    da: 'Skyderuder H/V side', en: 'Sliding windows, right/left side',
    de: 'Schiebefenster rechts/links', it: 'Finestrini scorrevoli lato destro/sinistro',
    hu: 'Tolóablakok jobb/bal oldalon', sv: 'Skjutrutor höger/vänster sida',
    fr: 'Vitres coulissantes côté droit/gauche', pl: 'Szyby przesuwne prawa/lewa strona',
    cs: 'Posuvná okna vpravo/vlevo',
  },
  m2620i_uso_extinguisher: {
    da: '112 brandslukker i kabine', en: '112 fire extinguisher in the cab',
    de: '112 Feuerlöscher in der Kabine', it: 'Estintore 112 in cabina',
    hu: '112 tűzoltó készülék a fülkében', sv: '112 brandsläckare i hytten',
    fr: 'Extincteur 112 en cabine', pl: 'Gaśnica 112 w kabinie',
    cs: 'Hasicí přístroj 112 v kabině',
  },
  m2620i_uso_plateholder: {
    da: 'Nummerpladeholder for og bag', en: 'Number plate holder, front and rear',
    de: 'Kennzeichenhalter vorne und hinten', it: 'Portatarga anteriore e posteriore',
    hu: 'Rendszámtábla-tartó elöl és hátul', sv: 'Nummerplåtshållare fram och bak',
    fr: 'Support de plaque avant et arrière', pl: 'Uchwyt tablicy rejestracyjnej z przodu i z tyłu',
    cs: 'Držák registrační značky vpředu a vzadu',
  },
};

const LANGS: PortalUiLanguage[] = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];

export const TIMAN_2620_INFO_TRANSLATIONS = Object.fromEntries(
  LANGS.map((lang) => [
    lang,
    Object.fromEntries(Object.entries(ENTRIES).map(([key, row]) => [key, row[lang]])),
  ]),
) as Record<PortalUiLanguage, Record<string, string>>;

export const TIMAN_2620_INFO_KEYS = Object.keys(ENTRIES);
