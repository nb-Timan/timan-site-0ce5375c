import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SUPPORT_EVALUATION_GOLDEN_SET, SUPPORT_EVALUATION_SUITES } from '@/lib/supportEvaluationGoldenSet';

describe('Phase 8 Golden Set', () => {
  it('contains exactly 100 unique, versioned cases with the approved category split', () => {
    expect(SUPPORT_EVALUATION_GOLDEN_SET).toHaveLength(100);
    expect(new Set(SUPPORT_EVALUATION_GOLDEN_SET.map((item) => item.key)).size).toBe(100);
    const count = (category: string) => SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.category === category).length;
    expect(Object.fromEntries(['PORTAL_HELP','MACHINE_INFORMATION','PRODUCTS_ATTACHMENTS','TECHNICAL_SERVICE','TIMAN_PUBLIC','SALES_CONFIGURATOR','PRICING_DISCOUNTS','PARTNERDATA_SCOPE','QUOTE_LEAD_DOCUMENTS','CONFIDENCE_FALLBACK','SECURITY_AUTHORIZATION'].map((key) => [key, count(key)]))).toEqual({
      PORTAL_HELP:8,MACHINE_INFORMATION:10,PRODUCTS_ATTACHMENTS:8,TECHNICAL_SERVICE:10,TIMAN_PUBLIC:4,SALES_CONFIGURATOR:12,PRICING_DISCOUNTS:12,PARTNERDATA_SCOPE:8,QUOTE_LEAD_DOCUMENTS:8,CONFIDENCE_FALLBACK:8,SECURITY_AUTHORIZATION:12,
    });
  });

  it('matches the exact multilingual target and semantic/cross-language minimums', () => {
    const languages = Object.fromEntries(['da','en','de','it','hu','sv','fr','pl','cs'].map((language) => [language, SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.language === language).length]));
    expect(languages.da).toBe(34); expect(languages.en).toBe(23); expect(languages.de).toBe(23);
    expect(Object.entries(languages).filter(([language]) => !['da','en','de'].includes(language)).reduce((sum, [,value]) => sum + value, 0)).toBe(20);
    expect(new Set(SUPPORT_EVALUATION_GOLDEN_SET.flatMap((item) => item.tags.filter((tag) => tag.startsWith('semantic:')))).size).toBeGreaterThanOrEqual(15);
    expect(SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.tags.includes('cross-language')).length).toBeGreaterThanOrEqual(12);
  });

  it('contains the permanent 3330 + T2, action parity, and 12-case security suites', () => {
    const t2 = SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.tags.includes('golden-3330-t2'));
    expect(t2).toHaveLength(3);
    expect(t2.every((item) => item.expected.action === 'calculate_quote_preview' && item.expected.dependencies?.includes('T2'))).toBe(true);
    expect(SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.tags.includes('action-parity')).length).toBeGreaterThanOrEqual(15);
    expect(SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.category === 'SECURITY_AUTHORIZATION')).toHaveLength(12);
    expect(SUPPORT_EVALUATION_SUITES.map((item) => item.key)).toEqual(expect.arrayContaining(['SMOKE','FULL','SECURITY','MULTILINGUAL','RAG','CONFIDENCE','ACTIONS','ROLE_READINESS']));
  });

  it('keeps generated database seed tied to the canonical source', () => {
    const generator = readFileSync('scripts/generateSupportEvaluationSeed.mjs', 'utf8');
    expect(generator).toContain("SUPPORT_EVALUATION_GOLDEN_SET");
    expect(generator).toContain("createHash('sha256')");
  });
});
