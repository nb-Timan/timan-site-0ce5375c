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

  // ── PARAGRAPH (connected consultant-style evaluation) ──────────────
  const parts: string[] = [];

  // Opening: acknowledge the customer's choice warmly
  if (isLooseOnly) {
    const toolCount = looseToolNames.length;
    if (isAllYear) {
      parts.push(`I har sammensat ${toolCount} redskaber, der tilsammen giver jeres eksisterende maskinpark et markant løft – fra sommerdrift til vinterberedskab. Det er et velovervejet valg, fordi I undgår at investere i nye maskiner og i stedet udnytter det, I allerede har, langt bedre.`);
    } else if (hasGreen || hasSweep) {
      parts.push(`De redskaber, I har valgt, passer præcist til den daglige drift og gør jeres nuværende maskiner mere alsidige. Det er et klogt valg, fordi I får mere kapacitet uden at binde kapital i nyt materiel.`);
    } else {
      parts.push(`I har udvalgt redskaber, der rammer lige præcis de opgaver, I skal have løst. Det er en fokuseret tilgang, der sikrer, at hver investering gør en konkret forskel i hverdagen.`);
    }
  } else if (isAllYear && isMulti) {
    parts.push(`Det her er en gennemtænkt pakke. Med ${machineLabel} har I sat en løsning sammen, der fungerer på tværs af alle sæsoner – og det gør en stor forskel for den samlede driftsøkonomi, fordi maskinerne er i arbejde hele året.`);
  } else if (isMulti) {
    parts.push(`I har valgt en pakke med ${machineLabel}, hvor maskinerne supplerer hinanden godt. I stedet for overlap får I bred dækning med færre enheder – og det mærkes både på fleksibiliteten og på bundlinjen.`);
  } else if (isAllYear) {
    parts.push(`Med den her konfiguration af ${machineLabel} har I en maskine, der ikke kun løser én opgave – den arbejder for jer hele året rundt. Det er en af de mest fornuftige tilgange, fordi den årlige udnyttelsesgrad bliver markant højere.`);
  } else {
    parts.push(`${machineLabel} er sat sammen med redskaber, der er valgt med omtanke. Det er tydeligt, at der er tænkt over, hvilke opgaver der skal løses – og det giver en løsning, der føles rigtig fra dag ét.`);
  }

  // Middle: how machines complement each other (connected narrative, not list)
  if (isMulti && !isLooseOnly) {
    const roleParts: string[] = [];
    for (const mt of machineTypes) {
      const role = MACHINE_ROLES[mt];
      if (role) roleParts.push(role.roleInSolution);
    }
    if (roleParts.length > 0) {
      parts.push(`I praksis betyder det, at ${roleParts.join(', mens ')} – og tilsammen dækker de et bredere opgavespektrum, end hver maskine ville kunne alene.`);
    }
  }

  // Practical daily use (connected to tasks, not features)
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
      taskMentions.push('fejning og renholdelse af stier og pladser');
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
    parts.push(`I hverdagen betyder det, at I kan håndtere ${joined} uden at skulle ud og leje eller hente ekstra materiel${isAllYear ? ' – uanset sæson' : ''}.`);
  }

  // Comfort/eco woven naturally into the narrative
  if (comfortParts.length >= 2) {
    parts.push(`Det er også værd at bemærke, at I har tænkt på operatøren – ${comfortParts.join(', ')} gør en reel forskel på lange arbejdsdage og bidrager til, at folk faktisk trives med at køre maskinen.`);
  } else if (comfortParts.length === 1) {
    parts.push(`Valget af ${comfortParts[0]} er en detalje, der gør hverdagen bedre for den, der sidder i maskinen – og det smitter af på effektiviteten.`);
  }

  if (caps.has('bio_oil')) {
    parts.push(`At I har valgt bio-hydraulikolie viser, at miljø og bæredygtighed er en del af jeres tilgang – det er noget, der også vejer positivt over for kommuner og borgere.`);
  }

  const paragraph = parts.join(' ');

  // ── BULLETS (solution-level strengths, not product features) ──────────
  const bullets: string[] = [];

  if (isAllYear) {
    bullets.push('Løsningen er aktiv hele året – og det giver en markant bedre driftsøkonomi end maskiner, der kun bruges i én sæson');
  } else if (taskMentions.length >= 2) {
    bullets.push('Bredden i redskabsvalget giver fleksibilitet til at skifte mellem opgavetyper uden ekstra materiel');
  } else {
    bullets.push('Maskine og redskaber er afstemt præcist til opgaven – ingen overkapacitet, ingen mangler');
  }

  if (hasWinter && hasGreen) {
    bullets.push('Skiftet mellem sommer- og vinterdrift sker hurtigt, så I er klar, når vejret skifter');
  } else if (hasWinter) {
    bullets.push('Vinterberedskabet er på plads, og I kan rykke med kort varsel, når frosten melder sig');
  } else if (hasGreen && hasSweep) {
    bullets.push('Grøn pleje og renholdelse håndteres med samme maskine – det sparer tid, transport og mandskab');
  }

  if (caps.has('comfort') && comfortParts.length >= 2) {
    bullets.push('Komfortudstyret sikrer bedre arbejdsmiljø og gør det lettere at fastholde dygtige operatører');
  } else if (caps.has('camera')) {
    bullets.push('Kameraet giver overblik og tryghed ved bakning – en sikkerhedsdetalje, der hurtigt bliver uundværlig');
  }

  if (caps.has('bio_oil')) {
    bullets.push('Bio-hydraulikolie understøtter en grønnere driftsprofil og er et godt signal over for kunder og borgere');
  }

  if (caps.has('chassis_care')) {
    bullets.push('Konservering af chassis beskytter mod rust og korrosion – en lille investering, der forlænger maskinens levetid markant');
  }
  if (caps.has('tow')) {
    bullets.push('Muligheden for at trække tilhænger giver ekstra fleksibilitet i hverdagen');
  }

  // Ensure 3-5 bullets
  if (bullets.length < 3) {
    if (isLooseOnly) {
      bullets.push('Redskaberne passer direkte til den eksisterende maskinpark – ingen yderligere investeringer nødvendige');
    } else if (isMulti) {
      bullets.push('Maskinerne supplerer hinanden – og det giver en sammenhængende løsning med høj udnyttelse');
    } else {
      bullets.push('En enkel og fokuseret løsning, der er hurtig at sætte i drift og let at vedligeholde');
    }
  }
  if (bullets.length < 3 && isLooseOnly) {
    bullets.push('Et fleksibelt redskabsvalg, der styrker driften uden at binde kapital i ekstra maskiner');
  }

  const finalBullets = bullets.slice(0, 5);

  return `${heading}\n\n${paragraph}\n\n${finalBullets.map(b => `• ${b}`).join('\n')}`;
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
  const heading = 'Det ville vi anbefale herfra';

  // ── Build the paragraph (connected advisory, not intro to a list) ────
  const machineLabel = activeMachineTypes
    .filter(t => t !== LOOSE_TOOL_KEY)
    .map(t => t === 'Timan 3330' ? 'Timan 3330' : t)
    .join(' og ');
  const hasLT = activeMachineTypes.includes(LOOSE_TOOL_KEY);
  const subjectLabel = machineLabel 
    ? (hasLT ? `${machineLabel} og de valgte løse redskaber` : machineLabel)
    : 'de valgte løse redskaber';

  // Build a connected paragraph that acknowledges the setup and transitions naturally into recommendations
  const pickCount = topPicks.length;
  const countWord = pickCount === 1 ? 'én ting' : pickCount === 2 ? 'et par ting' : 'nogle få ting';

  let para = `I har allerede sat en stærk løsning sammen med ${subjectLabel}, og der er tydeligvis tænkt over, hvad der skal til. `;
  para += `Når vi kigger på den samlede konfiguration, er der dog ${countWord}, vi typisk vil anbefale ud fra vores erfaring med lignende opsætninger – ikke fordi der mangler noget afgørende, men fordi det kan gøre en mærkbar forskel i den daglige drift.`;

  // ── Build the bullets ─────────────────────────────────────
  const bullets = topPicks.map(p => `${p.rule.label} – ${p.rule.reason}`);

  return `${heading}\n\n${para}\n\n${bullets.map(b => `• ${b}`).join('\n')}`;
}
