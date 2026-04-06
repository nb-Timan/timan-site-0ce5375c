/**
 * Sales argument generator for Timan machine quotes.
 * Writes like a human sales consultant evaluating the customer's chosen solution.
 * Solution-first, not product-by-product.
 */

import { ConfiguratorState, MachineConfig, Accessory } from '@/types/configurator';
import { ACCESSORIES, getLooseToolAccessories, LOOSE_TOOL_KEY, ACC_ID_OIL_BIO, ACC_ID_WORK_LIGHT, ACC_ID_FLASH_LIGHT, ACC_ID_VPLOW, ACC_ID_WEEDBRUSH, ACC_ID_WARRANTY_1000, ACC_ID_WARRANTY_751 } from '@/data/machines';

// ─── Capability tags ───────────────────────────────────────────────────────

type Capability =
  | 'green_rough'    // slagleklipper, skivehøster
  | 'green_fine'     // rotorklipper, fingerklipper
  | 'trimming'       // hæk/multitrimmer
  | 'sweeping'       // fejemaskine, feje/sug
  | 'weed'           // ukrudtsbørste
  | 'stump'          // stubfræser
  | 'snow_plow'      // V-plov, dozerblad
  | 'snow_blower'    // sneslynge
  | 'salt_spread'    // spreder / CS-200
  | 'bio_oil'
  | 'comfort'        // merged comfort features
  | 'camera'
  | 'chassis_care'
  | 'tow';

interface DetectedCapability {
  cap: Capability;
  detail?: string; // e.g. "aircondition, skyderuder og luftaffjedret sæde"
}

// ─── Detectors ──────────────────────────────────────────────────────────────

const ACC_DETECTORS: Array<{ cap: Capability; match: (id: string, name: string) => boolean }> = [
  { cap: 'green_rough', match: (id, n) => id === '410910' || n.includes('Slagleklipper') || n.includes('Skivehøster') || id === '412040' },
  { cap: 'green_fine', match: (id, n) => id === '411666' || id === '730017' || id === '730130' || n.includes('Rotorklipper') || id === '411800' || n.includes('Fingerklipper') },
  { cap: 'trimming', match: (id, n) => id.includes('HGM-20083') || id.includes('HGM-20082') || n.includes('Multitrimmer') || n.includes('Termit') },
  { cap: 'sweeping', match: (id, n) => id === '411845' || id === '730020' || n.includes('fejemaskine') || n.includes('Sweeper') || id.includes('720125') || id.includes('720130') || id.includes('720132') || id.includes('720133') || id.includes('730030') || n.includes('Opsamlingstank') || n.includes('Forkostesæt') },
  { cap: 'weed', match: (id, n) => id.includes('730600') || n.includes('krudtsbørste') },
  { cap: 'stump', match: (id, n) => id.startsWith('HFS') || n.includes('Stubfræser') },
  { cap: 'snow_plow', match: (id, n) => id.includes('411742') || id.includes('730114') || n.includes('V-plov') || id === '730105' || n.includes('Dozerblad') },
  { cap: 'snow_blower', match: (id, n) => id === '418000' || id === '730106' || n.includes('Sneslynge') },
  { cap: 'salt_spread', match: (id, n) => id.includes('725131') || id.includes('725132') || id.includes('725138') || n.includes('Spreder') || n.includes('CS-200') },
  { cap: 'bio_oil', match: (id) => id === ACC_ID_OIL_BIO || id === '712180' },
  { cap: 'camera', match: (id) => id === '712164' || id === '712168' || id === '712166' || id === '712167' },
  { cap: 'chassis_care', match: (id) => id === '712175' },
  { cap: 'tow', match: (id) => id === '712169' || id === '712527' || id === '712528' },
];

const COMFORT_IDS: Record<string, string> = {
  '712060': 'aircondition',
  '712147': 'skyderuder',
  '712140': 'luftaffjedret sæde',
  '712174': 'solskærm',
  '712178': 'bakalarm',
};

// ─── Machine role descriptions (for paragraph weaving) ────────────────────

const MACHINE_ROLES: Record<string, { roleInSolution: string; terrainNote: string }> = {
  'RC-1000S': {
    roleInSolution: 'den fjernbetjente RC-1000s tager sig af de krævende opgaver i terræn og på skråninger, hvor traditionelle maskiner ikke kan komme til',
    terrainNote: 'krævende terræn og stejle skråninger',
  },
  'RC-751': {
    roleInSolution: 'RC-751 arbejder sikkert og præcist på skråninger og svært tilgængelige arealer',
    terrainNote: 'skråninger og svært tilgængelige arealer',
  },
  'Timan 3330': {
    roleInSolution: 'Timan 3330 håndterer de daglige driftsopgaver fra førerkabinen med hurtige redskabsskift',
    terrainNote: 'arealer, stier og pladser',
  },
  [LOOSE_TOOL_KEY]: {
    roleInSolution: 'de valgte løse redskaber udvider kapaciteten på den eksisterende maskinpark med præcist de funktioner, der mangler',
    terrainNote: 'eksisterende maskinpark',
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAccName(acc: Accessory): string {
  return typeof acc.name === 'string' ? acc.name : acc.name?.da ?? '';
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

// ─── Main generator ─────────────────────────────────────────────────────────

export function generateSalesArguments(state: ConfiguratorState): string {
  // Collect all capabilities and comfort features across entire package
  const caps = new Set<Capability>();
  const comfortParts: string[] = [];
  const machineTypes: string[] = [];
  let hasLooseTools = false;
  const looseToolNames: string[] = [];

  for (const mc of state.machineConfigs) {
    if (mc.qty < 1) continue;

    if (mc.type === LOOSE_TOOL_KEY) {
      hasLooseTools = true;
      machineTypes.push(mc.type);
      // Collect selected loose tool names for context
      const selectedAcc = getSelectedAccessoryObjects(mc, state);
      for (const acc of selectedAcc) {
        const name = getAccName(acc);
        if (name && !acc.hidden) looseToolNames.push(name);
        for (const det of ACC_DETECTORS) {
          if (det.match(acc.id, name)) caps.add(det.cap);
        }
      }
      continue;
    }

    if (MACHINE_ROLES[mc.type]) machineTypes.push(mc.type);

    const selectedAcc = getSelectedAccessoryObjects(mc, state);
    for (const acc of selectedAcc) {
      const name = getAccName(acc);
      for (const det of ACC_DETECTORS) {
        if (det.match(acc.id, name)) caps.add(det.cap);
      }
      const comfortLabel = COMFORT_IDS[acc.id];
      if (comfortLabel && !comfortParts.includes(comfortLabel)) {
        comfortParts.push(comfortLabel);
      }
    }
  }

  if (comfortParts.length > 0) caps.add('comfort');

  if (machineTypes.length === 0) {
    return 'Vælg maskiner og redskaber for at generere salgsargumenter.';
  }

  const isLooseOnly = hasLooseTools && machineTypes.length === 1 && machineTypes[0] === LOOSE_TOOL_KEY;

  // ── Determine package character ───────────────────────────────────────
  const hasGreen = caps.has('green_rough') || caps.has('green_fine') || caps.has('trimming');
  const hasSweep = caps.has('sweeping') || caps.has('weed');
  const hasWinter = caps.has('snow_plow') || caps.has('snow_blower') || caps.has('salt_spread');
  const realMachines = machineTypes.filter(t => t !== LOOSE_TOOL_KEY);
  const isMulti = realMachines.length > 1 || (realMachines.length >= 1 && hasLooseTools);
  const isAllYear = (hasGreen || hasSweep) && hasWinter;

  const machineLabel = isLooseOnly
    ? 'de valgte løse redskaber'
    : realMachines.length === 1 && !hasLooseTools
      ? (realMachines[0] === 'Timan 3330' ? 'Timan 3330' : realMachines[0])
      : [...realMachines.map(t => t === 'Timan 3330' ? 'Timan 3330' : t), ...(hasLooseTools ? ['supplerende løse redskaber'] : [])].join(' og ');

  // ── HEADING ───────────────────────────────────────────────────────────
  let heading: string;
  if (isLooseOnly && isAllYear) {
    heading = 'Helårsdrift med de rette redskaber';
  } else if (isLooseOnly) {
    heading = 'De rette redskaber til jeres drift';
  } else if (isAllYear && isMulti) {
    heading = 'En komplet helårsløsning';
  } else if (isAllYear) {
    heading = 'Klar til drift året rundt';
  } else if (isMulti) {
    heading = 'Maskinerne arbejder sammen';
  } else if (hasWinter) {
    heading = 'Klar til vinteren';
  } else {
    heading = 'Den rigtige løsning til opgaven';
  }

  // ── PARAGRAPH (the main value piece) ──────────────────────────────────
  const parts: string[] = [];

  // Opening: evaluate the total solution
  if (isLooseOnly) {
    const toolCount = looseToolNames.length;
    if (isAllYear) {
      parts.push(`Med ${toolCount} udvalgte redskaber er der sammensat en redskabspakke, der udvider den eksisterende maskinparks kapacitet på tværs af sæsoner – fra grøn vedligeholdelse til vinterberedskab.`);
    } else if (hasGreen || hasSweep) {
      parts.push(`De valgte redskaber er sammensat med fokus på at styrke den daglige drift med præcist de funktioner, der gør den eksisterende maskinpark mere alsidigt anvendelig.`);
    } else {
      parts.push(`De valgte løse redskaber udvider maskinparkens funktionalitet med målrettede løsninger til de konkrete driftsopgaver.`);
    }
  } else if (isAllYear && isMulti) {
    parts.push(`Den valgte pakke med ${machineLabel} er sammensat som en sammenhængende helårsløsning, hvor maskinerne supplerer hinanden på tværs af opgaver og sæsoner.`);
  } else if (isMulti) {
    parts.push(`Med ${machineLabel} har I valgt en pakke, hvor maskinerne arbejder sammen og dækker et bredt opgavespektrum med færre enheder.`);
  } else if (isAllYear) {
    parts.push(`Den valgte konfiguration af ${machineLabel} giver en løsning, der rækker ud over en enkelt sæson og gør maskinen til en aktiv del af driften året rundt.`);
  } else {
    parts.push(`${machineLabel} er her sat sammen med redskaber, der er valgt til at løse de konkrete driftsopgaver effektivt og pålideligt.`);
  }

  // Middle: how machines and tools complement each other
  if (isMulti && !isLooseOnly) {
    const roleParts: string[] = [];
    for (const mt of machineTypes) {
      const role = MACHINE_ROLES[mt];
      if (role) roleParts.push(role.roleInSolution);
    }
    if (roleParts.length > 0) {
      parts.push(`I praksis betyder det, at ${roleParts.join(', mens ')}.`);
    }
  }

  // Practical usage across tasks/seasons
  const taskMentions: string[] = [];
  if (hasGreen) {
    if (caps.has('green_rough') && caps.has('green_fine')) {
      taskMentions.push('både grov vegetation og præcis græspleje');
    } else if (caps.has('green_rough')) {
      taskMentions.push('grov vegetation og tilgroede arealer');
    } else if (caps.has('green_fine')) {
      taskMentions.push('ensartet og præcis græspleje');
    }
    if (caps.has('trimming')) taskMentions.push('hæk- og kantbeskæring');
  }
  if (hasSweep) {
    if (caps.has('weed')) {
      taskMentions.push('renholdelse og mekanisk ukrudtsbekæmpelse uden sprøjtemidler');
    } else {
      taskMentions.push('fejning og renholdelse af stier og arealer');
    }
  }
  if (hasWinter) {
    const winterParts: string[] = [];
    if (caps.has('snow_plow') || caps.has('snow_blower')) winterParts.push('snerydning');
    if (caps.has('salt_spread')) winterParts.push('glatførebekæmpelse');
    taskMentions.push(winterParts.join(' og '));
  }
  if (caps.has('stump')) taskMentions.push('fjernelse af stubbe');

  if (taskMentions.length > 0) {
    const joined = taskMentions.length <= 2
      ? taskMentions.join(' og ')
      : taskMentions.slice(0, -1).join(', ') + ' og ' + taskMentions[taskMentions.length - 1];
    parts.push(`De valgte redskaber dækker ${joined} – og giver dermed en løsning, der kan bruges aktivt i hverdagen på tværs af opgavetyper${isAllYear ? ' og sæsoner' : ''}.`);
  }

  // Comfort / eco / durability (natural mention)
  if (comfortParts.length >= 2) {
    parts.push(`Med ${comfortParts.join(', ')} er der også tænkt på operatørens daglige arbejdsforhold, hvilket giver bedre trivsel og højere effektivitet i det daglige.`);
  } else if (comfortParts.length === 1) {
    parts.push(`Valg af ${comfortParts[0]} bidrager til bedre arbejdsforhold for operatøren.`);
  }

  if (caps.has('bio_oil')) {
    parts.push(`Valget af bio-hydraulikolie viser en bevidst og ansvarlig tilgang til miljø og bæredygtighed.`);
  }

  const paragraph = parts.join(' ');

  // ── BULLETS (3-5 supporting points, not repeating paragraph) ──────────
  const bullets: string[] = [];

  // 1. Package-level value
  if (isAllYear) {
    bullets.push('Løsningen dækker grøn vedligeholdelse, renholdelse og vinterdrift – og sikrer en højere årlig udnyttelse af maskinerne');
  } else if (taskMentions.length >= 2) {
    bullets.push('Redskabsvalget giver bred anvendelse på tværs af flere opgavetyper med samme maskinpark');
  } else {
    bullets.push('Maskine og redskaber er afstemt til at løse de faktiske driftsopgaver med høj effektivitet');
  }

  // 2. Seasonal / operational strength
  if (hasWinter && hasGreen) {
    bullets.push('Vinterberedskabet forlænger maskinernes aktive sæson og styrker den samlede driftsøkonomi');
  } else if (hasWinter) {
    bullets.push('Vinterberedskabet gør løsningen klar til snerydning og glatførebekæmpelse, når behovet opstår');
  } else if (hasGreen && hasSweep) {
    bullets.push('Kombinationen af grøn pleje og renholdelse reducerer behovet for separate maskiner');
  }

  // 3. Comfort / quality of work
  if (caps.has('comfort') && comfortParts.length >= 2) {
    bullets.push('Komfortudstyr i kabinen sikrer bedre arbejdsmiljø og gør lange driftsdage mere overkommelige');
  } else if (caps.has('camera')) {
    bullets.push('Kameraløsningen giver bedre overblik og øget sikkerhed under drift');
  }

  // 4. Eco
  if (caps.has('bio_oil')) {
    bullets.push('Bio-hydraulikolie er et grønnere valg, der understøtter en mere bæredygtig driftstilgang');
  }

  // 5. Durability / flexibility
  if (caps.has('chassis_care')) {
    bullets.push('Konservering af chassis og hydraulik beskytter investeringen og forlænger levetiden');
  }
  if (caps.has('tow')) {
    bullets.push('Kombitræk giver ekstra fleksibilitet med mulighed for at trække tilhænger direkte');
  }

  // Ensure 3-5 bullets
  if (bullets.length < 3) {
    if (isLooseOnly) {
      bullets.push('Redskaberne er valgt til at passe den eksisterende maskinpark og kan tages i brug uden yderligere investeringer i nye maskiner');
    } else if (isMulti) {
      bullets.push('Maskinerne supplerer hinanden og giver en sammenhængende løsning med færre enheder');
    } else {
      bullets.push('En fokuseret løsning, der er enkel at drifte og hurtig at sætte i arbejde');
    }
  }
  if (bullets.length < 3 && isLooseOnly) {
    bullets.push('Fleksibelt redskabsvalg, der styrker driften uden at binde kapital i ekstra maskiner');
  }

  const finalBullets = bullets.slice(0, 5);

  return `**${heading}**\n\n${paragraph}\n\n${finalBullets.map(b => `• ${b}`).join('\n')}`;
}

// ─── Recommendation engine ──────────────────────────────────────────────────
// Analyzes selected vs available accessories and recommends 2-4 valuable missing add-ons.

interface RecommendationRule {
  /** IDs or varenr patterns that indicate this add-on category */
  matchIds: string[];
  /** IDs that, if ANY is selected, mean the parent product is present */
  parentIds: string[];
  /** Human-readable Danish name */
  label: string;
  /** A warm, consultant-style recommendation sentence */
  reason: string;
  /** Priority: 1 = removes frustration, 2 = efficiency, 3 = comfort, 4 = durability */
  priority: number;
}

const RECOMMENDATION_RULES: RecommendationRule[] = [
  // RC-1000S recommendations
  {
    matchIds: [ACC_ID_WORK_LIGHT, '412594'],
    parentIds: ['410910', '411666', '411800', '412040', 'HFS-1012', ACC_ID_VPLOW, '411845', '418000', ACC_ID_WEEDBRUSH],
    label: 'Arbejdslamper til RC-1000s',
    reason: 'gør det muligt at arbejde sikkert i dårlig belysning og forlænger den effektive arbejdsdag markant, især i de mørke vintermåneder',
    priority: 1,
  },
  {
    matchIds: [ACC_ID_FLASH_LIGHT, '411630'],
    parentIds: ['410910', '411666', '411800', '412040', 'HFS-1012', ACC_ID_VPLOW, '411845', '418000', ACC_ID_WEEDBRUSH],
    label: 'Blitzlys til RC-1000s',
    reason: 'øger sikkerheden markant ved arbejde nær veje og trafik – og er ofte et krav fra kommuner og vejdirektorat',
    priority: 1,
  },
  {
    matchIds: [ACC_ID_WARRANTY_1000, '795016'],
    parentIds: ['410910', '411666', '411800', '412040'],
    label: 'Udvidet komponentgaranti (RC-1000s)',
    reason: 'giver ekstra tryghed og beskytter mod uforudsete reparationsomkostninger i de første vigtige driftsår',
    priority: 3,
  },
  // RC-751 recommendations  
  {
    matchIds: [ACC_ID_WARRANTY_751, '795015'],
    parentIds: ['411687', '411571', '411866', '411867'],
    label: 'Udvidet komponentgaranti (RC-751)',
    reason: 'sikrer at maskinen er dækket mod uventede komponentfejl og reducerer risikoen for dyre driftsstop',
    priority: 3,
  },
  {
    matchIds: ['411571'],
    parentIds: ['411687', '411866', '411867'],
    label: 'Spikes-sæt til RC-751',
    reason: 'giver markant bedre greb på blødt underlag og skråninger med mos, hvilket reducerer risikoen for at maskinen glider',
    priority: 1,
  },
  // Timan 3330 recommendations
  {
    matchIds: ['712175'],
    parentIds: ['720125', '720130', '720132', '720133', '730020', '730114', '725131', '725132', '725138', '730105', '730106', '730017', 'HGM-2007', '730130'],
    label: 'Konservering af chassis og hydraulik',
    reason: 'beskytter maskinen mod rust og korrosion – særligt vigtigt hvis den bruges til saltspredning eller i våde miljøer, hvor det kan forlænge levetiden betydeligt',
    priority: 4,
  },
  {
    matchIds: ['712060'],
    parentIds: ['720125', '720130', '720132', '720133', '730020', '730114', '725131', '725132', '725138'],
    label: 'Aircondition',
    reason: 'gør en markant forskel på lange driftsdage i sommervarmen og sikrer, at operatøren kan holde koncentrationen hele dagen',
    priority: 3,
  },
  {
    matchIds: ['712147'],
    parentIds: ['720125', '720130', '720132', '720133', '730020', '730114', '725131', '725132', '725138'],
    label: 'Skyderuder',
    reason: 'giver mulighed for bedre ventilation og direkte kontakt med omgivelserne – en lille detalje, der gør hverdagen væsentligt mere behagelig',
    priority: 3,
  },
  {
    matchIds: ['712140'],
    parentIds: ['720125', '720130', '720132', '720133', '730020', '730114', '725131', '725132', '725138'],
    label: 'Luftaffjedret sæde',
    reason: 'reducerer vibrationer og belastning på kroppen og er en god investering i operatørens helbred ved daglig brug',
    priority: 3,
  },
  {
    matchIds: ['712166', '712167'],
    parentIds: ['720125', '720130', '720132', '720133', '730020', '730114', '725131', '725132', '725138'],
    label: 'Bakkamera',
    reason: 'giver overblik bagud og øger sikkerheden markant, både for operatøren og for omgivelserne',
    priority: 1,
  },
  {
    matchIds: ['795002'],
    parentIds: ['720125', '720130', '720132', '720133', '730020', '730114', '725131', '725132', '725138', '730017', 'HGM-2007'],
    label: 'Udvidet komponentgaranti (Timan 3330)',
    reason: 'sikrer ro i maven og beskytter investeringen mod uforudsete reparationsomkostninger',
    priority: 4,
  },
  // CS-200 / spreader sub-item recommendations
  {
    matchIds: ['712902', '725131__712902', '725132__712902', '725138__712902'],
    parentIds: ['725131', '725132', '725138'],
    label: 'Rustbeskyttelse til CS-200 spreder',
    reason: 'er næsten et must, når sprederen bruges til salt – uden rustbeskyttelse kan levetiden reduceres markant',
    priority: 4,
  },
  {
    matchIds: ['725120', '725131__725120', '725132__725120', '725138__725120'],
    parentIds: ['725131', '725132', '725138'],
    label: 'LED arbejdslys bag på spreder',
    reason: 'gør saltspredning i mørke langt mere overskuelig og sikker – en lille investering med stor daglig nytte',
    priority: 1,
  },
  {
    matchIds: ['V34-029', '725131__V34-029', '725132__V34-029', '725138__V34-029'],
    parentIds: ['725131', '725132', '725138'],
    label: 'Vogn til afmontering af spreder',
    reason: 'gør det væsentligt nemmere at skifte mellem spreder og andre redskaber – en stor tidsbesparelse i hverdagen',
    priority: 1,
  },
  {
    matchIds: ['V34-055', '725131__V34-055', '725132__V34-055', '725138__V34-055'],
    parentIds: ['725131', '725132', '725138'],
    label: 'Lad med hydraulisk tip',
    reason: 'giver mulighed for at transportere og tippe salt eller materialer direkte – og gør maskinen mere alsidig i den daglige drift',
    priority: 2,
  },
  // Sweeper / T2/T3 sub-item recommendations
  {
    matchIds: ['721122', '721122_720125', '721122_720130', '721122_720132', '721122_720133'],
    parentIds: ['720125', '720130', '720132', '720133'],
    label: 'Fabriksmontering af centerslange',
    reason: 'sikrer optimal sugeevne fra dag ét og sparer tid på eftermontering',
    priority: 2,
  },
  {
    matchIds: ['V34-029_720125', 'V34-029_720130', 'V34-029_720132', 'V34-029_720133'],
    parentIds: ['720125', '720130', '720132', '720133'],
    label: 'Vogn til afmontering af fejesug',
    reason: 'gør det nemt og hurtigt at af- og påmontere fejesugtanken – og giver fleksibilitet i hverdagen',
    priority: 1,
  },
  // Rust protection on sweeper/v-plow for 3330
  {
    matchIds: ['LT_712900', '712900'],
    parentIds: ['730020', '411845'],
    label: 'Rustbeskyttelse til fejemaskine',
    reason: 'forlænger levetiden på fejemaskinen og er en lille investering, der beskytter mod dyr korrosion over tid',
    priority: 4,
  },
  {
    matchIds: ['LT_712901', '712901'],
    parentIds: ['730114', ACC_ID_VPLOW],
    label: 'Rustbeskyttelse til V-plov',
    reason: 'er en god investering – især ved brug sammen med salt, hvor ploven ellers slides hurtigt',
    priority: 4,
  },
];


export function generateRecommendations(state: ConfiguratorState): string | null {
  // Collect ALL selected accessory IDs (including sub-items) across all machines
  const selectedIds = new Set<string>();
  const activeMachineTypes: string[] = [];

  for (const mc of state.machineConfigs) {
    if (mc.qty < 1) continue;
    activeMachineTypes.push(mc.type);
    
    // Shared accessories
    mc.acc.forEach(id => selectedIds.add(id));
    
    // Individual unit configs
    if (mc.configMode === 'individual') {
      for (let i = 1; i <= mc.qty; i++) {
        const key = `${mc.id}_${i}`;
        const unitCfg = state.individualUnitConfigs[key];
        if (unitCfg) unitCfg.acc.forEach(id => selectedIds.add(id));
      }
    }
  }

  if (activeMachineTypes.length === 0) return null;

  // Check which parent products are selected
  const hasParent = (parentIds: string[]) => parentIds.some(id => selectedIds.has(id));
  
  // Check if ANY of the match IDs are already selected
  const isAlreadySelected = (matchIds: string[]) => matchIds.some(id => selectedIds.has(id));

  // Find applicable missing add-ons
  const candidates: { rule: RecommendationRule }[] = [];

  for (const rule of RECOMMENDATION_RULES) {
    // Skip if the add-on is already selected
    if (isAlreadySelected(rule.matchIds)) continue;
    // Skip if the parent product is not selected
    if (!hasParent(rule.parentIds)) continue;
    
    candidates.push({ rule });
  }

  if (candidates.length === 0) return null;

  // Sort by priority (1=best), take top 2-4
  candidates.sort((a, b) => a.rule.priority - b.rule.priority);
  const topPicks = candidates.slice(0, 4);
  // Ensure at least 2
  if (topPicks.length < 2) {
    // Only 1 recommendation is too thin — but still show it
  }

  // ── Build the heading ─────────────────────────────────────
  const heading = 'Timans anbefaling til denne konfiguration';

  // ── Build the paragraph ───────────────────────────────────
  const machineLabel = activeMachineTypes
    .filter(t => t !== LOOSE_TOOL_KEY)
    .map(t => t === 'Timan 3330' ? 'Timan 3330' : t)
    .join(' og ');
  const hasLT = activeMachineTypes.includes(LOOSE_TOOL_KEY);
  const subjectLabel = machineLabel 
    ? (hasLT ? `${machineLabel} og de valgte løse redskaber` : machineLabel)
    : 'de valgte løse redskaber';

  let para = `Den valgte konfiguration af ${subjectLabel} er allerede en stærk og gennemtænkt løsning. `;
  para += `For at få endnu mere ud af pakken i den daglige drift, vil vi fremhæve ${topPicks.length === 1 ? 'ét tilvalg' : `${topPicks.length} tilvalg`}, som efter vores erfaring gør en mærkbar forskel i hverdagen.`;

  // ── Build the bullets ─────────────────────────────────────
  const bullets = topPicks.map(p => `${p.rule.label} – ${p.rule.reason}`);

  return `**${heading}**\n\n${para}\n\n${bullets.map(b => `• ${b}`).join('\n')}`;
}
