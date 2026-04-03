import { Machine, Accessory, Language } from '@/types/configurator';

// ===== CONSTANTS =====
export const ACC_ID_WIRE_HARNESS = '412614';
export const ACC_ID_VPLOW = '411742';
export const ACC_ID_WEEDBRUSH = '730600';
export const ACC_ID_FLASH_LIGHT = '411630';
export const ACC_ID_WORK_LIGHT = '412594';
export const ACC_ID_WARRANTY_1000 = '795016';
export const ACC_ID_WARRANTY_751 = '795015';
export const ACC_ID_OIL_NORMAL = '123456';
export const ACC_ID_OIL_BIO = '654321';
export const ACC_ID_RAL_COLOR = '961050';
export const RAL_ALLOWED_IDS = new Set([ACC_ID_RAL_COLOR, 'V34-165']);
export const DEMO_ELIGIBLE_VARENR = new Set(['411000', '410040', '712000']);
export const DEMO_FEE_DKK = 75;
export const DEMO_FEE_EUR = 10;
export const LOOSE_TOOL_KEY = 'LOOSE_TOOL';
export const PACKAGING_COST_ID = 'PACK-LOOSE';

// ===== PRODUCTS =====
export const PRODUCTS: Record<string, Machine> = {
  'RC-1000S': {
    id: 'RC-1000S',
    name: 'RC-1000s Basismaskine',
    nameShort: 'RC-1000S_SHORT',
    priceDKK: 235000,
    priceEUR: 31590,
    varenr: '411000',
    videoUrl: 'https://www.youtube.com/watch?v=D-hXvg_oW9s',
    imageUrl: 'https://img.youtube.com/vi/brq-kHp9gPI/hqdefault.jpg',
    techSpecs: [
      { label: 'Motor', value: 'Vanguard, 23 HK' },
      { label: 'Max. hældning', value: '50 grader' },
      { label: 'Vægt (Basis)', value: '440 kg' },
      { label: 'Klippebredde', value: '1000 mm' },
    ],
    machineDetails: {
      main: {
        da: 'RC 1000s – en ny generation af fjernstyret power, præcision og performance.',
        en: 'RC 1000s – a new generation of remote-controlled power, precision, and performance.',
      },
      bullets: {
        da: [
          'Bælterne er monteret med uafhængige ophæng, fuld kontakt med underlaget og høj stabilitet på stejle skråninger.',
          'Den mest kompakte i sin klasse.',
          'Det brede udstyrsprogram dækker alle sæsoner.',
          'Fjernbetjening: 2,4 Ghz, 150 m maks. betjeningsafstand.',
          'Let adgang til motorrummet.',
        ],
        en: [
          'Tracks mounted with independent suspension, full ground contact.',
          'The most compact in its class.',
          'Wide range of equipment covers all seasons.',
          'Remote control: 2.4 GHz, 150 m max operating distance.',
          'Easy access to engine compartment.',
        ],
      },
      dimensions: [
        { label: 'Længde (Basis)', value: '1.310 mm' },
        { label: 'Bredde (Basis)', value: '1.000 mm' },
        { label: 'Højde (Basis)', value: '685 mm' },
        { label: 'Vægt (Basis)', value: '440 kg' },
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
    videoUrl: 'https://www.youtube.com/watch?v=LqrPvmCXues',
    imageUrl: 'https://img.youtube.com/vi/LqrPvmCXues/hqdefault.jpg',
    techSpecs: [
      { label: 'Motor', value: 'B&S, 14 HK' },
      { label: 'Max. hældning', value: '50 grader' },
      { label: 'Vægt (Basis)', value: '345 kg' },
      { label: 'Klippebredde', value: '750 mm' },
    ],
    machineDetails: {
      main: {
        da: 'RC-751 er en kompakt og stærk fjernstyret klippeløsning.',
        en: 'RC-751 is a compact and powerful remote-controlled mowing solution.',
      },
      bullets: {
        da: [
          'Bælterne er monteret med uafhængige ophæng.',
          'RC-751 klipper fri for bælterne.',
          'Arbejdsmiljø: Skån ryg, hofter og ankler.',
        ],
        en: [
          'Tracks are mounted with independent suspension.',
          'RC-751 cuts outside the track width.',
          'Work environment: Reduce strain on back, hips and ankles.',
        ],
      },
      dimensions: [
        { label: 'Motor', value: 'B&S, 14 HK' },
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
        da: 'Timan 3330 er en alsidig redskabsbærer designet til komfort og effektivitet året rundt.',
        en: 'Timan 3330 is a versatile tool carrier designed for comfort and efficiency all year round.',
      },
      bullets: {
        da: ['Dansk produceret kvalitet.', 'Lavt støjniveau i kabinen.', 'Hurtigt skift af redskaber.', '4-hjulstræk for optimalt greb.'],
        en: ['Danish produced quality.', 'Low noise level in the cab.', 'Quick change of implements.', '4-wheel drive for optimal traction.'],
      },
      dimensions: [],
    },
  },
  'LOOSE_TOOL': {
    id: 'LOOSE_TOOL',
    name: { da: 'Løs redskab', en: 'Loose attachment' },
    nameShort: 'LOOSE_TOOL_SHORT',
    priceDKK: 0,
    priceEUR: 0,
    varenr: '55-66',
    techSpecs: [],
    machineDetails: {
      main: {
        da: 'Vælg denne hvis du kun skal bestille redskaber/udstyr uden maskine.',
        en: 'Select this if you only need implements/equipment without a machine.',
      },
      bullets: { da: [], en: [] },
      dimensions: [],
    },
  },
};

// ===== ACCESSORIES =====
export const ACCESSORIES: Record<string, Accessory[]> = {
  'RC-1000S': [
    // Oil group (mandatory)
    { id: ACC_ID_OIL_NORMAL, varenr: '13101003', name: { da: 'Standard olie - Texaco HDZ46', en: 'Standard oil - Texaco HDZ46' }, priceDKK: 0, priceEUR: 0, group: 'oil_1000', sectionStart: 'oil_section' },
    { id: ACC_ID_OIL_BIO, varenr: '13101005', name: { da: 'Bio olie - Biohydran TMP 46', en: 'Bio oil - Biohydran TMP 46' }, priceDKK: 238.80, priceEUR: 32.20, group: 'oil_1000' },
    // Equipment
    { id: ACC_ID_WORK_LIGHT, varenr: '412594', name: { da: 'Arbejdslamper 2 stk.', en: 'Work Lights 2 pcs.' }, priceDKK: 1850, priceEUR: 250, sectionStart: 'Udstyr til RC-1000s' },
    { id: ACC_ID_FLASH_LIGHT, varenr: '411630', name: { da: 'Blitzlys 2 stk.', en: 'Flashing Lights 2 pcs.' }, priceDKK: 2360, priceEUR: 320, auto: true },
    { id: ACC_ID_WARRANTY_1000, varenr: '795016', name: { da: 'RC-1000s udvidet komponentgaranti 12mdr.', en: 'RC-1000s Extended Component Warranty 12 months' }, priceDKK: 5500, priceEUR: 740 },
    // Tools header
    { id: 'REDSKABER_HEADER', varenr: 'HEADER', name: { da: 'Redskaber til RC-1000s', en: 'Tools for RC-1000s' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '410910', varenr: '410910', name: { da: 'Slagleklipper inkl Y-slagle sæt', en: 'Flail Mower incl. Y-flail set' }, priceDKK: 43900, priceEUR: 5905 },
    { id: '411701', varenr: '411701', name: { da: 'Stativ til afsætning af slagleklipper', en: 'Stand for parking the flail mower' }, priceDKK: 1100, priceEUR: 150, requires: '410910' },
    { id: '412585', varenr: '412585', name: { da: 'Hammerslagsæt 18 stk.', en: 'Hammer flail set, 18 pcs.' }, priceDKK: 2060, priceEUR: 280, requires: '410910' },
    { id: '411594', varenr: '411594', name: { da: 'Y-slaglesæt 18 stk.', en: 'Y-flail set, 18 pcs.' }, priceDKK: 2490, priceEUR: 335, requires: '410910' },
    { id: '411666', varenr: '411666', name: { da: 'Rotorklipper 1350 mm', en: 'Rotary Mower 1350 mm' }, priceDKK: 43800, priceEUR: 5890 },
    { id: '411800', varenr: '411800', name: { da: 'Fingerklipper 1700 mm', en: 'Finger Bar Mower 1700 mm' }, priceDKK: 62700, priceEUR: 8430 },
    { id: '412040', varenr: '412040', name: { da: 'Skivehøster 1150mm', en: 'Disc Harvester 1150mm' }, priceDKK: 43000, priceEUR: 5780 },
    { id: 'HFS-1012', varenr: 'HFS-1012', name: { da: 'Stubfræser m/hydraulisk sving', en: 'Stump Grinder w/hydraulic swing' }, priceDKK: 66950, priceEUR: 9000 },
    { id: ACC_ID_VPLOW, varenr: '411742', name: { da: 'V-plov m/gummiskær', en: 'V-plow w/rubber blade' }, priceDKK: 31650, priceEUR: 4255 },
    { id: '411750', varenr: '411750', name: { da: 'Stålskær til v-plov, 2 stk.', en: 'Steel Blade for V-plow, 2 pcs.' }, priceDKK: 2260, priceEUR: 305, requires: ACC_ID_VPLOW },
    { id: '411780', varenr: '411780', name: { da: 'Rustbeskyttelse V-Plov', en: 'Rust Protection V-Plow' }, priceDKK: 1225, priceEUR: 165, requires: ACC_ID_VPLOW },
    { id: '418000', varenr: '418000', name: { da: 'Centerdrevet fejemaskine', en: 'Center Driven Sweeper' }, priceDKK: 21050, priceEUR: 2835 },
    { id: '418010', varenr: '418010', name: { da: 'Rustbeskyttelse Fejemaskine', en: 'Rust Protection Sweeper' }, priceDKK: 950, priceEUR: 130, requires: '418000' },
    { id: '411700', varenr: '411700', name: { da: 'Sneslynge 1100 mm', en: 'Snow Blower 1100 mm' }, priceDKK: 46400, priceEUR: 6245 },
    { id: ACC_ID_WEEDBRUSH, varenr: '730600', name: { da: 'WB-170 ukrudtsbørste basis enhed', en: 'WB-170 Weed Brush Base Unit' }, priceDKK: 21600, priceEUR: 2910 },
    { id: '730601', varenr: '730601', name: { da: 'RC 1000 ophæng ukrudtsbørste', en: 'RC 1000 Weed Brush Mount' }, priceDKK: 4100, priceEUR: 555, requires: ACC_ID_WEEDBRUSH },
    { id: '50101017', varenr: '50101017', name: { da: 'Børste 2 rækker søm i slange', en: 'Brush 2 rows nails in hose' }, priceDKK: 4600, priceEUR: 620, requires: ACC_ID_WEEDBRUSH, isQtyInput: true },
    { id: '50101018', varenr: '50101018', name: { da: 'Børste 1 række søm, 2 rækker fladstål', en: 'Brush 1 row nails, 2 rows flat steel' }, priceDKK: 4600, priceEUR: 620, requires: ACC_ID_WEEDBRUSH, isQtyInput: true },
    // Hidden auto-add
    { id: ACC_ID_WIRE_HARNESS, varenr: '412614', name: { da: 'Ledningsnet til blitz/arbejdslys', en: 'Wiring Harness for Flashing/Work Lights' }, priceDKK: 890, priceEUR: 120, hidden: true },
    // Other equipment
    { id: '411891', varenr: '411891', name: { da: 'Krogplade til udstyr', en: 'Hook Plate for Equipment' }, priceDKK: 700, priceEUR: 95, sectionStart: 'Øvrigt Udstyr' },
    { id: '411906', varenr: '411906', name: { da: 'Bagvægt', en: 'Rear Weight' }, priceDKK: 2820, priceEUR: 379 },
    { id: ACC_ID_RAL_COLOR, varenr: ACC_ID_RAL_COLOR, name: { da: 'Farve efter eget ønske (RAL)', en: 'Custom Color (RAL)' }, priceDKK: 15000, priceEUR: 2015, isRAL: true },
  ],
  'RC-751': [
    { id: '411687', varenr: '411687', name: { da: 'Blitzlys RC-751', en: 'Flashing Light RC-751' }, priceDKK: 2660, priceEUR: 360, sectionStart: 'Udstyr til RC-751' },
    { id: '410106', varenr: '410106', name: { da: 'Lader 12V 7.5A', en: 'Charger 12V 7.5A' }, priceDKK: 1500, priceEUR: 205 },
    { id: '411571', varenr: '411571', name: { da: 'Spikes-sæt, komplet', en: 'Spike Set, complete' }, priceDKK: 2640, priceEUR: 355 },
    { id: '411866', varenr: '411866', name: { da: 'Y-slagle-sæt af 16 stk.', en: 'Y-flail Set of 16 pcs.' }, priceDKK: 1600, priceEUR: 220 },
    { id: '411867', varenr: '411867', name: { da: 'L-slagle-sæt af 16 stk.', en: 'L-flail Set of 16 pcs.' }, priceDKK: 4040, priceEUR: 545 },
    { id: ACC_ID_WARRANTY_751, varenr: '795015', name: { da: 'RC-751 udvidet komponentgaranti 12mdr.', en: 'RC-751 Extended Component Warranty 12 months' }, priceDKK: 3500, priceEUR: 470 },
  ],
  'Timan 3330': [
    // Aircondition group (mandatory)
    { id: '712133', varenr: '712133', name: { da: 'Aircondition', en: 'Air Conditioning' }, priceDKK: 14365, priceEUR: 1930, group: 'aircon', sectionStart: 'aircon_section' },
    { id: '712134', varenr: '712134', name: { da: 'Uden aircondition', en: 'Without Air Conditioning' }, priceDKK: 0, priceEUR: 0, group: 'aircon' },
    // Doors group (mandatory)
    { id: '712141', varenr: '712141', name: { da: 'Dør højre og venstre med skyderude', en: 'Door right and left with sliding window' }, priceDKK: 6560, priceEUR: 880, group: 'doors', sectionStart: 'doors_section' },
    { id: '712142', varenr: '712142', name: { da: 'Dør højre og venstre uden rude', en: 'Door right and left without window' }, priceDKK: 5095, priceEUR: 685, group: 'doors' },
    // Seats group (mandatory)
    { id: '712151', varenr: '712151', name: { da: 'Stofsæde med mekanisk affjedring', en: 'Fabric seat with mechanical suspension' }, priceDKK: 0, priceEUR: 0, group: 'seats', sectionStart: 'seats_section' },
    { id: '712152', varenr: '712152', name: { da: 'Stofsæde med luftaffjedring', en: 'Fabric seat with air suspension' }, priceDKK: 2645, priceEUR: 355, group: 'seats' },
    // Roof group (mandatory)
    { id: '712143', varenr: '712143', name: { da: 'Tag uden blitzlys', en: 'Roof without strobe lights' }, priceDKK: 2645, priceEUR: 355, group: 'roof', sectionStart: 'roof_section' },
    { id: '712145', varenr: '712145', name: { da: 'Tag med blitzlys i kanten', en: 'Roof with edge-mounted strobe lights' }, priceDKK: 5095, priceEUR: 682, group: 'roof',
      subItems: [
        { id: '712145__712578', varenr: '712578', name: { da: 'LED Rotorblink til tag med blitz lys', en: 'LED Beacon for roof with Flashing Light' }, priceDKK: 705, priceEUR: 95 },
      ],
    },
    // Monitor, Camera
    { id: '712164', varenr: '712164', name: { da: 'Monitor for kamera', en: 'Camera monitor' }, priceDKK: 2805, priceEUR: 380, sectionStart: 'monitor_section' },
    { id: '712168', varenr: '712168', name: { da: 'Kamera for sugemundstykke', en: 'Camera for suction nozzle' }, priceDKK: 2310, priceEUR: 315 },
    { id: '712166', varenr: '712166', name: { da: 'Bakkamera monteret i kofanger', en: 'Rear-view camera mounted in bumper' }, priceDKK: 2120, priceEUR: 290 },
    { id: '712178', varenr: '712178', name: { da: 'Bakalarm', en: 'Reverse alarm' }, priceDKK: 695, priceEUR: 95 },
    // Safety
    { id: '712175', varenr: '712175', name: { da: 'Konservering af chassis og hydrauliske komponenter', en: 'Preservation of chassis and hydraulic components' }, priceDKK: 3650, priceEUR: 495, sectionStart: 'safety_section' },
    { id: 'V34-165', varenr: 'V34-165', name: { da: 'Special farvevalg RAL', en: 'Special colour choice (RAL)' }, priceDKK: 9955, priceEUR: 1340, isRAL: true },
    { id: '712180', varenr: '712180', name: { da: 'Bio hydraulikolie', en: 'Bio hydraulic oil' }, priceDKK: 4500, priceEUR: 610 },
    { id: '712176', varenr: '712176', name: { da: 'Pulverslukker', en: 'Powder extinguisher' }, priceDKK: 1150, priceEUR: 155 },
    // Tow
    { id: '712169', varenr: '712169', name: { da: 'Kombitræk kugle/gaffel', en: 'Combo hitch (ball/pin)' }, priceDKK: 1990, priceEUR: 270, sectionStart: 'tow_section' },
    { id: '712527', varenr: '712527', name: { da: 'Kombitræk kugle/gaffel synsklar med nummerpladelys', en: 'Combo hitch ready for inspection' }, priceDKK: 2700, priceEUR: 363 },
    { id: '712528', varenr: '712528', name: { da: 'Kombitræk, kugle/gaffel, dansk syn', en: 'Combo hitch, Danish inspection' }, priceDKK: 5400, priceEUR: 726 },
    // Misc
    { id: '712174', varenr: '712174', name: { da: 'Solskærm justerbar', en: 'Adjustable sun visor' }, priceDKK: 775, priceEUR: 105, sectionStart: 'misc_section' },
    // Sweeper implements
    { id: 'SWEEP_HEADER', varenr: '', name: { da: 'Feje/Sug Redskaber', en: 'Sweep/Vac Implements' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '720125', varenr: '720125', name: { da: 'T2 Opsamlingstank uden højtryksslange', en: 'T2 collection tank without pressure washer hose' }, priceDKK: 94860, priceEUR: 12770 },
    { id: '720130', varenr: '720130', name: { da: 'T2 Opsamlingstank inkl. højtryksrenser', en: 'T2 collection tank incl. pressure washer' }, priceDKK: 107800, priceEUR: 14510 },
    { id: '730030', varenr: '730030', name: { da: 'Forkostesæt med 2 koste', en: 'Front broom set with 2 brooms' }, priceDKK: 53800, priceEUR: 7245 },
    { id: '720121', varenr: '720121', name: { da: 'Sidebørste arm højre/venstre med vanddyse', en: 'Side broom arm left/right with water nozzle' }, priceDKK: 9150, priceEUR: 1235, requires: '730030', isQtyInput: true },
    // Winter implements
    { id: 'WINTER_HEADER', varenr: '', name: { da: 'Vinter redskaber', en: 'Winter implements' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: '730114', varenr: '730114', name: { da: 'V-plov 130 cm', en: 'V-plow 130 cm' }, priceDKK: 30460, priceEUR: 4100 },
    { id: '730105', varenr: '730105', name: { da: 'Dozerblad 130 cm med gummiskær', en: 'Dozer blade 130 cm with rubber edge' }, priceDKK: 19000, priceEUR: 2560 },
    { id: '730106', varenr: '730106', name: { da: 'Sneslynge, 110 cm arbejdsbredde', en: 'Snow blower, 110 cm working width' }, priceDKK: 49500, priceEUR: 6665 },
    // Spreader
    { id: '725131', varenr: '725131', name: { da: 'CS-200 Valsespreder, for lad, manuel reg.', en: 'CS-200 roller spreader, manual' }, priceDKK: 38500, priceEUR: 5050 },
    // Other implements
    { id: 'OTHER_HEADER', varenr: '', name: { da: 'Øvrige Redskaber', en: 'Other implements' }, priceDKK: 0, priceEUR: 0, isHeader: true },
    { id: 'HGM-20083', varenr: 'HGM-20083', name: { da: 'Fingerklipper for Termit-arm', en: 'Finger mower for Termit arm' }, priceDKK: 19400, priceEUR: 2615 },
    // Warranty
    { id: '795002', varenr: '795002', name: { da: 'Timan 3330 udvidet komponentgaranti med 12 mdr.', en: 'Timan 3330 extended component warranty (12 months)' }, priceDKK: 4950, priceEUR: 665 },
  ],
};

// Helper to get localized text
export function getLocalizedName(name: string | { da: string; en: string; [key: string]: string | undefined }, lang: Language = 'da'): string {
  if (typeof name === 'string') return name;
  return name[lang] || name.da || '';
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
  const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  return sign + formatted + currencySuffix;
}

// Flatten accessories including sub-items
export function getAccessoriesFlat(machineType: string): Accessory[] {
  const base = ACCESSORIES[machineType] || [];
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
