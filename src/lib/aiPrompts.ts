/**
 * ============================================================================
 *  Timan Sales-Argument & Recommendation Rules
 * ============================================================================
 *
 *  This is the single editable source of truth for the logic behind the two
 *  popups in the quote flow:
 *
 *    1. "Ønsker du at tilføje fordele ved den valgte løsning?"
 *       → uses BENEFITS_RULES + TOOL_PROFILES
 *
 *    2. "Vil du også høre, hvad Timan anbefaler?"
 *       → uses TOOL_COMPLEMENT_RULES + (existing accessory rec rules in salesArguments.ts)
 *
 *  There is NO LLM behind these popups. All output is generated deterministically
 *  from the configurator state + the rules below. This file is intentionally
 *  human-readable so a Timan product specialist can refine wording over time
 *  without touching application code.
 *
 *  HOW TO TWEAK:
 *  ─────────────
 *  • To change what is said about a specific redskab → edit TOOL_PROFILES[<id>].
 *  • To change which complementary tools are suggested → edit TOOL_COMPLEMENT_RULES.
 *  • To change machine-platform boundaries (e.g. RC-1000 has NO cab) → edit
 *    MACHINE_PROFILES below. Anything in `forbiddenTopics` will be stripped from
 *    output for that platform.
 *  • To change the high-level tone, see SYSTEM_RULES at the bottom — these are
 *    enforced by the generator in salesArguments.ts.
 *
 *  PRODUCT BOUNDARIES (HARD RULES):
 *  ────────────────────────────────
 *  • RC-1000s   → REMOTE-CONTROLLED, NO CAB. Never mention cabin comfort,
 *                  air-conditioning, sliding windows, air-suspended seat,
 *                  sun visor, or any cab feature.
 *  • RC-751     → REMOTE-CONTROLLED, NO CAB. Same restrictions as RC-1000s.
 *  • Timan 3330 → CAB MACHINE. Cabin comfort talk IS allowed and encouraged
 *                  when comfort accessories are selected.
 *
 *  These boundaries are enforced both by gating filler bullets and by stripping
 *  forbidden phrases from generated text.
 * ============================================================================
 */

import type { Language } from '@/types/configurator';

type L = Language;

// ─── Machine profiles ─────────────────────────────────────────────────────────
//
// Defines the platform identity of each machine, what it is and is NOT good at,
// and which topics MUST NEVER appear in copy about that platform.
//

export interface MachineProfile {
  /** Internal machine type/key (must match keys in src/data/machines.ts) */
  key: string;
  /** Has an enclosed operator cab? */
  hasCab: boolean;
  /** Is remote-controlled (operator stands outside)? */
  isRemoteControlled: boolean;
  /** Topics that must never be mentioned in copy about this platform.
   *  Used as a hard filter pass on generated text. */
  forbiddenTopics: string[];
  /** One-liner positioning, used in benefit paragraphs. */
  positioning: Record<L, string>;
}

export const MACHINE_PROFILES: Record<string, MachineProfile> = {
  'RC-1000S': {
    key: 'RC-1000S',
    hasCab: false,
    isRemoteControlled: true,
    forbiddenTopics: [
      'kabine', 'cabin', 'Kabine',
      'aircondition', 'air conditioning', 'Klimaanlage', 'aria condizionata', 'klíma',
      'skyderude', 'sliding window', 'Schiebefenster', 'finestre scorrevoli', 'tolóablak',
      'luftaffjedret sæde', 'air-suspended seat', 'luftgefederter Sitz', 'sedile con sospensione', 'légrugós ülés',
      'solskærm', 'sun visor', 'Sonnenblende', 'parasole', 'napellenző',
      'førerkabine', 'cab comfort', 'kabinekomfort', 'Kabinenkomfort', 'comfort della cabina', 'fülkekomfort',
    ],
    positioning: {
      da: 'fjernbetjent klippeløsning til krævende terræn og skråninger, hvor operatøren står sikkert udenfor maskinen',
      en: 'remote-controlled mowing solution for demanding terrain and slopes, with the operator safely outside the machine',
      de: 'ferngesteuerte Mählösung für anspruchsvolles Gelände und Hänge, mit dem Bediener sicher außerhalb der Maschine',
      it: 'soluzione di taglio telecomandata per terreni impegnativi e pendii, con l\'operatore al sicuro fuori dalla macchina',
      hu: 'távirányítású kaszálási megoldás igényes terephez és lejtőkhöz, a kezelő biztonságban a gépen kívül',
    },
  },
  'RC-751': {
    key: 'RC-751',
    hasCab: false,
    isRemoteControlled: true,
    forbiddenTopics: [
      'kabine', 'cabin', 'Kabine',
      'aircondition', 'air conditioning', 'Klimaanlage', 'aria condizionata', 'klíma',
      'skyderude', 'sliding window', 'Schiebefenster', 'finestre scorrevoli', 'tolóablak',
      'luftaffjedret sæde', 'air-suspended seat', 'luftgefederter Sitz', 'sedile con sospensione', 'légrugós ülés',
      'førerkabine', 'cab comfort', 'kabinekomfort', 'Kabinenkomfort', 'comfort della cabina', 'fülkekomfort',
    ],
    positioning: {
      da: 'kompakt fjernbetjent klipper til skråninger op til 50° og svært tilgængelige områder',
      en: 'compact remote-controlled mower for slopes up to 50° and hard-to-reach areas',
      de: 'kompakter ferngesteuerter Mäher für Hänge bis 50° und schwer zugängliche Bereiche',
      it: 'falciatrice compatta telecomandata per pendii fino a 50° e aree difficili da raggiungere',
      hu: 'kompakt távirányítású kaszáló akár 50°-os lejtőkhöz és nehezen elérhető területekhez',
    },
  },
  'Timan 3330': {
    key: 'Timan 3330',
    hasCab: true,
    isRemoteControlled: false,
    forbiddenTopics: [],
    positioning: {
      da: 'alsidig redskabsbærer med komfortabel førerkabine og hurtige redskabsskift til daglig drift året rundt',
      en: 'versatile tool carrier with a comfortable cab and quick tool changes for year-round daily operations',
      de: 'vielseitiger Geräteträger mit komfortabler Kabine und schnellem Werkzeugwechsel für den täglichen Ganzjahreseinsatz',
      it: 'porta-attrezzi versatile con cabina confortevole e cambi utensile rapidi per operatività quotidiana tutto l\'anno',
      hu: 'sokoldalú eszközhordozó komfortos fülkével és gyors szerszámcserével az egész éves napi üzemeltetéshez',
    },
  },
};

// Helper: which profile to use for a given machine key. Falls back to a
// non-cab, non-remote default when an unknown machine is encountered.
export function getMachineProfile(key: string): MachineProfile | null {
  return MACHINE_PROFILES[key] ?? null;
}

// ─── Tool profiles ────────────────────────────────────────────────────────────
//
// Each redskab selected by the customer gets a short, specific paragraph in
// the "fordele" output. Keep it concise (≤ 220 chars), focus on practical
// daily-work value, never mention prices.
//

export interface ToolProfile {
  /** Match by accessory id (exact) OR by name substring (case-insensitive). */
  matchIds: string[];
  matchNames: string[];
  /** Short label used in copy */
  label: Record<L, string>;
  /** What this tool is good for in practical daily work. */
  whatItsGoodFor: Record<L, string>;
  /** Optional: tasks/capabilities this tool covers — used to detect gaps. */
  capabilities: ToolCapability[];
}

export type ToolCapability =
  | 'rough_vegetation'   // tall grass, brush, hogweed
  | 'fine_grass'         // lawn, sheep grazing, nature mgmt
  | 'precision_cutting'  // hedge/edge, finger bar precision
  | 'sweeping'           // paths, leaves, debris
  | 'weed_brushing'      // mechanical weed control
  | 'snow_plowing'       // V-plow, dozer
  | 'snow_blowing'       // snow blower / thrower
  | 'salt_spreading'     // CS-200, spreader
  | 'stump_removal';     // stump grinder

export const TOOL_PROFILES: ToolProfile[] = [
  {
    matchIds: ['410910'],
    matchNames: ['Slagleklipper', 'Flail', 'Schlegelmäher', 'Trinciatrice', 'Szárzúzó'],
    label: {
      da: 'slagleklipperen',
      en: 'the flail mower',
      de: 'der Schlegelmäher',
      it: 'la trinciatrice',
      hu: 'a szárzúzó',
    },
    whatItsGoodFor: {
      da: 'rydder højt græs, mindre buske og bjørneklo i tæt bevoksning og på skråninger op til 50°',
      en: 'clears tall grass, small bushes and giant hogweed in dense vegetation and on slopes up to 50°',
      de: 'räumt hohes Gras, kleinere Büsche und Riesenbärenklau in dichter Vegetation und an Hängen bis 50°',
      it: 'taglia erba alta, piccoli arbusti e panace gigante in vegetazione fitta e su pendii fino a 50°',
      hu: 'magas füvet, kisebb bokrokat és kaukázusi medvetalpat tisztít sűrű növényzetben és akár 50°-os lejtőkön',
    },
    capabilities: ['rough_vegetation'],
  },
  {
    matchIds: ['411800'],
    matchNames: ['Fingerklipper', 'Finger Bar', 'Fingerbalkenmäher', 'barra falciante', 'Ujjazó'],
    label: {
      da: 'fingerklipperen',
      en: 'the finger bar mower',
      de: 'der Fingerbalkenmäher',
      it: 'la falciatrice a barra',
      hu: 'az ujjazó kasza',
    },
    whatItsGoodFor: {
      da: 'giver et rent, skånsomt snit til naturpleje, fåregræs og biotopslignende arealer, hvor planterne ikke skal hakkes',
      en: 'delivers a clean, gentle cut for nature management, sheep grazing and biotope-like areas where plants must not be shredded',
      de: 'liefert einen sauberen, schonenden Schnitt für Naturpflege, Schafweiden und biotopähnliche Flächen, bei denen die Pflanzen nicht zerkleinert werden sollen',
      it: 'offre un taglio pulito e delicato per gestione naturalistica, aree di pascolo e biotopi dove le piante non vanno triturate',
      hu: 'tiszta, kíméletes vágást ad természetvédelmi területeken, juhlegelőkön és biotópokon, ahol a növényeket nem szabad aprítani',
    },
    capabilities: ['fine_grass', 'precision_cutting'],
  },
  {
    matchIds: ['411666', '730017', '730130'],
    matchNames: ['Rotorklipper', 'Rotary mower'],
    label: {
      da: 'rotorklipperen',
      en: 'the rotary mower',
      de: 'der Sichelmäher',
      it: 'il rasaerba a rotore',
      hu: 'a forgókéses kasza',
    },
    whatItsGoodFor: {
      da: 'leverer ensartet græspleje på plæner og parker, hvor finish og kvalitet betyder noget',
      en: 'delivers consistent lawn care on lawns and parks where finish and quality matter',
      de: 'liefert gleichmäßige Rasenpflege auf Rasenflächen und in Parks, wo Finish und Qualität zählen',
      it: 'offre cura uniforme del prato in giardini e parchi dove finitura e qualità contano',
      hu: 'egyenletes gyepápolást nyújt parkokban és gyepfelületeken, ahol fontos a finish és a minőség',
    },
    capabilities: ['fine_grass'],
  },
  {
    matchIds: ['411845', '730020'],
    matchNames: ['Kost', 'Fejekost', 'Sweeper', 'Kehrmaschine', 'fejemaskine'],
    label: {
      da: 'kosten',
      en: 'the sweeper',
      de: 'die Kehrmaschine',
      it: 'la spazzatrice',
      hu: 'a seprűgép',
    },
    whatItsGoodFor: {
      da: 'fejer stier, pladser og indkørsler fri for blade, grus, flis og let sne – og dækker både løvfald, daglig renhold og glat føre',
      en: 'sweeps paths, squares and driveways free of leaves, gravel, debris and light snow – covering autumn, daily cleaning and slippery conditions',
      de: 'fegt Wege, Plätze und Einfahrten frei von Laub, Splitt, Schmutz und leichtem Schnee – deckt Herbst, tägliche Reinigung und Rutschgefahr ab',
      it: 'pulisce sentieri, piazze e ingressi da foglie, ghiaia, detriti e neve leggera – copre autunno, pulizia quotidiana e fondo scivoloso',
      hu: 'leveleket, sódert, törmeléket és könnyű havat söpör utakon, tereken és behajtókon – lefedi az őszt, a napi takarítást és a csúszós időszakokat',
    },
    capabilities: ['sweeping'],
  },
  {
    matchIds: ['730600'],
    matchNames: ['Ukrudtsbørste', 'Weed brush', 'Unkrautbürste'],
    label: {
      da: 'ukrudtsbørsten',
      en: 'the weed brush',
      de: 'die Unkrautbürste',
      it: 'la spazzola diserbo',
      hu: 'a gyomkefe',
    },
    whatItsGoodFor: {
      da: 'fjerner ukrudt mekanisk fra fortove, kantsten og belægninger uden brug af sprøjtemidler – relevant for kommuner og pesticidfri drift',
      en: 'mechanically removes weeds from sidewalks, kerbs and paving without herbicides – relevant for municipalities and pesticide-free operations',
      de: 'entfernt Unkraut mechanisch von Gehwegen, Bordsteinen und Pflasterflächen ohne Herbizide – relevant für Kommunen und pestizidfreien Betrieb',
      it: 'rimuove meccanicamente le erbacce da marciapiedi, cordoli e pavimentazioni senza erbicidi – rilevante per comuni e gestione senza pesticidi',
      hu: 'mechanikusan távolítja el a gyomot járdákról, szegélyekről és burkolatokról vegyszer nélkül – releváns önkormányzatoknak és vegyszermentes üzemeltetéshez',
    },
    capabilities: ['weed_brushing'],
  },
  {
    matchIds: ['411742', '730114', '730105'],
    matchNames: ['V-plov', 'V-plow', 'V-Pflug', 'Dozerblad'],
    label: {
      da: 'V-ploven',
      en: 'the V-plow',
      de: 'der V-Pflug',
      it: 'il vomere a V',
      hu: 'a V-eke',
    },
    whatItsGoodFor: {
      da: 'rydder sne hurtigt fra stier, p-pladser og indkørsler og kan justeres som V-plov, Y-plov eller skrabeblad afhængigt af opgaven',
      en: 'clears snow quickly from paths, parking lots and driveways and can be set as V-plow, Y-plow or scraper blade depending on the task',
      de: 'räumt Schnee schnell von Wegen, Parkplätzen und Einfahrten und lässt sich als V-Pflug, Y-Pflug oder Schürfblatt einstellen',
      it: 'sgombera rapidamente la neve da sentieri, parcheggi e ingressi e può essere regolato come vomere a V, a Y o lama raschiante',
      hu: 'gyorsan eltakarítja a havat utakról, parkolókból és behajtókról, és V-, Y-ekeként vagy tolólapként is beállítható',
    },
    capabilities: ['snow_plowing'],
  },
  {
    matchIds: ['418000', '730106'],
    matchNames: ['Sneslynge', 'Snow blower', 'Schneeschleuder', 'Turbina da neve', 'Hómaró'],
    label: {
      da: 'sneslyngen',
      en: 'the snow blower',
      de: 'die Schneeschleuder',
      it: 'la turbina da neve',
      hu: 'a hómaró',
    },
    whatItsGoodFor: {
      da: 'fjerner store snemængder hurtigt og kaster sneen op til 20 meter væk – ideel når der skal ryddes effektivt på faste overflader',
      en: 'removes large amounts of snow quickly and throws it up to 20 m away – ideal for efficient clearing on hard surfaces',
      de: 'entfernt große Schneemengen schnell und wirft den Schnee bis zu 20 m weit – ideal für effizientes Räumen auf festen Oberflächen',
      it: 'rimuove rapidamente grandi quantità di neve e la lancia fino a 20 m – ideale per sgombero efficiente su superfici dure',
      hu: 'gyorsan eltávolítja a nagy mennyiségű havat és akár 20 méterre is eldobja – ideális hatékony hóeltakarításhoz szilárd burkolatokon',
    },
    capabilities: ['snow_blowing'],
  },
  {
    matchIds: ['725131', '725132', '725138'],
    matchNames: ['Spreder', 'Spreader', 'CS-200', 'Streuer', 'Spargitore', 'Szóró'],
    label: {
      da: 'CS-200 sprederen',
      en: 'the CS-200 spreader',
      de: 'der CS-200 Streuer',
      it: 'lo spargitore CS-200',
      hu: 'a CS-200 szóró',
    },
    whatItsGoodFor: {
      da: 'spreder salt, sand og grus jævnt og kontrolleret til glatførebekæmpelse – afgørende, når frosten kommer og pladser og veje skal være farbare',
      en: 'spreads salt, sand and grit evenly and under control for de-icing – essential when frost arrives and squares and roads must remain passable',
      de: 'streut Salz, Sand und Splitt gleichmäßig und kontrolliert zur Glättebekämpfung – entscheidend, wenn Frost kommt und Plätze und Wege passierbar bleiben müssen',
      it: 'distribuisce sale, sabbia e graniglia in modo uniforme e controllato per il disgelo – essenziale quando arriva il gelo e piazze e strade devono restare percorribili',
      hu: 'egyenletesen és kontrolláltan szór sót, homokot és sódert síkosság ellen – elengedhetetlen, amikor beköszönt a fagy és a tereknek, utaknak járhatónak kell maradniuk',
    },
    capabilities: ['salt_spreading'],
  },
  {
    matchIds: ['HFS-1012'],
    matchNames: ['Stubfræser', 'Stump grinder', 'Stubbenfräse', 'Tritaceppi', 'Tuskómaró'],
    label: {
      da: 'stubfræseren',
      en: 'the stump grinder',
      de: 'die Stubbenfräse',
      it: 'il tritaceppi',
      hu: 'a tuskómaró',
    },
    whatItsGoodFor: {
      da: 'fjerner stubbe hurtigt med hydraulisk sving, så maskinen står stille under arbejdet og operatøren undgår tungt gravearbejde',
      en: 'removes stumps quickly with hydraulic swing, keeping the machine still during work and saving the operator from heavy digging',
      de: 'entfernt Stubben schnell mit hydraulischem Schwenk – die Maschine bleibt während der Arbeit stehen und der Bediener spart sich schweres Graben',
      it: 'rimuove rapidamente i ceppi con oscillazione idraulica, mantenendo ferma la macchina e risparmiando lavoro di scavo all\'operatore',
      hu: 'gyorsan eltávolítja a tuskókat hidraulikus elfordulással – a gép áll munka közben, és a kezelő megússza a nehéz ásást',
    },
    capabilities: ['stump_removal'],
  },
];

// ─── Complementary tool rules ─────────────────────────────────────────────────
//
// "If you have X but NOT Y, suggest Y because <reason>."
// Drives the second popup ("Vil du også høre, hvad Timan anbefaler?").
//
// Each rule is evaluated independently. A rule fires only when:
//   • at least one capability in `requires` is present in the selection, AND
//   • none of the capabilities in `missing` are present, AND
//   • the suggested tool is compatible with at least one selected machine
//     (validated against compatibleMachines).
//

export interface ToolComplementRule {
  id: string;
  /** Capability the customer ALREADY has. */
  requires: ToolCapability[];
  /** Capability they're MISSING — this is what we suggest. */
  missing: ToolCapability[];
  /** Which machine platforms can carry the suggested tool. */
  compatibleMachines: string[];
  /** Display label for the suggested tool. */
  label: Record<L, string>;
  /** Why we suggest it — practical, concrete, ≤ 200 chars. */
  reason: Record<L, string>;
  /** Lower = higher priority */
  priority: number;
}

export const TOOL_COMPLEMENT_RULES: ToolComplementRule[] = [
  // Fine-grass cutting → suggest a flail for tougher growth
  {
    id: 'fine_to_rough',
    requires: ['fine_grass'],
    missing: ['rough_vegetation'],
    compatibleMachines: ['RC-1000S', 'RC-751', 'Timan 3330'],
    label: {
      da: 'Slagleklipper som supplement til fingerklipperen',
      en: 'Flail mower to complement the finger bar mower',
      de: 'Schlegelmäher als Ergänzung zum Fingerbalkenmäher',
      it: 'Trinciatrice come complemento alla falciatrice a barra',
      hu: 'Szárzúzó az ujjazó kasza kiegészítéseként',
    },
    reason: {
      da: 'fingerklipperen er ideel til fint snit, men en slagleklipper dækker også tilgroede arealer, brombær og bjørneklo – sammen får I det fulde vegetationsspekter',
      en: 'the finger bar is ideal for fine cuts, but a flail mower also handles overgrown areas, brambles and hogweed – together you cover the full vegetation spectrum',
      de: 'der Fingerbalkenmäher ist ideal für Feinschnitt, aber ein Schlegelmäher bewältigt auch zugewachsene Flächen, Brombeeren und Bärenklau – zusammen decken Sie das gesamte Vegetationsspektrum ab',
      it: 'la barra falciante è ideale per tagli fini, ma una trinciatrice gestisce anche aree incolte, rovi e panace – insieme coprite l\'intero spettro vegetativo',
      hu: 'az ujjazó kasza ideális finom vágáshoz, de egy szárzúzó az elvadult területeket, szedret és medvetalpat is kezeli – együtt a teljes növényzeti spektrumot lefedik',
    },
    priority: 1,
  },
  // Rough vegetation → suggest finger bar for nature management
  {
    id: 'rough_to_fine',
    requires: ['rough_vegetation'],
    missing: ['fine_grass', 'precision_cutting'],
    compatibleMachines: ['RC-1000S', 'RC-751'],
    label: {
      da: 'Fingerklipper som supplement til slagleklipperen',
      en: 'Finger bar mower to complement the flail mower',
      de: 'Fingerbalkenmäher als Ergänzung zum Schlegelmäher',
      it: 'Falciatrice a barra come complemento alla trinciatrice',
      hu: 'Ujjazó kasza a szárzúzó kiegészítéseként',
    },
    reason: {
      da: 'slagleklipperen klarer den grove rydning, mens en fingerklipper giver det skånsomme snit, der er nødvendigt på naturarealer og fåregræs',
      en: 'the flail handles rough clearing, while a finger bar provides the gentle cut needed for nature areas and sheep grazing',
      de: 'der Schlegel übernimmt die grobe Räumung, während ein Fingerbalkenmäher den schonenden Schnitt für Naturflächen und Schafweiden liefert',
      it: 'la trinciatrice gestisce lo sfalcio grossolano, mentre una barra falciante fornisce il taglio delicato necessario per aree naturali e pascoli',
      hu: 'a szárzúzó a durva tisztítást végzi, míg egy ujjazó kasza biztosítja a természetvédelmi területekhez és juhlegelőkhöz szükséges kíméletes vágást',
    },
    priority: 2,
  },
  // Vegetation work → suggest sweeper for all-season maintenance
  {
    id: 'veg_to_sweep',
    requires: ['rough_vegetation'],
    missing: ['sweeping'],
    compatibleMachines: ['RC-1000S', 'Timan 3330'],
    label: {
      da: 'Kost til løvfald, debris og let sne',
      en: 'Sweeper for leaves, debris and light snow',
      de: 'Kehrmaschine für Laub, Schmutz und leichten Schnee',
      it: 'Spazzatrice per foglie, detriti e neve leggera',
      hu: 'Seprűgép levelekhez, törmelékhez és könnyű hóhoz',
    },
    reason: {
      da: 'en kost giver maskinen brugsværdi året rundt – løvfald om efteråret, daglig renholdelse og let snerydning om vinteren – så investeringen ikke står stille uden for klippesæsonen',
      en: 'a sweeper extends the machine\'s use across the entire year – autumn leaves, daily cleaning and light snow clearing in winter – so the investment isn\'t idle outside the mowing season',
      de: 'eine Kehrmaschine erweitert den Einsatz der Maschine über das ganze Jahr – Herbstlaub, tägliche Reinigung und leichter Schnee im Winter – damit die Investition außerhalb der Mähsaison nicht stillsteht',
      it: 'una spazzatrice estende l\'uso della macchina tutto l\'anno – foglie autunnali, pulizia quotidiana e neve leggera in inverno – così l\'investimento non resta fermo fuori stagione',
      hu: 'egy seprűgép egész évre kiterjeszti a gép használatát – őszi levelek, napi takarítás és téli könnyű hóeltakarítás – így a befektetés nem áll a kaszálási szezonon kívül',
    },
    priority: 2,
  },
  // Vegetation work, no winter capability → suggest V-plow
  {
    id: 'veg_to_winter_plow',
    requires: ['rough_vegetation', 'fine_grass'],
    missing: ['snow_plowing', 'snow_blowing'],
    compatibleMachines: ['RC-1000S', 'Timan 3330'],
    label: {
      da: 'V-plov til vinterberedskab',
      en: 'V-plow for winter readiness',
      de: 'V-Pflug für Winterbereitschaft',
      it: 'Vomere a V per la preparazione invernale',
      hu: 'V-eke a téli felkészültséghez',
    },
    reason: {
      da: 'en V-plov forvandler maskinen til en helårsløsning – I udnytter den samme investering til snerydning på stier, p-pladser og indkørsler, når vinteren melder sig',
      en: 'a V-plow turns the machine into a year-round solution – the same investment is used for snow clearing on paths, parking lots and driveways when winter arrives',
      de: 'ein V-Pflug macht aus der Maschine eine Ganzjahreslösung – dieselbe Investition wird im Winter für die Schneeräumung auf Wegen, Parkplätzen und Einfahrten genutzt',
      it: 'un vomere a V trasforma la macchina in una soluzione tutto l\'anno – la stessa investimento viene utilizzato per lo sgombero neve su sentieri, parcheggi e ingressi quando arriva l\'inverno',
      hu: 'egy V-eke egész éves megoldássá alakítja a gépet – ugyanazt a befektetést használja hóeltakarításra utakon, parkolókban és behajtókon, amikor beköszönt a tél',
    },
    priority: 1,
  },
  // Snow plowing without spreading → suggest spreader
  {
    id: 'plow_to_spread',
    requires: ['snow_plowing'],
    missing: ['salt_spreading'],
    compatibleMachines: ['Timan 3330'],
    label: {
      da: 'CS-200 spreder til glatførebekæmpelse',
      en: 'CS-200 spreader for de-icing',
      de: 'CS-200 Streuer zur Glättebekämpfung',
      it: 'Spargitore CS-200 per disgelo',
      hu: 'CS-200 szóró síkosságmentesítéshez',
    },
    reason: {
      da: 'snerydning og glatførebekæmpelse hører sammen – en spreder tæt op om plov-løsningen sikrer, at I kan rykke i én arbejdsgang og holde arealerne sikre',
      en: 'snow clearing and de-icing belong together – a spreader alongside the plow lets you handle both in a single pass and keep surfaces safe',
      de: 'Schneeräumung und Glättebekämpfung gehören zusammen – ein Streuer neben dem Pflug ermöglicht beides in einem Arbeitsgang und hält die Flächen sicher',
      it: 'sgombero neve e disgelo vanno insieme – uno spargitore accanto al vomere permette di gestire entrambi in un singolo passaggio mantenendo sicure le superfici',
      hu: 'a hóeltakarítás és a síkosságmentesítés összetartoznak – az ekén kívüli szóró egy menetben elvégzi mindkettőt, és biztonságosan tartja a felületeket',
    },
    priority: 1,
  },
  // Sweeping without weed brush → suggest weed brush for pesticide-free cleaning
  {
    id: 'sweep_to_weed',
    requires: ['sweeping'],
    missing: ['weed_brushing'],
    compatibleMachines: ['RC-1000S'],
    label: {
      da: 'Ukrudtsbørste til pesticidfri renholdelse',
      en: 'Weed brush for pesticide-free cleaning',
      de: 'Unkrautbürste für pestizidfreie Reinigung',
      it: 'Spazzola diserbo per pulizia senza pesticidi',
      hu: 'Gyomkefe vegyszermentes takarításhoz',
    },
    reason: {
      da: 'fejning fjerner overfladisk smuds, men ukrudt mellem fliser og kantsten kræver mekanisk bekæmpelse – ukrudtsbørsten lukker det hul uden brug af sprøjtemidler',
      en: 'sweeping removes surface debris, but weeds between paving and kerbs need mechanical removal – the weed brush closes that gap without herbicides',
      de: 'das Kehren entfernt Oberflächenschmutz, aber Unkraut zwischen Pflastern und Bordsteinen erfordert mechanische Bekämpfung – die Unkrautbürste schließt diese Lücke ohne Herbizide',
      it: 'la spazzatura rimuove i detriti superficiali, ma le erbacce tra pavimentazione e cordoli richiedono rimozione meccanica – la spazzola diserbo colma questo divario senza erbicidi',
      hu: 'a seprés eltávolítja a felszíni szennyeződést, de a burkolat és szegélyek közti gyom mechanikus eltávolítást igényel – a gyomkefe ezt a hiányt vegyszer nélkül pótolja',
    },
    priority: 2,
  },
];

// ─── Per-language strings used by the new tool-aware paragraph layer ──────────

export const TOOL_AWARE_TEXT = {
  // Heading injected when at least one tool is selected
  toolFocusIntro: {
    da: (toolSummary: string) => `Med ${toolSummary} har I valgt redskaber, der er afstemt til konkrete opgaver – ikke en generisk pakke.`,
    en: (toolSummary: string) => `With ${toolSummary} you've chosen tools matched to concrete tasks – not a generic package.`,
    de: (toolSummary: string) => `Mit ${toolSummary} haben Sie Werkzeuge gewählt, die auf konkrete Aufgaben abgestimmt sind – kein generisches Paket.`,
    it: (toolSummary: string) => `Con ${toolSummary} avete scelto strumenti calibrati su compiti concreti – non un pacchetto generico.`,
    hu: (toolSummary: string) => `A(z) ${toolSummary} segítségével konkrét feladatokra szabott szerszámokat választott – nem egy általános csomagot.`,
  },
  // Per-tool sentence template
  toolValueLine: {
    da: (label: string, value: string) => `${capitalize(label)} ${value}.`,
    en: (label: string, value: string) => `${capitalize(label)} ${value}.`,
    de: (label: string, value: string) => `${capitalize(label)} ${value}.`,
    it: (label: string, value: string) => `${capitalize(label)} ${value}.`,
    hu: (label: string, value: string) => `${capitalize(label)} ${value}.`,
  },
  // Recommendation paragraph for tool-complement section
  recParaToolComplement: {
    da: (subject: string) => `Ud over de tilvalg, vi typisk anbefaler til ${subject}, er der også et par redskaber, der ville styrke løsningen i hverdagen. Vi nævner dem ikke for at sælge mere, men fordi de erfaringsmæssigt giver mest værdi netop sammen med det, I allerede har valgt.`,
    en: (subject: string) => `Besides the add-ons we typically recommend for ${subject}, there are also a couple of tools that would strengthen the solution in daily use. We mention them not to upsell, but because experience shows they give the most value exactly alongside what you've already chosen.`,
    de: (subject: string) => `Neben den Zusatzoptionen, die wir für ${subject} typischerweise empfehlen, gibt es auch ein paar Werkzeuge, die die Lösung im Alltag stärken würden. Wir nennen sie nicht zum Upsell, sondern weil die Erfahrung zeigt, dass sie gerade neben dem bereits Gewählten den größten Mehrwert bringen.`,
    it: (subject: string) => `Oltre alle opzioni che raccomandiamo tipicamente per ${subject}, ci sono anche un paio di strumenti che rafforzerebbero la soluzione nell'uso quotidiano. Li menzioniamo non per vendere di più, ma perché l'esperienza dimostra che danno più valore proprio accanto a ciò che avete già scelto.`,
    hu: (subject: string) => `A(z) ${subject} esetén jellemzően ajánlott opciókon kívül van néhány szerszám is, amely a mindennapi használatban erősítené a megoldást. Nem felülértékesítés miatt említjük, hanem mert a tapasztalat azt mutatja, hogy pont a már választottak mellett adják a legtöbb értéket.`,
  },
};

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── System rules (enforced by the generator) ────────────────────────────────
//
// These are NOT prompts to an LLM — they are the rules the deterministic
// generator (src/lib/salesArguments.ts) follows when assembling text. Documented
// here so the rules and the wording live in one place.
//

export const SYSTEM_RULES = {
  description: `
Generator behaviour rules — enforced in src/lib/salesArguments.ts:

1. MACHINE BOUNDARIES are absolute.
   • Never mention any topic from MACHINE_PROFILES[<machine>].forbiddenTopics
     in copy that talks about that machine.
   • Comfort/cab bullets are gated to machines where hasCab === true.
   • Generic filler text mentioning "remote control or cab comfort" is split
     into per-platform variants based on which machines are actually selected.

2. TOOL AWARENESS is required.
   • If any redskab is selected, the benefits paragraph MUST include at least
     one sentence from TOOL_PROFILES describing what those tools do.
   • Tool sentences are written about tools as a unit, not the base machine.
   • Tool capabilities are tracked separately from machine capabilities so a
     fingerklipper on RC-1000s does not inherit RC-1000s comfort bullets.

3. RECOMMENDATIONS combine two layers:
   a) Existing accessory rules (warranty, lights, cameras, chassis care, …)
      defined inside salesArguments.ts.
   b) Tool-complement rules from TOOL_COMPLEMENT_RULES — only fired when the
      capability is genuinely missing AND the suggested tool is compatible
      with at least one selected machine.

4. NEVER guess.
   • If a tool isn't in TOOL_PROFILES, no per-tool sentence is added.
   • If a complement rule's compatibility doesn't match any selected machine,
     it is silently dropped.

5. NO PRICING in benefit/recommendation copy. Prices live in the price block.
`.trim(),
};

// ─── Utility: detect tool profiles from selected accessory ids/names ─────────

export function detectToolProfile(accId: string, accName: string): ToolProfile | null {
  const nameLc = (accName || '').toLowerCase();
  for (const profile of TOOL_PROFILES) {
    if (profile.matchIds.includes(accId)) return profile;
    if (profile.matchNames.some(n => nameLc.includes(n.toLowerCase()))) return profile;
  }
  return null;
}

// ─── Utility: strip forbidden topics from generated text ─────────────────────
//
// Scans the text for any forbidden phrase from any machine in `selectedMachines`
// that does NOT have that topic. We only strip if at least one selected machine
// forbids the topic AND no selected machine allows it (cab on Timan 3330 is
// fine even when RC-1000s is also in the selection).
//

export function stripForbiddenTopics(
  text: string,
  selectedMachineKeys: string[]
): string {
  if (!text) return text;

  const profiles = selectedMachineKeys
    .map(k => MACHINE_PROFILES[k])
    .filter(Boolean) as MachineProfile[];

  if (profiles.length === 0) return text;

  // Topic is "forbidden" only if EVERY selected machine forbids it.
  // (If any selected machine allows it, e.g. Timan 3330 with cab, keep it.)
  const allForbidden = new Set<string>();
  if (profiles.length > 0) {
    const first = new Set(profiles[0].forbiddenTopics);
    for (const t of first) {
      if (profiles.every(p => p.forbiddenTopics.includes(t))) allForbidden.add(t);
    }
  }

  if (allForbidden.size === 0) return text;

  let result = text;
  for (const phrase of allForbidden) {
    // Remove sentences that contain a forbidden phrase entirely.
    const sentenceRegex = new RegExp(
      `[^.!?]*\\b${escapeRegExp(phrase)}\\b[^.!?]*[.!?]`,
      'gi'
    );
    result = result.replace(sentenceRegex, '').trim();
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
