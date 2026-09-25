import type { PortalUiLanguage } from '@/lib/portalLanguages';

export const CRM_LEAD_MACHINE_FAMILIES = [
  'RC-751',
  'RC-1000s',
  'Timan 2620',
  'Timan 3330',
  'CS-200 til traktor',
  'Loader-Line',
  'Kun redskab',
] as const;

export type CrmLeadMachineFamily = (typeof CRM_LEAD_MACHINE_FAMILIES)[number];

const labels: Record<CrmLeadMachineFamily, Record<PortalUiLanguage, string>> = {
  'RC-751': { da: 'RC-751', en: 'RC-751', de: 'RC-751', it: 'RC-751', hu: 'RC-751', sv: 'RC-751', fr: 'RC-751', pl: 'RC-751', cs: 'RC-751' },
  'RC-1000s': { da: 'RC-1000s', en: 'RC-1000s', de: 'RC-1000s', it: 'RC-1000s', hu: 'RC-1000s', sv: 'RC-1000s', fr: 'RC-1000s', pl: 'RC-1000s', cs: 'RC-1000s' },
  'Timan 2620': { da: 'Timan 2620', en: 'Timan 2620', de: 'Timan 2620', it: 'Timan 2620', hu: 'Timan 2620', sv: 'Timan 2620', fr: 'Timan 2620', pl: 'Timan 2620', cs: 'Timan 2620' },
  'Timan 3330': { da: 'Timan 3330', en: 'Timan 3330', de: 'Timan 3330', it: 'Timan 3330', hu: 'Timan 3330', sv: 'Timan 3330', fr: 'Timan 3330', pl: 'Timan 3330', cs: 'Timan 3330' },
  'CS-200 til traktor': { da: 'CS-200 til traktor', en: 'CS-200 for tractor', de: 'CS-200 für Traktor', it: 'CS-200 per trattore', hu: 'CS-200 traktorhoz', sv: 'CS-200 för traktor', fr: 'CS-200 pour tracteur', pl: 'CS-200 do ciągnika', cs: 'CS-200 pro traktor' },
  'Loader-Line': { da: 'Loader-Line', en: 'Loader-Line', de: 'Loader-Line', it: 'Loader-Line', hu: 'Loader-Line', sv: 'Loader-Line', fr: 'Loader-Line', pl: 'Loader-Line', cs: 'Loader-Line' },
  'Kun redskab': { da: 'Kun redskab', en: 'Equipment only', de: 'Nur Anbaugerät', it: 'Solo attrezzatura', hu: 'Csak munkaeszköz', sv: 'Endast redskap', fr: 'Équipement uniquement', pl: 'Tylko osprzęt', cs: 'Pouze příslušenství' },
};

const familyPatterns: Array<[CrmLeadMachineFamily, RegExp]> = [
  ['RC-751', /(?:^|,\s*)rc[-\s]?751(?:\s*,|$)/i],
  ['RC-1000s', /(?:^|,\s*)rc[-\s]?1000s?(?:\s*,|$)/i],
  ['Timan 2620', /(?:^|,\s*)(?:timan\s*2620|new\s*2620|2620)(?:\s*,|$)/i],
  ['Timan 3330', /(?:^|,\s*)(?:timan\s*)?3330(?:\s*,|$)/i],
  ['CS-200 til traktor', /(?:^|,\s*)cs[-\s]?200\s+tractor(?:\s*,|$)/i],
  ['Loader-Line', /(?:^|,\s*)(?:loader\s*line\s*\/\s*tractor\s*equipment|full\s*line|tool[-\s]?trac\s*5740|third[-\s]?party\s*equipment)(?:\s*,|$)/i],
];

const tractorEquipmentPattern = /equipment:\s*loader\s*line\s*\/\s*tractor\s*equipment\s*-\s*tractor\s*-/i;

function toText(value: string | string[] | null | undefined): string {
  return Array.isArray(value) ? value.filter(Boolean).join(', ') : value ?? '';
}

function isCanonicalMachineToken(value: string): boolean {
  return familyPatterns.some(([, pattern]) => pattern.test(value)) || tractorEquipmentPattern.test(value);
}

function extractEquipment(value: string | string[] | null | undefined): string[] {
  const source = toText(value).trim();
  if (!source) return [];

  const segments = source.replace(/,\s*(?=Equipment:)/gi, '\u001f').split('\u001f');
  const equipment: string[] = [];
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    if (/^Equipment:/i.test(trimmed)) {
      equipment.push(trimmed);
      continue;
    }
    for (const rawPart of trimmed.split(',')) {
      const part = rawPart.trim();
      if (!part || /^(all|equipment)$/i.test(part) || isCanonicalMachineToken(part)) continue;
      equipment.push(part);
    }
  }
  return equipment;
}

export function getCrmLeadMachineFamilyLabel(family: CrmLeadMachineFamily, language: PortalUiLanguage): string {
  return labels[family][language] ?? labels[family].en;
}

export function resolveCrmLeadMachineFamilies(
  machine: string | string[] | null | undefined,
  equipment?: string | string[] | null,
): CrmLeadMachineFamily[] {
  const source = toText(machine);
  const families = familyPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([family]) => family);

  if (tractorEquipmentPattern.test(source) && !families.includes('CS-200 til traktor')) {
    families.push('CS-200 til traktor');
  }

  const hasGenericEquipmentToken = /(?:^|,\s*)equipment(?:\s*,|$)/i.test(source);
  if (families.length === 0 && (hasGenericEquipmentToken || getCrmLeadEquipmentValues(machine, equipment).length > 0)) {
    families.push('Kun redskab');
  }
  return CRM_LEAD_MACHINE_FAMILIES.filter((family) => families.includes(family));
}

export function getCrmLeadEquipmentValues(
  machine: string | string[] | null | undefined,
  equipment?: string | string[] | null,
): string[] {
  return Array.from(new Set([...extractEquipment(machine), ...extractEquipment(equipment)]));
}

export function getCrmLeadEquipmentOptions(machineOptions: string[], equipmentOptions: string[]): string[] {
  return Array.from(new Set([
    ...machineOptions.flatMap((value) => getCrmLeadEquipmentValues(value)),
    ...equipmentOptions.flatMap((value) => getCrmLeadEquipmentValues(null, value)),
  ])).sort((a, b) => a.localeCompare(b, 'da'));
}

export function matchesCrmLeadMachineFilter(
  machine: string | string[] | null | undefined,
  equipment: string | string[] | null | undefined,
  filter: string | null | undefined,
): boolean {
  if (!filter) return true;
  return resolveCrmLeadMachineFamilies(machine, equipment).includes(filter as CrmLeadMachineFamily);
}

export function matchesCrmLeadEquipmentFilter(
  machine: string | string[] | null | undefined,
  equipment: string | string[] | null | undefined,
  filter: string | null | undefined,
): boolean {
  if (!filter) return true;
  return getCrmLeadEquipmentValues(machine, equipment).includes(filter);
}
