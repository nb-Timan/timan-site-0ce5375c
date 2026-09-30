const SPARE_PARTS_PATTERN = /\b(reservedele?|reservedelsportal(?:en)?|spare parts?|parts portal|ersatzteile?|ersatzteilportal|ricambi|alkatrész(?:ek)?|reservdelar?|pièces détachées|części zamienne|náhradní díly)\b/i;
const HOW_TO_PATTERN = /\b(hvordan|hvad gør jeg|bestil(?:le|ler)?|får jeg|hjælp(?:e)? mig|how (?:do|can)|order|help me|wie|bestell(?:en|e)?|come|ordinare|hogyan|rendel(?:ni|ek)?|hur|beställ(?:a|er)?|comment|commander|jak|zamówić|objednat)\b/i;

export interface SupportHowToContext {
  domain: 'TIMAN_HOW_TO';
  source: 'approved_knowledge';
  topic: 'spare-parts-ordering';
}

export function isSupportHowToQuestion(question: string): boolean {
  return SPARE_PARTS_PATTERN.test(question) && HOW_TO_PATTERN.test(question);
}

export function buildSupportHowToContext(question: string): SupportHowToContext | null {
  if (!isSupportHowToQuestion(question)) return null;
  return {
    domain: 'TIMAN_HOW_TO',
    source: 'approved_knowledge',
    topic: 'spare-parts-ordering',
  };
}
