import type { PortalUiLanguage } from '@/lib/portalLanguages';

export const NEXT_ACTIVITY_DEMO_REQUESTED = 'Customer requests a demonstration' as const;
export const NEXT_ACTIVITY_DEMO_REQUESTED_LEGACY = 'Customer wants a demonstration' as const;
export const NEXT_ACTIVITY_DEMO_AGREED = 'Demonstration scheduled' as const;
export const NEXT_ACTIVITY_DEMO_AGREED_LEGACY = 'Demo agreed' as const;

export function normalizeDemoActivity(activity: string): string {
  if (activity === NEXT_ACTIVITY_DEMO_REQUESTED_LEGACY) return NEXT_ACTIVITY_DEMO_REQUESTED;
  if (activity === NEXT_ACTIVITY_DEMO_AGREED_LEGACY) return NEXT_ACTIVITY_DEMO_AGREED;
  return activity;
}

const MISSING_REGISTRATION: Record<PortalUiLanguage, string> = {
  da: 'Mangler demo-registrering', en: 'Demo registration missing', de: 'Demo-Registrierung fehlt',
  it: 'Registrazione demo mancante', hu: 'Hiányzó demóregisztráció', sv: 'Demoregistrering saknas',
  fr: 'Enregistrement de démo manquant', pl: 'Brak rejestracji demonstracji', cs: 'Chybí registrace ukázky',
};

const DATE_REQUIRED: Record<PortalUiLanguage, string> = {
  da: 'Vælg en demo-dato for at aftale demonstrationen.', en: 'Choose a demo date to schedule the demonstration.',
  de: 'Wählen Sie ein Datum, um die Vorführung zu vereinbaren.', it: 'Scegli una data per fissare la dimostrazione.',
  hu: 'A bemutató egyeztetéséhez válasszon dátumot.', sv: 'Välj ett datum för att boka demonstrationen.',
  fr: 'Choisissez une date pour planifier la démonstration.', pl: 'Wybierz datę, aby zaplanować demonstrację.',
  cs: 'Pro naplánování ukázky vyberte datum.',
};

export function crmDemoMissingLabel(language: PortalUiLanguage): string { return MISSING_REGISTRATION[language]; }
export function crmDemoDateRequiredLabel(language: PortalUiLanguage): string { return DATE_REQUIRED[language]; }

const REGISTRATION_TEXT: Record<'started' | 'dateChanged' | 'startError' | 'saveLeadFirst', Record<PortalUiLanguage, string>> = {
  started: {
    da: 'Demo-registrering påbegyndt', en: 'Demo registration started', de: 'Demo-Registrierung begonnen',
    it: 'Registrazione demo avviata', hu: 'Demóregisztráció elindítva', sv: 'Demoregistrering påbörjad',
    fr: 'Enregistrement de démo commencé', pl: 'Rozpoczęto rejestrację demonstracji', cs: 'Registrace ukázky zahájena',
  },
  dateChanged: {
    da: 'Demo-dato ændret', en: 'Demo date changed', de: 'Demo-Datum geändert', it: 'Data demo modificata',
    hu: 'Demódátum módosítva', sv: 'Demodatum ändrat', fr: 'Date de démo modifiée',
    pl: 'Zmieniono datę demonstracji', cs: 'Datum ukázky změněno',
  },
  startError: {
    da: 'Demo-registreringen kunne ikke åbnes.', en: 'Could not open demo registration.', de: 'Die Demo-Registrierung konnte nicht geöffnet werden.',
    it: 'Impossibile aprire la registrazione demo.', hu: 'A demóregisztráció nem nyitható meg.', sv: 'Demoregistreringen kunde inte öppnas.',
    fr: 'Impossible d’ouvrir l’enregistrement de démo.', pl: 'Nie można otworzyć rejestracji demonstracji.', cs: 'Registraci ukázky nelze otevřít.',
  },
  saveLeadFirst: {
    da: 'Gem leadet først, og aftal derefter en demo med dato.', en: 'Save the lead first, then schedule a dated demo.',
    de: 'Speichern Sie zuerst den Lead und vereinbaren Sie dann eine Demo mit Datum.', it: 'Salva prima il lead, poi fissa una demo con data.',
    hu: 'Először mentse az érdeklődőt, majd egyeztessen demódátumot.', sv: 'Spara leadet först och boka sedan en demo med datum.',
    fr: 'Enregistrez d’abord le prospect, puis planifiez une démo avec une date.', pl: 'Najpierw zapisz lead, a następnie zaplanuj demonstrację z datą.',
    cs: 'Nejprve uložte zájemce a poté naplánujte ukázku s datem.',
  },
};
export function crmDemoRegistrationText(key: keyof typeof REGISTRATION_TEXT, language: PortalUiLanguage): string {
  return REGISTRATION_TEXT[key][language];
}

export type CrmDemoStage = 'requested' | 'agreed' | 'held';

const STAGE_LABELS: Record<CrmDemoStage, Record<PortalUiLanguage, string>> = {
  requested: {
    da: 'Ønsker demo', en: 'Demo requested', de: 'Demo gewünscht', it: 'Demo richiesta',
    hu: 'Demóigény', sv: 'Demo önskas', fr: 'Démo demandée', pl: 'Prośba o demo', cs: 'Požadována ukázka',
  },
  agreed: {
    da: 'Demo aftalt', en: 'Demo scheduled', de: 'Demo vereinbart', it: 'Demo concordata',
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
    da: 'Demo aftalt', en: 'Demonstration scheduled', de: 'Demo vereinbart', it: 'Demo concordata',
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
  if (normalizeDemoActivity(activity) === NEXT_ACTIVITY_DEMO_AGREED) return ACTIVITY_LABELS.agreed[language];
  return activity;
}
