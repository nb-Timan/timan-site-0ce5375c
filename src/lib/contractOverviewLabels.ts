import { getContractWorkflowStatusLabel, type ContractWorkflowStatus } from '@/lib/contractFlow';
import { pickT } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

// Overview wording preserves the existing workflow grouping, not stored status values.
const COPY = {
  prepared: { da: 'Klargjort / klar til gennemgang', en: 'Prepared / ready for review', de: 'Vorbereitet / bereit zur Prüfung', it: 'Preparato / pronto per la revisione', hu: 'Előkészítve / felülvizsgálatra kész', sv: 'Förberett / klart för granskning', fr: 'Préparé / prêt pour examen', pl: 'Przygotowane / gotowe do przeglądu', cs: 'Připraveno ke kontrole' },
  partnerReview: { da: 'Gennemgang / afventer partner', en: 'Review / awaiting partner', de: 'Prüfung / Rückmeldung des Partners ausstehend', it: 'Revisione / in attesa del partner', hu: 'Felülvizsgálat / partnerre vár', sv: 'Granskning / väntar på partner', fr: 'Examen / en attente du partenaire', pl: 'Przegląd / oczekuje na partnera', cs: 'Kontrola / čeká na partnera' },
  timanReview: { da: 'Modtaget / afventer Timan', en: 'Received / awaiting Timan', de: 'Eingegangen / Prüfung durch Timan ausstehend', it: 'Ricevuto / in attesa di Timan', hu: 'Beérkezett / Timanra vár', sv: 'Mottaget / väntar på Timan', fr: 'Reçu / en attente de Timan', pl: 'Otrzymane / oczekuje na Timan', cs: 'Přijato / čeká na Timan' },
  rejected: { da: 'Ikke godkendt / afvist', en: 'Not approved / rejected', de: 'Nicht genehmigt / abgelehnt', it: 'Non approvato / rifiutato', hu: 'Nem jóváhagyott / elutasított', sv: 'Inte godkänt / avvisat', fr: 'Non approuvé / refusé', pl: 'Niezatwierdzone / odrzucone', cs: 'Neschváleno / zamítnuto' },
  terminated: { da: 'Opsagt / ophørt', en: 'Terminated / ended', de: 'Gekündigt / beendet', it: 'Risolto / concluso', hu: 'Felmondott / megszűnt', sv: 'Uppsagt / avslutat', fr: 'Résilié / terminé', pl: 'Wypowiedziane / zakończone', cs: 'Vypovězeno / ukončeno' },
  start: { da: 'Start', en: 'Start', de: 'Beginnen', it: 'Inizia', hu: 'Indítás', sv: 'Starta', fr: 'Commencer', pl: 'Rozpocznij', cs: 'Začít' },
  continue: { da: 'Fortsæt', en: 'Continue', de: 'Fortsetzen', it: 'Continua', hu: 'Folytatás', sv: 'Fortsätt', fr: 'Continuer', pl: 'Kontynuuj', cs: 'Pokračovat' },
  open: { da: 'Åbn', en: 'Open', de: 'Öffnen', it: 'Apri', hu: 'Megnyitás', sv: 'Öppna', fr: 'Ouvrir', pl: 'Otwórz', cs: 'Otevřít' },
  review: { da: 'Gennemgå', en: 'Review', de: 'Prüfen', it: 'Esamina', hu: 'Áttekintés', sv: 'Granska', fr: 'Examiner', pl: 'Przejrzyj', cs: 'Zkontrolovat' },
} satisfies Record<string, Record<PortalUiLanguage, string>>;

export function getDealerContractOverviewStatusLabel(status: ContractWorkflowStatus, language = 'da') {
  if (status === 'guided_review') return pickT(COPY.prepared, language);
  if (status === 'ready_for_signature' || status === 'awaiting_signed_upload') return pickT(COPY.partnerReview, language);
  if (status === 'submitted_for_approval') return pickT(COPY.timanReview, language);
  if (status === 'changes_requested') return pickT(COPY.rejected, language);
  if (status === 'archived') return pickT(COPY.terminated, language);
  return getContractWorkflowStatusLabel(status, language);
}

export function getDealerContractOverviewActionLabel(status: ContractWorkflowStatus, language = 'da') {
  if (status === 'pending_decision') return pickT(COPY.start, language);
  if (status === 'draft' || status === 'guided_review') return pickT(COPY.continue, language);
  if (status === 'approved' || status === 'archived') return pickT(COPY.open, language);
  return pickT(COPY.review, language);
}
