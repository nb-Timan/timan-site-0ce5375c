import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Gauge,
  ListChecks,
  Settings,
  
  Wrench,
} from 'lucide-react';
import MesseSubpageHeader from '@/components/messe/MesseSubpageHeader';
import MesseModal from '@/components/messe/MesseModal';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { portalLanguageLookupOrder, type PortalUiLanguage } from '@/lib/portalLanguages';
import { MESSE_MACHINE_EXTRA_TRANSLATIONS } from '@/lib/i18n/messeMachineTranslations';
import iconSlope from '@/assets/rc1000s-icon-14.png.asset.json';
import iconStability from '@/assets/rc1000s-icon-15.png.asset.json';
import iconService from '@/assets/rc1000s-icon-16.png.asset.json';
import iconSeason from '@/assets/rc1000s-icon-17.png.asset.json';

type MachineKey = 'rc-751' | 'rc-1000s' | 'timan-2620' | 'timan-3330';
type Localized = Partial<Record<PortalUiLanguage, string>> & { da: string; en: string };

const T: Record<string, Localized> = {
  back: { da: 'Tilbage', en: 'Back', de: 'Zuruck', it: 'Indietro', hu: 'Vissza' },
  brochure: { da: 'Brochure', en: 'Brochure', de: 'Broschure', it: 'Brochure', hu: 'Brosura' },
  documents: { da: 'Dokumenter', en: 'Documents', de: 'Dokumente', it: 'Documenti', hu: 'Dokumentumok' },
  technicalSheet: { da: 'Teknisk datablad', en: 'Technical data sheet', de: 'Technisches Datenblatt', it: 'Scheda tecnica', hu: 'Muszaki adatlap' },
  openBrochure: { da: 'Åbn brochure', en: 'Open brochure', de: 'Broschure offnen', it: 'Apri brochure', hu: 'Brosura megnyitasa' },
  openData: { da: 'Se tekniske data', en: 'View technical data', de: 'Technische Daten ansehen', it: 'Vedi dati tecnici', hu: 'Muszaki adatok megtekintese' },
  openNew: { da: 'Åbn PDF', en: 'Open PDF', de: 'PDF offnen', it: 'Apri PDF', hu: 'PDF megnyitasa' },
  previous: { da: 'Forrige', en: 'Previous', de: 'Zuruck', it: 'Precedente', hu: 'Elozo' },
  next: { da: 'Næste', en: 'Next', de: 'Weiter', it: 'Successivo', hu: 'Kovetkezo' },
  close: { da: 'Luk', en: 'Close', de: 'Schliessen', it: 'Chiudi', hu: 'Bezaras' },
  overview: { da: 'Overblik', en: 'Overview', de: 'Uberblick', it: 'Panoramica', hu: 'Attekintes' },
  keyPoints: { da: 'Styrker', en: 'Strengths', de: 'Starken', it: 'Punti forti', hu: 'Erossegek' },
  specs: { da: 'Tekniske data', en: 'Technical data', de: 'Technische Daten', it: 'Dati tecnici', hu: 'Muszaki adatok' },
  tools: { da: 'Redskaber', en: 'Attachments', de: 'Anbaugerate', it: 'Accessori', hu: 'Adapterek' },
  page: { da: 'side', en: 'page', de: 'Seite', it: 'pagina', hu: 'oldal' },
  moreAbout: { da: 'Mere om maskinen', en: 'More about the machine', de: 'Mehr zur Maschine', it: 'Maggiori informazioni', hu: 'Tovabbi informacio' },
};

interface MachineContent {
  eyebrow: Localized;
  intro: Localized;
  attachmentLabel?: Localized;
  attachmentCount?: string;
  highlights: Localized[];
  /** Optional explicit top cards (title + supporting line). Falls back to `highlights`. */
  cards?: Array<{ title?: Localized; text: Localized }>;
  specs: Array<{ label: Localized; value: Localized }>;
  attachments?: Localized[];
  dataPdfSrc?: string;
  viewerHref?: string;
  viewerImageSrc?: string;
  viewerTitle?: Localized;
  viewerLabel?: Localized;
}

type TechnicalSection = {
  title: Localized;
  rows: Array<{ label: Localized; value: Localized }>;
};

const AUTO_TRANSLATIONS: Partial<Record<string, Partial<Record<PortalUiLanguage, string>>>> = {
  'Tekniske specifikationer': { de: 'Technische Daten', it: 'Specifiche tecniche', hu: 'Muszaki adatok' },
  'Dimensioner': { de: 'Abmessungen', it: 'Dimensioni', hu: 'Meretek' },
  'Ekstraudstyr': { de: 'Sonderausstattung', it: 'Accessori opzionali', hu: 'Opcionalis felszereles' },
  'Dimensioner med slagleklipper': { de: 'Abmessungen mit Schlegelmaher', it: 'Dimensioni con trincia', hu: 'Meretek szarzuzoval' },
  'Hydraulik og el': { de: 'Hydraulik und Elektrik', it: 'Idraulica ed elettrico', hu: 'Hidraulika es elektromossag' },
  'Lydniveau': { de: 'Gerauschpegel', it: 'Livello sonoro', hu: 'Zajszint' },
  'Motor - Briggs & Stratton': { de: 'Motor - Briggs & Stratton', it: 'Motore - Briggs & Stratton', hu: 'Motor - Briggs & Stratton' },
  'Motor - Vanguard': { de: 'Motor - Vanguard', it: 'Motore - Vanguard', hu: 'Motor - Vanguard' },
  'Motor': { de: 'Motor', it: 'Motore', hu: 'Motor' },
  'Transmission til larvebånd': { de: 'Raupenantrieb', it: 'Trasmissione cingoli', hu: 'Lanctalpas hajtas' },
  'Transmission til slagleklipper': { de: 'Antrieb Schlegelmaher', it: 'Trasmissione trincia', hu: 'Szarzuzo hajtasa' },
  'Antal Y-slagler': { de: 'Anzahl Y-Schlegel', it: 'Numero di coltelli a Y', hu: 'Y-kesek szama' },
  'Maks. arbejdshældning i alle retninger': { de: 'Max. Arbeitsneigung in alle Richtungen', it: 'Pendenza max. di lavoro in tutte le direzioni', hu: 'Max. munkadoles minden iranyban' },
  'Maks. arbejdshastighed': { de: 'Max. Arbeitsgeschwindigkeit', it: 'Velocita max. di lavoro', hu: 'Max. munkasebesseg' },
  'Maks. betjeningsafstand': { de: 'Max. Bedienabstand', it: 'Distanza max. di comando', hu: 'Max. kezeloi tavolsag' },
  'Venderadius': { de: 'Wenderadius', it: 'Raggio di sterzata', hu: 'Fordulasi sugar' },
  'Brændstofforbrug': { de: 'Kraftstoffverbrauch', it: 'Consumo carburante', hu: 'Uzemanyag-fogyasztas' },
  'Teoretisk maks. output': { de: 'Theoretische max. Leistung', it: 'Resa teorica max.', hu: 'Elmeleti max. teljesitmeny' },
  'Teoretisk maks. output med slagleklipper': { de: 'Theoretische max. Leistung mit Schlegelmaher', it: 'Resa teorica max. con trincia', hu: 'Elmeleti max. teljesitmeny szarzuzoval' },
  'Vægt': { de: 'Gewicht', it: 'Peso', hu: 'Tomeg' },
  'Total vægt': { de: 'Gesamtgewicht', it: 'Peso totale', hu: 'Ossztomeg' },
  'Total længde': { de: 'Gesamtlange', it: 'Lunghezza totale', hu: 'Teljes hossz' },
  'Total bredde': { de: 'Gesamtbreite', it: 'Larghezza totale', hu: 'Teljes szelesseg' },
  'Total højde': { de: 'Gesamthohe', it: 'Altezza totale', hu: 'Teljes magassag' },
  'Klippebredde': { de: 'Schnittbreite', it: 'Larghezza di taglio', hu: 'Vagasi szelesseg' },
  'Klippehøjde': { de: 'Schnitthohe', it: 'Altezza di taglio', hu: 'Vagasi magassag' },
  'Spikes på bælter': { de: 'Spikes auf Raupen', it: 'Spikes sui cingoli', hu: 'Tuskek a lanctalpakon' },
  'Blitzlys': { de: 'Blitzlicht', it: 'Lampeggiante', hu: 'Villogofeny' },
  'L-slagler': { de: 'L-Schlegel', it: 'Coltelli a L', hu: 'L-kesek' },
  'Lader': { de: 'Ladegerat', it: 'Caricabatterie', hu: 'Tolto' },
  'Hk / kW': { de: 'PS / kW', it: 'CV / kW', hu: 'LE / kW' },
  'Benzintank': { de: 'Kraftstofftank', it: 'Serbatoio benzina', hu: 'Benzintartaly' },
  'Antal cylindere': { de: 'Anzahl Zylinder', it: 'Numero cilindri', hu: 'Hengerek szama' },
  'Slagvolumen': { de: 'Hubraum', it: 'Cilindrata', hu: 'Hengerurtartalom' },
  'Kølesystem': { de: 'Kuhlsystem', it: 'Sistema di raffreddamento', hu: 'Hutorendszer' },
  'Hastighed': { de: 'Geschwindigkeit', it: 'Velocita', hu: 'Sebesseg' },
  'Hjulmotorer': { de: 'Radmotoren', it: 'Motori ruota', hu: 'Kerekmotorok' },
  'Kapacitet udtag front': { de: 'Leistung Frontausgang', it: 'Portata uscita anteriore', hu: 'Elso kiadas teljesitmenye' },
  'Kapacitet udtag bag': { de: 'Leistung Heckausgang', it: 'Portata uscita posteriore', hu: 'Hatso kiadas teljesitmenye' },
  'Olieudtag front': { de: 'Olanschluss vorne', it: 'Uscita olio anteriore', hu: 'Elso olajcsatlakozo' },
  'Olieudtag bag': { de: 'Olanschluss hinten', it: 'Uscita olio posteriore', hu: 'Hatso olajcsatlakozo' },
  'Arbejdshydraulik': { de: 'Arbeitshydraulik', it: 'Idraulica di lavoro', hu: 'Munkahidraulika' },
  'Liftarm': { de: 'Hubarm', it: 'Braccio di sollevamento', hu: 'Emelokar' },
  'Løftekapacitet': { de: 'Hubkraft', it: 'Capacita di sollevamento', hu: 'Emelesi kapacitas' },
  'Elsystem': { de: 'Elektrik', it: 'Impianto elettrico', hu: 'Elektromos rendszer' },
  'Generator': { de: 'Generator', it: 'Alternatore', hu: 'Generator' },
  'Køre- og arbejdslys frem': { de: 'Fahr- und Arbeitslicht vorn', it: 'Luci anteriori guida/lavoro', hu: 'Elso menet- es munkafeny' },
  'Arbejdslys bag': { de: 'Arbeitslicht hinten', it: 'Luce lavoro posteriore', hu: 'Hatso munkafeny' },
  'Rotorblink': { de: 'Rundumleuchte', it: 'Girofaro', hu: 'Forgovillogo' },
  '13-polet trailerstik': { de: '13-poliger Anhangerstecker', it: 'Presa rimorchio 13 poli', hu: '13 polusu potkocsi csatlakozo' },
  'Radio med Bluetooth': { de: 'Radio mit Bluetooth', it: 'Radio con Bluetooth', hu: 'Bluetooth radio' },
  'Køreklar vægt': { de: 'Betriebsgewicht', it: 'Peso operativo', hu: 'Uzemkesz tomeg' },
  'Længde': { de: 'Lange', it: 'Lunghezza', hu: 'Hossz' },
  'Bredde': { de: 'Breite', it: 'Larghezza', hu: 'Szelesseg' },
  'Højde': { de: 'Hohe', it: 'Altezza', hu: 'Magassag' },
  'Indstigningshøjde': { de: 'Einstiegshohe', it: 'Altezza accesso', hu: 'Beszallasi magassag' },
  'Venderadius (indv.)': { de: 'Wenderadius (innen)', it: 'Raggio di sterzata (interno)', hu: 'Fordulasi sugar (belso)' },
  'Venderadius (udv.)': { de: 'Wenderadius (aussen)', it: 'Raggio di sterzata (esterno)', hu: 'Fordulasi sugar (kulso)' },
  'Aircondition': { de: 'Klimaanlage', it: 'Aria condizionata', hu: 'Legkondicionalo' },
  'Skyderuder i højre og venstre side': { de: 'Schiebefenster rechts und links', it: 'Finestrini scorrevoli destra/sinistra', hu: 'Tolhato ablak jobb es bal oldalon' },
  'Luftsæde': { de: 'Luftsitz', it: 'Sedile pneumatico', hu: 'Legrugos ules' },
  'Tilvalg': { de: 'Optional', it: 'Opzionale', hu: 'Opcionalis' },
  'Hydraulisk': { de: 'Hydraulisch', it: 'Idraulica', hu: 'Hidraulikus' },
  'Mekanisk': { de: 'Mechanisch', it: 'Meccanica', hu: 'Mechanikus' },
  'Standard': { de: 'Standard', it: 'Standard', hu: 'Standard' },
};

function text(da: string, en = da, de?: string, it?: string, hu?: string): Localized {
  const auto = AUTO_TRANSLATIONS[da] || {};
  return {
    da,
    en,
    de: de ?? auto.de ?? en,
    it: it ?? auto.it ?? en,
    hu: hu ?? auto.hu ?? en,
  };
}

const MACHINE_CONTENT: Record<MachineKey, MachineContent> = {
  'rc-751': {
    eyebrow: {
      da: 'Kompakt fjernstyret skråningsklipper',
      en: 'Compact remote-controlled slope mower',
      de: 'Kompakter ferngesteuerter Hangmaher',
      it: 'Trincia radiocomandata compatta',
      hu: 'Kompakt taviranyitasu repszarkasza',
    },
    intro: {
      da: 'Timan RC-751 er den lille fjernstyrede maskine til stejle skråninger, smalle passager og områder, hvor operatøren skal stå sikkert væk fra arbejdet.',
      en: 'Timan RC-751 is the compact remote-controlled machine for steep slopes, narrow passages and areas where the operator should work at a safe distance.',
      de: 'Timan RC-751 ist die kompakte ferngesteuerte Maschine fur steile Hange, enge Passagen und Bereiche, in denen der Bediener sicher auf Abstand bleiben soll.',
      it: 'Timan RC-751 e la macchina radiocomandata compatta per pendii ripidi, passaggi stretti e aree in cui l operatore deve lavorare a distanza sicura.',
      hu: 'A Timan RC-751 kompakt taviranyitasu gep meredek lejtohoz, szuk helyekhez es olyan munkahoz, ahol a kezelo biztonsagos tavolsagban marad.',
    },
    highlights: [
      {
        da: 'Arbejder på skråninger op til 50 grader.',
        en: 'Works on slopes up to 50 degrees.',
        de: 'Arbeitet an Hangen bis 50 Grad.',
        it: 'Lavora su pendenze fino a 50 gradi.',
        hu: 'Akár 50 fokos lejtokon is dolgozik.',
      },
      {
        da: 'Lav vægt og kompakt størrelse gør den let at transportere.',
        en: 'Low weight and compact size make it easy to transport.',
        de: 'Geringes Gewicht und kompakte Bauweise erleichtern den Transport.',
        it: 'Peso ridotto e dimensioni compatte facilitano il trasporto.',
        hu: 'Kis tomege es kompakt merete miatt konnyen szallithato.',
      },
      {
        da: 'Fjernstyring giver bedre sikkerhed ved farlige og svært tilgængelige områder.',
        en: 'Remote control improves safety in hazardous and hard-to-reach areas.',
        de: 'Die Fernsteuerung erhoht die Sicherheit in gefahrlichen und schwer zuganglichen Bereichen.',
        it: 'Il radiocomando aumenta la sicurezza in aree pericolose e difficili da raggiungere.',
        hu: 'A taviranyitas nagyobb biztonsagot ad veszelyes es nehezen elerheto teruleteken.',
      },
    ],
    specs: [
      { label: { da: 'Varenr.', en: 'Item no.', de: 'Art.-Nr.', it: 'Codice', hu: 'Cikkszam' }, value: { da: '410040', en: '410040', de: '410040', it: '410040', hu: '410040' } },
      { label: { da: 'Motor', en: 'Engine', de: 'Motor', it: 'Motore', hu: 'Motor' }, value: { da: 'B&S, 14 HK', en: 'B&S, 14 HP', de: 'B&S, 14 PS', it: 'B&S, 14 CV', hu: 'B&S, 14 LE' } },
      { label: { da: 'Maks. hældning', en: 'Max. slope', de: 'Max. Hangneigung', it: 'Pendenza max.', hu: 'Max. lejtés' }, value: { da: '50 grader', en: '50 degrees', de: '50 Grad', it: '50 gradi', hu: '50 fok' } },
      { label: { da: 'Klippebredde', en: 'Cutting width', de: 'Schnittbreite', it: 'Larghezza taglio', hu: 'Vagasi szelesseg' }, value: { da: '750 mm', en: '750 mm', de: '750 mm', it: '750 mm', hu: '750 mm' } },
      { label: { da: 'Vægt (basis)', en: 'Weight (base)', de: 'Gewicht (Basis)', it: 'Peso (base)', hu: 'Tomeg (alap)' }, value: { da: '345 kg', en: '345 kg', de: '345 kg', it: '345 kg', hu: '345 kg' } },
    ],
    dataPdfSrc: '/brochures/data-rc-751-dk.pdf',
  },
  'rc-1000s': {
    eyebrow: {
      da: 'Fjernstyret redskabsbærer til helårsbrug',
      en: 'Remote-controlled tool carrier for year-round use',
      de: 'Ferngesteuerter Geratetrager fur den Ganzjahreseinsatz',
      it: 'Portattrezzi radiocomandato per uso tutto l anno',
      hu: 'Taviranyitasu eszkozhordozo egesz eves hasznalatra',
    },
    intro: {
      da: 'Timan RC-1000s er bygget til krævende terræn og skråninger. Den kan kobles med flere redskaber til grøn vedligeholdelse og vintertjeneste.',
      en: 'Timan RC-1000s is built for demanding terrain and slopes. It can be combined with several attachments for green maintenance and winter service.',
      de: 'Timan RC-1000s ist fur anspruchsvolles Gelande und Hange gebaut. Die Maschine kann mit mehreren Anbaugeraten fur Grunpflege und Winterdienst kombiniert werden.',
      it: 'Timan RC-1000s e costruita per terreni difficili e pendii. Puo essere combinata con diversi accessori per manutenzione verde e servizio invernale.',
      hu: 'A Timan RC-1000s nehez terepre es lejtokre keszult. Tobb adapterrel hasznalhato zoldterulet-karbantartashoz es teli munkahoz.',
    },
    attachmentLabel: {
      da: 'Ca. 9 redskaber til RC-1000s',
      en: 'Approx. 9 attachments for RC-1000s',
      de: 'Ca. 9 Anbaugerate fur RC-1000s',
      it: 'Circa 9 accessori per RC-1000s',
      hu: 'Kb. 9 adapter az RC-1000s-hez',
    },
    attachmentCount: '9',
    highlights: [
      {
        da: 'Større kapacitet til krævende terræn, krat og grovere grønne opgaver.',
        en: 'More capacity for demanding terrain, scrub and heavier green maintenance.',
        de: 'Mehr Kapazitat fur anspruchsvolles Gelande, Gestrupp und grobere Grunpflege.',
        it: 'Maggiore capacita per terreni difficili, arbusti e manutenzione verde impegnativa.',
        hu: 'Nagyobb kapacitas nehez terepre, bozotoshoz es komolyabb zoldterulet-munkahoz.',
      },
      {
        da: 'Hydraulisk redskabsdrift gør maskinen fleksibel på tværs af sæsoner.',
        en: 'Hydraulic attachment drive makes the machine flexible across seasons.',
        de: 'Der hydraulische Gerateantrieb macht die Maschine saisonubergreifend flexibel.',
        it: 'L azionamento idraulico degli accessori rende la macchina flessibile in ogni stagione.',
        hu: 'A hidraulikus adapterhajtas evszakokon at rugalmas hasznalatot ad.',
      },
      {
        da: 'Fjernbetjeningen lader operatøren arbejde på afstand fra støv, sten og stejle områder.',
        en: 'Remote operation keeps the operator away from dust, stones and steep areas.',
        de: 'Die Fernbedienung halt den Bediener von Staub, Steinen und steilen Bereichen fern.',
        it: 'Il radiocomando mantiene l operatore lontano da polvere, pietre e zone ripide.',
        hu: 'A taviranyitas tavol tartja a kezelot a portol, kovektol es meredek reszektol.',
      },
    ],
    specs: [
      { label: { da: 'Varenr.', en: 'Item no.', de: 'Art.-Nr.', it: 'Codice', hu: 'Cikkszam' }, value: { da: '411000', en: '411000', de: '411000', it: '411000', hu: '411000' } },
      { label: { da: 'Motor', en: 'Engine', de: 'Motor', it: 'Motore', hu: 'Motor' }, value: { da: 'Vanguard, 23 HK', en: 'Vanguard, 23 HP', de: 'Vanguard, 23 PS', it: 'Vanguard, 23 CV', hu: 'Vanguard, 23 LE' } },
      { label: { da: 'Maks. hældning', en: 'Max. slope', de: 'Max. Hangneigung', it: 'Pendenza max.', hu: 'Max. lejtés' }, value: { da: '50 grader', en: '50 degrees', de: '50 Grad', it: '50 gradi', hu: '50 fok' } },
      { label: { da: 'Klippebredde', en: 'Cutting width', de: 'Schnittbreite', it: 'Larghezza taglio', hu: 'Vagasi szelesseg' }, value: { da: '1000 mm', en: '1000 mm', de: '1000 mm', it: '1000 mm', hu: '1000 mm' } },
      { label: { da: 'Vægt (basis)', en: 'Weight (base)', de: 'Gewicht (Basis)', it: 'Peso (base)', hu: 'Tomeg (alap)' }, value: { da: '440 kg', en: '440 kg', de: '440 kg', it: '440 kg', hu: '440 kg' } },
    ],
    attachments: [
      { da: 'Sneslynge', en: 'Snow blower', de: 'Schneefrase', it: 'Turbina da neve', hu: 'Hofuvo' },
      { da: 'V-plov', en: 'V-plow', de: 'V-Pflug', it: 'Lama a V', hu: 'V-hokeke' },
      { da: 'Centerdrevet hydraulisk kost', en: 'Centre-driven hydraulic sweeper', de: 'Mittig angetriebene hydraulische Kehrburste', it: 'Spazzola idraulica a trasmissione centrale', hu: 'Kozepmeghajtasu hidraulikus sepro' },
      { da: 'Ukrudtsbørste', en: 'Weed brush', de: 'Wildkrautburste', it: 'Spazzola diserbo', hu: 'Gyomkefe' },
      { da: 'Slagleklipper', en: 'Flail mower', de: 'Schlegelmaher', it: 'Trincia', hu: 'Kalapacsos kasza' },
      { da: 'Fingerklipper', en: 'Finger mower', de: 'Fingerbalkenmaher', it: 'Barra falciante', hu: 'Kaszalec' },
      { da: 'Rotorklipper', en: 'Rotary mower', de: 'Rotormaher', it: 'Rasaerba rotativo', hu: 'Rotacios kasza' },
      { da: 'Stubfræser', en: 'Stump grinder', de: 'Stubbenfrase', it: 'Fresaceppi', hu: 'Tuskomaro' },
      { da: 'Skivehøster', en: 'Disc mower', de: 'Scheibenmaher', it: 'Falciatrice a dischi', hu: 'Tarcsa kasza' },
    ],
    dataPdfSrc: '/brochures/data-rc-1000s-da-ny.pdf',
  },
  'timan-2620': {
    eyebrow: {
      da: 'Kompakt redskabsbærer til ejendom og park',
      en: 'Compact tool carrier for property and park maintenance',
      de: 'Kompakter Geräteträger für Grundstücks- und Parkpflege',
      it: 'Portattrezzi compatto per proprietà e parchi',
      hu: 'Kompakt eszközhordozó ingatlan- és parkgondozáshoz',
    },
    intro: {
      da: 'Timan 2620 er en kompakt og manøvredygtig maskine til grøn pleje, læsseopgaver og vintertjeneste - med eller uden kabine.',
      en: 'Timan 2620 is a compact and manoeuvrable machine for green care, loader tasks and winter service - with or without cab.',
      de: 'Timan 2620 ist eine kompakte und wendige Maschine für Grünpflege, Ladeaufgaben und Winterdienst - mit oder ohne Kabine.',
      it: 'Timan 2620 è una macchina compatta e maneggevole per cura del verde, carico e servizio invernale - con o senza cabina.',
      hu: 'A Timan 2620 kompakt és jól manőverezhető gép zöldterület-gondozáshoz, rakodáshoz és téli munkához - fülkével vagy fülke nélkül.',
    },
    attachmentLabel: {
      da: 'Redskaber til helårsbrug',
      en: 'Attachments for year-round use',
      de: 'Anbaugeräte für den Ganzjahreseinsatz',
      it: 'Accessori per uso tutto l anno',
      hu: 'Adapterek egész éves használatra',
    },
    attachmentCount: '6',
    cards: [
      {
        title: {
          da: 'Med eller uden kabine',
          en: 'With or without cab',
          de: 'Mit oder ohne Kabine',
          it: 'Con o senza cabina',
          hu: 'Fülkével vagy fülke nélkül',
        },
        text: {
          da: 'Vælg maskinen efter sæson, komfortbehov og opgavetype.',
          en: 'Choose the machine to match season, comfort needs and task type.',
          de: 'Wählen Sie die Maschine passend zu Saison, Komfortbedarf und Aufgabe.',
          it: 'Scegli la macchina in base a stagione, comfort e tipo di lavoro.',
          hu: 'Válassza a gépet az évszakhoz, komfortigényhez és feladathoz.',
        },
      },
      {
        title: {
          da: 'Tractor / Loader line',
          en: 'Tractor / Loader line',
          de: 'Tractor / Loader line',
          it: 'Tractor / Loader line',
          hu: 'Tractor / Loader line',
        },
        text: {
          da: 'Frontredskaber gør 2620 relevant til både løft, rydning og vedligehold.',
          en: 'Front attachments make 2620 relevant for lifting, clearing and maintenance.',
          de: 'Frontanbaugeräte machen 2620 relevant für Heben, Räumen und Pflege.',
          it: 'Gli accessori frontali rendono 2620 adatta a sollevamento, sgombero e manutenzione.',
          hu: 'Az első adapterekkel a 2620 emelésre, takarításra és karbantartásra is alkalmas.',
        },
      },
    ],
    highlights: [
      {
        da: 'Kompakt størrelse gør den nem at bruge på smalle områder og tæt omkring bygninger.',
        en: 'Compact size makes it easy to use in narrow areas and close around buildings.',
        de: 'Die kompakte Größe erleichtert den Einsatz in engen Bereichen und nah an Gebäuden.',
        it: 'Le dimensioni compatte facilitano l uso in aree strette e vicino agli edifici.',
        hu: 'Kompakt mérete miatt könnyen használható szűk helyeken és épületek körül.',
      },
      {
        da: 'Kan sættes op med eller uden kabine, så maskinen matcher opgaven og årstiden.',
        en: 'Can be configured with or without cab to match the task and season.',
        de: 'Kann mit oder ohne Kabine konfiguriert werden, passend zu Aufgabe und Jahreszeit.',
        it: 'Configurabile con o senza cabina per adattarsi al lavoro e alla stagione.',
        hu: 'Fülkével vagy fülke nélkül konfigurálható a feladathoz és évszakhoz.',
      },
      {
        da: 'Redskaber til læsning, sne og almindelig vedligehold gør maskinen fleksibel året rundt.',
        en: 'Attachments for loading, snow and general maintenance make the machine flexible all year.',
        de: 'Anbaugeräte für Laden, Schnee und Pflege machen die Maschine ganzjährig flexibel.',
        it: 'Accessori per carico, neve e manutenzione rendono la macchina flessibile tutto l anno.',
        hu: 'Rakodó, hó- és karbantartó adapterekkel egész évben rugalmasan használható.',
      },
    ],
    specs: [
      { label: { da: 'Maskintype', en: 'Machine type', de: 'Maschinentyp', it: 'Tipo macchina', hu: 'Géptípus' }, value: { da: 'Tractor / Loader line', en: 'Tractor / Loader line', de: 'Tractor / Loader line', it: 'Tractor / Loader line', hu: 'Tractor / Loader line' } },
      { label: { da: 'Kabine', en: 'Cab', de: 'Kabine', it: 'Cabina', hu: 'Fülke' }, value: { da: 'Med eller uden kabine', en: 'With or without cab', de: 'Mit oder ohne Kabine', it: 'Con o senza cabina', hu: 'Fülkével vagy fülke nélkül' } },
      { label: { da: 'Redskaber', en: 'Attachments', de: 'Anbaugeräte', it: 'Accessori', hu: 'Adapterek' }, value: { da: 'V-plov, skovl, skrabeblad og DS-250', en: 'V-plow, bucket, dozer blade and DS-250', de: 'V-Pflug, Schaufel, Dozerschild und DS-250', it: 'Lama a V, benna, lama dozer e DS-250', hu: 'V-eke, kanál, dozerlap és DS-250' } },
      { label: { da: 'Anvendelse', en: 'Application', de: 'Einsatz', it: 'Applicazione', hu: 'Felhasználás' }, value: { da: 'Ejendom, park, læsning og vinter', en: 'Property, park, loading and winter', de: 'Grundstück, Park, Laden und Winter', it: 'Proprietà, parchi, carico e inverno', hu: 'Ingatlan, park, rakodás és tél' } },
    ],
    attachments: [
      { da: 'Med kabine', en: 'With cab', de: 'Mit Kabine', it: 'Con cabina', hu: 'Fülkével' },
      { da: 'Uden kabine', en: 'Without cab', de: 'Ohne Kabine', it: 'Senza cabina', hu: 'Fülke nélkül' },
      { da: 'V-plov', en: 'V-plow', de: 'V-Pflug', it: 'Lama a V', hu: 'V-eke' },
      { da: 'Skovl', en: 'Bucket', de: 'Schaufel', it: 'Benna', hu: 'Kanál' },
      { da: 'Skrabeblad/Dozerblad', en: 'Scraper/dozer blade', de: 'Schürf-/Dozerschild', it: 'Raschietto/lama dozer', hu: 'Kaparó/dozerlap' },
      { da: 'DS-250 Saltspreder', en: 'DS-250 salt spreader', de: 'DS-250 Salzstreuer', it: 'Spargisale DS-250', hu: 'DS-250 sószóró' },
    ],
    viewerHref: '/messe/timan-2620/360',
    viewerImageSrc: '/images/timan-2620/standard/06.jpg',
    viewerLabel: {
      da: '360 funktion',
      en: '360 function',
      de: '360-Funktion',
      it: 'Funzione 360',
      hu: '360 funkció',
    },
    viewerTitle: {
      da: 'Se Timan 2620 - 360 funktion',
      en: 'View Timan 2620 - 360 function',
      de: 'Timan 2620 - 360-Funktion ansehen',
      it: 'Vedi Timan 2620 - funzione 360',
      hu: 'Timan 2620 - 360 funkció megtekintése',
    },
  },
  'timan-3330': {
    eyebrow: {
      da: 'Kompakt redskabsbærer med kabine',
      en: 'Compact tool carrier with cab',
      de: 'Kompakter Geratetrager mit Kabine',
      it: 'Portattrezzi compatto con cabina',
      hu: 'Kompakt eszkozhordozo fulkevel',
    },
    intro: {
      da: 'Timan 3330 er en knækstyret redskabsbærer med kabine til professionel pleje af udendørsarealer.',
      en: 'Timan 3330 is an articulated tool carrier with cab for professional care of outdoor areas.',
      de: 'Timan 3330 ist ein knickgelenkter Geratetrager mit Kabine fur die professionelle Pflege von Aussenanlagen.',
      it: 'Timan 3330 e un portattrezzi articolato con cabina per la cura professionale delle aree esterne.',
      hu: 'A Timan 3330 csuklos kormanyzasu, fulkes eszkozhordozo kulteri teruletek professzionalis gondozasahoz.',
    },
    attachmentLabel: {
      da: 'Mange redskaber til helårsdrift',
      en: 'Many attachments for year-round operation',
      de: 'Viele Anbaugerate fur den Ganzjahreseinsatz',
      it: 'Molti accessori per uso tutto l anno',
      hu: 'Sok adapter egesz eves hasznalatra',
    },
    attachmentCount: '13',
    cards: [
      {
        title: {
          da: 'Lavt brændstofforbrug',
          en: 'Low fuel consumption',
          de: 'Niedriger Kraftstoffverbrauch',
          it: 'Basso consumo di carburante',
          hu: 'Alacsony uzemanyag-fogyasztas',
        },
        text: {
          da: 'Elektronisk reguleret motor udnytter brændstoffet effektivt.',
          en: 'Electronically controlled engine uses fuel efficiently.',
          de: 'Elektronisch geregelter Motor nutzt den Kraftstoff effizient.',
          it: 'Il motore a controllo elettronico usa il carburante in modo efficiente.',
          hu: 'Az elektronikusan szabalyozott motor hatekonyan hasznalja az uzemanyagot.',
        },
      },
      {
        title: {
          da: 'Dansk design og kvalitet',
          en: 'Danish design and quality',
          de: 'Danisches Design und Qualitat',
          it: 'Design e qualita danesi',
          hu: 'Dan tervezes es minoseg',
        },
        text: {
          da: 'Robust konstruktion bygget til professionel daglig drift.',
          en: 'Robust construction built for professional daily operation.',
          de: 'Robuste Konstruktion fur den professionellen taglichen Einsatz.',
          it: 'Costruzione robusta pensata per il lavoro quotidiano professionale.',
          hu: 'Robusztus felepites a professzionalis napi hasznalathoz.',
        },
      },
    ],
    highlights: [
      {
        da: 'Ergonomisk arbejdsplads med nem ind- og udstigning og betjening placeret med fokus på føreren.',
        en: 'Ergonomic workplace with easy entry and exit and controls placed with the operator in focus.',
        de: 'Ergonomischer Arbeitsplatz mit leichtem Ein- und Ausstieg und bedienerorientiert angeordneten Bedienelementen.',
        it: 'Postazione ergonomica con salita e discesa facili e comandi disposti pensando all operatore.',
        hu: 'Ergonomikus munkahely konnyu be- es kiszallassal, a kezelore szabott kezeloszervekkel.',
      },
      {
        da: 'Store glaspartier giver godt udsyn under kørsel og betjening af maskinen.',
        en: 'Large glass areas give good visibility while driving and operating the machine.',
        de: 'Grosse Glasflachen sorgen fur gute Sicht beim Fahren und Bedienen der Maschine.',
        it: 'Ampie superfici vetrate offrono buona visibilita durante la guida e l uso della macchina.',
        hu: 'A nagy uvegfeluletek jo kilatast adnak vezetes es a gep kezelese kozben.',
      },
      {
        da: 'Fuldt hydraulisk system og robust konstruktion giver høj driftssikkerhed i det daglige arbejde.',
        en: 'A fully hydraulic system and robust construction provide high reliability in daily work.',
        de: 'Vollhydraulisches System und robuste Konstruktion sorgen fur hohe Zuverlassigkeit im Alltag.',
        it: 'Il sistema completamente idraulico e la costruzione robusta garantiscono alta affidabilita nel lavoro quotidiano.',
        hu: 'A teljesen hidraulikus rendszer es a robusztus felepites nagy uzembiztonsagot ad a napi munkaban.',
      },
    ],

    specs: [
      { label: { da: 'Varenr.', en: 'Item no.', de: 'Art.-Nr.', it: 'Codice', hu: 'Cikkszam' }, value: { da: '712000', en: '712000', de: '712000', it: '712000', hu: '712000' } },
      { label: { da: 'Motor', en: 'Engine', de: 'Motor', it: 'Motore', hu: 'Motor' }, value: { da: 'Kubota benzinmotor', en: 'Kubota petrol engine', de: 'Kubota Benzinmotor', it: 'Motore benzina Kubota', hu: 'Kubota benzinmotor' } },
      { label: { da: 'Effekt', en: 'Power', de: 'Leistung', it: 'Potenza', hu: 'Teljesitmeny' }, value: { da: '33 HK', en: '33 HP', de: '33 PS', it: '33 CV', hu: '33 LE' } },
      { label: { da: 'Tophastighed', en: 'Top speed', de: 'Hochstgeschwindigkeit', it: 'Velocita max.', hu: 'Vegsebesseg' }, value: { da: '28 km/t', en: '28 km/h', de: '28 km/h', it: '28 km/h', hu: '28 km/h' } },
      { label: { da: 'Lydniveau i kabine', en: 'Cab noise level', de: 'Gerauschpegel in der Kabine', it: 'Rumore in cabina', hu: 'Zajszint a fulkeben' }, value: { da: '79 dB', en: '79 dB', de: '79 dB', it: '79 dB', hu: '79 dB' } },
      { label: { da: 'Køreklar vægt', en: 'Operating weight', de: 'Betriebsgewicht', it: 'Peso operativo', hu: 'Uzemkesz tomeg' }, value: { da: '1.185 kg', en: '1,185 kg', de: '1.185 kg', it: '1.185 kg', hu: '1 185 kg' } },
    ],
    attachments: [
      { da: 'Centerdrevet kost', en: 'Centre-driven sweeper', de: 'Mittig angetriebene Kehrburste', it: 'Spazzola centrale', hu: 'Kozepmeghajtasu sepro' },
      { da: 'Combispreader CS-200', en: 'Combispreader CS-200', de: 'Combispreader CS-200', it: 'Combispreader CS-200', hu: 'Combispreader CS-200' },
      { da: 'Dozerblad', en: 'Dozer blade', de: 'Dozerschild', it: 'Lama dozer', hu: 'Dozerlap' },
      { da: 'Fingerklipper', en: 'Finger mower', de: 'Fingerbalkenmaher', it: 'Barra falciante', hu: 'Kaszalec' },
      { da: 'Multitrimmer', en: 'Multi trimmer', de: 'Multitrimmer', it: 'Multitrimmer', hu: 'Multitrimmer' },
      { da: 'Rotorklipper 1350', en: 'Rotary mower 1350', de: 'Rotormaher 1350', it: 'Rasaerba rotativo 1350', hu: 'Rotacios kasza 1350' },
      { da: 'Rotorklipper GMR', en: 'Rotary mower GMR', de: 'Rotormaher GMR', it: 'Rasaerba rotativo GMR', hu: 'Rotacios kasza GMR' },
      { da: 'Skovl', en: 'Bucket', de: 'Schaufel', it: 'Benna', hu: 'Kanal' },
      { da: 'Sneslynge', en: 'Snow blower', de: 'Schneefrase', it: 'Turbina da neve', hu: 'Hofuvo' },
      { da: 'Tornado T2', en: 'Tornado T2', de: 'Tornado T2', it: 'Tornado T2', hu: 'Tornado T2' },
      { da: 'Tornado T3', en: 'Tornado T3', de: 'Tornado T3', it: 'Tornado T3', hu: 'Tornado T3' },
      { da: 'Ukrudtsbørste', en: 'Weed brush', de: 'Wildkrautburste', it: 'Spazzola diserbo', hu: 'Gyomkefe' },
      { da: 'V-plov', en: 'V-plow', de: 'V-Pflug', it: 'Lama a V', hu: 'V-hokeke' },
    ],
    dataPdfSrc: '/brochures/data-timan-3330-dk-2.pdf',
  },
};

const MACHINE_DESCRIPTIONS: Record<MachineKey, Localized[]> = {
  'rc-751': [
    {
      da: 'RC-751 er velegnet til skråninger, grøftekanter og smalle områder, hvor operatøren skal stå sikkert væk fra arbejdet.',
      en: 'RC-751 is suited for slopes, ditches and narrow areas where the operator should work at a safe distance.',
      de: 'RC-751 eignet sich fur Hange, Grabenrander und enge Bereiche, in denen der Bediener sicher auf Abstand bleiben soll.',
      it: 'RC-751 e adatta a pendii, fossi e aree strette in cui l operatore deve lavorare a distanza sicura.',
      hu: 'Az RC-751 lejtokhoz, arkokhoz es szuk teruletekhez valo, ahol a kezelo biztonsagos tavolsagbol dolgozhat.',
    },
    {
      da: 'Den lave vægt og kompakte størrelse gør maskinen nem at transportere og bruge på steder, hvor almindelige maskiner bliver for store.',
      en: 'The low weight and compact size make it easy to transport and use where ordinary machines become too large.',
      de: 'Das geringe Gewicht und die kompakte Bauweise erleichtern Transport und Einsatz an Orten, wo normale Maschinen zu gross werden.',
      it: 'Il peso ridotto e le dimensioni compatte la rendono facile da trasportare e usare dove le macchine ordinarie sono troppo grandi.',
      hu: 'A kis tomeg es kompakt meret miatt konnyen szallithato es ott is hasznalhato, ahol a hagyomanyos gepek tul nagyok.',
    },
  ],
  'rc-1000s': [
    {
      da: 'RC-1000s er den større fjernstyrede platform til opgaver, hvor der er brug for mere kapacitet, større klippebredde og flere redskabsmuligheder.',
      en: 'RC-1000s is the larger remote-controlled platform for jobs that require more capacity, wider cutting and more attachment options.',
      de: 'RC-1000s ist die grossere ferngesteuerte Plattform fur Aufgaben mit mehr Kapazitat, grosserer Arbeitsbreite und mehreren Anbaugeraten.',
      it: 'RC-1000s e la piattaforma radiocomandata piu grande per lavori che richiedono piu capacita, maggiore larghezza di taglio e piu accessori.',
      hu: 'Az RC-1000s nagyobb taviranyitasu platform nagyobb kapacitashoz, szelesebb vagashoz es tobb adapterhez.',
    },
    {
      da: 'Maskinen kan bruges til både grøn vedligeholdelse og vintertjeneste, og redskabsskiftet gør den fleksibel gennem hele året.',
      en: 'The machine can be used for both green maintenance and winter service, and quick attachment changes make it flexible all year.',
      de: 'Die Maschine kann fur Grunpflege und Winterdienst eingesetzt werden; der schnelle Geratewechsel macht sie ganzjahrig flexibel.',
      it: 'La macchina puo essere usata per manutenzione verde e servizio invernale; il cambio rapido degli accessori la rende flessibile tutto l anno.',
      hu: 'A gep zoldterulet-karbantartasra es teli munkara is hasznalhato; a gyors adaptercsere egesz evben rugalmassa teszi.',
    },
  ],
  'timan-2620': [
    {
      da: 'Timan 2620 er lavet til brugere, der har brug for en kompakt maskine til mange typer opgaver på ejendomme, stier, parker og mindre udendørsarealer.',
      en: 'Timan 2620 is made for users who need a compact machine for many types of tasks on properties, paths, parks and smaller outdoor areas.',
      de: 'Timan 2620 ist für Anwender entwickelt, die eine kompakte Maschine für viele Aufgaben auf Grundstücken, Wegen, Parks und kleineren Außenflächen benötigen.',
      it: 'Timan 2620 è pensata per chi ha bisogno di una macchina compatta per molti lavori in proprietà, sentieri, parchi e piccole aree esterne.',
      hu: 'A Timan 2620 azoknak készült, akik kompakt gépet keresnek ingatlanok, utak, parkok és kisebb kültéri területek sokféle feladatához.',
    },
    {
      da: 'Maskinen kan vises i 360-portalen, hvor man kan dreje den rundt og se de vigtigste funktioner og udstyrsvalg på en mere visuel måde.',
      en: 'The machine can be viewed in the 360 portal, where it can be rotated and the key functions and equipment choices can be explored visually.',
      de: 'Die Maschine kann im 360-Portal angesehen werden, wo sie gedreht und die wichtigsten Funktionen und Ausstattungen visuell erkundet werden können.',
      it: 'La macchina può essere visualizzata nel portale 360, dove è possibile ruotarla e vedere funzioni e configurazioni in modo più visivo.',
      hu: 'A gép a 360 portálon tekinthető meg, ahol forgatható, és a fő funkciók, felszereltségek vizuálisan bejárhatók.',
    },
  ],
  'timan-3330': [
    {
      da: 'Timan 3330 er en kompakt, knækstyret redskabsbærer udviklet til professionel vedligeholdelse af udendørsarealer året rundt.',
      en: 'Timan 3330 is a compact, articulated tool carrier developed for professional maintenance of outdoor areas all year round.',
      de: 'Timan 3330 ist ein kompakter, knickgelenkter Geratetrager fur die professionelle Pflege von Aussenanlagen das ganze Jahr uber.',
      it: 'Timan 3330 e un portattrezzi compatto e articolato sviluppato per la manutenzione professionale delle aree esterne tutto l anno.',
      hu: 'A Timan 3330 kompakt, csuklos kormanyzasu eszkozhordozo kulteri teruletek egesz eves, professzionalis karbantartasahoz.',
    },
    {
      da: 'Den brede redskabsløsning gør det muligt at bruge samme maskine til blandt andet fejning, græspleje og vinterberedskab, så Timan 3330 kan løse mange forskellige opgaver gennem alle fire årstider.',
      en: 'The broad attachment programme makes it possible to use the same machine for sweeping, green care and winter readiness, so Timan 3330 can solve many different tasks through all four seasons.',
      de: 'Das breite Gerateprogramm ermoglicht es, dieselbe Maschine unter anderem zum Kehren, zur Grunpflege und fur den Winterdienst einzusetzen, sodass Timan 3330 viele verschiedene Aufgaben in allen vier Jahreszeiten losen kann.',
      it: 'L ampia gamma di accessori permette di usare la stessa macchina per spazzamento, cura del verde e servizio invernale, cosi Timan 3330 puo svolgere molti compiti diversi in tutte e quattro le stagioni.',
      hu: 'A szeles adapterkinalat lehetove teszi, hogy ugyanazt a gepet hasznaljuk sepreshez, zoldterulet-gondozashoz es teli felkeszultseghez, igy a Timan 3330 sokfele feladatot lat el mind a negy evszakban.',
    },
  ],
};


const MACHINE_TECHNICAL_SECTIONS: Record<MachineKey, TechnicalSection[]> = {
  'rc-751': [
    {
      title: text('Tekniske specifikationer', 'Technical specifications'),
      rows: [
        { label: text('Motor - Briggs & Stratton', 'Engine - Briggs & Stratton'), value: text('14 HK', '14 HP') },
        { label: text('Transmission til larvebånd', 'Track transmission'), value: text('Hydraulisk', 'Hydraulic') },
        { label: text('Transmission til slagleklipper', 'Flail mower transmission'), value: text('Mekanisk', 'Mechanical') },
        { label: text('Antal Y-slagler', 'Number of Y-flails'), value: text('16 sæt = 32 stk.', '16 sets = 32 pcs.') },
        { label: text('Maks. arbejdshældning i alle retninger', 'Max. working slope in all directions'), value: text('50 grader', '50 degrees') },
        { label: text('Maks. arbejdshastighed', 'Max. working speed'), value: text('6 km/t', '6 km/h') },
        { label: text('Maks. betjeningsafstand', 'Max. operating distance'), value: text('120 m') },
        { label: text('Venderadius', 'Turning radius'), value: text('0 mm') },
        { label: text('Brændstofforbrug', 'Fuel consumption'), value: text('Maks. 3 l/t', 'Max. 3 l/h') },
        { label: text('Teoretisk maks. output', 'Theoretical max. output'), value: text('4.500 m2/t', '4,500 m2/h') },
      ],
    },
    {
      title: text('Dimensioner', 'Dimensions'),
      rows: [
        { label: text('Vægt', 'Weight'), value: text('345 kg') },
        { label: text('Total længde', 'Total length'), value: text('1.877 mm') },
        { label: text('Total bredde', 'Total width'), value: text('865 mm') },
        { label: text('Total højde', 'Total height'), value: text('600 mm') },
        { label: text('Klippebredde', 'Cutting width'), value: text('750 mm') },
        { label: text('Klippehøjde', 'Cutting height'), value: text('30 - 80 mm') },
      ],
    },
    {
      title: text('Ekstraudstyr', 'Optional equipment'),
      rows: [
        { label: text('Spikes på bælter', 'Track spikes'), value: text('Tilvalg', 'Optional') },
        { label: text('Blitzlys', 'Flashing light'), value: text('Tilvalg', 'Optional') },
        { label: text('L-slagler', 'L-flails'), value: text('Tilvalg', 'Optional') },
        { label: text('Lader', 'Charger'), value: text('Tilvalg', 'Optional') },
      ],
    },
  ],
  'rc-1000s': [
    {
      title: text('Tekniske specifikationer', 'Technical specifications'),
      rows: [
        { label: text('Motor - Vanguard', 'Engine - Vanguard'), value: text('23 HK', '23 HP') },
        { label: text('Transmission til larvebånd', 'Track transmission'), value: text('Hydraulisk', 'Hydraulic') },
        { label: text('Transmission til slagleklipper', 'Flail mower transmission'), value: text('Hydraulisk', 'Hydraulic') },
        { label: text('Antal Y-slagler', 'Number of Y-flails'), value: text('36 stk.', '36 pcs.') },
        { label: text('Maks. arbejdshældning i alle retninger', 'Max. working slope in all directions'), value: text('50 grader', '50 degrees') },
        { label: text('Maks. arbejdshastighed', 'Max. working speed'), value: text('7 km/t', '7 km/h') },
        { label: text('Maks. betjeningsafstand', 'Max. operating distance'), value: text('150 m') },
        { label: text('Venderadius', 'Turning radius'), value: text('0 mm') },
        { label: text('Brændstofforbrug', 'Fuel consumption'), value: text('Ca. 4 l/t', 'Approx. 4 l/h') },
        { label: text('Teoretisk maks. output med slagleklipper', 'Theoretical max. output with flail mower'), value: text('6.000 m2/t', '6,000 m2/h') },
      ],
    },
    {
      title: text('Dimensioner med slagleklipper', 'Dimensions with flail mower'),
      rows: [
        { label: text('Total vægt', 'Total weight'), value: text('580 kg') },
        { label: text('Total længde', 'Total length'), value: text('1.970 mm') },
        { label: text('Total bredde', 'Total width'), value: text('1.112 mm') },
        { label: text('Total højde', 'Total height'), value: text('685 mm') },
        { label: text('Klippebredde', 'Cutting width'), value: text('1.000 mm') },
        { label: text('Klippehøjde', 'Cutting height'), value: text('20 - 70 mm') },
      ],
    },
  ],
  'timan-2620': [
    {
      title: text('Tekniske specifikationer', 'Technical specifications'),
      rows: [
        { label: text('Maskintype', 'Machine type'), value: text('Kompakt redskabsbærer', 'Compact tool carrier') },
        { label: text('Kabine', 'Cab'), value: text('Med eller uden kabine', 'With or without cab') },
        { label: text('Redskabslinje', 'Attachment line'), value: text('Tractor / Loader line') },
        { label: text('Anvendelse', 'Application'), value: text('Ejendom, park, læsning og vinter', 'Property, park, loading and winter') },
      ],
    },
    {
      title: text('Redskaber', 'Attachments'),
      rows: [
        { label: text('V-plov', 'V-plow'), value: text('Tilvalg', 'Optional') },
        { label: text('Skovl', 'Bucket'), value: text('Tilvalg', 'Optional') },
        { label: text('Skrabeblad/Dozerblad', 'Scraper/dozer blade'), value: text('Tilvalg', 'Optional') },
        { label: text('DS-250 Saltspreder', 'DS-250 salt spreader'), value: text('Tilvalg', 'Optional') },
      ],
    },
  ],
  'timan-3330': [
    {
      title: text('Tekniske specifikationer', 'Technical specifications'),
      rows: [
        { label: text('Motor', 'Engine'), value: text('Kubota') },
        { label: text('Hk / kW', 'HP / kW'), value: text('33 / 24') },
        { label: text('Benzintank', 'Fuel tank'), value: text('37 L') },
        { label: text('Antal cylindere', 'Number of cylinders'), value: text('3') },
        { label: text('Slagvolumen', 'Displacement'), value: text('962') },
        { label: text('Kølesystem', 'Cooling system'), value: text('Vandkøling (45 C udetemperatur)', 'Water cooling (45 C ambient temperature)') },
        { label: text('Hastighed', 'Speed'), value: text('28 km/t', '28 km/h') },
        { label: text('Transmission', 'Transmission'), value: text('Stempelpumpe', 'Piston pump') },
        { label: text('Hjulmotorer', 'Wheel motors'), value: text('4 stk. orbitmotorer', '4 orbital motors') },
      ],
    },
    {
      title: text('Hydraulik og el', 'Hydraulics and electrical'),
      rows: [
        { label: text('Kapacitet udtag front', 'Front outlet capacity'), value: text('48 l/min (nominel) 180 bar', '48 l/min (nominal) 180 bar') },
        { label: text('Kapacitet udtag bag', 'Rear outlet capacity'), value: text('48 l/min (nominel) 180 bar', '48 l/min (nominal) 180 bar') },
        { label: text('Olieudtag front', 'Front oil outlet'), value: text('1 dobbeltvirkende m. flydestilling 150 bar', '1 double-acting with float position 150 bar') },
        { label: text('Olieudtag bag', 'Rear oil outlet'), value: text('1 dobbeltvirkende 150 bar', '1 double-acting 150 bar') },
        { label: text('Arbejdshydraulik', 'Working hydraulics'), value: text('Tandhjulspumpe', 'Gear pump') },
        { label: text('Liftarm', 'Lift arm'), value: text('Flydestilling og parallelløft standard', 'Float position and parallel lift standard') },
        { label: text('Løftekapacitet', 'Lifting capacity'), value: text('300 kg ved hurtigskiftet / 150 kg 80 cm ude fra hurtigskiftet', '300 kg at quick hitch / 150 kg 80 cm from quick hitch') },
        { label: text('Elsystem', 'Electrical system'), value: text('12 volt') },
        { label: text('Generator', 'Alternator'), value: text('65 amp') },
        { label: text('Køre- og arbejdslys frem', 'Front driving and work lights'), value: text('2 + 2 stk.', '2 + 2 pcs.') },
        { label: text('Arbejdslys bag', 'Rear work light'), value: text('1 stk.', '1 pc.') },
        { label: text('Rotorblink', 'Beacon'), value: text('Standard') },
        { label: text('13-polet trailerstik', '13-pin trailer plug'), value: text('Standard') },
        { label: text('Radio med Bluetooth', 'Radio with Bluetooth'), value: text('Standard') },
      ],
    },
    {
      title: text('Dimensioner', 'Dimensions'),
      rows: [
        { label: text('Vægt', 'Weight'), value: text('1.060 kg') },
        { label: text('Køreklar vægt', 'Operating weight'), value: text('1.185 kg') },
        { label: text('Længde', 'Length'), value: text('2.700 mm') },
        { label: text('Bredde', 'Width'), value: text('1.130 mm') },
        { label: text('Højde', 'Height'), value: text('1.990 mm') },
        { label: text('Indstigningshøjde', 'Entry height'), value: text('500 mm') },
        { label: text('Venderadius (indv.)', 'Turning radius (inner)'), value: text('530 mm') },
        { label: text('Venderadius (udv.)', 'Turning radius (outer)'), value: text('1.670 mm') },
      ],
    },
    {
      title: text('Lydniveau', 'Noise level'),
      rows: [
        { label: text('Lydniveau kabine EU1322/2014 metode B', 'Cab noise level EU1322/2014 method B'), value: text('79 dB') },
        { label: text('Forbikørsel EU985/2018 kørende', 'Pass-by EU985/2018 driving'), value: text('71 dB') },
        { label: text('Forbikørsel EU985/2018 stående', 'Pass-by EU985/2018 stationary'), value: text('74 dB') },
        { label: text('Støjniveau i kabine ved 2600 omdr.', 'Cab noise level at 2600 rpm'), value: text('68 dB') },
        { label: text('Kildestyrke Lwa ISO 6395:2008', 'Sound power Lwa ISO 6395:2008'), value: text('105 dB') },
      ],
    },
    {
      title: text('Ekstraudstyr', 'Optional equipment'),
      rows: [
        { label: text('Aircondition', 'Air conditioning'), value: text('Tilvalg', 'Optional') },
        { label: text('Skyderuder i højre og venstre side', 'Sliding windows right and left'), value: text('Tilvalg', 'Optional') },
        { label: text('Luftsæde', 'Air seat'), value: text('Tilvalg', 'Optional') },
        { label: text('Kørekamera ved sugemund', 'Driving camera at suction mouth'), value: text('Tilvalg', 'Optional') },
        { label: text('Bakkamera i taget', 'Roof-mounted reversing camera'), value: text('Tilvalg', 'Optional') },
        { label: text('Bakalarm', 'Reversing alarm'), value: text('Tilvalg', 'Optional') },
        { label: text('Blitzlys', 'Flashing light'), value: text('Tilvalg', 'Optional') },
        { label: text('LED rotorblink', 'LED beacon'), value: text('Tilvalg', 'Optional') },
        { label: text('Baklygte LED', 'LED reversing light'), value: text('Tilvalg', 'Optional') },
        { label: text('Kombitræk kugle/gaffel', 'Combination tow hitch ball/fork'), value: text('Tilvalg', 'Optional') },
      ],
    },
  ],
};

interface MesseMachineBrochurePageProps {
  machineKey: MachineKey;
  title: string;
  pdfSrc?: string;
  pageBase?: string;
  pageCount?: number;
}

/**
 * Resolve a localized machine string against the *selected portal language*.
 *
 * Order: selected language -> extra-language registry (sv/fr/pl/cs, keyed by
 * the Danish source string) -> English -> Danish. This prevents sv/fr/pl/cs
 * from silently collapsing to English for content that is translated.
 */
const tr = (value: Localized, lang: PortalUiLanguage) => {
  for (const languageKey of portalLanguageLookupOrder(lang, false)) {
    const portalLanguageKey = languageKey as PortalUiLanguage;
    const direct = value[portalLanguageKey];
    if (direct) return direct;

    const extra = MESSE_MACHINE_EXTRA_TRANSLATIONS[value.da]?.[portalLanguageKey as 'sv' | 'fr' | 'pl' | 'cs'];
    if (extra) return extra;
  }

  return value.en || value.da;
};

export default function MesseMachineBrochurePage({
  machineKey,
  title,
  pdfSrc,
  pageBase,
  pageCount,
}: MesseMachineBrochurePageProps) {
  const { appUser } = useAppUser();
  const { uiLanguage: lang } = useLanguage();
  const [brochureOpen, setBrochureOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [leftPage, setLeftPage] = useState(1);
  const brochurePageCount = pageCount ?? 0;
  const hasBrochure = Boolean(pdfSrc && pageBase && brochurePageCount > 0);
  const [covers, setCovers] = useState<{ frontCover: number; backCover: number }>({
    frontCover: 1,
    backCover: brochurePageCount || 1,
  });
  const content = MACHINE_CONTENT[machineKey];
  const compactAttachmentChips = machineKey === 'rc-1000s';
  const descriptions = MACHINE_DESCRIPTIONS[machineKey];
  const technicalSections = MACHINE_TECHNICAL_SECTIONS[machineKey];

  useEffect(() => {
    let active = true;
    if (!hasBrochure || !pageBase) {
      setCovers({ frontCover: 1, backCover: 1 });
      return () => {
        active = false;
      };
    }

    setCovers({ frontCover: 1, backCover: brochurePageCount });
    fetch(`${pageBase}/covers.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        const front = Number(data.frontCover);
        const back = Number(data.backCover);
        setCovers({
          frontCover: Number.isFinite(front) && front >= 1 ? front : 1,
          backCover: Number.isFinite(back) && back >= 1 ? back : brochurePageCount,
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [brochurePageCount, hasBrochure, pageBase]);

  if (!appUser) return null;


  const pageSrc = (page: number) => (pageBase ? `${pageBase}/page-${page}.jpg` : '');
  const rightPage = leftPage + 1;
  const canGoBack = leftPage > 1;
  const canGoNext = rightPage < brochurePageCount;
  const goBack = () => setLeftPage((page) => Math.max(1, page - 2));
  const goNext = () => setLeftPage((page) => Math.min(brochurePageCount, page + 2));


  const documentButtonClass =
    'group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md';
  const rc1000IconFeatures = [
    {
      iconSrc: iconSlope.url,
      label: text('Klarer skråninger op til 50 grader.', 'Handles slopes up to 50 degrees.', 'Bewaltigt Hange bis 50 Grad.', 'Gestisce pendenze fino a 50 gradi.', 'Akár 50 fokos lejtoket is kezel.'),
    },
    {
      iconSrc: iconStability.url,
      label: text('Avanceret stabilitetssystem.', 'Advanced stability system.', 'Fortschrittliches Stabilitatssystem.', 'Sistema di stabilita avanzato.', 'Fejlett stabilitasi rendszer.'),
    },
    {
      iconSrc: iconService.url,
      label: text('Hurtigt og nemt redskabsskifte.', 'Quick and easy attachment change.', 'Schneller und einfacher Geratewechsel.', 'Cambio accessori rapido e semplice.', 'Gyors es egyszeru adaptercsere.'),
    },
    {
      iconSrc: iconSeason.url,
      label: text('Driftssikker, uanset sæson.', 'Reliable, regardless of season.', 'Betriebssicher zu jeder Saison.', 'Affidabile in ogni stagione.', 'Megbizhato, evszaktol fuggetlenul.'),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <MesseSubpageHeader backLabel={tr(T.back, lang)} />

      <main className="flex-grow w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <section>
            <div className="mb-7">
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                {tr(content.eyebrow, lang)}
              </div>
              <h1 className="text-3xl font-bold text-slate-950">{title}</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">{tr(content.intro, lang)}</p>
            </div>

            {machineKey !== 'rc-1000s' && (
              <div className="grid gap-4 sm:grid-cols-3">
                {content.attachmentCount && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <Wrench className="mb-4 h-6 w-6 text-emerald-700" />
                    <div className="text-3xl font-black text-emerald-800">{content.attachmentCount}</div>
                    <div className="mt-1 text-sm font-semibold text-emerald-900">
                      {tr(content.attachmentLabel || T.tools, lang)}
                    </div>
                  </div>
                )}
                {(content.cards ??
                  content.highlights
                    .slice(0, content.attachmentCount ? 2 : 3)
                    .map((item) => ({ title: undefined, text: item }))
                ).map((item, index) => (
                  <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    {index === 0 ? (
                      <Gauge className="mb-4 h-6 w-6 text-slate-700" />
                    ) : (
                      <Settings className="mb-4 h-6 w-6 text-slate-700" />
                    )}
                    {item.title && (
                      <p className="text-sm font-semibold leading-6 text-slate-900">{tr(item.title, lang)}</p>
                    )}
                    <p
                      className={
                        item.title
                          ? 'text-sm leading-6 text-slate-600'
                          : 'text-sm font-semibold leading-6 text-slate-800'
                      }
                    >
                      {tr(item.text, lang)}
                    </p>
                  </div>
                ))}

              </div>
            )}

            {machineKey === 'rc-1000s' && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {rc1000IconFeatures.map(({ iconSrc, label }) => (
                  <div key={tr(label, lang)} className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                    <img src={iconSrc} alt="" aria-hidden="true" className="mx-auto mb-3 h-14 w-auto max-w-[4.5rem] object-contain" />
                    <p className="text-sm font-bold leading-5 text-slate-800">{tr(label, lang)}</p>
                  </div>
                ))}
              </div>
            )}

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-bold text-slate-950">{tr(T.moreAbout, lang)}</h2>
              <div className="space-y-3 text-sm leading-7 text-slate-600">
                {descriptions.map((paragraph) => (
                  <p key={tr(paragraph, lang)}>{tr(paragraph, lang)}</p>
                ))}
              </div>
            </section>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-bold text-slate-950">{tr(T.keyPoints, lang)}</h2>
                </div>
                <div className="space-y-3">
                  {content.highlights.map((item, index) => (
                    <div key={index} className="flex gap-3 text-sm leading-6 text-slate-700">
                      <span className="mt-2 h-2 w-2 flex-none rounded-full bg-emerald-600" />
                      <span>{tr(item, lang)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-bold text-slate-950">{tr(T.specs, lang)}</h2>
                </div>
                <dl className="divide-y divide-slate-100">
                  {content.specs.map((spec) => (
                    <div key={tr(spec.label, lang)} className="grid grid-cols-[1fr_auto] gap-4 py-2.5 text-sm">
                      <dt className="text-slate-500">{tr(spec.label, lang)}</dt>
                      <dd className="font-bold text-slate-900">{tr(spec.value, lang)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>

            {content.attachments && (
              <section className={`mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm ${compactAttachmentChips ? 'p-4' : 'p-5'}`}>
                <div className={`${compactAttachmentChips ? 'mb-3' : 'mb-4'} flex items-center gap-2`}>
                  <Wrench className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-bold text-slate-950">{tr(T.tools, lang)}</h2>
                </div>
                <div className={`flex flex-wrap ${compactAttachmentChips ? 'gap-1.5' : 'gap-2'}`}>
                  {content.attachments.map((item) => (
                    <span
                      key={tr(item, lang)}
                      className={`rounded-full border border-slate-200 bg-slate-50 font-semibold text-slate-700 ${compactAttachmentChips ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}
                    >
                      {tr(item, lang)}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">{tr(T.documents, lang)}</h2>

            {hasBrochure ? (
              <button
                type="button"
                onClick={() => {
                  setLeftPage(1);
                  setBrochureOpen(true);
                }}
                className={documentButtonClass}
              >
                <div className="mb-4 aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 p-4">
                  <div className="relative h-full w-full rounded-xl bg-white shadow-[0_18px_45px_-24px_rgba(15,23,42,0.75)] ring-1 ring-slate-200 transition-transform duration-300 group-hover:scale-[1.03]">
                    <div className="grid h-full grid-cols-2 items-stretch overflow-hidden rounded-xl">
                      <div className="flex min-w-0 items-center justify-end p-1.5">
                        <img src={pageSrc(covers.frontCover)} alt="" className="h-full w-auto max-w-full object-contain" />
                      </div>
                      <div className="flex min-w-0 items-center justify-start p-1.5">
                        <img src={pageSrc(covers.backCover)} alt="" className="h-full w-auto max-w-full object-contain" />
                      </div>
                    </div>
                    <div className="pointer-events-none absolute inset-y-3 left-1/2 w-8 -translate-x-1/2 bg-gradient-to-r from-transparent via-slate-900/15 to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-slate-900 shadow-sm ring-1 ring-slate-200 backdrop-blur">
                        <BookOpen className="h-3.5 w-3.5 text-slate-700" />
                        {tr(T.openBrochure, lang)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] uppercase tracking-wide font-bold text-emerald-700">{tr(T.brochure, lang)}</div>
                <div className="mt-1 text-lg font-bold text-slate-950">{title}</div>
              </button>
            ) : (
              <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm">
                <div className="mb-4 aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 p-4">
                  <div className="flex h-full items-center justify-center rounded-xl bg-white text-center ring-1 ring-slate-200">
                    <BookOpen className="h-9 w-9 text-slate-300" />
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide font-bold text-emerald-700">{tr(T.brochure, lang)}</div>
                <div className="mt-1 text-lg font-bold text-slate-950">{title}</div>
              </div>
            )}

            <button type="button" onClick={() => setDataOpen(true)} className={documentButtonClass}>
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-bold text-emerald-700">
                    {tr(T.technicalSheet, lang)}
                  </div>
                  <div className="mt-1 text-base font-bold text-slate-950">{tr(T.openData, lang)}</div>
                </div>
              </div>
            </button>

            {content.viewerHref && content.viewerImageSrc && (
              <Link to={content.viewerHref} className={documentButtonClass}>
                <div className="mb-4 aspect-[4/3] overflow-hidden rounded-xl bg-emerald-50">
                  <div className="relative h-full w-full">
                    <img
                      src={content.viewerImageSrc}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-slate-950/10 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3">
                      <span className="inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-800 shadow-sm">
                        {tr(content.viewerLabel || T.overview, lang)}
                      </span>
                      <div className="mt-2 text-lg font-black text-white drop-shadow">
                        {tr(content.viewerTitle || T.overview, lang)}
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-bold text-emerald-700">Timan 2620</div>
                  <div className="mt-1 text-base font-bold text-slate-950">{tr(content.viewerTitle || T.overview, lang)}</div>
                </div>
              </Link>
            )}

          </aside>
        </div>
      </main>

      <MesseModal
        open={dataOpen}
        onClose={() => setDataOpen(false)}
        title={`${title} - ${tr(T.technicalSheet, lang)}`}
        closeLabel={tr(T.close, lang)}
        widthClass="max-w-[53rem]"
      >
        <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-2">
          {technicalSections.map((section) => (
            <section key={tr(section.title, lang)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                {tr(section.title, lang)}
              </h3>
              <dl className="overflow-hidden rounded-xl border border-slate-200">
                {section.rows.map((row, index) => (
                  <div
                    key={`${tr(row.label, lang)}-${index}`}
                    className={`grid grid-cols-[minmax(0,1fr)_minmax(150px,auto)] items-start gap-6 px-5 py-3 text-sm ${
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                    }`}
                  >
                    <dt className="leading-5 text-slate-700">{tr(row.label, lang)}</dt>
                    <dd className="text-right font-bold leading-5 text-slate-950">{tr(row.value, lang)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </MesseModal>

      {hasBrochure && (
        <MesseModal
          open={brochureOpen}
          onClose={() => setBrochureOpen(false)}
          title={`${title} ${tr(T.brochure, lang)}`}
          closeLabel={tr(T.close, lang)}
          widthClass="max-w-[92rem]"
          bodyClass="px-3 sm:px-5 py-4"
        >
          <div className="relative rounded-xl bg-slate-100 p-3 sm:p-5">
            <div className="relative grid h-[76vh] min-h-[620px] grid-cols-1 overflow-hidden rounded-lg bg-white shadow-[0_18px_45px_-20px_rgba(15,23,42,0.65)] ring-1 ring-slate-200 md:grid-cols-2">
              <div className="flex min-h-0 items-center justify-center bg-white p-2 md:border-r md:border-slate-100">
                <img
                  src={pageSrc(leftPage)}
                  alt={`${title} ${tr(T.page, lang)} ${leftPage}`}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="hidden min-h-0 items-center justify-center bg-white p-2 md:flex">
                {rightPage <= brochurePageCount ? (
                  <img
                    src={pageSrc(rightPage)}
                    alt={`${title} ${tr(T.page, lang)} ${rightPage}`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="h-full w-full rounded-sm bg-slate-50" />
                )}
              </div>
            </div>

            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-5 left-1/2 hidden w-16 -translate-x-1/2 bg-gradient-to-r from-transparent via-slate-900/15 to-transparent md:block"
            />

            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={goBack}
                disabled={!canGoBack}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                {tr(T.previous, lang)}
              </button>
              <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">
                {leftPage}-{Math.min(rightPage, brochurePageCount)} / {brochurePageCount}
              </div>
              <button
                type="button"
                onClick={goNext}
                disabled={!canGoNext}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {tr(T.next, lang)}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {pdfSrc && (
              <a
                href={pdfSrc}
                target="_blank"
                rel="noreferrer"
                className="absolute bottom-8 right-8 hidden items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 sm:inline-flex"
              >
                <ExternalLink className="h-4 w-4" />
                {tr(T.openNew, lang)}
              </a>
            )}
          </div>
        </MesseModal>
      )}
    </div>
  );
}
