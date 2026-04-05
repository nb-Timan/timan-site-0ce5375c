/**
 * Sales argument generator for Timan machine quotes.
 * Writes like a human sales consultant evaluating the customer's chosen solution.
 * Solution-first, not product-by-product.
 */

import { ConfiguratorState, MachineConfig, Accessory } from '@/types/configurator';
import { ACCESSORIES, getLooseToolAccessories, LOOSE_TOOL_KEY, ACC_ID_OIL_BIO } from '@/data/machines';

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

  for (const mc of state.machineConfigs) {
    if (mc.qty < 1) continue;
    if (MACHINE_ROLES[mc.type]) machineTypes.push(mc.type);

    const selectedAcc = getSelectedAccessoryObjects(mc, state);
    for (const acc of selectedAcc) {
      const name = getAccName(acc);

      // Check capabilities
      for (const det of ACC_DETECTORS) {
        if (det.match(acc.id, name)) caps.add(det.cap);
      }

      // Check comfort
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

  // ── Determine package character ───────────────────────────────────────
  const hasGreen = caps.has('green_rough') || caps.has('green_fine') || caps.has('trimming');
  const hasSweep = caps.has('sweeping') || caps.has('weed');
  const hasWinter = caps.has('snow_plow') || caps.has('snow_blower') || caps.has('salt_spread');
  const isMulti = machineTypes.length > 1;
  const isAllYear = (hasGreen || hasSweep) && hasWinter;

  const machineLabel = machineTypes.length === 1
    ? (machineTypes[0] === 'Timan 3330' ? 'Timan 3330' : machineTypes[0])
    : machineTypes.map(t => t === 'Timan 3330' ? 'Timan 3330' : t).join(' og ');

  // ── HEADING ───────────────────────────────────────────────────────────
  let heading: string;
  if (isAllYear && isMulti) {
    heading = 'En samlet helårsløsning med fuld dækning';
  } else if (isAllYear) {
    heading = 'Stærk helårsløsning med bred anvendelse';
  } else if (isMulti) {
    heading = 'En fleksibel og sammenhængende maskinpakke';
  } else if (hasWinter) {
    heading = 'Effektiv vinterdrift med stærk maskinplatform';
  } else {
    heading = 'En målrettet og stærk driftsløsning';
  }

  // ── PARAGRAPH (the main value piece) ──────────────────────────────────
  const parts: string[] = [];

  // Opening: evaluate the total solution
  if (isAllYear && isMulti) {
    parts.push(`Den valgte pakke med ${machineLabel} er sammensat som en sammenhængende helårsløsning, hvor maskinerne supplerer hinanden på tværs af opgaver og sæsoner.`);
  } else if (isMulti) {
    parts.push(`Med ${machineLabel} har I valgt en pakke, hvor maskinerne arbejder sammen og dækker et bredt opgavespektrum med færre enheder.`);
  } else if (isAllYear) {
    parts.push(`Den valgte konfiguration af ${machineLabel} giver en løsning, der rækker ud over en enkelt sæson og gør maskinen til en aktiv del af driften året rundt.`);
  } else {
    parts.push(`${machineLabel} er her sat sammen med redskaber, der er valgt til at løse de konkrete driftsopgaver effektivt og pålideligt.`);
  }

  // Middle: how machines and tools complement each other
  if (isMulti) {
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
    if (isMulti) {
      bullets.push('Maskinerne supplerer hinanden og giver en sammenhængende løsning med færre enheder');
    } else {
      bullets.push('En fokuseret løsning, der er enkel at drifte og hurtig at sætte i arbejde');
    }
  }

  const finalBullets = bullets.slice(0, 5);

  return `**${heading}**\n\n${paragraph}\n\n${finalBullets.map(b => `• ${b}`).join('\n')}`;
}
