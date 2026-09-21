import type { PortalUiLanguage } from '@/lib/portalLanguages';

export const NEXT_ACTIVITY_DEMO_REQUESTED = 'Customer requests a demonstration' as const;
export const NEXT_ACTIVITY_DEMO_REQUESTED_LEGACY = 'Customer wants a demonstration' as const;
export const NEXT_ACTIVITY_DEMO_AGREED = 'Demo agreed' as const;

export type CrmDemoStage = 'requested' | 'agreed' | 'held';

const STAGE_LABELS: Record<CrmDemoStage, Record<PortalUiLanguage, string>> = {
  requested: {
    da: 'Ønsker demo', en: 'Demo requested', de: 'Demo gewünscht', it: 'Demo richiesta',
    hu: 'Demóigény', sv: 'Demo önskas', fr: 'Démo demandée', pl: 'Prośba o demo', cs: 'Požadována ukázka',
  },
  agreed: {
    da: 'Demo aftalt', en: 'Demo agreed', de: 'Demo vereinbart', it: 'Demo concordata',
    hu: 'Demó egyeztetve', sv: 'Demo avtalad', fr: 'Démo convenue', pl: 'Demo uzgodnione', cs: 'Ukázka dohodnuta',
  },
  held: {
    da: 'Demo afholdt', en: 'Demo held', de: 'Demo durchgeführt', it: 'Demo effettuata',
    hu: 'Demó megtartva', sv: 'Demo genomförd', fr: 'Démo effectuée', pl: 'Demo przeprowadzone', cs: 'Ukázka proběhla',
  },
};

const ACTIVITY_LABELS: Record<'requested' | 'agreed', Record<PortalUiLanguage, string>> = {
  requested: {
    da: 'Kunden ønsker demo', en: 'Customer requests a demonstration', de: 'Kunde wünscht eine Vorführung',
    it: 'Il cliente richiede una dimostrazione', hu: 'Az ügyfél bemutatót kér', sv: 'Kunden önskar en demonstration',
    fr: 'Le client demande une démonstration', pl: 'Klient prosi o demonstrację', cs: 'Zákazník žádá ukázku',
  },
  agreed: {
    da: 'Demo aftalt', en: 'Demo agreed', de: 'Demo vereinbart', it: 'Demo concordata',
    hu: 'Demó egyeztetve', sv: 'Demo avtalad', fr: 'Démo convenue', pl: 'Demo uzgodnione', cs: 'Ukázka dohodnuta',
  },
};

export function crmDemoStageLabel(stage: CrmDemoStage, language: PortalUiLanguage): string {
  return STAGE_LABELS[stage][language];
}

export function crmNextActivityLabel(activity: string, language: PortalUiLanguage): string {
  if (activity === NEXT_ACTIVITY_DEMO_REQUESTED || activity === NEXT_ACTIVITY_DEMO_REQUESTED_LEGACY) {
    return ACTIVITY_LABELS.requested[language];
  }
  if (activity === NEXT_ACTIVITY_DEMO_AGREED) return ACTIVITY_LABELS.agreed[language];
  return activity;
}
