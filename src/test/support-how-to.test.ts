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
      intent: 'SPARE_PARTS_ORDERING',
    });
  });

  it.each([
    'Hvordan bruger jeg reservedelsportalen?',
    'Kan jeg se priser og lagerstatus?',
    'Hvordan laver jeg en reservedelsliste / ET-liste?',
    'Hvad betyder den grønne kurv?',
    'Åbn reservedelsportalen',
  ])('routes portal guidance separately: %s', (question) => {
    expect(buildSupportHowToContext(question)?.intent).toBe('SPARE_PARTS_PORTAL_HELP');
  });

  it.each([
    'Hvor er min reservedelsordre?',
    'What is the delivery status of my spare-parts order?',
    'Wie ist der Lieferstatus meiner Ersatzteilbestellung?',
  ])('routes delivery guidance separately: %s', (question) => {
    expect(buildSupportHowToContext(question)?.intent).toBe('SPARE_PARTS_DELIVERY');
  });

  it.each([
    ['How do I order spare parts?', 'SPARE_PARTS_ORDERING'],
    ['Wie verwende ich das Ersatzteilportal?', 'SPARE_PARTS_PORTAL_HELP'],
    ['Come posso ordinare ricambi?', 'SPARE_PARTS_ORDERING'],
    ['Hogyan rendelhetek alkatrészeket?', 'SPARE_PARTS_ORDERING'],
    ['Hur använder jag reservdelsportalen?', 'SPARE_PARTS_PORTAL_HELP'],
    ['Comment utiliser le portail des pièces détachées?', 'SPARE_PARTS_PORTAL_HELP'],
    ['Jak zamówić części zamienne?', 'SPARE_PARTS_ORDERING'],
    ['Jak objednat náhradní díly?', 'SPARE_PARTS_ORDERING'],
  ])('supports portal-language routing: %s', (question, intent) => {
    expect(buildSupportHowToContext(question)?.intent).toBe(intent);
  });

  it.each([
    'Hvilke reservedele passer til min maskine?',
    'Jeg vil gerne have et tilbud på en RC-1000s',
    'Hvad koster en RC-1000s, og er den på lager?',
    'Hvor finder jeg CRM?',
  ])('does not overroute unrelated questions: %s', (question) => {
    expect(isSupportHowToQuestion(question)).toBe(false);
    expect(buildSupportHowToContext(question)).toBeNull();
  });
});
