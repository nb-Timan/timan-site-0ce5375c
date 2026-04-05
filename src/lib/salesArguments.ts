/**
 * Sales argument generator for Timan machine quotes.
 * Generates a specific, warm Danish sales summary based on the exact selected products.
 * No AI, no made-up specs — only known product data from machines.ts.
 */

import { ConfiguratorState, MachineConfig, Accessory } from '@/types/configurator';
import { ACCESSORIES, getLooseToolAccessories, LOOSE_TOOL_KEY, ACC_ID_OIL_BIO } from '@/data/machines';

// ─── Machine-specific copy blocks ──────────────────────────────────────────

interface MachineProfile {
  label: string;
  solo: string;
  combo: string;
  /** Used in the paragraph to describe the machine's role */
  paragraphRole: string;
  seasons: Set<string>;
}

const MACHINE_PROFILES: Record<string, MachineProfile> = {
  'RC-1000S': {
    label: 'RC-1000s',
    solo: 'RC-1000s er en kompakt og kraftfuld maskinbærer, der arbejder sikkert i krævende terræn og på stejle skråninger',
    combo: 'RC-1000s giver en stærk platform til arbejde i krævende terræn og på vanskelige arealer',
    paragraphRole: 'effektiv og sikker grøn vedligeholdelse – selv i krævende terræn og på stejle skråninger',
    seasons: new Set(['forår', 'sommer', 'efterår', 'vinter']),
  },
  'RC-751': {
    label: 'RC-751',
    solo: 'RC-751 er en agil og driftsikker fjernbetjent maskinbærer, ideel til skråninger og grønne arealer',
    combo: 'RC-751 supplerer med agil grøn vedligeholdelse på arealer og skråninger',
    paragraphRole: 'agil og præcis grøn vedligeholdelse på skråninger og svært tilgængelige arealer',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  'Timan 3330': {
    label: 'Timan 3330',
    solo: 'Timan 3330 er en alsidig redskabsbærer, der kombinerer græsklipning, fejning og vinterberedskab på én maskine',
    combo: 'Timan 3330 med feje- og sugeudstyr styrker den daglige renholdelse af arealer, stier og pladser',
    paragraphRole: 'alsidig drift med fejning, renholdelse og redskabsskift fra førerkabinen',
    seasons: new Set(['forår', 'sommer', 'efterår', 'vinter']),
  },
};

// ─── Accessory category classifiers ───────────────────────────────────────

interface AccessoryCategory {
  match: (id: string, name: string) => boolean;
  label: string;
  bullet: string;
  /** For the paragraph */
  paragraphFragment: string;
  seasons: Set<string>;
}

const ACCESSORY_CATEGORIES: AccessoryCategory[] = [
  {
    match: (id, name) => id === '410910' || name.includes('Slagleklipper') || name.includes('Flail'),
    label: 'Slagleklipper',
    bullet: 'Slagleklipperen håndterer grov vegetation og tilgroede arealer effektivt',
    paragraphFragment: 'grov vegetation og tilgroede arealer',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  {
    match: (id, name) => id === '411666' || id === '730017' || id === 'HGM-2007' || id === '730130' || name.includes('Rotorklipper') || name.includes('Rotary'),
    label: 'Rotorklipper',
    bullet: 'Rotorklipperen sikrer en ensartet og præcis klipning af græsarealer',
    paragraphFragment: 'ensartet og præcis græsklipning',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  {
    match: (id, name) => id === '411800' || name.includes('Fingerklipper') || name.includes('Finger Bar'),
    label: 'Fingerklipper',
    bullet: 'Fingerklipperen giver skånsom og præcis klipning, ideel til biodiversitetsarealer',
    paragraphFragment: 'skånsom klipning af biodiversitetsarealer',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  {
    match: (id, name) => id === '412040' || name.includes('Skivehøster') || name.includes('Disc Harvester'),
    label: 'Skivehøster',
    bullet: 'Skivehøsteren håndterer høj bevoksning og tæt vegetation uden besvær',
    paragraphFragment: 'høj bevoksning og tæt vegetation',
    seasons: new Set(['sommer', 'efterår']),
  },
  {
    match: (id, name) => id.startsWith('HFS') || name.includes('Stubfræser') || name.includes('Stump Grinder'),
    label: 'Stubfræser',
    bullet: 'Stubfræseren fjerner stubbe effektivt og gør arealet klar til videre brug',
    paragraphFragment: 'fjernelse af stubbe og rødder',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  {
    match: (id, name) => id.includes('411742') || id.includes('730114') || name.includes('V-plov') || name.includes('V-plow'),
    label: 'V-plov',
    bullet: 'V-ploven sikrer hurtig og effektiv snerydning på veje og stier',
    paragraphFragment: 'effektiv snerydning',
    seasons: new Set(['vinter']),
  },
  {
    match: (id, name) => id === '730105' || name.includes('Dozerblad') || name.includes('Dozer blade'),
    label: 'Dozerblad',
    bullet: 'Dozerbladet giver fleksibel snerydning og materialehåndtering',
    paragraphFragment: 'fleksibel snerydning og materialehåndtering',
    seasons: new Set(['vinter']),
  },
  {
    match: (id, name) => id === '418000' || id === '730106' || name.includes('Sneslynge') || name.includes('Snow Blower'),
    label: 'Sneslynge',
    bullet: 'Sneslyngen håndterer større snemængder og kaster sneen væk fra rydningsarealet',
    paragraphFragment: 'rydning af større snemængder',
    seasons: new Set(['vinter']),
  },
  {
    match: (id, name) => id === '411845' || id === '730020' || name.includes('fejemaskine') || name.includes('Sweeper'),
    label: 'Fejemaskine',
    bullet: 'Fejemaskinen holder arealer, stier og pladser rene og præsentable året rundt',
    paragraphFragment: 'daglig renholdelse af stier og arealer',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  {
    match: (id, name) => id.includes('720125') || id.includes('720130') || id.includes('720132') || id.includes('720133') || id.includes('730030') || name.includes('Opsamlingstank') || name.includes('Forkostesæt') || name.includes('collection tank') || name.includes('Front broom'),
    label: 'Feje-/sugeanlæg',
    bullet: 'Feje-/sugeanlægget samler blade, affald og støv op i én arbejdsgang',
    paragraphFragment: 'opsamling af blade, affald og støv',
    seasons: new Set(['forår', 'sommer', 'efterår', 'vinter']),
  },
  {
    match: (id, name) => id.includes('730600') || name.includes('ukrudtsbørste') || name.includes('Weed Brush') || name.includes('Ukrudtsbørste'),
    label: 'Ukrudtsbørste',
    bullet: 'Ukrudtsbørsten fjerner ukrudt mekanisk uden brug af sprøjtemidler – en mere bæredygtig løsning',
    paragraphFragment: 'mekanisk ukrudtsbekæmpelse uden sprøjtemidler',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
  {
    match: (id, name) => id.includes('725131') || id.includes('725132') || id.includes('725138') || name.includes('Spreder') || name.includes('spreader') || name.includes('CS-200'),
    label: 'Spreder',
    bullet: 'CS-200 sprederen giver kompakt og effektiv glatførebekæmpelse direkte fra maskinen',
    paragraphFragment: 'kompakt glatførebekæmpelse',
    seasons: new Set(['vinter']),
  },
  {
    match: (id, name) => id.includes('HGM-20083') || id.includes('HGM-20082') || name.includes('Multitrimmer') || name.includes('Termit'),
    label: 'Hækkeklipper / Multitrimmer',
    bullet: 'Multitrimmeren udvider maskinens anvendelse til hække og kantbeskæring',
    paragraphFragment: 'hækklipning og kantbeskæring',
    seasons: new Set(['forår', 'sommer', 'efterår']),
  },
];

// ─── Option insight detectors ──────────────────────────────────────────────

interface OptionInsight {
  match: (id: string, name: string) => boolean;
  bullet: string;
  comfortGroup?: string; // used to merge comfort insights
}

const OPTION_INSIGHTS: OptionInsight[] = [
  // Bio oil
  {
    match: (id) => id === ACC_ID_OIL_BIO || id === '712180',
    bullet: 'Valg af bio-hydraulikolie er et grønnere og mere miljøbevidst valg',
  },
  // Aircondition
  {
    match: (id) => id === '712060',
    bullet: 'Aircondition sikrer komfortabel drift selv på varme dage',
    comfortGroup: 'aircondition',
  },
  // Sliding windows
  {
    match: (id) => id === '712147',
    bullet: 'Døre med skyderuder giver bedre ventilation og udsyn under arbejdet',
    comfortGroup: 'skyderuder',
  },
  // Air suspension seat
  {
    match: (id) => id === '712140',
    bullet: 'Luftaffjedret sæde reducerer vibrationer og forbedrer førerkomforten markant',
    comfortGroup: 'luftaffjedret sæde',
  },
  // Cameras
  {
    match: (id) => id === '712164' || id === '712168' || id === '712166' || id === '712167',
    bullet: 'Kameraløsningen giver operatøren bedre overblik og øget sikkerhed i daglig drift',
    comfortGroup: 'kamera',
  },
  // Reverse alarm
  {
    match: (id) => id === '712178',
    bullet: 'Bakalarm øger sikkerheden ved bakning i travle områder',
  },
  // Chassis preservation
  {
    match: (id) => id === '712175',
    bullet: 'Konservering af chassis og hydraulik forlænger maskinens levetid og beskytter investeringen',
  },
  // Sun visor
  {
    match: (id) => id === '712174',
    bullet: 'Justerbar solskærm forbedrer udsyn og komfort i dagslys',
    comfortGroup: 'solskærm',
  },
  // Combo hitch / tow
  {
    match: (id) => id === '712169' || id === '712527' || id === '712528',
    bullet: 'Kombitræk giver mulighed for at trække tilhænger og udstyr direkte fra maskinen',
  },
  // Stump grinder (RC machines)
  {
    match: (id, name) => id.startsWith('HFS') || name.includes('Stubfræser'),
    bullet: 'Stubfræseren udvider maskinens anvendelse til fjernelse af stubbe og rødder',
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAccName(acc: Accessory): string {
  return typeof acc.name === 'string' ? acc.name : acc.name?.da ?? '';
}

function classifyAccessory(acc: Accessory): AccessoryCategory | null {
  const name = getAccName(acc);
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
  return allAcc.filter(a => accIds.has(a.id) && !a.isHeader && !a.hidden);
}

// ─── Generator ──────────────────────────────────────────────────────────────

export function generateSalesArguments(state: ConfiguratorState): string {
  const machineEntries: { profile: MachineProfile; categories: AccessoryCategory[]; insights: string[]; comfortParts: string[] }[] = [];
  const allSeasons = new Set<string>();
  const seenInsights = new Set<string>();
  const seenComfortGroups = new Set<string>();
  const allComfortParts: string[] = [];

  for (const mc of state.machineConfigs) {
    if (mc.qty < 1) continue;
    const profile = MACHINE_PROFILES[mc.type];
    if (!profile && mc.type !== LOOSE_TOOL_KEY) continue;

    const selectedAcc = getSelectedAccessoryObjects(mc, state);
    const seenCats = new Set<string>();
    const cats: AccessoryCategory[] = [];
    const machineInsights: string[] = [];
    const machineComfortParts: string[] = [];

    for (const acc of selectedAcc) {
      const cat = classifyAccessory(acc);
      if (cat && !seenCats.has(cat.label)) {
        seenCats.add(cat.label);
        cats.push(cat);
        cat.seasons.forEach(s => allSeasons.add(s));
      }

      const accName = getAccName(acc);
      for (const insight of OPTION_INSIGHTS) {
        if (insight.match(acc.id, accName) && !seenInsights.has(insight.bullet)) {
          seenInsights.add(insight.bullet);
          if (insight.comfortGroup && !seenComfortGroups.has(insight.comfortGroup)) {
            seenComfortGroups.add(insight.comfortGroup);
            machineComfortParts.push(insight.comfortGroup);
            allComfortParts.push(insight.comfortGroup);
          } else if (!insight.comfortGroup) {
            machineInsights.push(insight.bullet);
          }
        }
      }
    }

    if (profile) {
      profile.seasons.forEach(s => allSeasons.add(s));
      machineEntries.push({ profile, categories: cats, insights: machineInsights, comfortParts: machineComfortParts });
    }
  }

  if (machineEntries.length === 0) {
    return 'Vælg maskiner og redskaber for at generere salgsargumenter.';
  }

  const isMulti = machineEntries.length > 1;
  const hasWinter = allSeasons.has('vinter');
  const hasSummer = allSeasons.has('sommer') || allSeasons.has('forår') || allSeasons.has('efterår');
  const hasAllYear = hasWinter && hasSummer;
  const machineNames = machineEntries.map(e => e.profile.label).join(' og ');

  // ── Title ───────────────────────────────────────────────────────────────
  let title: string;
  if (isMulti && hasAllYear) {
    title = `Helårsløsning med ${machineNames}`;
  } else if (isMulti) {
    title = `Samlet pakkeløsning med ${machineNames}`;
  } else if (hasAllYear) {
    title = `${machineEntries[0].profile.label} – fleksibel helårsløsning`;
  } else {
    title = `${machineEntries[0].profile.label} – målrettet driftsløsning`;
  }

  // ── Paragraph ───────────────────────────────────────────────────────────
  // Build a flowing paragraph that ties the package together
  const paragraphParts: string[] = [];

  if (isMulti) {
    paragraphParts.push(`Denne løsning er sammensat omkring ${machineNames} og giver en stærk, fleksibel pakke`);
    // Describe each machine's role
    const roles = machineEntries.map(e => `${e.profile.label} til ${e.profile.paragraphRole}`);
    paragraphParts.push(`der kombinerer ${roles.join(' med ')}.`);
  } else {
    paragraphParts.push(`${machineEntries[0].profile.label} med de valgte redskaber giver en målrettet og effektiv løsning til ${machineEntries[0].profile.paragraphRole}.`);
  }

  // Mention tool coverage
  const allToolFragments = machineEntries.flatMap(e => e.categories.slice(0, 3).map(c => c.paragraphFragment));
  if (allToolFragments.length > 0) {
    const uniqueFragments = [...new Set(allToolFragments)];
    if (uniqueFragments.length <= 3) {
      paragraphParts.push(`De valgte redskaber dækker ${uniqueFragments.join(', ')}${hasAllYear ? ' – og sikrer dermed en bred anvendelse på tværs af årets sæsoner' : ''}.`);
    } else {
      const shown = uniqueFragments.slice(0, 3).join(', ');
      paragraphParts.push(`De valgte redskaber dækker bl.a. ${shown} – og giver dermed en bred og alsidig driftsløsning${hasAllYear ? ' året rundt' : ''}.`);
    }
  }

  // Comfort summary in paragraph if multiple comfort items
  if (allComfortParts.length >= 2) {
    paragraphParts.push(`Med ${allComfortParts.join(', ')} er der lagt vægt på gode arbejdsforhold og komfort for operatøren i daglig drift.`);
  }

  if (isMulti) {
    paragraphParts.push('Samlet sikrer pakken højere udnyttelse af maskinerne og ensartet service fra én leverandør.');
  }

  const paragraph = paragraphParts.join(' ');

  // ── Bullets (3-5) ───────────────────────────────────────────────────────
  const bullets: string[] = [];

  // Machine bullets
  for (const entry of machineEntries) {
    bullets.push(isMulti ? entry.profile.combo : entry.profile.solo);
  }

  // Best tool bullets (1-2 per machine, avoid repeating machine desc)
  for (const entry of machineEntries) {
    const toolBullets = entry.categories.slice(0, isMulti ? 1 : 2);
    for (const cat of toolBullets) {
      bullets.push(cat.bullet);
    }
  }

  // Comfort: merge into one bullet if 2+, otherwise add individually
  if (allComfortParts.length >= 2) {
    bullets.push(`Valg af ${allComfortParts.join(', ')} giver operatøren markant bedre komfort og arbejdsforhold i daglig drift`);
  } else if (allComfortParts.length === 1) {
    // Find the original bullet for this single comfort item
    const singleComfort = OPTION_INSIGHTS.find(i => i.comfortGroup === allComfortParts[0]);
    if (singleComfort) bullets.push(singleComfort.bullet);
  }

  // Non-comfort insights (bio oil, chassis preservation, etc.)
  for (const entry of machineEntries) {
    for (const ins of entry.insights) {
      if (!bullets.includes(ins)) bullets.push(ins);
    }
  }

  // Package-level
  if (hasAllYear) {
    bullets.push('Samlet giver pakken en højere årlig udnyttelse, større fleksibilitet og en mere komplet driftsløsning');
  } else if (machineEntries.reduce((n, e) => n + e.categories.length, 0) >= 2) {
    bullets.push('De valgte redskaber giver en bredere anvendelse og bedre udnyttelse af maskinen gennem sæsonen');
  }

  if (isMulti) {
    bullets.push('Én leverandør for hele løsningen sikrer ensartet service, reservedele og nem drift');
  }

  const finalBullets = bullets.slice(0, 5);

  return `${title}\n\n${paragraph}\n\n${finalBullets.map(b => `• ${b}`).join('\n')}`;
}
