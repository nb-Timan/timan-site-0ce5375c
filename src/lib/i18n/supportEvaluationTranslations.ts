import type { PortalUiLanguage } from '@/lib/portalLanguages';

export interface SupportEvaluationCopy {
  evaluation: string; overview: string; suites: string; runs: string; failures: string; security: string;
  comparison: string; passRate: string; hardGates: string; grounding: string; citations: string;
  confidence: string; unsafeHigh: string; actions: string; latency: string; cost: string; regressions: string;
  noRuns: string; noFailures: string; noSecurityFailures: string; releasePass: string; releaseBlocked: string;
  runSmoke: string; runSecurity: string; runFull: string; refresh: string; cases: string; version: string;
  status: string; model: string; language: string; severity: string; assertion: string; review: string;
  current: string; candidate: string; baseline: string; costReview: string; roleReadiness: string;
  notReady: string; controlledRollout: string; loading: string; runStarted: string; runFailed: string;
  approveBaseline: string; baselineApproved: string; baselineFailed: string;
  promptVersion: string; knowledgeVersion: string; metricLabel: string; delta: string;
}

const en: SupportEvaluationCopy = {
  evaluation: 'Evaluation', overview: 'Overview', suites: 'Suites', runs: 'Runs', failures: 'Failures', security: 'Security',
  comparison: 'Model comparison', passRate: 'Pass rate', hardGates: 'Hard gates', grounding: 'Grounding', citations: 'Citation validity',
  confidence: 'Confidence accuracy', unsafeHigh: 'Unsafe HIGH', actions: 'Action parity', latency: 'P95 latency', cost: 'Evaluation cost', regressions: 'New regressions',
  noRuns: 'No evaluation runs yet.', noFailures: 'No failures in the selected run.', noSecurityFailures: 'No security failures in the selected run.',
  releasePass: 'RELEASE PASS', releaseBlocked: 'RELEASE BLOCKED', runSmoke: 'Run smoke', runSecurity: 'Run security', runFull: 'Run full', refresh: 'Refresh',
  cases: 'cases', version: 'Version', status: 'Status', model: 'Model', language: 'Language', severity: 'Severity', assertion: 'Assertion', review: 'Review',
  current: 'Current', candidate: 'Candidate', baseline: 'Approved baseline', costReview: 'Cost increase requires review', roleReadiness: 'External-role readiness',
  notReady: 'Not ready', controlledRollout: 'Ready for controlled rollout', loading: 'Loading evaluation data...', runStarted: 'Evaluation run started.', runFailed: 'Evaluation run failed.',
  approveBaseline: 'Approve baseline', baselineApproved: 'Evaluation baseline approved.', baselineFailed: 'Could not approve evaluation baseline.',
  promptVersion: 'Prompt', knowledgeVersion: 'Knowledge', metricLabel: 'Metric', delta: 'Delta',
};

const translations: Record<PortalUiLanguage, SupportEvaluationCopy> = {
  en,
  da: { ...en, overview: 'Overblik', suites: 'Suiter', runs: 'Kørsler', failures: 'Fejl', security: 'Sikkerhed', comparison: 'Modelsammenligning', passRate: 'Beståelsesrate', hardGates: 'Hårde gates', grounding: 'Kildegrundlag', citations: 'Gyldige citationer', confidence: 'Korrekt sikkerhed', unsafeHigh: 'Usikker HIGH', actions: 'Action-paritet', latency: 'P95 svartid', cost: 'Evalueringsomkostning', regressions: 'Nye regressioner', noRuns: 'Ingen evalueringskørsler endnu.', noFailures: 'Ingen fejl i den valgte kørsel.', noSecurityFailures: 'Ingen sikkerhedsfejl i den valgte kørsel.', runSmoke: 'Kør smoke', runSecurity: 'Kør sikkerhed', runFull: 'Kør fuld', refresh: 'Opdatér', cases: 'cases', version: 'Version', status: 'Status', model: 'Model', language: 'Sprog', severity: 'Alvorlighed', assertion: 'Kontrol', review: 'Gennemgang', current: 'Nuværende', candidate: 'Kandidat', baseline: 'Godkendt baseline', costReview: 'Omkostningsstigning kræver gennemgang', roleReadiness: 'Klarhed for eksterne roller', notReady: 'Ikke klar', controlledRollout: 'Klar til kontrolleret udrulning', loading: 'Henter evalueringsdata...', runStarted: 'Evalueringskørsel startet.', runFailed: 'Evalueringskørsel fejlede.', approveBaseline: 'Godkend baseline', baselineApproved: 'Evalueringsbaseline er godkendt.', baselineFailed: 'Evalueringsbaseline kunne ikke godkendes.', promptVersion: 'Prompt', knowledgeVersion: 'Viden', metricLabel: 'Måling', delta: 'Forskel' },
  de: { ...en, evaluation: 'Evaluierung', overview: 'Übersicht', suites: 'Testsuiten', runs: 'Läufe', failures: 'Fehler', security: 'Sicherheit', comparison: 'Modellvergleich', passRate: 'Erfolgsquote', hardGates: 'Harte Gates', grounding: 'Quellenbezug', citations: 'Zitationsgültigkeit', confidence: 'Konfidenzgenauigkeit', actions: 'Aktionsparität', latency: 'P95-Latenz', cost: 'Evaluierungskosten', regressions: 'Neue Regressionen', noRuns: 'Noch keine Evaluierungsläufe.', noFailures: 'Keine Fehler im gewählten Lauf.', noSecurityFailures: 'Keine Sicherheitsfehler im gewählten Lauf.', runSmoke: 'Smoke ausführen', runSecurity: 'Sicherheit ausführen', runFull: 'Vollständig ausführen', refresh: 'Aktualisieren', cases: 'Fälle', language: 'Sprache', severity: 'Schweregrad', assertion: 'Prüfung', review: 'Prüfung', current: 'Aktuell', candidate: 'Kandidat', baseline: 'Freigegebene Baseline', costReview: 'Kostenanstieg erfordert Prüfung', roleReadiness: 'Bereitschaft externer Rollen', notReady: 'Nicht bereit', controlledRollout: 'Bereit für kontrollierten Rollout', loading: 'Evaluierungsdaten werden geladen...', runStarted: 'Evaluierung gestartet.', runFailed: 'Evaluierung fehlgeschlagen.', approveBaseline: 'Baseline freigeben', baselineApproved: 'Evaluierungsbaseline wurde freigegeben.', baselineFailed: 'Evaluierungsbaseline konnte nicht freigegeben werden.', promptVersion: 'Prompt', knowledgeVersion: 'Wissen', metricLabel: 'Metrik', delta: 'Delta' },
  it: { ...en, evaluation: 'Valutazione', overview: 'Panoramica', suites: 'Suite', runs: 'Esecuzioni', failures: 'Errori', security: 'Sicurezza', comparison: 'Confronto modelli' },
  hu: { ...en, evaluation: 'Értékelés', overview: 'Áttekintés', suites: 'Tesztcsomagok', runs: 'Futtatások', failures: 'Hibák', security: 'Biztonság', comparison: 'Modell-összehasonlítás' },
  sv: { ...en, evaluation: 'Utvärdering', overview: 'Översikt', suites: 'Testsviter', runs: 'Körningar', failures: 'Fel', security: 'Säkerhet', comparison: 'Modelljämförelse' },
  fr: { ...en, evaluation: 'Évaluation', overview: 'Vue d’ensemble', suites: 'Suites', runs: 'Exécutions', failures: 'Échecs', security: 'Sécurité', comparison: 'Comparaison de modèles' },
  pl: { ...en, evaluation: 'Ewaluacja', overview: 'Przegląd', suites: 'Zestawy', runs: 'Uruchomienia', failures: 'Błędy', security: 'Bezpieczeństwo', comparison: 'Porównanie modeli' },
  cs: { ...en, evaluation: 'Vyhodnocení', overview: 'Přehled', suites: 'Sady', runs: 'Běhy', failures: 'Selhání', security: 'Zabezpečení', comparison: 'Porovnání modelů' },
};

export const getSupportEvaluationCopy = (language: PortalUiLanguage) => translations[language] || en;
