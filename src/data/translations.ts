// i18n preparation — all UI strings centralized here
// For v1, only Danish. Structure allows easy addition of more languages.

import { Language } from '@/types/configurator';

type TranslationKeys = {
  // Steps
  step1Title: string;
  step2Title: string;
  step3Title: string;
  step4Title: string;
  summaryTitle: string;
  // Document type
  quote: string;
  order: string;
  documentTypeLabel: string;
  // Machine selection
  selectMachines: string;
  quantity: string;
  sharedConfig: string;
  individualConfig: string;
  specs: string;
  moreInfo: string;
  basePrice: string;
  // Delivery
  deliveryDate: string;
  deliveryMethod: string;
  pickup: string;
  send: string;
  deliver: string;
  startupOption: string;
  deliveryInfo: string;
  // Accessories
  requiredChoice: string;
  optional: string;
  ralColorLabel: string;
  dependsOnLabel: string;
  // Customer
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  comment: string;
  // Summary
  subtotal: string;
  baseDiscount: string;
  quantityDiscount: string;
  deliveryDiscount: string;
  totalDiscount: string;
  finalPrice: string;
  exVat: string;
  downloadPdf: string;
  // Actions
  next: string;
  previous: string;
  addToQuote: string;
  unit: string;
  demoMachine: string;
  demoFee: string;
  looseToolPackaging: string;
};

const da: TranslationKeys = {
  step1Title: 'Maskinevalg',
  step2Title: 'Levering',
  step3Title: 'Tilbehør',
  step4Title: 'Kundeinfo',
  summaryTitle: 'Oversigt',
  quote: 'Tilbud',
  order: 'Ordre',
  documentTypeLabel: 'Dokumenttype',
  selectMachines: 'Vælg maskiner',
  quantity: 'Antal',
  sharedConfig: 'Ens konfiguration',
  individualConfig: 'Individuel konfiguration',
  specs: 'Specifikationer',
  moreInfo: 'Mere info',
  basePrice: 'Grundpris',
  deliveryDate: 'Leveringsdato',
  deliveryMethod: 'Leveringsmetode',
  pickup: 'Afhentning',
  send: 'Fragt',
  deliver: 'Levering med opstart',
  startupOption: 'Opstartsvalg',
  deliveryInfo: 'Leveringsinformation',
  requiredChoice: 'Påkrævet valg',
  optional: 'Valgfrit',
  ralColorLabel: 'RAL farvenummer',
  dependsOnLabel: 'Kræver',
  companyName: 'Firmanavn',
  contactPerson: 'Kontaktperson',
  phone: 'Telefon',
  email: 'E-mail',
  comment: 'Kommentar',
  subtotal: 'Subtotal',
  baseDiscount: 'Grundrabat (25%)',
  quantityDiscount: 'Mængderabat',
  deliveryDiscount: 'Leveringsrabat',
  totalDiscount: 'Samlet rabat',
  finalPrice: 'Total',
  exVat: 'ekskl. moms',
  downloadPdf: 'Download PDF',
  next: 'Næste',
  previous: 'Tilbage',
  addToQuote: 'Tilføj',
  unit: 'Enhed',
  demoMachine: 'Demo maskine',
  demoFee: 'Demo gebyr',
  looseToolPackaging: 'Emballering',
};

const translations: Record<Language, TranslationKeys> = {
  da,
  en: da, // Placeholder — will be filled with English translations later
};

export function t(key: keyof TranslationKeys, lang: Language = 'da'): string {
  return translations[lang]?.[key] ?? key;
}
