import { getContractStepLabel, type ContractSnapshot } from '@/lib/contractFlow';
import type { GuidedContractSection } from '@/lib/contractSections';
import {
  normalizeContractTerritoryArea,
  type ContractSecondaryTerritoryArea,
  type ContractTerritoryArea,
} from '@/lib/contractTerritory';
import {
  CONTRACT_WHOLE_COUNTRY_MAP,
  getContractTerritoryMapCountryConfig,
  getContractTerritoryMapRegionKeys,
} from '@/lib/contractTerritoryMap';

export type ContractPdfLanguage = 'da' | 'en' | 'de';

export type ContractPdfPresentationBlock = {
  heading?: string;
  paragraphs: string[];
  bullets: string[];
};

export type ContractPdfPresentationSection = {
  number: number;
  stepId: GuidedContractSection['stepId'];
  title: string;
  blocks: ContractPdfPresentationBlock[];
};

export type ContractPdfMapFeature = {
  key: string;
  geometry: GeoJSON.Geometry;
  selected: boolean;
};

export type ContractPdfMapModel = {
  variant: 'primary' | 'secondary';
  title: string;
  attribution: string;
  features: ContractPdfMapFeature[];
};

export type ContractPdfJsonLoader = (url: string) => Promise<unknown>;

const APPENDIX_PREFIX = /^(?:bilag|appendix|anhang)\s+\d+\s*[:.-]?\s*/i;
const NUMBER_PREFIX = /^\d+(?:\.\d+)*\.?\s+/;

const PDF_SECTION_LABELS = {
  parties: { da: 'Parterne', en: 'The parties', de: 'Die Parteien' },
  signature: { da: 'Underskrift', en: 'Signature', de: 'Unterschrift' },
  primaryMap: { da: 'Primært område', en: 'Primary territory', de: 'Primäres Gebiet' },
  secondaryMap: { da: 'Sekundært område', en: 'Secondary territory', de: 'Sekundäres Gebiet' },
} as const;

export function getContractPdfSectionLabel(
  key: keyof typeof PDF_SECTION_LABELS,
  language: ContractPdfLanguage,
) {
  return PDF_SECTION_LABELS[key][language];
}

export function stripContractPdfHeadingPrefix(value: string) {
  return value.trim().replace(APPENDIX_PREFIX, '').replace(NUMBER_PREFIX, '').replace(/[:.]$/, '').trim();
}

function comparableHeading(value: string) {
  return stripContractPdfHeadingPrefix(value)
    .toLocaleLowerCase('da')
    .replace(/\s*&\s*/g, ' og ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function extractEmbeddedSubheading(paragraphs: readonly string[]) {
  const first = paragraphs[0]?.trim() ?? '';
  const match = first.match(/^\d+\.\s+(.{2,70})$/);
  return match ? { heading: match[1].replace(/:$/, ''), paragraphs: paragraphs.slice(1) } : null;
}

/**
 * Builds a presentation-only hierarchy. Source clauses remain frozen in the
 * contract snapshot; only their visible numbering and appendix-like UI labels
 * are normalized for the finished PDF.
 */
export function buildContractPdfPresentation(
  snapshot: ContractSnapshot,
  legalSections: readonly GuidedContractSection[],
  language: ContractPdfLanguage,
) {
  const sections: ContractPdfPresentationSection[] = legalSections.map((section, sectionIndex) => {
    const number = sectionIndex + 2;
    const title = getContractStepLabel(section.stepId, language, snapshot.dealer.partnerType).title
      .replace(/\s+(?:og|and|und)\s+(?:Bilag|Appendix|Anhang)\s+\d+$/i, '')
      .trim();
    let subsection = 0;

    const blocks = section.blocks.map((block) => {
      const sourceHeading = block.heading?.trim() ?? '';
      const embedded = extractEmbeddedSubheading(block.paragraphs ?? []);
      const cleanedHeading = stripContractPdfHeadingPrefix(embedded?.heading ?? sourceHeading);
      const isMainHeading = comparableHeading(cleanedHeading) === comparableHeading(title);
      const needsSubheading = Boolean(cleanedHeading) && !isMainHeading;
      const heading = needsSubheading
        ? `${number}.${++subsection} ${cleanedHeading}`
        : undefined;

      return {
        heading,
        paragraphs: [...(embedded?.paragraphs ?? block.paragraphs ?? [])],
        bullets: [...(block.bullets ?? [])],
      };
    });

    return { number, stepId: section.stepId, title, blocks };
  });

  const sectionNumber = (stepId: GuidedContractSection['stepId']) => (
    sections.find((section) => section.stepId === stepId)?.number
  );
  const appendixReferences: Record<string, string | undefined> = {
    '1': sectionNumber('spare_parts_service') ? `${sectionNumber('spare_parts_service')}.1` : undefined,
    '2': sectionNumber('discount_structure') ? String(sectionNumber('discount_structure')) : undefined,
    '3': sectionNumber('territory') ? String(sectionNumber('territory')) : undefined,
    '4': sectionNumber('payment_delivery') ? `${sectionNumber('payment_delivery')}.1` : undefined,
  };
  const sectionWord = language === 'da' ? 'afsnit' : language === 'de' ? 'Abschnitt' : 'section';
  const replaceAppendixReferences = (value: string) => value.replace(
    /\b(?:Bilag|Appendix|Anhang)\s+([1-4])\b/gi,
    (match, number: string) => appendixReferences[number] ? `${sectionWord} ${appendixReferences[number]}` : match,
  );

  sections.forEach((section) => {
    section.blocks.forEach((block) => {
      if (block.heading) block.heading = replaceAppendixReferences(block.heading);
      block.paragraphs = block.paragraphs.map(replaceAppendixReferences);
      block.bullets = block.bullets.map(replaceAppendixReferences);
    });
  });

  return {
    parties: { number: 1, title: getContractPdfSectionLabel('parties', language) },
    sections,
    signature: {
      number: sections.length + 2,
      title: getContractPdfSectionLabel('signature', language),
    },
  };
}

function contractMapAttribution(country: string, wholeCountry: boolean) {
  if (wholeCountry) return 'Kortgrundlag: Natural Earth, public domain.';
  if (country === 'DK') return 'Kortgrundlag: Dataforsyningen / SDFI.';
  if (country === 'SE') return 'Kortgrundlag: Statistics Sweden (SCB), CC0.';
  if (country === 'DE') return 'Kortgrundlag: de-plz-geojson.';
  return 'Kortgrundlag: Natural Earth, public domain.';
}

async function loadAreaMap(
  areaInput: ContractTerritoryArea | ContractSecondaryTerritoryArea,
  variant: ContractPdfMapModel['variant'],
  language: ContractPdfLanguage,
  loadJson: ContractPdfJsonLoader,
): Promise<ContractPdfMapModel | null> {
  const area = normalizeContractTerritoryArea(areaInput);
  const detailedConfig = !area.wholeCountry ? getContractTerritoryMapCountryConfig(area.country) : undefined;
  const title = getContractPdfSectionLabel(variant === 'primary' ? 'primaryMap' : 'secondaryMap', language);

  if (detailedConfig) {
    const collection = detailedConfig.parseGeoJson(await loadJson(detailedConfig.geoJsonUrl));
    const selectedKeys = new Set(getContractTerritoryMapRegionKeys(area));
    return {
      variant,
      title,
      attribution: contractMapAttribution(area.country, false),
      features: collection.features.flatMap((feature) => {
        const meta = detailedConfig.getFeatureMeta(feature);
        return meta && feature.geometry
          ? [{ key: meta.key, geometry: feature.geometry, selected: selectedKeys.has(meta.key) }]
          : [];
      }),
    };
  }

  const collection = CONTRACT_WHOLE_COUNTRY_MAP.parseGeoJson(await loadJson(CONTRACT_WHOLE_COUNTRY_MAP.geoJsonUrl));
  const selected = collection.features.find((feature) => (
    CONTRACT_WHOLE_COUNTRY_MAP.getFeatureMeta(feature)?.code === area.country
  ));
  if (!selected?.geometry) return null;

  return {
    variant,
    title,
    attribution: contractMapAttribution(area.country, true),
    features: [{ key: area.country, geometry: selected.geometry, selected: true }],
  };
}

export async function loadContractPdfTerritoryMaps(
  territory: ContractSnapshot['territory'],
  language: ContractPdfLanguage,
  loadJson: ContractPdfJsonLoader = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load contract map data: ${url}`);
    return response.json();
  },
) {
  if (!territory?.primaryTerritory) return [];
  const primary = await loadAreaMap(territory.primaryTerritory, 'primary', language, loadJson);
  const secondary = territory.secondaryTerritory?.enabled
    ? await loadAreaMap(territory.secondaryTerritory, 'secondary', language, loadJson)
    : null;
  return [primary, secondary].filter((map): map is ContractPdfMapModel => Boolean(map));
}

export function getContractPdfLegalContent(sections: readonly GuidedContractSection[]) {
  return sections.flatMap((section) => section.blocks.flatMap((block) => [
    ...(block.paragraphs ?? []),
    ...(block.bullets ?? []),
  ]));
}
