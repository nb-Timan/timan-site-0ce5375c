import type { PortalUiLanguage } from '@/lib/portalLanguages';

export const CRM_LOST_REASON_CODES = [
  'PRICE',
  'DELIVERY_TIME',
  'MACHINE_TOO_SMALL',
  'MACHINE_TOO_LARGE',
  'USED_MACHINE_INSTEAD',
  'BUDGET_OR_PROJECT_CANCELLED',
  'NOT_RELEVANT',
] as const;

export type CrmLostReasonCode = typeof CRM_LOST_REASON_CODES[number];
export type CrmLostReasonAnalyticsCategory = 'price' | 'lead' | 'comp' | 'not_relevant' | 'other';

const LOST_REASON_LABELS: Record<CrmLostReasonCode, Record<PortalUiLanguage, string>> = {
  PRICE: {
    da: 'Pris', en: 'Price', de: 'Preis', it: 'Prezzo', hu: 'Ár',
    sv: 'Pris', fr: 'Prix', pl: 'Cena', cs: 'Cena',
  },
  DELIVERY_TIME: {
    da: 'Leveringstid', en: 'Delivery time', de: 'Lieferzeit', it: 'Tempi di consegna', hu: 'Szállítási idő',
    sv: 'Leveranstid', fr: 'Délai de livraison', pl: 'Czas dostawy', cs: 'Dodací lhůta',
  },
  MACHINE_TOO_SMALL: {
    da: 'Maskinen var for lille', en: 'Machine was too small', de: 'Die Maschine war zu klein', it: 'La macchina era troppo piccola', hu: 'A gép túl kicsi volt',
    sv: 'Maskinen var för liten', fr: 'La machine était trop petite', pl: 'Maszyna była za mała', cs: 'Stroj byl příliš malý',
  },
  MACHINE_TOO_LARGE: {
    da: 'Maskinen var for stor', en: 'Machine was too large', de: 'Die Maschine war zu groß', it: 'La macchina era troppo grande', hu: 'A gép túl nagy volt',
    sv: 'Maskinen var för stor', fr: 'La machine était trop grande', pl: 'Maszyna była za duża', cs: 'Stroj byl příliš velký',
  },
  USED_MACHINE_INSTEAD: {
    da: 'Kunden valgte en brugt maskine i stedet', en: 'Customer chose a used machine instead', de: 'Der Kunde entschied sich stattdessen für eine Gebrauchtmaschine', it: 'Il cliente ha scelto invece una macchina usata', hu: 'Az ügyfél inkább használt gépet választott',
    sv: 'Kunden valde en begagnad maskin i stället', fr: 'Le client a choisi une machine d’occasion à la place', pl: 'Klient wybrał zamiast tego używaną maszynę', cs: 'Zákazník místo toho zvolil použitý stroj',
  },
  BUDGET_OR_PROJECT_CANCELLED: {
    da: 'Budgettet blev ændret eller projektet blev aflyst', en: 'Budget changed or project was cancelled', de: 'Das Budget wurde geändert oder das Projekt abgesagt', it: 'Il budget è cambiato o il progetto è stato annullato', hu: 'A költségvetés megváltozott, vagy a projektet törölték',
    sv: 'Budgeten ändrades eller projektet avbröts', fr: 'Le budget a changé ou le projet a été annulé', pl: 'Budżet się zmienił lub projekt został anulowany', cs: 'Rozpočet se změnil nebo byl projekt zrušen',
  },
  NOT_RELEVANT: {
    da: 'Ikke relevant', en: 'Not relevant', de: 'Nicht relevant', it: 'Non pertinente', hu: 'Nem releváns',
    sv: 'Inte relevant', fr: 'Non pertinent', pl: 'Nie dotyczy', cs: 'Není relevantní',
  },
};

const LEGACY_ENGLISH_VALUES: Record<string, CrmLostReasonCode> = {
  'price': 'PRICE',
  'delivery time': 'DELIVERY_TIME',
  'machine too small': 'MACHINE_TOO_SMALL',
  'machine was too small': 'MACHINE_TOO_SMALL',
  'machine too large': 'MACHINE_TOO_LARGE',
  'machine was too large': 'MACHINE_TOO_LARGE',
  'customer found a used machine instead': 'USED_MACHINE_INSTEAD',
  'customer chose a used machine instead': 'USED_MACHINE_INSTEAD',
  'budget changed or project was cancelled': 'BUDGET_OR_PROJECT_CANCELLED',
  'not relevant': 'NOT_RELEVANT',
};

const normalizeLookupKey = (value: string): string => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

const LOST_REASON_LOOKUP = new Map<string, CrmLostReasonCode>();
for (const code of CRM_LOST_REASON_CODES) {
  LOST_REASON_LOOKUP.set(normalizeLookupKey(code), code);
  for (const label of Object.values(LOST_REASON_LABELS[code])) {
    LOST_REASON_LOOKUP.set(normalizeLookupKey(label), code);
  }
}
for (const [legacyValue, code] of Object.entries(LEGACY_ENGLISH_VALUES)) {
  LOST_REASON_LOOKUP.set(normalizeLookupKey(legacyValue), code);
}

export function normalizeCrmLostReason(value: string | null | undefined): CrmLostReasonCode | null {
  if (!value?.trim()) return null;
  return LOST_REASON_LOOKUP.get(normalizeLookupKey(value)) ?? null;
}

export function serializeCrmLostReason(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return normalizeCrmLostReason(value) ?? value.trim();
}

export function crmLostReasonLabel(value: string, language: PortalUiLanguage): string {
  const code = normalizeCrmLostReason(value);
  return code ? LOST_REASON_LABELS[code][language] : value;
}

export function classifyCrmLostReason(value: string | null | undefined): CrmLostReasonAnalyticsCategory {
  const code = normalizeCrmLostReason(value);
  if (code === 'PRICE') return 'price';
  if (code === 'DELIVERY_TIME') return 'lead';
  if (code === 'NOT_RELEVANT') return 'not_relevant';

  const legacyValue = String(value ?? '').toLocaleLowerCase('en');
  if (/konkur|competitor|comp/.test(legacyValue)) return 'comp';
  return 'other';
}
