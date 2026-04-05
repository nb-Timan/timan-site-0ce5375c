/**
 * Sales argument generator for Timan machine quotes.
 * Generates a SHORT professional Danish sales summary based on selected products.
 * No AI, no made-up specs — only known product data from machines.ts.
 */

import { ConfiguratorState, MachineConfig, Accessory } from '@/types/configurator';
import { ACCESSORIES, getLooseToolAccessories, LOOSE_TOOL_KEY } from '@/data/machines';

// ─── Product knowledge map ──────────────────────────────────────────────────

interface ProductProfile {
  label: string;
  seasonTags: ('forår' | 'sommer' | 'efterår' | 'vinter' | 'helår')[];
  taskTags: string[];
}

const MACHINE_PROFILES: Record<string, ProductProfile> = {
  'RC-1000S': {
    label: 'RC-1000s',
    seasonTags: ['helår'],
    taskTags: ['skråningsklipning', 'grøn vedligeholdelse', 'snerydning'],
  },
  'RC-751': {
    label: 'RC-751',
    seasonTags: ['forår', 'sommer', 'efterår'],
    taskTags: ['skråningsklipning', 'grøn vedligeholdelse'],
  },
  'Timan 3330': {
    label: 'Timan 3330',
    seasonTags: ['helår'],
    taskTags: ['arealudnyttelse', 'fejning', 'snerydning', 'græsklipning'],
  },
};

// Accessory category classifiers
interface AccessoryCategory {
  match: (id: string, name: string) => boolean;
  label: string;
  seasonTags: ('forår' | 'sommer' | 'efterår' | 'vinter' | 'helår')[];
}

const ACCESSORY_CATEGORIES: AccessoryCategory[] = [
  {
    match: (id, name) => id === '410910' || name.includes('Slagleklipper') || name.includes('Flail'),
    label: 'Slagleklipper',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
  {
    match: (id, name) => id === '411666' || id === '730017' || name.includes('Rotorklipper') || name.includes('Rotary'),
    label: 'Rotorklipper',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
  {
    match: (id, name) => id === '411800' || name.includes('Fingerklipper') || name.includes('Finger Bar'),
    label: 'Fingerklipper',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
  {
    match: (id, name) => id === '412040' || name.includes('Skivehøster') || name.includes('Disc Harvester'),
    label: 'Skivehøster',
    seasonTags: ['sommer', 'efterår'],
  },
  {
    match: (id, name) => id.startsWith('HFS') || name.includes('Stubfræser') || name.includes('Stump Grinder'),
    label: 'Stubfræser',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
  {
    match: (id, name) => id.includes('411742') || id.includes('730114') || name.includes('V-plov') || name.includes('V-plow'),
    label: 'V-plov',
    seasonTags: ['vinter'],
  },
  {
    match: (id, name) => id === '730105' || name.includes('Dozerblad') || name.includes('Dozer blade'),
    label: 'Dozerblad',
    seasonTags: ['vinter'],
  },
  {
    match: (id, name) => id === '418000' || id === '730106' || name.includes('Sneslynge') || name.includes('Snow Blower'),
    label: 'Sneslynge',
    seasonTags: ['vinter'],
  },
  {
    match: (id, name) => id === '411845' || id === '730020' || name.includes('fejemaskine') || name.includes('Sweeper'),
    label: 'Fejemaskine',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
  {
    match: (id, name) => id.includes('720125') || id.includes('720130') || id.includes('720132') || id.includes('720133') || id.includes('730030') || name.includes('Opsamlingstank') || name.includes('Forkostesæt') || name.includes('collection tank') || name.includes('Front broom'),
    label: 'Feje-/sugeanlæg',
    seasonTags: ['forår', 'sommer', 'efterår', 'vinter'],
  },
  {
    match: (id, name) => id.includes('730600') || name.includes('ukrudtsbørste') || name.includes('Weed Brush') || name.includes('Ukrudtsbørste'),
    label: 'Ukrudtsbørste',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
  {
    match: (id, name) => id.includes('725131') || id.includes('725132') || id.includes('725138') || name.includes('Spreder') || name.includes('spreader') || name.includes('Valse'),
    label: 'Spreder',
    seasonTags: ['vinter'],
  },
  {
    match: (id, name) => id.includes('HGM-20083') || id.includes('HGM-20082') || name.includes('Multitrimmer') || name.includes('Termit'),
    label: 'Hækkeklipper / Multitrimmer',
    seasonTags: ['forår', 'sommer', 'efterår'],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  mc.acc.forEach(id => accIds.add(id));
  if (mc.configMode === 'individual') {
    for (let i = 1; i <= mc.qty; i++) {
      const key = `${mc.id}_${i}`;
      const unitCfg = state.individualUnitConfigs[key];
      if (unitCfg) unitCfg.acc.forEach(id => accIds.add(id));
    }
  }
  return allAcc.filter(a => accIds.has(a.id) && !a.isHeader && !a.hidden && !a.auto);
}

// ─── Generator (short format) ───────────────────────────────────────────────

export function generateSalesArguments(state: ConfiguratorState): string {
  const allSeasons = new Set<string>();
  const allCategories = new Set<string>();
  const machineLabels: string[] = [];

  for (const mc of state.machineConfigs) {
    if (mc.qty < 1) continue;
    const profile = MACHINE_PROFILES[mc.type];
    if (!profile && mc.type !== LOOSE_TOOL_KEY) continue;

    if (profile) {
      machineLabels.push(profile.label);
      profile.seasonTags.forEach(s => allSeasons.add(s));
    }

    const selectedAcc = getSelectedAccessoryObjects(mc, state);
    const seenCategories = new Set<string>();
    for (const acc of selectedAcc) {
      const cat = classifyAccessory(acc);
      if (!cat || seenCategories.has(cat.label)) continue;
      seenCategories.add(cat.label);
      if (!allCategories.has(cat.label)) {
        allCategories.add(cat.label);
      }
      cat.seasonTags.forEach(s => allSeasons.add(s));
    }
  }

  if (machineLabels.length === 0) {
    return 'Vælg maskiner og redskaber for at generere salgsargumenter.';
  }

  // Build short intro
  const machineList = machineLabels.join(' og ');
  const intro = machineLabels.length > 1
    ? `En komplet pakkeløsning med ${machineList}, der samler flere funktioner i én effektiv driftsløsning.`
    : `En effektiv løsning bygget op omkring ${machineList} med tilhørende redskaber.`;

  // Build 3-4 bullet points about combined value
  const bullets: string[] = [];

  // Season coverage
  const hasWinter = allSeasons.has('vinter');
  const hasSummer = allSeasons.has('sommer') || allSeasons.has('forår') || allSeasons.has('efterår');
  const hasAllYear = allSeasons.has('helår') || (hasWinter && hasSummer);

  if (hasAllYear) {
    bullets.push('Dækker opgaver på tværs af alle årstider – fra grøn vedligeholdelse til vinterberedskab');
  } else if (hasWinter) {
    bullets.push('Stærk vinterløsning med effektiv snerydning og glatførebekæmpelse');
  } else if (hasSummer) {
    bullets.push('Effektiv dækning af sommer- og vedligeholdelsesopgaver');
  }

  // Breadth
  if (allCategories.size >= 3) {
    bullets.push('Bredt redskabsvalg giver færre maskinskift og lavere driftsomkostninger');
  } else if (allCategories.size >= 1) {
    bullets.push('Fleksibelt redskabsvalg tilpasset de faktiske driftsopgaver');
  }

  // Multi-machine synergy
  if (machineLabels.length > 1) {
    bullets.push('Kombineret flåde fra én leverandør sikrer ensartet service og reservedele');
  }

  // Utilization
  if (hasAllYear || allCategories.size >= 2) {
    bullets.push('Høj årlig udnyttelsesgrad og god totaløkonomi');
  }

  // Cap at 4 bullets
  const finalBullets = bullets.slice(0, 4);

  return `${intro}\n\n${finalBullets.map(b => `• ${b}`).join('\n')}`;
}
