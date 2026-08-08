import { useState } from 'react';
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
import { Language } from '@/types/configurator';

type MachineKey = 'rc-751' | 'rc-1000s' | 'timan-3330';
type Localized = Record<Language, string>;

const T: Record<string, Localized> = {
  back: { da: 'Tilbage', en: 'Back', de: 'Zuruck', it: 'Indietro', hu: 'Vissza' },
  brochure: { da: 'Brochure', en: 'Brochure', de: 'Broschure', it: 'Brochure', hu: 'Brosura' },
  documents: { da: 'Dokumenter', en: 'Documents', de: 'Dokumente', it: 'Documenti', hu: 'Dokumentumok' },
  technicalSheet: { da: 'Teknisk datablad', en: 'Technical data sheet', de: 'Technisches Datenblatt', it: 'Scheda tecnica', hu: 'Muszaki adatlap' },
  pdfDataSheet: { da: 'PDF-datablad (DA)', en: 'PDF data sheet (DA)', de: 'PDF-Datenblatt (DA)', it: 'Scheda PDF (DA)', hu: 'PDF adatlap (DA)' },
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
};

interface MachineContent {
  eyebrow: Localized;
  intro: Localized;
  attachmentLabel?: Localized;
  attachmentCount?: string;
  highlights: Localized[];
  specs: Array<{ label: Localized; value: Localized }>;
  attachments?: Localized[];
  dataPdfSrc: string;
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
        da: 'Klarer skråninger op til 50 grader.',
        en: 'Handles slopes up to 50 degrees.',
        de: 'Bewaltigt Hange bis 50 Grad.',
        it: 'Gestisce pendenze fino a 50 gradi.',
        hu: 'Akár 50 fokos lejtoket is kezel.',
      },
      {
        da: 'Avanceret stabilitetssystem og fjernstyring.',
        en: 'Advanced stability system and remote control.',
        de: 'Fortschrittliches Stabilitatssystem und Fernsteuerung.',
        it: 'Sistema di stabilita avanzato e radiocomando.',
        hu: 'Fejlett stabilitasi rendszer es taviranyitas.',
      },
      {
        da: 'Hurtigt redskabsskifte til mange sæsonopgaver.',
        en: 'Quick attachment changes for many seasonal tasks.',
        de: 'Schneller Geratewechsel fur viele saisonale Aufgaben.',
        it: 'Cambio rapido degli accessori per molti lavori stagionali.',
        hu: 'Gyors adaptercsere sok szezonalis feladathoz.',
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
  'timan-3330': {
    eyebrow: {
      da: 'Kompakt redskabsbærer med kabine',
      en: 'Compact tool carrier with cab',
      de: 'Kompakter Geratetrager mit Kabine',
      it: 'Portattrezzi compatto con cabina',
      hu: 'Kompakt eszkozhordozo fulkevel',
    },
    intro: {
      da: 'Timan 3330 er en kompakt redskabsbærer til daglig drift hele året. Den kombinerer komfort, hurtige redskabsskift og mange opgaver fra samme maskine.',
      en: 'Timan 3330 is a compact tool carrier for daily year-round operation. It combines comfort, quick attachment changes and many tasks from one machine.',
      de: 'Timan 3330 ist ein kompakter Geratetrager fur den taglichen Ganzjahreseinsatz. Er kombiniert Komfort, schnellen Geratewechsel und viele Aufgaben in einer Maschine.',
      it: 'Timan 3330 e un portattrezzi compatto per il lavoro quotidiano tutto l anno. Combina comfort, cambio rapido degli accessori e molte attivita con una sola macchina.',
      hu: 'A Timan 3330 kompakt eszkozhordozo mindennapi, egesz eves munkara. Kenyelmet, gyors adaptercseret es sok feladatot egyesit egy gepben.',
    },
    attachmentLabel: {
      da: 'Mange redskaber til helårsdrift',
      en: 'Many attachments for year-round operation',
      de: 'Viele Anbaugerate fur den Ganzjahreseinsatz',
      it: 'Molti accessori per uso tutto l anno',
      hu: 'Sok adapter egesz eves hasznalatra',
    },
    attachmentCount: '20+',
    highlights: [
      {
        da: 'Kabine med fokus på lavt støjniveau og førerkomfort.',
        en: 'Cab focused on low noise and operator comfort.',
        de: 'Kabine mit Fokus auf niedrigen Gerauschpegel und Fahrerkomfort.',
        it: 'Cabina orientata a basso rumore e comfort dell operatore.',
        hu: 'A fulke alacsony zajszintre es kezeloi kényelemre keszult.',
      },
      {
        da: 'Hurtigt redskabsskifte til feje-, græs-, vinter- og transportopgaver.',
        en: 'Quick attachment changes for sweeping, grass, winter and transport tasks.',
        de: 'Schneller Geratewechsel fur Kehr-, Gras-, Winter- und Transportaufgaben.',
        it: 'Cambio rapido per lavori di spazzamento, erba, inverno e trasporto.',
        hu: 'Gyors adaptercsere sepreshez, fuhöz, teli es szallitasi feladatokhoz.',
      },
      {
        da: 'Kompakt størrelse til arbejde på stier, fortove, parker og tætte bymiljøer.',
        en: 'Compact size for paths, pavements, parks and dense urban areas.',
        de: 'Kompakte Bauweise fur Wege, Gehwege, Parks und enge Stadtbereiche.',
        it: 'Dimensioni compatte per vialetti, marciapiedi, parchi e aree urbane strette.',
        hu: 'Kompakt meret utakhoz, jardakhoz, parkokhoz es suru varosi teruletekhez.',
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
      { da: 'Feje- og sugeopgaver', en: 'Sweeping and suction tasks', de: 'Kehr- und Saugaufgaben', it: 'Spazzamento e aspirazione', hu: 'Sepresi es szivasi feladatok' },
      { da: 'Ukrudtsbørste', en: 'Weed brush', de: 'Wildkrautburste', it: 'Spazzola diserbo', hu: 'Gyomkefe' },
      { da: 'Græsopgaver', en: 'Grass tasks', de: 'Grasarbeiten', it: 'Lavori su erba', hu: 'Fukarbantartas' },
      { da: 'Vinterredskaber', en: 'Winter attachments', de: 'Wintergerate', it: 'Accessori invernali', hu: 'Teli adapterek' },
      { da: 'Transport og øvrige redskaber', en: 'Transport and other attachments', de: 'Transport und weitere Anbaugerate', it: 'Trasporto e altri accessori', hu: 'Szallitas es egyeb adapterek' },
    ],
    dataPdfSrc: '/brochures/data-timan-3330-dk-2.pdf',
  },
};

interface MesseMachineBrochurePageProps {
  machineKey: MachineKey;
  title: string;
  pdfSrc: string;
  pageBase: string;
  pageCount: number;
}

const tr = (value: Localized, lang: Language) => value[lang] || value.da;

export default function MesseMachineBrochurePage({
  machineKey,
  title,
  pdfSrc,
  pageBase,
  pageCount,
}: MesseMachineBrochurePageProps) {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const [brochureOpen, setBrochureOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [leftPage, setLeftPage] = useState(1);
  const content = MACHINE_CONTENT[machineKey];

  if (!appUser) return null;

  const pageSrc = (page: number) => `${pageBase}/page-${page}.jpg`;
  const rightPage = leftPage + 1;
  const canGoBack = leftPage > 1;
  const canGoNext = rightPage < pageCount;
  const goBack = () => setLeftPage((page) => Math.max(1, page - 2));
  const goNext = () => setLeftPage((page) => Math.min(pageCount, page + 2));

  const documentButtonClass =
    'group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <MesseSubpageHeader backLabel={T.back[lang]} />

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
              {content.highlights.slice(0, content.attachmentCount ? 2 : 3).map((item, index) => (
                <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  {index === 0 ? (
                    <Gauge className="mb-4 h-6 w-6 text-slate-700" />
                  ) : (
                    <Settings className="mb-4 h-6 w-6 text-slate-700" />
                  )}
                  <p className="text-sm font-semibold leading-6 text-slate-800">{tr(item, lang)}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-bold text-slate-950">{T.keyPoints[lang]}</h2>
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
                  <h2 className="text-lg font-bold text-slate-950">{T.specs[lang]}</h2>
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
              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-bold text-slate-950">{T.tools[lang]}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {content.attachments.map((item) => (
                    <span
                      key={tr(item, lang)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700"
                    >
                      {tr(item, lang)}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">{T.documents[lang]}</h2>

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
                  <div className="absolute inset-y-5 left-1/2 w-10 -translate-x-1/2 bg-gradient-to-r from-transparent via-slate-900/15 to-transparent" />
                  <div className="grid h-full grid-cols-2 overflow-hidden rounded-xl">
                    <img src={pageSrc(1)} alt="" className="h-full w-full object-cover object-top" />
                    <div className="flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-white to-slate-50 px-4 text-center">
                      <BookOpen className="h-9 w-9 text-slate-700" />
                      <span className="text-sm font-bold text-slate-900">{T.openBrochure[lang]}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-wide font-bold text-emerald-700">{T.brochure[lang]}</div>
              <div className="mt-1 text-lg font-bold text-slate-950">{title}</div>
            </button>

            <button type="button" onClick={() => setDataOpen(true)} className={documentButtonClass}>
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-bold text-emerald-700">
                    {T.technicalSheet[lang]}
                  </div>
                  <div className="mt-1 text-base font-bold text-slate-950">{T.openData[lang]}</div>
                </div>
              </div>
            </button>

            <a href={content.dataPdfSrc} target="_blank" rel="noreferrer" className={documentButtonClass}>
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
                  <ExternalLink className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
                    {T.pdfDataSheet[lang]}
                  </div>
                  <div className="mt-1 text-base font-bold text-slate-950">{T.openNew[lang]}</div>
                </div>
              </div>
            </a>
          </aside>
        </div>
      </main>

      <MesseModal
        open={dataOpen}
        onClose={() => setDataOpen(false)}
        title={`${title} - ${T.technicalSheet[lang]}`}
        closeLabel={T.close[lang]}
        widthClass="max-w-4xl"
      >
        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h3 className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-slate-500">{T.specs[lang]}</h3>
            <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {content.specs.map((spec) => (
                <div key={tr(spec.label, lang)} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-sm">
                  <dt className="text-slate-500">{tr(spec.label, lang)}</dt>
                  <dd className="font-bold text-slate-900">{tr(spec.value, lang)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-slate-500">{T.keyPoints[lang]}</h3>
            <div className="space-y-3">
              {content.highlights.map((item, index) => (
                <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-700">
                  {tr(item, lang)}
                </div>
              ))}
            </div>
          </section>
        </div>
      </MesseModal>

      <MesseModal
        open={brochureOpen}
        onClose={() => setBrochureOpen(false)}
        title={`${title} ${T.brochure[lang]}`}
        closeLabel={T.close[lang]}
        widthClass="max-w-[92rem]"
        bodyClass="px-3 sm:px-5 py-4"
      >
        <div className="relative rounded-xl bg-slate-100 p-3 sm:p-5">
          <div className="relative grid h-[76vh] min-h-[620px] grid-cols-1 overflow-hidden rounded-lg bg-white shadow-[0_18px_45px_-20px_rgba(15,23,42,0.65)] ring-1 ring-slate-200 md:grid-cols-2">
            <div className="flex min-h-0 items-center justify-center bg-white p-2 md:border-r md:border-slate-100">
              <img
                src={pageSrc(leftPage)}
                alt={`${title} side ${leftPage}`}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="hidden min-h-0 items-center justify-center bg-white p-2 md:flex">
              {rightPage <= pageCount ? (
                <img
                  src={pageSrc(rightPage)}
                  alt={`${title} side ${rightPage}`}
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
              {T.previous[lang]}
            </button>
            <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">
              {leftPage}-{Math.min(rightPage, pageCount)} / {pageCount}
            </div>
            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {T.next[lang]}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <a
            href={pdfSrc}
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-8 right-8 hidden items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 sm:inline-flex"
          >
            <ExternalLink className="h-4 w-4" />
            {T.openNew[lang]}
          </a>
        </div>
      </MesseModal>
    </div>
  );
}
