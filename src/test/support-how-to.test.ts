import { describe, expect, it } from 'vitest';
import { buildSupportHowToContext, isSupportHowToQuestion } from '@/lib/supportHowTo';

describe('Support Timan how-to routing', () => {
  it.each([
    'jeg vil gerne bestille reservedele hvad gør jeg?',
    'Hvordan får jeg reservedele til min Timan?',
    'Kan du hjælpe mig med at bestille reservedele?',
  ])('recognizes spare-parts guidance without starting a transaction: %s', (question) => {
    expect(isSupportHowToQuestion(question)).toBe(true);
    expect(buildSupportHowToContext(question)).toEqual({
      domain: 'TIMAN_HOW_TO',
      source: 'approved_knowledge',
      topic: 'spare-parts-ordering',
    });
  });

  it.each([
    'Hvilke reservedele passer til min maskine?',
    'Jeg vil gerne have et tilbud på en RC-1000s',
    'Hvor finder jeg CRM?',
  ])('does not overroute unrelated questions: %s', (question) => {
    expect(isSupportHowToQuestion(question)).toBe(false);
    expect(buildSupportHowToContext(question)).toBeNull();
  });
});
