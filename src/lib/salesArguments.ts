/**
 * Sales argument generator for Timan machine quotes.
 * Generates a specific, warm Danish sales summary based on the exact selected products.
 * No AI, no made-up specs — only known product data from machines.ts.
 */

import { ConfiguratorState, MachineConfig, Accessory } from '@/types/configurator';
import { ACCESSORIES, getLooseToolAccessories, LOOSE_TOOL_KEY } from '@/data/machines';

// ─── Machine-specific copy blocks ──────────────────────────────────────────

interface MachineProfile {
  label: string;
  solo: string; // used when this is the only machine
  combo: string; // used when part of a multi-machine package
  seasons: Set<string>;
}

const MACHINE_PROFILES: Record<string, MachineProfile> = {
  'RC-1000S': {
    label: 'RC-1000s',
    solo: 'RC-1000s er en kompakt og kraftfuld maskinbærer, der arbejder sikkert i krævende terræn og på stejle skråninger',
    combo: 'RC-1000s giver en stærk platform til arbejde i krævende terræn og på vanskelige arealer',
    seasons: new Set(['forår', 'sommer', 'efterår', 'vinter']),
  },
  'RC-751': {
    label: 'RC-751',
    solo: 'RC-751 er en agil og driftsikker fjernbetjent maskinbærer, ideel til skråninger og grønne arealer',
    combo: 'RC-751 supplerer med agil grøn vedligeholdelse på arealer og skråninger',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  'Timan 3330': {
    label: 'Timan 3330',
    solo: 'Timan 3330 er en alsidig redskabsbærer, der kombinerer græsklipning, fejning og vinterberedskab på én maskine',
    combo: 'Timan 3330 med feje- og sugeudstyr styrker den daglige renholdelse af arealer, stier og pladser',
    seasons: new Set(['forår', 'sommer', 'efterår', 'vinter']),
  },
};

// ─── Accessory category classifiers with specific copy ─────────────────────

interface AccessoryCategory {
  match: (id: string, name: string) => boolean;
  label: string;
  bullet: string; // specific Danish copy for this category
  seasons: Set<string>;
}

const ACCESSORY_CATEGORIES: AccessoryCategory[] = [
  {
    match: (id, name) => id === '410910' || name.includes('Slagleklipper') || name.includes('Flail'),
    label: 'Slagleklipper',
    bullet: 'Slagleklipperen håndterer grov vegetation og tilgroede arealer effektivt',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  {
    match: (id, name) => id === '411666' || id === '730017' || name.includes('Rotorklipper') || name.includes('Rotary'),
    label: 'Rotorklipper',
    bullet: 'Rotorklipperen sikrer en ensartet og præcis klipning af græsarealer',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  {
    match: (id, name) => id === '411800' || name.includes('Fingerklipper') || name.includes('Finger Bar'),
    label: 'Fingerklipper',
    bullet: 'Fingerklipperen giver skånsom og præcis klipning, ideel til biodiversitetsarealer',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  {
    match: (id, name) => id === '412040' || name.includes('Skivehøster') || name.includes('Disc Harvester'),
    label: 'Skivehøster',
    bullet: 'Skivehøsteren håndterer høj bevoksning og tæt vegetation uden besvær',
    seasons: new Set(['sommer', 'efterår']),
  },
  {
    match: (id, name) => id.startsWith('HFS') || name.includes('Stubfræser') || name.includes('Stump Grinder'),
    label: 'Stubfræser',
    bullet: 'Stubfræseren fjerner stubbe effektivt og gør arealet klar til videre brug',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  {
    match: (id, name) => id.includes('411742') || id.includes('730114') || name.includes('V-plov') || name.includes('V-plow'),
    label: 'V-plov',
    bullet: 'V-ploven sikrer hurtig og effektiv snerydning på veje og stier',
    seasons: new Set(['vinter']),
  },
  {
    match: (id, name) => id === '730105' || name.includes('Dozerblad') || name.includes('Dozer blade'),
    label: 'Dozerblad',
    bullet: 'Dozerbladet giver fleksibel snerydning og materialehåndtering',
    seasons: new Set(['vinter']),
  },
  {
    match: (id, name) => id === '418000' || id === '730106' || name.includes('Sneslynge') || name.includes('Snow Blower'),
    label: 'Sneslynge',
    bullet: 'Sneslyngen håndterer større snemængder og kaster sneen væk fra rydningsarealet',
    seasons: new Set(['vinter']),
  },
  {
    match: (id, name) => id === '411845' || id === '730020' || name.includes('fejemaskine') || name.includes('Sweeper'),
    label: 'Fejemaskine',
    bullet: 'Fejemaskinen holder arealer, stier og pladser rene og præsentable året rundt',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  {
    match: (id, name) => id.includes('720125') || id.includes('720130') || id.includes('720132') || id.includes('720133') || id.includes('730030') || name.includes('Opsamlingstank') || name.includes('Forkostesæt') || name.includes('collection tank') || name.includes('Front broom'),
    label: 'Feje-/sugeanlæg',
    bullet: 'Feje-/sugeanlægget samler blade, affald og støv op i én arbejdsgang',
    seasons: new Set(['forår', 'sommer', 'efterår', 'vinter']),
  },
  {
    match: (id, name) => id.includes('730600') || name.includes('ukrudtsbørste') || name.includes('Weed Brush') || name.includes('Ukrudtsbørste'),
    label: 'Ukrudtsbørste',
    bullet: 'Ukrudtsbørsten fjerner ukrudt mekanisk uden brug af sprøjtemidler',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  {
    match: (id, name) => id.includes('725131') || id.includes('725132') || id.includes('725138') || name.includes('Spreder') || name.includes('spreader') || name.includes('Valse'),
    label: 'Spreder',
    bullet: 'Sprederen bidrager med kompakt og effektiv glatførebekæmpelse i vinterhalvåret',
    seasons: new Set(['vinter']),
  },
  {
    match: (id, name) => id.includes('HGM-20083') || id.includes('HGM-20082') || name.includes('Multitrimmer') || name.includes('Termit'),
    label: 'Hækkeklipper / Multitrimmer',
    bullet: 'Multitrimmeren udvider maskinens anvendelse til hække og kantbeskæring',
    seasons: new Set(['forår', 'sommer', 'efterår']),
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

// ─── Generator ──────────────────────────────────────────────────────────────

export function generateSalesArguments(state: ConfiguratorState): string {
  const machineEntries: { profile: MachineProfile; categories: AccessoryCategory[] }[] = [];
  const allSeasons = new Set<string>();

  for (const mc of state.machineConfigs) {
    if (mc.qty < 1) continue;
    const profile = MACHINE_PROFILES[mc.type];
    if (!profile && mc.type !== LOOSE_TOOL_KEY) continue;

    const selectedAcc = getSelectedAccessoryObjects(mc, state);
    const seenCats = new Set<string>();
    const cats: AccessoryCategory[] = [];

    for (const acc of selectedAcc) {
      const cat = classifyAccessory(acc);
      if (!cat || seenCats.has(cat.label)) continue;
      seenCats.add(cat.label);
      cats.push(cat);
      cat.seasons.forEach(s => allSeasons.add(s));
    }

    if (profile) {
      profile.seasons.forEach(s => allSeasons.add(s));
      machineEntries.push({ profile, categories: cats });
    }
  }

  if (machineEntries.length === 0) {
    return 'Vælg maskiner og redskaber for at generere salgsargumenter.';
  }

  const isMulti = machineEntries.length > 1;
  const hasWinter = allSeasons.has('vinter');
  const hasSummer = allSeasons.has('sommer') || allSeasons.has('forår') || allSeasons.has('efterår');
  const hasAllYear = (hasWinter && hasSummer);
  const totalCategories = machineEntries.reduce((n, e) => n + e.categories.length, 0);

  // ── Intro paragraph ──────────────────────────────────────────────────────
  const machineNames = machineEntries.map(e => e.profile.label).join(' og ');
  let intro: string;

  if (isMulti && hasAllYear) {
    intro = `Med denne løsning får du en stærk og fleksibel pakke bygget op omkring ${machineNames}, der kombinerer grøn vedligeholdelse, effektiv drift og vinterberedskab i én samlet investering.`;
  } else if (isMulti) {
    intro = `Denne pakke med ${machineNames} giver en samlet løsning, der dækker flere driftsopgaver med færre maskiner og ensartet service fra én leverandør.`;
  } else if (hasAllYear) {
    intro = `${machineEntries[0].profile.label} med de valgte redskaber giver en fleksibel helårsløsning, der dækker både grøn vedligeholdelse og vinterberedskab.`;
  } else {
    intro = `${machineEntries[0].profile.label} med de valgte redskaber giver en målrettet og effektiv løsning, der er tilpasset de faktiske driftsopgaver.`;
  }

  // ── Bullet points (max 5) ────────────────────────────────────────────────
  const bullets: string[] = [];

  // Per-machine bullets with specific tool mentions
  for (const entry of machineEntries) {
    const line = isMulti ? entry.profile.combo : entry.profile.solo;
    bullets.push(line);

    // Add the most important tool-specific bullets (max 1-2 per machine)
    const toolBullets = entry.categories.slice(0, isMulti ? 1 : 2);
    for (const cat of toolBullets) {
      bullets.push(cat.bullet);
    }
  }

  // Package-level bullets
  if (hasAllYear) {
    bullets.push('Samlet giver pakken en højere årlig udnyttelse, større fleksibilitet og en mere komplet driftsløsning');
  } else if (totalCategories >= 2) {
    bullets.push('De valgte redskaber giver en bredere anvendelse og bedre udnyttelse af maskinen gennem sæsonen');
  }

  if (isMulti) {
    bullets.push('Én leverandør for hele løsningen sikrer ensartet service, reservedele og nem drift');
  }

  // Take up to 5 bullets, prioritizing machine + tool specifics
  const finalBullets = bullets.slice(0, 5);

  return `${intro}\n\n${finalBullets.map(b => `• ${b}`).join('\n')}`;
}
