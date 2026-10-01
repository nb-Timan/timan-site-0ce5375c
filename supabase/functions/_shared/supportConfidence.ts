import { isPromptInjectionAttempt } from './supportQuestionPolicy.ts';

export type SupportConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_GROUNDED_ANSWER';
export type SupportOutcome =
  | 'ANSWERED'
  | 'CAUTIOUS_ANSWER'
  | 'CLARIFICATION_REQUIRED'
  | 'SOURCE_CONFLICT'
  | 'NO_RELEVANT_KNOWLEDGE'
  | 'STALE_KNOWLEDGE'
  | 'PROVIDER_FAILURE'
  | 'RETRIEVAL_FAILURE'
  | 'ACCESS_RESTRICTED'
  | 'SERVICE_DISABLED';

export interface SupportConfidenceConfig {
  confidence_high_threshold: number;
  confidence_medium_threshold: number;
  confidence_min_top_similarity: number;
  confidence_min_citation_coverage: number;
  confidence_conflict_score_tolerance: number;
  confidence_require_machine_for_ambiguous: boolean;
}

export interface ConfidenceCandidate {
  knowledge_item_id: string;
  semantic_similarity: number;
  keyword_score: number;
  fused_score: number;
  content: string;
  machine_ids?: string[] | null;
  product_ids?: string[] | null;
  stale_states?: string[] | null;
  review_overdue?: boolean;
}

export interface ConfidenceEvaluation {
  level: SupportConfidenceLevel;
  score: number;
  reason: string;
  outcome: SupportOutcome;
  clarificationRequested: boolean;
  sourceConflict: boolean;
  citationCoverage: number | null;
}

const CONTEXT_REQUIRED_PATTERNS = [
  /\b(oil|engine oil|hydraulic oil|lubricant)\b/i,
  /\b(olie|motorolie|hydraulikolie|smøremiddel)\b/i,
  /\b(öl|motoröl|hydrauliköl|schmierstoff)\b/i,
  /\b(olio|lubrificante)\b/i,
  /\b(olaj|kenőanyag)\b/i,
  /\b(olja|smörjmedel)\b/i,
  /\b(huile|lubrifiant)\b/i,
  /\b(olej|smar)\b/i,
  /\b(mazivo)\b/i,
];

const FACT_PATTERN = /(-?\d+(?:[.,]\d+)?)\s*(bar|psi|nm|kw|hp|l|ml|kg|g|mm|cm|m|°c|c|v|a|hz|%|hours?|timer|stunden|heures|godzin|hodin)\b/gi;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

interface NumericFact {
  value: number;
  context: Set<string>;
}

function factContext(sentence: string): Set<string> {
  const normalized = sentence
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(FACT_PATTERN, ' ')
    .toLowerCase();
  return new Set(normalized.match(/[a-z0-9]+/g) || []);
}

function contextSimilarity(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((token) => right.has(token)).length;
  return shared / new Set([...left, ...right]).size;
}

function facts(content: string): Map<string, NumericFact[]> {
  const result = new Map<string, NumericFact[]>();
  for (const sentence of content.split(/(?<=[.!?])\s+|\n+/)) {
    for (const match of sentence.matchAll(FACT_PATTERN)) {
      const value = Number(match[1].replace(',', '.'));
      const unit = match[2].toLowerCase();
      if (!Number.isFinite(value)) continue;
      const values = result.get(unit) || [];
      values.push({ value, context: factContext(sentence) });
      result.set(unit, values);
    }
  }
  return result;
}

export function detectSourceConflict(candidates: ConfidenceCandidate[], tolerance: number): boolean {
  if (candidates.length < 2) return false;
  const top = candidates[0];
  for (const candidate of candidates.slice(1, 4)) {
    if (candidate.knowledge_item_id === top.knowledge_item_id) continue;
    if (Math.abs(Number(top.fused_score || 0) - Number(candidate.fused_score || 0)) > tolerance) continue;
    const left = facts(top.content);
    const right = facts(candidate.content);
    for (const [unit, leftValues] of left) {
      const rightValues = right.get(unit);
      if (!rightValues) continue;
      for (const leftFact of leftValues) {
        for (const rightFact of rightValues) {
          if (contextSimilarity(leftFact.context, rightFact.context) < 0.75) continue;
          if (Math.abs(leftFact.value - rightFact.value) > Math.max(0.01, Math.abs(leftFact.value) * 0.005)) return true;
        }
      }
    }
  }
  return false;
}

export function requiresMachineClarification(question: string, machineId?: string | null, productId?: string | null): boolean {
  if (machineId || productId) return false;
  return CONTEXT_REQUIRED_PATTERNS.some((pattern) => pattern.test(question));
}

export function evaluateSupportConfidence(input: {
  question: string;
  candidates: ConfidenceCandidate[];
  config: SupportConfidenceConfig;
  machineId?: string | null;
  productId?: string | null;
  citationCount?: number;
  staleBlockCount?: number;
  unresolvedConflict?: boolean;
}): ConfidenceEvaluation {
  const { candidates, config } = input;
  if (isPromptInjectionAttempt(input.question)) {
    return {
      level: 'NO_GROUNDED_ANSWER', score: 0,
      reason: 'PROMPT_INJECTION_BLOCKED', outcome: 'NO_RELEVANT_KNOWLEDGE',
      clarificationRequested: false, sourceConflict: false, citationCoverage: 0,
    };
  }
  if (!candidates.length) {
    const stale = Number(input.staleBlockCount || 0) > 0;
    return {
      level: 'NO_GROUNDED_ANSWER', score: 0,
      reason: stale ? 'STALE_KNOWLEDGE' : 'NO_RELEVANT_KNOWLEDGE',
      outcome: stale ? 'STALE_KNOWLEDGE' : 'NO_RELEVANT_KNOWLEDGE',
      clarificationRequested: false, sourceConflict: false, citationCoverage: 0,
    };
  }

  if (config.confidence_require_machine_for_ambiguous
      && requiresMachineClarification(input.question, input.machineId, input.productId)) {
    return {
      level: 'LOW', score: 0.2, reason: 'MISSING_MACHINE_CONTEXT',
      outcome: 'CLARIFICATION_REQUIRED', clarificationRequested: true,
      sourceConflict: false, citationCoverage: null,
    };
  }

  const conflict = input.unresolvedConflict === true
    || detectSourceConflict(candidates, Number(config.confidence_conflict_score_tolerance));
  if (conflict) {
    return {
      level: 'LOW', score: 0.25, reason: 'MATERIAL_SOURCE_CONFLICT',
      outcome: 'SOURCE_CONFLICT', clarificationRequested: false,
      sourceConflict: true, citationCoverage: null,
    };
  }

  const topSimilarity = clamp(Number(candidates[0]?.semantic_similarity || 0));
  const semanticEvidence = clamp((topSimilarity - 0.15) / 0.25);
  const keywordEvidence = clamp(Math.max(...candidates.map((candidate) => Number(candidate.keyword_score || 0))) * 5);
  const citationEvidence = Number(input.citationCount || 0) > 0 ? 0.85 : 0;
  const retrievalStrength = Math.max(semanticEvidence, keywordEvidence, citationEvidence);
  const chunkEvidence = clamp(candidates.length / 4);
  const uniqueItems = new Set(candidates.map((candidate) => candidate.knowledge_item_id)).size;
  const corroboration = candidates.length > 1 ? clamp(uniqueItems / 2) : 0.45;
  const contextIds = new Set(candidates.flatMap((candidate) => candidate.machine_ids || []));
  const contextMatch = input.machineId ? (contextIds.has(input.machineId) ? 1 : 0) : 0.7;
  const freshness = candidates.some((candidate) => candidate.review_overdue) ? 0.25 : 1;
  const citationCoverage = input.citationCount === undefined
    ? null
    : clamp(input.citationCount);

  let score = retrievalStrength * 0.60
    + keywordEvidence * 0.10
    + chunkEvidence * 0.10
    + corroboration * 0.08
    + contextMatch * 0.07
    + freshness * 0.05;
  if (citationCoverage !== null) score = score * 0.82 + citationCoverage * 0.18;
  score = Math.round(clamp(score) * 10_000) / 10_000;

  if (retrievalStrength < Number(config.confidence_min_top_similarity)) {
    return {
      level: 'LOW', score, reason: 'WEAK_RETRIEVAL', outcome: 'CLARIFICATION_REQUIRED',
      clarificationRequested: true, sourceConflict: false, citationCoverage,
    };
  }
  if (citationCoverage !== null && citationCoverage < Number(config.confidence_min_citation_coverage)) {
    return {
      level: 'LOW', score, reason: 'INSUFFICIENT_CITATION_COVERAGE', outcome: 'NO_RELEVANT_KNOWLEDGE',
      clarificationRequested: false, sourceConflict: false, citationCoverage,
    };
  }
  if (score >= Number(config.confidence_high_threshold)) {
    return {
      level: 'HIGH', score, reason: 'STRONG_GROUNDED_EVIDENCE', outcome: 'ANSWERED',
      clarificationRequested: false, sourceConflict: false, citationCoverage,
    };
  }
  if (score >= Number(config.confidence_medium_threshold)) {
    return {
      level: 'MEDIUM', score, reason: candidates.some((candidate) => candidate.review_overdue)
        ? 'REVIEW_OVERDUE' : 'MODERATE_GROUNDED_EVIDENCE',
      outcome: 'CAUTIOUS_ANSWER', clarificationRequested: false,
      sourceConflict: false, citationCoverage,
    };
  }
  return {
    level: 'LOW', score, reason: 'LOW_COMPOSITE_EVIDENCE', outcome: 'CLARIFICATION_REQUIRED',
    clarificationRequested: true, sourceConflict: false, citationCoverage,
  };
}

type FallbackKind =
  | 'NO_RELEVANT_KNOWLEDGE'
  | 'LOW_CONFIDENCE'
  | 'AMBIGUOUS_QUESTION'
  | 'SOURCE_CONFLICT'
  | 'STALE_KNOWLEDGE'
  | 'PROVIDER_FAILURE'
  | 'RETRIEVAL_FAILURE'
  | 'ACCESS_RESTRICTED'
  | 'SERVICE_DISABLED';

const FALLBACKS: Record<string, Record<FallbackKind, string>> = {
  da: {
    NO_RELEVANT_KNOWLEDGE: 'Jeg kan ikke finde et sikkert svar i den godkendte viden. Prøv at præcisere spørgsmålet eller kontakt Timan Support.',
    LOW_CONFIDENCE: 'Jeg har ikke tilstrækkeligt sikre kilder til at svare præcist. Kan du tilføje maskine, model eller produkt?',
    AMBIGUOUS_QUESTION: 'Hvilken Timan-maskine eller model drejer spørgsmålet sig om?',
    SOURCE_CONFLICT: 'De godkendte kilder indeholder modstridende oplysninger. Jeg vil ikke gætte; kontakt Timan Support, så oplysningerne kan afklares.',
    STALE_KNOWLEDGE: 'Den relevante viden afventer opdatering eller genindeksering. Kontakt Timan Support for et aktuelt svar.',
    PROVIDER_FAILURE: 'Timan Support kunne ikke generere et svar lige nu. Prøv igen senere.',
    RETRIEVAL_FAILURE: 'Timan Support kunne ikke søge i den godkendte viden lige nu. Prøv igen senere.',
    ACCESS_RESTRICTED: 'Jeg kan ikke finde et tilgængeligt svar til denne forespørgsel.',
    SERVICE_DISABLED: 'Timan Support er midlertidigt utilgængelig. Prøv igen senere.',
  },
  en: {
    NO_RELEVANT_KNOWLEDGE: 'I cannot find a safe answer in the approved knowledge. Please clarify the question or contact Timan Support.',
    LOW_CONFIDENCE: 'I do not have sufficiently reliable sources for a precise answer. Can you add the machine, model, or product?',
    AMBIGUOUS_QUESTION: 'Which Timan machine or model is your question about?',
    SOURCE_CONFLICT: 'The approved sources contain conflicting information. I will not guess; please contact Timan Support so it can be clarified.',
    STALE_KNOWLEDGE: 'The relevant knowledge is awaiting review or re-indexing. Please contact Timan Support for a current answer.',
    PROVIDER_FAILURE: 'Timan Support could not generate an answer right now. Please try again later.',
    RETRIEVAL_FAILURE: 'Timan Support could not search the approved knowledge right now. Please try again later.',
    ACCESS_RESTRICTED: 'I cannot find an available answer for this request.',
    SERVICE_DISABLED: 'Timan Support is temporarily unavailable. Please try again later.',
  },
  de: {
    NO_RELEVANT_KNOWLEDGE: 'Ich finde keine sichere Antwort in den freigegebenen Wissensquellen. Bitte präzisieren Sie die Frage oder wenden Sie sich an den Timan Support.',
    LOW_CONFIDENCE: 'Für eine genaue Antwort fehlen ausreichend verlässliche Quellen. Können Sie Maschine, Modell oder Produkt angeben?',
    AMBIGUOUS_QUESTION: 'Auf welche Timan-Maschine oder welches Modell bezieht sich Ihre Frage?',
    SOURCE_CONFLICT: 'Die freigegebenen Quellen enthalten widersprüchliche Angaben. Ich werde nicht raten; bitte wenden Sie sich zur Klärung an den Timan Support.',
    STALE_KNOWLEDGE: 'Das relevante Wissen wartet auf Prüfung oder Neuindizierung. Bitte wenden Sie sich für eine aktuelle Antwort an den Timan Support.',
    PROVIDER_FAILURE: 'Timan Support konnte derzeit keine Antwort erstellen. Bitte versuchen Sie es später erneut.',
    RETRIEVAL_FAILURE: 'Timan Support konnte die freigegebenen Wissensquellen derzeit nicht durchsuchen. Bitte versuchen Sie es später erneut.',
    ACCESS_RESTRICTED: 'Ich finde keine für diese Anfrage verfügbare Antwort.',
    SERVICE_DISABLED: 'Timan Support ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.',
  },
  it: {
    NO_RELEVANT_KNOWLEDGE: 'Non trovo una risposta sicura nelle fonti approvate. Precisa la domanda o contatta Timan Support.',
    LOW_CONFIDENCE: 'Non dispongo di fonti abbastanza affidabili per una risposta precisa. Puoi indicare macchina, modello o prodotto?',
    AMBIGUOUS_QUESTION: 'A quale macchina o modello Timan si riferisce la domanda?',
    SOURCE_CONFLICT: 'Le fonti approvate contengono informazioni contrastanti. Non farò supposizioni; contatta Timan Support per chiarire.',
    STALE_KNOWLEDGE: 'Le informazioni pertinenti sono in attesa di revisione o reindicizzazione. Contatta Timan Support per una risposta aggiornata.',
    PROVIDER_FAILURE: 'Timan Support non può generare una risposta in questo momento. Riprova più tardi.',
    RETRIEVAL_FAILURE: 'Timan Support non può cercare nelle fonti approvate in questo momento. Riprova più tardi.',
    ACCESS_RESTRICTED: 'Non trovo una risposta disponibile per questa richiesta.',
    SERVICE_DISABLED: 'Timan Support è temporaneamente non disponibile. Riprova più tardi.',
  },
  hu: {
    NO_RELEVANT_KNOWLEDGE: 'Nem találok biztonságos választ a jóváhagyott tudásban. Pontosítsa a kérdést, vagy lépjen kapcsolatba a Timan Supporttal.',
    LOW_CONFIDENCE: 'Nincs elég megbízható forrásom a pontos válaszhoz. Megadná a gépet, modellt vagy terméket?',
    AMBIGUOUS_QUESTION: 'Melyik Timan gépre vagy modellre vonatkozik a kérdés?',
    SOURCE_CONFLICT: 'A jóváhagyott források ellentmondó információkat tartalmaznak. Nem találgatok; kérjük, egyeztessen a Timan Supporttal.',
    STALE_KNOWLEDGE: 'A vonatkozó tudás felülvizsgálatra vagy újraindexelésre vár. Aktuális válaszért forduljon a Timan Supporthoz.',
    PROVIDER_FAILURE: 'A Timan Support most nem tud választ létrehozni. Próbálja újra később.',
    RETRIEVAL_FAILURE: 'A Timan Support most nem tud keresni a jóváhagyott tudásban. Próbálja újra később.',
    ACCESS_RESTRICTED: 'Ehhez a kéréshez nem találok elérhető választ.',
    SERVICE_DISABLED: 'A Timan Support átmenetileg nem érhető el. Próbálja újra később.',
  },
  sv: {
    NO_RELEVANT_KNOWLEDGE: 'Jag hittar inget säkert svar i den godkända kunskapen. Förtydliga frågan eller kontakta Timan Support.',
    LOW_CONFIDENCE: 'Jag saknar tillräckligt tillförlitliga källor för ett exakt svar. Kan du ange maskin, modell eller produkt?',
    AMBIGUOUS_QUESTION: 'Vilken Timan-maskin eller modell gäller frågan?',
    SOURCE_CONFLICT: 'De godkända källorna innehåller motstridiga uppgifter. Jag gissar inte; kontakta Timan Support för klargörande.',
    STALE_KNOWLEDGE: 'Den relevanta kunskapen väntar på granskning eller omindexering. Kontakta Timan Support för ett aktuellt svar.',
    PROVIDER_FAILURE: 'Timan Support kunde inte skapa ett svar just nu. Försök igen senare.',
    RETRIEVAL_FAILURE: 'Timan Support kunde inte söka i den godkända kunskapen just nu. Försök igen senare.',
    ACCESS_RESTRICTED: 'Jag hittar inget tillgängligt svar för denna förfrågan.',
    SERVICE_DISABLED: 'Timan Support är tillfälligt otillgänglig. Försök igen senare.',
  },
  fr: {
    NO_RELEVANT_KNOWLEDGE: 'Je ne trouve pas de réponse fiable dans les connaissances approuvées. Précisez la question ou contactez Timan Support.',
    LOW_CONFIDENCE: 'Je ne dispose pas de sources assez fiables pour répondre précisément. Pouvez-vous indiquer la machine, le modèle ou le produit ?',
    AMBIGUOUS_QUESTION: 'De quelle machine ou de quel modèle Timan s’agit-il ?',
    SOURCE_CONFLICT: 'Les sources approuvées contiennent des informations contradictoires. Je ne vais pas deviner ; contactez Timan Support pour clarification.',
    STALE_KNOWLEDGE: 'Les connaissances pertinentes attendent une révision ou une réindexation. Contactez Timan Support pour une réponse actuelle.',
    PROVIDER_FAILURE: 'Timan Support ne peut pas générer de réponse pour le moment. Réessayez plus tard.',
    RETRIEVAL_FAILURE: 'Timan Support ne peut pas rechercher les connaissances approuvées pour le moment. Réessayez plus tard.',
    ACCESS_RESTRICTED: 'Je ne trouve aucune réponse accessible pour cette demande.',
    SERVICE_DISABLED: 'Timan Support est temporairement indisponible. Réessayez plus tard.',
  },
  pl: {
    NO_RELEVANT_KNOWLEDGE: 'Nie znajduję bezpiecznej odpowiedzi w zatwierdzonej bazie wiedzy. Doprecyzuj pytanie lub skontaktuj się z Timan Support.',
    LOW_CONFIDENCE: 'Brakuje wystarczająco wiarygodnych źródeł do precyzyjnej odpowiedzi. Podaj maszynę, model lub produkt.',
    AMBIGUOUS_QUESTION: 'Której maszyny lub modelu Timan dotyczy pytanie?',
    SOURCE_CONFLICT: 'Zatwierdzone źródła zawierają sprzeczne informacje. Nie będę zgadywać; skontaktuj się z Timan Support w celu wyjaśnienia.',
    STALE_KNOWLEDGE: 'Odpowiednia wiedza oczekuje na przegląd lub ponowne indeksowanie. Skontaktuj się z Timan Support po aktualną odpowiedź.',
    PROVIDER_FAILURE: 'Timan Support nie może teraz wygenerować odpowiedzi. Spróbuj ponownie później.',
    RETRIEVAL_FAILURE: 'Timan Support nie może teraz przeszukać zatwierdzonej wiedzy. Spróbuj ponownie później.',
    ACCESS_RESTRICTED: 'Nie znajduję dostępnej odpowiedzi dla tego zapytania.',
    SERVICE_DISABLED: 'Timan Support jest tymczasowo niedostępny. Spróbuj ponownie później.',
  },
  cs: {
    NO_RELEVANT_KNOWLEDGE: 'V dostupných schválených znalostech nenacházím bezpečnou odpověď. Upřesněte dotaz nebo kontaktujte Timan Support.',
    LOW_CONFIDENCE: 'Nemám dostatečně spolehlivé zdroje pro přesnou odpověď. Můžete uvést stroj, model nebo produkt?',
    AMBIGUOUS_QUESTION: 'Kterého stroje nebo modelu Timan se otázka týká?',
    SOURCE_CONFLICT: 'Schválené zdroje obsahují rozporné informace. Nebudu hádat; obraťte se na Timan Support pro upřesnění.',
    STALE_KNOWLEDGE: 'Příslušné znalosti čekají na kontrolu nebo přeindexování. Pro aktuální odpověď kontaktujte Timan Support.',
    PROVIDER_FAILURE: 'Timan Support nyní nemůže vytvořit odpověď. Zkuste to později.',
    RETRIEVAL_FAILURE: 'Timan Support nyní nemůže prohledat schválené znalosti. Zkuste to později.',
    ACCESS_RESTRICTED: 'Pro tento dotaz nenacházím dostupnou odpověď.',
    SERVICE_DISABLED: 'Timan Support je dočasně nedostupný. Zkuste to později.',
  },
};

export function supportFallback(language: string, kind: FallbackKind): string {
  return (FALLBACKS[language] || FALLBACKS.en)[kind];
}
