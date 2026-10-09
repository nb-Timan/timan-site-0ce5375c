const CYRILLIC_CONFUSABLES: Record<string, string> = {
  'а': 'a',
  'е': 'e',
  'і': 'i',
  'ј': 'j',
  'о': 'o',
  'р': 'p',
  'с': 'c',
  'ѕ': 's',
  'х': 'x',
  'у': 'y',
};

function normalizeQuestion(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0430\u0435\u0456\u0458\u043e\u0440\u0441\u0455\u0445\u0443]/g, (character) => CYRILLIC_CONFUSABLES[character] || character)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeSupportAssertionText(value: string): string {
  return normalizeQuestion(value);
}

export function isPromptInjectionAttempt(question: string): boolean {
  const normalized = normalizeQuestion(question);
  const overridesPolicy = /\b(?:ignore|ignorer|ignorez|ignoriere|ignora|ignoruj|zignoruj|ignorera)\b.*\b(?:instruction|instructions|instrukcje|rules|rule|regler|pravidla|policy|permissions|role|rolle)\b/.test(normalized);
  const requestsProtectedData = /\b(?:reveal|show|display|ujawnij|zobraz|zeige|mostra|afficher|visa|vis)\b.*\b(?:secret|secrets|hidden|restricted|source|sources|tajne|tajny|zrodla|zdroje|geheim|segreti|titkos|hemlig|system prompt)\b/.test(normalized);
  return overridesPolicy && requestsProtectedData;
}

export function supportQuestionGuidance(question: string): string {
  const normalized = normalizeQuestion(question);
  const asksForWidth = /\b(?:width|bred|bredde|breite|larghezza|szelesseg|bredd|largeur|szerokosc|sirka)\b/.test(normalized);
  const asksForWorkingWidth = /\b(?:cutting|working|klippe|snit|arbejds|schnitt|taglio|vagas|klipp|coupe|ciecia|zaber)\b/.test(normalized);
  return asksForWidth && !asksForWorkingWidth
    ? 'The question asks for the machine overall/base width. Do not substitute cutting or working width.'
    : '';
}
