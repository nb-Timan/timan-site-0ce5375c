import { describe, expect, it } from 'vitest';
import { compactLeadSearchText, matchesLeadSearch } from '@/lib/crmLeadSearch';

describe('CRM lead search normalization', () => {
  it('matches G lead numbers with prefix, spacing, dash, case and number-only queries', () => {
    const fields = ['G-5532', 'Skoleparken - Esbjerg'];
    expect(matchesLeadSearch(fields, '5532')).toBe(true);
    expect(matchesLeadSearch(fields, 'G-5532')).toBe(true);
    expect(matchesLeadSearch(fields, 'G5532')).toBe(true);
    expect(matchesLeadSearch(fields, 'G 5532')).toBe(true);
    expect(matchesLeadSearch(fields, 'g-5532')).toBe(true);
    expect(matchesLeadSearch(fields, 'g5532')).toBe(true);
  });

  it('matches L lead numbers with the same normalization', () => {
    const fields = ['L-1008', 'AaB Esbjerg'];
    expect(matchesLeadSearch(fields, '1008')).toBe(true);
    expect(matchesLeadSearch(fields, 'L-1008')).toBe(true);
    expect(matchesLeadSearch(fields, 'L1008')).toBe(true);
    expect(matchesLeadSearch(fields, 'l-1008')).toBe(true);
  });

  it('supports partial lead-number search', () => {
    expect(matchesLeadSearch(['G-5532'], '553')).toBe(true);
    expect(matchesLeadSearch(['L-1008'], '100')).toBe(true);
  });

  it('preserves regular free-text search fields', () => {
    const fields = [
      'G-5532',
      'Skoleparken - Esbjerg',
      'JR Maskincenter',
      'Alexander Kirschner',
      'Timan 3330',
      'kunde@example.dk',
      '+45 12 34 56 78',
    ];
    expect(matchesLeadSearch(fields, 'skoleparken')).toBe(true);
    expect(matchesLeadSearch(fields, 'maskincenter')).toBe(true);
    expect(matchesLeadSearch(fields, 'kirschner')).toBe(true);
    expect(matchesLeadSearch(fields, '3330')).toBe(true);
    expect(matchesLeadSearch(fields, 'kunde@example.dk')).toBe(true);
    expect(matchesLeadSearch(fields, '12345678')).toBe(true);
  });

  it('normalizes accents for existing text search', () => {
    expect(compactLeadSearchText('ÅBEN G-5532')).toBe('abeng5532');
  });
});
