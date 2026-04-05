/**
 * Sales argument generator for Timan machine quotes.
 * Generates professional Danish sales text based on selected products.
 * No AI, no made-up specs — only known product data from machines.ts.
 */

import { ConfiguratorState, MachineConfig, Accessory } from '@/types/configurator';
import { PRODUCTS, ACCESSORIES, getLocalizedName, getLooseToolAccessories, LOOSE_TOOL_KEY } from '@/data/machines';

// ─── Product knowledge map ──────────────────────────────────────────────────

interface ProductProfile {
  label: string;
  intro: string;
  seasonTags: ('forår' | 'sommer' | 'efterår' | 'vinter' | 'helår')[];
  taskTags: string[];
}

const MACHINE_PROFILES: Record<string, ProductProfile> = {
  'RC-1000S': {
    label: 'RC-1000s',
    intro: 'RC-1000s er en fjernstyret, fuldhydraulisk redskabsbærer med 23 HK motor og bæltetræk, der arbejder sikkert på skråninger op til 50 grader.',
    seasonTags: ['helår'],
    taskTags: ['skråningsklipning', 'grøn vedligeholdelse', 'snerydning', 'stubfræsning'],
  },
  'RC-751': {
    label: 'RC-751',
    intro: 'RC-751 er en kompakt fjernstyret slagleklipper med lav egenhøjde på kun 60 cm, der effektivt håndterer krævende terræn og skråninger op til 50 grader.',
    seasonTags: ['forår', 'sommer', 'efterår'],
    taskTags: ['skråningsklipning', 'grøn vedligeholdelse', 'tæt bevoksning'],
  },
  'Timan 3330': {
    label: 'Timan 3330',
    intro: 'Timan 3330 er en alsidig redskabsbærer med 33 HK Kubota-motor og komfortabel kabine, designet til helårsdrift med hurtigt skift af redskaber.',
    seasonTags: ['helår'],
    taskTags: ['arealudnyttelse', 'fejning', 'snerydning', 'græsklipning', 'hækkeklipning', 'ukrudtsbekæmpelse'],
  },
};

// Accessory category classifiers by known ID patterns
interface AccessoryCategory {
  match: (id: string, name: string) => boolean;
  label: string;
  salesLine: string;
  seasonTags: ('forår' | 'sommer' | 'efterår' | 'vinter' | 'helår')[];
}

const ACCESSORY_CATEGORIES: AccessoryCategory[] = [
  {
    match: (id, name) => id === '410910' || name.includes('Slagleklipper') || name.includes('Flail'),
    label: 'Slagleklipper',
    salesLine: 'Slagleklipperen håndterer højt græs, buske og bjørneklo på selv de mest utilgængelige arealer.',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
  {
    match: (id, name) => id === '411666' || id === '730017' || id.startsWith('HGM-2007') || name.includes('Rotorklipper') || name.includes('Rotary'),
    label: 'Rotorklipper',
    salesLine: 'Rotorklipperen giver et fint klipperesultat på plæner og åbne græsarealer.',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
  {
    match: (id, name) => id === '411800' || name.includes('Fingerklipper') || name.includes('Finger Bar'),
    label: 'Fingerklipper',
    salesLine: 'Fingerklipperen er ideel til naturpleje og skånsom klipning af fåregræs og vildtvoksende arealer.',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
  {
    match: (id, name) => id === '412040' || name.includes('Skivehøster') || name.includes('Disc Harvester'),
    label: 'Skivehøster',
    salesLine: 'Skivehøsteren sikrer effektiv høst og slåning af tætte afgrøder.',
    seasonTags: ['sommer', 'efterår'],
  },
  {
    match: (id, name) => id.startsWith('HFS') || name.includes('Stubfræser') || name.includes('Stump Grinder'),
    label: 'Stubfræser',
    salesLine: 'Stubfræseren fjerner stubbe hydraulisk – helt uden gravearbejde.',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
  {
    match: (id, name) => id.includes('411742') || id.includes('730114') || name.includes('V-plov') || name.includes('V-plow'),
    label: 'V-plov',
    salesLine: 'V-ploven rydder sne effektivt og kan justeres i V-form, Y-form og som skrabeblad.',
    seasonTags: ['vinter'],
  },
  {
    match: (id, name) => id === '730105' || name.includes('Dozerblad') || name.includes('Dozer blade'),
    label: 'Dozerblad',
    salesLine: 'Dozerbladet er et robust redskab til snerydning og materialehåndtering.',
    seasonTags: ['vinter'],
  },
  {
    match: (id, name) => id === '418000' || id === '730106' || name.includes('Sneslynge') || name.includes('Snow Blower'),
    label: 'Sneslynge',
    salesLine: 'Sneslyngen kaster sneen op til 20 meter og håndterer store snemængder hurtigt.',
    seasonTags: ['vinter'],
  },
  {
    match: (id, name) => id === '411845' || id === '730020' || name.includes('fejemaskine') || name.includes('Sweeper'),
    label: 'Fejemaskine',
    salesLine: 'Fejemaskinen rengør arealer for græsafklip, blade og flis med hydraulisk drevet kost.',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
  {
    match: (id, name) => id.includes('720125') || id.includes('720130') || id.includes('720132') || id.includes('720133') || id.includes('730030') || name.includes('Opsamlingstank') || name.includes('Forkostesæt') || name.includes('collection tank') || name.includes('Front broom'),
    label: 'Feje-/sugeanlæg',
    salesLine: 'Feje-/sugeanlægget opsamler blade, affald og støv effektivt og holder arealer rene hele året.',
    seasonTags: ['forår', 'sommer', 'efterår', 'vinter'],
  },
  {
    match: (id, name) => id.includes('730600') || id.includes('ACC_ID_WEEDBRUSH') || name.includes('ukrudtsbørste') || name.includes('Weed Brush') || name.includes('Ukrudtsbørste'),
    label: 'Ukrudtsbørste',
    salesLine: 'Ukrudtsbørsten fjerner ukrudt fra fortove, vejkanter og stier – helt uden pesticider.',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
  {
    match: (id, name) => id.includes('725131') || id.includes('725132') || id.includes('725138') || name.includes('Spreder') || name.includes('spreader') || name.includes('Valse'),
    label: 'Spreder',
    salesLine: 'Sprederen sikrer effektiv saltning og grusning, så arealer holdes sikre i vinterhalvåret.',
    seasonTags: ['vinter'],
  },
  {
    match: (id, name) => id.includes('HGM-20083') || id.includes('HGM-20082') || name.includes('Multitrimmer') || name.includes('Termit'),
    label: 'Hækkeklipper / Multitrimmer',
    salesLine: 'Hækkeklipperen / multitrimmeren klipper og findeler hække professionelt – uden dårlige arbejdsstillinger.',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
];

// ─── Generator ──────────────────────────────────────────────────────────────

function classifyAccessory(acc: Accessory): AccessoryCategory | null {
  const name = typeof acc.name === 'string' ? acc.name : acc.name?.da ?? '';
  for (const cat of ACCESSORY_CATEGORIES) {
    if (cat.match(acc.id, name)) return cat;
  }
  return null;
}

function getAllAccessoriesForMachine(machineType: string): Accessory[] {
  if (machineType === LOOSE_TOOL_KEY) return getLooseToolAccessories();
  return ACCESSORIES[machineType] ?? [];
}

function getSelectedAccessoryObjects(mc: MachineConfig, state: ConfiguratorState): Accessory[] {
  const allAcc = getAllAccessoriesForMachine(mc.type);
  const accIds = new Set<string>();

  // Shared mode
  mc.acc.forEach(id => accIds.add(id));

  // Individual mode
  if (mc.configMode === 'individual') {
    for (let i = 1; i <= mc.qty; i++) {
      const key = `${mc.id}_${i}`;
      const unitCfg = state.individualUnitConfigs[key];
      if (unitCfg) unitCfg.acc.forEach(id => accIds.add(id));
    }
  }

  return allAcc.filter(a => accIds.has(a.id) && !a.isHeader && !a.hidden && !a.auto);
}

export function generateSalesArguments(state: ConfiguratorState): string {
  const sections: string[] = [];
  const allSeasons = new Set<string>();
  const allCategories = new Set<string>();
  const categoryLines: string[] = [];
  const machineLabels: string[] = [];

  // Process each selected machine
  for (const mc of state.machineConfigs) {
    if (mc.qty < 1) continue;
    const profile = MACHINE_PROFILES[mc.type];
    if (!profile && mc.type !== LOOSE_TOOL_KEY) continue;

    if (profile) {
      machineLabels.push(profile.label);
      sections.push(profile.intro);
      profile.seasonTags.forEach(s => allSeasons.add(s));
    }

    // Classify selected accessories
    const selectedAcc = getSelectedAccessoryObjects(mc, state);
    const seenCategories = new Set<string>();

    for (const acc of selectedAcc) {
      const cat = classifyAccessory(acc);
      if (!cat || seenCategories.has(cat.label)) continue;
      seenCategories.add(cat.label);

      if (!allCategories.has(cat.label)) {
        allCategories.add(cat.label);
        categoryLines.push(cat.salesLine);
      }
      cat.seasonTags.forEach(s => allSeasons.add(s));
    }
  }

  if (sections.length === 0 && categoryLines.length === 0) {
    return 'Vælg maskiner og redskaber for at generere salgsargumenter.';
  }

  // Add accessory descriptions
  if (categoryLines.length > 0) {
    sections.push('');
    sections.push('Med den valgte konfiguration opnås følgende:');
    categoryLines.forEach(line => sections.push(`• ${line}`));
  }

  // Bundle / package reasoning
  if (machineLabels.length > 1 || allCategories.size >= 2) {
    sections.push('');

    // Season coverage
    const hasWinter = allSeasons.has('vinter');
    const hasSummer = allSeasons.has('sommer') || allSeasons.has('forår') || allSeasons.has('efterår');
    const hasAllYear = allSeasons.has('helår') || (hasWinter && hasSummer);

    if (hasAllYear) {
      sections.push('Denne samlede pakkeløsning dækker opgaver på tværs af alle årstider – fra grøn vedligeholdelse om sommeren til snerydning og saltning om vinteren. Det sikrer en høj årlig udnyttelsesgrad og en god totaløkonomi.');
    } else if (hasWinter) {
      sections.push('Konfigurationen giver en stærk vinterløsning med effektiv snerydning og glatførebekæmpelse.');
    } else if (hasSummer) {
      sections.push('Den valgte løsning dækker effektivt sommer- og grønne vedligeholdelsesopgaver.');
    }

    // Multi-machine synergy
    if (machineLabels.length > 1) {
      sections.push(`Ved at kombinere ${machineLabels.join(' og ')} opnås en fleksibel flåde, der kan dække både kompakte, svære terrænopgaver og bredere driftsopgaver fra én leverandør.`);
    }

    // Task breadth
    if (allCategories.size >= 3) {
      sections.push('Det brede redskabsvalg giver mulighed for at dække mange forskellige opgaver med færre maskinskift, hvilket øger effektiviteten og reducerer driftsomkostningerne.');
    }
  }

  // Closing
  sections.push('');
  sections.push('Alle priser er ekskl. moms. Levering og igangsætning aftales separat.');

  return sections.join('\n');
}
