import {
  ACC_ID_OIL_BIO,
  ACC_ID_OIL_NORMAL,
  ACC_ID_WORK_LIGHT,
  getAccessoriesFlat,
  getLocalizedName,
} from '@/data/machines';
import type { Language } from '@/types/configurator';

const CASE_1_MACHINE = 'RC-1000S';
const CASE_1_FLAIL = '410910';

export type AcademyCase1ProductNames = {
  oil: string;
  flail: string;
  workLight: string;
};

/** Reads the current Product Master-enriched Configurator catalog. */
export function academyProductName(itemNumber: string, language: Language): string {
  const item = getAccessoriesFlat(CASE_1_MACHINE)
    .find((candidate) => candidate.varenr === itemNumber || candidate.id === itemNumber);
  return item ? getLocalizedName(item.name, language) : itemNumber;
}

export function getAcademyCase1ProductNames(language: Language): AcademyCase1ProductNames {
  const oilNormal = academyProductName(ACC_ID_OIL_NORMAL, language);
  const oilBio = academyProductName(ACC_ID_OIL_BIO, language);
  return {
    oil: `${oilNormal} / ${oilBio}`,
    flail: academyProductName(CASE_1_FLAIL, language),
    workLight: academyProductName(ACC_ID_WORK_LIGHT, language),
  };
}

export function academyProductInstruction(
  template: string,
  names: AcademyCase1ProductNames,
): string {
  return template.replace(/\{(oil|flail|workLight)\}/g, (_match, key: keyof AcademyCase1ProductNames) => names[key]);
}
