import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MESSE_MACHINE_EXTRA_TRANSLATIONS } from '@/lib/i18n/messeMachineTranslations';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';

const EXTRA_LANGS = ['sv', 'fr', 'pl', 'cs'] as const;

const source = readFileSync(
  path.resolve(process.cwd(), 'src/pages/messe/MesseMachineBrochurePage.tsx'),
  'utf8',
);

/** All Danish source strings declared on the machine detail pages. */
function danishStrings(): string[] {
  const out = new Set<string>();
  const daMatches = source.matchAll(/da:\s*'((?:\\.|[^'\\])*)'/g);
  for (const m of daMatches) out.add(m[1].replace(/\\'/g, "'"));
  const textMatches = source.matchAll(/text\(\s*'((?:\\.|[^'\\])*)'/g);
  for (const m of textMatches) out.add(m[1].replace(/\\'/g, "'"));
  return [...out];
}

/** Strings that carry real words (numbers/units/product names need no translation). */
function needsTranslation(value: string): boolean {
  if (!/[A-Za-zÆØÅæøå]{3,}/.test(value)) return false;
  if (/^[\d\s,./x×-]+\s*(mm|cm|kg|l|kW|dB|bar|rpm|HK|hk)?$/.test(value.trim())) return false;
  // Product / brand names are intentionally identical in every language.
  return ![
    'Kubota',
    'Tornado T2',
    'Tornado T3',
    'Combispreader CS-200',
    'Rotorklipper 1350',
    'Rotorklipper GMR',
    'Multitrimmer',
    '12 volt',
    '65 amp',
  ].includes(value);
}

describe('Messe machine detail pages i18n', () => {
  it('binds to the selected portal language, not the legacy 5-language mapping', () => {
    expect(source).toContain('uiLanguage: lang');
    expect(source).not.toMatch(/const \{ language: lang \}/);
  });

  it('has no direct T.<key>[lang] lookups that bypass the resolver', () => {
    expect(source).not.toMatch(/T\.\w+\[lang\]/);
  });

  it('covers every translatable Danish string in sv/fr/pl/cs', () => {
    const missing: string[] = [];
    for (const value of danishStrings()) {
      if (!needsTranslation(value)) continue;
      const entry = MESSE_MACHINE_EXTRA_TRANSLATIONS[value];
      if (!entry) {
        missing.push(`${value} -> (no entry)`);
        continue;
      }
      for (const lang of EXTRA_LANGS) {
        if (!entry[lang]) missing.push(`${value} -> ${lang}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('supports all nine portal languages', () => {
    expect(PORTAL_LANGUAGE_CODES).toEqual(['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs']);
  });
});
