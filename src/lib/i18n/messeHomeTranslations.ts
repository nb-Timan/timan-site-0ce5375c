/**
 * Timan Messe home page (tile grid) translations.
 *
 * Spread into the central `translations.ts` registry so they resolve with
 * `t(key, uiLanguage)` and follow the global portal language selector.
 * All 9 portal languages are required — no Danish leakage.
 */
import type { PortalUiLanguage } from '@/lib/portalLanguages';

type Row = Record<PortalUiLanguage, string>;

const ENTRIES: Record<string, Row> = {
  mh_welcome: {
    da: 'Velkommen til Timan Messe', en: 'Welcome to Timan Exhibition',
    de: 'Willkommen bei Timan Messe', it: 'Benvenuti a Timan Fiera',
    hu: 'Üdvözöljük a Timan kiállításon', sv: 'Välkommen till Timan Mässa',
    fr: 'Bienvenue au salon Timan', pl: 'Witamy na targach Timan',
    cs: 'Vítejte na veletrhu Timan',
  },
  mh_intro: {
    da: 'Vælg en mulighed for at udforske Timan.', en: 'Choose an option to explore Timan.',
    de: 'Wählen Sie eine Option, um Timan zu entdecken.', it: 'Scegli un’opzione per esplorare Timan.',
    hu: 'Válasszon egy lehetőséget a Timan felfedezéséhez.', sv: 'Välj ett alternativ för att utforska Timan.',
    fr: 'Choisissez une option pour découvrir Timan.', pl: 'Wybierz opcję, aby poznać Timan.',
    cs: 'Vyberte možnost a prozkoumejte Timan.',
  },
  mh_configurator: {
    da: 'Konfigurator', en: 'Configurator', de: 'Konfigurator', it: 'Configuratore',
    hu: 'Konfigurátor', sv: 'Konfigurator', fr: 'Configurateur', pl: 'Konfigurator',
    cs: 'Konfigurátor',
  },
  mh_configurator_desc: {
    da: 'Byg din egen Timan-maskine', en: 'Build your own Timan machine',
    de: 'Bauen Sie Ihre eigene Timan-Maschine', it: 'Configura la tua macchina Timan',
    hu: 'Építse meg saját Timan gépét', sv: 'Bygg din egen Timan-maskin',
    fr: 'Composez votre machine Timan', pl: 'Zbuduj własną maszynę Timan',
    cs: 'Sestavte si vlastní stroj Timan',
  },
  mh_partner_map: {
    da: 'Find forhandler', en: 'Find dealer', de: 'Händler finden', it: 'Trova rivenditore',
    hu: 'Kereskedő keresése', sv: 'Hitta återförsäljare', fr: 'Trouver un revendeur',
    pl: 'Znajdź dealera', cs: 'Najít prodejce',
  },
  mh_partner_map_desc: {
    da: 'Forhandlere, importører og servicepartnere', en: 'Dealers, importers and service partners',
    de: 'Händler, Importeure und Servicepartner', it: 'Rivenditori, importatori e service partner',
    hu: 'Kereskedők, importőrök és szervizpartnerek', sv: 'Återförsäljare, importörer och servicepartner',
    fr: 'Revendeurs, importateurs et partenaires de service',
    pl: 'Dealerzy, importerzy i partnerzy serwisowi', cs: 'Prodejci, dovozci a servisní partneři',
  },
  mh_machine_brochure_desc: {
    da: 'Brochure og maskininformation', en: 'Brochure and machine information',
    de: 'Broschüre und Maschineninformationen', it: 'Brochure e informazioni sulla macchina',
    hu: 'Brosúra és gépinformációk', sv: 'Broschyr och maskininformation',
    fr: 'Brochure et informations machine', pl: 'Broszura i informacje o maszynie',
    cs: 'Brožura a informace o stroji',
  },
  mh_2620_desc: {
    da: 'Udforsk maskinen i 360° med udstyrsvalg',
    en: 'Explore the machine in 360° with equipment options',
    de: 'Erkunden Sie die Maschine in 360° mit Ausstattungsoptionen',
    it: 'Esplora la macchina a 360° con le opzioni di equipaggiamento',
    hu: 'Fedezze fel a gépet 360°-ban, felszereltségi opciókkal',
    sv: 'Utforska maskinen i 360° med utrustningsval',
    fr: 'Explorez la machine à 360° avec les options d’équipement',
    pl: 'Poznaj maszynę w 360° z opcjami wyposażenia',
    cs: 'Prozkoumejte stroj v 360° s možnostmi vybavení',
  },
  mh_video: {
    da: 'Video Akademi', en: 'Video Academy', de: 'Video-Akademie', it: 'Video Academy',
    hu: 'Videó Akadémia', sv: 'Videoakademi', fr: 'Académie vidéo', pl: 'Akademia wideo',
    cs: 'Video akademie',
  },
  mh_video_desc: {
    da: 'Maskinvideoer og guides', en: 'Machine videos and guides',
    de: 'Maschinenvideos und Anleitungen', it: 'Video e guide delle macchine',
    hu: 'Gépvideók és útmutatók', sv: 'Maskinvideor och guider',
    fr: 'Vidéos et guides machines', pl: 'Filmy i poradniki o maszynach',
    cs: 'Videa strojů a návody',
  },
  mh_news: {
    da: 'Seneste nyt', en: 'Latest news', de: 'Neuigkeiten', it: 'Ultime notizie',
    hu: 'Legfrissebb hírek', sv: 'Senaste nytt', fr: 'Actualités', pl: 'Najnowsze wiadomości',
    cs: 'Nejnovější zprávy',
  },
  mh_news_desc: {
    da: 'Nyt fra Timan-verdenen', en: 'News from the Timan world',
    de: 'Neues aus der Timan-Welt', it: 'Notizie dal mondo Timan',
    hu: 'Hírek a Timan világából', sv: 'Nytt från Timans värld',
    fr: 'Actualités de l’univers Timan', pl: 'Nowości ze świata Timan',
    cs: 'Novinky ze světa Timan',
  },
  mh_quick_actions: {
    da: 'Hurtige handlinger', en: 'Quick actions', de: 'Schnellzugriffe', it: 'Azioni rapide',
    hu: 'Gyors műveletek', sv: 'Snabbåtgärder', fr: 'Actions rapides', pl: 'Szybkie akcje',
    cs: 'Rychlé akce',
  },
  mh_drift: {
    da: 'Driftberegner', en: 'Operating cost calculator', de: 'Betriebskostenrechner',
    it: 'Calcolatore dei costi di esercizio', hu: 'Üzemköltség-kalkulátor',
    sv: 'Driftskostnadskalkylator', fr: 'Calculateur de coûts d’exploitation',
    pl: 'Kalkulator kosztów eksploatacji', cs: 'Kalkulačka provozních nákladů',
  },
  mh_co2: {
    da: 'CO2 Kalkulator', en: 'CO2 Calculator', de: 'CO2-Rechner', it: 'Calcolatore CO2',
    hu: 'CO2 kalkulátor', sv: 'CO2-kalkylator', fr: 'Calculateur CO2', pl: 'Kalkulator CO2',
    cs: 'Kalkulačka CO2',
  },
  mh_preview: {
    da: 'Du forhåndsviser Timan Messe', en: 'Previewing Timan Exhibition',
    de: 'Vorschau Timan Messe', it: 'Anteprima Timan Fiera',
    hu: 'Timan Kiállítás előnézet', sv: 'Förhandsvisning av Timan Mässa',
    fr: 'Aperçu du salon Timan', pl: 'Podgląd targów Timan',
    cs: 'Náhled veletrhu Timan',
  },
  mh_disabled: {
    da: 'Messeadgang er ikke aktiv lige nu.', en: 'Exhibition access is currently disabled.',
    de: 'Der Messezugang ist derzeit nicht aktiv.', it: 'L’accesso alla fiera è attualmente disattivato.',
    hu: 'A kiállítási hozzáférés jelenleg nem aktív.', sv: 'Mässåtkomsten är för närvarande inaktiv.',
    fr: 'L’accès au salon est actuellement désactivé.', pl: 'Dostęp do targów jest obecnie wyłączony.',
    cs: 'Přístup na veletrh je momentálně vypnutý.',
  },
};

const LANGS: PortalUiLanguage[] = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];

export const MESSE_HOME_TRANSLATIONS = LANGS.reduce((acc, lang) => {
  acc[lang] = Object.fromEntries(
    Object.entries(ENTRIES).map(([key, row]) => [key, row[lang]]),
  );
  return acc;
}, {} as Record<PortalUiLanguage, Record<string, string>>);

export const MESSE_HOME_TRANSLATION_KEYS = Object.keys(ENTRIES);
